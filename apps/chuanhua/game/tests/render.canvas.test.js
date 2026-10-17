'use strict';
// Spec 8.4 / 8.5 / 5.1 / 5.7 as tests (AC 122-127, 163): the draw- and describe-screen rects equal the spec's numbers at
// 375 x 812 and 320 x 568 (1-line and 2-line source strip, 今日彩笔 unlocked), the canvas uses ALL the free space at every
// other size and mode (clamped to 768-2048 and centred outside the clamp), nothing sits between the strip, the canvas and
// the colour row except the 8 pt gaps, the canvas never moves during a turn, v2 strokes are contain-fitted (never cropped
// or stretched, with the margin tone), and no ad area ever intersects the canvas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/render');
const Strokes = require('../js/render/strokes');
const T = require('../js/render/theme');
const SM = require('../js/render/samples.js');
const { sample } = SM;
const { mockCtx, SIZES, MODES, layoutFor } = require('./render-mock');
const { prepare } = require('../tools/preview/fixtures.js');

const S = (name) => SIZES.find((s) => s.name === name);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol == null ? 1 : tol), `${msg}: ${a} vs ${b}`);
const rectIs = (r, x, y, w, h, tag, tol) => {
  near(r.x, x, tol, tag + ' x');
  near(r.y, y, tol, tag + ' y');
  near(r.w, w, tol, tag + ' w');
  near(r.h, h, tol, tag + ' h');
};
const STD = MODES.default;

/** what logic does at turn open: the vm for this window (canvas rect, gridH, strip lines), then draw */
function drawVm(L, o) {
  const ctx = mockCtx();
  const vm = prepare('draw', Object.assign(sample('draw', 'drawing'), { display: STD }, o || {}), L, ctx, STD);
  const hits = R.screens.draw.draw(ctx, vm, L);
  return { vm, hits, ctx };
}
const LONG = '一只穿着雨衣的企鹅在沙漠里骑自行车';

// ------------------------------------------------------------------ AC 122: the rects of spec 8.4

test('AC 122: draw screen rects at 375 x 812 equal spec 8.4 (1-line strip, 2-line strip, 今日彩笔 unlocked)', () => {
  const L = layoutFor(S('375x812'));
  T.applyDisplay(STD);
  const g1 = R.drawGeometry(L, { sourceLines: 1, unlocked: false });
  rectIs(g1.bar.back, 8, 84, 80, 48, 'back');
  rectIs(g1.bar.title, 88, 84, 159, 48, 'title');
  rectIs(g1.bar.report, 247, 84, 48, 48, '举报');
  rectIs(g1.bar.timer, 303, 84, 64, 48, 'timer');
  assert.equal(g1.bar.y, 84);
  rectIs(g1.strip, 16, 132, 343, 40, 'strip 1');
  rectIs(g1.canvas, 8, 180, 359, 478, 'canvas 1');
  assert.equal(g1.gridH, 1363);
  rectIs(g1.colourRows[0], 8, 666, 359, 48, 'colour row');
  rectIs(g1.toolRow, 8, 722, 359, 48, 'tool row');
  rectIs(g1.buttons.undo, 8, 722, 64, 48, '撤销');
  rectIs(g1.buttons.clear, 80, 722, 64, 48, '清空');
  rectIs(g1.buttons.size, 152, 722, 64, 48, '粗细');
  rectIs(g1.buttons.submit, 224, 722, 143, 48, '画好了');
  assert.equal(L.bottomEdge, 778);
  near(778 - (g1.toolRow.y + g1.toolRow.h), 8, 0.01, 'gap below the tool row');

  const g2 = R.drawGeometry(L, { sourceLines: 2, unlocked: false });
  rectIs(g2.strip, 16, 132, 343, 64, 'strip 2');
  rectIs(g2.canvas, 8, 204, 359, 454, 'canvas 2');
  assert.equal(g2.gridH, 1295);

  const gu = R.drawGeometry(L, { sourceLines: 1, unlocked: true });
  assert.deepEqual(gu.colourRows.map((r) => r.y), [610, 666]);
  rectIs(gu.canvas, 8, 180, 359, 422, 'canvas unlocked');
  near(gu.gridH, 1204, 1, 'gridH unlocked');
});

