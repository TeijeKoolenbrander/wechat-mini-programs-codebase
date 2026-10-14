/**
 * 玩法 sheet (spec 8.1): three lines plus a picture. Drawn over Home.
 * Hit ids: sheet:close (X, outside tap, 知道了).
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
function drawInto(ctx, L, hits) {
  const h = L.u(L.compact ? 470 : 500);
  const s = W.sheet(ctx, L, hits, { h, title: '玩法' });
  let y = s.top - L.u(8);

  // picture: two tokens, an arrow, five role seals
  const ph = L.u(56);
  const tw = L.u(52);
  W.card(ctx, s.x, y, s.w, ph + L.u(16), { fill: C.tile });
  const py = y + L.u(8);
  const px = s.x + L.u(14);
  W.token(ctx, px, py, tw, ph, { label: '蜀', color: T.FACTION_COLOR.shu }, 1);
  W.token(ctx, px + tw + L.u(8), py, tw, ph, { label: '时代', color: C.lacquer, textColor: C.lacquerGold }, 1);
  W.text(ctx, '→', px + 2 * tw + L.u(28), py + ph / 2, { size: T.FS.title, weight: 700, color: C.sub, align: 'center' });
  const rx = px + 2 * tw + L.u(48);
  const roles = T.SLOT_ORDER;
  const cell = Math.min(L.u(34), (s.x + s.w - L.u(10) - rx) / 5 - 3);
  roles.forEach((k, i) => {
    const bx = rx + i * (cell + 3);
    W.fillRR(ctx, bx, py + (ph - cell) / 2, cell, cell, 4, i < 2 ? T.FACTION_COLOR.shu : 'rgba(42,33,26,0.14)');
    W.text(ctx, i < 2 ? T.SLOT_LABEL[k][0] : '', bx + cell / 2, py + ph / 2 + 1, { size: T.FS.body, weight: 700, serif: true, color: '#fff', align: 'center' });
  });
  y += ph + L.u(30);

  STEPS.forEach((st, i) => {
    W.fillRR(ctx, s.x, y, L.u(30), L.u(30), L.u(15), C.seal);
    W.text(ctx, String(i + 1), s.x + L.u(15), y + L.u(15) + 1, { size: T.FS.bodyL, weight: 800, color: C.sealInk, align: 'center' });
    W.text(ctx, st[0], s.x + L.u(42), y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
    const used = W.paragraph(ctx, st[1], s.x + L.u(42), y + L.u(24), s.w - L.u(42), L.u(22), { size: T.FS.body, color: C.sub, maxLines: 2 });
    y += Math.max(L.u(54), used + L.u(34));
  });

  const bh = L.u(54);
  W.button(ctx, L, hits, { id: 'sheet:close', x: s.x, y: s.bottom - bh, w: s.w, h: bh, label: '知道了', kind: 'primary' });
}

function draw(ctx, vm, L) {
  const hits = new Hits();
  drawInto(ctx, L, hits);
  return hits.result();
}

module.exports = { draw, drawInto };
