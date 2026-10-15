'use strict';
// Observe-only anomaly flags (spec 11.5, PO-34). A flag NEVER changes a response, result, rank or UI:
// every function here swallows its own errors, and callers ignore the return value.
//   fast     ranked run, >= 10 answers, median ms < 700
//   slow     ranked run, >= 5 answers each >= 60 s (possible lookups)
//   order    INVALID_ORDER on a ranked run
//   mismatch submitRun: clientStreak != server streak
// One doc per (openid, run, kind): _id = <openid>_<runId>_<kind> (deterministic, so written once).
const core = require('./coreapi');
const store = require('./store');
const runs = require('./runs');
const { now, DAY_MS } = require('./util');

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** which flags the answers of a ranked run currently warrant */
function flagsForAnswers(answers) {
  const c = core.anomalyConfig();
  const out = [];
  if (answers.length >= c.fastMinAnswers && median(answers.map((a) => a.ms || 0)) < c.fastMedianMs) out.push('fast');
  if (answers.filter((a) => (a.ms || 0) >= c.slowMs).length >= c.slowMinAnswers) out.push('slow');
  return out;
}

/** write once; on first write, update the 7-day count and `suspect` (manual review only) */
async function record(openid, runId, kind, dateKey, detail) {
  try {
    const created = await store.addIfAbsent('anomalies', {
      _id: `${openid}_${runId}_${kind}`, openid, runId, kind, dateKey: dateKey || null, detail: detail || {}, ts: now(),
    });
    if (!created) return false;
    const c = core.anomalyConfig();
    const _ = store._();
    const n = (await store.db().collection('anomalies').where({ openid, ts: _.gte(now() - 7 * DAY_MS) }).count()).total;
    const stats = await store.getDoc('player_stats', openid);
    if (!stats) await store.addIfAbsent('player_stats', { ...runs.defaultStats(openid), updatedAt: now() });
    await store.db().collection('player_stats').doc(openid).update({ data: { flags7d: n, suspect: n >= c.suspectFlags7d } });
    return true;
  } catch (e) {
    console.warn('anomaly write failed', kind, store.errText(e));
    return false;
  }
}

module.exports = { record, flagsForAnswers, median };