test('AC 122: draw screen rects at 320 x 568 equal spec 8.4 (1-line strip, 2-line strip, unlocked, unlocked + 2 lines = clamped)', () => {
  const L = layoutFor(S('320x568'));
  T.applyDisplay(STD);
  const g1 = R.drawGeometry(L, { sourceLines: 1, unlocked: false });
  rectIs(g1.bar.back, 8, 64, 80, 48, 'back');
  rectIs(g1.bar.title, 88, 64, 104, 48, 'title');
  rectIs(g1.bar.report, 192, 64, 48, 48, '举报');
  rectIs(g1.bar.timer, 248, 64, 64, 48, 'timer');
  rectIs(g1.strip, 16, 112, 288, 40, 'strip 1');
  rectIs(g1.canvas, 8, 160, 304, 288, 'canvas 1');
  assert.equal(g1.gridH, 970);
  rectIs(g1.colourRows[0], 8, 456, 304, 48, 'colour row');
  rectIs(g1.toolRow, 8, 512, 304, 48, 'tool row');
  rectIs(g1.buttons.undo, 8, 512, 56, 48, '撤销');
  rectIs(g1.buttons.clear, 72, 512, 56, 48, '清空');
  rectIs(g1.buttons.size, 136, 512, 56, 48, '粗细');
  rectIs(g1.buttons.submit, 200, 512, 112, 48, '画好了');

  const g2 = R.drawGeometry(L, { sourceLines: 2, unlocked: false });
  rectIs(g2.strip, 16, 112, 288, 64, 'strip 2');
  rectIs(g2.canvas, 8, 184, 304, 264, 'canvas 2');
  assert.equal(g2.gridH, 889);

  const gu = R.drawGeometry(L, { sourceLines: 1, unlocked: true });
  assert.deepEqual(gu.colourRows.map((r) => r.y), [400, 456]);
  rectIs(gu.canvas, 8, 160, 304, 232, 'canvas unlocked');
  near(gu.gridH, 782, 1, 'gridH unlocked (spec says 782, the formula gives 781)');

  const gc = R.drawGeometry(L, { sourceLines: 2, unlocked: true });
  assert.deepEqual(gc.free && { w: gc.free.w, h: gc.free.h }, { w: 304, h: 208 });
  rectIs(gc.canvas, 21.5, 184, 277, 208, 'clamped canvas');
  assert.equal(gc.gridH, 768);
});

test('AC 122: draw() produces those rects as hit areas (canvas, bar, colours, tools), for the real vm path', () => {
  for (const [name, sw, sh, swx, lines] of [['375x812', 359, 478, 62.2, 1], ['320x568', 304, 288, 51.2, 1]]) {
    const L = layoutFor(S(name));
    const { hits, vm } = drawVm(L, {});
    assert.equal(vm.sourceLines, lines);
    const hit = (id) => hits.find((h) => h.id === id);
    rectIs(hit('draw:canvas'), 8, L.navBottom + 48 + 40 + 8, sw, sh, name + ' draw:canvas');
    assert.deepEqual({ x: hits.canvas.x, y: hits.canvas.y, w: hits.canvas.w, h: hits.canvas.h }, { x: hit('draw:canvas').x, y: hit('draw:canvas').y, w: hit('draw:canvas').w, h: hit('draw:canvas').h });
    assert.equal(hits.gridH, Math.round((1024 * sh) / sw));
    // paper == canvas (within 1 px): the touch mapping is exact
    rectIs(hits.paper, hits.canvas.x, hits.canvas.y, hits.canvas.w, hits.canvas.h, name + ' paper', 1);
    rectIs(hit('draw:back'), 8, L.navBottom, 80, 48, name + ' back');
    rectIs(hit('draw:report'), L.W - 8 - 64 - 8 - 48, L.navBottom, 48, 48, name + ' 举报');
    rectIs(hit('draw:size'), 8 + 2 * ((name === '375x812' ? 64 : 56) + 8), L.bottomEdge - 8 - 48, name === '375x812' ? 64 : 56, 48, name + ' size');
    for (let i = 0; i < 6; i++) rectIs(hit('draw:color:' + i), 8 + swx * i, L.bottomEdge - 8 - 48 - 8 - 48, 48, 48, name + ' swatch ' + i);
    rectIs(hit('draw:submit'), L.W - 8 - (name === '375x812' ? 143 : 112), L.bottomEdge - 8 - 48, name === '375x812' ? 143 : 112, 48, name + ' 画好了');
  }
});

test('AC 122: the same rects when the strip has 2 lines and when 今日彩笔 is unlocked, through draw()', () => {
  for (const [name, y2, h2] of [['375x812', 204, 454], ['320x568', 184, 264]]) {
    const L = layoutFor(S(name));
    const r = drawVm(L, { source: { kind: 'text', text: LONG } });
    assert.equal(r.vm.sourceLines, 2);
    rectIs(r.hits.find((h) => h.id === 'draw:canvas'), 8, y2, name === '375x812' ? 359 : 304, h2, name + ' 2-line canvas');
    const u = drawVm(L, { palette: SM.palette(true) });
    const base = drawVm(L, {});
    assert.equal(u.hits.canvas.h, base.hits.canvas.h - 56, name + ': the canvas loses 56 pt');
    assert.equal(u.hits.filter((h) => /^draw:color:/.test(h.id)).length, 12);
  }
});

