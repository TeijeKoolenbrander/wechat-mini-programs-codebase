'use strict';
// The ONLY place that touches the shared game core (copied into ./core by scripts/sync-core.js).
// Contract (see README "Core contract"): until minigame-dev's real core lands, tests run against
// tests/fake-core, which implements exactly the calls below. If the real core differs, adapt HERE only.
//
//   core/date.js     beijingDateKey(ms)
//   core/config.js   LATEST_CONFIG_VERSION, getConfig(v) -> {gateVersion, boardListCap, bands, model, gates, ads?, anomaly?} | null
//   core/content.js  LATEST_CONTENT_VERSION, getMeasures() -> {key: measureDef}, getFreeFact(v, id), getContent(v) | null
//   core/deck.js     themeForWeekday(0..6) -> {key, label, categories|null},
//                    buildFreeDeck(seed, cv, cfgv, group) -> [{a, b}] fact objects | null,
//                    buildDailyDeck({facts, seed, attempt, theme, configVersion}) -> [{a, b}] fact objects | null
//   core/gates.js    evaluateDeck([{a, b}], configVersion) -> {median, p20, p40, pass}
//   core/judge.js    correctChoice(a, b) -> 'hi' | 'lo'
//   core/format.js   formatValue(fact, measure) -> {valueText, unitText, approx}, sourceLine(fact)
const dateMod = require('../core/date');
const content = require('../core/content');
const config = require('../core/config');
const deck = require('../core/deck');
const gates = require('../core/gates');
const judge = require('../core/judge');
const format = require('../core/format');
const { fail, weekdayOfKey, clampInt } = require('./util');

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
  return config.getConfig(version) || null;
}
/** "last 2 versions" rule (3.9): the live version and the one before it */
function isKnownContentVersion(v) {
  const latest = content.LATEST_CONTENT_VERSION;
  return Number.isInteger(v) && v >= Math.max(1, latest - 1) && v <= latest && !!content.getContent(v);
}
function isKnownConfigVersion(v) {
  const latest = config.LATEST_CONFIG_VERSION;
  return Number.isInteger(v) && v >= Math.max(1, latest - 1) && v <= latest && !!config.getConfig(v);
}
function boardListCap() {
  const c = getConfig(currentVersions().configVersion) || {};
  return Number.isInteger(c.boardListCap) && c.boardListCap > 0 ? c.boardListCap : 3000;
}

function measures() {
  return content.getMeasures();
}
function measureOf(key) {
  const m = content.getMeasures()[key];
  if (!m) fail('INTERNAL', `unknown measure ${key}`);
  return m;
}
function categoryKeys() {
  return [...new Set(Object.values(content.getMeasures()).map((m) => m.category))];
}
function isGroup(g) {
  return g === 'all' || categoryKeys().includes(g);
}
function freeFact(contentVersion, id) {
  return content.getFreeFact(contentVersion, id) || null;
}

function themeFor(dateKey) {
  return deck.themeForWeekday(weekdayOfKey(dateKey));
}

/** [{a, b}] fact objects (free pool), or null for an unknown version/group */
function buildFreeDeck(seed, contentVersion, configVersion, group) {
  return deck.buildFreeDeck(seed, contentVersion, configVersion, group) || null;
}
/** one daily candidate; [{a, b}] fact objects or null */
function buildDailyDeck({ facts, seed, attempt, dateKey, configVersion }) {
  return deck.buildDailyDeck({ facts, seed, attempt, theme: themeFor(dateKey), configVersion }) || null;
}
/** {median, p20, p40, pass} */
function evaluateDeck(questions, configVersion) {
  return gates.evaluateDeck(questions, configVersion);
}

/** the correct button for a pair: 'hi' (bottom is greater) or 'lo' */
function correctChoice(a, b) {
  return judge.correctChoice(a, b);
}

/** display fields for a revealed value */
function valueFields(fact) {
  const m = measureOf(fact.measure);
  const f = format.formatValue(fact, m);
  return { valueText: f.valueText, unitText: f.unitText, approx: !!f.approx, sourceText: format.sourceLine(fact) };
}
function verbs(measureKey) {
  const m = measureOf(measureKey);
  return { hi: m.hi, lo: m.lo };
}
function subLabel(fact) {
  return fact.sub || measureOf(fact.measure).subLabel;
}
function unitOf(measureKey) {
  return measureOf(measureKey).unit;
}

// ---- tunables that the real core may carry in config; defaults here are the spec's ----
const ANOMALY_DEFAULTS = { fastMedianMs: 700, fastMinAnswers: 10, slowMs: 60000, slowMinAnswers: 5, suspectFlags7d: 5 };
function anomalyConfig() {
  const c = getConfig(currentVersions().configVersion) || {};
  return { ...ANOMALY_DEFAULTS, ...(c.anomaly || {}) };
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
  return clampInt((c.daily && c.daily.maxCandidates) || 500, 1, 2000);
}

module.exports = {
  dateKeyAt, currentVersions, getConfig, isKnownContentVersion, isKnownConfigVersion, boardListCap,
  measures, measureOf, categoryKeys, isGroup, freeFact, themeFor,
  buildFreeDeck, buildDailyDeck, evaluateDeck, correctChoice, valueFields, verbs, subLabel, unitOf,
  anomalyConfig, interstitialDefaults, repeatWindowDays, maxCandidates,
};
