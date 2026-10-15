'use strict';
// track: batched analytics through the cloud function only.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

const P = 'openid-track-player1';
const ev = (name, props = {}, extra = {}) => ({ name, props, clientTs: 1760000000000, ...extra });

test('stores events with openid from the context, top-level sessionId and clientTs', async () => {
  const r = await h.call('track', { events: [ev('run_start', { runId: 'r1', mode: 'daily', ranked: true }, { sessionId: 'sess_01' })] }, { openid: P });
  assert.deepEqual(r, { ok: true, accepted: 1 });
  const e = h.db.all('events')[0];
  assert.equal(e.openid, P);
  assert.equal(e.sessionId, 'sess_01');
  assert.equal(e.clientTs, 1760000000000);
  assert.equal(e.name, 'run_start');
  assert.deepEqual(e.props, { runId: 'r1', mode: 'daily', ranked: true });
});

test('sessionId sent only inside props is lifted to the top level and stripped from props', async () => {
  await h.call('track', { events: [ev('card_open', { sessionId: 'sess_inprops', cardKind: 'result' })] }, { openid: P });
  const e = h.db.all('events')[0];
  assert.equal(e.sessionId, 'sess_inprops');
  assert.equal('sessionId' in e.props, false);
});

test('identity comes from the context, never from the payload', async () => {
  await h.call('track', { openid: 'forged', events: [ev('error', { where: 'x', openid: 'forged2' }, { openid: 'forged3' })] }, { openid: P });
  const e = h.db.all('events')[0];
  assert.equal(e.openid, P);
  assert.equal('openid' in e.props, false);
});

test('only client events of the spec are accepted; server-side names are dropped; the batch never fails', async () => {
  const r = await h.call('track', {
    events: [ev('daily_gen'), ev('board_list'), ev('anomaly_daily'), ev('fact_report_daily'), ev('subscribe_send'), ev('wx_reportEvent'), ev('fact_report', { factId: 'f1', reasons: ['value'], where: 'reveal', result: 'ok' }), 'junk', null, ev('history_view', { items: 3, state: 'ready' })],
  }, { openid: P });
  assert.equal(r.accepted, 2);
  assert.deepEqual(h.db.all('events').map((e) => e.name).sort(), ['fact_report', 'history_view']);
});

test('props are sanitised: identifier-like keys dropped, long strings cut, oversized props dropped', async () => {
  await h.call('track', {
    events: [
      ev('group_join', { result: 'ok', groupRef: 'abcd', openGId: 'og', shareTicket: 't', groupid: 'g', cloudID: 'c', scene: 1044, $set: 1, 'a.b': 2, long: 'x'.repeat(500) }),
      ev('error', { blob: 'y'.repeat(190), more: 'z'.repeat(190), a: 'q'.repeat(190), b: 'q'.repeat(190), c: 'q'.repeat(190), d: 'q'.repeat(190) }),
    ],
  }, { openid: P });
  const e = h.db.all('events');
  assert.equal(e.length, 1, 'the oversized one is dropped');
  assert.deepEqual(Object.keys(e[0].props).sort(), ['long', 'result', 'scene']);
  assert.equal(e[0].props.long.length, 200);
});

test('batch limits and rate limiting', async () => {
  assert.equal((await h.call('track', { events: [] }, { openid: P })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('track', { events: new Array(51).fill(ev('error')) }, { openid: P })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('track', {}, { openid: P })).code, 'INVALID_ACTIONS');
  let limited = null;
  for (let i = 0; i < 10 && !limited; i++) {
    const r = await h.call('track', { events: new Array(50).fill(ev('error', { where: 'x' })) }, { openid: P });
    if (!r.ok) limited = r;
  }
  assert.equal(limited && limited.code, 'RATE_LIMITED');
  assert.equal((await h.call('track', { events: [ev('error')] })).code, 'UNAUTHENTICATED');
});
