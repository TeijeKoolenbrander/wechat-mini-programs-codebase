/**
 * 数据来源 page (spec 6.12): one line per publisher with attribution text and
 * URL as plain text (no clipboard, no web view). Static, so no loading state.
 *
 * vm = {sources:[{publisher, attribution, url}], scrollY}
 * Hit ids: sources:back, sources:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'sources:back');
  const x = L.x0;
  const cw = L.contentW;
  W.text(ctx, '数据来源', x, L.navBottom + L.u(18), { size: T.FS.title + 2, weight: 800, serif: true });
  const top = L.navBottom + L.u(42);
  const bottom = L.bottomEdge - L.bottomPad;
  const lh = L.u(25) * (L.large ? 1.2 : 1);
  const rect = { x: 0, y: top, w: L.W, h: bottom - top };
  W.scrollRegion(ctx, hits, 'sources:scroll', rect, vm.scrollY, (c, hh, y0) => {
    let y = y0;
    (vm.sources || []).forEach((s) => {
      c.fillStyle = C.line;
      c.fillRect(x, y, cw, 1);
      y += L.u(8);
      if (s.publisher) y += W.paragraph(c, s.publisher, x, y, cw, lh, { size: T.FS.bodyL, weight: 800, serif: true, maxLines: 2 });
      if (s.attribution) y += W.paragraph(c, s.attribution, x, y, cw, lh, { size: T.FS.body, color: C.ink, maxLines: 6 });
      if (s.url) y += W.paragraph(c, s.url, x, y, cw, lh, { size: T.FS.body, color: C.sub, maxLines: 3 });
      y += L.u(8);
    });
    y += L.u(6);
    y += W.paragraph(c, '每条数据均标注来源与年份；如发现错误，请在答题后点「数据有误？」', x, y, cw, lh, { size: T.FS.body, weight: 700, color: C.seal, maxLines: 4 });
    return y - y0 + L.u(12);
  });
  return hits.result();
}

module.exports = { draw };
