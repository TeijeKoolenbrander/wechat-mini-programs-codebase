'use strict';
// End-to-end behaviour of the mock server mirror (and therefore of the core rules the real functions reuse):
// AC 1-3, 6, 9-13, 15-19, 37-49, 51, 53-56, 59-61, 71-73, 80-86, 98, 100, spec 3, 6, 7.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMockServer } = require('../js/mock-server');
const { ENTRY_KEYS } = require('../core/views');
const { textFor, SERVER_CODES } = require('../core/codes');
const schema = require('../core/schema');
const allowance = require('../core/allowance');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 12:00 BJT
const MIN = 60e3;

function world(opts) {
  const w = { t: T0 };
  // The v1 scenarios run the dormant async image pipeline and the general text API (spec 6.10, imageMode 'async'); the rev. 2 scenarios
  // (rolls, rooms, sync moderation, forced send) are in tests/mock-rooms.test.js and the cloudfunctions contract suites.
  const srv = createMockServer({ now: () => w.t, seed: 5, appConfig: { moderation: { imageMode: 'async', textApi: 'general' } }, ...opts });
  w.srv = srv;
  w.log = []; // every response, for the schema tests
  let rollSeq = 0;
  const call = (who) => (name, data) => {
    if (name === 'createChain' && data && typeof data.promptId === 'string' && data.rollId === undefined) {
      // a preset prompt must come from the caller's current server roll (F-2): the v1 scenarios get one seeded
      const p = srv.db.players[who] || allowance.newPlayer(who, w.t);
      p.roll = { rollId: 'rtest' + String(++rollSeq).padStart(6, '0'), ctx: 'chain', ids: [data.promptId], rerolls: 0, shownIds: [data.promptId], used: false, at: w.t };
      srv.db.players[who] = p;
      data = { ...data, rollId: p.roll.rollId };
    }
    const r = srv.call(name, data, who);
    w.log.push(r);
    return r;
  };
  for (const u of ['A', 'B', 'C', 'D', 'E']) {
    const id = 'openid-' + u;
    w[u] = { id, call: call(id) };
    assert.equal(w[u].call('agreeRules', { version: 2 }).ok, true);
    w[u].ref = w[u].call('joinGroup', { cloudID: 'cid-3-group-1' }).groupRef;
  }
  w.Y = { id: 'openid-Y', call: call('openid-Y') };
  w.Y.call('agreeRules', { version: 2 });
  w.Y.ref = w.Y.call('joinGroup', { cloudID: 'cid-3-group-2' }).groupRef;
  w.sweep = (min) => {
    w.t += min * MIN;
    return srv.server.modSweeper();
  };
  w.drawing = (k) => ({ v: 1, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });
  /** A starts a chain from a preset prompt and submits 棒 1; the verdict is delivered by the sweeper */
  w.startChain = (u, strokes) => {
    const c = w[u].call('createChain', { promptId: 'I07', groupRef: w[u].ref });
    assert.equal(c.ok, true, JSON.stringify(c));
    const s = w[u].call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: strokes || w.drawing(3), clientMs: 4000, undoCount: 0 });
    assert.equal(s.state, 'pending');
    w.sweep(2);
    return c.chainId;
  };
  w.take = (u, chainId) => w[u].call('claimStep', { chainId, groupRef: w[u].ref });
  w.describe = (u, chainId, text) => {
    const c = w.take(u, chainId);
    assert.equal(c.ok, true, JSON.stringify(c));
    return w[u].call('submitStep', { chainId, claimId: c.claimId, text: text || '一只猫在开出租车' });
  };
  w.paint = (u, chainId, k) => {
    const c = w.take(u, chainId);
    assert.equal(c.ok, true, JSON.stringify(c));
    const s = w[u].call('submitStep', { chainId, claimId: c.claimId, strokes: w.drawing(k || 3) });
    w.sweep(2);
    return s;
  };
  /** a complete 6-棒 chain, A on 1/3/5 and B on 2/4/6 */
  w.fullChain = () => {
    const id = w.startChain('A');
    assert.equal(w.describe('B', id, '一个大饼在天上').state, 'passed');
    w.paint('A', id);
    assert.equal(w.describe('B', id, '外星人在吃披萨').state, 'passed');
    w.paint('A', id);
    const last = w.describe('B', id, '企鹅在沙漠晒太阳');
    return { id, last };
  };
  return w;
}

test('AC 1/2/3/6/15: start, alternate A (1,3,5) and B (2,4,6), the 6th text reveals in the same call; the reveal shows all 6', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
  assert.deepEqual([c.ok, c.claim.step, c.claim.kind, c.claim.sourceText], [true, 1, 'draw', '月亮吃月饼']);
  // AC 2: nobody else can take 棒 1 while the starter's claim is valid
  assert.equal(w.take('B', c.chainId).code, 'TAKEN');
  // AC 3: the start is consumed only when 棒 1 is submitted
  assert.equal(w.A.call('getHome').me.startsLeft, 3);
  const s1 = w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
  assert.deepEqual([s1.state, s1.chainState, s1.revealed], ['pending', 'pending', false]);
  assert.equal(w.A.call('getHome').me.startsLeft, 2);
  w.sweep(2);
  assert.equal(w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref }).state, 'claimable');
  // AC 1: kind mismatches are rejected
  const k2 = w.take('B', c.chainId);
  assert.equal(k2.kind, 'describe');
  assert.equal(w.B.call('submitStep', { chainId: c.chainId, claimId: k2.claimId, strokes: w.drawing(1) }).code, 'BAD_REQUEST');
  assert.equal(w.B.call('submitStep', { chainId: c.chainId, claimId: k2.claimId, text: '一个大饼在天上' }).state, 'passed');
  const k3 = w.take('A', c.chainId);
  assert.equal(k3.kind, 'draw');
  assert.equal(w.A.call('submitStep', { chainId: c.chainId, claimId: k3.claimId, text: '文字不能当画' }).code, 'BAD_REQUEST');
  assert.equal(w.A.call('submitStep', { chainId: c.chainId, claimId: k3.claimId, strokes: w.drawing(3) }).state, 'pending');
  w.sweep(2);
  assert.equal(w.describe('B', c.chainId, '外星人在吃披萨').state, 'passed');
  w.paint('A', c.chainId);
  const last = w.describe('B', c.chainId, '企鹅在沙漠晒太阳');
  assert.deepEqual([last.state, last.chainState, last.revealed], ['passed', 'revealed', true]);
  const rv = w.A.call('getReveal', { chainId: c.chainId });
  assert.equal(rv.ok, true);
  assert.deepEqual(rv.steps.map((s) => s.n), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rv.steps.map((s) => s.kind), ['draw', 'describe', 'draw', 'describe', 'draw', 'describe']);
  assert.equal(rv.reason, 'complete');
  assert.equal(rv.early, false);
  assert.equal(rv.prompt.text, '月亮吃月饼');
  assert.equal(rv.steps[5].text, '企鹅在沙漠晒太阳');
  assert.equal(rv.steps[0].mine, true);
  assert.equal(rv.steps[1].mine, false);
  assert.ok(rv.steps[0].strokes && rv.steps[0].strokes.v === 1);
  // the chain is closed for further claims
  assert.equal(w.take('C', c.chainId).code, 'CHAIN_CLOSED');
});

