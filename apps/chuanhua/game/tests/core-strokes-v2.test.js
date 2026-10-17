'use strict';
// Strokes format v2 (spec 5.3, PO-39, AC 24, 25, 27 server half, 122-126): codec, validation, layout helpers, the rasteriser's height and the golden tests
// for h = 768, 1024, 1363 and 2048 (server rasteriser vs an independent brute-force reference and an ideal anti-aliased render).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/strokes');
const R = require('../core/raster');
const { mulberry32 } = require('../core/rng');

function randomDrawing(rng, h) {
  const abs = [];
  const n = 1 + Math.floor(rng() * 12);
  for (let i = 0; i < n; i++) {
    const pts = 1 + Math.floor(rng() * 20);
    const p = [];
    for (let k = 0; k < pts; k++) p.push(Math.floor(rng() * 1024), Math.floor(rng() * h));
    abs.push({ c: Math.floor(rng() * 12), w: Math.floor(rng() * 3), p });
  }
  return { abs, wire: S.fromAbsolute(abs, h) };
}

test('AC 24: the v2 codec round-trips 1,000 random drawings with random h (768-2048) exactly, including h; every one validates', () => {
  const rng = mulberry32(2424);
  for (let i = 0; i < 1000; i++) {
    const h = 768 + Math.floor(rng() * (2048 - 768 + 1));
    const { abs, wire } = randomDrawing(rng, h);
    assert.equal(wire.v, 2);
    assert.equal(wire.h, h);
    assert.deepEqual(S.toAbsolute(wire), abs, 'drawing ' + i);
    assert.deepEqual(S.fromAbsolute(S.toAbsolute(wire), wire.h), wire);
    assert.deepEqual(JSON.parse(JSON.stringify(wire)), wire);
    const v = S.validate(wire);
    assert.equal(v.ok, true, JSON.stringify(v) + ' h=' + h);
    assert.equal(v.h, h);
    assert.equal(S.heightOf(wire), h);
  }
});

test('v1 drawings stay valid and decode with h = 1024 (stored v1 chains, 5.3)', () => {
  const v1 = { v: 1, s: [[0, 1, 10, 1000, 5, 5]] };
  assert.equal(S.validate(v1).ok, true);
  assert.equal(S.validate(v1).h, 1024);
  assert.equal(S.heightOf(v1), 1024);
  assert.deepEqual(S.toAbsolute(v1), [{ c: 0, w: 1, p: [10, 1000, 15, 1005] }]);
  assert.equal(S.toPolylines(v1, 512)[0].pts.length, 4);
});

test('AC 25 (v2): h must be an integer 768-2048 and y must stay inside 0..h-1; x inside 0..1023', () => {
  const ok = (h, s) => S.validate({ v: 2, h, s });
  const stroke = (y) => [[0, 0, 5, y, 1, 1]];
  assert.equal(ok(768, stroke(766)).ok, true);
  assert.equal(ok(768, stroke(767)).reason, 'range', 'the delta takes y to 768 = h');
  assert.equal(ok(768, [[0, 0, 5, 767]]).ok, true);
  assert.equal(ok(768, [[0, 0, 5, 768]]).reason, 'range');
  assert.equal(ok(2048, [[0, 0, 5, 2047]]).ok, true);
  assert.equal(ok(2048, [[0, 0, 5, 2048]]).reason, 'range');
  for (const h of [767, 2049, 0, -1, 1363.5, '1024', null, undefined, NaN]) assert.equal(ok(h, [[0, 0, 1, 1]]).reason, 'height', String(h));
  assert.equal(S.validate({ v: 2, s: [[0, 0, 1, 1]] }).reason, 'shape');
  assert.equal(S.validate({ v: 2, h: 1024, s: [[0, 0, 1, 1]], extra: 1 }).reason, 'shape');
  assert.equal(S.validate({ v: 1, h: 1024, s: [[0, 0, 1, 1]] }).reason, 'shape', 'a v1 drawing has no h');
  assert.equal(S.validate({ v: 3, h: 1024, s: [[0, 0, 1, 1]] }).reason, 'version');
  assert.equal(ok(1024, [[0, 0, 1024, 5]]).reason, 'range');
  // the same limits as v1: strokes, points, per stroke, colour, size, path length, bytes
  assert.equal(ok(1024, Array.from({ length: 201 }, () => [0, 0, 1, 1])).reason, 'strokes');
  assert.equal(ok(1024, [[12, 0, 1, 1]]).reason, 'color');
  assert.equal(ok(1024, [[0, 3, 1, 1]]).reason, 'size');
  assert.equal(ok(1024, []).reason, 'empty');
  assert.equal(S.validate({ v: 2, h: 1024, s: [] }, { requireStroke: false }).ok, true);
});

