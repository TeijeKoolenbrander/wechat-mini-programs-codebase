/**
 * Share card images (spec 7; CONTRACT "shareCard"). 500 x 400 (5:4), drawn on an offscreen canvas, ALWAYS in the standard look
 * (the display mode is saved, forced to standard and restored).
 *
 *   render(canvas, model, {pixelScale?, kind?}) sets canvas.width/height to 500 x 400 (x pixelScale) and draws; logic then calls
 *   canvas.toTempFilePath for the share image url. draw(ctx, model, opts) draws into the 500 x 400 area at the origin.
 *
 * Models (built by core/entry.js; the card draws nothing else, AC 52 and 53):
 *   daily : {issueNo, rows:[{prompt, left, right, label}] x5, totalText, band, tagline}   no positions, medians or group numbers
 *   round : {left, right, clueLine, tagline}                                              an empty ruler, never the target
 *   reveal: {left, right, target, guesses[], mqText}                                      ▮ and unnamed ○, no names
 *   group : {title}                                                                       '本群今日默契度 81' | '本群今日刻度'
 * The kind is taken from opts.kind or inferred from the fields.
 */

const T = require('./theme');
const ruler = require('./ruler');

const INK = '#24211E';
const SUB = '#5C5348';
const PURPLE = '#6A3C7C';
const TAPE = '#F2C94C';
const CREAM = '#FBF6EC';

const W = 500;
const H = 400;
const LAYOUT = { u: (n) => n, W, H, s: 1 };

const LABEL_FILL = { 心有灵犀: '#F07B2C', 很同频: '#2A8C8C', 差不多: '#7D4E8C', 有点偏: '#F2C94C', 想法独特: '#8A8074' };
const LABEL_INK = { 心有灵犀: INK, 很同频: '#FFFFFF', 差不多: '#FFFFFF', 有点偏: INK, 想法独特: '#FFFFFF' };

function f(size, weight) {
  return (weight || 700) + ' ' + size + 'px ' + T.SANS;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function t(ctx, s, x, y, size, weight, color, align, maxW) {
  ctx.font = f(size, weight);
  let sz = size;
  if (maxW) {
    const w = ctx.measureText(String(s)).width;
    if (w > maxW) {
      sz = Math.max(14, size * (maxW / w));
      ctx.font = f(sz, weight);
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(s), x, y);
}

function background(ctx, headRight) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#FFF9EC');
  g.addColorStop(1, '#F4EAD3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // purple header band with a tape strip motif (the app icon's colours)
  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, W, 58);
  t(ctx, '群友刻度盘', 24, 30, 28, 800, '#FFFFFF');
  if (headRight) t(ctx, headRight, W - 24, 30, 20, 700, TAPE, 'right', 220);
  ctx.fillStyle = TAPE;
  ctx.fillRect(0, 58, W, 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  for (let x = 10; x < W; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 58);
    ctx.lineTo(x, x % 100 === 10 ? 64 : 61);
    ctx.stroke();
  }
}

