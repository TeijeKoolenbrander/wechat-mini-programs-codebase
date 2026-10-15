'use strict';
// The ONLY place that touches the shared game core (copied into ./core by scripts/sync-core.js).
// Real core contract: apps/kedupan/game/core/README.md (minigame-dev). Used surface:
//   core/date.js      beijingDateKey
//   core/score.js     cardScore, labelFor, bandFor, medianOf, nationalRef, agreePct, divisiveIdx, histBins21, totalBin,
//                     percentile, looRef, groupScore, groupMq, groupMedian, roundMq, bestGuess
//   core/config.js    getConfig(1), normalizeFeatures
//   core/content.js   getContent(1) -> {spectrumById, itemById, ...}
//   core/content/schedule.v1.js   {days:[[5 item ids]...]} (optional until the content owner generates it)
//   core/schedule.js  pickAutoDaily(content, dateKey, usedSet, recentSpectraSet)
const dateMod = require('../core/date');
const score = require('../core/score');
const config = require('../core/config');
const contentMod = require('../core/content');
const scheduleMod = require('../core/schedule');
const { CARDS } = require('./util');

function cfg() {
  const c = config.getConfig(config.LATEST_CONFIG_VERSION) || {};
  const s = c.score || {};
  const r = c.rounds || {};
  const x = c.extras || {};
  const num = (v, d) => (Number.isInteger(v) && v > 0 ? v : d);
  return {
    boardListCap: num(c.boardListCap, 3000),
    groupRowCap: num(s.groupRowCap, 500),
    bonusPerDay: num(x.bonusPerDay, 3),
    distributionPerDay: num(x.distributionPerDay, 3),
    reportsPerDay: num(x.reportsPerDay, 10),
    roundsPerDay: num(r.perDayLimit, 20),
    targetMin: num(r.targetMin, 5),
    targetMax: num(r.targetMax, 95),
    revealMinGuesses: num(r.revealMinGuesses, 2),
    autoRevealAt: num(r.autoRevealAt, 8),
    autoRevealMs: num(r.autoRevealMs, 24 * 3600e3),
    guessWindowMs: num(r.guessWindowMs, 7 * 24 * 3600e3),
    draftMs: num(r.draftMs, 30 * 60e3),
    groupRefsCap: num(r.groupRefsCap, 10),
  };
}

/** the remote-features block the client uses (core/config.js normalizeFeatures) */
function features(appConfig) {
  const a = appConfig || {};
  const ads = a.ads || {};
  return config.normalizeFeatures({ subscribe: a.subscribe, banner: ads.banner, interstitial: ads.interstitial });
}

const content = () => contentMod.getContent(contentMod.LATEST_CONTENT_VERSION);

/** Beijing date key for a ms timestamp (core date.js; explicit UTC+8 arithmetic). */
const dateKeyAt = (ms) => dateMod.beijingDateKey(ms);

// ---- scoring primitives ----
const cardScore = (d) => score.cardScore(d);
const cardLabel = (d) => score.labelFor(d).label;
const dayBand = (t) => score.bandFor(t).label;
const medianOfValues = (v) => score.medianOf(v);
/** R_c = median(real positions + W virtual votes at the anchor), PD-4 */
const refFromHist = (hist, anchor) => score.nationalRef(hist, anchor);
/** share (0-100) of real positions within the agree radius of p (hist INCLUDES p); null below the minimum */
const agreePct = (hist, p) => score.agreePct(hist, p);
const hist21 = (hist) => score.histBins21(hist);
const totalBin = (t) => score.totalBin(t);
/** 定分 percentile from finalHist; null below the minimum count */
const percentile = (finalHist, total, count) => score.percentile(finalHist, total, count);
/** card with the widest national spread; null when nobody has answered anything */
function divisiveIdx(hists, refs) {
  if (!hists.some((h) => h.some((c) => c > 0))) return null;
  return score.divisiveIdx(hists, refs);
}
const looRef = (positions, i) => score.looRef(positions, i);

/**
 * members: [{pos:[5 ints]}] (complete dailies only) -> {gs:[number|null per member], mq:number|null}
 * (PD-5: gs needs n >= 2, mq needs n >= 3; both rules live in core/score.js).
 */
function groupScores(members) {
  const cards = [];
  for (let c = 0; c < CARDS; c++) cards.push(members.map((m) => m.pos[c]));
  return { gs: members.map((_, i) => score.groupScore(cards, i)), mq: score.groupMq(cards) };
}

// ---- host rounds ----
const roundMq = (guesses, target) => score.roundMq(guesses, target);
const bestGuess = (guesses, target) => score.bestGuess(guesses, target);

// ---- content ----
const CONTENT_VERSION = () => contentMod.LATEST_CONTENT_VERSION;
const getItem = (id) => content().itemById[id] || null;
const catLabel = (cat) => (content().catLabel && content().catLabel[cat]) || null;
const getSpectrum = (id) => content().spectrumById[id] || null;

let scheduleDays;
/** the shipped schedule's days (arrays of 5 item ids), or null while core/content/schedule.v1.js does not exist */
function loadSchedule() {
  if (scheduleDays !== undefined) return scheduleDays;
  try {
    // eslint-disable-next-line global-require
    const s = require('../core/content/schedule.v1');
    scheduleDays = Array.isArray(s) ? s : s && Array.isArray(s.days) ? s.days : null;
  } catch (e) {
    scheduleDays = null;
  }
  return scheduleDays;
}
/** items of the schedule for issue n (resolved); null when the schedule is missing, exhausted or unresolvable */
function scheduleCards(issueNo) {
  const days = loadSchedule();
  if (!days) return null;
  const ids = days[issueNo - 1];
  if (!Array.isArray(ids) || ids.length !== CARDS) return null;
  const items = ids.map(getItem);
  return items.every(Boolean) ? items : null;
}
const hasSchedule = () => !!loadSchedule();

/** Auto path (spec 4.2): 5 unused items by the schedule rules, deterministic per dateKey; null when impossible */
function autoCards(dateKey, usedIds, recentSpectra) {
  const ids = scheduleMod.pickAutoDaily(content(), dateKey, usedIds, recentSpectra);
  if (!ids) return null;
  const items = ids.map(getItem);
  return items.every(Boolean) ? items : null;
}

module.exports = {
  cfg, features, dateKeyAt, cardScore, cardLabel, dayBand, medianOfValues, refFromHist, agreePct, hist21, totalBin, percentile,
  divisiveIdx, looRef, groupScores, roundMq, bestGuess, CONTENT_VERSION, catLabel, getItem, getSpectrum, scheduleCards, hasSchedule, autoCards,
};
