'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHarness, bestActions, CV } = require('./helpers/harness');
const { runId, playDaily, releaseAll } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret');
});
afterEach(() => h.teardown());

const sheet = (seed) => require(path.join(h.root, 'getDaily', 'core', 'sheet.js')).buildSheet(seed, CV);

/** owner plays a free run on `seed` and creates a challenge from it */
async function freeChallenge(owner, seed = 777) {
  const id = runId();
  const a = bestActions(sheet(seed));
  const run = await h.call('submitRun', { mode: 'free', clientRunId: id, seed, actions: a }, { openid: owner });
  assert.equal(run.ok, true);
  const c = await h.call('createChallenge', { runId: id }, { openid: owner });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { challengeId: c.challengeId, runId: id, actions: a, seed, record: run.record };
}

test('createChallenge: only for the caller\'s own validated run, one challenge per run (idempotent)', async () => {
  const c = await freeChallenge('owner');
  assert.match(c.challengeId, /^[A-Z2-7]{8}$/);
  const again = await h.call('createChallenge', { runId: c.runId }, { openid: 'owner' });
  assert.equal(again.challengeId, c.challengeId);
  assert.equal(h.db.all('challenges').length, 1);
  const doc = h.db.all('challenges')[0];
  assert.equal(doc.ownerOpenid, 'owner');
  assert.deepEqual(doc.record, c.record);
  assert.equal(doc.expiresAt - doc.createdAt, 7 * 86400000);
  assert.equal(doc.mode, 'free');
  // somebody else's run id resolves to nothing for another caller (id is derived from the context openid)
  assert.equal((await h.call('createChallenge', { runId: c.runId }, { openid: 'thief' })).code, 'RUN_NOT_FOUND');
  assert.equal((await h.call('createChallenge', { runId: 'neverplayed1' }, { openid: 'owner' })).code, 'RUN_NOT_FOUND');
  assert.equal((await h.call('createChallenge', { runId: c.runId }, {})).code, 'UNAUTHENTICATED');
});

test('createChallenge needs GROUP_REF_PEPPER from the environment', async () => {
  h.setEnv('GROUP_REF_PEPPER', undefined);
  const id = runId();
  await h.call('submitRun', { mode: 'free', clientRunId: id, seed: 5, actions: bestActions(sheet(5)) }, { openid: 'owner' });
  const r = await h.call('createChallenge', { runId: id }, { openid: 'owner' });
  assert.equal(r.code, 'SERVER_CONFIG');
  assert.equal(h.db.all('challenges').length, 0);
});

test('challenge lineup is withheld until the recipient has answered (AC 32)', async () => {
  const c = await freeChallenge('owner');
  const ownerLineup = h.db.all('challenges')[0].lineup.map((l) => l.generalId);

  const before = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'friend' });
  assert.equal(before.ok, true);
  assert.equal(before.status, 'ready');
  assert.deepEqual(before.theirRecord, c.record);
  assert.equal(before.rounds.length, 5);
  assert.equal(before.countsAsDaily, false);
  assert.equal(before.isFriendly, true);
  const json = JSON.stringify(before);
  assert.doesNotMatch(json, /theirLineup|"lineup"|"seed"|owner/);
  for (const g of ownerLineup) assert.equal(json.includes(g), false, 'no general of the sharer leaked: ' + g);

  // answering: the recipient plays the same sheet
  const ans = await h.call('submitRun', {
    mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: bestActions(before.rounds, { rank: 1 }),
  }, { openid: 'friend' });
  assert.equal(ans.ok, true, JSON.stringify(ans));
  assert.equal(ans.ranked, false);
  assert.deepEqual(ans.challengeCompare.theirRecord, c.record);
  assert.equal(ans.challengeCompare.theirLineup.length, 5);

  const after = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'friend' });
  assert.equal(after.status, 'answered');
  assert.deepEqual(after.theirLineup.map((l) => l.generalId), ownerLineup);

  // a third user still does not see it
  const third = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'third' });
  assert.equal(third.status, 'ready');
  assert.equal(third.theirLineup, undefined);

  const ch = h.db.all('challenges')[0];
  assert.equal(ch.answerCount, 1);
  // answering again does not inflate the count
  await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: bestActions(before.rounds, { rank: 2 }) }, { openid: 'friend' });
  assert.equal(h.db.all('challenges')[0].answerCount, 1);
});

test('own challenge: own state, cannot answer it, no recipient data leak of other people', async () => {
  const c = await freeChallenge('owner');
  const own = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'owner' });
  assert.equal(own.status, 'own');
  assert.equal(own.answerCount, 0);
  const r = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: c.actions }, { openid: 'owner' });
  assert.equal(r.code, 'OWN_CHALLENGE');
});

