'use strict';
// Shared helpers (kedupan). This folder is the source of truth; scripts/sync-core.js copies it
// into every function folder (cloud functions deploy one folder each).
const crypto = require('crypto');

/** The test cloud environment is shared across apps: every collection is prefixed with the app slug. */
const COLLECTION_PREFIX = 'kedupan_';
function col(name) {
  return COLLECTION_PREFIX + name;
}
const DAY_MS = 86400000;
const BJT_MS = 8 * 3600e3;
const RETENTION_DAYS = 180; // D7

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
function hmacHex(key, s) {
  return crypto.createHmac('sha256', key).update(String(s)).digest('hex');
}

// ---- date keys (all "now" keys come from core date.js via coreapi; these are pure helpers) ----
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

// ---- ids ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** first 40 bits of a hex digest as 8 base32 chars */
function base32From(hex) {
  const buf = Buffer.from(hex.slice(0, 10), 'hex');
  let bits = 0n;
  for (const b of buf) bits = (bits << 8n) | BigInt(b);
  let out = '';
  for (let i = 7; i >= 0; i--) out += B32[Number((bits >> BigInt(i * 5)) & 31n)];
  return out;
}
function randomSeed() {
  return crypto.randomBytes(4).readUInt32BE(0);
}
/** random 8-char base32 round id (spec 11.1 rounds._id) */
function newRoundId() {
  return base32From(crypto.randomBytes(5).toString('hex'));
}
/** uniform float in [0, 1) from crypto randomness (target draw, spec 11.2 createRound; AC 26) */
function randomFloat() {
  return crypto.randomBytes(6).readUIntBE(0, 6) / 281474976710656;
}
/** a fresh 16-byte salt as hex (daily_sets.boardSalt, rounds.salt; spec 8.3) */
function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}
/** board row hash h = sha256(openid + '|' + salt)[0..12) (spec 8.3); the open data domain recomputes it with the same rule */
function rowHash(openid, salt) {
  return sha256hex(openid + '|' + salt).slice(0, 12);
}
/** opaque group handle sha256(openGId + pepper)[0..16) (spec 8.1) */
function groupRefOf(openGId, pepper) {
  return sha256hex(openGId + pepper).slice(0, 16);
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
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
/** In-instance cache TTL in seconds: env KD_CACHE_SEC (tests set 0) else the given default. Read on every call. */
function cacheSec(dflt) {
  const v = process.env.KD_CACHE_SEC;
  return v !== undefined && v !== '' && Number.isFinite(+v) ? Math.max(0, +v) : dflt;
}
/** Reject after `ms` (the underlying call is not cancelled): every WeChat content-security call is bounded this way. Carries `timeout: true`. */
function withTimeout(promise, ms, what) {
  let timer;
  const cap = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error((what || 'call') + ' timed out after ' + ms + ' ms'), { timeout: true, errCode: 'TIMEOUT' })), ms);
  });
  return Promise.race([Promise.resolve(promise), cap]).finally(() => clearTimeout(timer));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
/** a trace id for a mock check (never mistaken for a real WeChat trace_id) */
function newMockTraceId() {
  return 'mock-' + crypto.randomBytes(8).toString('hex');
}

/** configured timeout (seconds) from function.config.json, in ms. Never hard-coded in logic. */
function configuredTimeoutMs() {
  try {
    const c = require('../function.config.json');
    if (c && c.timeout > 0) return c.timeout * 1000;
  } catch (e) { /* fall through */ }
  return 3000; // platform default
}

module.exports = {
  COLLECTION_PREFIX, col, DAY_MS, BJT_MS, RETENTION_DAYS,
  AppError, fail, sha256hex, hmacHex,
  isDateKey, keyFromUtcMidnight, utcMidnight, addDaysKey, daysBetween, bjtDayStartMs,
  base32From, randomSeed, newRoundId, randomFloat, newSalt, rowHash, groupRefOf, isInt, isPlainObject, now, configuredTimeoutMs, chunk, cacheSec, withTimeout, sleep, newMockTraceId,
};
