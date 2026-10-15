#!/usr/bin/env node
'use strict';
// Loads the pipeline's PUBLIC data (vocabulary + neighbour table) into cloudfunctions/data/, validates it and writes
// data/manifest.json. After this run `npm run sync` to copy it into the functions. (The answer bank is separate:
// prepare-bank.js, because it is secret and goes into the database, not into the function packages.)
//
//   node scripts/import-data.js --vocab <vocab.vN.txt> --near <near.vN.bin> --vocab-version N [--gate-version M]
//        [--config-version C] [--allow-small]
//
// near.bin format: V x 20 uint16 little-endian, row i = the 20 nearest words of word i (never itself, all < V).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CORE_VOCAB = path.resolve(__dirname, '..', '..', 'game', 'core', 'vocab.js');
const NEAR_K = 20;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function parseVocab(buf) {
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const words = s.split('\n').map((w) => w.replace(/\r$/, ''));
  while (words.length && words[words.length - 1] === '') words.pop();
  return words;
}

/** @returns {string[]} problems */
function validate(words, nearBuf, { allowSmall = false } = {}) {
  const problems = [];
  const V = words.length;
  if (!allowSmall && (V < 20000 || V > 40000)) problems.push(`vocabulary has ${V} words (spec: 20,000-40,000)`);
  if (V > 65535) problems.push('vocabulary exceeds 65,535 words (uint16)');
  if (words.some((w) => w === '')) problems.push('vocabulary has an empty line');
  if (new Set(words).size !== V) problems.push('vocabulary has duplicate words');
  if (words.some((w) => !/^[一-鿿]{1,4}$/.test(w))) problems.push('vocabulary has a word that is not 1-4 Han characters');
  if (nearBuf.length !== V * NEAR_K * 2) problems.push(`near table is ${nearBuf.length} bytes, expected ${V * NEAR_K * 2} (V x 20 uint16)`);
  else {
    for (let i = 0; i < V && problems.length < 10; i++) {
      for (let j = 0; j < NEAR_K; j++) {
        const n = nearBuf.readUInt16LE((i * NEAR_K + j) * 2);
        if (n >= V) { problems.push(`near[${i}][${j}] = ${n} is out of range`); break; }
        if (n === i) { problems.push(`word ${i} lists itself as a neighbour`); break; }
      }
    }
  }
  return problems;
}

function run({ vocabFile, nearFile, vocabVersion, gateVersion = 1, configVersion = 1, allowSmall = false, dataDir = DATA_DIR, coreVocab = CORE_VOCAB }) {
  const vocabBuf = fs.readFileSync(vocabFile);
  const nearBuf = fs.readFileSync(nearFile);
  const words = parseVocab(vocabBuf);
  const problems = validate(words, nearBuf, { allowSmall });
  // the client ships the same vocabulary as game/core/vocab.js: the two must be identical
  if (coreVocab && fs.existsSync(coreVocab)) {
    delete require.cache[require.resolve(coreVocab)];
    const core = require(coreVocab);
    const coreWords = Array.isArray(core) ? core : typeof core === 'string' ? parseVocab(Buffer.from(core)) : null;
    if (coreWords && (coreWords.length !== words.length || coreWords.some((w, i) => w !== words[i]))) {
      problems.push('game/core/vocab.js differs from the imported vocabulary (indices would not line up)');
    }
  }
  if (problems.length) return { ok: false, problems };
  fs.mkdirSync(dataDir, { recursive: true });
  for (const f of fs.readdirSync(dataDir)) if (/^(vocab\.v\d+\.txt|near\.v\d+\.bin)$/.test(f) && f.includes(`v${vocabVersion}.`)) fs.rmSync(path.join(dataDir, f));
  fs.writeFileSync(path.join(dataDir, `vocab.v${vocabVersion}.txt`), words.join('\n') + '\n');
  fs.writeFileSync(path.join(dataDir, `near.v${vocabVersion}.bin`), nearBuf);
  const manifest = {
    vocabVersion, gateVersion, configVersion, V: words.length,
    sha256: { vocab: sha(Buffer.from(words.join('\n') + '\n')), near: sha(nearBuf) },
  };
  fs.writeFileSync(path.join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { ok: true, manifest };
}

module.exports = { run, validate, parseVocab };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const vocabFile = opt('--vocab');
  const nearFile = opt('--near');
  const vocabVersion = Number(opt('--vocab-version'));
  if (!vocabFile || !nearFile || !Number.isInteger(vocabVersion) || vocabVersion < 1) {
    console.error('usage: node scripts/import-data.js --vocab <vocab.vN.txt> --near <near.vN.bin> --vocab-version N [--gate-version M] [--config-version C] [--allow-small]');
    process.exit(2);
  }
  const r = run({
    vocabFile, nearFile, vocabVersion, gateVersion: Number(opt('--gate-version', 1)),
    configVersion: Number(opt('--config-version', 1)), allowSmall: args.includes('--allow-small'),
  });
  if (!r.ok) {
    r.problems.forEach((p) => console.error('FAIL ' + p));
    process.exit(1);
  }
  console.log(`imported vocabulary v${vocabVersion} (${r.manifest.V} words) and near table into ${DATA_DIR}`);
  console.log('next: npm run sync, then deploy the functions.');
}
