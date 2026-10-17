'use strict';
// Same fixtures as render.screens.test.js but drawn on a REAL canvas with a real CJK font (Noto Sans SC, open licence;
// skipped when @napi-rs/canvas or the font is missing): text must not be truncated, must fit the window and must not
// overlap other text of the same screen, with the real glyph widths instead of the mock's width model.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { SIZES, MODES, layoutFor } = require('./render-mock');
const { build, prepare } = require('../tools/preview/fixtures.js');
const R = require('../js/render');
const { sample } = require('../js/render/samples.js');

let napi = null;
let fontOk = false;
try {
  const p = path.join(__dirname, '..', 'tools', 'preview', 'node_modules', '@napi-rs', 'canvas');
  if (fs.existsSync(p)) napi = require(p);
  const dir = process.env.FONT_DIR || 'C:/Windows/Fonts';
  const f = path.join(dir, 'NotoSansSC-VF.ttf');
  if (napi && fs.existsSync(f)) fontOk = !!napi.GlobalFonts.registerFromPath(f, 'Noto Sans CJK SC') || true;
} catch (e) {
  napi = null;
}
const real = napi && fontOk ? test : (name, fn) => test(name, { skip: 'needs @napi-rs/canvas and NotoSansSC-VF.ttf (FONT_DIR)' }, fn);

const ELLIPSIS_OK = ['正在交出…', '时间到，正在交出…', '传递中…', '正在进入…', '马上开始…', '加入中…', '准备中…', '正在抽题…', '网络不好，正在重连…', '正在揭晓…', '准备画布…', '正在传出…', '审核中…', '展开接龙…', '正在展开…', '正在加载…', '正在确认群聊…', '请求中…', '广告加载中…', '播放中…', '正在删除…', '提交中…', '接龙中…'];

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 1 && h > 1 ? w * h : 0;
}

/** wrap a real 2d context: records every fillText in screen space with its real measured width, and tracks clip() */
function recording(ctx) {
  const calls = [];
  const stack = [];
  let clip = null;
  let pend = null;
  const proxy = new Proxy(ctx, {
    get(t, p) {
      if (p === 'save') return () => { stack.push(clip); return t.save(); };
      if (p === 'restore') return () => { if (stack.length) clip = stack.pop(); return t.restore(); };
      if (p === 'beginPath') return () => { pend = null; return t.beginPath(); };
      if (p === 'rect') {
        return (x, y, w, h) => {
          const m = t.getTransform();
          pend = { x1: m.a * x + m.e, y1: m.d * y + m.f, x2: m.a * (x + w) + m.e, y2: m.d * (y + h) + m.f };
          return t.rect(x, y, w, h);
        };
      }
      if (p === 'clip') return () => { if (pend) clip = clip ? { x1: Math.max(clip.x1, pend.x1), y1: Math.max(clip.y1, pend.y1), x2: Math.min(clip.x2, pend.x2), y2: Math.min(clip.y2, pend.y2) } : pend; return t.clip(); };
      if (p === 'fillText') {
        return (s, x, y) => {
          const m = t.getTransform();
          const w = t.measureText(String(s)).width * Math.abs(m.a);
          const X = m.a * x + m.e;
          const Y = m.d * y + m.f;
          const a = t.textAlign;
          const left = a === 'center' ? X - w / 2 : a === 'right' || a === 'end' ? X - w : X;
          const size = (/([\d.]+)px/.exec(t.font) || [0, 10])[1] * Math.abs(m.d);
          const visible = !clip || (Y - size * 0.5 >= clip.y1 - 1 && Y + size * 0.5 <= clip.y2 + 1);
          calls.push({ s: String(s), left, right: left + w, y: Y, size, visible });
          return t.fillText(s, x, y);
        };
      }
      if (p === '__calls') return calls;
      const v = t[p];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  return proxy;
}

real('real font: no truncated text, nothing leaves the window, no overlapping text (all fixtures, 5 sizes, 4 modes)', () => {
  const R2 = napi.createCanvas;
  const strokesMod = require('../js/render/strokes');
  strokesMod.setCanvasFactory((w, h) => R2(w, h));
  const all = build();
  const problems = [];
  for (const mode of Object.keys(MODES)) {
    for (const sz of SIZES) {
      const L = layoutFor(sz);
      for (const f of all) {
        const cv = R2(sz.w, sz.h);
        const ctx = recording(cv.getContext('2d'));
        if (f.under) R.screens[f.under.screen].draw(ctx, prepare(f.under.screen, Object.assign({}, f.under.vm || sample(f.under.screen, f.under.state), { display: MODES[mode] }), L, ctx, MODES[mode]), L);
        const from = ctx.__calls.length;
        R.screens[f.screen].draw(ctx, prepare(f.screen, Object.assign({}, f.vm, { display: MODES[mode] }), L, ctx, MODES[mode]), L);
        const calls = ctx.__calls.slice(from);
        const tag = `${f.screen}/${f.state} ${sz.name} ${mode}`;
        const full = JSON.stringify(f.vm);
        for (const c of calls.filter((x) => x.visible)) {
          if (c.s.endsWith('…') && !ELLIPSIS_OK.includes(c.s) && !full.includes(c.s)) problems.push(`${tag}: "${c.s}" truncated`);
        }
        // text that is drawn inside a scroll viewport may be partly outside it; compare to the window only
        for (const c of calls.filter((x) => x.visible)) {
          if (c.left < -1 || c.right > sz.w + 1) problems.push(`${tag}: "${c.s}" leaves the window`);
        }
        // overlaps among the texts that are on screen
        const vis = calls.filter((c) => c.s.trim() && c.visible);
        for (let i = 0; i < vis.length; i++) {
          for (let j = i + 1; j < vis.length; j++) {
            const a = vis[i];
            const b = vis[j];
            if (overlap({ x: a.left, y: a.y - a.size * 0.4, w: a.right - a.left, h: a.size * 0.8 }, { x: b.left, y: b.y - b.size * 0.4, w: b.right - b.left, h: b.size * 0.8 }) > 8) {
              // text inside a scroll viewport can be hidden under the pinned buttons: only flag when both are in view of the same row
              problems.push(`${tag}: "${a.s}" overlaps "${b.s}"`);
            }
          }
        }
      }
    }
  }
  strokesMod.setCanvasFactory(null);
  const uniq = [...new Set(problems)];
  assert.equal(uniq.length, 0, uniq.slice(0, 30).join('\n') + (uniq.length > 30 ? `\n... ${uniq.length - 30} more` : ''));
});
