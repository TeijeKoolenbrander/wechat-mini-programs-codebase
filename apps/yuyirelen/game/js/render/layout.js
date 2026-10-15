/**
 * Screen geometry for every screen, in canvas (CSS) pixels. Pure: logic calls
 * makeLayout() with values from wx.getSystemInfoSync() (or getWindowInfo) and
 * wx.getMenuButtonBoundingClientRect(), and passes the result to every draw().
 *
 * Design width is 375. Below that nothing shrinks (the layouts are built to
 * fit 320 at scale 1); above it everything grows up to 1.25x, and on tablets
 * the content column is capped and centred.
 */

const { MIN_TAP } = require('./theme');

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {object} sys {windowWidth, windowHeight, pixelRatio?, statusBarHeight?,
 *   safeArea?: {top,bottom}, menuRect?: {left,top,right,bottom,width,height}}
 */
function makeLayout(sys) {
  const W = sys.windowWidth;
  const H = sys.windowHeight;
  const s = clamp(W / 375, 1, 1.25);
  const u = (n) => n * s;
  const sb = sys.statusBarHeight != null ? sys.statusBarHeight : 20;

  const safeBottom = sys.safeArea && sys.safeArea.bottom != null ? Math.max(0, H - sys.safeArea.bottom) : 0;

  // Capsule menu rect. The fallback is the iOS default (87 x 32, 7px from the edge).
  const m = sys.menuRect || { width: 87, height: 32, top: sb + 6, bottom: sb + 38, right: W - 7, left: W - 94 };
  const capsule = { x: m.left, y: m.top, w: m.right - m.left, h: m.bottom - m.top };
  const navBottom = m.bottom + (m.top - sb);

  const pad = u(16);
  const contentW = Math.min(W - 2 * pad, 500);
  const x0 = Math.round((W - contentW) / 2);

  // "‹ 返回": level with the capsule, tap area at least 48 tall.
  const midY = m.top + (m.bottom - m.top) / 2;
  const back = { x: Math.max(0, x0 - pad / 2), y: midY - MIN_TAP / 2, w: u(88), h: MIN_TAP };

  const compact = H < 640;
  const bottomEdge = H - safeBottom; // nothing tappable below this
  const bottomPad = u(compact ? 10 : 16);

  // Board (open data domain) rectangle: below the title, above the footer.
  // (board.js boardRect(L, vm) is the exact rect, it also accounts for the banner and large text)
  const boardTop = navBottom + u(44);
  const boardBottom = bottomEdge - bottomPad - u(52) - u(6) - u(30) - u(6);
  const board = { x: x0, y: boardTop, w: contentW, h: Math.max(u(160), boardBottom - boardTop) };

  return {
    W,
    H,
    s,
    u,
    dpr: sys.pixelRatio || 1,
    statusBar: sb,
    safeBottom,
    bottomEdge,
    bottomPad,
    capsule,
    navBottom,
    pad,
    x0,
    contentW,
    cx: W / 2,
    back,
    compact,
    thumbTop: H * 0.6,
    board,
    // Right edge a header text may use without touching the capsule row.
    headerRight: x0 + contentW,
  };
}

/**
 * Collects tap areas. Supports a scroll viewport: areas drawn inside a
 * scrolled region are shifted by `dy` and clipped to the viewport (those
 * outside are dropped). `scrollMax` maps a scroll id to its max offset.
 */
class Hits {
  constructor() {
    this.list = [];
    this.scrollMax = {};
    this._clip = null;
    this._dy = 0;
  }

  /** Begin a scrolled region. clip = {x,y,w,h} on screen; dy = -scrollOffset. */
  beginScroll(clip, dy) {
    this._clip = clip;
    this._dy = dy;
  }

  endScroll() {
    this._clip = null;
    this._dy = 0;
  }

  add(id, x, y, w, h) {
    y += this._dy;
    if (this._clip) {
      const c = this._clip;
      const x1 = Math.max(x, c.x);
      const y1 = Math.max(y, c.y);
      const x2 = Math.min(x + w, c.x + c.w);
      const y2 = Math.min(y + h, c.y + c.h);
      if (x2 - x1 <= 0 || y2 - y1 <= 0) return;
      x = x1;
      y = y1;
      w = x2 - x1;
      h = y2 - y1;
    }
    this.list.push({ id, x, y, w, h });
  }

  /** The array draw() returns, with scrollMax attached. */
  result() {
    const out = this.list.slice();
    out.scrollMax = this.scrollMax;
    return out;
  }
}

function hitTest(hitAreas, x, y) {
  for (let i = hitAreas.length - 1; i >= 0; i--) {
    const a = hitAreas[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

module.exports = { makeLayout, Hits, hitTest, clamp };
