'use strict';
// The ONLY place that touches the shared game core (copied into ./core by scripts/sync-core.js from
// apps/bibiyi/game/core, the same code the client runs, so both sides compute identical decks, questions
// and reveals). Everything the cloud functions need from the core goes through the functions below.
//
// Real core modules used:
//   core/date.js      beijingDateKey(ms)
//   core/config.js    LATEST_CONFIG_VERSION, getConfig(v)           (throws on an unknown version; wrapped here)
//   core/content.js   LATEST_CONTENT_VERSION, getContent(v) -> {facts, byId, byMeasure} | null, indexFacts
//   core/measures.js  MEASURES, CATEGORIES, BY_KEY
//   core/deck.js      buildFreeDeck, buildDailyDeck, themeOf          (decks are {questions:[{k,a,b,m,seg,segStart}]}, a/b = fact ids)
//   core/gates.js     deckStats, passesGates
//   core/judge.js     correctChoice
//   core/question.js  questionPayload, knownFace, revealOf, ...      (one place builds what a player sees)
// The backend works with [{a, b}] FACT OBJECTS (its deck documents store ids), so decks are converted here.
const dateMod = require('../core/date');
const content = require('../core/content');
const config = require('../core/config');
const deck = require('../core/deck');
const gates = require('../core/gates');
const judge = require('../core/judge');
const question = require('../core/question');
const measuresMod = require('../core/measures');
const { fail, clampInt } = require('./util');

/** Beijing date key for a ms timestamp (core date.js; explicit UTC+8 arithmetic). */
function dateKeyAt(ms) {
  return dateMod.beijingDateKey(ms);
}

function currentVersions() {
  const configVersion = config.LATEST_CONFIG_VERSION;
  return {
    contentVersion: content.LATEST_CONTENT_VERSION,
    configVersion,
    gateVersion: config.getConfig(configVersion).gateVersion,
  };
}
function getConfig(version) {
  try {
    return config.getConfig(version) || null;
  } catch (e) {
    return null;
  }
}
/** "last 2 versions" rule (3.9): the live version and the one before it */
function isKnownContentVersion(v) {
  const latest = content.LATEST_CONTENT_VERSION;
  return Number.isInteger(v) && v >= Math.max(1, latest - 1) && v <= latest && !!content.getContent(v);
}
function isKnownConfigVersion(v) {
  const latest = config.LATEST_CONFIG_VERSION;
  return Number.isInteger(v) && v >= Math.max(1, latest - 1) && v <= latest && !!getConfig(v);
}
function boardListCap() {
  const c = getConfig(currentVersions().configVersion) || {};
  return Number.isInteger(c.boardListCap) && c.boardListCap > 0 ? c.boardListCap : 3000;
}

function measures() {
  return measuresMod.BY_KEY;
}
function measureOf(key) {
  const m = measuresMod.BY_KEY[key];
  if (!m) fail('INTERNAL', `unknown measure ${key}`);
  return m;
}
function categoryKeys() {
  return measuresMod.CATEGORIES.map((c) => c.key);
}
function isGroup(g) {
  return g === 'all' || categoryKeys().includes(g);
}
/** a free-pool fact of a content version, or null */
function freeFact(contentVersion, id) {
  const idx = content.getContent(contentVersion);
  return (idx && idx.byId[id]) || null;
}

/** The (empty, label-less) theme of a date: v1 has no weekday themes. */
function themeFor(dateKey) {
  return deck.themeOf(dateKey);
}

function toPairs(d, byId) {
  return d.questions.map((q) => ({ a: byId[q.a], b: byId[q.b] }));
}

/** [{a, b}] fact objects (free pool), or null when the version, group or pool cannot make a deck */
function buildFreeDeck(seed, contentVersion, configVersion, group) {
  const idx = content.getContent(contentVersion);
  if (!idx) return null;
  try {
    return toPairs(deck.buildFreeDeck(seed, contentVersion, configVersion, group), idx.byId);
  } catch (e) {
    return null; // NO_LEGAL_PAIRS: the caller answers INVALID_ACTIONS
  }
}

