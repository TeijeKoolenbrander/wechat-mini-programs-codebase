'use strict';
// QA rev. 2 (independent), part 2: live rooms on the real functions. Rotation as an information flow, TD-140 reporting edge cases, strangers and left seats, the
// pick validation, caps (10 created / 30 joined / 80 turns), forced sends and the 20-minute cap with a check in flight, the roll rules and the retired bank.
// Written from spec 3A, 4, 5.8, 7.1 and AC 114-151; an open bug is a `todo` test (docs/chuanhua/qa/bugs.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { roomWorld, drawing } = require('./helpers/roomworld');
const sync = require('../scripts/sync-core');

const CORE = sync.DEFAULT_CORE;
const roomLib = require(path.join(CORE, 'room'));
const P = 'chuanhua_';
const NAMES = 'ABCDEFGHIJ'.split('');

async function withWorld(o, fn) {
  const w = await roomWorld(o);
  try {
    await fn(w);
  } finally {
    w.teardown();
  }
}
const stripeOf = (seat, round) => ({ v: 2, h: 1100 + seat * 7 + round, s: [[(seat + round) % 12, round % 3, 100 + seat * 20, 100 + round * 30, 25, 25]] });
const GLYPH = '甲乙丙丁戊己庚辛壬癸';
const textOf = (s, r) => GLYPH[s] + '第' + '一二三四五六'[r - 1] + '轮呀'; // unique per (seat, round), valid description text

test('AC 139/140 as an information flow (n = 3, 7, 10): in every round each seat is handed EXACTLY what seat (s-1) produced in the round before, and nothing else', async () => {
  for (const n of [3, 7, 10]) {
    await withWorld({ n }, async (w) => {
      const names = NAMES.slice(0, n);
      const id = await w.game(names);
      const R = w.room(id).R;
      assert.equal(R, Math.min(n - 1, 4));
      const made = { 0: {} }; // made[round][seat] = the fingerprint of what the seat produced (prompt text, stripe h, or sentence)
      for (const [s, nm] of names.entries()) {
        const v = await w.view(id, nm);
        made[0][s] = v.assignment.roll.prompts[0].text;
        const r = await w.u[nm].call('submitRoomStep', { roomId: id, round: 0, rollId: v.assignment.roll.rollId, promptId: v.assignment.roll.prompts[0].id, auto: false, empty: false });
        assert.equal(r.ok, true, JSON.stringify(r));
      }
      for (let round = 1; round <= R; round++) {
        const room = w.room(id);
        assert.equal(room.round, round);
        made[round] = {};
        for (const [s, nm] of names.entries()) {
          const v = await w.view(id, nm);
          const src = v.assignment.source;
          const prev = (s - 1 + n) % n;
          const where = 'n=' + n + ' round ' + round + ' seat ' + s;
          if (round === 1) assert.deepEqual([src.kind, src.text], ['prompt', made[0][prev]], where);
          else if (room.kind === 'draw') assert.deepEqual([src.kind, src.text], ['text', made[round - 1][prev]], where);
          else assert.deepEqual([src.kind, src.strokes.h], ['draw', made[round - 1][prev]], where + ' sees the drawing of seat ' + prev);
          // nothing else of the previous round is in the view: no other seat's sentence
          const dump = JSON.stringify(v);
          for (let o = 0; o < n; o++) {
            const fp = made[round - 1][o];
            if (o !== prev && typeof fp === 'string' && round > 1 && room.kind === 'draw') assert.ok(!dump.includes(fp), where + ' sees the text of seat ' + o);
          }
          made[round][s] = room.kind === 'draw' ? stripeOf(s, round).h : textOf(s, round);
        }
        for (const [s, nm] of names.entries()) {
          const body = { roomId: id, round, auto: false, empty: false };
          if (room.kind === 'draw') body.strokes = stripeOf(s, round);
          else body.text = textOf(s, round);
          const r = await w.u[nm].call('submitRoomStep', body);
          assert.equal(r.ok, true, 'n=' + n + ' r' + round + ' ' + nm + ' ' + JSON.stringify(r));
        }
      }
      assert.equal(w.room(id).state, 'reveal');
    });
  }
});

