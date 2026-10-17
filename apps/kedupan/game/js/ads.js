/**
 * Ads (spec 9, IAA only) [COMPLIANCE]. Decisions live in core/adpolicy.js (pure, tested); this file does the wx calls.
 *
 *  - rewarded (加一题 'bonus', 全国分布 'distribution', 换一批 'swap'): every instance is created with
 *    disableFallbackSharePage: true; an onLoad with useFallbackSharePage is no-fill; the reward is granted ONLY when
 *    onClose reports isEnded === true ("完整观看才能获得" otherwise); on a load error / no fill (1000-1008) or when no
 *    ad unit exists yet, the reward is granted at most ONCE per placement per Beijing day ("暂无广告，本次免费"),
 *    the next failure that day grants nothing ("暂无广告，请稍后再试"). The once-a-day marker is persisted.
 *  - interstitial: only on 再来一期 / 返回列表 after a completed archive set, under the caps in
 *    core/adpolicy.interstitialDecision (remote config, clamped); 2001-2003 are skipped silently and not counted.
 *  - banner: group page, friend board and archive list only (the controller decides), `features.banner` default off.
 *  - stub mode (QA only; AC 61): a test overlay with complete / skip and simulated errors; logs `stub: true`.
 * Nothing here depends on a share, and nothing outcome-relevant (scores, ranks) depends on an ad (AC 81).
 */

const { beijingDateKey } = require('../core/date');
const AD = require('../core/adpolicy');
const { CONFIG } = require('../core/config');

const STUB_MS = 3000;

