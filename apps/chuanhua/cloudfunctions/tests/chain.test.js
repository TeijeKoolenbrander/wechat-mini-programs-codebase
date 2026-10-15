'use strict';
// Chain shape, claims, caps, locks, lifecycle (AC 1-20).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');
const F = require('./helpers/flow');

let h;
const [A, B, C, D] = F.PEOPLE;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

test('two accounts alternating (1/3/5 and 2/4/6) complete a chain; reveal shows all 6 (AC 6, 15)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const chainId = await F.startAndPassFirst(h, A, gref);
  const sub = [];
  for (const who of [B, A, B, A, B]) sub.push((await F.play(h, who, chainId, gref)).submit);
  assert.equal(sub[4].revealed, true, 'the last 棒 (text) reveals in the same call');
  assert.equal(sub[4].state, 'passed');
  const chain = h.db.get('chains', chainId);
  assert.equal(chain.state, 'revealed');
  assert.equal(chain.revealReason, 'complete');
  assert.equal(chain.passed, 6);
  const rv = await h.call('getReveal', { chainId }, { openid: A });
  assert.equal(rv.ok, true);
  assert.equal(rv.steps.length, 6);
  assert.deepEqual(rv.steps.map((s) => s.kind), ['draw', 'describe', 'draw', 'describe', 'draw', 'describe']);
  assert.ok(rv.steps[0].strokes && rv.steps[1].text);
  assert.equal(rv.steps[0].mine, true);
  assert.equal(rv.steps[1].mine, false);
});

test('a chain has a prompt and 6 棒; text for a draw 棒 and strokes for a describe 棒 are rejected (AC 1)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const c = await F.create(h, A, { groupRef: gref });
  assert.equal(c.claim.step, 1);
  assert.equal(c.claim.kind, 'draw');
  const wrong = await F.submit(h, A, c.chainId, c.claim.claimId, { text: '一二' });
  assert.equal(wrong.code, 'WRONG_KIND');
  const both = await F.submit(h, A, c.chainId, c.claim.claimId, { text: '一二', strokes: F.strokes() });
  assert.equal(both.code, 'BAD_INPUT');
  const chainId = c.chainId;
  const ok = await F.submit(h, A, chainId, c.claim.claimId, { strokes: F.strokes() });
  assert.equal(ok.state, 'pending');
  await F.sweep(h);
  const cl = await F.claim(h, B, chainId, gref);
  assert.equal(cl.kind, 'describe');
  const wrong2 = await F.submit(h, B, chainId, cl.claimId, { strokes: F.strokes() });
  assert.equal(wrong2.code, 'WRONG_KIND');
});

test('createChain claims 第 1 棒 for the starter with the prompt; nobody else can claim it meanwhile (AC 2)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const c = await F.create(h, A, { groupRef: gref, promptId: 'A07' });
  assert.equal(c.claim.sourceText, '题目7号');
  const other = await F.claim(h, B, c.chainId, gref);
  assert.equal(other.ok, false);
  assert.ok(['CHAIN_CLOSED', 'TAKEN'].includes(other.code), other.code);
  // the starter resumes the same claim (e.g. after the app was killed)
  const again = await F.claim(h, A, c.chainId, gref);
  assert.equal(again.claimId, c.claim.claimId);
  assert.deepEqual(again.prev, { kind: 'text', text: '题目7号' });
});

test('a start is counted only when 第 1 棒 is submitted; an abandoned 第 1 棒 leaves it unchanged (AC 3)', async () => {
  const gref = await F.player(h, A);
  const before = await h.call('getHome', {}, { openid: A });
  assert.equal(before.me.startsLeft, 3);
  const c = await F.create(h, A, { groupRef: gref });
  assert.equal((await h.call('getHome', {}, { openid: A })).me.startsLeft, 3, 'creating alone consumes nothing');
  const rel = await h.call('releaseClaim', { chainId: c.chainId, claimId: c.claim.claimId }, { openid: A });
  assert.equal(rel.released, true);
  assert.equal(h.db.get('chains', c.chainId).state, 'abandoned');
  assert.equal((await h.call('getHome', {}, { openid: A })).me.startsLeft, 3);
  const c2 = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c2.chainId, c2.claim.claimId, { strokes: F.strokes() });
  assert.equal((await h.call('getHome', {}, { openid: A })).me.startsLeft, 2);
  // a claim that simply runs out becomes abandoned via the sweeper, start untouched
  const c3 = await F.create(h, A, { groupRef: gref });
  h.advance(160000);
  await h.call('modSweeper', {});
  assert.equal(h.db.get('chains', c3.chainId).state, 'abandoned');
});