function drawDaily(ctx, m) {
  background(ctx, '每日刻度' + (m.issueNo != null ? ' 第' + m.issueNo + '期' : ''));
  const rows = (m.rows || []).slice(0, 5);
  rows.forEach((r, i) => {
    const y = 80 + i * 46;
    ctx.fillStyle = 'rgba(255,253,248,0.9)';
    rr(ctx, 24, y, 452, 40, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(36,33,30,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    t(ctx, r.prompt, 38, y + 20, 22, 800, INK, 'left', 150);
    t(ctx, r.left + ' ↔ ' + r.right, 200, y + 20, 18, 600, SUB, 'left', 120);
    const fill = LABEL_FILL[r.label] || '#8A8074';
    ctx.font = f(18, 800);
    const lw = Math.max(86, ctx.measureText(r.label).width + 24);
    ctx.fillStyle = fill;
    rr(ctx, 462 - lw, y + 6, lw, 28, 8);
    ctx.fill();
    t(ctx, r.label, 462 - lw / 2, y + 20, 18, 800, LABEL_INK[r.label] || '#FFFFFF', 'center');
  });
  t(ctx, '今日默契分 ' + m.totalText + ' · ' + m.band, 250, 334, 34, 800, PURPLE, 'center', 452);
  t(ctx, m.tagline || '你会把指针放在哪？', 250, 374, 22, 700, INK, 'center', 452);
}

function drawRound(ctx, m) {
  background(ctx, '刻度题');
  t(ctx, m.tagline || '群友出了一道刻度题', 250, 100, 30, 800, INK, 'center', 452);
  ruler.draw(ctx, LAYOUT, { x: 0, y: 128, w: W, left: m.left, right: m.right, needle: null, markers: [], interactive: false, revealT: 1 });
  t(ctx, m.clueLine, 250, 300, 28, 800, '#A8470A', 'center', 452);
  t(ctx, '你猜 TA 心里的位置在哪？', 250, 352, 22, 700, SUB, 'center', 452);
}

function drawReveal(ctx, m) {
  background(ctx, '刻度题揭晓');
  const markers = [{ pos: m.target, kind: 'target' }].concat((m.guesses || []).map((p) => ({ pos: p, kind: 'member' })));
  ruler.draw(ctx, LAYOUT, { x: 0, y: 96, w: W, left: m.left, right: m.right, needle: null, markers, interactive: false, revealT: 1 });
  t(ctx, m.mqText, 250, 290, 34, 800, PURPLE, 'center', 452);
  t(ctx, '▮ 目标   ○ 大家的猜测', 250, 346, 22, 700, SUB, 'center', 452);
}

function drawGroup(ctx, m) {
  background(ctx, '本群');
  ctx.strokeStyle = INK;
  const tx = 60;
  const ty = 150;
  ctx.fillStyle = TAPE;
  rr(ctx, tx, ty, 380, 46, 10);
  ctx.fill();
  ctx.strokeStyle = '#B8901C';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = INK;
  for (let i = 0; i <= 20; i++) {
    const x = tx + 16 + (348 * i) / 20;
    ctx.lineWidth = i === 10 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, ty + 1);
    ctx.lineTo(x, ty + (i === 10 ? 26 : i % 2 === 0 ? 17 : 10));
    ctx.stroke();
  }
  ruler.drawGroup(ctx, tx + 16 + 348 * 0.3, ty + 32, 11);
  ruler.drawGroup(ctx, tx + 16 + 348 * 0.62, ty + 32, 11);
  ruler.drawGroup(ctx, tx + 16 + 348 * 0.55, ty + 32, 11);
  t(ctx, m.title, 250, 270, 38, 800, PURPLE, 'center', 452);
  t(ctx, '你们的想法有多同频？', 250, 340, 24, 700, INK, 'center', 452);
}

function kindOf(m, opts) {
  if (opts && opts.kind) return opts.kind;
  if (m.rows) return 'daily';
  if (m.clueLine !== undefined) return 'round';
  if (m.guesses) return 'reveal';
  return 'group';
}

function draw(ctx, model, opts) {
  const prev = T.getMode();
  T.setMode(null); // the card is always the standard look
  try {
    ctx.save();
    const k = kindOf(model, opts);
    if (k === 'daily') drawDaily(ctx, model);
    else if (k === 'round') drawRound(ctx, model);
    else if (k === 'reveal') drawReveal(ctx, model);
    else drawGroup(ctx, model);
    ctx.restore();
  } finally {
    T.setMode(prev);
  }
}

function render(canvas, model, opts) {
  const k = (opts && opts.pixelScale) || 1;
  canvas.width = W * k;
  canvas.height = H * k;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(k, k);
  draw(ctx, model, opts);
  ctx.restore();
  return canvas;
}

module.exports = { draw, render, WIDTH: W, HEIGHT: H, kindOf, CREAM };
