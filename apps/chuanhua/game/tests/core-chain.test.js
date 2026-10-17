'use strict';
// AC 1-5, 7, 8, 12, 13, 15, 16, 17, 20 on the pure chain state machine (core/chain.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core/chain');
const { mulberry32 } = require('../core/rng');

const T0 = Date.UTC(2026, 10, 1, 4, 0, 0);
const prompt = { id: 'I07', text: '月亮吃月饼', custom: false };
const base = (o) => ({ rulesOk: true, restrictedUntil: 0, ugcOk: true, groupOpenGId: 'G1', memberOfChainGroup: true, stepsToday: 0, claimsOnChainToday: 0, now: T0, ...o });
const mk = (extra) => C.newChain({ chainId: 'CH1', starter: 'A', claimId: 'c0', now: T0, dateKey: '20261101', prompt, openGId: 'G1', groupRef: 'ref', ...extra });

/** drive a chain: author `who` takes the next 棒 and it passes (drawing via pending, text directly) */
function play(chain, who, now, claimId) {
  let c = chain;
  if (!(c.claim && c.claim.openid === who && c.claim.expiresAt > now)) {
    const d = C.canClaim(c, base({ openid: who, now }));
    assert.equal(d.ok, true, JSON.stringify(d));
    c = C.applyClaim(c, { openid: who, claimId: claimId || 'k' + c.nextStep, now });
  }
  const n = c.claim.step;
  const kind = C.kindOf(n);
  const chk = C.checkSubmit(c, { openid: who, claimId: c.claim.claimId, now, hasText: kind === 'describe', hasStrokes: kind === 'draw' });
  assert.equal(chk.ok, true);
  const sid = C.stepId(c._id, n, c.attempts[n] + 1);
  if (kind === 'describe') return C.passText(c, { stepId: sid, openid: who, attempt: c.attempts[n] + 1, now }).chain;
  c = C.beginPending(c, { stepId: sid, openid: who, attempt: c.attempts[n] + 1, now });
  return C.resolvePending(c, { stepId: sid, outcome: 'passed', now }).chain;
}

test('AC 1: a chain has exactly 6 棒; 1,3,5 draw and 2,4,6 describe', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(C.kindOf), ['draw', 'describe', 'draw', 'describe', 'draw', 'describe']);
  assert.equal(C.kindOf(0), null);
  assert.equal(C.kindOf(7), null);
  assert.equal(mk().length, 6);
  assert.equal(C.timerSec('draw'), 60);
  assert.equal(C.timerSec('describe'), 45);
});

test('AC 1: submit checks reject a text for a draw 棒 and strokes for a describe 棒', () => {
  const c = mk();
  const ok = { openid: 'A', claimId: 'c0', now: T0 + 1000 };
  assert.equal(C.checkSubmit(c, { ...ok, hasText: false, hasStrokes: true }).ok, true);
  assert.deepEqual(C.checkSubmit(c, { ...ok, hasText: true, hasStrokes: false }), { ok: false, code: 'BAD_REQUEST' });
  assert.deepEqual(C.checkSubmit(c, { ...ok, hasText: true, hasStrokes: true }), { ok: false, code: 'BAD_REQUEST' });
  assert.deepEqual(C.checkSubmit(c, { ...ok, hasText: false, hasStrokes: false }), { ok: false, code: 'BAD_REQUEST' });
  const c2 = play(mk(), 'A', T0 + 1000);
  const dsc = C.applyClaim(c2, { openid: 'B', claimId: 'cb', now: T0 + 2000 });
  assert.deepEqual(C.checkSubmit(dsc, { openid: 'B', claimId: 'cb', now: T0 + 2000, hasText: false, hasStrokes: true }), { ok: false, code: 'BAD_REQUEST' });
  assert.equal(C.checkSubmit(dsc, { openid: 'B', claimId: 'cb', now: T0 + 2000, hasText: true, hasStrokes: false }).ok, true);
});

test('AC 2: createChain gives the starter a claim on 棒 1; nobody else can claim it while valid', () => {
  const c = mk();
  assert.equal(c.state, 'starting');
  assert.equal(c.claim.openid, 'A');
  assert.equal(c.claim.step, 1);
  assert.equal(c.claim.expiresAt, T0 + 150e3);
  assert.equal(c.promptText, '月亮吃月饼');
  assert.deepEqual(C.canClaim(c, base({ openid: 'B', now: T0 + 1000 })).code, 'TAKEN');
  assert.equal(C.canClaim(c, base({ openid: 'A', now: T0 + 1000 })).resume, true);
});

