'use strict';
// TEST DOUBLE of core/deck.js: pair rules (4.1), bands (4.2), segments, weekday themes (4.3).
// Faithful enough for the server tests; the real core replaces it. Pure and deterministic.
const rng = require('./rng');
const config = require('./config');
const content = require('./content');
const format = require('./format');

const THEMES = {
  1: { key: 'city', label: '城市', categories: ['city'] },
  2: { key: 'geo', label: '山河', categories: ['geo'] },
  3: { key: 'era', label: '古今', categories: ['era'] },
  4: { key: 'animal', label: '动物', categories: ['animal'] },
  5: { key: 'space_build', label: '天文与工程', categories: ['space', 'build'] },
  6: { key: 'food_dist', label: '吃喝与距离', categories: ['food', 'dist'] },
  0: { key: 'mix', label: '大杂烩', categories: null },
};
const themeForWeekday = (wd) => THEMES[wd];

function minGapOf(measure, fa, fb) {
  const approx = fa.approx || fb.approx;
  if (measure.kind === 'year') return Math.max(30, 2 * Math.max(fa.uncertainty || 0, fb.uncertainty || 0));
  return approx ? measure.minGap * 1.5 : measure.minGap;
}
/** gap in the band's units: ratio max/min, or |delta years| */
function gapValue(measure, fa, fb) {
  if (measure.kind === 'year') return Math.abs(fb.value - fa.value);
  return Math.max(fa.value, fb.value) / Math.min(fa.value, fb.value);
}
function legalPair(measure, fa, fb) {
  if (!fa || !fb || fa.id === fb.id || fa.label === fb.label || fa.measure !== fb.measure) return false;
  if (fa.status !== 'active' || fb.status !== 'active') return false;
  if ((fa.noPairWith || []).includes(fb.id) || (fb.noPairWith || []).includes(fa.id)) return false;
  if (gapValue(measure, fa, fb) < minGapOf(measure, fa, fb)) return false;
  const ta = format.formatValue(fa, measure).valueText;
  const tb = format.formatValue(fb, measure).valueText;
  return ta !== tb; // displayed (rounded) values must not tie
}
function bandFor(cfg, measure, k, minGap) {
  const rows = cfg.bands[measure.kind === 'year' ? 'year' : 'ratio'];
  const row = rows.find((r) => k >= r[0] && k <= r[1]) || rows[rows.length - 1];
  let lo = Math.max(row[2], minGap);
  let hi = row[3];
  if (hi < minGap * 1.2) hi = minGap * 1.2;
  if (lo > hi) lo = hi;
  return [lo, hi];
}

/**
 * Build one deck of `length` questions. opts: {facts, seed, attempt, length, configVersion, categories|null,
 * segMin, segMax, maxSegmentsPerMeasure, repeatGap (free: 10 | daily: Infinity = once per deck)}.
 * Returns [{a, b}] (fact objects) or null when no deck could be built.
 */
function buildDeck(opts) {
  const cfg = config.getConfig(opts.configVersion);
  const measures = content.getMeasures();
  const rand = rng.mulberry32(rng.sub(opts.seed, `deck:${opts.attempt || 0}`));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const byMeasure = {};
  for (const f of opts.facts) if (f.status === 'active' && measures[f.measure]) (byMeasure[f.measure] = byMeasure[f.measure] || []).push(f);
  const usable = (cats) => Object.keys(byMeasure).filter((m) => byMeasure[m].length >= 4 && (!cats || cats.includes(measures[m].category))).sort();
  const questions = [];
  const used = new Set();
  const recent = [];
  const segCount = {};
  let lastMeasure = null;
  let failures = 0;
  while (questions.length < opts.length) {
    const k0 = questions.length + 1;
    const cats = opts.categories && k0 <= 20 ? opts.categories : null;
    // themed phase (questions 1-20): the theme's measures may repeat; the per-measure segment cap applies to the mixed phase
    const capOk = (m) => !!cats || (segCount[m] || 0) < opts.maxSegmentsPerMeasure;
    let cand = usable(cats).filter((m) => m !== lastMeasure && capOk(m));
    if (!cand.length && cats) cand = usable(cats).filter(capOk);
    if (!cand.length) cand = usable(null).filter((m) => m !== lastMeasure && (segCount[m] || 0) < opts.maxSegmentsPerMeasure);
    if (!cand.length) cand = usable(null).filter((m) => (segCount[m] || 0) < opts.maxSegmentsPerMeasure);
    if (!cand.length) return null;
    const mkey = pick(cand);
    const measure = measures[mkey];
    const segLen = Math.min(opts.segMin + Math.floor(rand() * (opts.segMax - opts.segMin + 1)), opts.length - questions.length);
    const free = (f) => !used.has(f.id) && !recent.includes(f.id);
    let top = pick(byMeasure[mkey].filter(free));
    if (!top) { if (++failures > 30) return null; continue; }
    let made = 0;
    for (let i = 0; i < segLen; i++) {
      const k = questions.length + 1;
      const legal = byMeasure[mkey].filter((f) => free(f) && f.id !== top.id && legalPair(measure, top, f));
      if (!legal.length) break;
      const mg = minGapOf(measure, top, top);
      const [lo, hi] = bandFor(cfg, measure, k, mg);
      const inBand = legal.filter((f) => { const g = gapValue(measure, top, f); return g >= lo && g <= hi; });
      const bottom = inBand.length ? pick(inBand) : legal.reduce((best, f) => {
        const d = (x) => Math.min(Math.abs(gapValue(measure, top, x) - lo), Math.abs(gapValue(measure, top, x) - hi));
        return d(f) < d(best) ? f : best;
      });
      questions.push({ a: top, b: bottom });
      used.add(top.id); used.add(bottom.id);
      recent.push(top.id);
      if (recent.length > opts.repeatGap) recent.shift();
      if (opts.repeatGap !== Infinity) { used.delete(top.id); used.delete(bottom.id); }
      top = bottom;
      made++;
    }
    if (made === 0) { if (++failures > 30) return null; continue; }
    segCount[mkey] = (segCount[mkey] || 0) + 1;
    lastMeasure = mkey;
  }
  return questions;
}

/** free deck: from the bundled free pool; group = 'all' or a category key */
function buildFreeDeck(seed, contentVersion, configVersion, group) {
  const c = content.getContent(contentVersion);
  if (!c || !config.getConfig(configVersion)) return null;
  const measures = content.getMeasures();
  const facts = c.freeFacts.filter((f) => group === 'all' || measures[f.measure].category === group);
  return buildDeck({
    facts, seed, attempt: 0, length: 60, configVersion, categories: null, segMin: 5, segMax: 10,
    maxSegmentsPerMeasure: 99, repeatGap: 10,
  });
}
/** daily candidate (server only): daily-pool facts, weekday theme; one candidate per attempt number */
function buildDailyDeck({ facts, seed, attempt, theme, configVersion }) {
  return buildDeck({
    facts, seed, attempt, length: 40, configVersion, categories: theme && theme.categories, segMin: 4, segMax: 8,
    maxSegmentsPerMeasure: 2, repeatGap: Infinity,
  });
}
module.exports = { THEMES, themeForWeekday, legalPair, buildDeck, buildFreeDeck, buildDailyDeck, gapValue };
