'use strict';
// TEST DOUBLE of apps/kedupan/game/core/score.js: the same exported names and semantics as the real core README
// (spec 3.1-3.5), written compactly. Used only until/unless the real core is present (scripts/sync-core.js).
const { getConfig, LATEST_CONFIG_VERSION } = require('./config');

const CFG = getConfig(LATEST_CONFIG_VERSION);
const ceilSafe = (x) => Math.ceil(Math.round(x * 1e6) / 1e6);
const cardScore = (d) => Math.max(0, 100 - ceilSafe(CFG.score.perStep * d));
const scoreAt = (p, ref) => cardScore(Math.abs(p - ref));
function labelFor(d) {
  const ls = CFG.score.labels;
  for (const l of ls) if (d <= l.max) return { key: l.key, label: l.label };
  return ls[ls.length - 1];
}
function medianOf(values) {
  const M = values.length;
  if (!M) return null;
  const v = values.slice().sort((a, b) => a - b);
  return (v[Math.floor((M - 1) / 2)] + v[Math.floor(M / 2)]) / 2;
}
const newHist = () => new Array(101).fill(0);
const histCount = (h) => h.reduce((a, b) => a + b, 0);
function medianFromHist(hist) {
  const M = histCount(hist);
  if (!M) return null;
  const kth = (k) => { let acc = 0; for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc > k) return i; } return hist.length - 1; };
  return (kth(Math.floor((M - 1) / 2)) + kth(Math.floor(M / 2))) / 2;
}
function nationalRef(hist, anchor, W) {
  const h = hist.slice();
  h[anchor] += W === undefined ? CFG.score.priorVotes : W;
  return medianFromHist(h);
}
function agreePct(hist, p) {
  const n = histCount(hist);
  if (n < CFG.score.agreeMinN) return null;
  let c = 0;
  for (let i = Math.max(0, p - CFG.score.agreeRadius); i <= Math.min(100, p + CFG.score.agreeRadius); i++) c += hist[i];
  return Math.round((100 * c) / n);
}
function madFromHist(hist, ref) {
  const n = histCount(hist);
  if (!n) return 0;
  return hist.reduce((s, c, i) => s + c * Math.abs(i - ref), 0) / n;
}
function divisiveIdx(hists, refs) {
  let best = -1; let bm = -1;
  for (let i = 0; i < hists.length; i++) { const m = madFromHist(hists[i], refs[i]); if (m > bm + 1e-9) { bm = m; best = i; } }
  return best;
}
function dayTotal(pos, refs) {
  let t = 0;
  for (let i = 0; i < pos.length; i++) if (pos[i] != null && refs[i] != null) t += scoreAt(pos[i], refs[i]);
  return t;
}
function bandFor(total) {
  for (const b of CFG.score.bands) if (total >= b.min) return { key: b.key, label: b.label };
  return CFG.score.bands[CFG.score.bands.length - 1];
}
function histBins21(hist) {
  const out = new Array(21).fill(0);
  hist.forEach((c, i) => { out[Math.min(20, Math.floor(i / 5))] += c; });
  return out;
}
const totalBin = (t) => Math.max(0, Math.min(100, Math.floor(t / 5)));
function percentile(finalHist, total, count, exactLower) {
  const n = count === undefined ? histCount(finalHist) : count;
  if (n < CFG.score.percentileMinN) return null;
  let lower = exactLower;
  if (lower === undefined) { lower = 0; for (let i = 0; i < totalBin(total); i++) lower += finalHist[i]; }
  return Math.floor((100 * lower) / n);
}
function looRef(positions, i) {
  return medianOf(positions.filter((_, j) => j !== i));
}
function groupScore(cards, i) {
  if (cards[0].length < CFG.score.groupMinForScore) return null;
  let t = 0;
  for (const c of cards) t += scoreAt(c[i], looRef(c, i));
  return t;
}
function groupCardMad(positions) {
  const m = medianOf(positions);
  return positions.reduce((s, p) => s + Math.abs(p - m), 0) / positions.length;
}
function groupMq(cards) {
  if (cards[0].length < CFG.score.groupMinForMq) return null;
  let t = 0;
  for (const c of cards) t += Math.max(0, 100 - ceilSafe(CFG.score.perStep * groupCardMad(c)));
  return Math.round(t / cards.length);
}
const groupMedian = (positions) => medianOf(positions);
function roundMq(guesses, target) {
  const on = guesses.filter((g) => !g.late);
  if (!on.length) return null;
  return Math.round(on.reduce((s, g) => s + scoreAt(g.pos, target), 0) / on.length);
}
function bestGuess(guesses, target) {
  let best = null;
  for (const g of guesses) {
    if (g.late) continue;
    const d = Math.abs(g.pos - target);
    if (!best || d < best.d || (d === best.d && (g.ts || 0) < (best.g.ts || 0))) best = { g, d };
  }
  return best ? best.g : null;
}

module.exports = {
  ceilSafe, cardScore, scoreAt, labelFor, medianOf, newHist, histCount, medianFromHist, nationalRef, agreePct, madFromHist,
  divisiveIdx, dayTotal, bandFor, histBins21, totalBin, percentile, looRef, groupScore, groupCardMad, groupMq, groupMedian,
  roundMq, bestGuess,
};
