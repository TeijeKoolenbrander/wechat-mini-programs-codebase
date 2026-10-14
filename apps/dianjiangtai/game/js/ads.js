/**
 * Ads (spec 12, IAA only). Rewarded video: free-play extra re-spin and 复盘.
 * Interstitial: only on 再来一局 in free play, under conservative caps.
 *
 * Rules implemented here:
 *  - every rewarded instance is created with disableFallbackSharePage: true
 *    (AC 64); an onLoad with useFallbackSharePage is treated as no-fill
 *  - reward only when onClose reports isEnded === true; closing early grants
 *    nothing ("完整观看才能获得")
 *  - D6: on load error or no fill (codes 1000-1008, incl. 1004), grant the
 *    reward at most once per run per placement ("暂无广告，本次免费"); a second
 *    failure for that placement in that run grants nothing
 *    ("暂无广告，请稍后再试")
 *  - interstitial: show() rejections 2001-2003 are skipped silently, logged
 *    as ad_error only, never counted toward caps, never ad_show/
 *    interstitial_show; 2004/2005 are logged as errors too
 *  - stub mode (D5): a 3-second "广告位（测试）" overlay with complete/skip;
 *    can simulate rewarded errors and interstitial rejections for QA
 *    (AC 64, 65). Off in production builds (config flag in main.js).
 *
 * Nothing here ever depends on a share (no share-for-reward path exists).
 */

const { beijingDateKey } = require('../core/date');

function createAds(opts) {
  const { config, store, analytics } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const units = opts.adUnits || {};
  const stubCfg = opts.stub || {};
  const stub = !!stubCfg.enabled || !units.rewarded;
  const ads = {
    stub,
    /** QA hooks, only used in stub mode: { rewardedError: 1004|1000|null, interstitialError: 2001..2005|null, loadDelayMs } */
    stubSim: stubCfg,
    /** Stub overlay for the renderer: null or { kind, placement, label, startedAt, durationMs } */
    overlay: null,
  };
  const grantedOnFailure = {}; // runKey|placement -> true (D6)
  let pending = null; // { resolve, placement, runKey, kind }
  let rewardedAd = null;
  let rewardedHandlersSet = false;
  let lastErrCode = null;

  const log = (name, props) => analytics && analytics.track(name, props);
  const invalidate = () => opts.onChange && opts.onChange();

  function outcome(granted, reason, toast, extra) {
    return Object.assign({ granted, reason, toast: toast || null }, extra || {});
  }

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

  function finishError(p, code) {
    log('ad_error', { placement: p.placement, stub, errCode: code });
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
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: units.rewarded, disableFallbackSharePage: true });
    if (!rewardedHandlersSet) {
      rewardedHandlersSet = true;
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
          // base library 3.7.7+: a no-fill can arrive as a load with the platform share page. We disabled it;
          // if it reports anyway, treat as no-fill and never show.
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
   * Show a rewarded video. placement: 'respin' | 'replay'; runKey identifies
   * the run (for the D6 once-per-run rule). Resolves to
   * { granted, reason: ended|closedEarly|noFillGrant|noFillBlocked|busy, toast, errCode? }.
   */
  ads.rewarded = function (placement, runKey) {
    if (pending) return Promise.resolve(outcome(false, 'busy'));
    log('ad_request', { placement, stub });
    return new Promise((resolve) => {
      const p = { resolve, placement, runKey: runKey || 'run', kind: 'rewarded' };
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

  // ---------------- interstitial ----------------

  /**
   * Is an interstitial due on 再来一局? ctx = { mode, sessionFreeRuns, lifetimeRuns }
   * (sessionFreeRuns counts the run that just completed). Pure.
   */
  ads.interstitialDue = function (ctx) {
    const c = config.ads.interstitial;
    if (!ctx || ctx.mode !== 'free') return false;
    if (ctx.lifetimeRuns < c.minLifetimeRuns) return false;
    if (ctx.sessionFreeRuns <= 0 || ctx.sessionFreeRuns % c.everyNthRun !== 0) return false;
    const st = store.state.interstitial;
    const today = beijingDateKey(now());
    if (st.day === today && st.count >= c.maxPerDay) return false;
    if (st.lastAt && now() - st.lastAt < c.minGapMs) return false;
    return true;
  };

  /**
   * Try to show one. Never blocks the caller (do not await it before starting
   * the next run). Resolves true if shown and counted.
   */
  ads.interstitial = function (ctx) {
    if (!ads.interstitialDue(ctx)) return Promise.resolve(false);
    if (pending) return Promise.resolve(false);
    log('ad_request', { placement: 'interstitial', stub });
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
      log('ad_show', { placement: 'interstitial', stub });
      log('interstitial_show', { runsThisSession: ctx.sessionFreeRuns });
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

  return ads;
}

module.exports = { createAds };
