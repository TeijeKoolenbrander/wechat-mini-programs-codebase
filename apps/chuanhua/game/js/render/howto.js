/**
 * 玩法 sheet (spec 8.15, rev. 2): the 3 lines of a live game, a 3-panel illustration of a mini chain, and the 慢慢传 line.
 * vm: {} + display. Hit ids: sheet:close (the X, the scrim and the 知道了 button), sheet:list (scroll).
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Art = require('./art');
const { Hits } = require('./layout');
const C = T.COLORS;

const STEPS = [
  '1. 开一局：拉群友一起玩，每人选一个题目。',
  '2. 每一轮你只看到上一位传来的：是画就猜一句，是字就画出来。时间到会自动交出。',
  '3. 最后一起揭晓：先看最后变成了什么，再一步步往回看。',
];
const NOTE = '人少或者凑不齐？用「慢慢传」，一棒一棒在群里传。所有画和字都会先审核再传给下一位。';

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  const lh = Math.round(T.FS.bodyL * 1.5);
  const textW = Math.min(L.W, 560) - 2 * L.pad;
  const artH = L.u(T.isLarge() ? 84 : 72);
  const blocks = STEPS.map((s) => W.wrap(ctx, s, textW, T.FS.bodyL, 500));
  const note = W.wrap(ctx, NOTE, textW, T.FS.body, 500);
  const nlh = Math.round(T.FS.body * 1.5);
  const contentH = artH + L.u(16) + blocks.reduce((a, b) => a + b.length * lh + L.u(6), 0) + L.u(4) + note.length * nlh;
  const btnH = T.btn(L, 52);
  S.sheetScroll(ctx, L, hits, {
    title: '玩法',
    contentH,
    pinnedH: btnH,
    scroll: vm.sheetScroll,
    drawContent(x, y, w) {
      Art.howtoPanels(ctx, x + L.u(8), y + L.u(2), w - L.u(16), artH - L.u(4));
      let cy = y + artH + L.u(16);
      blocks.forEach((lines) => {
        lines.forEach((ln, i) => W.text(ctx, ln, x, cy + i * lh + lh / 2, { size: T.FS.bodyL, weight: 500 }));
        cy += lines.length * lh + L.u(6);
      });
      cy += L.u(4);
      note.forEach((ln, i) => W.text(ctx, ln, x, cy + i * nlh + nlh / 2, { size: T.FS.body, color: C.sub }));
    },
    drawPinned(x, y, w) {
      W.button(ctx, L, hits, { id: 'sheet:close', x, y, w, h: btnH, label: '知道了', kind: 'primary' });
    },
  });
  return hits.result();
}

module.exports = { draw, STEPS };
