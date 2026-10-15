'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core/chain');
const P = require('../core/players');
const { CONFIG } = require('../core/config');
const { mulberry32 } = require('../core/rng');

const T0 = Date.UTC(2026, 10, 20, 4, 0, 0);
let seq = 0;

function ctx(openid, now, extra) {
  return Object.assign({ openid, now, rulesVersion: 1, ugc: { createEnabled: true }, isMember: true, hasGroupContext: true, stepsToday: 0, claimsOnChainToday: 0, claimId: 'c' + ++seq }, extra || {});
}

function mk(openGId) {
  return C.newChain({ id: 'chain00001', starter: 'A', promptId: 'A01', promptText: '小猫吃面条', custom: false, openGId: openGId === undefined ? 'G1' : openGId, claimId: 'start', now: T0, dateKey: '20261120' });
}

/** play step n by `who`: claim, submit (draw -> pending -> pass) */
function play(chain, who, now, opts) {
  const o = opts || {};
  if (!(chain.claim && chain.claim.openid === who)) {
    const c = C.claim(chain, ctx(who, now));
    assert.equal(c.ok, true, `${who} claim step ${chain.nextStep}: ${c.code}`);
  }
  const step = chain.claim.step;
  const kind = C.kindOfStep(step);
  const s = C.checkSubmit(chain, { openid: who, claimId: chain.claim.claimId, kind, now });
  assert.equal(s.ok, true, s.code);
  if (kind === 'draw') {
    assert.equal(C.markPending(chain, { step, author: who, stepId: 's' + step, now }).ok, true);
    if (o.verdict === 'block') return C.dropPending(chain, now);
    return C.passStep(chain, { step, author: who, stepId: 's' + step, now });
  }
  return C.passStep(chain, { step, author: who, stepId: 's' + step, now });
}

test('AC 1: odd steps draw, even steps describe; chain length 6; submit kind is enforced', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(C.kindOfStep), ['draw', 'describe', 'draw', 'describe', 'draw', 'describe']);
  const ch = mk();
  const bad = C.checkSubmit(ch, { openid: 'A', claimId: 'start', kind: 'describe', now: T0 });
  assert.deepEqual([bad.ok, bad.code], [false, 'BAD_KIND']);
  assert.equal(ch.length, 6);
});

test('AC 2/4: the starter holds the 第 1 棒 claim; nobody else can take it; no two in a row', () => {
  const ch = mk();
  assert.equal(ch.claim.step, 1);
  assert.equal(ch.claim.expiresAt - ch.claim.at, 150e3);
  assert.equal(C.canClaim(ch, ctx('B', T0 + 1000)).code, 'TAKEN');
  assert.equal(C.canClaim(ch, ctx('A', T0 + 1000)).resume, true);
  play(ch, 'A', T0 + 5000);
  assert.equal(ch.passed, 1);
  assert.equal(C.canClaim(ch, ctx('A', T0 + 6000)).code, 'PREV_MINE');
  assert.equal(C.canClaim(ch, ctx('B', T0 + 6000)).ok, true);
});

test('AC 6/5: two accounts complete a chain (A 1/3/5, B 2/4/6) and the 3-per-person cap holds', () => {
  const ch = mk();
  let t = T0;
  for (let n = 1; n <= 6; n++) {
    const who = n % 2 ? 'A' : 'B';
    const other = n % 2 ? 'B' : 'A';
    t += 20e3;
    play(ch, who, t);
    if (n < 6) assert.equal(C.canClaim(ch, ctx(who, t + 1)).code, 'PREV_MINE', 'step ' + n);
    void other;
  }
  assert.equal(ch.state, 'revealed');
  assert.equal(ch.revealReason, 'complete');
  assert.equal(ch.passed, 6);
  assert.deepEqual(ch.perPersonCount, { A: 3, B: 3 });
  assert.deepEqual(ch.participants.sort(), ['A', 'B']);
});

