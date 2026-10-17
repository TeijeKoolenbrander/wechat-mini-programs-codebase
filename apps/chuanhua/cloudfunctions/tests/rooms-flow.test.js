'use strict';
// Rooms: the pieces around the game (entry states, group list, home, the lobby hint, the card, admin ops, retention, the server-only bank), on the real functions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { roomWorld } = require('./helpers/roomworld');
const sync = require('../scripts/sync-core');

const P = 'chuanhua_';
async function withWorld(o, fn) {
  const w = await roomWorld(o);
  try {
    await fn(w);
  } finally {
    w.teardown();
  }
}
const admin = (w, ev, openid) => w.h.call('admin', ev, openid ? { openid } : {});

test('entry states of a non-member: joinable, full, started, inOtherRoom, rulesRequired, restricted, capReached, ugcPaused, closed, removed, teaser', async () => {
  await withWorld({ n: 13 }, async (w) => {
    const id = await w.lobby(['A', 'B', 'C']);
    const entry = (u, extra) => w.u[u].call('getRoom', Object.assign({ roomId: id, groupRef: w.u[u].ref }, extra || {}));
    assert.equal((await entry('D')).entryState, 'joinable');
    const other = await w.u.E.call('createRoom', { groupRef: w.u.E.ref });
    const inOther = await entry('E');
    assert.deepEqual([inOther.entryState, inOther.otherRoomId], ['inOtherRoom', other.roomId]);
    await w.call('agreeRules', { version: 2 }, 'Q');
    const j = await w.call('joinGroup', { cloudID: 'cid-3-group-1' }, 'Q');
    assert.equal((await w.call('getRoom', { roomId: id, groupRef: j.groupRef }, 'Q')).entryState, 'joinable');
    // fresh player without the rules
    const j2 = await w.call('joinGroup', { cloudID: 'cid-3-group-1' }, 'R');
    assert.equal((await w.call('getRoom', { roomId: id, groupRef: j2.groupRef }, 'R')).entryState, 'rulesRequired');
    w.patchPlayer('D', (p) => { p.restrictedUntil = w.h.now() + 5000; });
    assert.equal((await entry('D')).entryState, 'restricted');
    w.patchPlayer('D', (p) => { p.restrictedUntil = 0; p.day.roomsJoined = 30; });
    assert.equal((await entry('D')).entryState, 'capReached');
    w.patchPlayer('D', (p) => { p.day.roomsJoined = 0; });
    w.h.db.put(P + 'app_config', { _id: 'live', ugc: { createEnabled: false, viewEnabled: true } });
    w.h.resetCaches();
    assert.equal((await entry('D')).entryState, 'ugcPaused');
    w.h.db.put(P + 'app_config', { _id: 'live' });
    w.h.resetCaches();
    await w.u.A.call('startRoom', { roomId: id });
    const started = await entry('D');
    assert.deepEqual([started.entryState, started.joined, started.member], ['started', 3, false]);
    assert.equal(JSON.stringify(started).includes('openid-'), false);
    // closed / removed
    const lob = await w.u.D.call('createRoom', { groupRef: w.u.D.ref });
    await w.u.D.call('leaveRoom', { roomId: lob.roomId });
    assert.equal((await w.u.B.call('getRoom', { roomId: lob.roomId, groupRef: w.u.B.ref })).entryState, 'closed');
    const rem = await admin(w, { op: 'removeRoom', roomId: id });
    assert.deepEqual([rem.ok, rem.removed, rem.was], [true, true, 'playing']);
    assert.equal((await entry('E')).entryState, 'removed');
    assert.equal((await w.u.A.call('getRoom', { roomId: id })).state, 'removed');
    assert.ok(w.rows('chains').filter((c) => c.roomId === id || c.mode === 'live').every((c) => c.state === 'removed'));
    assert.equal((await w.u.A.call('getRoomReveal', { roomId: id })).code, 'ROOM_CLOSED');
    assert.ok(w.h.db.all(P + 'audit_log').some((a) => a.op === 'removeRoom' && a.target === id));
    assert.equal((await admin(w, { op: 'removeRoom', roomId: 'ZZZZZZZZZZ' })).code, 'ROOM_NOT_FOUND');
    assert.equal((await admin(w, { op: 'removeRoom', roomId: 'x' })).code, 'BAD_REQUEST');
    assert.equal((await admin(w, { op: 'removeRoom', roomId: id }, 'openid-A')).code, 'FORBIDDEN');
  });
});

