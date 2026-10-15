/**
 * Share card (spec 6.7, 6.17), 5:4, drawn on an offscreen canvas.
 *
 *   render(canvas, vm, {pixelScale?, saved?})  sets canvas.width/height to
 *     500x400 (x pixelScale) and draws; then logic exports it with
 *     canvas.toTempFilePath for shareAppMessage imageUrl. For 保存图片 use
 *     pixelScale 2 and saved:true (adds "微信小游戏 · 比一比" at the bottom).
 *   draw(ctx, vm, opts)  draws into a 500x400 logical area at the origin.
 *
 * vm: {
 *   mode: 'daily'|'free'|'challenge',
 *   issueNo?: number, themeLabel?: string,      daily and challenge-on-daily
 *   streak: number, cleared?: boolean,          cleared = 全部答对
 *   marks: boolean[],                           one per answered question, true = correct
 *   rarityText?: string|null,                   only at >= 30 results
 *   hook?: {topLabel, bottomLabel, subLabel},   free: the missed pair, NO values
 *   ownerStreak?: number                        challenge: the number to beat
 * }
 * Daily and challenge cards never contain a fact label or value (everyone
 * still has to play the same deck). Free cards show labels and the measure
 * but no values. The card never changes with large-text / high-contrast
 * (spec 6.19) and does not use the mutable theme palette.
 */

const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC",serif';
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Noto Sans SC",sans-serif';

const PAPER = '#FAF7F0';
const INK = '#1F2328';
const SUB = '#58606A';
const SEAL = '#B8432F';
const SEAL_INK = '#FFF6E8';
const GOOD = '#1F7A6D';
const BAD = '#C0392B';

function f(size, weight, serif) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + (serif ? SERIF : SANS);
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** One line of text, shrunk to fit maxW (never below minSize), baseline middle. */
function t(ctx, s, x, y, size, weight, color, align, serif, maxW, minSize) {
  let sz = size;
  ctx.font = f(sz, weight, serif);
  if (maxW) {
    const w = ctx.measureText(s).width;
    if (w > maxW) {
      sz = Math.max(minSize || 16, size * (maxW / w));
      ctx.font = f(sz, weight, serif);
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function mark(ctx, cx, cy, r, ok) {
  if (ok) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = GOOD;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.6, r * 0.28);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.38);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.38);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = BAD;
    ctx.lineWidth = Math.max(1.8, r * 0.3);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.4);
    ctx.moveTo(cx + r * 0.4, cy - r * 0.4);
    ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
    ctx.stroke();
  }
}

function titleOf(vm) {
  if (vm.mode === 'free') return '比一比 · 随便比比';
  if (vm.mode === 'challenge') {
    return '比一比 · 同一套题' + (vm.issueNo != null ? ' 第' + vm.issueNo + '期' : '');
  }
  return '比一比 · 今日一比' + (vm.issueNo != null ? ' 第' + vm.issueNo + '期' : '') + (vm.themeLabel ? ' · ' + vm.themeLabel : '');
}

function ctaOf(vm) {
  if (vm.mode === 'free') return '你能比我连对更多吗？';
  if (vm.mode === 'challenge' && vm.ownerStreak != null) return '同一套题，你能超过 ' + vm.ownerStreak + ' 吗？';
  return '同一套题，你能比我多吗？';
}

function draw(ctx, vm, opts) {
  opts = opts || {};
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 500, 400);
  // masthead rules and a thin outer frame
  ctx.strokeStyle = 'rgba(31,35,40,0.30)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(10, 10, 480, 380);
  ctx.fillStyle = INK;
  ctx.fillRect(26, 62, 448, 2.5);
  ctx.fillRect(26, 67, 448, 1);

  // seal + title
  ctx.save();
  ctx.translate(48, 38);
  ctx.rotate((-6 * Math.PI) / 180);
  rr(ctx, -19, -19, 38, 38, 8);
  ctx.fillStyle = SEAL;
  ctx.fill();
  t(ctx, '比', 0, 1, 25, 900, SEAL_INK, 'center', true);
  ctx.restore();
  t(ctx, titleOf(vm), 76, 38, 22, 800, INK, 'left', true, 400, 18);

  // streak
  t(ctx, '连对', 250, 98, 24, 800, SUB, 'center', true);
  const streak = vm.streak != null ? vm.streak : 0;
  t(ctx, String(streak), 250, 160, 104, 900, streak >= 10 ? SEAL : INK, 'center', true, 300, 60);

  // 全部答对 stamp
  if (vm.cleared) {
    ctx.save();
    ctx.translate(404, 126);
    ctx.rotate((-6 * Math.PI) / 180);
    ctx.strokeStyle = SEAL;
    ctx.lineWidth = 3.5;
    rr(ctx, -62, -26, 124, 52, 6);
    ctx.stroke();
    t(ctx, '全部答对', 0, 1, 26, 900, SEAL, 'center', true, 112, 20);
    ctx.restore();
  }

  // one mark per answered question, rows of up to 20
  const marks = (vm.marks || []).slice(0, 60);
  if (marks.length) {
    const perRow = 20;
    const rows = Math.ceil(marks.length / perRow);
    const step = 22;
    const r = 8.5;
    const top = 228 - ((rows - 1) * step) / 2;
    for (let row = 0; row < rows; row++) {
      const inRow = Math.min(perRow, marks.length - row * perRow);
      const x0 = 250 - ((inRow - 1) * step) / 2;
      for (let i = 0; i < inRow; i++) mark(ctx, x0 + i * step, top + row * step, r, marks[row * perRow + i]);
    }
  }

  // rarity (daily) or the missed pair as the hook (free)
  if (vm.mode === 'free' && vm.hook) {
    const h = vm.hook;
    const line = h.topLabel + ' vs ' + h.bottomLabel + (h.subLabel ? ' · ' + h.subLabel : '') + ' · 我选错了';
    t(ctx, line, 250, 306, 22, 700, INK, 'center', false, 440, 16);
  } else if (vm.rarityText) {
    t(ctx, vm.rarityText, 250, 306, 22, 700, SUB, 'center', false, 440, 16);
  }

  // call to action
  t(ctx, ctaOf(vm), 250, 350, 26, 800, INK, 'center', true, 440, 18);
  if (opts.saved) t(ctx, '微信小游戏 · 比一比', 250, 378, 16, 500, SUB, 'center', false, 300, 14);
  ctx.restore();
}

function render(canvas, vm, opts) {
  const k = (opts && opts.pixelScale) || 1;
  canvas.width = 500 * k;
  canvas.height = 400 * k;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(k, k);
  draw(ctx, vm, opts);
  ctx.restore();
  return canvas;
}

module.exports = { draw, render, WIDTH: 500, HEIGHT: 400, titleOf, ctaOf };
