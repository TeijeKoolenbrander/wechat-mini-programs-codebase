'use strict';
// Moderation through cloud.openapi, FAIL CLOSED (spec 6, AC 37-48, 51, 52, 55, 56; compliance-critical).
// Production configuration (ENV_KIND=prod, MODERATION_MODE=live) against a programmable fake of cloud.openapi:
// exact call parameters, the PNG that is uploaded and checked, every failure mode, and proof that nothing unchecked is ever
// visible to anybody but its author. The mock verdicts never run here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHarness } = require('./helpers/harness');
const sync = require('../scripts/sync-core');
const { decodePng } = require(path.join(sync.CF_ROOT, 'common', 'png'));

const A = { openid: 'openid-A' };
const B = { openid: 'openid-B' };
const C = { openid: 'openid-C' };
const P = 'chuanhua_';
const drawing = (k) => ({ v: 1, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });

async function setup(env) {
  const h = createHarness({ env: Object.assign({ ENV_KIND: 'prod', MODERATION_MODE: 'live' }, env || {}) });
  const origErr = console.error;
  const quiet = [];
  console.error = (...a) => quiet.push(a.join(' '));
  h.alertsSeen = quiet;
  const done = h.teardown;
  h.teardown = () => { console.error = origErr; done(); };
  for (const u of [A, B, C]) {
    await h.call('agreeRules', { version: 2 }, u);
    u.ref = (await h.call('joinGroup', { cloudID: 'cid-3-g1' }, u)).groupRef;
  }
  return h;
}
const calls = (h, api) => h.calls.filter((c) => c.api === api);

test('AC 37: every custom prompt and description reaches msgSecCheck v2, scene 3, with the author openid from the context', async () => {
  const h = await setup();
  try {
    const c = await h.call('createChain', { customText: '我家的猫会开车', groupRef: A.ref }, A);
    assert.equal(c.ok, true);
    assert.deepEqual(calls(h, 'security.msgSecCheck').map((x) => x.params), [{ content: '我家的猫会开车', version: 2, scene: 3, openid: 'openid-A' }]);
    // a client-supplied identity is ignored: the openid is always the context's
    const c2 = await h.call('createChain', { customText: '我家的狗会骑车', openid: 'evil', OPENID: 'evil', groupRef: A.ref }, A);
    assert.equal(c2.ok, true);
    assert.equal(calls(h, 'security.msgSecCheck')[1].params.openid, 'openid-A');
    // a description
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
    await h.module('modSweeper');
    const k = await ((async () => { h.advance(120e3); await h.call('onMediaCheck', { trace_id: 'trace-1', result: { suggest: 'pass' } }); return h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B); })());
    assert.equal(k.ok, true);
    const s = await h.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '一个大饼在天上' }, B);
    assert.equal(s.state, 'passed');
    assert.deepEqual(calls(h, 'security.msgSecCheck')[2].params, { content: '一个大饼在天上', version: 2, scene: 3, openid: 'openid-B' });
    assert.equal(calls(h, 'security.msgSecCheck').length, 3, 'exactly one call per text');
  } finally { h.teardown(); }
});