test('AC 3: an abandoned 棒 1 turns the chain abandoned (release, or the sweeper after the claim expires)', () => {
  const rel = C.releaseClaim(mk(), { openid: 'A', claimId: 'c0', now: T0 + 5000 });
  assert.equal(rel.chain.state, 'abandoned');
  assert.equal(C.releaseClaim(rel.chain, { openid: 'A', claimId: 'c0', now: T0 }).released, false, 'idempotent');
  const sw = C.sweepChain(mk(), T0 + 150e3 + 1);
  assert.equal(sw.event, 'abandoned');
  assert.equal(sw.chain.state, 'abandoned');
  assert.equal(C.sweepChain(mk(), T0 + 100e3).event, null, 'still within the claim');
  assert.equal(C.canClaim(sw.chain, base({ openid: 'B' })).code, 'CHAIN_CLOSED');
});

test('AC 4: the author of 棒 n cannot claim 棒 n+1 (PREV_MINE)', () => {
  const c = play(mk(), 'A', T0 + 1000);
  assert.equal(c.nextStep, 2);
  assert.equal(C.canClaim(c, base({ openid: 'A', now: T0 + 5000 })).code, 'PREV_MINE');
  assert.equal(C.canClaim(c, base({ openid: 'B', now: T0 + 5000 })).ok, true);
});

test('AC 5: 3 passed or pending 棒 hit the cap (CAP_REACHED); blocked and void attempts do not count', () => {
  let c = play(mk(), 'A', T0 + 1000);
  c = play(c, 'B', T0 + 2000);
  c = play(c, 'A', T0 + 3000);
  c = play(c, 'B', T0 + 4000);
  assert.equal(c.perPersonCount.A, 2);
  c = play(c, 'A', T0 + 5000); // 棒 5
  assert.equal(c.perPersonCount.A, 3);
  c = play(c, 'B', T0 + 6000); // 棒 6 reveals
  assert.equal(c.state, 'revealed');
  // cap on an earlier state: A with 3 pending/passed cannot claim even when eligible by order
  const c2 = { ...play(play(play(mk(), 'A', T0 + 1000), 'B', T0 + 2000), 'A', T0 + 3000), };
  const c3 = play(c2, 'C', T0 + 4000); // 棒 4 by C so A is not previous
  const fake = { ...c3, perPersonCount: { ...c3.perPersonCount, A: 3 } };
  assert.equal(C.canClaim(fake, base({ openid: 'A', now: T0 + 5000 })).code, 'CAP_REACHED');
  // a pending drawing counts, then a block gives the slot back
  let p = play(play(mk(), 'A', T0 + 1000), 'B', T0 + 2000);
  p = C.applyClaim(p, { openid: 'C', claimId: 'kc', now: T0 + 3000 });
  p = C.beginPending(p, { stepId: 'CH1_3_1', openid: 'C', attempt: 1, now: T0 + 3000 });
  assert.equal(p.perPersonCount.C, 1);
  const blocked = C.resolvePending(p, { stepId: 'CH1_3_1', outcome: 'blocked', now: T0 + 4000 }).chain;
  assert.equal(blocked.perPersonCount.C, 0);
  const voided = C.resolvePending(p, { stepId: 'CH1_3_1', outcome: 'void', now: T0 + 4000 }).chain;
  assert.equal(voided.perPersonCount.C, 0);
});

test('AC 6: two accounts alternating (A 1/3/5, B 2/4/6) complete the chain', () => {
  let c = mk();
  const who = ['A', 'B', 'A', 'B', 'A', 'B'];
  who.forEach((w, i) => {
    c = play(c, w, T0 + 1000 * (i + 1));
  });
  assert.equal(c.state, 'revealed');
  assert.equal(c.passed, 6);
  assert.equal(c.revealReason, 'complete');
  assert.deepEqual(c.authors.slice(1), who);
  assert.equal(c.perPersonCount.A, 3);
  assert.equal(c.perPersonCount.B, 3);
  assert.deepEqual([...c.participants].sort(), ['A', 'B']);
});

