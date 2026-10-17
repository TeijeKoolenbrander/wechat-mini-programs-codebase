/**
 * Scoring (spec 3, AC 1-5, 7). Pure JS, no wx, no DOM, deterministic. Copied into the cloud functions, so
 * client and server compute identical numbers (drift test, AC 7).
 *
 * Positions are integers 0..100. Reference values (medians) may be half-integers.
 */

const { CONFIG } = require('./config');

const BINS = 101;

function isPos(p) {
  return Number.isInteger(p) && p >= 0 && p <= 100;
}
function clampPos(p) {
  return p < 0 ? 0 : p > 100 ? 100 : p;
}

/** s(d) = max(0, 100 - ceil(2.5 * d)) (spec 3.1) */
function cardScore(d) {
  const s = 100 - Math.ceil(CONFIG.score.perStep * d);
  return s > 0 ? s : 0;
}

/** Card label by distance (spec 3.1). */
function cardLabel(d) {
  const ls = CONFIG.score.labels;
  for (let i = 0; i < ls.length; i++) if (d <= ls[i].maxD) return ls[i].label;
  return ls[ls.length - 1].label;
}

/** {d, score, label} of position p against reference ref. */
function scoreAt(p, ref) {
  const d = Math.abs(p - ref);
  return { d, score: cardScore(d), label: cardLabel(d) };
}

/** Day band label for a total 0..500 (spec 3.3). */
function dayBand(total) {
  const bs = CONFIG.score.bands;
  for (let i = 0; i < bs.length; i++) if (total >= bs[i].min) return bs[i].label;
  return bs[bs.length - 1].label;
}

// ---- histograms -------------------------------------------------------------------------------------------------

function emptyHist() {
  return new Array(BINS).fill(0);
}
function histTotal(hist) {
  let n = 0;
  for (let i = 0; i < hist.length; i++) n += hist[i] || 0;
  return n;
}

/** Median of a sorted-ascending read of a histogram (spec 3.2). null when empty. O(101). */
function histMedian(hist) {
  const M = histTotal(hist);
  if (M === 0) return null;
  const lo = Math.floor((M - 1) / 2);
  const hi = Math.floor(M / 2);
  let seen = 0;
  let a = null;
  let b = null;
  for (let v = 0; v < hist.length; v++) {
    const c = hist[v] || 0;
    if (c === 0) continue;
    if (a === null && lo < seen + c) a = v;
    if (b === null && hi < seen + c) b = v;
    seen += c;
    if (a !== null && b !== null) break;
  }
  return (a + b) / 2;
}

/** Median of a list of numbers (spec 3.2). null when empty. Does not mutate. */
function medianOf(values) {
  const M = values.length;
  if (M === 0) return null;
  const v = values.slice().sort((x, y) => x - y);
  return (v[Math.floor((M - 1) / 2)] + v[Math.floor(M / 2)]) / 2;
}

