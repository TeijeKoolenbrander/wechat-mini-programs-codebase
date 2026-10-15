/**
 * Share card (spec 8.5, PO-10). 500 x 400 (5:4), drawn on an offscreen canvas.
 *
 *   render(canvas, vm, {pixelScale?})  sets canvas.width/height to 500x400
 *                       (times pixelScale) and draws; then logic exports with
 *                       canvas.toTempFilePath for shareAppMessage imageUrl.
 *   draw(ctx, vm)       draws into a 500x400 logical area at the origin.
 *
 * vm = { title, headline, subline, temps: number[], bands: string[], footer }
 *   title     "语义热冷 · 今日一词 第128期" (or "往期 第97期" / "练习 #12")
 *   headline  "21 步猜中" | "未猜中 · 最近第 3 名"
 *   subline   "用了 1 次提示" ("" for none)
 *   temps     per-step temperature 0..100, in guess order (bucketed to 60 columns)
 *   bands     per-step band key ('cold'|'warm'|'hot'|'scald'|'boil'|'hit')
 *   footer    "同一个词，你几步能猜中？"
 *
 * Spoiler-free by construction: this module draws only vm.title / headline /
 * subline / footer (logic-supplied, no words) and the fixed axis labels, and
 * never reads a word field. Always the default palette, whatever the display
 * mode (spec 8.11: neither mode changes the share card).
 */

const T = require('./theme');

const PAPER = '#F6F1E7';
const INK = '#1E1B18';
const SUB = '#5F574D';
const TRACK = '#E4DBC8';
const BAND = { cold: '#4F7196', warm: '#C9B27A', hot: '#E08A2E', scald: '#C43D1C', boil: '#A3222B', hit: '#C9973A' };
const ORDER = ['cold', 'warm', 'hot', 'scald', 'boil', 'hit'];

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
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

function t(ctx, s, x, y, size, weight, color, align, serif, maxW) {
  let px = size;
  ctx.font = weight + ' ' + px + 'px ' + (serif ? T.SERIF : T.SANS);
  if (maxW) {
    const w = ctx.measureText(s).width;
    if (w > maxW) {
      px = Math.floor((size * maxW) / w);
      ctx.font = weight + ' ' + px + 'px ' + (serif ? T.SERIF : T.SANS);
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

/** Band for a temperature when the vm gave none. */
function bandFor(temp) {
  return T.bandOfTemp(temp);
}

/**
 * One column per step (spec 8.5): temps/bands as given up to 60 steps; above
 * 60 the steps are bucketed into 60 columns, each showing its highest temperature.
 */
function columns(vm) {
  const raw = (vm && vm.temps) || [];
  const rawBands = (vm && vm.bands) || [];
  if (raw.length <= 60) return { temps: raw.slice(), bands: raw.map((v, i) => rawBands[i] || bandFor(v)) };
  const temps = [];
  const bands = [];
  for (let i = 0; i < 60; i++) {
    const a = Math.floor((i * raw.length) / 60);
    const b = Math.max(a + 1, Math.floor(((i + 1) * raw.length) / 60));
    let best = -1;
    let bi = a;
    for (let j = a; j < b && j < raw.length; j++) {
      if (raw[j] > best) {
        best = raw[j];
        bi = j;
      }
    }
    temps.push(best);
    bands.push(rawBands[bi] || bandFor(best));
  }
  return { temps, bands };
}

function draw(ctx, vm) {
  vm = vm || {};
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 500, 400);
  // thermometer scale down the left edge, like the app
  const g = ctx.createLinearGradient(0, 400, 0, 0);
  ORDER.forEach((b, i) => g.addColorStop(i / (ORDER.length - 1), BAND[b]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 12, 400);
  ctx.strokeStyle = 'rgba(30,27,24,0.25)';
  ctx.lineWidth = 2;
  rr(ctx, 22, 12, 466, 376, 18);
  ctx.stroke();

  // header
  t(ctx, vm.title || '', 44, 56, 26, 700, SUB, 'left', false, 420);
  // headline + subline
  t(ctx, vm.headline || '', 250, 128, 62, 900, INK, 'center', true, 420);
  if (vm.subline) t(ctx, vm.subline, 250, 166, 26, 600, SUB, 'center', false, 420);

  // chart: one column per step (bucketed to 60), height = temperature, colour = band
  const cols = columns(vm);
  const temps = cols.temps;
  const bands = cols.bands;
  const cx0 = 44;
  const cw = 412;
  const base = 298;
  const chH = 116;
  const n = Math.max(1, temps.length);
  const gap = Math.max(1.5, Math.min(5, (cw / n) * 0.22));
  const colW = Math.min(30, (cw - gap * (n - 1)) / n);
  const used = colW * n + gap * (n - 1);
  const sx = cx0 + (cw - used) / 2;
  temps.forEach((v, i) => {
    const h = Math.max(6, (chH * Math.max(0, Math.min(100, v))) / 100);
    ctx.fillStyle = BAND[bands[i]] || BAND[bandFor(v)];
    rr(ctx, sx + i * (colW + gap), base - h, colW, h, Math.min(colW / 2, 4));
    ctx.fill();
  });
  ctx.fillStyle = INK;
  ctx.fillRect(cx0, base + 1, cw, 2);

  // axis: 冷 ---- 命中
  const ay = 332;
  t(ctx, '冷', cx0, ay, 22, 700, BAND.cold, 'left');
  t(ctx, '命中', cx0 + cw, ay, 22, 700, '#8A6414', 'right');
  const lg = ctx.createLinearGradient(cx0 + 36, 0, cx0 + cw - 62, 0);
  ORDER.forEach((b, i) => lg.addColorStop(i / (ORDER.length - 1), BAND[b]));
  ctx.fillStyle = TRACK;
  rr(ctx, cx0 + 36, ay - 14, cw - 36 - 62, 8, 4);
  ctx.fill();
  ctx.fillStyle = lg;
  rr(ctx, cx0 + 36, ay - 14, cw - 36 - 62, 8, 4);
  ctx.fill();

  // footer
  t(ctx, vm.footer || '', 250, 372, 26, 700, INK, 'center', false, 420);
  ctx.restore();
}

function render(canvas, vm, opts) {
  const k = (opts && opts.pixelScale) || 1;
  canvas.width = 500 * k;
  canvas.height = 400 * k;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(k, k);
  draw(ctx, vm);
  ctx.restore();
  return canvas;
}

module.exports = { draw, render, columns, WIDTH: 500, HEIGHT: 400 };
