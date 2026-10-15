'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');
const { sub } = require('../core/rng');
const { beijingDateKey, addDays, issueNo, secondsSinceBeijingMidnight, beijingMidnightMs, dateKeyToMs } = require('../core/date');
const { clampInterstitial, normalizeFeatures } = require('../core/config');

const histOf = (values) => {
  const h = S.newHist();
  values.forEach((v) => h[v]++);
  return h;
};

test('AC1: card score vectors', () => {
  const vec = [[0, 100], [0.5, 98], [1, 97], [2, 95], [2.5, 93], [10, 75], [20, 50], [39.5, 1], [40, 0], [73, 0]];
  vec.forEach(([d, s]) => assert.equal(S.cardScore(d), s, 'd=' + d));
  assert.equal(S.scoreAt(30, 40), 75);
});

test('AC1: label boundaries', () => {
  const vec = [[0, '心有灵犀'], [2, '心有灵犀'], [2.5, '很同频'], [6, '很同频'], [6.5, '差不多'], [12, '差不多'], [12.5, '有点偏'], [20, '有点偏'], [20.5, '想法独特'], [60, '想法独特']];
  vec.forEach(([d, l]) => assert.equal(S.labelFor(d).label, l, 'd=' + d));
});

test('AC2: medians follow 3.2 for odd/even counts and extremes (list and histogram agree)', () => {
  const cases = [[[40]], [[10, 20]], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]], [[50, 50, 50, 50]], [[0, 0, 0]], [[100, 100]], [[0, 100]], [[0, 0, 100, 100]]];
  cases.forEach(([vals]) => {
    const exp = S.medianOf(vals);
    assert.equal(S.medianFromHist(histOf(vals)), exp, JSON.stringify(vals));
  });
  assert.equal(S.medianOf([10, 20]), 15);
  assert.equal(S.medianOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 6);
  assert.equal(S.medianOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 6.5);
  assert.equal(S.medianOf([]), null);
  assert.equal(S.medianFromHist(S.newHist()), null);
});

test('AC2: histogram median equals list median on random data', () => {
  const rng = sub('t', 'med');
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(rng() * 40);
    const vals = Array.from({ length: n }, () => Math.floor(rng() * 101));
    assert.equal(S.medianFromHist(histOf(vals)), S.medianOf(vals));
  }
});

test('AC3: the national reference with the W = 10 prior', () => {
  assert.equal(S.nationalRef(S.newHist(), 70), 70);
  assert.equal(S.nationalRef(histOf([0]), 60), 60);
  const h = S.newHist();
  h[30] = 1000;
  assert.equal(S.nationalRef(h, 90), 30);
});

test('AC4: day total and band boundaries', () => {
  assert.equal(S.dayTotal([10, 20, 30, 40, 50], [10, 20, 30, 40, 50]), 500);
  assert.equal(S.dayTotal([0, 0, 0, 0, 0], [100, 100, 100, 100, 100]), 0);
  assert.equal(S.dayTotal([10, null, 30, null, 50], [10, 99, 30, 99, 50]), 300);
  const b = [[500, '灵魂同频'], [450, '灵魂同频'], [449, '默契十足'], [380, '默契十足'], [379, '大体同频'], [300, '大体同频'], [299, '各有想法'], [200, '各有想法'], [199, '独树一帜'], [0, '独树一帜']];
  b.forEach(([t, l]) => assert.equal(S.bandFor(t).label, l, 't=' + t));
});

test('AC5: group leave-one-out reference, MAD and 群默契度', () => {
  assert.equal(S.looRef([10, 20, 90], 0), 55);
  const cards = [[10, 20, 90], [50, 50, 50], [0, 10, 20], [40, 60, 80], [30, 30, 30]];
  // card MADs: [10,20,90] med 20 -> (10+0+70)/3 = 26.667 -> ceil(66.67)=67 -> 33 ; all-equal 0 -> 100 ; [0,10,20] -> 6.667 -> ceil(16.67)=17 -> 83 ; [40,60,80] -> 13.333 -> ceil(33.3)=34 -> 66 ; 100
  assert.equal(S.groupMq(cards), Math.round((33 + 100 + 83 + 66 + 100) / 5));
  assert.equal(S.groupMq([[10, 20], [10, 20], [10, 20], [10, 20], [10, 20]]), null);
  assert.equal(S.groupMq(cards.map((c) => c.concat([15]))) !== null, true);
  assert.equal(S.groupScore([[10, 20]], 0), S.cardScore(10));
  assert.equal(S.groupScore([[10], [10], [10], [10], [10]], 0), null);
  // member 0 of the card above scores against 55
  assert.equal(S.groupScore([[10, 20, 90], [10, 20, 90], [10, 20, 90], [10, 20, 90], [10, 20, 90]], 0), 5 * S.cardScore(45));
  assert.equal(S.groupMedian([]), null);
  assert.equal(S.groupMedian([10, 30]), 20);
});

