/**
 * Shared test helpers for the render tests: a recording canvas context that
 * tracks translate/scale (so text positions are in screen space), the window
 * sizes, and a state iterator over every fixture in every display mode.
 */

const { makeLayout } = require('../js/render/layout');
const render = require('../js/render');
const { buildFixtures } = require('../tools/preview/fixtures.js');

function fontSize(f) {
  const m = /([\d.]+)px/.exec(f || '');
  return m ? Number(m[1]) : 10;
}

/** Width model: CJK and full-width glyphs 1em, ASCII digits and letters 0.56em. */
function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) w += /[\u0000-ÿ]/.test(ch) ? 0.56 : 1;
  return w * size;
}

/**
 * mockCtx({ops}): fillText calls are recorded in screen space with
 * {s, x, y, size, align, left, right, color, alpha}. With ops:true every
 * other drawing method is logged too (name + args) in __ops.
 */
function mockCtx(opt) {
  const calls = [];
  const ops = [];
  const state = { font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', textAlign: 'left', globalAlpha: 1, lineWidth: 1 };
  let tf = { x: 0, y: 0, sx: 1, sy: 1 };
  let clip = null; // {x1,y1,x2,y2} in screen space
  let pend = null;
  const stack = [];
  const grad = { addColorStop() {} };
  const logOps = opt && opt.ops;
  const ctx = new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'save') return () => stack.push({ tf: { ...tf }, st: { ...state }, clip });
        if (p === 'restore') {
          return () => {
            const s = stack.pop();
            if (s) {
              tf = s.tf;
              clip = s.clip;
              Object.assign(state, s.st);
            }
          };
        }
        if (p === 'translate') return (x, y) => ((tf = { ...tf, x: tf.x + x * tf.sx, y: tf.y + y * tf.sy }), undefined);
        if (p === 'scale') return (x, y) => ((tf = { ...tf, sx: tf.sx * x, sy: tf.sy * y }), undefined);
        if (p === 'rect') return (x, y, w, h) => ((pend = { x1: tf.x + x * tf.sx, y1: tf.y + y * tf.sy, x2: tf.x + (x + w) * tf.sx, y2: tf.y + (y + h) * tf.sy }), undefined);
        if (p === 'beginPath') return () => ((pend = null), undefined);
        if (p === 'clip') {
          return () => {
            if (!pend) return;
            clip = clip ? { x1: Math.max(clip.x1, pend.x1), y1: Math.max(clip.y1, pend.y1), x2: Math.min(clip.x2, pend.x2), y2: Math.min(clip.y2, pend.y2) } : pend;
          };
        }
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
            if (logOps) ops.push({ m: 'fillText', s: String(s), color: state.fillStyle });
          };
        }
        if (p === 'measureText') return (s) => ({ width: textWidth(s, fontSize(state.font)) });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
        if (p === '__calls') return calls;
        if (p === '__ops') return ops;
        if (p in state) return state[p];
        if (logOps) {
          return (...args) => {
            ops.push({ m: String(p), args: args.map((a) => (typeof a === 'number' ? Math.round(a * 100) / 100 : typeof a === 'string' ? a : typeof a)), fill: state.fillStyle, stroke: state.strokeStyle });
          };
        }
        return () => {};
      },
      set(t, p, v) {
        state[p] = v;
        return true;
      },
    }
  );
  return ctx;
}

function mockCreateCanvas() {
  return { width: 0, height: 0, getContext: () => mockCtx(), toTempFilePath() {} };
}

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, bottomInset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];

const MODES = {
  default: { largeText: false, highContrast: false },
  large: { largeText: true, highContrast: false },
  hc: { largeText: false, highContrast: true },
  large_hc: { largeText: true, highContrast: true },
};

function layoutFor(sz) {
  return makeLayout({
    windowWidth: sz.w,
    windowHeight: sz.h,
    pixelRatio: 2,
    statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.bottomInset },
    menuRect: { ...sz.menu, width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top },
  });
}

/** Screens that draw through render.screens (shareCard is tested separately). */
function eachState(fn, modes) {
  const names = modes || ['default'];
  for (const mode of names) {
    for (const sz of SIZES) {
      const L = layoutFor(sz);
      const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] });
      for (const screen of Object.keys(fx)) {
        if (screen === 'shareCard') continue;
        for (const name of Object.keys(fx[screen])) {
          const st = fx[screen][name];
          const vm = st.vm !== undefined ? st.vm : st;
          const ctx = mockCtx();
          let hits = render.screens[screen].draw(ctx, vm, L);
          if (st.overlay) {
            const sm = hits.scrollMax;
            hits = hits.concat(render.overlay.draw(ctx, st.overlay, L));
            hits.scrollMax = sm;
          }
          fn(screen, name, hits, ctx.__calls, L, sz, vm, st, mode);
        }
      }
    }
  }
}

module.exports = { mockCtx, mockCreateCanvas, SIZES, MODES, layoutFor, eachState, textWidth, fontSize };