test('AC 5: cap of 3 (passed or pending); blocked and void attempts do not count', () => {
  const ch = mk();
  const t = T0;
  play(ch, 'A', t); // 1 (A)
  play(ch, 'B', t + 1e3); // 2
  play(ch, 'A', t + 2e3); // 3 (A)
  play(ch, 'B', t + 3e3); // 4
  // A takes 5 but it is blocked: does not count
  play(ch, 'A', t + 4e3, { verdict: 'block' });
  assert.equal(ch.state, 'open');
  assert.equal(ch.perPersonCount.A, 2);
  assert.equal(ch.nextStep, 5);
  // A pending counts
  const c = C.claim(ch, ctx('A', t + 5e3));
  assert.equal(c.ok, true);
  C.markPending(ch, { step: 5, author: 'A', stepId: 's5b', now: t + 6e3 });
  assert.equal(ch.perPersonCount.A, 3);
  assert.equal(C.canClaim(ch, ctx('C', t + 7e3)).code, 'PENDING');
  C.dropPending(ch, t + 8e3); // void
  assert.equal(ch.perPersonCount.A, 2);
  // fill A to 3 legitimately then cap
  const ch2 = mk();
  play(ch2, 'A', t);
  play(ch2, 'B', t);
  play(ch2, 'A', t);
  play(ch2, 'C', t);
  play(ch2, 'A', t); // A's third: 1, 3, 5
  assert.equal(ch2.perPersonCount.A, 3);
  assert.equal(C.canClaim(ch2, ctx('B', t)).ok, true); // 6 by B
  const other = mk();
  other.perPersonCount.B = 3;
  other.passed = 1;
  other.authors[1] = 'A';
  other.nextStep = 2;
  other.state = 'open';
  other.claim = null;
  assert.equal(C.canClaim(other, ctx('B', t)).code, 'CAP_REACHED');
});

test('AC 7/8: group membership and binding', () => {
  const ch = mk('G1');
  ch.claim = null;
  ch.state = 'open';
  ch.passed = 1;
  ch.authors[1] = 'A';
  ch.nextStep = 2;
  assert.equal(C.canClaim(ch, ctx('B', T0, { isMember: false, hasGroupContext: false })).code, 'NEED_GROUP');
  assert.equal(C.canClaim(ch, ctx('B', T0, { isMember: false, hasGroupContext: true })).code, 'WRONG_GROUP');
  assert.equal(C.canClaim(ch, ctx('B', T0, { isMember: true, hasGroupContext: false })).ok, true);
  // unbound chain: first claim with group context binds
  const u = mk(null);
  u.claim = null;
  u.state = 'open';
  u.passed = 1;
  u.authors[1] = 'A';
  u.nextStep = 2;
  assert.equal(C.canClaim(u, ctx('B', T0, { hasGroupContext: false, isMember: false })).code, 'NEED_GROUP');
  const r = C.claim(u, ctx('B', T0, { hasGroupContext: true, groupId: 'G9' }));
  assert.equal(r.ok, true);
  assert.equal(r.bound, true);
  assert.equal(u.openGId, 'G9');
  // afterwards another group fails
  C.release(u, 'B', u.claim.claimId, T0 + 1);
  assert.equal(C.canClaim(u, ctx('C', T0 + 2, { isMember: false, hasGroupContext: true })).code, 'WRONG_GROUP');
  // the starter of an unbound chain may re-claim without group context (edge 11)
  const s = mk(null);
  s.claim = null;
  s.state = 'open';
  assert.equal(C.canClaim(s, ctx('A', T0, { hasGroupContext: false, isMember: false })).ok, true);
});

test('AC 9: 50 racing claims, exactly one wins (sequential model of the transaction)', () => {
  for (let race = 0; race < 50; race++) {
    const ch = mk();
    ch.claim = null;
    ch.state = 'open';
    ch.passed = 1;
    ch.authors[1] = 'A';
    ch.nextStep = 2;
    const rng = mulberry32(race + 1);
    const order = ['B', 'C', 'D', 'E'].sort(() => rng() - 0.5);
    const res = order.map((w) => C.claim(ch, ctx(w, T0 + race)));
    assert.equal(res.filter((r) => r.ok).length, 1);
    assert.ok(res.filter((r) => !r.ok).every((r) => r.code === 'TAKEN'));
  }
});

