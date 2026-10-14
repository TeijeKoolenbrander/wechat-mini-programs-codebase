const test = require('node:test');
const assert = require('node:assert');

const C = require('../core/config');
const { applyControlled, zoneToQuantity, zoneToFace } = require('../core/controlled');
const { effectiveCount, countOf } = require('../core/hands');
const { seededRng } = require('../core/rng');

test('zone 0..5 maps to quantity 1..5 then 0 (bottom-right)', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map(zoneToQuantity), [1, 2, 3, 4, 5, 0]);
});

test('zone 0..5 maps to face 1..6', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map(zoneToFace), [1, 2, 3, 4, 5, 6]);
});

test('every quantity and face produces exactly that effective count', () => {
  const rng = seededRng(1);
  for (let qty = 0; qty <= 5; qty++) {
    for (let face = 1; face <= 6; face++) {
      for (let i = 0; i < 200; i++) {
        const hand = applyControlled(rng, qty, face);
        assert.strictEqual(hand.length, 5);
        assert.strictEqual(
          effectiveCount(hand, face),
          qty,
          `qty=${qty} face=${face} gave ${hand}`
        );
      }
    }
  }
});

test('filler dice are never the chosen face and never wild', () => {
  const rng = seededRng(2);
  for (let i = 0; i < 400; i++) {
    const hand = applyControlled(rng, 3, 5);
    // exactly three dice account for the count; the other two are fillers
    assert.strictEqual(countOf(hand, 5) + countOf(hand, 1), 3);
    const fillers = hand.filter((d) => d !== 5 && d !== 1);
    assert.strictEqual(fillers.length, 2);
    for (const f of fillers) assert.ok([2, 3, 4, 6].includes(f));
  }
});

test('quantity 0 removes the face and all wilds entirely', () => {
  const rng = seededRng(3);
  for (let i = 0; i < 300; i++) {
    const hand = applyControlled(rng, 0, 5);
    assert.strictEqual(countOf(hand, 5), 0);
    assert.strictEqual(countOf(hand, 1), 0);
  }
});

test('asking for 1s gives literal 1s, never a split', () => {
  const rng = seededRng(4);
  for (let qty = 1; qty <= 5; qty++) {
    const hand = applyControlled(rng, qty, 1);
    assert.strictEqual(countOf(hand, 1), qty);
  }
});

test('quantity 5 fills the whole hand', () => {
  const rng = seededRng(5);
  const hand = applyControlled(rng, 5, 6);
  assert.strictEqual(effectiveCount(hand, 6), 5);
  for (const d of hand) assert.ok(d === 6 || d === 1);
});

/** Run `fn` with CONTROLLED_SPLIT temporarily set to `mode`. */
function withSplit(mode, fn) {
  const prev = C.CONTROLLED_SPLIT;
  C.CONTROLLED_SPLIT = mode;
  try {
    fn();
  } finally {
    C.CONTROLLED_SPLIT = prev;
  }
}

test('binomial is the default split', () => {
  assert.strictEqual(C.CONTROLLED_SPLIT, 'binomial');
});

test('binomial: ones for qty 5 follow Binomial(5, CONTROLLED_WILD_P)', () => {
  const rng = seededRng(6);
  const N = 40000;
  const tally = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) tally[countOf(applyControlled(rng, 5, 4), 1)]++;
  const p = C.CONTROLLED_WILD_P;
  const choose = [1, 5, 10, 10, 5, 1];
  for (let k = 0; k <= 5; k++) {
    const expected = choose[k] * p ** k * (1 - p) ** (5 - k);
    const actual = tally[k] / N;
    assert.ok(
      Math.abs(actual - expected) < 0.015,
      `${k} ones: ${actual.toFixed(3)} vs ${expected.toFixed(3)}`
    );
  }
});

test('binomial: 2 or 3 ones is common, 0 or 5 is rare', () => {
  const rng = seededRng(7);
  const N = 20000;
  const tally = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) tally[countOf(applyControlled(rng, 5, 6), 1)]++;
  assert.ok((tally[2] + tally[3]) / N > 0.55, 'middle not dominant');
  assert.ok((tally[0] + tally[5]) / N < 0.1, 'extremes too common');
  assert.ok(tally[0] > 0 && tally[5] > 0, 'extremes should stay possible');
});

