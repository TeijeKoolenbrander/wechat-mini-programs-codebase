'use strict';
// Pure rules (no database): temperature, bands, window, streak, normalisation.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

let h;
let rules;
let util;
beforeEach(() => {
  h = createHarness();
  rules = h.mod('guess') && require(require('path').join(h.root, 'guess', 'common', 'rules.js'));
  util = require(require('path').join(h.root, 'guess', 'common', 'util.js'));
});
afterEach(() => h.teardown());

test('temperature T = round(100 * (1 - ln r / ln V)); T(1) = 100, T(V) = 0 (AC 30)', () => {
  const V = 30000;
  assert.equal(rules.tempOf(1, V), 100);
  assert.equal(rules.tempOf(V, V), 0);
  for (const r of [2, 10, 100, 1000, 5000, 29999]) assert.equal(rules.tempOf(r, V), Math.round(100 * (1 - Math.log(r) / Math.log(V))));
  assert.equal(rules.tempOf(10, V), 78);
  assert.equal(rules.tempOf(100, V), 55);
  assert.equal(rules.tempOf(1000, V), 33);
});

test('bands follow the boundaries 1, 2, 10, 11, 100, 101, 500, 501, 2000, 2001 (AC 31)', () => {
  const at = (r) => rules.bandOf(r);
  assert.deepEqual([1, 2, 10, 11, 100, 101, 500, 501, 2000, 2001].map(at),
    ['hit', 'boil', 'boil', 'scald', 'scald', 'hot', 'hot', 'warm', 'warm', 'cold']);
  assert.equal(at(30000), 'cold');
});

test('window states around midnight and the 00:30 grace, with the process TZ set to UTC (AC 59)', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const ms = (d, hh, mm, ss = 0) => Date.UTC(2026, 10, d, hh, mm, ss);
    assert.equal(rules.windowState('20261103', ms(3, 4, 0)), 'open');
    assert.equal(rules.windowState('20261103', ms(3, 15, 59, 59)), 'open');
    assert.equal(rules.windowState('20261103', ms(3, 16, 0)), 'grace'); // 00:00 BJT on 1104
    assert.equal(rules.windowState('20261103', ms(3, 16, 29, 59)), 'grace');
    assert.equal(rules.windowState('20261103', ms(3, 16, 30)), 'late');
    assert.equal(rules.windowState('20261104', ms(3, 4, 0)), 'future');
    assert.equal(rules.windowState('20261101', ms(3, 4, 0)), 'late');
  } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
});

test('nextStreak / effectiveStreak', () => {
  assert.deepEqual(rules.nextStreak(null, '20261103', null, 'solved'), { curStreak: 1, bestStreak: 1, lastSolvedDate: '20261103' });
  assert.deepEqual(rules.nextStreak({ curStreak: 3, bestStreak: 5, lastSolvedDate: '20261102' }, '20261103', '20261102', 'solved'),
    { curStreak: 4, bestStreak: 5, lastSolvedDate: '20261103' });
  assert.deepEqual(rules.nextStreak({ curStreak: 3, bestStreak: 5, lastSolvedDate: '20261101' }, '20261103', '20261102', 'solved'),
    { curStreak: 1, bestStreak: 5, lastSolvedDate: '20261103' });
  assert.equal(rules.nextStreak({ curStreak: 3, bestStreak: 5, lastSolvedDate: '20261102' }, '20261103', '20261102', 'gaveup').curStreak, 0);
  assert.deepEqual(rules.effectiveStreak({ curStreak: 4, bestStreak: 6, lastSolvedDate: '20261102' }, '20261103', '20261102'), { current: 4, best: 6 });
  assert.deepEqual(rules.effectiveStreak({ curStreak: 4, bestStreak: 6, lastSolvedDate: '20261101' }, '20261103', '20261102'), { current: 0, best: 6 });
  assert.deepEqual(rules.effectiveStreak(null, '20261103', null), { current: 0, best: 0 });
});

test('normalizeWord strips spaces/punctuation, folds full-width forms and drops control characters', () => {
  assert.equal(rules.normalizeWord(' 番 茄 '), '番茄');
  assert.equal(rules.normalizeWord('番茄！'), '番茄');
  assert.equal(rules.normalizeWord('番​茄'), '番茄');
  assert.equal(rules.normalizeWord('ＡＢ'), 'AB');
  assert.equal(rules.normalizeWord(null), '');
});

test('date helpers: key arithmetic and validation', () => {
  assert.equal(util.addDaysKey('20261231', 1), '20270101');
  assert.equal(util.daysBetween('20261101', '20261104'), 3);
  assert.equal(util.isDateKey('20260230'), false);
  assert.equal(util.isDateKey('20261103'), true);
  assert.equal(util.bjtDayStartMs('20261103'), Date.UTC(2026, 10, 2, 16, 0, 0));
});

test('the hint table and limits match the spec (4.4, PO-14)', () => {
  assert.deepEqual(rules.HINTS.map((x) => [x.k, x.at, x.cap]), [[1, 10, 300], [2, 20, 50], [3, 30, null], [4, 40, 10]]);
  assert.equal(rules.LIMITS.guessesPerMinute, 40);
  assert.equal(rules.LIMITS.guessesPerPuzzle, 600);
  assert.equal(rules.LIMITS.adHintsPerPuzzle, 3);
});