// ------------------------------------------------------------------ AC 123-126: fills everything, stays put

function geometries() {
  const out = [];
  for (const sz of SIZES) {
    for (const [mode, display] of Object.entries(MODES)) {
      const L = layoutFor(sz);
      for (const lines of [1, 2]) for (const unlocked of [false, true]) out.push({ sz, mode, L, lines, unlocked, g: R.drawGeometry(L, { sourceLines: lines, unlocked, display }), display });
    }
  }
  return out;
}

test('AC 123/124: the canvas fills ALL the free space at every size and mode; outside the 768-2048 clamp it is reduced to the clamped aspect and centred', () => {
  for (const { sz, mode, L, lines, unlocked, g } of geometries()) {
    const tag = `${sz.name} ${mode} lines=${lines} unlocked=${unlocked}`;
    const c = g.canvas;
    const f = g.free;
    // the free space: 8 pt below the strip down to 8 pt above the top colour row, 8 pt side margins
    near(f.y, g.strip.y + g.strip.h + 8, 0.01, tag + ' free.y');
    near(f.y + f.h + 8, g.colourRows[0].y, 0.01, tag + ' free bottom');
    near(f.x, 8, 0.01, tag + ' free.x');
    near(f.w, L.W - 16, 0.01, tag + ' free.w');
    const raw = Math.round((1024 * f.h) / f.w);
    assert.equal(g.gridH, Math.max(768, Math.min(2048, raw)), tag + ' gridH');
    assert.ok(c.x >= f.x - 0.01 && c.y >= f.y - 0.01 && c.x + c.w <= f.x + f.w + 0.01 && c.y + c.h <= f.y + f.h + 0.01, tag + ' canvas inside the free space');
    if (raw >= 768 && raw <= 2048) rectIs(c, f.x, f.y, f.w, f.h, tag + ' unclamped canvas = free space', 0.01);
    else if (raw < 768) {
      near(c.h, f.h, 0.01, tag + ' full height');
      near(c.w, (f.h * 1024) / 768, 1, tag + ' clamped width');
      near(c.x - f.x, f.x + f.w - (c.x + c.w), 0.51, tag + ' centred');
    } else {
      near(c.w, f.w, 0.01, tag + ' full width');
      near(c.h, f.w * 2, 1, tag + ' clamped height');
      near(c.y - f.y, f.y + f.h - (c.y + c.h), 0.51, tag + ' centred vertically');
    }
    // the canvas is the only thing between the strip and the colour rows; stays on screen above the safe area
    assert.ok(g.toolRow.y + g.toolRow.h <= L.bottomEdge - 8 + 0.01, tag + ' tool row above the safe area');
    assert.ok(g.strip.y >= L.navBottom + g.bar.h - 0.01, tag + ' strip below the bar');
    assert.ok(g.bar.y >= L.capsule.y + L.capsule.h, tag + ' nothing in the capsule row');
    // it is the biggest it can be: at least the tall reference phone's 478 high at 375 x 812
    if (sz.name === '375x812' && mode === 'default' && lines === 1 && !unlocked) assert.ok(c.h >= 478);
  }
});

test('AC 126: the canvas rect and h do not change during a turn (status strips are drawn over it)', () => {
  for (const name of ['320x568', '375x812', '430x932']) {
    const L = layoutFor(S(name));
    const base = drawVm(L, {});
    for (const [st, extra] of [['sending', { inputLocked: true }], ['blocked', {}], ['error', {}], ['timeUp', { inputLocked: true }], ['drawing', { coach: true }], ['drawing', { limitText: '画得太细啦，先交吧' }]]) {
      const r = drawVm(L, Object.assign({ status: st, statusText: '正在交出…' }, extra));
      assert.deepEqual(r.hits.canvas, base.hits.canvas, name + ' ' + st);
      assert.equal(r.hits.gridH, base.hits.gridH);
    }
    // more strokes, another colour, another size: the same
    const more = drawVm(L, { strokes: SM.busyDrawing(base.hits.gridH), colorIdx: 3, sizeIdx: 2, timer: { secLeft: 3, warn: true } });
    assert.deepEqual(more.hits.canvas, base.hits.canvas);
  }
});