test('AC 3: an abandoned 棒 1 leaves startsLeft unchanged and the chain becomes abandoned', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
  w.sweep(3);
  assert.equal(w.srv.db.chains[c.chainId].state, 'abandoned');
  assert.equal(w.A.call('getHome').me.startsLeft, 3);
  assert.equal(w.A.call('getChain', { chainId: c.chainId }).state, 'notFound');
  // releasing the claim has the same effect immediately
  const c2 = w.A.call('createChain', { promptId: 'A02' });
  w.A.call('releaseClaim', { chainId: c2.chainId, claimId: c2.claim.claimId });
  assert.equal(w.srv.db.chains[c2.chainId].state, 'abandoned');
});

test('AC 4/5: PREV_MINE and the 3-棒 cap through claimStep', () => {
  const w = world();
  const id = w.startChain('A');
  assert.equal(w.take('A', id).code, 'PREV_MINE');
  assert.equal(w.describe('B', id).state, 'passed');
  assert.equal(w.B.call('getChain', { chainId: id }).state, 'prevMine');
  w.paint('C', id);
  assert.equal(w.describe('B', id, '外星人在吃披萨').state, 'passed');
  w.paint('C', id);
  // B has 2 passed; C has 2 drawings; 棒 6 by A (A has 1)
  assert.equal(w.take('C', id).code, 'PREV_MINE');
  assert.equal(w.srv.db.chains[id].perPersonCount['openid-B'], 2);
  const id2 = w.startChain('A');
  w.describe('B', id2);
  w.paint('A', id2);
  w.describe('B', id2, '外星人在吃披萨');
  w.paint('A', id2); // A: 1,3,5
  // now 棒 6 is B's third; A has 3: A cannot claim (prev is A's anyway); C can
  assert.equal(w.take('A', id2).code, 'PREV_MINE');
  const cap = w.srv.db.chains[id2];
  cap.perPersonCount['openid-D'] = 3; // D already took three
  assert.equal(w.take('D', id2).code, 'CAP_REACHED');
});

test('AC 7/8: claims need group membership; an unbound chain binds on the first claim with group context', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'A01' }); // no group context: unbound
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
  w.sweep(2);
  assert.equal(w.srv.db.chains[c.chainId].openGId, null);
  // Y is only in another group
  const other = w.Y.ref;
  assert.equal(w.Y.call('getChain', { chainId: c.chainId }).state, 'wrongGroup');
  assert.equal(w.Y.call('claimStep', { chainId: c.chainId }).code, 'NEED_GROUP');
  const k = w.B.call('claimStep', { chainId: c.chainId, groupRef: w.B.ref });
  assert.equal(k.ok, true);
  assert.equal(w.srv.db.chains[c.chainId].openGId, 'group-1');
  w.B.call('releaseClaim', { chainId: c.chainId, claimId: k.claimId });
  const wrong = w.Y.call('claimStep', { chainId: c.chainId, groupRef: other });
  assert.equal(wrong.code, 'WRONG_GROUP');
  assert.equal(w.Y.call('getChain', { chainId: c.chainId, groupRef: other }).state, 'wrongGroup');
  // a member of the right group without a ticket (membership row exists) can claim
  assert.equal(w.C.call('claimStep', { chainId: c.chainId }).ok, true);
  // a fake group ref is no group context
  assert.equal(w.srv.call('claimStep', { chainId: c.chainId, groupRef: 'ffffffffffffffff' }, 'openid-nobody').code, 'RULES_REQUIRED');
  // membership older than 30 days stops counting
  w.t += 31 * 86400e3;
  w.srv.db.chains[c.chainId].claim = null;
  w.srv.db.chains[c.chainId].expiresAt += 40 * 86400e3;
  assert.equal(w.D.call('claimStep', { chainId: c.chainId }).code, 'NEED_GROUP');
});

test('AC 9: of two claims for the same 棒 exactly one wins and the other gets TAKEN (50 races)', () => {
  const w = world();
  for (let i = 0; i < 50; i++) {
    const id = w.startChain('A');
    const first = i % 2 ? 'C' : 'B';
    const second = i % 2 ? 'B' : 'C';
    const r1 = w.take(first, id);
    const r2 = w.take(second, id);
    assert.equal(r1.ok, true, 'race ' + i);
    assert.equal(r2.code, 'TAKEN');
    assert.ok(r2.etaSec > 0);
    w.srv.db.players['openid-A'].day.starts = 0; // keep the starter under the daily limit for the loop
    w.srv.db.players['openid-A'].day.steps = 0;
  }
});

test('AC 10: getChain never returns content in any state, only whitelisted keys', () => {
  const w = world();
  const SECRET = ['月亮吃月饼', '一个大饼在天上', '外星人在吃披萨', '企鹅在沙漠晒太阳', 'strokes', '"text"', 'promptText'];
  const checks = [];
  const check = (r, label) => {
    assert.equal(r.ok, true, label + JSON.stringify(r));
    const extra = Object.keys(r).filter((k) => !['ok', 'chainId', 'serverNow', 'activityId', ...ENTRY_KEYS].includes(k));
    assert.deepEqual(extra, [], label);
    const s = JSON.stringify(r);
    for (const x of SECRET) assert.ok(!s.includes(x), `${label} leaks ${x}`);
    checks.push(r.state);
  };
  const c = w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
  check(w.A.call('getChain', { chainId: c.chainId }), 'starting/starter'); // claimable
  check(w.B.call('getChain', { chainId: c.chainId }), 'starting/other'); // notFound
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
  check(w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref }), 'pending');
  w.sweep(2);
  check(w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref }), 'claimable');
  check(w.A.call('getChain', { chainId: c.chainId, groupRef: w.A.ref }), 'prevMine');
  w.take('B', c.chainId);
  check(w.C.call('getChain', { chainId: c.chainId, groupRef: w.C.ref }), 'taken');
  check(w.Y.call('getChain', { chainId: c.chainId, groupRef: w.Y.ref }), 'wrongGroup');
  const full = w.fullChain();
  check(w.A.call('getChain', { chainId: full.id }), 'revealedParticipant');
  check(w.C.call('getChain', { chainId: full.id, groupRef: w.C.ref }), 'revealedTeaser');
  const exp = w.startChain('D');
  w.srv.db.chains[exp].expiresAt = w.t - 1;
  w.sweep(1);
  check(w.D.call('getChain', { chainId: exp }), 'expired');
  const removed = w.startChain('D');
  w.srv.db.chains[removed].state = 'removed';
  check(w.D.call('getChain', { chainId: removed }), 'removed');
  assert.equal(w.A.call('getChain', { chainId: 'NOSUCHCHAIN' }).code, 'CHAIN_NOT_FOUND');
  for (const s of ['claimable', 'notFound', 'pending', 'prevMine', 'taken', 'wrongGroup', 'revealedParticipant', 'revealedTeaser', 'expired', 'removed']) assert.ok(checks.includes(s), 'covered ' + s);
});

