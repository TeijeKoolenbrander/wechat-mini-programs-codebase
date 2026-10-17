'use strict';
// QA (independent): hostile input to the two functions that take user-made content (spec 5.3, 5.6, AC 25, 33, 112), on the REAL
// cloud functions with the production configuration (ENV_KIND=prod, MODERATION_MODE=live, fake WeChat platform).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloudDriver } = require('./helpers/drivers');

async function world() {
  const d = cloudDriver({ moderation: 'live' });
  const w = { d };
  for (const u of ['A', 'B']) {
    w[u] = { id: 'openid-' + u, call: (fn, data) => d.call(fn, data, 'openid-' + u) };
    assert.equal((await w[u].call('agreeRules', { version: 2 })).ok, true);
    w[u].ref = await d.join('openid-' + u, 'group-1');
  }
  return w;
}
const good = { v: 1, s: [[0, 1, 731, 389, 17, 23]] };

test('QA fuzz (AC 25, 112): hostile stroke payloads (floats, NaN, strings, huge arrays, __proto__, nested, wrong v) are refused cleanly: never INTERNAL, never stored, claim intact', async () => {
  const w = await world();
  try {
    const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
    const huge = { v: 1, s: new Array(1e5).fill([0, 1, 5, 5]) };
    const payloads = [
      { v: 1, s: [[0, 1, 1.5, 2]] }, { v: 1, s: [[0, 1, 'a', 'b']] }, { v: 1, s: [[0, 1, NaN, 5]] }, { v: 1, s: [[0, 1, Infinity, 5]] },
      { v: 1, s: [[0, 1, -1, 5]] }, { v: 1, s: [[0, 1, 1024, 5]] }, { v: 1, s: [[12, 1, 5, 5]] }, { v: 1, s: [[0, 3, 5, 5]] }, { v: 2, s: [[0, 1, 5, 5]] },
      { v: 1, s: [] }, { v: 1, s: [[]] }, { v: 1, s: [[0, 1]] }, { v: 1, s: 'x' }, { v: 1 }, { s: [[0, 1, 5, 5]] }, [], 'strokes', 7, true, huge,
      JSON.parse('{"v":1,"s":[[0,1,5,5]],"__proto__":{"polluted":1}}'), { v: 1, s: [[0, 1, 5, 5, [1, 2], 3]] }, { v: 1, s: [[0, 1, 5, 5]], extra: 'x'.repeat(40000) },
      { v: 1, s: [[0, 1, 5, 5, 1e9, 1e9]] }, { v: 1, s: [[0, 1, 5, 5, 2000, -2000]] },
    ];
    for (const [i, p] of payloads.entries()) {
      w.d.t += 61e3; // a new rate-limit window per call
      const k = await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: p });
      assert.equal(k.ok, false, 'payload ' + i + ' must be refused: ' + JSON.stringify(k).slice(0, 200));
      assert.notEqual(k.code, 'INTERNAL', 'payload ' + i);
      assert.ok(['INVALID_STROKES', 'BAD_REQUEST'].includes(k.code), 'payload ' + i + ' ' + k.code);
    }
    assert.equal(w.d.steps().length, 0, 'nothing stored');
    assert.equal(({}).polluted, undefined, 'no prototype pollution');
    assert.equal(w.d.chain(c.chainId).claim.claimId, c.claim.claimId, 'the claim is intact');
    w.d.t += 61e3;
    assert.equal((await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: good })).state, 'pending', 'a good drawing still goes through');
  } finally {
    w.d.destroy();
  }
});

test('QA fuzz (AC 33, 112): hostile text payloads (arrays, objects with toString, huge strings, lone surrogates, control and bidi characters, emoji) are refused cleanly and never stored', async () => {
  const w = await world();
  try {
    const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
    await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: good });
    await w.d.sweep(2);
    const k = await w.B.call('claimStep', { chainId: c.chainId, groupRef: w.B.ref });
    assert.equal(k.ok, true, JSON.stringify(k));
    const payloads = [['一', '二'], { toString: () => '一二三四' }, '一'.repeat(5000), '\ud800\ud800ab', '一二\u0000三四', '一二‮三四', '😀😀😀😀', '  ', '\n\n', '一','𠀀𠀀𠀀𠀀𠀀'.repeat(4)];
    for (const [i, p] of payloads.entries()) {
      w.d.t += 61e3;
      const r = await w.B.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: p });
      assert.equal(r.ok, false, 'payload ' + i + ' unexpectedly passed: ' + JSON.stringify(p).slice(0, 60));
      assert.notEqual(r.code, 'INTERNAL', 'payload ' + i);
    }
    assert.ok(!w.d.steps().some((s) => s.n === 2));
  } finally {
    w.d.destroy();
  }
});