test('AC 7: claiming needs membership of the chain\'s group (WRONG_GROUP / NEED_GROUP)', () => {
  const c = play(mk(), 'A', T0 + 1000);
  const no = base({ openid: 'B', now: T0 + 2000, memberOfChainGroup: false, groupOpenGId: null });
  assert.equal(C.canClaim(c, no).code, 'NEED_GROUP');
  assert.equal(C.canClaim(c, { ...no, groupOpenGId: 'G2' }).code, 'WRONG_GROUP');
  assert.equal(C.canClaim(c, { ...no, memberOfChainGroup: true }).ok, true, 'a membership row is enough, no ticket needed');
});

test('AC 8: an unbound chain binds to the group of the first claim with group context; later claims from another group fail', () => {
  let c = play(mk({ openGId: null, groupRef: null }), 'A', T0 + 1000);
  assert.equal(c.openGId, null);
  const none = base({ openid: 'B', now: T0 + 2000, groupOpenGId: null, memberOfChainGroup: false });
  assert.equal(C.canClaim(c, none).code, 'NEED_GROUP');
  const d = C.canClaim(c, { ...none, groupOpenGId: 'G7' });
  assert.deepEqual([d.ok, d.bind], [true, { openGId: 'G7' }]);
  c = C.applyClaim(c, { openid: 'B', claimId: 'kb', now: T0 + 2000, bind: { openGId: 'G7', groupRef: 'r7' } });
  assert.equal(c.openGId, 'G7');
  const rel = C.releaseClaim(c, { openid: 'B', claimId: 'kb', now: T0 + 3000 }).chain;
  assert.equal(C.canClaim(rel, { ...none, now: T0 + 4000, groupOpenGId: 'G8' }).code, 'WRONG_GROUP');
  assert.equal(C.canClaim(rel, { ...none, now: T0 + 4000, groupOpenGId: 'G7', memberOfChainGroup: true }).ok, true);
  // the starter may re-claim an unbound 棒 1 with no group (edge 11), nobody else
  const first = C.newChain({ chainId: 'X', starter: 'A', claimId: 'c', now: T0, dateKey: '20261101', prompt });
  const blocked = C.resolvePending(C.beginPending(first, { stepId: 'X_1_1', openid: 'A', attempt: 1, now: T0 + 1 }), { stepId: 'X_1_1', outcome: 'blocked', now: T0 + 2 }).chain;
  assert.equal(blocked.state, 'open');
  assert.equal(blocked.nextStep, 1);
  assert.equal(C.canClaim(blocked, { ...none, openid: 'A', now: T0 + 3 }).ok, true);
  assert.equal(C.canClaim(blocked, { ...none, openid: 'B', now: T0 + 3 }).code, 'NEED_GROUP');
});

test('AC 12: a claim lasts 150 s; a late submit is accepted if nobody claimed since, otherwise CLAIM_LOST', () => {
  let c = play(mk(), 'A', T0 + 1000);
  c = C.applyClaim(c, { openid: 'B', claimId: 'kb', now: T0 + 10000 });
  assert.equal(c.claim.expiresAt, T0 + 160000);
  const sub = (now, o) => C.checkSubmit(c, { openid: 'B', claimId: 'kb', now, hasText: true, hasStrokes: false, ...o });
  assert.deepEqual([sub(T0 + 159999).ok, sub(T0 + 159999).late], [true, false]);
  assert.deepEqual([sub(T0 + 160001).ok, sub(T0 + 160001).late], [true, true], 'late but unclaimed: accepted');
  // after expiry another player claims
  const other = C.applyClaim(c, { openid: 'C', claimId: 'kc', now: T0 + 170000 });
  assert.equal(C.canClaim(c, base({ openid: 'C', now: T0 + 170000 })).ok, true);
  assert.deepEqual(C.checkSubmit(other, { openid: 'B', claimId: 'kb', now: T0 + 171000, hasText: true, hasStrokes: false }), { ok: false, code: 'CLAIM_LOST' });
  // others are blocked while it is active
  assert.equal(C.canClaim(c, base({ openid: 'C', now: T0 + 100000 })).code, 'TAKEN');
  assert.equal(C.canClaim(c, base({ openid: 'C', now: T0 + 100000 })).etaSec, 60);
  // released claim cannot be submitted
  const rel = C.releaseClaim(c, { openid: 'B', claimId: 'kb', now: T0 + 20000 }).chain;
  assert.equal(C.checkSubmit(rel, { openid: 'B', claimId: 'kb', now: T0 + 21000, hasText: true, hasStrokes: false }).code, 'CLAIM_LOST');
  // wrong claim id / wrong user
  assert.equal(C.checkSubmit(c, { openid: 'B', claimId: 'zz', now: T0 + 21000, hasText: true, hasStrokes: false }).code, 'CLAIM_LOST');
  assert.equal(C.checkSubmit(c, { openid: 'C', claimId: 'kb', now: T0 + 21000, hasText: true, hasStrokes: false }).code, 'CLAIM_LOST');
});