test('AC 11/43: claimStep returns the previous 棒 only to the claimant and only if it passed; pending content goes to nobody', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
  // pending: nobody can claim, nothing is returned
  const pend = w.take('B', c.chainId);
  assert.equal(pend.code, 'PENDING');
  assert.equal(pend.prev, undefined);
  assert.equal(JSON.stringify(w.B.call('getGroupChains', { groupRef: w.B.ref })).includes('strokes'), false);
  w.sweep(2);
  const k = w.take('B', c.chainId);
  assert.equal(k.prev.kind, 'draw');
  assert.equal(k.prev.strokes.s.length, 2);
  assert.equal(w.take('C', c.chainId).prev, undefined, 'a rival gets TAKEN and no content');
  // the claimant can resume and gets the same claim
  const again = w.take('B', c.chainId);
  assert.equal(again.claimId, k.claimId);
  // text 棒 1 prompt for the starter on a fresh chain
  const c2 = w.A.call('createChain', { promptId: 'A01' });
  const r = w.A.call('claimStep', { chainId: c2.chainId });
  assert.equal(r.prev.kind, 'prompt');
  assert.equal(r.prev.text, '小猫吃面条');
});

test('AC 12: a claim lasts 150 s; a late submit is accepted if nobody claimed since, else CLAIM_LOST', () => {
  const w = world();
  const id = w.startChain('A');
  const k = w.take('B', id);
  w.t += 155e3;
  const late = w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
  assert.equal(late.state, 'passed', 'late but unclaimed');
  const id2 = w.startChain('A');
  const k2 = w.take('B', id2);
  w.t += 155e3;
  assert.equal(w.take('C', id2).ok, true);
  const lost = w.B.call('submitStep', { chainId: id2, claimId: k2.claimId, text: '一个大饼在天上' });
  assert.equal(lost.code, 'CLAIM_LOST');
  assert.equal(lost.message, textFor('CLAIM_LOST'));
  // submit is idempotent per claim
  const again = w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
  assert.deepEqual([again.ok, again.state, again.step], [true, 'passed', 2]);
  assert.equal(w.srv.db.chains[id].passed, 2);
});

test('AC 13: the entry says 审核中 while the latest 棒 is pending; the claim is refused with PENDING', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
  const v = w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref });
  assert.deepEqual([v.state, v.pendingStep], ['pending', 1]);
  assert.equal(w.take('B', c.chainId).code, 'PENDING');
});

test('AC 16: revealNow works for the starter at >= 4 passed with nothing active; errors otherwise', () => {
  const w = world();
  const id = w.startChain('A');
  assert.equal(w.A.call('revealNow', { chainId: id }).code, 'TOO_EARLY');
  w.describe('B', id);
  w.paint('C', id);
  assert.equal(w.A.call('getChain', { chainId: id }).canRevealNow, false);
  w.describe('B', id, '外星人在吃披萨');
  assert.equal(w.B.call('revealNow', { chainId: id }).code, 'NOT_STARTER');
  const held = w.take('C', id);
  assert.deepEqual([w.A.call('revealNow', { chainId: id }).code, w.A.call('revealNow', { chainId: id }).busy], ['TOO_EARLY', true]);
  w.B.call('releaseClaim', { chainId: id, claimId: 'x' });
  w.C.call('releaseClaim', { chainId: id, claimId: held.claimId });
  assert.equal(w.A.call('getChain', { chainId: id }).canRevealNow, true);
  assert.equal(w.A.call('revealNow', { chainId: id }).ok, true);
  assert.equal(w.A.call('revealNow', { chainId: id }).code, 'CHAIN_CLOSED');
  const rv = w.C.call('getReveal', { chainId: id });
  assert.deepEqual([rv.ok, rv.early, rv.reason, rv.passed], [true, true, 'early', 4]);
  const copy = require('../core/copy');
  assert.equal(copy.earlyText(rv), '提前揭晓 · 传了 4/6 棒'); // AC 84
});

test('AC 17: at 48 h modSweeper reveals a chain with >= 4 passed (expiry) and expires one with fewer, waiting for active claims', () => {
  const w = world();
  const a = w.startChain('A');
  w.describe('B', a);
  w.paint('C', a);
  w.describe('B', a, '外星人在吃披萨'); // 4 passed
  const b = w.startChain('A');
  w.describe('B', b); // 2 passed
  w.srv.db.chains[b].expiresAt = w.srv.db.chains[a].expiresAt;
  w.t = w.srv.db.chains[a].expiresAt - 10000;
  const claim = w.take('C', a);
  w.t = w.srv.db.chains[a].expiresAt + 1000;
  w.srv.server.modSweeper();
  assert.equal(w.srv.db.chains[a].state, 'open', 'a live claim holds the expiry back');
  assert.equal(w.srv.db.chains[b].state, 'expired');
  assert.equal(w.A.call('getChain', { chainId: b }).state, 'expired');
  w.sweep(3);
  assert.deepEqual([w.srv.db.chains[a].state, w.srv.db.chains[a].revealReason], ['revealed', 'expiry']);
  assert.ok(claim.ok);
  assert.equal(w.take('D', a).code, 'CHAIN_CLOSED');
});

test('AC 18/19: caps and gates through the functions: START_LIMIT, STEP_LIMIT, CLAIM_LIMIT, RULES_REQUIRED, RESTRICTED, UGC_PAUSED, reset at 00:00 BJT', () => {
  const w = world();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(w.startChain('A'));
  assert.equal(w.A.call('createChain', { promptId: 'A01' }).code, 'START_LIMIT');
  assert.equal(w.A.call('grantReward', { kind: 'start', noFill: false }).startsLeft, 1);
  assert.equal(w.A.call('createChain', { promptId: 'A01' }).ok, true);
  // 3 claims per chain per day
  for (let i = 0; i < 3; i++) {
    const k = w.take('B', ids[0]);
    assert.equal(k.ok, true, 'claim ' + i);
    w.B.call('releaseClaim', { chainId: ids[0], claimId: k.claimId });
  }
  assert.equal(w.take('B', ids[0]).code, 'CLAIM_LIMIT');
  assert.equal(w.take('B', ids[1]).ok, true, 'a different chain');
  // 40 submitted 棒 per day
  w.srv.db.players['openid-C'] = { ...w.srv.db.players['openid-C'], day: { ...w.srv.db.players['openid-C'].day, steps: 80 } };
  assert.equal(w.take('C', ids[2]).code, 'STEP_LIMIT');
  // reset at the next Beijing day (server time)
  w.t = Date.UTC(2026, 10, 3, 16, 0, 0); // 00:00 BJT on the 4th
  assert.equal(w.A.call('getHome').me.startsLeft, 3);
  assert.equal(w.take('C', ids[2]).ok, true);
  // rules and restriction
  const fresh = createMockServer({ now: () => w.t });
  assert.equal(fresh.call('createChain', { promptId: 'A01' }, 'newbie').code, 'RULES_REQUIRED');
  assert.equal(fresh.call('agreeRules', { version: 99 }, 'newbie').code, 'BAD_REQUEST');
  w.srv.db.players['openid-D'].restrictedUntil = w.t + 3600e3;
  const r = w.D.call('createChain', { promptId: 'A01' });
  assert.deepEqual([r.code, r.until], ['RESTRICTED', w.t + 3600e3]);
  assert.equal(w.D.call('claimStep', { chainId: ids[2] }).code, 'RESTRICTED');
  // AC 66: a restricted player can still open the album and the reveal of a chain they took part in
  assert.equal(w.D.call('getMyChains', {}).ok, true);
  assert.equal(w.D.call('getHome').me.restriction.until, w.t + 3600e3);
  // kill switch
  w.srv.appConfig = { ugc: { createEnabled: false } };
  assert.equal(w.E.call('createChain', { promptId: 'A01' }).code, 'UGC_PAUSED');
  assert.equal(w.E.call('claimStep', { chainId: ids[1] }).code, 'UGC_PAUSED');
});

