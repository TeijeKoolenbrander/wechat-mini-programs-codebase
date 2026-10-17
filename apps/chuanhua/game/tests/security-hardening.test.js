'use strict';
// Security hardening (studio audit M1, M3, L2, query parsing): client and mock parity. The server side is in
// cloudfunctions/tests/hardening.test.js and features.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { G, startChain, openCard } = require('./flows');
const { createMockServer } = require('../js/mock-server');
const { sanitizeEvents, EVENT_PROPS, EVENT_NAMES } = require('../core/analytics');
const { parseEnter } = require('../js/share');

// ---- M1: mock parity of joinGroup ---------------------------------------------------------------------------------------------

test('M1 (mock parity): joinGroup takes only the raw cloudID string; a client-shaped payload (groupData / object cloudID) never yields a group', () => {
  const srv = createMockServer({ seed: 1 });
  const forged = [
    { groupData: { cloudID: 'c', data: { opengid: 'victim', chat_type: 3 } } },
    { groupData: 'victim' },
    { cloudID: { cloudID: 'cid-3-victim', data: { opengid: 'victim', chat_type: 3 } } },
    { cloudID: 5 },
    { cloudID: 'short' },
    { cloudID: 'has space here' },
    {},
  ];
  for (const ev of forged) assert.equal(srv.call('joinGroup', ev, 'u1').code, 'BAD_CLOUDID', JSON.stringify(ev));
  assert.equal(Object.keys(srv.db.members).length, 0, 'nothing written');
  // the openGId comes from the resolver, not from the request
  assert.equal(srv.call('joinGroup', { cloudID: 'cid-3-real-group', groupData: { data: { opengid: 'other' } } }, 'u1').ok, true);
  assert.deepEqual(Object.values(srv.db.members).map((m) => m.openGId), ['real-group']);
  // not a group / unresolvable
  assert.equal(srv.call('joinGroup', { cloudID: 'cid-1-single-chat' }, 'u1').code, 'NOT_GROUP');
  assert.equal(srv.call('joinGroup', { cloudID: 'cid-x-no-chat-type' }, 'u1').ok, true, 'chat_type absent is accepted when there is an opengid (TD-116)');
  srv.resolveOpenData = (cloudID) => ({ cloudID, data: { open_single_roomid: 'room-only' } });
  assert.equal(srv.call('joinGroup', { cloudID: 'cid-3-single-room' }, 'u1').code, 'NOT_GROUP', 'open_single_roomid alone is not a group');
  srv.resolveOpenData = createMockServer({ seed: 1 }).resolveOpenData;
  assert.equal(srv.call('joinGroup', { cloudID: 'cid-4-wecom-group' }, 'u1').ok, true);
  srv.resolveOpenData = () => ({ errCode: 87009 });
  assert.equal(srv.call('joinGroup', { cloudID: 'cid-3-anything' }, 'u1').code, 'BAD_CLOUDID');
  srv.resolveOpenData = () => null;
  assert.equal(srv.call('joinGroup', { cloudID: 'cid-3-anything' }, 'u1').code, 'BAD_CLOUDID');
});

test('M1 (client): the entry flow sends exactly {cloudID: <string>} to joinGroup', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const seen = [];
  const real = a.app.api.joinGroup;
  a.app.api.joinGroup = (d) => (seen.push(d), real(d));
  const id = await startChain(a);
  await openCard(w, a, id);
  assert.ok(seen.length >= 1, 'joinGroup was called for a card with a share ticket');
  for (const d of seen) {
    assert.deepEqual(Object.keys(d), ['cloudID']);
    assert.equal(typeof d.cloudID, 'string');
  }
});

// ---- M3: RATE_LIMITED is handled gracefully ----------------------------------------------------------------------------------

test('M3 (client): a RATE_LIMITED answer never dead-ends: home keeps a retry, a claim toasts the limiter text, the drawing is kept for resubmit', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  w.sweep(2);
  // claim limited: toast, entry stays
  await openCard(w, b, id);
  assert.equal(b.vm().state, 'claimable');
  w.srv.rateLimited = ['claimStep'];
  await b.tap('entry:claim');
  assert.equal(b.toast(), '操作太快了，稍等一下');
  assert.equal(b.screen(), 'entry');
  w.srv.rateLimited = null;
  // submit limited: the drawing stays, the player can try again
  const c = await w.player('C', { rules: true, ...G });
  const id2 = await startChain(c);
  await c.tap('sent:home');
  await c.tap('home:slow');
  await c.tap('pick:start');
  c.scribble(3);
  w.srv.rateLimited = ['submitStep'];
  await c.tap('draw:submit');
  assert.equal(c.screen(), 'draw');
  assert.equal(c.vm().statusText, '操作太快了，稍等一下');
  assert.ok(c.has('draw:submit') || c.has('draw:retry'), 'the player can resubmit');
  w.srv.rateLimited = null;
  assert.ok(id2);
  // home limited: offline-style state with a retry, not an error dead end
  w.srv.rateLimited = ['getHome'];
  await a.show({ scene: 1001, query: {} });
  assert.notEqual(a.vm().state, 'error');
  w.srv.rateLimited = null;
});

