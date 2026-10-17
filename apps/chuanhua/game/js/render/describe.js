/**
 * Describe screen (spec 8.5, 5.5, 5.8). Live 猜一猜 and 慢慢传 第 N 棒 share it. States
 * typing | sending | blocked | busy | error | timeUp.
 *
 * Top bar (as on the draw screen) -> the previous drawing, contain-fitted and centred in ALL the space above the input
 * (margin tone around it, strokes.js) -> the canvas-drawn input (placeholder 你觉得这画的是什么？, counter "7/16") ->
 * 传出去. Rects at 375 x 812: drawing 8,140,359,510; input 8,658,359,56; submit 8,722,359,48. At 320 x 568: drawing
 * 8,120,304,328; input 8,456,304,48; submit 8,512,304,48. Status text is drawn over the drawing's bottom, so nothing
 * moves. With the keyboard open (vm.keyboardH > 0, TD-75): a small drawing at the left with the label and counter beside it,
 * then the input with 传出去 beside it, all above the keyboard. Time up: input locked, every hit area gone except
 * describe:block over the window.
 * Marker source (上一棒没来得及画 / 这一棒没传过来): the marker text on a plain note plus the free-play hint; hidden / paused:
 * a placeholder note.
 * Hit ids: describe:back, describe:report, describe:input, describe:submit, describe:retry, describe:block.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Strokes = require('./strokes');
const Ch = require('./chrome');
const C = T.COLORS;

const GAP = 8;
/** fixed system text of the marker steps (core/copy.js#MARKERS) */
const MARKER_TEXT = { emptyDraw: '（没来得及画）', emptyText: '（没来得及写）', notDelivered: '（这一棒没传过来）' };

function inputH(L) {
  return T.isLarge() ? 72 : L.compact ? 48 : 56;
}

/** rects (pt). o: {keyboardH?: number, display?} */
function geometry(L, o) {
  o = o || {};
  if (o.display) T.applyDisplay(o.display);
  const rh = Ch.barH();
  const bar = Ch.barGeometry(L, { timer: true, report: true });
  const kb = o.keyboardH > 0 ? o.keyboardH : 0;
  const ih = inputH(L);
  const full = L.W - 16;
  if (!kb) {
    const submit = { x: 8, y: L.bottomEdge - GAP - rh, w: full, h: rh };
    const input = { x: 8, y: submit.y - GAP - ih, w: full, h: ih };
    const top = bar.y + bar.h + GAP;
    return { bar, kb: 0, drawing: { x: 8, y: top, w: full, h: Math.max(64, input.y - GAP - top) }, input, submit };
  }
  const bottom = Math.min(L.bottomEdge - GAP, L.H - kb - GAP);
  const labelSize = T.FS.bodyL;
  const subW = Math.max(88, 20 * 3 + 28);
  const input = { x: 8, y: bottom - ih, w: full - subW - GAP, h: ih };
  const submit = { x: input.x + input.w + GAP, y: input.y, w: subW, h: ih };
  const top = bar.y + bar.h + 2;
  const side = Math.max(64, Math.min(140, input.y - GAP - top));
  void labelSize;
  return { bar, kb, drawing: { x: 8, y: top, w: side, h: side }, input, submit };
}

