'use strict';
// Observe-only anomaly flags (spec 14.5). A flag NEVER changes a result, rank, streak or any response:
// every function here is best-effort and swallows its own errors.
const store = require('./store');
const { now, DAY_MS } = require('./util');

const KINDS = ['mismatch', 'prefix', 'fast', 'invalid_ranked'];
const SUSPECT_AT = 5;
const WINDOW_MS = 7 * DAY_MS;
const KEEP_TS = 20;

async function flag(openid, runId, dateKey, kind, detail) {
  try {
    if (!KINDS.includes(kind)) return false;
    const t = now();
    const added = await store.addIfAbsent('anomalies', {
      _id: `${openid}_${runId}_${kind}`, openid, runId, dateKey: dateKey || null, kind, detail: detail || {}, ts: t,
    });
    if (!added) return false;
    await store.db().runTransaction(async (tx) => {
      const ps = (await store.getDocT(tx, 'player_stats', openid)) || {
        _id: openid, curStreak: 0, bestStreak: 0, lastDailyDate: null, totalDailies: 0,
      };
      const ts = (ps.flagTs || []).filter((x) => t - x < WINDOW_MS);
      ts.push(t);
      const flagTs = ts.slice(-KEEP_TS);
      const flags7d = flagTs.length;
      await tx.collection('player_stats').doc(openid).set({
        data: { ...ps, flagTs, flags7d, suspect: !!ps.suspect || flags7d >= SUSPECT_AT, updatedAt: t },
      });
    });
    return true;
  } catch (e) {
    console.warn('[anomaly] flag failed', kind, store.errText(e));
    return false;
  }
}

module.exports = { flag, KINDS, SUSPECT_AT };
