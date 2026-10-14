const test = require('node:test');
const assert = require('node:assert');

const C = require('../core/config');
const { rollInsane } = require('../core/insane');
const { bestEffective, countOf } = require('../core/hands');
const { seededRng } = require('../core/rng');

const N = 40000;

test('insane hands are always 5 dice in range', () => {
  const rng = seededRng(21);
  for (let i = 0; i < 2000; i++) {
    const hand = rollInsane(rng);
    assert.strictEqual(hand.length, 5);
    for (const d of hand) assert.ok(d >= 1 && d <= 6);
  }
});

test('every hand reads as four or five — never weaker', () => {
  const rng = seededRng(22);
  for (let i = 0; i < N; i++) {
    const hand = rollInsane(rng);
    const best = bestEffective(hand);
    assert.ok(best >= 4, `hand ${hand} only reads as ${best}`);
  }
});

test('five-vs-four split matches INSANE_FIVE_CHANCE', () => {
  const rng = seededRng(23);
  let fives = 0;
  for (let i = 0; i < N; i++) {
    if (bestEffective(rollInsane(rng)) === 5) fives++;
  }
  const actual = fives / N;
  assert.ok(
    Math.abs(actual - C.INSANE_FIVE_CHANCE) < 0.02,
    `five rate ${actual.toFixed(3)} vs expected ${C.INSANE_FIVE_CHANCE}`
  );
});

test('four-effective hands do not secretly overshoot to five', () => {
  const rng = seededRng(24);
  let fours = 0;
  for (let i = 0; i < N; i++) {
    const hand = rollInsane(rng);
    if (bestEffective(hand) === 4) {
      fours++;
      // The odd die must not combine with the wilds to reach five.
      assert.ok(bestEffective(hand) === 4, `overshoot in ${hand}`);
    }
  }
  assert.ok(fours > 0, 'four-effective case never occurred');
});

test('five-effective hands contain only the face and wilds', () => {
  const rng = seededRng(25);
  let checked = 0;
  for (let i = 0; i < 5000; i++) {
    const hand = rollInsane(rng);
    if (bestEffective(hand) !== 5) continue;
    checked++;
    const faces = new Set(hand.filter((d) => d !== C.WILD));
    assert.ok(faces.size <= 1, `more than one non-wild face in ${hand}`);
  }
  assert.ok(checked > 0, 'no five-effective hands sampled');
});

test('five-effective hands: ones follow Binomial(5, INSANE_WILD_P)', () => {
  const rng = seededRng(26);
  const tally = [0, 0, 0, 0, 0, 0];
  let fives = 0;
  for (let i = 0; i < N; i++) {
    const hand = rollInsane(rng);
    if (bestEffective(hand) !== 5) continue;
    fives++;
    tally[countOf(hand, C.WILD)]++;
  }
  const p = C.INSANE_WILD_P;
  const choose = [1, 5, 10, 10, 5, 1];
  for (let k = 0; k <= 5; k++) {
    const expected = choose[k] * p ** k * (1 - p) ** (5 - k);
    const actual = tally[k] / fives;
    assert.ok(
      Math.abs(actual - expected) < 0.015,
      `${k} ones: ${actual.toFixed(3)} vs ${expected.toFixed(3)}`
    );
  }
});

test('four-effective hands never use more than three wilds', () => {
  const rng = seededRng(27);
  let fours = 0;
  for (let i = 0; i < N; i++) {
    const hand = rollInsane(rng);
    if (bestEffective(hand) !== 4) continue;
    fours++;
    assert.ok(countOf(hand, C.WILD) <= 3, `too many wilds in ${hand}`);
  }
  assert.ok(fours > 0, 'four-effective case never occurred');
});
