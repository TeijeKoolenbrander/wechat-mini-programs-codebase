'use strict';
/**
 * Reveal-notice timing (spec 7.6, 10.3, AC 78): the opt-in "接龙揭晓了" message is never sent between 22:00 and 08:00
 * Beijing time; modSweeper holds it until 08:00.
 */

const { CONFIG } = require('./config');
const { beijingMidnightMs } = require('./date');

const HOUR = 3600e3;

/** Beijing hour (0-23) of an epoch-ms timestamp, explicit UTC+8 arithmetic */
function bjtHour(ms) {
  return new Date(ms + 8 * HOUR).getUTCHours();
}

/** is `ms` inside the quiet window [22:00, 08:00) BJT */
function inQuietHours(ms) {
  const h = bjtHour(ms);
  return h >= CONFIG.quietHours.fromHour || h < CONFIG.quietHours.toHour;
}

/** earliest time a notice due at `ms` may be sent: `ms` itself, or 08:00 BJT when due inside the quiet window */
function noticeSendTime(ms) {
  if (!inQuietHours(ms)) return ms;
  const midnight = beijingMidnightMs(ms);
  const h = bjtHour(ms);
  const base = h >= CONFIG.quietHours.fromHour ? midnight + 24 * HOUR : midnight;
  return base + CONFIG.quietHours.toHour * HOUR;
}

module.exports = { bjtHour, inQuietHours, noticeSendTime };