test('AC 37-41: text moderation: pass visible, review blocks without a strike, risky blocks with a strike, busy stores nothing; claim kept', () => {
  const w = world();
  const id = w.startChain('A');
  const k = w.take('B', id);
  const sub = (text) => w.B.call('submitStep', { chainId: id, claimId: k.claimId, text });
  const strikes = () => (w.srv.db.players['openid-B'].strikes || []).length;
  // local rejection: no strike, no moderation log entry, API not "called"
  const before = w.srv.db.modLog.length;
  assert.equal(sub('加我微信').code, 'TEXT_REJECTED');
  assert.equal(sub('傻逼').code, 'TEXT_REJECTED');
  assert.equal(w.srv.db.modLog.length, before);
  assert.equal(strikes(), 0);
  // review: blocked, no strike
  assert.equal(sub('测试复审').code, 'TEXT_BLOCKED');
  assert.equal(strikes(), 0);
  // busy: nothing stored, no strike
  assert.equal(sub('测试繁忙').code, 'MODERATION_BUSY');
  assert.equal(strikes(), 0);
  assert.equal(w.srv.db.chains[id].passed, 1, 'nothing stored');
  // risky: blocked + one strike
  assert.equal(sub('测试违规').code, 'TEXT_BLOCKED');
  assert.equal(strikes(), 1);
  assert.equal(w.srv.db.players['openid-B'].warnPending, true);
  // the author keeps the claim and retypes
  assert.equal(w.srv.db.chains[id].claim.claimId, k.claimId);
  assert.equal(sub('一个大饼在天上').state, 'passed');
  // AC 41: blocked texts sit in mod_log and are never returned by any function
  const logged = w.srv.db.modLog.filter((m) => m.textCopy && /测试/.test(m.textCopy));
  assert.ok(logged.length >= 2);
  const everything = JSON.stringify(w.log);
  assert.ok(!everything.includes('测试违规') && !everything.includes('测试复审'));
  // AC 38: strike warning is read-once
  assert.equal(w.B.call('getHome').me.warnPending, true);
  assert.equal(w.B.call('getHome').me.warnPending, false);
});

test('AC 39/40: a blocked or busy custom prompt creates no chain; a clean one is stored custom', () => {
  const w = world();
  const n = Object.keys(w.srv.db.chains).length;
  assert.equal(w.A.call('createChain', { customText: '测试违规' }).code, 'TEXT_BLOCKED');
  assert.equal(w.A.call('createChain', { customText: '测试复审' }).code, 'TEXT_BLOCKED');
  assert.equal(w.A.call('createChain', { customText: '测试繁忙' }).code, 'MODERATION_BUSY');
  assert.equal(w.A.call('createChain', { customText: '加我微信' }).code, 'TEXT_REJECTED');
  assert.equal(w.A.call('createChain', { customText: '猫' }).code, 'TEXT_REJECTED');
  assert.equal(w.A.call('createChain', { customText: '很长很长很长很长很长很长很长' }).code, 'TEXT_REJECTED');
  assert.equal(Object.keys(w.srv.db.chains).length, n);
  assert.equal(w.srv.db.players['openid-A'].strikes.length, 1, 'only the risky one is a strike');
  assert.equal(w.A.call('createChain', { promptId: 'A01', customText: '两个都给' }).code, 'BAD_REQUEST');
  assert.equal(w.A.call('createChain', {}).code, 'BAD_REQUEST');
  assert.equal(w.A.call('createChain', { promptId: 'Z99' }).code, 'BAD_REQUEST');
  const ok = w.A.call('createChain', { customText: '我家的猫会开车' });
  assert.equal(ok.ok, true);
  assert.equal(w.srv.db.chains[ok.chainId].custom, true);
  assert.equal(w.srv.db.chains[ok.chainId].promptId, null);
});

test('AC 42/44: a drawing is pending with a trace id; pass opens the next 棒; review and risky block and reopen the same 棒', () => {
  const w = world();
  for (const [count, expectState, expectStrikes] of [[3, 'open', 0], [14, 'open', 0], [13, 'open', 1]]) {
    const c = w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
    const before = w.srv.db.players['openid-A'].strikes.length;
    assert.equal(w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(count) }).state, 'pending');
    const step = w.srv.db.steps[c.chainId + '_1_1'];
    assert.equal(step.state, 'pending');
    assert.equal(step.mod.traceIds.length, 1);
    assert.ok(w.srv.db.traces[step.mod.traceIds[0]]);
    w.sweep(0.5);
    assert.equal(w.srv.db.steps[step._id].state, 'pending', 'verdict not before the mock delay');
    w.sweep(1);
    const ch = w.srv.db.chains[c.chainId];
    assert.equal(ch.state, expectState);
    assert.equal(w.srv.db.players['openid-A'].strikes.length - before, expectStrikes);
    if (count === 3) assert.deepEqual([ch.passed, ch.nextStep, w.srv.db.steps[step._id].state], [1, 2, 'passed']);
    else assert.deepEqual([ch.passed, ch.nextStep, w.srv.db.steps[step._id].state], [0, 1, 'blocked']);
    w.srv.db.players['openid-A'].day.starts = 0;
  }
});

test('AC 45: onMediaCheck is server-only, idempotent per trace id, ignores unknown traces', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
  const tid = w.srv.db.steps[c.chainId + '_1_1'].mod.traceIds[0];
  assert.equal(w.A.call('onMediaCheck', { trace_id: tid, suggest: 'pass' }).code, 'FORBIDDEN');
  assert.equal(w.srv.db.steps[c.chainId + '_1_1'].state, 'pending');
  assert.equal(w.srv.server.onMediaCheck({ trace_id: 'nope', suggest: 'pass' }).ignored, 'unknown');
  assert.equal(w.srv.server.onMediaCheck({ trace_id: tid, suggest: 'pass' }).result, 'success');
  assert.equal(w.srv.db.steps[c.chainId + '_1_1'].state, 'passed');
  const dup = w.srv.server.onMediaCheck({ trace_id: tid, suggest: 'risky' });
  assert.equal(dup.ignored, 'duplicate');
  assert.equal(w.srv.db.steps[c.chainId + '_1_1'].state, 'passed', 'a duplicate push changes nothing');
  assert.equal(w.srv.db.players['openid-A'].strikes.length, 0);
  assert.equal(w.A.call('modSweeper').code, 'FORBIDDEN');
  assert.equal(w.A.call('admin', { op: 'listReports' }).code, 'FORBIDDEN');
});

