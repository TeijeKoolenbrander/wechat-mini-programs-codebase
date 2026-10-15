'use strict';
// Pure units: stroke validation, rasteriser, PNG, text rules, date keys, strike ladder, claim rules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const util = require('../common/util');
const strokesLib = require('../common/strokes');
const raster = require('../common/raster');
const png = require('../common/png');
const { validateText } = require('../common/text');
const push = require('../common/push');
const { createHarness } = require('./helpers/harness');

const row = (c, w, ...pts) => [c, w, ...pts];
const invalid = (v) => assert.throws(() => strokesLib.validateStrokes(v), (e) => e.code === 'INVALID_STROKES');
const ok = (v) => assert.doesNotThrow(() => strokesLib.validateStrokes(v));

test('stroke validation enforces every limit (AC 25)', () => {
  ok({ v: 1, s: [row(0, 0, 10, 10)] });
  ok({ v: 1, s: [row(11, 2, 0, 0, 1023, 1023)] });
  invalid(null);
  invalid({ v: 2, s: [row(0, 0, 1, 1)] });
  invalid({ v: 1, s: [] });
  invalid({ v: 1, s: 'x' });
  invalid({ v: 1, s: [row(12, 0, 1, 1)] }); // colour 12
  invalid({ v: 1, s: [row(0, 3, 1, 1)] }); // size 3
  invalid({ v: 1, s: [row(-1, 0, 1, 1)] });
  invalid({ v: 1, s: [row(0, 0, 1.5, 1)] }); // non-integer
  invalid({ v: 1, s: [row(0, 0, 1, 1, 5)] }); // odd delta count
  invalid({ v: 1, s: [[0, 0, 1]] }); // too short
  invalid({ v: 1, s: [row(0, 0, 1024, 0)] }); // start outside
  invalid({ v: 1, s: [row(0, 0, -1, 0)] });
  invalid({ v: 1, s: [row(0, 0, 1000, 1000, 30, 0)] }); // delta leaves the grid
  invalid({ v: 1, s: [row(0, 0, 5, 5, -6, 0)] });
  invalid({ v: 1, s: [row(0, 0, 5, 5, '1', 0)] });
  // stroke counts
  ok({ v: 1, s: Array.from({ length: 200 }, () => row(0, 0, 1, 1)) });
  invalid({ v: 1, s: Array.from({ length: 201 }, () => row(0, 0, 1, 1)) });
  // points per stroke: 600 ok, 601 not
  const pts = (n) => Array.from({ length: n - 1 }, () => [1, 0]).flat();
  ok({ v: 1, s: [row(0, 0, 0, 0, ...pts(600))] });
  invalid({ v: 1, s: [row(0, 0, 0, 0, ...pts(601))] });
  // total points: 6 x 600 = 3600 ok; 7 x 600 = 4200 > 4000
  ok({ v: 1, s: Array.from({ length: 6 }, () => row(0, 0, 0, 0, ...pts(600))) });
  invalid({ v: 1, s: Array.from({ length: 7 }, () => row(0, 0, 0, 0, ...pts(600))) });
  // serialized JSON > 32 KB with every other limit satisfied
  const zig = Array.from({ length: 599 }, (_, i) => (i % 2 ? [-1000, -1000] : [1000, 1000])).flat();
  const big = { v: 1, s: Array.from({ length: 6 }, () => row(0, 0, 0, 0, ...zig)) };
  assert.ok(Buffer.byteLength(JSON.stringify(big)) > 32 * 1024);
  invalid(big);
  assert.equal(strokesLib.countPoints({ v: 1, s: [row(0, 0, 0, 0, 1, 1, 1, 1)] }), 3);
});

test('stroke validation returns a whitelisted copy (extra keys dropped)', () => {
  const v = strokesLib.validateStrokes({ v: 1, s: [row(1, 1, 5, 5)], evil: '<script>', __proto__: { x: 1 } });
  assert.deepEqual(Object.keys(v).sort(), ['s', 'v']);
});