const indexCache = new WeakMap();
function indexOfFacts(facts, contentVersion) {
  let idx = indexCache.get(facts);
  if (!idx) {
    idx = content.indexFacts(facts, contentVersion);
    indexCache.set(facts, idx);
  }
  return idx;
}

/** one daily candidate over `facts` (already filtered: active, not suspended, outside the repeat window); [{a, b}] or null */
function buildDailyDeck({ facts, seed, attempt, dateKey, configVersion }) {
  const contentVersion = content.LATEST_CONTENT_VERSION;
  const index = indexOfFacts(facts, contentVersion);
  const d = deck.buildDailyDeck({ dateKey, seed, attempt, index, contentVersion, configVersion });
  return d ? toPairs(d, index.byId) : null;
}

/** {median, p20, p40, pass}: the analytic difficulty model over [{a, b}] */
function evaluateDeck(questions, configVersion) {
  const cfg = config.getConfig(configVersion);
  const byId = {};
  const d = {
    questions: questions.map((q, i) => {
      byId[q.a.id] = q.a;
      byId[q.b.id] = q.b;
      return { k: i + 1, a: q.a.id, b: q.b.id };
    }),
  };
  const st = gates.deckStats(d, byId, cfg);
  return { median: st.median, p20: st.p20, p40: st.pFull, pass: gates.passesGates(st, cfg).pass };
}

/** the correct button for a pair: 'hi' (bottom is greater) or 'lo' */
function correctChoice(a, b) {
  return judge.correctChoice(a, b);
}

/**
 * What a player sees. These are the core's own builders (core/question.js), the same ones the client uses for free
 * play, so a server-stepped question and a local one have exactly the same shape.
 */
/** question k of a deck: top card WITH value and source, bottom card with label and unit only */
function questionOf(k, a, b, segStart) {
  return question.questionPayload({ k, a: a.id, b: b.id, segStart: !!segStart }, { [a.id]: a, [b.id]: b });
}
/** the reveal of a bottom card (value, texts, note, source info) */
function revealOf(fact) {
  return question.revealOf(fact);
}
/** a card whose value is public (answered pairs, history) */
function knownFace(fact) {
  return question.knownFace(fact);
}
function verbs(measureKey) {
  const m = measureOf(measureKey);
  return { hi: m.hi, lo: m.lo };
}
function unitOf(measureKey) {
  return measureOf(measureKey).unit;
}

// ---- tunables carried in the core config; defaults here are the spec's (used if a version lacks a block) ----
const ANOMALY_DEFAULTS = { fastMedianMs: 700, fastMinAnswers: 10, slowMs: 60000, slowMinAnswers: 5, suspectFlags: 5 };
function anomalyConfig() {
  const c = getConfig(currentVersions().configVersion) || {};
  const a = { ...ANOMALY_DEFAULTS, ...(c.anomaly || {}) };
  return { ...a, suspectFlags7d: a.suspectFlags };
}
const INTERSTITIAL_DEFAULTS = { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 };
function interstitialDefaults() {
  const c = getConfig(currentVersions().configVersion) || {};
  return { ...INTERSTITIAL_DEFAULTS, ...((c.ads && c.ads.interstitial) || {}) };
}
function repeatWindowDays() {
  const c = getConfig(currentVersions().configVersion) || {};
  return clampInt((c.daily && c.daily.repeatWindowDays) || 3, 1, 14);
}
function maxCandidates() {
  const c = getConfig(currentVersions().configVersion) || {};
  return clampInt(c.maxAttempts || 500, 1, 2000);
}
/** the daily deck length (40) */
function dailyDeckLength() {
  const c = getConfig(currentVersions().configVersion) || {};
  return (c.deckLen && c.deckLen.daily) || 40;
}

module.exports = {
  dateKeyAt, currentVersions, getConfig, isKnownContentVersion, isKnownConfigVersion, boardListCap,
  measures, measureOf, categoryKeys, isGroup, freeFact, themeFor,
  buildFreeDeck, buildDailyDeck, evaluateDeck, correctChoice, questionOf, revealOf, knownFace, verbs, unitOf,
  anomalyConfig, interstitialDefaults, repeatWindowDays, maxCandidates, dailyDeckLength,
};
