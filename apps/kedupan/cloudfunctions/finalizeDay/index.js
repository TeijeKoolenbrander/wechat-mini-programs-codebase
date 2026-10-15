'use strict';
// finalizeDay: timer trigger (config.json, 00:40 BJT) for D = yesterday (spec 11.2, AC 25).
// 1. freeze final[5] (cheap; always correct, so 定分 never waits for the slow part);
// 2. page through COMPLETE entries (1,000 per query, _id cursor) scoring them at the frozen refs to build
//    finalHist (101 bins of width 5) and finalCount; progress is stored (`finalProgress`) so a run that hits
//    70% of the timeout resumes next time;
// 3. set finalizedAt. Idempotent: a finalized day is skipped. Server-only.
const core = require('./common/coreapi');
const store = require('./common/store');
const daily = require('./common/daily');
const { fail, now, addDaysKey, isDateKey, isDayClosed, configuredTimeoutMs } = require('./common/util');

const PAGE = 1000;

exports.main = store.handler(async (event, { startedAt }) => {
  const nowMs = now();
  let dateKey;
  if (event && event.dateKey !== undefined) {
    if (!isDateKey(event.dateKey)) fail('INVALID_INPUT', 'bad dateKey');
    dateKey = event.dateKey;
  } else {
    dateKey = addDaysKey(core.dateKeyAt(nowMs), -1);
  }
  const set = await store.getDoc('daily_sets', dateKey);
  if (!set) return { ok: true, dateKey, skipped: 'no set' };
  if (!isDayClosed(dateKey, nowMs)) fail('DAY_OPEN', 'day is not closed yet');
  if (set.finalizedAt) return { ok: true, dateKey, skipped: 'already finalized' };

  const final = await daily.ensureFinal(set, nowMs);
  const deadline = startedAt + 0.7 * configuredTimeoutMs();
  const prog = set.finalProgress || { lastId: '', hist: new Array(101).fill(0), count: 0 };
  const _ = store._();
  let finished = false;
  while (now() < deadline) {
    const where = prog.lastId ? { dateKey, complete: true, _id: _.gt(prog.lastId) } : { dateKey, complete: true };
    const r = await store.db().collection('daily_entries').where(where).orderBy('_id', 'asc').limit(PAGE).field({ pos: true }).get();
    for (const e of r.data) {
      const total = daily.scoreEntry(e.pos, final).total;
      prog.hist[core.totalBin(total)] += 1;
      prog.count += 1;
      prog.lastId = e._id;
    }
    if (r.data.length < PAGE) { finished = true; break; }
    await store.db().collection('daily_sets').doc(dateKey).update({ data: { finalProgress: prog } });
  }
  if (!finished) {
    await store.db().collection('daily_sets').doc(dateKey).update({ data: { finalProgress: prog } });
    console.warn(`[finalizeDay] ${dateKey} paused at ${prog.count} entries; will resume`);
    return { ok: true, dateKey, partial: true, counted: prog.count };
  }
  await store.db().collection('daily_sets').doc(dateKey).update({
    data: { finalHist: prog.hist, finalCount: prog.count, finalizedAt: now(), finalProgress: _.remove() },
  });
  await store.writeEvent('server', 'finalize_day', { dateKey, finalCount: prog.count, ms: now() - startedAt });
  return { ok: true, dateKey, finalCount: prog.count };
}, { auth: false, serverOnly: true });
