'use strict';
// Live rooms on the real functions + the fake database (spec 3A, AC 135-151). Moderation is the dev mock (MODERATION_MODE=mock); the fake WeChat
// platform tests are in moderation-sync.test.js. A controlled clock drives the deadlines.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { roomWorld, drawing } = require('./helpers/roomworld');
const sync = require('../scripts/sync-core');

const CORE = sync.DEFAULT_CORE;
const roomLib = require(path.join(CORE, 'room'));
const promptsLib = require(path.join(CORE, 'prompts'));
const copy = require(path.join(CORE, 'copy'));

async function withWorld(o, fn) {
  const w = await roomWorld(o);
  try {
    await fn(w);
  } finally {
    w.teardown();
  }
}

test('AC 135/138: createRoom makes a lobby (host = seat 1), startRoom needs the host and 3 players, R = min(n-1, 4), timers 30/60/45', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.deepEqual([c.state, c.me.seat, c.me.isHost, c.joined, c.seats.length, c.seats[0].me], ['lobby', 0, true, 1, 10, true]);
    assert.equal((await w.u.B.call('joinRoom', { roomId: c.roomId, groupRef: w.u.B.ref })).ok, true);
    assert.equal((await w.u.A.call('startRoom', { roomId: c.roomId })).code, 'NOT_ENOUGH_PLAYERS');
    assert.equal((await w.u.B.call('startRoom', { roomId: c.roomId })).code, 'NOT_HOST');
    for (const nm of ['C', 'D', 'E']) await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
    const s = await w.u.A.call('startRoom', { roomId: c.roomId });
    assert.equal(s.ok, true, JSON.stringify(s));
    const r = w.room(c.roomId);
    assert.deepEqual([r.state, r.n, r.R, r.round, r.kind], ['playing', 5, 4, 0, 'prompt']);
    assert.deepEqual(r.timers, { promptSec: 30, drawSec: 60, describeSec: 45, graceSec: 5 });
    assert.equal(r.deadline - r.roundStartAt, 30000);
    assert.equal(r.chainIds.length, 5);
    assert.equal((await w.u.A.call('startRoom', { roomId: c.roomId })).code, 'ROOM_STARTED');
  });
});

test('AC 136: joinRoom binds an unbound room, enforces the group, refuses after start / full / closed', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const unbound = await w.u.A.call('createRoom', {});
    assert.equal(w.room(unbound.roomId).openGId, null);
    assert.equal((await w.u.B.call('joinRoom', { roomId: unbound.roomId })).code, 'NEED_GROUP');
    assert.equal((await w.u.B.call('joinRoom', { roomId: unbound.roomId, groupRef: w.u.B.ref })).ok, true);
    assert.ok(w.room(unbound.roomId).openGId, 'bound to the joiner group');
    // a stranger of another group
    await w.call('agreeRules', { version: 2 }, 'Z');
    const other = await w.call('joinGroup', { cloudID: 'cid-3-group-2' }, 'Z');
    assert.equal((await w.call('joinRoom', { roomId: unbound.roomId, groupRef: other.groupRef }, 'Z')).code, 'WRONG_GROUP');
    assert.equal((await w.call('joinRoom', { roomId: unbound.roomId }, 'Z')).code, 'NEED_GROUP', 'no group context and no membership');
    assert.equal((await w.u.D.call('joinRoom', { roomId: unbound.roomId })).ok, true, 'a fresh member of the room group needs no groupRef (a rejoin from home)');
    const gone = await w.u.C.call('joinRoom', { roomId: 'ZZZZZZZZZZ', groupRef: w.u.C.ref });
    assert.equal(gone.code, 'ROOM_NOT_FOUND');
  });
});

test('AC 136: a full lobby (10) refuses; a started room refuses; a closed room refuses', async () => {
  await withWorld({ n: 12 }, async (w) => {
    const id = await w.lobby(w.names.slice(0, 10));
    assert.equal((await w.u.K.call('joinRoom', { roomId: id, groupRef: w.u.K.ref })).code, 'ROOM_FULL');
    await w.u.A.call('startRoom', { roomId: id });
    assert.equal((await w.u.K.call('joinRoom', { roomId: id, groupRef: w.u.K.ref })).code, 'ROOM_STARTED');
    const c = await w.u.K.call('createRoom', { groupRef: w.u.K.ref });
    await w.u.K.call('leaveRoom', { roomId: c.roomId });
    assert.equal(w.room(c.roomId).state, 'closed');
    assert.equal((await w.u.L.call('joinRoom', { roomId: c.roomId, groupRef: w.u.L.ref })).code, 'ROOM_CLOSED');
  });
});

