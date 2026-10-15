'use strict';
// The ONLY place that touches (a) the shared game core copied into ../core by sync-core.js and
// (b) the offline-pipeline data copied into ../data by scripts/import-data.js.
// Everything is optional with a documented fallback, so the functions keep working while the
// game core and the pipeline are being built in parallel. Contracts we rely on:
//
//   core/date.js      beijingDateKey(ms)                         (fallback: local UTC+8 arithmetic)
//   core/config.js    LATEST_CONFIG_VERSION, getConfig(v).gateVersion   (fallback: manifest.json, then 1)
//   core/starters.js  warmupsFor(key, n) and STARTERS (array of 120 words)   (REQUIRED for warm-ups; matches the client)
//   core/normalize.js normalizeInput(raw, t2sMap)                 (fallback: local equivalent)
//   core/t2s.js       traditional->simplified char map             (optional)
//
//   data/manifest.json   {vocabVersion, gateVersion, configVersion?}  (written by import-data.js)
//   data/vocab.v<N>.txt  one word per line; line number = vocabIdx
//   data/near.v<N>.bin   V x 20 uint16 little-endian (nearest neighbours of every word)
const fs = require('fs');
const path = require('path');
const { fail, keyFromUtcMidnight, BJT_MS } = require('./util');
const rng = require('./rng');

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
  let coreGate = null;
  try {
    const g = cfg && typeof cfg.getConfig === 'function' ? cfg.getConfig(configVersion).gateVersion : null;
    if (Number.isInteger(g)) coreGate = g;
  } catch (e) { /* fall back to the manifest */ }
  return {
    vocabVersion: Number.isInteger(m.vocabVersion) ? m.vocabVersion : 1,
    gateVersion: coreGate !== null ? coreGate : Number.isInteger(m.gateVersion) ? m.gateVersion : 1,
    configVersion,
  };
}

// ---- starters and warm-ups ----
function starterList() {
  const s = optionalRequire('../core/starters');
  let list = null;
  if (Array.isArray(s)) list = s;
  else if (s && typeof s === 'object') {
    for (const k of ['STARTERS', 'starters', 'words', 'list']) if (Array.isArray(s[k])) { list = s[k]; break; }
  }
  if (!list || !list.every((w) => typeof w === 'string')) fail('SERVER_CONFIG', 'core/starters.js missing or unreadable');
  return list;
}
/**
 * The 6 warm-up words for a key (a dateKey or "p<n>"): the core's own warmupsFor when present (so client and server
 * agree), restricted to words of this vocabulary. Depends only on the key: never on any answer (PO-22).
 */
function warmups(key, vocabulary, n = 6) {
  const s = optionalRequire('../core/starters');
  if (s && typeof s.warmupsFor === 'function') {
    const w = s.warmupsFor(key, n);
    if (Array.isArray(w) && w.length === n && w.every((x) => vocabulary.index.has(x))) return w;
  }
  return rng.drawDistinct(starterList().filter((x) => vocabulary.index.has(x)), n, key, 'warmups');
}

// ---- input normalisation: the core's normalizeInput (with its t2s map) so server and client agree ----
function t2sChar(ch) {
  const m = optionalRequire('../core/t2s');
  if (!m) return ch;
  if (typeof m === 'function') return m(ch) || ch;
  const map = m.T2S || m.map || m;
  return (map && typeof map === 'object' && typeof map[ch] === 'string' && map[ch]) || ch;
}
function normalize(text) {
  if (typeof text !== 'string') return '';
  const n = optionalRequire('../core/normalize');
  if (n && typeof n.normalizeInput === 'function') {
    const t2s = optionalRequire('../core/t2s');
    return n.normalizeInput(text, t2s && typeof t2s === 'object' ? t2s : null);
  }
  const stripped = text.normalize('NFKC').replace(/[\s\p{P}\p{S}\p{Cc}\p{Cf}]/gu, '');
  return Array.from(stripped).map(t2sChar).join('');
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

module.exports = { dateKeyAt, currentVersions, warmups, normalize, vocab, neighbours, NEAR_K, resetCaches, DATA_DIR };