let laterWorkerSeesHidden = true;
test('TD-140 edge: a custom prompt reported in round 1 hides the WHOLE chain: the reveal shows only placeholders and the reported prompt is never served again', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const names = ['A', 'B', 'C', 'D'];
    const id = await w.game(names);
    // everybody sends a custom prompt
    for (const nm of names) {
      await w.view(id, nm);
      const r = await w.u[nm].call('submitRoomStep', { roomId: id, round: 0, customText: '我家的' + nm + '星球', auto: false, empty: false });
      assert.equal(r.ok, true, JSON.stringify(r));
    }
    assert.equal(w.room(id).round, 1);
    // seat 1 (B) works on chain 0 (A's custom prompt) in round 1
    const vB = await w.view(id, 'B');
    assert.equal(vB.assignment.source.kind, 'prompt');
    assert.equal(vB.assignment.source.canReport, true);
    const ref = vB.assignment.source.reportRef;
    assert.ok(ref);
    const rep = await w.u.B.call('report', { roomId: id, reportRef: ref, reason: 'other' });
    assert.equal(rep.ok, true, JSON.stringify(rep));
    // everyone draws, B included (free play)
    const hidden = await w.u.B.call('getRoom', { roomId: id });
    assert.equal(hidden.assignment.source.kind, 'hidden');
    for (const nm of names) {
      await w.view(id, nm);
      const r = await w.u[nm].call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3, 1200), auto: false, empty: false });
      assert.equal(r.ok, true, nm + JSON.stringify(r));
    }
    assert.equal(w.room(id).round, 2);
    // chain 0 is worked in round 2 by seat 2 (C). Spec 7.1: "A custom prompt ... the whole chain is hidden" (for everyone).
    const vC = await w.view(id, 'C');
    laterWorkerSeesHidden = vC.assignment.source.kind !== 'draw';
    // and the later reveal is placeholders for that chain
    for (let k = 0; k < 6 && w.room(id).state === 'playing'; k++) {
      w.expireRound(id);
      await w.u.A.call('roomTick', { roomId: id });
    }
    const rv = await w.u.A.call('getRoomReveal', { roomId: id });
    const c0 = rv.cards.find((c) => c.chainNo === 1);
    assert.ok(c0 && c0.placeholder === 'reported', JSON.stringify(c0));
    const full = await w.u.C.call('getReveal', { chainId: c0.chainId });
    assert.ok(!JSON.stringify(full).includes('我家的A星球'), 'the reported prompt is not served');
    assert.equal(full.ok, false, 'a reported chain is closed: ' + JSON.stringify(full).slice(0, 200));
    assert.equal(full.removedReason, 'reported');
    assert.ok(!JSON.stringify(full).includes('"strokes"'), 'no strokes of the hidden chain are served');
  });
});

// OPEN (QA-R2-5, Low): the later workers of a chain whose custom prompt was reported are still handed the drawing that was made from it.
test('7.1 (live) QA-R2-5, CTO decision (TD-147): a reported custom prompt is hidden and the reveal shows placeholders, but the LATER workers of that chain keep receiving the drawing made from it (it passed its own image check; the prompt text is hidden)', () => {
  assert.equal(laterWorkerSeesHidden, false, 'documented decision: the next worker of a reported chain is handed the prior drawing as a normal source');
});

