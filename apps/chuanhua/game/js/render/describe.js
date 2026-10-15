/**
 * Describe screen, 第 2/4/6 棒 (spec 8.5). draw(ctx, vm, layout) -> hitAreas.
 *
 * The previous drawing is rendered from strokes (static); the input is drawn
 * on the canvas and the native keyboard (wx.showKeyboard) sits below it. When
 * the keyboard is open, pass its height as vm.keyboardH and the drawing
 * shrinks so box + button stay visible.
 *
 * vm = spec 12 Describe model plus extras: display, sheet, keyboardH (px,
 *   default 0), focused (bool, default true), t (ms; caret blink),
 *   placeholder (default 你觉得这画的是什么？).
 * Status copy is renderer-owned: blocked, busy; error uses errorText.
 * Hit ids: back (放弃), describe:input, describe:submit, describe:report,
 *   describe:timeUpOk, describe:lock (swallows taps), plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const F = require('./fields');
const S = require('./strokes');
const sheets = require('./sheets');
const { Hits } = require('./layout');
const C = T.COLORS;

const MSG = { blocked: '这句话没通过审核，换个说法吧', busy: '审核服务繁忙，请稍后再试' };

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  const status = vm.status || 'typing';
  const x = L.x0;
  const w = L.contentW;
  const kb = Math.max(0, vm.keyboardH || 0);
  const edge = L.bottomEdge - kb;

  W.backButton(ctx, L, hits, '放弃', 'back');
  const t = vm.timer || { secLeft: 0, warn: false };
  F.timerPill(ctx, L.navFreeX + L.navFreeW / 2, L.navMidY, t.secLeft, t.warn, L.navFreeW);

  let y = L.navBottom + L.u(4);
  const headH = Math.round(T.FS.body * 1.6);
  W.text(ctx, vm.title || '猜一猜', x + 2, y + headH / 2, { size: T.FS.body, weight: 800, round: true, color: C.zhuText, maxW: w - 100 });
  if (vm.canReport) W.link(ctx, hits, { id: 'describe:report', x: x + w, y: y + headH / 2, label: '举报', icon: 'flag', align: 'right', color: C.sub, size: T.FS.small });
  y += headH + 2;
  const drawingTop = y;

  // bottom stack: submit, error line, input, label
  const bh = W.btnH(L);
  const gap = L.u(8);
  const text = vm.text || '';
  const inputH = F.inputHeight(ctx, text, w);
  const msg = status === 'error' ? vm.errorText || '没传出去，请重试' : MSG[status] || null;
  const msgLh = Math.round(T.FS.body * 1.45);
  const msgH = msg ? W.paragraphH(ctx, msg, w - 8, msgLh, { size: T.FS.body, weight: 700 }) + 4 : 0;
  const labelH = kb ? 0 : Math.round(T.FS.bodyL * 1.5);
  let by = edge - L.bottomPad - bh;
  const submitY = by;
  by -= gap + msgH;
  const msgY = by + (msgH ? 2 : 0);
  by -= (msgH ? 2 : 0) + inputH;
  const inputY = by;
  by -= labelH + 2;
  const labelY = by;
  by -= gap;
  const avail = by - drawingTop;
  const size = kb ? Math.min(w, avail) : Math.max(120, Math.min(w, avail));
  const showDrawing = size >= 72;
  const rect = { x: x + (w - size) / 2, y: drawingTop + Math.max(0, (avail - size) / 2), w: size, h: size };

  if (showDrawing) W.sticker(ctx, rect.x, rect.y, rect.w, rect.h, 6, { off: 3 });
  if (showDrawing) S.draw(ctx, vm.drawing && vm.drawing.s ? vm.drawing : null, rect, { bg: '#FFFFFF', radius: 5 });

  if (!kb) W.text(ctx, '这画的是：', x + 2, labelY + labelH / 2, { size: T.FS.bodyL, weight: 800, round: true });
  const ih = F.inputBox(ctx, x, inputY, w, { text, placeholder: vm.placeholder || '你觉得这画的是什么？', count: vm.count, focused: vm.focused !== false && status !== 'submitting', t: vm.t, error: status === 'blocked' });
  hits.add('describe:input', x, inputY, w, ih);
  if (msg) W.paragraph(ctx, msg, x + 4, msgY, w - 8, msgLh, { size: T.FS.body, weight: 700, color: status === 'busy' ? C.orangeText : C.zhuText });

  const label = status === 'submitting' ? '审核中…' : status === 'error' ? '重试' : '传出去';
  W.button(ctx, L, hits, { id: 'describe:submit', x, y: submitY, w, h: bh, label, kind: 'primary', disabled: status === 'submitting' || status === 'timeUp' || (status !== 'error' && !vm.canSubmit) });

  if (status === 'timeUp') {
    ctx.fillStyle = C.scrim;
    ctx.fillRect(0, 0, L.W, L.H);
    hits.add('describe:lock', 0, 0, L.W, L.H);
    const m2 = '时间到，这一棒交给别人吧';
    const pw = Math.min(w, L.u(320));
    const lh = Math.round(T.FS.bodyL * 1.5);
    const ph = W.paragraphH(ctx, m2, pw - 40, lh, { size: T.FS.bodyL + 2, weight: 800, round: true });
    const boxH = ph + 40 + bh + 16;
    const bx = (L.W - pw) / 2;
    const byy = Math.max(L.navBottom, (edge - boxH) / 2);
    W.sticker(ctx, bx, byy, pw, boxH, 16, { fill: C.sheet });
    W.paragraph(ctx, m2, bx + 20, byy + 20, pw - 40, lh, { size: T.FS.bodyL + 2, weight: 800, round: true, align: 'center' });
    W.button(ctx, L, hits, { id: 'describe:timeUpOk', x: bx + 20, y: byy + 20 + ph + 16, w: pw - 40, h: bh, label: '好', kind: 'primary' });
  }

  sheets.drawSheet(ctx, vm, L, hits);
  const res = hits.result();
  res.drawingRect = rect;
  return res;
}

module.exports = { draw };
