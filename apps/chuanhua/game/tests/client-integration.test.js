'use strict';
// UI <-> logic integration with the REAL renderer (js/render/index.js): the live tour of tests/tour.js (a live room of 3, a 慢慢传 chain, the
// lists, the sheets and the entry states) runs through js/main.js's wiring and checks:
//   1. no screen fell back to the dev stub (a throw on a real view model),
//   2. AC 108: nothing tappable in the capsule row, touch targets >= 48 pt (structural, scroll and canvas areas excepted),
//   3. the primary actions of the screens named in the spec sit in the bottom 40% of the window,
//   4. the geometry the controller froze is the renderer's (draw and describe rects of spec 8.4 / 8.5).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runTour } = require('./tour');
const { SCREEN, CAPSULE, world } = require('./harness');
const { fallbackErrors } = require('../js/renderers');
const R = require('../js/render');

const G = { group: 'g1' };
const STRUCTURAL = /(:block|:card|:scrim|:body|:list|:scroll)$|^(sheet:|coach:block|draw:canvas|stepthrough:(prevHalf|nextHalf|skip)|adstub:|dialog:block)/;
let touring = null;
const tour = () => (touring = touring || runTour());

test('real renderer: no screen fell back to the stub (the real renderer drew every screen of the tour)', async () => {
  await tour();
  assert.deepEqual(fallbackErrors, []);
});

test('AC 108 (real renderer): nothing tappable in the capsule row; touch targets are at least 48 pt', async () => {
  const { hitsSeen } = await tour();
  const navBottom = CAPSULE.bottom + (CAPSULE.top - SCREEN.statusBarHeight);
  const inCapsule = [];
  const small = [];
  for (const [k, hits] of Object.entries(hitsSeen)) {
    for (const h of hits) {
      if (STRUCTURAL.test(h.id)) continue;
      if (h.y < navBottom && h.x + h.w > CAPSULE.left) inCapsule.push(`${k}: ${h.id}`);
      if (h.w < 47 || h.h < 47) small.push(`${k}: ${h.id} ${Math.round(h.w)}x${Math.round(h.h)}`);
    }
  }
  assert.deepEqual(inCapsule, []);
  assert.deepEqual(small, []);
});

test('AC 108: primary buttons sit in the bottom 40% of the window', async () => {
  const { hitsSeen } = await tour();
  const limit = SCREEN.windowHeight * 0.6;
  const primaries = { 'home/ready': 'home:primary', 'lobby/ready': 'lobby:start', 'pick/ready': 'pick:start', 'draw/drawing': 'draw:submit', 'describe/typing': 'describe:submit', 'roomEntry/joinable': 'roomEntry:join', 'entry/claimable': 'entry:claim' };
  const high = [];
  for (const [k, id] of Object.entries(primaries)) {
    const h = (hitsSeen[k] || []).find((x) => x.id === id);
    if (!h) continue;
    if (h.y < limit) high.push(`${k}: ${id} at y ${Math.round(h.y)}`);
  }
  assert.deepEqual(high, []);
});

test('the frozen geometry is the renderer\'s (spec 8.4 / 8.5 rects at 375 x 812), and the describe drawing area fills the space above the input', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  const cv = a.hit('draw:canvas');
  const vm = a.vm();
  assert.equal(vm.sourceLines, 1);
  assert.deepEqual([cv.x, cv.y, cv.w, cv.h], [8, 180, 359, 478], 'spec 8.4: 375 x 812, 1-line strip');
  assert.equal(vm.gridH, 1363);
  assert.deepEqual(vm.canvas, { x: 8, y: 180, w: 359, h: 478 }, 'the vm carries the frozen rect');
  assert.equal(a.app.hits.gridH, 1363);
  assert.equal(R.drawGeometry(a.app.layout, { sourceLines: 1, unlocked: false }).canvas.h, 478);
  a.scribble(1);
  await a.tap('draw:submit');
  const id = a.ctl.state.sent.chainId;
  const b = await w.player('B', { rules: true, ...G });
  w.advance(4000);
  await b.show({ scene: 1044, query: { k: id }, shareTicket: 'tk' });
  await b.tap('entry:claim');
  b.frame();
  const g = R.describeGeometry(b.app.layout, {});
  assert.deepEqual([g.drawing.x, g.drawing.y, g.drawing.w, g.drawing.h], [8, 140, 359, 510]);
  assert.deepEqual([b.app.hits.drawing.x, b.app.hits.drawing.y, b.app.hits.drawing.w, b.app.hits.drawing.h], [8, 140, 359, 510]);
});

test('the draw canvas is the same size every frame of a turn, with a 2-line source strip and with 大字模式 (AC 126)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const starter = await w.player('S', { rules: true, ...G });
  // a custom prompt long enough for 2 lines in the source strip
  await starter.tap('home:slow');
  await starter.tap('pick:custom');
  starter.type('十二个字的很长很长的题目啊');
  await starter.tap('pick:customOk');
  const rects = new Set();
  for (let i = 0; i < 5; i++) {
    starter.scribble(1);
    rects.add(JSON.stringify(starter.hit('draw:canvas')));
    w.advance(1000);
  }
  assert.equal(rects.size, 1);
  assert.ok(a);
  await a.tap('home:settings');
  await a.tap('settings:largeText');
  await a.tap('sheet:close');
  await a.tap('home:slow');
  await a.tap('pick:start');
  const big = new Set();
  for (let i = 0; i < 4; i++) {
    a.scribble(1);
    big.add(JSON.stringify(a.hit('draw:canvas')));
    w.advance(1000);
  }
  assert.equal(big.size, 1);
  const r = JSON.parse([...big][0]);
  assert.ok(r.h / r.w >= 0.75 && r.h / r.w <= 2);
});
