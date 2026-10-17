/**
 * Ads (spec 11, IAA only) [COMPLIANCE]. Rewarded video: 再开一条 ('start', <= 2 a day) and 今日彩笔 ('palette', 1 a day).
 * Interstitial: only on leaving a reveal, under remote caps. Banner: list screens, behind remote config, default off.
 *
 * Rules implemented here (AC 101-106):
 *  - every rewarded instance is created with disableFallbackSharePage: true; an onLoad that reports useFallbackSharePage
 *    is treated as no-fill and never shown
 *  - reward only when onClose reports isEnded === true; closing early grants nothing ("完整观看才能获得")
 *  - on load error or no fill (1000-1008, incl. 1004) the reward is granted at most ONCE PER DAY PER PLACEMENT
 *    ("暂无广告，本次免费"); a second failure grants nothing ("暂无广告，请稍后再试"). The server enforces the same through
 *    grantReward({noFill}); this module only decides what to ask for and what to say
 *  - interstitial: show() rejections 2001-2003 are skipped silently, logged as ad_error only, never counted toward caps,
 *    never ad_show/interstitial_show; 2004/2005 are logged too
 *  - stub mode (QA only, build-config stubAds): a 3 s "广告位（测试）" overlay with complete/skip. WITHOUT stub mode and
 *    without an ad unit a placement behaves as no-fill (nothing is faked in production)
 * Nothing here depends on a share (there is no share-for-reward path).
 */

const { beijingDateKey } = require('../core/date');
const { CONFIG } = require('../core/config');

const STUB_MS = 3000;

