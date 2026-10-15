/**
 * 玩法 sheet (spec 6.13): three lines plus a small drawing of the two cards.
 * Drawn over any screen (auto-opens once on first launch).
 * Hit ids: sheet:close (X, outside tap, 知道了), sheet:list (scroll, large text).
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

const STEPS = [
  ['看数字', '上面的卡片告诉你数字。'],
  ['选一个', '猜下面那张比它更多还是更少。'],
  ['连对', '连对越多越厉害，错一次就结束。今日一比全国同一套题，每天一次。'],
];

/** The picture: a small known card, a seal, a small unknown card. */
function picture(ctx, L, x, y, w, h) {
  const cw = Math.min(w * 0.62, L.u(210));
  const ch = (h - L.u(10)) / 2;
  const cx = x + (w - cw) / 2;
  [
    [y, true],
    [y + ch + L.u(10), false],
  ].forEach((pair) => {
    const cy = pair[0];
    const known = pair[1];
    W.card(ctx, cx, cy, cw, ch, { r: L.u(8), fill: C.card });
    ctx.save();
    W.rr(ctx, cx, cy, cw, ch, L.u(8));
    ctx.clip();
    ctx.fillStyle = T.accentFill(T.ACCENTS.geo);
    ctx.fillRect(cx, cy, L.u(4), ch);
    ctx.restore();
    W.fillRR(ctx, cx + L.u(12), cy + ch * 0.2, L.u(34), ch * 0.2, 3, C.skeleton);
    W.text(ctx, known ? '6,300' : '？', cx + cw / 2, cy + ch * 0.68, { size: T.FS.body + 2, weight: 800, serif: true, align: 'center', color: known ? C.ink : C.sub });
  });
  W.seal(ctx, x + w / 2, y + ch + L.u(5), L.u(26), { rotate: -6 });
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  const bh = L.btnH;
  const h = Math.min(L.H - L.navBottom, L.u(L.compact ? 470 : 500) + (L.large ? L.u(120) : 0));
  const s = W.sheet(ctx, L, hits, { h, title: '玩法' });
  const btnY = s.bottom - bh;
  const top = s.top - L.u(8);
  const rect = { x: s.x, y: top, w: s.w, h: btnY - L.u(10) - top };
  const lh = L.u(23) * (L.large ? 1.2 : 1);
  W.scrollRegion(ctx, hits, 'sheet:list', rect, vm && vm.sheetScroll, (c, hh, y0) => {
    let y = y0;
    const ph = L.u(L.compact ? 92 : 104);
    picture(c, L, s.x, y, s.w, ph);
    y += ph + L.u(14);
    STEPS.forEach((st, i) => {
      const nr = L.u(15) * (L.large ? 1.2 : 1);
      W.fillRR(c, s.x, y, nr * 2, nr * 2, nr, C.seal);
      W.text(c, String(i + 1), s.x + nr, y + nr + 1, { size: T.FS.bodyL, weight: 800, color: C.sealInk, align: 'center' });
      W.text(c, st[0], s.x + nr * 2 + L.u(12), y + nr, { size: T.FS.bodyL, weight: 800, serif: true });
      const n = W.paragraph(c, st[1], s.x + nr * 2 + L.u(12), y + nr * 2 - L.u(2), s.w - nr * 2 - L.u(12), lh, { size: T.FS.body, color: C.sub });
      y += Math.max(nr * 2 + L.u(8), nr * 2 + n) + L.u(12);
    });
    return y - y0;
  });
  W.button(ctx, L, hits, { id: 'sheet:close', x: s.x, y: btnY, w: s.w, h: bh, label: '知道了', kind: 'primary' });
  return hits.result();
}

module.exports = { draw };
