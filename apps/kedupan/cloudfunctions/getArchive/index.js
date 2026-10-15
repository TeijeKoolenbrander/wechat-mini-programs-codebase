'use strict';
// getArchive: list of CLOSED days (never today, never a day still inside its 00:30 grace), newest first.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const { now, addDaysKey, isDayClosed } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  const before = input.optDateKey(event.before);
  const limit = input.limit(event.limit, 30, 30);
  const today = core.dateKeyAt(nowMs);

  // newest closed day: yesterday once D+1 00:30 passed, else the day before yesterday
  let upper = addDaysKey(today, -1);
  if (!isDayClosed(upper, nowMs)) upper = addDaysKey(upper, -1);
  if (before && addDaysKey(before, -1) < upper) upper = addDaysKey(before, -1);

  const _ = store._();
  const r = await store.db().collection('daily_sets').where({ _id: _.lte(upper) })
    .orderBy('_id', 'desc').limit(limit + 1).field({ issueNo: true, final: true, cards: true }).get();
  const hasMore = r.data.length > limit;
  const rows = r.data.slice(0, limit);

  const entries = rows.length ? await Promise.all(rows.map((s) => store.getDoc('daily_entries', daily.entryId(s._id, openid)))) : [];
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    const item = { dateKey: s._id, issueNo: s.issueNo };
    const e = entries[i];
    if (e && e.complete) {
      const fin = await daily.ensureFinal({ _id: s._id, final: s.final, cards: s.cards }, nowMs);
      if (fin) item.mine = { total: daily.scoreEntry(e.pos, fin).total, final: true };
    }
    items.push(item);
  }
  const ps = await store.getDoc('player_stats', openid);
  return { ok: true, items, hasMore, bestStreak: ps ? ps.bestStreak || 0 : 0 };
});
