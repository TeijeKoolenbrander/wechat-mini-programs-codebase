/**
 * Play-state helpers (spec 8.2, 13): ladder rows, chips, temperatures. Pure; the controller
 * and the view models build on these and QA unit-tests them without any rendering.
 *
 * A guess entry (as kept by the client, in guess order):
 *   { word: string|null, r: number|null, t: number|null, src, isHint, isSyn, ch? }
 * The 提示 3 (first character) step has word === null, r === null and `ch` set: it counts as
 * a step but is not a ladder row.
 */
const { temperature, bandOf, rankLabel } = require('./temp');

const HINT_SRCS = ['hint', 'adhint'];

/** Normalise a server guess record ({word|w, r, t, src, syn?, ch?}) into a client entry. */
function toEntry(g, V) {
  const word = g.word === undefined ? null : g.word;
  const r = g.r === undefined ? null : g.r;
  return {
    word,
    r,
    t: g.t !== undefined && g.t !== null ? g.t : r === null ? null : temperature(r, V),
    src: g.src || 'typed',
    isHint: HINT_SRCS.indexOf(g.src) >= 0,
    isSyn: !!g.syn,
    ch: g.ch || undefined,
  };
}

/** One ladder row view model (spec 13 Row). */
function rowOf(e, latestWord) {
  const band = bandOf(e.r);
  return {
    word: e.word,
    rank: e.r,
    rankLabel: rankLabel(e.r),
    temp: e.t,
    band: band.key,
    bandLabel: band.label,
    isHint: e.isHint,
    isSyn: e.isSyn,
    isLatest: e.word === latestWord,
  };
}

/** Ladder: rows for every guess with a rank, closest first (ties keep guess order). */
function ladderRows(guesses, latestWord) {
  const rows = [];
  guesses.forEach((e, i) => {
    if (e.word !== null && e.r !== null) rows.push({ row: rowOf(e, latestWord), i });
  });
  rows.sort((a, b) => a.row.rank - b.row.rank || a.i - b.i);
  return rows.map((x) => x.row);
}

function rowFor(guesses, word, latestWord) {
  for (const e of guesses) if (e.word === word && e.r !== null) return rowOf(e, latestWord);
  return null;
}

/** Association chips: the first `max` neighbours not already in the ladder (spec 4.2). */
function chipsFrom(near, guesses, max) {
  const have = new Set();
  for (const e of guesses) if (e.word) have.add(e.word);
  const out = [];
  for (const w of near || []) {
    if (have.has(w) || out.indexOf(w) >= 0) continue;
    out.push(w);
    if (out.length >= (max === undefined ? 5 : max)) break;
  }
  return out;
}

/** Per-step temperatures in order; the first-character hint step carries the best so far. */
function stepTemps(guesses) {
  const out = [];
  let best = 0;
  for (const e of guesses) {
    if (e.t !== null && e.t > best) best = e.t;
    out.push(e.t !== null ? e.t : best);
  }
  return out;
}

/** Per-step band keys, matching stepTemps. */
function stepBands(guesses) {
  const out = [];
  let bestR = Infinity;
  for (const e of guesses) {
    if (e.r !== null && e.r < bestR) bestR = e.r;
    out.push(bandOf(e.r !== null ? e.r : bestR === Infinity ? 1e9 : bestR).key);
  }
  return out;
}

function bestRank(guesses) {
  let b = null;
  for (const e of guesses) if (e.r !== null && (b === null || e.r < b)) b = e.r;
  return b;
}

/** Counts of the typed/tapped sources (non-hint steps) for the solve event: adds up to the non-hint steps. */
function srcMix(guesses) {
  const m = { warmup: 0, chip: 0, suggest: 0, typed: 0 };
  for (const e of guesses) if (!e.isHint && m[e.src] !== undefined) m[e.src]++;
  return m;
}

function hasWord(guesses, word) {
  for (const e of guesses) if (e.word === word) return true;
  return false;
}

/** "21 步猜中 · 用了 1 次提示" | "未猜中 · 最近第 3 名" */
function summaryLine(outcome, steps, hintsTotal, best) {
  if (outcome === 'solved') return steps + ' 步猜中' + (hintsTotal > 0 ? ' · 用了 ' + hintsTotal + ' 次提示' : '');
  return '未猜中' + (best ? ' · 最近' + rankLabel(best) : '');
}

module.exports = { toEntry, rowOf, ladderRows, rowFor, chipsFrom, stepTemps, stepBands, bestRank, srcMix, hasWord, summaryLine, HINT_SRCS };
