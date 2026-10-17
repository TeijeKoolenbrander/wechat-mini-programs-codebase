'use strict';
// The room state machine (core/room.js, spec 3A, AC 135-151) as pure functions: lobby, start, rounds, rotation, deadlines, early end, grace and the
// in-flight guard, leave / disconnect markers, the 20-minute cap, views. The functions and the mock server run exactly this code; their own suites
// (cloudfunctions/tests) prove the I/O around it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../core/room');
const copy = require('../core/copy');
const { CONFIG } = require('../core/config');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const seatsOf = (n) => Array.from({ length: n }, (_, i) => 'u' + i);

function lobby(n, opts) {
  let r = R.newRoom({ roomId: 'ROOMAAAAAA', host: 'u0', openGId: 'g', groupRef: 'ref', now: T0, dateKey: '20261103' });
  for (let i = 1; i < n; i++) r = R.join(r, 'u' + i, T0 + i * 1000);
  void opts;
  return r;
}
function started(n, at) {
  const l = lobby(n);
  const when = at === undefined ? T0 + 60e3 : at;
  return R.start(l, {
    now: when,
    chainIds: seatsOf(n).map((_, i) => 'CHAIN' + i),
    rolls: seatsOf(n).map((_, i) => ({ rollId: 'r' + i, ids: ['A0' + i, 'B0' + i, 'C0' + i] })),
  });
}
/** resolve every slot of the current round with a sent turn (round 0: a pick) */
function sendAll(room, now) {
  let r = room;
  for (let s = 0; s < r.n; s++) {
    if (R.isResolved(R.slotAt(r, r.round, s))) continue;
    r = R.markReceived(r, s, now);
    r = R.resolveSent(r, s, r.round === 0 ? { promptId: 'A0' + s } : { stepId: 'S_' + r.round + '_' + s }, now, false);
  }
  return r;
}

test('AC 135/138: the lobby (host seat 0), join rules, R = min(n - 1, 4), round kinds and timers', () => {
  const l = lobby(3);
  assert.deepEqual([l.state, l.host, l.seats.length, l.round, l.kind], ['lobby', 'u0', 3, null, null]);
  assert.equal(R.joinBlock(l), null);
  assert.equal(R.joinBlock(lobby(10)), 'ROOM_FULL');
  assert.equal(R.startBlock(lobby(2), 'u0'), 'NOT_ENOUGH_PLAYERS');
  assert.equal(R.startBlock(l, 'u1'), 'NOT_HOST');
  assert.equal(R.startBlock(l, 'u0'), null);
  for (const [n, rr] of [[3, 2], [4, 3], [5, 4], [6, 4], [10, 4]]) assert.equal(R.roundsFor(n), rr);
  assert.equal(R.roundsFor(10, 6), 6);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(R.kindOfRound), ['prompt', 'draw', 'describe', 'draw', 'describe', 'draw']);
  const s = started(4);
  assert.deepEqual([s.state, s.n, s.R, s.round, s.kind], ['playing', 4, 3, 0, 'prompt']);
  assert.equal(s.roundStartAt, T0 + 60e3 + 1000, 'a 1 s head start');
  assert.equal(s.deadline - s.roundStartAt, 30000);
  assert.deepEqual(s.timers, { promptSec: 30, drawSec: 60, describeSec: 45, graceSec: 5 });
  assert.equal(R.startBlock(s, 'u0'), 'ROOM_STARTED');
  assert.equal(R.joinBlock(s), 'ROOM_STARTED');
  assert.equal(R.joinBlock(R.closeLobby(l, T0, 'idle')), 'ROOM_CLOSED');
  assert.ok(Object.keys(s.slots).length === s.R + 1 && s.slots['0'].length === 4);
});

