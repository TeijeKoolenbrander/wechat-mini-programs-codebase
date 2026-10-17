'use strict';
/**
 * Per-player daily allowances, rewards and streak (spec 3.9, 4.1, 11, AC 18, 90, 101, 102). Pure functions over the
 * `players` document (spec 13.1): each takes a player and returns a NEW player (or a refusal), so the cloud functions can
 * run them inside a transaction. `dateKey` is always the SERVER's Beijing date key (core/date.js), never the device's.
 *
 * players._id = openid; fields used here:
 *   day: { dateKey, starts, adStarts, steps, reports, palette, claims: {<chainId>: n}, noFill: {start, palette} }
 *   curStreak, bestStreak, lastStepDate, lifetimeReveals
 * `noFill` is an addition (decisions TD-4): the once-per-day-per-placement reward on ad no-fill (spec 11, AC 102).
 */

const { CONFIG } = require('./config');
const { addDays } = require('./date');

const A = CONFIG.allowances;

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function emptyDay(dateKey) {
  return { dateKey, starts: 0, adStarts: 0, steps: 0, reports: 0, palette: false, claims: {}, noFill: { start: false, palette: false }, roomsCreated: 0, roomsJoined: 0, joined: [] };
}

/** A fresh player document. */
function newPlayer(openid, now) {
  return {
    _id: openid,
    rulesVersion: 0,
    strikes: [],
    restrictedUntil: 0,
    restrictedAt: 0,
    permanent: false,
    flagged: false,
    warnPending: false,
    day: emptyDay('00000000'),
    curStreak: 0,
    bestStreak: 0,
    lastStepDate: null,
    lifetimeReveals: 0,
    seenPrompts: [], // ring buffer of the last 300 prompt ids shown (4.1)
    roll: null, // {rollId, ctx: 'chain', ids, rerolls 0..5, shownIds [<= 18], used, at}: the current 慢慢传 roll
    activeRoomId: null, // the lobby or game the player is seated in (3A.9); validated against the room on every read
    claimRef: null, // {chainId, claimId, expiresAt}: the 慢慢传 claim taken last (IN_CLAIM)
    lastActiveAt: now || 0,
  };
}

/** Reset the `day` block when the Beijing date changed (resets at 00:00 BJT by server time, AC 18). Returns the same object when nothing changes. */
function rollDay(player, dateKey) {
  if (player.day && player.day.dateKey === dateKey) return player;
  const p = clone(player);
  p.day = emptyDay(dateKey);
  return p;
}

/** How many chains the player can start right now and how many rewarded extras remain. */
function startsLeft(player, dateKey) {
  const d = rollDay(player, dateKey).day;
  return {
    startsLeft: Math.max(0, A.freeStarts + d.adStarts - d.starts),
    adStartsLeft: Math.max(0, A.adStartsMax - d.adStarts),
    freeLeft: Math.max(0, Math.min(A.freeStarts, A.freeStarts + d.adStarts - d.starts)),
  };
}

/** createChain check (the start is consumed at 第 1 棒 submit, AC 3). */
function checkStart(player, dateKey) {
  return startsLeft(player, dateKey).startsLeft > 0 ? null : { code: 'START_LIMIT' };
}

function consumeStart(player, dateKey) {
  const p = clone(rollDay(player, dateKey));
  p.day.starts += 1;
  return p;
}

/** Void/system fault: give the allowance back, only if the counters are still those of the same Beijing day. */
function refundStart(player, dateKey) {
  if (!player.day || player.day.dateKey !== dateKey || player.day.starts < 1) return player;
  const p = clone(player);
  p.day.starts -= 1;
  return p;
}

function checkSteps(player, dateKey) {
  return rollDay(player, dateKey).day.steps < A.stepsPerDay ? null : { code: 'STEP_LIMIT' };
}
function consumeStep(player, dateKey) {
  const p = clone(rollDay(player, dateKey));
  p.day.steps += 1;
  return p;
}
function refundStep(player, dateKey) {
  if (!player.day || player.day.dateKey !== dateKey || player.day.steps < 1) return player;
  const p = clone(player);
  p.day.steps -= 1;
  return p;
}

// ---- rooms (3.9, PO-48) ----------------------------------------------------------------------------------------

