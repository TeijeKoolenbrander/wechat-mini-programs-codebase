'use strict';
// onMediaCheck: receives the asynchronous mediaCheckAsync verdict (event `wxa_media_check`).
//
// PRIMARY route (V1, unverified in a mini game env): cloud-development message push. The platform
// invokes this function with the pushed JSON message as `event` (MsgType 'event', Event 'wxa_media_check').
// FALLBACK (a) (V1): MP message push -> the cloud environment's HTTP access service URL for this
// function. The event is then an HTTP request {httpMethod, queryStringParameters, body, ...}; we verify
// the token signature (PUSH_TOKEN) and, in secure mode, decrypt with PUSH_AES_KEY. The same handler
// serves both: nothing to switch except what the console is configured to call.
//
// Trust: trace ids never leave the server, so an unknown trace is ignored; a call that carries a client
// OPENID is rejected (FORBIDDEN) unless PUSH_ALLOW_OPENID=1 (set only if the device pass shows that
// platform pushes carry an OPENID). Idempotent per trace id.
const store = require('./common/store');
const push = require('./common/push');
const moderation = require('./common/moderation');
const { fail, isPlainObject } = require('./common/util');

function isHttpEvent(e) {
  return typeof e.httpMethod === 'string' || (isPlainObject(e.requestContext) && typeof e.path === 'string');
}
function httpReply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'text/plain' }, body, isBase64Encoded: false };
}

async function applyMessage(msg) {
  const p = moderation.parseMediaCallback(msg);
  if (!p) return { handled: false, reason: 'not_media_check' };
  if (p.error) {
    console.warn('wxa_media_check without a usable verdict; step stays pending', p.traceId);
    return { handled: false, reason: 'no_verdict' };
  }
  const r = await moderation.resolveVerdict({ traceId: p.traceId, suggest: p.suggest, label: p.label, source: 'push' });
  return { handled: true, ...r };
}

async function handleHttp(event) {
  const q = event.queryStringParameters || {};
  const token = process.env.PUSH_TOKEN;
  const aes = process.env.PUSH_AES_KEY;
  if (!token) return httpReply(500, 'PUSH_TOKEN not configured');
  const method = event.httpMethod.toUpperCase();
  const secure = !!q.msg_signature;
  if (method === 'GET') {
    // server-URL verification handshake
    const ok = secure
      ? push.verifySignature({ token, timestamp: q.timestamp, nonce: q.nonce, signature: q.msg_signature, encrypted: q.echostr })
      : push.verifySignature({ token, timestamp: q.timestamp, nonce: q.nonce, signature: q.signature });
    if (!ok) return httpReply(403, 'bad signature');
    return httpReply(200, secure ? push.decryptPayload(aes, q.echostr) : String(q.echostr || ''));
  }
  if (method !== 'POST') return httpReply(405, 'method not allowed');
  let body = event.body;
  if (event.isBase64Encoded && typeof body === 'string') body = Buffer.from(body, 'base64').toString('utf8');
  let msg;
  try {
    msg = typeof body === 'string' ? JSON.parse(body) : body;
  } catch (e) {
    return httpReply(400, 'bad body');
  }
  if (!isPlainObject(msg)) return httpReply(400, 'bad body');
  if (secure || msg.Encrypt) {
    if (!aes) return httpReply(500, 'PUSH_AES_KEY not configured');
    const ok = push.verifySignature({ token, timestamp: q.timestamp, nonce: q.nonce, signature: q.msg_signature, encrypted: msg.Encrypt });
    if (!ok) return httpReply(403, 'bad signature');
    try {
      msg = JSON.parse(push.decryptPayload(aes, msg.Encrypt));
    } catch (e) {
      return httpReply(400, 'bad payload');
    }
  } else if (!push.verifySignature({ token, timestamp: q.timestamp, nonce: q.nonce, signature: q.signature })) {
    return httpReply(403, 'bad signature');
  }
  await applyMessage(msg);
  return httpReply(200, 'success');
}

exports.main = store.handler(async (event, { openid }) => {
  if (isHttpEvent(event)) return handleHttp(event); // authenticated by the token signature, not by OPENID
  if (openid && process.env.PUSH_ALLOW_OPENID !== '1') fail('FORBIDDEN', 'push handler is not client-callable');
  await applyMessage(event);
  return 'success'; // the platform expects the literal string; unknown/duplicate traces are fine too
}, { auth: false });
