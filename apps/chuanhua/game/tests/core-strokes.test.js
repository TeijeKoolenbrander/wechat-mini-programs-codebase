'use strict';
// AC 21 (one finger / outside touches: recorder rules), 22 (palette), 23 (撤销/清空/画好了), 24 (round trip, 1,000 random
// drawings), 25 (limits), 26 (4,000-point block), 31 (2.5 s replay maths), spec 5.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/strokes');
const { mulberry32 } = require('../core/rng');
const { CONFIG } = require('../core/config');

/** a random valid absolute drawing */
function randomAbs(rng) {
  const n = 1 + Math.floor(rng() * 12);
  const abs = [];
  for (let i = 0; i < n; i++) {
    const pts = 1 + Math.floor(rng() * 40);
    const p = [];
    let x = Math.floor(rng() * 1024);
    let y = Math.floor(rng() * 1024);
    p.push(x, y);
    for (let k = 1; k < pts; k++) {
      x = Math.max(0, Math.min(1023, x + Math.floor((rng() - 0.5) * 120)));
      y = Math.max(0, Math.min(1023, y + Math.floor((rng() - 0.5) * 120)));
      p.push(x, y);
    }
    abs.push({ c: Math.floor(rng() * 12), w: Math.floor(rng() * 3), p });
  }
  return abs;
}

test('AC 24: encode/decode round-trips exactly (1,000 random drawings), and every encoded drawing validates', () => {
  const rng = mulberry32(24);
  for (let i = 0; i < 1000; i++) {
    const abs = randomAbs(rng);
    const wire = S.fromAbsolute(abs);
    assert.equal(S.validate(wire).ok, true, 'drawing ' + i);
    assert.deepEqual(S.toAbsolute(wire), abs, 'drawing ' + i);
    assert.deepEqual(S.fromAbsolute(S.toAbsolute(wire)), wire);
    assert.deepEqual(JSON.parse(JSON.stringify(wire)), wire); // survives the JSON round trip of callFunction
  }
});

test('wire format: first point absolute then deltas, version 2 with the stored height h, indices first', () => {
  const wire = S.fromAbsolute([{ c: 2, w: 1, p: [10, 20, 15, 18, 15, 30] }]);
  assert.deepEqual(wire, { v: 2, h: 1024, s: [[2, 1, 10, 20, 5, -2, 0, 12]] });
  assert.deepEqual(S.fromAbsolute([{ c: 2, w: 1, p: [10, 20] }], 1363), { v: 2, h: 1363, s: [[2, 1, 10, 20]] });
  assert.deepEqual(S.empty(), { v: 2, h: 1024, s: [] });
  assert.deepEqual(S.empty(768), { v: 2, h: 768, s: [] });
  assert.equal(S.pointCount(wire), 3);
  assert.equal(S.colorsUsed({ v: 1, s: [[0, 0, 1, 1], [0, 1, 2, 2], [5, 2, 3, 3]] }), 2);
  assert.equal(S.usesPaletteColor({ v: 1, s: [[5, 0, 1, 1]] }), false);
  assert.equal(S.usesPaletteColor({ v: 1, s: [[6, 0, 1, 1]] }), true);
});

