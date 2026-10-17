'use strict';
// Input validation helpers. Everything a client sends is untrusted: types, lengths and shapes are checked before use.
const { bad } = require('./errors');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** a chain id as sent by the client, or null (callers answer CHAIN_NOT_FOUND) */
function chainIdOf(d) {
  return d && typeof d.chainId === 'string' && ID_RE.test(d.chainId) ? d.chainId : null;
}
/** a claim id, or '' (never matches a claim) */
function claimIdOf(d) {
  return d && typeof d.claimId === 'string' && d.claimId.length <= 64 ? d.claimId : '';
}
const CLOUD_ID_RE = /^[A-Za-z0-9_-]{8,512}$/;
/**
 * The RAW cloudID string of wx.getGroupEnterInfo (joinGroup). Anything else is null: an object (a forged
 * {cloudID, data:{opengid}} or a platform-substituted wx.cloud.CloudID() payload), a number, a string with other characters.
 * Only the string is ever handed to cloud.getOpenData; `event.groupData` is never read (M1).
 */
function cloudIdOf(d) {
  return d && typeof d.cloudID === 'string' && CLOUD_ID_RE.test(d.cloudID) ? d.cloudID : null;
}
/** an integer in [lo, hi] or null */
function intIn(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}
function requireId(v) {
  if (typeof v !== 'string' || !ID_RE.test(v)) bad('BAD_REQUEST');
  return v;
}

module.exports = { ID_RE, cloudIdOf, chainIdOf, claimIdOf, intIn, requireId };
