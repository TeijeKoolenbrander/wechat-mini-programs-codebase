'use strict';
// Moderation pipeline (AC 37-56): text, drawings, push handler, timeouts, fail-closed, kill switches.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');
const F = require('./helpers/flow');

let h;
const [A, B, C] = F.PEOPLE;
afterEach(() => { if (h) h.teardown(); h = null; });

const live = { MODERATION_MODE: 'live', ENV_KIND: 'dev' };
const evt = (trace, suggest, label = 100, extra = {}) => ({
  ToUserName: 'gh_x', FromUserName: 'oPlatform', CreateTime: 1, MsgType: 'event', Event: 'wxa_media_check', appid: 'wx', trace_id: trace, version: 2,
  detail: [{ strategy: 'content_model', errcode: 0, suggest, label, prob: 90 }], errcode: 0, errmsg: 'ok', result: { suggest, label }, ...extra,
});
function captureAlerts() {
  const logs = [];
  const orig = console.error;
  console.error = (...a) => { logs.push(a.join(' ')); };
  return { logs, restore() { console.error = orig; } };
}

/** chain with 棒 1 passed (seeded), B claimed 棒 2 and is about to describe */
async function describeSetup(env) {
  h = createHarness({ env });
  const gref = await F.player(h, A);
  await F.player(h, B);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const cl = await F.claim(h, B, id, gref);
  return { gref, id, cl };
}
/** B submits a live drawing as 棒 1 of a fresh chain; returns ids */
async function liveDrawing(opts = {}) {
  h = h || createHarness({ env: live });
  const gref = await F.player(h, A);
  await F.player(h, B);
  const c = await F.create(h, A, { groupRef: gref });
  const s = await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: opts.strokes || F.strokes(4) });
  return { gref, c, s, step: h.db.get('steps', `${c.chainId}_1_1`) };
}

// ------------------------------------------------------------------ text

test('every description reaches msgSecCheck v2 scene 3 with the author openid from the context (AC 37)', async () => {
  const { id, cl } = await describeSetup(live);
  const r = await F.submit(h, B, id, cl.claimId, { text: '一只猫在开车' });
  assert.equal(r.state, 'passed');
  assert.equal(h.sdk.count('msgSecCheck'), 1);
  assert.deepEqual(h.sdk.calls.msgSecCheck[0], { content: '一只猫在开车', version: 2, scene: 3, openid: B });
  assert.equal(h.db.get("steps", `${id}_2_2`).text, '一只猫在开车');
});

test('review blocks without a strike, risky blocks with one; the author keeps the claim (AC 38)', async () => {
  const { id, cl } = await describeSetup(live);
  h.sdk.on('msgSecCheck', async () => ({ result: { suggest: 'review', label: 10001 } }));
  const r1 = await F.submit(h, B, id, cl.claimId, { text: '这句话待复审' });
  assert.equal(r1.code, 'TEXT_BLOCKED');
  assert.equal((h.db.get('players', B).strikes || []).length, 0);
  h.sdk.on('msgSecCheck', async () => ({ result: { suggest: 'risky', label: 20001 } }));
  h.advance(30000);
  const r2 = await F.submit(h, B, id, cl.claimId, { text: '这句话有风险' });
  assert.equal(r2.code, 'TEXT_BLOCKED');
  assert.equal(h.db.get('players', B).strikes.length, 1);
  assert.equal(h.db.get('players', B).warnPending, true);
  // still holds the claim and can retype (TTL permitting)
  h.sdk.on('msgSecCheck', async () => ({ result: { suggest: 'pass' } }));
  h.advance(30000);
  const r3 = await F.submit(h, B, id, cl.claimId, { text: '换一个说法吧' });
  assert.equal(r3.state, 'passed');
  // blocked texts are evidence in mod_log, never in steps
  const logs = h.db.all('mod_log');
  assert.ok(logs.some((l) => l.textCopy === '这句话有风险' && l.suggest === 'risky'));
  assert.ok(!h.db.all('steps').some((s) => s.text === '这句话有风险' || s.text === '这句话待复审'));
});

