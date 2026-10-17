'use strict';
// QA: scoring vectors of spec 3 re-derived from the spec text, independent of the developers' tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');
const G = require('../core/group');

const hist = (pairs) => {
  const h = new Array(101).fill(0);
  pairs.forEach(([p, n]) => (h[p] += n));
  return h;
};

test('QA AC 1: spec 3.1 vectors and label boundaries', () => {
  [[0, 100], [0.5, 98], [1, 97], [2, 95], [2.5, 93], [10, 75], [20, 50], [39.5, 1], [40, 0], [73, 0]].forEach(([d, s]) => assert.equal(S.cardScore(d), s, 'd=' + d));
  [[2, '心有灵犀'], [2.5, '很同频'], [6, '很同频'], [6.5, '差不多'], [12, '差不多'], [20, '有点偏'], [20.5, '想法独特']].forEach(([d, l]) => assert.equal(S.cardLabel(d), l, 'd=' + d));
});

test('QA AC 2: histogram median for M = 1, 2, 11, 12, all-equal, all at 0 / 100', () => {
  assert.equal(S.histMedian(hist([[40, 1]])), 40);
  assert.equal(S.histMedian(hist([[40, 1], [41, 1]])), 40.5);
  assert.equal(S.histMedian(hist([[10, 5], [50, 1], [90, 5]])), 50);
  assert.equal(S.histMedian(hist([[10, 6], [90, 6]])), 50);
  assert.equal(S.histMedian(hist([[33, 9]])), 33);
  assert.equal(S.histMedian(hist([[0, 4]])), 0);
  assert.equal(S.histMedian(hist([[100, 4]])), 100);
});

test('QA AC 3: prior of W = 10 votes at the anchor', () => {
  assert.equal(S.nationRef(hist([]), 60), 60);
  assert.equal(S.nationRef(hist([[0, 1]]), 60), 60);
  assert.equal(S.nationRef(hist([[30, 1000]]), 90), 30);
});

test('QA AC 4: band boundaries 450 / 380 / 300 / 200', () => {
  const b = S.dayBand;
  assert.notEqual(b(449), b(450));
  assert.notEqual(b(379), b(380));
  assert.notEqual(b(299), b(300));
  assert.notEqual(b(199), b(200));
  assert.equal(b(450), '灵魂同频');
  assert.equal(b(380), '默契十足');
  assert.equal(b(300), '大体同频');
  assert.equal(b(200), '各有想法');
  assert.equal(b(199), '独树一帜');
  assert.equal(S.dailyTotal([50, 50, 50, 50, 50], [50, 50, 50, 50, 50]).total, 500);
});

test('QA AC 5: leave-one-out {10,20,90} gives 55 for member 1', () => {
  assert.equal(S.medianOf([20, 90]), 55);
  if (G.leaveOneOut) assert.equal(G.leaveOneOut([10, 20, 90], 0), 55);
});
