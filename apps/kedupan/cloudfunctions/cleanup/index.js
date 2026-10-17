'use strict';
// cleanup (timer, 04:00 Beijing): retention of 180 days (spec 13, D7). Keeps daily_sets, daily_card_stats, item_usage,
// app_config and meta (aggregates and config only). Idempotent.
const store = require('./common/store');
const { now, addDaysKey, RETENTION_DAYS } = require('./common/util');
const { dateKeyAt } = require('./common/coreapi');

const BUDGET_MS = 45000;

exports.main = store.handler(async () => {
  const t0 = now();
  const _ = store._();
  const cutoffMs = t0 - RETENTION_DAYS * 86400e3;
  const cutoffKey = addDaysKey(dateKeyAt(t0), -RETENTION_DAYS);
  // [collection, field, cutoff]; rate_limits expire on their own `expireAt`
  const plan = [
    ['daily_entries', 'dateKey', cutoffKey],
    ['player_stats', 'updatedAt', cutoffMs],
    ['group_members', 'lastSeen', cutoffKey],
    ['group_daily', 'computedAt', cutoffMs],
    ['rounds', 'createdAt', cutoffMs],
    ['guesses', 'ts', cutoffMs],
    ['sub_grants', 'grantedAt', cutoffMs],
    ['card_reports', 'ts', cutoffMs],
    ['anomalies', 'ts', cutoffMs],
    ['events', 'ts', cutoffMs],
    ['reveal_views', 'ts', cutoffMs],
    // D-2 (spec 13, PD-40): typed clues leave with their round (rounds above); evidence, reports and the audit trail go at 180 days
    ['clue_reports', 'ts', cutoffMs],
    ['mod_log', 'ts', cutoffMs],
    ['mod_quota', 'ts', cutoffMs],
    ['audit_log', 'ts', cutoffMs],
    ['rate_limits', 'expireAt', t0],
  ];
  const removed = {};
  for (const [name, field, cutoff] of plan) {
    removed[name] = 0;
    for (let i = 0; i < 1000 && now() - t0 < BUDGET_MS; i++) {
      const r = await store.coll(name).where({ [field]: _.lt(cutoff) }).remove();
      const n = (r && r.stats && r.stats.removed) || 0;
      removed[name] += n;
      if (n === 0) break;
    }
  }
  return { ok: true, removed };
}, { auth: false, serverOnly: true });
