/**
 * Streak rules (spec 8.12, 14.3, PO-12). Pure; used by the server (and the mock). The
 * client only displays the number it is given.
 *
 * state = { curStreak, bestStreak, lastSolvedDate }
 * `prevKey` = the latest PUBLISHED daily date before `dateKey` (unpublished dates are skipped).
 */

/** A ranked solve on `dateKey`. */
function onRankedSolve(state, dateKey, prevKey) {
  const cur = state.lastSolvedDate && prevKey && state.lastSolvedDate === prevKey ? state.curStreak + 1 : 1;
  return { curStreak: cur, bestStreak: Math.max(state.bestStreak || 0, cur), lastSolvedDate: dateKey };
}

/** A ranked give-up resets the current streak to 0 (best stays). */
function onRankedGiveUp(state) {
  return { curStreak: 0, bestStreak: state.bestStreak || 0, lastSolvedDate: state.lastSolvedDate || null };
}

/**
 * Streak as DISPLAYED on `todayKey`: yesterday's streak stays alive all of today.
 * `latestPublishedBeforeToday` = latest published daily date before today (null if none).
 */
function displayStreak(state, todayKey, latestPublishedBeforeToday) {
  if (!state || !state.curStreak) return 0;
  if (state.lastSolvedDate === todayKey) return state.curStreak;
  if (state.lastSolvedDate && state.lastSolvedDate === latestPublishedBeforeToday) return state.curStreak;
  return 0;
}

module.exports = { onRankedSolve, onRankedGiveUp, displayStreak };
