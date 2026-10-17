'use strict';
// render/strokes.js (strokes v2 display): canonical geometry, the equality of its constants and geometry with core/strokes.js,
// the offscreen cache (AC 32), the 2.5 s replay (AC 31) and the forms it accepts. Contain-fit, the margin tone and the
// pixel parity with the server rasteriser (AC 27) live in render.canvas.test.js. Pixel tests need @napi-rs/canvas from
// tools/preview (npm install there); without it they are skipped with a note.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const core = require('../core/strokes');
const Strokes = require('../js/render/strokes');
const SM = require('../js/render/samples.js');
const { mockCtx, mockCanvasFactory } = require('./render-mock');

let napi = null;
try {
  const p = path.join(__dirname, '..', 'tools', 'preview', 'node_modules', '@napi-rs', 'canvas');
  if (fs.existsSync(p)) napi = require(p);
} catch (e) {
  napi = null;
}
const real = napi ? test : (name, fn) => test(name, { skip: '@napi-rs/canvas not installed (cd tools/preview && npm install)' }, fn);

function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function scribbleAbs(seed, strokes, pts, gh) {
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
const house = SM.wire(SM.scene(1024), 1024);
const dotsAbs = [{ c: 0, w: 0, p: [100, 100] }, { c: 1, w: 1, p: [300, 120] }, { c: 4, w: 2, p: [600, 300] }, { c: 6, w: 2, p: [1020, 1020] }, { c: 3, w: 1, p: [0, 0] }];

test('the palette, brush widths, base colour count and replay length equal core/strokes.js (the spec 5.2 values)', () => {
  assert.deepEqual(Strokes.COLORS, core.COLORS);
  assert.deepEqual(Strokes.SIZES, core.SIZES);
  assert.equal(Strokes.BASE_COLORS, core.BASE_COLORS);
  assert.equal(Strokes.REPLAY_MS, core.REPLAY_MS);
  assert.equal(Strokes.REPLAY_MS, 2500);
  assert.deepEqual(Strokes.SIZES, [8, 18, 36]);
  assert.equal(Strokes.GRID_W, 1024);
  assert.equal(Strokes.H_MIN, 768);
  assert.equal(Strokes.H_MAX, 2048);
});

test('the wire decoder and the polylines equal core/strokes.js for v1 drawings (the same canonical geometry, any size)', () => {
  const v1 = core.fromAbsolute(scribbleAbs(5, 30, 20, 1024));
  assert.deepEqual(Strokes.toAbsolute(v1), core.toAbsolute(v1));
  for (const size of [100, 343, 512]) {
    const a = Strokes.absToPolylines(Strokes.toAbsolute(v1), size / 1024);
    const b = core.toPolylines(v1, size);
    assert.equal(a.length, b.length);
    a.forEach((p, i) => {
      assert.equal(p.color, b[i].color);
      assert.ok(Math.abs(p.width - b[i].width) < 1e-9);
      assert.equal(p.dot, b[i].dot);
      p.pts.forEach((v, k) => assert.ok(Math.abs(v - b[i].pts[k]) < 1e-9));
    });
  }
  // v2 decodes the same way (the height only changes the paper)
  const v2 = SM.wire(core.toAbsolute(v1), 1363);
  assert.deepEqual(Strokes.toAbsolute(v2), core.toAbsolute(v1));
});

test('AC 31: replay length is 2.5 s whatever the stroke count (frac = elapsed / REPLAY_MS), equal to the core replay, 0 draws nothing, 1 everything', () => {
  for (const abs of [Strokes.toAbsolute(house), scribbleAbs(9, 60, 18, 1363), dotsAbs]) {
    const polys = Strokes.absToPolylines(abs, 0.3);
    assert.equal(Strokes.replayPolylines(polys, 0).length, 0);
    assert.equal(Strokes.replayPolylines(polys, 1).length, polys.length);
    let prev = 0;
    for (let ms = 0; ms <= 2500; ms += 250) {
      const frac = Math.min(1, ms / Strokes.REPLAY_MS);
      const mine = Strokes.replayPolylines(polys, frac);
      assert.ok(mine.length >= prev);
      prev = mine.length;
      const ref = core.replayPolylines(polys, frac);
      assert.equal(mine.length, ref.length);
      mine.forEach((p, i) => assert.deepEqual(p.pts, ref[i].pts));
    }
  }
});

test('canonical geometry: round caps and joins, a dot is a filled circle of the stroke width, no smoothing; widths scale with the paper', () => {
  const ctx = mockCtx();
  const log = [];
  const spy = new Proxy(ctx, {
    get(t, p) {
      if (['arc', 'fill', 'stroke', 'lineTo', 'moveTo', 'quadraticCurveTo', 'bezierCurveTo'].includes(p)) return (...a) => { log.push([p, ...a]); return t[p](...a); };
      return t[p];
    },
    set(t, p, v) { if (p === 'lineCap' || p === 'lineJoin' || p === 'lineWidth') log.push([p, v]); t[p] = v; return true; },
  });
  const rect = { x: 0, y: 0, w: 512, h: 700 };
  Strokes.drawStrokes(spy, SM.wire(dotsAbs, 1363), rect, {});
  const arcs = log.filter((l) => l[0] === 'arc');
  assert.equal(arcs.length, 5, 'one filled circle per one-point stroke');
  const scale = Math.min(512 / 1024, 700 / 1363);
  dotsAbs.forEach((st, i) => {
    assert.ok(Math.abs(arcs[i][3] - (Strokes.SIZES[st.w] * scale) / 2) < 1e-9, 'radius = width / 2 scaled');
  });
  log.length = 0;
  Strokes.drawStrokes(spy, house, { x: 0, y: 0, w: 512, h: 512 }, {});
  assert.equal(log.filter((l) => l[0] === 'quadraticCurveTo' || l[0] === 'bezierCurveTo').length, 0, 'no smoothing for stored content');
  const polys = Strokes.absToPolylines(Strokes.toAbsolute(house), 0.5);
  const verts = polys.filter((p) => !p.dot).reduce((a, p) => a + p.pts.length / 2 - 1, 0);
  assert.equal(log.filter((l) => l[0] === 'lineTo').length, verts, 'every polyline vertex');
  assert.ok(log.some((l) => l[0] === 'lineCap' && l[1] === 'round') && log.some((l) => l[0] === 'lineJoin' && l[1] === 'round'));
  const widths = new Set(log.filter((l) => l[0] === 'lineWidth').map((l) => l[1]));
  for (const w of polys.filter((p) => !p.dot).map((p) => p.width)) assert.ok([...widths].some((x) => Math.abs(x - w) < 1e-9));
});

test('only the live stroke may be smoothed (opts.live), finished ones never', () => {
  const log = [];
  const ctx = new Proxy(mockCtx(), { get(t, p) { if (p === 'quadraticCurveTo') return () => log.push(p); return t[p]; } });
  const sc = SM.wire(scribbleAbs(4, 6, 12, 1024), 1024);
  Strokes.drawStrokes(ctx, sc, { x: 0, y: 0, w: 512, h: 512 }, {});
  assert.equal(log.length, 0);
  Strokes.drawStrokes(ctx, sc, { x: 0, y: 0, w: 512, h: 512 }, { live: true });
  assert.ok(log.length > 0, 'the last stroke is smoothed while live');
});

test('AC 32: with the cache a frame costs only the live stroke, whatever the number of finished strokes (non-square paper)', () => {
  const abs = scribbleAbs(5, 190, 20, 1363); // 190 strokes x 21 points
  Strokes.setCanvasFactory(mockCanvasFactory());
  try {
    const rect = { x: 8, y: 180, w: 359, h: 478 };
    const frameCost = (n) => {
      const c = mockCtx();
      Strokes.drawStrokes(c, abs.slice(0, n), rect, { gridH: 1363, cacheKey: 'perf', dpr: 2, live: true });
      const k = c.__counts;
      return (k.lineTo || 0) + (k.moveTo || 0) + (k.quadraticCurveTo || 0) + (k.arc || 0);
    };
    frameCost(189);
    const warm = frameCost(190);
    const steady = frameCost(190);
    assert.ok(steady <= 21 + 2, `steady frame draws ${steady} path ops (the live stroke has 21 points)`);
    assert.ok(warm <= 2 * 21 + 4, `incremental frame draws ${warm} path ops`);
    const direct = (() => { Strokes.setCanvasFactory(null); const c = mockCtx(); Strokes.drawStrokes(c, abs, rect, { gridH: 1363, live: true }); return (c.__counts.lineTo || 0); })();
    assert.ok(direct > 20 * steady, 'uncached drawing scales with the stroke count (the cache is what keeps 60 fps)');
  } finally {
    Strokes.setCanvasFactory(null);
  }
});

test('AC 32: while a finger is down (the last stroke grows every frame) no frame rebuilds the cache', () => {
  const abs = scribbleAbs(3, 150, 12, 1363);
  Strokes.setCanvasFactory(mockCanvasFactory());
  try {
    const rect = { x: 8, y: 180, w: 359, h: 478 };
    const ops = (list) => {
      const c = mockCtx();
      Strokes.drawStrokes(c, list, rect, { gridH: 1363, cacheKey: 'live', dpr: 2, live: true });
      return (c.__counts.lineTo || 0) + (c.__counts.moveTo || 0) + (c.__counts.quadraticCurveTo || 0) + (c.__counts.arc || 0);
    };
    ops(abs);
    const cur = { c: 2, w: 1, p: [300, 300] };
    const list = abs.concat([cur]);
    ops(list);
    let worst = 0;
    for (let k = 1; k <= 120; k++) {
      cur.p.push(300 + k * 2, 300 + k * 2);
      worst = Math.max(worst, ops(list));
    }
    assert.ok(worst <= 125 + 4, `worst frame while drawing: ${worst} path ops (live stroke has up to 121 points)`);
  } finally {
    Strokes.setCanvasFactory(null);
  }
});

real('the offscreen cache is pixel-identical to the direct drawing (wire and absolute forms, growing strokes, undo)', () => {
  Strokes.setCanvasFactory((w, h) => napi.createCanvas(w, h));
  try {
    const rect = { x: 0, y: 0, w: 256, h: 320 }; // h = 1280: the paper is exactly the rect (whole pixels)
    const px = (d, o) => {
      const c = napi.createCanvas(256, 320);
      const ctx = c.getContext('2d');
      Strokes.drawStrokes(ctx, d, rect, o || {});
      return ctx.getImageData(0, 0, 256, 320).data;
    };
    const wire = SM.wire(scribbleAbs(7, 30, 25, 1280), 1280);
    const direct = px(wire, {});
    const cached = px(wire, { cacheKey: 'k1', rev: 1, dpr: 1 });
    const cached2 = px(wire, { cacheKey: 'k1', rev: 1, dpr: 1 });
    let diff = 0;
    for (let i = 0; i < direct.length; i++) if (direct[i] !== cached[i] || direct[i] !== cached2[i]) diff++;
    assert.equal(diff, 0);
    const abs = scribbleAbs(99, 20, 10, 1280);
    const grow = [];
    let last = null;
    for (let i = 0; i < 12; i++) {
      grow.push(abs[i]);
      last = px(grow, { gridH: 1280, cacheKey: 'k2', dpr: 1 });
    }
    const want = px(grow, { gridH: 1280 });
    let d2 = 0;
    for (let i = 0; i < want.length; i++) if (want[i] !== last[i]) d2++;
    assert.equal(d2, 0);
    grow.pop(); // undo: rebuilt, not stale
    const afterUndo = px(grow, { gridH: 1280, cacheKey: 'k2', dpr: 1 });
    const wantUndo = px(grow, { gridH: 1280 });
    let d3 = 0;
    for (let i = 0; i < wantUndo.length; i++) if (wantUndo[i] !== afterUndo[i]) d3++;
    assert.equal(d3, 0);
  } finally {
    Strokes.setCanvasFactory(null);
  }
});

real('replay: playT 0 draws nothing, 1 equals the full drawing, in between draws a strict prefix (non-square paper)', () => {
  const rect = { x: 0, y: 0, w: 256, h: 340 };
  const d = SM.busyDrawing(1363);
  const px = (o) => {
    const c = napi.createCanvas(256, 340);
    const ctx = c.getContext('2d');
    Strokes.drawStrokes(ctx, d, rect, o);
    return ctx.getImageData(0, 0, 256, 340).data;
  };
  const nonWhite = (a) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] < 250 || a[i + 1] < 250 || a[i + 2] < 250) n++; return n; };
  const full = px({});
  assert.equal(nonWhite(px({ playT: 0 })), 0);
  assert.deepEqual(Buffer.from(px({ playT: 1 })), Buffer.from(full));
  const half = nonWhite(px({ playT: 0.5 }));
  assert.ok(half > 0 && half < nonWhite(full));
});

