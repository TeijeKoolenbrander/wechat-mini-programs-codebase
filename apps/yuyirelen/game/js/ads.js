/**
 * Ads (spec 12, IAA only) [COMPLIANCE]. Rewarded video: 视频提示 in UNRANKED plays only
 * (the controller never offers it on a ranked daily and the server rejects it). Interstitial:
 * only on 再来一题. Banner: board ready/empty only, default off.
 *
 *  - every rewarded instance is created with disableFallbackSharePage: true; an onLoad with
 *    useFallbackSharePage is treated as no-fill
 *  - reward only when onClose reports isEnded === true; closing early grants nothing
 *    ("完整观看才能获得提示")
 *  - on load error or no fill, grant the hint at most once per puzzle ("暂无广告，本次免费");
 *    a second failure on the same puzzle grants nothing ("暂无广告，请稍后再试")
 *  - interstitial show() rejections 2001-2003 are skipped silently: logged as ad_error only,
 *    never counted toward caps
 *  - stub mode: a 3-second "广告位（测试）" overlay with complete/skip; can simulate rewarded
 *    errors and interstitial rejections for QA. Off in production builds.
 *
 * Nothing here depends on a share: no share ever grants anything.
 */

const { beijingDateKey } = require('../core/date');
const { clampAds } = require('../core/config');

