'use strict';
// joinGroup (copied from 点将台), getGroupDay and getFriendBoard: membership, no openids, hashing, scores.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createHarness, play, T0 } = require('./helpers/harness');

const PEPPER = 'test-pepper-not-a-secret';
const TODAY = '20261103';
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', PEPPER);
});
afterEach(() => h.teardown());

const join = (openid, data) => h.call('joinGroup', { groupData: { cloudID: 'cid', data } }, { openid });
const refOf = (og) => crypto.createHash('sha256').update(og + PEPPER).digest('hex').slice(0, 16);
const hashOf = (openid, salt) => crypto.createHash('sha256').update(`${openid}|${salt}`).digest('hex').slice(0, 12);

test('joinGroup: one doc per openGId+openid, opaque groupRef, idempotent, errors leave no doc (AC 41)', async () => {
  const r = await join('A', { opengid: 'OG1', chat_type: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.groupRef, refOf('OG1'));
  assert.notEqual(r.groupRef, 'OG1');
  assert.deepEqual(Object.keys(r).sort(), ['groupRef', 'ok']);
  await Promise.all([1, 2, 3].map(() => join('A', { opengid: 'OG1', chat_type: 3 })));
  assert.equal(h.db.all('group_members').length, 1);
  assert.equal(h.db.all('group_members')[0]._id, 'OG1_A');
  for (const [data, code] of [[{ open_single_roomid: 'R', chat_type: 1 }, 'NOT_GROUP'], [{ opengid: '', chat_type: 3 }, 'NOT_GROUP']]) {
    assert.equal((await join('B', data)).code, code);
  }
  assert.equal((await h.call('joinGroup', { groupData: 'forged-opengid' }, { openid: 'B' })).code, 'BAD_CLOUDID');
  assert.equal((await h.call('joinGroup', { groupData: { data: { opengid: 'OG1' } }, opengid: 'OG2' }, { openid: 'B' })).groupRef, refOf('OG1'), 'only the decrypted payload counts');
  assert.equal(h.db.all('group_members').filter((m) => m.openid === 'B').length, 1);
  h.setEnv('GROUP_REF_PEPPER', undefined);
  assert.equal((await join('C', { opengid: 'OG1', chat_type: 3 })).code, 'SERVER_CONFIG');
});

async function threeMembers() {
  const ref = (await join('M1', { opengid: 'OG1', chat_type: 3 })).groupRef;
  await join('M2', { opengid: 'OG1', chat_type: 3 });
  await join('M3', { opengid: 'OG1', chat_type: 3 });
  await play(h, 'M1', [10, 10, 10, 10, 10]);
  h.advance(2000);
  await play(h, 'M2', [20, 20, 20, 20, 20]);
  h.advance(2000);
  await play(h, 'M3', [90, 90, 90, 90, 90]);
  return ref;
}
const gd = (openid, groupRef, dateKey = TODAY) => h.call('getGroupDay', { groupRef, dateKey }, { openid });

test('getGroupDay: leave-one-out scores and 群默契度 match the hand-computed fixture (AC 5)', async () => {
  const ref = await threeMembers();
  const r = await gd('M1', ref);
  assert.equal(r.ok, true);
  assert.equal(r.n, 3);
  assert.equal(r.mq, 33, 'median 20, MAD 26.67 -> 100 - ceil(66.67) = 33 on every card');
  const byHash = Object.fromEntries(r.rows.map((row) => [row[0], row]));
  assert.equal(byHash[hashOf('M1', r.salt)][1], 0, 'M1: others {20,90} -> 55, d 45 -> 0');
  assert.equal(byHash[hashOf('M2', r.salt)][1], 125, 'M2: others {10,90} -> 50, d 30 -> 25 x 5');
  assert.equal(byHash[hashOf('M3', r.salt)][1], 0, 'M3: others {10,20} -> 15, d 75 -> 0');
  assert.equal(r.rows[0][0], hashOf('M2', r.salt), 'ranked by 群内默契分');
  assert.equal(r.selfHash, hashOf('M1', r.salt));
});

test('getGroupDay: n < 3 has no mq; n = 2 has group scores; n = 1 has none (AC 5, 42)', async () => {
  const ref = (await join('M1', { opengid: 'OG1', chat_type: 3 })).groupRef;
  await join('M2', { opengid: 'OG1', chat_type: 3 });
  await play(h, 'M1', [10, 10, 10, 10, 10]);
  let r = await gd('M1', ref);
  assert.equal(r.n, 1);
  assert.equal(r.mq, null);
  assert.equal(r.rows[0][1], null);
  await play(h, 'M2', [30, 30, 30, 30, 30]);
  r = await gd('M1', ref);
  assert.equal(r.n, 2);
  assert.equal(r.mq, null);
  assert.ok(r.rows.every((row) => typeof row[1] === 'number'));
});

test('getGroupDay: NOT_MEMBER for a groupRef the caller does not belong to; rows only for members with a complete daily (AC 42)', async () => {
  const ref = await threeMembers();
  assert.equal((await gd('outsider', ref)).code, 'NOT_MEMBER');
  assert.equal((await h.call('getGroupDay', { groupRef: 'zz', dateKey: TODAY }, { openid: 'M1' })).code, 'INVALID_INPUT');
  await join('M4', { opengid: 'OG1', chat_type: 3 });
  await play(h, 'M4', [1, 2, 3]); // partial
  const r = await gd('M1', ref);
  assert.equal(r.n, 3);
  assert.equal(r.rows.length, 3);
  // a user in another group does not leak into this one
  const other = (await join('X1', { opengid: 'OG2', chat_type: 3 })).groupRef;
  await play(h, 'X1', [50, 50, 50, 50, 50]);
  assert.equal((await gd('M1', ref)).rows.length, 3);
  assert.equal((await gd('X1', other)).rows.length, 1);
});

test('getGroupDay: before the viewer completes, scores/positions/mq are withheld; n, trend, rounds remain (notPlayed)', async () => {
  const ref = await threeMembers();
  await join('NEW', { opengid: 'OG1', chat_type: 3 });
  const r = await gd('NEW', ref);
  assert.equal(r.ok, true);
  assert.equal(r.viewerDone, false);
  assert.equal(r.n, 3);
  assert.deepEqual(r.rows, []);
  assert.equal(r.mq, null);
  assert.equal(r.divisiveIdx, null);
  assert.equal(r.trend.length, 7);
  assert.ok(Array.isArray(r.rounds));
});

test('no raw openids, openGIds or field names openid/openGId in any group/board response (AC 49)', async () => {
  const ref = await threeMembers();
  const g = await gd('M2', ref);
  const f = await h.call('getFriendBoard', { dateKey: TODAY }, { openid: 'M2' });
  for (const resp of [g, f]) {
    const s = JSON.stringify(resp);
    for (const bad of ['M1', 'M2', 'M3', 'OG1', 'openid', 'openGId', 'opengid']) assert.equal(s.includes(bad), false, bad);
    assert.equal(s.includes(ref), false, 'the response carries no groupRef echo');
  }
});

test('hashes differ between two dates (a new salt per day) (AC 49)', async () => {
  await threeMembers();
  const a = await h.call('getFriendBoard', { dateKey: TODAY }, { openid: 'M1' });
  h.setNow(h.bjt(2026, 11, 4, 12));
  await play(h, 'M1', [10, 10, 10, 10, 10]);
  const b = await h.call('getFriendBoard', { dateKey: '20261104' }, { openid: 'M1' });
  assert.notEqual(a.selfHash, b.selfHash);
  assert.notEqual(a.salt, b.salt);
});

test('getGroupDay date window: today or yesterday only', async () => {
  const ref = await threeMembers();
  assert.equal((await gd('M1', ref, '20261104')).code, 'INVALID_INPUT');
  assert.equal((await gd('M1', ref, '20261101')).code, 'INVALID_INPUT');
});

test('trend: closed days are cached in group_daily; "—" (mq null) below 3 members (AC 47)', async () => {
  const ref = await threeMembers();
  h.setNow(h.bjt(2026, 11, 4, 9));
  await h.call('getDaily', {}, { openid: 'M1' });
  await play(h, 'M1', [10, 10, 10, 10, 10]);
  const r = await gd('M1', ref, '20261104');
  const t = r.trend;
  assert.equal(t.length, 7);
  assert.deepEqual(t[5], { dateKey: '20261103', mq: 33, n: 3 });
  assert.deepEqual(t[6], { dateKey: '20261104', mq: null, n: 1 });
  const cached = h.db.all('group_daily');
  assert.equal(cached.length, 1);
  assert.equal(cached[0]._id, `${ref}_20261103`);
  assert.equal(cached[0].mq, 33);
});

test('rounds list: last rounds that received a guess carrying this groupRef (AC 47)', async () => {
  const ref = await threeMembers();
  const c = await h.call('createRound', { spectrumId: 's001' }, { openid: 'M1' });
  await h.call('setClue', { roundId: c.roundId, clueMode: 'chat' }, { openid: 'M1' });
  await h.call('submitGuess', { roundId: c.roundId, pos: 40, groupRef: ref }, { openid: 'M2' });
  const c2 = await h.call('createRound', { spectrumId: 's002' }, { openid: 'M1' });
  await h.call('setClue', { roundId: c2.roundId, clueMode: 'chat' }, { openid: 'M1' });
  const r = await gd('M1', ref);
  assert.equal(r.rounds.length, 1);
  assert.equal(r.rounds[0].roundId, c.roundId);
  assert.equal(r.rounds[0].guesses, 1);
  assert.equal(JSON.stringify(r.rounds).includes('target'), false);
});

test('group rows cap at groupRowCap plus the caller (spec 8.4)', async () => {
  const ref = (await join('M0', { opengid: 'OG9', chat_type: 3 })).groupRef;
  const cfg = h.mod('getGroupDay', ['core', 'config.js']).getConfig(1);
  cfg.score.groupRowCap = 3;
  try {
    for (let i = 1; i <= 5; i++) {
      await join(`P${i}`, { opengid: 'OG9', chat_type: 3 });
      await play(h, `P${i}`, [i * 10, i * 10, i * 10, i * 10, i * 10]);
      h.advance(1000);
    }
    await play(h, 'M0', [100, 100, 100, 100, 100]);
    const r = await gd('M0', ref);
    assert.equal(r.n, 6);
    assert.ok(r.rows.length <= 4);
    assert.ok(r.rows.some((row) => row[0] === r.selfHash), 'the caller is always included');
  } finally { cfg.score.groupRowCap = 500; }
});

test('friend board: ranked by national score then completion time; positions/refs only for a viewer who completed (AC 46)', async () => {
  await play(h, 'A', [50, 50, 50, 50, 50]);
  h.advance(5000);
  await play(h, 'B', [50, 50, 50, 50, 50]);
  const blind = await h.call('getFriendBoard', { dateKey: TODAY }, { openid: 'C' });
  assert.equal(blind.viewerDone, false);
  assert.deepEqual(blind.rows, []);
  assert.equal(blind.refs, null);
  await play(h, 'C', [95, 95, 95, 95, 95]);
  const f = await h.call('getFriendBoard', { dateKey: TODAY }, { openid: 'C' });
  assert.equal(f.mode, 'full');
  assert.equal(f.rows.length, 3);
  assert.equal(f.refs.length, 5);
  const salt = f.salt;
  assert.equal(f.rows[0][0], hashOf('A', salt), 'same score, earlier completion first');
  assert.equal(f.rows[1][0], hashOf('B', salt));
  assert.ok(f.rows[0][1] >= f.rows[2][1]);
  assert.equal(f.rows[0][3], '50,50,50,50,50');
});

test('friend board: selfOnly above boardListCap, ranked row is the caller only (AC 46)', async () => {
  const cfg = h.mod('getFriendBoard', ['core', 'config.js']).getConfig(1);
  cfg.boardListCap = 2;
  try {
    for (const o of ['A', 'B', 'C']) await play(h, o, [20, 20, 20, 20, 20]);
    const f = await h.call('getFriendBoard', { dateKey: TODAY }, { openid: 'A' });
    assert.equal(f.mode, 'selfOnly');
    assert.equal(f.rows.length, 1);
    assert.equal(f.rows[0][0], f.selfHash);
  } finally { cfg.boardListCap = 3000; }
});

test('a tampered client score cannot reach a board: rows come only from daily_entries (AC 43)', async () => {
  await play(h, 'A', [10, 10, 10, 10, 10]);
  // forging inputs on every call changes nothing: no function accepts a score
  await h.call('getFriendBoard', { dateKey: TODAY, s: 500, score: 500, kd: { s: 500 } }, { openid: 'A' });
  await h.call('track', { events: [{ name: 'marker_write', props: { s: 500 } }] }, { openid: 'liar' });
  const f = await h.call('getFriendBoard', { dateKey: TODAY, rows: [['x', 500]] }, { openid: 'A' });
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0][0], f.selfHash);
});
