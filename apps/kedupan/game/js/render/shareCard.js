/**
 * Share cards, 500 x 400 (5:4), always the standard look (spec 6.11, 7).
 *
 *   render(canvas, vm, {pixelScale?}) sets the canvas to 500x400 (times
 *   pixelScale) and draws; export with canvas.toTempFilePath.
 *   draw(ctx, vm) draws into a 500x400 area.
 *
 * vm.type:
 *   'daily'  { issueNo, totalText, bandLabel, rows:[{prompt, left, right, label}] x5 }
 *            Spoiler-safe: prompts and label blocks only. NO positions,
 *            medians or group numbers (AC 52) - the renderer never reads them.
 *   'round'  { left, right, clueText }       host round card (empty ruler)
 *   'reveal' { left, right, target, guesses:number[], mqText, countText }
 *            target and anonymous guess dots, no names
 *   'group'  { mqText|null }                 "本群今日默契度 81" (mqText null: "本群今日刻度")
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./ruler');

const WIDTH = 500;
const HEIGHT = 400;

const L = {
  W: WIDTH,
  H: HEIGHT,
  s: 1,
  u: (n) => n,
  x0: 28,
  contentW: 444,
  cx: 250,
};

function tapeHeader(ctx, title, sub) {
  const C = T.C;
  // a strip of tape across the top with ticks along its lower edge
  ctx.save();
  ctx.shadowColor = 'rgba(70,50,20,0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = C.tape;
  ctx.fillRect(0, 18, WIDTH, 62);
  ctx.restore();
  ctx.strokeStyle = C.ink;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i <= 40; i++) {
    const x = 14 + (i * (WIDTH - 28)) / 40;
    ctx.lineWidth = i % 10 === 0 ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 80);
    ctx.lineTo(x, 80 - (i % 10 === 0 ? 12 : 7));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  W.text(ctx, title, 28, 42, { size: 26, weight: 900, maxW: 330 });
  if (sub) W.text(ctx, sub, WIDTH - 28, 42, { size: 20, weight: 800, align: 'right', color: C.ink });
  R.pointer(ctx, 392, 21, 10, C.you);
}

function drawDaily(ctx, vm) {
  const C = T.C;
  tapeHeader(ctx, '群友刻度盘', '每日刻度 第' + (vm.issueNo || '-') + '期');
  const rows = (vm.rows || []).slice(0, 5);
  const top = 96;
  const rh = 41;
  rows.forEach((r, i) => {
    const y = top + i * rh;
    const fill = [C.noteYellow, C.noteBlue, C.noteOrange, C.noteGreen, C.noteYellow][i % 5];
    W.note(ctx, 24, y, 452, rh - 6, { fill, rot: i % 2 ? 0.25 : -0.25, fold: false });
    W.text(ctx, r.prompt || '', 38, y + (rh - 6) / 2, { size: 22, weight: 900, maxW: 160 });
    W.text(ctx, (r.left || '') + '↔' + (r.right || ''), 212, y + (rh - 6) / 2, { size: 18, weight: 600, color: C.sub, maxW: 130 });
    // label block (no positions)
    const col = T.labelColor(r.label);
    const lw = W.measure(ctx, r.label || '', 18, 800) + 34;
    W.fillRR(ctx, 464 - lw, y + 5, lw, rh - 16, 6, C.card);
    ctx.fillStyle = col;
    ctx.fillRect(464 - lw + 7, y + 5 + (rh - 16) / 2 - 5, 10, 10);
    W.text(ctx, r.label || '', 464 - lw + 22, y + 5 + (rh - 16) / 2 + 1, { size: 18, weight: 800, color: col });
  });
  const fy = top + 5 * rh + 6;
  W.text(ctx, '今日默契分 ' + (vm.totalText || '') + (vm.bandLabel ? ' · ' + vm.bandLabel : ''), 250, fy + 24, { size: 30, weight: 900, align: 'center', maxW: 450 });
  W.text(ctx, '你会把指针放在哪？', 250, fy + 62, { size: 22, weight: 700, color: C.youText, align: 'center' });
}

function drawRound(ctx, vm) {
  const C = T.C;
  tapeHeader(ctx, '群友刻度盘', '刻度题');
  W.text(ctx, '群友出了一道刻度题', 250, 118, { size: 28, weight: 900, align: 'center' });
  const clue = vm.clueText || '提示在群聊里';
  W.note(ctx, 70, 146, 360, 46, { fill: C.noteYellow, rot: -0.6, tape: true });
  W.text(ctx, clue, 250, 170, { size: 24, weight: 800, align: 'center', maxW: 330 });
  R.drawRuler(ctx, L, { add() {}, meta: {} }, { y: 214, left: vm.left, right: vm.right, interactive: false, lanes: 0 });
  W.text(ctx, '你猜 TA 把指针放在哪？', 250, 372, { size: 22, weight: 700, color: C.youText, align: 'center' });
}

function drawReveal(ctx, vm) {
  const C = T.C;
  tapeHeader(ctx, '群友刻度盘', '刻度题揭晓');
  W.text(ctx, (vm.left || '') + ' ↔ ' + (vm.right || ''), 250, 120, { size: 28, weight: 900, align: 'center' });
  const markers = [{ pos: vm.target, kind: 'target' }].concat((vm.guesses || []).map((g) => ({ pos: g, kind: 'member' })));
  R.drawRuler(ctx, L, { add() {}, meta: {} }, { y: 140, left: vm.left, right: vm.right, markers, interactive: false, lanes: 0 });
  W.text(ctx, vm.mqText || '', 250, 336, { size: 34, weight: 900, align: 'center', color: C.ink, maxW: 440 });
  if (vm.countText) W.text(ctx, vm.countText, 250, 372, { size: 22, weight: 700, color: C.sub, align: 'center' });
}

function drawGroup(ctx, vm) {
  const C = T.C;
  tapeHeader(ctx, '群友刻度盘', '本群');
  if (vm.mqText) {
    W.text(ctx, '本群今日默契度', 250, 140, { size: 28, weight: 800, color: C.sub, align: 'center' });
    W.text(ctx, vm.mqText, 250, 214, { size: 92, weight: 900, align: 'center' });
    // gauge
    const mq = Math.max(0, Math.min(100, parseFloat(vm.mqText) || 0));
    W.fillRR(ctx, 40, 276, 420, 28, 7, C.tape);
    ctx.save();
    ctx.beginPath();
    ctx.rect(40, 276, Math.max(28, (420 * mq) / 100), 28);
    ctx.clip();
    W.fillRR(ctx, 40, 276, 420, 28, 7, C.primary);
    ctx.restore();
    W.strokeRR(ctx, 40, 276, 420, 28, 7, C.tapeShade, 1.5);
    W.text(ctx, '各有想法', 40, 326, { size: 20, color: C.sub });
    W.text(ctx, '灵魂同频', 460, 326, { size: 20, color: C.sub, align: 'right' });
  } else {
    W.text(ctx, '本群今日刻度', 250, 200, { size: 44, weight: 900, align: 'center' });
  }
  W.text(ctx, '你们群今天有多同频？', 250, 372, { size: 24, weight: 700, color: C.youText, align: 'center' });
}

function draw(ctx, vm) {
  T.applyDisplay(null);
  const C = T.C;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 14; x < WIDTH; x += 28) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
  }
  for (let y = 14; y < HEIGHT; y += 28) {
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
  }
  ctx.stroke();
  const type = vm && vm.type;
  if (type === 'daily') drawDaily(ctx, vm);
  else if (type === 'round') drawRound(ctx, vm);
  else if (type === 'reveal') drawReveal(ctx, vm);
  else drawGroup(ctx, vm || {});
}

function render(canvas, vm, opts) {
  const k = (opts && opts.pixelScale) || 1;
  canvas.width = Math.round(WIDTH * k);
  canvas.height = Math.round(HEIGHT * k);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  draw(ctx, vm);
}

module.exports = { render, draw, WIDTH, HEIGHT };