test('PREV_MINE: the author of 棒 n cannot claim 棒 n+1 (AC 4)', async () => {
  const gref = await F.player(h, A);
  const chainId = await F.startAndPassFirst(h, A, gref);
  const r = await F.claim(h, A, chainId, gref);
  assert.equal(r.code, 'PREV_MINE');
});

test('CAP_REACHED at 3 passed or pending 棒; blocked attempts do not count (AC 5)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  await F.player(h, C);
  // blocked drawing (13 strokes -> mock risky) does not count toward the cap
  const c = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes(13) });
  await F.sweep(h);
  assert.equal(h.db.get('steps', `${c.chainId}_1_1`).state, 'blocked');
  assert.equal(h.db.get('chains', c.chainId).perPersonCount[A], undefined);
  // A reaches 3 passed via 1/3/5; the chain's 棒 5 is then hidden by C's report, reopening 棒 5
  const chainId = await F.startAndPassFirst(h, B, gref, {});
  assert.ok(chainId);
  const id = F.seedChain(h, { authors: [A, B, A, B, A], openGId: F.GROUP_A, groupRef: gref });
  const cl6 = await F.claim(h, C, id, gref);
  assert.equal(cl6.step, 6);
  const rep = await h.call('report', { chainId: id, step: 5, reason: 'other' }, { openid: C });
  assert.equal(rep.reopened, true);
  const retry = await F.claim(h, A, id, gref);
  assert.equal(retry.code, 'CAP_REACHED');
});

test('claiming needs a fresh membership of the chain\'s group; binding happens at the first claim with group context (AC 7, 8)', async () => {
  const gA = await F.player(h, A, F.GROUP_A);
  const bA = await F.player(h, B, F.GROUP_A);
  const cB = await F.agree(h, C).then(() => F.join(h, C, F.GROUP_B));
  const chainId = await F.startAndPassFirst(h, A, gA);
  assert.equal(h.db.get('chains', chainId).openGId, F.GROUP_A);
  const wrong = await F.claim(h, C, chainId, cB);
  assert.equal(wrong.code, 'WRONG_GROUP');
  const none = await F.claim(h, C, chainId, undefined);
  assert.equal(none.code, 'NEED_GROUP');
  const ok = await F.claim(h, B, chainId, bA);
  assert.equal(ok.ok, true);
  // stale membership (> 30 days) no longer counts
  await F.player(h, D, F.GROUP_A);
  h.advance(31 * 86400000);
  const chain2 = F.seedChain(h, { authors: [A], openGId: F.GROUP_A, nowMs: h.now() });
  const stale = await F.claim(h, D, chain2, undefined);
  assert.equal(stale.code, 'NEED_GROUP');

  // unbound chain: the first claim made with valid group context binds it; a later other group fails
  h.setNow(Date.UTC(2026, 10, 3, 4, 0, 0));
  const free = await F.create(h, A, {}); // no group context
  assert.equal(free.bound, false);
  await F.submit(h, A, free.chainId, free.claim.claimId, { strokes: F.strokes() });
  await F.sweep(h);
  assert.equal(h.db.get('chains', free.chainId).openGId, null);
  assert.equal((await F.claim(h, B, free.chainId, undefined)).code, 'NEED_GROUP');
  const bind = await F.claim(h, B, free.chainId, bA);
  assert.equal(bind.ok, true);
  assert.equal(h.db.get('chains', free.chainId).openGId, F.GROUP_A);
  await h.call('releaseClaim', { chainId: free.chainId, claimId: bind.claimId }, { openid: B });
  assert.equal((await F.claim(h, C, free.chainId, cB)).code, 'WRONG_GROUP');
});

test('of concurrent claimStep calls exactly one wins; 50 races (AC 9)', async () => {
  const refs = [];
  for (const p of F.PEOPLE) refs.push(await F.player(h, p));
  for (let i = 0; i < 50; i++) {
    h.advance(61000); // new rate-limit minute
    const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
    const contenders = [B, C, D, F.PEOPLE[4]];
    const res = await Promise.all(contenders.map((p, k) => F.claim(h, p, id, refs[1 + k])));
    const winners = res.filter((r) => r.ok);
    assert.equal(winners.length, 1, `race ${i}: ${JSON.stringify(res.map((r) => r.code || 'ok'))}`);
    for (const r of res.filter((x) => !x.ok)) assert.equal(r.code, 'TAKEN');
    const stored = h.db.get('chains', id).claim;
    assert.equal(stored.claimId, winners[0].claimId);
  }
});

