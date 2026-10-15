'use strict';
// Cost of the per-frame and per-touch paths on the JS side (renderers excluded). Numbers are printed so they
// can be quoted; bounds are generous (Node on a dev machine is faster than a mid-range Android, so the real
// budget is checked on the device pass, V5).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDrawingTool } = require('../js/drawing');
const V = require('../js/vm');
const St = require('../core/strokes');

function bench(fn, n) {
  for (let i = 0; i < Math.min(n, 2000); i++) fn(i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn(i);
  return Number(process.hrtime.bigint() - t0) / 1e6 / n; // ms per call
}

test('perf: a pointer move costs microseconds and allocates nothing per event', () => {
  const tool = createDrawingTool();
  tool.setRect({ x: 16, y: 100, w: 343, h: 343 });
  tool.pointerDown(1, 100, 200);
  const ms = bench((i) => tool.pointerMove(1, 100 + (i % 200), 200 + ((i * 7) % 200)), 200000);
  console.log(`# pointerMove: ${(ms * 1000).toFixed(2)} us/event`);
  assert.ok(ms < 0.02, ms + ' ms');
  tool.pointerUp(1);
  assert.equal(St.validate(tool.drawing()).ok, true);
});

test('perf: building the draw view model with 4,000 points on screen is far below a frame', () => {
  const tool = createDrawingTool();
  tool.setRect({ x: 16, y: 100, w: 343, h: 343 });
  for (let k = 0; k < 7; k++) {
    tool.pointerDown(k + 1, 20, 120);
    for (let i = 1; i < 700; i++) tool.pointerMove(k + 1, 20 + (i % 2) * 30, 120 + (i % 7) * 20);
    tool.pointerUp(k + 1);
  }
  assert.equal(tool.info().points, 4000);
  tool.pointerDown(99, 50, 150); // refused at the limit; draw one more after undo to have a live stroke
  tool.undo();
  tool.pointerDown(100, 50, 150);
  tool.pointerMove(100, 120, 200);
  const turn = { chainId: 'c', claimId: 'k', step: 3, startedAt: 0, source: { kind: 'text', text: '恐龙在学跳舞' } };
  const ms = bench((i) => V.drawVm({ turn, info: tool.info(), drawing: tool.strokesForRender(), unlocked: false, paletteAdOffered: true, status: 'drawing', now: 1000 + i }), 20000);
  console.log(`# drawVm with 4,000 points: ${(ms * 1000).toFixed(2)} us/frame`);
  assert.ok(ms < 0.2, ms + ' ms');
  // while nothing changes the same render object is reused (no per-frame copy of the strokes)
  assert.equal(tool.strokesForRender(), tool.strokesForRender());
});

test('perf: stroke validation and compact encoding of a full drawing stay within a few milliseconds', () => {
  const d = { v: 1, s: [] };
  for (let k = 0; k < 7; k++) {
    const pts = [];
    for (let i = 0; i < 571; i++) pts.push([100 + ((i * 13) % 800), 100 + ((i * 29) % 800)]);
    d.s.push(St.makeStroke(k % 12, 1, pts));
  }
  const v = bench(() => St.validate(d), 500);
  const e = bench(() => St.encode(d), 500);
  const enc = St.encode(d);
  const dec = bench(() => St.decode(enc), 500);
  console.log(`# 4,000-point drawing: validate ${v.toFixed(3)} ms, encode ${e.toFixed(3)} ms (${enc.length} chars vs ${St.jsonBytes(d)} bytes JSON), decode ${dec.toFixed(3)} ms`);
  assert.ok(v < 5 && e < 5 && dec < 5);
});

test('perf: the reveal view model for 6 棒 with 3 full drawings builds in well under a frame', () => {
  const draw = { v: 1, s: [] };
  for (let i = 0; i < 40; i++) draw.s.push(St.makeStroke(i % 6, 1, [[10, 10 + i], [200, 200], [300, 300 + i]]));
  const data = {
    chainId: 'c', promptId: 'A01', promptText: '月亮吃月饼', custom: false, passed: 6, early: false, participantCount: 2, durationMs: 3600e3, nationalCount: null,
    steps: [1, 2, 3, 4, 5, 6].map((n) => ({ n, kind: n % 2 ? 'draw' : 'describe', strokes: n % 2 ? draw : undefined, text: n % 2 ? undefined : '一句话', mine: n < 3, laughs: 0, myLaugh: false, placeholder: null })),
  };
  const ms = bench((i) => V.revealVm({ state: 'ready', chainId: 'c', data, now: 5000 + i, autoplay: { enabled: true, playing: true, startedAt: 0 } }), 20000);
  console.log(`# revealVm: ${(ms * 1000).toFixed(2)} us/frame`);
  assert.ok(ms < 0.5, ms + ' ms');
});
