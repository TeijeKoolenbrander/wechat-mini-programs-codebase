/**
 * Screen geometry, in canvas (CSS) pixels. Pure: logic calls makeLayout() with wx.getSystemInfoSync() values and
 * wx.getMenuButtonBoundingClientRect(), and passes the result to every draw().
 * Design width is 375. Below that nothing shrinks (layouts fit 320 at scale 1); above it everything grows up to 1.25x,
 * and on tablets the content column is capped and centred (the ruler still spans the full width, see CONTRACT).
 */

const { MIN_TAP } = require('./theme');

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function makeLayout(sys) {
  const W = sys.windowWidth;
  const H = sys.windowHeight;
  const s = clamp(W / 375, 1, 1.25);
  const u = (n) => n * s;
  const sb = sys.statusBarHeight != null ? sys.statusBarHeight : 20;
  const safeBottom = sys.safeArea && sys.safeArea.bottom != null ? Math.max(0, H - sys.safeArea.bottom) : 0;

  const m = sys.menuRect || { width: 87, height: 32, top: sb + 6, bottom: sb + 38, right: W - 7, left: W - 94 };
  const capsule = { x: m.left, y: m.top, w: m.right - m.left, h: m.bottom - m.top };
  const navBottom = m.bottom + (m.top - sb);

  const pad = u(16);
  const contentW = Math.min(W - 2 * pad, 500);
  const x0 = Math.round((W - contentW) / 2);

  const midY = m.top + (m.bottom - m.top) / 2;
  const back = { x: Math.max(0, x0 - pad / 2), y: midY - MIN_TAP / 2, w: u(96), h: MIN_TAP };

  const compact = H < 640;
  const bottomEdge = H - safeBottom;
  const bottomPad = u(compact ? 10 : 16);

  // Open data list rectangle for the group page / friend board / round list (standard look; see boardRect()).
  const boardTop = navBottom + u(44);
  const boardBottom = bottomEdge - bottomPad - u(56) - u(compact ? 8 : 12);
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
    thumbTop: H * 0.55, // the ruler and the primary button live below this line (AC 69)
    board,
    headerRight: x0 + contentW,
  };
}

/** Collects tap areas. Areas drawn inside a scrolled region are shifted by dy and clipped to the viewport. */
class Hits {
  constructor() {
    this.list = [];
    this.scrollMax = {};
    this._clip = null;
    this._dy = 0;
  }
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
  /** The array draw() returns, with scrollMax (and ruler, when set) attached. */
  result() {
    const out = this.list.slice();
    out.scrollMax = this.scrollMax;
    if (this.ruler) out.ruler = this.ruler;
    return out;
  }
}

/**
 * Open data canvas rectangle (group page and friend board). Logic sizes the shared canvas and the postMessage width and
 * height from this. A shown banner shortens it by banner.reservedHeight + 24pt. `display` ({largeText}) is optional:
 * large text reserves a taller header.
 */
function boardRect(L, banner, display) {
  const large = !!(display && display.largeText);
  const shift = banner && banner.show && banner.reservedHeight > 0 ? banner.reservedHeight + L.u(24) : 0;
  // The group / friend page scrolls, so only the SIZE of the list matters to logic (the renderer positions it): about a third of
  // the free height, between 150 and 320 pt (taller in large text, whose rows are 100 high). y is nominal (below the stats).
  const free = L.H - L.navBottom;
  const h = clamp(free * (large ? 0.4 : 0.34), L.u(large ? 200 : 150), L.u(large ? 360 : 320)) - shift;
  return { x: L.x0, y: L.navBottom + L.u(large ? 188 : 140), w: L.contentW, h: Math.max(L.u(120), h) };
}

/** Where the native banner goes: screen width - 32pt, pinned above the bottom safe area. null when not shown. */
function bannerRect(L, banner) {
  if (!banner || !banner.show || !(banner.reservedHeight > 0)) return null;
  return { x: 16, y: L.bottomEdge - banner.reservedHeight, w: L.W - 32, h: banner.reservedHeight };
}

function hitTest(hitAreas, x, y) {
  for (let i = hitAreas.length - 1; i >= 0; i--) {
    const a = hitAreas[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

module.exports = { makeLayout, boardRect, bannerRect, Hits, hitTest, clamp };
