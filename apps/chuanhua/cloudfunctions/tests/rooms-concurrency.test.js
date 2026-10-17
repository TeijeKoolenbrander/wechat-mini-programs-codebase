'use strict';
// Concurrency on the real room functions (spec 3A.5, AC 141, 151, edge 3, 19): the fake database runs real optimistic transactions and every operation yields, so
// Promise.all calls genuinely interleave. A round must advance EXACTLY ONCE however many callers race.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomWorld, drawing } = require('./helpers/roomworld');

const P = 'chuanhua_';
async function withWorld(o, fn) {
  const w = await roomWorld(o);
  try {
    await fn(w);
  } finally {
    w.teardown();
  }
}
const roundEvents = (w, id) => w.h.db.all(P + 'events').filter((e) => e.name === 'room_round');
const draw = (w, id, u, extra) => w.u[u].call('submitRoomStep', Object.assign({ roomId: id, round: 1, strokes: drawing(3), auto: false, empty: false }, extra || {}));

test('all seats send at the same instant: every slot resolves once, the round advances exactly once, one step document per seat', async () => {
  await withWorld({ n: 10 }, async (w) => {
    const names = w.names;
    const id = await w.game(names);
    await Promise.all(names.map((nm) => w.view(id, nm)));
    const picks = await Promise.all(names.map(async (nm) => {
      const v = await w.u[nm].call('getRoom', { roomId: id });
      return w.u[nm].call('submitRoomStep', { roomId: id, round: 0, rollId: v.assignment.roll.rollId, promptId: v.assignment.roll.prompts[0].id, auto: false, empty: false });
    }));
    assert.ok(picks.every((p) => p.ok), JSON.stringify(picks.filter((p) => !p.ok)));
    assert.equal(picks.filter((p) => p.advanced).length, 1, 'exactly one pick ended the round');
    const r1 = w.room(id);
    assert.equal(r1.round, 1);
    assert.equal(roundEvents(w, id).length, 1);
    w.h.setNow(r1.roundStartAt + 1);
    const sends = await Promise.all(names.map((nm) => draw(w, id, nm)));
    assert.ok(sends.every((s) => s.ok && s.state === 'sent'), JSON.stringify(sends.filter((s) => !s.ok)));
    assert.equal(sends.filter((s) => s.advanced).length, 1);
    const r2 = w.room(id);
    assert.equal(r2.round, 2);
    assert.equal(roundEvents(w, id).length, 2);
    assert.equal(w.rows('steps').filter((s) => s.kind === 'draw' && s.state === 'passed').length, 10);
    assert.ok(r2.version > r1.version, 'versions only grow');
    assert.ok(r2.slots['1'].every((s) => s.state === 'sent'));
  });
});

test('AC 118/164: 10 seats reroll 5 times each, all at the same instant: every set is room-unique (no prompt is shown to two seats), the 6th is refused', async () => {
  await withWorld({ n: 10 }, async (w) => {
    const names = w.names;
    const id = await w.game(names);
    const views = await Promise.all(names.map((nm) => w.view(id, nm)));
    const cur = views.map((v) => v.assignment.roll);
    const shownBy = names.map((_, i) => cur[i].prompts.map((p) => p.id));
    for (let round = 1; round <= 5; round++) {
      const out = await Promise.all(names.map((nm, i) => w.u[nm].call('rollPrompts', { roomId: id, reroll: true, rollId: cur[i].rollId })));
      out.forEach((r, i) => {
        assert.equal(r.ok, true, 'reroll ' + round + ' by ' + names[i] + ': ' + JSON.stringify(r));
        assert.equal(r.rerollLeft, 5 - round);
        cur[i] = r;
        shownBy[i].push(...r.prompts.map((p) => p.id));
      });
    }
    const all = shownBy.flat();
    assert.equal(all.length, 10 * 18);
    assert.equal(new Set(all).size, all.length, 'no prompt was shown twice in the room, in any set of any seat');
    const room = w.room(id);
    room.rolls.forEach((r, i) => assert.deepEqual([r.rerolls, r.shownIds.length, r.rollId], [5, 18, cur[i].rollId]));
    assert.equal(new Set(room.usedPrompts).size, 180);
    const sixth = await Promise.all(names.map((nm, i) => w.u[nm].call('rollPrompts', { roomId: id, reroll: true, rollId: cur[i].rollId })));
    assert.ok(sixth.every((r) => r.ok === false && r.code === 'REROLL_LIMIT' && r.rerollLeft === 0), JSON.stringify(sixth[0]));
    assert.equal(JSON.stringify(w.room(id).rolls), JSON.stringify(room.rolls), 'the refused calls wrote nothing');
  });
});

