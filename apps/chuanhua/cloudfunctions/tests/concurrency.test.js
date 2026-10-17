'use strict';
// REAL concurrency (AC 9 and friends): the fake database runs optimistic transactions with first-committer-wins conflicts and
// every operation yields to the event loop, so Promise.all() calls truly interleave. These are the races the transaction
// design (one document per chain, deterministic ids, conditional state in the same transaction) has to survive.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

const P = 'chuanhua_';
const drawing = (k) => ({ v: 1, s: Array.from({ length: k || 2 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });
const ENV = { ENV_KIND: 'dev', MODERATION_MODE: 'mock' };

async function boot(nUsers) {
  const h = createHarness({ env: ENV });
  const quiet = console.error;
  console.error = () => {};
  const old = h.teardown;
  h.teardown = () => { console.error = quiet; old(); };
  const users = [];
  for (let i = 0; i < nUsers; i++) {
    const u = { openid: 'openid-U' + String(i).padStart(2, '0') };
    await h.call('agreeRules', { version: 2 }, u);
    u.ref = (await h.call('joinGroup', { cloudID: 'cid-3-group-1' }, u)).groupRef;
    users.push(u);
  }
  return { h, users };
}
async function openChain(h, starter) {
  const c = await h.call('createChain', { promptId: 'A01', groupRef: starter.ref }, starter);
  await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3) }, starter);
  h.advance(2 * 60e3);
  await h.call('modSweeper', {});
  return c.chainId;
}

test('AC 9: 50 simultaneous claimStep calls for one 棒: exactly one wins, 49 get TAKEN, the winner holds the claim (5 rounds)', async () => {
  const { h, users } = await boot(51);
  try {
    const starter = users[0];
    const rivals = users.slice(1);
    for (let round = 0; round < 5; round++) {
      const id = await openChain(h, starter);
      const rs = await Promise.all(rivals.map((u) => h.call('claimStep', { chainId: id, groupRef: u.ref }, u)));
      const won = rs.filter((r) => r.ok);
      const taken = rs.filter((r) => r.code === 'TAKEN');
      assert.equal(won.length, 1, `round ${round}: ${JSON.stringify(rs.map((r) => r.code || 'ok'))}`);
      assert.equal(taken.length, 49, `round ${round}: other outcomes ${JSON.stringify([...new Set(rs.map((r) => r.code || 'ok'))])}`);
      assert.ok(taken.every((r) => r.etaSec > 0 && r.prev === undefined && r.claimId === undefined), 'losers learn nothing');
      const winner = rivals[rs.findIndex((r) => r.ok)];
      const chain = h.db.get(P + 'chains', id);
      assert.equal(chain.claim.openid, winner.openid);
      assert.equal(chain.claim.claimId, won[0].claimId);
      // only the winner's daily claim counter moved
      const counted = rivals.filter((u) => ((h.db.get(P + 'players', u.openid).day.claims || {})[id] || 0) > 0);
      assert.deepEqual(counted.map((u) => u.openid), [winner.openid]);
      h.patchStarter = null;
      const p = h.db.get(P + 'players', starter.openid);
      p.day.starts = 0;
      p.day.steps = 0;
      h.db.put(P + 'players', p);
      h.advance(61e3);
    }
    assert.ok(h.db.stats.conflicts > 0, 'the fake really produced write conflicts that were retried');
  } finally { h.teardown(); }
});

test('the same race on an UNBOUND chain: the first claim with group context binds it, exactly one wins', async () => {
  const { h, users } = await boot(21);
  try {
    const starter = users[0];
    const c = await h.call('createChain', { promptId: 'A01' }, starter); // no group context
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, starter);
    h.advance(2 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(h.db.get(P + 'chains', c.chainId).openGId, null);
    const rs = await Promise.all(users.slice(1).map((u) => h.call('claimStep', { chainId: c.chainId, groupRef: u.ref }, u)));
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(rs.filter((r) => r.code === 'TAKEN').length, 19);
    assert.equal(h.db.get(P + 'chains', c.chainId).openGId, 'group-1');
  } finally { h.teardown(); }
});

test('double tap: two simultaneous submits of the same claim store ONE step and both return the same result (text and drawing)', async () => {
  const { h, users } = await boot(3);
  try {
    const [A, B] = users;
    const id = await openChain(h, A);
    const k = await h.call('claimStep', { chainId: id, groupRef: B.ref }, B);
    const sub = () => h.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' }, B);
    const rs = await Promise.all([sub(), sub(), sub()]);
    assert.ok(rs.every((r) => r.ok && r.state === 'passed' && r.step === 2), JSON.stringify(rs));
    assert.equal(h.db.all(P + 'steps').filter((s) => s.n === 2).length, 1);
    assert.equal(h.db.get(P + 'chains', id).passed, 2);
    assert.equal(h.db.get(P + 'players', B.openid).day.steps, 1, 'the allowance is consumed once');
    // a drawing
    const k3 = await h.call('claimStep', { chainId: id, groupRef: A.ref }, A);
    const draw = () => h.call('submitStep', { chainId: id, claimId: k3.claimId, strokes: drawing(3) }, A);
    const ds = await Promise.all([draw(), draw()]);
    assert.ok(ds.every((r) => r.ok && r.state === 'pending' && r.step === 3), JSON.stringify(ds));
    assert.equal(h.db.all(P + 'steps').filter((s) => s.n === 3).length, 1);
    assert.equal(h.db.get(P + 'players', A.openid).day.steps, 2, '棒 1 and 棒 3, each consumed once');
    assert.equal(h.db.get(P + 'players', A.openid).day.starts, 1, 'a start is counted once');
  } finally { h.teardown(); }
});

