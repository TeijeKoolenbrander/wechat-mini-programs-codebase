/**
 * Lucky mode: weighted toward good hands, but bad hands still happen.
 *
 * With probability LUCKY_GOOD_CHANCE, return a hand satisfying isGoodHand().
 * Otherwise return a genuinely fair hand, which may be bad.
 *
 * Good hands are found by rejection sampling rather than construction, so the
 * distribution *within* the good subset stays natural — you get the full
 * variety of good hands at their real relative frequencies, not the same
 * three shapes over and over.
 */

const C = require('./config');
const { chance, pick, int } = require('./rng');
const { rollFair, isGoodHand } = require('./hands');

/**
 * Guaranteed-good fallback, used only if rejection sampling somehow exhausts
 * its budget (possible only if every good rule is disabled). Builds a plain
 * three-of-a-kind.
 */
function constructGoodHand(rng) {
  const face = pick(rng, C.FACES);
  const hand = [face, face, face];
  while (hand.length < C.DICE_COUNT) hand.push(1 + int(rng, 6));
  return hand;
}

function rollLucky(rng) {
  if (!chance(rng, C.LUCKY_GOOD_CHANCE)) return rollFair(rng);

  for (let i = 0; i < C.MAX_REJECTION_TRIES; i++) {
    const hand = rollFair(rng);
    if (isGoodHand(hand)) return hand;
  }
  return constructGoodHand(rng);
}

module.exports = { rollLucky, constructGoodHand };
