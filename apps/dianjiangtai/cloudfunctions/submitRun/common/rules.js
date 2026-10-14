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

module.exports = { windowState, loadAnswerableChallenge, priorAnswer, challengeCountsAsDaily };
