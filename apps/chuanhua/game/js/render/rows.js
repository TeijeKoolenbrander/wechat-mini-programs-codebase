/**
 * List rows and section headers shared by 本群接龙, 我的接龙 and 设置.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function sectionTitle(ctx, x, y, w, label) {
  const h = Math.round(T.FS.body * 2);
  W.text(ctx, label, x + 4, y + h / 2 + 2, { size: T.FS.body, weight: 800, round: true, color: C.sub, maxW: w });
  return h;
}

/**
 * A tappable row inside a card. o: {id, marker: 'dot'|'ring'|'status:<kind>'|null,
 * unseen, line, sub (second line), chevron, tag (small chip text), last}
 * Returns the row height. The card background is drawn by the caller (cardRows).
 */
function rowHeight(ctx, w, o) {
  const size = T.FS.bodyL;
  const lh = Math.round(size * 1.4);
  const textW = w - 28 - 40 - (o.chevron ? 22 : 0);
  const n = Math.min(2, W.wrap(ctx, o.line || '', textW, size, 700).length);
  const subH = o.sub ? Math.round(T.FS.small * 1.5) : 0;
  return Math.max(T.MODE.largeText ? 64 : 58, n * lh + subH + 20);
}

function row(ctx, hits, x, y, w, o) {
  const size = T.FS.bodyL;
  const lh = Math.round(size * 1.4);
  const h = rowHeight(ctx, w, o);
  const mx = x + 22;
  const my = y + h / 2;
  if (o.marker === 'dot') {
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fillStyle = C.zhu;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (o.marker === 'ring') {
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (o.marker && o.marker.indexOf('status:') === 0) {
    W.iconStatus(ctx, mx, my, 26, o.marker.slice(7));
  }
  const tx = x + (o.marker ? 44 : 16);
  const tw = x + w - (o.chevron ? 34 : 14) - tx;
  const lines = W.wrap(ctx, o.line || '', tw, size, 700).slice(0, 2);
  const subH = o.sub ? Math.round(T.FS.small * 1.5) : 0;
  const top = y + (h - lines.length * lh - subH) / 2;
  lines.forEach((ln, i) => W.text(ctx, i === 1 && W.wrap(ctx, o.line || '', tw, size, 700).length > 2 ? ln.slice(0, -1) + '…' : ln, tx, top + lh * i + lh / 2, { size, weight: 700, maxW: tw }));
  if (o.sub) W.text(ctx, o.sub, tx, top + lh * lines.length + subH / 2, { size: T.FS.small, weight: 600, color: o.subColor || C.sub, maxW: tw });
  if (o.chevron) W.text(ctx, '›', x + w - 18, my - 1, { size: T.FS.title, weight: 800, color: C.sub, align: 'center' });
  if (o.id) hits.add(o.id, x, y, w, h);
  return h;
}

/** A card holding rows, separated by hairlines. Returns the card height. */
function cardRows(ctx, hits, x, y, w, rows) {
  const heights = rows.map((r) => rowHeight(ctx, w, r));
  const total = heights.reduce((a, b) => a + b, 0) + 4;
  W.card(ctx, x, y, w, total, { r: 16 });
  let cy = y + 2;
  rows.forEach((r, i) => {
    if (i > 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(x + 16, cy, w - 32, 1);
    }
    row(ctx, hits, x, cy, w, r);
    cy += heights[i];
  });
  return total;
}

module.exports = { sectionTitle, row, rowHeight, cardRows };
