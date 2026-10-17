'use strict';
// Shared helpers. This folder is the source of truth; scripts/sync-core.js copies it
// into every function folder (cloud functions deploy one folder each).
const crypto = require('crypto');

const DAY_MS = 86400000;
const BJT_MS = 8 * 3600e3;

const RETENTION_DAYS = 180; // PO-19

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

/** physical collection name: the shared test cloud environment needs the app slug on every collection (core/schema.js) */
const COLLECTION_PREFIX = 'chuanhua_';
function col(logical) {
  return COLLECTION_PREFIX + logical;
}

// ---- random ids (crypto, never Math.random: ids are unguessable capability-like values) ----
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
function randomId(n, alphabet) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}
const newChainId = () => randomId(10, B32);
const newClaimId = () => 'c' + randomId(15, ALNUM);
const newMockTraceId = () => 'mock-trace-' + randomId(12, ALNUM);

/** reject after ms. The work itself cannot be cancelled (SDK calls), so callers must treat a timeout as a failure. */
function withTimeout(promise, ms, label) {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => rej(Object.assign(new Error((label || 'call') + ' timed out'), { timeout: true })), ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  randomId, newChainId, newClaimId, newMockTraceId, withTimeout, sleep,
  COLLECTION_PREFIX, col,
  DAY_MS, BJT_MS, RETENTION_DAYS,
  AppError, fail, sha256hex, hmacHex,
  isDateKey, keyFromUtcMidnight, utcMidnight, addDaysKey, daysBetween, bjtDayStartMs,
  base32From, randomSeed, isInt, isPlainObject, now, configuredTimeoutMs,
};
