'use strict';
// cleanup: timer trigger (config.json, 04:00 BJT). D7 retention: 180 days.
// Deletes runs, daily_starts, daily_results, challenges, events older than 180 days and group_members
// whose lastSeen is older than 180 days; keeps daily_stats (aggregate). Also trims expired rate_limits.
// Idempotent: a re-run finds nothing new. Server-only (rejects calls that carry an OPENID).
const core = require('./common/coreapi');
const store = require('./common/store');
const { now, addDaysKey, DAY_MS, RETENTION_DAYS, configuredTimeoutMs, bjtDayStartMs } = require('./common/util');
const { KINDS } = require('./common/anomaly');

const MISMATCH_ALERT = 0.005;

const TARGETS = [
  { col: 'runs', field: 'submittedAt' },
  { col: 'daily_starts', field: 'startedAt' },
  { col: 'daily_results', field: 'submittedAt' },
  { col: 'challenges', field: 'createdAt' },
  { col: 'events', field: 'ts' },
  { col: 'daily_progress', field: 'updatedAt' },
  { col: 'sub_grants', field: 'grantedAt' },
  { col: 'challenge_answers', field: 'createdAt' },
  { col: 'anomalies', field: 'ts' },
  { col: 'player_stats', field: 'updatedAt' },
];

async function purge(col, cond, deadline) {
  let total = 0;
  while (now() < deadline) {
    const r = await store.db().collection(col).where(cond).remove();
    const n = (r && r.stats && r.stats.removed) || 0;
    total += n;
    if (n === 0) break;
  }
  return total;
}

/**
 * Daily anomaly roll-up (spec 14.5): for yesterday, count submitted runs and flags by kind, write one server
 * `anomaly_daily` event (idempotent per date), and log [ALERT] when mismatch > 0.5% of runs (client/server drift).
 */
async function rollUp(todayKey) {
  const _ = store._();
  const dateKey = addDaysKey(todayKey, -1);
  const from = bjtDayStartMs(dateKey);
  const to = bjtDayStartMs(todayKey);
  const col = (n) => store.db().collection(n);
  // CLAIM the day first (add of the fixed _id): a double-fired timer or two overlapping runs write ONE anomaly_daily event.
  // A run that dies after the claim releases it below, so the next timer retries the day.
  const markerId = 'rollup_' + dateKey;
  if (!(await store.addIfAbsent('meta', { _id: markerId, dateKey, startedAt: now() }))) return { dateKey, skipped: true };
  try {
    return await rollUpClaimed(dateKey, from, to);
  } catch (e) {
    try { await col('meta').doc(markerId).remove(); } catch (e2) { /* the next run finds the marker and skips: observation only */ }
    throw e;
  }
}

async function rollUpClaimed(dateKey, from, to) {
  const _ = store._();
  const col = (n) => store.db().collection(n);
  const runs = (await col('runs').where({ submittedAt: _.gte(from).and(_.lt(to)) }).count()).total;
  const flags = {};
  for (const k of KINDS) flags[k] = (await col('anomalies').where({ kind: k, ts: _.gte(from).and(_.lt(to)) }).count()).total;
  const mismatchRate = runs > 0 ? flags.mismatch / runs : 0;
  const alert = runs > 0 && mismatchRate > MISMATCH_ALERT;
  if (alert) console.error(`[ALERT] mismatch rate ${(mismatchRate * 100).toFixed(2)}% on ${dateKey} (${flags.mismatch}/${runs}): likely client/server content or config version skew`);
  await store.writeEvent('server', 'anomaly_daily', { dateKey, runs, ...flags, mismatchRate: Math.round(mismatchRate * 10000) / 10000, alert });
  return { dateKey, runs, flags, alert };
}

exports.main = store.handler(async (event, { startedAt }) => {
  const _ = store._();
  const nowMs = now();
  const deadline = startedAt + 0.7 * configuredTimeoutMs();
  const cutoffMs = nowMs - RETENTION_DAYS * DAY_MS;
  const cutoffKey = addDaysKey(core.dateKeyAt(nowMs), -RETENTION_DAYS);

  const removed = {};
  for (const t of TARGETS) removed[t.col] = await purge(t.col, { [t.field]: _.lt(cutoffMs) }, deadline);
  removed.group_members = await purge('group_members', { lastSeen: _.lt(cutoffKey) }, deadline);
  removed.rate_limits = await purge('rate_limits', { expireAt: _.lt(nowMs) }, deadline);
  let anomalyDaily = null;
  try { anomalyDaily = await rollUp(core.dateKeyAt(nowMs)); } catch (e) { console.warn('[cleanup] roll-up failed', store.errText(e)); }
  return { ok: true, cutoffKey, removed, anomalyDaily };
}, { auth: false, serverOnly: true });
