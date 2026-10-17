'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');

test('AC 1: card score vectors (spec 3.1)', () => {
  const v = [[0, 100], [0.5, 98], [1, 97], [2, 95], [2.5, 93], [10, 75], [20, 50], [39.5, 1], [40, 0], [73, 0]];
  v.forEach(([d, s]) => assert.equal(S.cardScore(d), s, 'd=' + d));
});

test('AC 1: label boundaries', () => {
  const v = [[0, '心有灵犀'], [2, '心有灵犀'], [2.5, '很同频'], [6, '很同频'], [6.5, '差不多'], [12, '差不多'], [12.5, '有点偏'], [20, '有点偏'], [20.5, '想法独特'], [100, '想法独特']];
  v.forEach(([d, l]) => assert.equal(S.cardLabel(d), l, 'd=' + d));
  assert.deepEqual(S.scoreAt(40, 50), { d: 10, score: 75, label: '差不多' });
});

test('AC 1: score is symmetric, monotone and within 0..100 over all (p, ref) pairs', () => {
  for (let p = 0; p <= 100; p += 5) {
    for (let r = 0; r <= 100; r += 2.5) {
      const s = S.scoreAt(p, r).score;
      assert.ok(s >= 0 && s <= 100 && Number.isInteger(s));
      assert.equal(s, S.scoreAt(r, p).score);
    }
  }
});

test('AC 2: histogram median for odd and even counts (spec 3.2)', () => {
  const h = (vals) => {
    const x = S.emptyHist();
    vals.forEach((v) => x[v]++);
    return x;
  };
  assert.equal(S.histMedian(S.emptyHist()), null);
  assert.equal(S.histMedian(h([40])), 40); // M = 1
  assert.equal(S.histMedian(h([10, 21])), 15.5); // M = 2
  assert.equal(S.histMedian(h([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), 6); // M = 11
  assert.equal(S.histMedian(h([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), 6.5); // M = 12
  assert.equal(S.histMedian(h([30, 30, 30, 30])), 30); // all equal
  assert.equal(S.histMedian(h([0, 0, 0])), 0);
  assert.equal(S.histMedian(h([100, 100])), 100);
  assert.equal(S.histMedian(h([0, 100])), 50);
});

test('AC 2: histogram median equals the list median on random data', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 300; t++) {
    const m = 1 + Math.floor(rnd() * 40);
    const vals = [];
    const hist = S.emptyHist();
    for (let i = 0; i < m; i++) {
      const v = Math.floor(rnd() * 101);
      vals.push(v);
      hist[v]++;
    }
    assert.equal(S.histMedian(hist), S.medianOf(vals));
  }
});

test('AC 3: national reference with the 10-vote prior (PD-4)', () => {
  assert.equal(S.nationRef(S.emptyHist(), 60), 60); // no real positions -> the anchor
  const one = S.emptyHist();
  one[0] = 1;
  assert.equal(S.nationRef(one, 60), 60); // 1 real at 0, anchor 60
  const crowd = S.emptyHist();
  crowd[30] = 1000;
  assert.equal(S.nationRef(crowd, 90), 30); // 1,000 real at 30, anchor 90
  assert.equal(crowd[90], 0, 'does not mutate the histogram');
});

test('AC 3: the prior stops a small sample from dragging the median far', () => {
  const h = S.emptyHist();
  h[0] = 5; // five real answers at the far left, ten virtual votes at 80
  assert.equal(S.nationRef(h, 80), 80);
  h[0] = 20; // now the crowd outweighs the prior
  assert.equal(S.nationRef(h, 80), 0);
});

test('AC 4: daily total, partial totals and band boundaries (spec 3.3)', () => {
  const t = S.dailyTotal([50, 50, 50, 50, 50], [50, 50, 50, 50, 50]);
  assert.deepEqual([t.total, t.answered, t.complete], [500, 5, true]);
  assert.equal(S.dailyTotal([0, 0, 0, 0, 0], [100, 100, 100, 100, 100]).total, 0);
  const partial = S.dailyTotal([50, 60, null, null, null], [50, 50, 50, 50, 50]);
  assert.deepEqual([partial.total, partial.answered, partial.complete], [175, 2, false]);
  assert.deepEqual(partial.scores, [100, 75, null, null, null]);
  const bands = [[500, '灵魂同频'], [450, '灵魂同频'], [449, '默契十足'], [380, '默契十足'], [379, '大体同频'], [300, '大体同频'], [299, '各有想法'], [200, '各有想法'], [199, '独树一帜'], [0, '独树一帜']];
  bands.forEach(([n, l]) => assert.equal(S.dayBand(n), l, String(n)));
});

test('agreement percentage: within +-10, hidden below 30 answers (spec 3.3)', () => {
  const h = S.emptyHist();
  h[50] = 20;
  assert.equal(S.agreePct(h, 50), null, '20 answers: hidden');
  h[50] = 30;
  assert.equal(S.agreePct(h, 50), 100);
  h[70] = 30; // exactly 20 away: outside +-10
  assert.equal(S.agreePct(h, 50), 50);
  h[60] = 30;
  assert.equal(S.agreePct(h, 50), 67); // 60 of 90
  assert.equal(S.agreePct(h, 0), 0);
});

test('21-bin distribution is centred and symmetric (both ends half width)', () => {
  const h = S.emptyHist();
  for (let v = 0; v <= 100; v++) h[v] = 1;
  const d = S.distribution21(h);
  assert.equal(d.length, 21);
  assert.equal(d[0], 3); // 0..2
  assert.equal(d[20], 3); // 98..100
  assert.equal(d[10], 5); // 48..52
  assert.equal(d.reduce((a, b) => a + b, 0), 101);
  assert.equal(S.bin21(0), 0);
  assert.equal(S.bin21(100), 20);
  assert.equal(S.bin21(50), 10);
});

test('most divisive card: highest national MAD, ties to the lower index (spec 3.3)', () => {
  const mk = (vals) => {
    const x = S.emptyHist();
    vals.forEach((v) => x[v]++);
    return x;
  };
  const hists = [mk([50, 50, 50]), mk([10, 90, 10, 90]), mk([40, 60, 40, 60]), mk([10, 90, 10, 90]), mk([50])];
  const refs = [50, 50, 50, 50, 50];
  assert.equal(S.mostDivisive(hists, refs), 1); // cards 1 and 3 tie at MAD 40 -> lower index
  assert.equal(S.mostDivisive([S.emptyHist(), S.emptyHist(), S.emptyHist(), S.emptyHist(), S.emptyHist()], refs), null);
});

test('percentile: strictly lower 5-point bins, rounded down, hidden below 30 (spec 3.3, TD-2)', () => {
  const totals = [];
  for (let i = 0; i < 40; i++) totals.push(100 + i * 10); // 40 dailies 100..490
  const hist = S.buildFinalHist(totals);
  assert.equal(hist.length, 101);
  assert.equal(S.totalBin(500), 100);
  assert.equal(S.percentile(300, hist, 40), Math.floor((100 * 20) / 40)); // 20 totals in lower bins
  assert.equal(S.percentile(100, hist, 40), 0);
  assert.equal(S.percentile(500, hist, 40), 100);
  assert.equal(S.percentile(300, hist, 29), null);
  assert.equal(S.percentile(300, null, 40), null);
});

test('freezeRefs freezes all five references from histograms and anchors', () => {
  const hists = [0, 1, 2, 3, 4].map(() => S.emptyHist());
  hists[2][70] = 100;
  assert.deepEqual(S.freezeRefs(hists, [10, 20, 30, 40, 50]), [10, 20, 70, 40, 50]);
});