test('a full lobby (10) shows `full` to a stranger of the group; the card count and started state go to the updatable message', async () => {
  await withWorld({ n: 12, env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } }, async (w) => {
    w.h.db.put(P + 'app_config', { _id: 'live', features: { updatableCard: true } });
    w.h.resetCaches();
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    const act = await w.u.A.call('getRoom', { roomId: c.roomId, wantActivity: true });
    assert.match(act.activityId, /^act-/, 'created lazily on the first share');
    assert.equal((await w.u.A.call('getRoom', { roomId: c.roomId, wantActivity: true })).activityId, act.activityId);
    assert.equal((await w.u.B.call('getRoom', { roomId: c.roomId, wantActivity: true, groupRef: w.u.B.ref })).activityId, undefined, 'members only');
    for (const nm of w.names.slice(1, 10)) await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
    const e = await w.u.K.call('getRoom', { roomId: c.roomId, groupRef: w.u.K.ref });
    assert.deepEqual([e.entryState, e.joined], ['full', 10]);
    const sets = w.h.calls.filter((x) => x.api === 'updatableMessage.setUpdatableMsg');
    assert.equal(sets.length, 9, 'one update per join');
    assert.deepEqual(sets[8].params.templateInfo.parameterList, [{ name: 'member_count', value: '10' }, { name: 'room_limit', value: '10' }]);
    assert.equal(sets[8].params.targetState, 0);
    await w.u.A.call('startRoom', { roomId: c.roomId });
    const last = w.h.calls.filter((x) => x.api === 'updatableMessage.setUpdatableMsg').pop();
    assert.equal(last.params.targetState, 1, 'started');
    await w.u.J.call('leaveRoom', { roomId: c.roomId });
    assert.equal(w.h.calls.filter((x) => x.api === 'updatableMessage.setUpdatableMsg').length, 10, 'leaving a game in progress does not touch the card');
    // a failing platform never blocks
    w.h.handle('updatableMessage.setUpdatableMsg', async () => { throw new Error('card down'); });
    const c2 = await w.u.K.call('createRoom', { groupRef: w.u.K.ref });
    assert.equal(c2.ok, true);
    assert.equal((await w.u.L.call('joinRoom', { roomId: c2.roomId, groupRef: w.u.L.ref })).ok, true);
  });
});

test('the lobby hint: a seat silent for more than 60 s is `quiet` for the others; getRoom refreshes lastSeenAt (at most every 30 s)', async () => {
  await withWorld({ n: 3 }, async (w) => {
    const id = await w.lobby(['A', 'B', 'C']);
    w.h.advance(70e3);
    let v = await w.u.A.call('getRoom', { roomId: id });
    assert.deepEqual(v.seats.slice(0, 3).map((s) => s.quiet), [false, true, true], 'B and C are silent, A is the caller');
    const before = w.room(id).version;
    v = await w.u.B.call('getRoom', { roomId: id });
    assert.equal(w.room(id).seats[1].lastSeenAt, w.h.now());
    assert.equal(w.room(id).version, before, 'presence is no state change: no signal');
    v = await w.u.A.call('getRoom', { roomId: id });
    assert.deepEqual(v.seats.slice(0, 3).map((s) => s.quiet), [false, false, true]);
    assert.equal(v.seats.length, 10);
    assert.deepEqual(v.seats.slice(3).map((s) => s.filled), new Array(7).fill(false));
  });
});

test('getHome / getGroupChains: the group line (open lobby), 回到这一局, rooms in the list and the stats', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    const hb = await w.u.B.call('getHome', { groupRef: w.u.B.ref });
    assert.deepEqual(hb.group, { openRoom: { roomId: c.roomId, joined: 1 }, waitingChains: 0 });
    assert.deepEqual(hb.me.activeRoom, null);
    const ha = await w.u.A.call('getHome', {});
    assert.deepEqual(ha.me.activeRoom, { roomId: c.roomId, state: 'lobby', round: null, rounds: 0 });
    assert.equal((await w.call('getHome', { groupRef: w.u.A.ref }, 'Zed')).group, null, 'no membership: no group line');
    for (const nm of ['B', 'C']) await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
    const gl = await w.u.D.call('getGroupChains', { groupRef: w.u.D.ref });
    assert.deepEqual(gl.rooms.map((r) => [r.kind, r.state, r.joined, r.joinable, r.member]), [['room', 'lobby', 3, true, false]]);
    await w.u.A.call('startRoom', { roomId: c.roomId });
    const gl2 = await w.u.D.call('getGroupChains', { groupRef: w.u.D.ref });
    assert.deepEqual(gl2.rooms.map((r) => [r.state, r.round, r.rounds, r.joinable]), [['playing', 0, 2, false]]);
    assert.equal((await w.u.B.call('getHome', {})).me.activeRoom.state, 'playing');
    assert.equal(JSON.stringify(gl2).includes('openid-'), false);
    assert.equal((await w.u.D.call('getHome', { groupRef: w.u.D.ref })).group.openRoom, null, 'a playing room is not joinable');
    assert.equal(gl2.waiting.length + gl2.inProgress.length, 0, 'live chains are never listed as chains');
  });
});

