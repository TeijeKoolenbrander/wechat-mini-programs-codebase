/**
 * Draw screen, 第 1/3/5 棒 (spec 8.4). draw(ctx, vm, layout) -> hitAreas.
 *
 * Layout (portrait, one thumb): the timer sits in the capsule row next to
 * 放弃, the previous 棒 / prompt strip is two lines at most, the square canvas
 * takes every pixel the tools do not need, and tools + 画好了 are pinned in the
 * bottom 40%.
 *
 * vm = spec 12 Draw model plus extras:
 *   display, sheet, coach (bool: first-ever draw turn, show the 3 s coach line),
 *   keyboardH (unused here), t (ms)
 * Palette: vm.palette[].locked swatches are not drawn (the 今日彩笔 button
 * unlocks them); selection is vm.colorIdx / vm.sizeIdx.
 * The canvas rect is the hit area `draw:canvas` {x,y,w,h}; its width maps to
 * the 1024 grid (grid = (touch - rect) * 1024 / rect.w). Never start a stroke
 * on any other hit id.
 * Hit ids: back (放弃), draw:canvas, draw:color:<idx>, draw:size:<0|1|2>,
 *   draw:undo, draw:clear, draw:submit, draw:paletteAd, draw:report,
 *   draw:retry, draw:timeUpOk, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const F = require('./fields');
const S = require('./strokes');
const sheets = require('./sheets');
const { Hits } = require('./layout');
const C = T.COLORS;

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

/** Heading row + source card. Returns height; draws when `go`. */
function sourceStrip(ctx, hits, vm, L, x, y, w) {
  const src = vm.source || { kind: 'text', text: '' };
  const size = T.FS.bodyL;
  const lh = Math.round(size * 1.38);
  const label = src.kind === 'prompt' ? '题目：「' : '上一棒说：「';
  const full = label + (src.text || '') + '」';
  const lines = Math.min(2, W.wrap(ctx, full, w - 24, size, 700).length);
  const headH = Math.round(T.FS.body * 1.6);
  const cardH = lines * lh + 16;
  W.text(ctx, vm.title || '画出来', x + 2, y + headH / 2, { size: T.FS.body, weight: 800, round: true, color: C.zhuText, maxW: w - 100 });
  if (vm.canReport) W.link(ctx, hits, { id: 'draw:report', x: x + w, y: y + headH / 2, label: '举报', icon: 'flag', align: 'right', color: C.sub, size: T.FS.small });
  const cy = y + headH + 2;
  W.sticker(ctx, x, cy, w, cardH, 12, { off: 2 });
  W.paragraph(ctx, full, x + 12, cy + 8, w - 24, lh, { size, weight: 700, maxLines: 2 });
  return headH + 2 + cardH + 2;
}

