#!/usr/bin/env node
'use strict';
// Turns the server-only daily-facts export (from apps/bibiyi/tools/build-content.js) into a JSON Lines file that
// the WeChat cloud console can import into the `daily_facts` collection. Founder handoff step, see README
// "Loading the daily facts". Offline only: this script never talks to WeChat and needs no credentials.
//
//   node scripts/import-daily-facts.js <export file> --version <contentVersion> [--out <file>] [--check]
//
// <export file>: .jsonl (one fact per line), .json (array or {facts:[...]}) or a .js module exporting an array
//                or {facts:[...]} (the content build's server bundle).
// Output doc: {_id: "v<version>_<factId>", contentVersion, ...fact fields}. Re-importing the same file is safe
// (same _ids; use the console's "upsert" conflict mode when you are importing a corrected file).
const fs = require('fs');
const os = require('os');
const path = require('path');

const REQUIRED = ['id', 'measure', 'label', 'value', 'year', 'source', 'publisher', 'url', 'licence', 'status'];
const KEEP = [
  'id', 'measure', 'pool', 'label', 'sub', 'value', 'approx', 'uncertainty', 'year', 'source', 'publisher', 'url',
  'licence', 'retrievedAt', 'verifiedBy', 'note', 'tags', 'status', 'since', 'noPairWith',
];
const STATUSES = ['active', 'suspended', 'retired'];
const FACT_ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const MEASURES = [
  'city_pop', 'prov_pop', 'mountain', 'river', 'lake', 'year', 'animal_weight', 'animal_life', 'space_diameter',
  'structure_len', 'structure_height', 'food_kcal', 'distance',
];

function loadExport(file) {
  const abs = path.resolve(file);
  const ext = path.extname(abs).toLowerCase();
  let data;
  if (ext === '.jsonl') {
    data = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
      try { return JSON.parse(l); } catch (e) { throw new Error(`${file} line ${i + 1}: not valid JSON`); }
    });
  } else if (ext === '.json') {
    data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } else if (ext === '.js') {
    data = require(abs); // eslint-disable-line global-require
  } else {
    throw new Error(`unsupported export type ${ext} (use .jsonl, .json or .js)`);
  }
  const facts = Array.isArray(data) ? data : data && Array.isArray(data.facts) ? data.facts : null;
  if (!facts) throw new Error('export must be an array of facts or {facts:[...]}');
  return facts;
}

/** -> {errors:[...], perMeasure:{}, count} ; errors is empty when the export may be imported */
function validateFacts(facts) {
  const errors = [];
  const ids = new Set();
  const labels = new Set();
  const perMeasure = {};
  facts.forEach((f, i) => {
    const where = `fact #${i + 1}${f && f.id ? ` (${f.id})` : ''}`;
    if (!f || typeof f !== 'object') { errors.push(`${where}: not an object`); return; }
    for (const k of REQUIRED) if (f[k] === undefined || f[k] === null || f[k] === '') errors.push(`${where}: missing ${k}`);
    if (typeof f.id === 'string' && !FACT_ID_RE.test(f.id)) errors.push(`${where}: bad id`);
    if (f.pool !== undefined && f.pool !== 'daily') errors.push(`${where}: pool is "${f.pool}" - only daily-pool facts may be loaded (the free pool ships in the game package)`);
    if (f.measure && !MEASURES.includes(f.measure)) errors.push(`${where}: unknown measure ${f.measure}`);
    if (typeof f.value !== 'number' || !Number.isFinite(f.value)) errors.push(`${where}: value must be a finite number`);
    else if (f.measure === 'year' ? !Number.isInteger(f.value) : f.value <= 0) errors.push(`${where}: value out of range for ${f.measure}`);
    if (typeof f.url === 'string' && !/^https:\/\//.test(f.url)) errors.push(`${where}: url must be https`);
    if (f.status && !STATUSES.includes(f.status)) errors.push(`${where}: bad status`);
    if (typeof f.label === 'string' && f.label.length > 10) errors.push(`${where}: label longer than 10 characters`);
    if (typeof f.note === 'string' && f.note.length > 24) errors.push(`${where}: note longer than 24 characters`);
    if (ids.has(f.id)) errors.push(`${where}: duplicate id`);
    ids.add(f.id);
    const lk = `${f.measure}|${f.label}`;
    if (labels.has(lk)) errors.push(`${where}: duplicate label within ${f.measure}`);
    labels.add(lk);
    perMeasure[f.measure] = (perMeasure[f.measure] || 0) + 1;
  });
  if (!facts.length) errors.push('export is empty');
  return { errors, perMeasure, count: facts.length };
}

function toDoc(f, version) {
  const doc = { _id: `v${version}_${f.id}`, contentVersion: version };
  for (const k of KEEP) if (f[k] !== undefined) doc[k] = f[k];
  doc.pool = 'daily';
  return doc;
}
function toImportLines(facts, version) {
  return facts.map((f) => JSON.stringify(toDoc(f, version))).join('\n') + '\n';
}

function parseArgs(argv) {
  const a = { file: null, version: null, out: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version') a.version = Number(argv[++i]);
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--check') a.check = true;
    else if (!a.file) a.file = argv[i];
    else throw new Error(`unexpected argument ${argv[i]}`);
  }
  return a;
}

function main(argv) {
  const a = parseArgs(argv);
  if (!a.file || !Number.isInteger(a.version) || a.version < 1) {
    console.error('usage: node scripts/import-daily-facts.js <export file> --version <contentVersion> [--out <file>] [--check]');
    return 2;
  }
  const facts = loadExport(a.file);
  const v = validateFacts(facts);
  if (v.errors.length) {
    console.error(`${v.errors.length} problem(s), nothing written:\n  ` + v.errors.slice(0, 50).join('\n  '));
    return 1;
  }
  console.log(`${v.count} daily facts OK`);
  for (const [m, n] of Object.entries(v.perMeasure).sort()) console.log(`  ${m}: ${n}`);
  if (a.check) return 0;
  const out = path.resolve(a.out || path.join(os.tmpdir(), `daily-facts.v${a.version}.import.jsonl`));
  fs.writeFileSync(out, toImportLines(facts, a.version));
  console.log(`wrote ${out}\nImport it in the cloud console (database > daily_facts > import, JSON Lines, conflict mode: upsert), then DELETE the file. Never commit it.`);
  return 0;
}

module.exports = { loadExport, validateFacts, toDoc, toImportLines, parseArgs, MEASURES };

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