test('API error, quota error and timeout -> MODERATION_BUSY, nothing stored (AC 39)', async () => {
  const { id, cl } = await describeSetup(live);
  h.sdk.on('msgSecCheck', async () => { const e = new Error('61010 user access time over'); e.errCode = 61010; throw e; });
  const r = await F.submit(h, B, id, cl.claimId, { text: '审核服务出错' });
  assert.equal(r.code, 'MODERATION_BUSY');
  assert.equal(h.db.all('steps').filter((s) => s.chainId === id).length, 1);
  assert.equal(h.db.get('chains', id).passed, 1);
  h.sdk.on('msgSecCheck', async () => ({ result: {} })); // malformed: no suggest -> still fail closed
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '返回结构不对' })).code, 'MODERATION_BUSY');
  h.sdk.on('msgSecCheck', () => new Promise(() => {})); // never answers
  const t0 = Date.now();
  const slow = await F.submit(h, B, id, cl.claimId, { text: '一直没有回应' });
  assert.equal(slow.code, 'MODERATION_BUSY');
  assert.ok(Date.now() - t0 < 6000);
  assert.equal(h.db.get('chains', id).passed, 1);
});

test('local rejection: contact, digits, URL, emoji, blocklist, length -> TEXT_REJECTED, no API call, no strike (AC 34, 35)', async () => {
  const { id, cl } = await describeSetup(live);
  const bad = ['加我微信聊', '我的号码是12345', '看 www.baidu.com', '去 abc.com 吧', '一二三四五六七', '猫猫😀猫猫', '测试敏感词出现', '好', '这是一句非常非常非常非常长的描述文字', '联系 qq 群', 'vx 号'];
  for (const text of bad) {
    h.advance(6000);
    const r = await F.submit(h, B, id, cl.claimId, { text });
    assert.equal(r.code, 'TEXT_REJECTED', text);
  }
  assert.equal(h.sdk.count('msgSecCheck'), 0);
  assert.equal((h.db.get('players', B).strikes || []).length, 0);
  assert.equal(h.db.all('mod_log').length, 0);
});

test('a blocked custom prompt creates no chain; a passed one is stored custom (AC 40)', async () => {
  h = createHarness({ env: live });
  await F.player(h, A);
  h.sdk.on('msgSecCheck', async () => ({ result: { suggest: 'review' } }));
  const r = await h.call('createChain', { customText: '不太合适的题' }, { openid: A });
  assert.equal(r.code, 'TEXT_BLOCKED');
  assert.equal(h.db.all('chains').length, 0);
  assert.equal(h.sdk.calls.msgSecCheck[0].scene, 3);
  h.sdk.on('msgSecCheck', async () => ({ result: { suggest: 'pass' } }));
  h.advance(1000);
  const ok = await h.call('createChain', { customText: '会飞的西瓜' }, { openid: A });
  assert.equal(ok.ok, true);
  const chain = h.db.get('chains', ok.chainId);
  assert.equal(chain.custom, true);
  assert.equal(chain.promptText, '会飞的西瓜');
  // a risky one adds a strike
  h.sdk.on('msgSecCheck', async () => ({ result: { suggest: 'risky' } }));
  h.advance(1000);
  assert.equal((await h.call('createChain', { customText: '危险的题目' }, { openid: A })).code, 'TEXT_BLOCKED');
  assert.equal(h.db.get('players', A).strikes.length, 1);
  // busy: nothing created
  h.sdk.on('msgSecCheck', async () => { throw new Error('down'); });
  h.advance(1000);
  assert.equal((await h.call('createChain', { customText: '服务挂了题' }, { openid: A })).code, 'MODERATION_BUSY');
});