test('AC 13: a pending latest 棒 blocks claims (PENDING) and a verdict reopens or advances', () => {
  let c = mk();
  const sid = 'CH1_1_1';
  c = C.beginPending(c, { stepId: sid, openid: 'A', attempt: 1, now: T0 + 1000 });
  assert.equal(c.state, 'pending');
  assert.equal(c.claim, null);
  assert.equal(C.canClaim(c, base({ openid: 'B', now: T0 + 2000 })).code, 'PENDING');
  assert.equal(C.resolvePending(c, { stepId: 'nope', outcome: 'passed', now: T0 }).stale, true);
  const pass = C.resolvePending(c, { stepId: sid, outcome: 'passed', now: T0 + 3000 });
  assert.equal(pass.chain.state, 'open');
  assert.equal(pass.chain.nextStep, 2);
  assert.equal(C.resolvePending(pass.chain, { stepId: sid, outcome: 'passed', now: T0 + 4000 }).stale, true, 'duplicate verdict');
  const blk = C.resolvePending(c, { stepId: sid, outcome: 'blocked', now: T0 + 3000 }).chain;
  assert.deepEqual([blk.state, blk.nextStep, blk.passed], ['open', 1, 0]);
});

test('AC 15: when 棒 6 passes the chain is revealed with reason complete in the same transition', () => {
  let c = mk();
  for (let i = 0; i < 5; i++) c = play(c, i % 2 ? 'B' : 'A', T0 + 1000 * (i + 1));
  const c6 = C.applyClaim(c, { openid: 'B', claimId: 'k6', now: T0 + 7000 });
  const r = C.passText(c6, { stepId: 'CH1_6_1', openid: 'B', attempt: 1, now: T0 + 8000 });
  assert.equal(r.revealed, true);
  assert.equal(r.chain.state, 'revealed');
  assert.equal(r.chain.revealReason, 'complete');
  assert.equal(r.chain.revealedAt, T0 + 8000);
  assert.equal(r.chain.nextStep, null);
});

test('AC 16: revealNow only for the starter, with >= 4 passed and nothing active', () => {
  let c = mk();
  for (let i = 0; i < 3; i++) c = play(c, i % 2 ? 'B' : 'A', T0 + 1000 * (i + 1));
  assert.equal(C.canRevealNow(c, 'A', T0 + 9000).code, 'TOO_EARLY');
  c = play(c, 'B', T0 + 4000);
  assert.equal(c.passed, 4);
  assert.equal(C.canRevealNow(c, 'B', T0 + 9000).code, 'NOT_STARTER');
  assert.equal(C.canRevealNow(c, 'A', T0 + 9000).ok, true);
  const claimed = C.applyClaim(c, { openid: 'C', claimId: 'kc', now: T0 + 5000 });
  assert.deepEqual(C.canRevealNow(claimed, 'A', T0 + 6000), { ok: false, code: 'TOO_EARLY', busy: true });
  assert.equal(C.canRevealNow(claimed, 'A', T0 + 5000 + 151e3).ok, true, 'claim expired');
  const rev = C.applyRevealNow(c, T0 + 9000);
  assert.deepEqual([rev.state, rev.revealReason], ['revealed', 'early']);
  assert.equal(C.canRevealNow(rev, 'A', T0 + 10000).code, 'CHAIN_CLOSED');
  assert.equal(C.canRevealNow(mk(), 'A', T0).code, 'CHAIN_CLOSED', 'starting chains cannot be revealed');
});

