'use strict';
// The ONLY place that touches the shared game core (copied into ./core by scripts/sync-core.js).
// Real core contract: apps/kedupan/game/core/README.md (written by minigame-dev).
//
// ASSUMED core surface (adjust ONLY here when the real core differs):
//   core/date.js     beijingDateKey(ms)
//   core/score.js    cardScore(d), cardLabel(d), medianOfHist(hist101), medianOfValues(values),
//                    referenceFromHist(hist101, anchor, W), dayBand(total)
//   core/config.js   getConfig() -> {score:{priorVotes,agreeMin,agreeRadius}, boardListCap, groupRowCap}
//   core/content.js  LATEST_CONTENT_VERSION, getSpectrum(id), getItem(id) -> {id,text,anchor,tags,spectrumId,left,right,cat},
//                    allItems(), scheduleFor(issueNo) -> 5 item ids | null
// Group formulas (PD-5) are composed here from the primitives so client and server share the primitives.
const dateMod = require('../core/date');
const score = require('../core/score');
const config = require('../core/config');
const content = require('../core/content');
const crypto = require('crypto');
const { CARDS } = require('./util');

function cfg() {
  const c = (config.getConfig && config.getConfig()) || {};
  const s = c.score || {};
  return {
    priorVotes: Number.isInteger(s.priorVotes) ? s.priorVotes : 10,
    agreeMin: Number.isInteger(s.agreeMin) ? s.agreeMin : 30,
    agreeRadius: Number.isInteger(s.agreeRadius) ? s.agreeRadius : 10,
    boardListCap: Number.isInteger(c.boardListCap) && c.boardListCap > 0 ? c.boardListCap : 3000,
    groupRowCap: Number.isInteger(c.groupRowCap) && c.groupRowCap > 0 ? c.groupRowCap : 500,
  };
}

/** Beijing date key for a ms timestamp (core date.js; explicit UTC+8 arithmetic). */
function dateKeyAt(ms) {
  return dateMod.beijingDateKey(ms);
}

// ---- scoring primitives ----
const cardScore = (d) => score.cardScore(d);
const cardLabel = (d) => score.cardLabel(d);
const dayBand = (t) => score.dayBand(t);
const medianOfValues = (v) => score.medianOfValues(v);
/** R_c = median(real positions + W virtual votes at the anchor), PD-4 */
function refFromHist(hist, anchor) {
  return score.referenceFromHist(hist, anchor, cfg().priorVotes);
}
/** share (0-100 integer) of real positions within the agree radius of p; null below agreeMin real answers */
function agreePct(hist, n, p) {
  const c = cfg();
  if (!(n >= c.agreeMin)) return null;
  let k = 0;
  for (let v = Math.max(0, p - c.agreeRadius); v <= Math.min(100, p + c.agreeRadius); v++) k += hist[v] || 0;
  return Math.round((100 * k) / n);
}
/** mean absolute deviation of real positions from `ref`; null when there are none */
function madFromHist(hist, n, ref) {
  if (!(n > 0)) return null;
  let sum = 0;
  for (let v = 0; v <= 100; v++) sum += (hist[v] || 0) * Math.abs(v - ref);
  return sum / n;
}
/** 101 bins -> 21 bins of width 5 (the last bin is the single value 100) */
function hist21(hist) {
  const out = new Array(21).fill(0);
  for (let v = 0; v <= 100; v++) out[Math.floor(v / 5)] += hist[v] || 0;
  return out;
}
/** finalHist bin for a day total 0-500 (101 bins of width 5) */
function totalBin(total) {
  return Math.min(100, Math.floor(total / 5));
}

// ---- group formulas (PD-5) ----
/** leave-one-out reference for member i on one card: median of the others' positions */
function looRef(positions, i) {
  const others = positions.filter((_, j) => j !== i);
  return others.length ? medianOfValues(others) : null;
}
/** 群默契度 for one card: max(0, 100 - ceil(2.5 * MAD)) where MAD is around the group median */
function cardQuality(positions) {
  const m = medianOfValues(positions);
  const mad = positions.reduce((a, p) => a + Math.abs(p - m), 0) / positions.length;
  return Math.max(0, 100 - Math.ceil(2.5 * mad));
}
/**
 * members: [{pos:[5 ints]}] (complete dailies only).
 * -> {gs:[number|null per member], mq:number|null}; gs needs n >= 2, mq needs n >= 3.
 */
function groupScores(members) {
  const n = members.length;
  const gs = members.map((m, i) => {
    if (n < 2) return null;
    let sum = 0;
    for (let c = 0; c < CARDS; c++) {
      const r = looRef(members.map((x) => x.pos[c]), i);
      sum += cardScore(Math.abs(m.pos[c] - r));
    }
    return sum;
  });
  let mq = null;
  if (n >= 3) {
    let q = 0;
    for (let c = 0; c < CARDS; c++) q += cardQuality(members.map((x) => x.pos[c]));
    mq = Math.round(q / CARDS);
  }
  return { gs, mq };
}

// ---- content ----
const CONTENT_VERSION = () => content.LATEST_CONTENT_VERSION;
const getItem = (id) => content.getItem(id) || null;
const getSpectrum = (id) => content.getSpectrum(id) || null;
/** items of the schedule for issue n (resolved), or null if exhausted / unresolvable */
function scheduleCards(issueNo) {
  const ids = content.scheduleFor(issueNo);
  if (!Array.isArray(ids) || ids.length !== CARDS) return null;
  const items = ids.map(getItem);
  return items.every(Boolean) ? items : null;
}

/** small deterministic PRNG from a string seed */
function seeded(seedStr) {
  let a = crypto.createHash('sha256').update(String(seedStr)).digest().readUInt32BE(0);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Auto path (spec 4.2) when the schedule is exhausted: 5 unused items, 5 different categories and spectra,
 * card 1 `easy`, at least one `split`. Deterministic for a seed string. null if impossible.
 */
function autoCards(usedIds, seedStr) {
  const rnd = seeded(seedStr);
  const free = content.allItems().filter((it) => !usedIds.has(it.id));
  const pick = (pool) => pool[Math.floor(rnd() * pool.length)];
  for (let attempt = 0; attempt < 50; attempt++) {
    const chosen = [];
    const cats = new Set();
    const specs = new Set();
    const take = (pred) => {
      const pool = free.filter((it) => !cats.has(it.cat) && !specs.has(it.spectrumId) && !chosen.includes(it) && pred(it));
      if (!pool.length) return false;
      const it = pick(pool);
      chosen.push(it); cats.add(it.cat); specs.add(it.spectrumId);
      return true;
    };
    if (!take((it) => (it.tags || []).includes('easy'))) continue;
    if (!take((it) => (it.tags || []).includes('split'))) continue;
    let ok = true;
    while (chosen.length < CARDS && ok) ok = take(() => true);
    if (ok) {
      // order: the easy item stays first, the rest shuffled deterministically
      const rest = chosen.slice(1).map((it) => [rnd(), it]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      return [chosen[0], ...rest];
    }
  }
  return null;
}

module.exports = {
  cfg, dateKeyAt, cardScore, cardLabel, dayBand, medianOfValues, refFromHist, agreePct, madFromHist, hist21, totalBin,
  looRef, groupScores, CONTENT_VERSION, getItem, getSpectrum, scheduleCards, autoCards,
};