function swatches(ctx, hits, vm, L, x, y, w, rowH) {
  const items = (vm.palette || []).filter((p) => !p.locked);
  const perRow = Math.min(6, Math.max(1, items.length));
  const pitch = w / 6;
  const d = Math.min(40, pitch - 6);
  items.forEach((p, i) => {
    const r = Math.floor(i / 6);
    const cx = x + (i % 6) * pitch + pitch / 2;
    const cy = y + r * rowH + rowH / 2;
    const sel = vm.colorIdx === p.idx;
    if (sel) {
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2 + 5, 0, Math.PI * 2);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = p.color || T.PALETTE[p.idx];
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (sel) W.iconCheck(ctx, cx, cy, d * 0.5, isDark(p.color || T.PALETTE[p.idx]) ? '#FFFFFF' : '#1E1B18', 3);
    if (vm.status === 'drawing' || vm.status == null) hits.add('draw:color:' + p.idx, cx - Math.max(24, pitch / 2), cy - Math.max(24, rowH / 2), Math.max(48, pitch), Math.max(48, rowH));
  });
  void perRow;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  const status = vm.status || 'drawing';
  const live = status === 'drawing';
  const x = L.x0;
  const w = L.contentW;

  // ---- nav row: 放弃 + timer
  W.backButton(ctx, L, hits, '放弃', 'back');
  const t = vm.timer || { secLeft: 0, warn: false };
  F.timerPill(ctx, L.navFreeX + L.navFreeW / 2, L.navMidY, t.secLeft, t.warn, L.navFreeW);

  // ---- strip
  let y = L.navBottom + L.u(4);
  y += sourceStrip(ctx, hits, vm, L, x, y, w);
  const stripBottom = y + L.u(4);

  // ---- bottom stack
  const bh = W.btnH(L);
  const toolH = T.MODE.largeText ? 56 : 48;
  const pal = (vm.palette || []).filter((p) => !p.locked);
  const palRows = Math.max(1, Math.ceil(pal.length / 6));
  const rowH = 46;
  const gap = L.u(6);
  let by = L.bottomEdge - L.bottomPad - bh;
  const submitY = by;
  by -= gap + toolH;
  const toolY = by;
  by -= gap + palRows * rowH;
  const palY = by;
  by -= gap;
  const avail = by - stripBottom;
  const size = Math.max(120, Math.min(w, avail));
  const cx0 = x + (w - size) / 2;
  const cy0 = stripBottom + Math.max(0, (avail - size) / 2);
  const rect = { x: cx0, y: cy0, w: size, h: size };

  // ---- canvas
  W.sticker(ctx, rect.x, rect.y, rect.w, rect.h, 6, { off: 3 });
  const strokes = vm.strokes && vm.strokes.s ? vm.strokes : null;
  const empty = !strokes || !strokes.s.length;
  S.draw(ctx, strokes, rect, { bg: '#FFFFFF', radius: 5 });
  if (empty && !vm.coach) W.text(ctx, '在这里画', rect.x + rect.w / 2, rect.y + rect.h / 2, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center', alpha: 0.45 });
  if (live) hits.add('draw:canvas', rect.x, rect.y, rect.w, rect.h);

  if (vm.coach) {
    const msg = '一根手指画，画得丑没关系，越离谱越好笑';
    const lh = Math.round(T.FS.body * 1.45);
    const ch = W.paragraphH(ctx, msg, rect.w - 56, lh, { size: T.FS.body, weight: 700 }) + 20;
    W.sticker(ctx, rect.x + 14, rect.y + 14, rect.w - 28, ch, 12, { fill: C.orangeSoft === '#FFFFFF' ? C.card : '#FFF1D6', off: 2 });
    W.paragraph(ctx, msg, rect.x + 28, rect.y + 24, rect.w - 56, lh, { size: T.FS.body, weight: 700 });
  }
  const used = vm.pointsUsed || 0;
  const max = vm.pointsMax || 4000;
  if (used >= max) {
    const msg = '画得太细啦，先交吧';
    W.sticker(ctx, rect.x + 14, rect.y + 14, rect.w - 28, Math.round(T.FS.bodyL * 2), 12, { fill: '#FFF1D6', off: 2 });
    W.text(ctx, msg, rect.x + rect.w / 2, rect.y + 14 + T.FS.bodyL, { size: T.FS.bodyL, weight: 800, align: 'center', maxW: rect.w - 40 });
  }
  const ad = vm.paletteAd;
  if (ad && ad.show && live && empty) {
    const labels = { idle: '今日彩笔 +6色', loading: '加载中…', playing: '播放中…', error: '再试一次' };
    const bw2 = Math.min(rect.w - 28, L.u(196));
    const bhh = Math.max(T.MIN_TAP, W.btnH(L, true));
    W.button(ctx, L, hits, { id: 'draw:paletteAd', x: rect.x + rect.w / 2 - bw2 / 2, y: rect.y + rect.h - bhh - 14, w: bw2, h: bhh, label: labels[ad.state || 'idle'], kind: 'ad', size: T.FS.body, disabled: ad.state === 'loading' || ad.state === 'playing' });
  }

  // ---- palette
  swatches(ctx, hits, vm, L, x, palY, w, rowH);

  // ---- tools: 3 sizes + undo + clear
  const unit = 48;
  const gapT = L.u(6);
  const textW = (w - 3 * unit - 4 * gapT) / 2;
  let tx = x;
  [0, 1, 2].forEach((i) => {
    const sel = (vm.sizeIdx == null ? 1 : vm.sizeIdx) === i;
    const d = [7, 14, 24][i];
    W.sticker(ctx, tx, toolY + (toolH - unit) / 2, unit, unit, 12, { fill: sel ? C.orangeSoft === '#FFFFFF' ? C.card : '#FFE3B0' : C.card, off: sel ? 0 : 2, lw: sel ? W.bw() + 1 : W.bw() });
    ctx.beginPath();
    ctx.arc(tx + unit / 2, toolY + toolH / 2, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    if (live) hits.add('draw:size:' + i, tx, toolY + (toolH - unit) / 2, unit, unit);
    tx += unit + gapT;
  });
  tx += gapT;
  [
    ['draw:undo', '撤销', vm.canUndo],
    ['draw:clear', '清空', vm.canUndo],
  ].forEach(([id, label, en]) => {
    const enabled = !!en && live;
    W.button(ctx, L, hits, { id, x: tx, y: toolY + (toolH - unit) / 2, w: textW, h: unit, label, kind: 'secondary', size: T.FS.body, disabled: !enabled });
    tx += textW + gapT;
  });

  // ---- submit
  W.button(ctx, L, hits, { id: 'draw:submit', x, y: submitY, w, h: bh, label: status === 'submitting' ? '正在传出…' : '画好了', kind: 'primary', disabled: !vm.canSubmit || !live });

  // ---- status overlays
  if (status === 'submitting') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const lab = '正在传出…';
    const pw = W.measure(ctx, lab, T.FS.bodyL, 800, true) + 40;
    W.sticker(ctx, rect.x + rect.w / 2 - pw / 2, rect.y + rect.h / 2 - 24, pw, 48, 24, {});
    W.text(ctx, lab, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: T.FS.bodyL, weight: 800, round: true, align: 'center' });
    hits.add('draw:lock', rect.x, rect.y, rect.w, rect.h);
  } else if (status === 'error') {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const msg = vm.errorText || '没传出去';
    const lh = Math.round(T.FS.bodyL * 1.45);
    const pw = rect.w - 40;
    const ph = W.paragraphH(ctx, msg, pw - 28, lh, { size: T.FS.bodyL, weight: 800 });
    const bhh = W.btnH(L, true);
    const boxH = ph + 28 + bhh + 12;
    const by2 = rect.y + rect.h / 2 - boxH / 2;
    W.sticker(ctx, rect.x + 20, by2, pw, boxH, 14, {});
    W.paragraph(ctx, msg, rect.x + 34, by2 + 14, pw - 28, lh, { size: T.FS.bodyL, weight: 800, color: C.zhuText, align: 'center' });
    W.button(ctx, L, hits, { id: 'draw:retry', x: rect.x + 34, y: by2 + 14 + ph + 12, w: pw - 28, h: bhh, label: '重试', kind: 'primary' });
    hits.add('draw:lock', rect.x, rect.y, rect.w, rect.h);
  } else if (status === 'timeUp') {
    ctx.fillStyle = C.scrim;
    ctx.fillRect(0, 0, L.W, L.H);
    hits.add('draw:lock', 0, 0, L.W, L.H);
    const msg = '时间到，这一棒交给别人吧';
    const pw = Math.min(w, L.u(320));
    const lh = Math.round(T.FS.bodyL * 1.5);
    const ph = W.paragraphH(ctx, msg, pw - 40, lh, { size: T.FS.bodyL + 2, weight: 800, round: true });
    const boxH = ph + 40 + bh + 16;
    const bx = (L.W - pw) / 2;
    const byy = Math.max(L.navBottom, (L.H - boxH) / 2);
    W.sticker(ctx, bx, byy, pw, boxH, 16, { fill: C.sheet });
    W.paragraph(ctx, msg, bx + 20, byy + 20, pw - 40, lh, { size: T.FS.bodyL + 2, weight: 800, round: true, align: 'center' });
    W.button(ctx, L, hits, { id: 'draw:timeUpOk', x: bx + 20, y: byy + 20 + ph + 16, w: pw - 40, h: bh, label: '好', kind: 'primary' });
  }

  sheets.drawSheet(ctx, vm, L, hits);
  const res = hits.result();
  res.canvasRect = rect;
  return res;
}

module.exports = { draw };