test('mock mode drives the same paths for tests: 测试违规 / 测试复审 / 测试繁忙 (spec 6.6)', async () => {
  const { id, cl } = await describeSetup({});
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '测试违规啦' })).code, 'TEXT_BLOCKED');
  assert.equal(h.db.get('players', B).strikes.length, 1);
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '测试复审啦' })).code, 'TEXT_BLOCKED');
  assert.equal(h.db.get('players', B).strikes.length, 1, 'review: no strike');
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '测试繁忙啦' })).code, 'MODERATION_BUSY');
  assert.equal(h.sdk.count('msgSecCheck'), 0, 'mock never calls the API');
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '正常的话啦' })).state, 'passed');
});

// ------------------------------------------------------------------ drawings

test('a drawing uploads the server PNG and calls mediaCheckAsync v2 (media_type 2, scene 3, openid, temp url); the step is pending (AC 42)', async () => {
  const { c, s, step } = await liveDrawing();
  assert.equal(s.state, 'pending');
  const up = h.sdk.calls.uploadFile[0];
  assert.equal(up.cloudPath, `chuanhua/mod/202611/${c.chainId}/1_1.png`);
  assert.equal(up.fileContent.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(h.sdk.calls.getTempFileURL[0].fileList[0].maxAge, 7200);
  const call = h.sdk.calls.mediaCheckAsync[0];
  assert.equal(call.mediaType, 2);
  assert.equal(call.version, 2);
  assert.equal(call.scene, 3);
  assert.equal(call.openid, A);
  assert.match(call.mediaUrl, /^https:\/\/tmp\.example\//);
  assert.equal(step.state, 'pending');
  assert.deepEqual(step.mod.traceIds, ['trace1']);
  assert.equal(h.db.get('mod_traces', 'trace1').stepId, step._id);
  assert.equal(h.db.get('chains', c.chainId).state, 'pending');
});

test('no content of a pending 棒 is returned to anyone but its author (AC 43, 49)', async () => {
  const { gref, c } = await liveDrawing();
  const probes = [
    await F.claim(h, B, c.chainId, gref),
    await h.call('getChain', { chainId: c.chainId, groupRef: gref }, { openid: B }),
    await h.call('getReveal', { chainId: c.chainId }, { openid: B }),
    await h.call('getGroupChains', { groupRef: gref }, { openid: B }),
    await h.call('getMyChains', {}, { openid: B }),
  ];
  for (const p of probes) assert.ok(!/strokes/.test(JSON.stringify(p)), JSON.stringify(p));
  // the author sees it, marked pending
  const mine = await h.call('getMyChains', { chainId: c.chainId }, { openid: A });
  assert.equal(mine.items[0].mine[0].modState, 'pending');
  assert.ok(mine.items[0].mine[0].strokes);
  const list = await h.call('getMyChains', {}, { openid: A });
  assert.equal(list.items[0].status, 'pending');
});

test('onMediaCheck: pass opens the next 棒; review blocks (no strike); risky blocks with a strike; the 棒 reopens (AC 44)', async () => {
  const { gref, c, step } = await liveDrawing();
  const r = await h.call('onMediaCheck', evt(step.mod.traceIds[0], 'pass'));
  assert.equal(r, 'success');
  assert.equal(h.db.get('steps', step._id).state, 'passed');
  assert.equal(h.db.get('chains', c.chainId).state, 'open');
  assert.equal((await F.claim(h, B, c.chainId, gref)).kind, 'describe');

  for (const [suggest, strikes] of [['review', 0], ['risky', 1]]) {
    h = createHarness({ env: live });
    const x = await liveDrawing();
    await h.call('onMediaCheck', evt(x.step.mod.traceIds[0], suggest));
    const st = h.db.get('steps', x.step._id);
    assert.equal(st.state, 'blocked');
    assert.equal((h.db.get('players', A).strikes || []).length, strikes);
    const ch = h.db.get('chains', x.c.chainId);
    assert.equal(ch.state, 'open');
    assert.equal(ch.nextStep, 1, 'the same 棒 reopens');
    assert.equal(ch.perPersonCount[A], undefined, 'blocked attempts do not count');
    // nobody learns of the block: the entry just shows an open 棒; the author sees the status
    const view = await h.call('getChain', { chainId: x.c.chainId, groupRef: x.gref }, { openid: B });
    assert.equal(view.state, 'claimable');
    assert.ok(!JSON.stringify(view).includes('block'));
    const mine = await h.call('getMyChains', { chainId: x.c.chainId }, { openid: A });
    assert.equal(mine.items[0].mine[0].modState, 'blocked');
  }
});

test('onMediaCheck is idempotent per trace id, ignores unknown traces and rejects client calls (AC 45)', async () => {
  const { step } = await liveDrawing();
  const trace = step.mod.traceIds[0];
  await h.call('onMediaCheck', evt(trace, 'risky'));
  await h.call('onMediaCheck', evt(trace, 'risky'));
  await h.call('onMediaCheck', evt(trace, 'pass')); // a conflicting replay changes nothing either
  assert.equal(h.db.get('players', A).strikes.length, 1);
  assert.equal(h.db.get('steps', step._id).state, 'blocked');
  assert.equal(await h.call('onMediaCheck', evt('nosuchtrace', 'pass')), 'success');
  assert.equal(h.db.all('mod_traces').length, 1);
  const client = await h.call('onMediaCheck', evt(trace, 'pass'), { openid: B });
  assert.equal(client.code, 'FORBIDDEN');
  // an unusable verdict (platform error) leaves the step pending
  const y = await F.create(h, B, {});
  await F.submit(h, B, y.chainId, y.claim.claimId, { strokes: F.strokes(2) });
  const t2 = h.db.get('steps', `${y.chainId}_1_1`).mod.traceIds[0];
  await h.call('onMediaCheck', { Event: 'wxa_media_check', trace_id: t2, errcode: 87014 });
  assert.equal(h.db.get('steps', `${y.chainId}_1_1`).state, 'pending');
});

test('no verdict for 35 min: exactly one re-check, then void with no strike and the allowance restored; late risky strikes only (AC 46, 48)', async () => {
  const { gref, c, step } = await liveDrawing();
  const startsBefore = (await h.call('getHome', {}, { openid: A })).me.startsLeft;
  assert.equal(startsBefore, 2);
  h.advance(34 * 60000);
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('mediaCheckAsync'), 1, 'not yet');
  h.advance(2 * 60000);
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('mediaCheckAsync'), 2, 'one re-check');
  assert.deepEqual(h.db.get('steps', step._id).mod.traceIds, ['trace1', 'trace2']);
  assert.equal(h.db.get('steps', step._id).state, 'pending');
  h.advance(10 * 60000);
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('mediaCheckAsync'), 2, 'never a second re-check');
  h.advance(26 * 60000);
  await h.call('modSweeper', {});
  const st = h.db.get('steps', step._id);
  assert.equal(st.state, 'void');
  assert.equal((h.db.get('players', A).strikes || []).length, 0);
  assert.equal((await h.call('getHome', {}, { openid: A })).me.startsLeft, 3, 'start restored');
  const ch = h.db.get('chains', c.chainId);
  assert.equal(ch.state, 'open');
  assert.equal(ch.nextStep, 1);
  const mine = await h.call('getMyChains', { chainId: c.chainId }, { openid: A });
  assert.equal(mine.items[0].mine[0].modState, 'void');
  assert.equal((await F.claim(h, B, c.chainId, gref)).ok, true, 'the 棒 reopens for others');
  // a late risky verdict: strike, no visibility change
  await h.call('onMediaCheck', evt('trace2', 'risky'));
  assert.equal(h.db.get('players', A).strikes.length, 1);
  assert.equal(h.db.get('steps', step._id).state, 'void');
  // a late pass changes nothing
  await h.call('onMediaCheck', evt('trace1', 'pass'));
  assert.equal(h.db.get('steps', step._id).state, 'void');
});

