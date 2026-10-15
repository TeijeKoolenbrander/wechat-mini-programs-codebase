/**
 * Stroke format and rasteriser parity between the three places that read it (AC 27, PO-10):
 *   - core/strokes.js + core/raster.js (what the server rasterises for moderation, and what the tests pin),
 *   - js/render/strokes.js (what the player sees: the live canvas, the previous 棒, the reveal),
 *   - js/drawing.js (what the finger produces) and the backend's own copy in cloudfunctions/common.
 * The constants must match exactly. The pixels are compared with a real canvas (@napi-rs/canvas, a dev tool
 * installed in tools/preview; the pixel test is skipped when it is not installed).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG } = require('../core/config');
const St = require('../core/strokes');
const { rasterize } = require('../core/raster');
const T = require('../js/render/theme');
const RS = require('../js/render/strokes');
const { createDrawingTool } = require('../js/drawing');

const CF = path.join(__dirname, '..', '..', 'cloudfunctions', 'common');

test('palette, brush widths and grid are identical in core, the renderer theme and the drawing tool', () => {
  assert.deepEqual(T.PALETTE, CONFIG.palette);
  assert.deepEqual(T.PALETTE_NAME, CONFIG.paletteNames);
  assert.deepEqual(T.BRUSH, CONFIG.brushSizes);
  assert.equal(T.GRID, CONFIG.strokes.grid);
  assert.equal(CONFIG.strokes.grid, 1024);
  assert.equal(CONFIG.baseColors, 6);
});

test('the backend\'s stroke limits and palette are the core\'s (source of truth: core/config.js)', () => {
  const src = fs.readFileSync(path.join(CF, 'strokes.js'), 'utf8');
  // the backend never trusts the client's module: its own validator must accept and reject exactly what core does
  const own = require(path.join(CF, 'strokes.js'));
  const cases = [
    { v: 1, s: [[0, 1, 5, 5]] },
    { v: 1, s: [[11, 2, 1023, 1023, -5, -5]] },
    { v: 1, s: [[12, 1, 5, 5]] },
    { v: 1, s: [[0, 3, 5, 5]] },
    { v: 1, s: [[0, 1, 1024, 5]] },
    { v: 1, s: [[0, 1, 5, 5, 2000, 0]] },
    { v: 2, s: [] },
    { v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) },
    { v: 1, s: [[0, 1, 5, 5, 1.5, 2]] },
  ];
  const ownOk = (c) => {
    try {
      own.validateStrokes(c);
      return true;
    } catch (e) {
      return false;
    }
  };
  for (const c of cases) assert.equal(ownOk(c), St.validate(c).ok, JSON.stringify(c).slice(0, 60));
  assert.equal(ownOk({ v: 1, s: [] }), false, 'a submission needs at least one stroke (core accepts the empty drawing as a value; the server is stricter)');
  const raster = require(path.join(CF, 'raster.js'));
  assert.deepEqual(raster.COLORS, CONFIG.palette.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]), 'backend palette');
  assert.deepEqual(raster.WIDTHS, CONFIG.brushSizes, 'backend brush widths');
  assert.equal(raster.SIZE, CONFIG.raster.size, 'backend raster size');
  assert.ok(/1024/.test(src), 'the backend validates the 1024 grid');
});

test('the renderer decodes exactly the points the core decodes, and the drawing tool emits what both accept', () => {
  const tool = createDrawingTool({ palette: true });
  tool.setRect({ x: 20, y: 120, w: 300, h: 300 });
  // a squiggle and a dot, two colours, two brush sizes
  tool.setColor(7);
  tool.setSize(2);
  tool.pointerDown(1, 60, 200);
  for (let i = 1; i <= 25; i++) tool.pointerMove(1, 60 + i * 7, 200 + Math.sin(i / 3) * 40);
  tool.pointerUp(1, 235, 200);
  tool.setColor(0);
  tool.setSize(0);
  tool.pointerDown(2, 150, 350);
  tool.pointerUp(2, 150, 350);
  const d = tool.drawing();
  assert.equal(St.validate(d).ok, true);
  const mine = RS.decode(d);
  assert.equal(mine.length, d.s.length);
  d.s.forEach((s, i) => {
    assert.equal(mine[i].c, s[0]);
    assert.equal(mine[i].w, s[1]);
    assert.deepEqual(mine[i].pts, St.strokePoints(s).flat(), 'absolute points of stroke ' + i);
  });
  assert.deepEqual(St.decode(St.encode(d)), d, 'the compact string round-trips (draft persistence)');
});

let canvasLib = null;
try {
  canvasLib = require(path.join(__dirname, '..', 'tools', 'preview', 'node_modules', '@napi-rs', 'canvas'));
} catch (e) {
  canvasLib = null;
}

/** finger input is dense (a point every few px); sparse corners would show the display smoothing, which is not what players draw */
function dense(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n)]);
  }
  return out;
}

