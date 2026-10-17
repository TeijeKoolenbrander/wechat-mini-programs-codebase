'use strict';
// QA rev. 2 (independent), part 3: CONTENTION. The developers saw one load-sensitive failure per full `npm test` run, a different one each time (the host's startRoom racing joins;
// ten seats sending at the same instant). QA verdict (docs/chuanhua/qa/bugs.md QA-R2-2): NOT a test-harness timing artefact. Both are REAL bounded-retry limits of the product code:
//   - `common/store.js#txn` gives a transaction 8 attempts; ten seats writing the one `rooms` document need up to ten commit rounds (first committer wins),
//   - `startRoom` re-rolls at most 4 times when the lobby changes underneath it, then answers INTERNAL.
// CPU load only changes the interleaving. The tests below make the schedules deterministic and mark the failing ones `todo` (open bug). Delete `todo` when the owner fixes them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomWorld, drawing } = require('./helpers/roomworld');

const P = 'chuanhua_';
async function withWorld(o, fn) {
  const w = await roomWorld(o);
  const unhandled = [];
  const ce = console.error;
  const wrapped = (...a) => {
    if (a[0] === 'unhandled') unhandled.push(String(a[1]).trim());
    else ce(...a);
  };
  console.error = wrapped;
  try {
    await fn(w, unhandled);
  } finally {
    console.error = ce;
    w.teardown();
  }
}
const conflict = () => Object.assign(new Error('database.transaction:fail -503000 transaction write conflict'), { errCode: -503000 });

test('QA-R2-2a: nine seats send at the same instant under a zero-jitter schedule: nobody gets INTERNAL (a send that exhausts its 8 transaction attempts is lost)', async () => {
  const realRandom = Math.random;
  Math.random = () => 0; // the retry jitter of store.txn: with no spread the losers collide again in every wave
  try {
    await withWorld({ n: 9 }, async (w, unhandled) => {
      const names = w.names;
      const id = await w.game(names);
      await Promise.all(names.map((nm) => w.view(id, nm)));
      const picks = await Promise.all(names.map(async (nm) => {
        const v = await w.u[nm].call('getRoom', { roomId: id });
        return w.u[nm].call('submitRoomStep', { roomId: id, round: 0, rollId: v.assignment.roll.rollId, promptId: v.assignment.roll.prompts[0].id, auto: false, empty: false });
      }));
      assert.deepEqual(picks.filter((p) => !p.ok).map((p) => p.code), [], 'round 0 sends: ' + JSON.stringify(unhandled.slice(0, 2)));
    });
  } finally {
    Math.random = realRandom;
  }
});

test('QA-R2-2b: a phase-C failure (the resolving transaction keeps conflicting) must not strand the slot: the seat can resend at once, the passed drawing is not silently replaced by 「（这一棒没传过来）」', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.view(id, 'A');
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    let failC = true;
    db.runTransaction = (fn, times) => orig(async (tx) => {
      const r = await fn(tx);
      // the resolving transaction of A: it writes the room with slot 1/A no longer `received`
      const writesRoom = [...tx.writes.values()].find((x) => x.name === P + 'rooms' && x.doc && x.doc.slots && x.doc.slots['1'] && x.doc.slots['1'][0].state !== 'received' && x.doc.slots['1'][0].state !== 'none');
      if (failC && writesRoom) throw conflict();
      return r;
    }, times);
    const first = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: false, empty: false });
    assert.equal(first.ok, false);
    failC = false; // the platform recovers a moment later
    w.h.advance(1000); // the client retries every second
    const retry = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: false, empty: false });
    assert.equal(retry.ok, true, 'the retry after a failed resolve must be accepted, got ' + JSON.stringify(retry) + ' (slot ' + w.room(id).slots['1'][0].state + ')');
  });
});

test('QA-R2-2c: the host starts while members are joining: 开始 never answers INTERNAL (a start that is overtaken by 4 joins in a row is retried a bounded number of times, then INTERNAL)', async () => {
  await withWorld({ n: 9 }, async (w) => {
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    for (const nm of ['B', 'C', 'D']) await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
    // make every join land between the host's roll and its commit: the version moves under every attempt
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    const joiners = ['E', 'F', 'G', 'H', 'I'];
    let k = 0;
    let injecting = false;
    db.runTransaction = async (fn, times) => {
      const isStart = String(fn).includes('startBlock') && String(fn).includes('newLiveChain');
      if (isStart && !injecting && k < joiners.length) {
        injecting = true;
        const nm = joiners[k++];
        await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref }); // a join lands between the host's roll and its commit
        injecting = false;
      }
      return orig(fn, times);
    };
    const out = await w.u.A.call('startRoom', { roomId: c.roomId });
    assert.equal(out.ok, true, 'startRoom while 5 players join one after another: ' + JSON.stringify(out));
  });
});

test('3A.9 / 3.9: the SAME player racing itself: 3 simultaneous createRoom, 3 simultaneous joinRoom, createRoom racing joinRoom, double start / leave: one seat, one room, one count, never two rooms at once', async () => {
  await withWorld({ n: 6 }, async (w, unhandled) => {
    // 3 createRoom at once
    const c = await Promise.all([1, 2, 3].map(() => w.u.A.call('createRoom', { groupRef: w.u.A.ref })));
    assert.ok(c.every((x) => x.ok), JSON.stringify(c));
    const lobbies = w.rows('rooms').filter((r) => r.state === 'lobby' && r.seats.some((s) => s.openid === 'openid-A'));
    assert.equal(lobbies.length, 1, 'three taps on 开一局 made ' + lobbies.length + ' rooms');
    assert.equal(w.player('A').day.roomsCreated, 1, 'and counted ' + w.player('A').day.roomsCreated);
    const id = lobbies[0]._id;
    // 3 simultaneous joins by B
    const j = await Promise.all([1, 2, 3].map(() => w.u.B.call('joinRoom', { roomId: id, groupRef: w.u.B.ref })));
    assert.ok(j.every((x) => x.ok), JSON.stringify(j));
    assert.equal(w.room(id).seats.filter((s) => s.openid === 'openid-B').length, 1, 'B holds one seat');
    assert.equal(w.player('B').day.roomsJoined, 1);
    // C creates its own room while joining A's room at the same moment: it may end up in only one of them
    const both = await Promise.all([w.u.C.call('createRoom', { groupRef: w.u.C.ref }), w.u.C.call('joinRoom', { roomId: id, groupRef: w.u.C.ref })]);
    const seated = w.rows('rooms').filter((r) => ['lobby', 'playing'].includes(r.state) && r.seats.some((s) => s.openid === 'openid-C'));
    assert.equal(seated.length, 1, 'C is seated in ' + seated.length + ' rooms at once: ' + JSON.stringify(both.map((x) => x.ok || x.code)));
    // start x3 by the host with enough players, leave x2
    await w.u.D.call('joinRoom', { roomId: id, groupRef: w.u.D.ref });
    const st = await Promise.all([1, 2, 3].map(() => w.u.A.call('startRoom', { roomId: id })));
    assert.equal(st.filter((x) => x.ok).length >= 1, true, JSON.stringify(st));
    assert.equal(w.rows('chains').filter((x) => x.roomId === id).length, w.room(id).n, 'one set of chains');
    assert.equal(w.rows('events').filter((e) => e.name === 'room_start').length >= 1, true);
    assert.deepEqual(unhandled.filter((u) => !/conflict/.test(u)), [], 'no unexpected exception');
  });
});
