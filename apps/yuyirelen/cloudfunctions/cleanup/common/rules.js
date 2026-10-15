'use strict';
// Pure game rules (no I/O). Spec 4.1-4.5, 8.12, 14.3. Constants mirror the spec's core/config.js.
// If the game core ships a different value, the spec table wins and this file is the one to align.
const coreapi = require('./coreapi');
const { addDaysKey, bjtDayStartMs, GRACE_MS, fail } = require('./util');

const LIMITS = Object.freeze({
  guessesPerMinute: 40, // PO-14
  guessesPerPuzzle: 600, // PO-14
  adHintsPerPuzzle: 3, // PO-4
  warmups: 6,
  chips: 5,
  revealTop: 100,
  statsMinFinishers: 30,
  histMax: 80, // stepsHist has 81 buckets, 0..79 and 80+
  maxWordChars: 8,
});

/** Free hint ladder (PO-4). `cap` = highest rank number the hint may give; null = not a word hint. */
const HINTS = Object.freeze([
  { k: 1, at: 10, cap: 300 },
  { k: 2, at: 20, cap: 50 },
  { k: 3, at: 30, cap: null }, // first character of the answer
  { k: 4, at: 40, cap: 10 },
]);

const BANDS = Object.freeze([
  { key: 'hit', max: 1 },
  { key: 'boil', max: 10 },
  { key: 'scald', max: 100 },
  { key: 'hot', max: 500 },
  { key: 'warm', max: 2000 },
  { key: 'cold', max: Infinity },
]);

/** T = round(100 * (1 - ln r / ln V)); T(1) = 100, T(V) = 0 */
function tempOf(r, V) {
  if (r <= 1) return 100;
  if (r >= V) return 0;
  return Math.round(100 * (1 - Math.log(r) / Math.log(V)));
}
function bandOf(r) {
  for (const b of BANDS) if (r <= b.max) return b.key;
  return 'cold';
}

/**
 * Hint word rank (spec 4.4). t = min(cap, max(2, floor(best/2))); if that rank is taken (already in
 * the ladder or a synonym) go to the next closer free rank (t-1 .. 2), then outward (t+1 ..). Never 1.
 * @param {{best:number|null, cap:number|null, V:number, taken:Set<number>}} o
 * @returns {number|null} rank, or null when best is already 2 (or nothing is free)
 */
function pickHintRank({ best, cap, V, taken }) {
  const b = best == null ? V : best;
  if (b <= 2) return null;
  const base = Math.max(2, Math.floor(b / 2));
  const t = cap == null ? base : Math.min(cap, base);
  for (let r = Math.min(t, V); r >= 2; r--) if (!taken.has(r)) return r;
  for (let r = t + 1; r <= V; r++) if (!taken.has(r)) return r;
  return null;
}

/** The hint (1..4) whose threshold was crossed when steps moved prev -> next, or undefined. */
function newlyUnlocked(prevSteps, steps, hintsUsed) {
  for (const h of HINTS) {
    if (prevSteps < h.at && steps >= h.at && !hintsUsed.includes(h.k)) return h.k;
  }
  return undefined;
}

/** 'open' (date is today), 'grace' (yesterday, before D+1 00:30 BJT), 'late', or 'future' */
function windowState(dateKey, nowMs) {
  const today = coreapi.dateKeyAt(nowMs);
  if (dateKey === today) return 'open';
  if (dateKey > today) return 'future';
  if (dateKey === addDaysKey(today, -1) && nowMs < bjtDayStartMs(today) + GRACE_MS) return 'grace';
  return 'late';
}
const inRankedWindow = (dateKey, nowMs) => {
  const s = windowState(dateKey, nowMs);
  return s === 'open' || s === 'grace';
};

/** median of a histogram (index = value) */
function medianFromHist(hist) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const half = (total + 1) / 2;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= half) return i;
  }
  return hist.length - 1;
}
/** share (0-100, integer) of solvers who needed MORE steps than `steps` */
function pctBetter(hist, steps) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const b = Math.min(steps, LIMITS.histMax);
  let worse = 0;
  for (let i = b + 1; i < hist.length; i++) worse += hist[i];
  return Math.round((worse / total) * 100);
}
const histBucket = (steps) => Math.min(Math.max(steps, 0), LIMITS.histMax);

/**
 * Streak after a ranked finish (spec 14.3). `prevKey` = the latest published daily before dateKey.
 * solved: lastSolvedDate == prevKey -> cur+1 else 1. gaveup: 0.
 */
function nextStreak(stats, dateKey, prevKey, outcome) {
  const s = stats || {};
  if (outcome === 'gaveup') return { curStreak: 0, bestStreak: s.bestStreak || 0, lastSolvedDate: s.lastSolvedDate || null };
  const cur = prevKey && s.lastSolvedDate === prevKey ? (s.curStreak || 0) + 1 : 1;
  return { curStreak: cur, bestStreak: Math.max(s.bestStreak || 0, cur), lastSolvedDate: dateKey };
}
/** Streak to display (8.12): alive only if the last solve is today's or the latest earlier published daily. */
function effectiveStreak(stats, todayKey, prevKey) {
  if (!stats) return { current: 0, best: 0 };
  const alive = stats.lastSolvedDate && (stats.lastSolvedDate === todayKey || (prevKey && stats.lastSolvedDate === prevKey));
  return { current: alive ? stats.curStreak || 0 : 0, best: stats.bestStreak || 0 };
}

/** Normalise typed text exactly like the client (core normalizeInput + t2s when synced): PO-25. */
const normalizeWord = (s) => coreapi.normalize(s);

/** vocabulary index of typed/tapped text, or throws NOT_IN_VOCAB. The text is never stored or logged. */
function lookupWord(vocab, text) {
  const idx = vocab.index.get(normalizeWord(text));
  if (idx === undefined) {
    fail('NOT_IN_VOCAB', 'not in vocabulary');
  }
  return idx;
}

module.exports = {
  lookupWord, LIMITS, HINTS, BANDS, tempOf, bandOf, pickHintRank, newlyUnlocked, windowState, inRankedWindow,
  medianFromHist, pctBetter, histBucket, nextStreak, effectiveStreak, normalizeWord,
};
