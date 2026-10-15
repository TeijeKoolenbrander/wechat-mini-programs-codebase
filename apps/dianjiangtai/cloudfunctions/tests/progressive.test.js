'use strict';
// v1 progressive daily delivery (spec 5.2, AC 86, 88): getRound / startRun / submitRun prefix rules.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, bestActions, CV } = require('./helpers/harness');
const { runId, prefixThroughPick, sheetOf, releaseAll, allStrings, allKeys } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT (Tuesday)
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const D = '20261103';
async function start(openid = 'u', rank = 0) {
  const g = await h.call('getDaily', {}, { openid });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: g.dateKey }, { openid });
  const sheet = sheetOf(h, g.dateKey);
  return { g, st, sheet, actions: bestActions(sheet, { rank }) };
}
const getRound = (openid, actions, extra = {}) => h.call('getRound', { clientRunId: 'round0000001', dateKey: D, actions, ...extra }, { openid });
const flags = (kind) => h.db.all('anomalies').filter((a) => a.kind === kind);

test('startRun returns round 1 only; daily_progress is created with released 1', async () => {
  const { st, sheet } = await start();
  assert.equal(st.ok, true);
  assert.deepEqual(st.rounds, [sheet[0]]);
  assert.equal(st.released, 1);
  const p = h.db.all('daily_progress');
  assert.equal(p.length, 1);
  assert.equal(p[0]._id, `${D}_u`);
  assert.equal(p[0].released, 1);
  assert.deepEqual(p[0].actions, []);
});

test('getRound walks rounds 2..5 in order, each only after the previous pick is recorded', async () => {
  const { sheet, actions } = await start();
  for (let n = 1; n <= 4; n++) {
    const r = await getRound('u', prefixThroughPick(actions, n));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.round, n + 1);
    assert.deepEqual(r.data, sheet[n]);
    assert.equal(r.released, n + 1);
    assert.equal(h.db.all('daily_progress')[0].released, n + 1);
  }
  assert.deepEqual(h.db.all('daily_progress')[0].actions, prefixThroughPick(actions, 4));
});

test('rounds cannot be fetched out of order or ahead: skipping, a short prefix, no startRun', async () => {
  const { actions } = await start();
  // round 3 needs 2 recorded picks; releasing round 2 first is mandatory
  const skip = await getRound('u', prefixThroughPick(actions, 2));
  assert.equal(skip.ok, false);
  assert.equal(skip.code, 'INVALID_ACTIONS');
  assert.equal(skip.data, undefined);
  assert.equal(h.db.all('daily_progress')[0].released, 1, 'nothing was released');
  // zero picks / the final pick (n = 5 would release a non-existent round 6)
  assert.equal((await getRound('u', [{ round: 1, type: 'flip' }])).code, 'INVALID_ACTIONS');
  await releaseAll(h, 'u', D, actions);
  assert.equal((await getRound('u', actions)).code, 'INVALID_ACTIONS');
  // a different user who never called startRun has nothing
  assert.equal((await getRound('stranger', prefixThroughPick(actions, 1))).code, 'NOT_STARTED');
  // malformed input
  assert.equal((await getRound('u', [])).code, 'INVALID_ACTIONS');
  assert.equal((await getRound('u', prefixThroughPick(actions, 1), { dateKey: 'bad' })).code, 'INVALID_ACTIONS');
  assert.equal((await getRound('u', prefixThroughPick(actions, 1), { dateKey: '20261104' })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('getRound', { clientRunId: 'round0000001', dateKey: D, actions }, {})).code, 'UNAUTHENTICATED');
});

test('invalid partial runs are rejected: bad pick, duplicate general, ad re-spin, re-spin after pick', async () => {
  const { actions } = await start();
  const p1 = prefixThroughPick(actions, 1);
  const bad = JSON.parse(JSON.stringify(p1));
  bad[bad.length - 1].generalId = 'g_not_in_the_pool';
  assert.equal((await getRound('u', bad)).code, 'INVALID_ACTIONS');
  const ad = [p1[0], { round: 1, type: 'respinFaction', source: 'ad' }, ...p1.slice(1)];
  assert.equal((await getRound('u', ad)).code, 'INVALID_ACTIONS');
  const after = [...p1, { round: 1, type: 'respinEra' }];
  assert.equal((await getRound('u', after)).code, 'INVALID_ACTIONS');
  assert.equal(h.db.all('daily_progress')[0].released, 1);
});

test('getRound is idempotent and resumable: same prefix -> same round; a stale shorter prefix gets an already released round', async () => {
  const { sheet, actions } = await start();
  const a = await getRound('u', prefixThroughPick(actions, 1));
  const b = await getRound('u', prefixThroughPick(actions, 1));
  assert.deepEqual(a, b);
  await getRound('u', prefixThroughPick(actions, 2));
  const stale = await getRound('u', prefixThroughPick(actions, 1));
  assert.equal(stale.ok, true);
  assert.deepEqual(stale.data, sheet[1]);
  assert.equal(h.db.all('daily_progress')[0].released, 3, 'a stale call never moves released backwards');
  // reinstall / second device: startRun returns every released round and the frozen actions
  const again = await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: D }, { openid: 'u' });
  assert.equal(again.resumed, true);
  assert.deepEqual(again.rounds, sheet.slice(0, 3));
  assert.deepEqual(again.actions, prefixThroughPick(actions, 2));
  assert.equal(h.db.all('daily_progress').length, 1);
});

