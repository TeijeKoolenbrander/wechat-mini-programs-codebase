/**
 * Bottom stack shared by the screens with a live ruler (card, round guess): ruler, nudge row, primary (and an optional second
 * button), all anchored to the bottom safe area so they sit in the thumb zone (AC 69: ruler band below 55% of the height).
 * If the separate nudge row would push the ruler above that line (large text on a short screen), ‹ and › move into the primary row.
 */

const T = require('./theme');
const W = require('./widgets');
const ruler = require('./ruler');

/** Geometry only (no drawing). o: {secondary: bool, row: bool (a free row where the nudges would go)} */
function geometry(L, o) {
  o = o || {};
  const bh = T.btn(L, 52);
  // slim: the report-link row of the card reveal only needs a 48 pt tap target (frees height for the reveal text)
  const rowH = o.slim ? T.MIN_TAP : Math.max(T.minBtn(), L.u(48));
  const rm = ruler.metrics(L, false);
  const build = (inline) => {
    let y = L.bottomEdge - L.bottomPad;
    const g = { bh, rowH, inline };
    if (o.secondary) {
      y -= bh;
      g.secondaryY = y;
      y -= L.u(8);
    }
    y -= bh;
    g.primaryY = y;
    y -= L.u(8);
    if (!inline) {
      y -= rowH;
      g.rowY = y;
      y -= L.u(6);
    } else y -= L.u(2);
    y -= rm.total;
    g.rulerY = y;
    g.bandY = y + rm.noteH + rm.gap; // band (marker lane + tape) top
    g.laneY = g.bandY;
    return g;
  };
  let g = build(false);
  if (g.laneY < L.thumbTop && !o.keepRow) g = build(true);
  return g;
}

/** Draw ‹ › (disabled while the needle is null or locked) either in their own row or flanking the primary button. */
function nudges(ctx, L, hits, g, prefix, enabled, x0, x1) {
  const w = Math.max(L.u(64), T.MIN_TAP);
  const y = g.inline ? g.primaryY : g.rowY;
  const h = g.inline ? g.bh : g.rowH;
  W.button(ctx, L, hits, { id: prefix + ':nudgeL', x: x0, y, w, h, label: '‹', size: T.FS.hero * 0.8, disabled: !enabled });
  W.button(ctx, L, hits, { id: prefix + ':nudgeR', x: x1 - w, y, w, h, label: '›', size: T.FS.hero * 0.8, disabled: !enabled });
  return w;
}

/** Primary button between the nudges when inline, else full content width. */
function primaryRect(L, g) {
  if (!g.inline) return { x: L.x0, w: L.contentW };
  const nw = Math.max(L.u(64), T.MIN_TAP);
  return { x: L.x0 + nw + L.u(8), w: L.contentW - 2 * (nw + L.u(8)) };
}

module.exports = { geometry, nudges, primaryRect };
