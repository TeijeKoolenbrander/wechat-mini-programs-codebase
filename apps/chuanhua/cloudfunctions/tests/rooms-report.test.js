'use strict';
// TD-140: reporting the source a member sees in a LIVE round, by an opaque server-issued `reportRef` (spec 7.1, 13.2), on the real functions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomWorld } = require('./helpers/roomworld');

async function withWorld(o, fn) {
  const w = await roomWorld(o);
  try {
    await fn(w);
  } finally {
    w.teardown();
  }
}

/** a 4-player room played to round 2 (describe): every seat holds a drawing made by the previous seat */
async function toRound2(w) {
  const id = await w.game(['A', 'B', 'C', 'D']);
  await w.pickAll(id, ['A', 'B', 'C', 'D']);
  await w.sendRound(id, ['A', 'B', 'C', 'D']); // round 1 (draw)
  assert.equal(w.room(id).round, 2);
  return id;
}

test('a member gets a reportRef for a user-content source only, and it leaks no chain id, step or author', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await w.game(['A', 'B', 'C', 'D']);
    await w.pickAll(id, ['A', 'B', 'C', 'D']);
    const r1 = await w.view(id, 'B');
    assert.equal(r1.assignment.source.kind, 'prompt');
    assert.equal(r1.assignment.source.canReport, false);
    assert.equal(r1.assignment.source.reportRef, undefined, 'a rolled prompt is never reportable');
    await w.sendRound(id, ['A', 'B', 'C', 'D']);
    const v = await w.view(id, 'B');
    const src = v.assignment.source;
    assert.equal(src.kind, 'draw');
    assert.equal(src.canReport, true);
    assert.match(src.reportRef, /^q[0-9a-z]{2,24}$/);
    const room = w.room(id);
    const text = JSON.stringify(v);
    for (const cid of room.chainIds) assert.equal(text.includes(cid), false, 'no chain id');
    for (const nm of ['A', 'C', 'D']) assert.equal(text.includes('openid-' + nm), false, 'no author');
    // every seat has its own ref
    const refs = new Set();
    for (const nm of ['A', 'B', 'C', 'D']) refs.add((await w.view(id, nm)).assignment.source.reportRef);
    assert.equal(refs.size, 4);
  });
});

test('a member reports a live source: hidden for everyone, the room keeps running, the reporter plays freely, the reveal shows a placeholder', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await toRound2(w);
    const ref = (await w.view(id, 'B')).assignment.source.reportRef;
    const rep = await w.u.B.call('report', { roomId: id, reportRef: ref, reason: 'abuse' });
    assert.deepEqual([rep.ok, rep.hidden, rep.reopened], [true, true, false]);
    const rows = w.rows('reports');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reporter, 'openid-B');
    assert.equal(rows[0].roomId, id);
    const hidden = w.rows('steps').filter((s) => s.hiddenReason === 'report');
    assert.equal(hidden.length, 1);
    assert.equal(hidden[0].n, 1);
    assert.equal(w.player('B').day.reports, 1, 'counts toward the daily limit');
    // the reporter's source is the neutral hidden source now (7.1): free play, no 举报
    const after = (await w.u.B.call('getRoom', { roomId: id })).assignment.source;
    assert.equal(after.kind, 'hidden');
    assert.equal(after.canReport, false);
    assert.equal(after.reportRef, undefined);
    // a repeat is DUP_REPORT and costs nothing
    const dup = await w.u.B.call('report', { roomId: id, reportRef: ref, reason: 'abuse' });
    assert.equal(dup.code, 'DUP_REPORT');
    assert.equal(w.rows('reports').length, 1);
    // the room advances: B (who never drew from it) sends, the others send, and the game completes
    const sent = await w.sendRound(id, ['A', 'B', 'C', 'D']);
    for (const nm of ['A', 'B', 'C', 'D']) assert.equal(sent[nm].ok, true, nm + JSON.stringify(sent[nm]));
    assert.equal(w.room(id).round, 3);
    await w.sendRound(id, ['A', 'B', 'C', 'D']);
    assert.equal(w.room(id).state, 'reveal');
    // the reveal: the reported step is a placeholder for everyone, the other steps are intact
    const rv = await w.u.C.call('getRoomReveal', { roomId: id });
    assert.equal(rv.ok, true);
    const chainId = hidden[0].chainId;
    const cardChain = await w.u.C.call('getReveal', { chainId });
    assert.equal(cardChain.ok, true);
    const row1 = cardChain.steps.find((s) => s.n === 1);
    assert.equal(row1.placeholder, 'reported');
    assert.ok(cardChain.steps.filter((s) => s.n !== 1).every((s) => !s.placeholder));
  });
});