test('AC 139: rotation, exhaustively for n = 3..10 (also the spec table for n = 4)', () => {
  const t = R.rotationTable(4, 3);
  assert.deepEqual(t, [[0, 1, 2, 3], [3, 0, 1, 2], [2, 3, 0, 1], [1, 2, 3, 0]]); // spec 3A.4: round r, seat s -> chain (s - r) mod n
  for (let n = 3; n <= 10; n++) {
    const Rr = R.roundsFor(n);
    const seen = Array.from({ length: n }, () => new Set());
    for (let r = 1; r <= Rr; r++) {
      for (let s = 0; s < n; s++) {
        const c = R.chainOfSeat(s, r, n);
        assert.notEqual(c, s);
        assert.ok(!seen[s].has(c));
        seen[s].add(c);
        assert.equal(R.workerOfChain(c, r, n), s);
      }
    }
  }
});

test('AC 141: a round ends early when every seat has a resolved slot; not before; the loser of a double advance changes nothing', () => {
  let r = started(3);
  const t = r.roundStartAt + 5000;
  assert.deepEqual(R.decide(r, t), { action: 'none' });
  r = R.markReceived(r, 0, t);
  r = R.resolveSent(r, 0, { promptId: 'A00' }, t, false);
  assert.equal(R.decide(r, t).action, 'none');
  r = sendAll(r, t);
  assert.deepEqual(R.decide(r, t), { action: 'advance', reason: 'all' });
  const adv = R.advance(r, t, 'all');
  assert.deepEqual([adv.room.round, adv.room.kind, adv.room.state, adv.ended], [1, 'draw', 'playing', false]);
  assert.equal(adv.room.roundStartAt, t + 1000);
  assert.equal(adv.room.deadline, t + 1000 + 60000);
  assert.ok(adv.room.version > r.version);
  // whoever reads the NEW room finds nothing due
  assert.equal(R.decide(adv.room, t).action, 'none');
});

test('AC 131: deadline + 5 s grace: empty markers for silent seats, notDelivered for a check older than 8 s, a younger check holds the round', () => {
  let r = started(4);
  r = sendAll(r, r.roundStartAt + 1000); // round 0 done by hand
  r = R.advance(r, r.roundStartAt + 2000, 'all').room;
  assert.equal(r.round, 1);
  const grace = R.acceptUntil(r);
  assert.equal(grace, r.deadline + 5000);
  // seat 0 sent; seat 1's check is in flight since 2 s; seats 2 and 3 are silent
  r = R.resolveSent(R.markReceived(r, 0, r.roundStartAt + 3000), 0, { stepId: 'S_1_0' }, r.roundStartAt + 4000, false);
  r = R.markReceived(r, 1, grace - 2000);
  assert.equal(R.decide(r, grace - 1).action, 'none', 'before the grace is over');
  assert.equal(R.decide(r, grace).action, 'none', 'a slot received for less than 8 s holds the round');
  assert.equal(R.decide(r, grace + 5999).action, 'none');
  const late = grace + 8000;
  assert.deepEqual(R.decide(r, late), { action: 'advance', reason: 'deadline' });
  const adv = R.advance(r, late, 'deadline');
  const s1 = adv.room.slots['1'];
  assert.deepEqual(s1.map((s) => [s.state, s.marker || null]), [['sent', null], ['marker', 'notDelivered'], ['marker', 'emptyDraw'], ['marker', 'emptyDraw']]);
  assert.deepEqual(adv.fills.map((f) => [f.seat, f.marker]), [[1, 'notDelivered'], [2, 'emptyDraw'], [3, 'emptyDraw']]);
  assert.equal(adv.room.round, 2);
  // a send that arrives after the window is ROUND_OVER; a send for an old round too
  assert.equal(R.sendGate(r, 2, 1, grace + 1).code, 'ROUND_OVER');
  assert.equal(R.sendGate(adv.room, 2, 1, late).code, 'ROUND_OVER');
  assert.equal(R.sendGate(r, 2, 1, grace).ok, true, 'exactly at deadline + grace is still accepted');
  assert.equal(R.sendGate(r, 2, 2, grace).code, 'BAD_REQUEST', 'a future round');
  assert.equal(R.sendGate(r, 0, 1, grace).code, 'ALREADY_SENT');
});

