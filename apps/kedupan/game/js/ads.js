/**
 * Ads (spec 9, IAA only). Placements: rewarded 加一题 (bonus), 全国分布 (distribution), 换一批 (swap, host mode);
 * interstitial only between archive sets; banner on the group page, friend board and archive list (config, default off).
 *
 * Rules implemented here:
 *  - every rewarded instance is created with disableFallbackSharePage: true (AC 58); an onLoad that reports
 *    useFallbackSharePage is treated as no-fill; a launch with wxad_fallback_share=1 grants nothing (share.js/controller)
 *  - reward only when onClose reports isEnded === true; closing early grants nothing ("完整观看才能获得") (AC 56)
 *  - on load error or no fill (1000-1008 incl. 1004, or no ad unit at all), grant the reward AT MOST ONCE PER PLACEMENT
 *    PER DAY ("暂无广告，本次免费"); the next failure that day shows "暂无广告，请稍后再试" and grants nothing (AC 57)
 *  - interstitial: show() rejections 2001-2003 are skipped silently, logged as ad_error only, never counted (AC 59);
 *    never delays navigation; caps from remote config, clamped (core/config.js)
 *  - stub mode (default until 流量主 ad units exist): a 3-second "广告位（测试）" overlay with complete/skip; QA can simulate
 *    errors through ads.stubSim. Events carry stub: true (AC 61)
 *
 * Nothing here ever depends on a share (no share-for-reward path exists).
 */

const { beijingDateKey } = require('../core/date');

const PLACEMENTS = ['bonus', 'distribution', 'swap'];