test('mediaCheckAsync call errors are retried by modSweeper at most twice, then void; never visible meanwhile (AC 47)', async () => {
  h = createHarness({ env: live });
  h.sdk.on('mediaCheckAsync', async () => { throw new Error('quota'); });
  const { gref, c, step } = await liveDrawing();
  assert.equal(h.db.get('steps', step._id).mod.callFailed, true);
  assert.equal(h.sdk.count('mediaCheckAsync'), 1);
  h.advance(4 * 60000);
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('mediaCheckAsync'), 1, 'not before +5 min');
  h.advance(2 * 60000);
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('mediaCheckAsync'), 2, 'retry 1');
  assert.equal(h.db.get('steps', step._id).state, 'pending');
  assert.equal((await F.claim(h, B, c.chainId, gref)).code, 'PENDING');
  h.advance(6 * 60000);
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('mediaCheckAsync'), 3, 'retry 2');
  assert.equal(h.db.get('steps', step._id).state, 'void');
  h.advance(60 * 60000);
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('mediaCheckAsync'), 3, 'no further calls');
  assert.equal((h.db.get('players', A).strikes || []).length, 0);
});

test('mock images: 13 strokes risky, 14 review, 15 no verdict (-> timeout paths), else pass; same verdict path (spec 6.6)', async () => {
  h = createHarness();
  const gref = await F.player(h, A);
  const outcomes = {};
  for (const n of [3, 13, 14]) {
    h.advance(61000);
    const c = await F.create(h, A, { groupRef: gref });
    await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes(n) });
    await F.sweep(h, 61000);
    outcomes[n] = h.db.get('steps', `${c.chainId}_1_1`).state;
    h.advance(61000);
  }
  assert.deepEqual(outcomes, { 3: 'passed', 13: 'blocked', 14: 'blocked' });
  assert.equal(h.db.get('players', A).strikes.length, 1, 'only 13 (risky) strikes');
  assert.equal(h.sdk.count('mediaCheckAsync'), 0, 'mock never calls the API');
  await h.call('grantReward', { kind: 'start', noFill: false }, { openid: A });
  const c15 = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c15.chainId, c15.claim.claimId, { strokes: F.strokes(15) });
  await F.sweep(h, 61000);
  assert.equal(h.db.get('steps', `${c15.chainId}_1_1`).state, 'pending');
  await F.sweep(h, 36 * 60000);
  await F.sweep(h, 36 * 60000);
  assert.equal(h.db.get('steps', `${c15.chainId}_1_1`).state, 'void');
});