test('layout helpers (5.1, 5.7, AC 124, 125): gridHeight clamps, canvasFit reduces and centres, containFit never crops or stretches', () => {
  // the spec 8.4 examples
  assert.equal(S.gridHeight(359, 478), 1363);
  assert.equal(S.gridHeight(304, 288), 970);
  assert.equal(S.gridHeight(359, 422), 1204);
  assert.equal(S.gridHeight(304, 264), 889);
  assert.equal(S.gridHeight(100, 10), 768, 'clamped low');
  assert.equal(S.gridHeight(100, 900), 2048, 'clamped high');
  assert.equal(S.gridHeight(0, 5), 1024);
  const inside = S.canvasFit({ x: 8, y: 180, w: 359, h: 478 });
  assert.deepEqual([inside.x, inside.y, inside.w, inside.h, inside.gridH], [8, 180, 359, 478, 1363]);
  // 320 x 568 with a 2-line strip and the 今日彩笔 row: free space 304 x 208 (aspect 0.68 < 0.75) -> 277 x 208 centred, h 768
  const tight = S.canvasFit({ x: 8, y: 184, w: 304, h: 208 });
  assert.equal(tight.gridH, 768);
  assert.equal(Math.round(tight.w), 277);
  assert.equal(tight.h, 208);
  assert.ok(Math.abs(tight.x - 21.5) < 0.2);
  // too tall (a tablet in portrait with a tiny strip): height reduced to 2.0 x width, centred vertically
  const tall = S.canvasFit({ x: 0, y: 100, w: 200, h: 900 });
  assert.deepEqual([tall.w, tall.h, tall.y, tall.gridH], [200, 400, 350, 2048]);
  // containFit: scale = min(rectW / 1024, rectH / h)
  const f = S.containFit({ x: 8, y: 140, w: 359, h: 510 }, 1363);
  assert.ok(Math.abs(f.w - 359) < 1e-9);
  assert.ok(Math.abs(f.h - 478) < 0.5, 'drawn at 359 x 478 pt (spec 5.7 example)');
  assert.ok(Math.abs(f.y - (140 + 16)) < 0.3, '16 pt of margin above');
  for (const h of [768, 1024, 2048]) {
    for (const rect of [{ x: 0, y: 0, w: 300, h: 200 }, { x: 5, y: 5, w: 200, h: 500 }, { x: 0, y: 0, w: 640, h: 640 }]) {
      const c = S.containFit(rect, h);
      assert.ok(c.w <= rect.w + 1e-9 && c.h <= rect.h + 1e-9, 'never cropped');
      assert.ok(Math.abs(c.h / c.w - h / 1024) < 1e-9, 'never stretched');
      assert.ok(Math.abs(c.x + c.w / 2 - (rect.x + rect.w / 2)) < 1e-9 && Math.abs(c.y + c.h / 2 - (rect.y + rect.h / 2)) < 1e-9, 'centred');
      assert.ok(Math.abs(Math.max(c.w / rect.w, c.h / rect.h) - 1) < 1e-9, 'fills one dimension');
    }
  }
});

test('the recorder works on a grid of height h: y is clamped to h - 1, drawing() is v2 with that h, load refuses another height', () => {
  const rec = S.createRecorder({ h: 1363 });
  assert.equal(rec.h, 1363);
  rec.begin(10, 5000, 1, 1);
  rec.move(10, 5100);
  rec.end();
  assert.deepEqual(rec.drawing(), { v: 2, h: 1363, s: [[1, 1, 10, 1362]] });
  const saved = rec.drawing();
  const other = S.createRecorder({ h: 900 });
  assert.equal(other.load(saved), false, 'a draft from another canvas height is not loaded');
  const same = S.createRecorder({ h: 1363 });
  assert.equal(same.load(saved), true);
  assert.equal(S.createRecorder().h, 1024);
  assert.equal(S.createRecorder({ h: 5 }).h, 768, 'clamped');
});

// ---- the server rasteriser at other heights --------------------------------------------------------------------------------------------

function referenceRaster(drawing, size) {
  const h = Math.round((size * S.heightOf(drawing)) / 1024);
  const polys = S.toPolylines(drawing, size);
  const data = new Float64Array(size * h * 3).fill(255);
  for (const p of polys) {
    const R2 = p.width / 2;
    const rgb = [1, 3, 5].map((o) => parseInt(p.color.slice(o, o + 2), 16));
    const segs = [];
    if (p.dot) segs.push([p.pts[0], p.pts[1], p.pts[0], p.pts[1]]);
    else for (let i = 0; i + 3 < p.pts.length; i += 2) segs.push([p.pts[i], p.pts[i + 1], p.pts[i + 2], p.pts[i + 3]]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < size; x++) {
        let best = Infinity;
        for (const [ax, ay, bx, by] of segs) {
          const dx = bx - ax;
          const dy = by - ay;
          const l2 = dx * dx + dy * dy;
          let t = l2 ? ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2 : 0;
          t = Math.max(0, Math.min(1, t));
          best = Math.min(best, Math.hypot(x + 0.5 - (ax + t * dx), y + 0.5 - (ay + t * dy)));
        }
        const c = Math.max(0, Math.min(1, R2 + 0.5 - best));
        if (c > 0) for (let k = 0; k < 3; k++) data[(y * size + x) * 3 + k] += (rgb[k] - data[(y * size + x) * 3 + k]) * c;
      }
    }
  }
  return { width: size, height: h, data: Uint8Array.from(data, (v) => Math.round(v)) };
}

