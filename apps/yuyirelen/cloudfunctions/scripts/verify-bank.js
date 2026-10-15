#!/usr/bin/env node
'use strict';
// Re-reads answer-bank entries and checks every one (spec 3.7 "re-check of the server data", AC 6, 7, 8):
//  - ranks is a permutation of 1..V (uint16) and ranks[wordIdx] === 1
//  - synonyms (<= 3) are in the vocabulary, distinct, and not the answer
//  - vocabVersion matches the vocabulary used for the check
//  - gate fields are inside the spec 3.6 windows
//  - answer rules 3.5: 2-3 characters, frequency rank <= 8000 (the vocabulary is sorted by frequency)
// Used by prepare-bank.js (which refuses to write the import files if anything fails) and runnable on its own:
//   node scripts/verify-bank.js <entries.jsonl> [--vocab <vocab.vN.txt>]
const fs = require('fs');
const path = require('path');

const GATE = { chipMedian: [10, 30], chipP90Max: 45, typistMedianMax: 60, solve80Min: 0.95 };
const MAX_FREQ_RANK = 8000;
const MAX_SYNONYMS = 3;
const POOLS = ['daily', 'practice'];

/** accepts base64 (uint16 little-endian) or a plain number array; returns Uint16Array or null */
function decodeRanks(v, V) {
  if (Array.isArray(v)) return v.length === V && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 65535) ? Uint16Array.from(v) : null;
  if (typeof v !== 'string') return null;
  const buf = Buffer.from(v, 'base64');
  if (buf.length !== V * 2) return null;
  const out = new Uint16Array(V);
  for (let i = 0; i < V; i++) out[i] = buf.readUInt16LE(i * 2);
  return out;
}
function encodeRanks(ranks) {
  const buf = Buffer.alloc(ranks.length * 2);
  ranks.forEach((r, i) => buf.writeUInt16LE(r, i * 2));
  return buf.toString('base64');
}
function isPermutation(ranks) {
  const V = ranks.length;
  const seen = new Uint8Array(V + 1);
  for (let i = 0; i < V; i++) {
    const r = ranks[i];
    if (r < 1 || r > V || seen[r]) return false;
    seen[r] = 1;
  }
  return true;
}

function loadVocab(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const words = s.split('\n').map((w) => w.replace(/\r$/, ''));
  while (words.length && words[words.length - 1] === '') words.pop();
  return { words, index: new Map(words.map((w, i) => [w, i])), V: words.length };
}

/** word or index -> index (or -1) */
function toIdx(vocab, x) {
  if (Number.isInteger(x)) return x >= 0 && x < vocab.V ? x : -1;
  return typeof x === 'string' && vocab.index.has(x) ? vocab.index.get(x) : -1;
}

/**
 * @returns {{ok:boolean, errors:string[], entry?:object}} entry = normalised (wordIdx, synonyms as indices, ranks Uint16Array)
 */
