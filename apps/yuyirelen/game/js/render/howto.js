/**
 * 玩法 sheet (spec 8.9): exactly three rule lines and one picture (a
 * three-row mini ladder: 冷 blue, 热 amber, 命中 gold), plus the note line
 * under the picture. Drawn over Home or Play.
 * vm extras: sheetScroll (px). Hit ids: sheet:close (X, outside tap, 知道了),
 * sheet:list (scroll area; scrollMax id).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

// Fixed copy (spec 8.9). Bold segments are drawn heavier.
const LINES = [
  { t: '今天全国猜同一个秘密词。' },
  { t: '每猜一个词，告诉你它离答案第几近：第 1 名就是答案。越红越近，越蓝越远。' },
  { t: '点联想词或自己输入；卡住了就用提示。' },
];
const NOTE = '每个提示也算一步。只能猜常用词，人名地名不算。';

// The picture's sample rows: not part of any puzzle.
const SAMPLE = [
  { word: '动物', band: 'cold', label: '冷', rank: '第 9,812 名', temp: 18 },
  { word: '蔬菜', band: 'hot', label: '热', rank: '第 152 名', temp: 55 },
  { word: '番茄', band: 'hit', label: '命中', rank: '第 1 名', temp: 100 },
];

function drawPicture(ctx, L, x, y, w) {
  const rowH = L.u(T.METRICS.large ? 40 : 30);
  const padY = L.u(6);
  const h = rowH * SAMPLE.length + padY * 2;
  W.card(ctx, x, y, w, h);
  SAMPLE.forEach((r, i) => {
    const cy = y + padY + rowH * i + rowH / 2;
    const px = x + L.u(12);
    W.text(ctx, r.word, px, cy, { size: T.FS.bodyL, weight: 700 });
    const pillW = L.u(T.METRICS.large ? 56 : 48);
    const rightX = x + w - L.u(12);
    W.bandPill(ctx, rightX, cy, r.band, r.label, { size: T.FS.body, align: 'right' });
    const barX = px + L.u(T.METRICS.large ? 64 : 50);
    const barW = rightX - pillW - L.u(10) - barX;
    W.thermoBar(ctx, barX, cy - L.u(5), Math.max(L.u(40), barW), L.u(10), r.temp, r.band);
  });
  return h;
}

/** Draw into an existing hit list. Returns nothing. */
function drawInto(ctx, vm, L, hits) {
  const btnH = L.u(T.METRICS.btn);
  const wantH = L.compact ? L.H - L.navBottom : L.u(T.METRICS.large ? 560 : 470);
  const s = W.sheet(ctx, L, hits, { h: Math.min(wantH, L.H - L.navBottom), title: '玩法' });
  const viewTop = s.top - L.u(8);
  const btnY = s.bottom - btnH;
  const viewBottom = btnY - L.u(10);
  const view = { x: s.x - 2, y: viewTop, w: s.w + 4, h: viewBottom - viewTop };

  const lineH = L.u(T.METRICS.large ? 28 : 23);
  const textX = s.x + L.u(40);
  const textW = s.w - L.u(40);
  const gap = L.u(L.compact ? 6 : 12);
  const picH = L.u(T.METRICS.large ? 40 : 30) * SAMPLE.length + L.u(12);
  let contentH = picH + L.u(8) + W.paragraphHeight(ctx, NOTE, s.w, lineH, { size: T.FS.body }) + gap;
  LINES.forEach((ln) => (contentH += Math.max(L.u(36), W.paragraphHeight(ctx, ln.t, textW, lineH, { size: T.FS.body, weight: 500 }) + L.u(6)) + gap));

  const maxScroll = Math.max(0, contentH - view.h);
  const off = Math.max(0, Math.min(vm.sheetScroll || 0, maxScroll));
  hits.scrollMax['sheet:list'] = maxScroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  let y = viewTop - off;
  const ph = drawPicture(ctx, L, s.x, y, s.w);
  y += ph + L.u(8);
  y += W.paragraph(ctx, NOTE, s.x, y, s.w, lineH, { size: T.FS.body, color: C.sub }) + gap;
  LINES.forEach((ln, i) => {
    W.fillRR(ctx, s.x, y + L.u(2), L.u(28), L.u(28), L.u(14), C.ink);
    W.text(ctx, String(i + 1), s.x + L.u(14), y + L.u(16), { size: T.FS.body, weight: 800, color: C.onInk, align: 'center' });
    const used = W.paragraph(ctx, ln.t, textX, y, textW, lineH, { size: T.FS.body, weight: 500 });
    y += Math.max(L.u(36), used + L.u(6)) + gap;
  });
  ctx.restore();
  if (maxScroll > 0) hits.add('sheet:list', view.x, view.y, view.w, view.h);

  W.button(ctx, L, hits, { id: 'sheet:close', x: s.x, y: btnY, w: s.w, h: btnH, label: '知道了', kind: 'primary' });
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  drawInto(ctx, vm || {}, L, hits);
  return hits.result();
}

module.exports = { draw, drawInto, LINES, NOTE };
