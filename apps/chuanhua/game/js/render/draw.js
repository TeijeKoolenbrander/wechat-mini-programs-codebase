/**
 * Draw screen (spec 8.4, 5.1, 5.8; F-3, F-4, PO-38). Live 画出来 and 慢慢传 第 N 棒 share it. States
 * drawing | sending | blocked | error | timeUp.
 *
 * Top to bottom, 8 pt side margins and 8 pt gaps, nothing else: top bar (back, title, 举报, countdown) -> source strip
 * (1-2 lines) -> CANVAS, which fills every bit of the free space -> colour row (+ a second row while 今日彩笔 is unlocked)
 * -> tool row (撤销, 清空, 粗细 toggle, 画好了). The canvas rect is a pure function of the window, the strip's line
 * count and whether 今日彩笔 is unlocked, so logic computes it at turn open with geometry() / canvasRectFor() and it
 * never moves during the turn (AC 126): status text is drawn OVER the canvas bottom. `h` (the stored logical height) is
 * round(1024 * canvas.h / canvas.w) clamped to 768-2048; when the free space is outside the clamp the canvas is reduced
 * to the clamped aspect and centred (strokes.canvasFor).
 *
 * Input contract: see CONTRACT.md "Drawing canvas input contract". Time up / sending: every hit area is gone except
 * draw:block over the whole window, so every touch and button is inert (AC 128).
 * Hit ids: draw:back, draw:report, draw:canvas, draw:color:<0-11>, draw:size, draw:undo, draw:clear, draw:submit,
 * draw:retry, coach:next, draw:block.
 * vm extras read (optional): vm.drawingNow (a finger is down: the last stroke is smoothed for display).
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Strokes = require('./strokes');
const Ch = require('./chrome');
const C = T.COLORS;

const GAP = 8;

function stripLineH() {
  return T.isLarge() ? 28 : 24;
}

function stripSize() {
  return T.isLarge() ? 20 : 17;
}

/** the one-line text of the source strip (renderer-owned prefixes, spec 8.4 copy) */
function sourceText(src) {
  if (!src) return '';
  if (src.kind === 'prompt') return '题目：「' + (src.text || '') + '」';
  if (src.kind === 'text') return '上一棒说：「' + (src.text || '') + '」';
  return src.hint || src.text || '';
}

/** 1 or 2: how many lines the strip needs for this source at this window width and display mode */
function sourceLinesFor(ctx, L, display, source) {
  if (display) T.applyDisplay(display);
  const lines = W.wrap(ctx, sourceText(source), L.W - 32 - 8, stripSize(), 600);
  return lines.length > 1 ? 2 : 1;
}

/**
 * All rects of the draw screen (pt, window coordinates). o: {sourceLines: 1|2, unlocked: boolean, display?}.
 * Pure arithmetic from the layout: this is what logic calls at turn open.
 * @returns {{bar, strip, free, canvas:{x,y,w,h}, gridH:number, colourRows:{y:number,h:number}[], toolRow, buttons}}
 */
function geometry(L, o) {
  o = o || {};
  if (o.display) T.applyDisplay(o.display);
  const rh = Ch.barH();
  const bar = Ch.barGeometry(L, { timer: true, report: true });
  const lines = o.sourceLines === 2 ? 2 : 1;
  const strip = { x: 16, y: bar.y + bar.h, w: L.W - 32, h: lines * stripLineH() + 16, lines };
  const toolRow = { x: 8, y: L.bottomEdge - GAP - rh, w: L.W - 16, h: rh };
  const nRows = o.unlocked ? 2 : 1;
  const colourRows = [];
  for (let i = 0; i < nRows; i++) colourRows.unshift({ x: 8, y: toolRow.y - (i + 1) * (GAP + rh), w: L.W - 16, h: rh });
  // colourRows[0] is the top row (colours 6-11 when unlocked); the last one is the base row (0-5)
  const free = { x: 8, y: strip.y + strip.h + GAP, w: L.W - 16, h: colourRows[0].y - GAP - (strip.y + strip.h + GAP) };
  free.h = Math.max(free.h, 96);
  const c = Strokes.canvasFor(free);
  // the tool row: three small buttons then the primary
  const small = toolRow.w >= 340 ? 64 : 56;
  const buttons = {
    undo: { x: toolRow.x, y: toolRow.y, w: small, h: rh },
    clear: { x: toolRow.x + small + GAP, y: toolRow.y, w: small, h: rh },
    size: { x: toolRow.x + 2 * (small + GAP), y: toolRow.y, w: small, h: rh },
  };
  const sx = toolRow.x + 3 * (small + GAP);
  buttons.submit = { x: sx, y: toolRow.y, w: toolRow.x + toolRow.w - sx, h: rh };
  return { bar, strip, free, canvas: { x: c.x, y: c.y, w: c.w, h: c.h }, gridH: c.gridH, colourRows, toolRow, buttons };
}