test('AC 25: validate rejects everything over the limits with a reason', () => {
  const ok = { v: 1, s: [[0, 0, 5, 5, 1, 1]] };
  assert.equal(S.validate(ok).ok, true);
  const bad = (d, reason, opts) => {
    const r = S.validate(d, opts);
    assert.equal(r.ok, false, JSON.stringify(d).slice(0, 80));
    assert.equal(r.reason, reason);
  };
  // > 200 strokes
  bad({ v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) }, 'strokes');
  assert.equal(S.validate({ v: 1, s: Array.from({ length: 200 }, () => [0, 0, 1, 1]) }).ok, true);
  // > 600 points in one stroke
  bad({ v: 1, s: [[0, 0, 0, 0, ...Array(2 * 600).fill(0)]] }, 'perStroke'); // 601 points
  assert.equal(S.validate({ v: 1, s: [[0, 0, 0, 0, ...Array(2 * 599).fill(0)]] }).ok, true); // 600 points
  // > 4,000 points in total (7 strokes of 600 = 4,200)
  bad({ v: 1, s: Array.from({ length: 7 }, () => [0, 0, 0, 0, ...Array(2 * 599).fill(0)]) }, 'points');
  // coordinates outside 0-1023 after decoding (absolute and via deltas)
  bad({ v: 1, s: [[0, 0, 1024, 0]] }, 'range');
  bad({ v: 1, s: [[0, 0, -1, 0]] }, 'range');
  bad({ v: 1, s: [[0, 0, 1000, 0, 30, 0]] }, 'range');
  bad({ v: 1, s: [[0, 0, 10, 10, -11, 0]] }, 'range');
  bad({ v: 1, s: [[0, 0, 10, 10, 0, 1014]] }, 'range');
  assert.equal(S.validate({ v: 1, s: [[0, 0, 1023, 1023, -1023, -1023]] }).ok, true);
  // colour > 11, size > 2, negative
  bad({ v: 1, s: [[12, 0, 1, 1]] }, 'color');
  bad({ v: 1, s: [[-1, 0, 1, 1]] }, 'color');
  bad({ v: 1, s: [[0, 3, 1, 1]] }, 'size');
  assert.equal(S.validate({ v: 1, s: [[11, 2, 1, 1]] }).ok, true);
  // JSON > 32 KB: long zig-zag deltas stay inside every other limit (points, range) but exceed the byte limit
  const zig = (strokes, pts) => ({ v: 1, s: Array.from({ length: strokes }, () => [0, 0, 0, 0, ...Array.from({ length: 2 * (pts - 1) }, (_, k) => ((k >> 1) % 2 === 0 ? 1023 : -1023))]) });
  const over = zig(5, 600);
  assert.ok(S.pointCount(over) <= 4000 && JSON.stringify(over).length > 32 * 1024, 'fixture is over 32 KB: ' + JSON.stringify(over).length);
  bad(over, 'bytes');
  const under = zig(2, 600);
  assert.ok(JSON.stringify(under).length < 32 * 1024);
  // within the byte limit but far over the ink budget (TD-56): rejected with pathLength; a fixture inside both limits passes
  bad(under, 'pathLength');
  assert.equal(S.validate({ v: 1, s: [[0, 0, 0, 0, 500, 500, -500, 100]] }).ok, true);
  // shape
  bad(null, 'shape');
  bad([], 'shape');
  bad({ v: 1 }, 'shape');
  bad({ v: 1, s: [], extra: 1 }, 'shape');
  bad({ v: 2, s: [[0, 0, 1, 1]] }, 'shape'); // v2 needs its height
  bad({ v: 3, h: 1024, s: [[0, 0, 1, 1]] }, 'version');
  bad({ v: 1, s: 'x' }, 'shape');
  bad({ v: 1, s: [[0, 0, 1]] }, 'shape'); // odd coordinate count
  bad({ v: 1, s: [[0, 0]] }, 'shape'); // no point
  bad({ v: 1, s: [[0, 0, 1.5, 1]] }, 'shape'); // non-integer
  bad({ v: 1, s: [[0, 0, '1', 1]] }, 'shape');
  bad({ v: 1, s: [[0, 0, NaN, 1]] }, 'shape');
  bad({ v: 1, s: [[0, 0, null, 1]] }, 'shape');
  bad({ v: 1, s: [{}] }, 'shape');
  // an empty drawing is not submittable (画好了 needs a stroke) but is a valid draft
  bad({ v: 1, s: [] }, 'empty');
  assert.equal(S.validate({ v: 1, s: [] }, { requireStroke: false }).ok, true);
});

