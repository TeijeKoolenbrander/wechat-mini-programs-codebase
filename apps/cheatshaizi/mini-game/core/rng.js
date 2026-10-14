/**
 * Random number generation.
 *
 * Every generator in core/ takes an `rng` argument — a zero-arg function
 * returning a float in [0, 1). That makes every roll reproducible in tests:
 * pass a seeded generator and the same hand comes out every time.
 */

/** Production RNG. */
function fairRng() {
  return Math.random();
}

/**
 * Deterministic RNG (mulberry32). Same seed, same sequence, forever.
 * Used by the test suite so a failing hand can be reproduced exactly.
 */
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, maxExclusive). */
function int(rng, maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

/** Integer in [min, max], both inclusive. */
function intBetween(rng, min, max) {
  return min + int(rng, max - min + 1);
}

/** A uniformly random element of `arr`. */
function pick(rng, arr) {
  return arr[int(rng, arr.length)];
}

/** True with probability `p`. */
function chance(rng, p) {
  return rng() < p;
}

/** Number of successes in `n` trials of probability `p`. */
function binomial(rng, n, p) {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
}

/** Fisher-Yates, in place. Returns the same array for chaining. */
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

module.exports = { fairRng, seededRng, int, intBetween, pick, chance, binomial, shuffle };
