'use strict';
// THE CONTRACT SUITE. One set of scenarios (ported from game/tests/mock-server.test.js, extended) run against three
// implementations of cloudfunctions/CONTRACT.md:
//   1. the mock server (the executable reference, in-memory)
//   2. the REAL cloud functions on the fake database, MODERATION_MODE=mock / ENV_KIND=dev
//   3. the REAL cloud functions, ENV_KIND=prod / MODERATION_MODE=live, with a fake WeChat platform behind cloud.openapi
// If a function drifts from the reference, a scenario fails for exactly one flavour. AC numbers (spec 19) are in the names.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { FLAVORS, T0, MIN } = require('./helpers/drivers');
const sync = require('../scripts/sync-core');

const CORE = sync.DEFAULT_CORE;
const { ENTRY_KEYS } = require(path.join(CORE, 'views'));
const { textFor, SERVER_CODES } = require(path.join(CORE, 'codes'));
const schema = require(path.join(CORE, 'schema'));
const copy = require(path.join(CORE, 'copy'));

async function world(F, opts) {
  const w = F.make(opts);
  w.log = []; // every response, for the schema tests
  const call = (who) => async (name, data) => {
    const r = await w.call(name, data, who);
    w.log.push(r);
    return r;
  };
  for (const u of ['A', 'B', 'C', 'D', 'E']) {
    const id = 'openid-' + u;
    w[u] = { id, call: call(id) };
    assert.equal((await w[u].call('agreeRules', { version: 2 })).ok, true);
    w[u].ref = (await w[u].call('joinGroup', { cloudID: 'cid-3-group-1' })).groupRef;
  }
  w.Y = { id: 'openid-Y', call: call('openid-Y') };
  await w.Y.call('agreeRules', { version: 2 });
  w.Y.ref = (await w.Y.call('joinGroup', { cloudID: 'cid-3-group-2' })).groupRef;
  w.drawing = (k) => ({ v: 1, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });
  /** A starts a chain from a preset prompt and submits 棒 1; the verdict is delivered by the sweeper */
  w.startChain = async (u, strokes) => {
    const c = await w[u].call('createChain', { promptId: 'I07', groupRef: w[u].ref });
    assert.equal(c.ok, true, JSON.stringify(c));
    const s = await w[u].call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: strokes || w.drawing(3), clientMs: 4000, undoCount: 0 });
    assert.equal(s.state, 'pending', JSON.stringify(s));
    await w.sweep(2);
    return c.chainId;
  };
  w.take = (u, chainId) => w[u].call('claimStep', { chainId, groupRef: w[u].ref });
  w.describe = async (u, chainId, text) => {
    const c = await w.take(u, chainId);
    assert.equal(c.ok, true, JSON.stringify(c));
    return w[u].call('submitStep', { chainId, claimId: c.claimId, text: text || '一只猫在开出租车' });
  };
  w.paint = async (u, chainId, k) => {
    const c = await w.take(u, chainId);
    assert.equal(c.ok, true, JSON.stringify(c));
    const s = await w[u].call('submitStep', { chainId, claimId: c.claimId, strokes: w.drawing(k || 3) });
    await w.sweep(2);
    return s;
  };
  /** a complete 6-棒 chain, A on 1/3/5 and B on 2/4/6 */
  w.fullChain = async () => {
    const id = await w.startChain('A');
    assert.equal((await w.describe('B', id, '一个大饼在天上')).state, 'passed');
    await w.paint('A', id);
    assert.equal((await w.describe('B', id, '外星人在吃披萨')).state, 'passed');
    await w.paint('A', id);
    const last = await w.describe('B', id, '企鹅在沙漠晒太阳');
    return { id, last };
  };
  return w;
}

/** run a scenario and always release the driver (restores Date.now, console.error, process.env) */
async function scenario(F, opts, fn) {
  const w = await world(F, opts);
  try {
    await fn(w);
  } finally {
    w.destroy();
  }
}