test('AC 46/48: no verdict -> one re-check at 35 min -> void at 70 min: no strike, allowance restored, 棒 reopens; a late risky strikes only', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(15) }); // 15 strokes: never a verdict
  assert.equal(w.A.call('getHome').me.startsLeft, 2);
  const stepId = c.chainId + '_1_1';
  w.sweep(34);
  assert.equal(w.srv.db.steps[stepId].mod.traceIds.length, 1);
  w.sweep(2); // 36 min
  assert.equal(w.srv.db.steps[stepId].mod.traceIds.length, 2, 'exactly one re-check');
  assert.equal(w.srv.db.steps[stepId].state, 'pending');
  w.sweep(30);
  assert.equal(w.srv.db.steps[stepId].mod.traceIds.length, 2, 'no second re-check');
  w.sweep(6); // > 70 min after the first check
  assert.equal(w.srv.db.steps[stepId].state, 'void');
  assert.equal(w.srv.db.chains[c.chainId].state, 'open');
  assert.equal(w.srv.db.chains[c.chainId].nextStep, 1);
  assert.equal(w.srv.db.players['openid-A'].strikes.length, 0);
  assert.equal(w.A.call('getHome').me.startsLeft, 3, 'the start is given back');
  assert.equal(w.A.call('getMyChains', { chainId: c.chainId }).mine[0].modState, 'void');
  // AC 48: a late risky for the voided step is a strike but changes no visibility
  const tid = w.srv.db.steps[stepId].mod.traceIds[0];
  const r = w.srv.server.onMediaCheck({ trace_id: tid, suggest: 'risky' });
  assert.equal(r.ignored, 'late');
  assert.equal(w.srv.db.players['openid-A'].strikes.length, 1);
  assert.equal(w.srv.db.steps[stepId].state, 'void');
});

test('AC 47: mediaCheckAsync call errors are retried by the sweeper at +5 and +10 min, then void; never shown meanwhile', () => {
  const w = world();
  w.srv.failImageCalls = true;
  const c = w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
  assert.equal(w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) }).state, 'pending');
  const sid = c.chainId + '_1_1';
  assert.equal(w.srv.db.steps[sid].mod.callErrors, 1);
  w.sweep(4);
  assert.equal(w.srv.db.steps[sid].mod.callErrors, 1);
  w.sweep(1.5);
  assert.equal(w.srv.db.steps[sid].mod.callErrors, 2);
  w.sweep(5);
  assert.equal(w.srv.db.steps[sid].mod.callErrors, 3);
  w.sweep(1);
  assert.equal(w.srv.db.steps[sid].state, 'void');
  // when a retry succeeds the normal flow continues
  w.srv.failImageCalls = true;
  const c2 = w.A.call('createChain', { promptId: 'A02', groupRef: w.A.ref });
  w.A.call('submitStep', { chainId: c2.chainId, claimId: c2.claim.claimId, strokes: w.drawing(2) });
  w.srv.failImageCalls = false;
  w.sweep(6);
  w.sweep(2);
  assert.equal(w.srv.db.steps[c2.chainId + '_1_1'].state, 'passed');
});

test('AC 49: the author sees 审核中 in their album; other players see only a pending state and never learn of a block', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(14) });
  const mine = w.A.call('getMyChains', {});
  assert.equal(mine.items[0].status, 'pending');
  assert.equal(w.A.call('getMyChains', { chainId: c.chainId }).mine[0].modState, 'pending');
  assert.equal(w.B.call('getMyChains', {}).items.length, 0);
  assert.equal(w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref }).state, 'pending');
  w.sweep(2); // blocked (14 strokes = review)
  assert.equal(w.A.call('getMyChains', {}).items[0].status, 'blocked');
  assert.equal(w.A.call('getMyChains', { chainId: c.chainId }).mine[0].modState, 'blocked');
  const seenByB = w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref });
  assert.equal(seenByB.state, 'claimable', 'the 棒 simply reopens');
  assert.equal(seenByB.nextStep, 1);
  assert.ok(!JSON.stringify(seenByB).match(/block|review|risky/i));
});

test('AC 51: mock moderation in production: every UGC function returns SERVER_CONFIG and logs [ALERT]', () => {
  const srv = createMockServer({ now: () => T0, envKind: 'prod', moderationMode: 'mock' });
  for (const name of schema.UGC_FUNCTIONS.filter((n) => schema.FUNCTIONS[n].caller === 'client')) {
    const r = srv.call(name, { chainId: 'X', promptId: 'A01' }, 'u');
    assert.equal(r.code, 'SERVER_CONFIG', name);
  }
  assert.ok(srv.alerts.length > 0 && srv.alerts.every((a) => a.startsWith('[ALERT]')));
  assert.equal(srv.server.modSweeper().code, 'SERVER_CONFIG');
  // functions without UGC still work
  assert.equal(srv.call('getHome', {}, 'u').ok, true);
});

test('AC 52: dev live mode stops calling the text check beyond the daily budget and fails closed', () => {
  const w = world({ moderationMode: 'live', textDailyBudget: 3 });
  const id = w.startChain('A');
  const k = w.take('B', id);
  for (let i = 0; i < 3; i++) assert.equal(w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '测试复审' }).code, 'TEXT_BLOCKED');
  const over = w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
  assert.equal(over.code, 'MODERATION_BUSY');
  assert.equal(w.srv.db.chains[id].passed, 1);
  w.t += 86400e3; // next day: budget resets
  assert.equal(w.srv.db.quota['20261104'], undefined);
});

test('AC 53/54: createEnabled=false blocks create, claim and submit; viewEnabled=false returns placeholders and no content', () => {
  const w = world();
  const { id } = w.fullChain();
  const id2 = w.startChain('A');
  const k = w.take('B', id2);
  w.srv.appConfig = { ugc: { createEnabled: false } };
  assert.equal(w.A.call('createChain', { promptId: 'A01' }).code, 'UGC_PAUSED');
  assert.equal(w.C.call('claimStep', { chainId: id2 }).code, 'UGC_PAUSED');
  assert.equal(w.B.call('submitStep', { chainId: id2, claimId: k.claimId, text: '一个大饼在天上' }).code, 'UGC_PAUSED');
  assert.equal(w.A.call('getReveal', { chainId: id }).ok, true, 'viewing revealed chains still works');
  w.srv.appConfig = { ugc: { viewEnabled: false } };
  const rv = w.A.call('getReveal', { chainId: id });
  assert.equal(rv.ok, true);
  assert.ok(rv.steps.every((s) => s.placeholder === 'paused' && s.strokes === undefined && s.text === undefined));
  assert.equal(rv.prompt.text, null);
  assert.ok(!JSON.stringify(rv).includes('月亮吃月饼'));
  w.B.call('releaseClaim', { chainId: id2, claimId: k.claimId });
  const k2 = w.take('C', id2);
  assert.equal(k2.prev.kind, 'paused');
  assert.equal(k2.prev.strokes, undefined);
  const teaser = w.D.call('getReveal', { chainId: id });
  assert.equal(teaser.code, 'NOT_PARTICIPANT');
  assert.equal(teaser.teaser.promptText, null);
  assert.equal(teaser.teaser.finalText, null);
});

