'use strict';
// QA (independent): moderation fail-closed end to end, env gate, admin forgery, group freshness. Written from spec 3.3, 6, 7, 19
// (AC 7, 37-57, 62), not from the developers' tests. Everything runs on the REAL cloud functions with ENV_KIND=prod and
// MODERATION_MODE=live behind a fake WeChat platform (the production configuration), unless a test says otherwise.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloudDriver, T0, MIN } = require('./helpers/drivers');

const P = 'chuanhua_';
const MARK = [0, 1, 731, 389, 17, 23]; // a drawing nobody could produce by accident: the marker for "this drawing leaked"
const markDrawing = (extra) => ({ v: 1, s: [MARK].concat(Array.from({ length: extra || 0 }, (_, i) => [1, 1, 100 + i * 10, 600, 20, 30])) });
const leaks = (resp) => /\[0,1,731,389/.test(JSON.stringify(resp)) || /cloud:\/\/|tmp\.test|tempFileURL|fileID/.test(JSON.stringify(resp));

async function world(opts) {
  const d = cloudDriver(Object.assign({ moderation: 'live' }, opts || {}));
  const w = { d, log: [] };
  const call = (u) => async (fn, data) => {
    const r = await d.call(fn, data, 'openid-' + u);
    w.log.push({ u, fn, r });
    return r;
  };
  for (const u of ['A', 'B', 'C', 'D']) {
    w[u] = { id: 'openid-' + u, call: call(u) };
    assert.equal((await w[u].call('agreeRules', { version: 2 })).ok, true);
  }
  for (const u of ['A', 'B', 'C']) w[u].ref = await d.join('openid-' + u, 'group-1');
  w.D.ref = await d.join('openid-D', 'group-2'); // a member of ANOTHER group
  w.start = async (u, strokes) => {
    const c = await w[u].call('createChain', { promptId: 'I07', groupRef: w[u].ref });
    assert.equal(c.ok, true, JSON.stringify(c));
    const s = await w[u].call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: strokes || markDrawing(2) });
    assert.equal(s.state, 'pending', JSON.stringify(s));
    return c.chainId;
  };
  w.sweep = (m) => d.sweep(m);
  /** every read endpoint, as every kind of viewer; returns the responses */
  w.readAll = async (chainId, who) => {
    const out = [];
    for (const u of who) {
      out.push(await w[u].call('getChain', { chainId, groupRef: w[u].ref }));
      out.push(await w[u].call('getReveal', { chainId }));
      out.push(await w[u].call('getGroupChains', { groupRef: w[u].ref }));
      out.push(await w[u].call('getMyChains', {}));
      out.push(await w[u].call('getHome', {}));
    }
    return out;
  };
  return w;
}

test('QA fail-closed (AC 43, 49): a PENDING drawing reaches nobody but its author: no read endpoint, no group list, no claim, for members and strangers alike', async () => {
  const w = await world();
  try {
    const id = await w.start('A');
    const mine = await w.A.call('getMyChains', { chainId: id });
    assert.ok(JSON.stringify(mine).includes('731,389'), 'positive control: the author sees their own pending drawing');
    const seen = await w.readAll(id, ['B', 'C', 'D']);
    seen.push(await w.B.call('claimStep', { chainId: id, groupRef: w.B.ref }));
    seen.push(await w.D.call('claimStep', { chainId: id, groupRef: w.D.ref }));
    seen.push(await w.C.call('report', { chainId: id, step: 1, reason: 'other' }));
    seen.push(await w.C.call('laugh', { chainId: id, step: 1 }));
    for (const r of seen) assert.equal(leaks(r), false, JSON.stringify(r).slice(0, 300));
    assert.equal(seen[seen.length - 4].code, 'PENDING');
    assert.ok(['WRONG_GROUP', 'NEED_GROUP'].includes(seen[seen.length - 3].code), 'another group never claims');
    assert.equal(seen[seen.length - 1].ok, false, 'no reaction on content nobody may see');
    assert.equal(seen[seen.length - 2].ok, false, 'no report on a pending step');
    // the group list tells B only that a 棒 is in review
    const list = await w.B.call('getGroupChains', { groupRef: w.B.ref });
    assert.deepEqual(list.inProgress.map((r) => r.reason), ['pending']);
    assert.deepEqual(list.waiting, []);
  } finally {
    w.d.destroy();
  }
});