test('wire v1, wire v2 and absolute strokes draw the same thing; bad input is safe', () => {
  const v1 = core.fromAbsolute(core.toAbsolute(house));
  const a = mockCtx();
  const b = mockCtx();
  const c = mockCtx();
  Strokes.drawStrokes(a, v1, { x: 0, y: 0, w: 300, h: 300 }, {});
  Strokes.drawStrokes(b, house, { x: 0, y: 0, w: 300, h: 300 }, {});
  Strokes.drawStrokes(c, Strokes.toAbsolute(house), { x: 0, y: 0, w: 300, h: 300 }, { gridH: 1024 });
  assert.deepEqual(a.__counts, b.__counts);
  assert.deepEqual(a.__counts, c.__counts);
  Strokes.drawStrokes(mockCtx(), null, { x: 0, y: 0, w: 10, h: 10 }, {});
  Strokes.drawStrokes(mockCtx(), { v: 2, h: 1363, s: [] }, { x: 0, y: 0, w: 10, h: 10 }, {});
  Strokes.drawStrokes(mockCtx(), { v: 1, s: [] }, { x: 0, y: 0, w: 10, h: 10 }, {});
  Strokes.drawStrokes(mockCtx(), { v: 2, h: 768, s: [[0, 1, 5, 5], [9, 9]] }, { x: 0, y: 0, w: 0.5, h: 0.5 }, {});
});

test('canvasFor: h = round(1024 x h / w) clamped to 768-2048, centred outside the clamp (spec 5.1)', () => {
  const c1 = Strokes.canvasFor({ x: 8, y: 180, w: 359, h: 478 });
  assert.deepEqual([c1.x, c1.y, c1.w, c1.h, c1.gridH], [8, 180, 359, 478, 1363]);
  const wide = Strokes.canvasFor({ x: 8, y: 184, w: 304, h: 208 });
  assert.deepEqual([wide.x, wide.y, wide.w, wide.h, wide.gridH], [21.5, 184, 277, 208, 768]);
  const tall = Strokes.canvasFor({ x: 8, y: 100, w: 200, h: 900 });
  assert.deepEqual([tall.x, tall.w, tall.h, tall.gridH], [8, 200, 400, 2048]);
  assert.equal(tall.y, 100 + (900 - 400) / 2);
});