test('legacy sync route (MEDIA_CHECK_ROUTE=sync): imgSecCheck decides immediately; 87014 is risky', async () => {
  h = createHarness({ env: { ...live, MEDIA_CHECK_ROUTE: 'sync' } });
  const gref = await F.player(h, A);
  await F.player(h, B);
  const c = await F.create(h, A, { groupRef: gref });
  const s = await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes() });
  assert.equal(s.state, 'passed');
  assert.equal(h.sdk.count('mediaCheckAsync'), 0);
  assert.equal(h.sdk.calls.imgSecCheck[0].media.contentType, 'image/png');
  h.sdk.on('imgSecCheck', async () => { const e = new Error('87014 risky content'); e.errCode = 87014; throw e; });
  h.advance(61000);
  const id = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  const cl = await F.claim(h, A, id, gref);
  const s2 = await F.submit(h, A, id, cl.claimId, { strokes: F.strokes() });
  assert.equal(s2.state, 'blocked');
  assert.equal(h.db.get('players', A).strikes.length, 1);
});

// ------------------------------------------------------------------ push parsing and the HTTP route

test('callback parsing: result, detail fallback (worst wins), platform error', async () => {
  h = createHarness();
  const { parseMediaCallback: p } = h.mod('common/moderation.js');
  assert.deepEqual(p(evt('t', 'risky', 20006)), { traceId: 't', suggest: 'risky', label: 20006 });
  const detailOnly = { Event: 'wxa_media_check', trace_id: 't', errcode: 0, detail: [{ suggest: 'pass', label: 100 }, { suggest: 'review', label: 20002 }] };
  assert.equal(p(detailOnly).suggest, 'review');
  assert.deepEqual(p({ Event: 'wxa_media_check', trace_id: 't', errcode: 87014 }), { traceId: 't', error: true });
  assert.equal(p({ Event: 'other', trace_id: 't' }), null);
  assert.equal(p({ Event: 'wxa_media_check' }), null);
  assert.deepEqual(p({ Event: 'wxa_media_check', trace_id: 't', result: { suggest: 'weird' } }), { traceId: 't', error: true });
});