test('expired (> 7 days), missing and malformed challenges (AC 34)', async () => {
  const c = await freeChallenge('owner');
  h.setNow(T0 + 7 * 86400000 + 1000);
  const ex = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'friend' });
  assert.equal(ex.ok, false);
  assert.equal(ex.code, 'CHALLENGE_EXPIRED');
  assert.equal(ex.status, 'expired');
  assert.equal((await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: c.actions }, { openid: 'friend' })).code, 'CHALLENGE_EXPIRED');
  assert.equal((await h.call('getChallenge', { challengeId: 'AAAAAAAA' }, { openid: 'friend' })).code, 'CHALLENGE_EXPIRED');
  assert.equal((await h.call('getChallenge', { challengeId: 'a-b' }, { openid: 'friend' })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('getChallenge', { challengeId: c.challengeId }, {})).code, 'UNAUTHENTICATED');
});

test('challenge answers are validated like any run (INVALID_ACTIONS, ad re-spin rejected)', async () => {
  const c = await freeChallenge('owner');
  const rounds = h.db.all('challenges')[0].rounds;
  const a = bestActions(rounds);
  a.splice(1, 0, { round: 1, type: 'respinFaction', source: 'ad' });
  const r = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: a }, { openid: 'friend' });
  assert.equal(r.code, 'INVALID_ACTIONS');
  assert.equal(h.db.all('challenges')[0].answerCount, 0);
});

// ---------- counting rule (spec 9.3 step 5, AC 33) ----------
async function dailyChallenge() {
  const owner = await playDaily(h, 'owner');
  const runIdOwner = h.db.all('runs')[0].clientRunId;
  const c = await h.call('createChallenge', { runId: runIdOwner }, { openid: 'owner' });
  assert.equal(c.ok, true);
  assert.equal(h.db.all('challenges')[0].mode, 'daily');
  return { challengeId: c.challengeId, owner };
}

test('challenge on today\'s daily seed, recipient has not played: it IS their daily and is ranked', async () => {
  const { challengeId } = await dailyChallenge();
  const view = await h.call('getChallenge', { challengeId }, { openid: 'friend' });
  assert.equal(view.countsAsDaily, true);
  assert.equal(view.isFriendly, false);
  const st = await h.call('startRun', { mode: 'challenge', clientRunId: runId(), challengeId }, { openid: 'friend' });
  assert.deepEqual([st.ok, st.countsAsDaily], [true, true]);
  assert.equal(h.db.all('daily_starts').filter((s) => s.openid === 'friend').length, 1);
  // progressive delivery: a challenge that counts as the daily carries no rounds; startRun gave round 1 only
  assert.equal(view.rounds, undefined);
  assert.equal(st.rounds.length, 1);
  const rounds = h.db.all('challenges')[0].rounds;
  const acts = bestActions(rounds, { rank: 1 });
  await releaseAll(h, 'friend', h.db.all('challenges')[0].dateKey, acts);
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: acts }, { openid: 'friend' });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.ranked, true);
  assert.equal(h.db.all('daily_results').filter((r) => r.openid === 'friend').length, 1);
  assert.equal(h.db.all('daily_stats')[0].total, 2);
  // the daily is now done: playing another daily ranked run is ALREADY_PLAYED
  const g = await h.call('getDaily', {}, { openid: 'friend' });
  assert.equal(g.myStatus, 'done');
});

test('daily-seed challenge when the recipient already played: friendly, not ranked, no extra result', async () => {
  const { challengeId } = await dailyChallenge();
  await playDaily(h, 'friend', { rank: 4 });
  const view = await h.call('getChallenge', { challengeId }, { openid: 'friend' });
  assert.equal(view.countsAsDaily, false);
  assert.equal(view.isFriendly, true);
  const st = await h.call('startRun', { mode: 'challenge', clientRunId: runId(), challengeId }, { openid: 'friend' });
  assert.equal(st.countsAsDaily, false);
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: bestActions(view.rounds, { rank: 5 }) }, { openid: 'friend' });
  assert.equal(res.ok, true);
  assert.equal(res.ranked, false);
  assert.equal(h.db.all('daily_results').filter((r) => r.openid === 'friend').length, 1);
  assert.equal(h.db.all('daily_stats')[0].total, 2);
});

test('daily-seed challenge from a past date is a friendly match, never ranked', async () => {
  const { challengeId } = await dailyChallenge();
  h.setNow(T0 + 2 * 86400000); // two days later: outside the grace window
  const view = await h.call('getChallenge', { challengeId }, { openid: 'friend' });
  assert.equal(view.countsAsDaily, false);
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: bestActions(view.rounds) }, { openid: 'friend' });
  assert.equal(res.ok, true);
  assert.equal(res.ranked, false);
  assert.equal(h.db.all('daily_results').filter((r) => r.openid === 'friend').length, 0);
});

test('a challenge answer without startRun on the daily seed is friendly (cannot preview-then-rank)', async () => {
  const { challengeId } = await dailyChallenge();
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: bestActions(h.db.all('challenges')[0].rounds) }, { openid: 'friend' });
  assert.equal(res.ranked, false);
  assert.equal(h.db.all('daily_results').filter((r) => r.openid === 'friend').length, 0);
});
