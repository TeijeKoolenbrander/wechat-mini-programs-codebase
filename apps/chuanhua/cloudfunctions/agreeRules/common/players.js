'use strict';
// Player documents: allowances, strikes and restrictions, streak, rules agreement.
// All functions here are pure mutations on a player object; callers persist inside their transaction.
const { LIMITS } = require('./config');
const { fail, DAY_MS, HOUR_MS, addDaysKey, daysBetween } = require('./util');
const store = require('./store');

function defaultPlayer(openid, nowMs) {
  return {
    _id: openid,
    rulesVersion: 0,
    strikes: [],
    restrictedUntil: 0,
    permanent: false,
    flagged: false,
    warnPending: false,
    day: freshDay(''),
    curStreak: 0,
    bestStreak: 0,
    lastStepDate: '',
    lifetimeReveals: 0,
    seen: [],
    lastActiveAt: nowMs || 0,
  };
}
function freshDay(dateKey) {
  return { dateKey, starts: 0, adStarts: 0, steps: 0, reports: 0, palette: false, claims: {}, noFill: {} };
}

async function loadPlayerT(t, openid, nowMs) {
  const p = await store.getDocT(t, 'players', openid);
  return p || defaultPlayer(openid, nowMs);
}
async function loadPlayer(openid, nowMs) {
  const p = await store.getDoc('players', openid);
  return p || defaultPlayer(openid, nowMs);
}

/** Roll the per-day block to `dateKey` (server Beijing date) and return it. */
function dayOf(player, dateKey) {
  if (!player.day || player.day.dateKey !== dateKey) player.day = freshDay(dateKey);
  return player.day;
}

function startsLeft(player, dateKey) {
  const d = player.day && player.day.dateKey === dateKey ? player.day : freshDay(dateKey);
  return Math.max(0, LIMITS.freeStarts + d.adStarts - d.starts);
}
function adStartsLeft(player, dateKey) {
  const d = player.day && player.day.dateKey === dateKey ? player.day : freshDay(dateKey);
  return Math.max(0, LIMITS.adStartsMax - d.adStarts);
}

function restriction(player, nowMs) {
  if (player.permanent) return { permanent: true, until: null };
  if (player.restrictedUntil && player.restrictedUntil > nowMs) return { permanent: false, until: player.restrictedUntil };
  return null;
}

/** Throws RESTRICTED / RULES_REQUIRED. Used by createChain, claimStep and submitStep (AC 19). */
function assertMayParticipate(player, nowMs, { requireRules = true } = {}) {
  const r = restriction(player, nowMs);
  if (r) fail('RESTRICTED', 'restricted', { until: r.until, permanent: r.permanent });
  if (requireRules && (player.rulesVersion || 0) < LIMITS.rulesVersion) fail('RULES_REQUIRED', 'rules not agreed');
}

/**
 * Add one strike (rolling 30 days) and apply the ladder (PO-17, AC 65).
 * Idempotent per (stepId, src). Returns {added, level, until}.
 */
function addStrike(player, stepId, src, nowMs) {
  player.strikes = (player.strikes || []).filter((s) => nowMs - s.at < LIMITS.strikeWindowMs);
  if (player.strikes.some((s) => s.stepId === stepId && s.src === src)) return { added: false, level: player.strikes.length };
  player.strikes.push({ at: nowMs, stepId, src });
  const n = player.strikes.length;
  let until = 0;
  if (n === 1) player.warnPending = true;
  else if (n === 2) until = nowMs + 24 * HOUR_MS;
  else if (n === 3) until = nowMs + 7 * DAY_MS;
  else { until = nowMs + 30 * DAY_MS; player.flagged = true; }
  if (until > (player.restrictedUntil || 0)) { player.restrictedUntil = until; player.restrictedAt = nowMs; }
  return { added: true, level: n, until: until || null };
}

/** Streak: consecutive Beijing days with >= 1 passed 棒 (as author). No rewards (PO-29). */
function noteStepPassed(player, dateKey) {
  if (player.lastStepDate === dateKey) return;
  if (player.lastStepDate && daysBetween(player.lastStepDate, dateKey) === 1) player.curStreak = (player.curStreak || 0) + 1;
  else player.curStreak = 1;
  player.bestStreak = Math.max(player.bestStreak || 0, player.curStreak);
  player.lastStepDate = dateKey;
}
/** Streak shown at home: broken if the last pass was before yesterday. */
function streakNow(player, dateKey) {
  if (!player.lastStepDate) return 0;
  const gap = daysBetween(player.lastStepDate, dateKey);
  return gap === 0 || gap === 1 ? player.curStreak || 0 : 0;
}

/** Release the allowance taken by a voided drawing (spec 6.3 step 7: "not counted against the author"). */
function refundVoid(player, step) {
  const d = player.day;
  if (!d || d.dateKey !== step.dateKey) return;
  d.steps = Math.max(0, d.steps - 1);
  if (step.n === 1) d.starts = Math.max(0, d.starts - 1);
}

module.exports = {
  defaultPlayer, freshDay, loadPlayerT, loadPlayer, dayOf, startsLeft, adStartsLeft, restriction,
  assertMayParticipate, addStrike, noteStepPassed, streakNow, refundVoid, addDaysKey,
};