test('QA fail-closed (AC 44, 49): a BLOCKED drawing (review and risky) is never visible to anyone else, the 棒 reopens, risky strikes once, the PNG stays server-side', async () => {
  for (const [n, strikes] of [[14, 0], [13, 1]]) {
    const w = await world();
    try {
      const strokes = markDrawing(n - 1);
      const id = await w.start('A', strokes);
      await w.sweep(2); // the fake platform pushes the verdict (13 strokes = risky, 14 = review)
      const step = w.d.step(id + '_1_1');
      assert.equal(step.state, 'blocked');
      assert.equal((w.d.player('openid-A').strikes || []).length, strikes, n + ' strokes');
      const seen = await w.readAll(id, ['B', 'C', 'D']);
      seen.push(await w.B.call('claimStep', { chainId: id, groupRef: w.B.ref }));
      for (const r of seen) assert.equal(leaks(r), false, JSON.stringify(r).slice(0, 300));
      assert.equal((await w.B.call('getChain', { chainId: id, groupRef: w.B.ref })).state, 'claimable', 'the 棒 reopens');
      // the PNG exists for admins only
      assert.ok([...w.d.h.files.keys()].some((k) => k.includes('/' + id + '/1_1.png')));
      // nobody learns of the block through the chain (state words other than claimable / pending)
      assert.doesNotMatch(JSON.stringify(await w.B.call('getChain', { chainId: id, groupRef: w.B.ref })), /blocked|risky|review|没通过/);
    } finally {
      w.d.destroy();
    }
  }
});

test('QA fail-closed (AC 38, 41): a blocked TEXT is never stored as a step, never returned to anyone, is kept in mod_log for admins, and risky strikes once', async () => {
  const w = await world();
  try {
    const id = await w.start('A', markDrawing(0));
    await w.sweep(2);
    const k = await w.B.call('claimStep', { chainId: id, groupRef: w.B.ref });
    assert.equal(k.ok, true);
    for (const [txt, code, strikes] of [['测试复审一下', 'TEXT_BLOCKED', 0], ['测试违规一下', 'TEXT_BLOCKED', 1]]) {
      const r = await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: txt });
      assert.equal(r.code, code, JSON.stringify(r));
      assert.equal((w.d.player('openid-B').strikes || []).length, strikes);
    }
    assert.ok(!w.d.steps().some((s) => /测试/.test(s.text || '')), 'blocked text never becomes a step document');
    assert.ok(w.d.modLog().some((m) => /测试违规/.test(m.textCopy || '')), 'evidence kept for admins');
    const seen = await w.readAll(id, ['A', 'C', 'D']);
    for (const r of seen) assert.doesNotMatch(JSON.stringify(r), /测试(违规|复审)/);
    // the author still holds the claim and may retype
    const ok = await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
    assert.equal(ok.state, 'passed');
  } finally {
    w.d.destroy();
  }
});

test('QA fail-closed (AC 39): every kind of platform failure on a text check (throw, non-zero errCode, empty result, unknown suggest, 61010, quota) is MODERATION_BUSY and stores nothing', async () => {
  const w = await world();
  try {
    const id = await w.start('A', markDrawing(0));
    await w.sweep(2);
    const k = await w.B.call('claimStep', { chainId: id, groupRef: w.B.ref });
    const behaviours = [
      () => { throw new Error('boom'); },
      () => ({ errCode: 61010, errMsg: 'user access timeout' }),
      () => ({ errCode: 45009, errMsg: 'quota' }),
      () => ({ errCode: 0 }),
      () => ({ errCode: 0, result: {} }),
      () => ({ errCode: 0, result: { suggest: 'maybe' } }),
      () => undefined,
      () => null,
    ];
    for (const [i, b] of behaviours.entries()) {
      w.d.h.handle('security.msgSecCheck', async () => b());
      const r = await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '一个大饼在天上' });
      assert.equal(r.ok, false, 'behaviour ' + i + ' must not pass: ' + JSON.stringify(r));
      assert.equal(r.code, 'MODERATION_BUSY', 'behaviour ' + i);
      assert.ok(!w.d.steps().some((s) => s.n === 2), 'nothing stored (behaviour ' + i + ')');
    }
    assert.equal((w.d.player('openid-B').strikes || []).length, 0, 'outages never strike the author');
  } finally {
    w.d.destroy();
  }
});

test('QA fail-closed (AC 47): a mediaCheckAsync call that "succeeds" without a trace id, or answers a non-zero errCode, never yields a visible drawing', async () => {
  for (const reply of [() => ({ errCode: 0, errMsg: 'ok' }), () => ({ errCode: 87014 }), () => undefined]) {
    const w = await world();
    try {
      w.d.h.handle('security.mediaCheckAsync', async () => reply());
      const c = await w.A.call('createChain', { promptId: 'I07', groupRef: w.A.ref });
      const s = await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: markDrawing(2) });
      // either refused outright or pending; in no case passed
      assert.notEqual(s.state, 'passed', JSON.stringify(s));
      for (let i = 0; i < 4; i++) await w.sweep(6);
      const st = w.d.step(c.chainId + '_1_1');
      assert.ok(!st || st.state !== 'passed', 'never passed without a verdict');
      for (const r of await w.readAll(c.chainId, ['B', 'C', 'D'])) assert.equal(leaks(r), false);
    } finally {
      w.d.destroy();
    }
  }
});

