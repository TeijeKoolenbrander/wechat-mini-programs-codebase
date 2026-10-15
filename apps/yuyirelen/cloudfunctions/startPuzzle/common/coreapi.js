'use strict';
// The ONLY place that touches (a) the shared game core copied into ../core by sync-core.js and
// (b) the offline-pipeline data copied into ../data by scripts/import-data.js.
// Everything is optional with a documented fallback, so the functions keep working while the
// game core and the pipeline are being built in parallel. Contracts we rely on:
//
//   core/date.js     beijingDateKey(ms)                         (fallback: local UTC+8 arithmetic)
//   core/config.js   LATEST_CONFIG_VERSION                      (fallback: 1)
//   core/starters.js an array of the 120 starter words, or an object holding one array
//                    (STARTERS / starters / words / list)       (REQUIRED for warm-ups)
//   core/t2s.js      optional traditional->simplified map or function
//
//   data/manifest.json   {vocabVersion, gateVersion, configVersion?}  (written by import-data.js)
//   data/vocab.v<N>.txt  one word per line; line number = vocabIdx
//   data/near.v<N>.bin   V x 20 uint16 little-endian (nearest neighbours of every word)
const fs = require('fs');
const path = require('path');
const { fail, keyFromUtcMidnight, BJT_MS } = require('./util');

const DATA_DIR = path.join(__dirname, '..', 'data');

function optionalRequire(rel) {
  try {
    return require(rel);
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message).includes(rel)) return null;
    throw e;
  }
}

// ---- dates ----
function dateKeyAt(ms) {
  const d = optionalRequire('../core/date');
  if (d && typeof d.beijingDateKey === 'function') return d.beijingDateKey(ms);
  return keyFromUtcMidnight(ms + BJT_MS);
}

// ---- versions ----
let manifestCache;
function manifest() {
  if (manifestCache !== undefined) return manifestCache;
  try {
    manifestCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
  } catch (e) {
    manifestCache = null;
  }
  return manifestCache;
}
function currentVersions() {
  const m = manifest() || {};
  const cfg = optionalRequire('../core/config');
  const configVersion = (cfg && Number.isInteger(cfg.LATEST_CONFIG_VERSION) && cfg.LATEST_CONFIG_VERSION)
    || (Number.isInteger(m.configVersion) && m.configVersion) || 1;
  return {
    vocabVersion: Number.isInteger(m.vocabVersion) ? m.vocabVersion : 1,
    gateVersion: Number.isInteger(m.gateVersion) ? m.gateVersion : 1,
    configVersion,
  };
}

// ---- starters (warm-up source) ----
function starters() {
  const s = optionalRequire('../core/starters');
  let list = null;
  if (Array.isArray(s)) list = s;
  else if (s && typeof s === 'object') {
    for (const k of ['STARTERS', 'starters', 'words', 'list', 'default']) if (Array.isArray(s[k])) { list = s[k]; break; }
  }
  if (!list || !list.every((w) => typeof w === 'string')) fail('SERVER_CONFIG', 'core/starters.js missing or unreadable');
  return list;
}

// ---- optional traditional->simplified map for input normalisation ----
function t2sChar(ch) {
  const m = optionalRequire('../core/t2s');
  if (!m) return ch;
  if (typeof m === 'function') return m(ch) || ch;
  const map = m.T2S || m.map || m;
  return (map && typeof map === 'object' && typeof map[ch] === 'string' && map[ch]) || ch;
}

// ---- vocabulary and neighbour table ----
const vocabs = new Map();

function readText(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}
/** @returns {{version:number, words:string[], V:number, index:Map<string,number>}} */
function vocab(version) {
  if (vocabs.has(version)) return vocabs.get(version);
  const file = path.join(DATA_DIR, `vocab.v${version}.txt`);
  if (!Number.isInteger(version) || !fs.existsSync(file)) fail('SERVER_CONFIG', `vocabulary v${version} not deployed (see README: import-data)`);
  const words = readText(file).split('\n').map((w) => w.replace(/\r$/, ''));
  while (words.length && words[words.length - 1] === '') words.pop();
  const index = new Map();
  words.forEach((w, i) => { if (!index.has(w)) index.set(w, i); });
  if (words.length === 0 || words.length > 65535 || index.size !== words.length) fail('SERVER_CONFIG', `vocabulary v${version} invalid`);
  const v = { version, words, V: words.length, index, nearTable: null };
  vocabs.set(version, v);
  return v;
}

const NEAR_K = 20;
/** neighbour indices (<= 20) of word `idx`, nearest first. Answer-independent. */
function neighbours(v, idx) {
  if (!v.nearTable) {
    const file = path.join(DATA_DIR, `near.v${v.version}.bin`);
    if (!fs.existsSync(file)) fail('SERVER_CONFIG', `near table v${v.version} not deployed`);
    const buf = fs.readFileSync(file);
    if (buf.length !== v.V * NEAR_K * 2) fail('SERVER_CONFIG', `near table v${v.version} has the wrong size`);
    const t = new Uint16Array(v.V * NEAR_K);
    for (let i = 0; i < t.length; i++) t[i] = buf.readUInt16LE(i * 2);
    v.nearTable = t;
  }
  const out = [];
  for (let j = 0; j < NEAR_K; j++) {
    const n = v.nearTable[idx * NEAR_K + j];
    if (n < v.V && n !== idx) out.push(n);
  }
  return out;
}

/** Test hook: forget cached files. */
function resetCaches() {
  vocabs.clear();
  manifestCache = undefined;
}

module.exports = { dateKeyAt, currentVersions, starters, t2sChar, vocab, neighbours, NEAR_K, resetCaches, DATA_DIR };
