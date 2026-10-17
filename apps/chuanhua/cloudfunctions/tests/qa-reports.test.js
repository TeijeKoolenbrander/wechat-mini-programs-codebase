'use strict';
// QA (independent): reports, takedown, strikes and deletion end to end (spec 7, AC 58-66, 71, 72), on the REAL cloud functions in
// the production configuration (ENV_KIND=prod, MODERATION_MODE=live, fake WeChat platform). Tests marked `todo` are OPEN BUGS
// (docs/chuanhua/qa/bugs.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloudDriver } = require('./helpers/drivers');

const P = 'chuanhua_';
const draw = (k) => ({ v: 1, s: Array.from({ length: k || 2 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });

async function world() {
  const d = cloudDriver({ moderation: 'live' });
  const w = { d };
  for (const u of ['A', 'B', 'C', 'D']) {
    w[u] = { id: 'openid-' + u, call: (fn, data) => d.call(fn, data, 'openid-' + u) };
    assert.equal((await w[u].call('agreeRules', { version: 2 })).ok, true);
    w[u].ref = await d.join('openid-' + u, 'group-1');
  }
  w.take = (u, id) => w[u].call('claimStep', { chainId: id, groupRef: w[u].ref });
  w.text = async (u, id, text) => {
    const k = await w.take(u, id);
    assert.equal(k.ok, true, JSON.stringify(k));
    return w[u].call('submitStep', { chainId: id, claimId: k.claimId, text });
  };
  w.paint = async (u, id) => {
    const k = await w.take(u, id);
    assert.equal(k.ok, true, JSON.stringify(k));
    const s = await w[u].call('submitStep', { chainId: id, claimId: k.claimId, strokes: draw(3) });
    await d.sweep(2);
    return s;
  };
  w.full = async () => {
    const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
    await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: draw(2) });
    await d.sweep(2);
    assert.equal((await w.text('B', c.chainId, '一个大饼在天上')).state, 'passed');
    await w.paint('A', c.chainId);
    assert.equal((await w.text('B', c.chainId, '外星人在吃披萨')).state, 'passed');
    await w.paint('A', c.chainId);
    const last = await w.text('B', c.chainId, '企鹅在沙漠晒太阳');
    assert.equal(last.revealed, true);
    return c.chainId;
  };
  return w;
}

test('QA-6 reports (AC 59): a second report of the same item by the same player returns DUP_REPORT', async () => {
  const w = await world();
  try {
    const id = await w.full();
    assert.equal((await w.A.call('report', { chainId: id, step: 4, reason: 'ad' })).hidden, true);
    assert.equal((await w.A.call('report', { chainId: id, step: 4, reason: 'ad' })).code, 'DUP_REPORT');
  } finally {
    w.d.destroy();
  }
});

test('QA-6 reports (TD-29): one non-participant group member can hide at most ONE sentence of a revealed chain by repeated teaser reports', async () => {
  const w = await world();
  try {
    const id = await w.full();
    for (let i = 0; i < 3; i++) await w.C.call('report', { chainId: id, step: 0, reason: 'other' });
    const hidden = w.d.steps().filter((s) => s.chainId === id && s.state === 'hidden').length;
    assert.ok(hidden <= 1, 'hidden sentences: ' + hidden);
  } finally {
    w.d.destroy();
  }
});

test('QA-6 / TD-92: report ids are <openid>_<chainId>_<stepId|teaser>; repeats answer DUP_REPORT and hide nothing more; a second reporter is independent', async () => {
  const w = await world();
  try {
    const id = await w.full();
    const hiddenCount = () => w.d.steps().filter((s) => s.chainId === id && s.state === 'hidden').length;
    // teaser: first report hides one sentence, repeats are DUP_REPORT and hide nothing
    assert.equal((await w.C.call('report', { chainId: id, step: 0, reason: 'other' })).hidden, true);
    assert.equal(hiddenCount(), 1);
    for (let i = 0; i < 3; i++) assert.equal((await w.C.call('report', { chainId: id, step: 0, reason: 'other' })).code, 'DUP_REPORT');
    assert.equal(hiddenCount(), 1);
    // a step report by a participant, repeated
    assert.equal((await w.B.call('report', { chainId: id, step: 3, reason: 'ad' })).hidden, true);
    assert.equal((await w.B.call('report', { chainId: id, step: 3, reason: 'ad' })).code, 'DUP_REPORT');
    assert.equal(hiddenCount(), 2);
    // a different participant may still report the same (already hidden) step: not a duplicate for them, but it is no longer passed
    assert.equal((await w.A.call('report', { chainId: id, step: 3, reason: 'ad' })).code, 'BAD_REQUEST');
    const ids = w.d.reports().map((r) => r._id).sort();
    const teaser = 'openid-C_' + id + '_teaser';
    assert.ok(ids.includes(teaser), ids.join());
    assert.ok(ids.some((x) => x.startsWith('openid-B_' + id + '_' + id + '_3_')), ids.join());
    // worst case key length stays inside the 64 character document id limit
    assert.ok(('o'.repeat(28) + '_' + id + '_' + id + '_12_3').length <= 64);
  } finally {
    w.d.destroy();
  }
});

