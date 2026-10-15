'use strict';
// Input validation. Everything the client sends is untrusted.
const { fail, isInt, isDateKey } = require('./util');

const ROUND_ID_RE = /^[A-Z2-7]{8}$/;
const GROUP_REF_RE = /^[0-9a-f]{16}$/;
const ITEM_ID_RE = /^s\d{3}i\d{2}$/;
const SPECTRUM_ID_RE = /^s\d{3}$/;
const REPORT_REASONS = ['unsuitable', 'ambiguous', 'typo'];
const CLUE_MODES = ['preset', 'chat'];

function dateKey(v) {
  if (!isDateKey(v)) fail('INVALID_INPUT', 'bad dateKey');
  return v;
}
function optDateKey(v) {
  if (v === undefined || v === null) return null;
  return dateKey(v);
}
function cardIdx(v) {
  if (!isInt(v, 0, 4)) fail('INVALID_INPUT', 'bad idx');
  return v;
}
/** integer position 0-100 (no floats, no strings, no NaN) */
function pos(v) {
  if (!isInt(v, 0, 100)) fail('INVALID_INPUT', 'bad pos');
  return v;
}
function optGroupRef(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !GROUP_REF_RE.test(v)) fail('INVALID_INPUT', 'bad groupRef');
  return v;
}
function groupRef(v) {
  const r = optGroupRef(v);
  if (!r) fail('INVALID_INPUT', 'groupRef required');
  return r;
}
function roundId(v) {
  if (typeof v !== 'string' || !ROUND_ID_RE.test(v)) fail('INVALID_INPUT', 'bad roundId');
  return v;
}
function spectrumId(v) {
  if (typeof v !== 'string' || !SPECTRUM_ID_RE.test(v)) fail('INVALID_INPUT', 'bad spectrumId');
  return v;
}
function itemId(v) {
  if (typeof v !== 'string' || !ITEM_ID_RE.test(v)) fail('INVALID_INPUT', 'bad itemId');
  return v;
}
function clueMode(v) {
  if (!CLUE_MODES.includes(v)) fail('INVALID_INPUT', 'bad clueMode');
  return v;
}
function reportReason(v) {
  if (!REPORT_REASONS.includes(v)) fail('INVALID_INPUT', 'bad reason');
  return v;
}
function limit(v, def, max) {
  if (v === undefined || v === null) return def;
  if (!isInt(v, 1, max)) fail('INVALID_INPUT', 'bad limit');
  return v;
}

module.exports = {
  ROUND_ID_RE, GROUP_REF_RE, REPORT_REASONS, CLUE_MODES,
  dateKey, optDateKey, cardIdx, pos, optGroupRef, groupRef, roundId, spectrumId, itemId, clueMode, reportReason, limit,
};
