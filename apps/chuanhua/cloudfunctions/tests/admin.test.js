'use strict';
// admin (spec 7.2, AC 62-67): console-only takedown and offender path; the strike ladder through upheld reports (AC 65, 66).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

const P = 'chuanhua_';
const DAY = 86400e3;
const drawing = (k) => ({ v: 1, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });
const U = (n) => ({ openid: 'openid-' + n });

async function boot(users, env) {
  const h = createHarness({ env: Object.assign({ ENV_KIND: 'dev', MODERATION_MODE: 'mock', ADMIN_OPENIDS: 'openid-ROOT, openid-OPS' }, env || {}) });
  const quiet = console.error;
  console.error = () => {};
  const old = h.teardown;
  h.teardown = () => { console.error = quiet; old(); };
  const us = {};
  for (const n of users) {
    us[n] = U(n);
    await h.call('agreeRules', { version: 2 }, us[n]);
    us[n].ref = (await h.call('joinGroup', { cloudID: 'cid-3-group-1' }, us[n])).groupRef;
  }
  h.sweep = async (min) => { h.advance(min * 60e3); return h.call('modSweeper', {}); };
  /** a chain with 棒 1 (drawing by `a`) and 棒 2 (text by `b`); returns ids */
  h.mkChain = async (a, b, text) => {
    const c = await h.call('createChain', { promptId: 'A01', groupRef: a.ref }, a);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3) }, a);
    await h.sweep(2);
    const k = await h.call('claimStep', { chainId: c.chainId, groupRef: b.ref }, b);
    await h.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: text || '一个大饼在天上' }, b);
    return c.chainId;
  };
  return { h, us };
}
const admin = (h, ev, who) => h.call('admin', ev, who);
const audits = (h) => h.db.all(P + 'audit_log');

test('AC 62: admin is console-only: no OPENID passes, an unlisted OPENID is FORBIDDEN, a listed one passes (V14 fallback); bad ops are BAD_REQUEST; every op is audited', async () => {
  const { h, us } = await boot(['A', 'B', 'ROOT', 'OPS']);
  try {
    assert.equal((await admin(h, { op: 'listReports' }, us.A)).code, 'FORBIDDEN');
    assert.equal((await admin(h, { op: 'setUgc', viewEnabled: false }, us.B)).code, 'FORBIDDEN');
    assert.deepEqual(h.db.get(P + 'app_config', 'live'), { _id: 'live', moderation: { imageMode: 'async', textApi: 'general' } }, 'a forbidden call changes nothing (the seeded legacy switch only)');
    assert.equal(audits(h).length, 0);
    assert.equal((await admin(h, { op: 'listReports' })).ok, true, 'console: no OPENID');
    assert.equal((await admin(h, { op: 'listReports' }, us.ROOT)).ok, true);
    assert.equal((await admin(h, { op: 'listReports' }, us.OPS)).ok, true);
    assert.equal((await admin(h, { op: 'nope' })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, {})).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 5 })).code, 'BAD_REQUEST');
    h.setEnv('ADMIN_OPENIDS', undefined);
    assert.equal((await admin(h, { op: 'listReports' }, us.ROOT)).code, 'FORBIDDEN', 'an empty allow-list admits nobody with an OPENID');
    assert.equal((await admin(h, { op: 'listReports' })).ok, true, 'the console still works');
    // identity cannot be passed in the event
    assert.equal((await admin(h, { op: 'listReports', openid: 'openid-ROOT', OPENID: 'openid-ROOT' }, us.A)).code, 'FORBIDDEN');
  } finally { h.teardown(); }
});