function createAds(opts) {
  const { store, analytics } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const units = opts.adUnits || {};
  const stubCfg = opts.stub || {};
  const stub = !!stubCfg.enabled;
  const ads = {
    stub,
    /** QA hooks, stub mode only: { rewardedError: 1004|null, interstitialError: 2001..2005|null } */
    stubSim: stubCfg,
    /** Stub overlay for the renderer: null or { kind, placement, label, startedAt, durationMs } */
    overlay: null,
    /** per placement: idle | loading | playing | error (the vm's adState) */
    states: { start: 'idle', palette: 'idle' },
  };
  let pending = null; // { resolve, placement, kind }
  let rewardedAd = null;
  let handlersSet = false;

  const log = (name, props) => analytics && analytics.track(name, props);
  const invalidate = () => opts.onChange && opts.onChange();
  const today = () => beijingDateKey(now() + (opts.offset ? opts.offset() : 0));
  const setState = (placement, s) => {
    ads.states[placement] = s;
    invalidate();
  };

  const outcome = (granted, reason, toast, extra) => Object.assign({ granted, reason, toast: toast || null, noFill: false }, extra || {});

  function noFillFlags() {
    const nf = store.state.noFill;
    if (nf.day !== today()) {
      nf.day = today();
      nf.start = false;
      nf.palette = false;
    }
    return nf;
  }

  function finishEnded(p, ended) {
    setState(p.placement, 'idle');
    if (ended) {
      log('ad_reward', { placement: p.placement, stub });
      p.resolve(outcome(true, 'ended'));
    } else {
      log('ad_close', { placement: p.placement, stub, early: true });
      p.resolve(outcome(false, 'closedEarly', '完整观看才能获得'));
    }
  }

  function finishError(p, code) {
    log('ad_error', { placement: p.placement, stub, errCode: code });
    const nf = noFillFlags();
    if (!nf[p.placement]) {
      nf[p.placement] = true;
      store.save();
      setState(p.placement, 'idle');
      p.resolve(outcome(true, 'noFillGrant', '暂无广告，本次免费', { errCode: code, noFill: true }));
    } else {
      setState(p.placement, 'error');
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
        const p = pending;
        if (!p || p.kind !== 'rewarded') return;
        pending = null;
        finishError(p, e && e.errCode);
      });
      if (rewardedAd.onLoad) {
        rewardedAd.onLoad((info) => {
          // a no-fill can arrive as a load with the platform share page; we disabled it, so if it reports anyway: no-fill
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
   * Show a rewarded video. placement: 'start' | 'palette'. Resolves to
   * { granted, reason: ended|closedEarly|noFillGrant|noFillBlocked|busy, toast, noFill, errCode? }.
   */
  ads.rewarded = function (placement) {
    if (pending) return Promise.resolve(outcome(false, 'busy'));
    log('ad_request', { placement, stub });
    setState(placement, 'loading');
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
        setState(placement, 'playing');
        ads.overlay = { kind: 'rewarded', placement, label: '广告位（测试）', startedAt: now(), durationMs: STUB_MS };
        invalidate();
        return;
      }
      if (!units.rewarded || !wx || !wx.createRewardedVideoAd) {
        // no 流量主 yet: behave as no-fill
        pending = null;
        finishError(p, 1000);
        return;
      }
      try {
        const ad = ensureRewarded();
        const show = () =>
          ad.show().then(() => {
            setState(placement, 'playing');
            log('ad_show', { placement, stub });
          });
        show().catch(() =>
          ad
            .load()
            .then(show)
            .catch((e) => {
              if (pending === p) {
                pending = null;
                finishError(p, (e && e.errCode) || 1003);
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

  /** Complete button: only after the 3 s have elapsed unless `force`. Returns true if it acted. */
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

  // ---------------- interstitial (on leaving a reveal) ----------------

  const HARD_MAX_PER_DAY = 3;
  const HARD_MIN_GAP_SEC = 180;

  let remote = null;
  /** Remote caps (already clamped by features.js). null -> core defaults. */
  ads.setInterstitialConfig = function (cfg) {
    remote = cfg || null;
  };
  ads.interstitialConfig = function () {
    const d = CONFIG.ads.interstitial;
    const c = remote || { enabled: d.enabled, minLifetimeReveals: d.minLifetimeReveals, minGapSec: d.minGapSec, maxPerDay: d.maxPerDay };
    // last line of defence (AC 104): never above 3 a day, never closer than 180 s, whatever was handed in
    return Object.assign({}, c, { minGapSec: Math.max(HARD_MIN_GAP_SEC, c.minGapSec), maxPerDay: Math.min(HARD_MAX_PER_DAY, c.maxPerDay) });
  };

  /** Is an interstitial due when leaving a reveal? ctx = { lifetimeReveals } (including the one being left). Pure. */
  ads.interstitialDue = function (ctx) {
    const c = ads.interstitialConfig();
    if (!c.enabled) return false;
    if (!stub && (!units.interstitial || !wx || !wx.createInterstitialAd)) return false; // no 流量主: no-fill
    if (!ctx || ctx.lifetimeReveals < c.minLifetimeReveals) return false;
    const st = store.state.interstitial;
    if (st.day === today() && st.count >= c.maxPerDay) return false;
    if (st.lastAt && now() - st.lastAt < c.minGapSec * 1000) return false;
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
      log('interstitial_show', { placement: 'interstitial', stub });
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
        ads.overlay = { kind: 'interstitial', placement: 'interstitial', label: '广告位（测试）', startedAt: now(), durationMs: STUB_MS };
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

  // ---------------- banner (spec 11, default off) ----------------
  // 本群接龙 and 我的接龙 only (ready/empty states). Errors are silent (ad_error, placement banner). In stub mode nothing is
  // created: the list vm asks the renderer for a grey test bar instead.

  let bannerAd = null;
  let bannerInfo = null;
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

  /** info = { unitId, left, width, bottomEdge, gap? }. No-op in stub mode or when the platform has no banner API. */
  ads.bannerShow = function (info) {
    if (stub || !wx || !wx.createBannerAd || !info || !info.unitId) return false;
    bannerInfo = info;
    try {
      if (!bannerAd) {
        log('ad_request', { placement: 'banner', stub });
        bannerAd = wx.createBannerAd({ adUnitId: info.unitId, adIntervals: 30, style: { left: info.left, top: info.bottomEdge - 80, width: info.width } });
        if (bannerAd.onError) bannerAd.onError((e) => log('ad_error', { placement: 'banner', stub, errCode: e && e.errCode }));
        if (bannerAd.onLoad) bannerAd.onLoad(() => log('ad_show', { placement: 'banner', stub }));
        if (bannerAd.onResize) {
          bannerAd.onResize((r) => {
            if (r && r.height) ads.bannerHeight = r.height;
            placeBanner();
            invalidate();
          });
        }
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
  /** Hidden while a sheet or dialog is open. */
  ads.bannerHide = function () {
    if (bannerAd && bannerAd.hide) bannerAd.hide();
    ads.bannerActive = false;
  };
  /** Destroyed when leaving the list screens. */
  ads.bannerDestroy = function () {
    if (bannerAd && bannerAd.destroy) bannerAd.destroy();
    bannerAd = null;
    bannerInfo = null;
    ads.bannerActive = false;
  };

  return ads;
}

module.exports = { createAds, STUB_MS };