test('AC 12: claim TTL 150 s; late submit accepted if nobody claimed since, otherwise CLAIM_LOST', () => {
  const ch = mk();
  play(ch, 'A', T0 + 1e3);
  const c = C.claim(ch, ctx('B', T0 + 10e3, { claimId: 'cb' }));
  assert.equal(c.claim.expiresAt, T0 + 10e3 + 150e3);
  assert.equal(C.canClaim(ch, ctx('C', T0 + 159e3)).code, 'TAKEN');
  assert.equal(C.canClaim(ch, ctx('C', T0 + 160e3)).ok, true);
  // B submits late (nobody claimed): accepted
  const late = C.checkSubmit(ch, { openid: 'B', claimId: 'cb', kind: 'describe', now: T0 + 200e3 });
  assert.deepEqual([late.ok, late.late], [true, true]);
  // C claims after expiry: B's submit now fails
  const cc = C.claim(ch, ctx('C', T0 + 200e3, { claimId: 'cc' }));
  assert.equal(cc.ok, true);
  const lost = C.checkSubmit(ch, { openid: 'B', claimId: 'cb', kind: 'describe', now: T0 + 201e3 });
  assert.deepEqual([lost.ok, lost.code], [false, 'CLAIM_LOST']);
});

test('AC 13: a pending latest 棒 blocks claims; block reopens the same 棒', () => {
  const ch = mk();
  C.markPending(ch, { step: 1, author: 'A', stepId: 's1', now: T0 });
  assert.equal(ch.state, 'pending');
  assert.equal(C.canClaim(ch, ctx('B', T0)).code, 'PENDING');
  assert.equal(C.entryState(ch, ctx('B', T0)).state, 'pending');
  C.dropPending(ch, T0 + 1);
  assert.equal(ch.state, 'open');
  assert.equal(ch.nextStep, 1);
  assert.equal(C.canClaim(ch, ctx('B', T0 + 2)).ok, true); // anyone eligible, incl. the author (cap counts only passed/pending)
  assert.equal(C.canClaim(ch, ctx('A', T0 + 2)).ok, true);
});

test('AC 14: timers 60/45 s wall clock and the time-up rule', () => {
  assert.deepEqual(C.turnTimer('draw', 1000, 1000), { secLeft: 60, warn: false, over: false, total: 60 });
  assert.equal(C.turnTimer('describe', 1000, 1000).secLeft, 45);
  assert.equal(C.turnTimer('draw', 0, 49500).secLeft, 11);
  assert.equal(C.turnTimer('draw', 0, 50000).warn, true);
  assert.equal(C.turnTimer('draw', 0, 60000).over, true);
  assert.equal(C.turnTimer('draw', 0, 90000).secLeft, 0);
  assert.equal(C.turnTimer('draw', 0, 0, { timers: { drawSec: 30, describeSec: 20, warnSec: 5 } }).total, 30);
  assert.equal(C.timeUpAction('draw', { strokes: 1 }), 'submit');
  assert.equal(C.timeUpAction('draw', { strokes: 0 }), 'release');
  assert.equal(C.timeUpAction('describe', { chars: 2 }), 'submit');
  assert.equal(C.timeUpAction('describe', { chars: 1 }), 'release');
  assert.equal(C.mmss(48), '0:48');
  assert.equal(C.mmss(60), '1:00');
});

test('AC 15: a passing 第 6 棒 reveals in the same call', () => {
  const ch = mk();
  const who = ['A', 'B', 'A', 'B', 'A'];
  who.forEach((w, i) => play(ch, w, T0 + i));
  const r = play(ch, 'B', T0 + 10);
  assert.equal(r.revealed, true);
  assert.equal(ch.state, 'revealed');
});

test('AC 16: revealNow rules', () => {
  const ch = mk();
  play(ch, 'A', T0);
  play(ch, 'B', T0);
  play(ch, 'A', T0);
  assert.equal(C.canRevealNow(ch, 'A', T0).code, 'TOO_EARLY');
  play(ch, 'B', T0);
  assert.equal(C.canRevealNow(ch, 'B', T0).code, 'NOT_STARTER');
  C.claim(ch, ctx('C', T0 + 1000));
  assert.equal(C.canRevealNow(ch, 'A', T0 + 2000).code, 'TAKEN');
  assert.equal(C.canRevealNow(ch, 'A', T0 + 200e3).ok, true); // claim expired
  const r = C.revealNow(ch, 'A', T0 + 200e3);
  assert.equal(r.ok, true);
  assert.deepEqual([ch.state, ch.revealReason], ['revealed', 'early']);
  assert.equal(C.revealNow(ch, 'A', T0 + 201e3).code, 'CHAIN_CLOSED');
  const p = mk();
  p.passed = 4;
  p.state = 'pending';
  p.claim = null;
  p.pending = { step: 5, author: 'B', stepId: 'x' };
  assert.equal(C.canRevealNow(p, 'A', T0).code, 'PENDING');
});