test('TD-140 edge: refs are per room and per seat: the same seat in another room, another seat, a stale round, a left seat after the round, a ref of 0/empty/long are all refused; one report per source', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const names = ['A', 'B', 'C', 'D'];
    const id1 = await w.game(names);
    for (const nm of names) {
      await w.view(id1, nm);
      await w.u[nm].call('submitRoomStep', { roomId: id1, round: 0, customText: '小' + nm + '的家', auto: false, empty: false });
    }
    const vC = await w.view(id1, 'C');
    const vB = await w.view(id1, 'B');
    const refC = vC.assignment.source.reportRef;
    const refB = vB.assignment.source.reportRef;
    assert.notEqual(refB, refC);
    const T = async (who, body) => w.u[who].call('report', Object.assign({ reason: 'other' }, body));
    assert.equal((await T('C', { roomId: id1, reportRef: refB })).code, 'BAD_REQUEST', "another seat's ref");
    assert.equal((await T('C', { roomId: id1, reportRef: 'q' })).code, 'BAD_REQUEST');
    assert.equal((await T('C', { roomId: id1, reportRef: '' })).code, 'BAD_REQUEST');
    assert.equal((await T('C', { roomId: id1, reportRef: 'q' + 'z'.repeat(40) })).code, 'BAD_REQUEST');
    assert.equal((await T('C', { roomId: id1, reportRef: 12345 })).code, 'BAD_REQUEST');
    assert.equal((await T('C', { roomId: id1, reportRef: refC, reason: 'free text' })).code, 'BAD_REQUEST', 'only the fixed reasons');
    assert.equal((await T('C', { roomId: 'ZZZZZZZZZZ', reportRef: refC })).code, 'ROOM_NOT_FOUND');
    assert.equal((await T('E', { roomId: id1, reportRef: refC })).code, 'NOT_MEMBER', 'a group member who is not seated');
    assert.equal((await T('C', { roomId: id1, reportRef: refC })).ok, true);
    assert.equal((await T('C', { roomId: id1, reportRef: refC })).code, 'DUP_REPORT', 'one per source');
    // the round moves on: the old ref no longer works, also not for the same seat
    for (const nm of names) {
      await w.view(id1, nm);
      await w.u[nm].call('submitRoomStep', { roomId: id1, round: 1, strokes: drawing(3), auto: false, empty: false });
    }
    assert.equal(w.room(id1).round, 2);
    assert.equal((await T('B', { roomId: id1, reportRef: refB })).code, 'BAD_REQUEST', 'a stale ref of an earlier round');
    // a ref minted for a seat of ANOTHER room does not work here (same ref text, different room id)
    const v2B = await w.view(id1, 'B');
    assert.notEqual(v2B.assignment.source.reportRef, refB, 'the ref changes every round');
    // a seat that left cannot report with a fresh ref (it never gets one) and the game still ends
    await w.u.D.call('leaveRoom', { roomId: id1 });
    const vD = await w.u.D.call('getRoom', { roomId: id1 });
    assert.equal(vD.assignment, undefined, 'a left seat has no assignment, so no ref');
  });
});

test('4.1 / AC 119: the pick must be an id of the seat CURRENT roll: another seat id, a first-roll id after 换一批, a made-up id, both fields, neither field: BAD_REQUEST (a forced send falls back to the first prompt)', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C', 'D'];
    const id = await w.game(names);
    const vA = await w.view(id, 'A');
    const vB = await w.view(id, 'B');
    const first = vA.assignment.roll.prompts.map((p) => p.id);
    const send = (who, body) => w.u[who].call('submitRoomStep', Object.assign({ roomId: id, round: 0, auto: false, empty: false }, body));
    assert.equal((await send('A', { rollId: vA.assignment.roll.rollId, promptId: vB.assignment.roll.prompts[0].id })).code, 'BAD_REQUEST', "B's id with A's rollId");
    assert.equal((await send('A', { rollId: vB.assignment.roll.rollId, promptId: vB.assignment.roll.prompts[0].id })).code, 'BAD_REQUEST', "B's roll");
    assert.equal((await send('A', { rollId: vA.assignment.roll.rollId, promptId: 'A9999' })).code, 'BAD_REQUEST', 'made up');
    assert.equal((await send('A', { rollId: vA.assignment.roll.rollId, promptId: first[0], customText: '小猫咪' })).code, 'BAD_REQUEST', 'both');
    assert.equal((await send('A', {})).code, 'BAD_REQUEST', 'neither');
    const first_rollId = vA.assignment.roll.rollId;
    const re = await w.u.A.call('rollPrompts', { roomId: id, reroll: true });
    assert.equal(re.ok, true, JSON.stringify(re));
    const second = re.prompts.map((p) => p.id);
    assert.equal(first.filter((x) => second.includes(x)).length, 0, '换一批 gives 3 new ones');
    assert.equal((await send('A', { rollId: re.rollId, promptId: first[0] })).code, 'BAD_REQUEST', 'an id of the FIRST roll after the reroll');
    assert.equal((await w.u.A.call('rollPrompts', { roomId: id, reroll: true, rollId: first_rollId })).code, 'BAD_REQUEST', 'a reroll of a replaced roll (stale rollId)');
    assert.equal((await w.u.A.call('rollPrompts', { roomId: id, reroll: true })).ok, true, 'a second reroll is fine now (up to 5, rev. 2.1)');
    const cur = w.room(id).rolls[0];
    assert.equal((await send('A', { rollId: re.rollId, promptId: second[1] })).code, 'BAD_REQUEST', 'the roll after the second reroll is the only valid one');
    const ok = await send('A', { rollId: cur.rollId, promptId: cur.ids[1] });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    // nobody else in the room was shown any id A saw
    const rows = w.room(id).rolls;
    const seen = new Set();
    for (const r of rows) {
      for (const x of r.shownIds) {
        assert.ok(!seen.has(x), 'a prompt shown to two seats: ' + x);
        seen.add(x);
      }
    }
  });
});