test('AC 123: single-finger input contract: only the canvas takes strokes; the locked states swallow everything', () => {
  const L = layoutFor(S('375x812'));
  const r = drawVm(L, {});
  const c = r.hits.canvas;
  // a point inside the canvas is draw:canvas; points in the strip, the bar, the colour row are not
  assert.equal(R.hitTest(r.hits, c.x + c.w / 2, c.y + c.h / 2), 'draw:canvas');
  for (const [x, y] of [[c.x + 20, c.y - 4], [c.x + 20, c.y + c.h + 4], [3, c.y + 50]]) assert.notEqual(R.hitTest(r.hits, x, y), 'draw:canvas');
  // AC 128: at time up (and while sending) every touch lands on the block: canvas, colours, size, 撤销, 清空, 画好了, 举报, back
  for (const extra of [{ status: 'timeUp', statusText: '时间到，正在交出…', inputLocked: true }, { status: 'sending', inputLocked: true }, { inputLocked: true }]) {
    const t = drawVm(L, extra);
    const ids = t.hits.map((h) => h.id).filter((id) => id !== 'draw:canvas');
    assert.deepEqual(ids, ['draw:block'], JSON.stringify(extra));
    for (const probe of ['draw:back', 'draw:report', 'draw:submit', 'draw:undo', 'draw:clear', 'draw:size', 'draw:color:2']) {
      const h = r.hits.find((x) => x.id === probe);
      assert.equal(R.hitTest(t.hits, h.x + h.w / 2, h.y + h.h / 2), 'draw:block', probe + ' is inert at time up');
    }
    assert.equal(R.hitTest(t.hits, c.x + c.w / 2, c.y + c.h / 2), 'draw:block');
  }
  // blocked / error before time up keep the canvas live
  const blocked = drawVm(L, { status: 'blocked', statusText: '这幅画没通过审核，改一改再交' });
  assert.equal(R.hitTest(blocked.hits, c.x + 30, c.y + 30), 'draw:canvas');
  assert.ok(!blocked.hits.some((h) => h.id === 'draw:block'));
  const err = drawVm(L, { status: 'error', statusText: '没传出去' });
  assert.ok(err.hits.some((h) => h.id === 'draw:retry'));
});

// ------------------------------------------------------------------ AC 127: describe

test('AC 127: describe screen rects at 375 x 812 and 320 x 568 equal spec 8.5; the drawing fills everything above the input', () => {
  T.applyDisplay(STD);
  const a = R.describeGeometry(layoutFor(S('375x812')), {});
  rectIs(a.drawing, 8, 140, 359, 510, '375 drawing');
  rectIs(a.input, 8, 658, 359, 56, '375 input');
  rectIs(a.submit, 8, 722, 359, 48, '375 传出去');
  const b = R.describeGeometry(layoutFor(S('320x568')), {});
  rectIs(b.drawing, 8, 120, 304, 328, '320 drawing');
  rectIs(b.input, 8, 456, 304, 48, '320 input');
  rectIs(b.submit, 8, 512, 304, 48, '320 传出去');
  for (const { sz, mode } of geometries().filter((x) => x.lines === 1 && !x.unlocked)) {
    const L = layoutFor(sz);
    const g = R.describeGeometry(L, { display: MODES[mode] });
    const tag = sz.name + ' ' + mode;
    near(g.drawing.y, g.bar.y + g.bar.h + 8, 0.01, tag + ' drawing top');
    near(g.drawing.y + g.drawing.h + 8, g.input.y, 0.01, tag + ' gap above the input');
    near(g.input.y + g.input.h + 8, g.submit.y, 0.01, tag + ' gap above 传出去');
    near(g.submit.y + g.submit.h, L.bottomEdge - 8, 0.01, tag + ' 传出去 above the safe area');
  }
  // the drawing area is filled by contain-fit: h = 1363 into 359 x 510 is 359 x 478 with 16 pt above and below (spec 5.7)
  const ctx = mockCtx();
  const L = layoutFor(S('375x812'));
  const hits = R.screens.describe.draw(ctx, Object.assign(sample('describe', 'typing'), { display: STD }), L);
  rectIs(hits.paper, 8, 140 + 16, 359, 478, 'paper in the describe area', 1);
  rectIs(hits.drawing, 8, 140, 359, 510, 'describe hits.drawing');
});

test('AC 127: describe with the keyboard open keeps the input and 传出去 above the keyboard (TD-75)', () => {
  for (const name of ['320x568', '375x667', '375x812']) {
    const L = layoutFor(S(name));
    for (const kb of [216, 260, 300]) {
      const r = R.screens.describe.draw(mockCtx(), Object.assign(sample('describe', 'typing'), { display: STD, keyboardH: kb }), L);
      for (const id of ['describe:input', 'describe:submit']) {
        const h = r.find((x) => x.id === id);
        assert.ok(h.y + h.h <= L.H - kb + 0.5, `${name} kb ${kb} ${id} above the keyboard`);
      }
    }
  }
});