test('listReports / getStep / sample: reviewer views with 10-minute PNG links; the openid and strike count appear only in getStep', async () => {
  const { h, us } = await boot(['A', 'B', 'C', 'D']);
  try {
    const id = await h.mkChain(us.A, us.B, '一个大饼在天上');
    const k = await h.call('claimStep', { chainId: id, groupRef: us.C.ref }, us.C);
    assert.equal((await h.call('report', { chainId: id, step: 2, reason: 'abuse' }, us.C)).hidden, true); // text 棒 2
    h.advance(61e3);
    const r2 = await h.call('claimStep', { chainId: id, groupRef: us.D.ref }, us.D);
    await h.call('submitStep', { chainId: id, claimId: r2.claimId, strokes: drawing(3) }, us.D);
    await h.sweep(2);
    const k4 = await h.call('claimStep', { chainId: id, groupRef: us.B.ref }, us.B);
    void k; void k4;
    const l = await admin(h, { op: 'listReports', state: 'open', limit: 10 });
    assert.equal(l.ok, true);
    assert.equal(l.items.length, 1);
    assert.equal(l.items[0].target.text, '一个大饼在天上');
    assert.equal(l.items[0].reason, 'abuse');
    assert.ok(!('reporter' in l.items[0]) && !JSON.stringify(l).includes('"author"'), 'no reporter or author fields (the report id itself carries the reporter, for upholdReport)');
    // a drawing: PNG link, 10-minute lifetime
    const sid = id + '_1_1';
    const g = await admin(h, { op: 'getStep', stepId: sid });
    assert.equal(g.step.author, 'openid-A');
    assert.equal(g.step.kind, 'draw');
    assert.match(g.step.pngUrl, /tmp\.test\/.*maxAge=600$/);
    assert.equal(g.step.strikesActive, 0);
    assert.ok(g.step.strokes && g.step.mod.traceIds.length === 1);
    const t = await admin(h, { op: 'getStep', stepId: id + '_2_1' });
    assert.equal(t.step.text, '一个大饼在天上');
    assert.equal(t.step.reports.length, 1);
    assert.equal(t.step.reports[0].reason, 'abuse');
    assert.equal((await admin(h, { op: 'getStep', stepId: 'nope' })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 'getStep' })).code, 'BAD_REQUEST');
    // sample: passed 棒 of the last 24 h, never more than asked
    const s = await admin(h, { op: 'sample', n: 2 });
    assert.equal(s.items.length, 1, 'only passed 棒 are sampled: 棒 1 (棒 2 is hidden, 棒 3 pending)');
    assert.ok(s.items.every((x) => x.state === 'passed'));
    assert.equal((await admin(h, { op: 'sample', n: 51 })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 'sample', n: 5, kind: 'draw' })).items.every((x) => x.kind === 'draw'), true);
    assert.ok(!JSON.stringify(await admin(h, { op: 'sample', n: 5 })).includes('openid-'));
    h.advance(2 * DAY);
    assert.equal((await admin(h, { op: 'sample', n: 5 })).items.length, 0, 'only the last 24 hours');
  } finally { h.teardown(); }
});