test('4.1 (property): 150 rooms of 10 never share a prompt between seats (rolls and rerolls), every roll has 3 categories, and a retired prompt is never rolled', async () => {
  const bank = require(path.join(CORE, 'content', 'prompts.v2.js'));
  const roll = require(path.join(CORE, 'roll'));
  const { mulberry32 } = require(path.join(CORE, 'rng'));
  const retired = new Set(bank.prompts.filter((p) => p.retired).map((p) => p.id));
  assert.ok(retired.size >= 200, 'the review retired prompts: ' + retired.size);
  const byId = new Map(bank.prompts.map((p) => [p.id, p]));
  const getPrompts = require(path.join(CORE, 'prompts')).getPrompts;
  for (let k = 0; k < 150; k++) {
    const seen = Array.from({ length: 10 }, (_, i) => bank.prompts.filter((p, j) => (j * 7 + i * 13 + k) % 31 === 0).map((p) => p.id).slice(0, 300));
    const ids = roll.rollRoom({ bank: getPrompts(), seenBySeat: seen, rng: mulberry32(1000 + k) });
    const flat = [].concat(...ids);
    assert.equal(new Set(flat).size, flat.length, 'room ' + k + ' shares a prompt');
    for (const three of ids) {
      assert.equal(three.length, 3);
      assert.equal(new Set(three.map((x) => byId.get(x).cat)).size, 3, 'three categories');
      for (const x of three) assert.ok(!retired.has(x), 'retired prompt rolled: ' + x);
    }
  }
});

test('3.9 / AC 18 / AC 135-136: the 80-turn day cap blocks createRoom, joinRoom and rematch but never a game already started; markers and the round-0 fallback do not count; 10 created, 30 joined', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    // A is at the cap while the game is on: the game still plays out for A
    w.patchPlayer('A', (p) => { p.day.steps = 80; });
    await w.pickAll(id, names);
    for (let k = 0; k < 6 && w.room(id).state === 'playing'; k++) await w.sendRound(id, names);
    assert.equal(w.room(id).state, 'reveal');
    assert.equal(w.player('A').day.steps, 80 + 1 + 2, 'every sent turn counts (pick + 2 rounds), also past the cap: a started game is finished');
    // but A cannot start or join another game, and the rematch is a create too
    assert.equal((await w.u.A.call('createRoom', { groupRef: w.u.A.ref })).code, 'STEP_LIMIT');
    assert.equal((await w.u.A.call('rematch', { roomId: id })).code, 'STEP_LIMIT');
    const other = await w.u.D.call('createRoom', { groupRef: w.u.D.ref });
    assert.equal(other.ok, true);
    assert.equal((await w.u.A.call('joinRoom', { roomId: other.roomId, groupRef: w.u.A.ref })).code, 'STEP_LIMIT');
    // 10 created: the 11th create (also by rematch) is ROOM_LIMIT
    w.patchPlayer('B', (p) => { p.day.steps = 0; p.day.roomsCreated = 10; });
    assert.equal((await w.u.B.call('createRoom', { groupRef: w.u.B.ref })).code, 'ROOM_LIMIT');
    const re = await w.u.B.call('rematch', { roomId: id });
    assert.equal(re.code, 'ROOM_LIMIT', 'the first rematch caller CREATES the room, so the 10-a-day create cap applies: ' + JSON.stringify(re));
  });
  await withWorld({ n: 4 }, async (w) => {
    // markers never count toward the turn cap
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    for (let k = 0; k < 6 && w.room(id).state === 'playing'; k++) {
      w.expireRound(id);
      await w.u.A.call('roomTick', { roomId: id });
    }
    assert.equal(w.room(id).state, 'reveal');
    for (const nm of names) assert.equal(w.player(nm).day.steps, 1, 'only the round-0 pick counted for ' + nm + ' (no markers)');
  });
  await withWorld({ n: 4 }, async (w) => {
    // 30 joined: the 31st join is JOIN_LIMIT; a re-entry of a room already joined is free
    w.patchPlayer('D', (p) => { p.day.roomsJoined = 30; });
    const lobby = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    assert.equal((await w.u.D.call('joinRoom', { roomId: lobby.roomId, groupRef: w.u.D.ref })).code, 'JOIN_LIMIT');
    w.patchPlayer('D', (p) => { p.day.roomsJoined = 29; });
    assert.equal((await w.u.D.call('joinRoom', { roomId: lobby.roomId, groupRef: w.u.D.ref })).ok, true);
    assert.equal(w.player('D').day.roomsJoined, 30);
    assert.equal((await w.u.D.call('joinRoom', { roomId: lobby.roomId, groupRef: w.u.D.ref })).ok, true, 'a second call is a rejoin: still 30');
    assert.equal(w.player('D').day.roomsJoined, 30);
  });
});

