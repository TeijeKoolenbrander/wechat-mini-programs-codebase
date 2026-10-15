'use strict';
// The coreapi adapter against spec section 3 fixtures. These run on whichever core sync resolved (the real core
// once it exists), so they double as the integration check for the assumed core surface.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

function api() {
  const h = createHarness();
  const core = h.mod('getDaily', ['common', 'coreapi.js']);
  h.teardown();
  return core;
}
const hist = (pairs) => { const a = new Array(101).fill(0); for (const [p, n] of pairs) a[p] += n; return a; };

test('card score vectors and label boundaries (AC 1)', () => {
  const c = api();
  const vec = [[0, 100], [0.5, 98], [1, 97], [2, 95], [2.5, 93], [10, 75], [20, 50], [39.5, 1], [40, 0], [73, 0]];
  for (const [d, s] of vec) assert.equal(c.cardScore(d), s, `d=${d}`);
  const lab = [[2, '心有灵犀'], [2.5, '很同频'], [6, '很同频'], [6.5, '差不多'], [12, '差不多'], [20, '有点偏'], [20.5, '想法独特']];
  for (const [d, l] of lab) assert.equal(c.cardLabel(d), l, `d=${d}`);
});

test('reference with the 10-vote prior (AC 3)', () => {
  const c = api();
  assert.equal(c.refFromHist(hist([]), 60), 60);
  assert.equal(c.refFromHist(hist([[0, 1]]), 60), 60);
  assert.equal(c.refFromHist(hist([[30, 1000]]), 90), 30);
});

test('day bands (AC 4)', () => {
  const c = api();
  for (const [t, b] of [[500, '灵魂同频'], [450, '灵魂同频'], [449, '默契十足'], [380, '默契十足'], [379, '大体同频'], [300, '大体同频'], [299, '各有想法'], [200, '各有想法'], [199, '独树一帜'], [0, '独树一帜']]) {
    assert.equal(c.dayBand(t), b, String(t));
  }
});

test('group fixture: members {10,20,90}: leave-one-out reference of member 1 is 55, 群默契度 only for n >= 3 (AC 5)', () => {
  const c = api();
  assert.equal(c.looRef([10, 20, 90], 0), 55);
  const pos = (v) => ({ pos: [v, v, v, v, v] });
  const three = c.groupScores([pos(10), pos(20), pos(90)]);
  assert.deepEqual(three.gs, [0, 125, 0]);
  assert.equal(three.mq, 33);
  const two = c.groupScores([pos(10), pos(20)]);
  assert.equal(two.mq, null);
  assert.deepEqual(two.gs, [375, 375]);
  assert.deepEqual(c.groupScores([pos(10)]).gs, [null]);
  // a perfectly agreeing group of 3 has 群默契度 100
  assert.equal(c.groupScores([pos(50), pos(50), pos(50)]).mq, 100);
});

test('median of values and 21-bin distribution', () => {
  const c = api();
  for (const [v, m] of [[[5], 5], [[1, 2], 1.5], [[0, 0, 0], 0], [[100, 100], 100], [[3, 1, 2], 2], [[1, 2, 3, 4], 2.5]]) assert.equal(c.medianOfValues(v), m);
  const d = c.hist21(hist([[0, 1], [4, 1], [5, 2], [100, 3]]));
  assert.equal(d.length, 21);
  assert.deepEqual([d[0], d[1], d[20]], [2, 2, 3]);
  assert.equal(c.totalBin(500), 100);
  assert.equal(c.totalBin(7), 1);
});
