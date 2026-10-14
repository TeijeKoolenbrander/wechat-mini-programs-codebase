/**
 * Insane mode (SPEC 2.2).
 *
 * 80% — every die is either the chosen face or a wild, so the hand reads as
 *       five of that face.
 * 20% — the hand reads as exactly four, with one odd die that is neither the
 *       chosen face nor a wild.
 *
 * The number of wilds is Binomial(target, INSANE_WILD_P), so it clusters in
 * the middle and rarely hits none or all.
 *
 * The four-effective case has a subtlety: if too many wilds are used, some
 * *other* face can end up reading higher than the target. With `w` wilds and
 * one odd die R, effectiveCount(R) is `1 + w`, so `w` must stay below the
 * target or the hand overshoots. Draws above `target - 1` are resampled.
 */

const C = require('./config');
const { chance, pick, binomial, shuffle } = require('./rng');

/** Faces that are neither `face` nor wild. */
function otherFaces(face) {
  return C.FACES.filter((f) => f !== face && f !== C.WILD);
}

function rollInsane(rng) {
  const five = chance(rng, C.INSANE_FIVE_CHANCE);
  const target = five ? C.DICE_COUNT : C.DICE_COUNT - 1;

  let wilds = binomial(rng, target, C.INSANE_WILD_P);
  // Four-effective: keep the odd die from reading as high as five.
  while (!five && wilds > target - 1) wilds = binomial(rng, target, C.INSANE_WILD_P);

  // All five wild reads as five of every face — rare, since it is binomial.
  if (wilds === C.DICE_COUNT) return new Array(C.DICE_COUNT).fill(C.WILD);

  // Otherwise a real face, never 1, padded out with the wilds.
  const face = pick(rng, otherFaces(C.WILD));
  const hand = new Array(target - wilds).fill(face);
  for (let i = 0; i < wilds; i++) hand.push(C.WILD);

  // Pad to a full hand with dice that cannot inflate the count.
  const fillers = otherFaces(face);
  while (hand.length < C.DICE_COUNT) hand.push(pick(rng, fillers));

  return shuffle(rng, hand);
}

module.exports = { rollInsane, otherFaces };