test('a diverging prefix is rejected and flagged: the picks of released rounds are frozen', async () => {
  const { actions } = await start();
  await getRound('u', prefixThroughPick(actions, 1));
  // pick a different general in round 1 (same cell, rank 1), then try to move on
  const other = bestActions(sheetOf(h, D), { rank: 1 });
  const r = await getRound('u', prefixThroughPick(other, 1));
  assert.equal(r.code, 'INVALID_ACTIONS');
  assert.equal(flags('prefix').length, 1);
  assert.equal(flags('prefix')[0]._id, 'u_round0000001_prefix');
  assert.deepEqual(h.db.all('daily_progress')[0].actions, prefixThroughPick(actions, 1), 'prefix unchanged');
  // repeating the same bad call does not multiply the flag (deterministic _id)
  await getRound('u', prefixThroughPick(other, 1));
  assert.equal(flags('prefix').length, 1);
});

test('no response carries a round beyond what was released, the seed, or the optimum (captured payload test)', async () => {
  const seen = [];
  const g = await h.call('getDaily', {}, { openid: 'u' });
  seen.push(g);
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: D }, { openid: 'u' });
  seen.push(st);
  const sheet = sheetOf(h, D);
  const seedDoc = h.db.all('daily_seeds')[0];
  const actions = bestActions(sheet);
  let maxReleased = 1;
  for (let n = 1; n <= 4; n++) {
    // before round n+1 is released, round n+1's distinguishing data must not have appeared anywhere
    const text = JSON.stringify(seen);
    for (let k = maxReleased; k < 5; k++) {
      assert.equal(text.includes(JSON.stringify(sheet[k])), false, `round ${k + 1} leaked before release`);
    }
    const r = await getRound('u', prefixThroughPick(actions, n));
    seen.push(r);
    maxReleased = r.released;
  }
  const all = JSON.stringify(seen);
  assert.equal(all.includes(String(seedDoc.seed)) && /"seed"/.test(all), false);
  assert.doesNotMatch(all, /"seed"|boardSalt|"best":\{|"lineup"/);
  assert.doesNotMatch(allKeys(seen).join(','), /openid/i);
  assert.equal(allStrings(seen).includes('u'), false);
});

test('submitRun requires released == 5 and an exact prefix; otherwise INVALID_ACTIONS + prefix + invalid_ranked anomalies, nothing stored', async () => {
  const { actions } = await start();
  const submit = (acts, id = runId()) => h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: D, actions: acts }, { openid: 'u' });
  // released == 1: the client somehow knows all actions (it replayed from a leaked sheet)
  const early = await submit(actions, 'earlyRun0001');
  assert.equal(early.code, 'INVALID_ACTIONS');
  assert.equal(flags('prefix').length, 1);
  assert.equal(flags('invalid_ranked').length, 1);
  assert.equal(h.db.all('daily_results').length, 0);
  assert.equal((h.db.all('daily_stats')[0] || { total: 0 }).total, 0);
  await releaseAll(h, 'u', D, actions);
  // diverges from the frozen prefix
  const other = bestActions(sheetOf(h, D), { rank: 3 });
  const div = await submit(other, 'divergeRun01');
  assert.equal(div.code, 'INVALID_ACTIONS');
  assert.equal(h.db.all('daily_results').length, 0);
  // the exact prefix works
  const ok = await submit(actions, 'goodRun00001');
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.ranked, true);
});

test('an invalid but prefix-consistent ranked submit writes only an invalid_ranked flag', async () => {
  const { actions } = await start();
  await releaseAll(h, 'u', D, actions);
  const r = await h.call('submitRun', { mode: 'daily', clientRunId: 'extraRun0001', dateKey: D, actions: [...actions, { round: 5, type: 'undo' }, { round: 5, type: 'undo' }] }, { openid: 'u' });
  assert.equal(r.code, 'INVALID_ACTIONS');
  assert.equal(flags('invalid_ranked').length, 1);
  assert.equal(flags('prefix').length, 0);
});

test('free play, friendly challenges and past-seed challenges still get the full sheet up front', async () => {
  await start('owner');
  const core = require(require('path').join(h.root, 'getDaily', 'core', 'sheet.js'));
  const seed = 4242;
  const id = runId();
  await h.call('submitRun', { mode: 'free', clientRunId: id, seed, actions: bestActions(core.buildSheet(seed, CV), { mode: 'free' }) }, { openid: 'owner' });
  h.setEnv('GROUP_REF_PEPPER', 'pepper-for-tests');
  const c = await h.call('createChallenge', { runId: id }, { openid: 'owner' });
  const v = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'friend' });
  assert.equal(v.rounds.length, 5);
  assert.equal(v.variant, 'standard');
  assert.equal(v.subscribe, undefined);
});

test('a challenge that counts as the daily goes through startRun/getRound (progress mode challenge)', async () => {
  const g = await h.call('getDaily', {}, { openid: 'owner' });
  const sheet = sheetOf(h, g.dateKey);
  const acts = bestActions(sheet);
  await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: g.dateKey }, { openid: 'owner' });
  await releaseAll(h, 'owner', g.dateKey, acts);
  const id = runId();
  await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: g.dateKey, actions: acts }, { openid: 'owner' });
  h.setEnv('GROUP_REF_PEPPER', 'pepper-for-tests');
  const c = await h.call('createChallenge', { runId: id }, { openid: 'owner' });
  const view = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'friend' });
  assert.equal(view.countsAsDaily, true);
  assert.equal(view.rounds, undefined);
  const st = await h.call('startRun', { mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId }, { openid: 'friend' });
  assert.deepEqual(st.rounds, [sheet[0]]);
  assert.equal(h.db.all('daily_progress').find((p) => p.openid === 'friend').mode, 'challenge');
  const a2 = bestActions(sheet, { rank: 2 });
  await releaseAll(h, 'friend', g.dateKey, a2);
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: a2 }, { openid: 'friend' });
  assert.equal(res.ranked, true);
});
