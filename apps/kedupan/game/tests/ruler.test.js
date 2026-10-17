'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuler, makeTrack, posFromX, xFromPos } = require('../core/ruler');

const track = makeTrack({ x: 0, width: 375 }); // 16 .. 359

test('AC 14: no needle until the first touch; 就这儿 disabled until then', () => {
  const r = createRuler();
  assert.equal(r.pos, null);
  assert.equal(r.canConfirm(), false);
  assert.equal(r.phase, 'empty');
  assert.equal(r.nudge(1), false, 'a nudge never creates a needle');
  assert.equal(r.pos, null);
  r.touchStart(1, 200, track, 1000);
  assert.equal(r.canConfirm(), true);
  assert.equal(r.phase, 'placing');
});

test('AC 14: positions are integers 0..100 and both ends are reachable by drag', () => {
  const r = createRuler();
  r.touchStart(1, 100, track, 0);
  for (let x = 0; x <= 375; x += 3) {
    r.touchMove(1, x, track);
    assert.ok(Number.isInteger(r.pos) && r.pos >= 0 && r.pos <= 100);
  }
  r.touchMove(1, -50, track);
  assert.equal(r.pos, 0);
  r.touchMove(1, 9999, track);
  assert.equal(r.pos, 100);
  r.touchMove(1, track.x0, track);
  assert.equal(r.pos, 0);
  r.touchMove(1, track.x1, track);
  assert.equal(r.pos, 100);
  assert.equal(posFromX((track.x0 + track.x1) / 2, track), 50);
  assert.ok(Math.abs(xFromPos(50, track) - 187.5) < 1e-9);
});

test('AC 14: the needle jumps to the finger and release keeps it', () => {
  const r = createRuler();
  assert.equal(r.touchStart(1, track.x0 + (track.x1 - track.x0) * 0.3, track, 0), true);
  assert.equal(r.pos, 30);
  r.touchEnd(1);
  assert.equal(r.pos, 30);
});

test('AC 14: ‹ › move exactly 1 step and clamp at both ends', () => {
  const r = createRuler();
  r.touchStart(1, track.x0, track, 0);
  r.touchEnd(1);
  assert.equal(r.pos, 0);
  assert.equal(r.nudge(-1), false);
  assert.equal(r.pos, 0);
  assert.equal(r.nudge(1), true);
  assert.equal(r.pos, 1);
  r.restore(99);
  r.nudge(1);
  assert.equal(r.pos, 100);
  assert.equal(r.nudge(1), false);
  assert.equal(r.pos, 100);
  r.nudge(-1);
  assert.equal(r.pos, 99);
  assert.equal(r.stats(0).nudges, 5, "every nudge press is counted, clamped or not");
});

test('single-finger routing: a second finger is ignored until the first lifts', () => {
  const r = createRuler();
  r.touchStart(1, 100, track, 0);
  const p = r.pos;
  assert.equal(r.touchStart(2, 300, track, 0), false);
  assert.equal(r.touchMove(2, 300, track), false);
  assert.equal(r.pos, p);
  r.touchEnd(2); // not the active finger: no effect
  assert.equal(r.touchMove(2, 300, track), false);
  r.touchEnd(1);
  assert.equal(r.touchStart(2, 300, track, 0), true);
});

test('lock stops input while submitting; unlock resumes (retry)', () => {
  const r = createRuler();
  r.touchStart(1, 100, track, 0);
  r.touchEnd(1);
  const p = r.pos;
  r.lock();
  assert.equal(r.canConfirm(), false);
  assert.equal(r.touchStart(1, 300, track, 0), false);
  assert.equal(r.nudge(1), false);
  assert.equal(r.pos, p);
  r.unlock();
  assert.equal(r.canConfirm(), true);
});

test('tick fires once per 5-step boundary crossing', () => {
  const r = createRuler();
  r.touchStart(1, track.x0, track, 0); // 0: first placement ticks
  assert.equal(r.consumeTick(), true);
  assert.equal(r.consumeTick(), false);
  r.nudge(1); // 1: same bucket
  assert.equal(r.consumeTick(), false);
  r.restore(4);
  r.nudge(1); // 5: crosses
  assert.equal(r.consumeTick(), true);
  r.nudge(-1); // back to 4: crosses again
  assert.equal(r.consumeTick(), true);
});

test('stats report touches, nudges and ms from the first touch (daily_card_place)', () => {
  const r = createRuler();
  r.touchStart(1, 100, track, 1000);
  r.touchEnd(1);
  r.touchStart(1, 120, track, 1500);
  r.touchEnd(1);
  r.nudge(1);
  assert.deepEqual(r.stats(4000), { touches: 2, nudges: 1, ms: 3000 });
  r.reset();
  assert.equal(r.pos, null);
  assert.deepEqual(r.stats(5000), { touches: 0, nudges: 0, ms: 0 });
});

test('track is robust to a degenerate width', () => {
  assert.equal(posFromX(10, { x0: 16, x1: 16 }), 0);
});
