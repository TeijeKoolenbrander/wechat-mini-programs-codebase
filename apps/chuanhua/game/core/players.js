/**
 * Per-player rules: daily allowances, strike ladder and restrictions, streak (spec 3.9, 4.1, 7.3). Pure;
 * operates on the `players` document shape (spec 13.1) and returns what changed.
 *
 *   freshPlayer()
 *   dayOf(player, dateKey)            -> the `day` block, reset when the Beijing date changed
 *   startsLeft(day) / adStartsLeft(day)
 *   addStrike(player, strike, now)    -> { strikes, level, restrictedUntil, warn, adminReview }
 *   restrictionOf(player, now)        -> null | { until|null, permanent }
 *   touchStreak(player, dateKey)      mutates curStreak/bestStreak/lastStepDate on a passed 棒
 *   streakDays(player, todayKey)      -> current streak as the home screen shows it (0 when broken)
 */

const { CONFIG } = require('./config');
const { addDays } = require('./date');

function freshPlayer() {
  return {
    rulesVersion: 0,
    strikes: [],
    restrictedUntil: null,
    permanent: false,
    adminReview: false,
    warnPending: false,
    day: null,
    curStreak: 0,
    bestStreak: 0,
    lastStepDate: null,
    lifetimeReveals: 0,
    lastActiveAt: 0,
  };
}

function freshDay(dateKey) {
  return { dateKey, starts: 0, adStarts: 0, steps: 0, reports: 0, palette: 0, claims: {} };
}

function dayOf(player, dateKey) {
  if (!player.day || player.day.dateKey !== dateKey) player.day = freshDay(dateKey);
  return player.day;
}

function startsLeft(day) {
  return Math.max(0, CONFIG.allowances.startsFree + day.adStarts - day.starts);
}

function adStartsLeft(day) {
  return Math.max(0, CONFIG.allowances.startsAd - day.adStarts);
}

function activeStrikes(player, now) {
  return player.strikes.filter((s) => now - s.at < CONFIG.strikes.windowMs);
}

/** Record a strike (a `risky` verdict or an upheld report) and apply the ladder. */
function addStrike(player, strike, now) {
  player.strikes.push({ at: now, stepId: strike.stepId || null, src: strike.src });
  const n = activeStrikes(player, now).length;
  const rung = CONFIG.strikes.ladder.reduce((best, r) => (n >= r.strikes ? r : best), null);
  const out = { strikes: n, level: rung ? rung.strikes : 0, restrictedUntil: null, warn: false, adminReview: false };
  if (rung) {
    if (rung.restrictMs) {
      const until = now + rung.restrictMs;
      if (!player.restrictedUntil || until > player.restrictedUntil) player.restrictedUntil = until;
      out.restrictedUntil = player.restrictedUntil;
    }
    if (rung.warn) {
      player.warnPending = true;
      out.warn = true;
    }
    if (rung.adminReview) {
      player.adminReview = true;
      out.adminReview = true;
    }
  }
  return out;
}

function restrictionOf(player, now) {
  if (player.permanent) return { until: null, permanent: true };
  if (player.restrictedUntil && player.restrictedUntil > now) return { until: player.restrictedUntil, permanent: false };
  return null;
}

/** "至 10月17日 14:00" in Beijing time. */
function untilText(untilMs) {
  const d = new Date(untilMs + 8 * 3600e3);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return d.getUTCMonth() + 1 + '月' + d.getUTCDate() + '日 ' + hh + ':' + mm;
}

function touchStreak(player, dateKey) {
  if (player.lastStepDate === dateKey) return player.curStreak;
  player.curStreak = player.lastStepDate === addDays(dateKey, -1) ? player.curStreak + 1 : 1;
  player.lastStepDate = dateKey;
  if (player.curStreak > player.bestStreak) player.bestStreak = player.curStreak;
  return player.curStreak;
}

function streakDays(player, todayKey) {
  if (!player.lastStepDate) return 0;
  if (player.lastStepDate === todayKey || player.lastStepDate === addDays(todayKey, -1)) return player.curStreak;
  return 0;
}

function streakText(days) {
  return days >= CONFIG.streak.showFrom ? '连续接龙 ' + days + ' 天' : null;
}

module.exports = { freshPlayer, freshDay, dayOf, startsLeft, adStartsLeft, activeStrikes, addStrike, restrictionOf, untilText, touchStreak, streakDays, streakText };