/** createRoom: the daily turn cap and the 10 rooms a day (a game already started is never cut off, 3.9) */
function checkRoomCreate(player, dateKey) {
  const d = rollDay(player, dateKey).day;
  if (d.steps >= A.stepsPerDay) return { code: 'STEP_LIMIT' };
  return (d.roomsCreated || 0) < A.roomsCreatedPerDay ? null : { code: 'ROOM_LIMIT' };
}
function consumeRoomCreate(player, dateKey) {
  const p = clone(rollDay(player, dateKey));
  p.day.roomsCreated = (p.day.roomsCreated || 0) + 1;
  return p;
}
/** a room closed before it started gives the creation back */
function refundRoomCreate(player, dateKey) {
  if (!player.day || player.day.dateKey !== dateKey || !(player.day.roomsCreated >= 1)) return player;
  const p = clone(player);
  p.day.roomsCreated -= 1;
  return p;
}
/** joinRoom: the turn cap and 30 rooms joined a day, counted on the FIRST join of a room only */
function checkRoomJoin(player, dateKey, roomId) {
  const d = rollDay(player, dateKey).day;
  if (d.steps >= A.stepsPerDay) return { code: 'STEP_LIMIT' };
  if ((d.joined || []).includes(roomId)) return null;
  return (d.roomsJoined || 0) < A.roomsJoinedPerDay ? null : { code: 'JOIN_LIMIT' };
}
function consumeRoomJoin(player, dateKey, roomId) {
  const p = clone(rollDay(player, dateKey));
  p.day.joined = p.day.joined || [];
  if (!p.day.joined.includes(roomId)) {
    p.day.joined.push(roomId);
    p.day.roomsJoined = (p.day.roomsJoined || 0) + 1;
  }
  return p;
}
/** rooms left today, for getHome */
function roomsLeft(player, dateKey) {
  const d = rollDay(player, dateKey).day;
  return { created: Math.max(0, A.roomsCreatedPerDay - (d.roomsCreated || 0)), joined: Math.max(0, A.roomsJoinedPerDay - (d.roomsJoined || 0)), turns: Math.max(0, A.stepsPerDay - d.steps) };
}

function claimsOnChain(player, dateKey, chainId) {
  const d = rollDay(player, dateKey).day;
  return d.claims[chainId] || 0;
}
function checkClaims(player, dateKey, chainId) {
  return claimsOnChain(player, dateKey, chainId) < A.claimsPerChainPerDay ? null : { code: 'CLAIM_LIMIT' };
}
function consumeClaim(player, dateKey, chainId) {
  const p = clone(rollDay(player, dateKey));
  p.day.claims[chainId] = (p.day.claims[chainId] || 0) + 1;
  return p;
}

function checkReports(player, dateKey) {
  return rollDay(player, dateKey).day.reports < A.reportsPerDay ? null : { code: 'REPORT_LIMIT' };
}
function consumeReport(player, dateKey) {
  const p = clone(rollDay(player, dateKey));
  p.day.reports += 1;
  return p;
}

function paletteToday(player, dateKey) {
  return rollDay(player, dateKey).day.palette === true;
}

/**
 * grantReward({kind, noFill}) (11, AC 101/102). Rewards are cosmetic or a small start allowance, so the server trusts the
 * client's completion signal within the daily caps: 'start' <= 2/day, 'palette' <= 1/day. `noFill` (ad failed to load):
 * granted once per day per placement, a second one is refused (REWARD_LIMIT).
 * @returns {{ok:true, player, startsLeft?:number, adStartsLeft?:number, paletteToday?:boolean} | {ok:false, code:'REWARD_LIMIT'|'BAD_REQUEST'}}
 */
function grantReward(player, kind, noFill, dateKey) {
  if (kind !== 'start' && kind !== 'palette') return { ok: false, code: 'BAD_REQUEST' };
  const p = clone(rollDay(player, dateKey));
  if (noFill) {
    if (p.day.noFill[kind]) return { ok: false, code: 'REWARD_LIMIT' };
    p.day.noFill[kind] = true;
  }
  if (kind === 'start') {
    if (p.day.adStarts >= A.adStartsMax) return { ok: false, code: 'REWARD_LIMIT' };
    p.day.adStarts += 1;
    const s = startsLeft(p, dateKey);
    return { ok: true, player: p, startsLeft: s.startsLeft, adStartsLeft: s.adStartsLeft };
  }
  if (p.day.palette) return { ok: false, code: 'REWARD_LIMIT' };
  p.day.palette = true;
  return { ok: true, player: p, paletteToday: true };
}

// ---- streak (4.1, AC 90) -------------------------------------------------------------------------------------

/**
 * A non-marker turn of this player was sent on `dateKey`: advance the streak. Consecutive Beijing days with >= 1 passed 棒 (as author).
 * Same day -> unchanged; the next day -> +1; a gap -> restarts at 1.
 */
function advanceStreak(player, dateKey) {
  if (player.lastStepDate === dateKey) return player;
  const p = clone(player);
  p.curStreak = player.lastStepDate && addDays(player.lastStepDate, 1) === dateKey ? (player.curStreak || 0) + 1 : 1;
  p.bestStreak = Math.max(player.bestStreak || 0, p.curStreak);
  p.lastStepDate = dateKey;
  return p;
}

/** The streak to show on `dateKey`: still alive when the last passed 棒 was today or yesterday, else 0. */
function currentStreak(player, dateKey) {
  if (!player.lastStepDate) return 0;
  if (player.lastStepDate === dateKey || addDays(player.lastStepDate, 1) === dateKey) return player.curStreak || 0;
  return 0;
}

/** '连续接龙 4 天' for N >= 2, else null. Grants nothing (no rewards, no freeze, no reminders). */
function streakText(n) {
  return n >= CONFIG.stats.streakMin ? '连续接龙 ' + n + ' 天' : null;
}

module.exports = {
  emptyDay, newPlayer, checkRoomCreate, consumeRoomCreate, refundRoomCreate, checkRoomJoin, consumeRoomJoin, roomsLeft, rollDay, startsLeft, checkStart, consumeStart, refundStart,
  checkSteps, consumeStep, refundStep, claimsOnChain, checkClaims, consumeClaim, checkReports, consumeReport,
  paletteToday, grantReward, advanceStreak, currentStreak, streakText,
};
