/**
 * Ad and remote-feature policy (spec 9, AC 55-61). Pure JS: the decisions, not the wx ad calls (js/ads.js does those).
 * The server builds `features` with buildFeatures(app_config) and returns it from getDaily; the client trusts it only
 * for these toggles (nothing here affects scoring, AC 81).
 */

const { CONFIG } = require('./config');

/** Clamp a (possibly remote) interstitial config to the allowed ranges (spec 9). Unknown / invalid values fall back to defaults. */
function clampInterstitial(raw) {
  const d = CONFIG.interstitial.defaults;
  const c = CONFIG.interstitial.clamp;
  const r = raw && typeof raw === 'object' ? raw : {};
  const int = (v, dflt) => (Number.isFinite(v) ? Math.floor(v) : dflt);
  return {
    enabled: r.enabled === undefined ? d.enabled : r.enabled === true,
    everyNSets: Math.max(c.everyNSets.min, int(r.everyNSets, d.everyNSets)),
    minLifetimeSets: Math.max(c.minLifetimeSets.min, int(r.minLifetimeSets, d.minLifetimeSets)),
    minGapSec: Math.max(c.minGapSec.min, int(r.minGapSec, d.minGapSec)),
    maxPerDay: Math.min(c.maxPerDay.max, Math.max(0, int(r.maxPerDay, d.maxPerDay))),
  };
}

/**
 * features for the client (spec 10 Shared): banner is on only with enabled === true AND an adUnitId; subscribe only with a tmplId.
 * @param {{subscribe?:{tmplId?:string}, ads?:{banner?:{enabled?:boolean, adUnitId?:string}, interstitial?:object}}|null} appConfig
 */
function buildFeatures(appConfig) {
  const c = appConfig || {};
  const ads = c.ads || {};
  const b = ads.banner || {};
  const unit = typeof b.adUnitId === 'string' && b.adUnitId ? b.adUnitId : null;
  return {
    subscribe: c.subscribe && typeof c.subscribe.tmplId === 'string' && c.subscribe.tmplId ? { tmplId: c.subscribe.tmplId } : null,
    banner: { enabled: b.enabled === true && unit !== null, adUnitId: unit },
    interstitial: clampInterstitial(ads.interstitial),
  };
}

/**
 * Show an interstitial now? Called only on 再来一期 / 返回列表 after a COMPLETED archive set (AC 59).
 * @param {{setsThisSession:number, lifetimeSets:number, lastShownMs:number|null, shownToday:number}} st
 *   setsThisSession counts completed archive sets this session including the one just finished; lifetimeSets counts completed daily + archive sets.
 * @returns {{show:boolean, reason:string}}
 */
function interstitialDecision(st, cfg, nowMs) {
  if (!cfg.enabled) return { show: false, reason: 'disabled' };
  if (st.lifetimeSets < cfg.minLifetimeSets) return { show: false, reason: 'lifetime' };
  if (st.setsThisSession < 1 || st.setsThisSession % cfg.everyNSets !== 0) return { show: false, reason: 'cadence' };
  if (st.lastShownMs !== null && st.lastShownMs !== undefined && nowMs - st.lastShownMs < cfg.minGapSec * 1000) return { show: false, reason: 'gap' };
  if (st.shownToday >= cfg.maxPerDay) return { show: false, reason: 'daily' };
  return { show: true, reason: 'ok' };
}

/** Interstitial error codes 2001-2003 are skipped silently (spec 9). */
function interstitialErrorSilent(code) {
  return code === 2001 || code === 2002 || code === 2003;
}

const MSG = { early: '完整观看才能获得', nofillFree: '暂无广告，本次免费', nofillBlocked: '暂无广告，请稍后再试' };

/**
 * Rewarded ad outcome (spec 9, AC 56-58).
 * @param {{event:'ended'|'closedEarly'|'noFill'|'error'|'fallbackShare', noFillGrantedToday:boolean}} o
 *   event 'ended' = closed with isEnded === true; 'fallbackShare' = onLoad reported useFallbackSharePage: true (treated as no-fill);
 *   noFillGrantedToday = a no-fill grant was already used for THIS placement on THIS Beijing day.
 * @returns {{grant:boolean, message:string|null, markNoFill:boolean}}
 */
function rewardDecision(o) {
  if (o.event === 'ended') return { grant: true, message: null, markNoFill: false };
  if (o.event === 'closedEarly') return { grant: false, message: MSG.early, markNoFill: false };
  // noFill | error | fallbackShare
  if (!o.noFillGrantedToday) return { grant: true, message: MSG.nofillFree, markNoFill: true };
  return { grant: false, message: MSG.nofillBlocked, markNoFill: false };
}

/** Launch with wxad_fallback_share=1 grants nothing (spec 7.5, AC 58): always false; exists so the rule is testable. */
function fallbackLaunchGrants() {
  return false;
}

module.exports = { clampInterstitial, buildFeatures, interstitialDecision, interstitialErrorSilent, rewardDecision, fallbackLaunchGrants, MSG };