test('many concurrent claimants of one 棒: still exactly one lock holder', async () => {
  const users = [];
  const refs = new Map();
  for (let i = 0; i < 30; i++) {
    const o = `oUser${String(i).padStart(2, '0')}0000000000000`;
    users.push(o);
    refs.set(o, await F.player(h, o));
  }
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const res = await Promise.all(users.map((u) => F.claim(h, u, id, refs.get(u))));
  assert.equal(res.filter((r) => r.ok).length, 1);
});

test('claim expires after 150 s; a late submit is accepted if nobody else claimed since, else CLAIM_LOST (AC 12)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  await F.player(h, C);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const cl = await F.claim(h, B, id, gref);
  assert.equal(cl.expiresAt - h.now(), 150000);
  h.advance(151000);
  const late = await F.submit(h, B, id, cl.claimId, { text: '迟到的猜测' });
  assert.equal(late.state, 'passed', 'lazy expiry: nobody claimed since');
  // second scenario: someone else took the expired claim
  const id2 = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const first = await F.claim(h, B, id2, gref);
  h.advance(151000);
  const second = await F.claim(h, C, id2, gref);
  assert.equal(second.ok, true);
  const lost = await F.submit(h, B, id2, first.claimId, { text: '太晚了呀' });
  assert.equal(lost.code, 'CLAIM_LOST');
});

test('submitStep is idempotent per claimId', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const cl = await F.claim(h, B, id, gref);
  const s1 = await F.submit(h, B, id, cl.claimId, { text: '同一句话' });
  const s2 = await F.submit(h, B, id, cl.claimId, { text: '同一句话' });
  assert.equal(s1.state, 'passed');
  assert.deepEqual(s2, s1);
  assert.equal(h.db.get('chains', id).passed, 2);
  assert.equal(h.db.all('steps').filter((s) => s.chainId === id).length, 2);
});

test('a chain whose latest 棒 is pending cannot be claimed (AC 13)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const c = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes() });
  const r = await F.claim(h, B, c.chainId, gref);
  assert.equal(r.code, 'PENDING');
  const view = await h.call('getChain', { chainId: c.chainId, groupRef: gref }, { openid: B });
  assert.equal(view.state, 'pending');
});

test('revealNow: starter only, >= 4 passed, no claim or pending (AC 16)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const id = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  assert.equal((await h.call('revealNow', { chainId: id }, { openid: A })).code, 'TOO_EARLY');
  const id4 = F.seedChain(h, { authors: [A, B, A, B], openGId: F.GROUP_A });
  assert.equal((await h.call('revealNow', { chainId: id4 }, { openid: B })).code, 'NOT_STARTER');
  const cl = await F.claim(h, A, id4, gref);
  assert.equal((await h.call('revealNow', { chainId: id4 }, { openid: A })).code, 'TOO_EARLY', 'active claim');
  await h.call('releaseClaim', { chainId: id4, claimId: cl.claimId }, { openid: A });
  const ok = await h.call('revealNow', { chainId: id4 }, { openid: A });
  assert.equal(ok.ok, true);
  const chain = h.db.get('chains', id4);
  assert.equal(chain.state, 'revealed');
  assert.equal(chain.revealReason, 'early');
  assert.equal((await h.call('revealNow', { chainId: id4 }, { openid: A })).code, 'CHAIN_CLOSED');
  assert.equal((await F.claim(h, B, id4, gref)).code, 'CHAIN_CLOSED');
});

