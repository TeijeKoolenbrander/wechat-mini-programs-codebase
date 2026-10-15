'use strict';
// joinGroup, track and cleanup.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createHarness, T0, DAY } = require('./helpers/harness');

const PEPPER = 'test-pepper-not-a-secret';
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', PEPPER);
  h.setEnv('JOINGROUP_RETURN_OPENGID', undefined);
});
afterEach(() => h.teardown());

// ---------------- joinGroup ----------------
const join = (openid, data, extra = {}) => h.call('joinGroup', { groupData: { cloudID: 'cid', data }, ...extra }, { openid });

test('joinGroup: server-decrypted openGId -> opaque groupRef, one members doc per (group, openid)', async () => {
  const r = await join('userA', { opengid: 'OG123', chat_type: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.groupRef, crypto.createHash('sha256').update('OG123' + PEPPER).digest('hex').slice(0, 16));
  assert.deepEqual(Object.keys(r).sort(), ['groupRef', 'ok']);
  const d = h.db.all('group_members');
  assert.deepEqual([d[0]._id, d[0].openid, d[0].groupRef, d[0].firstSeen], ['OG123_userA', 'userA', r.groupRef, '20261103']);
  h.setNow(T0 + 2 * DAY);
  assert.equal((await join('userA', { opengid: 'OG123', chat_type: 3 })).groupRef, r.groupRef);
  assert.equal(h.db.all('group_members').length, 1);
  assert.equal(h.db.all('group_members')[0].lastSeen, '20261105');
});

test('joinGroup rejects single chats, bad types, missing data and a missing pepper', async () => {
  assert.equal((await join('u', { opengid: 'OG1', chat_type: 1 })).code, 'NOT_GROUP');
  assert.equal((await join('u', {})).code, 'NOT_GROUP');
  assert.equal((await h.call('joinGroup', { groupData: 'client forged string' }, { openid: 'u' })).code, 'BAD_CLOUDID');
  assert.equal((await h.call('joinGroup', {}, { openid: 'u' })).code, 'BAD_CLOUDID');
  assert.equal(h.db.all('group_members').length, 0);
  h.setEnv('GROUP_REF_PEPPER', undefined);
  assert.equal((await join('u', { opengid: 'OG1', chat_type: 3 })).code, 'SERVER_CONFIG');
});

test('joinGroup returns the openGId only when the spike flag is set', async () => {
  h.setEnv('JOINGROUP_RETURN_OPENGID', '1');
  assert.equal((await join('u', { opengid: 'OG1', chat_type: 3 })).groupid, 'OG1');
});

// ---------------- track ----------------
const track = (events, openid = 'u1') => h.call('track', { events }, { openid });

test('track stores accepted events with the context openid and strips id-like props', async () => {
  const r = await track([
    { name: 'puzzle_open', sessionId: 's1', clientTs: T0, props: { puzzleId: 'd20261103', kind: 'daily', openid: 'forged', groupRef: 'x' } },
    { name: 'solve', props: { sessionId: 's2', steps: 21, srcMix: { warmup: 1, chip: 12, suggest: 3, typed: 5 } } },
    { name: 'not_an_event', props: {} },
  ]);
  assert.deepEqual([r.ok, r.accepted, r.rejected], [true, 2, 1]);
  const ev = h.db.all('events');
  assert.equal(ev.length, 2);
  assert.ok(ev.every((e) => e.openid === 'u1'));
  assert.equal(ev[0].sessionId, 's1');
  assert.deepEqual(ev[0].props, { puzzleId: 'd20261103', kind: 'daily' });
  assert.equal(ev[1].sessionId, 's2');
  assert.ok(!('sessionId' in ev[1].props));
});

test('track refuses a batch carrying a prop named text, input or query, at any depth, and stores nothing (AC 25)', async () => {
  const clean = { name: 'guess_rejected', props: { reason: 'oov', len: 4 } };
  for (const bad of [
    { name: 'guess', props: { text: '番茄' } },
    { name: 'guess', props: { input: 'x' } },
    { name: 'guess_rejected', props: { query: 'q', reason: 'oov' } },
    { name: 'error', props: { where: 'play', nested: { deeper: { Text: 'typed' } } } },
    { name: 'guess', text: '番茄', props: {} },
  ]) {
    const r = await track([clean, bad]);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BAD_EVENT');
  }
  assert.equal(h.db.all('events').length, 0, 'not even the clean event of the batch is kept');
  assert.equal((await track([clean])).accepted, 1);
  assert.deepEqual(h.db.all('events')[0].props, { reason: 'oov', len: 4 });
});

test('track validates batch size, rate limits and refuses server-only event names', async () => {
  assert.equal((await track([])).ok, false);
  assert.equal((await track(Array.from({ length: 51 }, () => ({ name: 'guess', props: {} })))).ok, false);
  assert.equal((await track('nope')).ok, false);
  assert.equal((await track([{ name: 'daily_gen', props: {} }, { name: 'board_list', props: {} }, { name: 'anomaly_daily', props: {} }])).accepted, 0);
  let limited = null;
  for (let i = 0; i < 8 && !limited; i++) {
    const r = await track(Array.from({ length: 50 }, () => ({ name: 'guess', props: { n: 1 } })));
    if (!r.ok) limited = r;
  }
  assert.equal(limited && limited.code, 'RATE_LIMITED');
});

test('track: no OPENID -> UNAUTHENTICATED; oversize props are dropped', async () => {
  assert.equal((await h.call('track', { events: [{ name: 'guess', props: {} }] }, {})).code, 'UNAUTHENTICATED');
  const r = await track([{ name: 'error', props: { a: 'x'.repeat(200), b: 'y'.repeat(200), c: 'z'.repeat(200), d: 'w'.repeat(200), e: 'v'.repeat(200), f: 'u'.repeat(200) } }]);
  assert.equal(r.accepted, 0);
});

// ---------------- cleanup ----------------
const cleanupT = Date.UTC(2026, 10, 3, 20, 0, 0); // 2026-11-04 04:00 BJT
function seedData() {
  const old = cleanupT - 181 * DAY;
  const fresh = cleanupT - 179 * DAY;
  h.db.put('plays', { _id: 'old_play', lastAt: old });
  h.db.put('plays', { _id: 'new_play', lastAt: fresh });
  h.db.put('challenges', { _id: 'old_ch', createdAt: old });
  h.db.put('challenges', { _id: 'new_ch', createdAt: fresh });
  h.db.put('challenge_takers', { _id: 'old_ct', createdAt: old });
  h.db.put('challenge_takers', { _id: 'new_ct', createdAt: fresh });
  h.db.put('events', { _id: 'old_ev', ts: old });
  h.db.put('events', { _id: 'new_ev', ts: fresh });
  h.db.put('anomalies', { _id: 'old_an', ts: old, kind: 'burst' });
  h.db.put('anomalies', { _id: 'new_an', ts: cleanupT - 3600e3, kind: 'burst' });
  h.db.put('anomalies', { _id: 'new_an2', ts: cleanupT - 7200e3, kind: 'limit' });
  h.db.put('player_stats', { _id: 'old_ps', updatedAt: old });
  h.db.put('player_stats', { _id: 'new_ps', updatedAt: fresh });
  h.db.put('group_members', { _id: 'old_gm', lastSeen: '20260507' });
  h.db.put('group_members', { _id: 'edge_gm', lastSeen: '20260508' });
  h.db.put('group_members', { _id: 'new_gm', lastSeen: '20261101' });
  h.db.put('daily_stats', { _id: '20250101', solved: 1, stepsHist: [] });
  h.db.put('daily_puzzles', { _id: '20250101', answerRef: 'x' });
  h.db.put('answer_bank', { _id: 'x', used: true });
  h.db.put('answer_ranks', { _id: 'x', ranks: '' });
  h.db.put('rate_limits', { _id: 'rl_old', expireAt: cleanupT - 1 });
  h.db.put('rate_limits', { _id: 'rl_new', expireAt: cleanupT + 1000 });
}
const ids = (c) => h.db.all(c).map((d) => d._id).sort();

test('cleanup: 180-day retention, keeps aggregates and content, second run deletes nothing (AC 108)', async () => {
  h.setNow(cleanupT);
  seedData();
  const r = await h.call('cleanup', {}, {});
  assert.equal(r.ok, true);
  assert.deepEqual(ids('plays'), ['new_play']);
  assert.deepEqual(ids('challenges'), ['new_ch']);
  assert.deepEqual(ids('challenge_takers'), ['new_ct']);
  assert.deepEqual(ids('events').filter((i) => !i.startsWith('anomaly_daily')), ['new_ev']);
  assert.deepEqual(ids('anomalies'), ['new_an', 'new_an2']);
  assert.deepEqual(ids('player_stats'), ['new_ps']);
  assert.deepEqual(ids('group_members'), ['edge_gm', 'new_gm']);
  assert.deepEqual(ids('rate_limits'), ['rl_new']);
  for (const c of ['daily_stats', 'daily_puzzles', 'answer_bank', 'answer_ranks']) assert.equal(h.db.all(c).length, 1, c + ' kept');
  const before = JSON.stringify(Object.keys(h.db.cols).sort().map((c) => ids(c)));
  const r2 = await h.call('cleanup', {}, {});
  assert.equal(Object.values(r2.removed).reduce((a, b) => a + b, 0), 0);
  assert.equal(JSON.stringify(Object.keys(h.db.cols).sort().map((c) => ids(c))), before);
});

test('cleanup writes the daily anomaly roll-up once per date', async () => {
  h.setNow(cleanupT);
  seedData();
  const r = await h.call('cleanup', {}, {});
  assert.deepEqual(r.anomalies, { burst: 1, limit: 1 });
  const rolls = h.db.all('events').filter((e) => e.name === 'anomaly_daily');
  assert.equal(rolls.length, 1);
  assert.deepEqual(rolls[0].props, { burst: 1, limit: 1 });
  await h.call('cleanup', {}, {});
  assert.equal(h.db.all('events').filter((e) => e.name === 'anomaly_daily').length, 1);
});

test('cleanup deletes in batches (the server removes <= 1000 per call)', async () => {
  h.setNow(cleanupT);
  for (let i = 0; i < 2500; i++) h.db.put('events', { _id: 'e' + i, ts: cleanupT - 200 * DAY });
  const r = await h.call('cleanup', {}, {});
  assert.equal(r.removed.events, 2500);
});
