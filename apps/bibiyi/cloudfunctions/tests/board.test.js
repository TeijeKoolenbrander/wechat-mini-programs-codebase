'use strict';
// getBoard (C3: server-authoritative, hashed rows) and joinGroup.
const crypto = require('crypto');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, playDaily, allStrings, allKeys } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); h.loadDailyFacts(); });
afterEach(() => h.teardown());

const U = (i) => `openid-board-user-${String(i).padStart(3, '0')}`;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const GROUP = (opengid, chat_type = 3) => ({ cloudID: 'cid', data: { opengid, chat_type } });

async function populate() {
  // ranks: U1=9, U2=9 (later), U3=4, U4=0
  const plan = [[1, 9], [3, 4], [2, 9], [4, 0]];
  for (const [i, right] of plan) {
    await playDaily(h, U(i), { right });
    h.advance(60e3);
  }
}

test('rows are [h, n, s, k?] sorted by n desc then earlier end; no openid anywhere', async () => {
  await populate();
  const b = await h.call('getBoard', { kind: 'friend', dateKey: '20261015' }, { openid: U(3) });
  assert.equal(b.ok, true);
  assert.equal(b.mode, 'full');
  assert.equal(b.rows.length, 4);
  const hash = (i) => sha(`${U(i)}|${b.salt}`).slice(0, 12);
  assert.deepEqual(b.rows.map((r) => r[0]), [hash(1), hash(2), hash(3), hash(4)]);
  assert.deepEqual(b.rows.map((r) => r[1]), [9, 9, 4, 0]);
  assert.ok(b.rows[0][2] < b.rows[1][2], 'earlier end listed first inside a tie');
  assert.equal(b.rows[0][2], 12 * 3600);
  assert.equal(b.selfHash, hash(3));
  assert.equal(b.rows.every((r) => r.length === 3), true, 'day streak is shown only from 2 days');
  const strings = allStrings(b);
  for (let i = 1; i <= 4; i++) assert.equal(strings.some((s) => s.includes(U(i))), false);
  assert.equal(allKeys(b).some((k) => /openid|opengid/i.test(k)), false);
  assert.equal('answers' in b, false);
});

test('the same player hashes differently on two dates (per-day salt)', async () => {
  await playDaily(h, U(1), { right: 3 });
  h.setNow(Date.UTC(2026, 9, 16, 4, 0, 0));
  await playDaily(h, U(1), { right: 3 });
  const a = await h.call('getBoard', { kind: 'friend', dateKey: '20261015' }, { openid: U(1) });
  const b = await h.call('getBoard', { kind: 'friend', dateKey: '20261016' }, { openid: U(1) });
  assert.notEqual(a.selfHash, b.selfHash);
  assert.notEqual(a.salt, b.salt);
  // rows now carry the day streak (>= 2) on the second day
  assert.equal(b.rows[0].length, 4);
  assert.equal(b.rows[0][3], 2);
});

test('board validation: kind, date range, missing deck', async () => {
  await populate();
  assert.equal((await h.call('getBoard', { kind: 'world', dateKey: '20261015' }, { openid: U(1) })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('getBoard', { kind: 'friend', dateKey: '20261016' }, { openid: U(1) })).code, 'INVALID_ACTIONS', 'tomorrow');
  assert.equal((await h.call('getBoard', { kind: 'friend', dateKey: '20261010' }, { openid: U(1) })).code, 'INVALID_ACTIONS', 'too old');
  assert.equal((await h.call('getBoard', { kind: 'friend', dateKey: '2026-10-15' }, { openid: U(1) })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('getBoard', { kind: 'friend', dateKey: '20261014' }, { openid: U(1) })).code, 'DECK_NOT_FOUND');
  assert.equal((await h.call('getBoard', { kind: 'friend' }, { openid: U(1) })).code, 'INVALID_ACTIONS');
});

test('joinGroup: one group_members doc per (group, user), opaque groupRef, no openGId back', async () => {
  const a = await h.call('joinGroup', { groupData: GROUP('OG_ABC') }, { openid: U(1) });
  const b = await h.call('joinGroup', { groupData: GROUP('OG_ABC') }, { openid: U(1) });
  assert.equal(a.ok, true);
  assert.equal(a.groupRef, b.groupRef);
  assert.match(a.groupRef, /^[0-9a-f]{16}$/);
  assert.equal(a.groupRef, sha('OG_ABC' + process.env.GROUP_REF_PEPPER).slice(0, 16));
  assert.equal(JSON.stringify(a).includes('OG_ABC'), false);
  assert.equal('groupid' in a, false);
  assert.equal(h.db.all('group_members').length, 1);
  assert.equal(h.db.all('group_members')[0]._id, `OG_ABC_${U(1)}`);
  await h.call('joinGroup', { groupData: GROUP('OG_ABC') }, { openid: U(2) });
  assert.equal(h.db.all('group_members').length, 2);
});