test('at 48 h modSweeper reveals >= 4 passed and expires fewer; it waits for an active claim (AC 17)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const four = F.seedChain(h, { authors: [A, B, A, B], openGId: F.GROUP_A });
  const two = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  const busy = F.seedChain(h, { authors: [A, B, A, B], openGId: F.GROUP_A });
  h.advance(48 * 3600000 - 100000);
  const held = await F.claim(h, A, busy, gref);
  assert.equal(held.ok, true);
  h.advance(101000); // now past 48 h; the claim on `busy` is still live
  await h.call('modSweeper', {});
  assert.equal(h.db.get('chains', four).state, 'revealed');
  assert.equal(h.db.get('chains', four).revealReason, 'expiry');
  assert.equal(h.db.get('chains', two).state, 'expired');
  assert.equal(h.db.get('chains', busy).state, 'open', 'waits for the active claim');
  h.advance(160000);
  await h.call('modSweeper', {});
  assert.equal(h.db.get('chains', busy).state, 'revealed');
  // a claim after expiry is refused
  assert.equal((await F.claim(h, B, two, gref)).code, 'CHAIN_CLOSED');
});

test('daily caps: 3 free starts, 40 submitted 棒, 3 claims per chain, reset at 00:00 BJT by server time (AC 18)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  // starts: the 4th 第 1 棒 submit is refused
  const created = [];
  for (let i = 0; i < 4; i++) { created.push(await F.create(h, A, { groupRef: gref })); h.advance(61000); }
  for (let i = 0; i < 3; i++) assert.equal((await F.submit(h, A, created[i].chainId, created[i].claim.claimId, { strokes: F.strokes() })).state, 'pending');
  const over = await F.submit(h, A, created[3].chainId, created[3].claim.claimId, { strokes: F.strokes() });
  assert.equal(over.code, 'START_LIMIT');
  assert.equal((await F.create(h, A, { groupRef: gref }).catch((e) => e.message)).includes('START_LIMIT'), true);
  // a rewarded start lifts it (max 2 per day)
  assert.equal((await h.call('grantReward', { kind: 'start', noFill: false }, { openid: A })).startsLeft, 1);
  assert.equal((await h.call('grantReward', { kind: 'start', noFill: false }, { openid: A })).startsLeft, 2);
  assert.equal((await h.call('grantReward', { kind: 'start', noFill: false }, { openid: A })).code, 'REWARD_LIMIT');

  // 3 claims per chain per day
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  for (let i = 0; i < 3; i++) {
    const cl = await F.claim(h, B, id, gref);
    assert.equal(cl.ok, true, `claim ${i}`);
    await h.call('releaseClaim', { chainId: id, claimId: cl.claimId }, { openid: B });
  }
  assert.equal((await F.claim(h, B, id, gref)).code, 'CLAIM_LIMIT');

  // 40 submitted 棒 per day
  const p = h.db.get('players', B);
  p.day.steps = 40;
  p.day.claims = {};
  h.db.put('players', p);
  assert.equal((await F.claim(h, B, id, gref)).code, 'STEP_LIMIT');

  // next Beijing day (server time): counters reset
  h.setNow(Date.UTC(2026, 10, 3, 16, 0, 1)); // 2026-11-04 00:00:01 BJT
  const home = await h.call('getHome', {}, { openid: A });
  assert.equal(home.dateKey, '20261104');
  assert.equal(home.me.startsLeft, 3);
  assert.equal((await F.claim(h, B, id, gref)).ok, true);
});

test('restricted, rules not agreed and paused UGC refuse start, claim and submit (AC 19)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  // rules not agreed
  const fresh = 'oFresh000000000000000';
  await F.join(h, fresh);
  assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: fresh })).code, 'RULES_REQUIRED');
  assert.equal((await F.claim(h, fresh, id, gref)).code, 'RULES_REQUIRED');
  // restricted
  await h.call('admin', { op: 'restrict', openid: B, days: 2 });
  const r = await F.claim(h, B, id, gref);
  assert.equal(r.code, 'RESTRICTED');
  assert.ok(r.until > h.now());
  assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: B })).code, 'RESTRICTED');
  await h.call('admin', { op: 'liftRestriction', openid: B });
  // paused
  await h.call('admin', { op: 'setUgc', createEnabled: false });
  h.advance(11000); // the kill switch is read through a 10 s cache per function instance
  assert.equal((await F.claim(h, B, id, gref)).code, 'UGC_PAUSED');
  assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: B })).code, 'UGC_PAUSED');
  assert.equal((await F.submit(h, B, id, 'ABCDEFGHIJKL', { text: '不能提交的' })).code, 'UGC_PAUSED');
});