test('rasteriser: 512 x 512 white page, round caps and joins, colour and width by index, deterministic (PO-10)', () => {
  const s = { v: 1, s: [row(1, 2, 200, 200, 600, 0)] }; // colour 朱, size 粗 (36 -> 18 px), from x=100 to 400 at y=100
  const a = raster.renderPng(s);
  const b = raster.renderPng(s);
  assert.ok(a.equals(b), 'deterministic bytes');
  const img = png.decodePng(a);
  assert.deepEqual([img.width, img.height], [512, 512]);
  const px = (x, y) => [img.rgb[(y * 512 + x) * 3], img.rgb[(y * 512 + x) * 3 + 1], img.rgb[(y * 512 + x) * 3 + 2]];
  assert.deepEqual(px(250, 100), [0xd8, 0x43, 0x3b], 'stroke colour');
  assert.deepEqual(px(5, 5), [255, 255, 255], 'white background');
  assert.deepEqual(px(250, 120), [255, 255, 255], 'outside the 18 px width');
  assert.deepEqual(px(250, 93), [0xd8, 0x43, 0x3b], 'inside the half width (9 px)');
  assert.deepEqual(px(94, 100), [0xd8, 0x43, 0x3b], 'round cap extends the radius past the start');
  assert.deepEqual(px(88, 100), [255, 255, 255], 'but not further');
  const half = png.decodePng(raster.renderPng({ v: 1, s: [row(1, 2, 200, 201, 600, 0)] })); // centre line at y = 100.5
  const edge = half.rgb[(109 * 512 + 250) * 3];
  assert.ok(edge > 0xd8 && edge < 255, `anti-aliased edge (${edge})`);
  // a single point is a dot; later strokes paint over earlier ones
  const dot = png.decodePng(raster.renderPng({ v: 1, s: [row(0, 2, 512, 512), row(4, 0, 512, 512)] }));
  const c = (x, y) => [dot.rgb[(y * 512 + x) * 3], dot.rgb[(y * 512 + x) * 3 + 1], dot.rgb[(y * 512 + x) * 3 + 2]];
  assert.deepEqual(c(256, 256), [0x3c, 0x78, 0xc8]);
  assert.deepEqual(c(256 + 7, 256), [0x1e, 0x1b, 0x18]);
  assert.throws(() => raster.renderPng({ v: 1, s: [row(99, 0, 1, 1)] }), (e) => e.code === 'INVALID_STROKES');
});

test('rasterising the maximum drawing (4,000 points, widest brush) is fast enough for a 10 s function (V10 proxy)', () => {
  const rows = [];
  let seed = 7;
  const rnd = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let k = 0; k < 7; k++) {
    const r = [k % 12, 2, 512, 512];
    let x = 512; let y = 512;
    for (let i = 1; i < (k < 6 ? 571 : 570); i++) {
      const nx = Math.max(0, Math.min(1023, x + rnd(401) - 200));
      const ny = Math.max(0, Math.min(1023, y + rnd(401) - 200));
      r.push(nx - x, ny - y); x = nx; y = ny;
    }
    rows.push(r);
  }
  const v = strokesLib.validateStrokes({ v: 1, s: rows });
  assert.ok(strokesLib.countPoints(v) >= 3990);
  const t0 = process.hrtime.bigint();
  const out = raster.renderPng(v);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(out.length > 1000);
  assert.ok(ms < 2500, `took ${ms} ms`);
});

test('png encoder writes a valid structure (signature, CRCs, zlib stream)', () => {
  const rgb = new Uint8Array(4 * 4 * 3).fill(200);
  const buf = png.encodePng(4, 4, rgb);
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let pos = 8;
  const types = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const crc = buf.readUInt32BE(pos + 8 + len);
    assert.equal(png.crc32(buf.subarray(pos + 4, pos + 8 + len)), crc, `crc of ${type}`);
    types.push(type);
    pos += 12 + len;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  assert.equal(png.crc32(Buffer.from('123456789')), 0xcbf43926, 'crc32 check value');
  assert.ok(zlib.inflateSync(buf.subarray(8 + 25 + 8, buf.length - 12 - 4)).length > 0);
  const back = png.decodePng(buf);
  assert.deepEqual([...back.rgb], [...rgb]);
});

test('text rules: lengths by code point, charset, digits, contact words, URLs, blocklist (AC 33, 34, 35)', () => {
  const v = (t, o = { min: 2, max: 16 }) => validateText(t, { ...o, blocklist: ['坏词'] });
  assert.equal(v('猫在开车').ok, true);
  assert.equal(v('  猫在开车  ').text, '猫在开车');
  assert.equal(v('Hello 猫！').ok, true);
  assert.equal(v('一二', { min: 2, max: 12 }).ok, true);
  assert.equal(v('好').reason, 'length');
  assert.equal(v('猫'.repeat(16)).ok, true);
  assert.equal(v('猫'.repeat(17)).reason, 'length');
  assert.equal(v('猫'.repeat(12), { min: 2, max: 12 }).ok, true);
  assert.equal(v('猫'.repeat(13), { min: 2, max: 12 }).reason, 'length');
  assert.equal(v('一'.repeat(5)).reason, 'digits', 'five numeral characters in a row look like a phone number');
  assert.equal(v('猫猫😀').reason, 'chars');
  assert.equal(v('猫<script>').reason, 'chars');
  assert.equal(v('猫@人').reason, 'chars');
  assert.equal(v('猫 123 4').ok, true, '4 digits are fine');
  assert.equal(v('猫 123 45').reason, 'digits');
  assert.equal(v('猫１２３４５').reason, 'digits', 'full-width digits count');
  assert.equal(v('猫一二三四五').reason, 'digits', 'chinese numeral runs count');
  assert.equal(v('一二三四个猫').ok, true);
  for (const c of ['加我', '微信号', 'WX', 'vx', 'Q Q', 'qq群', '群号', '电话']) assert.ok(!v(`猫${c}`).ok, c);
  assert.equal(v('看 www.x.cn').reason, 'url');
  assert.equal(v('a.com 猫').reason, 'url');
  assert.equal(v('猫猫坏词猫').reason, 'blocklist');
  assert.equal(v('猫猫坏 词').reason, 'blocklist', 'spacing does not evade the list');
  assert.equal(v(5).reason, 'type');
  assert.equal(v(null).reason, 'type');
});