function verifyEntry(raw, vocab, { vocabVersion, gateVersion } = {}) {
  const errors = [];
  const e = raw && typeof raw === 'object' ? raw : {};
  const label = `${e.pool || '?'} ${e.seq || e.practiceNo || '?'}`;
  const bad = (m) => errors.push(`${label}: ${m}`);

  if (!POOLS.includes(e.pool)) bad('pool must be daily or practice');
  if (e.pool === 'daily' && !(Number.isInteger(e.seq) && e.seq >= 1)) bad('daily entry needs integer seq >= 1');
  if (e.pool === 'practice' && !(Number.isInteger(e.practiceNo) && e.practiceNo >= 1)) bad('practice entry needs integer practiceNo >= 1');
  if (vocabVersion != null && e.vocabVersion !== vocabVersion) bad(`vocabVersion ${e.vocabVersion} != ${vocabVersion}`);
  if (gateVersion != null && e.gateVersion !== gateVersion) bad(`gateVersion ${e.gateVersion} != ${gateVersion}`);

  const wordIdx = toIdx(vocab, e.wordIdx !== undefined ? e.wordIdx : e.word);
  if (wordIdx < 0) bad('answer word is not in the vocabulary');
  if (wordIdx >= 0 && e.word !== undefined && vocab.words[wordIdx] !== e.word) bad('word does not match wordIdx');

  const ranks = decodeRanks(e.ranks, vocab.V);
  if (!ranks) bad(`ranks must be ${vocab.V} uint16 values`);
  else {
    if (!isPermutation(ranks)) bad('ranks is not a permutation of 1..V');
    else if (wordIdx >= 0 && ranks[wordIdx] !== 1) bad('ranks[wordIdx] is not 1');
  }

  const rawSyn = e.synonyms === undefined ? [] : e.synonyms;
  let synonyms = [];
  if (!Array.isArray(rawSyn) || rawSyn.length > MAX_SYNONYMS) bad(`synonyms must be an array of at most ${MAX_SYNONYMS}`);
  else {
    synonyms = rawSyn.map((s) => toIdx(vocab, s));
    if (synonyms.some((s) => s < 0)) bad('a synonym is not in the vocabulary');
    if (new Set(synonyms).size !== synonyms.length) bad('duplicate synonym');
    if (synonyms.includes(wordIdx)) bad('the answer cannot be its own synonym');
  }

  if (wordIdx >= 0) {
    const len = Array.from(vocab.words[wordIdx]).length;
    if (len < 2 || len > 3) bad('answer must be 2-3 characters');
    if (wordIdx >= MAX_FREQ_RANK) bad(`answer frequency rank ${wordIdx + 1} > ${MAX_FREQ_RANK}`);
  }

  const g = e.gate;
  if (!g || typeof g !== 'object') bad('gate fields missing');
  else {
    const num = (x) => typeof x === 'number' && Number.isFinite(x);
    if (!(num(g.chipMedian) && g.chipMedian >= GATE.chipMedian[0] && g.chipMedian <= GATE.chipMedian[1])) bad('gate.chipMedian outside 10-30');
    if (!(num(g.chipP90) && g.chipP90 <= GATE.chipP90Max)) bad('gate.chipP90 > 45');
    if (!(num(g.typistMedian) && g.typistMedian <= GATE.typistMedianMax)) bad('gate.typistMedian > 60');
    const s80 = num(g.solve80) && g.solve80 > 1 ? g.solve80 / 100 : g.solve80; // accept 0.95 or 95
    if (!(num(s80) && s80 >= GATE.solve80Min && s80 <= 1)) bad('gate.solve80 < 0.95');
  }
  if (e.reviewedBy === undefined || e.reviewedBy === null || e.reviewedBy === '') bad('reviewedBy missing');

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors, entry: { ...e, wordIdx, word: vocab.words[wordIdx], synonyms, ranks } };
}

/** set-level rules: unique seq / practiceNo, >= 85% of daily answers are 2 characters */
function verifySet(entries, vocab) {
  const errors = [];
  const seen = new Set();
  for (const e of entries) {
    const key = e.pool === 'daily' ? `d${e.seq}` : `p${e.practiceNo}`;
    if (seen.has(key)) errors.push(`duplicate ${key}`);
    seen.add(key);
  }
  const answers = new Set();
  for (const e of entries) {
    const w = vocab.words[e.wordIdx];
    if (answers.has(w)) errors.push(`answer repeated within the import: entry ${e.pool} ${e.seq || e.practiceNo}`);
    answers.add(w);
  }
  const daily = entries.filter((e) => e.pool === 'daily');
  if (daily.length >= 10) {
    const two = daily.filter((e) => Array.from(vocab.words[e.wordIdx]).length === 2).length;
    if (two / daily.length < 0.85) errors.push(`only ${Math.round((100 * two) / daily.length)}% of daily answers are 2 characters (need >= 85%)`);
  }
  return errors;
}

module.exports = { verifyEntry, verifySet, decodeRanks, encodeRanks, isPermutation, loadVocab, GATE, MAX_FREQ_RANK };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const vi = args.indexOf('--vocab');
  const vocabFile = vi >= 0 ? args[vi + 1] : path.resolve(__dirname, '..', 'data', 'vocab.v1.txt');
  if (!file) {
    console.error('usage: node scripts/verify-bank.js <entries.jsonl> [--vocab <vocab.vN.txt>]');
    process.exit(2);
  }
  const vocab = loadVocab(vocabFile);
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let errors = [];
  const good = [];
  for (const e of entries) {
    const r = verifyEntry(e, vocab, {});
    if (r.ok) good.push(r.entry); else errors.push(...r.errors);
  }
  errors.push(...verifySet(good, vocab));
  errors.forEach((m) => console.error('FAIL ' + m));
  console.log(`${entries.length} entries checked, ${errors.length} problems`);
  process.exit(errors.length ? 1 : 0);
}
