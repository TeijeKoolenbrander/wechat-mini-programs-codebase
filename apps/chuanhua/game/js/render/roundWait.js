/**
 * Round wait (spec 8.17): shown after a player has sent, until the next round starts. Top bar (离开, "已交 · 2/4",
 * the round countdown), what the player sent (a drawing contain-fitted, or the sentence, or the marker, on a note),
 * "等大家交… 3/5 已交", and what comes next ("下一轮：猜一句" / "最后一轮了" / "马上揭晓"). `passing` shows "传递中…".
 * `offlineText` ("网络不好，正在重连…") replaces the next line. No ads, no 举报 here (nothing of others is shown).
 * Hit ids: roundWait:back.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Strokes = require('./strokes');
const Ch = require('./chrome');
const MARKERS = require('./describe').MARKER_TEXT;
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const g = Ch.topBar(ctx, L, hits, { back: '离开', backId: 'roundWait:back', title: vm.title || '', timer: vm.timer || { secLeft: 0, warn: false } });

  // ---- text block pinned to the bottom
  const lh1 = Math.round(T.FS.title * 1.35);
  const lh2 = Math.round(T.FS.bodyL * 1.45);
  const bw = Math.min(L.W - 32, 520);
  const bx = Math.round((L.W - bw) / 2);
  const l1 = W.wrapBalanced(ctx, vm.passing ? '传递中…' : vm.progressText || '', bw, T.FS.title, 800).slice(0, 2);
  const second = vm.offlineText || vm.nextText || '';
  const l2 = second ? W.wrapBalanced(ctx, second, bw, T.FS.bodyL, 600).slice(0, 2) : [];
  const blockH = l1.length * lh1 + (l2.length ? 6 + l2.length * lh2 : 0);
  const blockY = L.bottomEdge - 16 - blockH;
  l1.forEach((ln, i) => W.text(ctx, ln, L.W / 2, blockY + i * lh1 + lh1 / 2, { size: T.FS.title, weight: 800, align: 'center' }));
  l2.forEach((ln, i) => W.text(ctx, ln, L.W / 2, blockY + l1.length * lh1 + 6 + i * lh2 + lh2 / 2, { size: T.FS.bodyL, weight: 600, color: vm.offlineText ? C.vermText : C.sub, align: 'center' }));

  // ---- what I sent: fills the space between the bar and the text
  const top = g.y + g.h + 8;
  const area = { x: 8, y: top, w: L.W - 16, h: Math.max(80, blockY - 12 - top) };
  const mine = vm.mine || {};
  let drawn = null;
  if (mine.strokes) {
    drawn = Strokes.drawStrokes(ctx, mine.strokes, area, { cacheKey: 'wait:' + (vm.roomId || '') + ':' + (vm.round || ''), rev: (vm.round || 0) + ':' + (mine.strokes.s ? mine.strokes.s.length : 0), dpr: L.dpr, frame: true });
  } else {
    W.card(ctx, area.x, area.y, area.w, area.h, { r: 14, shadow: false });
    W.tape(ctx, area.x + area.w / 2, area.y, 56, 0.04);
    const txt = mine.marker ? MARKERS[mine.marker] || '' : mine.text || '';
    const size = T.FS.title + (T.isLarge() ? 0 : 2);
    const lh = Math.round(size * 1.4);
    const lines = W.wrapBalanced(ctx, txt, area.w - 32, size, 800).slice(0, 4);
    lines.forEach((ln, i) => W.text(ctx, ln, area.x + area.w / 2, area.y + area.h / 2 + (i - (lines.length - 1) / 2) * lh, { size, weight: 800, color: mine.marker ? C.sub : C.ink, align: 'center' }));
  }
  const out = hits.result();
  out.mineRect = area;
  if (drawn) out.paper = drawn;
  return out;
}

module.exports = { draw };
