'use strict';
// V1 (the top risk): the `wxa_media_check` push reaches onMediaCheck by the primary route (message push to the cloud function)
// or the fallback (HTTP access service URL, signature-checked with PUSH_TOKEN, optionally AES-encrypted with PUSH_AES_KEY).
// Nothing is accepted from the HTTP route without a valid signature; secrets come from env vars only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHarness } = require('./helpers/harness');
const sync = require('../scripts/sync-core');
const push = require(path.join(sync.CF_ROOT, 'common', 'push'));

const P = 'chuanhua_';
const A = { openid: 'openid-A' };
const TOKEN = 'unit-test-token'; // test fixture, not a real secret
const AES_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'; // 43 chars, test fixture
const drawing = { v: 1, s: [[0, 1, 100, 100, 50, 50]] };

async function pending(h) {
  await h.call('agreeRules', { version: 2 }, A);
  const c = await h.call('createChain', { promptId: 'A01' }, A);
  await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing }, A);
  return { sid: c.chainId + '_1_1', trace: 'trace-1' };
}
const msg = (trace, suggest) => ({ ToUserName: 'gh_x', FromUserName: 'wx', CreateTime: 1, MsgType: 'event', Event: 'wxa_media_check', appid: 'wx', trace_id: trace, version: 2, result: { suggest, label: 100 }, detail: [{ strategy: 'content_model', errcode: 0, suggest, label: 100 }] });
const http = (method, q, body) => ({ httpMethod: method, queryStringParameters: q, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: {}, isBase64Encoded: false });
const q = (extra) => {
  const ts = '1793678400';
  const nonce = 'n0nce';
  return Object.assign({ timestamp: ts, nonce, signature: push.sign(TOKEN, ts, nonce) }, extra || {});
};

test('primary route: the pushed message is the event; onMediaCheck applies it and answers the string "success"', async () => {
  const h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } });
  try {
    const { sid, trace } = await pending(h);
    assert.equal(await h.call('onMediaCheck', msg(trace, 'pass')), 'success');
    assert.equal(h.db.get(P + 'steps', sid).state, 'passed');
  } finally { h.teardown(); }
});

test('fallback (a): GET URL verification answers the echostr only with a valid signature', async () => {
  const h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live', PUSH_TOKEN: TOKEN } });
  try {
    const ok = await h.call('onMediaCheck', http('GET', q({ echostr: 'hello-echo' })));
    assert.deepEqual([ok.statusCode, ok.body], [200, 'hello-echo']);
    const bad = await h.call('onMediaCheck', http('GET', Object.assign(q({ echostr: 'hello-echo' }), { signature: 'f'.repeat(40) })));
    assert.equal(bad.statusCode, 403);
    assert.ok(!String(bad.body).includes('hello-echo'));
  } finally { h.teardown(); }
});

test('fallback (a): a signed POST applies the verdict; a bad or missing signature, a missing token, or a client call apply nothing', async () => {
  const h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live', PUSH_TOKEN: TOKEN } });
  const err = console.error;
  console.error = () => {};
  try {
    const { sid, trace } = await pending(h);
    const state = () => h.db.get(P + 'steps', sid).state;
    // unsigned / tampered
    assert.equal((await h.call('onMediaCheck', http('POST', { timestamp: '1', nonce: 'x' }, msg(trace, 'pass')))).statusCode, 403);
    assert.equal((await h.call('onMediaCheck', http('POST', Object.assign(q(), { signature: '0'.repeat(40) }), msg(trace, 'pass')))).statusCode, 403);
    assert.equal((await h.call('onMediaCheck', http('POST', Object.assign(q(), { nonce: 'other' }), msg(trace, 'pass')))).statusCode, 403, 'the signature covers the nonce');
    assert.equal(state(), 'pending');
    // garbage bodies with a valid signature
    assert.equal((await h.call('onMediaCheck', http('POST', q(), 'not json'))).statusCode, 400);
    assert.equal((await h.call('onMediaCheck', http('POST', q(), ''))).statusCode, 400);
    assert.equal(state(), 'pending');
    // a client can never use the HTTP shape to reach the handler
    assert.equal((await h.call('onMediaCheck', http('POST', q(), msg(trace, 'pass')), A)).code, 'FORBIDDEN');
    assert.equal(state(), 'pending');
    // valid
    const r = await h.call('onMediaCheck', http('POST', q(), msg(trace, 'pass')));
    assert.deepEqual([r.statusCode, r.body], [200, 'success']);
    assert.equal(state(), 'passed');
    // replay: idempotent
    assert.equal((await h.call('onMediaCheck', http('POST', q(), msg(trace, 'risky')))).statusCode, 200);
    assert.equal(state(), 'passed');
    // no token configured: the HTTP route is closed
    h.setEnv('PUSH_TOKEN', undefined);
    assert.equal((await h.call('onMediaCheck', http('POST', q(), msg('trace-1', 'pass')))).statusCode, 403);
  } finally { console.error = err; h.teardown(); }
});

