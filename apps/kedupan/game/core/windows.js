/**
 * Day windows (spec 5, PD-24, AC 20, 22). Pure JS. All "now" is the SERVER clock (epoch ms); the device clock is
 * never an input. Date keys are Beijing dates from date.js (explicit UTC+8 arithmetic, TZ independent).
 *
 *   day D open for starting:        00:00 .. 24:00 BJT of D
 *   day D open for finishing:       until D+1 00:30 BJT, only if the first card was submitted on D (grace)
 *   day D closed / 定分 / archive:  from D+1 00:30 BJT  (now >= closeMs)
 */

const { CONFIG } = require('./config');
const { beijingDateKey, dateKeyToMs, addDays, DAY_MS, issueNo } = require('./date');

/** Epoch ms when day D closes (D+1 00:30 BJT): submits stop, references freeze, the day joins the archive. */
function closeMs(dateKey) {
  return dateKeyToMs(dateKey) + DAY_MS + CONFIG.daily.graceMs;
}
function dayClosed(dateKey, nowMs) {
  return nowMs >= closeMs(dateKey);
}

/** Is `dateKey` readable as a live day by getDaily({dateKey}): today, or yesterday before its close. */
function liveDay(dateKey, nowMs) {
  const today = beijingDateKey(nowMs);
  return dateKey === today || (dateKey === addDays(today, -1) && !dayClosed(dateKey, nowMs));
}

/**
 * submitCard window check, in the order of the spec (11.2): future -> INVALID_INPUT; today -> ok; yesterday inside the
 * grace window with the first card on D -> ok (grace: true); else LATE_SUBMIT.
 * @param {{dateKey:string, nowMs:number, entry:{firstAt:number|null}|null}} o
 */
function submitWindow(o) {
  const today = beijingDateKey(o.nowMs);
  if (o.dateKey > today) return { ok: false, code: 'INVALID_INPUT' };
  if (o.dateKey === today) return { ok: true, grace: false };
  const started = !!o.entry && o.entry.firstAt !== null && o.entry.firstAt !== undefined && beijingDateKey(o.entry.firstAt) === o.dateKey;
  if (o.dateKey === addDays(today, -1) && !dayClosed(o.dateKey, o.nowMs) && started) return { ok: true, grace: true };
  return { ok: false, code: 'LATE_SUBMIT' };
}

/** The newest closed day's key at `nowMs` (what the archive may list first). */
function newestClosedKey(nowMs) {
  const today = beijingDateKey(nowMs);
  const y = addDays(today, -1);
  return dayClosed(y, nowMs) ? y : addDays(today, -2);
}

/** Issue number for a date (第 N 期); launch day = 1. */
function issueOf(dateKey, launchKey) {
  return issueNo(dateKey, launchKey || CONFIG.daily.launchDateKey);
}

module.exports = { closeMs, dayClosed, liveDay, submitWindow, newestClosedKey, issueOf };