/** Mean absolute deviation of `values` from `center`. 0 for an empty list. */
function madOf(values, center) {
  if (values.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += Math.abs(values[i] - center);
  return s / values.length;
}

/** MAD of a histogram's real positions about `center`. 0 when empty. */
function histMad(hist, center) {
  const M = histTotal(hist);
  if (M === 0) return 0;
  let s = 0;
  for (let v = 0; v < hist.length; v++) if (hist[v]) s += hist[v] * Math.abs(v - center);
  return s / M;
}

/**
 * National reference R_c (spec 3.3, PD-4): median of the real positions plus `priorVotes` virtual votes at the
 * editor anchor. With no real positions it is the anchor. Does not mutate `hist`.
 */
function nationRef(hist, anchor, priorVotes) {
  const W = priorVotes === undefined ? CONFIG.score.priorVotes : priorVotes;
  const h = hist.slice();
  const a = Math.round(clampPos(anchor));
  h[a] = (h[a] || 0) + W;
  return histMedian(h);
}

/** Share of real positions within +-agreeRadius of p (integer percent), or null below agreeMinN (spec 3.3). */
function agreePct(hist, p) {
  const M = histTotal(hist);
  if (M < CONFIG.score.agreeMinN) return null;
  const r = CONFIG.score.agreeRadius;
  let c = 0;
  for (let v = Math.max(0, p - r); v <= Math.min(100, p + r); v++) c += hist[v] || 0;
  return Math.round((100 * c) / M);
}

/** 21 display bins of the national distribution (spec 6.4). Centred: bin i holds positions 5i-2..5i+2, so both ends are half-width. */
function bin21(pos) {
  return Math.floor((pos + 2) / 5);
}
function distribution21(hist) {
  const out = new Array(21).fill(0);
  for (let v = 0; v < hist.length; v++) if (hist[v]) out[bin21(v)] += hist[v];
  return out;
}

/**
 * Card index with the widest national spread (spec 3.3): highest MAD of real positions about R_c; ties go to the
 * lower index; null when no card has an answer.
 * @param {number[][]} hists 5 x 101   @param {number[]} refs 5 reference values
 */
function mostDivisive(hists, refs) {
  let best = null;
  let bestMad = -1;
  for (let c = 0; c < hists.length; c++) {
    if (histTotal(hists[c]) === 0) continue;
    const m = histMad(hists[c], refs[c]);
    if (m > bestMad) {
      bestMad = m;
      best = c;
    }
  }
  return best;
}

// ---- daily totals -----------------------------------------------------------------------------------------------

/**
 * Daily total over the answered cards (spec 3.3). `positions` and `refs` have length 5; a null position (or a null ref)
 * is not answered. Returns {total, answered, scores: (number|null)[5], complete}.
 */
function dailyTotal(positions, refs) {
  let total = 0;
  let answered = 0;
  const scores = [];
  for (let c = 0; c < positions.length; c++) {
    const p = positions[c];
    const r = refs[c];
    if (p === null || p === undefined || r === null || r === undefined) {
      scores.push(null);
      continue;
    }
    const s = cardScore(Math.abs(p - r));
    scores.push(s);
    total += s;
    answered++;
  }
  return { total, answered, scores, complete: answered === positions.length };
}

/** Freeze the 5 references of a day from its card histograms and anchors (spec 3.3 定分). */
function freezeRefs(hists, anchors) {
  return hists.map((h, c) => nationRef(h, anchors[c]));
}

// ---- percentile (spec 3.3, TD-2) ---------------------------------------------------------------------------------

/** Final-histogram bin (width 5) of a total 0..500. */
function totalBin(total) {
  return Math.floor(total / 5);
}
/** 101-bin histogram of complete totals. */
function buildFinalHist(totals) {
  const h = emptyHist();
  for (let i = 0; i < totals.length; i++) h[totalBin(totals[i])]++;
  return h;
}
/**
 * "超过全国 x%": share of complete dailies in strictly lower bins, rounded down. The histogram has 5-point bins, so a
 * total never beats another total in its own bin (conservative: never overstates). null below percentileMinN.
 */
function percentile(total, finalHist, finalCount) {
  if (!finalHist || !finalCount || finalCount < CONFIG.score.percentileMinN) return null;
  const b = totalBin(total);
  let below = 0;
  for (let i = 0; i < b; i++) below += finalHist[i] || 0;
  return Math.floor((100 * below) / finalCount);
}

module.exports = {
  BINS,
  isPos,
  clampPos,
  cardScore,
  cardLabel,
  scoreAt,
  dayBand,
  emptyHist,
  histTotal,
  histMedian,
  medianOf,
  madOf,
  histMad,
  nationRef,
  agreePct,
  bin21,
  distribution21,
  mostDivisive,
  dailyTotal,
  freezeRefs,
  totalBin,
  buildFinalHist,
  percentile,
};