test('a non-member and a wrong or stale ref are refused', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await toRound2(w);
    const refB = (await w.view(id, 'B')).assignment.source.reportRef;
    const before = w.rows('reports').length;
    // E agreed to the rules and is in the group, but not in the room
    assert.equal((await w.u.E.call('report', { roomId: id, reportRef: refB, reason: 'abuse' })).code, 'NOT_MEMBER');
    // another member cannot use B's ref
    assert.equal((await w.u.C.call('report', { roomId: id, reportRef: refB, reason: 'abuse' })).code, 'BAD_REQUEST');
    // a guessed ref, a bad shape, an unknown room, a missing reason
    assert.equal((await w.u.B.call('report', { roomId: id, reportRef: 'qzzzzzzzz', reason: 'abuse' })).code, 'BAD_REQUEST');
    assert.equal((await w.u.B.call('report', { roomId: id, reportRef: '../x', reason: 'abuse' })).code, 'BAD_REQUEST');
    assert.equal((await w.u.B.call('report', { roomId: id, reportRef: 12, reason: 'abuse' })).code, 'BAD_REQUEST');
    assert.equal((await w.u.B.call('report', { roomId: 'ZZZZZZZZZZ', reportRef: refB, reason: 'abuse' })).code, 'ROOM_NOT_FOUND');
    assert.equal((await w.u.B.call('report', { roomId: id, reportRef: refB, reason: 'nope' })).code, 'BAD_REQUEST');
    // a ref without a roomId never resolves a chain
    assert.equal((await w.u.B.call('report', { reportRef: refB, reason: 'abuse' })).code, 'ROOM_NOT_FOUND');
    assert.equal(w.rows('reports').length, before);
    // a ref goes stale when the round moves on
    await w.sendRound(id, ['A', 'B', 'C', 'D']);
    const stale = await w.u.B.call('report', { roomId: id, reportRef: refB, reason: 'abuse' });
    assert.equal(stale.code, 'BAD_REQUEST');
    assert.equal(w.rows('reports').length, before);
  });
});

test('the rate limit and the daily limit apply to live reports', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await toRound2(w);
    const ref = (await w.view(id, 'B')).assignment.source.reportRef;
    w.patchPlayer('B', (p) => { p.day.reports = 10; });
    const lim = await w.u.B.call('report', { roomId: id, reportRef: ref, reason: 'abuse' });
    assert.equal(lim.code, 'REPORT_LIMIT');
    assert.equal(w.rows('reports').length, 0);
    assert.equal(w.rows('steps').filter((s) => s.hiddenReason === 'report').length, 0);
    w.patchPlayer('B', (p) => { p.day.reports = 0; });
    // the rate limit (10 per minute per player) is not reset on the raw harness
    const ok = await w.h.call('report', { roomId: id, reportRef: ref, reason: 'ad' }, { openid: 'openid-B' });
    assert.equal(ok.ok, true);
    let limited = 0;
    for (let i = 0; i < 12; i++) if ((await w.h.call('report', { roomId: id, reportRef: ref, reason: 'ad' }, { openid: 'openid-B' })).code === 'RATE_LIMITED') limited++;
    assert.ok(limited >= 2, 'RATE_LIMITED after the budget, limited=' + limited);
  });
});

test('an upheld live report strikes the author of the hidden step (the ladder applies)', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await toRound2(w);
    const ref = (await w.view(id, 'B')).assignment.source.reportRef;
    await w.u.B.call('report', { roomId: id, reportRef: ref, reason: 'porn' });
    const rid = w.rows('reports')[0]._id;
    const step = w.rows('steps').find((s) => s.hiddenReason === 'report');
    const up = await w.h.call('admin', { op: 'upholdReport', reportId: rid }, {});
    assert.equal(up.ok, true, JSON.stringify(up));
    assert.equal(up.strikes, 1);
    assert.equal(w.player(step.author.replace('openid-', '')).strikes.length, 1);
    // the room is untouched
    assert.equal(w.room(id).state, 'playing');
  });
});

test('after the reveal a participant can still report a step from the step-through (chainId + step)', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await w.game(['A', 'B', 'C', 'D']);
    await w.pickAll(id, ['A', 'B', 'C', 'D']);
    for (let r = 1; r <= 3; r++) await w.sendRound(id, ['A', 'B', 'C', 'D']);
    assert.equal(w.room(id).state, 'reveal');
    const rv = await w.u.A.call('getRoomReveal', { roomId: id });
    const card = rv.cards[0];
    const rr = await w.u.A.call('getReveal', { chainId: card.chainId });
    const target = rr.steps.find((s) => s.canReport);
    assert.ok(target, 'a reportable step exists');
    const rep = await w.u.A.call('report', { chainId: card.chainId, step: target.n, reason: 'other' });
    assert.equal(rep.ok, true, JSON.stringify(rep));
    assert.equal((await w.u.A.call('report', { chainId: card.chainId, step: target.n, reason: 'other' })).code, 'DUP_REPORT');
    // a live ref is refused once the room is over
    assert.equal((await w.u.A.call('report', { roomId: id, reportRef: 'qabc', reason: 'other' })).code, 'ROUND_OVER');
  });
});

test('the room teaser (a non-member) carries no user content and no reportRef', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await toRound2(w);
    const e = await w.u.E.call('getRoom', { roomId: id, groupRef: w.u.E.ref });
    const text = JSON.stringify(e);
    assert.equal(e.assignment, undefined);
    assert.equal(e.source, undefined);
    assert.equal(text.includes('reportRef'), false);
    assert.equal(text.includes('strokes'), false);
    // finished room, non-member: teaser lines are for the reveal view only; getRoom's entry view still carries no source
    for (let r = 2; r <= 3; r++) await w.sendRound(id, ['A', 'B', 'C', 'D']);
    const e2 = await w.u.E.call('getRoom', { roomId: id, groupRef: w.u.E.ref });
    assert.equal(JSON.stringify(e2).includes('reportRef'), false);
  });
});
