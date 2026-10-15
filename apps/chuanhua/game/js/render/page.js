/**
 * Page scaffold shared by every screen: display mode, paper background,
 * "‹ 返回" level with the capsule, an optional title, a scrolling body and a
 * pinned footer in the thumb zone. Keeps every screen consistent and makes
 * large-text mode degrade into scrolling instead of clipping.
 *
 * page(ctx, vm, L, o) -> hit array (with scrollMax)
 *   o.back        {label, id} or null (default: none)
 *   o.navCenter   fn(ctx, hits, L) draws inside the nav row between 返回 and the capsule
 *   o.title       string drawn under the nav row (wraps to 2 lines max)
 *   o.titleSize   override (default FS.title)
 *   o.footerH     pinned footer height (0 = none)
 *   o.footer      fn(ctx, hits, rect{x,y,w,h})
 *   o.body        fn(ctx, hits, y0, x, w) -> content height  (scrolls when taller)
 *   o.scrollId    default 'scroll'; o.scrollY from vm.scrollY
 *   o.center      centre short body content vertically
 *   o.sheets      draw the active sheet from vm.sheet (default true)
 * vm extras read here: display, scrollY, keyboardH (px of native keyboard), sheet
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const sheets = require('./sheets');
const C = T.COLORS;

function page(ctx, vm, L, o) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  W.paper(ctx, L);

  if (o.back) W.backButton(ctx, L, hits, o.back.label, o.back.id);
  if (o.navCenter) o.navCenter(ctx, hits, L);

  let top = L.navBottom + L.u(6);
  if (o.title) {
    const size = o.titleSize || T.FS.title;
    const lh = Math.round(size * 1.3);
    const lines = W.wrap(ctx, o.title, L.contentW, size, 800, true).slice(0, 2);
    lines.forEach((ln, i) => W.text(ctx, ln, L.x0, top + lh * i + lh / 2, { size, weight: 800, round: true, maxW: L.contentW }));
    top += lh * lines.length + L.u(8);
  }

  const edge = L.bottomEdge - Math.max(0, (vm && vm.keyboardH) || 0);
  let footerTop = edge - L.bottomPad;
  if (o.footerH) {
    footerTop = edge - L.bottomPad - o.footerH;
    o.footer(ctx, hits, { x: L.x0, y: footerTop, w: L.contentW, h: o.footerH });
  }
  const bottom = footerTop - L.u(o.footerH ? 10 : 0);
  const clip = { x: 0, y: top, w: L.W, h: Math.max(0, bottom - top) };
  let info = null;
  if (o.body) {
    info = W.scrollView(ctx, hits, o.scrollId || 'scroll', clip, vm && vm.scrollY, (c, h, y0) => o.body(c, h, y0, L.x0, L.contentW), { center: o.center });
  }
  if (o.sheets !== false) sheets.drawSheet(ctx, vm || {}, L, hits);
  const res = hits.result();
  res.layoutInfo = { top, bottom, footerTop, contentH: info ? info.contentH : 0 };
  void C;
  return res;
}

module.exports = { page };
