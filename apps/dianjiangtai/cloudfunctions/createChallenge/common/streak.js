'use strict';
// Streaks (spec 8.9, 14.3 step 8). The server is the only place a streak is computed.
// Published dates = daily_seeds documents, so a day with no seed is skipped automatically.
const store = require('./store');
const rules = require('./rules');

/** the `n` latest published dates strictly before `dateKey`, newest first */
async function prevPublished(dateKey, n = 1) {
  const _ = store._();
  const r = await store.db().collection('daily_seeds').where({ _id: _.lt(dateKey) }).orderBy('_id', 'desc').limit(n).field({ _id: true }).get();
  return r.data.map((d) => d._id);
}
/** earliest published date strictly after `dateKey`, or null */
async function nextPublished(dateKey) {
  const _ = store._();
  const r = await store.db().collection('daily_seeds').where({ _id: _.gt(dateKey) }).orderBy('_id', 'asc').limit(1).field({ _id: true }).get();
  return r.data[0] ? r.data[0]._id : null;
}

/**
 * Apply a new ranked result for `dateKey` inside the ranked transaction `t`.
 * `ctx` = {prev, next} read just before the transaction (queries are not allowed inside one).
 * -> {streak (this result's), current, best}
 */
async function applyRanked(t, openid, dateKey, ctx, nowMs) {
  const ps = (await store.getDocT(t, 'player_stats', openid)) || {};
  const prevRes = ctx.prev ? await store.getDocT(t, 'daily_results', `${ctx.prev}_${openid}`) : null;
  const streakD = prevRes ? (prevRes.streak || 1) + 1 : 1;
  const last = ps.lastDailyDate || null;
  let cur = ps.curStreak || 0;
  let lastDate = last;
  if (!last || last < dateKey) {
    cur = streakD;
    lastDate = dateKey;
  } else if (last > dateKey && ctx.next && ctx.next === last) {
    // grace-window submit for D after the player already played D+1: the two days join up
    const nextRes = await store.getDocT(t, 'daily_results', `${last}_${openid}`);
    if (nextRes) {
      cur = (nextRes.streak || 1) + streakD;
      await t.collection('daily_results').doc(`${last}_${openid}`).update({ data: { streak: cur } });
    }
  }
  const best = Math.max(ps.bestStreak || 0, cur, streakD);
  await t.collection('player_stats').doc(openid).set({
    data: {
      ...ps, curStreak: cur, bestStreak: best, lastDailyDate: lastDate, totalDailies: (ps.totalDailies || 0) + 1,
      flags7d: ps.flags7d || 0, suspect: !!ps.suspect, updatedAt: nowMs,
    },
  });
  return { streak: streakD, current: cur, best };
}

/** Current streak as shown on home: alive through today if the last ranked date is today, the previous
 *  published date, or (inside its still-open grace window) the one before that. */
async function currentFor(ps, today, nowMs) {
  const best = (ps && ps.bestStreak) || 0;
  if (!ps || !ps.lastDailyDate || !ps.curStreak) return { current: 0, best };
  const last = ps.lastDailyDate;
  if (last === today) return { current: ps.curStreak, best };
  const [p1, p2] = await prevPublished(today, 2);
  if (last === p1) return { current: ps.curStreak, best };
  if (p1 && last === p2 && rules.windowState(p1, nowMs) === 'grace') return { current: ps.curStreak, best };
  return { current: 0, best };
}

module.exports = { prevPublished, nextPublished, applyRanked, currentFor };
