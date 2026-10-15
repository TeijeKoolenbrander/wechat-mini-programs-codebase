#!/usr/bin/env node
'use strict';
// Turns the pipeline's answer-bank file into cloud-console import files for `answer_bank` (metadata) and
// `answer_ranks` (the rank arrays), in JSON Lines, split into files small enough to import (default <= 10 MB).
//
//   node scripts/prepare-bank.js <bank.import.jsonl from the pipeline> <outDir> [--vocab <vocab.vN.txt>]
//        [--vocab-version N] [--gate-version M] [--max-mb 10]
//
// Every entry is verified first (scripts/verify-bank.js); if ANY entry fails nothing is written. The files contain
// FUTURE answers (spoilers): keep them out of git (.gitignore covers *.import.jsonl) and delete them after import.
// _ids are 16 hex chars of sha256(pool|number|vocabVersion|ranks-digest): never derived from the word, and the same
// entry always gets the same id, so importing a file twice (conflict mode: skip) cannot duplicate an entry.
// Pipeline input format (one JSON object per line; see README "Answer bank format"):
//   {pool:'daily'|'practice', seq | practiceNo, vocabVersion, gateVersion, wordIdx | word,
//    synonyms:[idx|word, <=3], ranks: base64 uint16-LE (V values) | number[], difficulty, category,
//    gate:{chipMedian, chipP90, typistMedian, solve80}, reviewedBy}
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verifyEntry, verifySet, encodeRanks, loadVocab } = require('./verify-bank');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function idFor(e) {
  const num = e.pool === 'daily' ? e.seq : e.practiceNo;
  return sha(`${e.pool}|${num}|${e.vocabVersion}|${sha(Buffer.from(encodeRanks(e.ranks), 'base64'))}`).slice(0, 16);
}

/**
 * @returns {{bank:object[], ranks:object[], errors:string[]}} import documents; errors non-empty => write nothing
 */
function prepare(entries, vocab, { vocabVersion, gateVersion, now = Date.now() } = {}) {
  const errors = [];
  const good = [];
  for (const raw of entries) {
    const r = verifyEntry(raw, vocab, { vocabVersion, gateVersion });
    if (r.ok) good.push(r.entry); else errors.push(...r.errors);
  }
  errors.push(...verifySet(good, vocab));
  if (errors.length) return { bank: [], ranks: [], errors };

  const bank = [];
  const ranks = [];
  for (const e of good) {
    const _id = idFor(e);
    const g = e.gate;
    const meta = {
      _id, pool: e.pool, vocabVersion: e.vocabVersion, gateVersion: e.gateVersion, wordIdx: e.wordIdx, word: e.word,
      synonyms: e.synonyms, difficulty: e.difficulty || null, category: e.category || null,
      gate: { chipMedian: g.chipMedian, chipP90: g.chipP90, typistMedian: g.typistMedian, solve80: g.solve80 },
      reviewedBy: e.reviewedBy, used: false, importedAt: now,
    };
    if (e.pool === 'daily') meta.seq = e.seq; else meta.practiceNo = e.practiceNo;
    bank.push(meta);
    ranks.push({ _id, vocabVersion: e.vocabVersion, ranks: encodeRanks(e.ranks) });
  }
  return { bank, ranks, errors };
}

/** split docs into JSONL chunks of at most maxBytes each */
function chunk(docs, maxBytes) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const d of docs) {
    const line = JSON.stringify(d) + '\n';
    const n = Buffer.byteLength(line);
    if (cur.length && size + n > maxBytes) { chunks.push(cur.join('')); cur = []; size = 0; }
    cur.push(line);
    size += n;
  }
  if (cur.length) chunks.push(cur.join(''));
  return chunks;
}

module.exports = { prepare, chunk, idFor };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const [src, outDir] = positional;
  if (!src || !outDir) {
    console.error('usage: node scripts/prepare-bank.js <bank.import.jsonl> <outDir> [--vocab f] [--vocab-version N] [--gate-version M] [--max-mb 10]');
    process.exit(2);
  }
  const vocabVersion = Number(opt('--vocab-version', 1));
  const gateVersion = Number(opt('--gate-version', 1));
  const vocab = loadVocab(opt('--vocab', path.resolve(__dirname, '..', 'data', `vocab.v${vocabVersion}.txt`)));
  const entries = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const { bank, ranks, errors } = prepare(entries, vocab, { vocabVersion, gateVersion });
  if (errors.length) {
    errors.forEach((m) => console.error('FAIL ' + m));
    console.error(`REFUSING to write import files: ${errors.length} problem(s).`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const maxBytes = Number(opt('--max-mb', 10)) * 1024 * 1024;
  const write = (name, docs) => chunk(docs, maxBytes).map((c, i, a) => {
    const f = path.join(outDir, `${name}.${String(i + 1).padStart(3, '0')}of${String(a.length).padStart(3, '0')}.import.jsonl`);
    fs.writeFileSync(f, c);
    return f;
  });
  const files = [...write('answer_bank', bank), ...write('answer_ranks', ranks)];
  const daily = bank.filter((b) => b.pool === 'daily').length;
  console.log(`wrote ${bank.length} answers (${daily} daily, ${bank.length - daily} practice) into ${files.length} files:`);
  files.forEach((f) => console.log('  ' + f));
  console.log('Import: console > database > collection > Import (JSON Lines, conflict mode: skip). Then DELETE these files (spoilers).');
  if (daily < 90) console.error('WARNING: fewer than 90 daily entries (launch needs >= 90 daily + >= 300 practice)');
}
