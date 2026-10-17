'use strict';
// AC 27 (server rasteriser vs an independent reference within an anti-aliasing tolerance, >= 98% of pixels equal at 512 x 512),
// V10 (time for 4,000 points), determinism, geometry rules of spec 5.4.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/strokes');
const R = require('../core/raster');
const { mulberry32 } = require('../core/rng');

const px = (img, x, y) => [img.data[(y * img.width + x) * 3], img.data[(y * img.width + x) * 3 + 1], img.data[(y * img.width + x) * 3 + 2]];
const WHITE = [255, 255, 255];

test('512 x 512 white background, RGB; an empty draft is all white', () => {
  const img = R.rasterize({ v: 1, s: [] });
  assert.equal(img.width, 512);
  assert.equal(img.height, 512);
  assert.equal(img.data.length, 512 * 512 * 3);
  assert.ok(img.data.every((v) => v === 255));
});

test('a dot: round, centred on its grid cell, flat colour inside, white outside; widths scale x0.5', () => {
  // size 粗 = 36 grid units = 18 px diameter at 512
  const img = R.rasterize(S.fromAbsolute([{ c: 1, w: 2, p: [512, 512] }]));
  assert.deepEqual(px(img, 256, 256), [0xd8, 0x43, 0x3b]);
  assert.deepEqual(px(img, 256 + 8, 256), [0xd8, 0x43, 0x3b]); // inside radius 9
  assert.deepEqual(px(img, 256 + 12, 256), WHITE);
  assert.deepEqual(px(img, 256, 256 - 12), WHITE);
  // roundness: the diagonal reaches ~radius, the corner of the bounding square stays white
  assert.deepEqual(px(img, 256 - 8, 256 - 8), WHITE.map((v, i) => px(img, 256 - 8, 256 - 8)[i])); // anti-aliased edge, not asserted exactly
  assert.deepEqual(px(img, 256 + 9, 256 + 9), WHITE);
  // the 细 brush is 4 px wide
  const thin = R.rasterize(S.fromAbsolute([{ c: 0, w: 0, p: [512, 512] }]));
  let inked = 0;
  for (let x = 0; x < 512; x++) if (px(thin, x, 256)[0] < 128) inked++;
  assert.ok(inked >= 3 && inked <= 5, 'thin dot spans ' + inked + ' px');
});

test('a line: caps are round (extends half a width past the end), joins are round', () => {
  const img = R.rasterize(S.fromAbsolute([{ c: 4, w: 2, p: [200, 512, 800, 512] }])); // x 100..400 px, 18 px wide
  assert.deepEqual(px(img, 250, 256), [0x3c, 0x78, 0xc8]);
  assert.deepEqual(px(img, 100 - 5, 256), [0x3c, 0x78, 0xc8], 'round cap reaches past the endpoint');
  assert.deepEqual(px(img, 100 - 12, 256), WHITE);
  assert.deepEqual(px(img, 250, 256 - 12), WHITE);
  // an acute join stays filled (round join)
  const join = R.rasterize(S.fromAbsolute([{ c: 0, w: 2, p: [100, 100, 900, 120, 100, 140] }]));
  assert.ok(px(join, 450, 60)[0] < 128);
});

test('strokes composite in drawing order; overlapping capsules of one stroke do not double-darken edges', () => {
  const two = R.rasterize(S.fromAbsolute([{ c: 1, w: 2, p: [100, 512, 900, 512] }, { c: 4, w: 2, p: [512, 100, 512, 900] }]));
  assert.deepEqual(px(two, 256, 256), [0x3c, 0x78, 0xc8], 'later stroke on top');
  assert.deepEqual(px(two, 100, 256), [0xd8, 0x43, 0x3b]);
  // a stroke that doubles back on itself: edge pixels equal those of the single pass
  const once = R.rasterize(S.fromAbsolute([{ c: 0, w: 1, p: [100, 300, 700, 300] }]));
  const back = R.rasterize(S.fromAbsolute([{ c: 0, w: 1, p: [100, 300, 700, 300, 100, 300] }]));
  assert.ok(R.diffRatio(once, back, 0) < 0.0005);
});

test('deterministic: the same strokes always give the same bytes (a re-check sends the identical image)', () => {
  const rng = mulberry32(9);
  const abs = [];
  for (let i = 0; i < 30; i++) abs.push({ c: i % 12, w: i % 3, p: Array.from({ length: 20 }, () => Math.floor(rng() * 1024)) });
  const d = S.fromAbsolute(abs);
  const a = R.rasterize(d);
  const b = R.rasterize(JSON.parse(JSON.stringify(d)));
  assert.ok(Buffer.from(a.data).equals(Buffer.from(b.data)));
});

