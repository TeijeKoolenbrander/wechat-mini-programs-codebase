/**
 * Share card images (spec 9, PO-24, AC 95): 500 x 400 (5:4), always the standard look, NEVER a user drawing.
 *   kind 'invite' (慢慢传): our illustration + "传画接龙 · 已传 3/6 棒" + progress dots. No prompt, no 棒 text.
 *   kind 'reveal' (慢慢传): our illustration + "起点「…」→ 终点「…」 · 6 位群友接力". Only the two passed texts.
 *   kind 'roomInvite' (spec 9.1): our illustration + "一起传画 · 一局约 3 分钟" + "3–10 人" and ten seat stickers. No prompt, no drawing.
 *   kind 'roomReveal' (spec 9.4): our illustration + "一局传画 · 5 条接龙" + (when the chain on screen has passed texts at both
 *   ends) "起点「…」→ 终点「…」". Only passed text, never a drawing.
 * render(canvas, vm, {pixelScale?}) sets canvas.width/height to 500/400 x pixelScale and draws. Export with
 * canvas.toTempFilePath. Pure drawing code (the canvas is created by the caller).
 */

const T = require('./theme');
const W = require('./widgets');
const Art = require('./art');

const SIZE = { w: 500, h: 400 };

function lines(ctx, str, maxW, size, weight, maxLines) {
  let ls = W.wrapBalanced(ctx, str, maxW, size, weight);
  if (ls.length > maxLines) {
    ls = ls.slice(0, maxLines);
    const chars = Array.from(ls[maxLines - 1]);
    while (chars.length > 1 && W.measure(ctx, chars.join('') + '…', size, weight) > maxW) chars.pop();
    ls[maxLines - 1] = chars.join('') + '…';
  }
  return ls;
}

