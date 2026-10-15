'use strict';
// The backend serves daily rounds from the stored sheet after core.replayPartial (the draft state machine).
// The core's own contract for progressive delivery is validate.roundToken / replayPrefix / extendsPrefix
// (core/README.md). This pins that both agree at every step, so the backend and the client (which uses the
// core directly) cannot drift apart.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHarness, bestActions, CV } = require('./helpers/harness');
const { runId, prefixThroughPick, sheetOf } = require('./helpers/fixtures');

let h;
beforeEach(() => { h = createHarness({ now: Date.UTC(2026, 10, 3, 4, 0, 0) }); });
afterEach(() => h.teardown());

test('getRound hands out exactly the round validate.roundToken gives, for every prefix of a full run', async () => {
  const d = await h.call('getDaily', {}, { openid: 'u' });
  await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: d.dateKey }, { openid: 'u' });
  const seedDoc = h.db.all('daily_seeds').find((s) => s._id === d.dateKey);
  const sheet = sheetOf(h, d.dateKey);
  const core = (m) => require(path.join(h.root, 'getDaily', 'core', m));
  const validate = core('validate.js');
  const actions = bestActions(sheet);
  // round 1: startRun vs roundToken(n = 1, [])
  const t1 = validate.roundToken(seedDoc.seed, seedDoc.contentVersion, 1, [], 'daily', seedDoc.configVersion);
  assert.equal(t1.ok, true);
  assert.deepEqual(t1.round, sheet[0]);
  for (let n = 1; n <= 4; n++) {
    const prefix = prefixThroughPick(actions, n);
    const served = await h.call('getRound', { clientRunId: 'consistency1', dateKey: d.dateKey, actions: prefix }, { openid: 'u' });
    assert.equal(served.ok, true, JSON.stringify(served));
    const tok = validate.roundToken(seedDoc.seed, seedDoc.contentVersion, n + 1, prefix, 'daily', seedDoc.configVersion);
    assert.equal(tok.ok, true, JSON.stringify(tok));
    assert.deepEqual(served.data, tok.round, `round ${n + 1}`);
    assert.equal(served.round, tok.n);
    const rp = validate.replayPrefix(seedDoc.seed, seedDoc.contentVersion, prefix, 'daily', seedDoc.configVersion);
    assert.equal(rp.ok, true);
    assert.equal(rp.picks, n);
  }
});

test('getRound rejects what roundToken rejects (skipped rounds, mid-round prefixes, no picks)', async () => {
  const d = await h.call('getDaily', {}, { openid: 'u' });
  await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: d.dateKey }, { openid: 'u' });
  const seedDoc = h.db.all('daily_seeds').find((s) => s._id === d.dateKey);
  const validate = require(path.join(h.root, 'getDaily', 'core', 'validate.js'));
  const actions = bestActions(sheetOf(h, d.dateKey));
  const cases = [
    // (round 1 comes from startRun with no actions; getRound never serves it)
    [{ round: 1, type: 'flip' }], // flipped, not picked
    prefixThroughPick(actions, 2), // two picks: round 3 is a valid token, but round 2 was never released (stateful rule)
    actions.slice(0, 2), // flip + pick of round 1: valid for round 2
  ];
  for (const prefix of cases) {
    const served = await h.call('getRound', { clientRunId: 'consistency2', dateKey: d.dateKey, actions: prefix }, { openid: 'u' });
    const n = prefix.filter((a) => a.type === 'pick').length;
    const tok = validate.roundToken(seedDoc.seed, seedDoc.contentVersion, n + 1, prefix, 'daily', seedDoc.configVersion);
    if (n === 2 && tok.ok) {
      // valid shape, but the server refuses to skip: round 2 was never released
      assert.equal(served.ok, false);
      assert.equal(served.code, 'INVALID_ACTIONS');
    } else {
      assert.equal(served.ok, tok.ok, `${JSON.stringify(prefix).slice(0, 80)}: ${JSON.stringify(served)} vs ${JSON.stringify(tok)}`);
    }
  }
});

test('progress.isPrefix is the core extendsPrefix', () => {
  const progress = require(path.join(h.root, 'getDaily', 'common', 'progress.js'));
  const validate = require(path.join(h.root, 'getDaily', 'core', 'validate.js'));
  const a = [{ round: 1, type: 'flip' }, { round: 1, type: 'pick', generalId: 'g_liubei', slot: 'zhugong' }];
  const samples = [[], a.slice(0, 1), a, [...a, { round: 2, type: 'flip' }], [{ round: 1, type: 'flip' }, { round: 1, type: 'pick', generalId: 'g_caocao', slot: 'zhugong' }]];
  for (const x of samples) for (const y of samples) assert.equal(progress.isPrefix(x, y), validate.extendsPrefix(x, y));
  void CV;
});