test('AC 21/23/26: the recorder keeps points >= 3 grid units apart, one stroke at a time, and clamps to the grid', () => {
  const rec = S.createRecorder();
  assert.equal(rec.canSubmit, false);
  assert.equal(rec.canUndo, false);
  assert.equal(rec.begin(100, 100, 1, 2), true);
  assert.equal(rec.begin(5, 5, 0, 0), false, 'a second finger cannot start a second stroke');
  assert.equal(rec.move(101, 101), false, 'closer than 3 units is not kept');
  assert.equal(rec.move(103, 100), true);
  assert.equal(rec.move(104, 100), false);
  assert.equal(rec.move(-50, 2000), true, 'clamped into the grid, not rejected');
  rec.end();
  const d = rec.drawing();
  assert.equal(S.validate(d).ok, true);
  assert.deepEqual(S.toAbsolute(d)[0].p.slice(-2), [0, 1023]);
  assert.equal(rec.canSubmit, true);
  // moves without a stroke in progress are ignored
  assert.equal(rec.move(10, 10), false);
  // a tap becomes a dot
  rec.begin(50, 50, 0, 0);
  rec.end();
  assert.deepEqual(rec.drawing().s[1], [0, 0, 50, 50]);
  // bad indices
  assert.equal(rec.begin(1, 1, 99, 0), false);
  assert.equal(rec.begin(1, 1, 0, 9), false);
});

test('AC 23: 撤销 removes exactly the last stroke, unlimited; 清空 empties; submit is disabled with 0 strokes', () => {
  const rec = S.createRecorder();
  for (let i = 0; i < 5; i++) {
    rec.begin(10 * i, 10, 0, 1);
    rec.move(10 * i + 20, 50);
    rec.end();
  }
  assert.equal(rec.strokeCount, 5);
  const before = rec.drawing();
  assert.equal(rec.undo(), true);
  assert.deepEqual(rec.drawing().s, before.s.slice(0, 4));
  assert.equal(rec.undoCount, 1);
  while (rec.canUndo) rec.undo();
  assert.equal(rec.strokeCount, 0);
  assert.equal(rec.canSubmit, false);
  assert.equal(rec.undo(), false);
  rec.begin(1, 1, 0, 0);
  rec.end();
  rec.clear();
  assert.equal(rec.strokeCount, 0);
  assert.equal(rec.pointsUsed, 0);
  assert.equal(rec.canSubmit, false);
  // cannot undo while a finger is down
  rec.begin(1, 1, 0, 0);
  assert.equal(rec.canUndo, false);
  assert.equal(rec.undo(), false);
  rec.end();
});

test('AC 26: new strokes are blocked at 4,000 points ("画得太细啦，先交吧"), 200 strokes and 600 points per stroke', () => {
  const rec = S.createRecorder();
  // 600 points per stroke: the stroke simply stops growing
  rec.begin(0, 0, 0, 0);
  let kept = 1;
  for (let i = 1; i < 900; i++) if (rec.move((i * 7) % 1000, (i * 13) % 1000 + (i % 2) * 5)) kept++;
  rec.end();
  assert.equal(kept, 600);
  assert.equal(rec.pointsUsed, 600);
  // fill to the total limit
  let strokes = 1;
  while (!rec.blocked && strokes < 200) {
    rec.begin(strokes % 1000, 1, 0, 0);
    for (let i = 1; i < 600; i++) rec.move((strokes + i * 5) % 1000, (i * 9) % 1000);
    rec.end();
    strokes++;
  }
  assert.equal(rec.blocked, true);
  assert.ok(rec.pointsUsed <= 4000);
  assert.equal(rec.begin(5, 5, 0, 0), false, 'no new stroke once blocked');
  const d = rec.drawing();
  assert.equal(S.validate(d).ok, true);
  assert.ok(S.pointCount(d) <= 4000);
  // undo frees room again
  assert.equal(rec.undo(), true);
  assert.equal(rec.blocked, false);
  // the stroke limit
  const r2 = S.createRecorder();
  for (let i = 0; i < 200; i++) {
    assert.equal(r2.begin(i, i, 0, 0), true);
    r2.end();
  }
  assert.equal(r2.blocked, true);
  assert.equal(r2.begin(1, 1, 0, 0), false);
});