test('round 0 fills with the first rolled prompt, never a marker (4.2, AC 120); describe rounds fill with emptyText', () => {
  let r = started(3);
  r = R.advance(r, r.deadline + 6000, 'deadline').room;
  assert.deepEqual(r.slots['0'].map((s) => [s.state, s.promptId, s.auto]), [['sent', 'A00', true], ['sent', 'A01', true], ['sent', 'A02', true]]);
  assert.equal(R.slotPrompt(r, 1).promptId, 'A01');
  r = R.advance(r, r.deadline + 6000, 'deadline').room; // round 1 (draw) silent
  r = R.advance(r, r.deadline + 6000, 'deadline').room; // round 2 (describe) silent: the last round
  assert.deepEqual(r.slots['2'].map((s) => s.marker), ['emptyText', 'emptyText', 'emptyText']);
  assert.deepEqual([r.state, r.endedBy], ['reveal', 'normal']);
});

test('AC 142: leaving mid-game fills the current and every later slot at once and can end the round early; the game always reaches reveal', () => {
  let r = started(4);
  r = sendAll(r, r.roundStartAt + 1000);
  r = R.advance(r, r.roundStartAt + 2000, 'all').room; // round 1
  const lp = R.leavePlaying(r, 'u2', r.roundStartAt + 3000);
  assert.equal(lp.changed, true);
  assert.equal(lp.room.seats[2].status, 'left');
  assert.deepEqual([1, 2, 3].map((k) => lp.room.slots[String(k)][2].marker), ['emptyDraw', 'emptyText', 'emptyDraw']);
  assert.equal(R.activeSeats(lp.room), 3);
  assert.equal(R.leavePlaying(lp.room, 'u2', r.roundStartAt + 4000).changed, false, 'idempotent');
  // the others send: the round ends early without waiting for the left seat
  let x = lp.room;
  for (const s of [0, 1, 3]) x = R.resolveSent(R.markReceived(x, s, r.roundStartAt + 5000), s, { stepId: 's' + s }, r.roundStartAt + 5000, false);
  assert.equal(R.decide(x, r.roundStartAt + 5000).reason, 'all');
  // everybody leaves: nobodyActive, then finish -> reveal with every slot resolved
  let y = r;
  let last;
  for (const u of ['u0', 'u1', 'u2', 'u3']) {
    last = R.leavePlaying(y, u, r.roundStartAt + 6000);
    y = last.room;
  }
  assert.equal(last.nobodyActive, true);
  const f = R.finish(y, r.roundStartAt + 6000, 'empty');
  assert.deepEqual([f.room.state, f.room.endedBy], ['reveal', 'empty']);
  for (let k = 0; k <= f.room.R; k++) assert.ok(f.room.slots[String(k)].every(R.isResolved), 'round ' + k);
});

test('AC 143: host handover and an empty lobby closes (seats renumber in join order)', () => {
  let l = lobby(3);
  const a = R.leaveLobby(l, 'u0', T0 + 9000);
  assert.deepEqual([a.room.host, a.room.seats.map((s) => s.openid), a.hostChanged, a.closed], ['u1', ['u1', 'u2'], true, false]);
  const b = R.leaveLobby(a.room, 'u2', T0 + 9500);
  assert.deepEqual([b.room.host, b.hostChanged], ['u1', false]);
  const c = R.leaveLobby(b.room, 'u1', T0 + 9800);
  assert.deepEqual([c.room.state, c.closed, c.room.endedBy], ['closed', true, 'empty']);
  assert.equal(R.leaveLobby(l, 'stranger', T0).room, l);
});

