'use strict';
// getArchiveDay: one closed day for the archive / read-only review. DAY_OPEN for today or any day that is
// not closed yet (before D+1 00:30 BJT), so a final reference is never revealed early.
// Card text always comes from the server copy (AC 11). Distribution histograms are NOT here: they come
// only from unlockDistribution (called after the rewarded ad ends).
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const core = require('./common/coreapi');
const { fail, now, isDayClosed } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const dateKey = input.dateKey(event.dateKey);
  const nowMs = now();
  const set = await store.getDoc('daily_sets', dateKey);
  if (!set) fail('INVALID_INPUT', 'no such day');
  if (!isDayClosed(dateKey, nowMs)) fail('DAY_OPEN', 'day is not closed yet');
  const finals = await daily.ensureFinal(set, nowMs);

  const out = { ok: true, dateKey, issueNo: set.issueNo, cards: set.cards.map(daily.publicCard), finals };
  const e = await store.getDoc('daily_entries', daily.entryId(dateKey, openid));
  if (e && e.pos.some((p) => p != null)) {
    const { total, cardScores } = daily.scoreEntry(e.pos, finals);
    const mine = { pos: e.pos, total, cardScores, complete: !!e.complete };
    if (e.complete && set.finalCount >= 30 && Array.isArray(set.finalHist)) {
      let below = 0;
      for (let b = 0; b < core.totalBin(total); b++) below += set.finalHist[b] || 0;
      mine.pct = Math.floor((100 * below) / set.finalCount);
    }
    out.mine = mine;
  }
  return out;
});
