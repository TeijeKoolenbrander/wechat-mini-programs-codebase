'use strict';
// TEST DOUBLE of core/content/schedule.v1.js: 80 issues over the fake library (issue N = days[N-1]).
const pad = (n, w) => String(n).padStart(w, '0');
const days = [];
for (let n = 1; n <= 80; n++) {
  const day = [];
  for (let k = 0; k < 5; k++) {
    const spec = ((5 * (n - 1) + k) % 40) + 1;
    const item = Math.floor((5 * (n - 1)) / 40) + 1;
    day.push(`s${pad(spec, 3)}i${pad(item, 2)}`);
  }
  days.push(day);
}
module.exports = { scheduleVersion: 1, contentVersion: 1, launchDateKey: '20261101', days };
