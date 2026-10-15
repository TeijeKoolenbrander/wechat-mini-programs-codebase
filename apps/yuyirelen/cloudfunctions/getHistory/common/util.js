'use strict';
// Shared helpers. This folder is the source of truth; scripts/sync-core.js copies it
// into every function folder (cloud functions deploy one folder each).
const crypto = require('crypto');

const DAY_MS = 86400000;
const BJT_MS = 8 * 3600e3;
const GRACE_MS = 30 * 60e3; // D+1 00:30 BJT (spec 4.1)
const RETENTION_DAYS = 180; // spec 14.2 cleanup

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

// ---- date keys (pure helpers; "now" keys come from coreapi.dateKeyAt) ----
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

module.exports = {
  DAY_MS, BJT_MS, GRACE_MS, RETENTION_DAYS,
  AppError, fail, sha256hex, hmacHex,
  isDateKey, keyFromUtcMidnight, utcMidnight, addDaysKey, daysBetween, bjtDayStartMs,
  base32From, randomHex, isInt, isPlainObject, now, configuredTimeoutMs,
};
