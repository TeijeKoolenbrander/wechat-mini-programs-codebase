'use strict';
// TEST DOUBLE of game/core/date.js: explicit UTC+8 arithmetic, never local-time getters.
function beijingDateKey(nowMs) {
  return new Date(nowMs + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
}
module.exports = { beijingDateKey };
