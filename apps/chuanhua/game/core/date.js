/**
 * Beijing date helpers (spec 5.2, AC 66). Explicit UTC+8 arithmetic: never
 * uses local-time getters, so the answer is the same whatever TZ the process
 * (or the device) runs in.
 */

const BJT_OFFSET_MS = 8 * 3600e3;
const DAY_MS = 86400e3;

/** 'YYYYMMDD' of the Beijing date at epoch-ms `nowMs`. */
function beijingDateKey(nowMs) {
  return new Date(nowMs + BJT_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Epoch-ms of 00:00 Beijing time on the date of `nowMs`. */
function beijingMidnightMs(nowMs) {
  return Math.floor((nowMs + BJT_OFFSET_MS) / DAY_MS) * DAY_MS - BJT_OFFSET_MS;
}

/** Seconds after 00:00 BJT (board tie-break `s`, spec 11.4). */
function secondsSinceBeijingMidnight(nowMs) {
  return Math.floor((nowMs - beijingMidnightMs(nowMs)) / 1000);
}

/** Epoch-ms of 00:00 BJT for a 'YYYYMMDD' key. */
function dateKeyToMs(key) {
  const y = +key.slice(0, 4);
  const m = +key.slice(4, 6);
  const d = +key.slice(6, 8);
  return Date.UTC(y, m - 1, d) - BJT_OFFSET_MS;
}

/** The key `n` days after `key` (n may be negative). */
function addDays(key, n) {
  return beijingDateKey(dateKeyToMs(key) + n * DAY_MS + 12 * 3600e3);
}

/** Whole days from key a to key b. */
function daysBetween(a, b) {
  return Math.round((dateKeyToMs(b) - dateKeyToMs(a)) / DAY_MS);
}

/** Milliseconds until the next 00:00 BJT. */
function msUntilBeijingMidnight(nowMs) {
  return beijingMidnightMs(nowMs) + DAY_MS - nowMs;
}

/** Issue number (第 N 期): days since launch, launch day = 1. */
function issueNo(dateKey, launchKey) {
  return daysBetween(launchKey, dateKey) + 1;
}

module.exports = {
  BJT_OFFSET_MS,
  DAY_MS,
  beijingDateKey,
  beijingMidnightMs,
  secondsSinceBeijingMidnight,
  dateKeyToMs,
  addDays,
  daysBetween,
  msUntilBeijingMidnight,
  issueNo,
};