// ------------------------------------------------------------------ AC 125: contain-fit

let napi = null;
try {
  const p = require('node:path').join(__dirname, '..', 'tools', 'preview', 'node_modules', '@napi-rs', 'canvas');
  if (require('node:fs').existsSync(p)) napi = require(p);
} catch (e) {
  napi = null;
}
const real = napi ? test : (name, fn) => test(name, { skip: '@napi-rs/canvas not installed (cd tools/preview && npm install)' }, fn);

const RECTS = { wide: { x: 20, y: 30, w: 400, h: 260 }, square: { x: 5, y: 7, w: 300, h: 300 }, tall: { x: 11, y: 3, w: 180, h: 520 } };

test('AC 125: contain-fit math: scale = min(w / 1024, h / gridH), centred, never cropped or stretched (h = 768, 1024, 2048 into 3 rect shapes)', () => {
  for (const gh of [768, 1024, 2048]) {
    for (const [name, rect] of Object.entries(RECTS)) {
      const ctx = mockCtx();
      const p = Strokes.drawStrokes(ctx, SM.wire([{ c: 0, w: 1, p: [10, 10, 900, gh - 10] }], gh), rect, {});
      const scale = Math.min(rect.w / 1024, rect.h / gh);
      near(p.scale, scale, 1e-9, `${name} h=${gh} scale`);
      near(p.w, 1024 * scale, 1e-6, 'paper w');
      near(p.h, gh * scale, 1e-6, 'paper h');
      near(p.x - rect.x, rect.x + rect.w - (p.x + p.w), 1e-6, 'centred x');
      near(p.y - rect.y, rect.y + rect.h - (p.y + p.h), 1e-6, 'centred y');
      assert.ok(p.x >= rect.x - 1e-9 && p.y >= rect.y - 1e-9 && p.x + p.w <= rect.x + rect.w + 1e-6 && p.y + p.h <= rect.y + rect.h + 1e-6, 'inside the rect (never cropped)');
      near(p.w / p.h, 1024 / gh, 1e-9, 'aspect kept (never stretched)');
      // one of the two dimensions is exactly the rect's
      assert.ok(Math.abs(p.w - rect.w) < 1e-6 || Math.abs(p.h - rect.h) < 1e-6);
    }
  }
  // v1 drawings are square; the spec 5.7 example
  assert.equal(Strokes.gridHOf({ v: 1, s: [] }), 1024);
  const ex = Strokes.fit(359, 510, 1363);
  near(ex.pw, 359, 0.01, 'example w');
  near(ex.ph, 478, 0.6, 'example h');
  near(ex.oy, 16, 0.4, 'margin above and below');
});

test('AC 125: the margin tone fills the spare part of the rect (and only that), standard #EFEAE0 and high contrast #DDDDDD', () => {
  for (const [display, tone] of [[MODES.default, '#EFEAE0'], [MODES.hc, '#DDDDDD']]) {
    T.applyDisplay(display);
    const log = [];
    const ctx = new Proxy(mockCtx(), { get(t, p) { if (p === 'fillRect') return (...a) => { log.push({ a, fs: t.fillStyle }); }; return t[p]; }, set(t, p, v) { t[p] = v; return true; } });
    Strokes.drawStrokes(ctx, SM.wire([{ c: 0, w: 1, p: [10, 10, 900, 900] }], 1024), RECTS.wide, {});
    assert.ok(log.some((l) => l.fs === tone && l.a[0] === RECTS.wide.x && l.a[2] === RECTS.wide.w), 'margin painted over the whole rect first: ' + tone);
    // a rect the paper fills exactly paints no margin
    const log2 = [];
    const c2 = new Proxy(mockCtx(), { get(t, p) { if (p === 'fillRect') return (...a) => { log2.push({ a, fs: t.fillStyle }); }; return t[p]; }, set(t, p, v) { t[p] = v; return true; } });
    Strokes.drawStrokes(c2, SM.wire([], 1363), { x: 0, y: 0, w: 359, h: (359 * 1363) / 1024 }, {});
    assert.ok(!log2.some((l) => l.fs === tone));
  }
  T.applyDisplay(STD);
});

