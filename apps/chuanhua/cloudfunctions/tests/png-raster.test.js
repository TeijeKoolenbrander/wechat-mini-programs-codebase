'use strict';
// AC 25/27/42 (server side of the moderation image), V10: strokes -> validated -> 512 x 512 PNG, deterministic and decodable.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const zlib = require('zlib');
const { stage } = require('./helpers/stage');

const fn = stage();
const { strokesToPng } = require(path.join(fn, 'common', 'raster'));
const { encodePng, decodePng, crc32 } = require(path.join(fn, 'common', 'png'));
const strokes = require(path.join(fn, 'core', 'strokes'));
const { rasterize } = require(path.join(fn, 'core', 'raster'));

const drawing = () => strokes.fromAbsolute([{ c: 1, w: 2, p: [100, 100, 900, 300, 200, 800] }, { c: 4, w: 1, p: [512, 512] }]);

test('PNG signature, IHDR 512 x 512 RGB 8-bit, valid CRCs, and the pixels round-trip exactly', () => {
  const r = strokesToPng(drawing());
  assert.equal(r.ok, true);
  assert.deepEqual([r.width, r.height], [512, 512]);
  assert.deepEqual([...r.png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(r.png.readUInt32BE(16), 512);
  assert.equal(r.png.readUInt32BE(20), 512);
  assert.equal(r.png[24], 8);
  assert.equal(r.png[25], 2);
  const img = decodePng(r.png); // verifies every chunk CRC
  const direct = rasterize(drawing());
  assert.ok(Buffer.from(img.data).equals(Buffer.from(direct.data)));
  assert.equal(r.png.subarray(-12, -8).readUInt32BE(0), 0);
  assert.equal(r.png.subarray(-8, -4).toString('ascii'), 'IEND');
});

test('crc32 matches zlib\'s reference values', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  if (zlib.crc32) assert.equal(crc32(Buffer.from('chuanhua')), zlib.crc32(Buffer.from('chuanhua')));
});

test('deterministic bytes: a re-check sends the identical image', () => {
  assert.ok(strokesToPng(drawing()).png.equals(strokesToPng(JSON.parse(JSON.stringify(drawing()))).png));
});

test('AC 25: invalid or over-limit strokes never reach the rasteriser (INVALID_STROKES with a reason)', () => {
  for (const bad of [null, { v: 1, s: [] }, { v: 1, s: [[12, 0, 1, 1]] }, { v: 1, s: [[0, 0, 4000, 1]] }, { v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) }, 'x', 5]) {
    const r = strokesToPng(bad);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_STROKES');
    assert.ok(r.reason);
  }
});

test('size and speed: typical drawings are small PNGs; encoding 4,000 points stays well under the 10 s function timeout (V10)', () => {
  const sparse = strokesToPng(drawing());
  assert.ok(sparse.png.length < 20 * 1024, 'sparse PNG ' + sparse.png.length);
  const abs = [];
  for (let i = 0; i < 200; i++) abs.push({ c: i % 12, w: 2, p: Array.from({ length: 40 }, (_, k) => (k % 2 ? 100 + ((i * 37 + k * 11) % 800) : 100 + ((i * 53 + k * 7) % 800))) });
  const dense = strokes.fromAbsolute(abs);
  assert.equal(strokes.validate(dense).ok, true);
  const t = Date.now();
  const r = strokesToPng(dense);
  const ms = Date.now() - t;
  console.log(`# V10 strokes->PNG (4,000 points): ${ms} ms, ${(r.png.length / 1024).toFixed(1)} KB; sparse drawing ${(sparse.png.length / 1024).toFixed(1)} KB`);
  assert.ok(ms < 2000);
  assert.ok(r.png.length < 400 * 1024);
});

test('encodePng/decodePng handle all PNG filters on decode', () => {
  const img = { width: 4, height: 3, data: Uint8Array.from({ length: 36 }, (_, i) => (i * 7) & 255) };
  const back = decodePng(encodePng(img));
  assert.deepEqual([...back.data], [...img.data]);
});
