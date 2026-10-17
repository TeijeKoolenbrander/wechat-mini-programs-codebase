/**
 * Ruler input logic (spec 2.1, 6.2, AC 14). Pure JS: screen x -> integer position 0..100, the needle state machine,
 * single-finger routing, nudges. The renderer draws the needle from `pos` and reports raw touches to this object;
 * it never computes a position itself (render/CONTRACT.md).
 *
 *   const ruler = createRuler();
 *   const track = makeTrack({ x: 0, width: layout.W });      // full width minus 16 margins
 *   ruler.touchStart(id, x, track, nowMs);  // nowMs comes from the caller (no clock in core)  ruler.touchMove(id, x, track);  ruler.touchEnd(id);
 *   ruler.nudge(-1 | +1);  ruler.canConfirm();  ruler.lock();
 */

const { CONFIG } = require('./config');

/** The draggable span: [x0, x1] in canvas px. Touches in the margins clamp to the ends, so 0 and 100 are reachable. */
function makeTrack(o) {
  const margin = o.margin === undefined ? 16 : o.margin;
  const x = o.x || 0;
  return { x0: x + margin, x1: x + o.width - margin };
}

/** Screen x -> integer 0..100 (clamped). */
function posFromX(x, track) {
  const span = track.x1 - track.x0;
  if (!(span > 0)) return 0;
  const p = Math.round(((x - track.x0) / span) * 100);
  return p < 0 ? 0 : p > 100 ? 100 : p;
}

/** Integer position -> screen x of the needle. */
function xFromPos(pos, track) {
  return track.x0 + ((track.x1 - track.x0) * pos) / 100;
}

function createRuler() {
  const s = {
    pos: null, // null until the first touch: no needle, no anchoring at 50 (PD-2)
    locked: false,
    touchId: null,
    touches: 0,
    nudges: 0,
    firstTouchAt: null,
    tickPending: false,
  };

  function set(p) {
    if (p === s.pos) return false;
    const prev = s.pos;
    s.pos = p;
    if (prev === null || Math.floor(prev / CONFIG.track.tickEvery) !== Math.floor(p / CONFIG.track.tickEvery)) s.tickPending = true;
    return true;
  }

  return {
    get pos() {
      return s.pos;
    },
    get locked() {
      return s.locked;
    },
    get phase() {
      return s.locked ? 'locked' : s.pos === null ? 'empty' : 'placing';
    },
    /** True when the needle moved. The needle jumps to the finger on touch start. */
    touchStart(id, x, track, nowMs) {
      if (s.locked || s.touchId !== null) return false; // one finger at a time (copied routing from 点将台)
      s.touchId = id;
      s.touches++;
      if (s.firstTouchAt === null) s.firstTouchAt = nowMs || 0;
      return set(posFromX(x, track));
    },
    touchMove(id, x, track) {
      if (s.locked || s.touchId === null || id !== s.touchId) return false;
      return set(posFromX(x, track));
    },
    /** Release keeps the needle. */
    touchEnd(id) {
      if (id === s.touchId) s.touchId = null;
    },
    touchCancel(id) {
      if (id === s.touchId) s.touchId = null;
    },
    /** One step left (-1) or right (+1), clamped. A no-op until the first touch (the nudge never creates a needle). */
    nudge(dir) {
      if (s.locked || s.pos === null) return false;
      s.nudges++;
      const p = s.pos + (dir < 0 ? -CONFIG.track.nudge : CONFIG.track.nudge);
      return set(p < 0 ? 0 : p > 100 ? 100 : p);
    },
    /** 就这儿 is enabled only with a needle and while not submitting. */
    canConfirm() {
      return s.pos !== null && !s.locked;
    },
    /** Lock while submitting / after the reveal; unlock to retry. */
    lock() {
      s.locked = true;
      s.touchId = null;
    },
    unlock() {
      s.locked = false;
    },
    /** true once per 5-step boundary crossing (play the light tick). */
    consumeTick() {
      const t = s.tickPending;
      s.tickPending = false;
      return t;
    },
    /** Restore a stored position (resume, pending submit). */
    restore(pos) {
      s.pos = pos;
      s.tickPending = false;
    },
    reset() {
      s.pos = null;
      s.locked = false;
      s.touchId = null;
      s.touches = 0;
      s.nudges = 0;
      s.firstTouchAt = null;
      s.tickPending = false;
    },
    /** For `daily_card_place`: {touches, nudges, ms (first touch -> now)}. */
    stats(nowMs) {
      return { touches: s.touches, nudges: s.nudges, ms: s.firstTouchAt === null ? 0 : Math.max(0, (nowMs || 0) - s.firstTouchAt) };
    },
  };
}

module.exports = { makeTrack, posFromX, xFromPos, createRuler };