function createAds(opts) {
  const { config, store, analytics } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const units = opts.adUnits || {};
  const stubCfg = opts.stub || {};
  let cfg = clampAds(config.ads, config.ads);
  let rewardedUnit = units.rewarded || '';
  let interstitialUnit = units.interstitial || '';
  const ads = {
    /** QA hooks (stub mode): { rewardedError: 1004|1000|null, interstitialError: 2001..2005|null } */
    stubSim: stubCfg,
    /** Stub overlay for the renderer: null or { kind, placement, label, startedAt, durationMs } */
    overlay: null,
  };
  const isStub = () => !!stubCfg.enabled || !rewardedUnit;
  Object.defineProperty(ads, 'stub', { get: isStub });
  const grantedOnFailure = {}; // puzzleId|placement -> true
  let pending = null; // { resolve, placement, runKey, kind }
  let rewardedAd = null;
  let bannerAd = null;
  let lastErrCode = null;

  const log = (name, props) => analytics && analytics.track(name, props);
  const invalidate = () => opts.onChange && opts.onChange();
  const outcome = (granted, reason, toast, extra) => Object.assign({ granted, reason, toast: toast || null }, extra || {});

  /** app_config.ads from getDaily().features.ads: merged over the defaults and clamped. */
  ads.applyRemote = function (remote) {
    cfg = clampAds(remote, config.ads);
    if (cfg.rewardedUnitId) rewardedUnit = cfg.rewardedUnitId;
    if (cfg.interstitialUnitId) interstitialUnit = cfg.interstitialUnitId;
  };
  ads.config = () => cfg;

  // ---------------- rewarded ----------------

  function finishEnded(p, ended) {
    if (ended) {
      log('ad_reward', { placement: p.placement, stub: isStub() });
      p.resolve(outcome(true, 'ended'));
    } else {
      log('ad_close_early', { placement: p.placement, stub: isStub() });
      p.resolve(outcome(false, 'closedEarly', '完整观看才能获得提示'));
    }
  }

  function finishError(p, code) {
    log('ad_error', { placement: p.placement, stub: isStub(), errCode: code });
    const key = p.runKey + '|' + p.placement;
    if (!grantedOnFailure[key]) {
      grantedOnFailure[key] = true;
      p.resolve(outcome(true, 'noFillGrant', '暂无广告，本次免费', { errCode: code }));
    } else {
      p.resolve(outcome(false, 'noFillBlocked', '暂无广告，请稍后再试', { errCode: code }));
    }
  }

  function ensureRewarded() {
    if (rewardedAd) return rewardedAd;
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: rewardedUnit, disableFallbackSharePage: true });
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
        // a no-fill can arrive as a load with the platform share page; we disabled it. If it reports anyway, no-fill.
        if (info && info.useFallbackSharePage) {
          const p = pending;
          if (!p || p.kind !== 'rewarded') return;
          pending = null;
          finishError(p, 1004);
        }
      });
    }
    return rewardedAd;
  }

  /**
   * Show a rewarded video. placement 'hint'; runKey = puzzleId (the once-per-puzzle no-fill
   * rule). Resolves { granted, reason: ended|closedEarly|noFillGrant|noFillBlocked|busy, toast, errCode? }.
   */
  ads.rewarded = function (placement, runKey) {
    if (pending) return Promise.resolve(outcome(false, 'busy'));
    log('ad_request', { placement, stub: isStub() });
    return new Promise((resolve) => {
      const p = { resolve, placement, runKey: runKey || 'puzzle', kind: 'rewarded' };
      pending = p;
      if (isStub()) {
        if (ads.stubSim.rewardedError) {
          pending = null;
          finishError(p, ads.stubSim.rewardedError);
          return;
        }
        log('ad_show', { placement, stub: true });
        ads.overlay = { kind: 'rewarded', placement, label: '广告位（测试）', startedAt: now(), durationMs: config.ads.stubDelayMs };
        invalidate();
        return;
      }
      try {
        const ad = ensureRewarded();
        const show = () => ad.show().then(() => log('ad_show', { placement, stub: false }));
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

  /** Complete button: only after the stub delay unless `force`. Returns true if it acted. */
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

  /**
   * Is an interstitial due on 再来一题? ctx = { sessionFinished, lifetimeFinished, firstFromCard, blocked }
   * (counts include the puzzle that just finished). Pure.
   */
  ads.interstitialDue = function (ctx) {
    const c = cfg.interstitial;
    if (!ctx || ctx.blocked) return false;
    if (ctx.lifetimeFinished < c.minLifetime) return false;
    if (ctx.sessionFinished <= 0 || ctx.sessionFinished % c.everyNPuzzles !== 0) return false;
    if (ctx.firstFromCard && ctx.sessionFinished <= 1) return false;
    const st = store.state.interstitial;
    const today = beijingDateKey(now());
    if (st.day === today && st.count >= c.maxPerDay) return false;
    if (st.lastAt && now() - st.lastAt < c.minGapSec * 1000) return false;
    return true;
  };

  /** Try to show one. Never blocks the caller. Resolves true if shown and counted. */
  ads.interstitial = function (ctx) {
    if (!ads.interstitialDue(ctx)) return Promise.resolve(false);
    if (pending) return Promise.resolve(false);
    log('ad_request', { placement: 'interstitial', stub: isStub() });
    const count = () => {
      const st = store.state.interstitial;
      const today = beijingDateKey(now());
      if (st.day !== today) {
        st.day = today;
        st.count = 0;
      }
      st.count++;
      st.lastAt = now();
      store.save();
      log('ad_show', { placement: 'interstitial', stub: isStub() });
      log('interstitial_show', { finishedThisSession: ctx.sessionFinished });
    };
    const reject = (code) => {
      // 2001-2003: normal, skip silently. Not counted, no ad_show.
      log('ad_error', { placement: 'interstitial', stub: isStub(), errCode: code });
      return false;
    };
    if (isStub()) {
      const code = ads.stubSim.interstitialError;
      if (code) return Promise.resolve(reject(code));
      return new Promise((resolve) => {
        pending = { resolve: (v) => resolve(v && (count(), true)), kind: 'interstitial', placement: 'interstitial' };
        ads.overlay = { kind: 'interstitial', placement: 'interstitial', label: '广告位（测试）', startedAt: now(), durationMs: config.ads.stubDelayMs };
        invalidate();
      });
    }
    try {
      const ad = wx.createInterstitialAd({ adUnitId: interstitialUnit });
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

  // ---------------- banner (boards only) ----------------

  /** Banner is enabled only by config with a unit id. */
  ads.bannerEnabled = () => !!(cfg.banner.enabled && cfg.banner.adUnitId);

  /**
   * Show or hide the board footer banner. rect = { left, top, width } in px; the caller keeps
   * a >= 24 pt gap above it. Safe to call every frame.
   */
  ads.bannerSync = function (visible, rect) {
    if (!visible || !ads.bannerEnabled() || !wx.createBannerAd) {
      if (bannerAd && bannerAd.hide) bannerAd.hide();
      return false;
    }
    try {
      if (!bannerAd) {
        bannerAd = wx.createBannerAd({ adUnitId: cfg.banner.adUnitId, style: { left: rect.left, top: rect.top, width: rect.width } });
        if (bannerAd.onError) bannerAd.onError((e) => log('ad_error', { placement: 'banner', stub: false, errCode: e && e.errCode }));
        log('ad_request', { placement: 'banner', stub: false });
      } else if (bannerAd.style) {
        bannerAd.style.left = rect.left;
        bannerAd.style.top = rect.top;
      }
      if (bannerAd.show) bannerAd.show();
      return true;
    } catch (e) {
      log('ad_error', { placement: 'banner', stub: false, errCode: 'create' });
      return false;
    }
  };

  return ads;
}

module.exports = { createAds };