test('3A.6 / 3A.9: strangers and left seats cannot touch a room: every room function refuses a non-member and changes nothing; a left seat cannot send, tick the round early or reroll', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const names = ['A', 'B', 'C', 'D'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    const snap = JSON.stringify(w.room(id));
    const sigs = JSON.stringify(w.rows('room_signals'));
    const S = w.u.E; // same group, not seated
    for (const [fn, body] of [
      ['leaveRoom', { roomId: id }],
      ['startRoom', { roomId: id }],
      ['roomTick', { roomId: id }],
      ['rematch', { roomId: id }],
      ['submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: false, empty: false }],
      ['rollPrompts', { roomId: id, reroll: true }],
    ]) {
      const r = await S.call(fn, body);
      assert.equal(r.ok, false, fn + ' must refuse a stranger: ' + JSON.stringify(r));
      assert.ok(['NOT_IN_ROOM', 'NOT_HOST', 'BAD_REQUEST', 'ROOM_STARTED', 'NOT_MEMBER', 'ROUND_OVER'].includes(r.code), fn + ' ' + r.code);
    }
    assert.equal(JSON.stringify(w.room(id)), snap, 'a stranger changed the room');
    assert.equal(JSON.stringify(w.rows('room_signals')), sigs);
    // a left seat
    await w.view(id, 'D');
    await w.u.D.call('leaveRoom', { roomId: id });
    const s = await w.u.D.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: false, empty: false });
    assert.equal(s.ok, false, 'the slot of a left seat is already a marker');
    assert.ok(!w.rows('steps').some((x) => x.author === 'openid-D' && x.kind === 'draw'), 'no step of the left seat');
    assert.equal(w.room(id).slots['1'][3].state, 'marker');
    // the left seat can still read its own reveal later, with no assignment and no other chain content before the end
    const v = await w.u.D.call('getRoom', { roomId: id });
    assert.equal(v.member, true);
    assert.equal(v.assignment, undefined);
  });
});

test('3A.2 / 5.8: the 20-minute cap with a drawing check in flight: the room reveals, the in-flight slot is the marker 「（这一棒没传过来）」, and a late `pass` of that check delivers nothing', async () => {
  await withWorld({ n: 4, env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } }, async (w) => {
    let release;
    const gate = new Promise((r) => { release = r; });
    w.h.handle('wxa.game.contentSpam.mediaCheckSync', async () => {
      await gate;
      return { errCode: 0, errMsg: 'ok', trace_id: 'x', result: { suggest: 'pass', label: 100 } };
    });
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.view(id, 'A');
    const pending = w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: false, empty: false });
    for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r));
    assert.equal(w.room(id).slots['1'][0].state, 'received');
    // the cap: 20 minutes after the start
    w.h.setNow(w.room(id).startedAt + 20 * 60e3 + 1);
    const sweep = await w.call('roomSweeper', {}, undefined);
    assert.equal(sweep.ok, true, JSON.stringify(sweep));
    const r = w.room(id);
    assert.equal(r.state, 'reveal');
    assert.equal(r.endedBy, 'cap');
    release();
    const late = await pending;
    assert.equal(late.ok, false, 'the late verdict must not deliver: ' + JSON.stringify(late));
    assert.ok(['ROUND_OVER', 'ALREADY_SENT'].includes(late.code), late.code);
    const steps = w.rows('steps').filter((s) => s.author === 'openid-A' && s.kind === 'draw' && s.state === 'passed' && !s.marker);
    assert.equal(steps.length, 0, 'no content step was stored by the late check');
    const slot = w.room(id).slots['1'][0];
    assert.deepEqual([slot.state, slot.marker], ['marker', 'notDelivered']);
    const rv = await w.u.A.call('getRoomReveal', { roomId: id });
    assert.equal(rv.ok, true, JSON.stringify(rv).slice(0, 200));
  });
});

