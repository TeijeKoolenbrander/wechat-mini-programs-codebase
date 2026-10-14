'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const ev = (name = 'run_start', props = {}) => ({ name, props, sessionId: 'sess-1', clientTs: T0 - 5 });
const track = (events, openid = 'u1', extra = {}) => h.call('track', { events, ...extra }, { openid });

test('stores events with the context openid and server timestamp', async () => {
  const r = await track([ev('run_start', { runId: 'r1', mode: 'free' }), ev('run_complete', { wins: 9 })], 'u1', { openid: 'forged' });
  assert.deepEqual(r, { ok: true, accepted: 2 });
  const docs = h.db.all('events');
  assert.equal(docs.length, 2);
  assert.ok(docs.every((d) => d.openid === 'u1' && d.ts === T0 && d.sessionId === 'sess-1' && d.clientTs === T0 - 5));
  assert.equal((await track([ev()], 'u1').then(() => h.call('track', { events: [ev()] }, {}))).code, 'UNAUTHENTICATED');
});

test('batch limit: 1..50 events per call', async () => {
  assert.equal((await track(new Array(50).fill(ev()))).accepted, 50);
  assert.equal((await track(new Array(51).fill(ev()))).code, 'INVALID_ACTIONS');
  assert.equal((await track([])).code, 'INVALID_ACTIONS');
  assert.equal((await track('x')).code, 'INVALID_ACTIONS');
});

test('unknown and server-only event names are dropped; the rest of the batch is kept', async () => {
  const r = await track([ev('board_list'), ev('daily_gen'), ev('made_up'), { nope: 1 }, 'str', ev('share_tap', { kind: 'result' })]);
  assert.equal(r.accepted, 1);
  assert.deepEqual(h.db.all('events').map((e) => e.name), ['share_tap']);
});

test('props never keep identifier-like keys (openid, openGId, groupRef, shareTicket ...) at any depth (AC 60)', async () => {
  await track([ev('group_join', {
    result: 'ok', scene: 1044, openGId: 'OG-SECRET', groupRef: 'abcdef0123456789', openid: 'o-x', shareTicket: 'tk',
    nested: { groupRef: 'zzz', keep: 1, deeper: [{ OPENID: 'x', ok: true }, { opengid: 'q', a: 2 }] },
    'bad.key': 1, $set: 1,
  })]);
  const props = h.db.all('events')[0].props;
  assert.deepEqual(props, { result: 'ok', scene: 1044, nested: { keep: 1, deeper: [{ ok: true }, { a: 2 }] } });
  assert.doesNotMatch(JSON.stringify(h.db.all('events')), /OG-SECRET|abcdef0123456789|o-x|shareTicket/);
});

test('oversized props are dropped, long strings truncated, bad sessionId nulled', async () => {
  const big = { blob: Array.from({ length: 20 }, () => 'y'.repeat(200)) };
  const r = await track([ev('error', big), { name: 'error', props: { where: 'x'.repeat(500) }, sessionId: 'bad session!', clientTs: 'soon' }]);
  assert.equal(r.accepted, 1);
  const d = h.db.all('events')[0];
  assert.equal(d.props.where.length, 200);
  assert.equal(d.sessionId, null);
  assert.equal(d.clientTs, null);
});

test('rate limited per openid (300 events/min), window resets, other users unaffected', async () => {
  for (let i = 0; i < 6; i++) assert.equal((await track(new Array(50).fill(ev()))).ok, true);
  const limited = await track([ev()]);
  assert.equal(limited.ok, false);
  assert.equal(limited.code, 'RATE_LIMITED');
  assert.equal(h.db.all('events').length, 300);
  assert.equal((await track([ev()], 'u2')).ok, true);
  h.advance(60000);
  assert.equal((await track([ev()])).ok, true);
});