function countWarn(count) {
  return /^(1[6-9]|[2-9]\d)\//.test(count || '');
}

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const status = vm.status || 'typing';
  const locked = !!vm.inputLocked || status === 'sending' || status === 'timeUp';
  const g = geometry(L, { keyboardH: vm.keyboardH });
  const kb = g.kb;
  const src = vm.source || { kind: 'draw', strokes: { v: 2, h: 1024, s: [] } };

  Ch.topBar(ctx, L, hits, {
    back: vm.backLabel || '离开', backId: 'describe:back', title: vm.title || '',
    timer: vm.timer || { secLeft: 0, warn: false }, report: { id: 'describe:report', show: !!vm.canReport }, locked,
  });

  // ---- the previous drawing (or its stand-in)
  const dr = g.drawing;
  let drawn = null;
  if (src.kind === 'draw') {
    drawn = Strokes.drawStrokes(ctx, src.strokes || { v: 2, h: 1024, s: [] }, dr, {
      cacheKey: 'describe:' + (vm.roomId || vm.chainId || '') + ':' + (vm.round || vm.step || ''), rev: vm.roomId || vm.chainId + ':' + (vm.round || vm.step), dpr: L.dpr, frame: true,
    });
  } else {
    W.card(ctx, dr.x, dr.y, dr.w, dr.h, { r: 12, shadow: false });
    const big = kb ? T.FS.body : T.FS.title;
    if (src.kind === 'marker') {
      const mt = MARKER_TEXT[src.marker] || '';
      const lh = Math.round(big * 1.4);
      const lines = W.wrapBalanced(ctx, mt, dr.w - 24, big, 800);
      const hint = kb ? [] : W.wrapBalanced(ctx, src.hint || '', dr.w - 24, T.FS.bodyL, 500);
      const hlh = Math.round(T.FS.bodyL * 1.45);
      const total = lines.length * lh + (hint.length ? 12 + hint.length * hlh : 0);
      let y = dr.y + (dr.h - total) / 2;
      lines.forEach((ln, i) => W.text(ctx, ln, dr.x + dr.w / 2, y + i * lh + lh / 2, { size: big, weight: 800, align: 'center' }));
      y += lines.length * lh + 12;
      hint.forEach((ln, i) => W.text(ctx, ln, dr.x + dr.w / 2, y + i * hlh + hlh / 2, { size: T.FS.bodyL, color: C.sub, align: 'center' }));
    } else {
      const txt = src.hint || (src.kind === 'paused' ? '内容维护中' : '该内容已被举报隐藏');
      const fs = kb ? T.FS.body : T.FS.bodyL;
      const lines = W.wrapBalanced(ctx, txt, dr.w - 24, fs, 700);
      const lh = Math.round(fs * 1.4);
      lines.forEach((ln, i) => W.text(ctx, ln, dr.x + dr.w / 2, dr.y + dr.h / 2 + (i - (lines.length - 1) / 2) * lh, { size: fs, weight: 700, color: C.sub, align: 'center' }));
    }
  }

  const msg = status === 'sending' ? vm.errorText || '审核中…' : status === 'timeUp' ? vm.errorText || '时间到，正在交出…' : status === 'blocked' || status === 'busy' || status === 'error' ? vm.errorText || '' : '';

  // ---- keyboard-open label column
  if (kb) {
    const colX = dr.x + dr.w + 14;
    const colR = g.input.x + g.input.w + GAP + g.submit.w;
    if (!msg) W.text(ctx, '上一棒的画', colX, dr.y + 14, { size: T.FS.body, weight: 700, color: C.sub, maxW: colR - colX });
    W.text(ctx, '这画的是：', colX, dr.y + dr.h - Math.round(T.FS.bodyL * 0.8), { size: T.FS.bodyL, weight: 800, maxW: colR - colX - 56 });
    const shk = vm.shake ? Math.sin((vm.t || 0) / 28) * 3 : 0;
    W.text(ctx, vm.count || '', colR + shk, dr.y + dr.h - Math.round(T.FS.bodyL * 0.8), { size: T.FS.body, weight: 800, color: countWarn(vm.count) ? C.vermText : C.sub, align: 'right' });
  }

  // ---- status over the drawing's bottom
  if (msg && !kb) Ch.statusStrip(ctx, L, hits, dr, msg, { kind: status === 'sending' ? 'ok' : 'bad', action: status === 'error' ? { id: 'describe:retry', label: '重试' } : null });
  else if (msg) {
    // keyboard open: the message takes the caption's place beside the small drawing (nothing else moves)
    const colX = dr.x + dr.w + 14;
    const colR = g.input.x + g.input.w + GAP + g.submit.w;
    const ml = W.wrap(ctx, msg, colR - colX, T.FS.body, 700).slice(0, 2);
    ml.forEach((ln, i) => W.text(ctx, ln, colX, dr.y + 14 + i * Math.round(T.FS.body * 1.3), { size: T.FS.body, weight: 700, color: status === 'sending' ? C.ink : C.vermText }));
  }

  // ---- input box
  const ib = g.input;
  const bad = status === 'blocked' || status === 'busy' || status === 'error';
  W.card(ctx, ib.x, ib.y, ib.w, ib.h, { r: 14, shadow: false, stroke: status === 'blocked' ? C.vermText : C.ink, lw: bad ? 2.5 : 2, fill: locked ? C.disabledFill : C.card });
  const text = vm.text || '';
  const tsize = T.isLarge() ? T.FS.body : T.FS.bodyL;
  const countW = kb ? 0 : W.measure(ctx, vm.count || '', T.FS.body, 800) + 8;
  const innerW = ib.w - 24 - countW;
  const shakeX = vm.shake ? Math.sin((vm.t || 0) / 28) * 3 : 0;
  let lines;
  let fsz = tsize;
  if (!text) lines = [];
  else {
    lines = [text];
    // one line when it fits (down to the minimum size), else two lines at the minimum size
    let s = tsize;
    while (s > T.FS.body && W.measure(ctx, text, s, 700) > innerW) s--;
    if (W.measure(ctx, text, s, 700) > innerW) {
      s = T.FS.body;
      lines = W.wrap(ctx, text, innerW, s, 700).slice(0, 2);
    }
    fsz = s;
  }
  const lh = lines.length > 1 ? Math.round(fsz * 1.2) : Math.round(fsz * 1.35);
  const top = ib.y + (ib.h - Math.max(1, lines.length) * lh) / 2;
  let caretX = ib.x + 12;
  let caretY = ib.y + ib.h / 2;
  if (lines.length) {
    lines.forEach((ln, i) => W.text(ctx, ln, ib.x + 12, top + i * lh + lh / 2, { size: fsz, weight: 700, color: locked ? C.disabledInk : C.ink }));
    caretX = ib.x + 12 + W.measure(ctx, lines[lines.length - 1], fsz, 700) + 2;
    caretY = top + (lines.length - 1) * lh + lh / 2;
  } else {
    W.text(ctx, '你觉得这画的是什么？', ib.x + 12, ib.y + ib.h / 2, { size: tsize, color: C.sub, maxW: innerW });
  }
  if (vm.caret && !locked && lines.length) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(Math.min(caretX, ib.x + ib.w - countW - 14), caretY - lh * 0.4, 2, lh * 0.8);
  }
  if (!kb) W.text(ctx, vm.count || '', ib.x + ib.w - 12 + shakeX, ib.y + ib.h / 2, { size: T.FS.body, weight: 800, color: countWarn(vm.count) ? C.vermText : C.sub, align: 'right' });
  if (!locked) hits.add('describe:input', ib.x, ib.y, ib.w, ib.h);

  // ---- submit
  const sb = g.submit;
  W.button(ctx, L, hits, {
    id: kb && status === 'error' ? 'describe:retry' : 'describe:submit', x: sb.x, y: sb.y, w: sb.w, h: sb.h,
    label: status === 'sending' ? '审核中…' : status === 'timeUp' ? '正在交出…' : kb && status === 'error' ? '重试' : '传出去', kind: 'primary',
    size: kb ? T.FS.bodyL : undefined, disabled: locked || (!vm.canSubmit && !(kb && status === 'error')),
  });
  if (locked) hits.add('describe:block', 0, 0, L.W, L.H);
  const out = hits.result();
  out.drawing = { x: dr.x, y: dr.y, w: dr.w, h: dr.h };
  out.input = { x: ib.x, y: ib.y, w: ib.w, h: ib.h };
  if (drawn) out.paper = drawn;
  out.geometry = g;
  return out;
}

module.exports = { draw, geometry, MARKER_TEXT };