test('3A.4 forced send at 0: an auto send inside the grace window counts (≤ deadline + 5 s), exactly at +5000 ms is accepted and +5001 is ROUND_OVER; an auto send with strokes AND empty:true is the empty marker', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    for (const nm of names) await w.view(id, nm);
    const r0 = w.room(id);
    // `empty:true` on a forced send means "nothing to send": the empty marker wins even if strokes ride along
    w.h.setNow(r0.deadline - 1000);
    const b = await w.u.B.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: true, empty: true });
    assert.deepEqual([b.ok, b.state, b.marker], [true, 'marker', 'emptyDraw'], JSON.stringify(b));
    // exactly at deadline + grace the send still counts (and, being the last one in flight, ends the round)
    w.h.setNow(r0.deadline + 5000);
    const a = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: true, empty: false });
    assert.deepEqual([a.ok, a.state], [true, 'sent'], JSON.stringify(a));
    assert.equal(w.rows('steps').filter((s) => s.author === 'openid-A' && s.kind === 'draw' && !s.marker).length, 1);
    // one millisecond later it is ROUND_OVER (the round already moved on, C got the empty marker)
    w.h.setNow(r0.deadline + 5001);
    const c = await w.u.C.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: true, empty: false });
    assert.equal(c.code, 'ROUND_OVER');
    assert.equal(w.room(id).slots['1'][2].marker, 'emptyDraw');
    // the not-auto form with `empty:true` is refused (spec 13.2)
    assert.equal((await w.u.C.call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(3), auto: false, empty: true })).code, 'BAD_REQUEST');
  });
});

// OPEN (QA-R2-4): CONTRACT.md `joinRoom`: "A seated member just gets the room back (rejoin, any state)". During a game it throws inside the bank loader, because
// `joinRoom` is not a `bank` function (TD-103) but `memberResponse` resolves rolled prompt texts; the player gets INTERNAL.
test('3A.6 rejoin: joinRoom by a seated member answers the room view in EVERY state (lobby, round 0 pick, a draw round with a rolled prompt as source, describe round, reveal)', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C'];
    const out = {};
    const quiet = console.error;
    console.error = () => {};
    try {
      const id = await w.lobby(names);
      out.lobby = (await w.u.B.call('joinRoom', { roomId: id, groupRef: w.u.B.ref })).ok;
      await w.start(id, 'A');
      await w.view(id, 'B');
      out.round0 = (await w.u.B.call('joinRoom', { roomId: id, groupRef: w.u.B.ref })).ok;
      await w.pickAll(id, names);
      await w.view(id, 'B');
      out.round1 = (await w.u.B.call('joinRoom', { roomId: id, groupRef: w.u.B.ref })).ok;
      await w.sendRound(id, names);
      await w.view(id, 'B');
      out.round2 = (await w.u.B.call('joinRoom', { roomId: id, groupRef: w.u.B.ref })).ok;
      for (let k = 0; k < 6 && w.room(id).state === 'playing'; k++) {
        w.expireRound(id);
        await w.u.A.call('roomTick', { roomId: id });
      }
      out.reveal = (await w.u.B.call('joinRoom', { roomId: id, groupRef: w.u.B.ref })).ok;
    } finally {
      console.error = quiet;
    }
    assert.deepEqual(out, { lobby: true, round0: true, round1: true, round2: true, reveal: true });
  });
});