test('AC 17: at 48 h a chain with >= 4 passed reveals (expiry), fewer expires; both wait for an active claim or pending 棒', () => {
  let c = mk();
  for (let i = 0; i < 4; i++) c = play(c, i % 2 ? 'B' : 'A', T0 + 1000 * (i + 1));
  const end = T0 + 48 * 3600e3;
  assert.equal(C.sweepChain(c, end - 1).event, null);
  const r = C.sweepChain(c, end);
  assert.deepEqual([r.event, r.chain.state, r.chain.revealReason], ['reveal', 'revealed', 'expiry']);
  // waits for an active claim
  const claimed = C.applyClaim(c, { openid: 'C', claimId: 'kc', now: end - 10000 });
  assert.equal(C.sweepChain(claimed, end).event, null);
  assert.equal(C.sweepChain(claimed, end - 10000 + 150e3 + 1).event, 'reveal');
  // waits for a pending drawing
  let p = play(play(play(mk(), 'A', T0 + 1), 'B', T0 + 2), 'A', T0 + 3);
  p = C.applyClaim(p, { openid: 'B', claimId: 'kb', now: T0 + 4 });
  p = C.beginPending(p, { stepId: 'CH1_4_1', openid: 'B', attempt: 1, now: T0 + 5 });
  assert.equal(C.sweepChain({ ...p, kind: 1 }, end + 1).event, null);
  // fewer than 4: expired
  const few = play(play(mk(), 'A', T0 + 1), 'B', T0 + 2);
  const e = C.sweepChain(few, end);
  assert.deepEqual([e.event, e.chain.state], ['expire', 'expired']);
  assert.equal(C.canClaim(e.chain, base({ openid: 'C', now: end + 1 })).code, 'CHAIN_CLOSED');
  assert.equal(C.canSameAgain, undefined, '同题再传 is removed (PO-45)');
});

test('reopenLatest: the latest passed 棒 of an open chain reopens, cancels the next claim and gives the cap slot back', () => {
  let c = play(play(mk(), 'A', T0 + 1000), 'B', T0 + 2000);
  c = C.applyClaim(c, { openid: 'C', claimId: 'kc', now: T0 + 3000 });
  const r = C.reopenLatest(c, 2, T0 + 4000);
  assert.equal(r.reopened, true);
  assert.deepEqual([r.chain.passed, r.chain.nextStep, r.chain.claim, r.chain.perPersonCount.B], [1, 2, null, 0]);
  assert.equal(r.cancelledClaim.openid, 'C');
  assert.deepEqual(C.reopenLatest(c, 1, T0 + 4000).reopened, false, 'older 棒: unchanged');
  const rev = C.applyRevealNow({ ...play(play(play(play(mk(), 'A', 1 + T0), 'B', 2 + T0), 'A', 3 + T0), 'B', 4 + T0) }, T0 + 5);
  assert.equal(C.reopenLatest(rev, 4, T0 + 6).reopened, false, 'revealed chain keeps its shape');
});

test('removed and hidden chains are closed to everything', () => {
  const c = play(mk(), 'A', T0 + 1000);
  const rm = C.removeChain(c, T0 + 2000);
  assert.equal(rm.state, 'removed');
  assert.equal(C.canClaim(rm, base({ openid: 'B', now: T0 + 3000 })).code, 'CHAIN_CLOSED');
  const hid = C.setChainHidden(c, 'report', T0 + 2000);
  assert.equal(C.canClaim(hid, base({ openid: 'B', now: T0 + 3000 })).code, 'CHAIN_CLOSED');
  assert.equal(C.setChainHidden(hid, null, T0 + 3000).hidden, null);
});

test('claim ordering: policy first (RULES_REQUIRED, RESTRICTED, UGC_PAUSED), daily limits last; resume skips limits', () => {
  const c = play(mk(), 'A', T0 + 1000);
  const b = (o) => C.canClaim(c, base({ openid: 'B', now: T0 + 2000, ...o }));
  assert.equal(b({ rulesOk: false }).code, 'RULES_REQUIRED');
  const r = b({ restrictedUntil: T0 + 99999 });
  assert.deepEqual([r.code, r.until], ['RESTRICTED', T0 + 99999]);
  assert.equal(b({ restrictedUntil: T0 }).ok, true, 'expired restriction');
  assert.equal(b({ ugcOk: false }).code, 'UGC_PAUSED');
  assert.equal(b({ stepsToday: 80 }).code, 'STEP_LIMIT');
  assert.equal(b({ claimsOnChainToday: 3 }).code, 'CLAIM_LIMIT');
  assert.equal(b({ stepsToday: 79, claimsOnChainToday: 2 }).ok, true);
  const held = C.applyClaim(c, { openid: 'B', claimId: 'kb', now: T0 + 2000 });
  const res = C.canClaim(held, base({ openid: 'B', now: T0 + 3000, claimsOnChainToday: 3 }));
  assert.equal(res.resume, true);
});