test('AC 38/39: pass is visible, review blocks, risky blocks with a strike; API error, timeout, quota error and an unknown verdict are MODERATION_BUSY and store nothing', async () => {
  const h = await setup();
  try {
    const mk = async () => {
      const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
      await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
      const tr = calls(h, 'security.mediaCheckAsync').length;
      await h.call('onMediaCheck', { trace_id: 'trace-' + tr, result: { suggest: 'pass' } });
      h.advance(60e3);
      h.advance(61e3);
      return c.chainId;
    };
    const id = await mk();
    const k = await h.call('claimStep', { chainId: id, groupRef: B.ref }, B);
    const submit = (text) => h.call('submitStep', { chainId: id, claimId: k.claimId, text }, B);
    const verdict = (v) => h.handle('security.msgSecCheck', async () => v);
    const strikes = () => (h.db.get(P + 'players', 'openid-B').strikes || []).length;
    const passedNow = () => h.db.get(P + 'chains', id).passed;

    verdict({ errCode: 0, result: { suggest: 'review', label: 20002 } });
    assert.equal((await submit('一个大饼在天上')).code, 'TEXT_BLOCKED');
    assert.equal(strikes(), 0, 'review: no strike');
    h.advance(61e3);
    const failures = [
      async () => { throw Object.assign(new Error('timeout'), { errCode: -1 }); },
      async () => { throw Object.assign(new Error('rate limit'), { errCode: 45009 }); },
      async () => ({ errCode: 61010, errMsg: 'user needs to visit within 2 hours' }), // returned, not thrown
      async () => ({ errCode: 0, result: { suggest: 'maybe', label: 1 } }), // unknown verdict
      async () => ({ errCode: 0, result: {} }),
      async () => ({ errCode: 0 }),
      async () => null,
      () => new Promise(() => {}), // never answers: the 3 s timeout
    ];
    for (const f of failures) {
      h.handle('security.msgSecCheck', f);
      const t0 = Date.now();
      const r = await submit('一个大饼在天上');
      assert.equal(r.code, 'MODERATION_BUSY', String(f));
      assert.equal(passedNow(), 1, 'nothing stored');
      assert.equal(h.db.get(P + 'steps', id + '_2_1'), null);
      assert.equal(strikes(), 0);
      assert.ok(Date.now() - t0 < 4500);
      h.advance(61e3);
    }
    verdict({ errCode: 0, result: { suggest: 'risky', label: 10001 } });
    assert.equal((await submit('一个大饼在天上')).code, 'TEXT_BLOCKED');
    assert.equal(strikes(), 1);
    h.advance(61e3);
    verdict({ errCode: 0, result: { suggest: 'pass', label: 100 } });
    assert.equal((await submit('一个大饼在天上')).state, 'passed');
    assert.equal(h.db.get(P + 'chains', id).claim, null);
    // the claim and attempt number survive blocked and busy submits: the step id is _2_1
    assert.equal(h.db.get(P + 'steps', id + '_2_1').text, '一个大饼在天上');
  } finally { h.teardown(); }
});

test('AC 42/43: a drawing uploads the server PNG (512 x 512, white background, the strokes), takes a 7,200 s temp URL and calls mediaCheckAsync v2; the step is pending with the trace id and nothing is visible', async () => {
  const h = await setup();
  try {
    const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
    const r = await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3) }, A);
    assert.equal(r.state, 'pending');
    const sid = c.chainId + '_1_1';
    const step = h.db.get(P + 'steps', sid);
    // the file
    assert.match(step.fileID, new RegExp('^cloud://test-env\\.bucket/chuanhua/mod/202611/' + c.chainId + '/1_1\\.png$'));
    const png = decodePng(h.files.get(step.fileID));
    assert.deepEqual([png.width, png.height], [512, 512]);
    assert.deepEqual([png.data[0], png.data[1], png.data[2]], [255, 255, 255], 'white background');
    assert.ok(png.data.some((b, i) => i % 3 === 0 && b < 250), 'the strokes are in the image');
    // the call
    const m = calls(h, 'security.mediaCheckAsync');
    assert.equal(m.length, 1);
    assert.match(m[0].params.media_url, /^https:\/\/tmp\.test\/.*maxAge=7200$/);
    assert.deepEqual([m[0].params.media_type, m[0].params.version, m[0].params.scene, m[0].params.openid], [2, 2, 3, 'openid-A']);
    assert.equal(m[0].params.mediaUrl, m[0].params.media_url, 'both spellings (V3)');
    // the stored state
    assert.deepEqual([step.state, step.mod.kind, step.mod.traceIds, step.mod.callErrors], ['pending', 'image', ['trace-1'], 0]);
    assert.deepEqual(Object.keys(h.db.get(P + 'mod_traces', 'trace-1')).sort(), ['_id', 'done', 'fileID', 'mock', 'stepId', 'submittedAt']);
    assert.equal(h.db.get(P + 'chains', c.chainId).state, 'pending');
    // AC 43: nobody else gets any content; the next player cannot claim
    assert.equal((await h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B)).code, 'PENDING');
    const view = JSON.stringify([await h.call('getChain', { chainId: c.chainId, groupRef: B.ref }, B), await h.call('getGroupChains', { groupRef: B.ref }, B), await h.call('getReveal', { chainId: c.chainId }, B)]);
    assert.ok(!view.includes('strokes') && !view.includes('"x"'));
    // PO-10 / AC 29: no client response ever carries the file, its id or a URL
    const mine = JSON.stringify(await h.call('getMyChains', { chainId: c.chainId }, A));
    assert.ok(!/cloud:\/\/|\.png|tmp\.test|fileID/.test(mine));
  } finally { h.teardown(); }
});

