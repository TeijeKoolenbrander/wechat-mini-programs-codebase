/**
 * Hand inspection and the "good hand" predicate.
 *
 * A hand is an array of DICE_COUNT integers, each 1..6.
 * 1s are wild (飞), so a hand's strength for face X is count(X) + count(1).
 */

const C = require('./config');
const { int } = require('./rng');

/** Tally of each face. Returns an array indexed 1..6 (index 0 unused). */
function counts(hand) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < hand.length; i++) out[hand[i]]++;
  return out;
}

function countOf(hand, face) {
  let n = 0;
  for (let i = 0; i < hand.length; i++) if (hand[i] === face) n++;
  return n;
}

/**
 * How many dice this hand reads as, for `face`, counting wilds.
 * For face 1 the wilds *are* the face, so they are not double-counted.
 */
function effectiveCount(hand, face) {
  if (face === C.WILD) return countOf(hand, C.WILD);
  return countOf(hand, face) + countOf(hand, C.WILD);
}

/** The best effective count across all six faces. */
function bestEffective(hand) {
  let best = 0;
  for (const face of C.FACES) {
    const n = effectiveCount(hand, face);
    if (n > best) best = n;
  }
  return best;
}

/** G1 — three or more dice share the same face. */
function hasThreeOfAKind(hand) {
  const c = counts(hand);
  for (let f = 1; f <= 6; f++) if (c[f] >= 3) return true;
  return false;
}

/** G2 — for some face X != 1, count(X) + count(1) >= 4. */
function hasFourEffective(hand) {
  for (const face of C.FACES) {
    if (face === C.WILD) continue;
    if (effectiveCount(hand, face) >= 4) return true;
  }
  return false;
}

/** The hand contains no 1s at all. */
function hasNoOnes(hand) {
  return countOf(hand, C.WILD) === 0;
}

/** G3 — no 1s at all, and at most 3 distinct faces. */
function hasFewFacesNoOnes(hand) {
  if (!hasNoOnes(hand)) return false;
  return new Set(hand).size <= 3;
}

/**
 * Which of the three good-hand rules this hand satisfies.
 * Returned separately so the test suite can report per-rule hit rates.
 */
function goodRules(hand) {
  return {
    g1: C.GOOD_RULE_G1_ENABLED && hasThreeOfAKind(hand),
    g2: C.GOOD_RULE_G2_ENABLED && hasFourEffective(hand),
    g3: C.GOOD_RULE_G3_ENABLED && hasFewFacesNoOnes(hand),
  };
}

function isGoodHand(hand) {
  const r = goodRules(hand);
  return r.g1 || r.g2 || r.g3;
}

/** An unbiased roll of DICE_COUNT dice. */
function rollFair(rng) {
  const hand = [];
  for (let i = 0; i < C.DICE_COUNT; i++) hand.push(1 + int(rng, 6));
  return hand;
}

module.exports = {
  counts,
  countOf,
  effectiveCount,
  bestEffective,
  hasThreeOfAKind,
  hasFourEffective,
  hasNoOnes,
  hasFewFacesNoOnes,
  goodRules,
  isGoodHand,
  rollFair,
};