test('AC 135: one room at a time: IN_OTHER_ROOM; a player in a lobby who taps 开一局 again gets the same lobby', async () => {
  await withWorld({ n: 3 }, async (w) => {
    const a = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    const again = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    assert.equal(again.roomId, a.roomId);
    assert.equal(w.rows('rooms').length, 1);
    const b = await w.u.B.call('createRoom', { groupRef: w.u.B.ref });
    const j = await w.u.A.call('joinRoom', { roomId: b.roomId, groupRef: w.u.A.ref });
    assert.equal(j.code, 'IN_OTHER_ROOM');
    assert.equal(j.otherRoomId, a.roomId);
  });
});

test('AC 143: host handover in the lobby, the last member closes the room and gives the createRoom back', async () => {
  await withWorld({ n: 3 }, async (w) => {
    const id = await w.lobby(['A', 'B', 'C']);
    assert.equal(w.player('A').day.roomsCreated, 1);
    await w.u.A.call('leaveRoom', { roomId: id });
    let r = w.room(id);
    assert.deepEqual([r.host, r.seats.map((s) => s.openid)], ['openid-B', ['openid-B', 'openid-C']]);
    const vb = await w.u.B.call('getRoom', { roomId: id });
    assert.deepEqual([vb.me.seat, vb.me.isHost, vb.joined], [0, true, 2]);
    await w.u.B.call('leaveRoom', { roomId: id });
    await w.u.C.call('leaveRoom', { roomId: id });
    r = w.room(id);
    assert.equal(r.state, 'closed');
    assert.equal(w.player('A').day.roomsCreated, 0, 'a lobby closed before the start gives the creation back');
    assert.equal((await w.u.A.call('getHome', {})).me.activeRoom, null);
  });
});

test('AC 139: rotation exhaustively for n = 3..10: nobody works on their own chain or any chain twice, each seat one chain per round', () => {
  for (let n = 3; n <= 10; n++) {
    const R = roomLib.roundsFor(n, 4);
    assert.equal(R, Math.min(n - 1, 4));
    const table = roomLib.rotationTable(n, R);
    const touched = Array.from({ length: n }, () => new Set());
    for (let r = 0; r <= R; r++) {
      assert.deepEqual([...table[r]].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i), 'each chain is worked once per round');
      for (let s = 0; s < n; s++) {
        const c = table[r][s];
        assert.equal(c, (((s - r) % n) + n) % n);
        assert.equal(roomLib.workerOfChain(c, r, n), s);
        if (r === 0) assert.equal(c, s);
        else {
          assert.notEqual(c, s, 'n=' + n + ' round ' + r + ' seat ' + s + ': own chain');
          assert.ok(!touched[s].has(c), 'n=' + n + ' seat ' + s + ' touches chain ' + c + ' twice');
          assert.equal(roomLib.sourceSeat(s, n), roomLib.workerOfChain(c, r - 1, n), 'the source is the previous round output of the same chain');
        }
        touched[s].add(c);
      }
    }
  }
});

