'use strict';
/**
 * Shared helpers for the render tests: a recording canvas context (tracks translate/scale/clip so text positions are in
 * screen space, counts path operations), the window sizes and display modes, and an iterator over every fixture.
 */

const path = require('node:path');
const R = require('../js/render');
const { build, prepare } = require('../tools/preview/fixtures.js');
const { sample } = require('../js/render/samples.js');

function fontSize(f) {
  const m = /([\d.]+)px/.exec(f || '');
  return m ? Number(m[1]) : 10;
}

/** Width model: CJK and full-width glyphs 1em, ASCII 0.56em (a little wider than most system fonts). */
function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) w += /[\u0000-ÿ]/.test(ch) ? 0.56 : 1;
  return w * size;
}

/** fillText calls are recorded in screen space; `counts` tallies every other method. */
function mockCtx() {
  const calls = [];
  const fills = [];
  const counts = {};
  const state = { font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', textAlign: 'left', globalAlpha: 1, lineWidth: 1 };
  let tf = { x: 0, y: 0, sx: 1, sy: 1 };
  let clip = null;
  let pend = null;
  const stack = [];
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, p) {
      if (p === 'save') return () => stack.push({ tf: { ...tf }, st: { ...state }, clip });
      if (p === 'restore') return () => { const s = stack.pop(); if (s) { tf = s.tf; clip = s.clip; Object.assign(state, s.st); } };
      if (p === 'translate') return (x, y) => { tf = { ...tf, x: tf.x + x * tf.sx, y: tf.y + y * tf.sy }; };
      if (p === 'scale') return (x, y) => { tf = { ...tf, sx: tf.sx * x, sy: tf.sy * y }; };
      if (p === 'rect') return (x, y, w, h) => { pend = { x1: tf.x + x * tf.sx, y1: tf.y + y * tf.sy, x2: tf.x + (x + w) * tf.sx, y2: tf.y + (y + h) * tf.sy }; };
      if (p === 'beginPath') return () => { pend = null; counts.beginPath = (counts.beginPath || 0) + 1; };
      if (p === 'clip') return () => { if (!pend) return; clip = clip ? { x1: Math.max(clip.x1, pend.x1), y1: Math.max(clip.y1, pend.y1), x2: Math.min(clip.x2, pend.x2), y2: Math.min(clip.y2, pend.y2) } : pend; };
      if (p === 'fillText') {
        return (s, x, y) => {
          const size = fontSize(state.font) * Math.abs(tf.sy);
          const w = textWidth(s, size);
          const X = tf.x + x * tf.sx;
          const a = state.textAlign;
          const left = a === 'center' ? X - w / 2 : a === 'right' || a === 'end' ? X - w : X;
          const Y = tf.y + y * tf.sy;
          const visible = !clip || (X >= clip.x1 - 1 && X <= clip.x2 + 1 && Y - size * 0.5 >= clip.y1 - 1 && Y + size * 0.5 <= clip.y2 + 1);
          calls.push({ s: String(s), x: X, y: Y, size, align: a, left, right: left + w, color: state.fillStyle, alpha: state.globalAlpha, visible });
        };
      }
      if (p === 'measureText') return (s) => ({ width: textWidth(s, fontSize(state.font)) });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p === 'fill') return () => { fills.push(String(state.fillStyle)); counts.fill = (counts.fill || 0) + 1; };
      if (p === '__calls') return calls;
      if (p === '__fills') return fills;
      if (p === '__counts') return counts;
      if (p in state) return state[p];
      return () => { counts[p] = (counts[p] || 0) + 1; };
    },
    set(t, p, v) { state[p] = v; return true; },
  });
}

function mockCanvasFactory() {
  return (w, h) => ({ width: w, height: h, getContext: () => mockCtx() });
}

const SIZES = [
  { name: '320x568', w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { name: '375x667', w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { name: '375x812', w: 375, h: 812, sb: 44, menu: { top: 48, bottom: 80, left: 281, right: 368 }, bottomInset: 34 },
  { name: '414x896', w: 414, h: 896, sb: 44, menu: { top: 50, bottom: 82, left: 320, right: 407 }, bottomInset: 34 },
  { name: '430x932', w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { name: '768x1024', w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];
const MODES = {
  default: { largeText: false, highContrast: false },
  large: { largeText: true, highContrast: false },
  hc: { largeText: false, highContrast: true },
  large_hc: { largeText: true, highContrast: true },
};

function layoutFor(sz) {
  return R.makeLayout({
    windowWidth: sz.w, windowHeight: sz.h, pixelRatio: 2, statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.bottomInset },
    menuRect: { ...sz.menu, width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top },
  });
}

/** Draw one fixture (its `under` screen first, as logic does) and return the topmost screen's result. */
function drawFixture(f, L, display, ctx) {
  ctx = ctx || mockCtx();
  if (f.under) {
    const uvm = prepare(f.under.screen, Object.assign({}, f.under.vm || sample(f.under.screen, f.under.state), { display }), L, ctx, display);
    R.screens[f.under.screen].draw(ctx, uvm, L);
  }
  const vm = prepare(f.screen, Object.assign({}, f.vm, { display }), L, ctx, display);
  const from = ctx.__calls.length;
  const hits = R.screens[f.screen].draw(ctx, vm, L) || [];
  return { hits, ctx, calls: ctx.__calls, topCalls: ctx.__calls.slice(from) };
}

/** every fixture x size x mode */
function eachFixture(fn, opts) {
  const o = opts || {};
  const all = build();
  for (const mode of o.modes || Object.keys(MODES)) {
    for (const sz of o.sizes || SIZES) {
      const L = layoutFor(sz);
      for (const f of all) {
        const r = drawFixture(f, L, MODES[mode]);
        fn({ f, L, sz, mode, display: MODES[mode], ...r });
      }
    }
  }
}

module.exports = { mockCtx, mockCanvasFactory, SIZES, MODES, layoutFor, drawFixture, eachFixture, textWidth, fontSize, path };
