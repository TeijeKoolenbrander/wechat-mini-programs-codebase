'use strict';
// Constants (spec 3.x, 6.x), remote config (app_config/live) and the environment guard.
const store = require('./store');
const { fail, now, DAY_MS, HOUR_MS } = require('./util');

const LIMITS = {
  freeStarts: 3,
  adStartsMax: 2,
  stepsPerDay: 40,
  claimsPerChainPerDay: 3,
  reportsPerDay: 10,
  perPersonMax: 3,
  claimTtlMs: 150 * 1000,
  chainTtlMs: 48 * HOUR_MS,
  revealMinPassed: 4,
  groupFreshDays: 30,
  strikeWindowMs: 30 * DAY_MS,
  mediaTimeoutMs: 35 * 60 * 1000,
  mediaRetryGapMs: 5 * 60 * 1000,
  mediaMaxCallRetries: 2,
  imageDailyLimit: 200000,
  imageAlertRatio: 0.7,
  imagePauseRatio: 0.95,
  textTimeoutMs: 3000,
  promptMin: 2, promptMax: 12,
  describeMin: 2, describeMax: 16,
  rulesVersion: 1,
  breakerMinCalls: 20,
  breakerRatio: 0.5,
  breakerWindowMin: 5,
  breakerPauseMs: 15 * 60 * 1000,
  reportAlertMs: 48 * HOUR_MS,
};

const DEFAULT_CONFIG = {
  ugc: { createEnabled: true, viewEnabled: true },
  subscribe: null,
  ads: { banner: { enabled: false, adUnitId: null }, interstitial: { enabled: false } },
  features: { updatableCard: false },
  timers: { drawSec: 60, describeSec: 45 },
};

const CACHE_MS = 10 * 1000;
let cache = null;

function resetCache() {
  cache = null;
}

/** app_config/live merged over defaults. Unreadable or missing -> defaults (spec edge 31). 10 s cache. */
async function getConfig({ fresh = false } = {}) {
  const t = now();
  if (!fresh && cache && t - cache.at < CACHE_MS) return cache.cfg;
  let doc = null;
  try {
    doc = await store.getDoc('app_config', 'live');
  } catch (e) {
    console.warn('app_config unreadable, using defaults', store.errText(e));
  }
  const d = doc || {};
  const cfg = {
    ugc: { ...DEFAULT_CONFIG.ugc, ...(d.ugc || {}) },
    subscribe: d.subscribe && d.subscribe.tmplId ? d.subscribe : null,
    ads: d.ads || DEFAULT_CONFIG.ads,
    features: { ...DEFAULT_CONFIG.features, ...(d.features || {}) },
    timers: { ...DEFAULT_CONFIG.timers, ...(d.timers || {}) },
    rulesVersion: LIMITS.rulesVersion,
  };
  cache = { at: t, cfg };
  return cfg;
}

function ugcState(cfg, nowMs = now()) {
  const paused = cfg.ugc.autoPausedUntil && cfg.ugc.autoPausedUntil > nowMs;
  return {
    createOk: cfg.ugc.createEnabled !== false && !paused,
    viewOk: cfg.ugc.viewEnabled !== false,
    paused: !!paused,
  };
}

/**
 * Environment guard (spec 6.6). Unset ENV_KIND counts as prod, so a forgotten variable can never
 * enable mock moderation. mock + prod -> SERVER_CONFIG + [ALERT] on every UGC call.
 * Returns {envKind, mode}.
 */
function moderationEnv() {
  const envKind = process.env.ENV_KIND === 'dev' ? 'dev' : 'prod';
  const raw = process.env.MODERATION_MODE;
  if (raw !== undefined && raw !== '' && raw !== 'live' && raw !== 'mock') {
    store.alert('MODERATION_MODE has an invalid value');
    fail('SERVER_CONFIG', 'invalid MODERATION_MODE');
  }
  const mode = raw === 'mock' ? 'mock' : 'live';
  if (envKind === 'prod' && mode === 'mock') {
    store.alert('MODERATION_MODE=mock in a prod environment: UGC functions are refusing to run');
    fail('SERVER_CONFIG', 'mock moderation is not allowed in prod');
  }
  return { envKind, mode };
}

/** MEDIA_CHECK_ROUTE: 'push' (default; cloud-function push or HTTP access service) | 'sync' (legacy imgSecCheck fallback) */
function mediaRoute() {
  return process.env.MEDIA_CHECK_ROUTE === 'sync' ? 'sync' : 'push';
}

function envInt(name, dflt) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

module.exports = { LIMITS, DEFAULT_CONFIG, getConfig, resetCache, ugcState, moderationEnv, mediaRoute, envInt };