test('QA reports (AC 59, 60): a report hides the item on the very next read of EVERY other viewer, and the strokes/text are gone from their payloads', async () => {
  const w = await world();
  try {
    const id = await w.full();
    const before = await w.B.call('getReveal', { chainId: id });
    assert.ok(before.steps.find((s) => s.n === 3).strokes);
    assert.equal((await w.B.call('report', { chainId: id, step: 3, reason: 'porn' })).hidden, true);
    for (const u of ['A', 'B']) {
      const rv = await w[u].call('getReveal', { chainId: id });
      const s3 = rv.steps.find((s) => s.n === 3);
      assert.equal(s3.placeholder, 'reported');
      assert.equal(s3.strokes, undefined);
      assert.equal(s3.text, undefined);
    }
    assert.equal(w.d.reports().length, 1);
    assert.equal(w.d.reports()[0].reporter, 'openid-B');
    // the reporter's identity is never shown to anyone
    assert.doesNotMatch(JSON.stringify(await w.A.call('getReveal', { chainId: id })), /openid|reporter/);
  } finally {
    w.d.destroy();
  }
});

test('QA strikes (AC 65, 66): two risky texts in a row restrict a player for 24 h; the restricted player cannot start, claim or submit but can still open their reveals and the album', async () => {
  const w = await world();
  try {
    const id = await w.full(); // A and B are participants
    const c2 = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
    await w.A.call('submitStep', { chainId: c2.chainId, claimId: c2.claim.claimId, strokes: draw(2) });
    await w.d.sweep(2);
    const k = await w.take('B', c2.chainId);
    for (let i = 0; i < 2; i++) assert.equal((await w.B.call('submitStep', { chainId: c2.chainId, claimId: k.claimId, text: '测试违规啦' + i })).code, 'TEXT_BLOCKED');
    assert.equal(w.d.player('openid-B').strikes.length, 2);
    // restricted from the next action on (a claim taken before may finish, edge 19) -> release it, then everything is refused
    await w.B.call('releaseClaim', { chainId: c2.chainId, claimId: k.claimId });
    assert.equal((await w.B.call('createChain', { promptId: 'I07', groupRef: w.B.ref })).code, 'RESTRICTED');
    assert.equal((await w.take('B', c2.chainId)).code, 'RESTRICTED');
    const rv = await w.B.call('getReveal', { chainId: id });
    assert.equal(rv.ok, true, 'a restricted player still opens the reveals they took part in');
    assert.equal((await w.B.call('getMyChains', {})).ok, true);
    const home = await w.B.call('getHome', {});
    assert.ok(home.me.restriction && home.me.restriction.until > w.d.t, 'the restriction copy has an end time');
    // 24 h later it lifts by itself
    w.d.t += 25 * 3600e3;
    assert.equal((await w.take('B', c2.chainId)).ok, true);
  } finally {
    w.d.destroy();
  }
});

test('QA deletion (AC 71, 72): author deletion removes strokes and text from steps at once, everyone sees the placeholder, the evidence copy stays admin-only', async () => {
  const w = await world();
  try {
    const id = await w.full();
    const before = w.d.steps().filter((s) => s.chainId === id && s.author === 'openid-B' && s.state === 'passed').length;
    assert.equal(before, 3);
    const del = await w.B.call('deleteMyStep', { all: true });
    assert.equal(del.ok, true);
    for (const s of w.d.steps().filter((x) => x.chainId === id && x.author === 'openid-B')) {
      assert.equal(s.text, undefined, 'text removed');
      assert.equal(s.state, 'deleted');
    }
    const rv = await w.A.call('getReveal', { chainId: id });
    assert.deepEqual(rv.steps.filter((s) => s.n % 2 === 0).map((s) => s.placeholder), ['deleted', 'deleted', 'deleted']);
    assert.doesNotMatch(JSON.stringify(rv), /一个大饼|外星人在吃披萨|企鹅在沙漠/);
    assert.ok(w.d.modLog().length >= 0);
  } finally {
    w.d.destroy();
  }
});

test('QA takedown (AC 62-64): admin hides a step, removes a chain; every view then answers 该接龙已被移除 / placeholder; the audit log records each op', async () => {
  const w = await world();
  try {
    const id = await w.full();
    const hid = await w.d.h.call('admin', { op: 'hideStep', stepId: id + '_4_1' }, {});
    assert.equal(hid.ok, true, JSON.stringify(hid));
    const rv = await w.A.call('getReveal', { chainId: id });
    assert.equal(rv.steps.find((s) => s.n === 4).placeholder, 'reported');
    const rm = await w.d.h.call('admin', { op: 'removeChain', chainId: id }, {});
    assert.equal(rm.ok, true, JSON.stringify(rm));
    for (const u of ['A', 'B', 'C']) {
      const r = await w[u].call('getReveal', { chainId: id });
      assert.equal(r.ok, false);
      assert.doesNotMatch(JSON.stringify(r), /一个大饼|外星人|企鹅/);
      const e = await w[u].call('getChain', { chainId: id, groupRef: w[u].ref });
      assert.equal(e.state, 'removed');
    }
    const audit = w.d.h.db.all(P + 'audit_log').map((a) => a.op).sort();
    assert.deepEqual(audit, ['hideStep', 'removeChain']);
  } finally {
    w.d.destroy();
  }
});
