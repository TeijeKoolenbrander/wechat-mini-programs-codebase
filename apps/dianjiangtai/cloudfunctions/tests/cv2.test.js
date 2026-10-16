'use strict';
// contentVersion 1 AND 2 are both supported (old runs, challenges and seeds stay valid); the daily runs on the
// live version. These tests need a core that holds content 2 (the v1 release core); they skip on the Phase 1 core.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHarness, bestActions, CV, CFG } = require('./helpers/harness');
const { runId, playDaily, startDaily, releaseAll, sheetOf } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const HAS_V2 = CV >= 2;
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret-0123456789abcdef');
});
afterEach(() => h.teardown());

const core = (name) => require(path.join(h.root, 'getDaily', 'core', name));

test('the daily runs on the live content version; lineupFac holds the drafted-cell faction per slot', async () => {
  const r = await playDaily(h, 'u');
  assert.equal(r.ok, true, JSON.stringify(r));
  const seed = h.db.all('daily_seeds')[0];
  assert.equal(seed.contentVersion, CV);
  assert.equal(seed.configVersion, CFG);
  const res = h.db.all('daily_results')[0];
  assert.equal(res.contentVersion, CV);
  assert.equal(res.lineupFac.length, 5);
  assert.ok(res.lineupFac.every((f) => typeof f === 'string' && f.length > 0));
  const run = h.db.all('runs')[0];
  if (HAS_V2) assert.deepEqual(res.lineupFac, run.lineup.map((l) => l.faction), 'from the core lineup');
  const hist = await h.call('getHistory', {}, { openid: 'u' });
  assert.deepEqual(hist.items[0].mine.lineupFac, res.lineupFac);
});

test('getRound hands out each sheet round whole (pools included for content 2), never earlier', async () => {
  const s = await startDaily(h, 'u', { release: false });
  const sheet = sheetOf(h, s.dateKey);
  if (HAS_V2) assert.ok(sheet.some((r) => r.pools !== undefined), 'the v2 sheet carries pool orders');
  const { prefixThroughPick } = require('./helpers/fixtures');
  for (let n = 1; n <= 4; n++) {
    const r = await h.call('getRound', { clientRunId: runId(), dateKey: s.dateKey, actions: prefixThroughPick(s.actions, n) }, { openid: 'u' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.data, sheet[n]);
  }
});

test('daily spoiler lock holds on the live content version (getReplay, challenge compare, history best)', async () => {
  await playDaily(h, 'owner');
  const c = await h.call('createChallenge', { runId: h.db.all('runs')[0].clientRunId }, { openid: 'owner' });
  const acts = bestActions(h.db.all('challenges')[0].rounds, { rank: 2 });
  const id = runId();
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: id, challengeId: c.challengeId, actions: acts }, { openid: 'peek' });
  assert.equal(res.ranked, false);
  assert.equal(res.challengeCompare.theirLineup, null);
  assert.equal(res.challengeCompare.lineupLocked, true);
  assert.equal((await h.call('getReplay', { runId: id }, { openid: 'peek' })).code, 'REPLAY_LOCKED');
  const hist = await h.call('getHistory', {}, { openid: 'peek' });
  assert.equal(hist.items[0].best, undefined);
  assert.equal(hist.items[0].mine, undefined);
  // the sharer's lineup, the optimum and the seed appear in none of those responses
  const secret = h.db.all('daily_seeds')[0];
  const text = JSON.stringify([res, hist]);
  for (const l of secret.best.lineup) assert.equal(text.includes(l.generalId), false, l.generalId);
  assert.equal(/"seed"/.test(text), false);
  // after the caller's own ranked daily the lock opens
  await playDaily(h, 'peek', { rank: 3 });
  assert.equal((await h.call('getReplay', { runId: id }, { openid: 'peek' })).ok, true);
});

test('contentVersion 1 stays valid: a free run and a challenge on it validate under content 1 / config 1', { skip: !HAS_V2 }, async () => {
  const seed = 2468;
  const sheet = core('sheet.js').buildSheet(seed, 1);
  const acts = bestActions(sheet, { mode: 'free', contentVersion: 1 });
  const id = runId();
  const r = await h.call('submitRun', { mode: 'free', clientRunId: id, seed, contentVersion: 1, actions: acts }, { openid: 'owner' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const run = h.db.all('runs')[0];
  assert.equal(run.contentVersion, 1);
  assert.equal(run.configVersion, 1, 'content 1 pairs with config 1');
  // without contentVersion the same actions are judged under the live content and are not valid there
  const wrong = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, actions: acts }, { openid: 'owner' });
  assert.equal(wrong.code, 'INVALID_ACTIONS');
  // a challenge made from it stays answerable under its pinned versions
  const c = await h.call('createChallenge', { runId: id }, { openid: 'owner' });
  assert.equal(c.ok, true);
  const view = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'friend' });
  assert.equal(view.rounds.length, 5);
  const ans = await h.call('submitRun', {
    mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: bestActions(view.rounds, { rank: 1, mode: 'challenge', contentVersion: 1 }),
  }, { openid: 'friend' });
  assert.equal(ans.ok, true, JSON.stringify(ans));
  assert.equal(h.db.all('runs').find((x) => x.openid === 'friend').contentVersion, 1);
});

test('an old-version daily seed (contentVersion 1 document) still progresses and submits under its own version', { skip: !HAS_V2 }, async () => {
  // an issue published before the content bump: keep it playable until it ends
  const seed = 1231;
  const rounds = core('sheet.js').buildSheet(seed, 1);
  h.db.put('daily_seeds', {
    _id: '20261103', seed, issueNo: 1, variant: 'standard', contentVersion: 1, configVersion: 1, rounds,
    best: { lineup: [], record: { w: 12, l: 0 } }, boardSalt: 'salt', source: 'bank', createdAt: 1,
  });
  const g = await h.call('getDaily', {}, { openid: 'u' });
  assert.equal(g.dateKey, '20261103');
  await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: g.dateKey }, { openid: 'u' });
  const acts = bestActions(rounds, { contentVersion: 1 });
  await releaseAll(h, 'u', g.dateKey, acts);
  const r = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: g.dateKey, actions: acts }, { openid: 'u' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(h.db.all('daily_results')[0].contentVersion, 1);
});