test('AC 144: the 20-minute cap finishes the game; finish fills every remaining slot (markers, round 0 prompts) and reveals', () => {
  const r = started(3, T0);
  assert.notEqual(R.decide(r, T0 + 20 * 60e3 - 1).action, 'finish', 'not yet at the cap');
  assert.deepEqual(R.decide(r, T0 + 20 * 60e3), { action: 'finish', reason: 'cap' });
  const f = R.finish(r, T0 + 20 * 60e3, 'cap');
  assert.deepEqual([f.room.state, f.room.endedBy, f.room.round], ['reveal', 'cap', f.room.R]);
  assert.ok(f.room.slots['0'].every((s) => s.state === 'sent' && s.promptId));
  assert.ok(f.room.slots['1'].every((s) => s.marker === 'emptyDraw'));
  assert.ok(f.room.slots['2'].every((s) => s.marker === 'emptyText'));
});

test('phase is derived: passing before the round starts and from the deadline on (3A.2)', () => {
  const r = started(3);
  assert.equal(R.phaseAt(r, r.roundStartAt - 1), 'passing');
  assert.equal(R.phaseAt(r, r.roundStartAt), 'turn');
  assert.equal(R.phaseAt(r, r.deadline - 1), 'turn');
  assert.equal(R.phaseAt(r, r.deadline), 'passing');
  assert.equal(R.phaseAt(lobby(3), T0), null);
});

test('AC 116, 164-168 rolls in a room: the pick must come from the CURRENT roll; up to 5 rerolls, the 6th is REROLL_LIMIT; round 0 only, until the deadline (4.1)', () => {
  let r = started(3);
  assert.equal(R.rollPickValid(r, 1, 'r1', 'B01'), true);
  assert.equal(R.rollPickValid(r, 1, 'r1', 'A00'), false, 'another seat roll');
  assert.equal(R.rollPickValid(r, 1, 'rX', 'B01'), false);
  assert.deepEqual([r.rolls[1].rerolls, r.rolls[1].shownIds], [0, ['A01', 'B01', 'C01']]);
  assert.equal(R.rerollBlock(r, 1, r.roundStartAt), null);
  r = R.applyReroll(r, 1, 'r1b', ['D01', 'E01', 'F01'], r.roundStartAt);
  assert.equal(R.rollPickValid(r, 1, 'r1', 'B01'), false, 'the old roll is gone');
  assert.equal(R.rollPickValid(r, 1, 'r1b', 'E01'), true);
  assert.equal(R.rerollBlock(r, 1, r.roundStartAt), null, 'a second one is fine now');
  assert.deepEqual([r.rolls[1].rerolls, r.rolls[1].shownIds], [1, ['A01', 'B01', 'C01', 'D01', 'E01', 'F01']]);
  // the 5th is the last one; the 6th is REROLL_LIMIT and nothing changes
  const ids = (n) => ['A', 'B', 'C'].map((c) => c + 'x' + n);
  for (let n = 2; n <= 5; n++) {
    assert.equal(R.rerollBlock(r, 1, r.roundStartAt), null, 'reroll ' + n);
    r = R.applyReroll(r, 1, 'r1' + n, ids(n), r.roundStartAt);
  }
  assert.equal(r.rolls[1].rerolls, 5);
  assert.equal(r.rolls[1].shownIds.length, 18, 'six sets of three');
  assert.equal(R.rerollBlock(r, 1, r.roundStartAt), 'REROLL_LIMIT');
  assert.equal(r.rolls[0].rerolls, 0, 'the count is per seat');
  assert.equal(R.rerollBlock(r, 0, r.deadline), null, 'exactly at the deadline is still in time');
  assert.equal(R.rerollBlock(r, 0, r.deadline + 1), 'ROUND_OVER', 'no grace for a reroll (spec 17 edge 26)');
  assert.equal(R.rerollBlock(r, 1, r.deadline + 1), 'ROUND_OVER');
  // a forced send may name any id of the pick (also a replaced set); a normal pick only the current set
  assert.equal(R.shownPickValid(r, 1, 'B01'), true);
  assert.equal(R.shownPickValid(r, 1, 'Zx9'), false);
  assert.equal(R.rollPickValid(r, 1, 'r15', 'Bx5'), true);
  assert.equal(R.rollPickValid(r, 1, 'r15', 'B01'), false);
  const later = sendAll(r, r.roundStartAt + 1);
  assert.equal(R.rerollBlock(R.advance(later, r.roundStartAt + 2, 'all').room, 0, r.roundStartAt + 3), 'BAD_REQUEST', 'round 0 only');
});