function createAds(opts) {
  const { config, store, analytics } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const units = opts.adUnits || {};
  const getFeatures = opts.getFeatures || (() => null);
  const stubCfg = opts.stub || {};
  const stub = !!stubCfg.enabled || !units.rewarded;
  const ads = {
    stub,
    /** QA hooks, stub mode only: { rewardedError: 1004|1000|null, interstitialError: 2001..2005|null } */
    stubSim: stubCfg,
    /** Stub overlay for the renderer: null or { kind, placement, label, startedAt, durationMs } */
    overlay: null,
    banner: null,
  };
  let pending = null; // { resolve, placement, kind }
  let rewardedAd = null;
  let handlersSet = false;
  let lastErrCode = null;
  let bannerAd = null;
  let bannerKey = '';

  const log = (name, props) => analytics && analytics.track(name, props);
  const invalidate = () => opts.onChange && opts.onChange();
  const outcome = (granted, reason, toast, extra) => Object.assign({ granted, reason, toast: toast || null }, extra || {});
  const today = () => beijingDateKey(now());

  // ---------------- rewarded ----------------

  function finishEnded(p, ended) {
    if (ended) {
      log('ad_reward', { placement: p.placement, stub });
      p.resolve(outcome(true, 'ended'));
    } else {
      log('ad_close_early', { placement: p.placement, stub });
      p.resolve(outcome(false, 'closedEarly', '完整观看才能获得'));
    }
  }

  /** No-fill rule: one free grant per placement per day, persisted. */
  function finishError(p, code) {
    log('ad_error', { placement: p.placement, stub, errCode: code });
    const st = store.state.adFail;
    if (st.day !== today()) {
      st.day = today();
      st.placements = {};
    }
    if (!st.placements[p.placement]) {
      st.placements[p.placement] = true;
      store.save();
      p.resolve(outcome(true, 'noFillGrant', '暂无广告，本次免费', { errCode: code }));
    } else {
      p.resolve(outcome(false, 'noFillBlocked', '暂无广告，请稍后再试', { errCode: code }));
    }
  }

  function ensureRewarded() {
    if (rewardedAd) return rewardedAd;
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: units.rewarded, disableFallbackSharePage: true });
    if (!handlersSet) {
      handlersSet = true;
      rewardedAd.onClose((res) => {
        const p = pending;
        if (!p || p.kind !== 'rewarded') return;
        pending = null;
        finishEnded(p, !!(res && res.isEnded === true));
      });
      rewardedAd.onError((e) => {
        lastErrCode = e && e.errCode;
        const p = pending;
        if (!p || p.kind !== 'rewarded') return;
        pending = null;
        finishError(p, lastErrCode);
      });
      if (rewardedAd.onLoad) {
        rewardedAd.onLoad((info) => {
          if (info && info.useFallbackSharePage) {
            const p = pending;
            if (!p || p.kind !== 'rewarded') return;
            pending = null;
            finishError(p, 1004);
          }
        });
      }
    }
    return rewardedAd;
  }

  /**
   * Show a rewarded video for `placement` ('bonus' | 'distribution' | 'swap'). Resolves to
   * { granted, reason: ended|closedEarly|noFillGrant|noFillBlocked|busy, toast, errCode? }.
   */
  ads.rewarded = function (placement) {
    if (pending) return Promise.resolve(outcome(false, 'busy'));
    log('ad_request', { placement, stub });
    return new Promise((resolve) => {
      const p = { resolve, placement, kind: 'rewarded' };
      pending = p;
      if (stub) {
        if (ads.stubSim.rewardedError) {
          pending = null;
          finishError(p, ads.stubSim.rewardedError);
          return;
        }
        log('ad_show', { placement, stub });
        ads.overlay = { kind: 'rewarded', placement, label: '广告位（测试）', startedAt: now(), durationMs: config.ads.stubDelayMs };
        invalidate();
        return;
      }
      try {
        const ad = ensureRewarded();
        const show = () => ad.show().then(() => log('ad_show', { placement, stub }));
        show().catch(() =>
          ad
            .load()
            .then(show)
            .catch((e) => {
              if (pending === p) {
                pending = null;
                finishError(p, (e && e.errCode) || lastErrCode || 1003);
              }
            })
        );
      } catch (e) {
        pending = null;
        finishError(p, 1003);
      }
    });
  };

  // ---------------- stub overlay controls ----------------

  /** Complete button: only after the stub delay has elapsed unless `force`. Returns true if it acted. */
  ads.stubComplete = function (force) {
    const o = ads.overlay;
    if (!o) return false;
    if (!force && now() - o.startedAt < o.durationMs) return false;
    ads.overlay = null;
    const p = pending;
    pending = null;
    if (p && p.kind === 'rewarded') finishEnded(p, true);
    else if (p && p.kind === 'interstitial') p.resolve(true);
    invalidate();
    return true;
  };
  ads.stubSkip = function () {
    const o = ads.overlay;
    if (!o) return false;
    ads.overlay = null;
    const p = pending;
    pending = null;
    if (p && p.kind === 'rewarded') finishEnded(p, false);
    else if (p && p.kind === 'interstitial') p.resolve(true);
    invalidate();
    return true;
  };

  // ---------------- interstitial (archive only) ----------------

  /**
   * Is an interstitial due on 再来一期 / 返回列表 after a completed archive set? ctx = { setsThisSession, lifetimeSets }
   * (both count the set that just completed). Pure apart from reading the counters.
   */
  ads.interstitialDue = function (ctx) {
    const f = (getFeatures() || {}).interstitial || config.ads.interstitial;
    if (!f.enabled || !ctx) return false;
    if (ctx.lifetimeSets < f.minLifetimeSets) return false;
    if (ctx.setsThisSession <= 0 || ctx.setsThisSession % f.everyNSets !== 0) return false;
    const st = store.state.interstitial;
    if (st.day === today() && st.count >= f.maxPerDay) return false;
    if (st.lastAt && now() - st.lastAt < f.minGapSec * 1000) return false;
    return true;
  };

  /** Try to show one. Never blocks the caller. Resolves true if shown and counted. */
  ads.interstitial = function (ctx) {
    if (!ads.interstitialDue(ctx)) return Promise.resolve(false);
    if (pending) return Promise.resolve(false);
    log('ad_request', { placement: 'interstitial', stub });
    const count = () => {
      const st = store.state.interstitial;
      if (st.day !== today()) {
        st.day = today();
        st.count = 0;
      }
      st.count++;
      st.lastAt = now();
      store.save();
      log('ad_show', { placement: 'interstitial', stub });
      log('interstitial_show', { setsThisSession: ctx.setsThisSession });
    };
    const reject = (code) => {
      // 2001-2003: normal, skip silently. Not counted, no ad_show.
      log('ad_error', { placement: 'interstitial', stub, errCode: code });
      return false;
    };
    if (stub) {
      const code = ads.stubSim.interstitialError;
      if (code) return Promise.resolve(reject(code));
      return new Promise((resolve) => {
        pending = { resolve: (v) => resolve(v && (count(), true)), kind: 'interstitial', placement: 'interstitial' };
        ads.overlay = { kind: 'interstitial', placement: 'interstitial', label: '广告位（测试）', startedAt: now(), durationMs: config.ads.stubDelayMs };
        invalidate();
      });
    }
    try {
      const ad = wx.createInterstitialAd({ adUnitId: units.interstitial });
      return ad
        .show()
        .then(() => {
          count();
          return true;
        })
        .catch((e) => reject((e && e.errCode) || 2004));
    } catch (e) {
      return Promise.resolve(reject(2004));
    }
  };

  // ---------------- banner (config, default off) ----------------

  /**
   * Show or hide the banner for the current screen. `want` = { screen, state } or null. Allowed only on the
   * group page, friend board and archive list in their ready/empty states, when app_config.ads.banner.enabled
   * and a unit id exist. rect = { left, top, width } with the >= 24 pt gap already applied by the caller.
   */
  ads.syncBanner = function (want, rect) {
    const f = getFeatures() || {};
    const ok =
      !!want &&
      !!(f.banner && f.banner.enabled && f.banner.adUnitId) &&
      (want.screen === 'group' || want.screen === 'friend' || want.screen === 'archive') &&
      (want.state === 'ready' || want.state === 'empty' || want.state === 'small' || want.state === 'notPlayed');
    const key = ok ? want.screen : '';
    if (key === bannerKey) return ok;
    bannerKey = key;
    if (!ok) {
      ads.banner = null;
      if (bannerAd && bannerAd.hide) bannerAd.hide();
      return false;
    }
    ads.banner = { screen: want.screen, rect: rect || null };
    log('ad_request', { placement: 'banner', stub });
    if (stub) {
      log('ad_show', { placement: 'banner', stub });
      return true;
    }
    try {
      if (!bannerAd) bannerAd = wx.createBannerAd({ adUnitId: f.banner.adUnitId, style: { left: (rect && rect.left) || 0, top: (rect && rect.top) || 0, width: (rect && rect.width) || 300 } });
      if (bannerAd.onError) bannerAd.onError((e) => log('ad_error', { placement: 'banner', stub, errCode: e && e.errCode }));
      bannerAd.show();
      log('ad_show', { placement: 'banner', stub });
    } catch (e) {
      log('ad_error', { placement: 'banner', stub, errCode: 3000 });
    }
    return true;
  };

  ads.PLACEMENTS = PLACEMENTS;
  return ads;
}

module.exports = { createAds, PLACEMENTS };