test('AC 17: expiry reveals >= 4 passed, expires fewer, waits for claim/pending', () => {
  const mkAt = (passed) => {
    const ch = mk();
    const who = ['A', 'B', 'A', 'B', 'A', 'B'];
    for (let i = 0; i < passed; i++) play(ch, who[i], T0 + i);
    return ch;
  };
  const four = mkAt(4);
  assert.equal(C.sweep(four, T0 + 47 * 3600e3).event, null);
  assert.equal(C.sweep(four, T0 + 48 * 3600e3 + 1).event, 'revealed');
  assert.equal(four.revealReason, 'expiry');
  const three = mkAt(3);
  assert.equal(C.sweep(three, T0 + 49 * 3600e3).event, 'expired');
  assert.equal(three.state, 'expired');
  const waiting = mkAt(4);
  C.claim(waiting, ctx('C', T0 + 48 * 3600e3 - 10e3));
  assert.equal(C.sweep(waiting, T0 + 48 * 3600e3 + 1).event, 'wait');
  assert.equal(C.sweep(waiting, T0 + 48 * 3600e3 + 200e3).event, 'revealed');
  const pend = mkAt(2);
  C.claim(pend, ctx('A', T0 + 100));
  C.markPending(pend, { step: 3, author: 'A', stepId: 's3', now: T0 + 200 });
  assert.equal(C.sweep(pend, T0 + 49 * 3600e3).event, 'wait');
  C.dropPending(pend, T0 + 49 * 3600e3);
  assert.equal(C.sweep(pend, T0 + 49 * 3600e3 + 1).event, 'expired');
});

test('AC 3: abandoned 第 1 棒 (release, or sweep 5 minutes after the claim expired)', () => {
  const a = mk();
  assert.equal(C.release(a, 'A', 'start', T0 + 1).abandoned, true);
  assert.equal(a.state, 'abandoned');
  const b = mk();
  assert.equal(C.sweep(b, T0 + 150e3 + 60e3).event, null);
  // a slightly late starter still submits
  assert.equal(C.checkSubmit(b, { openid: 'A', claimId: 'start', kind: 'draw', now: T0 + 200e3 }).ok, true);
  assert.equal(C.sweep(b, T0 + 150e3 + 300e3).event, 'abandoned');
  assert.equal(C.checkSubmit(b, { openid: 'A', claimId: 'start', kind: 'draw', now: T0 + 500e3 }).ok, false);
  assert.equal(C.release(b, 'X', 'start', T0).code, 'CLAIM_LOST');
});

test('reopenStep (report/delete of the latest passed 棒): reopens, cancels claim, voids pending', () => {
  const ch = mk();
  play(ch, 'A', T0);
  play(ch, 'B', T0);
  C.claim(ch, ctx('C', T0 + 10));
  const r = C.reopenStep(ch, 2, T0 + 20);
  assert.equal(r.reopened, true);
  assert.equal(r.cancelledClaim.openid, 'C');
  assert.deepEqual([ch.passed, ch.nextStep, ch.state], [1, 2, 'open']);
  assert.equal(ch.perPersonCount.B, 0);
  assert.deepEqual(ch.participants, ['A']);
  assert.equal(C.reopenStep(ch, 5, T0).reopened, false); // not the latest
  // pending built on it is voided
  play(ch, 'B', T0 + 30);
  C.claim(ch, ctx('A', T0 + 40));
  C.markPending(ch, { step: 3, author: 'A', stepId: 's3', now: T0 + 50 });
  const r2 = C.reopenStep(ch, 2, T0 + 60);
  assert.equal(r2.voidedPending.author, 'A');
  assert.equal(ch.state, 'open');
  // revealed chains are untouched
  const rv = mk();
  C.reveal(rv, 'early', T0);
  assert.equal(C.reopenStep(rv, 0, T0).reopened, false);
});