test('date keys are Beijing time whatever the process TZ (AC 113)', () => {
  const orig = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      assert.equal(util.dateKeyAt(Date.UTC(2026, 10, 3, 15, 59, 59)), '20261103', tz);
      assert.equal(util.dateKeyAt(Date.UTC(2026, 10, 3, 16, 0, 0)), '20261104', tz);
      assert.equal(util.bjtHour(Date.UTC(2026, 10, 3, 16, 0, 0)), 0, tz);
      assert.equal(util.bjtMidnightMs(Date.UTC(2026, 10, 3, 20, 0, 0)), Date.UTC(2026, 10, 3, 16, 0, 0), tz);
    }
  } finally { if (orig === undefined) delete process.env.TZ; else process.env.TZ = orig; }
  assert.equal(util.addDaysKey('20261231', 1), '20270101');
  assert.equal(util.daysBetween('20261101', '20261103'), 2);
  assert.equal(util.isDateKey('20261331'), false);
  assert.equal(util.isDateKey('20260229'), false);
});

test('strike ladder and streak are pure and idempotent', () => {
  const hh = createHarness();
  const players = hh.mod('common/players.js');
  hh.teardown();
  const p = players.defaultPlayer('oX', 0);
  const T = 1e12;
  assert.equal(players.addStrike(p, 's1', 'verdict', T).level, 1);
  assert.equal(players.addStrike(p, 's1', 'verdict', T).added, false, 'same item + source is counted once');
  assert.equal(p.warnPending, true);
  assert.equal(players.addStrike(p, 's2', 'report', T).level, 2);
  assert.equal(p.restrictedUntil, T + 24 * 3600e3);
  assert.equal(players.addStrike(p, 's3', 'verdict', T).level, 3);
  assert.equal(p.restrictedUntil, T + 7 * 86400e3);
  assert.equal(players.addStrike(p, 's4', 'verdict', T).level, 4);
  assert.equal(p.restrictedUntil, T + 30 * 86400e3);
  assert.equal(p.flagged, true);
  // a longer restriction is never shortened
  const q = players.defaultPlayer('oY', 0);
  q.restrictedUntil = T + 60 * 86400e3;
  players.addStrike(q, 'a', 'verdict', T);
  players.addStrike(q, 'b', 'verdict', T);
  assert.equal(q.restrictedUntil, T + 60 * 86400e3);
  // streak
  const s = players.defaultPlayer('oZ', 0);
  players.noteStepPassed(s, '20261101');
  players.noteStepPassed(s, '20261101');
  assert.equal(s.curStreak, 1);
  players.noteStepPassed(s, '20261102');
  players.noteStepPassed(s, '20261103');
  assert.equal(s.curStreak, 3);
  assert.equal(players.streakNow(s, '20261104'), 3);
  assert.equal(players.streakNow(s, '20261105'), 0);
  players.noteStepPassed(s, '20261105');
  assert.equal(s.curStreak, 1);
  assert.equal(s.bestStreak, 3);
});

test('push helpers: signature, AES round trip', () => {
  const sig = push.sha1Sorted(['t', '1', 'n']);
  assert.equal(push.verifySignature({ token: 't', timestamp: '1', nonce: 'n', signature: sig }), true);
  assert.equal(push.verifySignature({ token: 't', timestamp: '1', nonce: 'n', signature: sig.slice(1) }), false);
  assert.equal(push.verifySignature({ token: '', timestamp: '1', nonce: 'n', signature: sig }), false);
  const key = Buffer.alloc(32, 9).toString('base64').replace(/=+$/, '');
  const enc = push.encryptPayload(key, '{"a":"中文"}', 'wxid');
  assert.equal(push.decryptPayload(key, enc), '{"a":"中文"}');
  assert.throws(() => push.decryptPayload('short', enc));
});
