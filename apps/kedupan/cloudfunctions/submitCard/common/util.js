'use strict';
// Shared helpers. This folder is the source of truth; scripts/sync-core.js copies it
// into every function folder (cloud functions deploy one folder each).
const crypto = require('crypto');

const DAY_MS = 86400000;
const BJT_MS = 8 * 3600e3;
const GRACE_MS = 30 * 60e3; // D+1 00:30 BJT: the daily window closes and scores become final
const RETENTION_DAYS = 180; // spec section 13
const CARDS = 5;

class AppError extends Error {
  constructor(code, message, extra) {
    super(message || code);
    this.code = code;
    this.extra = extra || null;
  }
}
function fail(code, message, extra) {
  throw new AppError(code, message, extra);
}

function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// ---- date keys (the "now" key comes from core date.js via coreapi; these are pure helpers) ----
function isDateKey(s) {
  if (typeof s !== 'string' || !/^\d{8}$/.test(s)) return false;
  const ms = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  return keyFromUtcMidnight(ms) === s;
}
function keyFromUtcMidnight(ms) {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}
function utcMidnight(key) {
  return Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
}
function addDaysKey(key, n) {
  return keyFromUtcMidnight(utcMidnight(key) + n * DAY_MS);
}
function daysBetween(a, b) {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / DAY_MS);
}
/** ms timestamp of 00:00 Beijing time on the given date key */
function bjtDayStartMs(key) {
  return utcMidnight(key) - BJT_MS;
}
/** the day D is closed (scores final, no more submissions) from D+1 00:30 BJT */
function isDayClosed(dateKey, nowMs) {
  return nowMs >= bjtDayStartMs(addDaysKey(dateKey, 1)) + GRACE_MS;
}

// ---- ids ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** 8 random base32 chars (40 bits from the CSPRNG) */
function randomId8() {
  const buf = crypto.randomBytes(5);
  let bits = 0n;
  for (const b of buf) bits = (bits << 8n) | BigInt(b);
  let out = '';
  for (let i = 7; i >= 0; i--) out += B32[Number((bits >> BigInt(i * 5)) & 31n)];
  return out;
}
/** uniform integer in [min, max] from the CSPRNG */
function randomIntInclusive(min, max) {
  return crypto.randomInt(min, max + 1);
}
function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ---- misc ----
function isInt(n, min, max) {
  return Number.isInteger(n) && n >= min && n <= max;
}
function isPlainObject(o) {
  return o !== null && typeof o === 'object' && !Array.isArray(o);
}
function now() {
  return Date.now();
}
/** configured timeout (seconds) from function.config.json, in ms. Never hard-coded in logic. */
function configuredTimeoutMs() {
  try {
    const c = require('../function.config.json');
    if (c && c.timeout > 0) return c.timeout * 1000;
  } catch (e) { /* fall through */ }
  return 3000; // platform default
}
/** seconds after 00:00 BJT of dateKey (board tie-break `t`) */
function secondsIntoDay(ms, dateKey) {
  return Math.max(0, Math.floor((ms - bjtDayStartMs(dateKey)) / 1000));
}

module.exports = {
  DAY_MS, BJT_MS, GRACE_MS, RETENTION_DAYS, CARDS,
  AppError, fail, sha256hex,
  isDateKey, keyFromUtcMidnight, utcMidnight, addDaysKey, daysBetween, bjtDayStartMs, isDayClosed,
  randomId8, randomIntInclusive, randomHex, isInt, isPlainObject, now, configuredTimeoutMs, secondsIntoDay,
};
