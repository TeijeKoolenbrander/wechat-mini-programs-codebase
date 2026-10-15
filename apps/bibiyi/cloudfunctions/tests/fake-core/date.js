'use strict';
// TEST DOUBLE of core/date.js: explicit UTC+8 arithmetic, never the process timezone.
const BJT_MS = 8 * 3600e3;
function beijingDateKey(ms) {
  return new Date(ms + BJT_MS).toISOString().slice(0, 10).replace(/-/g, '');
}
module.exports = { beijingDateKey };
