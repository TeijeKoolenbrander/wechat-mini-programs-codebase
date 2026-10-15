'use strict';
// Small deterministic stand-ins for the offline pipeline's output (vocabulary, neighbour table, answer ranks).
// The real data lands from apps/yuyirelen/data-pipeline; the byte formats here follow spec 3.7/3.8:
//   ranks: uint16 little-endian per vocab word, base64;  near: V x 20 uint16 little-endian.
const { mulberry32 } = require('../../common/rng');

const CHARS = Array.from('天地人山水火木金土日月星云风雨雪花草树鸟鱼猫狗马牛羊米面菜果茶酒书画琴棋笔墨纸砚');

/** V unique two-character words (V <= 1000 here); index = vocabIdx */
function makeWords(V = 120) {
  const out = [];
  for (let i = 0; i < CHARS.length && out.length < V; i++) {
    for (let j = 0; j < CHARS.length && out.length < V; j++) {
      if (i !== j) out.push(CHARS[i] + CHARS[j]);
    }
  }
  // beyond ~1,800 words use three-character words (only the large-vocabulary size/perf test needs this)
  for (let i = 0; i < CHARS.length && out.length < V; i++) {
    for (let j = 0; j < CHARS.length && out.length < V; j++) {
      for (let k = 0; k < CHARS.length && out.length < V; k++) out.push(CHARS[i] + CHARS[j] + CHARS[k]);
    }
  }
  if (out.length < V) throw new Error('fixture vocabulary too small');
  return out;
}

/** a valid rank array: permutation of 1..V with the answer at rank 1 */
function makeRanks(V, answerIdx, seed = 1) {
  const rng = mulberry32(seed * 7919 + answerIdx);
  const others = [];
  for (let i = 0; i < V; i++) if (i !== answerIdx) others.push(i);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const ranks = new Uint16Array(V);
  ranks[answerIdx] = 1;
  others.forEach((idx, k) => { ranks[idx] = k + 2; });
  return ranks;
}
function encodeRanks(ranks) {
  const buf = Buffer.alloc(ranks.length * 2);
  ranks.forEach((r, i) => buf.writeUInt16LE(r, i * 2));
  return buf.toString('base64');
}

/** neighbour table: word i's neighbours are i+1 .. i+20 (mod V); never itself */
function makeNearBuffer(V) {
  const buf = Buffer.alloc(V * 20 * 2);
  for (let i = 0; i < V; i++) for (let j = 0; j < 20; j++) buf.writeUInt16LE((i + 1 + j) % V, (i * 20 + j) * 2);
  return buf;
}

/** bank docs for one answer: {meta (answer_bank), ranksDoc (answer_ranks)} */
function bankEntry({ id, pool = 'daily', seq, practiceNo, wordIdx, synonyms = [], words, V, vocabVersion = 1, gateVersion = 1, extra = {} }) {
  const ranks = makeRanks(V, wordIdx, seq || practiceNo || 1);
  const meta = {
    _id: id, pool, vocabVersion, gateVersion, wordIdx, word: words[wordIdx], synonyms,
    difficulty: 'easy', category: 'food', gate: { chipMedian: 14, chipP90: 30, typistMedian: 40, solve80: 0.97 },
    reviewedBy: 'test', used: false, importedAt: 0, ...extra,
  };
  if (pool === 'daily') meta.seq = seq; else meta.practiceNo = practiceNo;
  return { meta, ranksDoc: { _id: id, vocabVersion, ranks: encodeRanks(ranks) }, ranks };
}

module.exports = { makeWords, makeRanks, encodeRanks, makeNearBuffer, bankEntry, CHARS };
