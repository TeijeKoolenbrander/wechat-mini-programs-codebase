/**
 * Versioned tuning config (spec 4.2, 4.4, 9, 11.5, 12). Pure JS; copied into
 * the cloud functions. Anything that changes a generated deck bumps
 * `configVersion` (free runs and challenges pin to it; the server keeps the
 * last 2). The player model and gates are INFERENCE and are recalibrated
 * monthly from real answers (tools/deckstats.js --calibrate).
 */

const BIG = 1e9;

const V1 = {
  configVersion: 1,
  gateVersion: 1,

  /** Deck lengths and segment sizes (inclusive ranges). */
  deckLen: { daily: 40, free: 60 },
  segment: { daily: [4, 8], free: [5, 10] },
  /** A free-deck fact may repeat only after this many other questions. */
  freeRecency: 10,
  /** The category picker offers a category only when the free pool holds at least this many of its facts (smaller ones cannot make a 60-question deck). */
  freeGroupMinFacts: 20,
  /** Daily decks mix every measure that has at least this many daily facts (no weekday themes in v1). */
  minDailyFactsPerMeasure: 6,
  /** Daily segments: at most this many per measure. */
  mixedSegmentsPerMeasure: 2,
  /** After this many candidates failed, a measure may take a third segment (a thin pool right after two busy days must still make a deck). */
  relaxSegmentCapAfter: 40,
  mixedSegmentsRelaxed: 3,

  /**
   * Difficulty bands by question position (spec 4.2). ratio = max/min, year =
   * |delta years|. The lower bound is raised to the pair's minimum gap; when
   * the minimum gap exceeds the upper bound the upper bound becomes
   * minGap x boundStretch.
   */
  bands: [
    { to: 5, ratio: [2.0, BIG], year: [400, BIG] },
    { to: 12, ratio: [1.5, 4.0], year: [150, 800] },
    { to: 20, ratio: [1.25, 2.5], year: [80, 400] },
    { to: 30, ratio: [0, 1.8], year: [40, 200] },
    { to: 60, ratio: [0, 1.4], year: [30, 120] },
  ],
  boundStretch: 1.2,
  /** Approximate facts use this multiple of the measure's minimum gap, applied to ln(gap). */
  approxGapFactor: 1.5,
  /** Year kind: legal when |delta| >= max(yearMinDelta, yearUncertaintyMul x larger uncertainty). */
  yearMinDelta: 30,
  yearUncertaintyMul: 2,

  /** Typical-player model (spec 4.4): p = pMin + (pMax - pMin) x (1 - exp(-g' / s_m)). */
  model: { pMin: 0.5, pMax: 0.96, yearDivisor: 100 },
  /** Daily gates: median streak, P(streak >= 20), P(clean sweep). */
  gates: { median: [6, 12], p20: [0.02, 0.15], pFull: 0.005 },
  maxAttempts: 500,
  /** Surprise weighting stays off until enough answer data exists (spec 4.4). */
  surpriseWeight: 0,

  daily: { launchDateKey: '20261101', repeatWindowDays: 3, graceMs: 30 * 60 * 1000 },

  /** Rarity line needs this many results (PO-30). */
  rarityMinTotal: 30,

  /** Fixed report reasons (spec 3.8). */
  reportReasons: [
    { key: 'value', label: '数值不对' },
    { key: 'unit', label: '单位不对' },
    { key: 'name', label: '名称不对' },
    { key: 'source', label: '来源对不上' },
    { key: 'wording', label: '措辞不妥' },
    { key: 'other', label: '其他' },
  ],
  report: { perDay: 20, autoSuspendReporters: 5, autoSuspendDays: 7 },

  /** Ads (spec 9). Interstitial caps are remote-configurable and clamped. */
  ads: {
    interstitial: { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 },
    interstitialClamp: { everyNRuns: [2, 1000], minLifetimeRuns: [2, 1000], minGapSec: [60, 86400], maxPerDay: [0, 8] },
    banner: { enabled: false, adUnitId: null },
    stubDelayMs: 3000,
  },

  boardListCap: 3000,
  showUnverified: true,
  analytics: { flushMs: 20000, maxBatch: 50, sessionGapMs: 30 * 60 * 1000 },
  /** Anomaly thresholds (observe-only, spec 11.5). */
  anomaly: { fastMedianMs: 700, fastMinAnswers: 10, slowMs: 60000, slowMinAnswers: 5, suspectFlags: 5 },
};

const CONFIGS = { 1: V1 };
const LATEST_CONFIG_VERSION = 1;

function getConfig(version) {
  const c = CONFIGS[version];
  if (!c) throw new Error('unknown configVersion ' + version);
  return c;
}

function clampNum(v, range, dflt) {
  const n = Number(v);
  if (!isFinite(n)) return dflt;
  return Math.max(range[0], Math.min(range[1], Math.round(n)));
}

/** Merge a remote `app_config.ads.interstitial` over the defaults and clamp (AC 72). Never throws. */
function resolveInterstitial(config, raw) {
  const d = config.ads.interstitial;
  const c = config.ads.interstitialClamp;
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: r.enabled === undefined ? d.enabled : !!r.enabled,
    everyNRuns: clampNum(r.everyNRuns === undefined ? d.everyNRuns : r.everyNRuns, c.everyNRuns, d.everyNRuns),
    minLifetimeRuns: clampNum(r.minLifetimeRuns === undefined ? d.minLifetimeRuns : r.minLifetimeRuns, c.minLifetimeRuns, d.minLifetimeRuns),
    minGapSec: clampNum(r.minGapSec === undefined ? d.minGapSec : r.minGapSec, c.minGapSec, d.minGapSec),
    maxPerDay: clampNum(r.maxPerDay === undefined ? d.maxPerDay : r.maxPerDay, c.maxPerDay, d.maxPerDay),
  };
}

/** Band for question position k (1-based). */
function bandAt(config, k) {
  for (let i = 0; i < config.bands.length; i++) if (k <= config.bands[i].to) return config.bands[i];
  return config.bands[config.bands.length - 1];
}

module.exports = { CONFIGS, LATEST_CONFIG_VERSION, getConfig, resolveInterstitial, bandAt, BIG };