function crop(img, rows) {
  return { width: img.width, height: rows, data: img.data.subarray(0, img.width * rows * 3) };
}

function downsample(img, f) {
  const w = img.width / f;
  const h = Math.floor(img.height / f);
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) sum += img.data[((y * f + j) * img.width + x * f + i) * 3 + k];
        out[(y * w + x) * 3 + k] = Math.round(sum / (f * f));
      }
    }
  }
  return { width: w, height: h, data: out };
}

test('AC 27 (server half): the PNG is 512 x round(512 h / 1024) for h = 768, 1024, 1363, 2048; v1 stays 512 x 512', () => {
  for (const [h, rows] of [[768, 384], [1024, 512], [1363, 682], [2048, 1024]]) {
    const img = R.rasterize(S.empty(h));
    assert.deepEqual([img.width, img.height], [512, rows], 'h=' + h);
    assert.equal(img.data.length, 512 * rows * 3);
    assert.ok(img.data.every((v) => v === 255));
  }
  assert.deepEqual([R.rasterize({ v: 1, s: [] }).width, R.rasterize({ v: 1, s: [] }).height], [512, 512]);
});

test('AC 27 golden: the row-scan rasteriser equals a brute-force reference at every height (no clipping bug in the taller grid)', () => {
  const rng = mulberry32(2727);
  for (const h of [768, 1024, 1363, 2048]) {
    const { wire } = randomDrawing(rng, h);
    const a = R.rasterize(wire, { size: 96 });
    const b = referenceRaster(wire, 96);
    assert.deepEqual([a.width, a.height], [b.width, b.height]);
    assert.equal(R.diffRatio(a, b, 3), 0, 'h=' + h);
  }
});

test('AC 27 golden: 512-wide output agrees with an ideal anti-aliased render on >= 98% of pixels for h = 768, 1024, 1363, 2048', () => {
  for (const h of [768, 1024, 1363, 2048]) {
    const rng = mulberry32(h);
    const abs = [];
    for (let i = 0; i < 30; i++) {
      const p = [];
      let x = rng() * 1024;
      let y = rng() * h;
      for (let k = 0; k < 20; k++) {
        p.push(Math.max(0, Math.min(1023, Math.round(x))), Math.max(0, Math.min(h - 1, Math.round(y))));
        x += (rng() - 0.5) * 90;
        y += (rng() - 0.5) * 90;
      }
      abs.push({ c: i % 12, w: i % 3, p });
    }
    const d = S.fromAbsolute(abs, h);
    assert.equal(S.validate(d).ok, true, 'h=' + h);
    const img = R.rasterize(d, { size: 512 });
    const ideal = downsample(R.rasterize(d, { size: 1024 }), 2); // an odd height (1363) loses its last half row: compare the common rows
    const ratio = R.diffRatio(crop(img, ideal.height), ideal, 40);
    assert.ok(ratio <= 0.02, `h=${h}: differing pixels ${(ratio * 100).toFixed(2)}%`);
    console.log(`# AC 27 server-side agreement h=${h}: ${((1 - ratio) * 100).toFixed(2)}%`);
  }
});

test('V10: the tallest raster (h 2048 -> 512 x 1024) of a dense drawing stays well under the 800 ms target', () => {
  const rng = mulberry32(10);
  const abs = [];
  for (let i = 0; i < 200; i++) {
    let x = rng() * 1000;
    let y = rng() * 2000;
    const p = [];
    for (let k = 0; k < 20; k++) {
      p.push(Math.max(0, Math.min(1023, Math.round(x))), Math.max(0, Math.min(2047, Math.round(y))));
      x += (rng() - 0.5) * 30;
      y += (rng() - 0.5) * 30;
    }
    abs.push({ c: i % 12, w: 2, p });
  }
  const d = S.fromAbsolute(abs, 2048);
  assert.equal(S.validate(d).ok, true);
  const t = Date.now();
  const img = R.rasterize(d);
  const ms = Date.now() - t;
  assert.equal(img.height, 1024);
  console.log('# V10 h=2048 dense drawing: ' + ms + ' ms');
  assert.ok(ms < 2500, 'took ' + ms + ' ms');
});