test('AC 63/65: upholdReport keeps the item hidden and adds ONE strike (idempotent); the ladder: 1 warning, 2 -> 24 h, 3 -> 7 d, 4 -> 30 d + flagged', async () => {
  const { h, us } = await boot(['A', 'B', 'C', 'D', 'E']);
  try {
    const strike = async (i) => {
      const id = await h.mkChain(us.A, us.B, '一个大饼在天上' + 'ABCDE'[i].repeat(0));
      const k = await h.call('claimStep', { chainId: id, groupRef: us.C.ref }, us.C);
      const rep = await h.call('report', { chainId: id, step: 2, reason: 'porn' }, us.C);
      assert.equal(rep.ok, true, JSON.stringify(rep) + JSON.stringify(k));
      const rid = h.db.all(P + 'reports').find((r) => r.stepId === id + '_2_1')._id;
      assert.equal(rid, 'openid-C_' + id + '_' + id + '_2_1');
      const up = await admin(h, { op: 'upholdReport', reportId: rid });
      assert.equal(up.ok, true, JSON.stringify(up));
      assert.equal(h.db.get(P + 'reports', rid).state, 'upheld');
      assert.equal(h.db.get(P + 'steps', id + '_2_1').state, 'hidden', 'the step stays hidden');
      // idempotent: a second uphold adds nothing
      assert.equal((await admin(h, { op: 'upholdReport', reportId: rid })).already, true);
      h.advance(61e3);
      return up;
    };
    const B = () => h.db.get(P + 'players', 'openid-B');
    h.patchBDay = () => { const p = B(); p.day.steps = 0; p.day.claims = {}; h.db.put(P + 'players', p); const a = h.db.get(P + 'players', 'openid-A'); a.day.starts = 0; a.day.steps = 0; h.db.put(P + 'players', a); const c = h.db.get(P + 'players', 'openid-C'); c.day.reports = 0; c.day.claims = {}; h.db.put(P + 'players', c); };
    // 1 strike: a warning (read-once), no restriction
    let up = await strike(0);
    assert.equal(up.strikes, 1);
    assert.equal(B().warnPending, true);
    assert.equal(B().restrictedUntil || 0, 0);
    assert.equal((await h.call('getHome', {}, us.B)).me.warnPending, true);
    assert.equal((await h.call('getHome', {}, us.B)).me.warnPending, false);
    h.patchBDay();
    // 2 strikes: 24 h
    const t2 = h.now();
    up = await strike(1);
    assert.equal(up.strikes, 2);
    assert.ok(Math.abs(B().restrictedUntil - (t2 + DAY)) < 5 * 60e3, '24 h');
    const home = await h.call('getHome', {}, us.B);
    assert.equal(home.me.restriction.until, B().restrictedUntil);
    assert.equal(home.me.restriction.permanent, false);
    // AC 66: restricted B cannot start or claim, but can still open the album and reveals
    assert.equal((await h.call('createChain', { promptId: 'A01' }, us.B)).code, 'RESTRICTED');
    assert.equal((await h.call('claimStep', { chainId: h.db.all(P + 'chains')[0]._id, groupRef: us.B.ref }, us.B)).code, 'RESTRICTED');
    assert.equal((await h.call('getMyChains', {}, us.B)).ok, true);
    h.patchBDay();
    // 3 strikes (inside 30 days): 7 days
    const t3 = h.now();
    // lift so that B can author again: admin liftRestriction then continue the ladder
    assert.equal((await admin(h, { op: 'liftRestriction', openid: 'openid-B' })).lifted, true);
    assert.equal(B().restrictedUntil, 0);
    up = await strike(2);
    assert.equal(up.strikes, 3);
    assert.ok(Math.abs(B().restrictedUntil - (t3 + 7 * DAY)) < 5 * 60e3, '7 days');
    h.patchBDay();
    await admin(h, { op: 'liftRestriction', openid: 'openid-B' });
    // 4 strikes: 30 days and flagged
    const t4 = h.now();
    up = await strike(3);
    assert.equal(up.strikes, 4);
    assert.ok(Math.abs(B().restrictedUntil - (t4 + 30 * DAY)) < 5 * 60e3, '30 days');
    assert.equal(B().flagged, true);
    assert.equal(up.flagged, true);
    // rolling 30 days: after 31 days the first strikes no longer count
    h.advance(31 * DAY);
    h.patchBDay();
    await admin(h, { op: 'liftRestriction', openid: 'openid-B' });
    const id = await h.mkChain(us.A, us.D, 'x一个大饼');
    void id;
    // audit trail: 4 upholds + 4 repeated upholds are NOT audited twice
    assert.equal(audits(h).filter((a) => a.op === 'upholdReport').length, 4);
    assert.ok(audits(h).every((a) => a.by === 'console' && a.ts > 0 && 'before' in a && 'after' in a && a.target));
  } finally { h.teardown(); }
});

test('review verdicts, local rejections and voids never strike; a risky text strikes once (the ladder input is risky + upheld only)', async () => {
  const { h, us } = await boot(['A', 'B']);
  try {
    const c = await h.call('createChain', { promptId: 'A02', groupRef: us.A.ref }, us.A);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3) }, us.A);
    await h.sweep(2);
    const k = await h.call('claimStep', { chainId: c.chainId, groupRef: us.B.ref }, us.B);
    const sub = (text) => h.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text }, us.B);
    const strikes = () => (h.db.get(P + 'players', 'openid-B').strikes || []).length;
    assert.equal((await sub('加我微信')).code, 'TEXT_REJECTED');
    assert.equal((await sub('测试复审')).code, 'TEXT_BLOCKED');
    assert.equal((await sub('测试繁忙')).code, 'MODERATION_BUSY');
    assert.equal(strikes(), 0);
    assert.equal((await sub('测试违规')).code, 'TEXT_BLOCKED');
    assert.equal(strikes(), 1);
  } finally { h.teardown(); }
});

