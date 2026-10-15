'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, dailyScenario, gidNext, DAY } = require('./helpers/harness');

let h;
beforeEach(async () => {
  h = createHarness();
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret');
  await dailyScenario(h);
});
afterEach(() => h.teardown());

const PID = 'd20261103';
const guess = (openid, idx, extra = {}, puzzleId = PID) =>
  h.call('guess', { puzzleId, word: h.words[idx], clientGuessId: gidNext(), ...extra }, { openid });
const create = (openid, puzzleId = PID) => h.call('createChallenge', { puzzleId }, { openid });
const get = (openid, challengeId) => h.call('getChallenge', { challengeId }, { openid });

async function ownerFinishes() {
  await guess('owner', 50);
  await guess('owner', 51);
  await guess('owner', 10);
}

test('createChallenge needs a finished play (NOT_FINISHED) and an unknown puzzle is PUZZLE_NOT_FOUND (AC 69)', async () => {
  assert.equal((await create('owner')).code, 'NOT_FINISHED');
  await guess('owner', 50);
  assert.equal((await create('owner')).code, 'NOT_FINISHED');
  assert.equal((await create('owner', 'd20990101')).code, 'PUZZLE_NOT_FOUND');
  assert.equal(h.db.all('challenges').length, 0);
});

test('one deterministic challenge per owner per puzzle; stores steps, hints and temperatures, never a word (AC 70)', async () => {
  await ownerFinishes();
  const a = await create('owner');
  const b = await create('owner');
  assert.equal(a.ok, true);
  assert.match(a.challengeId, /^[A-Z2-7]{8}$/);
  assert.equal(b.challengeId, a.challengeId);
  assert.equal(h.db.all('challenges').length, 1);
  const doc = h.db.all('challenges')[0];
  assert.equal(doc.steps, 3);
  assert.equal(doc.temps.length, 3);
  assert.equal(doc.status, 'solved');
  const dump = JSON.stringify(doc);
  for (const w of h.words.slice(0, 120)) assert.ok(!dump.includes(w), 'no word stored: ' + w);
  await guess('other', 50);
  await guess('other', 10);
  assert.notEqual((await create('other')).challengeId, a.challengeId);
});

test('createChallenge needs the pepper (SERVER_CONFIG) and the id depends on it', async () => {
  await ownerFinishes();
  const a = await create('owner');
  h.setEnv('GROUP_REF_PEPPER', 'another-test-pepper');
  h.db.cols.challenges.clear();
  const b = await create('owner');
  assert.notEqual(a.challengeId, b.challengeId);
  h.setEnv('GROUP_REF_PEPPER', undefined);
  assert.equal((await create('owner')).code, 'SERVER_CONFIG');
});

test('getChallenge: before finishing a recipient sees the chart and counts, never the sharer\'s words (AC 75, 19)', async () => {
  await ownerFinishes();
  const { challengeId } = await create('owner');
  const r = await get('friend', challengeId);
  assert.equal(r.ok, true);
  assert.equal(r.puzzleId, PID);
  assert.equal(r.kind, 'daily');
  assert.equal(r.own, null);
  assert.equal(r.countsAsToday, true);
  assert.equal(r.alreadyFinished, false);
  assert.deepEqual(r.owner.status, 'solved');
  assert.equal(r.owner.steps, 3);
  assert.equal(r.owner.temps.length, 3);
  assert.ok(!('ownerWords' in r));
  const dump = JSON.stringify(r);
  for (const w of h.words.slice(0, 120)) assert.ok(!dump.includes(w), 'word leaked: ' + w);
  assert.ok(!/openid/i.test(dump) && !dump.includes('friend') && !dump.includes('"owner":"owner"'));
});

test('ownerWords only for a non-owner who has finished that puzzle (AC 19, 75)', async () => {
  await ownerFinishes();
  const { challengeId } = await create('owner');
  await guess('friend', 52); // playing, not finished
  assert.ok(!('ownerWords' in (await get('friend', challengeId))));
  await guess('friend', 10);
  const r = await get('friend', challengeId);
  assert.equal(r.alreadyFinished, true);
  assert.equal(r.countsAsToday, false);
  assert.deepEqual(r.ownerWords, [h.words[50], h.words[51], h.words[10]]);
  // the owner themselves never gets ownerWords, but gets their own stats
  const own = await get('owner', challengeId);
  assert.ok(!('ownerWords' in own));
  assert.deepEqual(own.own, { finishers: 1, bestSteps: 2 }, 'the friend finished (2 steps) and opened the challenge');
});

test('a challenge for a past daily or practice is "往期题": countsAsToday false (AC 74)', async () => {
  await guess('owner', 20, {}, 'p1');
  const { challengeId } = await create('owner', 'p1');
  const r = await get('friend', challengeId);
  assert.equal(r.kind, 'practice');
  assert.equal(r.practiceNo, 1);
  assert.equal(r.countsAsToday, false);
  // a past daily
  await guess('owner', 10);
  const c2 = (await create('owner')).challengeId;
  h.setNow(h.now() + 3 * DAY);
  const r2 = await get('friend', c2);
  assert.equal(r2.kind, 'archive');
  assert.equal(r2.countsAsToday, false);
});

test('finishers and best steps count each non-owner who finished and opened the challenge, once', async () => {
  await ownerFinishes();
  const { challengeId } = await create('owner');
  await guess('f1', 50);
  await guess('f1', 52);
  await guess('f1', 10); // 3 steps
  await guess('f2', 10); // 1 step
  await get('f1', challengeId);
  await get('f1', challengeId); // repeat: not counted twice
  await get('f2', challengeId);
  await guess('f3', 50); // playing: not finished, not counted
  await get('f3', challengeId);
  assert.deepEqual((await get('owner', challengeId)).own, { finishers: 2, bestSteps: 1 });
  assert.equal(h.db.all('challenge_takers').length, 2);
  // the owner opening it never counts
  await get('owner', challengeId);
  assert.deepEqual((await get('owner', challengeId)).own, { finishers: 2, bestSteps: 1 });
});

test('unknown / malformed challenge ids return CHALLENGE_NOT_FOUND', async () => {
  assert.equal((await get('u1', 'AAAAAAAA')).code, 'CHALLENGE_NOT_FOUND');
  assert.equal((await get('u1', 'nope')).code, 'CHALLENGE_NOT_FOUND');
  assert.equal((await get('u1', undefined)).code, 'CHALLENGE_NOT_FOUND');
});

test('opening or finishing via a challenge grants nothing (AC 76)', async () => {
  await ownerFinishes();
  const { challengeId } = await create('owner');
  const before = JSON.stringify(h.db.all('player_stats'));
  await get('friend', challengeId);
  assert.equal(JSON.stringify(h.db.all('player_stats')), before);
  assert.equal(h.db.all('plays').filter((p) => p.openid === 'friend').length, 0);
});