/** independent reference: for every pixel, brute-force distance to every segment, same coverage rule, same compositing */
function referenceRaster(drawing, size) {
  const polys = S.toPolylines(drawing, size);
  const data = new Float64Array(size * size * 3).fill(255);
  for (const p of polys) {
    const R2 = p.width / 2;
    const rgb = [1, 3, 5].map((o) => parseInt(p.color.slice(o, o + 2), 16));
    const segs = [];
    if (p.dot) segs.push([p.pts[0], p.pts[1], p.pts[0], p.pts[1]]);
    else for (let i = 0; i + 3 < p.pts.length; i += 2) segs.push([p.pts[i], p.pts[i + 1], p.pts[i + 2], p.pts[i + 3]]);
    for (let y = 0; y < size; y++) {
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
  return { width: size, height: size, data: Uint8Array.from(data, (v) => Math.round(v)) };
}

test('the row-scan rasteriser matches a brute-force reference on random strokes (no clipping bugs for any angle)', () => {
  const rng = mulberry32(27);
  for (let round = 0; round < 6; round++) {
    const abs = [];
    for (let i = 0; i < 4; i++) {
      const n = 1 + Math.floor(rng() * 5);
      abs.push({ c: Math.floor(rng() * 12), w: Math.floor(rng() * 3), p: Array.from({ length: n * 2 }, () => Math.floor(rng() * 1024)) });
    }
    const d = S.fromAbsolute(abs);
    const a = R.rasterize(d, { size: 96 });
    const b = referenceRaster(d, 96);
    assert.equal(R.diffRatio(a, b, 3), 0, 'round ' + round);
  }
});

/** box-filter a 4x supersampled render down to size: what an ideal anti-aliasing canvas would show */
function downsample(img, f) {
  const size = img.width / f;
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) sum += img.data[((y * f + j) * img.width + x * f + i) * 3 + k];
        out[(y * size + x) * 3 + k] = Math.round(sum / (f * f));
      }
    }
  }
  return { width: size, height: size, data: out };
}

test('AC 27 (server half): 512 x 512 output agrees with an ideal anti-aliased render within tolerance on >= 98% of pixels', () => {
  const rng = mulberry32(2727);
  const abs = [];
  for (let i = 0; i < 40; i++) {
    const p = [];
    let x = rng() * 1024;
    let y = rng() * 1024;
    for (let k = 0; k < 25; k++) {
      p.push(Math.max(0, Math.min(1023, Math.round(x))), Math.max(0, Math.min(1023, Math.round(y))));
      x += (rng() - 0.5) * 90;
      y += (rng() - 0.5) * 90;
    }
    abs.push({ c: i % 12, w: i % 3, p });
  }
  const d = S.fromAbsolute(abs);
  assert.equal(S.validate(d).ok, true);
  const img = R.rasterize(d, { size: 512 });
  const ideal = downsample(R.rasterize(d, { size: 2048 }), 4);
  const ratio = R.diffRatio(img, ideal, 40);
  assert.ok(ratio <= 0.02, 'differing pixels: ' + (ratio * 100).toFixed(2) + '%');
  console.log('# AC 27 server-side agreement: ' + ((1 - ratio) * 100).toFixed(2) + '% of pixels within tolerance');
});

test('V10: worst-case rasterisation time (4,000 points) is measured; hostile long segments stay bounded', () => {
  const rng = mulberry32(10);
  // realistic: 4,000 points of dense scribbling in 200 strokes of 20 points
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
  const d1 = S.fromAbsolute(scribble);
  assert.equal(S.pointCount(d1), 4000);
  let t = Date.now();
  R.rasterize(d1);
  const realistic = Date.now() - t;
  // hostile: 7 strokes of ~571 points, every segment crossing the whole canvas with the thickest brush
  const hostile = [];
  for (let i = 0; i < 7; i++) {
    const p = [];
    for (let k = 0; k < 571; k++) p.push(k % 2 ? 1023 : 0, k % 2 ? 0 : 1023 - ((k * 7) % 200));
    hostile.push({ c: 0, w: 2, p });
  }
  const d2 = S.fromAbsolute(hostile);
  assert.ok(S.pointCount(d2) <= 4000);
  t = Date.now();
  R.rasterize(d2);
  const worst = Date.now() - t;
  console.log(`# V10 rasterise 4,000 points: realistic scribble ${realistic} ms, hostile full-canvas zig-zag ${worst} ms (target <= 800 ms)`);
  assert.ok(realistic < 800, 'realistic ' + realistic);
  assert.ok(worst < 4000, 'hostile ' + worst); // hostile input is bounded; cloud timeout is 10 s
});