test('views: a member sees only the previous output of the same chain; markers carry the free-play hint (AC 140, 130)', () => {
  let r = started(3);
  r = sendAll(r, r.roundStartAt + 1000);
  r = R.advance(r, r.roundStartAt + 2000, 'all').room; // round 1: seat s sees the prompt of chain (s - 1)
  const src = R.sourceFor(r, 1, { promptText: '月亮吃月饼', promptCustom: false, viewEnabled: true });
  assert.deepEqual(src, { kind: 'prompt', text: '月亮吃月饼', custom: false, canReport: false });
  assert.equal(R.sourceFor(r, 1, { promptText: 'x', promptCustom: true, viewEnabled: true }).canReport, true);
  assert.equal(R.sourceFor(r, 1, { promptText: 'x', promptCustom: true, promptHidden: true, viewEnabled: true }).kind, 'hidden');
  assert.equal(R.sourceFor(r, 1, { promptText: 'x', viewEnabled: false }).kind, 'paused');
  // round 2: seat 2 gets seat 1's drawing (the source seat of s is s - 1)
  let x = r;
  x = R.resolveSent(R.markReceived(x, 1, x.roundStartAt + 10), 1, { stepId: 'S_1_1' }, x.roundStartAt + 11, false);
  x = R.resolveMarker(R.markReceived(x, 0, x.roundStartAt + 12), 0, 'emptyDraw', x.roundStartAt + 13, true);
  x = R.resolveSent(R.markReceived(x, 2, x.roundStartAt + 14), 2, { stepId: 'S_1_2' }, x.roundStartAt + 15, false);
  x = R.advance(x, x.roundStartAt + 20, 'all').room;
  assert.equal(x.round, 2);
  const drawn = R.sourceFor(x, 2, { prevStep: { state: 'passed', kind: 'draw', strokes: { v: 2, h: 1024, s: [] } }, viewEnabled: true });
  assert.deepEqual([drawn.kind, drawn.canReport], ['draw', true]);
  const mk = R.sourceFor(x, 1, { prevStep: null, viewEnabled: true }); // seat 1 receives seat 0's emptyDraw marker
  assert.deepEqual([mk.kind, mk.marker, mk.text, mk.hint], ['marker', 'emptyDraw', copy.MARKERS.emptyDraw.text, copy.MARKERS.emptyDraw.hint.describe]);
  assert.equal(mk.canReport, false);
  assert.equal(R.sourceFor(x, 2, { prevStep: { state: 'hidden' }, viewEnabled: true }).kind, 'hidden');
  assert.equal(R.sourceFor(x, 2, { prevStep: { state: 'deleted' }, viewEnabled: true }).kind, 'hidden');
});