test('AC 55: >= 50% moderation failures over >= 20 calls in 5 min pause creation for 15 minutes with an [ALERT]', () => {
  const w = world();
  const id = w.startChain('A');
  const k = w.take('B', id);
  for (let i = 0; i < 20; i++) assert.equal(w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '测试繁忙' }).code, 'MODERATION_BUSY');
  w.srv.alerts.length = 0;
  w.sweep(0.1);
  assert.ok(w.srv.alerts.some((a) => /circuit breaker/.test(a)));
  assert.equal(w.C.call('createChain', { promptId: 'A01' }).code, 'UGC_PAUSED');
  assert.equal(w.C.call('getHome').ugc.createEnabled, false);
  assert.equal(w.C.call('getHome').ugc.pausedSource, 'breaker');
  w.t += 16 * MIN;
  assert.equal(w.C.call('createChain', { promptId: 'A01' }).ok, true);
});

test('AC 56: at 95% of the daily image quota createChain returns UGC_BUSY while claims continue; at 100% drawings fail closed', () => {
  const w = world({ imageQuota: 100 });
  const id = w.startChain('A');
  const k = w.take('B', id);
  w.srv.db.quota['20261103'].image = 95;
  assert.equal(w.C.call('createChain', { promptId: 'A01' }).code, 'UGC_BUSY');
  assert.equal(w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' }).state, 'passed', 'claims and texts continue');
  w.srv.db.quota['20261103'].image = 100;
  const k2 = w.take('C', id);
  assert.equal(w.C.call('submitStep', { chainId: id, claimId: k2.claimId, strokes: w.drawing(2) }).code, 'MODERATION_BUSY');
  w.srv.db.quota['20261103'].image = 70;
  w.srv.alerts.length = 0;
  w.sweep(0.1);
  assert.ok(w.srv.alerts.some((a) => /quota/.test(a)));
});

test('INVALID_STROKES: oversized or malformed drawings are rejected before anything is stored', () => {
  const w = world();
  const c = w.A.call('createChain', { promptId: 'A01' });
  const bad = [{ v: 1, s: [] }, { v: 1, s: [[12, 0, 1, 1]] }, { v: 1, s: [[0, 0, 5000, 1]] }, { v: 2, s: [[0, 0, 1, 1]] }, 'x', { v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) }];
  for (const strokes of bad) assert.equal(w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes }).code, 'INVALID_STROKES');
  assert.equal(Object.keys(w.srv.db.steps).length, 0);
  assert.equal(w.A.call('getHome').me.startsLeft, 3);
});

test('AC 58-61: a report hides the item for everyone at once; one report per player per item; reopens the latest 棒; prompt report hides a custom chain', () => {
  const w = world();
  const id = w.startChain('A');
  w.describe('B', id, '一个大饼在天上'); // 2 passed, latest is 棒 2
  const k = w.take('C', id); // C holds the claim on 棒 3 and sees 棒 2
  assert.equal(k.prev.canReport, true);
  assert.equal(w.take('A', id).code, 'TAKEN');
  assert.equal(w.D.call('report', { chainId: id, step: 2, reason: 'abuse' }).code, 'NOT_PARTICIPANT');
  assert.equal(w.C.call('report', { chainId: id, step: 2, reason: 'nonsense' }).code, 'BAD_REQUEST');
  const rep = w.C.call('report', { chainId: id, step: 2, reason: 'abuse' });
  assert.deepEqual([rep.ok, rep.hidden, rep.reopened, rep.claimReleased], [true, true, true, true]);
  const ch = w.srv.db.chains[id];
  assert.deepEqual([ch.passed, ch.nextStep, ch.claim], [1, 2, null]);
  assert.equal(w.srv.db.steps[id + '_2_1'].state, 'hidden');
  assert.equal(Object.keys(w.srv.db.reports).length, 1);
  assert.equal(w.C.call('report', { chainId: id, step: 2, reason: 'abuse' }).code, 'BAD_REQUEST', 'no longer visible to report');
  // the reopened 棒 can be taken again; the reported text is never served
  const again = w.take('D', id);
  assert.equal(again.ok, true);
  assert.ok(!JSON.stringify(again).includes('一个大饼'));
  // AC 59 on a revealed chain: placeholders, others' next fetch shows it, duplicate refused
  const full = w.fullChain();
  const r1 = w.A.call('report', { chainId: full.id, step: 4, reason: 'ad' });
  assert.equal(r1.hidden, true);
  assert.equal(r1.reopened, false);
  assert.equal(w.A.call('report', { chainId: full.id, step: 4, reason: 'ad' }).code, 'DUP_REPORT');
  const rvB = w.B.call('getReveal', { chainId: full.id });
  const s4 = rvB.steps.find((s) => s.n === 4);
  assert.deepEqual([s4.placeholder, s4.text, s4.canReport], ['reported', undefined, false]);
  assert.equal(w.B.call('report', { chainId: full.id, step: 1, reason: 'other' }).ok, true);
  assert.equal(w.B.call('report', { chainId: full.id, step: 1, reason: 'other' }).code, 'DUP_REPORT', 'a repeat report of a hidden step is DUP_REPORT (QA-6)');
  assert.equal(w.C.call('report', { chainId: full.id, step: 3, reason: 'other' }).code, 'NOT_PARTICIPANT');
  // own 棒 cannot be reported
  assert.equal(w.A.call('report', { chainId: full.id, step: 5, reason: 'other' }).code, 'OWN_STEP');
  // report limit: 10 per day
  const many = world();
  const chains = [];
  for (let i = 0; i < 11; i++) {
    const { id: cid } = (() => {
      const cc = many.startChain('A');
      many.describe('B', cc);
      many.srv.db.players['openid-A'].day.starts = 0;
      many.srv.db.players['openid-A'].day.steps = 0;
      many.srv.db.players['openid-B'].day.steps = 0;
      many.srv.db.players['openid-C'].day.claims = {};
      return { id: cc };
    })();
    chains.push(cid);
  }
  let limited = 0;
  for (const cid of chains) {
    const kk = many.take('C', cid);
    const rr = many.C.call('report', { chainId: cid, step: 2, reason: 'other' });
    if (rr.code === 'REPORT_LIMIT') limited++;
    else assert.equal(rr.ok, true, JSON.stringify(rr) + JSON.stringify(kk));
  }
  assert.equal(limited, 1);
});

