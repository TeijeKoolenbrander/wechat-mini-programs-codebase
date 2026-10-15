/**
 * Versioned game config (spec 4.4, 4.2, 12, 14.3). Pure JS, no wx: shared with the
 * cloud functions by copy (drift test). Anything that changes a rank, a step or a
 * hint bumps `configVersion`.
 */

const V1 = {
  configVersion: 1,
  /** Bumped when the answer difficulty gate (spec 3.6) changes. */
  gateVersion: 1,

  /** TODO(founder): the real launch date (issue 1). Placeholder for the mock and tests. */
  launchDateKey: '20261101',

  /** Daily window: 00:00 BJT on D until D+1 00:30 BJT (spec 4.1). */
  daily: { graceMs: 30 * 60e3 },

  /** Hint ladder (spec 4.4). cap null = no cap. Kinds: word | firstChar. */
  hints: {
    thresholds: [10, 20, 30, 40],
    kinds: ['word', 'word', 'firstChar', 'word'],
    caps: [300, 50, null, 10],
    adMaxPerPuzzle: 3,
  },

  /** Input and chips (spec 4.2). */
  input: { maxLength: 8, suggestMax: 6, warmups: 6, assocChips: 5, nearTop: 20 },

  /** Server limits (spec 4.2, PO-14). The client mirrors them only for copy. */
  limits: { guessesPerMinute: 40, guessesPerPuzzle: 600 },

  /** Share card (spec 8.5). */
  card: { w: 500, h: 400, maxColumns: 60 },

  /** UI timing. */
  ui: { tapDebounceMs: 300, solvedAnimMs: 1200, toastMs: 2400, flashMs: 700 },

  archive: { pageSize: 30 },
  boardListCap: 3000,

  /** Ads (spec 12). Remote values (app_config.ads) are clamped by clampAds. */
  ads: {
    stubDelayMs: 3000,
    interstitial: { everyNPuzzles: 2, minLifetime: 3, minGapSec: 120, maxPerDay: 5 },
    banner: { enabled: false, adUnitId: '' },
    rewardedUnitId: '',
    interstitialUnitId: '',
  },

  analytics: { maxBatch: 50, flushMs: 20000, sessionGapMs: 30 * 60e3 },
};

const CONFIGS = { 1: V1 };
const LATEST_CONFIG_VERSION = 1;

function getConfig(version) {
  const c = CONFIGS[version === undefined ? LATEST_CONFIG_VERSION : version];
  if (!c) throw new Error('unknown configVersion ' + version);
  return c;
}

/** Merge a remote ads config over the defaults and clamp it to the safe ranges (spec 12). */
function clampAds(remote, base) {
  const d = base || V1.ads;
  const r = remote || {};
  const i = Object.assign({}, d.interstitial, r.interstitial || {});
  const num = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);
  return {
    stubDelayMs: d.stubDelayMs,
    interstitial: {
      everyNPuzzles: num(i.everyNPuzzles, 2, 100, d.interstitial.everyNPuzzles),
      minLifetime: num(i.minLifetime, 2, 1000, d.interstitial.minLifetime),
      minGapSec: num(i.minGapSec, 60, 86400, d.interstitial.minGapSec),
      maxPerDay: num(i.maxPerDay, 0, 8, d.interstitial.maxPerDay),
    },
    banner: { enabled: !!(r.banner && r.banner.enabled && r.banner.adUnitId), adUnitId: (r.banner && r.banner.adUnitId) || '' },
    rewardedUnitId: typeof r.rewardedUnitId === 'string' ? r.rewardedUnitId : d.rewardedUnitId,
    interstitialUnitId: typeof r.interstitialUnitId === 'string' ? r.interstitialUnitId : d.interstitialUnitId,
  };
}

module.exports = { getConfig, clampAds, LATEST_CONFIG_VERSION, CONFIGS };
