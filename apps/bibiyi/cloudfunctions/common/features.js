'use strict';
// Remote config for the client (spec 9, 10 `Features`): app_config/live with safe defaults when missing
// or unreadable. A missing app_config must never break getDaily (AC 90).
const core = require('./coreapi');
const store = require('./store');
const { clampInt, isPlainObject } = require('./util');

function clampInterstitial(raw) {
  const d = core.interstitialDefaults();
  const r = isPlainObject(raw) ? raw : {};
  const num = (v, def) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : def);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    everyNRuns: Math.max(2, clampInt(num(r.everyNRuns, d.everyNRuns), 2, 1000)),
    minLifetimeRuns: Math.max(2, clampInt(num(r.minLifetimeRuns, d.minLifetimeRuns), 2, 100000)),
    minGapSec: Math.max(60, clampInt(num(r.minGapSec, d.minGapSec), 60, 86400)),
    maxPerDay: Math.min(8, clampInt(num(r.maxPerDay, d.maxPerDay), 0, 8)),
  };
}

async function getAppConfig() {
  try {
    return (await store.getDoc('app_config', 'live')) || {};
  } catch (e) {
    console.warn('app_config unreadable', store.errText(e));
    return {};
  }
}

async function getFeatures() {
  const c = await getAppConfig();
  const sub = isPlainObject(c.subscribe) && typeof c.subscribe.tmplId === 'string' && c.subscribe.tmplId ? { tmplId: c.subscribe.tmplId } : null;
  const b = isPlainObject(c.ads) && isPlainObject(c.ads.banner) ? c.ads.banner : {};
  const enabled = b.enabled === true && typeof b.adUnitId === 'string' && b.adUnitId.length > 0;
  return {
    subscribe: sub,
    banner: { enabled, adUnitId: enabled ? b.adUnitId : null },
    interstitial: clampInterstitial(isPlainObject(c.ads) ? c.ads.interstitial : null),
  };
}

module.exports = { getFeatures, getAppConfig, clampInterstitial };