test('recorder.load restores a saved turn (app killed mid-turn, edge 21) and rejects bad data', () => {
  const rec = S.createRecorder();
  const wire = S.fromAbsolute([{ c: 3, w: 1, p: [10, 10, 40, 40] }, { c: 0, w: 0, p: [5, 5] }]);
  assert.equal(rec.load(wire), true);
  assert.deepEqual(rec.drawing(), wire);
  assert.equal(rec.pointsUsed, 3);
  assert.equal(rec.load({ v: 1, s: [[99, 0, 1, 1]] }), false);
  assert.deepEqual(rec.drawing(), wire, 'unchanged after a failed load');
});

test('AC 22: the 12 colours are the spec set; the first 6 are the base palette', () => {
  assert.equal(S.COLORS.length, 12);
  assert.deepEqual(S.COLORS.slice(0, 6), ['#1E1B18', '#D8433B', '#F29B30', '#3E9B5A', '#3C78C8', '#7B4FB3']);
  assert.deepEqual(S.COLORS.slice(6), ['#F28DB2', '#F2D13C', '#6CC3E0', '#8A5A3B', '#9A9A9A', '#9CCB4A']);
  assert.deepEqual(S.COLOR_NAMES.slice(0, 6), ['墨', '朱', '橙', '绿', '蓝', '紫']);
  assert.deepEqual(S.SIZES, [8, 18, 36]);
  assert.equal(S.BASE_COLORS, 6);
});

test('geometry: polylines are scaled to the output size with the half-cell centre offset, widths scale too', () => {
  const wire = S.fromAbsolute([{ c: 1, w: 2, p: [0, 0, 1023, 1023] }, { c: 0, w: 0, p: [512, 512] }]);
  const p = S.toPolylines(wire, 512);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].pts, [0.25, 0.25, 511.75, 511.75]);
  assert.equal(p[0].width, 18);
  assert.equal(p[0].color, '#D8433B');
  assert.equal(p[0].dot, false);
  assert.equal(p[1].dot, true);
  assert.equal(p[1].width, 4);
  assert.equal(S.toPolylines(wire, 1024)[0].width, 36);
});

test('AC 31: replay takes the same elapsed time whatever the stroke count: fraction = elapsed / 2500 ms, in drawing order', () => {
  assert.equal(S.REPLAY_MS, 2500);
  const rng = mulberry32(31);
  for (const n of [1, 10, 200]) {
    const abs = [];
    for (let i = 0; i < n; i++) abs.push({ c: i % 6, w: i % 3, p: [rng() * 1000, rng() * 1000, rng() * 1000, rng() * 1000].map(Math.floor) });
    const polys = S.toPolylines(S.fromAbsolute(abs), 512);
    assert.equal(S.replayPolylines(polys, 0).length, 0);
    assert.equal(S.replayPolylines(polys, 1).length, n);
    let prev = 0;
    for (let f = 0.1; f < 1; f += 0.1) {
      const part = S.replayPolylines(polys, f);
      assert.ok(part.length >= prev, 'monotonic');
      prev = part.length;
      // drawing order: the shown strokes are a prefix (the last may be cut)
      for (let i = 0; i < part.length - 1; i++) assert.equal(part[i], polys[i]);
    }
  }
  // a single long stroke is cut part-way, not all-or-nothing
  const one = S.toPolylines(S.fromAbsolute([{ c: 0, w: 1, p: [0, 0, 500, 0, 1000, 0] }]), 512);
  const half = S.replayPolylines(one, 0.5);
  assert.equal(half.length, 1);
  assert.ok(half[0].pts[half[0].pts.length - 2] < one[0].pts[4] && half[0].pts[half[0].pts.length - 2] > one[0].pts[2] / 2);
});