function drawCard(ctx, vm) {
  const w = SIZE.w;
  const h = SIZE.h;
  // field
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#F7B04B');
  g.addColorStop(1, '#EE8A1F');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // mascot, left, bleeding off the edge a little
  Art.mascot(ctx, 128, 214, 300);
  // note panel on the right
  const px = 252;
  const py = 34;
  const pw = 224;
  const ph = 340;
  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate(0.035);
  ctx.translate(-(px + pw / 2), -(py + ph / 2));
  W.fillRR(ctx, px + 6, py + 8, pw, ph, 18, 'rgba(120,60,0,0.28)');
  W.fillRR(ctx, px, py, pw, ph, 18, '#FFFDF8');
  W.strokeRR(ctx, px, py, pw, ph, 18, 'rgba(30,27,24,0.7)', 3);
  ctx.fillStyle = '#F2C94C';
  ctx.globalAlpha = 0.92;
  ctx.fillRect(px + pw / 2 - 40, py - 12, 80, 24);
  ctx.globalAlpha = 1;
  const cx = px + pw / 2;
  const ink = '#1E1B18';
  if (vm.kind === 'roomInvite') {
    W.text(ctx, '一起传画', cx, py + 70, { size: 40, weight: 900, color: ink, align: 'center', maxW: pw - 24 });
    // ten seat stickers, four taken
    const r = 17;
    for (let i = 0; i < 10; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const dx = cx + (col - 2) * 41;
      const dy = py + 128 + row * 46;
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      if (i < 4) {
        ctx.fillStyle = '#F29B30';
        ctx.fill();
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      W.text(ctx, String(i + 1), dx, dy + 0.5, { size: 18, weight: 900, color: i < 4 ? ink : '#5C554C', align: 'center' });
    }
    W.text(ctx, '一局约 3 分钟', cx, py + 244, { size: 30, weight: 900, color: '#8A4B00', align: 'center', maxW: pw - 24 });
    W.text(ctx, '3–10 人', cx, py + 292, { size: 28, weight: 800, color: ink, align: 'center' });
    W.text(ctx, '画得丑没关系', cx, py + 328 - 4, { size: 22, weight: 700, color: '#5C554C', align: 'center' });
  } else if (vm.kind === 'roomReveal') {
    const n = vm.chainCount || 0;
    const hasText = !!(vm.promptText && vm.finalText);
    if (!hasText) {
      W.text(ctx, '传画接龙', cx, py + 62, { size: 30, weight: 900, color: '#8A4B00', align: 'center' });
      W.text(ctx, '一局传画', cx, py + 128, { size: 40, weight: 900, color: ink, align: 'center', maxW: pw - 24 });
      W.text(ctx, n + ' 条接龙', cx, py + 196, { size: 40, weight: 900, color: ink, align: 'center', maxW: pw - 24 });
      W.text(ctx, '来看看变成了什么', cx, py + 262, { size: 24, weight: 700, color: '#5C554C', align: 'center', maxW: pw - 24 });
    } else {
      const maxW = pw - 32;
      let fs = 26;
      let A;
      let B;
      let lhh;
      for (;;) {
        A = lines(ctx, '「' + vm.promptText + '」', maxW, fs, 800, 2);
        B = lines(ctx, '「' + vm.finalText + '」', maxW, fs, 800, 3);
        lhh = Math.round(fs * 1.3);
        const total = 44 + 26 + A.length * lhh + 44 + 26 + B.length * lhh + 40;
        if (total <= ph - 24 || fs <= 21) break;
        fs -= 1;
      }
      let y = py + 38;
      W.text(ctx, '一局传画', cx, y, { size: 26, weight: 900, color: '#8A4B00', align: 'center' });
      y += 36;
      W.text(ctx, '起点', cx, y, { size: 20, weight: 800, color: '#5C554C', align: 'center' });
      y += 14;
      A.forEach((ln, i) => W.text(ctx, ln, cx, y + 18 + i * lhh, { size: fs, weight: 800, color: ink, align: 'center' }));
      y += A.length * lhh + 14;
      Art.arrow(ctx, cx, y, cx, y + 24, '#2459A3', 4);
      y += 44;
      W.text(ctx, '终点', cx, y, { size: 20, weight: 800, color: '#5C554C', align: 'center' });
      y += 14;
      B.forEach((ln, i) => W.text(ctx, ln, cx, y + 18 + i * lhh, { size: fs, weight: 800, color: ink, align: 'center' }));
      W.text(ctx, n + ' 条接龙', cx, py + ph - 28, { size: 22, weight: 800, color: '#8A4B00', align: 'center' });
    }
  } else if (vm.kind === 'reveal') {
    const maxW = pw - 32;
    // fit the two texts: shrink from 26 to 21 until the stack fits the note
    let fs = 26;
    let A;
    let B;
    let lhh;
    for (;;) {
      A = lines(ctx, '「' + (vm.promptText || '') + '」', maxW, fs, 800, 2);
      B = lines(ctx, '「' + (vm.finalText || '') + '」', maxW, fs, 800, 3);
      lhh = Math.round(fs * 1.3);
      const total = 44 + 26 + A.length * lhh + 44 + 26 + B.length * lhh + 40;
      if (total <= ph - 24 || fs <= 21) break;
      fs -= 1;
    }
    let y = py + 38;
    W.text(ctx, '传画接龙', cx, y, { size: 26, weight: 900, color: '#8A4B00', align: 'center' });
    y += 36;
    W.text(ctx, '起点', cx, y, { size: 20, weight: 800, color: '#5C554C', align: 'center' });
    y += 14;
    A.forEach((ln, i) => W.text(ctx, ln, cx, y + 18 + i * lhh, { size: fs, weight: 800, color: ink, align: 'center' }));
    y += A.length * lhh + 14;
    Art.arrow(ctx, cx, y, cx, y + 24, '#2459A3', 4);
    y += 44;
    W.text(ctx, '终点', cx, y, { size: 20, weight: 800, color: '#5C554C', align: 'center' });
    y += 14;
    B.forEach((ln, i) => W.text(ctx, ln, cx, y + 18 + i * lhh, { size: fs, weight: 800, color: ink, align: 'center' }));
    W.text(ctx, (vm.participantCount || 0) + ' 位群友接力', cx, py + ph - 28, { size: 22, weight: 800, color: '#8A4B00', align: 'center' });
  } else {
    const passed = vm.passed || 0;
    const length = vm.length || 6;
    W.text(ctx, '传画接龙', cx, py + 84, { size: 40, weight: 900, color: ink, align: 'center', maxW: pw - 24 });
    // progress dots: 6 big dots in two rows of 3
    const r = 17;
    const gx = 56;
    const rows = Math.ceil(length / 3);
    for (let i = 0; i < length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const dx = cx + (col - 1) * gx;
      const dy = py + 156 + row * 50 - ((rows - 1) * 50) / 2 + 20;
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      if (i < passed) {
        ctx.fillStyle = '#F29B30';
        ctx.fill();
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    W.text(ctx, '已传 ' + passed + '/' + length + ' 棒', cx, py + 262, { size: 32, weight: 900, color: '#8A4B00', align: 'center', maxW: pw - 24 });
    W.text(ctx, '等你接下一棒', cx, py + 304, { size: 22, weight: 700, color: '#5C554C', align: 'center' });
  }
  ctx.restore();
}

/** @param {{width:number,height:number,getContext:Function}} canvas  @param {object} vm  @param {{pixelScale?:number}} [opts] */
function render(canvas, vm, opts) {
  const ps = (opts && opts.pixelScale) || 1;
  canvas.width = Math.round(SIZE.w * ps);
  canvas.height = Math.round(SIZE.h * ps);
  const ctx = canvas.getContext('2d');
  const prev = T.getMode();
  T.setMode({ large: false, hc: false });
  if (ctx.save) ctx.save();
  ctx.scale(ps, ps);
  try {
    drawCard(ctx, vm || { kind: 'invite', passed: 0, length: 6 });
  } finally {
    if (ctx.restore) ctx.restore();
    T.setMode({ large: prev.large, hc: prev.hc });
  }
  return { width: canvas.width, height: canvas.height };
}

module.exports = { render, SIZE };