real('AC 125 (pixels): corners of the paper are the stroke corners, margins are the margin tone, a round dot stays round in every rect (no crop, no stretch)', () => {
  for (const gh of [768, 1024, 2048]) {
    for (const [name, rect] of Object.entries(RECTS)) {
      const W = rect.x + rect.w + 4;
      const H = rect.y + rect.h + 4;
      const cv = napi.createCanvas(W, H);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#FF00FF';
      ctx.fillRect(0, 0, W, H); // everything outside the rect stays magenta: nothing may be drawn there
      T.applyDisplay(STD);
      // four corner dots (thick, ink), one big centred dot
      const m = 70;
      const abs = [[m, m], [1023 - m, m], [m, gh - 1 - m], [1023 - m, gh - 1 - m]].map((p) => ({ c: 0, w: 2, p }));
      abs.push({ c: 1, w: 2, p: [512, Math.round(gh / 2)] });
      const p = Strokes.drawStrokes(ctx, SM.wire(abs, gh), rect, {});
      const px = (x, y) => ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      const isInk = (d) => d[0] < 60 && d[1] < 60 && d[2] < 60;
      for (const [gx, gy] of [[m, m], [1023 - m, m], [m, gh - 1 - m], [1023 - m, gh - 1 - m]]) assert.ok(isInk(px(p.x + (gx + 0.5) * p.scale, p.y + (gy + 0.5) * p.scale)), `${name} h=${gh}: corner dot at ${gx},${gy} is visible (not cropped)`);
      // margins: a pixel inside the rect but outside the paper is the margin tone; outside the rect nothing was painted
      const tone = [0xef, 0xea, 0xe0];
      if (p.x - rect.x > 3) {
        const d = px(rect.x + 1, rect.y + rect.h / 2);
        assert.deepEqual([d[0], d[1], d[2]], tone, `${name} h=${gh} left margin`);
      }
      if (p.y - rect.y > 3) {
        const d = px(rect.x + rect.w / 2, rect.y + 1);
        assert.deepEqual([d[0], d[1], d[2]], tone, `${name} h=${gh} top margin`);
      }
      const out = px(rect.x + rect.w + 2, rect.y + rect.h + 2);
      assert.deepEqual([out[0], out[1], out[2]], [255, 0, 255], 'nothing drawn outside the rect');
      // paper is white away from strokes
      const w = px(p.x + 3, p.y + 3);
      assert.deepEqual([w[0], w[1], w[2]], [255, 255, 255], `${name} h=${gh} paper is white`);
      // the big centre dot is round: its bounding box is square (no stretch), size = 36 grid units x scale
      const cx = Math.round(p.x + 512.5 * p.scale);
      const cy = Math.round(p.y + (Math.round(gh / 2) + 0.5) * p.scale);
      const r0 = Math.ceil((36 / 2) * p.scale) + 3;
      let x0 = 1e9; let x1 = -1; let y0 = 1e9; let y1 = -1;
      const id = ctx.getImageData(cx - r0, cy - r0, 2 * r0, 2 * r0);
      for (let yy = 0; yy < 2 * r0; yy++) {
        for (let xx = 0; xx < 2 * r0; xx++) {
          const o = (yy * 2 * r0 + xx) * 4;
          if (id.data[o] > 150 && id.data[o + 1] < 120 && id.data[o + 2] < 120) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
        }
      }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      assert.ok(Math.abs(bw - bh) <= 2, `${name} h=${gh}: the dot is round (${bw} x ${bh})`);
      assert.ok(Math.abs(bw - 36 * p.scale) <= 2.5, `${name} h=${gh}: dot width ${bw} vs ${(36 * p.scale).toFixed(1)}`);
    }
  }
});

test('AC 125: the draw screen draws the strokes with the canvas rect and the stored h (static drawings elsewhere use the same function)', () => {
  const L = layoutFor(S('375x812'));
  const r = drawVm(L, { strokes: SM.busyDrawing(1363) });
  near(r.hits.paper.w, r.hits.canvas.w, 1, 'paper width');
  // a stale h (the window changed after the strokes were stored) never stretches: it is contain-fitted with a margin
  const stale = R.screens.draw.draw(mockCtx(), Object.assign(sample('draw', 'drawing'), { display: STD, sourceLines: 1, gridH: 2048, strokes: SM.drawing(2048) }), L);
  assert.ok(stale.paper.w < stale.canvas.w - 10, 'narrower paper, margin tone on the sides');
  near(stale.paper.w / stale.paper.h, 1024 / 2048, 1e-6, 'aspect kept');
});

// ------------------------------------------------------------------ AC 27 style parity

