'use strict';
// Input validation. Everything the client sends is untrusted.
const { fail, isInt, isPlainObject, isDateKey } = require('./util');

const START_MODES = ['daily', 'challenge'];
const RUN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CHALLENGE_ID_RE = /^[A-Z2-7]{8}$/;
const FACT_ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const GROUP_REF_RE = /^[0-9a-f]{16}$/;
const REPORT_REASONS = ['value', 'unit', 'name', 'source', 'wording', 'other'];
const REPORT_WHERE = ['reveal', 'result', 'list', 'history'];
const MAX_FREE_ANSWERS = 60;

function clientRunId(v) {
  if (typeof v !== 'string' || !RUN_ID_RE.test(v)) fail('INVALID_ACTIONS', 'bad clientRunId');
  return v;
}
function startMode(v) {
  if (!START_MODES.includes(v)) fail('INVALID_ACTIONS', 'bad mode');
  return v;
}
function optDateKey(v) {
  if (v === undefined || v === null) return null;
  if (!isDateKey(v)) fail('INVALID_ACTIONS', 'bad dateKey');
  return v;
}
function challengeId(v) {
  if (typeof v !== 'string' || !CHALLENGE_ID_RE.test(v)) fail('INVALID_ACTIONS', 'bad challengeId');
  return v;
}
function optChallengeId(v) {
  return v === undefined || v === null ? null : challengeId(v);
}
function groupRef(v) {
  if (typeof v !== 'string' || !GROUP_REF_RE.test(v)) fail('INVALID_ACTIONS', 'bad groupRef');
  return v;
}
function factId(v) {
  if (typeof v !== 'string' || !FACT_ID_RE.test(v)) fail('INVALID_ACTIONS', 'bad factId');
  return v;
}
function seedU32(v) {
  if (!isInt(v, 0, 4294967295)) fail('INVALID_ACTIONS', 'bad seed');
  return v;
}
function versionInt(v, what) {
  if (!isInt(v, 1, 100000)) fail('INVALID_ACTIONS', `bad ${what}`);
  return v;
}
function k40(v) {
  if (!isInt(v, 1, 60)) fail('INVALID_ACTIONS', 'bad k');
  return v;
}
function choice(v) {
  if (v !== 'hi' && v !== 'lo') fail('INVALID_ACTIONS', 'bad choice');
  return v;
}
/** answer time in ms: optional; clamped to 0..1h; nonsense becomes 0 (flags are observe-only) */
function ms(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail('INVALID_ACTIONS', 'bad ms');
  return Math.min(3600e3, Math.max(0, Math.round(v)));
}
function reasons(v) {
  if (!Array.isArray(v) || v.length === 0 || v.length > REPORT_REASONS.length) fail('INVALID_ACTIONS', 'bad reasons');
  const out = [];
  for (const r of v) {
    if (!REPORT_REASONS.includes(r)) fail('INVALID_ACTIONS', 'bad reason');
    if (!out.includes(r)) out.push(r);
  }
  return out;
}
function reportWhere(v) {
  if (!REPORT_WHERE.includes(v)) fail('INVALID_ACTIONS', 'bad where');
  return v;
}
/**
 * Free-run answers: [{k, c:'hi'|'lo', ms?}] with k = 1..m in order. Whitelist-copied.
 */
function freeAnswers(v) {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_FREE_ANSWERS) fail('INVALID_ACTIONS', 'bad answers length');
  return v.map((a, i) => {
    if (!isPlainObject(a) || a.k !== i + 1 || (a.c !== 'hi' && a.c !== 'lo')) fail('INVALID_ACTIONS', 'bad answer');
    return { k: a.k, c: a.c, ms: ms(a.ms) };
  });
}
function optLifeAtK(v) {
  if (v === undefined || v === null) return null;
  if (!isInt(v, 1, MAX_FREE_ANSWERS)) fail('INVALID_ACTIONS', 'bad lifeAtK');
  return v;
}
function optClientStreak(v) {
  if (v === undefined || v === null) return null;
  if (!isInt(v, 0, MAX_FREE_ANSWERS)) fail('INVALID_ACTIONS', 'bad clientStreak');
  return v;
}

module.exports = {
  START_MODES, REPORT_REASONS, REPORT_WHERE, MAX_FREE_ANSWERS, CHALLENGE_ID_RE,
  clientRunId, startMode, optDateKey, challengeId, optChallengeId, groupRef, factId, seedU32, versionInt,
  k40, choice, ms, reasons, reportWhere, freeAnswers, optLifeAtK, optClientStreak,
};