/** convenience for logic: the canvas rect and logical height for a source, mode and unlock state */
function canvasRectFor(ctx, L, display, source, unlocked) {
  const lines = sourceLinesFor(ctx, L, display, source);
  const g = geometry(L, { sourceLines: lines, unlocked: !!unlocked, display });
  return { x: g.canvas.x, y: g.canvas.y, w: g.canvas.w, h: g.canvas.h, gridH: g.gridH, sourceLines: lines };
}

function swatchRow(ctx, L, hits, g, row, items, vm, locked) {
  const n = 6;
  const tw = T.MIN_TAP;
  const pitch = (row.w - tw) / (n - 1);
  const sw = T.isLarge() ? 44 : 40;
  items.forEach((p, i) => {
    const tx = row.x + i * pitch;
    const cx = tx + tw / 2;
    const cy = row.y + row.h / 2;
    const on = vm.colorIdx === p.idx;
    if (on) {
      ctx.beginPath();
      ctx.arc(cx, cy, sw / 2 + 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, sw / 2, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = T.isHC() ? C.ink : 'rgba(30,27,24,0.55)';
    ctx.lineWidth = T.isHC() ? 2 : 1.5;
    ctx.stroke();
    if (on) W.iconCheck(ctx, cx, cy, sw * 0.45, Ch.darkColor(p.color) ? '#FFFFFF' : '#1E1B18');
    if (locked) {
      ctx.fillStyle = 'rgba(250,247,240,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, sw / 2, 0, Math.PI * 2);
      ctx.fill();
    } else hits.add('draw:color:' + p.idx, tx, row.y, tw, row.h);
  });
}

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const status = vm.status || 'drawing';
  const locked = !!vm.inputLocked || status === 'sending' || status === 'timeUp';
  const pal = vm.palette && vm.palette.length ? vm.palette : Strokes.COLORS.map((color, idx) => ({ idx, color, locked: idx >= Strokes.BASE_COLORS }));
  const unlocked = pal.some((p) => p.idx >= Strokes.BASE_COLORS && !p.locked);
  const lines = vm.sourceLines === 2 || vm.sourceLines === 1 ? vm.sourceLines : sourceLinesFor(ctx, L, null, vm.source);
  const g = geometry(L, { sourceLines: lines, unlocked });
  const rh = Ch.barH();

  // ---- top bar
  Ch.topBar(ctx, L, hits, {
    back: vm.backLabel || '离开', backId: 'draw:back', title: vm.title || '',
    timer: vm.timer || { secLeft: 0, warn: false }, report: { id: 'draw:report', show: !!vm.canReport }, locked,
  });

  // ---- source strip
  const src = vm.source || { kind: 'text', text: '' };
  const soft = src.kind === 'marker' || src.kind === 'hidden' || src.kind === 'paused';
  const slines = W.wrap(ctx, sourceText(src), g.strip.w - 8, stripSize(), 600).slice(0, 2);
  slines.forEach((ln, i) => W.text(ctx, ln, g.strip.x + 4, g.strip.y + 8 + i * stripLineH() + stripLineH() / 2, { size: stripSize(), weight: soft ? 500 : 700, color: soft ? C.sub : C.ink }));

  // ---- canvas
  const cv = g.canvas;
  const gridH = vm.gridH > 0 ? vm.gridH : g.gridH;
  const paper = Strokes.fit(cv.w, cv.h, gridH);
  Strokes.drawStrokes(ctx, vm.strokes || { v: 2, h: gridH, s: [] }, cv, {
    gridH, cacheKey: 'draw:' + (vm.roomId || vm.chainId || '') + ':' + (vm.round || vm.step || ''), rev: vm.strokesRev, dpr: L.dpr, live: !!vm.drawingNow, frame: true,
  });
  hits.add('draw:canvas', cv.x, cv.y, cv.w, cv.h);

  // status strip over the canvas bottom (never moves the canvas, AC 126)
  const sRect = { x: cv.x, y: cv.y, w: cv.w, h: cv.h };
  if (status === 'timeUp') Ch.statusStrip(ctx, L, hits, sRect, vm.statusText || '时间到，正在交出…', { kind: 'bad' });
  else if (status === 'sending') Ch.statusStrip(ctx, L, hits, sRect, vm.statusText || '正在交出…', { kind: 'ok' });
  else if (status === 'blocked') Ch.statusStrip(ctx, L, hits, sRect, vm.statusText || '这幅画没通过审核，改一改再交', { kind: 'bad' });
  else if (status === 'error') Ch.statusStrip(ctx, L, hits, sRect, vm.statusText || '没传出去', { kind: 'bad', action: { id: 'draw:retry', label: '重试' } });
  else if (vm.limitText || (vm.pointsMax && vm.pointsUsed >= vm.pointsMax)) Ch.statusStrip(ctx, L, hits, sRect, vm.limitText || '画得太细啦，先交吧', { kind: 'bad' });

  // coach line (first ever draw turn)
  if (vm.coach && !locked) {
    const txt = '一根手指画，画得丑没关系，越离谱越好笑';
    const cw = Math.min(cv.w - 16, 420);
    const lines2 = W.wrap(ctx, txt, cw - 24, T.FS.bodyL, 700);
    const lh = Math.round(T.FS.bodyL * 1.4);
    const ch = lines2.length * lh + 20 + Math.round(T.FS.body * 1.5);
    const cx = cv.x + (cv.w - cw) / 2;
    const cy = cv.y + 8;
    W.card(ctx, cx, cy, cw, ch, { r: 12, fill: '#FFF6DA' });
    W.tape(ctx, cx + cw / 2, cy, 56, -0.05);
    lines2.forEach((ln, i) => W.text(ctx, ln, cx + 12, cy + 10 + i * lh + lh / 2, { size: T.FS.bodyL, weight: 700 }));
    W.text(ctx, '点一下知道了', cx + cw - 12, cy + ch - 8 - Math.round(T.FS.body * 0.7), { size: T.FS.body, color: C.sub, align: 'right' });
    // only the dismiss corner is tappable: a stroke may start anywhere on the canvas, under the line too
    const hw = Math.min(cw, 160);
    const hh = Math.min(ch, T.MIN_TAP);
    hits.add('coach:next', cx + cw - hw, cy + ch - hh, hw, hh);
  }

  // ---- colour rows
  const base = pal.filter((p) => p.idx < Strokes.BASE_COLORS);
  const extra = pal.filter((p) => p.idx >= Strokes.BASE_COLORS);
  if (unlocked) {
    swatchRow(ctx, L, hits, g, g.colourRows[0], extra, vm, locked);
    swatchRow(ctx, L, hits, g, g.colourRows[1], base, vm, locked);
  } else swatchRow(ctx, L, hits, g, g.colourRows[0], base, vm, locked);

  // ---- tool row
  const b = g.buttons;
  const hasStrokes = !!(vm.strokes && ((vm.strokes.s && vm.strokes.s.length) || (Array.isArray(vm.strokes) && vm.strokes.length)));
  const bsize = T.isLarge() ? T.FS.body : T.FS.body + 1;
  W.button(ctx, L, hits, { id: 'draw:undo', x: b.undo.x, y: b.undo.y, w: b.undo.w, h: b.undo.h, label: '撤销', kind: 'secondary', size: bsize, disabled: locked || !vm.canUndo });
  W.button(ctx, L, hits, { id: 'draw:clear', x: b.clear.x, y: b.clear.y, w: b.clear.w, h: b.clear.h, label: '清空', kind: 'secondary', size: bsize, disabled: locked || !hasStrokes });
  // size toggle: a dot of the real relative width plus the word, never the dot alone
  {
    const r = b.size;
    const sz = vm.sizeIdx === 0 || vm.sizeIdx === 2 ? vm.sizeIdx : 1;
    const curColor = (pal.find((p) => p.idx === vm.colorIdx) || pal[0] || { color: '#1E1B18' }).color;
    W.fillRR(ctx, r.x, r.y, r.w, r.h, 14, locked ? C.disabledFill : C.card);
    W.strokeRR(ctx, r.x, r.y, r.w, r.h, 14, T.isHC() ? C.ink : C.lineStrong, 2);
    const d = (Strokes.SIZES[sz] / Strokes.SIZES[2]) * 22 + 2;
    ctx.beginPath();
    ctx.arc(r.x + r.w * 0.3, r.y + r.h / 2, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = locked ? C.disabledInk : curColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,27,24,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    W.text(ctx, ['细', '中', '粗'][sz], r.x + r.w * 0.7, r.y + r.h / 2 + 0.5, { size: bsize, weight: 700, color: locked ? C.disabledInk : C.ink, align: 'center' });
    if (!locked) hits.add('draw:size', r.x, r.y, r.w, r.h);
  }
  const sub = b.submit;
  const label = status === 'sending' || status === 'timeUp' ? '正在交出…' : '画好了';
  W.button(ctx, L, hits, { id: 'draw:submit', x: sub.x, y: sub.y, w: sub.w, h: sub.h, label, kind: 'primary', disabled: locked || !vm.canSubmit });
  void rh;

  if (locked) hits.add('draw:block', 0, 0, L.W, L.H);
  const out = hits.result();
  out.canvas = { x: cv.x, y: cv.y, w: cv.w, h: cv.h };
  out.gridH = gridH;
  out.paper = { x: cv.x + paper.ox, y: cv.y + paper.oy, w: paper.pw, h: paper.ph, scale: paper.scale };
  out.geometry = g;
  return out;
}

module.exports = { draw, geometry, canvasRectFor, sourceLinesFor, sourceText, mmss: Ch.mmss };