test('AC 44/45: onMediaCheck applies pass / review / risky once per trace (idempotent), ignores unknown traces and bad verdicts, rejects clients', async () => {
  const h = await setup();
  try {
    const start = async (n) => {
      const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
      await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
      h.db.put(P + 'players', Object.assign(h.db.get(P + 'players', 'openid-A'), { day: Object.assign(h.db.get(P + 'players', 'openid-A').day, { starts: 0 }) }));
      return { id: c.chainId, trace: 'trace-' + n };
    };
    const s1 = await start(1);
    assert.equal((await h.call('onMediaCheck', { trace_id: s1.trace, result: { suggest: 'pass' } }, A)).code, 'FORBIDDEN');
    assert.equal(await h.call('onMediaCheck', { trace_id: 'nope', result: { suggest: 'pass' } }), 'success');
    assert.equal(await h.call('onMediaCheck', { trace_id: s1.trace, result: { suggest: 'bogus' } }), 'success');
    assert.equal(await h.call('onMediaCheck', { trace_id: s1.trace }), 'success');
    assert.equal(await h.call('onMediaCheck', { garbage: true }), 'success');
    assert.equal(h.db.get(P + 'steps', s1.id + '_1_1').state, 'pending', 'unknown traces and non-verdicts change nothing');
    assert.equal(await h.call('onMediaCheck', { trace_id: s1.trace, result: { suggest: 'pass', label: 100 } }), 'success');
    assert.equal(h.db.get(P + 'steps', s1.id + '_1_1').state, 'passed');
    assert.equal(h.db.get(P + 'chains', s1.id).nextStep, 2);
    await h.call('onMediaCheck', { trace_id: s1.trace, result: { suggest: 'risky' } });
    assert.equal(h.db.get(P + 'steps', s1.id + '_1_1').state, 'passed', 'duplicate');
    assert.equal((h.db.get(P + 'players', 'openid-A').strikes || []).length, 0);
    const s2 = await start(2);
    await h.call('onMediaCheck', { trace_id: s2.trace, result: { suggest: 'review' } });
    assert.deepEqual([h.db.get(P + 'steps', s2.id + '_1_1').state, h.db.get(P + 'chains', s2.id).nextStep, (h.db.get(P + 'players', 'openid-A').strikes || []).length], ['blocked', 1, 0]);
    const s3 = await start(3);
    await h.call('onMediaCheck', { trace_id: s3.trace, result: { suggest: 'risky' } });
    assert.deepEqual([h.db.get(P + 'steps', s3.id + '_1_1').state, (h.db.get(P + 'players', 'openid-A').strikes || []).length], ['blocked', 1]);
    // the worst detail wins when only per-strategy details are pushed
    const s4 = await start(4);
    await h.call('onMediaCheck', { trace_id: s4.trace, detail: [{ strategy: 'a', suggest: 'pass' }, { strategy: 'b', suggest: 'risky', label: 20001 }] });
    assert.equal(h.db.get(P + 'steps', s4.id + '_1_1').state, 'blocked');
    assert.equal((h.db.get(P + 'players', 'openid-A').strikes || []).length, 2);
  } finally { h.teardown(); }
});

test('AC 47: a mediaCheckAsync CALL error leaves the step pending (never visible), is retried at +5 and +10 minutes, then voids without a strike', async () => {
  const h = await setup();
  try {
    h.handle('security.mediaCheckAsync', async () => { throw new Error('openapi down'); });
    const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
    const r = await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
    assert.equal(r.state, 'pending');
    const sid = c.chainId + '_1_1';
    assert.equal(h.db.get(P + 'steps', sid).mod.callErrors, 1);
    assert.equal((await h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B)).code, 'PENDING');
    for (const [min, errs] of [[4, 1], [1.5, 2], [5, 3]]) {
      h.advance(min * 60e3);
      await h.call('modSweeper', {});
      assert.equal(h.db.get(P + 'steps', sid).mod.callErrors, errs);
      assert.equal(h.db.get(P + 'steps', sid).state, 'pending');
    }
    h.advance(60e3);
    await h.call('modSweeper', {});
    const st = h.db.get(P + 'steps', sid);
    assert.deepEqual([st.state, (h.db.get(P + 'players', 'openid-A').strikes || []).length, h.db.get(P + 'chains', c.chainId).state], ['void', 0, 'open']);
  } finally { h.teardown(); }
});

