'use strict';
// finalizeDay (timer, 00:40 Beijing): freeze the references of each newly closed day (定分), then page through its
// complete dailies and build finalHist / finalCount for the percentile (spec 3.3, edge 23, AC 25). Refs are frozen
// first (cheap) so scores are right even if the aggregate resumes later. The aggregate is resumable: progress
// (cursor + partial histogram) is stored on the set after every 1,000-entry page. Idempotent; skips finalized days.
const store = require('./common/store');
const { now, addDaysKey, configuredTimeoutMs } = require('./common/util');
const { core, dateKeyAt } = require('./common/coreapi');
const daily = require('./common/daily');

const PAGE = 1000;
const LOOKBACK_DAYS = 7;

exports.main = store.handler(async () => {
  const t0 = now();
  const budgetMs = configuredTimeoutMs() * 0.8;
  const _ = store._();
  const newest = core.W.newestClosedKey(t0);
  const keys = [];
  for (let i = LOOKBACK_DAYS - 1; i >= 0; i--) keys.push(addDaysKey(newest, -i));
  const sets = await store.getMany('daily_sets', keys);
  const finalized = [];
  const partial = [];
  for (const key of keys) {
    let set = sets.get(key);
    if (!set || set.finalizedAt) continue;
    const started = now();
    set = await daily.ensureFinal(set);
    const prog = set.finalProgress || { after: null, hist: core.S.emptyHist(), count: 0 };
    const hist = prog.hist.slice();
    let count = prog.count;
    let after = prog.after;
    let done = false;
    while (!done) {
      if (now() - t0 > budgetMs) break;
      const where = { dateKey: key, completeAt: _.gt(0) };
      if (after) where._id = _.gt(after);
      const r = await store.coll('daily_entries').where(where).orderBy('_id', 'asc').limit(PAGE).field({ pos: true }).get();
      const rows = r.data.filter((e) => core.SV.isComplete(e));
      const agg = core.SV.finalAggregate(set.final, rows.map((e) => e.pos));
      for (let i = 0; i < hist.length; i++) hist[i] += agg.finalHist[i];
      count += agg.finalCount;
      if (r.data.length) after = r.data[r.data.length - 1]._id;
      if (r.data.length < PAGE) {
        done = true;
        await store.updateDoc('daily_sets', key, { finalHist: hist, finalCount: count, finalizedAt: now(), finalProgress: null });
      } else {
        await store.updateDoc('daily_sets', key, { finalProgress: { after, hist, count } });
      }
    }
    if (done) {
      finalized.push(key);
      await store.writeEvent('server', 'finalize_day', { dateKey: key, finalCount: count, ms: now() - started });
    } else {
      partial.push(key);
      await store.writeEvent('server', 'finalize_day', { dateKey: key, finalCount: count, ms: now() - started, failed: true });
      console.warn(`[finalizeDay] ${key} not finished (${count} entries so far); the next run resumes`);
      break;
    }
  }
  return { ok: true, finalized, partial };
}, { auth: false, serverOnly: true });