test('QA fail-closed (AC 45): a forged push (carrying an OPENID, i.e. from a client) is FORBIDDEN and changes nothing; an unknown trace changes nothing', async () => {
  const w = await world();
  try {
    const id = await w.start('A');
    const trace = w.d.step(id + '_1_1').mod.traceIds[0];
    const forged = await w.d.h.call('onMediaCheck', { Event: 'wxa_media_check', trace_id: trace, result: { suggest: 'pass', label: 100 } }, { openid: 'openid-B' });
    assert.equal(forged.code, 'FORBIDDEN');
    assert.equal(w.d.step(id + '_1_1').state, 'pending');
    const unknown = await w.d.h.call('onMediaCheck', { Event: 'wxa_media_check', trace_id: 'no-such-trace', result: { suggest: 'pass' } }, {});
    assert.notEqual(unknown && unknown.ok === false && unknown.code === 'INTERNAL', true);
    assert.equal(w.d.step(id + '_1_1').state, 'pending');
    // the same forged call cannot be smuggled through the event body either
    const sneaky = await w.d.h.call('onMediaCheck', { Event: 'wxa_media_check', trace_id: trace, OPENID: 'openid-B', result: { suggest: 'pass' } }, { openid: 'openid-B' });
    assert.equal(sneaky.code, 'FORBIDDEN');
  } finally {
    w.d.destroy();
  }
});

test('QA env gate (AC 51, PO-14): mock moderation in production, an unknown mode, or an unset ENV_KIND with mock, answers SERVER_CONFIG from EVERY UGC function and never creates anything', async () => {
  const UGC = ['createChain', 'getChain', 'claimStep', 'releaseClaim', 'submitStep', 'getReveal', 'revealNow', 'laugh', 'report', 'getMyChains', 'getGroupChains', 'deleteMyStep'];
  const bad = [
    { ENV_KIND: 'prod', MODERATION_MODE: 'mock' },
    { ENV_KIND: undefined, MODERATION_MODE: 'mock' },
    { ENV_KIND: 'production', MODERATION_MODE: 'mock' },
    { ENV_KIND: 'PROD', MODERATION_MODE: 'mock' },
    { ENV_KIND: 'prod', MODERATION_MODE: 'MOCK' },
    { ENV_KIND: 'dev', MODERATION_MODE: 'off' },
    { ENV_KIND: 'dev', MODERATION_MODE: 'none' },
  ];
  for (const env of bad) {
    const d = cloudDriver({ moderation: 'mock', env, envKind: env.ENV_KIND, mode: env.MODERATION_MODE });
    try {
      for (const fn of UGC) {
        const r = await d.call(fn, { chainId: 'ABCDEFGHJK', claimId: 'x', step: 1, groupRef: '0123456789abcdef', promptId: 'I07', reason: 'other', text: '一个大饼在天上', strokes: markDrawing(1) }, 'openid-A');
        assert.equal(r.code, 'SERVER_CONFIG', `${JSON.stringify(env)} ${fn}: ${JSON.stringify(r)}`);
      }
      assert.equal(d.chains().length, 0);
      assert.equal(d.steps().length, 0);
      assert.ok(d.alerts.length > 0, '[ALERT] logged for ' + JSON.stringify(env));
    } finally {
      d.destroy();
    }
  }
});

test('QA env gate: a typo in ENV_KIND (Dev, development, empty) means PRODUCTION, so mock never switches on by accident; live moderation is the default', async () => {
  for (const kind of ['Dev', 'development', 'test', '']) {
    const d = cloudDriver({ moderation: 'live', env: { ENV_KIND: kind }, envKind: kind });
    try {
      const r = d.h.module('createChain'); // loads
      assert.ok(r);
      const env = require(require('path').join(d.h.root, 'createChain', 'common', 'env.js')).envState();
      assert.equal(env.envKind, 'prod', JSON.stringify(kind));
      assert.equal(env.mode, 'live');
    } finally {
      d.destroy();
    }
  }
});