test('AC 141: 50 racing roomTick / submit / sweeper calls at the deadline produce exactly one advance', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const names = w.names;
    const id = await w.game(names);
    await w.pickAll(id, names);
    await Promise.all(names.map((nm) => w.view(id, nm)));
    // three seats sent; two are silent. The deadline + grace passes: ticks, a late send and the sweeper race.
    await Promise.all(['A', 'B', 'C'].map((nm) => draw(w, id, nm)));
    const r = w.room(id);
    assert.equal(r.round, 1);
    w.h.setNow(r.deadline + 5000 + 10001);
    const jobs = [];
    for (let i = 0; i < 20; i++) jobs.push(w.u[names[i % 5]].call('roomTick', { roomId: id }));
    for (let i = 0; i < 20; i++) jobs.push(w.u[names[i % 5]].call('getRoom', { roomId: id }));
    for (let i = 0; i < 5; i++) jobs.push(w.u.D.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: true, empty: false }));
    for (let i = 0; i < 5; i++) jobs.push(w.call('roomSweeper', {}, undefined));
    const out = await Promise.all(jobs);
    assert.ok(out.every((x) => typeof x === 'object' && typeof x.ok === 'boolean'), 'no function throws');
    const after = w.room(id);
    assert.equal(after.round, 2, 'advanced once, not twice');
    assert.equal(roundEvents(w, id).filter((e) => e.props.round === 1).length, 1);
    assert.deepEqual(after.slots['1'].map((s) => s.state), ['sent', 'sent', 'sent', 'marker', 'marker']);
    assert.equal(after.slots['1'][3].marker, 'emptyDraw');
    // the sends that raced after the deadline are either accepted (inside the grace) or ROUND_OVER: never both a step and a marker
    const dSteps = w.rows('steps').filter((s) => s.author === 'openid-D' && s.kind === 'draw');
    assert.ok(dSteps.length === 0 || after.slots['1'][3].state === 'sent');
  });
});

test('a double tap: 10 simultaneous sends of one seat store ONE step; the others answer ALREADY_SENT or the same success; the slot resolves once', async () => {
  await withWorld({ n: 3 }, async (w) => {
    const id = await w.game(['A', 'B', 'C']);
    await w.pickAll(id, ['A', 'B', 'C']);
    await w.view(id, 'A');
    const outs = await Promise.all(Array.from({ length: 10 }, () => draw(w, id, 'A')));
    const ok = outs.filter((o) => o.ok);
    assert.equal(ok.length, 1, JSON.stringify(outs.map((o) => o.code || o.state)));
    assert.ok(outs.filter((o) => !o.ok).every((o) => o.code === 'ALREADY_SENT'));
    assert.equal(w.rows('steps').filter((s) => s.author === 'openid-A' && s.kind === 'draw').length, 1);
    assert.equal(w.player('A').day.steps, 2, 'the pick and the drawing: counted once each');
  });
});

test('leave mid-round racing the others sending: the round still ends once and every seat is accounted for', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const names = w.names;
    const id = await w.game(names);
    await w.pickAll(id, names);
    await Promise.all(names.map((nm) => w.view(id, nm)));
    const jobs = [
      w.u.F.call('leaveRoom', { roomId: id }),
      w.u.E.call('leaveRoom', { roomId: id }),
      ...['A', 'B', 'C', 'D'].map((nm) => draw(w, id, nm)),
      w.u.A.call('roomTick', { roomId: id }),
    ];
    const out = await Promise.all(jobs);
    assert.ok(out.every((x) => typeof x.ok === 'boolean'));
    const r = w.room(id);
    assert.equal(r.round, 2, 'advanced once');
    assert.equal(roundEvents(w, id).filter((e) => e.props.round === 1).length, 1);
    assert.deepEqual(r.seats.map((s) => s.status), ['active', 'active', 'active', 'active', 'left', 'left']);
    assert.deepEqual(r.slots['1'].map((s) => s.state), ['sent', 'sent', 'sent', 'sent', 'marker', 'marker']);
    assert.deepEqual(r.slots['2'].slice(4).map((s) => s.marker), ['emptyText', 'emptyText'], 'later rounds of the leavers are pre-filled');
  });
});

