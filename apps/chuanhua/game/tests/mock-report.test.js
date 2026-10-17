'use strict';
// TD-140: the mock server answers `report {roomId, reportRef}` exactly as the cloud function does (parity with cloudfunctions/tests/rooms-report.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMockServer } = require('../js/mock-server');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const drawing = () => ({ v: 2, h: 1363, s: Array.from({ length: 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });

function world() {
  const w = { t: T0 };
  const srv = createMockServer({ now: () => w.t, seed: 5 });
  w.srv = srv;
  w.names = ['A', 'B', 'C', 'D', 'E'];
  w.id = (n) => 'openid-' + n;
  w.call = (n, name, data) => srv.call(name, data, w.id(n));
  for (const n of w.names) {
    assert.equal(w.call(n, 'agreeRules', { version: 2 }).ok, true);
    w.call(n, 'joinGroup', { cloudID: 'cid-3-group-1' });
  }
  w.ref = w.call('A', 'joinGroup', { cloudID: 'cid-3-group-1' }).groupRef;
  w.room = (id) => srv.db.rooms[id];
  w.view = (id, n) => {
    const r = w.room(id);
    if (r.state === 'playing' && w.t < r.roundStartAt) w.t = r.roundStartAt + 1;
    return w.call(n, 'getRoom', { roomId: id });
  };
  w.pickAll = (id, names) => {
    for (const n of names) {
      const v = w.view(id, n);
      const roll = v.assignment.roll;
      const r = w.call(n, 'submitRoomStep', { roomId: id, round: 0, rollId: roll.rollId, promptId: roll.prompts[0].id, auto: false, empty: false });
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  };
  w.sendRound = (id, names) => {
    const round = w.room(id).round;
    const kind = w.room(id).kind;
    const out = {};
    for (const n of names) {
      w.view(id, n);
      const body = { roomId: id, round, auto: false, empty: false };
      if (kind === 'draw') body.strokes = drawing();
      else body.text = '一只猫在开出租车';
      out[n] = w.call(n, 'submitRoomStep', body);
      assert.equal(out[n].ok, true, JSON.stringify(out[n]));
    }
    return out;
  };
  const c = w.call('A', 'createRoom', { groupRef: w.ref });
  assert.equal(c.ok, true, JSON.stringify(c));
  w.roomId = c.roomId;
  for (const n of ['B', 'C', 'D']) assert.equal(w.call(n, 'joinRoom', { roomId: c.roomId, groupRef: w.ref }).ok, true);
  assert.equal(w.call('A', 'startRoom', { roomId: c.roomId }).ok, true);
  w.pickAll(c.roomId, ['A', 'B', 'C', 'D']);
  return w;
}

test('mock: a member reports a live source, a non-member / wrong ref / duplicate are refused, the room advances', () => {
  const w = world();
  const id = w.roomId;
  const r1 = w.view(id, 'B').assignment.source;
  assert.equal(r1.kind, 'prompt');
  assert.equal(r1.reportRef, undefined, 'a rolled prompt carries no ref');
  w.sendRound(id, ['A', 'B', 'C', 'D']);
  const src = w.view(id, 'B').assignment.source;
  assert.equal(src.kind, 'draw');
  assert.match(src.reportRef, /^q[0-9a-z]{2,24}$/);
  // refused
  assert.equal(w.call('E', 'report', { roomId: id, reportRef: src.reportRef, reason: 'abuse' }).code, 'NOT_MEMBER');
  assert.equal(w.call('C', 'report', { roomId: id, reportRef: src.reportRef, reason: 'abuse' }).code, 'BAD_REQUEST');
  assert.equal(w.call('B', 'report', { roomId: id, reportRef: 'qnope', reason: 'abuse' }).code, 'BAD_REQUEST');
  assert.equal(w.call('B', 'report', { roomId: id, reportRef: src.reportRef, reason: 'nope' }).code, 'BAD_REQUEST');
  assert.equal(Object.keys(w.srv.db.reports).length, 0);
  // accepted
  const rep = w.call('B', 'report', { roomId: id, reportRef: src.reportRef, reason: 'abuse' });
  assert.deepEqual([rep.ok, rep.hidden, rep.reopened], [true, true, false]);
  assert.equal(Object.keys(w.srv.db.reports).length, 1);
  const hidden = Object.values(w.srv.db.steps).filter((s) => s.hiddenReason === 'report');
  assert.equal(hidden.length, 1);
  const after = w.call('B', 'getRoom', { roomId: id }).assignment.source;
  assert.deepEqual([after.kind, after.canReport, after.reportRef], ['hidden', false, undefined]);
  assert.equal(w.call('B', 'report', { roomId: id, reportRef: src.reportRef, reason: 'abuse' }).code, 'DUP_REPORT');
  // the room keeps running
  w.sendRound(id, ['A', 'B', 'C', 'D']);
  assert.equal(w.room(id).round, 3);
  // a stale ref after the round moved on
  assert.equal(w.call('B', 'report', { roomId: id, reportRef: src.reportRef, reason: 'abuse' }).code, 'BAD_REQUEST');
  // the teaser (non-member) carries no content and no ref
  const e = w.call('E', 'getRoom', { roomId: id, groupRef: w.ref });
  assert.equal(JSON.stringify(e).includes('reportRef'), false);
  assert.equal(e.assignment, undefined);
});
