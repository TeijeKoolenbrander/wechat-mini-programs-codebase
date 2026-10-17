/**
 * One-time strike-warning sheet (spec 7.3), drawn over home. vm: {text} + display.
 * Hit ids: warning:ok, sheet:close.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const { Hits } = require('./layout');
const C = T.COLORS;

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  const lh = Math.round(T.FS.bodyL * 1.55);
  const textW = Math.min(L.W, 560) - 2 * L.pad;
  const lines = W.wrap(ctx, vm.text || '', textW, T.FS.bodyL, 500);
  const btnH = T.btn(L, 52);
  S.sheetScroll(ctx, L, hits, {
    title: '友情提醒',
    contentH: lines.length * lh + L.u(6),
    pinnedH: btnH,
    scroll: vm.sheetScroll,
    drawContent(x, y) {
      lines.forEach((ln, i) => W.text(ctx, ln, x, y + i * lh + lh / 2, { size: T.FS.bodyL, weight: 500, color: C.ink }));
    },
    drawPinned(x, y, w) {
      W.button(ctx, L, hits, { id: 'warning:ok', x, y, w, h: btnH, label: '知道了', kind: 'primary' });
    },
  });
  return hits.result();
}

module.exports = { draw };