test('upload failure and temp-URL failure fail closed: MODERATION_BUSY, nothing stored, claim and allowance untouched', async () => {
  const h = await setup();
  try {
    const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
    h.state.failUpload = true;
    const r = await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
    assert.equal(r.code, 'MODERATION_BUSY');
    assert.equal(h.db.all(P + 'steps').length, 0);
    assert.equal(h.db.get(P + 'chains', c.chainId).state, 'starting');
    assert.equal(h.db.get(P + 'players', 'openid-A').day.starts, 0);
    assert.equal(calls(h, 'security.mediaCheckAsync').length, 0);
    h.state.failUpload = false;
    h.advance(61e3);
    assert.equal((await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A)).state, 'pending', 'the same claim can retry');
  } finally { h.teardown(); }
});

test('AC 46/48: the sweeper re-checks once with a new trace and temp URL after 35 min, then voids; a late risky strikes only', async () => {
  const h = await setup();
  try {
    const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
    const sid = c.chainId + '_1_1';
    h.advance(34 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(calls(h, 'security.mediaCheckAsync').length, 1);
    h.advance(2 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(calls(h, 'security.mediaCheckAsync').length, 2, 'one re-check');
    assert.notEqual(calls(h, 'security.mediaCheckAsync')[0].params.media_url, undefined);
    assert.deepEqual(h.db.get(P + 'steps', sid).mod.traceIds, ['trace-1', 'trace-2']);
    h.advance(36 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(h.db.get(P + 'steps', sid).state, 'void');
    assert.equal(calls(h, 'security.mediaCheckAsync').length, 2, 'never a second re-check');
    assert.equal(h.db.get(P + 'players', 'openid-A').day.starts, 0, 'the allowance is back');
    await h.call('onMediaCheck', { trace_id: 'trace-1', result: { suggest: 'risky' } });
    assert.equal((h.db.get(P + 'players', 'openid-A').strikes || []).length, 1);
    assert.equal(h.db.get(P + 'steps', sid).state, 'void', 'no visibility change');
    await h.call('onMediaCheck', { trace_id: 'trace-1', result: { suggest: 'risky' } });
    assert.equal((h.db.get(P + 'players', 'openid-A').strikes || []).length, 1, 'idempotent');
  } finally { h.teardown(); }
});

test('AC 51: MODERATION_MODE=mock in production fails closed everywhere with [ALERT], never reaching the platform or the database', async () => {
  const h = await setup({ MODERATION_MODE: 'mock' });
  try {
    for (const [fn, ev] of [['createChain', { customText: '我家的猫会开车' }], ['submitStep', { chainId: 'AAAAAAAAAA', claimId: 'x', text: '一个大饼' }], ['claimStep', { chainId: 'AAAAAAAAAA' }],
      ['getReveal', { chainId: 'AAAAAAAAAA' }], ['onMediaCheck', { trace_id: 't', result: { suggest: 'pass' } }], ['modSweeper', {}]]) {
      const r = await h.call(fn, ev, ['onMediaCheck', 'modSweeper'].includes(fn) ? {} : A);
      assert.equal(r.code, 'SERVER_CONFIG', fn);
    }
    assert.ok(h.alertsSeen.some((l) => l.startsWith('[ALERT]') && /MODERATION_MODE=mock in production/.test(l)));
    assert.equal(h.calls.length, 0);
    // an unknown mode and an unknown env kind (typo) are also fail-closed
    h.setEnv('MODERATION_MODE', 'maybe');
    assert.equal((await h.call('createChain', { promptId: 'A01' }, A)).code, 'SERVER_CONFIG');
    h.setEnv('MODERATION_MODE', 'mock');
    h.setEnv('ENV_KIND', 'staging');
    assert.equal((await h.call('createChain', { promptId: 'A01' }, A)).code, 'SERVER_CONFIG', 'an unrecognised ENV_KIND is production');
    h.setEnv('ENV_KIND', undefined);
    assert.equal((await h.call('createChain', { promptId: 'A01' }, A)).code, 'SERVER_CONFIG', 'unset ENV_KIND is production');
  } finally { h.teardown(); }
});

test('mock verdicts exist only in dev: with ENV_KIND=prod the strings 测试违规 / 13 strokes are ordinary input', async () => {
  const h = await setup();
  try {
    const r = await h.call('createChain', { customText: '测试违规', groupRef: A.ref }, A); // the platform (fake) says pass
    assert.equal(r.ok, true, 'a prod text is judged by the platform only');
    const c = await h.call('createChain', { promptId: 'A02', groupRef: A.ref }, A);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(13) }, A);
    h.advance(10 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(h.db.get(P + 'steps', c.chainId + '_1_1').state, 'pending', 'no mock verdict is ever delivered in production');
    assert.equal(h.db.all(P + 'mod_traces').every((t) => t.mock === false), true);
  } finally { h.teardown(); }
});

test('AC 52: dev + live counts msgSecCheck in mod_quota and stops at MOD_TEXT_DAILY_BUDGET (atomically, under concurrency)', async () => {
  const h = await setup({ ENV_KIND: 'dev', MODERATION_MODE: 'live', MOD_TEXT_DAILY_BUDGET: '5' });
  try {
    const users = [];
    for (let i = 0; i < 12; i++) {
      const u = { openid: 'openid-U' + i };
      await h.call('agreeRules', { version: 2 }, u);
      users.push(u);
    }
    const rs = await Promise.all(users.map((u) => h.call('createChain', { customText: '我家的猫会开车' }, u)));
    assert.equal(rs.filter((r) => r.ok).length, 5);
    assert.equal(rs.filter((r) => r.code === 'MODERATION_BUSY').length, 7);
    assert.equal(calls(h, 'security.msgSecCheck').length, 5, 'the platform was called exactly budget times');
    assert.equal(h.db.get(P + 'mod_quota', '20261103').text, 5);
    // prod ignores the budget
    h.setEnv('ENV_KIND', 'prod');
    h.advance(61e3);
    assert.equal((await h.call('createChain', { customText: '我家的猫会开车' }, users[6])).ok, true);
  } finally { h.teardown(); }
});

test('AC 55: >= 50% failures over >= 20 calls in 5 minutes pause creation for 15 minutes; fewer calls or a healthy rate do not; no re-trip while paused', async () => {
  const h = await setup();
  try {
    h.handle('security.msgSecCheck', async () => { throw new Error('down'); });
    const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
    await h.call('onMediaCheck', { trace_id: 'trace-1', result: { suggest: 'pass' } });
    const k = await h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B);
    for (let i = 0; i < 18; i++) h.db._col(P + 'rate_limits').clear(), await h.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '一个大饼在天上' }, B); // 18 failed texts + the 1 image call = 19 calls
    h.alertsSeen.length = 0;
    await h.call('modSweeper', {});
    assert.equal(h.alertsSeen.filter((l) => /circuit breaker/.test(l)).length, 0, '19 calls: below the minimum of 20');
    for (let i = 0; i < 2; i++) h.db._col(P + 'rate_limits').clear(), await h.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '一个大饼在天上' }, B); // 21 calls, 20 failed
    h.advance(1);
    await h.call('modSweeper', {});
    assert.equal(h.alertsSeen.filter((l) => /circuit breaker/.test(l)).length, 1);
    const cfg = h.db.get(P + 'app_config', 'live');
    assert.equal(cfg.ugc.autoPausedUntil, h.now() + 15 * 60e3);
    assert.equal(cfg.ugc.createEnabled, true, 'the automatic pause does not touch the switches');
    h.advance(60e3);
    h.resetCaches();
    assert.equal((await h.call('createChain', { promptId: 'A02' }, C)).code, 'UGC_PAUSED');
    await h.call('modSweeper', {});
    assert.equal(h.alertsSeen.filter((l) => /circuit breaker/.test(l)).length, 1, 'not re-announced while paused');
    assert.equal(h.db.get(P + 'app_config', 'live').ugc.autoPausedUntil, cfg.ugc.autoPausedUntil, 'not extended');
    h.advance(16 * 60e3);
    h.resetCaches();
    h.handle('security.msgSecCheck', async () => ({ errCode: 0, result: { suggest: 'pass' } }));
    assert.equal((await h.call('createChain', { promptId: 'A02' }, C)).ok, true);
  } finally { h.teardown(); }
});

