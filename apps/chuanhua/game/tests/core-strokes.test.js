'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const S = require('../core/strokes');
const { rasterize, hashRaster, coverageStats } = require('../core/raster');
const { encodePng, crc32 } = require('../core/png');
const { mulberry32 } = require('../core/rng');
const { CONFIG } = require('../core/config');

function randomDrawing(rng, maxStrokes) {
  const d = S.emptyDrawing();
  const n = 1 + Math.floor(rng() * (maxStrokes || 40));
  let budget = CONFIG.strokes.maxPoints;
  for (let i = 0; i < n && budget > 1; i++) {
    const len = Math.min(budget, 1 + Math.floor(rng() * 120));
    budget -= len;
    let x = Math.floor(rng() * 1024);
    let y = Math.floor(rng() * 1024);
    const pts = [[x, y]];
    for (let k = 1; k < len; k++) {
      x = Math.max(0, Math.min(1023, x + Math.floor(rng() * 61) - 30));
      y = Math.max(0, Math.min(1023, y + Math.floor(rng() * 61) - 30));
      pts.push([x, y]);
    }
    d.s.push(S.makeStroke(Math.floor(rng() * 12), Math.floor(rng() * 3), pts));
  }
  return d;
}

test('AC 24: encode/decode round-trips 1,000 random drawings exactly', () => {
  const rng = mulberry32(2026);
  for (let i = 0; i < 1000; i++) {
    const d = randomDrawing(rng);
    const enc = S.encode(d);
    assert.deepEqual(S.decode(enc), d);
    assert.match(enc, /^[A-Za-z0-9_-]+$/);
  }
});

test('the compact encoding is much smaller than the JSON for typical strokes', () => {
  const rng = mulberry32(5);
  let json = 0;
  let enc = 0;
  for (let i = 0; i < 50; i++) {
    const d = randomDrawing(rng);
    json += S.jsonBytes(d);
    enc += S.encode(d).length;
  }
  assert.ok(enc < json * 0.6, `${enc} vs ${json}`);
});

test('decode rejects malformed and truncated input', () => {
  const d = randomDrawing(mulberry32(1), 5);
  const e = S.encode(d);
  assert.equal(S.decode(e.slice(0, -1)), null);
  assert.equal(S.decode(e + 'A'), null);
  assert.equal(S.decode('!!!'), null);
  assert.equal(S.decode(''), null);
  assert.equal(S.decode(null), null);
  assert.equal(S.decode('B'), null); // version 1 and nothing else
});

test('AC 25: validate enforces every limit with INVALID_STROKES', () => {
  const ok = { v: 1, s: [[0, 0, 10, 10, 5, 5]] };
  assert.equal(S.validate(ok).ok, true);
  assert.equal(S.validate(ok).points, 2);
  const reason = (d) => {
    const r = S.validate(d);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_STROKES');
    return r.reason;
  };
  assert.equal(reason(null), 'shape');
  assert.equal(reason({ v: 2, s: [] }), 'version');
  assert.equal(reason({ v: 1, s: 'x' }), 'shape');
  assert.equal(reason({ v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) }), 'stroke_count');
  assert.equal(S.validate({ v: 1, s: Array.from({ length: 200 }, () => [0, 0, 1, 1]) }).ok, true);
  assert.equal(reason({ v: 1, s: [[0, 0, 1]] }), 'stroke_short');
  assert.equal(reason({ v: 1, s: [[0, 0, 1, 1, 1]] }), 'stroke_odd');
  assert.equal(reason({ v: 1, s: [[0, 0, 1.5, 1]] }), 'int');
  assert.equal(reason({ v: 1, s: [[12, 0, 1, 1]] }), 'colour');
  assert.equal(reason({ v: 1, s: [[-1, 0, 1, 1]] }), 'colour');
  assert.equal(reason({ v: 1, s: [[0, 3, 1, 1]] }), 'size');
  assert.equal(reason({ v: 1, s: [[0, 0, 1024, 1]] }), 'range');
  assert.equal(reason({ v: 1, s: [[0, 0, 1, -1]] }), 'range');
  assert.equal(reason({ v: 1, s: [[0, 0, 1000, 1000, 24, 0]] }), 'range'); // lands on 1024
  assert.equal(S.validate({ v: 1, s: [[0, 0, 1000, 1000, 23, 0]] }).ok, true);
  const long = [0, 0, 500, 500];
  for (let i = 0; i < 600; i++) long.push(i % 2 ? -1 : 1, 0);
  assert.equal(reason({ v: 1, s: [long] }), 'stroke_points'); // 601 points
  const p600 = [0, 0, 500, 500];
  for (let i = 0; i < 599; i++) p600.push(i % 2 ? -1 : 1, 0);
  assert.equal(S.validate({ v: 1, s: [p600] }).ok, true);
  const many = { v: 1, s: [] };
  for (let i = 0; i < 7; i++) many.s.push(p600.slice());
  assert.equal(reason(many), 'point_count'); // 4,200 > 4,000
  const big = { v: 1, s: [] };
  for (let i = 0; i < 6; i++) {
    const st = [11, 2, 0, 0];
    for (let k = 0; k < 599; k++) st.push(k % 2 ? -1023 : 1023, k % 2 ? -1023 : 1023);
    big.s.push(st);
  }
  const r = S.validate(big);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bytes');
});

test('encode refuses an invalid drawing', () => {
  assert.throws(() => S.encode({ v: 1, s: [[99, 0, 1, 1]] }), /colour/);
});

test('makeStroke/strokePoints are inverse', () => {
  const pts = [[5, 5], [9, 3], [9, 3], [0, 1023]];
  assert.deepEqual(S.strokePoints(S.makeStroke(2, 1, pts)), pts);
});

