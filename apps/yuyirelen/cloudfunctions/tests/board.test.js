'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createHarness, dailyScenario, gidNext, DAY } = require('./helpers/harness');

let h;
let sc;
const PEPPER = 'test-pepper-not-a-secret';
beforeEach(async () => {
  h = createHarness();
  h.setEnv('GROUP_REF_PEPPER', PEPPER);
  sc = await dailyScenario(h);
});
afterEach(() => h.teardown());

const PID = 'd20261103';
const guess = (openid, idx, puzzleId = PID) => h.call('guess', { puzzleId, word: h.words[idx], clientGuessId: gidNext() }, { openid });
const board = (openid, ev = {}) => h.call('getBoard', { kind: 'friend', dateKey: '20261103', ...ev }, { openid });
const hashOf = (openid) => crypto.createHash('sha256').update(`${openid}|${h.db.all('daily_puzzles')[0].boardSalt}`).digest('hex').slice(0, 12);

/** n filler guesses that do not solve and do not touch the 40/min limit across players */
async function fill(openid, n, from = 50) {
  for (let i = 0; i < n; i++) await guess(openid, from + i);
}

test('rows contain hashed ids only: no openid, no word, no answer (AC 81)', async () => {
  await fill('alice', 2);
  await guess('alice', 10);
  const r = await board('alice');
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'full');
  assert.equal(r.selfHash, hashOf('alice'));
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0][0], hashOf('alice'));
  assert.match(r.rows[0][0], /^[0-9a-f]{12}$/);
  const dump = JSON.stringify(r);
  assert.ok(!dump.includes('alice'));
  for (const w of h.words.slice(0, 120)) assert.ok(!dump.includes(w));
  assert.ok(!/answerRef|ranks/.test(dump));
  assert.equal(r.salt, h.db.all('daily_puzzles')[0].boardSalt);
  assert.equal(r.dateKey, '20261103');
});

test('row format [h, st, n, hi, b, s, k?] and ordering: solved by steps, hints, finish time; then playing; then gave up (AC 79, 80)', async () => {
  await fill('slow', 5); await guess('slow', 10); // 6 steps
  await guess('fast', 10); // 1 step
  await fill('mid', 3, 60); await guess('mid', 10); // 4 steps
  await fill('racer', 3, 70); // playing
  await fill('quitter', 2, 80);
  await h.call('giveUp', { puzzleId: PID }, { openid: 'quitter' });
  const r = await board('slow');
  const names = { [hashOf('slow')]: 'slow', [hashOf('fast')]: 'fast', [hashOf('mid')]: 'mid', [hashOf('racer')]: 'racer', [hashOf('quitter')]: 'quitter' };
  assert.deepEqual(r.rows.map((x) => names[x[0]]), ['fast', 'mid', 'slow', 'racer', 'quitter']);
  assert.deepEqual(r.rows.map((x) => x[1]), [1, 1, 1, 2, 3]);
  const fast = r.rows[0];
  assert.deepEqual([fast[2], fast[3], fast[4]], [1, 0, 1]);
  const racer = r.rows[3];
  assert.equal(racer[2], 3, 'steps while playing');
  assert.equal(racer[4], Math.min(...[70, 71, 72].map((i) => sc.answer.ranks[i])), 'best rank so far, no words');
  assert.ok(r.rows.every((x) => x[5] >= 12 * 3600 && x[5] < 86400), 'seconds after 00:00 BJT');
});

test('ties on steps break by hints, then finish time', async () => {
  for (const [who, order] of [['a', 0], ['b', 1]]) {
    await fill(who, 1, 50 + order * 5);
    h.advance(5e3);
    await guess(who, 10); // both: 2 steps
  }
  const r = await board('a');
  const names = { [hashOf('a')]: 'a', [hashOf('b')]: 'b' };
  assert.deepEqual(r.rows.map((x) => names[x[0]]), ['a', 'b'], 'earlier finisher first');
});

