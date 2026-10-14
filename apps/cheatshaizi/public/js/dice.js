/**
 * Where the dice lie on the tray. Pure presentation, no game logic. That is
 * all in core/.
 */

/**
 * Resting places for the five dice, as percentages of the tray: the cluster
 * from visuals/oc2.png, two behind, one to the right, two in front.
 *
 * Checked against the sprites: with the cup down, every die stays inside its
 * silhouette, and with the cup up its base clears the whole cluster.
 */
const SLOTS = [
  { x: 23.4, y: 19.0 },
  { x: 43.7, y: 12.3 },
  { x: 61.0, y: 24.5 },
  { x: 27.7, y: 43.0 },
  { x: 47.8, y: 42.2 },
];

/**
 * One sprite per face, cut from the renders in visuals/. Each shows the
 * rolled value on its top face; 1 and 4 have red pips, as on Chinese dice.
 */
function dieSrc(value) {
  return 'assets/images/die' + value + '.png';
}

/**
 * Scatter the dice a little so a re-roll does not look like a redraw.
 * `x` and `y` are the die's top-left corner as percentages of the tray, `rot`
 * is in degrees, and `z` is the paint order.
 */
function positioned(hand, rng) {
  return hand.map(function (value, i) {
    const slot = SLOTS[i];
    // Kept small: the dice are 3D renders, so a large in-plane rotation would
    // look wrong, and loose dice could poke out from under the cup.
    const jx = (rng() - 0.5) * 2.4;
    const jy = (rng() - 0.5) * 2.4;
    const rot = (rng() - 0.5) * 10;
    const y = slot.y + jy;
    return {
      id: i,
      value: value,
      src: dieSrc(value),
      x: slot.x + jx,
      y: y,
      rot: rot,
      // Depth order: the lower a die sits on screen the nearer it is, so it
      // paints over the ones behind it.
      z: 2 + Math.round(y),
    };
  });
}

/**
 * When a hand is set with the cup up, leave every die where it already lies:
 * only the faces turn over, rather than the whole pile jumping to new
 * positions.
 */
function keepPlaces(next, prev) {
  for (let i = 0; i < next.length; i++) {
    const p = prev[i];
    if (!p) continue;
    next[i].x = p.x;
    next[i].y = p.y;
    next[i].rot = p.rot;
    next[i].z = p.z;
  }
  return next;
}

/** Paint order: back row first. Stable, so ties keep their slot order. */
function paintOrder(dice) {
  return dice.slice().sort((a, b) => a.z - b.z || a.id - b.id);
}

module.exports = { SLOTS, dieSrc, positioned, keepPlaces, paintOrder };