test('AC 61: reporting the teaser of a custom-prompt chain hides the whole chain for everyone', () => {
  const w = world();
  const c = w.A.call('createChain', { customText: '我家的猫会开车', groupRef: w.A.ref });
  w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
  w.sweep(2);
  w.describe('B', c.chainId);
  w.paint('C', c.chainId);
  w.describe('B', c.chainId, '外星人在吃披萨');
  w.A.call('revealNow', { chainId: c.chainId });
  assert.equal(w.D.call('getReveal', { chainId: c.chainId }).teaser.promptText, '我家的猫会开车');
  assert.equal(w.D.call('report', { chainId: c.chainId, step: 0, reason: 'porn' }).hidden, true);
  const v = w.A.call('getChain', { chainId: c.chainId });
  assert.deepEqual([v.state, v.removedReason], ['removed', 'reported']);
  assert.equal(w.A.call('getReveal', { chainId: c.chainId }).code, 'CHAIN_CLOSED');
  assert.equal(w.D.call('getReveal', { chainId: c.chainId }).code, 'CHAIN_CLOSED');
});

test('AC 71/72: 删除这一棒 removes the content, shows a placeholder, reopens the latest 棒; delete-all applies it to every passed 棒', () => {
  const w = world();
  const id = w.startChain('A');
  w.describe('B', id, '一个大饼在天上');
  const k = w.take('C', id);
  const d = w.B.call('deleteMyStep', { chainId: id, step: 2 });
  assert.deepEqual([d.ok, d.count], [true, 1]);
  const st = w.srv.db.steps[id + '_2_1'];
  assert.deepEqual([st.state, st.text, st.strokes], ['deleted', undefined, undefined]);
  assert.equal(w.srv.db.modLog.some((m) => m.textCopy === '一个大饼在天上'), true, 'evidence copy stays');
  const ch = w.srv.db.chains[id];
  assert.deepEqual([ch.passed, ch.nextStep, ch.claim], [1, 2, null]);
  assert.equal(w.C.call('submitStep', { chainId: id, claimId: k.claimId, strokes: w.drawing(2) }).code, 'CLAIM_LOST');
  assert.equal(w.B.call('deleteMyStep', { chainId: id, step: 2 }).code, 'BAD_REQUEST');
  // a revealed chain keeps its shape and shows the placeholder
  const full = w.fullChain();
  const mine = w.A.call('deleteMyStep', { all: true });
  assert.ok(mine.count >= 3);
  const rv = w.B.call('getReveal', { chainId: full.id });
  assert.deepEqual(rv.steps.filter((s) => s.mine === false && s.placeholder === 'deleted').length, 3);
  assert.equal(rv.steps.filter((s) => s.placeholder === null).length, 3);
  assert.equal(rv.passed, 6);
  assert.ok(!JSON.stringify(rv).includes('strokes":{"v":1,"s":[[0,1,100'), 'deleted drawings are gone');
});

test('AC 73/29/74: no response contains an openid, group id, file id or PNG; steps are numbers and "mine" flags only', () => {
  const w = world();
  w.fullChain();
  const id = w.startChain('C');
  w.take('D', id);
  w.A.call('getMyChains', {});
  w.A.call('getGroupChains', { groupRef: w.A.ref });
  w.A.call('getHome');
  const text = JSON.stringify(w.log);
  assert.ok(text.length > 1000);
  assert.doesNotMatch(text, /openid-[A-E]/, 'no openid');
  assert.doesNotMatch(text, /group-1|group-2|group-9/, 'no openGId');
  assert.doesNotMatch(text, /fileID|\.png|cloud:\/\/|tempFileURL|nickName|avatar/i);
  assert.doesNotMatch(text, /"(openid|openId|OPENID|openGId|unionid|starter|author|authors|participants)"/);
  // the group ref is opaque: 16 hex chars
  assert.match(w.A.ref, /^[0-9a-f]{16}$/);
});

test('AC 80/82/83: reveals are for participants; others get the teaser only; 笑 toggles once per participant; hidden/deleted are placeholders', () => {
  const w = world();
  const { id } = w.fullChain();
  const t = w.D.call('getReveal', { chainId: id });
  assert.equal(t.code, 'NOT_PARTICIPANT');
  assert.deepEqual(Object.keys(t.teaser).sort(), ['chainId', 'finalText', 'passed', 'paused', 'promptText']);
  assert.deepEqual([t.teaser.promptText, t.teaser.finalText, t.teaser.passed], ['月亮吃月饼', '企鹅在沙漠晒太阳', 6]);
  assert.ok(!JSON.stringify(t).includes('strokes'));
  assert.ok(!JSON.stringify(t).includes('一个大饼在天上'));
  assert.equal(w.D.call('laugh', { chainId: id, step: 2 }).code, 'NOT_PARTICIPANT');
  // participants: toggle
  const l1 = w.A.call('laugh', { chainId: id, step: 2 });
  assert.deepEqual([l1.laughs, l1.mine], [1, true]);
  const l2 = w.B.call('laugh', { chainId: id, step: 2 });
  assert.equal(l2.laughs, 2);
  const l3 = w.A.call('laugh', { chainId: id, step: 2 });
  assert.deepEqual([l3.laughs, l3.mine], [1, false]);
  const rv = w.A.call('getReveal', { chainId: id });
  assert.equal(rv.steps[1].laughs, 1);
  assert.equal(rv.steps[1].myLaugh, false);
  assert.equal(w.B.call('getReveal', { chainId: id }).steps[1].myLaugh, true);
  // nothing ranks or awards by 笑
  assert.ok(!('best' in rv) && !('ranking' in rv) && !JSON.stringify(Object.keys(rv)).match(/rank|award|best/i));
  // a hidden final sentence makes the teaser fall back to the latest visible one
  w.srv.db.steps[id + '_6_1'].state = 'hidden';
  assert.equal(w.D.call('getReveal', { chainId: id }).teaser.finalText, '外星人在吃披萨');
  // AC 85
  // the nationwide count appears for preset prompts only
  assert.equal('nationalCount' in w.A.call('getReveal', { chainId: id }), false, 'no national count (F-2)');
});

test('AC 86: an expired chain shows only the player\'s own 棒 in 我的接龙', () => {
  const w = world();
  const id = w.startChain('A');
  w.describe('B', id, '一个大饼在天上');
  w.srv.db.chains[id].expiresAt = w.t;
  w.sweep(0.1);
  const a = w.A.call('getMyChains', { chainId: id });
  assert.equal(a.item.status, 'expired');
  assert.deepEqual(a.mine.map((m) => m.n), [1]);
  assert.ok(a.mine[0].strokes);
  const b = w.B.call('getMyChains', { chainId: id });
  assert.deepEqual(b.mine.map((m) => [m.n, m.text]), [[2, '一个大饼在天上']]);
  assert.equal(b.item.promptText, null, 'an author of 棒 2 never saw the prompt');
  assert.equal(a.item.promptText, '月亮吃月饼', 'the starter did');
  assert.equal(w.C.call('getMyChains', { chainId: id }).code, 'CHAIN_NOT_FOUND');
  assert.equal(w.C.call('getChain', { chainId: id }).state, 'expired');
});