function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function scribble(seed, strokes, pts, gh) {
  const r = lcg(seed);
  const abs = [];
  for (let i = 0; i < strokes; i++) {
    let x = 40 + r() * 940;
    let y = 40 + r() * (gh - 80);
    const p = [Math.round(x), Math.round(y)];
    for (let k = 0; k < pts; k++) {
      x = Math.max(0, Math.min(1023, x + (r() - 0.5) * 120));
      y = Math.max(0, Math.min(gh - 1, y + (r() - 0.5) * 120));
      p.push(Math.round(x), Math.round(y));
    }
    abs.push({ c: Math.floor(r() * 12), w: Math.floor(r() * 3), p });
  }
  return abs;
}
function compare(a, rgb, n, tol) {
  let ok = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a[i * 4] - rgb[i * 3]) <= tol && Math.abs(a[i * 4 + 1] - rgb[i * 3 + 1]) <= tol && Math.abs(a[i * 4 + 2] - rgb[i * 3 + 2]) <= tol) ok++;
  return ok / n;
}

/**
 * A reference raster of a v2 drawing of height gh at 512 x round(512 gh / 1024) made with the CORE rasteriser, whatever its
 * version. If core/raster.js already returns that size natively it is used as is; otherwise (it is still the square v1
 * rasteriser) the picture is stitched from square rasters of the same strokes shifted up by whole 2-grid-unit steps: the
 * geometry, widths and anti-aliasing are the core's own, only the window moves (all strokes are drawn into every window).
 */
function coreReference(raster, d, gh) {
  const W = 512;
  const H = Math.round((W * gh) / 1024);
  try {
    const native = raster.rasterize(d, { size: W });
    if (native && native.height === H && native.width === W) return { data: native.data, native: true };
  } catch (e) {
    /* v1 core: fall through to the stitched reference */
  }
  const out = new Uint8Array(W * H * 3).fill(255);
  const shifted = (shift) => ({ v: 1, s: d.s.map((st) => { const c = st.slice(); c[3] -= shift; return c; }) });
  for (let shift = 0; shift < gh; shift += 1024) {
    // the window [shift, shift + 1024) covers raster rows shift / 2 .. shift / 2 + 511
    const win = raster.rasterize(shifted(shift), { size: W });
    const row0 = shift / 2;
    for (let r = 0; r < W && row0 + r < H; r++) {
      if (shift > 0 && row0 + r < row0) continue;
      out.set(win.data.subarray(r * W * 3, (r + 1) * W * 3), (row0 + r) * W * 3);
    }
  }
  return { data: out, native: false };
}

for (const gh of [768, 1024, 1363, 2048]) {
  real(`AC 27 (rev. 2): canvas strokes match the core rasteriser at 512 x ${Math.round((512 * gh) / 1024)} for h = ${gh} (>= 98% of pixels)`, (t) => {
    const raster = require('../core/raster');
    const d = SM.wire(scribble(gh, 40, 22, gh).concat([{ c: 3, w: 2, p: [500, 500] }, { c: 1, w: 0, p: [3, 3] }, { c: 5, w: 2, p: [1020, gh - 4] }]), gh);
    const H = Math.round((512 * gh) / 1024);
    const ref = coreReference(raster, d, gh);
    const cv = napi.createCanvas(512, H);
    const ctx = cv.getContext('2d');
    Strokes.drawStrokes(ctx, d, { x: 0, y: 0, w: 512, h: H }, {});
    const px = ctx.getImageData(0, 0, 512, H).data;
    const share = compare(px, ref.data, 512 * H, 48);
    t.diagnostic(`h=${gh} (${ref.native ? 'native v2 core raster' : 'stitched from the v1 core raster'}): ${(compare(px, ref.data, 512 * H, 0) * 100).toFixed(2)}% identical, ${(compare(px, ref.data, 512 * H, 8) * 100).toFixed(2)}% within 8, ${(share * 100).toFixed(2)}% within 48 levels`);
    assert.ok(share >= 0.98, `h=${gh}: only ${(share * 100).toFixed(2)}% of pixels agree`);
    assert.ok(compare(px, ref.data, 512 * H, 8) >= 0.96, `h=${gh}: strict agreement`);
  });
}