// ---- L2: track allowlist ------------------------------------------------------------------------------------------------------

test('L2: every client event keeps only its catalogue props; unknown keys, wrong types and out-of-enum strings are dropped', () => {
  const [e] = sanitizeEvents([{
    name: 'step_submit',
    sessionId: 'abc123',
    clientTs: 5,
    props: {
      chainId: 'ABCDEFGHJK', step: 3, kind: 'draw', durationMs: 4200, auto: false, strokes: 7, points: 120, undoCount: 1, colorsUsed: 3, palette: true,
      isNewUser: true, appVersion: '1.0.0', promptsVersion: 1,
      extra: 'x', text: '你好', openid: 'o'.repeat(28), groupRef: '0123456789abcdef', foo: { a: 1 }, bar: [1],
    },
  }]);
  assert.deepEqual(e.props, {
    chainId: 'ABCDEFGHJK', step: 3, kind: 'draw', durationMs: 4200, auto: false, strokes: 7, points: 120, undoCount: 1, colorsUsed: 3, palette: true,
    isNewUser: true, appVersion: '1.0.0', promptsVersion: 1,
  });
  const [f] = sanitizeEvents([{ name: 'claim_attempt', props: { chainId: 'AB', step: '3', result: 'hacked' } }]);
  assert.deepEqual(f.props, {}, 'bad id, string number, enum miss: all dropped');
  const [g] = sanitizeEvents([{ name: 'step_submit', props: { strokes: [[1, 2, 3]], chars: '12', kind: 'DROP TABLE' } }]);
  assert.deepEqual(g.props, {}, 'a drawing under strokes, a numeric string, a free string');
  const [h] = sanitizeEvents([{ name: 'mod_verdict', props: { suggest: 'pass', kind: 'text' } }]);
  assert.deepEqual(h.props, {}, 'server-side events accept no client props');
  const [k] = sanitizeEvents([{ name: 'ad_error', props: { placement: 'banner', stub: false, errCode: 1004 } }, { name: '__proto__', props: {} }, { name: 'constructor' }]);
  assert.deepEqual(k.props, { placement: 'banner', stub: false, errCode: 1004 });
  assert.equal(sanitizeEvents([{ name: '__proto__' }, { name: 'toString' }, { name: 'hasOwnProperty' }]).length, 0);
  assert.equal(sanitizeEvents([{ name: 'error', props: { where: 'getHome', code: 'NETWORK' } }])[0].props.code, 'NETWORK');
  assert.deepEqual(sanitizeEvents([{ name: 'error', props: { where: 'x'.repeat(50), code: 'a b' } }])[0].props, {});
  assert.deepEqual(sanitizeEvents([{ name: 'session_start', sessionId: 'bad id!', props: {} }])[0].sessionId, null);
  assert.deepEqual(sanitizeEvents('nope'), []);
  assert.equal(sanitizeEvents(Array.from({ length: 80 }, () => ({ name: 'laugh' }))).length, 50);
});

test('L2: the catalogue covers every event name and every prop the client actually emits (nothing legitimate is dropped)', async () => {
  assert.deepEqual(EVENT_NAMES.slice().sort(), Object.keys(EVENT_PROPS).sort());
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  w.sweep(2);
  await openCard(w, b, id);
  await b.tap('entry:claim');
  const queued = [...a.app.analytics.queue, ...b.app.analytics.queue];
  assert.ok(queued.length > 5);
  for (const ev of queued) {
    const [out] = sanitizeEvents([ev]);
    assert.ok(out, 'event kept: ' + ev.name);
    const lost = Object.keys(ev.props).filter((k) => ev.props[k] !== undefined && !(k in out.props));
    assert.deepEqual(lost, [], ev.name + ' lost ' + lost.join(',') + ' ' + JSON.stringify(ev.props));
  }
});

// ---- query parsing never throws -----------------------------------------------------------------------------------------------

test('launch query parsing: malformed percent-escapes, odd shapes and hostile values never throw', () => {
  for (const q of ['k=%E0%A4%A', 'k=%', '%=%', 'k=%ZZ&r=1', 'a=b=c', '&&&', '=', 'k=' + '%'.repeat(5000), null, undefined, 5, {}, [], { k: { toString() { throw new Error('x'); } } }]) {
    assert.doesNotThrow(() => parseEnter({ scene: 1044, query: q, shareTicket: 'T' }), String(q).slice(0, 30));
  }
  assert.equal(parseEnter({ query: 'k=%E0%A4%A' }).kind, 'malformed');
  assert.equal(parseEnter(null).kind, 'none');
  assert.equal(parseEnter({ query: { k: 'ABCDEFGHJK' } }).kind, 'invite');
});