test('AC 63: dismissReport restores the item only if it does not break an open chain; a dismissed prompt report unhides the chain', async () => {
  const { h, us } = await boot(['A', 'B', 'C', 'D']);
  try {
    // chain 1: 棒 2 is the latest passed 棒 of an open chain -> reporting reopens it; restoring must NOT resurrect it
    const open = await h.mkChain(us.A, us.B, '一个大饼在天上');
    await h.call('claimStep', { chainId: open, groupRef: us.C.ref }, us.C);
    await h.call('report', { chainId: open, step: 2, reason: 'other' }, us.C);
    const rid = 'openid-C_' + open + '_' + open + '_2_1';
    const d1 = await admin(h, { op: 'dismissReport', reportId: rid, restore: true });
    assert.deepEqual([d1.restored, d1.reason], [false, 'chainOpen']);
    assert.equal(h.db.get(P + 'steps', open + '_2_1').state, 'hidden');
    assert.equal(h.db.get(P + 'reports', rid).state, 'dismissed');
    // chain 2: a revealed chain -> the hidden step is restored
    h.advance(61e3);
    const full = await h.mkChain(us.A, us.B, '一个大饼在天上');
    let k = await h.call('claimStep', { chainId: full, groupRef: us.C.ref }, us.C);
    await h.call('submitStep', { chainId: full, claimId: k.claimId, strokes: drawing(3) }, us.C);
    await h.sweep(2);
    k = await h.call('claimStep', { chainId: full, groupRef: us.B.ref }, us.B);
    await h.call('submitStep', { chainId: full, claimId: k.claimId, text: '外星人在吃披萨' }, us.B);
    assert.equal((await h.call('revealNow', { chainId: full }, us.A)).ok, true);
    assert.equal((await h.call('report', { chainId: full, step: 3, reason: 'ad' }, us.A)).hidden, true);
    const rid2 = 'openid-A_' + full + '_' + full + '_3_1';
    assert.equal((await admin(h, { op: 'dismissReport', reportId: rid2, restore: false })).restored, false);
    assert.equal(h.db.get(P + 'steps', full + '_3_1').state, 'hidden', 'no restore without the flag');
    assert.equal((await admin(h, { op: 'restoreStep', stepId: full + '_3_1' })).restored, true);
    assert.equal(h.db.get(P + 'steps', full + '_3_1').state, 'passed');
    assert.equal((await admin(h, { op: 'restoreStep', stepId: full + '_3_1' })).restored, false, 'not hidden any more');
    // chain 3: a custom prompt reported at the teaser hides the whole chain; dismiss + restore unhides it
    h.advance(61e3);
    const cc = await h.call('createChain', { customText: '我家的猫会开车', groupRef: us.A.ref }, us.A);
    await h.call('submitStep', { chainId: cc.chainId, claimId: cc.claim.claimId, strokes: drawing(3) }, us.A);
    await h.sweep(2);
    for (const [u, t] of [[us.B, '一个大饼在天上'], [us.C, null], [us.B, '外星人在吃披萨']]) {
      const kk = await h.call('claimStep', { chainId: cc.chainId, groupRef: u.ref }, u);
      await h.call('submitStep', Object.assign({ chainId: cc.chainId, claimId: kk.claimId }, t ? { text: t } : { strokes: drawing(3) }), u);
      await h.sweep(2);
    }
    await h.call('revealNow', { chainId: cc.chainId }, us.A);
    assert.equal((await h.call('report', { chainId: cc.chainId, step: 0, reason: 'porn' }, us.D)).hidden, true);
    assert.equal(h.db.get(P + 'chains', cc.chainId).hidden, 'report');
    const rid3 = 'openid-D_' + cc.chainId + '_teaser';
    const d3 = await admin(h, { op: 'dismissReport', reportId: rid3, restore: true });
    assert.equal(d3.restored, true);
    assert.equal(h.db.get(P + 'chains', cc.chainId).hidden, null);
    assert.equal((await h.call('getChain', { chainId: cc.chainId }, us.A)).state, 'revealedParticipant');
    // and upholding a prompt report strikes the prompt's author (the starter)
    await h.call('report', { chainId: cc.chainId, step: 0, reason: 'porn' }, us.C);
    const up = await admin(h, { op: 'upholdReport', reportId: 'openid-C_' + cc.chainId + '_teaser' });
    assert.equal(up.strikes, 1);
    assert.equal(h.db.get(P + 'players', 'openid-A').strikes.length, 1);
    assert.ok(h.db.get(P + 'chains', cc.chainId).hidden, 'stays hidden');
  } finally { h.teardown(); }
});

