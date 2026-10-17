'use strict';
// V10 / TD-24: rasteriser performance target (<= 800 ms for the worst ACCEPTED drawing) and the server-side ink budget (path
// length) that enforces it. The core limits alone (200 strokes, 4,000 points, 600 points per stroke, 32 KB of JSON) still
// allow a hostile zig-zag of ~3,000 full-canvas segments that takes seconds; the budget in common/raster.js rejects it with
// INVALID_STROKES / reason 'pathLength'.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { stage } = require('./helpers/stage');

const fn = stage();
const { strokesToPng, validateDrawing, pathLength, MAX_PATH_UNITS } = require(path.join(fn, 'common', 'raster'));
const strokes = require(path.join(fn, 'core', 'strokes'));
const { rasterize } = require(path.join(fn, 'core', 'raster'));
const { mulberry32 } = require(path.join(fn, 'core', 'rng'));

const TARGET_MS = 800;

/**
 * `segs` zig-zag segments of (about) `step` grid units, thickest brush, spread over strokes of <= 599 segments. Steep
 * diagonals reflected at the canvas edge: every segment covers as many pixel rows as possible.
 */
function zigzag(segs, step, w) {
  const nStr = Math.ceil(segs / 599);
  const abs = [];
  let left = segs;
  for (let i = 0; i < nStr; i++) {
    const n = Math.ceil(left / (nStr - i));
    left -= n;
    const p = [];
    let x = 20 + ((i * 97) % 900);
    let y = 20;
    let dx = 1;
    let dy = 1;
    for (let k = 0; k <= n; k++) {
      p.push(Math.round(x), Math.round(y));
      x += dx * step * 0.5;
      y += dy * step * 0.866;
      if (x < 0 || x > 1023) { dx = -dx; x = Math.max(0, Math.min(1023, x)); }
      if (y < 0 || y > 1023) { dy = -dy; y = Math.max(0, Math.min(1023, y)); }
    }
    abs.push({ c: i % 12, w, p });
  }
  return strokes.fromAbsolute(abs);
}

/** the hostile shape of game/tests/core-raster.test.js: corner-to-corner diagonals, thickest brush (n strokes of m points) */
function corners(n, m) {
  const abs = [];
  for (let i = 0; i < n; i++) {
    const p = [];
    for (let k = 0; k < m; k++) p.push(k % 2 ? 1023 : 0, k % 2 ? 0 : 1023 - ((k * 7) % 200));
    abs.push({ c: 0, w: 2, p });
  }
  return strokes.fromAbsolute(abs);
}

function timeMs(d) {
  const t = Date.now();
  rasterize(d, { size: 512 });
  return Date.now() - t;
}

test('the hostile corner-to-corner drawing (2,850 full-canvas diagonals in 29 KB; only the ink budget stops it) is REJECTED by the ink budget, which now lives in core (TD-56)', () => {
  const d = corners(5, 570);
  assert.deepEqual(strokes.validate(d), { ok: false, reason: 'pathLength' }, 'core owns the ink budget (CONFIG.strokes.maxPathUnits)');
  assert.equal(MAX_PATH_UNITS, require(path.join(fn, 'core', 'config')).CONFIG.strokes.maxPathUnits, 'one constant, from core');
  const len = pathLength(d);
  assert.ok(len > MAX_PATH_UNITS * 8, 'path length ' + len);
  const unlimited = timeMs(d);
  console.log(`# V10 hostile drawing: ${strokes.pointCount(d)} points, ${Math.round(len)} units, rasterised unlimited in ${unlimited} ms -> rejected (budget ${MAX_PATH_UNITS})`);
  const r = strokesToPng(d);
  assert.deepEqual([r.ok, r.code, r.reason], [false, 'INVALID_STROKES', 'pathLength']);
  assert.deepEqual(validateDrawing(d), { ok: false, reason: 'pathLength' });
});

test('V10: the worst drawings the budget still accepts (exactly at the limit, thickest brush, steepest segments) rasterise in <= 800 ms', () => {
  const out = [];
  for (const step of [1300, 600, 160, 63]) {
    const segs = Math.floor((MAX_PATH_UNITS - 1) / step);
    const d = zigzag(segs, step, 2);
    assert.equal(strokes.validate(d).ok, true, `step ${step}: ${JSON.stringify(strokes.validate(d))}`);
    assert.equal(validateDrawing(d).ok, true, `step ${step} must be accepted (len ${pathLength(d)})`);
    const r = strokesToPng(d);
    assert.equal(r.ok, true);
    out.push(`${segs} x ${step}: ${Math.round(pathLength(d))} units, ${strokes.pointCount(d)} points, ${r.ms} ms`);
    assert.ok(r.ms <= TARGET_MS, `step ${step} took ${r.ms} ms`);
  }
  console.log('# V10 worst accepted (rasterise + PNG): ' + out.join(' | '));
});

test('realistic drawings are far below the budget and unaffected (a dense 4,000-point scribble)', () => {
  const rng = mulberry32(10);
  const scribble = [];
  for (let i = 0; i < 200; i++) {
    let x = rng() * 1000;
    let y = rng() * 1000;
    const p = [];
    for (let k = 0; k < 20; k++) {
      p.push(Math.max(0, Math.min(1023, Math.round(x))), Math.max(0, Math.min(1023, Math.round(y))));
      x += (rng() - 0.5) * 30;
      y += (rng() - 0.5) * 30;
    }
    scribble.push({ c: i % 12, w: 2, p });
  }
  const d = strokes.fromAbsolute(scribble);
  assert.equal(strokes.pointCount(d), 4000);
  assert.ok(pathLength(d) < MAX_PATH_UNITS / 2, 'a heavy scribble uses ' + pathLength(d));
  const r = strokesToPng(d);
  assert.equal(r.ok, true);
  console.log(`# V10 realistic 4,000-point scribble: ${r.ms} ms (rasterise + PNG), ${(r.png.length / 1024).toFixed(1)} KB`);
  assert.ok(r.ms <= TARGET_MS);
});

test('submitStep answers INVALID_STROKES (pathLength) for an over-budget drawing before any storage or platform call', async () => {
  const { createHarness } = require('./helpers/harness');
  const h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } });
  try {
    const A = { openid: 'openid-A' };
    await h.call('agreeRules', { version: 2 }, A);
    const c = await h.call('createChain', { promptId: 'A01' }, A);
    const r = await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: corners(5, 570) }, A);
    assert.deepEqual([r.ok, r.code, r.reason], [false, 'INVALID_STROKES', 'pathLength']);
    assert.equal(h.files.size, 0);
    assert.equal(h.calls.length, 0);
    assert.equal(h.db.all('chuanhua_steps').length, 0);
  } finally { h.teardown(); }
});
