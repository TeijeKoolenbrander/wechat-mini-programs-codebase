'use strict';
// Every function returns {ok:false, code} instead of throwing, whatever the input (AC 112).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');
const F = require('./helpers/flow');
const sync = require('../scripts/sync-core');

let h;
const [A, B] = F.PEOPLE;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

function rng(seed) {
  let s = seed;
  return (n) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % n; };
}

test('malformed and hostile inputs never throw and always yield a structured result (AC 112)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const chainId = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  const revealed = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now() } });
  const claim = await F.claim(h, B, chainId, gref);
  const keys = ['chainId', 'claimId', 'text', 'strokes', 'groupRef', 'promptId', 'customText', 'step', 'reason', 'version', 'kind', 'noFill', 'cursor', 'all', 'op', 'events',
    'groupData', 'wantActivity', 'clientMs', 'undoCount', 'openid', 'stepId', 'reportId', 'days', 'limit', 'n', 'restore', 'state', 'permanent', 'createEnabled', 'viewEnabled', '__proto__'];
  const values = [null, undefined, 0, -1, 1.5, 1e308, NaN, Infinity, 'a', '', 'A'.repeat(5000), '__proto__', 'constructor', {}, [], [[]], { v: 1, s: null }, { v: 1, s: [[0, 0]] },
    { v: 1, s: [[0, 0, 1, 1]] }, true, false, { $gt: 1 }, 'AAAAAAAAAA', 'AAAAAAAAAAAA', 'A01', 'porn', 'draw', 1, 6, 7, chainId, revealed, claim.claimId, gref, F.GROUP_A, A,
    { data: { opengid: 'g' } }, { data: null }, [{ name: 'error' }], [null, 5, 'x'], { op: 'x' }, '测试违规', '加我微信', 'listReports', 'setUgc'];
  const fns = FNS_UNDER_TEST();
  const r = rng(99);
  let calls = 0;
  for (let i = 0; i < 1500; i++) {
    const fn = fns[r(fns.length)];
    let ev;
    const kind = r(10);
    if (kind === 0) ev = values[r(values.length)];
    else {
      ev = {};
      const n = r(6);
      for (let k = 0; k < n; k++) ev[keys[r(keys.length)]] = values[r(values.length)];
    }
    h.advance(r(2) ? 0 : 61000);
    const openid = r(12) === 0 ? undefined : r(2) ? A : B;
    let out;
    try {
      out = await h.call(fn, ev, { openid });
    } catch (e) {
      assert.fail(`${fn} threw ${e && e.stack} for ${JSON.stringify(ev)}`);
    }
    calls += 1;
    const okShape = (out && typeof out === 'object' && typeof out.ok === 'boolean' && (out.ok || typeof out.code === 'string'))
      || out === 'success' || (out && typeof out.statusCode === 'number');
    assert.ok(okShape, `${fn} returned ${JSON.stringify(out)} for ${JSON.stringify(ev)}`);
  }
  assert.ok(calls === 1500);
});

function FNS_UNDER_TEST() {
  // modSweeper/cleanup are timer functions: they are fuzzed with random clients (all FORBIDDEN) too
  return sync.listFunctions().filter((f) => f !== 'modSweeper' || true);
}

test('unauthenticated calls are refused by every client function', async () => {
  for (const fn of sync.listFunctions()) {
    if (['modSweeper', 'cleanup', 'admin', 'onMediaCheck'].includes(fn)) continue;
    const r = await h.call(fn, { chainId: 'AAAAAAAAAA' }, {});
    assert.equal(r.code, 'UNAUTHENTICATED', fn);
  }
});
