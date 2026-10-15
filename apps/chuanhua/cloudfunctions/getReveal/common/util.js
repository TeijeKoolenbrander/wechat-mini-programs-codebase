'use strict';
// Shared helpers. This folder is the source of truth; scripts/sync-core.js copies it
// into every function folder (cloud functions deploy one folder each).
const crypto = require('crypto');

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const BJT_MS = 8 * HOUR_MS;
const RETENTION_DAYS = 180; // PO-19
const CHAIN_LENGTH = 6;

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
function sha1hex(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex');
}

// ---- date keys: explicit UTC+8 arithmetic, never local-time getters (AC 113) ----
function dateKeyAt(ms) {
  return new Date(ms + BJT_MS).toISOString().slice(0, 10).replace(/-/g, '');
}
function utcMidnight(key) {
  return Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
}
function keyFromUtcMidnight(ms) {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}
function addDaysKey(key, n) {
  return keyFromUtcMidnight(utcMidnight(key) + n * DAY_MS);
}
function daysBetween(a, b) {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / DAY_MS);
}
function isDateKey(s) {
  if (typeof s !== 'string' || !/^\d{8}$/.test(s)) return false;
  return keyFromUtcMidnight(utcMidnight(s)) === s;
}
/** hour of day (0-23) in Beijing time */
function bjtHour(ms) {
  return new Date(ms + BJT_MS).getUTCHours();
}
/** ms of 00:00 BJT on the date of ms */
function bjtMidnightMs(ms) {
  return Math.floor((ms + BJT_MS) / DAY_MS) * DAY_MS - BJT_MS;
}

// ---- ids ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function randomBase32(n) {
  const buf = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += B32[buf[i] & 31];
  return out;
}
function newChainId() {
  return randomBase32(10);
}
function newClaimId() {
  return randomBase32(12);
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
/** configured timeout (seconds) from function.config.json, in ms. */
function configuredTimeoutMs() {
  try {
    const c = require('../function.config.json');
    if (c && c.timeout > 0) return c.timeout * 1000;
  } catch (e) { /* fall through */ }
  return 3000; // platform default
}
/** race a promise against a timeout (rejects with an Error whose code is 'TIMEOUT') */
function withTimeout(p, ms, label) {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => { const e = new Error(`${label || 'op'} timed out`); e.code = 'TIMEOUT'; rej(e); }, ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}
/** Kind of 棒 n: odd = draw, even = describe */
function kindOfStep(n) {
  return n % 2 === 1 ? 'draw' : 'describe';
}

module.exports = {
  DAY_MS, HOUR_MS, BJT_MS, RETENTION_DAYS, CHAIN_LENGTH,
  AppError, fail, sha256hex, sha1hex,
  dateKeyAt, utcMidnight, addDaysKey, daysBetween, isDateKey, bjtHour, bjtMidnightMs,
  randomBase32, newChainId, newClaimId, isInt, isPlainObject, now, configuredTimeoutMs, withTimeout, kindOfStep,
};
