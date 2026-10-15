'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDrawingTool, smoothPath } = require('../js/drawing');
const St = require('../core/strokes');

const RECT = { x: 16, y: 100, w: 343, h: 343 };

function tool(o) {
  const t = createDrawingTool(o);
  t.setRect(RECT);
  return t;
}

function line(t, id, x0, y0, x1, y1, steps) {
  assert.equal(t.pointerDown(id, x0, y0), true);
  for (let i = 1; i <= steps; i++) t.pointerMove(id, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  t.pointerUp(id, x1, y1);
}

test('AC 21: one finger draws; a second finger and touches starting outside are ignored', () => {
  const t = tool();
  assert.equal(t.pointerDown(1, 5, 5), false); // outside
  assert.equal(t.info().strokes, 0);
  assert.equal(t.pointerDown(1, 100, 200), true);
  assert.equal(t.pointerDown(2, 150, 250), false); // second finger
  assert.equal(t.pointerMove(2, 160, 260), false);
  assert.equal(t.pointerMove(1, 200, 260), true);
  assert.equal(t.pointerUp(2), false);
  assert.equal(t.pointerUp(1, 210, 270), true);
  assert.equal(t.info().strokes, 1);
  // moving outside during a stroke clamps to the edge
  t.pointerDown(3, 300, 300);
  t.pointerMove(3, 900, 900);
  t.pointerUp(3, 900, 900);
  const d = t.drawing();
  const pts = St.strokePoints(d.s[1]);
  assert.deepEqual(pts[pts.length - 1], [1023, 1023]);
  assert.equal(St.validate(d).ok, true);
});

test('coordinates map to the 1024 grid; the first point is absolute, then deltas; a tap is a dot', () => {
  const t = tool();
  t.pointerDown(1, RECT.x, RECT.y);
  t.pointerUp(1);
  t.pointerDown(2, RECT.x + RECT.w, RECT.y + RECT.h);
  t.pointerUp(2);
  t.pointerDown(3, RECT.x + RECT.w / 2, RECT.y + RECT.h / 2);
  t.pointerMove(3, RECT.x + RECT.w / 2 + 20, RECT.y + RECT.h / 2);
  t.pointerUp(3, RECT.x + RECT.w / 2 + 20, RECT.y + RECT.h / 2);
  const d = t.drawing();
  assert.deepEqual(d.s[0].slice(2), [0, 0]);
  assert.deepEqual(d.s[1].slice(2), [1023, 1023]);
  assert.equal(d.s[2].length, 6);
  assert.equal(d.s[2][2], 512);
  assert.ok(d.s[2][4] > 50); // 20 px of 343 is about 60 grid units
});

test('smoothing: points closer than 3 grid units are dropped, the end of the line is kept', () => {
  const t = tool();
  t.pointerDown(1, 100, 100);
  for (let i = 1; i <= 20; i++) t.pointerMove(1, 100 + i * 0.3, 100); // 6 px over 20 events: each step ~1 grid unit
  t.pointerUp(1, 106, 100);
  const pts = St.strokePoints(t.drawing().s[0]);
  assert.ok(pts.length >= 3 && pts.length <= 10, 'kept ' + pts.length);
  for (let i = 1; i < pts.length - 1; i++) assert.ok(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) >= 3 - 1e-9);
});

test('AC 22/23: colours (6 base, 6 locked until unlocked), 3 sizes, undo removes exactly the last stroke, clear empties', () => {
  const t = tool();
  assert.equal(t.setColor(5), true);
  assert.equal(t.setColor(6), false);
  assert.equal(t.info().colorIdx, 5);
  t.unlockPalette();
  assert.equal(t.setColor(11), true);
  assert.equal(t.setColor(12), false);
  assert.equal(t.setSize(3), false);
  assert.equal(t.setSize(0), true);
  line(t, 1, 50, 150, 200, 250, 10);
  t.setColor(0);
  t.setSize(2);
  line(t, 2, 60, 160, 210, 260, 10);
  const d = t.drawing();
  assert.deepEqual([d.s[0][0], d.s[0][1], d.s[1][0], d.s[1][1]], [11, 0, 0, 2]);
  assert.equal(t.info().colorsUsed, 2);
  assert.equal(t.undo(), true);
  assert.equal(t.drawing().s.length, 1);
  assert.deepEqual(t.drawing().s[0], d.s[0]);
  assert.equal(t.info().undoCount, 1);
  assert.equal(t.clear(), true);
  assert.deepEqual(t.drawing(), { v: 1, s: [] });
  assert.equal(t.info().canUndo, false);
  assert.equal(t.undo(), false);
  assert.equal(t.info().points, 0);
});

