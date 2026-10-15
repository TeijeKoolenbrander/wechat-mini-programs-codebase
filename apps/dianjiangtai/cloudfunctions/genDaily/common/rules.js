'use strict';
// Business rules shared by startRun / submitRun / getChallenge.
const core = require('./coreapi');
const store = require('./store');
const { fail, addDaysKey, bjtDayStartMs, GRACE_MS } = require('./util');

/** 'open' (today), 'grace' (yesterday, before D+1 00:30 BJT), 'late', or 'future' */
function windowState(dateKey, nowMs) {
  const today = core.dateKeyAt(nowMs);
  if (dateKey === today) return 'open';
  if (dateKey > today) return 'future';
  if (dateKey === addDaysKey(today, -1) && nowMs < bjtDayStartMs(today) + GRACE_MS) return 'grace';
  return 'late';
}

/** Load a challenge usable by `openid`: throws CHALLENGE_EXPIRED / OWN_CHALLENGE. */
async function loadAnswerableChallenge(id, openid, nowMs) {
  const ch = await store.getDoc('challenges', id);
  if (!ch || nowMs > ch.expiresAt) fail('CHALLENGE_EXPIRED', 'challenge expired or missing');
  try { core.roster(ch.contentVersion); } catch (e) { fail('CHALLENGE_EXPIRED', 'content version retired'); }
  if (ch.ownerOpenid === openid) fail('OWN_CHALLENGE', 'own challenge');
  return ch;
}

/** Has this user already answered this challenge? (runs index: challengeId + openid) */
async function priorAnswer(openid, id) {
  const r = await store.db().collection('runs').where({ openid, challengeId: id }).limit(1).get();
  return r.data[0] || null;
}

/** Would a challenge on a daily seed count as the caller's daily attempt right now (startRun side)? */
async function challengeCountsAsDaily(ch, openid, nowMs) {
  if (ch.mode !== 'daily' || !ch.dateKey) return false;
  if (core.dateKeyAt(nowMs) !== ch.dateKey) return false;
  return !(await store.getDoc('daily_results', `${ch.dateKey}_${openid}`));
}

/**
 * Spoiler lock: anything that could reveal a good lineup for a DAILY seed (the stored optimum, or another
 * player's lineup on that seed) is withheld while the date is still playable (today, or yesterday inside the
 * grace window) unless the caller already has their ranked result for that date.
 */
async function dailyLocked(dateKey, openid, nowMs) {
  if (!dateKey) return false;
  const ws = windowState(dateKey, nowMs);
  if (ws !== 'open' && ws !== 'grace') return false;
  return !(await store.getDoc('daily_results', `${dateKey}_${openid}`));
}

/** daily date (if any) a run's seed belongs to: by recorded dateKey, else by seed match (free runs) */
async function dailyDateOfRun(run) {
  if (run.dateKey) return run.dateKey;
  const r = await store.db().collection('daily_seeds').where({ seed: run.seed }).limit(1).get();
  return r.data[0] ? r.data[0]._id : null;
}

module.exports = { windowState, loadAnswerableChallenge, priorAnswer, challengeCountsAsDaily, dailyLocked, dailyDateOfRun };