test('HTTP access service fallback: token signature, echostr handshake, secure-mode decrypt', async () => {
  const { step, c } = await liveDrawing();
  const pushLib = h.mod('common/push.js');
  h.setEnv('PUSH_TOKEN', 'tok123');
  const ts = '1700000000';
  const nonce = 'n0nce';
  const sig = pushLib.sha1Sorted(['tok123', ts, nonce]);
  const mk = (httpMethod, q, body) => ({ httpMethod, queryStringParameters: q, body: body === undefined ? undefined : JSON.stringify(body), headers: {} });
  // GET handshake
  const hs = await h.call('onMediaCheck', mk('GET', { signature: sig, timestamp: ts, nonce, echostr: 'hello' }));
  assert.equal(hs.statusCode, 200);
  assert.equal(hs.body, 'hello');
  assert.equal((await h.call('onMediaCheck', mk('GET', { signature: 'bad', timestamp: ts, nonce, echostr: 'hello' }))).statusCode, 403);
  // POST with a bad signature is refused and changes nothing
  const trace = step.mod.traceIds[0];
  assert.equal((await h.call('onMediaCheck', mk('POST', { signature: 'bad', timestamp: ts, nonce }, evt(trace, 'pass')))).statusCode, 403);
  assert.equal(h.db.get('steps', step._id).state, 'pending');
  // good signature applies the verdict
  const ok = await h.call('onMediaCheck', mk('POST', { signature: sig, timestamp: ts, nonce }, evt(trace, 'pass')));
  assert.equal(ok.statusCode, 200);
  assert.equal(h.db.get('steps', step._id).state, 'passed');
  // secure mode: msg_signature over (token, ts, nonce, Encrypt), AES-256-CBC payload
  const aes = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '');
  h.setEnv('PUSH_AES_KEY', aes);
  const y = await F.create(h, B, {});
  await F.submit(h, B, y.chainId, y.claim.claimId, { strokes: F.strokes(2) });
  const t2 = h.db.get('steps', `${y.chainId}_1_1`).mod.traceIds[0];
  const enc = pushLib.encryptPayload(aes, JSON.stringify(evt(t2, 'risky')), 'wxappid');
  const msig = pushLib.sha1Sorted(['tok123', ts, nonce, enc]);
  const sec = await h.call('onMediaCheck', mk('POST', { msg_signature: msig, timestamp: ts, nonce }, { Encrypt: enc }));
  assert.equal(sec.statusCode, 200);
  assert.equal(h.db.get('steps', `${y.chainId}_1_1`).state, 'blocked');
  assert.equal((await h.call('onMediaCheck', mk('POST', { msg_signature: 'bad', timestamp: ts, nonce }, { Encrypt: enc }))).statusCode, 403);
  // no token configured: never trust
  h.setEnv('PUSH_TOKEN', undefined);
  assert.equal((await h.call('onMediaCheck', mk('POST', { signature: sig, timestamp: ts, nonce }, evt(trace, 'pass')))).statusCode, 500);
  void c;
});

