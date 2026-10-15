'use strict';
// TEST DOUBLE of core/judge.js. hi = the bottom value is numerically greater than the top value.
function correctChoice(a, b) {
  return b.value > a.value ? 'hi' : 'lo';
}
module.exports = { correctChoice };
