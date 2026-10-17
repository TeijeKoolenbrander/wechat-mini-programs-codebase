/**
 * 玩法 sheet (PD-30, spec 6.1): three lines and a small animated ruler. Renderer chrome; dismissible (sheet:close, sheet:list).
 * The sweeping needle is an illustration driven by vm.t, not a position of the player.
 */

const T = require('./theme');
const W = require('./widgets');
const ruler = require('./ruler');
const C = T.COLORS;

const LINES = ['拖动指针，放到你觉得对的位置', '和全国、和群友比比谁更同频', '每天 5 张卡'];

function draw(ctx, L, hits, vm) {
  const lh = Math.round(T.FS.bodyL * 1.5);
  const sheetW = Math.min(L.W, 560);
  const inW = sheetW - 2 * L.pad;
  const bh = T.btn(L, 52);
  const lineBlocks = LINES.map((s, i) => {
    const n = W.wrap(ctx, s, inW - L.u(36), T.FS.bodyL, 600).length;
    return {
      h: Math.max(n * lh, L.u(32)),
      draw: (c, x, y) => {
        W.fillRR(c, x, y + (lh - L.u(26)) / 2, L.u(26), L.u(26), L.u(13), C.tintPrimary);
        W.text(c, String(i + 1), x + L.u(13), y + lh / 2, { size: T.FS.body, weight: 800, color: C.primary, align: 'center' });
        W.paragraph(c, s, x + L.u(36), y, inW - L.u(36), lh, { size: T.FS.bodyL, weight: 600 });
      },
    };
  });
  const rh = ruler.height(L);
  const blocks = lineBlocks.concat([
    {
      h: rh,
      draw: (c, x, y) => {
        const t = vm.t || 0;
        const pos = Math.round(50 + 38 * Math.sin(t / 700));
        ruler.draw(c, L, { x: x - L.pad, y, w: sheetW, left: '冷', right: '热', needle: pos, markers: [], interactive: false, revealT: 1, t });
      },
    },
  ]);
  let total = L.u(70);
  blocks.forEach((b, i) => (total += b.h + (i ? L.u(12) : 0)));
  total += bh + L.u(16) + L.bottomPad;
  const s = W.sheet(ctx, L, hits, { h: Math.min(total, L.H - L.navBottom), title: '玩法' });
  const area = { x: s.x, y: s.top, w: s.w, h: s.bottom - s.top - bh - L.u(10) };
  W.stack(ctx, L, hits, area, blocks, vm.sheetScroll || 0, 'sheet:list', L.u(12));
  W.button(ctx, L, hits, { id: 'sheet:close', x: s.x, y: s.bottom - bh, w: s.w, h: bh, label: '知道了', kind: 'primary' });
}

module.exports = { draw, LINES };