test('AC 98: 本群接龙 lists waiting, in-progress and revealed chains of this group only, with aggregate stats and no per-person data', () => {
  const w = world();
  w.fullChain();
  const waiting = w.startChain('A');
  const taken = w.startChain('A');
  w.take('C', taken);
  const g2 = w.E.call('joinGroup', { cloudID: 'cid-3-group-2' }).groupRef;
  const foreign = w.E.call('createChain', { promptId: 'A01', groupRef: g2 });
  w.E.call('submitStep', { chainId: foreign.chainId, claimId: foreign.claim.claimId, strokes: w.drawing(2) });
  w.sweep(2);
  const list = w.B.call('getGroupChains', { groupRef: w.B.ref });
  assert.equal(list.ok, true);
  assert.deepEqual(list.waiting.map((r) => r.chainId), [waiting]);
  assert.deepEqual(list.inProgress.map((r) => [r.chainId, r.reason]), [[taken, 'taken']]);
  assert.equal(list.revealed.length, 1);
  assert.deepEqual([list.revealed[0].promptText, list.revealed[0].finalText, list.revealed[0].participant], ['月亮吃月饼', '企鹅在沙漠晒太阳', true]);
  assert.deepEqual(list.stats, { started: 3, revealed: 1, drawings: 5, rooms: 0 });
  assert.ok(!JSON.stringify(list).includes(foreign.chainId), 'other groups are invisible');
  assert.equal(w.srv.call('getGroupChains', { groupRef: w.B.ref }, 'openid-Z').code, 'NOT_MEMBER');
  assert.equal(w.E.call('getGroupChains', { groupRef: 'ffffffffffffffff' }).code, 'NOT_MEMBER');
  const nonPart = w.D.call('getGroupChains', { groupRef: w.D.ref });
  assert.equal(nonPart.revealed[0].participant, false);
  assert.ok(!Object.keys(list).some((k) => /member|player|author|rank/i.test(k)));
});

test('AC 100: the subscribe offer works only with a configured template; one grant, at most one notice; held during quiet hours', () => {
  const w = world();
  const id = w.startChain('A');
  assert.equal(w.A.call('subscribeReveal', { chainId: id }).code, 'NO_TEMPLATE');
  w.srv.appConfig = { subscribe: { tmplId: 'TPL-1' } };
  assert.equal(w.D.call('subscribeReveal', { chainId: id }).code, 'NOT_PARTICIPANT');
  assert.equal(w.A.call('subscribeReveal', { chainId: id }).ok, true);
  assert.equal(w.A.call('subscribeReveal', { chainId: id }).ok, true);
  assert.equal(Object.keys(w.srv.db.subGrants).length, 1);
  assert.deepEqual(w.A.call('getHome').features.subscribe, { tmplId: 'TPL-1' });
  // reveal at 23:30 BJT: the notice waits for 08:00 (AC 78)
  w.describe('B', id);
  w.paint('C', id);
  w.describe('B', id, '外星人在吃披萨');
  w.t = Date.UTC(2026, 10, 3, 15, 30); // 23:30 BJT
  assert.equal(w.A.call('revealNow', { chainId: id }).ok, true);
  w.srv.server.modSweeper();
  assert.equal(w.srv.sent.length, 0);
  w.t = Date.UTC(2026, 10, 4, 0, 5); // 08:05 BJT
  w.srv.server.modSweeper();
  w.srv.server.modSweeper();
  assert.deepEqual(w.srv.sent.map((s) => s.chainId), [id], 'exactly one message');
});

test('getHome (AC 121): no daily / launchKey / national counts; allowances, rooms; clock from the server', () => {
  const w = world();
  const a = w.A.call('getHome');
  for (const k of ['daily', 'launchKey']) assert.equal(k in a, false, k + ' is gone (F-2)');
  assert.equal(a.dateKey, '20261103');
  assert.equal(a.serverNow, T0);
  assert.equal(a.me.startsLeft, 3);
  assert.equal(a.me.adStartsLeft, 2);
  assert.deepEqual([a.me.roomsLeft, a.me.joinsLeft, a.me.turnsLeft, a.me.activeRoom], [10, 30, 80, null]);
  assert.equal(a.me.paletteToday, false);
  assert.equal(w.A.call('grantReward', { kind: 'palette', noFill: false }).paletteToday, true);
  assert.equal(w.A.call('getHome').me.paletteToday, true);
  w.t += 86400e3;
  assert.equal(w.A.call('getHome').me.paletteToday, false);
  assert.equal(w.A.call('grantReward', { kind: 'coins' }).code, 'BAD_REQUEST');
  assert.equal(w.A.call('grantReward', { kind: 'start', noFill: true }).ok, true);
  assert.equal(w.A.call('grantReward', { kind: 'start', noFill: true }).code, 'REWARD_LIMIT');
});

test('AC 90: the streak advances on passed 棒 and getHome reports it', () => {
  const w = world();
  w.startChain('A');
  assert.equal(w.A.call('getHome').me.streak, 1);
  w.t += 86400e3;
  w.startChain('A');
  assert.equal(w.A.call('getHome').me.streak, 2);
  w.t += 2 * 86400e3;
  assert.equal(w.A.call('getHome').me.streak, 0);
});

test('track sanitises events; unknown functions and offline are handled; the server never throws', () => {
  const w = world();
  assert.equal(w.A.call('track', { events: [{ name: 'error', props: { text: 'hi', code: 'X' } }] }).ok, true);
  const ev = w.srv.db.events.filter((e) => e.name === 'error' && e.openid === 'openid-A');
  assert.deepEqual(ev[0].props, { code: 'X' });
  assert.equal(w.srv.call('nope', {}, 'u').code, 'BAD_REQUEST');
  for (const name of schema.CLIENT_FUNCTIONS) {
    for (const bad of [undefined, null, 5, 'x', [], {}, { chainId: 5 }, { chainId: {} }, { events: 3 }]) {
      const r = w.srv.call(name, bad, 'fuzz');
      assert.equal(typeof r, 'object');
      assert.equal(typeof r.ok, 'boolean', name);
      if (!r.ok) assert.ok(SERVER_CODES.includes(r.code) || ['NETWORK', 'TIMEOUT'].includes(r.code), name + ' ' + r.code);
    }
  }
  w.srv.offline = true;
  assert.equal(w.A.call('getHome').code, 'NETWORK');
});

test('AC 17 edge: a card opened by a group member who is not a participant sees the teaser; participation survives leaving the group', () => {
  const w = world();
  const { id } = w.fullChain();
  assert.equal(w.D.call('getChain', { chainId: id, groupRef: w.D.ref }).state, 'revealedTeaser');
  w.t += 60 * 86400e3; // membership long expired
  assert.equal(w.A.call('getReveal', { chainId: id }).ok, true);
});