test('claims and rooms exclude each other: IN_ROOM for a claim while seated in a playing room, IN_CLAIM for a room while holding a claim; live chains are never claimable', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const roll = await w.u.D.call('rollPrompts', {});
    const ch = await w.u.D.call('createChain', { rollId: roll.rollId, promptId: roll.prompts[0].id, groupRef: w.u.D.ref });
    assert.equal(ch.ok, true);
    assert.equal((await w.u.D.call('createRoom', {})).code, 'IN_CLAIM');
    const lob = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    assert.equal((await w.u.D.call('joinRoom', { roomId: lob.roomId, groupRef: w.u.D.ref })).code, 'IN_CLAIM');
    await w.u.D.call('releaseClaim', { chainId: ch.chainId, claimId: ch.claim.claimId });
    for (const nm of ['B', 'C']) await w.u[nm].call('joinRoom', { roomId: lob.roomId, groupRef: w.u[nm].ref });
    await w.u.A.call('startRoom', { roomId: lob.roomId });
    // another player's open chain: A (seated, playing) cannot claim
    const r2 = await w.u.D.call('rollPrompts', {});
    const c2 = await w.u.D.call('createChain', { rollId: r2.rollId, promptId: r2.prompts[0].id, groupRef: w.u.D.ref });
    await w.u.D.call('submitStep', { chainId: c2.chainId, claimId: c2.claim.claimId, strokes: { v: 2, h: 1024, s: [[0, 0, 5, 5, 3, 3]] }, auto: false, empty: false });
    const e = await w.u.A.call('getChain', { chainId: c2.chainId, groupRef: w.u.A.ref });
    assert.equal(e.state, 'inRoom');
    assert.equal((await w.u.A.call('claimStep', { chainId: c2.chainId, groupRef: w.u.A.ref })).code, 'IN_ROOM');
    assert.equal((await w.u.A.call('createChain', { rollId: 'x', promptId: 'A01' })).code, 'IN_ROOM');
    assert.equal((await w.u.B.call('leaveRoom', { roomId: lob.roomId })).ok, true);
    assert.equal((await w.u.B.call('claimStep', { chainId: c2.chainId, groupRef: w.u.B.ref })).ok, true, 'after leaving the game');
    // the live chains of the room itself
    const live = w.rows('chains').find((c) => c.mode === 'live');
    assert.equal((await w.u.C.call('claimStep', { chainId: live._id, groupRef: w.u.C.ref })).code, 'CHAIN_CLOSED');
    assert.equal((await w.u.C.call('getChain', { chainId: live._id, groupRef: w.u.C.ref })).state, 'notFound');
    assert.equal(w.rows('chains').filter((c) => c.mode === 'live').length, 3);
  });
});

test('admin setModeration / removeRoom validation; async finishes the games in play and closes lobbies at once; sample can filter live steps', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const g = await w.game(['A', 'B', 'C']);
    const lob = await w.u.D.call('createRoom', { groupRef: w.u.D.ref });
    await w.pickAll(g, ['A', 'B', 'C']);
    await w.sendRound(g, ['A', 'B']);
    assert.equal((await admin(w, { op: 'setModeration' })).code, 'BAD_REQUEST');
    assert.equal((await admin(w, { op: 'setModeration', imageMode: 'fast' })).code, 'BAD_REQUEST');
    assert.equal((await admin(w, { op: 'setModeration', textApi: 'x' })).code, 'BAD_REQUEST');
    assert.equal((await admin(w, { op: 'setModeration', imageMode: 'async' }, 'openid-A')).code, 'FORBIDDEN');
    const live = await admin(w, { op: 'sample', n: 10, mode: 'live' });
    assert.ok(live.items.length >= 1 && live.items.every((i) => i.kind === 'draw'));
    assert.equal((await admin(w, { op: 'sample', n: 10, mode: 'chain' })).items.length, 0);
    assert.equal((await admin(w, { op: 'sample', mode: 'x' })).code, 'BAD_REQUEST');
    const r = await admin(w, { op: 'setModeration', imageMode: 'async' });
    assert.deepEqual([r.ok, r.roomsFinished, r.lobbiesClosed, r.moderation.imageMode], [true, 1, 1, 'async'], JSON.stringify(r));
    assert.deepEqual([w.room(g).state, w.room(g).endedBy], ['reveal', 'switch']);
    assert.equal(w.room(lob.roomId).state, 'closed');
    assert.equal(w.player('D').day.roomsCreated, 0);
    w.h.resetCaches();
    assert.equal((await w.u.E.call('createRoom', {})).code, 'LIVE_OFF');
    assert.equal((await w.u.A.call('getRoomReveal', { roomId: g })).ok, true);
    const back = await admin(w, { op: 'setModeration', imageMode: 'sync', textApi: 'general' });
    assert.deepEqual(back.moderation, { imageMode: 'sync', textApi: 'general' });
    assert.equal(w.h.db.all(P + 'audit_log').filter((a) => a.op === 'setModeration').length, 2);
  });
});

