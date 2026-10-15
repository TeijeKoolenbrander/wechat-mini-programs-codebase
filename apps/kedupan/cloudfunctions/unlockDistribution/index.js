'use strict';
// unlockDistribution: 全国分布 histograms (21 bins of width 5) for the five cards of one set. The client calls
// this after a rewarded ad ended (or the no-fill grant); the server cannot verify the ad, so it only enforces
// the no-peek rule and a 3/day limit. For an open day (today, or yesterday inside the grace) only cards the
// caller has already answered are returned (null otherwise): this endpoint can never be used to peek.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const { fail, now, isDayClosed, CARDS } = require('./common/util');


exports.main = store.handler(async (event, { openid }) => {
  const dateKey = input.dateKey(event.dateKey);
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);
  if (dateKey > today) fail('INVALID_INPUT', 'date is in the future');
  const set = await store.getDoc('daily_sets', dateKey);
  if (!set) fail('INVALID_INPUT', 'no such day');
  await store.rateLimitDay(openid, 'distribution', today, core.cfg().distributionPerDay);

  const stats = await daily.statsDocs(dateKey);
  let answered = new Array(CARDS).fill(true);
  if (!isDayClosed(dateKey, nowMs)) {
    const e = await store.getDoc('daily_entries', daily.entryId(dateKey, openid));
    answered = Array.from({ length: CARDS }, (_, i) => !!(e && e.pos[i] != null));
  }
  return { ok: true, dateKey, hist: stats.map((s, i) => (answered[i] ? core.hist21(s.hist) : null)) };
});