test('AC 138/140: a full 4-player game to the reveal; every getRoom carries only the caller own assignment', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const id = await w.game(['A', 'B', 'C', 'D']);
    const r0 = w.room(id);
    assert.deepEqual([r0.n, r0.R], [4, 3]);
    // round 0: 3 prompts from 3 categories, pairwise disjoint over the room
    const seen = new Set();
    for (const nm of ['A', 'B', 'C', 'D']) {
      const v = await w.view(id, nm);
      assert.equal(v.assignment.roll.prompts.length, 3);
      assert.equal(v.assignment.roll.rerollLeft, 5);
      const cats = v.assignment.roll.prompts.map((p) => promptsLib.promptById(p.id).cat);
      assert.equal(new Set(cats).size, 3);
      for (const p of v.assignment.roll.prompts) {
        assert.ok(!seen.has(p.id), 'room-unique prompts');
        seen.add(p.id);
      }
      assert.equal(v.assignment.source, undefined);
      assert.equal(JSON.stringify(v).includes('openid-'), false, 'no openid in getRoom');
    }
    const picked = await w.pickAll(id, ['A', 'B', 'C', 'D']);
    assert.equal(picked.D.advanced, true, 'the last pick ends round 0 early');
    let r = w.room(id);
    assert.deepEqual([r.round, r.kind, r.state], [1, 'draw', 'playing']);
    // round 1: every seat sees the PROMPT of the previous seat chain
    const prompts = {};
    for (const nm of ['A', 'B', 'C', 'D']) {
      const v = await w.view(id, nm);
      assert.equal(v.assignment.source.kind, 'prompt');
      prompts[nm] = v.assignment.source.text;
    }
    const chains = w.rows('chains').filter((c) => c.mode === 'live').sort((a, b) => a.seat - b.seat);
    assert.equal(chains.length, 4);
    ['A', 'B', 'C', 'D'].forEach((nm, s) => assert.equal(prompts[nm], chains[roomLib.chainOfSeat(s, 1, 4)].promptText));
    const sent = await w.sendRound(id, ['A', 'B', 'C', 'D']);
    assert.equal(sent.D.state, 'sent');
    r = w.room(id);
    assert.deepEqual([r.round, r.kind], [2, 'describe']);
    // round 2: describe sees the DRAWING of the previous seat only
    const v2 = await w.view(id, 'C');
    assert.equal(v2.assignment.source.kind, 'draw');
    assert.equal(v2.assignment.source.strokes.v, 2);
    await w.sendRound(id, ['A', 'B', 'C', 'D'], { text: '一只猫在开出租车' });
    await w.sendRound(id, ['A', 'B', 'C', 'D']);
    r = w.room(id);
    assert.deepEqual([r.state, r.round, r.endedBy], ['reveal', 3, 'normal']);
    // everybody sees the same reveal state and version
    const versions = new Set();
    for (const nm of ['A', 'B', 'C', 'D']) {
      const v = await w.u[nm].call('getRoom', { roomId: id });
      assert.equal(v.state, 'reveal');
      versions.add(v.version);
    }
    assert.equal(versions.size, 1);
    const rv = await w.u.B.call('getRoomReveal', { roomId: id });
    assert.equal(rv.ok, true, JSON.stringify(rv));
    assert.equal(rv.cards.length, 4);
    assert.deepEqual(rv.cards.map((c) => c.mineStarted), [false, true, false, false]);
    assert.deepEqual(rv.cards.map((c) => c.finalKind), ['draw', 'draw', 'draw', 'draw']);
    // the chains are revealed and carry 3 steps
    for (const c of w.rows('chains')) {
      assert.equal(c.state, 'revealed');
      assert.equal(c.passed, 3);
    }
    const gr = await w.u.A.call('getReveal', { chainId: rv.cards[0].chainId });
    assert.equal(gr.ok, true, JSON.stringify(gr));
    assert.deepEqual(gr.steps.map((s) => s.kind), ['draw', 'describe', 'draw']);
    assert.equal(gr.mode, 'live');
  });
});

test('AC 131/130: nobody sends: at deadline + 5 s every seat gets the empty marker, the game still reaches the reveal', async () => {
  await withWorld({ n: 3 }, async (w) => {
    const id = await w.game(['A', 'B', 'C']);
    await w.pickAll(id, ['A', 'B', 'C']); // round 0 done -> round 1 (draw)
    let r = w.room(id);
    assert.equal(r.round, 1);
    // before deadline + grace the tick does nothing
    w.h.setNow(r.deadline + 4000);
    assert.equal((await w.u.A.call('roomTick', { roomId: id })).round, 1);
    w.expireRound(id);
    const t = await w.u.A.call('roomTick', { roomId: id });
    assert.equal(t.round, 2);
    const slots = w.room(id).slots['1'];
    assert.deepEqual(slots.map((s) => [s.state, s.marker]), [['marker', 'emptyDraw'], ['marker', 'emptyDraw'], ['marker', 'emptyDraw']]);
    // the next player sees the marker with the free-play line
    await w.view(id, 'B');
    const v = await w.u.B.call('getRoom', { roomId: id });
    assert.equal(v.assignment.source.kind, 'marker');
    assert.equal(v.assignment.source.text, copy.MARKERS.emptyDraw.text);
    assert.equal(v.assignment.source.hint, copy.MARKERS.emptyDraw.hint.describe);
    w.expireRound(id);
    await w.u.A.call('roomTick', { roomId: id });
    assert.equal(w.room(id).state, 'reveal');
    const g = await w.u.A.call('getReveal', { chainId: w.room(id).chainIds[0] });
    assert.deepEqual(g.steps.map((s) => s.marker), ['emptyDraw', 'emptyText']);
    assert.equal(g.steps[0].canReport, false);
    assert.equal(g.steps[0].canLaugh, false);
    // markers do not count for the daily turn cap or the streak
    assert.equal(w.player('A').day.steps, 1, 'only the round-0 pick counted');
  });
});