test('AC6: round 默契值 and 最懂你', () => {
  const g = [{ pos: 50, ts: 1 }, { pos: 60, ts: 2 }, { pos: 90, ts: 3, late: true }];
  assert.equal(S.roundMq(g, 55), Math.round((S.cardScore(5) + S.cardScore(5)) / 2));
  assert.equal(S.roundMq([{ pos: 1, late: true }], 5), null);
  // tie on distance: 50 and 60 are both 5 from 55; the earlier guess wins
  assert.equal(S.bestGuess(g, 55).pos, 50);
  assert.equal(S.bestGuess([{ pos: 60, ts: 9 }, { pos: 50, ts: 3 }], 55).pos, 50);
  assert.equal(S.bestGuess([{ pos: 55, ts: 9, late: true }], 55), null);
});

test('最同频: smallest mean gap, ties to the earlier completion', () => {
  const v = [10, 20, 30, 40, 50];
  const r = S.closestMate(v, [{ id: 'a', pos: [10, 20, 30, 40, 60], t: 5 }, { id: 'b', pos: [12, 22, 32, 42, 52], t: 9 }, { id: 'c', pos: [8, 18, 28, 38, 48], t: 3 }]);
  assert.equal(r.id, 'c');
  assert.equal(r.gapText, 2);
  assert.equal(S.closestMate(v, []), null);
});

test('agree percentage, MAD, divisive card, histogram bins, percentile', () => {
  const h = histOf(Array.from({ length: 40 }, (_, i) => i));
  assert.equal(S.agreePct(h, 5), Math.round((100 * 16) / 40));
  assert.equal(S.agreePct(histOf([1, 2, 3]), 2), null);
  assert.equal(S.madFromHist(histOf([10, 30]), 20), 10);
  const a = histOf([10, 10, 10]);
  const b = histOf([0, 100]);
  assert.equal(S.divisiveIdx([a, b, a, a, a], [10, 50, 10, 10, 10]), 1);
  assert.equal(S.divisiveIdx([a, a, a, a, a], [10, 10, 10, 10, 10]), 0, 'ties go to the lower index');
  const bins = S.histBins21(histOf([0, 4, 5, 99, 100]));
  assert.equal(bins[0], 2);
  assert.equal(bins[1], 1);
  assert.equal(bins[19], 1);
  assert.equal(bins[20], 1);
  const fh = S.newHist();
  fh[S.totalBin(300)] = 40;
  fh[S.totalBin(400)] = 60;
  assert.equal(S.percentile(fh, 400, 100), 40);
  assert.equal(S.percentile(fh, 400, 10), null);
});

test('config clamps remote interstitial caps (spec 9)', () => {
  const c = clampInterstitial({ everyNSets: 1, minLifetimeSets: 0, minGapSec: 5, maxPerDay: 99 });
  assert.deepEqual(c, { enabled: true, everyNSets: 2, minLifetimeSets: 2, minGapSec: 60, maxPerDay: 8 });
  const f = normalizeFeatures({ subscribe: { tmplId: 'T1' }, banner: { enabled: true } });
  assert.equal(f.subscribe.tmplId, 'T1');
  assert.equal(f.banner.enabled, false, 'no ad unit id means off');
  assert.equal(normalizeFeatures(null).subscribe, null);
});

test('AC22: Beijing date key is right at 15:59:59 and 16:00:00 UTC whatever TZ is', () => {
  const t = Date.UTC(2026, 10, 20, 15, 59, 59);
  assert.equal(beijingDateKey(t), '20261120');
  assert.equal(beijingDateKey(t + 1000), '20261121');
  assert.equal(addDays('20261231', 1), '20270101');
  assert.equal(issueNo('20261103', '20261101'), 3);
  assert.equal(secondsSinceBeijingMidnight(beijingMidnightMs(t) + 90 * 1000), 90);
  assert.equal(dateKeyToMs('20261121') - dateKeyToMs('20261120'), 86400e3);
});