test('AC 19: restriction, rules, pause and daily caps gate claims in order', () => {
  const ch = mk();
  ch.claim = null;
  ch.state = 'open';
  ch.passed = 1;
  ch.authors[1] = 'A';
  ch.nextStep = 2;
  assert.equal(C.canClaim(ch, ctx('B', T0, { rulesVersion: 0 })).code, 'RULES_REQUIRED');
  const r = C.canClaim(ch, ctx('B', T0, { restrictedUntil: T0 + 5000 }));
  assert.deepEqual([r.code, r.until], ['RESTRICTED', T0 + 5000]);
  assert.equal(C.canClaim(ch, ctx('B', T0, { restrictedUntil: T0 - 1 })).ok, true);
  assert.equal(C.canClaim(ch, ctx('B', T0, { ugc: { createEnabled: false } })).code, 'UGC_PAUSED');
  assert.equal(C.canClaim(ch, ctx('B', T0, { ugc: { createEnabled: true, autoPausedUntil: T0 + 1 } })).code, 'UGC_PAUSED');
  assert.equal(C.canClaim(ch, ctx('B', T0, { stepsToday: 40 })).code, 'STEP_LIMIT');
  assert.equal(C.canClaim(ch, ctx('B', T0, { claimsOnChainToday: 3 })).code, 'CLAIM_LIMIT');
  assert.equal(C.canClaim(null, ctx('B', T0)).code, 'CHAIN_NOT_FOUND');
});

test('entryState maps every viewer situation without content', () => {
  const ch = mk();
  play(ch, 'A', T0);
  const v = (o, x) => C.entryState(ch, ctx(o, T0 + 1000, x)).state;
  assert.equal(v('B'), 'claimable');
  assert.equal(v('A'), 'prevMine');
  assert.equal(v('B', { isMember: false, hasGroupContext: false }), 'wrongGroup');
  assert.equal(v('B', { rulesVersion: 0 }), 'rulesRequired');
  assert.equal(v('B', { restrictedUntil: T0 + 1e6 }), 'restricted');
  assert.equal(v('B', { ugc: { createEnabled: false } }), 'ugcPaused');
  C.claim(ch, ctx('B', T0 + 1000));
  assert.equal(v('C'), 'taken');
  C.reveal(ch, 'early', T0 + 2000);
  assert.equal(v('A'), 'revealedParticipant');
  assert.equal(v('Z'), 'revealedTeaser');
  const rm = mk();
  C.remove(rm, T0);
  assert.equal(C.entryState(rm, ctx('A', T0)).state, 'removed');
  assert.equal(C.entryState(null, ctx('A', T0)).state, 'notFound');
  const ex = mk();
  ex.state = 'expired';
  assert.equal(C.entryState(ex, ctx('A', T0)).state, 'expired');
  const doc = JSON.stringify(C.entryState(ch, ctx('B', T0)));
  assert.ok(!/小猫|strokes|text/.test(doc));
});

test('AC 20: random operation sequences never move a terminal chain back to open', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = mulberry32(seed);
    const ch = mk();
    const users = ['A', 'B', 'C'];
    let now = T0;
    let seenTerminal = null;
    for (let i = 0; i < 80; i++) {
      now += Math.floor(rng() * 400e3);
      const who = users[Math.floor(rng() * 3)];
      const op = Math.floor(rng() * 11);
      if (op === 0) C.claim(ch, ctx(who, now));
      else if (op === 1 && ch.claim) C.release(ch, ch.claim.openid, ch.claim.claimId, now);
      else if (op === 2 && ch.claim) {
        const k = C.kindOfStep(ch.claim.step);
        const s = C.checkSubmit(ch, { openid: ch.claim.openid, claimId: ch.claim.claimId, kind: k, now });
        if (s.ok) {
          if (k === 'draw') C.markPending(ch, { step: s.step, author: ch.claim.openid, stepId: 'x', now });
          else C.passStep(ch, { step: s.step, author: ch.claim.openid, stepId: 'x', now });
        }
      } else if (op === 3 && ch.pending) C.passStep(ch, { step: ch.pending.step, author: ch.pending.author, stepId: 'x', now });
      else if (op === 4 && ch.pending) C.dropPending(ch, now);
      else if (op === 5) C.revealNow(ch, 'A', now);
      else if (op === 6) C.sweep(ch, now + Math.floor(rng() * 3) * 24 * 3600e3);
      else if (op === 7) C.reopenStep(ch, ch.passed, now);
      else if (op === 8 && rng() < 0.05) C.remove(ch, now);
      else if (op === 9 && ch.claim) C.checkSubmit(ch, { openid: who, claimId: 'nope', kind: 'draw', now });
      // invariants
      assert.ok(ch.passed >= 0 && ch.passed <= 6);
      assert.equal(ch.nextStep, Math.min(7, ch.passed + 1));
      if (seenTerminal) {
        assert.equal(ch.state === 'open' || ch.state === 'starting' || ch.state === 'pending', false, `seed ${seed} op ${op}: ${seenTerminal} -> ${ch.state}`);
      }
      if (C.isTerminal(ch)) seenTerminal = ch.state;
      for (const k of Object.keys(ch.perPersonCount)) assert.ok(ch.perPersonCount[k] >= 0 && ch.perPersonCount[k] <= 3, 'cap ' + k);
      if (ch.state === 'pending') assert.ok(ch.pending && !ch.claim);
    }
  }
});