function createAds(opts) {
  const { store, analytics } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const dayKey = opts.dayKey || (() => beijingDateKey(now()));
  const units = opts.adUnits || {};
  const stubCfg = opts.stub || {};
  const stub = !!stubCfg.enabled;
  const ads = {
    stub,
    /** QA hooks (stub only): { rewardedError: 1004|1000|null, interstitialError: 2001..2005|null } */
    stubSim: stubCfg,
    /** Stub overlay for the renderer: null or { kind, placement, startedAt, durationMs } */
    overlay: null,
    /** every ad call made, by placement (harness: AC 55) */
    calls: [],
  };
  let pending = null; // { resolve, placement, kind }
  let rewardedAd = null;
  let handlersSet = false;
  let lastErrCode = null;

  const log = (name, props) => analytics && analytics.track(name, props);
  const invalidate = () => opts.onChange && opts.onChange();
  const outcome = (granted, reason, toast, extra) => Object.assign({ granted, reason, toast: toast || null }, extra || {});

  // ---------------- rewarded ----------------

  function finishEnded(p, ended) {
    if (ended) {
      log('ad_reward', { placement: p.placement, stub });
      p.resolve(outcome(true, 'ended'));
    } else {
      log('ad_close_early', { placement: p.placement, stub });
      p.resolve(outcome(false, 'closedEarly', AD.MSG.early));
    }
  }

  function finishError(p, code) {
    log('ad_error', { placement: p.placement, stub, errCode: code });
    const nf = store.state.adNoFill;
    const today = dayKey();
    if (nf.day !== today) {
      nf.day = today;
      nf.keys = {};
    }
    const d = AD.rewardDecision({ event: 'noFill', noFillGrantedToday: nf.keys[p.placement] === true });
    if (d.markNoFill) {
      nf.keys[p.placement] = true;
      store.save();
    }
    p.resolve(outcome(d.grant, d.grant ? 'noFillGrant' : 'noFillBlocked', d.message, { errCode: code }));
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
          // a no-fill can arrive as a load with the platform share page; we disabled it, so treat it as no-fill and never show
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
   * Show a rewarded video. placement: 'bonus' | 'distribution' | 'swap'.
   * Resolves { granted, reason: ended|closedEarly|noFillGrant|noFillBlocked|busy, toast, errCode? }.
   */
  ads.rewarded = function (placement) {
    if (pending) return Promise.resolve(outcome(false, 'busy'));
    ads.calls.push({ kind: 'rewarded', placement });
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
        ads.overlay = { kind: 'rewarded', placement, startedAt: now(), durationMs: STUB_MS };
        invalidate();
        return;
      }
      if (!units.rewarded || !wx || !wx.createRewardedVideoAd) {
        // no 流量主 unit yet: behaves as no-fill (spec 9)
        pending = null;
        finishError(p, 1004);
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

  // ---------------- interstitial ----------------

  let cfg = AD.clampInterstitial(null);
  /** Remote caps (features.interstitial), clamped again here. */
  ads.setInterstitialConfig = function (c) {
    cfg = AD.clampInterstitial(c);
  };
  ads.interstitialConfig = () => cfg;

  /** Decision only (pure over the persisted counters). setsThisSession counts the set that was just completed. */
  ads.interstitialDecision = function (setsThisSession) {
    const st = store.state.interstitial;
    const today = dayKey();
    return AD.interstitialDecision(
      { setsThisSession, lifetimeSets: store.state.lifetimeSets, lastShownMs: st.lastAt || null, shownToday: st.day === today ? st.count : 0 },
      cfg,
      now()
    );
  };

  /**
   * Show one if due, on 再来一期 / 返回列表 after a completed archive set. Never blocks navigation: callers do not
   * await it before moving on. Resolves true when shown and counted.
   */
  ads.interstitial = function (setsThisSession) {
    if (!ads.interstitialDecision(setsThisSession).show) return Promise.resolve(false);
    if (pending) return Promise.resolve(false);
    ads.calls.push({ kind: 'interstitial', placement: 'interstitial' });
    log('ad_request', { placement: 'interstitial', stub });
    const count = () => {
      const st = store.state.interstitial;
      const today = dayKey();
      if (st.day !== today) {
        st.day = today;
        st.count = 0;
      }
      st.count++;
      st.lastAt = now();
      store.save();
      log('ad_show', { placement: 'interstitial', stub });
      log('interstitial_show', { setsThisSession });
    };
    const reject = (code) => {
      // 2001-2003 (and any other failure): skipped silently, logged only, never counted, never delays navigation
      log('ad_error', { placement: 'interstitial', stub, errCode: code });
      return false;
    };
    if (stub) {
      const code = ads.stubSim.interstitialError;
      if (code) return Promise.resolve(reject(code));
      return new Promise((resolve) => {
        pending = { resolve: (v) => resolve(v && (count(), true)), kind: 'interstitial', placement: 'interstitial' };
        ads.overlay = { kind: 'interstitial', placement: 'interstitial', startedAt: now(), durationMs: STUB_MS };
        invalidate();
      });
    }
    if (!units.interstitial || !wx || !wx.createInterstitialAd) return Promise.resolve(false); // no unit yet: nothing shown, nothing logged as an error
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

  let bannerAd = null;
  let bannerInfo = null; // { unitId, left, width, bottomEdge, gap? }
  ads.bannerHeight = 0;
  ads.bannerActive = false;

  function placeBanner() {
    if (!bannerAd || !bannerInfo) return;
    const h = ads.bannerHeight || Math.round(bannerInfo.width * 0.29);
    bannerAd.style = bannerAd.style || {};
    bannerAd.style.left = bannerInfo.left;
    bannerAd.style.top = bannerInfo.bottomEdge - h - (bannerInfo.gap === undefined ? 8 : bannerInfo.gap);
    bannerAd.style.width = bannerInfo.width;
  }

  /** info = { unitId, left, width, bottomEdge, gap? }. No-op in stub mode or without a unit / API. */
  ads.bannerShow = function (info) {
    if (stub || !wx || !wx.createBannerAd || !info || !info.unitId) return false;
    bannerInfo = info;
    try {
      if (!bannerAd) {
        ads.calls.push({ kind: 'banner', placement: 'banner' });
        log('ad_request', { placement: 'banner', stub });
        bannerAd = wx.createBannerAd({ adUnitId: info.unitId, adIntervals: 30, style: { left: info.left, top: info.bottomEdge - 80, width: info.width } });
        if (bannerAd.onError) bannerAd.onError((e) => log('ad_error', { placement: 'banner', stub, errCode: e && e.errCode }));
        if (bannerAd.onLoad) bannerAd.onLoad(() => log('ad_show', { placement: 'banner', stub }));
        if (bannerAd.onResize)
          bannerAd.onResize((r) => {
            if (r && r.height) ads.bannerHeight = r.height;
            placeBanner();
            invalidate();
          });
      }
      placeBanner();
      if (bannerAd.show) {
        const p = bannerAd.show();
        if (p && p.catch) p.catch((e) => log('ad_error', { placement: 'banner', stub, errCode: e && e.errCode }));
      }
      ads.bannerActive = true;
      return true;
    } catch (e) {
      log('ad_error', { placement: 'banner', stub, errCode: e && e.errCode });
      return false;
    }
  };
  ads.bannerHide = function () {
    if (bannerAd && bannerAd.hide) bannerAd.hide();
    ads.bannerActive = false;
  };
  ads.bannerDestroy = function () {
    if (bannerAd && bannerAd.destroy) bannerAd.destroy();
    bannerAd = null;
    bannerInfo = null;
    ads.bannerActive = false;
  };

  ads.CONFIG = CONFIG.interstitial;
  return ads;
}

module.exports = { createAds, STUB_MS };
