const test = require('node:test');
const assert = require('node:assert');

const H = require('../core/hands');
const { seededRng } = require('../core/rng');

test('counts tallies every face', () => {
  assert.deepStrictEqual(H.counts([1, 1, 5, 5, 5]), [0, 2, 0, 0, 0, 3, 0]);
});

test('effectiveCount adds wilds to a normal face', () => {
  // three 5s: two literal plus one wild
  assert.strictEqual(H.effectiveCount([5, 5, 1, 2, 3], 5), 3);
});

test('effectiveCount does not double-count wilds for face 1', () => {
  // two 1s is two 1s, not four
  assert.strictEqual(H.effectiveCount([1, 1, 2, 3, 4], 1), 2);
});

test('G1 detects three of a kind', () => {
  assert.ok(H.hasThreeOfAKind([4, 4, 4, 2, 6]));
  assert.ok(!H.hasThreeOfAKind([4, 4, 3, 2, 6]));
});

test('G2 detects four effective via wilds', () => {
  assert.ok(H.hasFourEffective([5, 5, 1, 1, 3])); // four 5s
  assert.ok(!H.hasFourEffective([5, 5, 1, 3, 4])); // only three
});

test('G2 ignores face 1 as the counted face', () => {
  // four 1s would be "four 1s", but G2 only considers faces != 1.
  // Here every non-1 face reads as 4 via the wilds, so it is still true.
  assert.ok(H.hasFourEffective([1, 1, 1, 1, 3]));
});

test('hasNoOnes detects a hand with no wilds', () => {
  assert.ok(H.hasNoOnes([2, 3, 4, 5, 6]));
  assert.ok(!H.hasNoOnes([1, 3, 4, 5, 6]));
});

test('G3 needs no wilds and at most three distinct faces', () => {
  assert.ok(H.hasFewFacesNoOnes([2, 2, 5, 5, 6]));
  assert.ok(H.hasFewFacesNoOnes([3, 3, 3, 3, 3]));
  assert.ok(!H.hasFewFacesNoOnes([2, 3, 4, 6, 6])); // four faces
  assert.ok(!H.hasFewFacesNoOnes([1, 2, 2, 5, 5])); // has a 1
});

test('isGoodHand is the union of the three rules', () => {
  assert.ok(H.isGoodHand([2, 2, 5, 5, 6])); // G3 only
  assert.ok(!H.isGoodHand([2, 3, 4, 5, 6])); // no 1s but five faces: not good
  assert.ok(H.isGoodHand([4, 4, 4, 1, 2])); // G1 and G2
  // A hand that fails all three: has a 1, no triple, nothing reaching four.
  assert.ok(!H.isGoodHand([1, 2, 3, 4, 5]));
});

test('rollFair produces DICE_COUNT dice in range', () => {
  const rng = seededRng(42);
  for (let i = 0; i < 500; i++) {
    const hand = H.rollFair(rng);
    assert.strictEqual(hand.length, 5);
    for (const d of hand) assert.ok(d >= 1 && d <= 6, 'die out of range: ' + d);
  }
});

test('rollFair is unbiased across faces', () => {
  const rng = seededRng(7);
  const c = [0, 0, 0, 0, 0, 0, 0];
  const N = 60000;
  for (let i = 0; i < N; i++) for (const d of H.rollFair(rng)) c[d]++;
  const expected = (N * 5) / 6;
  for (let f = 1; f <= 6; f++) {
    const drift = Math.abs(c[f] - expected) / expected;
    assert.ok(drift < 0.03, `face ${f} drifted ${(drift * 100).toFixed(1)}%`);
  }
});
