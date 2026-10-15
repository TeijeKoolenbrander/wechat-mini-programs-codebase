'use strict';
// cleanup: timer (config.json, 04:00 BJT). 180-day retention (spec 14.2, 16).
// Deletes plays, challenges, challenge_takers, events, anomalies older than 180 days, group_members by lastSeen, player_stats by
// updatedAt, and expired rate_limits. KEEPS daily_stats, daily_puzzles, answer_bank, answer_ranks (aggregates / content).
// Also writes the daily anomaly roll-up (`anomaly_daily` event, one per date). Idempotent. Server-only.
const coreapi = require('./common/coreapi');
const store = require('./common/store');
const { now, addDaysKey, DAY_MS, RETENTION_DAYS, configuredTimeoutMs } = require('./common/util');

const TARGETS = [
  { col: 'plays', field: 'lastAt' },
  { col: 'challenges', field: 'createdAt' },
  { col: 'challenge_takers', field: 'createdAt' },
  { col: 'events', field: 'ts' },
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

/** counts per anomaly kind in the 24 h before `nowMs`, stored once per BJT date */
async function rollUp(nowMs, dateKey) {
  const _ = store._();
  const rows = await store.queryAll('anomalies', { ts: _.gte(nowMs - DAY_MS) }, { field: { kind: true }, max: 20000 });
  const counts = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
  await store.addIfAbsent('events', { _id: `anomaly_daily_${dateKey}`, openid: 'server', sessionId: null, name: 'anomaly_daily', props: counts, ts: nowMs, clientTs: null });
  return counts;
}

exports.main = store.handler(async (event, { startedAt }) => {
  const _ = store._();
  const nowMs = now();
  const deadline = startedAt + 0.7 * configuredTimeoutMs();
  const cutoffMs = nowMs - RETENTION_DAYS * DAY_MS;
  const dateKey = coreapi.dateKeyAt(nowMs);
  const cutoffKey = addDaysKey(dateKey, -RETENTION_DAYS);

  const anomalies = await rollUp(nowMs, dateKey); // before the purge so a long outage cannot lose a day's counts
  const removed = {};
  for (const t of TARGETS) removed[t.col] = await purge(t.col, { [t.field]: _.lt(cutoffMs) }, deadline);
  removed.group_members = await purge('group_members', { lastSeen: _.lt(cutoffKey) }, deadline);
  removed.rate_limits = await purge('rate_limits', { expireAt: _.lt(nowMs) }, deadline);
  return { ok: true, cutoffKey, removed, anomalies };
}, { auth: false, serverOnly: true });
