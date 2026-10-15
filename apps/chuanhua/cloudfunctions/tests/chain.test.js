'use strict';
// Chain shape, claims, caps, locks, lifecycle (AC 1-20).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');
const F = require('./helpers/flow');

let h;
const [A, B, C, D] = F.PEOPLE;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

test('two accounts alternating (1/3/5 and 2/4/6) complete a chain; reveal shows all 6 (AC 6, 15)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const chainId = await F.startAndPassFirst(h, A, gref);
  const sub = [];
  for (const who of [B, A, B, A, B]) sub.push((await F.play(h, who, chainId, gref)).submit);
  assert.equal(sub[4].revealed, true, 'the last 棒 (text) reveals in the same call');
  assert.equal(sub[4].state, 'passed');
  const chain = h.db.get('chains', chainId);
  assert.equal(chain.state, 'revealed');
  assert.equal(chain.revealReason, 'complete');
  assert.equal(chain.passed, 6);
  const rv = await h.call('getReveal', { chainId }, { openid: A });
  assert.equal(rv.ok, true);
  assert.equal(rv.steps.length, 6);
  assert.deepEqual(rv.steps.map((s) => s.kind), ['draw', 'describe', 'draw', 'describe', 'draw', 'describe']);
  assert.ok(rv.steps[0].strokes && rv.steps[1].text);
  assert.equal(rv.steps[0].mine, true);
  assert.equal(rv.steps[1].mine, false);
});
