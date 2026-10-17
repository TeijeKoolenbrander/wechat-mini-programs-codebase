/**
 * Streak (spec 11.4, PD-17, AC 80). Pure JS. A streak is consecutive PUBLISHED days with a complete daily; days with
 * no published set are skipped (the caller passes the latest published key before the day). No rewards, no freeze.
 */

/**
 * Stats after completing the daily of `dateKey`.
 * @param {{curStreak:number,bestStreak:number,lastCompleteDate:string|null,totalDays:number}|null} stats
 * @param {string} dateKey day just completed (grace completions count for their own day)
 * @param {string|null} prevPublishedKey latest daily_sets._id < dateKey, or null
 */
function onComplete(stats, dateKey, prevPublishedKey) {
  const s = stats || { curStreak: 0, bestStreak: 0, lastCompleteDate: null, totalDays: 0 };
  if (s.lastCompleteDate === dateKey) return { stats: { ...s }, streak: s.curStreak, changed: false }; // duplicate completion
  if (s.lastCompleteDate && s.lastCompleteDate > dateKey) return { stats: { ...s }, streak: s.curStreak, changed: false }; // never rewrite history
  const cur = s.lastCompleteDate && s.lastCompleteDate === prevPublishedKey ? s.curStreak + 1 : 1;
  const next = {
    curStreak: cur,
    bestStreak: Math.max(s.bestStreak || 0, cur),
    lastCompleteDate: dateKey,
    totalDays: (s.totalDays || 0) + 1,
  };
  return { stats: next, streak: cur, changed: true };
}

/**
 * What to show today (getDaily.myStreak): yesterday's streak all of today until today completes; 0 once a published
 * day closed without a complete daily.
 */
function display(stats, todayKey, prevPublishedKey) {
  if (!stats) return { current: 0, best: 0 };
  const alive = stats.lastCompleteDate === todayKey || (prevPublishedKey !== null && stats.lastCompleteDate === prevPublishedKey);
  return { current: alive ? stats.curStreak : 0, best: stats.bestStreak || 0 };
}

module.exports = { onComplete, display };