test('PUSH_ALLOW_OPENID=1 lets a platform push that carries an OPENID through (V1 switch); trace ids stay the secret', async () => {
  const { step } = await liveDrawing();
  h.setEnv('PUSH_ALLOW_OPENID', '1');
  assert.equal(await h.call('onMediaCheck', evt(step.mod.traceIds[0], 'pass'), { openid: 'oPlatformPush', source: 'wx_push' }), 'success');
  assert.equal(h.db.get('steps', step._id).state, 'passed');
});

// ------------------------------------------------------------------ fail closed, kill switches, quotas

test('mock moderation in prod: every UGC function returns SERVER_CONFIG and logs [ALERT] (AC 51)', async () => {
  const cap = captureAlerts();
  try {
    h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'mock' } });
    const gref = await F.player(h, A);
    const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
    await F.player(h, B);
    assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: A })).code, 'SERVER_CONFIG');
    assert.equal((await F.claim(h, B, id, gref)).code, 'SERVER_CONFIG');
    assert.equal((await F.submit(h, B, id, 'ABCDEFGHIJKL', { text: '不会被接受' })).code, 'SERVER_CONFIG');
    assert.ok(cap.logs.filter((l) => l.includes('[ALERT]')).length >= 3);
    // an unset ENV_KIND counts as prod
    h.teardown();
    h = createHarness({ env: { ENV_KIND: '', MODERATION_MODE: 'mock' } });
    await F.player(h, A);
    assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: A })).code, 'SERVER_CONFIG');
    // prod + live is fine
    h.teardown();
    h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } });
    await F.player(h, A);
    assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: A })).ok, true);
  } finally { cap.restore(); }
});

test('dev live mode: msgSecCheck at most MOD_TEXT_DAILY_BUDGET per day, then MODERATION_BUSY (AC 52)', async () => {
  h = createHarness({ env: { ...live, MOD_TEXT_DAILY_BUDGET: '3' } });
  const gref = await F.player(h, A);
  await F.player(h, B);
  const results = [];
  for (let i = 0; i < 5; i++) {
    h.advance(1000);
    const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
    const cl = await F.claim(h, B, id, gref);
    results.push((await F.submit(h, B, id, cl.claimId, { text: `第${i}句话` })).state || 'busy');
  }
  assert.deepEqual(results, ['passed', 'passed', 'passed', 'busy', 'busy']);
  assert.equal(h.sdk.count('msgSecCheck'), 3);
  h.setNow(Date.UTC(2026, 10, 4, 4, 0, 0)); // next day
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const cl = await F.claim(h, B, id, gref);
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '新的一天' })).state, 'passed');
});

test('createEnabled=false blocks create/claim/submit within 10 s; viewing revealed chains still works (AC 53)', async () => {
  h = createHarness();
  const gref = await F.player(h, A);
  await F.player(h, B);
  const rev = await F.completeChain(h, A, B, gref);
  const open = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  await h.call('admin', { op: 'setUgc', createEnabled: false });
  h.advance(10500);
  assert.equal((await F.claim(h, B, open, gref)).code, 'UGC_PAUSED');
  assert.equal((await h.call('createChain', { promptId: 'A02' }, { openid: B })).code, 'UGC_PAUSED');
  assert.equal((await h.call('getReveal', { chainId: rev }, { openid: A })).ok, true);
  const home = await h.call('getHome', {}, { openid: A });
  assert.equal(home.ugc.createEnabled, false);
  assert.equal(home.ugc.viewEnabled, true);
});