for (const F of FLAVORS) {
  describe(F.name, () => {
    const it = (name, opts, fn) => test(name, () => scenario(F, fn ? opts : undefined, fn || opts));

    it('AC 1/2/3/6/15: start, alternate A (1,3,5) and B (2,4,6), the 6th text reveals in the same call; the reveal shows all 6', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
      assert.deepEqual([c.ok, c.claim.step, c.claim.kind, c.claim.sourceText], [true, 1, 'draw', '月亮吃月饼']);
      assert.equal((await w.take('B', c.chainId)).code, 'TAKEN'); // AC 2
      assert.equal((await w.A.call('getHome')).me.startsLeft, 3); // AC 3: consumed at 棒 1 submit
      const s1 = await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
      assert.deepEqual([s1.state, s1.chainState, s1.revealed], ['pending', 'pending', false]);
      assert.equal((await w.A.call('getHome')).me.startsLeft, 2);
      await w.sweep(2);
      assert.equal((await w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref })).state, 'claimable');
      const k2 = await w.take('B', c.chainId);
      assert.equal(k2.kind, 'describe');
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k2.claimId, strokes: w.drawing(1) })).code, 'BAD_REQUEST'); // AC 1
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k2.claimId, text: '一个大饼在天上' })).state, 'passed');
      const k3 = await w.take('A', c.chainId);
      assert.equal(k3.kind, 'draw');
      assert.equal((await w.A.call('submitStep', { chainId: c.chainId, claimId: k3.claimId, text: '文字不能当画' })).code, 'BAD_REQUEST');
      assert.equal((await w.A.call('submitStep', { chainId: c.chainId, claimId: k3.claimId, strokes: w.drawing(3) })).state, 'pending');
      await w.sweep(2);
      assert.equal((await w.describe('B', c.chainId, '外星人在吃披萨')).state, 'passed');
      await w.paint('A', c.chainId);
      const last = await w.describe('B', c.chainId, '企鹅在沙漠晒太阳');
      assert.deepEqual([last.state, last.chainState, last.revealed], ['passed', 'revealed', true]);
      const rv = await w.A.call('getReveal', { chainId: c.chainId });
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
      assert.equal((await w.take('C', c.chainId)).code, 'CHAIN_CLOSED');
    });

    it('AC 3: an abandoned 棒 1 leaves startsLeft unchanged and the chain becomes abandoned', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
      await w.sweep(3);
      assert.equal(w.chain(c.chainId).state, 'abandoned');
      assert.equal((await w.A.call('getHome')).me.startsLeft, 3);
      assert.equal((await w.A.call('getChain', { chainId: c.chainId })).state, 'notFound');
      const c2 = await w.A.call('createChain', { promptId: 'A02' });
      await w.A.call('releaseClaim', { chainId: c2.chainId, claimId: c2.claim.claimId });
      assert.equal(w.chain(c2.chainId).state, 'abandoned');
    });

    it('AC 4/5: PREV_MINE and the 3-棒 cap through claimStep', async (w) => {
      const id = await w.startChain('A');
      assert.equal((await w.take('A', id)).code, 'PREV_MINE');
      assert.equal((await w.describe('B', id)).state, 'passed');
      assert.equal((await w.B.call('getChain', { chainId: id })).state, 'prevMine');
      await w.paint('C', id);
      assert.equal((await w.describe('B', id, '外星人在吃披萨')).state, 'passed');
      await w.paint('C', id);
      assert.equal((await w.take('C', id)).code, 'PREV_MINE');
      assert.equal(w.chain(id).perPersonCount['openid-B'], 2);
      const id2 = await w.startChain('A');
      await w.describe('B', id2);
      await w.paint('A', id2);
      await w.describe('B', id2, '外星人在吃披萨');
      await w.paint('A', id2); // A: 1,3,5
      assert.equal((await w.take('A', id2)).code, 'PREV_MINE');
      w.patchChain(id2, (ch) => { ch.perPersonCount['openid-D'] = 3; }); // D already took three
      assert.equal((await w.take('D', id2)).code, 'CAP_REACHED');
    });

    it('AC 7/8: claims need group membership; an unbound chain binds on the first claim with group context', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'A01' }); // no group context: unbound
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
      await w.sweep(2);
      assert.equal(w.chain(c.chainId).openGId, null);
      const other = w.Y.ref;
      assert.equal((await w.Y.call('getChain', { chainId: c.chainId })).state, 'wrongGroup');
      assert.equal((await w.Y.call('claimStep', { chainId: c.chainId })).code, 'NEED_GROUP');
      const k = await w.B.call('claimStep', { chainId: c.chainId, groupRef: w.B.ref });
      assert.equal(k.ok, true);
      assert.equal(w.chain(c.chainId).openGId, 'group-1');
      await w.B.call('releaseClaim', { chainId: c.chainId, claimId: k.claimId });
      const wrong = await w.Y.call('claimStep', { chainId: c.chainId, groupRef: other });
      assert.equal(wrong.code, 'WRONG_GROUP');
      assert.equal((await w.Y.call('getChain', { chainId: c.chainId, groupRef: other })).state, 'wrongGroup');
      assert.equal((await w.C.call('claimStep', { chainId: c.chainId })).ok, true); // membership row exists
      assert.equal((await w.call('claimStep', { chainId: c.chainId, groupRef: 'ffffffffffffffff' }, 'openid-nobody')).code, 'RULES_REQUIRED');
      w.t += 31 * 86400e3; // membership older than 30 days stops counting
      w.patchChain(c.chainId, (ch) => { ch.claim = null; ch.expiresAt += 40 * 86400e3; });
      assert.equal((await w.D.call('claimStep', { chainId: c.chainId })).code, 'NEED_GROUP');
    });

    it('AC 9: of two concurrent claims for the same 棒 exactly one wins and the other gets TAKEN (50 races)', async (w) => {
      for (let i = 0; i < 50; i++) {
        const id = await w.startChain('A');
        const [x, y] = await Promise.all([w.take('B', id), w.take('C', id)]);
        const won = [x, y].filter((r) => r.ok);
        const lost = [x, y].filter((r) => !r.ok);
        assert.equal(won.length, 1, 'race ' + i + ' ' + JSON.stringify([x.code, y.code]));
        assert.equal(lost[0].code, 'TAKEN');
        assert.ok(lost[0].etaSec > 0);
        w.patchPlayer('openid-A', (p) => { p.day.starts = 0; p.day.steps = 0; }); // keep the starter under the daily limit for the loop
      }
    });

    it('AC 10: getChain never returns content in any state, only whitelisted keys', async (w) => {
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
      const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
      check(await w.A.call('getChain', { chainId: c.chainId }), 'starting/starter');
      check(await w.B.call('getChain', { chainId: c.chainId }), 'starting/other');
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
      check(await w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref }), 'pending');
      await w.sweep(2);
      check(await w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref }), 'claimable');
      check(await w.A.call('getChain', { chainId: c.chainId, groupRef: w.A.ref }), 'prevMine');
      await w.take('B', c.chainId);
      check(await w.C.call('getChain', { chainId: c.chainId, groupRef: w.C.ref }), 'taken');
      check(await w.Y.call('getChain', { chainId: c.chainId, groupRef: w.Y.ref }), 'wrongGroup');
      const full = await w.fullChain();
      check(await w.A.call('getChain', { chainId: full.id }), 'revealedParticipant');
      check(await w.C.call('getChain', { chainId: full.id, groupRef: w.C.ref }), 'revealedTeaser');
      const exp = await w.startChain('D');
      w.patchChain(exp, (ch) => { ch.expiresAt = w.t - 1; });
      await w.sweep(1);
      check(await w.D.call('getChain', { chainId: exp }), 'expired');
      const removed = await w.startChain('D');
      w.patchChain(removed, (ch) => { ch.state = 'removed'; });
      check(await w.D.call('getChain', { chainId: removed }), 'removed');
      assert.equal((await w.A.call('getChain', { chainId: 'NOSUCHCHAIN' })).code, 'CHAIN_NOT_FOUND');
      for (const s of ['claimable', 'notFound', 'pending', 'prevMine', 'taken', 'wrongGroup', 'revealedParticipant', 'revealedTeaser', 'expired', 'removed']) assert.ok(checks.includes(s), 'covered ' + s);
    });

    it('rev. 2 (PO-45): getChain never carries promptId or canSameAgain in any state (同题再传 is removed)', async (w) => {
      const exp = await w.startChain('D');
      const live = await w.startChain('D');
      const full = await w.fullChain();
      w.patchChain(exp, (ch) => { ch.expiresAt = w.t - 1; });
      await w.sweep(1);
      assert.equal(w.chain(exp).state, 'expired');
      for (const [who, id] of [['D', exp], ['B', exp], ['B', live], ['C', live], ['A', full.id], ['C', full.id]]) {
        const r = await w[who].call('getChain', { chainId: id, groupRef: w[who].ref });
        assert.equal('promptId' in r, false, r.state + ' must not carry promptId');
        assert.equal('canSameAgain' in r, false, r.state + ' must not carry canSameAgain');
        assert.equal(JSON.stringify(r).includes('月亮'), false);
      }
    });

    it('AC 11/43: claimStep returns the previous 棒 only to the claimant and only if it passed; pending content goes to nobody', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
      const pend = await w.take('B', c.chainId);
      assert.equal(pend.code, 'PENDING');
      assert.equal(pend.prev, undefined);
      assert.equal(JSON.stringify(await w.B.call('getGroupChains', { groupRef: w.B.ref })).includes('strokes'), false);
      await w.sweep(2);
      const k = await w.take('B', c.chainId);
      assert.equal(k.prev.kind, 'draw');
      assert.equal(k.prev.strokes.s.length, 2);
      assert.equal((await w.take('C', c.chainId)).prev, undefined, 'a rival gets TAKEN and no content');
      const again = await w.take('B', c.chainId);
      assert.equal(again.claimId, k.claimId);
      const c2 = await w.A.call('createChain', { promptId: 'A01' });
      const r = await w.A.call('claimStep', { chainId: c2.chainId });
      assert.equal(r.prev.kind, 'prompt');
      assert.equal(r.prev.text, '小猫吃面条');
    });

    it('AC 12: a claim lasts 150 s; a late submit is accepted if nobody claimed since, else CLAIM_LOST; submit is idempotent per claim', async (w) => {
      const id = await w.startChain('A');
      const k = await w.take('B', id);
      w.t += 155e3;
      const late = await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
      assert.equal(late.state, 'passed', 'late but unclaimed');
      const id2 = await w.startChain('A');
      const k2 = await w.take('B', id2);
      w.t += 155e3;
      assert.equal((await w.take('C', id2)).ok, true);
      const lost = await w.B.call('submitStep', { chainId: id2, claimId: k2.claimId, text: '一个大饼在天上' });
      assert.equal(lost.code, 'CLAIM_LOST');
      assert.equal(lost.message, textFor('CLAIM_LOST'));
      const again = await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
      assert.deepEqual([again.ok, again.state, again.step], [true, 'passed', 2]);
      assert.equal(w.chain(id).passed, 2);
    });

    it('AC 13: the entry says 审核中 while the latest 棒 is pending; the claim is refused with PENDING', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
      const v = await w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref });
      assert.deepEqual([v.state, v.pendingStep], ['pending', 1]);
      assert.equal((await w.take('B', c.chainId)).code, 'PENDING');
    });

    it('AC 16: revealNow works for the starter at >= 4 passed with nothing active; errors otherwise', async (w) => {
      const id = await w.startChain('A');
      assert.equal((await w.A.call('revealNow', { chainId: id })).code, 'TOO_EARLY');
      await w.describe('B', id);
      await w.paint('C', id);
      assert.equal((await w.A.call('getChain', { chainId: id })).canRevealNow, false);
      await w.describe('B', id, '外星人在吃披萨');
      assert.equal((await w.B.call('revealNow', { chainId: id })).code, 'NOT_STARTER');
      const held = await w.take('C', id);
      const busy = await w.A.call('revealNow', { chainId: id });
      assert.deepEqual([busy.code, busy.busy], ['TOO_EARLY', true]);
      await w.B.call('releaseClaim', { chainId: id, claimId: 'x' });
      await w.C.call('releaseClaim', { chainId: id, claimId: held.claimId });
      assert.equal((await w.A.call('getChain', { chainId: id })).canRevealNow, true);
      assert.equal((await w.A.call('revealNow', { chainId: id })).ok, true);
      assert.equal((await w.A.call('revealNow', { chainId: id })).code, 'CHAIN_CLOSED');
      const rv = await w.C.call('getReveal', { chainId: id });
      assert.deepEqual([rv.ok, rv.early, rv.reason, rv.passed], [true, true, 'early', 4]);
      assert.equal(copy.earlyText(rv), '提前揭晓 · 传了 4/6 棒'); // AC 84
    });

    it('AC 17: at 48 h modSweeper reveals a chain with >= 4 passed (expiry) and expires one with fewer, waiting for active claims', async (w) => {
      const a = await w.startChain('A');
      await w.describe('B', a);
      await w.paint('C', a);
      await w.describe('B', a, '外星人在吃披萨'); // 4 passed
      const b = await w.startChain('A');
      await w.describe('B', b); // 2 passed
      w.patchChain(b, (ch) => { ch.expiresAt = w.chain(a).expiresAt; });
      w.t = w.chain(a).expiresAt - 10000;
      const claim = await w.take('C', a);
      w.t = w.chain(a).expiresAt + 1000;
      await w.sweepNow();
      assert.equal(w.chain(a).state, 'open', 'a live claim holds the expiry back');
      assert.equal(w.chain(b).state, 'expired');
      assert.equal((await w.A.call('getChain', { chainId: b })).state, 'expired');
      await w.sweep(3);
      assert.deepEqual([w.chain(a).state, w.chain(a).revealReason], ['revealed', 'expiry']);
      assert.ok(claim.ok);
      assert.equal((await w.take('D', a)).code, 'CHAIN_CLOSED');
    });

    it('AC 18/19: caps and gates through the functions: START_LIMIT, STEP_LIMIT, CLAIM_LIMIT, RULES_REQUIRED, RESTRICTED, UGC_PAUSED, reset at 00:00 BJT', async (w) => {
      const ids = [];
      for (let i = 0; i < 3; i++) ids.push(await w.startChain('A'));
      assert.equal((await w.A.call('createChain', { promptId: 'A01' })).code, 'START_LIMIT');
      assert.equal((await w.A.call('grantReward', { kind: 'start', noFill: false })).startsLeft, 1);
      assert.equal((await w.A.call('createChain', { promptId: 'A01' })).ok, true);
      for (let i = 0; i < 3; i++) {
        const k = await w.take('B', ids[0]);
        assert.equal(k.ok, true, 'claim ' + i);
        await w.B.call('releaseClaim', { chainId: ids[0], claimId: k.claimId });
      }
      assert.equal((await w.take('B', ids[0])).code, 'CLAIM_LIMIT');
      assert.equal((await w.take('B', ids[1])).ok, true, 'a different chain');
      w.patchPlayer('openid-C', (p) => { p.day.steps = 80; });
      assert.equal((await w.take('C', ids[2])).code, 'STEP_LIMIT');
      w.t = Date.UTC(2026, 10, 3, 16, 0, 0); // 00:00 BJT on the 4th
      assert.equal((await w.A.call('getHome')).me.startsLeft, 3);
      assert.equal((await w.take('C', ids[2])).ok, true);
      assert.equal((await w.call('createChain', { promptId: 'A01' }, 'newbie')).code, 'RULES_REQUIRED');
      assert.equal((await w.call('agreeRules', { version: 99 }, 'newbie')).code, 'BAD_REQUEST');
      w.patchPlayer('openid-D', (p) => { p.restrictedUntil = w.t + 3600e3; });
      const r = await w.D.call('createChain', { promptId: 'A01' });
      assert.deepEqual([r.code, r.until], ['RESTRICTED', w.t + 3600e3]);
      assert.equal((await w.D.call('claimStep', { chainId: ids[2] })).code, 'RESTRICTED');
      assert.equal((await w.D.call('getMyChains', {})).ok, true); // AC 66
      assert.equal((await w.D.call('getHome')).me.restriction.until, w.t + 3600e3);
      w.setConfig({ ugc: { createEnabled: false } });
      assert.equal((await w.E.call('createChain', { promptId: 'A01' })).code, 'UGC_PAUSED');
      assert.equal((await w.E.call('claimStep', { chainId: ids[1] })).code, 'UGC_PAUSED');
    });

    it('AC 37-41: text moderation: pass visible, review blocks without a strike, risky blocks with a strike, busy stores nothing; claim kept', async (w) => {
      const id = await w.startChain('A');
      const k = await w.take('B', id);
      const sub = (text) => w.B.call('submitStep', { chainId: id, claimId: k.claimId, text });
      const strikes = () => ((w.player('openid-B') || {}).strikes || []).length;
      const before = w.modLog().length;
      assert.equal((await sub('加我微信')).code, 'TEXT_REJECTED');
      assert.equal((await sub('傻逼')).code, 'TEXT_REJECTED');
      assert.equal(w.modLog().length, before, 'local rejections reach no API and leave no log');
      assert.equal(strikes(), 0);
      assert.equal((await sub('测试复审')).code, 'TEXT_BLOCKED');
      assert.equal(strikes(), 0);
      assert.equal((await sub('测试繁忙')).code, 'MODERATION_BUSY');
      assert.equal(strikes(), 0);
      assert.equal(w.chain(id).passed, 1, 'nothing stored');
      assert.equal((await sub('测试违规')).code, 'TEXT_BLOCKED');
      assert.equal(strikes(), 1);
      assert.equal(w.player('openid-B').warnPending, true);
      assert.equal(w.chain(id).claim.claimId, k.claimId);
      assert.equal((await sub('一个大饼在天上')).state, 'passed');
      const logged = w.modLog().filter((m) => m.textCopy && /测试/.test(m.textCopy));
      assert.ok(logged.length >= 2);
      const everything = JSON.stringify(w.log);
      assert.ok(!everything.includes('测试违规') && !everything.includes('测试复审'));
      assert.equal((await w.B.call('getHome')).me.warnPending, true);
      assert.equal((await w.B.call('getHome')).me.warnPending, false);
    });

    it('AC 39/40: a blocked or busy custom prompt creates no chain; a clean one is stored custom', async (w) => {
      const n = w.chains().length;
      assert.equal((await w.A.call('createChain', { customText: '测试违规' })).code, 'TEXT_BLOCKED');
      assert.equal((await w.A.call('createChain', { customText: '测试复审' })).code, 'TEXT_BLOCKED');
      assert.equal((await w.A.call('createChain', { customText: '测试繁忙' })).code, 'MODERATION_BUSY');
      assert.equal((await w.A.call('createChain', { customText: '加我微信' })).code, 'TEXT_REJECTED');
      assert.equal((await w.A.call('createChain', { customText: '猫' })).code, 'TEXT_REJECTED');
      assert.equal((await w.A.call('createChain', { customText: '很长很长很长很长很长很长很长' })).code, 'TEXT_REJECTED');
      assert.equal(w.chains().length, n);
      assert.equal(w.player('openid-A').strikes.length, 1, 'only the risky one is a strike');
      w.t += MIN; // a new rate-limit window
      assert.equal((await w.A.call('createChain', { promptId: 'A01', customText: '两个都给' })).code, 'BAD_REQUEST');
      assert.equal((await w.A.call('createChain', {})).code, 'BAD_REQUEST');
      assert.equal((await w.A.call('createChain', { promptId: 'Z99' })).code, 'BAD_REQUEST');
      const ok = await w.A.call('createChain', { customText: '我家的猫会开车' });
      assert.equal(ok.ok, true);
      assert.equal(w.chain(ok.chainId).custom, true);
      assert.equal(w.chain(ok.chainId).promptId, null);
    });

    it('AC 42/44: a drawing is pending with a trace id; pass opens the next 棒; review and risky block and reopen the same 棒', async (w) => {
      for (const [count, expectState, expectStrikes] of [[3, 'open', 0], [14, 'open', 0], [13, 'open', 1]]) {
        const c = await w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
        const before = w.player('openid-A').strikes.length;
        assert.equal((await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(count) })).state, 'pending');
        const step = w.step(c.chainId + '_1_1');
        assert.equal(step.state, 'pending');
        assert.equal(step.mod.traceIds.length, 1);
        assert.ok(w.trace(step.mod.traceIds[0]));
        await w.sweep(0.5);
        assert.equal(w.step(step._id).state, 'pending', 'verdict not before the delay');
        await w.sweep(1);
        const ch = w.chain(c.chainId);
        assert.equal(ch.state, expectState);
        assert.equal(w.player('openid-A').strikes.length - before, expectStrikes);
        if (count === 3) assert.deepEqual([ch.passed, ch.nextStep, w.step(step._id).state], [1, 2, 'passed']);
        else assert.deepEqual([ch.passed, ch.nextStep, w.step(step._id).state], [0, 1, 'blocked']);
        w.patchPlayer('openid-A', (p) => { p.day.starts = 0; });
      }
    });

    it('AC 45: onMediaCheck is server-only, idempotent per trace id, ignores unknown traces', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
      const tid = w.step(c.chainId + '_1_1').mod.traceIds[0];
      assert.equal((await w.A.call('onMediaCheck', { trace_id: tid, suggest: 'pass' })).code, 'FORBIDDEN');
      assert.equal(w.step(c.chainId + '_1_1').state, 'pending');
      await w.push('nope', 'pass');
      assert.equal(w.step(c.chainId + '_1_1').state, 'pending', 'an unknown trace changes nothing');
      await w.push(tid, 'pass');
      assert.equal(w.step(c.chainId + '_1_1').state, 'passed');
      await w.push(tid, 'risky');
      assert.equal(w.step(c.chainId + '_1_1').state, 'passed', 'a duplicate push changes nothing');
      assert.equal(w.player('openid-A').strikes.length, 0);
      assert.equal((await w.A.call('modSweeper')).code, 'FORBIDDEN');
      assert.equal((await w.A.call('admin', { op: 'listReports' })).code, 'FORBIDDEN');
    });

    it('AC 46/48: no verdict -> one re-check at 35 min -> void at 70 min: no strike, allowance restored, 棒 reopens; a late risky strikes only', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(15) }); // 15 strokes: never a verdict
      assert.equal((await w.A.call('getHome')).me.startsLeft, 2);
      const stepId = c.chainId + '_1_1';
      await w.sweep(34);
      assert.equal(w.step(stepId).mod.traceIds.length, 1);
      await w.sweep(2); // 36 min
      assert.equal(w.step(stepId).mod.traceIds.length, 2, 'exactly one re-check');
      assert.equal(w.step(stepId).state, 'pending');
      await w.sweep(30);
      assert.equal(w.step(stepId).mod.traceIds.length, 2, 'no second re-check');
      await w.sweep(6); // > 70 min after the first check
      assert.equal(w.step(stepId).state, 'void');
      assert.equal(w.chain(c.chainId).state, 'open');
      assert.equal(w.chain(c.chainId).nextStep, 1);
      assert.equal(w.player('openid-A').strikes.length, 0);
      assert.equal((await w.A.call('getHome')).me.startsLeft, 3, 'the start is given back');
      assert.equal((await w.A.call('getMyChains', { chainId: c.chainId })).mine[0].modState, 'void');
      await w.push(w.step(stepId).mod.traceIds[0], 'risky'); // AC 48
      assert.equal(w.player('openid-A').strikes.length, 1);
      assert.equal(w.step(stepId).state, 'void');
      assert.equal(w.chain(c.chainId).state, 'open');
    });

    it('AC 47: mediaCheckAsync call errors are retried by the sweeper at +5 and +10 min, then void; never shown meanwhile', async (w) => {
      if (!w.canFailImageCalls) return; // mock moderation makes no platform call to fail
      w.failImage(true);
      const c = await w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
      assert.equal((await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) })).state, 'pending');
      const sid = c.chainId + '_1_1';
      assert.equal(w.step(sid).mod.callErrors, 1);
      assert.equal((await w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref })).state, 'pending');
      await w.sweep(4);
      assert.equal(w.step(sid).mod.callErrors, 1);
      await w.sweep(1.5);
      assert.equal(w.step(sid).mod.callErrors, 2);
      await w.sweep(5);
      assert.equal(w.step(sid).mod.callErrors, 3);
      await w.sweep(1);
      assert.equal(w.step(sid).state, 'void');
      w.failImage(true);
      const c2 = await w.A.call('createChain', { promptId: 'A02', groupRef: w.A.ref });
      await w.A.call('submitStep', { chainId: c2.chainId, claimId: c2.claim.claimId, strokes: w.drawing(2) });
      w.failImage(false);
      await w.sweep(6);
      await w.sweep(2);
      assert.equal(w.step(c2.chainId + '_1_1').state, 'passed');
    });

    it('AC 49: the author sees 审核中 in their album; other players see only a pending state and never learn of a block', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'A01', groupRef: w.A.ref });
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(14) });
      const mine = await w.A.call('getMyChains', {});
      assert.equal(mine.items[0].status, 'pending');
      assert.equal((await w.A.call('getMyChains', { chainId: c.chainId })).mine[0].modState, 'pending');
      assert.equal((await w.B.call('getMyChains', {})).items.length, 0);
      assert.equal((await w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref })).state, 'pending');
      await w.sweep(2); // blocked (14 strokes = review)
      assert.equal((await w.A.call('getMyChains', {})).items[0].status, 'blocked');
      assert.equal((await w.A.call('getMyChains', { chainId: c.chainId })).mine[0].modState, 'blocked');
      const seenByB = await w.B.call('getChain', { chainId: c.chainId, groupRef: w.B.ref });
      assert.equal(seenByB.state, 'claimable', 'the 棒 simply reopens');
      assert.equal(seenByB.nextStep, 1);
      assert.ok(!JSON.stringify(seenByB).match(/block|review|risky/i));
    });

    test('AC 51: mock moderation in production: every UGC function returns SERVER_CONFIG and logs [ALERT]', async () => {
      await scenario(F, { envKind: 'prod', mode: 'mock' }, async (w) => {
        w.alerts.length = 0;
        for (const name of schema.UGC_FUNCTIONS.filter((n) => schema.FUNCTIONS[n].caller === 'client')) {
          const r = await w.call(name, { chainId: 'X', promptId: 'A01' }, 'openid-A');
          assert.equal(r.code, 'SERVER_CONFIG', name);
        }
        assert.ok(w.alerts.length > 0 && w.alerts.every((a) => a.startsWith('[ALERT]')));
        assert.equal((await w.sweepNow()).code, 'SERVER_CONFIG');
        assert.equal((await w.call('getHome', {}, 'openid-A')).ok, true); // functions without UGC still work
      });
    });

    test('AC 52: dev live mode stops calling the text check beyond the daily budget and fails closed', async () => {
      await scenario(F, { envKind: 'dev', mode: 'live', textBudget: 3 }, async (w) => {
        const id = await w.startChain('A');
        const k = await w.take('B', id);
        for (let i = 0; i < 3; i++) assert.equal((await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '测试复审' })).code, 'TEXT_BLOCKED');
        const over = await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
        assert.equal(over.code, 'MODERATION_BUSY');
        assert.equal(w.chain(id).passed, 1);
        assert.equal(w.textUsed(), 3, 'the platform was not called a 4th time');
        w.t += 86400e3; // next day: the budget resets
        assert.equal(w.textUsed(), 0);
      });
    });

    it('AC 53/54: createEnabled=false blocks create, claim and submit; viewEnabled=false returns placeholders and no content', async (w) => {
      const { id } = await w.fullChain();
      const id2 = await w.startChain('A');
      const k = await w.take('B', id2);
      w.setConfig({ ugc: { createEnabled: false } });
      assert.equal((await w.A.call('createChain', { promptId: 'A01' })).code, 'UGC_PAUSED');
      assert.equal((await w.C.call('claimStep', { chainId: id2 })).code, 'UGC_PAUSED');
      assert.equal((await w.B.call('submitStep', { chainId: id2, claimId: k.claimId, text: '一个大饼在天上' })).code, 'UGC_PAUSED');
      assert.equal((await w.A.call('getReveal', { chainId: id })).ok, true, 'viewing revealed chains still works');
      w.setConfig({ ugc: { viewEnabled: false } });
      const rv = await w.A.call('getReveal', { chainId: id });
      assert.equal(rv.ok, true);
      assert.ok(rv.steps.every((s) => s.placeholder === 'paused' && s.strokes === undefined && s.text === undefined));
      assert.equal(rv.prompt.text, null);
      assert.ok(!JSON.stringify(rv).includes('月亮吃月饼'));
      await w.B.call('releaseClaim', { chainId: id2, claimId: k.claimId });
      const k2 = await w.take('C', id2);
      assert.equal(k2.prev.kind, 'paused');
      assert.equal(k2.prev.strokes, undefined);
      const teaser = await w.D.call('getReveal', { chainId: id });
      assert.equal(teaser.code, 'NOT_PARTICIPANT');
      assert.equal(teaser.teaser.promptText, null);
      assert.equal(teaser.teaser.finalText, null);
    });

    it('AC 55: >= 50% moderation failures over >= 20 calls in 5 min pause creation for 15 minutes with an [ALERT]', async (w) => {
      const id = await w.startChain('A');
      const k = await w.take('B', id);
      for (let i = 0; i < 20; i++) assert.equal((await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '测试繁忙' })).code, 'MODERATION_BUSY');
      w.alerts.length = 0;
      await w.sweep(0.1);
      assert.ok(w.alerts.some((a) => /circuit breaker/.test(a)));
      assert.equal((await w.C.call('createChain', { promptId: 'A01' })).code, 'UGC_PAUSED');
      assert.equal((await w.C.call('getHome')).ugc.createEnabled, false);
      assert.equal((await w.C.call('getHome')).ugc.pausedSource, 'breaker');
      w.t += 16 * MIN;
      assert.equal((await w.C.call('createChain', { promptId: 'A01' })).ok, true);
    });

    it('AC 56: at 95% of the daily image quota createChain returns UGC_BUSY while claims continue; at 100% drawings fail closed', async (w) => {
      const id = await w.startChain('A');
      const k = await w.take('B', id);
      w.setImageUsed(190000);
      assert.equal((await w.C.call('createChain', { promptId: 'A01' })).code, 'UGC_BUSY');
      assert.equal((await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' })).state, 'passed', 'claims and texts continue');
      w.setImageUsed(200000);
      const k2 = await w.take('C', id);
      assert.equal((await w.C.call('submitStep', { chainId: id, claimId: k2.claimId, strokes: w.drawing(2) })).code, 'MODERATION_BUSY');
      assert.equal(w.chain(id).claim.claimId, k2.claimId, 'the claim is kept');
      w.setImageUsed(140000);
      w.alerts.length = 0;
      await w.sweep(0.1);
      assert.ok(w.alerts.some((a) => /quota/.test(a)));
    });

    it('INVALID_STROKES: oversized or malformed drawings are rejected before anything is stored', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'A01' });
      const bad = [{ v: 1, s: [] }, { v: 1, s: [[12, 0, 1, 1]] }, { v: 1, s: [[0, 0, 5000, 1]] }, { v: 2, s: [[0, 0, 1, 1]] }, 'x', { v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) }];
      for (const strokes of bad) assert.equal((await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes })).code, 'INVALID_STROKES');
      assert.equal(w.steps().length, 0);
      assert.equal((await w.A.call('getHome')).me.startsLeft, 3);
    });

    it('AC 58-61: a report hides the item for everyone at once; one report per player per item; reopens the latest 棒', async (w) => {
      const id = await w.startChain('A');
      await w.describe('B', id, '一个大饼在天上'); // 2 passed, latest is 棒 2
      const k = await w.take('C', id); // C holds the claim on 棒 3 and sees 棒 2
      assert.equal(k.prev.canReport, true);
      assert.equal((await w.take('A', id)).code, 'TAKEN');
      assert.equal((await w.D.call('report', { chainId: id, step: 2, reason: 'abuse' })).code, 'NOT_PARTICIPANT');
      assert.equal((await w.C.call('report', { chainId: id, step: 2, reason: 'nonsense' })).code, 'BAD_REQUEST');
      const rep = await w.C.call('report', { chainId: id, step: 2, reason: 'abuse' });
      assert.deepEqual([rep.ok, rep.hidden, rep.reopened, rep.claimReleased], [true, true, true, true]);
      const ch = w.chain(id);
      assert.deepEqual([ch.passed, ch.nextStep, ch.claim], [1, 2, null]);
      assert.equal(w.step(id + '_2_1').state, 'hidden');
      assert.equal(w.reports().length, 1);
      assert.equal((await w.C.call('report', { chainId: id, step: 2, reason: 'abuse' })).code, 'BAD_REQUEST', 'no longer visible to report');
      const again = await w.take('D', id);
      assert.equal(again.ok, true);
      assert.ok(!JSON.stringify(again).includes('一个大饼'));
      const full = await w.fullChain();
      const r1 = await w.A.call('report', { chainId: full.id, step: 4, reason: 'ad' });
      assert.equal(r1.hidden, true);
      assert.equal(r1.reopened, false);
      assert.equal((await w.A.call('report', { chainId: full.id, step: 4, reason: 'ad' })).code, 'DUP_REPORT');
      const rvB = await w.B.call('getReveal', { chainId: full.id });
      const s4 = rvB.steps.find((s) => s.n === 4);
      assert.deepEqual([s4.placeholder, s4.text, s4.canReport], ['reported', undefined, false]);
      assert.equal((await w.B.call('report', { chainId: full.id, step: 1, reason: 'other' })).ok, true);
      assert.equal((await w.B.call('report', { chainId: full.id, step: 1, reason: 'other' })).code, 'DUP_REPORT', 'a repeat report of a hidden step is DUP_REPORT (QA-6)');
      assert.equal((await w.C.call('report', { chainId: full.id, step: 3, reason: 'other' })).code, 'NOT_PARTICIPANT');
      assert.equal((await w.A.call('report', { chainId: full.id, step: 5, reason: 'other' })).code, 'OWN_STEP');
    });

    it('AC 61/59: reporting the teaser of a preset chain hides the final sentence for everyone; non-members cannot report it', async (w) => {
      const { id } = await w.fullChain();
      assert.equal((await w.D.call('report', { chainId: id, step: 0, reason: 'other' })).hidden, true);
      assert.equal(w.reports().length, 1);
      assert.equal((await w.call('report', { chainId: id, step: 0, reason: 'other' }, 'openid-Y')).code, 'NOT_MEMBER');
      assert.equal((await w.D.call('getReveal', { chainId: id })).teaser.finalText, '外星人在吃披萨', 'the final sentence is hidden for everyone');
    });

    it('AC 18: 10 reports per day, each refused beyond that with REPORT_LIMIT', async (w) => {
      const chains = [];
      for (let i = 0; i < 11; i++) {
        const cc = await w.startChain('A');
        await w.describe('B', cc);
        w.patchPlayer('openid-A', (p) => { p.day.starts = 0; p.day.steps = 0; });
        w.patchPlayer('openid-B', (p) => { p.day.steps = 0; });
        w.patchPlayer('openid-C', (p) => { p.day.claims = {}; });
        chains.push(cc);
      }
      let limited = 0;
      for (const cid of chains) {
        await w.take('C', cid);
        const rr = await w.C.call('report', { chainId: cid, step: 2, reason: 'other' });
        if (rr.code === 'REPORT_LIMIT') limited++;
        else assert.equal(rr.ok, true, JSON.stringify(rr));
      }
      assert.equal(limited, 1);
    });

    it('AC 61: reporting the teaser of a custom-prompt chain hides the whole chain for everyone', async (w) => {
      const c = await w.A.call('createChain', { customText: '我家的猫会开车', groupRef: w.A.ref });
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2) });
      await w.sweep(2);
      await w.describe('B', c.chainId);
      await w.paint('C', c.chainId);
      await w.describe('B', c.chainId, '外星人在吃披萨');
      await w.A.call('revealNow', { chainId: c.chainId });
      assert.equal((await w.D.call('getReveal', { chainId: c.chainId })).teaser.promptText, '我家的猫会开车');
      assert.equal((await w.D.call('report', { chainId: c.chainId, step: 0, reason: 'porn' })).hidden, true);
      const v = await w.A.call('getChain', { chainId: c.chainId });
      assert.deepEqual([v.state, v.removedReason], ['removed', 'reported']);
      assert.equal((await w.A.call('getReveal', { chainId: c.chainId })).code, 'CHAIN_CLOSED');
      assert.equal((await w.D.call('getReveal', { chainId: c.chainId })).code, 'CHAIN_CLOSED');
    });

    it('AC 71/72: 删除这一棒 removes the content, shows a placeholder, reopens the latest 棒; delete-all applies it to every passed 棒', async (w) => {
      const id = await w.startChain('A');
      await w.describe('B', id, '一个大饼在天上');
      const k = await w.take('C', id);
      const d = await w.B.call('deleteMyStep', { chainId: id, step: 2 });
      assert.deepEqual([d.ok, d.count], [true, 1]);
      const st = w.step(id + '_2_1');
      assert.deepEqual([st.state, st.text, st.strokes], ['deleted', undefined, undefined]);
      assert.equal(w.modLog().some((m) => m.textCopy === '一个大饼在天上'), true, 'evidence copy stays');
      const ch = w.chain(id);
      assert.deepEqual([ch.passed, ch.nextStep, ch.claim], [1, 2, null]);
      assert.equal((await w.C.call('submitStep', { chainId: id, claimId: k.claimId, strokes: w.drawing(2) })).code, 'CLAIM_LOST');
      assert.equal((await w.B.call('deleteMyStep', { chainId: id, step: 2 })).code, 'BAD_REQUEST');
      const full = await w.fullChain();
      const mine = await w.A.call('deleteMyStep', { all: true });
      assert.ok(mine.count >= 3);
      const rv = await w.B.call('getReveal', { chainId: full.id });
      assert.deepEqual(rv.steps.filter((s) => s.mine === false && s.placeholder === 'deleted').length, 3);
      assert.equal(rv.steps.filter((s) => s.placeholder === null).length, 3);
      assert.equal(rv.passed, 6);
      assert.ok(!JSON.stringify(rv).includes('strokes":{"v":1,"s":[[0,1,100'), 'deleted drawings are gone');
    });

    it('AC 73/29/74: no response contains an openid, group id, file id or PNG; steps are numbers and "mine" flags only', async (w) => {
      await w.fullChain();
      const id = await w.startChain('C');
      await w.take('D', id);
      await w.A.call('getMyChains', {});
      await w.A.call('getGroupChains', { groupRef: w.A.ref });
      await w.A.call('getHome');
      const text = JSON.stringify(w.log);
      assert.ok(text.length > 1000);
      assert.doesNotMatch(text, /openid-[A-E]/, 'no openid');
      assert.doesNotMatch(text, /group-1|group-2|group-9/, 'no openGId');
      assert.doesNotMatch(text, /fileID|\.png|cloud:\/\/|tempFileURL|nickName|avatar/i);
      assert.doesNotMatch(text, /"(openid|openId|OPENID|openGId|unionid|starter|author|authors|participants)"/);
      assert.match(w.A.ref, /^[0-9a-f]{16}$/);
    });

    it('AC 80/82/83/85: reveals are for participants; others get the teaser only; 笑 toggles once per participant; hidden/deleted are placeholders', async (w) => {
      const { id } = await w.fullChain();
      const t = await w.D.call('getReveal', { chainId: id });
      assert.equal(t.code, 'NOT_PARTICIPANT');
      assert.deepEqual(Object.keys(t.teaser).sort(), ['chainId', 'finalText', 'passed', 'paused', 'promptText']);
      assert.deepEqual([t.teaser.promptText, t.teaser.finalText, t.teaser.passed], ['月亮吃月饼', '企鹅在沙漠晒太阳', 6]);
      assert.ok(!JSON.stringify(t).includes('strokes'));
      assert.ok(!JSON.stringify(t).includes('一个大饼在天上'));
      assert.equal((await w.D.call('laugh', { chainId: id, step: 2 })).code, 'NOT_PARTICIPANT');
      const l1 = await w.A.call('laugh', { chainId: id, step: 2 });
      assert.deepEqual([l1.laughs, l1.mine], [1, true]);
      assert.equal((await w.B.call('laugh', { chainId: id, step: 2 })).laughs, 2);
      const l3 = await w.A.call('laugh', { chainId: id, step: 2 });
      assert.deepEqual([l3.laughs, l3.mine], [1, false]);
      const rv = await w.A.call('getReveal', { chainId: id });
      assert.equal(rv.steps[1].laughs, 1);
      assert.equal(rv.steps[1].myLaugh, false);
      assert.equal((await w.B.call('getReveal', { chainId: id })).steps[1].myLaugh, true);
      assert.ok(!('best' in rv) && !('ranking' in rv) && !JSON.stringify(Object.keys(rv)).match(/rank|award|best/i));
      w.patchStep(id + '_6_1', (s) => { s.state = 'hidden'; });
      assert.equal((await w.D.call('getReveal', { chainId: id })).teaser.finalText, '外星人在吃披萨');
      assert.equal('nationalCount' in (await w.A.call('getReveal', { chainId: id })), false, 'no national count (F-2)');
    });

    it("AC 86: an expired chain shows only the player's own 棒 in 我的接龙", async (w) => {
      const id = await w.startChain('A');
      await w.describe('B', id, '一个大饼在天上');
      w.patchChain(id, (ch) => { ch.expiresAt = w.t; });
      await w.sweep(0.1);
      const a = await w.A.call('getMyChains', { chainId: id });
      assert.equal(a.item.status, 'expired');
      assert.deepEqual(a.mine.map((m) => m.n), [1]);
      assert.ok(a.mine[0].strokes);
      const b = await w.B.call('getMyChains', { chainId: id });
      assert.deepEqual(b.mine.map((m) => [m.n, m.text]), [[2, '一个大饼在天上']]);
      assert.equal(b.item.promptText, null, 'an author of 棒 2 never saw the prompt');
      assert.equal(a.item.promptText, '月亮吃月饼', 'the starter did');
      assert.equal((await w.C.call('getMyChains', { chainId: id })).code, 'CHAIN_NOT_FOUND');
      assert.equal((await w.C.call('getChain', { chainId: id })).state, 'expired');
    });

    it('AC 98: 本群接龙 lists waiting, in-progress and revealed chains of this group only, with aggregate stats and no per-person data', async (w) => {
      await w.fullChain();
      const waiting = await w.startChain('A');
      const taken = await w.startChain('A');
      await w.take('C', taken);
      const g2 = (await w.E.call('joinGroup', { cloudID: 'cid-3-group-2' })).groupRef;
      const foreign = await w.E.call('createChain', { promptId: 'A01', groupRef: g2 });
      await w.E.call('submitStep', { chainId: foreign.chainId, claimId: foreign.claim.claimId, strokes: w.drawing(2) });
      await w.sweep(2);
      const list = await w.B.call('getGroupChains', { groupRef: w.B.ref });
      assert.equal(list.ok, true);
      assert.deepEqual(list.waiting.map((r) => r.chainId), [waiting]);
      assert.deepEqual(list.inProgress.map((r) => [r.chainId, r.reason]), [[taken, 'taken']]);
      assert.equal(list.revealed.length, 1);
      assert.deepEqual([list.revealed[0].promptText, list.revealed[0].finalText, list.revealed[0].participant], ['月亮吃月饼', '企鹅在沙漠晒太阳', true]);
      assert.deepEqual(list.stats, { started: 3, revealed: 1, drawings: 5, rooms: 0 });
      assert.ok(!JSON.stringify(list).includes(foreign.chainId), 'other groups are invisible');
      assert.equal((await w.call('getGroupChains', { groupRef: w.B.ref }, 'openid-Z')).code, 'NOT_MEMBER');
      assert.equal((await w.E.call('getGroupChains', { groupRef: 'ffffffffffffffff' })).code, 'NOT_MEMBER');
      const nonPart = await w.D.call('getGroupChains', { groupRef: w.D.ref });
      assert.equal(nonPart.revealed[0].participant, false);
      assert.ok(!Object.keys(list).some((k) => /member|player|author|rank/i.test(k)));
    });

    it('AC 78/100: the subscribe offer works only with a configured template; one grant, at most one notice; held during quiet hours', async (w) => {
      const id = await w.startChain('A');
      assert.equal((await w.A.call('subscribeReveal', { chainId: id })).code, 'NO_TEMPLATE');
      w.setConfig({ subscribe: { tmplId: 'TPL-1' } });
      assert.equal((await w.D.call('subscribeReveal', { chainId: id })).code, 'NOT_PARTICIPANT');
      assert.equal((await w.A.call('subscribeReveal', { chainId: id })).ok, true);
      assert.equal((await w.A.call('subscribeReveal', { chainId: id })).ok, true);
      assert.equal(w.subGrants().length, 1);
      assert.deepEqual((await w.A.call('getHome')).features.subscribe, { tmplId: 'TPL-1' });
      await w.describe('B', id);
      await w.paint('C', id);
      await w.describe('B', id, '外星人在吃披萨');
      w.t = Date.UTC(2026, 10, 3, 15, 30); // 23:30 BJT
      assert.equal((await w.A.call('revealNow', { chainId: id })).ok, true);
      await w.sweepNow();
      assert.equal(w.sent().length, 0, 'quiet hours');
      w.t = Date.UTC(2026, 10, 4, 0, 5); // 08:05 BJT
      await w.sweepNow();
      await w.sweepNow();
      assert.deepEqual(w.sent().map((s) => s.chainId), [id], 'exactly one message');
    });

    it('getHome (AC 121): no daily / launchKey / national counts; allowances, features, rooms; clock from the server', async (w) => {
      const a = await w.A.call('getHome');
      for (const k of ['daily', 'launchKey']) assert.equal(k in a, false, k + ' is gone (F-2)');
      assert.equal(a.dateKey, '20261103');
      assert.equal(a.serverNow, T0);
      assert.equal(a.me.startsLeft, 3);
      assert.equal(a.me.adStartsLeft, 2);
      assert.deepEqual([a.me.roomsLeft, a.me.joinsLeft, a.me.turnsLeft, a.me.activeRoom], [10, 30, 80, null]);
      assert.equal(a.features.liveRooms, false, 'the legacy async switch is on in this suite: live rooms are off (AC 154)');
      assert.equal(a.me.paletteToday, false);
      assert.equal((await w.A.call('grantReward', { kind: 'palette', noFill: false })).paletteToday, true);
      assert.equal((await w.A.call('getHome')).me.paletteToday, true);
      w.t += 86400e3;
      assert.equal((await w.A.call('getHome')).me.paletteToday, false);
      assert.equal((await w.A.call('grantReward', { kind: 'coins' })).code, 'BAD_REQUEST');
      assert.equal((await w.A.call('grantReward', { kind: 'start', noFill: true })).ok, true);
      assert.equal((await w.A.call('grantReward', { kind: 'start', noFill: true })).code, 'REWARD_LIMIT');
    });

    it('AC 90: the streak advances on passed 棒 and getHome reports it', async (w) => {
      await w.startChain('A');
      assert.equal((await w.A.call('getHome')).me.streak, 1);
      w.t += 86400e3;
      await w.startChain('A');
      assert.equal((await w.A.call('getHome')).me.streak, 2);
      w.t += 2 * 86400e3;
      assert.equal((await w.A.call('getHome')).me.streak, 0);
    });

    it('AC 113: date keys come from server time in UTC+8 (15:59:59 and 16:00:00 UTC)', async (w) => {
      w.t = Date.UTC(2026, 10, 3, 15, 59, 59);
      assert.equal((await w.A.call('getHome')).dateKey, '20261103');
      w.t = Date.UTC(2026, 10, 3, 16, 0, 0);
      assert.equal((await w.A.call('getHome')).dateKey, '20261104');
    });

    it('AC 75: track sanitises events (no text, openid, group id) and AC 112: no function throws or answers INTERNAL for malformed input', async (w) => {
      assert.equal((await w.A.call('track', { events: [{ name: 'error', props: { text: 'hi', code: 'X', openid: 'openid-A', groupRef: 'abcd' } }] })).ok, true);
      const ev = w.events().filter((e) => e.name === 'error' && e.openid === 'openid-A');
      assert.deepEqual(ev[0].props, { code: 'X' });
      const inputs = [undefined, null, 5, 'x', [], {}, { chainId: 5 }, { chainId: {} }, { events: 3 }, { chainId: 'ABCDEFGHIJ', claimId: 5, text: 5, strokes: 5, step: 'a', reason: {} },
        { groupRef: 5, cloudID: 5, version: '1', kind: {}, noFill: 3, all: 'yes', cursor: {} }, { events: [1, 'a', { name: 5, props: 3 }] }, { op: 5 }];
      for (const name of schema.CLIENT_FUNCTIONS) {
        for (const who of ['fuzz-user', 'openid-A']) {
          for (const bad of inputs) {
            w.t += 61e3; // a new rate-limit window for every call
            const r = await w.call(name, bad, who);
            assert.equal(typeof r, 'object', name);
            assert.equal(typeof r.ok, 'boolean', name);
            if (!r.ok) assert.ok(SERVER_CODES.includes(r.code), name + ' ' + r.code);
            if (w.name !== 'mock-server') assert.notEqual(r.code, 'INTERNAL', name + ' ' + JSON.stringify(bad));
          }
        }
      }
    });

    it('AC 25: every limit of the stroke format is enforced on submit (strokes, points, points per stroke, range, colour, size, 32 KB) and stores nothing', async (w) => {
      const c = await w.A.call('createChain', { promptId: 'A01' });
      const run = (n, m) => Array.from({ length: n }, (_, i) => [0, 2, i % 2 ? 1023 : 0, 0].concat(...Array.from({ length: m - 1 }, (_, k) => (k % 2 ? [1023, -1023] : [-1023, 1023]))));
      const bad = {
        strokes: { v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) },
        points: { v: 1, s: run(8, 560) },
        perStroke: { v: 1, s: [[0, 0, 0, 0].concat(...Array.from({ length: 600 }, () => [1, 1]))] },
        range: { v: 1, s: [[0, 0, 1023, 1023, 5, 5]] },
        colour: { v: 1, s: [[12, 0, 1, 1]] },
        size: { v: 1, s: [[0, 3, 1, 1]] },
        bytes: { v: 1, s: run(7, 571) },
        empty: { v: 1, s: [] },
      };
      for (const [name, strokes] of Object.entries(bad)) {
        const r = await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes });
        assert.equal(r.code, 'INVALID_STROKES', name + ' ' + JSON.stringify(r));
        w.t += 61e3;
      }
      assert.equal(w.steps().length, 0);
      assert.equal(w.chain(c.chainId).state, 'starting', 'the claim is untouched');
    });

    it('AC 67: modSweeper logs [ALERT] when an open report is older than 48 h (and not before)', async (w) => {
      const { id } = await w.fullChain();
      assert.equal((await w.D.call('report', { chainId: id, step: 0, reason: 'other' })).hidden, true);
      w.alerts.length = 0;
      await w.sweep(47 * 60);
      assert.ok(!w.alerts.some((a) => /older than 48h/.test(a)), 'not yet');
      await w.sweep(2 * 60);
      assert.ok(w.alerts.some((a) => /^\[ALERT\].*older than 48h/.test(a)));
    });

    it('AC 101/102: rewarded starts are capped at 2 a day, the palette at 1; a no-fill grant works once per placement per day; caps reset at midnight BJT', async (w) => {
      assert.equal((await w.A.call('grantReward', { kind: 'start', noFill: false })).startsLeft, 4);
      assert.equal((await w.A.call('grantReward', { kind: 'start', noFill: false })).startsLeft, 5);
      assert.equal((await w.A.call('grantReward', { kind: 'start', noFill: false })).code, 'REWARD_LIMIT');
      assert.equal((await w.A.call('grantReward', { kind: 'palette', noFill: false })).paletteToday, true);
      assert.equal((await w.A.call('grantReward', { kind: 'palette', noFill: false })).code, 'REWARD_LIMIT');
      assert.equal((await w.B.call('grantReward', { kind: 'palette', noFill: true })).paletteToday, true);
      assert.equal((await w.B.call('grantReward', { kind: 'palette', noFill: true })).code, 'REWARD_LIMIT');
      w.t = Date.UTC(2026, 10, 3, 16, 0, 1);
      assert.equal((await w.A.call('grantReward', { kind: 'start', noFill: false })).ok, true);
    });

    it('AC 20: random operation sequences never move a revealed, expired or removed chain back to open (and the 3-棒 cap and 6-棒 length always hold)', async (w) => {
      let seed = 20261015;
      const rnd = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const users = ['A', 'B', 'C', 'D', 'E'];
      let held = null;
      const id = await w.startChain('A');
      let closedAs = null;
      for (let i = 0; i < 70; i++) {
        const u = pick(users);
        const op = pick(['claim', 'claim', 'submit', 'submit', 'submit', 'release', 'reveal', 'report', 'delete', 'sweep', 'wait']);
        w.t += 61e3 + Math.floor(rnd() * 120e3);
        if (op === 'claim') {
          const r = await w.take(u, id);
          if (r.ok) held = { u, claimId: r.claimId, kind: r.kind };
        } else if (op === 'submit' && held) {
          const body = held.kind === 'draw' ? { strokes: w.drawing(3 + Math.floor(rnd() * 2)) } : { text: pick(['一个大饼在天上', '外星人在吃披萨', '企鹅在沙漠晒太阳']) };
          const r = await w[held.u].call('submitStep', Object.assign({ chainId: id, claimId: held.claimId }, body));
          if (r.ok || r.code === 'CLAIM_LOST') held = null;
        } else if (op === 'release' && held) {
          await w[held.u].call('releaseClaim', { chainId: id, claimId: held.claimId });
          held = null;
        } else if (op === 'reveal') await w.A.call('revealNow', { chainId: id });
        else if (op === 'report') await w[u].call('report', { chainId: id, step: 1 + Math.floor(rnd() * 6), reason: 'other' });
        else if (op === 'delete') await w[u].call('deleteMyStep', { chainId: id, step: 1 + Math.floor(rnd() * 6) });
        else if (op === 'sweep') await w.sweep(rnd() < 0.1 ? 49 * 60 : 3);
        const ch = w.chain(id);
        assert.ok(ch.passed >= 0 && ch.passed <= 6, 'passed ' + ch.passed);
        for (const [who, n] of Object.entries(ch.perPersonCount)) assert.ok(n >= 0 && n <= 3, `${who} has ${n}`);
        if (closedAs) assert.equal(ch.state, closedAs, `a ${closedAs} chain changed to ${ch.state} after ${op}`);
        else if (['revealed', 'expired', 'removed', 'abandoned'].includes(ch.state)) closedAs = ch.state;
        if (ch.state === 'revealed') assert.ok(ch.passed >= 4, 'revealed with ' + ch.passed);
        if (closedAs) held = null;
      }
      await w.sweep(49 * 60);
      await w.sweep(10);
      const end = w.chain(id);
      assert.ok(['revealed', 'expired'].includes(end.state), 'after 48 h the chain is over: ' + end.state);
      if (closedAs) assert.equal(end.state, closedAs);
    });

    it('AC 17 edge: a group member who is not a participant sees the teaser; participation survives leaving the group', async (w) => {
      const { id } = await w.fullChain();
      assert.equal((await w.D.call('getChain', { chainId: id, groupRef: w.D.ref })).state, 'revealedTeaser');
      w.t += 60 * 86400e3;
      assert.equal((await w.A.call('getReveal', { chainId: id })).ok, true);
    });
  });
}

// mock-server only: the dispatcher behaviours that have no cloud counterpart
test('mock-server: unknown functions are BAD_REQUEST and offline is NETWORK (client-side helpers)', async () => {
  await scenario(FLAVORS[0], undefined, async (w) => {
    assert.equal((await w.call('nope', {}, 'u')).code, 'BAD_REQUEST');
    w.srv.offline = true;
    assert.equal((await w.A.call('getHome')).code, 'NETWORK');
  });
});