test('a claim racing 现在揭晓: either the reveal wins (claim: CHAIN_CLOSED) or the claim wins (reveal: TOO_EARLY busy), never both', async () => {
  const { h, users } = await boot(4);
  try {
    const [A, B, C] = users;
    const id = await openChain(h, A);
    let k = await h.call('claimStep', { chainId: id, groupRef: B.ref }, B);
    await h.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' }, B);
    k = await h.call('claimStep', { chainId: id, groupRef: C.ref }, C);
    await h.call('submitStep', { chainId: id, claimId: k.claimId, strokes: drawing(3) }, C);
    h.advance(2 * 60e3);
    await h.call('modSweeper', {});
    k = await h.call('claimStep', { chainId: id, groupRef: B.ref }, B);
    await h.call('submitStep', { chainId: id, claimId: k.claimId, text: '外星人在吃披萨' }, B); // 4 passed
    let revealWins = 0;
    let claimWins = 0;
    for (let i = 0; i < 1; i++) {
      const [rev, cl] = await Promise.all([h.call('revealNow', { chainId: id }, A), h.call('claimStep', { chainId: id, groupRef: C.ref }, C)]);
      const chain = h.db.get(P + 'chains', id);
      if (rev.ok) {
        revealWins++;
        assert.equal(cl.code, 'CHAIN_CLOSED');
        assert.equal(chain.state, 'revealed');
        assert.equal(chain.claim, null);
      } else {
        claimWins++;
        assert.deepEqual([rev.code, rev.busy], ['TOO_EARLY', true]);
        assert.equal(cl.ok, true);
        assert.equal(chain.state, 'open');
      }
    }
    assert.equal(revealWins + claimWins, 1);
  } finally { h.teardown(); }
});

test('two reports of one 棒 at once: both recorded, the 棒 hides and reopens exactly once; the chain stays consistent', async () => {
  const { h, users } = await boot(5);
  try {
    const [A, B, C, D] = users;
    const id = await openChain(h, A);
    let k = await h.call('claimStep', { chainId: id, groupRef: B.ref }, B);
    await h.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' }, B);
    k = await h.call('claimStep', { chainId: id, groupRef: C.ref }, C);
    // C holds the claim on 棒 3 and may report 棒 2; D (not holding anything) may not, the author B cannot report their own
    const rs = await Promise.all([
      h.call('report', { chainId: id, step: 2, reason: 'abuse' }, C),
      h.call('report', { chainId: id, step: 2, reason: 'abuse' }, C),
      h.call('report', { chainId: id, step: 2, reason: 'ad' }, D),
      h.call('report', { chainId: id, step: 2, reason: 'ad' }, B),
    ]);
    const okC = rs.slice(0, 2).filter((r) => r.ok);
    assert.equal(okC.length, 1, JSON.stringify(rs.slice(0, 2).map((r) => r.code || 'ok')));
    assert.ok(['DUP_REPORT', 'BAD_REQUEST'].includes(rs.slice(0, 2).find((r) => !r.ok).code));
    assert.equal(rs[2].code === 'NOT_PARTICIPANT' || rs[2].code === 'BAD_REQUEST', true);
    assert.ok(['OWN_STEP', 'BAD_REQUEST', 'NOT_PARTICIPANT'].includes(rs[3].code));
    const chain = h.db.get(P + 'chains', id);
    assert.deepEqual([chain.passed, chain.nextStep, chain.claim, chain.perPersonCount[B.openid]], [1, 2, null, 0]);
    assert.equal(h.db.get(P + 'steps', id + '_2_1').state, 'hidden');
    assert.equal(h.db.get(P + 'players', C.openid).day.reports, 1, 'the reporter is charged once');
  } finally { h.teardown(); }
});

