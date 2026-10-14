/**
 * The CSS transitions and keyframes from the mini-program, redone by hand.
 * Pure: every function takes the time it should report on.
 */

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)`. Returns an easing function of progress
 * 0..1. Solves x(s) = t by bisection, which is plenty for one cup per frame.
 */
function cubicBezier(x1, y1, x2, y2) {
  function at(a, b, s) {
    // One axis of the curve through (0,0), (a), (b), (1,1).
    const u = 1 - s;
    return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s;
  }
  return function (t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let s = t;
    for (let i = 0; i < 30; i++) {
      s = (lo + hi) / 2;
      if (at(x1, x2, s) < t) lo = s;
      else hi = s;
    }
    return at(y1, y2, s);
  };
}

const linear = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/**
 * A value that eases toward a target, like a CSS transition: a change mid-way
 * starts from wherever the value is at that moment.
 */
function tween(value, duration, ease) {
  let from = value;
  let to = value;
  let start = 0;

  function progress(now) {
    return duration > 0 ? (now - start) / duration : 1;
  }

  return {
    value(now) {
      return from + (to - from) * ease(progress(now));
    },
    set(target, now) {
      if (target === to) return;
      from = this.value(now);
      to = target;
      start = now;
    },
    /** Jump straight to `target`, with no transition. */
    snap(target) {
      from = to = target;
    },
    busy(now) {
      return from !== to && progress(now) < 1;
    },
  };
}

/** The cup's open/close: `transition: transform 0.45s cubic-bezier(...)`. */
const CUP_MS = 450;
const CUP_EASE = cubicBezier(0.22, 0.9, 0.3, 1);

/** The hint's fade: `transition: opacity 0.3s` (CSS `ease`). */
const HINT_MS = 300;
const HINT_EASE = cubicBezier(0.25, 0.1, 0.25, 1);

/**
 * `@keyframes wobble`, 0.22s linear infinite. Returns the cup's hop as a
 * fraction of the full 14rpx (0 or negative, i.e. upward) and its tilt in
 * degrees, `ms` into the shake.
 */
const WOBBLE_MS = 220;
const WOBBLE_KEYS = [
  { at: 0, hop: 0, rot: 0 },
  { at: 0.25, hop: -1, rot: -7 },
  { at: 0.5, hop: 0, rot: 0 },
  { at: 0.75, hop: -1, rot: 7 },
  { at: 1, hop: 0, rot: 0 },
];

function wobble(ms) {
  const p = (((ms % WOBBLE_MS) + WOBBLE_MS) % WOBBLE_MS) / WOBBLE_MS;
  for (let i = 1; i < WOBBLE_KEYS.length; i++) {
    const b = WOBBLE_KEYS[i];
    if (p <= b.at) {
      const a = WOBBLE_KEYS[i - 1];
      const k = (p - a.at) / (b.at - a.at);
      return { hop: a.hop + (b.hop - a.hop) * k, rot: a.rot + (b.rot - a.rot) * k };
    }
  }
  return { hop: 0, rot: 0 };
}

module.exports = {
  cubicBezier,
  linear,
  tween,
  wobble,
  CUP_MS,
  CUP_EASE,
  HINT_MS,
  HINT_EASE,
  WOBBLE_MS,
};
