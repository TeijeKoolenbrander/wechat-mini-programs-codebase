/**
 * Remote feature config (spec 14.1 app_config, PO-11, 12): normalised from
 * getDaily.features. Anything missing or invalid falls back to safe
 * defaults: subscribe hidden, banner off, interstitial on the core defaults.
 * Interstitial values are clamped so a config typo cannot flood players.
 */

const CLAMP = { everyNRuns: [2, 1000], minLifetimeRuns: [2, 1000], minGapSec: [60, 86400], maxPerDay: [0, 8] };

function num(v, def, lo, hi) {
  const n = typeof v === 'number' && isFinite(v) ? Math.floor(v) : def;
  return Math.max(lo, Math.min(hi, n));
}

/** Core defaults, tolerant of both naming schemes (everyNthRun/minGapMs in v1 core, everyNRuns/minGapSec in the spec). */
function interstitialDefaults(config) {
  const c = (config && config.ads && config.ads.interstitial) || {};
  return {
    enabled: c.enabled !== false,
    everyNRuns: c.everyNRuns !== undefined ? c.everyNRuns : c.everyNthRun !== undefined ? c.everyNthRun : 3,
    minLifetimeRuns: c.minLifetimeRuns !== undefined ? c.minLifetimeRuns : 4,
    minGapSec: c.minGapSec !== undefined ? c.minGapSec : c.minGapMs !== undefined ? c.minGapMs / 1000 : 120,
    maxPerDay: c.maxPerDay !== undefined ? c.maxPerDay : 5,
  };
}

/**
 * raw: getDaily.features (may be undefined). The backend sends { ads: { banner, interstitial }, subscribe? }
 * (cloudfunctions/common/appconfig.js); the flat spec 13 shape { subscribe, banner, interstitial } is accepted too. build: build-config (optional
 * local template id, used when the remote one is absent).
 */
function normalizeFeatures(raw, config, build) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const d = interstitialDefaults(config);
  const ads = raw.ads && typeof raw.ads === 'object' ? raw.ads : raw;
  const ri = ads.interstitial && typeof ads.interstitial === 'object' ? ads.interstitial : {};
  const interstitial = {
    enabled: ri.enabled === undefined ? d.enabled : ri.enabled === true,
    everyNRuns: num(ri.everyNRuns, d.everyNRuns, CLAMP.everyNRuns[0], CLAMP.everyNRuns[1]),
    minLifetimeRuns: num(ri.minLifetimeRuns, d.minLifetimeRuns, CLAMP.minLifetimeRuns[0], CLAMP.minLifetimeRuns[1]),
    minGapSec: num(ri.minGapSec, d.minGapSec, CLAMP.minGapSec[0], CLAMP.minGapSec[1]),
    maxPerDay: num(ri.maxPerDay, d.maxPerDay, CLAMP.maxPerDay[0], CLAMP.maxPerDay[1]),
  };
  const rb = ads.banner && typeof ads.banner === 'object' ? ads.banner : {};
  const unit = typeof rb.adUnitId === 'string' && rb.adUnitId ? rb.adUnitId : null;
  const banner = { enabled: rb.enabled === true, adUnitId: unit };
  let tmplId = raw.subscribe && typeof raw.subscribe.tmplId === 'string' ? raw.subscribe.tmplId : '';
  if (!tmplId && build && typeof build.subscribeTmplId === 'string') tmplId = build.subscribeTmplId;
  return { subscribe: tmplId ? { tmplId } : null, banner, interstitial };
}

module.exports = { normalizeFeatures, interstitialDefaults };