test('the same verdict pushed 10 times at once is applied once: one pass, one streak day, one strike for a risky one', async () => {
  const { h, users } = await boot(2);
  try {
    const [A] = users;
    const mk = async (strokes) => {
      const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
      await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes }, A);
      const p = h.db.get(P + 'players', A.openid);
      p.day.starts = 0;
      h.db.put(P + 'players', p);
      return { id: c.chainId, trace: h.db.get(P + 'steps', c.chainId + '_1_1').mod.traceIds[0] };
    };
    const good = await mk(drawing(3));
    await Promise.all(Array.from({ length: 10 }, () => h.call('onMediaCheck', { trace_id: good.trace, result: { suggest: 'pass' } })));
    assert.equal(h.db.get(P + 'chains', good.id).passed, 1);
    assert.equal(h.db.get(P + 'players', A.openid).curStreak, 1);
    assert.equal(h.db.get(P + 'group_stats', 'group-1').drawings, 1);
    const risky = await mk(drawing(13));
    await Promise.all(Array.from({ length: 10 }, () => h.call('onMediaCheck', { trace_id: risky.trace, result: { suggest: 'risky' } })));
    assert.equal(h.db.get(P + 'players', A.openid).strikes.length, 1);
    assert.equal(h.db.get(P + 'steps', risky.id + '_1_1').state, 'blocked');
    assert.equal(h.db.all(P + 'mod_log').filter((m) => m.stepId === risky.id + '_1_1').length, 1, 'one evidence entry');
  } finally { h.teardown(); }
});

test('overlapping modSweeper runs: an expired chain reveals once, a reveal notice is sent once, a pending step voids once', async () => {
  const { h, users } = await boot(4);
  try {
    const [A, B, C] = users;
    h.db.put(P + 'app_config', { _id: 'live', subscribe: { tmplId: 'TPL-1' } });
    const id = await openChain(h, A);
    let k = await h.call('claimStep', { chainId: id, groupRef: B.ref }, B);
    await h.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' }, B);
    k = await h.call('claimStep', { chainId: id, groupRef: C.ref }, C);
    await h.call('submitStep', { chainId: id, claimId: k.claimId, strokes: drawing(3) }, C);
    h.advance(2 * 60e3);
    await h.call('modSweeper', {});
    k = await h.call('claimStep', { chainId: id, groupRef: B.ref }, B);
    await h.call('submitStep', { chainId: id, claimId: k.claimId, text: '外星人在吃披萨' }, B);
    await h.call('subscribeReveal', { chainId: id }, B);
    await h.call('subscribeReveal', { chainId: id }, C);
    // a 15-stroke drawing that never gets a verdict, on another chain
    const c2 = await h.call('createChain', { promptId: 'A02', groupRef: A.ref }, A);
    await h.call('submitStep', { chainId: c2.chainId, claimId: c2.claim.claimId, strokes: drawing(15) }, A);
    h.advance(49 * 3600e3);
    const rs = await Promise.all([h.call('modSweeper', {}), h.call('modSweeper', {}), h.call('modSweeper', {})]);
    assert.ok(rs.every((r) => r.ok), JSON.stringify(rs));
    assert.equal(h.db.get(P + 'chains', id).state, 'revealed');
    assert.equal(h.db.get(P + 'group_stats', 'group-1').revealed >= 1, true);
    h.advance(3600e3);
    await Promise.all([h.call('modSweeper', {}), h.call('modSweeper', {})]);
    await h.call('modSweeper', {});
    const sent = h.calls.filter((c) => c.api === 'subscribeMessage.send');
    // the reveal happened at ~12:00 + 49h = 13:00 BJT (not quiet hours): one message per grant, never more
    assert.deepEqual(sent.map((s) => s.params.touser).sort(), ['openid-U01', 'openid-U02']);
    assert.equal(h.db.all(P + 'daily_stats').reduce((n, d) => n + d.revealed, 0), 1, 'the reveal is counted once');
    // the never-answered drawing: voided exactly once, the start given back once
    assert.equal(h.db.get(P + 'steps', c2.chainId + '_1_1').state, 'void');
    assert.equal(h.db.all(P + 'mod_log').filter((m) => m.stepId === c2.chainId + '_1_1' && m.suggest === 'void').length, 1);
  } finally { h.teardown(); }
});

test('笑 toggles from many participants at once keep the count equal to the number of reactions', async () => {
  const { h, users } = await boot(4);
  try {
    const [A, B, C] = users;
    const id = await openChain(h, A);
    const step = async (u, ev) => { const k = await h.call('claimStep', { chainId: id, groupRef: u.ref }, u); return h.call('submitStep', Object.assign({ chainId: id, claimId: k.claimId }, ev), u); };
    await step(B, { text: '一个大饼在天上' });
    await step(C, { strokes: drawing(3) });
    h.advance(2 * 60e3);
    await h.call('modSweeper', {});
    await step(B, { text: '外星人在吃披萨' });
    assert.equal((await h.call('revealNow', { chainId: id }, A)).ok, true);
    await Promise.all([A, B, C].flatMap((u) => [h.call('laugh', { chainId: id, step: 2 }, u)]));
    assert.equal(h.db.get(P + 'steps', id + '_2_1').laughs, 3);
    await Promise.all([A, B, C].map((u) => h.call('laugh', { chainId: id, step: 2 }, u)));
    assert.equal(h.db.get(P + 'steps', id + '_2_1').laughs, 0);
    assert.equal(h.db.all(P + 'reactions').length, 0);
  } finally { h.teardown(); }
});