test('QA env gate (spec 6.6): in production the mock trigger words are ordinary text sent to the platform, and 13/14/15 strokes get the PLATFORM verdict, not the mock one', async () => {
  const w = await world();
  try {
    w.d.h.handle('security.msgSecCheck', async (p) => ({ errCode: 0, result: { suggest: 'pass', label: 100 }, detail: [], seen: p.content }));
    const id = await w.start('A', markDrawing(12)); // exactly 13 strokes
    // the fake platform in this world applies mockImage by stroke count; so here we override it: pass everything
    const trace = w.d.step(id + '_1_1').mod.traceIds[0];
    await w.d.push(trace, 'pass');
    assert.equal(w.d.step(id + '_1_1').state, 'passed', 'the platform said pass: 13 strokes is just a drawing in production');
    const k = await w.B.call('claimStep', { chainId: id, groupRef: w.B.ref });
    const r = await w.B.call('submitStep', { chainId: id, claimId: k.claimId, text: '测试违规啦' });
    assert.equal(r.state, 'passed', 'production does not interpret 测试违规');
  } finally {
    w.d.destroy();
  }
});

test('QA admin (AC 62): identity can never be supplied in the event; a client (any OPENID) cannot run any admin op even with ADMIN_OPENIDS set to someone else', async () => {
  const w = await world({ env: { ADMIN_OPENIDS: 'openid-ROOT' } });
  try {
    for (const op of ['listReports', 'sample', 'setUgc', 'restrict', 'removeChain', 'hideStep', 'restoreStep', 'upholdReport', 'dismissReport', 'liftRestriction', 'getStep']) {
      const r = await w.A.call('admin', { op, openid: 'openid-ROOT', OPENID: 'openid-ROOT', by: 'console', viewEnabled: false, createEnabled: false, chainId: 'ABCDEFGHJK', stepId: 'x', reportId: 'x' });
      assert.equal(r.code, 'FORBIDDEN', op);
    }
    assert.deepEqual(w.d.h.db.get(P + 'app_config', 'live'), { _id: 'live', moderation: { imageMode: 'async', textApi: 'general' } });
    assert.equal(w.d.h.db.all(P + 'audit_log').length, 0);
  } finally {
    w.d.destroy();
  }
});

test('QA group binding (AC 7, spec 3.3): a membership row older than 30 days no longer lets a player claim; a fresh one (29 d) does; another group never does', async () => {
  const w = await world();
  try {
    const id = await w.start('A', markDrawing(0));
    await w.sweep(2);
    const DAY = 86400e3;
    const age = (u, days) => {
      const rows = w.d.h.db.all(P + 'group_members').filter((m) => m.openid === 'openid-' + u);
      rows.forEach((m) => w.d.h.db.put(P + 'group_members', Object.assign({}, m, { lastSeen: w.d.t - days * DAY })));
    };
    age('B', 31);
    const stale = await w.B.call('claimStep', { chainId: id, groupRef: w.B.ref });
    assert.ok(['NEED_GROUP', 'WRONG_GROUP'].includes(stale.code), JSON.stringify(stale));
    age('B', 29);
    assert.equal((await w.B.call('claimStep', { chainId: id, groupRef: w.B.ref })).ok, true);
    const other = await w.D.call('claimStep', { chainId: id, groupRef: w.D.ref });
    assert.ok(['NEED_GROUP', 'WRONG_GROUP', 'TAKEN'].includes(other.code), JSON.stringify(other));
    assert.equal(w.d.step(id + '_2_1'), null);
    // no group context at all: refused, and the entry says so
    const none = await w.C.call('claimStep', { chainId: id });
    assert.ok(['NEED_GROUP', 'WRONG_GROUP', 'TAKEN'].includes(none.code), JSON.stringify(none));
  } finally {
    w.d.destroy();
  }
});

test('QA privacy (AC 73): across a whole chain lifecycle no client function ever returns an openid, group id, file id, temp URL or PNG', async () => {
  const w = await world();
  try {
    const id = await w.start('A', markDrawing(0));
    await w.sweep(2);
    const t = async (u, text) => {
      const k = await w[u].call('claimStep', { chainId: id, groupRef: w[u].ref });
      assert.equal(k.ok, true, JSON.stringify(k));
      return w[u].call('submitStep', { chainId: id, claimId: k.claimId, text });
    };
    await t('B', '一个大饼在天上');
    const kA = await w.A.call('claimStep', { chainId: id, groupRef: w.A.ref });
    await w.A.call('submitStep', { chainId: id, claimId: kA.claimId, strokes: markDrawing(3) });
    await w.sweep(2);
    await t('B', '外星人在吃披萨');
    await w.readAll(id, ['A', 'B', 'C', 'D']);
    const all = JSON.stringify(w.log.map((x) => x.r));
    assert.doesNotMatch(all, /openid-[A-Z]/);
    assert.doesNotMatch(all, /group-1|group-2|opengid/i);
    assert.doesNotMatch(all, /cloud:\/\/|tmp\.test|\.png|tempFileURL|fileID/);
  } finally {
    w.d.destroy();
  }
});
