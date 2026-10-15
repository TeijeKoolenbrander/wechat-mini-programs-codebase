'use strict';
// The ops scripts: verify-bank (AC 6), prepare-bank (import files), import-data (vocabulary + neighbour table).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const fx = require('./helpers/fixtures');
const verify = require('../scripts/verify-bank');
const { prepare, chunk, idFor } = require('../scripts/prepare-bank');
const importData = require('../scripts/import-data');

const V = 200;
const words = fx.makeWords(V);
const vocab = { words, V, index: new Map(words.map((w, i) => [w, i])) };
const GATE = { chipMedian: 14, chipP90: 30, typistMedian: 40, solve80: 0.97 };

function entry(over = {}) {
  const wordIdx = over.wordIdx === undefined ? 10 : over.wordIdx;
  const ranks = fx.makeRanks(V, wordIdx, 3);
  return {
    pool: 'daily', seq: 1, vocabVersion: 1, gateVersion: 1, wordIdx, word: words[wordIdx], synonyms: [11],
    ranks: fx.encodeRanks(ranks), difficulty: 'easy', category: 'food', gate: { ...GATE }, reviewedBy: 'qa', ...over,
  };
}
const check = (e, opts = { vocabVersion: 1, gateVersion: 1 }) => verify.verifyEntry(e, vocab, opts);

test('verify-bank accepts a valid entry (AC 6)', () => {
  const r = check(entry());
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.entry.wordIdx, 10);
  assert.deepEqual(r.entry.synonyms, [11]);
  assert.equal(r.entry.ranks[10], 1);
});

test('verify-bank rejects ranks that are not a permutation of 1..V (AC 6)', () => {
  const ranks = fx.makeRanks(V, 10, 3);
  const dup = Uint16Array.from(ranks);
  dup[20] = dup[21]; // duplicate rank
  assert.equal(check(entry({ ranks: fx.encodeRanks(dup) })).ok, false);
  const zero = Uint16Array.from(ranks);
  zero[20] = 0;
  assert.equal(check(entry({ ranks: fx.encodeRanks(zero) })).ok, false);
  const big = Uint16Array.from(ranks);
  big[20] = V + 5;
  assert.equal(check(entry({ ranks: fx.encodeRanks(big) })).ok, false);
  assert.equal(check(entry({ ranks: fx.encodeRanks(ranks.subarray(0, V - 1)) })).ok, false, 'wrong length');
  assert.equal(check(entry({ ranks: 'not base64 data!' })).ok, false);
  assert.equal(check(entry({ ranks: undefined })).ok, false);
});

test('verify-bank rejects ranks[wordIdx] != 1 (AC 6)', () => {
  const ranks = fx.makeRanks(V, 10, 3);
  const swapped = Uint16Array.from(ranks);
  const j = ranks.indexOf(2);
  swapped[10] = 2;
  swapped[j] = 1; // still a permutation, but the answer is not rank 1
  const r = check(entry({ ranks: fx.encodeRanks(swapped) }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /not 1/);
});

test('verify-bank rejects synonyms outside the vocabulary, too many, duplicated or equal to the answer (AC 6)', () => {
  assert.equal(check(entry({ synonyms: ['不在词库里'] })).ok, false);
  assert.equal(check(entry({ synonyms: [V + 1] })).ok, false);
  assert.equal(check(entry({ synonyms: [11, 12, 13, 14] })).ok, false);
  assert.equal(check(entry({ synonyms: [11, 11] })).ok, false);
  assert.equal(check(entry({ synonyms: [10] })).ok, false);
  assert.equal(check(entry({ synonyms: [words[12]] })).ok, true, 'words are accepted and mapped to indices');
});

test('verify-bank rejects a vocabVersion / gateVersion mismatch (AC 6)', () => {
  assert.equal(check(entry({ vocabVersion: 2 })).ok, false);
  assert.equal(check(entry({ gateVersion: 2 })).ok, false);
});

test('verify-bank rejects gate fields outside the spec windows (AC 6, 7)', () => {
  for (const bad of [
    { chipMedian: 9 }, { chipMedian: 31 }, { chipP90: 46 }, { typistMedian: 61 }, { solve80: 0.94 }, { chipMedian: undefined },
  ]) assert.equal(check(entry({ gate: { ...GATE, ...bad } })).ok, false, JSON.stringify(bad));
  assert.equal(check(entry({ gate: undefined })).ok, false);
  assert.equal(check(entry({ gate: { ...GATE, solve80: 97 } })).ok, true, 'percent form accepted');
  for (const edge of [{ chipMedian: 10 }, { chipMedian: 30 }, { chipP90: 45 }, { typistMedian: 60 }, { solve80: 0.95 }]) {
    assert.equal(check(entry({ gate: { ...GATE, ...edge } })).ok, true, JSON.stringify(edge));
  }
});

test('verify-bank enforces the answer rules: 2-3 characters, frequency rank <= 8000 (AC 8)', () => {
  const big = fx.makeWords(9000);
  const bigVocab = { words: big, V: 9000, index: new Map(big.map((w, i) => [w, i])) };
  const mk = (idx) => ({ ...entry({ wordIdx: idx }), ranks: fx.encodeRanks(fx.makeRanks(9000, idx, 2)), synonyms: [] });
  assert.equal(verify.verifyEntry(mk(7999), bigVocab, {}).ok, true);
  const r = verify.verifyEntry(mk(8000), bigVocab, {});
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /frequency/);
});

