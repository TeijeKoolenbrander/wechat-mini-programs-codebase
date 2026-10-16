'use strict';
// Daily spoiler lock: neither the stored optimum nor another player's lineup on a still-playable daily seed
// may reach a caller who has not yet got their ranked daily result for that date.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, bestActions, CV } = require('./helpers/harness');
const { runId, playDaily, releaseAll, sheetOf } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret-0123456789abcdef');
});
afterEach(() => h.teardown());

async function friendlyDailyRun(openid, challengeId, id) {
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: id, challengeId, actions: bestActions(h.db.all('challenges')[0].rounds) }, { openid });
  assert.equal(res.ranked, false, 'no startRun -> friendly');
  return res;
}
async function dailyChallenge() {
  await playDaily(h, 'owner');
  const c = await h.call('createChallenge', { runId: h.db.all('runs')[0].clientRunId }, { openid: 'owner' });
  return c.challengeId;
}

test('getReplay on a friendly run of today\'s daily seed is locked until the caller has a ranked daily', async () => {
  const challengeId = await dailyChallenge();
  const id = runId();
  await friendlyDailyRun('cheat', challengeId, id);
  const locked = await h.call('getReplay', { runId: id }, { openid: 'cheat' });
  assert.equal(locked.ok, false);
  assert.equal(locked.code, 'REPLAY_LOCKED');
  assert.equal(locked.best, undefined);
  // after the caller's ranked daily exists the replay opens
  await playDaily(h, 'cheat', { rank: 3 });
  const open = await h.call('getReplay', { runId: id }, { openid: 'cheat' });
  assert.equal(open.ok, true);
  assert.equal(open.best.lineup.length, 5);
});

test('getReplay is open once the date is over (after the D+1 00:30 grace) even without a ranked daily', async () => {
  const challengeId = await dailyChallenge();
  const id = runId();
  await friendlyDailyRun('late', challengeId, id);
  h.setNow(Date.UTC(2026, 10, 3, 16, 29, 59)); // 00:29:59 BJT, still in grace
  assert.equal((await h.call('getReplay', { runId: id }, { openid: 'late' })).code, 'REPLAY_LOCKED');
  h.setNow(Date.UTC(2026, 10, 3, 16, 30, 0)); // 00:30:00 BJT
  assert.equal((await h.call('getReplay', { runId: id }, { openid: 'late' })).ok, true);
});

test('a free run whose seed equals a daily seed is locked too (seed match, not just dateKey)', async () => {
  const d = { rounds: sheetOf(h, (await h.call('getDaily', {}, { openid: 'sneak' })).dateKey) };
  const seed = h.db.all('daily_seeds')[0].seed;
  const id = runId();
  const res = await h.call('submitRun', { mode: 'free', clientRunId: id, seed, actions: bestActions(d.rounds, { mode: 'free' }) }, { openid: 'sneak' });
  assert.equal(res.ok, true);
  assert.equal((await h.call('getReplay', { runId: id }, { openid: 'sneak' })).code, 'REPLAY_LOCKED');
});

test('an ordinary free run is not locked', async () => {
  const core = require(require('path').join(h.root, 'getDaily', 'core', 'sheet.js'));
  const seed = 31337;
  const id = runId();
  await h.call('submitRun', { mode: 'free', clientRunId: id, seed, actions: bestActions(core.buildSheet(seed, CV), { mode: 'free' }) }, { openid: 'u' });
  assert.equal((await h.call('getReplay', { runId: id }, { openid: 'u' })).ok, true);
});

test('challenge compare on a playable daily seed withholds the sharer\'s lineup (submitRun and getChallenge)', async () => {
  const challengeId = await dailyChallenge();
  const ownerLineup = h.db.all('challenges')[0].lineup.map((l) => l.generalId);
  const id = runId();
  const res = await friendlyDailyRun('peek', challengeId, id);
  assert.equal(res.challengeCompare.theirLineup, null);
  assert.equal(res.challengeCompare.lineupLocked, true);
  assert.deepEqual(res.challengeCompare.theirRecord, h.db.all('challenges')[0].record);
  const view = await h.call('getChallenge', { challengeId }, { openid: 'peek' });
  assert.equal(view.status, 'answered');
  assert.equal(view.theirLineup, null);
  for (const g of ownerLineup) assert.equal(JSON.stringify([res.challengeCompare, view]).includes(g), false, g);
  // once the caller has a ranked daily, the lineup is revealed
  await playDaily(h, 'peek', { rank: 2 });
  const after = await h.call('getChallenge', { challengeId }, { openid: 'peek' });
  assert.deepEqual(after.theirLineup.map((l) => l.generalId), ownerLineup);
  assert.equal(after.lineupLocked, false);
});

test('ranked challenge answer (daily started) reveals the sharer\'s lineup right away: the caller\'s daily is now done', async () => {
  const challengeId = await dailyChallenge();
  await h.call('startRun', { mode: 'challenge', clientRunId: runId(), challengeId }, { openid: 'friend' });
  const acts = bestActions(h.db.all('challenges')[0].rounds, { rank: 2 });
  await releaseAll(h, 'friend', h.db.all('challenges')[0].dateKey, acts);
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: acts }, { openid: 'friend' });
  assert.equal(res.ranked, true);
  assert.equal(res.challengeCompare.lineupLocked, false);
  assert.equal(res.challengeCompare.theirLineup.length, 5);
});
