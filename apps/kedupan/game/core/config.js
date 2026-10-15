/**
 * Versioned tuning config (spec 3, 9, 12). Pure CommonJS, no wx: copied into
 * the cloud functions. Anything that changes a score bumps `configVersion`.
 */

const V1 = {
  configVersion: 1,

  /** Daily rules (spec 3.3, 5). */
  daily: {
    cards: 5,
    /** Launch date used when no LAUNCH_DATE_KEY / first daily_sets document exists (issue 1). */
    launchDateKey: '20261101',
    /** Cards of day D can still be submitted until D+1 00:30 BJT (grace) and the day is finalised then. */
    graceMs: 30 * 60 * 1000,
  },

  score: {
    /** W virtual votes at the item's anchor (PD-4). */
    priorVotes: 10,
    /** s(d) = max(0, 100 - ceil(perStep * d)). */
    perStep: 2.5,
    /** "和全国 x% 的人想法相近": |v - p| <= agreeRadius, shown from agreeMinN real positions. */
    agreeRadius: 10,
    agreeMinN: 30,
    /** The percentile ("超过全国 x%") is hidden below this many complete dailies. */
    percentileMinN: 30,
    /** Group (spec 3.4). */
    groupMinForScore: 2,
    groupMinForMq: 3,
    groupRowCap: 500,
    /** Thresholds for the labels (by distance d) and the day bands (by total). */
    labels: [
      { max: 2, key: 'bullseye', label: '心有灵犀' },
      { max: 6, key: 'close', label: '很同频' },
      { max: 12, key: 'near', label: '差不多' },
      { max: 20, key: 'off', label: '有点偏' },
      { max: Infinity, key: 'unique', label: '想法独特' },
    ],
    bands: [
      { min: 450, key: 'soul', label: '灵魂同频' },
      { min: 380, key: 'tacit', label: '默契十足' },
      { min: 300, key: 'broad', label: '大体同频' },
      { min: 200, key: 'own', label: '各有想法' },
      { min: 0, key: 'unique', label: '独树一帜' },
    ],
  },

  /** Host rounds (spec 2.2, 3.5, 11.2). */
  rounds: {
    targetMin: 5,
    targetMax: 95,
    targetBand: 2,
    revealMinGuesses: 2,
    autoRevealAt: 8,
    autoRevealMs: 24 * 3600e3,
    guessWindowMs: 7 * 24 * 3600e3,
    draftMs: 30 * 60 * 1000,
    perDayLimit: 20,
    spectraOffered: 3,
    clueOptions: 6,
    adSwapsPerRound: 3,
    groupRefsCap: 10,
  },

  extras: { bonusPerDay: 3, distributionPerDay: 3, reportsPerDay: 10 },

  /** Ads (spec 9). Remote `app_config.ads` overrides these within the clamps in clampInterstitial(). */
  ads: {
    interstitial: { enabled: true, everyNSets: 2, minLifetimeSets: 3, minGapSec: 120, maxPerDay: 6 },
    banner: { enabled: false, adUnitId: null },
    stubDelayMs: 3000,
  },

  boardListCap: 3000,

  analytics: { flushMs: 20000, maxBatch: 50, sessionGapMs: 30 * 60 * 1000 },
};

const CONFIGS = { 1: V1 };
const LATEST_CONFIG_VERSION = 1;

function getConfig(version) {
  return CONFIGS[Number(version)] || null;
}

/** Remote interstitial caps, clamped (spec 9): everyNSets >= 2, minLifetimeSets >= 2, minGapSec >= 60, maxPerDay <= 8. */
function clampInterstitial(remote, base) {
  const b = base || V1.ads.interstitial;
  const r = remote || {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.floor(v) : d);
  return {
    enabled: r.enabled === undefined ? b.enabled : !!r.enabled,
    everyNSets: Math.max(2, num(r.everyNSets, b.everyNSets)),
    minLifetimeSets: Math.max(2, num(r.minLifetimeSets, b.minLifetimeSets)),
    minGapSec: Math.max(60, num(r.minGapSec, b.minGapSec)),
    maxPerDay: Math.max(0, Math.min(8, num(r.maxPerDay, b.maxPerDay))),
  };
}

/** Remote features block as the client uses it (also what getDaily.features carries). */
function normalizeFeatures(remote) {
  const r = remote || {};
  const sub = r.subscribe && typeof r.subscribe.tmplId === 'string' && r.subscribe.tmplId ? { tmplId: r.subscribe.tmplId } : null;
  const ban = r.banner || {};
  return {
    subscribe: sub,
    banner: { enabled: !!ban.enabled && !!ban.adUnitId, adUnitId: ban.adUnitId || null },
    interstitial: clampInterstitial(r.interstitial),
  };
}

module.exports = { getConfig, clampInterstitial, normalizeFeatures, LATEST_CONFIG_VERSION, CONFIGS };