test('verify-bank rejects entries without a pool number or reviewer, and a word that disagrees with wordIdx', () => {
  assert.equal(check(entry({ seq: undefined })).ok, false);
  assert.equal(check(entry({ pool: 'practice', seq: undefined })).ok, false);
  assert.equal(check(entry({ pool: 'practice', seq: undefined, practiceNo: 3 })).ok, true);
  assert.equal(check(entry({ pool: 'weekly' })).ok, false);
  assert.equal(check(entry({ reviewedBy: '' })).ok, false);
  assert.equal(check(entry({ word: words[99] })).ok, false);
});

test('verifySet: duplicate numbers / answers, and the 85% two-character rule (AC 8)', () => {
  const a = verify.verifyEntry(entry({ seq: 1 }), vocab, {}).entry;
  const b = verify.verifyEntry(entry({ seq: 1, wordIdx: 12, synonyms: [] }), vocab, {}).entry;
  assert.ok(verify.verifySet([a, b], vocab).some((m) => /duplicate d1/.test(m)));
  const c = verify.verifyEntry(entry({ seq: 2 }), vocab, {}).entry;
  assert.ok(verify.verifySet([a, c], vocab).some((m) => /repeated/.test(m)));
  const three = fx.makeWords(2000);
  const v3 = { words: three, V: 2000, index: new Map(three.map((w, i) => [w, i])) };
  const mk = (seq, idx) => ({ pool: 'daily', seq, wordIdx: idx });
  const set = [];
  for (let i = 0; i < 20; i++) set.push(mk(i + 1, i < 12 ? 10 + i : 1900 + i)); // 12 two-char, 8 three-char = 60%
  assert.ok(verify.verifySet(set, v3).some((m) => /2 characters/.test(m)));
});

test('prepare: valid input yields metadata + rank docs with a deterministic non-word _id (import twice = same ids)', () => {
  const entries = [entry({ seq: 1 }), entry({ seq: 2, wordIdx: 14, synonyms: [] }), entry({ pool: 'practice', seq: undefined, practiceNo: 1, wordIdx: 16, synonyms: [] })];
  const r = prepare(entries, vocab, { vocabVersion: 1, gateVersion: 1, now: 5 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.bank.length, 3);
  assert.equal(r.ranks.length, 3);
  const m = r.bank[0];
  assert.deepEqual([m.pool, m.seq, m.wordIdx, m.word, m.used, m.importedAt], ['daily', 1, 10, words[10], false, 5]);
  assert.ok(!('ranks' in m), 'metadata never carries ranks');
  assert.match(m._id, /^[0-9a-f]{16}$/);
  assert.ok(!m._id.includes(words[10]));
  assert.equal(r.ranks[0]._id, m._id);
  assert.equal(r.ranks[0].ranks.length, Math.ceil((V * 2) / 3) * 4);
  assert.equal(r.bank[2].practiceNo, 1);
  assert.equal(prepare(entries, vocab, { vocabVersion: 1, gateVersion: 1 }).bank[0]._id, m._id);
  assert.notEqual(r.bank[0]._id, r.bank[1]._id);
});

test('prepare refuses to write anything if one entry is bad', () => {
  const bad = entry({ seq: 2, wordIdx: 14, synonyms: [] });
  bad.gate.chipMedian = 99;
  const r = prepare([entry({ seq: 1 }), bad], vocab, { vocabVersion: 1, gateVersion: 1 });
  assert.ok(r.errors.length > 0);
  assert.deepEqual(r.bank, []);
  assert.deepEqual(r.ranks, []);
});

test('chunk splits JSONL under the size limit and keeps every document', () => {
  const docs = Array.from({ length: 50 }, (_, i) => ({ _id: String(i), pad: 'x'.repeat(1000) }));
  const parts = chunk(docs, 10_000);
  assert.ok(parts.length > 3);
  assert.ok(parts.every((p) => Buffer.byteLength(p) <= 10_000 + 1100));
  assert.equal(parts.join('').split('\n').filter(Boolean).length, 50);
});

test('prepare-bank CLI: writes files, refuses on errors with a non-zero exit, idempotent ids', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-bank-'));
  const vocabFile = path.join(tmp, 'vocab.v1.txt');
  fs.writeFileSync(vocabFile, words.join('\n') + '\n');
  const src = path.join(tmp, 'in.jsonl');
  fs.writeFileSync(src, [entry({ seq: 1 }), entry({ seq: 2, wordIdx: 14, synonyms: [] })].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const script = path.join(__dirname, '..', 'scripts', 'prepare-bank.js');
  const out = path.join(tmp, 'out');
  execFileSync(process.execPath, [script, src, out, '--vocab', vocabFile], { stdio: 'pipe' });
  const files = fs.readdirSync(out).sort();
  assert.deepEqual(files.map((f) => f.split('.')[0]), ['answer_bank', 'answer_ranks']);
  assert.ok(files.every((f) => f.endsWith('.import.jsonl')));
  const bankDocs = fs.readFileSync(path.join(out, files[0]), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(bankDocs.length, 2);

  const badSrc = path.join(tmp, 'bad.jsonl');
  const e = entry({ seq: 1 });
  e.synonyms = ['不在词库里'];
  fs.writeFileSync(badSrc, JSON.stringify(e) + '\n');
  const res = spawnSync(process.execPath, [script, badSrc, path.join(tmp, 'out2'), '--vocab', vocabFile], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /REFUSING/);
  assert.ok(!fs.existsSync(path.join(tmp, 'out2')));
});

test('verify-bank CLI exit codes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-vb-'));
  const vocabFile = path.join(tmp, 'vocab.txt');
  fs.writeFileSync(vocabFile, words.join('\n') + '\n');
  const ok = path.join(tmp, 'ok.jsonl');
  fs.writeFileSync(ok, JSON.stringify(entry()) + '\n');
  const script = path.join(__dirname, '..', 'scripts', 'verify-bank.js');
  assert.equal(spawnSync(process.execPath, [script, ok, '--vocab', vocabFile]).status, 0);
  const bad = path.join(tmp, 'bad.jsonl');
  fs.writeFileSync(bad, JSON.stringify(entry({ ranks: 'AAAA' })) + '\n');
  assert.equal(spawnSync(process.execPath, [script, bad, '--vocab', vocabFile]).status, 1);
});