test('getChain never returns prompt, 棒 text or strokes in any state (AC 10)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  await F.player(h, C, F.GROUP_B);
  const open = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  const claimed = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  await F.claim(h, A, claimed, gref);
  const revealed = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealReason: 'complete', revealedAt: h.now() } });
  const expired = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A, patch: { state: 'expired' } });
  const removed = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A, patch: { state: 'removed' } });
  const pend = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A, patch: { state: 'pending' } });
  const seen = new Set();
  for (const id of [open, claimed, revealed, expired, removed, pend]) {
    for (const who of [A, B, C, D]) {
      const v = await h.call('getChain', { chainId: id, groupRef: who === C ? undefined : gref }, { openid: who });
      assert.equal(v.ok, true);
      seen.add(v.state);
      const s = JSON.stringify(v);
      assert.ok(!s.includes('题目'), 'prompt leaked: ' + s);
      assert.ok(!s.includes('猜测'), 'text leaked: ' + s);
      assert.ok(!/strokes/.test(s), 'strokes leaked: ' + s);
    }
  }
  for (const st of ['claimable', 'taken', 'revealedParticipant', 'revealedTeaser', 'expired', 'removed', 'pending', 'prevMine']) assert.ok(seen.has(st), `state ${st} exercised: ${[...seen]}`);
  const nf = await h.call('getChain', { chainId: 'ZZZZZZZZZZ' }, { openid: A });
  assert.equal(nf.state, 'notFound');
});

test('claimStep returns the previous 棒 only to the new claimant, and only if passed (AC 11)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  await F.player(h, C);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const b = await F.claim(h, B, id, gref);
  assert.equal(b.prev.kind, 'draw');
  assert.ok(b.prev.strokes.s.length >= 1);
  const c = await F.claim(h, C, id, gref);
  assert.equal(c.code, 'TAKEN');
  assert.equal(c.prev, undefined);
  assert.ok(!JSON.stringify(c).includes('strokes'));
  // a pending previous 棒 is never returned
  const pend = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, pend.chainId, pend.claim.claimId, { strokes: F.strokes() });
  const r = await F.claim(h, B, pend.chainId, gref);
  assert.equal(r.code, 'PENDING');
  assert.equal(r.prev, undefined);
});

test('the chain state machine never leaves revealed, expired or removed (property test, AC 20)', async () => {
  const refs = {};
  for (const p of [A, B, C]) refs[p] = await F.player(h, p);
  let seed = 12345;
  const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };
  const ids = [];
  const claims = {};
  const TERMINAL = new Set(['revealed', 'expired', 'removed']);
  const prevState = {};
  const users = [A, B, C];
  for (let i = 0; i < 3; i++) ids.push(F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A }));
  for (let step = 0; step < 220; step++) {
    const id = ids[rnd(ids.length)];
    const who = users[rnd(3)];
    const op = rnd(9);
    if (op === 0) { const r = await F.claim(h, who, id, refs[who]); if (r.ok) claims[`${id}${who}`] = r.claimId; }
    else if (op === 1 && claims[`${id}${who}`]) { const ch = h.db.get('chains', id); const kind = ch.nextStep % 2 ? 'draw' : 'describe'; await F.submit(h, who, id, claims[`${id}${who}`], kind === 'draw' ? { strokes: F.strokes(2) } : { text: `随机猜测${step}` }); }
    else if (op === 2 && claims[`${id}${who}`]) await h.call('releaseClaim', { chainId: id, claimId: claims[`${id}${who}`] }, { openid: who });
    else if (op === 3) { h.advance(61000 + rnd(200000)); await h.call('modSweeper', {}); }
    else if (op === 4) await h.call('revealNow', { chainId: id }, { openid: who });
    else if (op === 5) await h.call('report', { chainId: id, step: 1 + rnd(5), reason: 'other' }, { openid: who });
    else if (op === 6 && rnd(8) === 0) await h.call('admin', { op: 'removeChain', chainId: id });
    else if (op === 7) h.advance(rnd(30) * 3600000);
    else if (op === 8) await h.call('deleteMyStep', { chainId: id, step: 1 + rnd(6) }, { openid: who });
    for (const cid of ids) {
      const st = h.db.get('chains', cid).state;
      const was = prevState[cid];
      if (was === 'removed') assert.equal(st, 'removed', `${cid}: removed -> ${st}`);
      else if (TERMINAL.has(was)) assert.ok([was, 'removed'].includes(st), `${cid}: ${was} -> ${st}`);
      prevState[cid] = st;
    }
  }
  assert.ok(Object.values(prevState).some((s) => TERMINAL.has(s)), 'the walk reached a terminal state');
});