test('12 players racing for a lobby of 10: exactly 10 seats; a full lobby refuses the rest', async () => {
  await withWorld({ n: 13 }, async (w) => {
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    const rest = w.names.slice(1);
    const joins = await Promise.all(rest.map((nm) => w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref })));
    assert.equal(joins.filter((j) => j.ok).length, 9);
    assert.equal(joins.filter((j) => j.code === 'ROOM_FULL').length, 3);
    const room = w.room(c.roomId);
    assert.equal(room.seats.length, 10);
    assert.equal(new Set(room.seats.map((s) => s.openid)).size, 10);
  });
});

test('start racing joins: the seats at the start are exactly the seats of the game; nobody is half-in', async () => {
  await withWorld({ n: 8 }, async (w) => {
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    for (const nm of ['B', 'C', 'D']) await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
    const jobs = [w.u.A.call('startRoom', { roomId: c.roomId }), ...['E', 'F', 'G', 'H'].map((nm) => w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref }))];
    const out = await Promise.all(jobs);
    assert.equal(out[0].ok, true, JSON.stringify(out[0]));
    const room = w.room(c.roomId);
    assert.equal(room.state, 'playing');
    assert.equal(room.n, room.seats.length);
    const joined = out.slice(1).filter((x) => x.ok).length;
    assert.equal(room.n, 4 + joined);
    for (const x of out.slice(1)) if (!x.ok) assert.equal(x.code, 'ROOM_STARTED');
    assert.equal(w.rows('chains').filter((ch) => ch.roomId === c.roomId).length, room.n, 'one live chain per seat');
    assert.equal(room.chainIds.length, room.n);
    assert.equal(room.rolls.length, room.n);
    // the seats that joined too late are not in the game and hold no seat anywhere
    for (const nm of ['E', 'F', 'G', 'H']) {
      const inGame = room.seats.some((s) => s.openid === 'openid-' + nm);
      assert.equal((await w.u[nm].call('getHome', {})).me.activeRoom !== null, inGame);
    }
  });
});

test('AC 151: five members press 再来一局 at once: one new room, every one of them seated in it, bound to the same group', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const names = w.names;
    const id = await w.game(names);
    await w.pickAll(id, names);
    for (let i = 0; i < 4; i++) {
      await w.sendRound(id, names);
      if (i === 3) break;
    }
    // finish quickly through expiry whatever remains
    for (let k = 0; k < 6 && w.room(id).state === 'playing'; k++) {
      w.expireRound(id);
      await w.u.A.call('roomTick', { roomId: id });
    }
    assert.equal(w.room(id).state, 'reveal');
    const out = await Promise.all(names.map((nm) => w.u[nm].call('rematch', { roomId: id })));
    assert.ok(out.every((x) => x.ok), JSON.stringify(out.filter((x) => !x.ok)));
    assert.equal(new Set(out.map((x) => x.roomId)).size, 1);
    assert.equal(out.filter((x) => x.created).length, 1);
    const fresh = w.rows('rooms').filter((r) => r.state === 'lobby');
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].seats.length, 5);
    assert.equal(fresh[0].openGId, w.room(id).openGId);
    assert.equal(w.room(id).rematchRoomId, fresh[0]._id);
    assert.equal(names.reduce((n, nm) => n + w.player(nm).day.roomsCreated, 0), 2, 'the game and exactly one rematch were created');
  });
});

test('lobby churn: simultaneous leaves keep host and seats consistent; the last one out closes the room once', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const names = w.names;
    const id = await w.lobby(names);
    await Promise.all(['A', 'B', 'C'].map((nm) => w.u[nm].call('leaveRoom', { roomId: id })));
    let r = w.room(id);
    assert.deepEqual(r.seats.map((s) => s.openid).sort(), ['openid-D', 'openid-E', 'openid-F']);
    assert.equal(r.host, 'openid-D');
    await Promise.all(['D', 'E', 'F'].map((nm) => w.u[nm].call('leaveRoom', { roomId: id })));
    r = w.room(id);
    assert.deepEqual([r.state, r.seats.length, r.endedBy], ['closed', 0, 'empty']);
    assert.equal(w.player('A').day.roomsCreated, 0, 'the creation came back once');
    assert.equal(w.h.db.all(P + 'events').filter((e) => e.name === 'room_close').length, 1);
  });
});