real('AC 27 (guard): the comparison is sensitive: butt caps / miter joins or a stretched drawing would fail it', () => {
  const raster = require('../core/raster');
  const gh = 1363;
  const H = 682;
  const d = SM.wire(scribble(11, 40, 22, gh), gh);
  const ref = coreReference(raster, d, gh);
  const right = napi.createCanvas(512, H);
  Strokes.drawStrokes(right.getContext('2d'), d, { x: 0, y: 0, w: 512, h: H }, {});
  const good = compare(right.getContext('2d').getImageData(0, 0, 512, H).data, ref.data, 512 * H, 48);
  // wrong 1: butt caps
  const butt = napi.createCanvas(512, H);
  const bc = butt.getContext('2d');
  bc.fillStyle = '#fff';
  bc.fillRect(0, 0, 512, H);
  for (const p of Strokes.absToPolylines(Strokes.toAbsolute(d), 0.5)) {
    bc.lineCap = 'butt';
    bc.lineJoin = 'miter';
    bc.strokeStyle = p.color;
    bc.lineWidth = p.width;
    bc.beginPath();
    bc.moveTo(p.pts[0], p.pts[1]);
    for (let i = 2; i < p.pts.length; i += 2) bc.lineTo(p.pts[i], p.pts[i + 1]);
    bc.stroke();
  }
  // wrong 2: stretched to a square raster and back
  const stretched = napi.createCanvas(512, H);
  const sc = stretched.getContext('2d');
  sc.fillStyle = '#fff';
  sc.fillRect(0, 0, 512, H);
  sc.scale(1, H / 512);
  Strokes.drawStrokes(sc, d, { x: 0, y: 0, w: 512, h: 512 }, { gridH: 1024 });
  const wrongButt = compare(bc.getImageData(0, 0, 512, H).data, ref.data, 512 * H, 48);
  const wrongStretch = compare(sc.getImageData(0, 0, 512, H).data, ref.data, 512 * H, 48);
  assert.ok(good > wrongButt && good > wrongStretch + 0.02, `right ${good} vs butt ${wrongButt} vs stretched ${wrongStretch}`);
});

// ------------------------------------------------------------------ AC 106 / 163: no ad ever touches the canvas

test('AC 163: no ad, banner or 今日彩笔 offer on room entry, lobby, pick, draw, describe or round wait; the banner slot never meets the canvas', () => {
  const screens = [['roomEntry', 'joinable'], ['lobby', 'ready'], ['pick', 'ready'], ['draw', 'drawing'], ['describe', 'typing'], ['roundWait', 'ready'], ['entry', 'claimable'], ['overview', 'ready'], ['stepthrough', 'ready']];
  for (const sz of SIZES) {
    const L = layoutFor(sz);
    for (const [screen, state] of screens) {
      const banner = { show: true, reservedHeight: 64, stub: true };
      const vm = Object.assign(sample(screen, state), { display: STD, banner, features: Object.assign(sample(screen, state).features, { banner: { enabled: true, adUnitId: 'x' } }) });
      const ctx = mockCtx();
      const hits = R.screens[screen].draw(ctx, prepare(screen, vm, L, ctx, STD), L);
      const text = ctx.__calls.map((c) => c.s).join('|');
      assert.ok(!/广告|视频|彩笔|▶/.test(text), `${sz.name} ${screen}: no ad text (${text.match(/广告|视频|彩笔|▶/)})`);
      assert.ok(!hits.some((h) => /ad|palette|banner|startAd/i.test(h.id.replace(/^(draw|pick|roomEntry|lobby|describe|roundWait|entry|overview|stepthrough):/, '')) && !/^(draw|pick):(add|undo)/.test(h.id)), `${sz.name} ${screen}: no ad hit id`);
    }
    // the only banner slot (group / album lists) is pinned at the bottom: it can never intersect any draw canvas
    const b = R.bannerRect(L, { show: true, reservedHeight: 64 });
    const g = R.drawGeometry(L, { sourceLines: 1, unlocked: false });
    const o = (a, c) => Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x) > 0 && Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y) > 0;
    assert.ok(!o(b, g.canvas), sz.name + ': banner slot vs canvas');
    assert.ok(!o(b, R.describeGeometry(L, {}).drawing), sz.name + ': banner slot vs describe drawing');
  }
  // 今日彩笔 is unlocked in 设置 only: no other screen mentions it
  for (const [screen, state] of [['home', 'ready'], ['draw', 'drawing'], ['pick', 'ready'], ['lobby', 'ready'], ['entry', 'claimable'], ['overview', 'ready'], ['stepthrough', 'ready'], ['group', 'ready'], ['album', 'ready']]) {
    const ctx = mockCtx();
    R.screens[screen].draw(ctx, Object.assign(sample(screen, state), { display: STD }), layoutFor(S('375x812')));
    assert.ok(!/彩笔/.test(ctx.__calls.map((c) => c.s).join('|')), screen + ' does not offer 今日彩笔');
  }
  const st = mockCtx();
  const sh = R.screens.settings.draw(st, Object.assign(sample('settings', 'idle'), { display: STD }), layoutFor(S('375x812')));
  assert.ok(st.__calls.some((c) => /解锁今日彩笔/.test(c.s)) && sh.some((h) => h.id === 'settings:palette'), '设置 is the one place to unlock it');
});
