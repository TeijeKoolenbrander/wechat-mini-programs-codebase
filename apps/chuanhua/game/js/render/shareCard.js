/**
 * Share cards (spec 9, PO-24). 500 x 400 (5:4), drawn on an offscreen canvas,
 * always in the standard look (display modes never apply to cards).
 *
 *   render(canvas, vm, opts)  sets canvas.width/height to 500x400 (x opts.pixelScale)
 *                             and draws; then export with canvas.toTempFilePath.
 *   draw(ctx, vm)             draws into a 500x400 logical area at the origin.
 *
 * vm.kind:
 *   'invite'   { passed, total=6 }                       "传画接龙 · 已传 3/6 棒" + dots.
 *              NEVER draws a prompt, a drawing or a sentence, whatever the vm carries.
 *   'reveal'   { promptText, finalText, passed, people } 起点「…」→ 终点「…」 · N 位群友接力.
 *              Only these two passed texts; NEVER any drawing or middle step.
 *   'fallback' {}                                        static art only (when rendering fails)
 * This module does not require strokes.js on purpose (tests check it).
 */

const T = require('./theme');
const W = require('./widgets');

const WIDTH = 500;
const HEIGHT = 400;

function bg(ctx) {
  const P = T.STANDARD;
  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = P.dot;
  ctx.beginPath();
  for (let y = 14; y < HEIGHT; y += 24) for (let x = 14; x < WIDTH; x += 24) ctx.rect(x, y, 2, 2);
  ctx.fill();
  // notebook-edge frame
  W.fillRR(ctx, 14, 18, WIDTH - 28, HEIGHT - 31, 22, P.ink);
  W.fillRR(ctx, 14, 14, WIDTH - 28, HEIGHT - 31, 22, '#FFFDF8');
  W.strokeRR(ctx, 14, 14, WIDTH - 28, HEIGHT - 31, 22, P.ink, 3);
}

function head(ctx, sub) {
  const P = T.STANDARD;
  W.brushBaton(ctx, 420, 76, 118, -0.6);
  W.text(ctx, '传画接龙', 40, 66, { size: 48, weight: 900, round: true, color: P.ink });
  W.squiggle(ctx, 40, 98, 192, P.zhu);
  if (sub) W.text(ctx, sub, 40, 134, { size: 26, weight: 700, color: P.sub, maxW: 320, minSize: 20 });
}

function drawInvite(ctx, vm) {
  const P = T.STANDARD;
  const total = vm.total || 6;
  const passed = Math.max(0, Math.min(total, vm.passed || 0));
  head(ctx, '看上一棒，画出来或猜出来');
  W.text(ctx, '已传 ' + passed + '/' + total + ' 棒', 250, 214, { size: 60, weight: 900, round: true, color: P.ink, align: 'center', maxW: 420, minSize: 36 });
  W.chainDots(ctx, 250, 286, passed, total, 44);
  W.text(ctx, '群里接力，下一棒等你', 250, 352, { size: 28, weight: 700, color: P.sub, align: 'center' });
}

function quote(ctx, text, y, h, size, fill) {
  const P = T.STANDARD;
  W.sticker(ctx, 40, y, 420, h, 16, { fill, off: 3 });
  const lines = W.wrap(ctx, '「' + text + '」', 390, size, 900, true).slice(0, 2);
  const lh = Math.round(size * 1.28);
  const top = y + (h - lines.length * lh) / 2;
  lines.forEach((ln, i) => W.text(ctx, ln, 250, top + lh * i + lh / 2, { size, weight: 900, round: true, align: 'center', color: P.ink, maxW: 396, minSize: 22 }));
}

function drawReveal(ctx, vm) {
  const P = T.STANDARD;
  W.text(ctx, '传画接龙', 40, 52, { size: 36, weight: 900, round: true, color: P.ink });
  W.brushBaton(ctx, 430, 56, 84, -0.6);
  W.text(ctx, '起点', 44, 98, { size: 22, weight: 800, round: true, color: P.orangeText });
  quote(ctx, vm.promptText || '', 112, 70, 34, '#FFF1D6');
  W.arrowDown(ctx, 250, 188, 226, P.ink, 4);
  W.text(ctx, '终点', 44, 246, { size: 22, weight: 800, round: true, color: P.zhuText });
  quote(ctx, vm.finalText || '…', 258, 86, 34, '#FFFFFF');
  const people = vm.people || vm.passed || 0;
  W.text(ctx, (people ? people + ' 位群友接力' : '群友接力') + (vm.passed ? ' · 传了 ' + vm.passed + ' 棒' : ''), 250, 372, { size: 24, weight: 700, color: P.sub, align: 'center', maxW: 420, minSize: 20 });
}

function drawFallback(ctx) {
  const P = T.STANDARD;
  head(ctx, null);
  W.text(ctx, '一句话，越传越离谱', 250, 238, { size: 40, weight: 900, round: true, color: P.ink, align: 'center' });
  W.text(ctx, '看上一棒，画出来或猜出来', 250, 300, { size: 28, weight: 700, color: P.sub, align: 'center' });
}

function draw(ctx, vm) {
  T.resetDisplay();
  vm = vm || {};
  ctx.save();
  bg(ctx);
  if (vm.kind === 'reveal') drawReveal(ctx, vm);
  else if (vm.kind === 'fallback') drawFallback(ctx);
  else drawInvite(ctx, vm);
  ctx.restore();
}

function render(canvas, vm, opts) {
  const k = (opts && opts.pixelScale) || 1;
  canvas.width = WIDTH * k;
  canvas.height = HEIGHT * k;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(k, k);
  draw(ctx, vm);
  ctx.restore();
  return canvas;
}

module.exports = { draw, render, WIDTH, HEIGHT };