test('players: allowances, strike ladder, restriction copy, streak', () => {
  const p = P.freshPlayer();
  const day = P.dayOf(p, '20261120');
  assert.equal(P.startsLeft(day), 3);
  assert.equal(P.adStartsLeft(day), 2);
  day.starts = 3;
  assert.equal(P.startsLeft(day), 0);
  day.adStarts = 1;
  assert.equal(P.startsLeft(P.dayOf(p, '20261120')), 1);
  assert.equal(P.dayOf(p, '20261121').starts, 0); // reset at the next Beijing date
  const now = T0;
  const s1 = P.addStrike(p, { src: 'verdict' }, now);
  assert.deepEqual([s1.level, s1.warn, s1.restrictedUntil], [1, true, null]);
  assert.equal(P.restrictionOf(p, now), null);
  const s2 = P.addStrike(p, { src: 'report' }, now + 1000);
  assert.equal(s2.restrictedUntil, now + 1000 + 24 * 3600e3);
  const s3 = P.addStrike(p, { src: 'verdict' }, now + 2000);
  assert.equal(s3.restrictedUntil, now + 2000 + 7 * 86400e3);
  const s4 = P.addStrike(p, { src: 'verdict' }, now + 3000);
  assert.deepEqual([s4.restrictedUntil === now + 3000 + 30 * 86400e3, s4.adminReview], [true, true]);
  assert.ok(P.restrictionOf(p, now + 4000).until > now);
  // strikes older than 30 days no longer count
  const q = P.freshPlayer();
  P.addStrike(q, { src: 'verdict' }, now);
  const late = P.addStrike(q, { src: 'verdict' }, now + 31 * 86400e3);
  assert.equal(late.strikes, 1);
  assert.equal(P.untilText(Date.UTC(2026, 9, 17, 6, 0, 0)), '10月17日 14:00');
  // streak
  const st = P.freshPlayer();
  P.touchStreak(st, '20261120');
  P.touchStreak(st, '20261120');
  assert.equal(st.curStreak, 1);
  P.touchStreak(st, '20261121');
  assert.equal(st.curStreak, 2);
  assert.equal(P.streakText(P.streakDays(st, '20261121')), '连续接龙 2 天');
  assert.equal(P.streakText(1), null);
  assert.equal(P.streakDays(st, '20261123'), 0);
  P.touchStreak(st, '20261125');
  assert.equal(st.curStreak, 1);
  assert.equal(st.bestStreak, 2);
});

test('config.withRemote clamps timers and interstitial caps, ignores garbage', () => {
  const { withRemote } = require('../core/config');
  assert.equal(withRemote(null).timers.drawSec, 60);
  assert.equal(withRemote({ timers: { drawSec: 5 } }).timers.drawSec, 60);
  assert.equal(withRemote({ timers: { drawSec: 90 } }).timers.drawSec, 90);
  const i = withRemote({ ads: { interstitial: { minGapSec: 10, maxPerDay: 99 } } }).ads.interstitial;
  assert.deepEqual([i.minGapSec, i.maxPerDay], [120, 4]);
  assert.equal(CONFIG.chain.length, 6);
});
