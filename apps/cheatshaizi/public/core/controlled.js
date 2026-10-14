/**
 * Controlled mode: a fair roll that the player can set by hand.
 *
 * Long-pressing 摇 turns the screen into a 3x2 grid of six zones. The two taps read the same zone
 * differently:
 *
 *      TAP 1 - quantity        TAP 2 - face
 *      ((index + 1) mod 6)     (index + 1, 1..6)
 *
 *      ┌─────┬─────┐           ┌─────┬─────┐
 *      │  1  │  2  │           │  1  │  2  │
 *      ├─────┼─────┤           ├─────┼─────┤
 *      │  3  │  4  │           │  3  │  4  │
 *      ├─────┼─────┤           ├─────┼─────┤
 *      │  5  │  0  │           │  5  │  6  │
 *      └─────┴─────┘           └─────┴─────┘
 *
 * Quantity is the *effective* count under 飞 — the chosen face plus any
 * wilds. Quantity 0 means none of that face and no 1s at all; quantity 5 means the
 * whole hand reads as that face. Every zone is legal with 5 dice.
 */

const C = require('./config');
const { pick, chance, intBetween, binomial, shuffle } = require('./rng');
const { otherFaces } = require('./crazy');

/**
 * Which zone a touch at (x, y) lands in, on a screen of w x h.
 * Two columns, three rows, numbered left-to-right then top-to-bottom.
 * Pure geometry, so the grid can be verified without a device.
 */
function zoneAt(x, y, w, h) {
  const col = x < w / 2 ? 0 : 1;
  let row = Math.floor(y / (h / 3));
  if (row < 0) row = 0;
  if (row > 2) row = 2;
  return row * 2 + col;
}

/**
 * Zone index -> quantity. Reads 1..5 left-to-right, top-to-bottom, with 0 in
 * the bottom-right corner — so it matches the face grid everywhere but there.
 */
function zoneToQuantity(zone) {
  return (zone + 1) % 6;
}

/** Zone index -> face. Offset by one so all six faces are reachable. */
function zoneToFace(zone) {
  return zone + 1;
}

/**
 * Compose the `qty` dice that make up the chosen count, per CONTROLLED_SPLIT.
 * All variants produce the same effective count; they differ only in how
 * many of the dice are wilds.
 */
function composeCounted(rng, qty, face, split) {
  if (qty === 0) return [];
  // Asking for 1s means literal 1s — there is nothing to split.
  if (face === C.WILD) return new Array(qty).fill(C.WILD);

  let wilds;
  switch (split || C.CONTROLLED_SPLIT) {
    case 'uniform':
      wilds = 0;
      break;
    case 'random':
      wilds = intBetween(rng, 0, qty - 1);
      break;
    case 'oneWild':
      wilds = qty >= 2 ? 1 : 0;
      break;
    case 'weighted':
      // Mostly include wilds; occasionally show a clean run of one face.
      wilds = chance(rng, C.CONTROLLED_ALL_FACE_CHANCE)
        ? 0
        : intBetween(rng, 1, qty);
      break;
    case 'binomial':
    default:
      wilds = binomial(rng, qty, C.CONTROLLED_WILD_P);
      break;
  }

  const dice = new Array(qty - wilds).fill(face);
  for (let i = 0; i < wilds; i++) dice.push(C.WILD);
  return dice;
}

/**
 * Build a hand reading as exactly `qty` of `face`.
 *
 * The remaining dice are drawn at random from faces that are neither the
 * chosen face nor wild, so nothing inflates the chosen count. They are
 * otherwise unconstrained, so they may coincidentally form a count of their
 * own — that is intended, and it keeps the hand looking natural.
 *
 * `split` overrides CONTROLLED_SPLIT for this one hand. The cup screen passes
 * 'uniform' when the no-wilds toggle is on, so the chosen dice come out as
 * the chosen face and nothing else.
 */
function applyControlled(rng, qty, face, split) {
  if (!Number.isInteger(qty) || qty < 0 || qty > C.DICE_COUNT) {
    throw new RangeError('quantity must be an integer 0..' + C.DICE_COUNT);
  }
  if (!Number.isInteger(face) || face < 1 || face > 6) {
    throw new RangeError('face must be an integer 1..6');
  }

  const hand = composeCounted(rng, qty, face, split);
  const fillers = otherFaces(face);
  while (hand.length < C.DICE_COUNT) hand.push(pick(rng, fillers));

  return shuffle(rng, hand);
}

module.exports = {
  applyControlled,
  composeCounted,
  zoneAt,
  zoneToQuantity,
  zoneToFace,
};
