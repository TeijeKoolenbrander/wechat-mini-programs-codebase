'use strict';
// cleanup: timer trigger (config.json, 04:00 BJT). Retention 180 days (spec 13, AC 67).
// Deletes personal-data collections past their limit; KEEPS daily_sets, daily_card_stats and item_usage
// (aggregates, no openid). Also trims expired rate_limits. Idempotent: a re-run finds nothing new.
// Server-only (rejects calls that carry an OPENID).
const core = require('./common/coreapi');
const store = require('./common/store');
const { now, addDaysKey, DAY_MS, RETENTION_DAYS, configuredTimeoutMs } = require('./common/util');

// [collection, timestamp field, kind]; kind 'ms' = epoch ms, 'key' = YYYYMMDD string
const TARGETS = [
  ['daily_entries', 'firstAt', 'ms'],
  ['player_stats', 'updatedAt', 'ms'],
  ['group_members', 'lastSeen', 'key'],
  ['group_daily', 'computedAt', 'ms'],
  ['rounds', 'createdAt', 'ms'],
  ['guesses', 'ts', 'ms'],
  ['sub_grants', 'grantedAt', 'ms'],
  ['card_reports', 'ts', 'ms'],
  ['anomalies', 'ts', 'ms'],
  ['events', 'ts', 'ms'],
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
  for (const [col, field, kind] of TARGETS) {
    removed[col] = await purge(col, { [field]: _.lt(kind === 'key' ? cutoffKey : cutoffMs) }, deadline);
  }
  removed.rate_limits = await purge('rate_limits', { expireAt: _.lt(nowMs) }, deadline);
  return { ok: true, cutoffKey, removed };
}, { auth: false, serverOnly: true });
