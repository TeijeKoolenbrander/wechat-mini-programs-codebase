'use strict';
// TD-140: the opaque report reference of a live source (core/room.js#reportRefFor, memberView) as pure functions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../core/room');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const seatsOf = (n) => Array.from({ length: n }, (_, i) => 'u' + i);

function started(n) {
  let r = R.newRoom({ roomId: 'ROOMAAAAAA', host: 'u0', openGId: 'g', groupRef: 'ref', now: T0, dateKey: '20261103' });
  for (let i = 1; i < n; i++) r = R.join(r, 'u' + i, T0 + i * 1000);
  return R.start(r, {
    now: T0 + 60e3,
    chainIds: seatsOf(n).map((_, i) => 'CHAIN' + i),
    rolls: seatsOf(n).map((_, i) => ({ rollId: 'r' + i, ids: ['A0' + i, 'B0' + i, 'C0' + i] })),
  });
}
function sendAll(room, now) {
  let r = room;
  for (let s = 0; s < r.n; s++) {
    if (R.isResolved(R.slotAt(r, r.round, s))) continue;
    r = R.markReceived(r, s, now);
    r = R.resolveSent(r, s, r.round === 0 ? { promptId: 'A0' + s } : { stepId: 'S_' + r.round + '_' + s }, now, false);
  }
  return r;
}

test('reportRefFor is opaque, per seat and round, deterministic; memberView adds it only to a reportable source', () => {
  const r1 = R.advance(sendAll(started(4), T0 + 62e3), T0 + 63e3, 'all').room;
  assert.equal(r1.round, 1);
  const refs = [0, 1, 2, 3].map((s) => R.reportRefFor(r1, s));
  assert.equal(new Set(refs).size, 4, 'one ref per seat');
  assert.equal(R.reportRefFor(r1, 1), refs[1], 'deterministic');
  for (const ref of refs) {
    assert.match(ref, /^q[0-9a-z]{2,24}$/);
    for (const hint of ['CHAIN0', 'CHAIN1', 'ROOMAAAAAA', 'u0', 'u1']) assert.equal(ref.includes(hint), false);
  }
  const now = r1.roundStartAt + 1;
  const custom = R.memberView(r1, 1, 'u1', { now, source: { kind: 'prompt', text: 'x', custom: true, canReport: true } });
  assert.equal(custom.assignment.source.reportRef, refs[1]);
  assert.equal(JSON.stringify(custom).includes('CHAIN'), false, 'no chain id in the member view');
  const rolled = R.memberView(r1, 1, 'u1', { now, source: { kind: 'prompt', text: 'x', custom: false, canReport: false } });
  assert.equal('reportRef' in rolled.assignment.source, false);
  const marker = R.memberView(r1, 1, 'u1', { now, source: { kind: 'hidden', hint: 'h', canReport: false } });
  assert.equal('reportRef' in marker.assignment.source, false);
  const r2 = R.advance(sendAll(r1, r1.roundStartAt + 5000), r1.roundStartAt + 6000, 'all').room;
  assert.equal(r2.round, 2);
  assert.notEqual(R.reportRefFor(r2, 1), refs[1], 'a new round, a new ref');
});
