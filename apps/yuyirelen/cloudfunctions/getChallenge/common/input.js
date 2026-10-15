'use strict';
// Input validation. Everything the client sends is untrusted; identity is NEVER read from input.
// Error messages never echo the submitted value (typed text must not reach logs, spec PO-23 / AC 24).
const { fail, isDateKey, isInt, isPlainObject } = require('./util');

const PUZZLE_ID_RE = /^(?:d\d{8}|p[1-9]\d{0,4})$/;
const CLIENT_GUESS_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CHALLENGE_ID_RE = /^[A-Z2-7]{8}$/;
const GROUP_REF_RE = /^[0-9a-f]{16}$/;
const GUESS_SOURCES = ['warmup', 'chip', 'suggest', 'typed'];
const MAX_WORD_INPUT_CHARS = 16; // before normalisation; vocabulary words are 1-4 characters

function puzzleId(v) {
  if (typeof v !== 'string' || !PUZZLE_ID_RE.test(v)) fail('PUZZLE_NOT_FOUND', 'unknown puzzle');
  return v;
}
/** raw word text: a bounded string. Whether it is in the vocabulary is decided by the caller. */
function wordText(v) {
  if (typeof v !== 'string' || v.length === 0 || Array.from(v).length > MAX_WORD_INPUT_CHARS) fail('NOT_IN_VOCAB', 'not in vocabulary');
  return v;
}
function clientGuessId(v) {
  if (typeof v !== 'string' || !CLIENT_GUESS_ID_RE.test(v)) fail('INVALID_INPUT', 'bad clientGuessId');
  return v;
}
function guessSource(v) {
  if (v === undefined || v === null) return 'typed';
  if (!GUESS_SOURCES.includes(v)) fail('INVALID_INPUT', 'bad src');
  return v;
}
function optChallengeId(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !CHALLENGE_ID_RE.test(v)) fail('INVALID_INPUT', 'bad challengeId');
  return v;
}
function challengeId(v) {
  if (typeof v !== 'string' || !CHALLENGE_ID_RE.test(v)) fail('CHALLENGE_NOT_FOUND', 'unknown challenge');
  return v;
}
function groupRef(v) {
  if (typeof v !== 'string' || !GROUP_REF_RE.test(v)) fail('INVALID_INPUT', 'bad groupRef');
  return v;
}
function dateKey(v) {
  if (!isDateKey(v)) fail('INVALID_INPUT', 'bad dateKey');
  return v;
}
function hintSource(v) {
  if (v === undefined || v === null) return 'ladder';
  if (v !== 'ladder' && v !== 'ad') fail('INVALID_INPUT', 'bad source');
  return v;
}
function optHintK(v) {
  if (v === undefined || v === null) return null;
  if (!isInt(v, 1, 4)) fail('INVALID_INPUT', 'bad k');
  return v;
}
function optCursor(v) {
  if (v === undefined || v === null || v === '') return null;
  if (!isDateKey(v)) fail('INVALID_INPUT', 'bad cursor');
  return v;
}

module.exports = {
  PUZZLE_ID_RE, GUESS_SOURCES, isPlainObject,
  puzzleId, wordText, clientGuessId, guessSource, optChallengeId, challengeId, groupRef, dateKey, hintSource, optHintK, optCursor,
};