test('AC 26: new strokes are refused at 4,000 points; strokes cap at 600 points and 200 strokes', () => {
  const t = tool();
  // 600-point stroke: zig-zag so every step is >= 3 grid units
  assert.equal(t.pointerDown(1, 20, 120), true);
  for (let i = 1; i < 700; i++) t.pointerMove(1, 20 + (i % 2) * 30, 120 + (i % 7) * 20);
  t.pointerUp(1);
  assert.equal(St.strokePointCount(t.drawing().s[0]), 600);
  for (let k = 1; k < 7; k++) {
    t.pointerDown(k + 1, 20, 120);
    for (let i = 1; i < 700; i++) t.pointerMove(k + 1, 20 + (i % 2) * 30, 120 + (i % 7) * 20);
    t.pointerUp(k + 1);
  }
  let info = t.info();
  assert.ok(info.points <= 4000);
  // 6 x 600 = 3600, the 7th stroke is cut at 4,000
  assert.equal(info.points, 4000);
  assert.equal(info.limit, true);
  assert.equal(t.pointerDown(99, 100, 200), false);
  assert.equal(St.validate(t.drawing()).ok, true);
  // undo frees room again
  t.undo();
  assert.equal(t.info().limit, false);
  assert.equal(t.pointerDown(100, 100, 200), true);
  t.pointerUp(100);
  // 200 strokes
  const u = tool();
  for (let i = 0; i < 205; i++) {
    u.pointerDown(i + 1, 100, 200);
    u.pointerUp(i + 1);
  }
  assert.equal(u.info().strokes, 200);
  assert.equal(u.info().limit, true);
});

test('strokesForRender includes the stroke being drawn; load resumes a saved turn', () => {
  const t = tool();
  t.pointerDown(1, 100, 200);
  t.pointerMove(1, 150, 220);
  assert.equal(t.strokesForRender().s.length, 1);
  assert.equal(t.drawing().s.length, 0);
  assert.equal(t.info().canUndo, false);
  assert.equal(t.undo(), false); // not while a finger is down
  t.pointerUp(1, 150, 220);
  const saved = t.drawing();
  const u = tool();
  assert.equal(u.load(saved), true);
  assert.deepEqual(u.drawing(), saved);
  assert.equal(u.load({ v: 1, s: [[99, 0, 1, 1]] }), false);
  assert.equal(u.info().points, St.pointCount(saved));
});

test('pointerCancel keeps what was drawn', () => {
  const t = tool();
  t.pointerDown(1, 100, 200);
  t.pointerMove(1, 160, 220);
  t.pointerCancel(1);
  assert.equal(t.drawing().s.length, 1);
});

test('smoothPath: dot, line, and quadratic midpoints', () => {
  assert.deepEqual(smoothPath([[5, 5]]), [{ type: 'dot', x: 5, y: 5 }]);
  assert.deepEqual(smoothPath([[0, 0], [10, 0]]).map((s) => s.type), ['move', 'line']);
  const p = smoothPath([[0, 0], [10, 0], [10, 10], [20, 10]]);
  assert.deepEqual(p.map((s) => s.type), ['move', 'quad', 'quad', 'line']);
  assert.deepEqual([p[1].cx, p[1].cy, p[1].x, p[1].y], [10, 0, 10, 5]);
  assert.deepEqual(smoothPath([]), []);
});
