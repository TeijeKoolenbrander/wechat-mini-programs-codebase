'use strict';
// Nightly calibration roll-up helpers (spec 4.4, 11.1 `answer_stats`, 11.5). No personal data leaves here:
// only counts per (measure, gap bucket) and per revealed fact.
const core = require('./coreapi');
const store = require('./store');
const pool = require('./pool');
const { DECK_LEN } = require('./util');

/** gap bucket of a pair: ratio kind -> g = |ln(b/a)| in steps of 0.1 (cap 2.0); year kind -> |delta years| in steps of 50 (cap 1000) */
function gapBucket(a, b, measure) {
  if (measure.kind === 'year') return `y${Math.min(20, Math.floor(Math.abs(b.value - a.value) / 50))}`;
  return `g${Math.min(20, Math.floor(Math.abs(Math.log(b.value / a.value)) * 10))}`;
}

/**
 * Aggregate one deck's answers (all runs on that date).
 * @param deck daily_decks doc; @param runsList run_progress docs; facts: Map factId -> fact
 * @returns {buckets: Map<'measure_bucket', {n, correct}>, reveals: Map<factId, n>}
 */
function aggregate(deck, runsList, facts) {
  const buckets = new Map();
  const reveals = new Map();
  for (const run of runsList) {
    for (const ans of run.answers || []) {
      const q = deck.questions[ans.k - 1];
      if (!q || ans.k > DECK_LEN) continue;
      const a = facts.get(q.a);
      const b = facts.get(q.b);
      if (!a || !b) continue;
      const key = `${a.measure}_${gapBucket(a, b, core.measureOf(a.measure))}`;
      const cur = buckets.get(key) || { n: 0, correct: 0 };
      cur.n++;
      if (ans.ok) cur.correct++;
      buckets.set(key, cur);
      reveals.set(q.b, (reveals.get(q.b) || 0) + 1); // the bottom card is revealed by answering
    }
  }
  return { buckets, reveals };
}

async function incDoc(col, id, fields, extra) {
  const _ = store._();
  await store.addIfAbsent(col, { _id: id, ...Object.fromEntries(Object.keys(fields).map((k) => [k, 0])), ...(extra || {}) });
  await store.db().collection(col).doc(id).update({ data: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, _.inc(v)])) });
}

/**
 * Roll up `dateKey`'s answers into answer_stats + fact_reveals. Idempotent: a marker doc (meta/rollup_<date>,
 * created with `add`) is claimed first, so a second run for the same date does nothing. Returns a summary or null.
 */
async function rollupDay(dateKey) {
  if (!(await store.addIfAbsent('meta', { _id: `rollup_${dateKey}`, dateKey }))) return null;
  const deck = await store.getDoc('daily_decks', dateKey);
  if (!deck) return { dateKey, answers: 0 };
  const runsList = await store.queryAll('run_progress', { dateKey }, { max: 100000 });
  const facts = await pool.getDailyFacts(deck.contentVersion, deck.questions.flatMap((q) => [q.a, q.b]));
  const { buckets, reveals } = aggregate(deck, runsList, facts);
  for (const [id, v] of buckets) await incDoc('answer_stats', id, { n: v.n, correct: v.correct }, { updatedAt: Date.now() });
  for (const [id, n] of reveals) await incDoc('fact_reveals', id, { n });
  let answers = 0;
  for (const v of buckets.values()) answers += v.n;
  return { dateKey, answers, buckets: buckets.size };
}

module.exports = { gapBucket, aggregate, rollupDay };
