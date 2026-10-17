'use strict';
// onMediaCheck: the `wxa_media_check` push handler (spec 6.3 step 6, V1). Server-only: a call that carries an OPENID (a
// client) gets FORBIDDEN (AC 45). Idempotent per trace_id; unknown traces are ignored; the verdict logic is shared with
// modSweeper's mock delivery (common/verdict.js).
//   Primary route:  console 云开发 > 消息推送 (or the MP message-push config) routes event wxa_media_check to THIS function
//                   (deployed as chuanhua_onMediaCheck); the event is the pushed message; the function returns 'success'.
//   Fallback (a):   the HTTP access service URL of this function is the push URL; requests are signature-checked with
//                   PUSH_TOKEN (PUSH_AES_KEY for the encrypted mode) and answered as an HTTP response object.
const store = require('./common/store');
const env = require('./common/env');
const push = require('./common/push');
const verdict = require('./common/verdict');

async function handleMessage(msg) {
  env.ugcGuard(); // mock moderation in production: refuse to apply verdicts and alert (AC 51)
  const m = push.normalize(msg);
  if (!m) {
    console.warn('onMediaCheck: not a wxa_media_check message');
    return;
  }
  const r = await verdict.applyImageVerdict(m);
  if (r.ignored) console.warn('onMediaCheck ignored', r.ignored);
}

function httpResp(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: String(body) };
}

exports.main = store.handler(async (event) => {
  if (event.httpMethod) {
    const r = push.fromHttp(event, { token: process.env.PUSH_TOKEN, aesKey: process.env.PUSH_AES_KEY });
    if (r.status !== 200) {
      console.error('[ALERT] onMediaCheck HTTP push rejected: ' + r.reason);
      return httpResp(r.status, r.reason);
    }
    if (r.kind === 'echo') return httpResp(200, r.body);
    try {
      await handleMessage(r.msg);
    } catch (e) {
      console.error('onMediaCheck failed', store.errText(e));
      return httpResp(500, 'error'); // the platform retries
    }
    return httpResp(200, 'success');
  }
  await handleMessage(event);
  return 'success';
}, { auth: false, serverOnly: true });