test('AC 69: cleanup deletes rooms, live chains, steps and PNGs after 180 days and keeps the recent ones; roomSweeper deletes closed lobbies and signals after 1 day', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const g = await w.game(['A', 'B', 'C']);
    await w.pickAll(g, ['A', 'B', 'C']);
    await w.sendRound(g, ['A', 'B', 'C']);
    await w.sendRound(g, ['A', 'B', 'C']);
    assert.equal(w.room(g).state, 'reveal');
    const files = [...w.h.files.keys()];
    assert.ok(files.length >= 3, 'the moderation PNGs');
    const lob = await w.u.D.call('createRoom', { groupRef: w.u.D.ref });
    await w.u.D.call('leaveRoom', { roomId: lob.roomId });
    assert.equal(w.room(lob.roomId).state, 'closed');
    // 1 day later: the closed lobby and the signals go, the finished game stays
    w.h.advance(25 * 3600e3);
    const sw = await w.call('roomSweeper', {}, undefined);
    assert.equal(sw.ok, true);
    assert.equal(w.room(lob.roomId), null);
    assert.equal(w.rows('room_signals').length, 0);
    assert.equal(w.room(g).signalsGone, true);
    const before = await w.call('cleanup', {}, undefined);
    assert.equal(before.removed.rooms, 0);
    assert.equal(w.room(g).state, 'reveal');
    // 181 days later
    w.h.advance(181 * 86400e3);
    const out = await w.call('cleanup', {}, undefined);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.removed.rooms, 1);
    assert.equal(out.removed.chains, 3);
    assert.ok(out.removed.steps >= 6);
    assert.equal(w.rows('rooms').length, 0);
    assert.equal(w.rows('chains').length, 0);
    assert.equal(w.rows('steps').length, 0);
    assert.equal(w.h.files.size, 0, 'no orphaned PNG: the sync traces and the steps were both deleted');
    assert.equal(w.rows('mod_traces').length, 0);
    const again = await w.call('cleanup', {}, undefined);
    assert.equal(again.removed.rooms, 0, 'idempotent');
  });
});

test('the prompt bank is server-only: only the `bank` functions carry it, no other function folder contains bank text, and none requires it', () => {
  const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));
  const v2 = require(path.join(sync.DEFAULT_CORE, 'content', 'prompts.v2'));
  const sample = v2.prompts.filter((_, i) => i % 50 === 0).map((p) => p.text).filter((t) => t.length >= 5);
  assert.ok(sample.length > 20);
  for (const fn of sync.listFunctions()) {
    const hasBank = fs.existsSync(path.join(sync.CF_ROOT, fn, 'core', 'prompts.js'));
    assert.equal(hasBank, !!schema.FUNCTIONS[fn].bank, fn);
    for (const f of schema.BANK_FILES) assert.equal(fs.existsSync(path.join(sync.CF_ROOT, fn, 'core', f)), !!schema.FUNCTIONS[fn].bank, fn + '/' + f);
    if (!hasBank) {
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
      for (const file of walk(path.join(sync.CF_ROOT, fn)).filter((x) => x.endsWith('.js') && !/node_modules/.test(x))) {
        const src = fs.readFileSync(file, 'utf8');
        assert.ok(sample.filter((t) => src.includes(t)).length <= 1, fn + ': ' + path.relative(sync.CF_ROOT, file) + ' carries bank text');
      }
    }
  }
  // every function's static requires resolve inside its own folder (a bank-less folder never requires the bank at load time)
  for (const fn of sync.listFunctions()) {
    const src = fs.readFileSync(path.join(sync.CF_ROOT, fn, 'index.js'), 'utf8');
    for (const m of src.matchAll(/require\('(\.\/[^']+)'\)/g)) {
      const target = path.join(sync.CF_ROOT, fn, m[1]);
      assert.ok(fs.existsSync(target) || fs.existsSync(target + '.js'), fn + ' requires ' + m[1]);
    }
  }
  const bankUsers = ['createChain', 'rollPrompts', 'startRoom', 'getRoom', 'submitRoomStep', 'roomTick', 'roomSweeper', 'leaveRoom', 'getRoomReveal', 'getReveal', 'admin'];
  for (const fn of bankUsers) assert.ok(schema.FUNCTIONS[fn].bank, fn + ' needs the bank');
});