test('AC 56: the image quota guard: alert at 70%, UGC_BUSY for new chains at 95%, drawings fail closed at 100%', async () => {
  const h = await setup();
  try {
    const put = (n) => h.db.put(P + 'mod_quota', { _id: '20261103', text: 0, image: n, errors: 0, calls: {} });
    put(140000);
    h.alertsSeen.length = 0;
    await h.call('modSweeper', {});
    assert.ok(h.alertsSeen.some((l) => /^\[ALERT\].*quota/.test(l)));
    assert.equal((await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A)).ok, true);
    put(190000);
    assert.equal((await h.call('createChain', { promptId: 'A02', groupRef: A.ref }, A)).code, 'UGC_BUSY');
    const chains = h.db.all(P + 'chains');
    const k = await h.call('claimStep', { chainId: chains[0]._id, groupRef: A.ref }, A);
    assert.equal(k.ok, true, 'a claim still works at 95%');
    put(200000);
    const r = await h.call('submitStep', { chainId: chains[0]._id, claimId: k.claimId, strokes: drawing(2) }, A);
    assert.equal(r.code, 'MODERATION_BUSY');
    assert.equal(calls(h, 'security.mediaCheckAsync').length, 0, 'no platform call and no upload');
    assert.equal(h.files.size, 0);
  } finally { h.teardown(); }
});