test('AC 20 (property): no operation sequence moves a revealed, expired, removed or abandoned chain back to open', () => {
  const people = ['A', 'B', 'C', 'D'];
  const closed = ['revealed', 'expired', 'removed', 'abandoned'];
  for (let seed = 1; seed <= 300; seed++) {
    const rng = mulberry32(seed);
    let c = mk();
    let now = T0;
    let wasClosed = false;
    for (let step = 0; step < 60; step++) {
      now += Math.floor(rng() * 90e3);
      const who = people[Math.floor(rng() * people.length)];
      const op = Math.floor(rng() * 11);
      if (op === 0) {
        const d = C.canClaim(c, base({ openid: who, now }));
        if (d.ok && !d.resume) c = C.applyClaim(c, { openid: who, claimId: 'k' + step, now });
      } else if (op === 1 && c.claim) c = C.releaseClaim(c, { openid: c.claim.openid, claimId: c.claim.claimId, now }).chain;
      else if (op === 2 && c.claim) {
        const k = C.kindOf(c.claim.step);
        const chk = C.checkSubmit(c, { openid: c.claim.openid, claimId: c.claim.claimId, now, hasText: k === 'describe', hasStrokes: k === 'draw' });
        if (chk.ok) {
          const sid = C.stepId(c._id, c.claim.step, c.attempts[c.claim.step] + 1);
          const at = c.attempts[c.claim.step] + 1;
          c = k === 'describe' ? C.passText(c, { stepId: sid, openid: c.claim.openid, attempt: at, now }).chain : C.beginPending(c, { stepId: sid, openid: c.claim.openid, attempt: at, now });
        }
      } else if (op === 3 && c.pending) c = C.resolvePending(c, { stepId: c.pending.stepId, outcome: ['passed', 'blocked', 'void'][Math.floor(rng() * 3)], now }).chain;
      else if (op === 4) c = C.sweepChain(c, now + Math.floor(rng() * 3) * 24 * 3600e3).chain;
      else if (op === 5 && C.canRevealNow(c, 'A', now).ok) c = C.applyRevealNow(c, now);
      else if (op === 6 && c.passed > 0) c = C.reopenLatest(c, c.passed, now).chain;
      else if (op === 7 && rng() < 0.05) c = C.removeChain(c, now);
      else if (op === 8 && rng() < 0.2) c = C.setChainHidden(c, rng() < 0.5 ? 'report' : null, now);
      else if (op === 9) c = C.resolvePending(c, { stepId: 'late', outcome: 'passed', now }).chain;
      if (wasClosed) assert.ok(closed.includes(c.state), `seed ${seed} step ${step}: ${c.state}`);
      if (closed.includes(c.state)) wasClosed = true;
      // invariants
      assert.ok(c.passed >= 0 && c.passed <= 6);
      if (c.state === 'open') assert.equal(c.nextStep, c.passed + 1);
      for (const p of Object.keys(c.perPersonCount)) assert.ok(c.perPersonCount[p] >= 0 && c.perPersonCount[p] <= 3, `cap ${p}`);
      for (let n = 2; n <= 6; n++) if (c.authors[n] && c.authors[n - 1]) assert.notEqual(c.authors[n], c.authors[n - 1], 'never twice in a row');
    }
  }
});

test('chain functions never mutate their input', () => {
  const c = mk();
  const frozen = JSON.stringify(c);
  C.applyClaim(c, { openid: 'B', claimId: 'x', now: T0 + 200e3 });
  C.releaseClaim(c, { openid: 'A', claimId: 'c0', now: T0 });
  C.beginPending(c, { stepId: 's', openid: 'A', attempt: 1, now: T0 });
  C.sweepChain(c, T0 + 1e9);
  C.removeChain(c, T0);
  assert.equal(JSON.stringify(c), frozen);
});