test('memberView / entryView: no openid anywhere, the assignment only after the round started and only while unresolved', () => {
  const r = started(3);
  const early = R.memberView(r, 0, 'u0', { now: r.roundStartAt - 10, promptsView: [{ id: 'A00', text: 'x' }] });
  assert.equal(early.assignment, undefined);
  assert.equal(early.phase, 'passing');
  const v = R.memberView(r, 0, 'u0', { now: r.roundStartAt + 10, promptsView: [{ id: 'A00', text: 'x' }, { id: 'B00', text: 'y' }, { id: 'C00', text: 'z' }] });
  assert.deepEqual([v.assignment.chainNo, v.assignment.roll.rollId, v.assignment.roll.rerollLeft, v.me.seat, v.me.isHost, v.rounds, v.phase], [1, 'r0', 5, 0, true, 2, 'turn']);
  assert.equal(JSON.stringify(v).includes('u1'), false, 'no other openid');
  assert.deepEqual(v.seats.map((s) => [s.n, s.filled, s.me]), [[1, true, true], [2, true, false], [3, true, false]]);
  const sent = R.resolveSent(R.markReceived(r, 0, r.roundStartAt + 20), 0, { promptId: 'A00' }, r.roundStartAt + 21, false);
  const v2 = R.memberView(sent, 0, 'u0', { now: r.roundStartAt + 30, mine: { kind: 'prompt', text: 'x' } });
  assert.equal(v2.assignment, undefined);
  assert.deepEqual([v2.mine.kind, v2.me.slot, v2.sentCount, v2.activeCount], ['prompt', 'sent', 1, 3]);
  // non-members
  const ctx = { now: T0, memberOfRoomGroup: true, groupOpenGId: 'g', rulesOk: true, restrictedUntil: 0, ugcOk: true, inOtherRoomId: null, capReached: false };
  assert.equal(R.entryView(lobby(3), ctx).entryState, 'joinable');
  assert.equal(R.entryView(lobby(10), ctx).entryState, 'full');
  assert.equal(R.entryView(r, ctx).entryState, 'started');
  assert.equal(R.entryView(lobby(3), Object.assign({}, ctx, { memberOfRoomGroup: false })).entryState, 'wrongGroup');
  const wg = R.entryView(r, Object.assign({}, ctx, { memberOfRoomGroup: false }));
  assert.deepEqual([wg.entryState, wg.state, wg.joined], ['wrongGroup', null, null], 'nothing about the room leaks');
  assert.equal(R.entryView(lobby(3), Object.assign({}, ctx, { inOtherRoomId: 'R2' })).otherRoomId, 'R2');
  assert.equal(R.entryView(lobby(3), Object.assign({}, ctx, { rulesOk: false })).entryState, 'rulesRequired');
  assert.equal(R.entryView(lobby(3), Object.assign({}, ctx, { restrictedUntil: T0 + 5 })).entryState, 'restricted');
  assert.equal(R.entryView(lobby(3), Object.assign({}, ctx, { ugcOk: false })).entryState, 'ugcPaused');
  assert.equal(R.entryView(lobby(3), Object.assign({}, ctx, { capReached: true })).entryState, 'capReached');
});

test('materialisation plan: marker steps get ids that never collide, chains get stepIds and authors in round order', () => {
  let r = started(3);
  r = R.finish(r, T0 + 99, 'cap').room;
  const plan = R.materializePlan(r);
  assert.equal(plan.markers.length, 6, '3 chains x 2 rounds of markers');
  assert.ok(plan.markers.every((m) => /_m$/.test(m.stepId)));
  assert.deepEqual(plan.chains[0].stepIds, [null, 'CHAIN0_1_m', 'CHAIN0_2_m']);
  assert.deepEqual(plan.chains[0].authors, [null, 'u1', 'u2'], 'chain 0 is worked by seat (0 + r)');
  assert.equal(R.markerStepId('X', 3), 'X_3_m');
});

test('the album and group rows for rooms', () => {
  const r = started(3);
  const a = R.albumItem(r, 'u0', false);
  assert.deepEqual([a.kind, a.status, a.n, a.rounds], ['room', 'playing', 3, 2]);
  assert.equal(R.albumItem(R.finish(r, T0 + 5, 'cap').room, 'u1', true).status, 'revealed');
  assert.equal(R.albumItem(lobby(3), 'u0').status, 'lobby');
  assert.deepEqual([R.groupRoomRow(lobby(3), {}).joinable, R.groupRoomRow(lobby(10), {}).joinable, R.groupRoomRow(r, { member: true }).state], [true, false, 'playing']);
  assert.ok(CONFIG.room.maxPlayers === 10);
});