test('viewEnabled=false: claimStep and getReveal return placeholders and no content (AC 54)', async () => {
  h = createHarness();
  const gref = await F.player(h, A);
  await F.player(h, B);
  const rev = await F.completeChain(h, A, B, gref);
  const open = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  await h.call('admin', { op: 'setUgc', viewEnabled: false });
  h.advance(10500);
  const cl = await F.claim(h, B, open, gref);
  assert.equal(cl.ok, true);
  assert.equal(cl.placeholder, 'paused');
  assert.deepEqual(cl.prev, { kind: "paused" });
  assert.equal(h.db.get('chains', open).claim, null, 'no lock is taken while viewing is off');
  const rv = await h.call('getReveal', { chainId: rev }, { openid: A });
  assert.equal(rv.state, 'paused');
  assert.ok(rv.steps.every((s) => s.placeholder === 'paused' && !s.text && !s.strokes));
  assert.equal(rv.promptText, null);
  const gc = await h.call('getGroupChains', { groupRef: gref }, { openid: A });
  assert.ok(gc.revealed.every((r) => r.promptText === null && r.finalText === null));
  await h.call('admin', { op: 'setUgc', viewEnabled: true });
  h.advance(10500);
  assert.ok((await h.call('getReveal', { chainId: rev }, { openid: A })).steps[0].strokes);
});

test('circuit breaker: >= 50% failures over >= 20 calls in 5 min pauses creation for 15 min with an [ALERT] (AC 55)', async () => {
  const cap = captureAlerts();
  try {
    h = createHarness({ env: live });
    await F.player(h, A);
    h.sdk.on('msgSecCheck', async () => { throw new Error('down'); });
    const gref = await F.player(h, B);
    for (let i = 0; i < 12; i++) {
      const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
      const cl = await F.claim(h, B, id, gref);
      assert.equal((await F.submit(h, B, id, cl.claimId, { text: `失败${i}号` })).code, 'MODERATION_BUSY');
      h.advance(7000);
    }
    await h.call('modSweeper', {});
    assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: A })).ok, true, 'under 20 calls: no trip');
    for (let i = 0; i < 12; i++) {
      const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
      const cl = await F.claim(h, B, id, gref);
      await F.submit(h, B, id, cl.claimId, { text: `再失败${i}` });
      h.advance(5000);
    }
    const r = await h.call('modSweeper', {});
    assert.equal(r.breaker.tripped, true);
    assert.ok(cap.logs.some((l) => l.includes('[ALERT]') && l.includes('circuit breaker')));
    h.advance(11000);
    h.sdk.on('msgSecCheck', async () => ({ result: { suggest: 'pass' } }));
    assert.equal((await h.call('createChain', { promptId: 'A02' }, { openid: A })).code, 'UGC_PAUSED');
    h.advance(15 * 60000);
    assert.equal((await h.call('createChain', { promptId: 'A03' }, { openid: A })).ok, true);
  } finally { cap.restore(); }
});

test('image quota: alert at 70%, UGC_BUSY for new chains at 95% (claims continue), MODERATION_BUSY for drawings at 100% (AC 56)', async () => {
  const cap = captureAlerts();
  try {
    h = createHarness({ env: live });
    const gref = await F.player(h, A);
    await F.player(h, B);
    const dk = '20261103';
    h.db.put('mod_quota', { _id: dk, text: 0, image: 140000, errors: 0 });
    await h.call('modSweeper', {});
    assert.ok(cap.logs.some((l) => l.includes('[ALERT]') && l.includes('70%')));
    assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: A })).ok, true, 'below 95%');
    h.db.put('mod_quota', { _id: dk, text: 0, image: 190000, errors: 0 });
    h.advance(1000);
    assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: A })).code, 'UGC_BUSY');
    const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
    assert.equal((await F.claim(h, B, id, gref)).ok, true, 'claims of existing chains continue');
    h.db.put('mod_quota', { _id: dk, text: 0, image: 200000, errors: 0 });
    const id3 = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
    const cl = await F.claim(h, A, id3, gref);
    const r = await F.submit(h, A, id3, cl.claimId, { strokes: F.strokes() });
    assert.equal(r.code, 'MODERATION_BUSY');
    assert.equal(h.db.all('steps').filter((s) => s.chainId === id3).length, 2, 'nothing stored');
    assert.equal(h.sdk.count('mediaCheckAsync'), 0);
  } finally { cap.restore(); }
});