test('AC 53/54: kill switches take effect within 10 s (cache) for creation and views; unreadable config keeps the last good value', async () => {
  const h = await setup();
  try {
    const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
    assert.equal((await h.call('claimStep', { chainId: c.chainId, groupRef: A.ref }, A)).ok, true); // primes this function's 10 s cache
    h.db.put(P + 'app_config', { _id: 'live', ugc: { createEnabled: false, viewEnabled: true } });
    assert.equal((await h.call('claimStep', { chainId: c.chainId, groupRef: A.ref }, A)).ok, true, 'cached for up to 10 s');
    h.advance(11e3);
    assert.equal((await h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B)).code, 'UGC_PAUSED');
    assert.equal((await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A)).code, 'UGC_PAUSED');
    // reading app_config fails (database hiccup): the last good value stays in force, an emergency stop is not undone
    const orig = h.db.collection.bind(h.db);
    h.db.collection = (n) => { if (n === P + 'app_config') throw new Error('db hiccup'); return orig(n); };
    h.advance(11e3);
    assert.equal((await h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B)).code, 'UGC_PAUSED');
    h.db.collection = orig;
    // and with no document at all the defaults apply (UGC on, spec edge 31)
    h.db._col(P + 'app_config').delete('live');
    h.advance(11e3);
    assert.notEqual((await h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B)).code, 'UGC_PAUSED');
  } finally { h.teardown(); }
});

test('AC 34/35: contact patterns, numbers, URLs and blocklist words are rejected locally: no msgSecCheck call, no strike, no log, no counter', async () => {
  const h = await setup();
  try {
    const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(2) }, A);
    h.advance(2 * 60e3);
    await h.call('onMediaCheck', { trace_id: 'trace-1', result: { suggest: 'pass' } });
    const k = await h.call('claimStep', { chainId: c.chainId, groupRef: B.ref }, B);
    const quota0 = JSON.stringify(h.db.get(P + 'mod_quota', '20261103'));
    for (const text of ['加我微信', '电话12345', 'abc.com', '傻逼', 'vx号', '一二三四五六', 'a', '这是一个非常非常非常长的句子这是一个非常非常长']) {
      h.advance(61e3);
      const r = await h.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text }, B);
      assert.equal(r.code, 'TEXT_REJECTED', text);
    }
    for (const customText of ['加我微信', '傻逼', '猫']) {
      h.advance(61e3);
      assert.equal((await h.call('createChain', { customText }, A)).code, 'TEXT_REJECTED', customText);
    }
    assert.equal(calls(h, 'security.msgSecCheck').length, 0);
    assert.equal(JSON.stringify(h.db.get(P + 'mod_quota', '20261103')), quota0, 'no moderation counter moved');
    assert.equal(h.db.all(P + 'mod_log').filter((m) => m.kind === 'text').length, 0);
    assert.equal((h.db.get(P + 'players', 'openid-B').strikes || []).length, 0);
  } finally { h.teardown(); }
});