function sample(kind) {
  const s = [];
  const mk = (c, w, pts) => St.makeStroke(c, w, pts.length > 2 ? dense(pts, 10) : pts.length === 2 ? dense(pts, 10) : pts);
  if (kind === 'house') {
    s.push(mk(0, 1, [[200, 500], [200, 800], [600, 800], [600, 500], [200, 500]]));
    s.push(mk(1, 2, [[180, 500], [400, 300], [620, 500]]));
    s.push(mk(4, 0, [[300, 650], [300, 760], [400, 760], [400, 650], [300, 650]]));
  } else if (kind === 'curve') {
    const pts = [];
    for (let i = 0; i <= 60; i++) pts.push([100 + i * 14, Math.round(500 + Math.sin(i / 6) * 260)]);
    s.push(mk(3, 1, pts));
    s.push(mk(5, 2, [[512, 512]]));
  } else {
    s.push(mk(2, 2, [[100, 100], [900, 900]]));
    s.push(mk(8, 1, [[900, 100], [100, 900]]));
    s.push(mk(10, 0, [[512, 100], [512, 900]]));
  }
  return { v: 1, s };
}

test('the client stroke renderer and the server rasteriser paint the same picture (AC 27)', { skip: !canvasLib }, () => {
  const size = CONFIG.raster.size;
  const rows = [];
  for (const kind of ['house', 'curve', 'cross']) {
    const drawing = sample(kind);
    assert.equal(St.validate(drawing).ok, true, kind);
    const cv = canvasLib.createCanvas(size, size);
    const ctx = cv.getContext('2d');
    RS.draw(ctx, drawing, { x: 0, y: 0, w: size }, { bg: '#FFFFFF' });
    const px = ctx.getImageData(0, 0, size, size).data;
    const ref = rasterize(drawing, { size });
    let off = 0;
    let ink = 0;
    for (let i = 0; i < size * size; i++) {
      const dr = Math.abs(px[i * 4] - ref.data[i * 3]);
      const dg = Math.abs(px[i * 4 + 1] - ref.data[i * 3 + 1]);
      const db = Math.abs(px[i * 4 + 2] - ref.data[i * 3 + 2]);
      if (ref.data[i * 3] !== 255 || ref.data[i * 3 + 1] !== 255 || ref.data[i * 3 + 2] !== 255) ink++;
      if (Math.max(dr, dg, db) > 64) off++;
    }
    rows.push({ kind, offPct: (100 * off) / size / size, inkPct: (100 * ink) / size / size, off, ink });
    // the two agree on where the ink is: a tiny fraction of the page differs strongly (smoothing of corners, anti-aliasing)
    assert.ok(off / size / size < 0.001, `${kind}: ${((100 * off) / size / size).toFixed(2)}% of pixels differ by more than 64 (ink ${((100 * ink) / size / size).toFixed(1)}%)`);
    assert.ok(off < 0.01 * ink + 50, `${kind}: differing pixels (${off}) are a small share of the ink (${ink})`);
  }
  if (process.env.PARITY_VERBOSE) console.log(JSON.stringify(rows));
});