// ---------------- import-data ----------------
function dataFiles(tmp, overrides = {}) {
  const w = overrides.words || words;
  const vocabFile = path.join(tmp, 'vocab.v1.txt');
  fs.writeFileSync(vocabFile, w.join('\n') + '\n');
  const nearFile = path.join(tmp, 'near.v1.bin');
  fs.writeFileSync(nearFile, overrides.near || fx.makeNearBuffer(w.length));
  return { vocabFile, nearFile };
}

test('import-data validates and writes vocab, near table and a manifest with hashes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-imp-'));
  const dataDir = path.join(tmp, 'data');
  const r = importData.run({ ...dataFiles(tmp), vocabVersion: 1, gateVersion: 2, allowSmall: true, dataDir, coreVocab: null });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(fs.readdirSync(dataDir).sort(), ['manifest.json', 'near.v1.bin', 'vocab.v1.txt']);
  const m = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
  assert.deepEqual([m.vocabVersion, m.gateVersion, m.V], [1, 2, V]);
  assert.match(m.sha256.near, /^[0-9a-f]{64}$/);
});

test('import-data rejects a wrong-size near table, self-neighbours, out-of-range entries, duplicates and size limits', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-imp2-'));
  const dataDir = path.join(tmp, 'data');
  const run = (o) => importData.run({ ...dataFiles(tmp, o), vocabVersion: 1, allowSmall: o.allowSmall !== false, dataDir, coreVocab: null });
  assert.equal(run({ near: Buffer.alloc(10) }).ok, false);
  const self = fx.makeNearBuffer(V);
  self.writeUInt16LE(5, (5 * 20) * 2);
  assert.match(run({ near: self }).problems.join(), /itself/);
  const oob = fx.makeNearBuffer(V);
  oob.writeUInt16LE(V + 3, 2);
  assert.match(run({ near: oob }).problems.join(), /out of range/);
  assert.match(run({ words: [...words.slice(0, 50), words[0], ...words.slice(51)] }).problems.join(), /duplicate/);
  assert.match(run({ allowSmall: false }).problems.join(), /20,000-40,000/);
  assert.equal(fs.existsSync(dataDir), false, 'nothing is written on failure');
});

test('import-data refuses a vocabulary that differs from game/core/vocab.js', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-imp3-'));
  const core = path.join(tmp, 'vocab.js');
  fs.writeFileSync(core, `module.exports = ${JSON.stringify(words.slice().reverse().join('\n'))};\n`);
  const r = importData.run({ ...dataFiles(tmp), vocabVersion: 1, allowSmall: true, dataDir: path.join(tmp, 'data'), coreVocab: core });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /differs/);
  fs.writeFileSync(core, `module.exports = ${JSON.stringify(words.join('\n'))};\n`);
  assert.equal(importData.run({ ...dataFiles(tmp), vocabVersion: 1, allowSmall: true, dataDir: path.join(tmp, 'data'), coreVocab: core }).ok, true);
});

test('idFor is stable and independent of the word text', () => {
  const e = verify.verifyEntry(entry(), vocab, {}).entry;
  assert.equal(idFor(e), idFor({ ...e }));
  assert.ok(!idFor(e).includes(words[10]));
});
