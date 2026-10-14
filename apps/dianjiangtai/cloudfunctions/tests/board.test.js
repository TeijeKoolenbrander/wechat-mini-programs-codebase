'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createHarness } = require('./helpers/harness');
const { playDaily, allStrings, allKeys } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
const PEPPER = 'test-pepper-not-a-secret';
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', PEPPER);
});
afterEach(() => h.teardown());

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const board = (openid, event = {}) => h.call('getBoard', { kind: 'friend', dateKey: '20261103', ...event }, { openid });
const group = (openid, openGId) => h.call('joinGroup', { groupData: { cloudID: 'c', data: { opengid: openGId, chat_type: 3 } } }, { openid });

// ranks: rank k -> distinct win counts in the fake sim (0 -> 12, 4 -> 10, 5 -> 5, 6 -> 0, ...)
async function populate() {
  const plan = { alice: 5, bob: 0, carol: 4, dave: 6, erin: 0 };
  for (const [u, rank] of Object.entries(plan)) {
    const r = await playDaily(h, u, { rank });
    assert.equal(r.ok, true, u + JSON.stringify(r));
    h.advance(1000); // distinct submit times
  }
}

test('getBoard never returns raw openids / group ids; rows are salted hashes (AC 60)', async () => {
  await populate();
  await group('alice', 'OPENGID_SECRET_1');
  const g = (await group('alice', 'OPENGID_SECRET_1')).groupRef;
  const outs = [
    await board('alice'),
    await board('alice', { kind: 'group', groupRef: g }),
    await board('zed-never-played'),
  ];
  const secrets = ['alice', 'bob', 'carol', 'dave', 'erin', 'zed-never-played', 'OPENGID_SECRET_1'];
  for (const out of outs) {
    assert.equal(out.ok, true, JSON.stringify(out));
    const text = JSON.stringify(out);
    for (const sct of secrets) assert.equal(text.includes(sct), false, `leaked ${sct}`);
    const keys = allKeys(out).join(',');
    assert.doesNotMatch(keys, /openid|openGId|opengid/i);
    for (const r of out.rows) assert.match(r[0], /^[0-9a-f]{12}$/);
  }
  // the server events hold no openGId or groupRef either
  assert.doesNotMatch(JSON.stringify(h.db.all('events')), /OPENGID_SECRET_1/);
  assert.equal(allStrings(outs[0]).some((s) => s === 'alice'), false);
});

test('hash = sha256(openid|salt)[0..12), selfHash pins the caller, salt differs per day (AC 60)', async () => {
  await populate();
  const out = await board('alice');
  const seed = h.db.all('daily_seeds').find((d) => d._id === '20261103');
  assert.equal(out.salt, seed.boardSalt);
  assert.equal(out.selfHash, sha(`alice|${seed.boardSalt}`).slice(0, 12));
  assert.ok(out.rows.some((r) => r[0] === out.selfHash));

  // next Beijing day: same user, new salt, different hash
  h.setNow(T0 + 24 * 3600e3);
  await playDaily(h, 'alice');
  const d2 = await board('alice', { dateKey: '20261104' });
  assert.notEqual(d2.salt, out.salt);
  assert.notEqual(d2.selfHash, out.selfHash);
  // yesterday's board is still readable across midnight (edge 21) and keeps its own salt
  const yesterday = await board('alice', { dateKey: '20261103' });
  assert.equal(yesterday.selfHash, out.selfHash);
  // but not the day before yesterday
  h.setNow(T0 + 2 * 24 * 3600e3);
  assert.equal((await board('alice', { dateKey: '20261103' })).code, 'INVALID_ACTIONS');
});

test('rank order equals server order from daily_results alone: wins desc, earlier submit first (AC 56c)', async () => {
  await populate();
  const out = await board('bob');
  const seed = h.db.all('daily_seeds')[0];
  const dayStart = Date.UTC(2026, 10, 2, 16, 0, 0);
  const expected = h.db.all('daily_results')
    .sort((a, b) => b.w - a.w || a.submittedAt - b.submittedAt)
    .map((r) => [sha(`${r.openid}|${seed.boardSalt}`).slice(0, 12), r.w, Math.floor((r.submittedAt - dayStart) / 1000)]);
  assert.deepEqual(out.rows.map((r) => r.slice(0, 3)), expected);
  assert.equal(out.mode, 'full');
  assert.equal(out.rows.length, 5);
  // ties broken by submit time: bob (rank 0) and erin (rank 0) both 12 wins, bob first
  const ws = out.rows.map((r) => r[1]);
  assert.deepEqual(ws, [...ws].sort((a, b) => b - a));
});

