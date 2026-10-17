'use strict';
// Message-push parsing for `wxa_media_check` (spec 6.3 step 6, V1, PO-33).
//   Primary route (cloud function message push): the platform invokes the function with the pushed message as the event.
//   Fallback (a): the function's HTTP access service URL is the push URL in the MP console. Then the event is an HTTP
//   request: GET = URL verification (echostr), POST = the message (JSON or XML, plain or AES-encrypted), and EVERY request
//   is authenticated with PUSH_TOKEN (sha1 of the sorted token, timestamp, nonce[, Encrypt]); PUSH_AES_KEY decrypts the
//   safe mode. Nothing is accepted from the HTTP route without a valid signature.
const crypto = require('crypto');

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

function timingSafeEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** WeChat signature: sha1 of the lexicographically sorted [token, timestamp, nonce, ...extra] joined */
function sign(token, timestamp, nonce, extra) {
  return sha1([token, timestamp, nonce].concat(extra ? [extra] : []).sort().join(''));
}

/** decrypt a safe-mode message (AES-256-CBC, key = base64(EncodingAESKey + '='), iv = key[0..16], PKCS#7 over 32) */
function decrypt(encrypt, encodingAesKey) {
  const key = Buffer.from(encodingAesKey + '=', 'base64');
  if (key.length !== 32) throw new Error('bad PUSH_AES_KEY');
  const d = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  d.setAutoPadding(false);
  let buf = Buffer.concat([d.update(Buffer.from(encrypt, 'base64')), d.final()]);
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) throw new Error('bad padding');
  buf = buf.subarray(0, buf.length - pad);
  const len = buf.readUInt32BE(16);
  return buf.subarray(20, 20 + len).toString('utf8');
}
/** the inverse, used by tests */
function encrypt(msg, encodingAesKey, appid) {
  const key = Buffer.from(encodingAesKey + '=', 'base64');
  const m = Buffer.from(msg, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(m.length);
  let buf = Buffer.concat([crypto.randomBytes(16), len, m, Buffer.from(appid || '', 'utf8')]);
  const pad = 32 - (buf.length % 32);
  buf = Buffer.concat([buf, Buffer.alloc(pad, pad)]);
  const c = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  c.setAutoPadding(false);
  return Buffer.concat([c.update(buf), c.final()]).toString('base64');
}

/** a flat XML message (<xml><Tag><![CDATA[v]]></Tag>...) to an object; nested <result>/<detail> are read as plain text fields */
function parseXml(xml) {
  const out = {};
  for (const m of xml.matchAll(/<([A-Za-z_][\w]*)>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/\1>/g)) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return out;
}
function parseBody(body) {
  const s = String(body || '').trim();
  if (!s) return null;
  if (s[0] === '{') return JSON.parse(s);
  if (s[0] === '<') return parseXml(s);
  return null;
}

const RANK = { pass: 0, review: 1, risky: 2 };
/**
 * A pushed `wxa_media_check` message -> {traceId, suggest, label} or null when it is not one. The overall verdict is
 * result.suggest; when only the per-strategy details are present the WORST one wins (fail closed).
 */
function normalize(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (msg.Event !== undefined && msg.Event !== 'wxa_media_check') return null;
  const traceId = msg.trace_id || msg.traceId;
  if (typeof traceId !== 'string' || !traceId) return null;
  let suggest = msg.result && msg.result.suggest;
  let label = msg.result && msg.result.label !== undefined ? msg.result.label : null;
  if (suggest === undefined && Array.isArray(msg.detail)) {
    let worst = null;
    for (const d of msg.detail) {
      if (d && RANK[d.suggest] !== undefined && (worst === null || RANK[d.suggest] > RANK[worst.suggest])) worst = d;
    }
    if (worst) {
      suggest = worst.suggest;
      label = worst.label === undefined ? null : worst.label;
    }
  }
  return { traceId, suggest, label };
}

/**
 * HTTP access service request -> {status, kind:'echo', body} | {status, kind:'message', msg} | {status:403|400|500}.
 * @param {object} event the cloud function event of an HTTP trigger
 * @param {{token?:string, aesKey?:string}} secrets PUSH_TOKEN / PUSH_AES_KEY
 */
function fromHttp(event, secrets) {
  if (!secrets.token) return { status: 403, reason: 'PUSH_TOKEN not configured' };
  const q = event.queryStringParameters || {};
  const { signature, timestamp, nonce, echostr, msg_signature: msgSig } = q;
  if (typeof timestamp !== 'string' || typeof nonce !== 'string') return { status: 403, reason: 'missing signature fields' };
  const method = String(event.httpMethod || '').toUpperCase();
  if (method === 'GET') {
    if (typeof signature !== 'string' || !timingSafeEq(signature, sign(secrets.token, timestamp, nonce))) return { status: 403, reason: 'bad signature' };
    return { status: 200, kind: 'echo', body: String(echostr || '') };
  }
  if (method !== 'POST') return { status: 400, reason: 'method' };
  let raw = event.body;
  if (event.isBase64Encoded && typeof raw === 'string') raw = Buffer.from(raw, 'base64').toString('utf8');
  let body;
  try {
    body = parseBody(raw);
  } catch (e) {
    return { status: 400, reason: 'unparsable body' };
  }
  if (!body) return { status: 400, reason: 'empty body' };
  if (typeof body.Encrypt === 'string') {
    // safe mode: msg_signature covers the ciphertext
    if (!secrets.aesKey) return { status: 403, reason: 'PUSH_AES_KEY not configured' };
    if (typeof msgSig !== 'string' || !timingSafeEq(msgSig, sign(secrets.token, timestamp, nonce, body.Encrypt))) return { status: 403, reason: 'bad msg_signature' };
    try {
      body = parseBody(decrypt(body.Encrypt, secrets.aesKey));
    } catch (e) {
      return { status: 400, reason: 'decrypt failed' };
    }
    if (!body) return { status: 400, reason: 'empty message' };
    return { status: 200, kind: 'message', msg: body };
  }
  if (typeof signature !== 'string' || !timingSafeEq(signature, sign(secrets.token, timestamp, nonce))) return { status: 403, reason: 'bad signature' };
  return { status: 200, kind: 'message', msg: body };
}

module.exports = { sign, decrypt, encrypt, parseXml, parseBody, normalize, fromHttp };
