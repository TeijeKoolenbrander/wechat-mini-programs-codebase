const test = require('node:test');
const assert = require('node:assert');

const C = require('../core/config');
const { rollLucky } = require('../core/lucky');
const { rollFair, isGoodHand, goodRules } = require('../core/hands');
const { seededRng } = require('../core/rng');

const N = 40000;

/** Measure how often a genuinely fair hand is already "good". */
function fairGoodRate(rng, n) {
  let good = 0;
  for (let i = 0; i < n; i++) if (isGoodHand(rollFair(rng))) good++;
  return good / n;
}

test('lucky hands are always 5 dice in range', () => {
  const rng = seededRng(11);
  for (let i = 0; i < 2000; i++) {
    const hand = rollLucky(rng);
    assert.strictEqual(hand.length, 5);
    for (const d of hand) assert.ok(d >= 1 && d <= 6);
  }
});

test('good-hand rate matches the configured odds', () => {
  const baseline = fairGoodRate(seededRng(12), N);

  const rng = seededRng(13);
  let good = 0;
  for (let i = 0; i < N; i++) if (isGoodHand(rollLucky(rng))) good++;
  const actual = good / N;

  // Forced good, plus whatever the fair remainder happens to produce.
  const expected =
    C.LUCKY_GOOD_CHANCE + (1 - C.LUCKY_GOOD_CHANCE) * baseline;

  assert.ok(
    Math.abs(actual - expected) < 0.02,
    `good rate ${actual.toFixed(3)} vs expected ${expected.toFixed(3)} ` +
      `(fair baseline ${baseline.toFixed(3)})`
  );
});

test('bad hands still happen — the whole point of lucky vs insane', () => {
  const rng = seededRng(14);
  let bad = 0;
  for (let i = 0; i < N; i++) if (!isGoodHand(rollLucky(rng))) bad++;
  const rate = bad / N;

  assert.ok(rate > 0.01, `never rolls badly (${rate}) — looks rigged`);
  assert.ok(rate < 0.15, `rolls badly too often (${rate})`);
});

test('all three good rules actually fire in practice', () => {
  const rng = seededRng(15);
  const hits = { g1: 0, g2: 0, g3: 0 };
  for (let i = 0; i < N; i++) {
    const r = goodRules(rollLucky(rng));
    if (r.g1) hits.g1++;
    if (r.g2) hits.g2++;
    if (r.g3) hits.g3++;
  }
  for (const k of ['g1', 'g2', 'g3']) {
    assert.ok(hits[k] > N * 0.02, `rule ${k} almost never fires (${hits[k]})`);
  }
});

test('output is not collapsed onto a few repeated hands', () => {
  const rng = seededRng(16);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(rollLucky(rng).join(''));
  // Rejection sampling should preserve plenty of variety.
  assert.ok(seen.size > 1000, `only ${seen.size} distinct hands`);
});
