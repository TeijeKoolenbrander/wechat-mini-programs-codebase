'use strict';
// getBonusCard: 加一题 (unranked). One card from a CLOSED day that the caller has not answered, with that day's
// frozen reference. Needs a complete daily today (AC 39); at most 3 per day per openid (RATE_LIMITED).
// The answer is scored on the client against `final`; nothing is stored here beyond the rate counter.
const core = require('./common/coreapi');
const store = require('./common/store');
const daily = require('./common/daily');
const { AppError, fail, now, addDaysKey, isDayClosed, CARDS } = require('./common/util');

const MAX_PER_DAY = 3;
const LOOKBACK_DAYS = 60;

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);
  const todayEntry = await store.getDoc('daily_entries', daily.entryId(today, openid));
  if (!todayEntry || !todayEntry.complete) fail('FORBIDDEN', 'finish today\'s daily first');
  await store.rateLimitDay(openid, 'bonus', today, MAX_PER_DAY);

  const _ = store._();
  let upper = addDaysKey(today, -1);
  if (!isDayClosed(upper, nowMs)) upper = addDaysKey(upper, -1);
  const sets = (await store.db().collection('daily_sets').where({ _id: _.lte(upper) })
    .orderBy('_id', 'desc').limit(LOOKBACK_DAYS).get()).data;
  const entries = await Promise.all(sets.map((s) => store.getDoc('daily_entries', daily.entryId(s._id, openid))));

  const candidates = [];
  sets.forEach((s, i) => {
    for (let c = 0; c < CARDS; c++) {
      if (!entries[i] || entries[i].pos[c] == null) candidates.push({ set: s, idx: c });
    }
  });
  if (!candidates.length) throw new AppError('NO_BONUS_CARD', 'no unanswered closed-day card');
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const finals = await daily.ensureFinal(pick.set, nowMs);
  return {
    ok: true, dateKey: pick.set._id, idx: pick.idx,
    card: daily.publicCard(pick.set.cards[pick.idx], pick.idx), final: finals[pick.idx],
  };
});
