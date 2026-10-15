/**
 * 玩法 sheet (spec 8.1): three lines plus a picture. Drawn over Home.
 * Hit ids: sheet:close (X, outside tap, 知道了), sheet:list (scroll area when
 * the content does not fit, e.g. large-text mode on a small screen).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

const STEPS = [
  ['翻令', '每轮翻出一个势力和一个时代，只能从这一路的名将里挑。'],
  ['点将', '点一员大将，看他的智信仁勇严，再决定放哪个位置。'],
  ['出征', '五轮点齐五员大将，十二战见分晓，看能否一统天下。'],
];

/** Draw into an existing hit list (used by Home). */
function drawInto(ctx, L, hits, scroll) {
  const bh = T.btn(L, 54);
  const picH = L.u(56) + L.u(16);
  const textX = L.u(42);
  // measure
  const tmpW = Math.min(L.W, 560) - 2 * L.pad;
  const stepH = STEPS.map((st) => {
    const lines = W.lineCount(ctx, st[1], tmpW - textX, T.FS.body, 400, false, 4);
    return Math.max(L.u(54), L.u(32) + lines * L.u(T.isLarge() ? 27 : 22) + L.u(10));
  });
  const contentH = picH + L.u(14) + stepH.reduce((a, b) => a + b, 0);
  const wanted = L.u(60) + contentH + L.u(12) + bh + L.u(14) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h: Math.min(wanted, L.H - L.navBottom), title: '玩法' });
  const area = { x: s.x, y: s.top - L.u(8), w: s.w, h: s.bottom - bh - L.u(12) - (s.top - L.u(8)) };

  W.scrollBody(ctx, hits, area, contentH, scroll, 'sheet:list', () => {
    let y = area.y;
    // picture: two tokens, an arrow, five role seals
    const ph = L.u(56);
    const tw = L.u(52);
    W.card(ctx, s.x, y, s.w, ph + L.u(16), { fill: C.tile });
    const py = y + L.u(8);
    const px = s.x + L.u(14);
    W.token(ctx, px, py, tw, ph, { label: '蜀', color: T.FACTION_COLOR.shu }, 1);
    W.token(ctx, px + tw + L.u(8), py, tw, ph, { label: '时', color: C.lacquer, textColor: C.lacquerGold }, 1);
    W.text(ctx, '→', px + 2 * tw + L.u(28), py + ph / 2, { size: T.FS.title, weight: 700, color: C.sub, align: 'center' });
    const rx = px + 2 * tw + L.u(48);
    const cell = Math.min(L.u(34), (s.x + s.w - L.u(10) - rx) / 5 - 3);
    T.SLOT_ORDER.forEach((k, i) => {
      const bx = rx + i * (cell + 3);
      W.fillRR(ctx, bx, py + (ph - cell) / 2, cell, cell, 4, i < 2 ? T.FACTION_COLOR.shu : C.pipOff);
      W.text(ctx, i < 2 ? T.SLOT_LABEL[k][0] : '', bx + cell / 2, py + ph / 2 + 1, { size: Math.min(T.FS.body, cell * 0.7), weight: 700, serif: true, color: '#fff', align: 'center', minSize: 10 });
    });
    y += picH + L.u(14);

    STEPS.forEach((st, i) => {
      W.fillRR(ctx, s.x, y, L.u(30), L.u(30), L.u(15), C.seal);
      W.text(ctx, String(i + 1), s.x + L.u(15), y + L.u(15) + 1, { size: T.FS.bodyL, weight: 800, color: C.sealInk, align: 'center' });
      W.text(ctx, st[0], s.x + textX, y + L.u(14), { size: T.FS.bodyL, weight: 800, serif: true });
      W.paragraph(ctx, st[1], s.x + textX, y + L.u(28), s.w - textX, L.u(T.isLarge() ? 27 : 22), { size: T.FS.body, color: C.sub, maxLines: 4 });
      y += stepH[i];
    });
  });

  W.button(ctx, L, hits, { id: 'sheet:close', x: s.x, y: s.bottom - bh, w: s.w, h: bh, label: '知道了', kind: 'primary' });
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  drawInto(ctx, L, hits, vm && vm.sheetScroll);
  return hits.result();
}

module.exports = { draw, drawInto };