test('fallback (a), safe mode: AES-encrypted push with msg_signature over the ciphertext', async () => {
  const h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live', PUSH_TOKEN: TOKEN, PUSH_AES_KEY: AES_KEY } });
  const err = console.error;
  console.error = () => {};
  try {
    const { sid, trace } = await pending(h);
    const plain = JSON.stringify(msg(trace, 'review'));
    assert.equal(push.decrypt(push.encrypt(plain, AES_KEY, 'wx-appid'), AES_KEY), plain);
    const enc = push.encrypt(plain, AES_KEY, 'wx-appid');
    const ts = '1793678400';
    const nonce = 'abc';
    const sig = push.sign(TOKEN, ts, nonce, enc);
    const mk = (over) => http('POST', Object.assign({ timestamp: ts, nonce, msg_signature: sig }, over || {}), { Encrypt: enc });
    assert.equal((await h.call('onMediaCheck', mk({ msg_signature: 'e'.repeat(40) }))).statusCode, 403);
    assert.equal(h.db.get(P + 'steps', sid).state, 'pending');
    assert.equal((await h.call('onMediaCheck', mk())).statusCode, 200);
    assert.equal(h.db.get(P + 'steps', sid).state, 'blocked');
    // wrong key: the signature is fine but decryption fails -> 400, nothing applied
    h.setEnv('PUSH_AES_KEY', 'Z'.repeat(43));
    assert.equal((await h.call('onMediaCheck', mk())).statusCode, 400);
    // no key configured but an encrypted body arrives
    h.setEnv('PUSH_AES_KEY', undefined);
    assert.equal((await h.call('onMediaCheck', mk())).statusCode, 403);
  } finally { console.error = err; h.teardown(); }
});

test('push parsing: result.suggest, worst detail wins, XML bodies parse, non-media events are ignored', () => {
  assert.deepEqual(push.normalize(msg('t', 'risky')), { traceId: 't', suggest: 'risky', label: 100 });
  assert.deepEqual(push.normalize({ trace_id: 't', detail: [{ suggest: 'review', label: 1 }, { suggest: 'pass' }, { suggest: 'risky', label: 2 }] }), { traceId: 't', suggest: 'risky', label: 2 });
  assert.equal(push.normalize({ trace_id: 't', detail: [{ suggest: 'bogus' }] }).suggest, undefined, 'no verdict -> the caller treats it as not a verdict');
  assert.equal(push.normalize({ Event: 'other', trace_id: 't', result: { suggest: 'pass' } }), null);
  assert.equal(push.normalize({ result: { suggest: 'pass' } }), null);
  assert.equal(push.normalize(null), null);
  const x = push.parseXml('<xml><ToUserName><![CDATA[gh]]></ToUserName><Event><![CDATA[wxa_media_check]]></Event><trace_id>abc-1</trace_id></xml>');
  assert.deepEqual([x.Event, x.trace_id], ['wxa_media_check', 'abc-1']);
});

test('the push token and key are read from the environment only (no secret in the code base)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(sync.CF_ROOT, 'onMediaCheck', 'index.js'), 'utf8');
  assert.match(src, /process\.env\.PUSH_TOKEN/);
  assert.match(src, /process\.env\.PUSH_AES_KEY/);
  assert.doesNotMatch(src, /['"][A-Za-z0-9]{32,}['"]/);
});