test('joinGroup failure paths write nothing: single chat, malformed cloudID, no pepper', async () => {
  assert.equal((await h.call('joinGroup', { groupData: GROUP('OG_X', 1) }, { openid: U(1) })).code, 'NOT_GROUP');
  assert.equal((await h.call('joinGroup', { groupData: { cloudID: 'c', data: {} } }, { openid: U(1) })).code, 'NOT_GROUP');
  assert.equal((await h.call('joinGroup', { groupData: 'cloud://raw-cloudid' }, { openid: U(1) })).code, 'BAD_CLOUDID');
  assert.equal((await h.call('joinGroup', {}, { openid: U(1) })).code, 'BAD_CLOUDID');
  h.setEnv('GROUP_REF_PEPPER', undefined);
  assert.equal((await h.call('joinGroup', { groupData: GROUP('OG_X') }, { openid: U(1) })).code, 'SERVER_CONFIG');
  assert.equal(h.db.all('group_members').length, 0);
});

test('JOINGROUP_RETURN_OPENGID is the only way the openGId is returned (spike fallback)', async () => {
  h.setEnv('JOINGROUP_RETURN_OPENGID', '1');
  const a = await h.call('joinGroup', { groupData: GROUP('OG_ABC') }, { openid: U(1) });
  assert.equal(a.groupid, 'OG_ABC');
});

test('group board: groupRef is accepted only from a member', async () => {
  await populate();
  const g = await h.call('joinGroup', { groupData: GROUP('OG_ABC') }, { openid: U(1) });
  const ok = await h.call('getBoard', { kind: 'group', dateKey: '20261015', groupRef: g.groupRef }, { openid: U(1) });
  assert.equal(ok.ok, true);
  assert.equal((await h.call('getBoard', { kind: 'group', dateKey: '20261015', groupRef: g.groupRef }, { openid: U(2) })).code, 'NOT_MEMBER');
  assert.equal((await h.call('getBoard', { kind: 'group', dateKey: '20261015' }, { openid: U(1) })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('getBoard', { kind: 'group', dateKey: '20261015', groupRef: 'abc' }, { openid: U(1) })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('getBoard', { kind: 'group', dateKey: '20261015', groupRef: '0123456789abcdef' }, { openid: U(1) })).code, 'NOT_MEMBER');
});

test('over boardListCap: group board -> mode group (members only), friend board -> selfOnly', async () => {
  await populate();
  h.patchConfig((c) => { c.boardListCap = 3; });
  for (const i of [1, 3]) await h.call('joinGroup', { groupData: GROUP('OG_ABC') }, { openid: U(i) });
  const g = (await h.call('joinGroup', { groupData: GROUP('OG_ABC') }, { openid: U(3) })).groupRef;
  const group = await h.call('getBoard', { kind: 'group', dateKey: '20261015', groupRef: g }, { openid: U(3) });
  assert.equal(group.mode, 'group');
  assert.deepEqual(group.rows.map((r) => r[1]), [9, 4], 'only the two members');
  const friend = await h.call('getBoard', { kind: 'friend', dateKey: '20261015' }, { openid: U(3) });
  assert.equal(friend.mode, 'selfOnly');
  assert.equal(friend.rows.length, 1);
  assert.equal(friend.rows[0][0], friend.selfHash);
  const none = await h.call('getBoard', { kind: 'friend', dateKey: '20261015' }, { openid: U(9) });
  assert.deepEqual(none.rows, []);
});

test('board rows are exactly what daily_results holds: free runs and friendlies never appear', async () => {
  await playDaily(h, U(1), { right: 5 });
  const { makeRun } = require('./helpers/free');
  await h.call('submitRun', { clientRunId: 'freerun-0001', ...makeRun(h, { seed: 5, right: 30 }).event }, { openid: U(2) });
  const b = await h.call('getBoard', { kind: 'friend', dateKey: '20261015' }, { openid: U(2) });
  assert.equal(b.rows.length, 1);
  assert.equal(b.rows[0][1], 5);
});
