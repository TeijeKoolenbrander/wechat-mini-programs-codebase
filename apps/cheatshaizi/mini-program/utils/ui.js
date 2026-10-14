/**
 * Small presentation helpers. Shared by both pages.
 * No game logic lives here — that is all in core/.
 */

/** Scattered starfield dots for the background. */
function sparkles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const size = 3 + Math.random() * 5;
    out.push({
      id: i,
      style:
        `left:${(Math.random() * 100).toFixed(2)}%;` +
        `top:${(Math.random() * 92).toFixed(2)}%;` +
        `width:${size.toFixed(1)}rpx;height:${size.toFixed(1)}rpx;` +
        `opacity:${(0.18 + Math.random() * 0.5).toFixed(2)};`,
    });
  }
  return out;
}

/**
 * One sprite per face, cut from the renders in visuals/. Each shows the
 * rolled value on its top face; 1 and 4 have red pips, as on Chinese dice.
 */
function dieSrc(value) {
  return '/assets/images/die' + value + '.png';
}

/** Turn a hand into something WXML can render directly. */
function toDice(hand) {
  return hand.map(function (value, i) {
    return {
      id: i,
      value: value,
      src: dieSrc(value),
    };
  });
}

module.exports = { sparkles, toDice, dieSrc };
