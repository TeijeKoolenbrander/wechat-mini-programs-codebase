'use strict';
// Input validation. Everything the client sends is untrusted.
const { fail, isInt } = require('./util');

const CHAIN_ID_RE = /^[A-Z2-7]{10}$/;
const CLAIM_ID_RE = /^[A-Z2-7]{12}$/;
const GROUP_REF_RE = /^[0-9a-f]{16}$/;
const PROMPT_ID_RE = /^[A-Za-z0-9_]{1,16}$/;
const REASONS = ['porn', 'politics', 'abuse', 'ad', 'other'];

function bad(what) {
  fail('BAD_INPUT', `bad ${what}`);
}
function chainId(v) {
  if (typeof v !== 'string' || !CHAIN_ID_RE.test(v)) bad('chainId');
  return v;
}
function claimId(v) {
  if (typeof v !== 'string' || !CLAIM_ID_RE.test(v)) bad('claimId');
  return v;
}
function optGroupRef(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !GROUP_REF_RE.test(v)) bad('groupRef');
  return v;
}
function groupRef(v) {
  const g = optGroupRef(v);
  if (!g) bad('groupRef');
  return g;
}
function promptId(v) {
  if (typeof v !== 'string' || !PROMPT_ID_RE.test(v)) bad('promptId');
  return v;
}
function stepNo(v, min = 1) {
  if (!isInt(v, min, 6)) bad('step');
  return v;
}
function reason(v) {
  if (!REASONS.includes(v)) bad('reason');
  return v;
}
function optInt(v, min, max, dflt) {
  if (v === undefined || v === null) return dflt;
  if (!isInt(v, min, max)) bad('number');
  return v;
}

module.exports = { chainId, claimId, optGroupRef, groupRef, promptId, stepNo, reason, optInt, REASONS, CHAIN_ID_RE };