test('lineups (x) only for a caller with a ranked result for the date (AC 38, 61)', async () => {
  await populate();
  const stranger = await board('zed');
  assert.equal(stranger.viewerPlayed, false);
  assert.ok(stranger.rows.every((r) => r.length === 3), 'no x for a viewer who has not played');
  assert.doesNotMatch(JSON.stringify(stranger), /\d+,\d+,\d+,\d+,\d+/);
  const player = await board('carol');
  assert.equal(player.viewerPlayed, true);
  assert.ok(player.rows.every((r) => r.length === 4 && /^\d+(,\d+){4}$/.test(r[3])));
  // a viewer who plays later gets lineups (the 60 s cache must not hide their own state)
  await playDaily(h, 'zed', { rank: 5 });
  assert.ok((await board('zed')).rows.every((r) => r.length === 4));
});

test('group board: groupRef accepted only from a member (AC 61, 62)', async () => {
  await populate();
  const a = await group('alice', 'G-ONE');
  await group('bob', 'G-ONE');
  const c = await group('carol', 'G-TWO');
  assert.notEqual(a.groupRef, c.groupRef);
  const ok = await board('alice', { kind: 'group', groupRef: a.groupRef });
  assert.equal(ok.ok, true);
  // carol is in another group: alice's groupRef gets her nothing
  const stolen = await board('carol', { kind: 'group', groupRef: a.groupRef });
  assert.equal(stolen.ok, false);
  assert.equal(stolen.code, 'NOT_MEMBER');
  assert.equal(stolen.rows, undefined);
  // made-up refs and malformed refs
  assert.equal((await board('alice', { kind: 'group', groupRef: '0123456789abcdef' })).code, 'NOT_MEMBER');
  assert.equal((await board('alice', { kind: 'group', groupRef: 'nope' })).code, 'INVALID_ACTIONS');
  assert.equal((await board('alice', { kind: 'group' })).code, 'INVALID_ACTIONS');
  // a user who never joined any group
  assert.equal((await board('dave', { kind: 'group', groupRef: a.groupRef })).code, 'NOT_MEMBER');
});

test('over boardListCap: group -> mode group (members only), friend -> selfOnly; never more rows than cap (AC 56, 61)', async () => {
  await populate();
  global.__DJ_BOARD_CAP = 3; // 5 ranked results today > 3
  const a = await group('alice', 'G-ONE');
  await group('carol', 'G-ONE');
  const grp = await board('alice', { kind: 'group', groupRef: a.groupRef });
  assert.equal(grp.mode, 'group');
  assert.equal(grp.rows.length, 2, 'only alice and carol');
  const seed = h.db.all('daily_seeds')[0];
  const hashes = grp.rows.map((r) => r[0]).sort();
  assert.deepEqual(hashes, ['alice', 'carol'].map((u) => sha(`${u}|${seed.boardSalt}`).slice(0, 12)).sort());

  const friend = await board('alice');
  assert.equal(friend.mode, 'selfOnly');
  assert.equal(friend.rows.length, 1);
  assert.equal(friend.rows[0][0], friend.selfHash);

  const nobody = await board('zed');
  assert.equal(nobody.mode, 'selfOnly');
  assert.deepEqual(nobody.rows, []);

  // at the cap exactly: full again
  global.__DJ_BOARD_CAP = 5;
  h.advance(61000); // expire the 60 s cache
  const full = await board('zed');
  assert.equal(full.mode, 'full');
  assert.equal(full.rows.length, 5);
  // the crossing is logged for the Phase 2 trigger
  assert.ok(h.db.all('events').some((e) => e.name === 'board_list' && e.props.mode === 'selfOnly'));
});

test('60 s cache: second call is served from memory (fewer DB reads), expires after 60 s, own result always fresh', async () => {
  await populate();
  const first = await board('alice');
  const reads1 = h.db.stats.reads;
  const second = await board('bob');
  const readsAfter = h.db.stats.reads - reads1;
  assert.ok(readsAfter < reads1, 'cached result rows are not re-read');
  assert.deepEqual(second.rows.map((r) => r[1]), first.rows.map((r) => r[1]));
  assert.equal(h.db.all('events').filter((e) => e.name === 'board_list').pop().props.cached, true);
  // a new result inside the 60 s window: the other viewers do not see it yet, the player does
  await playDaily(h, 'zed', { rank: 5 });
  assert.equal((await board('alice')).rows.length, 5);
  assert.equal((await board('zed')).rows.length, 6);
  h.advance(61000);
  assert.equal((await board('alice')).rows.length, 6);
});

test('getBoard input validation and identity', async () => {
  await populate();
  assert.equal((await board('alice', { kind: 'global' })).code, 'INVALID_ACTIONS');
  assert.equal((await board('alice', { dateKey: 'today' })).code, 'INVALID_ACTIONS');
  assert.equal((await board('alice', { dateKey: undefined })).code, 'INVALID_ACTIONS');
  assert.equal((await board('alice', { dateKey: '20261104' })).code, 'INVALID_ACTIONS'); // future
  assert.equal((await h.call('getBoard', { kind: 'friend', dateKey: '20261103' }, {})).code, 'UNAUTHENTICATED');
  // forged openid in the request changes nothing
  const forged = await h.call('getBoard', { kind: 'friend', dateKey: '20261103', openid: 'alice' }, { openid: 'zed' });
  assert.equal(forged.viewerPlayed, false);
});