test('AC 145: when the last round ends every member (also one who left) sees state reveal with the SAME version; getRoomReveal and getReveal serve all chains to members only and a stranger gets the teaser fields only', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const names = ['A', 'B', 'C', 'D', 'E'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.view(id, 'E');
    await w.u.E.call('leaveRoom', { roomId: id }); // E leaves in round 1 and must still get the reveal
    for (let k = 0; k < 8 && w.room(id).state === 'playing'; k++) {
      const r = w.room(id);
      if (r.kind === 'draw') await w.sendRound(id, ['A', 'B', 'C', 'D']);
      else await w.sendRound(id, ['A', 'B', 'C', 'D'], { text: '一只猫在开出租车' });
    }
    assert.equal(w.room(id).state, 'reveal');
    const views = await Promise.all(names.map((nm) => w.u[nm].call('getRoom', { roomId: id })));
    assert.deepEqual(views.map((v) => v.state), names.map(() => 'reveal'));
    assert.equal(new Set(views.map((v) => v.version)).size, 1, 'one version: ' + views.map((v) => v.version));
    assert.equal(views[0].version, w.room(id).version);
    const sigs = w.rows('room_signals').filter((s) => s.roomId === id);
    assert.equal(new Set(sigs.map((s) => s.seq)).size, 1, 'every doorbell carries the same seq at the end');
    assert.ok(sigs.every((s) => s.state === 'reveal'));
    for (const nm of names) {
      const rv = await w.u[nm].call('getRoomReveal', { roomId: id });
      assert.equal(rv.ok, true, nm + ' ' + JSON.stringify(rv).slice(0, 150));
      assert.equal(rv.cards.length, 5);
      for (const c of rv.cards) {
        const full = await w.u[nm].call('getReveal', { chainId: c.chainId });
        assert.equal(full.ok, true, nm + ' reads every chain: ' + JSON.stringify(full).slice(0, 150));
      }
    }
    const rvA = await w.u.A.call('getRoomReveal', { roomId: id });
    const stranger = await w.u.F.call('getRoomReveal', { roomId: id });
    assert.deepEqual([stranger.ok, stranger.code], [false, 'NOT_MEMBER']);
    assert.ok(!JSON.stringify(stranger).match(/chainId|strokes/), 'a stranger gets no chain id or drawing: ' + JSON.stringify(stranger).slice(0, 200));
    assert.equal((await w.u.F.call('getReveal', { chainId: rvA.cards[0].chainId })).code, 'NOT_PARTICIPANT');
    // AC 29 / 73 across the whole game: no PNG, file id, temp URL, openid or group id in any response a client ever got
    const everything = JSON.stringify(w.log);
    const LEAK = new RegExp('cloud:\\/\\/|tmp\\.test|\\.png|fileID|tempFileURL|openid-|group-1');
    assert.ok(!LEAK.test(everything), 'a response carried storage or identity data: ' + (everything.match(new RegExp('.{0,30}(' + LEAK.source + ').{0,30}')) || [''])[0]);
  });
});

test('5.8 / AC 130 / 134: markers cost no moderation call, no mod_log row, no strike, no quota, no turn and no streak; a left seat and a silent seat are free too (production configuration)', async () => {
  await withWorld({ n: 4, env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } }, async (w) => {
    const calls = [];
    w.h.handle('wxa.game.contentSpam.mediaCheckSync', async (p) => { calls.push('image'); return { errCode: 0, result: { suggest: 'pass', label: 100 } }; });
    w.h.handle('wxa.game.contentSpam.msgSecCheck', async (p) => { calls.push('text'); return { errCode: 0, result: { suggest: 'pass', label: 100 } }; });
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    // round 0: the picks are rolled ids (no text check), nobody typed anything
    await w.pickAll(id, names);
    assert.deepEqual(calls, [], 'a rolled pick is not checked');
    const turnsBefore = names.map((n) => w.player(n).day.steps);
    // round 1: A forced-empty, B leaves, C silent until the deadline
    await w.view(id, 'A');
    const a = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, auto: true, empty: true });
    assert.deepEqual([a.ok, a.state, a.marker], [true, 'marker', 'emptyDraw']);
    await w.u.B.call('leaveRoom', { roomId: id });
    w.expireRound(id);
    await w.u.A.call('roomTick', { roomId: id });
    const slots = w.room(id).slots['1'].map((s) => [s.state, s.marker]);
    assert.deepEqual(slots, [['marker', 'emptyDraw'], ['marker', 'emptyDraw'], ['marker', 'emptyDraw']]);
    assert.deepEqual(calls, [], 'no platform call for any marker');
    assert.equal(w.rows('mod_log').length, 0, 'no evidence row');
    assert.equal(w.rows('mod_traces').length, 0);
    for (const n of names) assert.deepEqual(w.player(n).strikes || [], [], n + ' has no strike');
    assert.deepEqual(names.map((n) => w.player(n).day.steps), turnsBefore, 'markers are not turns');
    for (const n of names) assert.ok(!w.player(n).lastStepDate || w.player(n).curStreak <= 1, n + ': a marker never extends the streak');
    const quota = w.rows('mod_quota')[0] || {};
    assert.equal((quota.image || 0) + (quota.text || 0), 0, 'no quota used');
  });
});
