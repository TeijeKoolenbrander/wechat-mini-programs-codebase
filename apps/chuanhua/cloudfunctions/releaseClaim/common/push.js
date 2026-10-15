'use strict';
// WeChat message-push helpers for the HTTP-access-service fallback of onMediaCheck (spec 16.1 V1 fallback (a)):
// signature check (token), optional AES-256-CBC decrypt (EncodingAESKey), echostr handshake.
// The primary route (cloud-function message push) delivers the JSON message directly as `event`.
const crypto = require('crypto');
const { sha1hex } = require('./util');

function sha1Sorted(parts) {
  return sha1hex([...parts].map(String).sort().join(''));
}

/** Plain mode: signature = sha1(sort(token, timestamp, nonce)). Secure mode adds the encrypted payload. */
function verifySignature({ token, timestamp, nonce, signature, encrypted }) {
  if (!token || !timestamp || !nonce || !signature) return false;
  const expected = sha1Sorted(encrypted ? [token, timestamp, nonce, encrypted] : [token, timestamp, nonce]);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Decrypt a WeChat secure-mode payload: base64(AES-256-CBC(random16 + len32BE + msg + appid)). */
function decryptPayload(encodingAesKey, encrypted) {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) throw new Error('bad EncodingAESKey');
  const d = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  d.setAutoPadding(false);
  let buf = Buffer.concat([d.update(Buffer.from(encrypted, 'base64')), d.final()]);
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) throw new Error('bad padding');
  buf = buf.subarray(0, buf.length - pad);
  const len = buf.readUInt32BE(16);
  return buf.subarray(20, 20 + len).toString('utf8');
}

/** Encrypt (used by tests to produce realistic secure-mode payloads). */
function encryptPayload(encodingAesKey, message, appid) {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  const msg = Buffer.from(message, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(msg.length);
  let buf = Buffer.concat([crypto.randomBytes(16), len, msg, Buffer.from(appid || '', 'utf8')]);
  const pad = 32 - (buf.length % 32);
  buf = Buffer.concat([buf, Buffer.alloc(pad, pad)]);
  const c = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  c.setAutoPadding(false);
  return Buffer.concat([c.update(buf), c.final()]).toString('base64');
}

module.exports = { verifySignature, decryptPayload, encryptPayload, sha1Sorted };
