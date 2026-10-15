'use strict';
// Server-side access to the answer bank (spec 3.8, 14.1). Storage design:
//
//   answer_bank   small metadata doc per answer (word, synonyms, pool, seq, used, ...). genDaily, history and
//                 practice lookups only ever touch this, so they never pull 80 KB of ranks.
//   answer_ranks  one doc per answer, same _id: { ranks: base64 uint16-LE array of length V }.
//                 ranks[vocabIdx] = rank of that word for this answer (1 = the answer).
//
// A guess = vocab.index.get(word) -> ranks[idx]. The ranks doc is read once per warm instance and kept in an
// LRU of 32 answers (about 4 MB: ranks + rank->word inverse), so steady-state guesses cost zero extra reads.
// Nothing in this file is ever returned to a client; callers copy only what the spec allows.
const store = require('./store');
const { fail } = require('./util');

const RANKS_LRU = 32;
const META_LRU = 256;
const META_TTL_MS = 5 * 60e3; // so a console edit (e.g. `retired`, spec PO-27) takes effect within minutes

const rankCache = new Map(); // id -> {ranks, inverse, V}
const metaCache = new Map(); // id -> meta

function lruGet(m, k) {
  if (!m.has(k)) return undefined;
  const v = m.get(k);
  m.delete(k);
  m.set(k, v);
  return v;
}
function lruSet(m, k, v, max) {
  m.delete(k);
  m.set(k, v);
  while (m.size > max) m.delete(m.keys().next().value);
}

/** metadata for one answer (cached; immutable except `used`/`retired`, which these callers don't need fresh) */
async function getMeta(id) {
  const hit = lruGet(metaCache, id);
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.meta;
  const meta = await store.getDoc('answer_bank', id);
  if (!meta) fail('SERVER_CONFIG', 'answer missing from the bank');
  lruSet(metaCache, id, { at: Date.now(), meta }, META_LRU);
  return meta;
}

function decodeRanks(b64, V) {
  if (typeof b64 !== 'string') return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== V * 2) return null;
  const ranks = new Uint16Array(V);
  for (let i = 0; i < V; i++) ranks[i] = buf.readUInt16LE(i * 2);
  return ranks;
}
/** rank r (1..V) -> word index; null when ranks is not a permutation of 1..V */
function invert(ranks) {
  const V = ranks.length;
  const inv = new Uint16Array(V);
  const seen = new Uint8Array(V);
  for (let i = 0; i < V; i++) {
    const r = ranks[i];
    if (r < 1 || r > V || seen[r - 1]) return null;
    seen[r - 1] = 1;
    inv[r - 1] = i;
  }
  return inv;
}

/**
 * @returns {{meta:object, ranks:Uint16Array, inverse:Uint16Array}}
 * The ranks array is for server logic only.
 */
async function load(id, V) {
  const hit = lruGet(rankCache, id);
  if (hit && hit.V === V) return hit;
  const [meta, doc] = await Promise.all([getMeta(id), store.getDoc('answer_ranks', id)]);
  if (!doc) fail('SERVER_CONFIG', 'rank list missing for answer');
  const ranks = decodeRanks(doc.ranks, V);
  const inverse = ranks && invert(ranks);
  if (!ranks || !inverse || ranks[meta.wordIdx] !== 1) fail('SERVER_CONFIG', 'rank list corrupt');
  const entry = { V, meta, ranks, inverse };
  lruSet(rankCache, id, entry, RANKS_LRU);
  return entry;
}

function synonymSet(meta) {
  return new Set(Array.isArray(meta.synonyms) ? meta.synonyms : []);
}

/** the 100 nearest words as [word, rank, isSynonym] (spec 14.2 getReveal). Rank 1 = the answer. */
function topList(entry, vocab, n = 100) {
  const syn = synonymSet(entry.meta);
  const out = [];
  for (let r = 1; r <= Math.min(n, entry.V); r++) {
    const idx = entry.inverse[r - 1];
    out.push([vocab.words[idx], r, syn.has(idx)]);
  }
  return out;
}

function resetCaches() {
  rankCache.clear();
  metaCache.clear();
}

module.exports = { getMeta, load, decodeRanks, invert, synonymSet, topList, resetCaches, RANKS_LRU };