// ---------------------------------------------------------------- rasteriser

const GOLDEN = { s: [S.makeStroke(1, 1, [[100, 100], [900, 140], [500, 900]]), S.makeStroke(4, 2, [[512, 512]]), S.makeStroke(0, 0, [[0, 0], [1023, 1023]])], v: 1 };

test('rasterize: deterministic, correct size, white background, ink where strokes are', () => {
  const a = rasterize(GOLDEN);
  const b = rasterize(JSON.parse(JSON.stringify(GOLDEN)));
  assert.equal(a.width, 512);
  assert.equal(a.data.length, 512 * 512 * 3);
  assert.equal(hashRaster(a), hashRaster(b));
  assert.deepEqual(Array.from(a.data.slice(0, 3)).concat(), [0x1e, 0x1b, 0x18]); // pixel (0,0) is on the first dot-line (colour 0)
  const mid = (254 * 512 + 258) * 3; // inside the blue dot at (512,512) grid, off the diagonal
  assert.deepEqual(Array.from(a.data.slice(mid, mid + 3)), [0x3c, 0x78, 0xc8]);
  const white = (500 * 512 + 5) * 3;
  assert.deepEqual(Array.from(a.data.slice(white, white + 3)), [255, 255, 255]);
});

test('rasterize: golden hash is pinned (changing the renderer changes server vs client pixels)', () => {
  assert.equal(hashRaster(rasterize(GOLDEN)), GOLDEN_HASH);
  assert.equal(hashRaster(rasterize({ v: 1, s: [] })), EMPTY_HASH);
});

test('rasterize: widths scale with size, empty drawing is all white, later strokes paint over earlier ones', () => {
  const e = rasterize({ v: 1, s: [] }, { size: 64 });
  assert.equal(coverageStats(e).ink, 0);
  const thin = coverageStats(rasterize({ v: 1, s: [S.makeStroke(0, 0, [[100, 512], [900, 512]])] })).ink;
  const thick = coverageStats(rasterize({ v: 1, s: [S.makeStroke(0, 2, [[100, 512], [900, 512]])] })).ink;
  assert.ok(thick > thin * 3, `${thick} ${thin}`);
  const over = rasterize({ v: 1, s: [S.makeStroke(1, 2, [[512, 512]]), S.makeStroke(4, 2, [[512, 512]])] });
  const mid = (256 * 512 + 256) * 3;
  assert.deepEqual(Array.from(over.data.slice(mid, mid + 3)), [0x3c, 0x78, 0xc8]);
});

test('rasterize: 4,000 points at 512 px renders quickly (V10 proxy)', () => {
  const rng = mulberry32(77);
  const d = S.emptyDrawing();
  for (let i = 0; i < 8; i++) {
    let x = 500;
    let y = 500;
    const pts = [[x, y]];
    for (let k = 1; k < 500; k++) {
      x = Math.max(0, Math.min(1023, x + Math.floor(rng() * 41) - 20));
      y = Math.max(0, Math.min(1023, y + Math.floor(rng() * 41) - 20));
      pts.push([x, y]);
    }
    d.s.push(S.makeStroke(i % 12, 2, pts));
  }
  assert.equal(S.pointCount(d), 4000);
  const t0 = process.hrtime.bigint();
  rasterize(d);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`# rasterize 4,000 points: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 800, ms + ' ms');
});

test('rasterize rejects invalid strokes', () => {
  assert.throws(() => rasterize({ v: 1, s: [[0, 0, 5000, 5]] }), /range/);
});

test('encodePng: valid PNG with stored blocks and with injected zlib; pixels survive', () => {
  const r = rasterize(GOLDEN, { size: 128 });
  for (const opts of [undefined, { deflate: (b) => zlib.deflateSync(b) }]) {
    const png = Buffer.from(encodePng(r, opts));
    assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    // walk the chunks, verify crc, inflate IDAT
    let o = 8;
    const types = [];
    let idat = Buffer.alloc(0);
    while (o < png.length) {
      const len = png.readUInt32BE(o);
      const type = png.toString('latin1', o + 4, o + 8);
      const body = png.subarray(o + 8, o + 8 + len);
      assert.equal(png.readUInt32BE(o + 8 + len), crc32(png, o + 4, o + 8 + len), type + ' crc');
      types.push(type);
      if (type === 'IDAT') idat = Buffer.concat([idat, body]);
      if (type === 'IHDR') {
        assert.equal(body.readUInt32BE(0), 128);
        assert.equal(body.readUInt32BE(4), 128);
        assert.equal(body[8], 8);
        assert.equal(body[9], 2);
      }
      o += 12 + len;
    }
    assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
    const raw = zlib.inflateSync(idat);
    assert.equal(raw.length, (128 * 3 + 1) * 128);
    for (let y = 0; y < 128; y += 17) {
      assert.deepEqual(Array.from(raw.subarray(y * 385 + 1, y * 385 + 1 + 384)), Array.from(r.data.subarray(y * 384, y * 384 + 384)));
    }
  }
  const stored = encodePng(r).length;
  const deflated = encodePng(r, { deflate: (b) => zlib.deflateSync(b) }).length;
  assert.ok(deflated < stored / 3);
});

test('full 512 px PNG with zlib is small enough for moderation upload', () => {
  const png = encodePng(rasterize(GOLDEN), { deflate: (b) => zlib.deflateSync(b) });
  console.log(`# 512px PNG (3 strokes) with zlib: ${png.length} bytes`);
  assert.ok(png.length < 40 * 1024);
});

// pinned by running the renderer once; update deliberately together with the client renderer
const GOLDEN_HASH = 1858744499;
const EMPTY_HASH = 3644366277;