test('weighted shows a clean run of one face at the configured rate', () => {
  withSplit('weighted', () => {
    const rng = seededRng(16);
    const N = 40000;
    let clean = 0;
    for (let i = 0; i < N; i++) {
      if (countOf(applyControlled(rng, 3, 4), 1) === 0) clean++;
    }
    const actual = clean / N;
    assert.ok(
      Math.abs(actual - C.CONTROLLED_ALL_FACE_CHANCE) < 0.02,
      `all-face rate ${actual.toFixed(3)} vs ${C.CONTROLLED_ALL_FACE_CHANCE}`
    );
  });
});

test('default split never exceeds the chosen count in wilds', () => {
  const rng = seededRng(17);
  for (let qty = 1; qty <= 5; qty++) {
    for (let i = 0; i < 500; i++) {
      const hand = applyControlled(rng, qty, 3);
      assert.ok(countOf(hand, 1) <= qty, `qty=${qty} gave ${hand}`);
      assert.strictEqual(countOf(hand, 3) + countOf(hand, 1), qty);
    }
  }
});

test('uniform split never uses a wild', () => {
  withSplit('uniform', () => {
    const rng = seededRng(18);
    for (let qty = 1; qty <= 5; qty++) {
      for (let i = 0; i < 100; i++) {
        const hand = applyControlled(rng, qty, 4);
        assert.strictEqual(countOf(hand, 1), 0);
        assert.strictEqual(countOf(hand, 4), qty);
      }
    }
  });
});

test('oneWild split uses exactly one wild when qty >= 2, none at qty 1', () => {
  withSplit('oneWild', () => {
    const rng = seededRng(19);
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(countOf(applyControlled(rng, 1, 4), 1), 0);
    }
    for (let qty = 2; qty <= 5; qty++) {
      for (let i = 0; i < 100; i++) {
        const hand = applyControlled(rng, qty, 4);
        assert.strictEqual(countOf(hand, 1), 1, `qty=${qty} gave ${hand}`);
        assert.strictEqual(countOf(hand, 4), qty - 1);
      }
    }
  });
});

test('the split argument overrides CONTROLLED_SPLIT for one hand', () => {
  assert.strictEqual(C.CONTROLLED_SPLIT, 'binomial', 'default changed');
  const rng = seededRng(21);
  // This is what the no-wilds toggle passes: ask for four 3s, get four 3s.
  for (let i = 0; i < 500; i++) {
    const hand = applyControlled(rng, 4, 3, 'uniform');
    assert.strictEqual(countOf(hand, 3), 4, `got ${hand}`);
    assert.strictEqual(countOf(hand, 1), 0, `wild leaked into ${hand}`);
  }
  // Omitting it falls back to the configured split, which does use wilds.
  let sawWild = false;
  for (let i = 0; i < 500; i++) {
    if (countOf(applyControlled(rng, 4, 3), 1) > 0) sawWild = true;
  }
  assert.ok(sawWild, 'override leaked into the default path');
});

test('no-wilds override still gives literal 1s when 1 is the face asked for', () => {
  const rng = seededRng(22);
  const hand = applyControlled(rng, 3, 1, 'uniform');
  assert.strictEqual(countOf(hand, 1), 3, `got ${hand}`);
});

test('every split keeps the effective count exact', () => {
  for (const mode of ['binomial', 'weighted', 'oneWild', 'uniform', 'random']) {
    withSplit(mode, () => {
      const rng = seededRng(20);
      for (let qty = 0; qty <= 5; qty++) {
        for (let face = 1; face <= 6; face++) {
          for (let i = 0; i < 50; i++) {
            const hand = applyControlled(rng, qty, face);
            assert.strictEqual(
              effectiveCount(hand, face),
              qty,
              `${mode} qty=${qty} face=${face} gave ${hand}`
            );
          }
        }
      }
    });
  }
});

test('out-of-range input throws rather than silently misbehaving', () => {
  const rng = seededRng(9);
  assert.throws(() => applyControlled(rng, 6, 3), RangeError);
  assert.throws(() => applyControlled(rng, -1, 3), RangeError);
  assert.throws(() => applyControlled(rng, 3, 0), RangeError);
  assert.throws(() => applyControlled(rng, 3, 7), RangeError);
});

test('dice order is shuffled, not grouped', () => {
  const rng = seededRng(10);
  let sorted = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const hand = applyControlled(rng, 3, 6);
    // the counted dice should not always land in the first three slots
    if (hand[0] === 6 && hand[1] === 6) sorted++;
  }
  assert.ok(sorted < N * 0.6, 'hands look grouped rather than shuffled');
});
