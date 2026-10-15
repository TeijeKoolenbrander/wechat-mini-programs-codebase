/**
 * Scoring (spec 3). Pure CommonJS, no wx, no I/O: the client and the cloud
 * functions use this exact file (drift test, AC 7).
 *
 * Positions are integers 0..100. References and distances may be half-integers.
 * A "hist" is a 101-element array of counts indexed by position.
 */

const { getConfig, LATEST_CONFIG_VERSION } = require('./config');

const CFG = getConfig(LATEST_CONFIG_VERSION);
const HIST_LEN = 101;

/** Float guard: 2.5 * d is exact for half-integers, but MADs are not; round to 1e-6 before ceil. */
function ceilSafe(x) {
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

/** 3.1 card score: max(0, 100 - ceil(2.5 * d)). */
function cardScore(d) {
  return Math.max(0, 100 - ceilSafe(CFG.score.perStep * d));
}

/** Score of position p against reference ref. */
function scoreAt(p, ref) {
  return cardScore(Math.abs(p - ref));
}

/** 3.1 label by distance: { key, label } */
function labelFor(d) {
  const ls = CFG.score.labels;
  for (let i = 0; i < ls.length; i++) if (d <= ls[i].max) return { key: ls[i].key, label: ls[i].label };
  return { key: ls[ls.length - 1].key, label: ls[ls.length - 1].label };
}

/** 3.2 median of an unsorted list (copy-sorted). null for an empty list. */
function medianOf(values) {
  const M = values.length;
  if (M === 0) return null;
  const v = values.slice().sort((a, b) => a - b);
  return (v[Math.floor((M - 1) / 2)] + v[Math.floor(M / 2)]) / 2;
}

function newHist() {
  return new Array(HIST_LEN).fill(0);
}

function histCount(hist) {
  let n = 0;
  for (let i = 0; i < hist.length; i++) n += hist[i];
  return n;
}

/** 3.2 median from a 101-bin histogram in O(101). null when empty. */
function medianFromHist(hist) {
  const M = histCount(hist);
  if (M === 0) return null;
  const lo = Math.floor((M - 1) / 2);
  const hi = Math.floor(M / 2);
  let acc = 0;
  let a = null;
  let b = null;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (a === null && acc > lo) a = i;
    if (acc > hi) {
      b = i;
      break;
    }
  }
  return (a + b) / 2;
}

/** 3.3 national reference: median of real positions plus W virtual votes at the anchor. */
function nationalRef(hist, anchor, priorVotes) {
  const W = priorVotes === undefined ? CFG.score.priorVotes : priorVotes;
  const h = hist.slice();
  h[anchor] += W;
  return medianFromHist(h);
}

/** 3.3 "和全国 x% 的人想法相近": share of real positions within radius of p (p included in hist). null below minN. */
function agreePct(hist, p, radius, minN) {
  const r = radius === undefined ? CFG.score.agreeRadius : radius;
  const mn = minN === undefined ? CFG.score.agreeMinN : minN;
  const n = histCount(hist);
  if (n < mn) return null;
  let c = 0;
  for (let i = Math.max(0, p - r); i <= Math.min(100, p + r); i++) c += hist[i];
  return Math.round((100 * c) / n);
}

/** Mean absolute deviation of the histogram's real positions from ref (0 when empty). */
function madFromHist(hist, ref) {
  const n = histCount(hist);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < hist.length; i++) s += hist[i] * Math.abs(i - ref);
  return s / n;
}

/** 3.3 today's most divisive card: highest national MAD, ties -> lower index. hists/refs are length 5. */
function divisiveIdx(hists, refs) {
  let best = -1;
  let bestMad = -1;
  for (let i = 0; i < hists.length; i++) {
    const m = madFromHist(hists[i], refs[i]);
    if (m > bestMad + 1e-9) {
      bestMad = m;
      best = i;
    }
  }
  return best;
}

/** 3.3 daily total: sum of card scores against refs; null entries (unanswered) are skipped. */
function dayTotal(positions, refs) {
  let t = 0;
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] === null || positions[i] === undefined || refs[i] === null || refs[i] === undefined) continue;
    t += scoreAt(positions[i], refs[i]);
  }
  return t;
}

/** 3.3 band by total: { key, label }. */
function bandFor(total) {
  const bs = CFG.score.bands;
  for (let i = 0; i < bs.length; i++) if (total >= bs[i].min) return { key: bs[i].key, label: bs[i].label };
  return { key: bs[bs.length - 1].key, label: bs[bs.length - 1].label };
}

/** The 21-bin view of a 101-bin histogram (bins of 5; bin 20 holds 100). Used by 全国分布. */
function histBins21(hist) {
  const out = new Array(21).fill(0);
  for (let i = 0; i < hist.length; i++) out[Math.min(20, Math.floor(i / 5))] += hist[i];
  return out;
}