test('streak k appears for solved rows with a streak >= 2', async () => {
  h.db.put('player_stats', { _id: 'streaker', curStreak: 4, bestStreak: 4, lastSolvedDate: '20261102' });
  h.db.put('daily_puzzles', { ...h.db.all('daily_puzzles')[0], _id: '20261102' });
  await guess('streaker', 10);
  await guess('newbie', 10);
  const r = await board('newbie');
  const byHash = Object.fromEntries(r.rows.map((x) => [x[0], x]));
  assert.equal(byHash[hashOf('streaker')][6], 5);
  assert.equal(byHash[hashOf('newbie')].length, 6);
});

test('unranked plays never appear (late or archive plays) (AC 64)', async () => {
  await guess('inwindow', 10);
  h.setNow(Date.UTC(2026, 10, 3, 17, 0, 0)); // 01:00 BJT on 1104: window closed, board still allows yesterday
  await guess('late', 10);
  const r = await board('late');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0][0], hashOf('inwindow'));
});

test('date must be today or yesterday and published; kind and groupRef are validated', async () => {
  assert.equal((await board('u', { dateKey: '20261101' })).ok, false);
  assert.equal((await board('u', { dateKey: '20261105' })).ok, false);
  assert.equal((await board('u', { dateKey: 'garbage' })).ok, false);
  assert.equal((await board('u', { kind: 'other' })).ok, false);
  assert.equal((await board('u', { kind: 'group', groupRef: 'zz' })).ok, false);
});

async function join(openid, opengid) {
  return h.call('joinGroup', { groupData: { cloudID: 'c', data: { opengid, chat_type: 3 } } }, { openid });
}

test('group board: NOT_MEMBER for a stranger, members see the board (AC 82)', async () => {
  const a = await join('alice', 'OG1');
  await guess('alice', 10);
  assert.equal((await board('mallory', { kind: 'group', groupRef: a.groupRef })).code, 'NOT_MEMBER');
  const r = await board('alice', { kind: 'group', groupRef: a.groupRef });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  await join('mallory', 'OG2');
  assert.equal((await board('mallory', { kind: 'group', groupRef: a.groupRef })).code, 'NOT_MEMBER');
});

test('over the cap the group board lists members only and the friend board is selfOnly (AC 83)', async () => {
  const a = await join('alice', 'OG1');
  await join('bob', 'OG1');
  await join('carol', 'OG9');
  await guess('alice', 10);
  await guess('bob', 10);
  await guess('carol', 10);
  // pretend the day is huge: 3,001 ranked plays
  for (let i = 0; i < 3001; i++) {
    h.db.put('plays', { _id: `d20261103_fake${i}`, openid: 'fake' + i, puzzleId: PID, ranked: true, status: 'solved', steps: 9, hintsUsed: [], adHints: 0, best: 1, finishedAt: h.now(), lastAt: h.now() });
  }
  const g = await board('alice', { kind: 'group', groupRef: a.groupRef });
  assert.equal(g.mode, 'group');
  assert.deepEqual(new Set(g.rows.map((x) => x[0])), new Set([hashOf('alice'), hashOf('bob')]));
  const f = await board('alice', { kind: 'friend' });
  assert.equal(f.mode, 'selfOnly');
  assert.deepEqual(f.rows.map((x) => x[0]), [hashOf('alice')]);
});

test('the 30 s cache never hides the caller\'s own fresh row', async () => {
  await guess('alice', 10);
  await board('alice');
  await fill('bob', 2);
  const r = await board('bob');
  assert.ok(r.rows.some((x) => x[0] === hashOf('bob')));
});

test('getBoard writes a board_list event without ids', async () => {
  await guess('alice', 10);
  await board('alice');
  const ev = h.db.all('events').find((e) => e.name === 'board_list');
  assert.equal(ev.props.rows, 1);
  assert.equal(ev.props.mode, 'full');
  assert.ok(!JSON.stringify(ev.props).includes('alice'));
});
