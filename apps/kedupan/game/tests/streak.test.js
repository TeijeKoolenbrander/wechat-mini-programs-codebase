'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ST = require('../core/streak');

const run = (stats, day, prev) => ST.onComplete(stats, day, prev);

test('AC 80: first completion starts a streak of 1', () => {
  const r = run(null, '20261101', null);
  assert.equal(r.streak, 1);
  assert.deepEqual(r.stats, { curStreak: 1, bestStreak: 1, lastCompleteDate: '20261101', totalDays: 1 });
});

test('AC 80: consecutive published days add one', () => {
  let s = run(null, '20261101', null).stats;
  s = run(s, '20261102', '20261101').stats;
  const r = run(s, '20261103', '20261102');
  assert.equal(r.streak, 3);
  assert.equal(r.stats.bestStreak, 3);
  assert.equal(r.stats.totalDays, 3);
});

test('AC 80: a skipped PUBLISHED day resets to 1 but keeps the best', () => {
  let s = run(null, '20261101', null).stats;
  s = run(s, '20261102', '20261101').stats; // streak 2
  const r = run(s, '20261104', '20261103'); // 20261103 was published and missed
  assert.equal(r.streak, 1);
  assert.equal(r.stats.bestStreak, 2);
});

test('AC 80: an UNPUBLISHED day is skipped (prev is the latest published day)', () => {
  let s = run(null, '20261101', null).stats;
  // nothing published on 20261102; the latest published day before 20261103 is 20261101
  const r = run(s, '20261103', '20261101');
  assert.equal(r.streak, 2);
});

test('AC 80: a duplicate completion does not double count; older days never rewrite history', () => {
  let s = run(null, '20261101', null).stats;
  s = run(s, '20261102', '20261101').stats;
  const dup = run(s, '20261102', '20261101');
  assert.equal(dup.changed, false);
  assert.deepEqual(dup.stats, s);
  const old = run(s, '20261101', null);
  assert.equal(old.changed, false);
  assert.deepEqual(old.stats, s);
});

test('AC 80: display - yesterday\'s streak all of today until today completes; 0 once a published day was missed', () => {
  const s = { curStreak: 4, bestStreak: 7, lastCompleteDate: '20261101', totalDays: 9 };
  assert.deepEqual(ST.display(s, '20261102', '20261101'), { current: 4, best: 7 });
  assert.deepEqual(ST.display({ ...s, lastCompleteDate: '20261102' }, '20261102', '20261101'), { current: 4, best: 7 });
  assert.deepEqual(ST.display(s, '20261103', '20261102'), { current: 0, best: 7 });
  assert.deepEqual(ST.display(null, '20261103', '20261102'), { current: 0, best: 0 });
  assert.deepEqual(ST.display(s, '20261102', null), { current: 0, best: 7 });
});
