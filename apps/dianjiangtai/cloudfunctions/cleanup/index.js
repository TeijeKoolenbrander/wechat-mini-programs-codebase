'use strict';
// cleanup: timer trigger (config.json, 04:00 BJT). D7 retention: 180 days.
// Deletes runs, daily_starts, daily_results, challenges, events older than 180 days and group_members
// whose lastSeen is older than 180 days; keeps daily_stats (aggregate). Also trims expired rate_limits.
// Idempotent: a re-run finds nothing new. Server-only (rejects calls that carry an OPENID).
const core = require('./common/coreapi');
const store = require('./common/store');
const { now, addDaysKey, DAY_MS, RETENTION_DAYS, configuredTimeoutMs } = require('./common/util');

const TARGETS = [
  { col: 'runs', field: 'submittedAt' },
  { col: 'daily_starts', field: 'startedAt' },
  { col: 'daily_results', field: 'submittedAt' },
  { col: 'challenges', field: 'createdAt' },
  { col: 'events', field: 'ts' },
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
  return { ok: true, cutoffKey, removed };
}, { auth: false, serverOnly: true });