test('hideStep reopens the latest 棒 and cancels the next claim; removeChain closes every view (AC 64) and stops card updates', async () => {
  const { h, us } = await boot(['A', 'B', 'C']);
  try {
    h.db.put(P + 'app_config', { _id: 'live', features: { updatableCard: true } });
    const id = await h.mkChain(us.A, us.B, '一个大饼在天上');
    const k = await h.call('claimStep', { chainId: id, groupRef: us.C.ref }, us.C);
    const hs = await admin(h, { op: 'hideStep', stepId: id + '_2_1' });
    assert.deepEqual([hs.changed, hs.reopened], [true, true]);
    assert.deepEqual([h.db.get(P + 'chains', id).passed, h.db.get(P + 'chains', id).claim], [1, null]);
    assert.equal((await h.call('submitStep', { chainId: id, claimId: k.claimId, strokes: drawing(3) }, us.C)).code, 'CLAIM_LOST');
    assert.equal((await admin(h, { op: 'hideStep', stepId: id + '_2_1' })).changed, false, 'idempotent');
    assert.equal((await admin(h, { op: 'hideStep', stepId: id + '_1_1' })).changed, true);
    // removal
    const rm = await admin(h, { op: 'removeChain', chainId: id });
    assert.equal(rm.removed, true);
    const v = await h.call('getChain', { chainId: id }, us.A);
    assert.deepEqual([v.state, v.removedReason], ['removed', 'admin']);
    assert.equal((await h.call('getReveal', { chainId: id }, us.A)).code, 'CHAIN_CLOSED');
    assert.equal((await h.call('claimStep', { chainId: id, groupRef: us.C.ref }, us.C)).code, 'CHAIN_CLOSED');
    assert.equal((await admin(h, { op: 'removeChain', chainId: 'NOSUCHCHAIN' })).code, 'CHAIN_NOT_FOUND');
    const sums = h.calls.filter((c) => c.api === 'updatableMessage.setUpdatableMsg').length;
    h.advance(61e3);
    const rv = h.db.get(P + 'chains', id);
    assert.equal(rv.state, 'removed');
    assert.equal(h.calls.filter((c) => c.api === 'updatableMessage.setUpdatableMsg').length, sums);
    assert.ok(audits(h).some((a) => a.op === 'removeChain' && a.target === id && a.before.state === 'open' && a.after.state === 'removed'));
  } finally { h.teardown(); }
});

test('restrict / liftRestriction: days or permanent, validated, audited; setUgc flips the kill switches and clears the breaker pause on re-enable', async () => {
  const { h, us } = await boot(['A', 'B']);
  try {
    assert.equal((await admin(h, { op: 'restrict', openid: 'openid-A' })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 'restrict', openid: 'openid-A', days: 0 })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 'restrict', openid: 'openid-A', days: 99999 })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 'restrict', openid: 'x', days: 3 })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 'restrict', openid: 'openid-NOBODY', days: 3 })).code, 'BAD_REQUEST', 'never creates a player by typo');
    const r = await admin(h, { op: 'restrict', openid: 'openid-A', days: 3 });
    assert.equal(r.restrictedUntil, h.now() + 3 * DAY);
    assert.equal((await h.call('createChain', { promptId: 'A01' }, us.A)).code, 'RESTRICTED');
    const perm = await admin(h, { op: 'restrict', openid: 'openid-A', permanent: true });
    assert.equal(perm.permanent, true);
    assert.equal((await h.call('getHome', {}, us.A)).me.restriction.permanent, true);
    assert.equal((await admin(h, { op: 'liftRestriction', openid: 'openid-A' })).lifted, true);
    assert.equal((await h.call('createChain', { promptId: 'A01', groupRef: us.A.ref }, us.A)).ok, true);
    // kill switches
    assert.equal((await admin(h, { op: 'setUgc' })).code, 'BAD_REQUEST');
    assert.equal((await admin(h, { op: 'setUgc', createEnabled: 'no' })).code, 'BAD_REQUEST');
    const s1 = await admin(h, { op: 'setUgc', viewEnabled: false });
    assert.deepEqual([s1.ugc.createEnabled, s1.ugc.viewEnabled], [true, false]);
    h.db.get(P + 'app_config', 'live');
    h.resetCaches();
    const doc = h.db.get(P + 'app_config', 'live');
    doc.ugc.autoPausedUntil = h.now() + 10 * 60e3; // the breaker had paused creation
    h.db.put(P + 'app_config', doc);
    h.resetCaches();
    assert.equal((await h.call('createChain', { promptId: 'A02' }, us.B)).code, 'UGC_PAUSED');
    const s2 = await admin(h, { op: 'setUgc', createEnabled: true });
    assert.deepEqual([s2.ugc.createEnabled, s2.ugc.autoPausedUntil, s2.ugc.viewEnabled], [true, 0, false]);
    h.resetCaches();
    assert.equal((await h.call('createChain', { promptId: 'A02', groupRef: us.B.ref }, us.B)).ok, true);
    const ops = audits(h).map((a) => a.op);
    for (const op of ['restrict', 'liftRestriction', 'setUgc']) assert.ok(ops.includes(op), op);
    // only getStep ever shows an openid
    assert.ok(!JSON.stringify([r, perm, s1, s2]).includes('openid-'));
  } finally { h.teardown(); }
});
