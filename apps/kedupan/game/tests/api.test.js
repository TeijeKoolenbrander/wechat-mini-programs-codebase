'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi, NAMES } = require('../js/api');
const { createMockServer } = require('../js/mock-server');
const { setup, content } = require('./helpers');

test('api (mock mode): every function in the contract is exposed and resolves to {ok}', async () => {
  const { srv } = setup();
  const api = createApi({ mockServer: srv });
  assert.equal(api.mode, 'mock');
  ['getDaily', 'submitCard', 'getArchive', 'getArchiveDay', 'getBonusCard', 'unlockDistribution', 'joinGroup', 'getGroupDay', 'getFriendBoard', 'createRound', 'setClue', 'getRound', 'submitGuess', 'revealRound', 'subscribeRound', 'reportCard', 'track'].forEach((n) => {
    assert.ok(NAMES.includes(n), n);
    assert.equal(typeof api[n], 'function');
  });
  assert.equal(NAMES.length, 19);
  ['agreeRules', 'reportClue'].forEach((n) => assert.ok(NAMES.includes(n), n)); // D-2
  const d = await api.getDaily();
  assert.equal(d.ok, true);
  const bad = await api.submitCard({ dateKey: d.dateKey, idx: 0, pos: 500 });
  assert.deepEqual([bad.ok, bad.code], [false, 'INVALID_INPUT']);
});

test('api (cloud mode): success, failure, bad response and timeout all resolve (never reject)', async () => {
  const mk = (behaviour) => {
    const calls = [];
    const wx = {
      cloud: {
        init() {},
        callFunction(o) {
          calls.push(o);
          behaviour(o);
        },
      },
    };
    return { wx, calls };
  };
  let ok = mk((o) => o.success({ result: { ok: true, x: 1 } }));
  let api = createApi({ mode: 'cloud', wx: ok.wx });
  assert.deepEqual(await api.getDaily({ a: 1 }), { ok: true, x: 1 });
  assert.equal(ok.calls[0].name, 'getDaily');
  assert.deepEqual(ok.calls[0].data, { a: 1 });
  assert.ok(!('openid' in ok.calls[0].data), 'identity is never sent');

  const fail = mk((o) => o.fail({ errMsg: 'down' }));
  assert.deepEqual(await createApi({ mode: 'cloud', wx: fail.wx }).getDaily(), { ok: false, code: 'NETWORK', message: 'down' });

  const junk = mk((o) => o.success({ result: 'nope' }));
  assert.equal((await createApi({ mode: 'cloud', wx: junk.wx }).getDaily()).code, 'BAD_RESPONSE');

  const throws = mk(() => {
    throw new Error('boom');
  });
  assert.equal((await createApi({ mode: 'cloud', wx: throws.wx }).getDaily()).code, 'NETWORK');

  const hang = mk(() => {});
  api = createApi({ mode: 'cloud', wx: hang.wx, setTimeout: (fn) => setTimeout(fn, 5), clearTimeout });
  assert.equal((await api.submitCard({})).code, 'TIMEOUT');
});

test('api (cloud mode): fnPrefix is applied to every callFunction name through one table (TD-41)', async () => {
  const names = [];
  const wx = { cloud: { init() {}, callFunction(o) { names.push(o.name); o.success({ result: { ok: true } }); } } };
  const bc = require('../js/build-config');
  if (require('./mode').RELEASE) assert.ok(bc.fnPrefix === '' || bc.fnPrefix === 'kedupan_');
  else assert.equal(bc.fnPrefix, '', 'default is empty');
  for (const prefix of ['', 'kedupan_']) {
    names.length = 0;
    const api = createApi({ mode: 'cloud', wx, fnPrefix: prefix });
    for (const n of NAMES) await api[n]({});
    assert.deepEqual(names, NAMES.map((n) => prefix + n));
    assert.equal(Object.keys(api.fnNames).length, 19);
  }
});

test('the mock server refuses to start without a content library and says why', () => {
  assert.throws(() => createMockServer({ now: () => 0, contentVersion: 99 }), /server content missing/);
  assert.doesNotThrow(() => createMockServer({ now: () => 0, content }));
});