/** finalHist index of a daily total (101 bins of width 5 over 0..500). */
function totalBin(total) {
  return Math.max(0, Math.min(100, Math.floor(total / 5)));
}

/**
 * 3.3 percentile (定分 only): share of complete dailies with a STRICTLY lower final total, rounded down.
 * finalHist is binned by 5, so without `exactLower` (the exact count of strictly lower totals, if the
 * caller has it) every total in the viewer's own bin counts as not lower. null below percentileMinN.
 */
function percentile(finalHist, total, count, exactLower) {
  const n = count === undefined ? histCount(finalHist) : count;
  if (n < CFG.score.percentileMinN) return null;
  let lower = exactLower;
  if (lower === undefined) {
    lower = 0;
    const b = totalBin(total);
    for (let i = 0; i < b; i++) lower += finalHist[i];
  }
  return Math.floor((100 * lower) / n);
}

// ---------------------------------------------------------------- 3.4 group

/** Leave-one-out reference: median of the other members' positions on a card. null if nobody else. */
function looRef(positions, i) {
  const others = [];
  for (let j = 0; j < positions.length; j++) if (j !== i) others.push(positions[j]);
  return medianOf(others);
}

/**
 * 群内默契分 of member i. cards: array of 5 arrays, cards[c][m] = position of member m on card c
 * (all members complete). Needs n >= 2, else null.
 */
function groupScore(cards, i) {
  const n = cards[0].length;
  if (n < CFG.score.groupMinForScore) return null;
  let t = 0;
  for (let c = 0; c < cards.length; c++) t += scoreAt(cards[c][i], looRef(cards[c], i));
  return t;
}

/** Mean absolute deviation of members' positions from their median on one card. */
function groupCardMad(positions) {
  const m = medianOf(positions);
  let s = 0;
  for (let i = 0; i < positions.length; i++) s += Math.abs(positions[i] - m);
  return s / positions.length;
}

/** 群默契度 = round(mean over the cards of max(0, 100 - ceil(2.5 * MAD_c))). null below 3 members. */
function groupMq(cards) {
  const n = cards[0].length;
  if (n < CFG.score.groupMinForMq) return null;
  let t = 0;
  for (let c = 0; c < cards.length; c++) t += Math.max(0, 100 - ceilSafe(CFG.score.perStep * groupCardMad(cards[c])));
  return Math.round(t / cards.length);
}

/** The ● shown in the daily reveal: median of the given (other members') positions, null if none. */
function groupMedian(positions) {
  return medianOf(positions);
}

/**
 * 最同频: viewer positions v[5]; others [{id, pos:[5], t}]. Smallest mean |difference| wins,
 * ties -> smaller t (earlier completion). Returns { id, gap (mean, unrounded), gapText (rounded int) } or null.
 */
function closestMate(v, others) {
  let best = null;
  for (let k = 0; k < others.length; k++) {
    const o = others[k];
    let s = 0;
    for (let c = 0; c < v.length; c++) s += Math.abs(v[c] - o.pos[c]);
    const gap = s / v.length;
    if (!best || gap < best.gap - 1e-9 || (Math.abs(gap - best.gap) <= 1e-9 && o.t < best.t)) best = { id: o.id, gap, t: o.t };
  }
  return best ? { id: best.id, gap: best.gap, gapText: Math.round(best.gap) } : null;
}

// ---------------------------------------------------------------- 3.5 rounds

/** Round 默契值 = round(mean of on-time guess scores). null when there are none. guesses: [{pos, late}] */
function roundMq(guesses, target) {
  const on = guesses.filter((g) => !g.late);
  if (!on.length) return null;
  let s = 0;
  for (let i = 0; i < on.length; i++) s += scoreAt(on[i].pos, target);
  return Math.round(s / on.length);
}

/** 最懂你: the on-time guess with the smallest distance; ties -> earliest (smaller ts, then array order). Returns the guess or null. */
function bestGuess(guesses, target) {
  let best = null;
  for (let i = 0; i < guesses.length; i++) {
    const g = guesses[i];
    if (g.late) continue;
    const d = Math.abs(g.pos - target);
    if (!best || d < best.d || (d === best.d && (g.ts || 0) < (best.g.ts || 0))) best = { g, d };
  }
  return best ? best.g : null;
}

/** Signed rounded steps from `from` to `to` (positive = `to` is to the right). */
function stepsBetween(from, to) {
  return Math.round(to - from);
}

module.exports = {
  HIST_LEN,
  ceilSafe,
  cardScore,
  scoreAt,
  labelFor,
  medianOf,
  newHist,
  histCount,
  medianFromHist,
  nationalRef,
  agreePct,
  madFromHist,
  divisiveIdx,
  dayTotal,
  bandFor,
  histBins21,
  totalBin,
  percentile,
  looRef,
  groupScore,
  groupCardMad,
  groupMq,
  groupMedian,
  closestMate,
  roundMq,
  bestGuess,
  stepsBetween,
};
