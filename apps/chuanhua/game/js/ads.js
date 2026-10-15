/**
 * Ads (spec 11, IAA only). Placements:
 *   'start'   rewarded: 再开一条 (+1 start, <= 2 per Beijing day; the server enforces via grantReward)
 *   'palette' rewarded: 今日彩笔 (+6 colours until 24:00 BJT, 1 per day; offered before the first stroke or in settings)
 *   interstitial: only on leaving a reveal, from the 3rd lifetime reveal, >= minGapSec apart, <= maxPerDay per day
 *   banner: 本群接龙 / 我的接龙 in ready/empty states, remote flag, default off
 *
 * Rules implemented here:
 *  - every rewarded instance uses disableFallbackSharePage: true; an onLoad reporting useFallbackSharePage is no-fill
 *  - reward only when onClose reports isEnded === true; closing early grants nothing ("完整观看才能获得")
 *  - no fill / load error: grant the reward ONCE per Beijing day per placement ("暂无广告，本次免费"); the second
 *    failure grants nothing ("暂无广告，请稍后再试"). The flag survives restarts (store.noFillGranted)
 *  - interstitial show() rejections 2001-2003 are skipped silently, never counted toward caps
 *  - stub mode: a 3 s "广告位（测试）" overlay with complete/skip; QA hooks simulate errors
 *  - nothing here ever depends on a share (no share-for-reward path exists)
 *
 * Callers hold the server side: after `rewarded()` resolves granted, call api.grantReward({kind, noFill}).
 */

const { beijingDateKey } = require('../core/date');
const { CONFIG } = require('../core/config');

const REWARD_KIND = { start: 'start', palette: 'palette' };

function createAds(opts) {
  const { config, store, analytics } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const units = opts.adUnits || {};
  const stubCfg = opts.stub || {};
  const stub = !!stubCfg.enabled || !units.rewarded;
  const ads = {
    stub,
    /** QA hooks, stub mode only: { rewardedError: 1004|1000|null, interstitialError: 2001..2005|null } */
    stubSim: stubCfg,
    /** Stub overlay for the renderer: null or { kind, placement, label, startedAt, durationMs } */
    overlay: null,
    /** remote interstitial/banner config from getHome.features, clamped */
    remote: { interstitial: { enabled: false }, banner: { enabled: false, adUnitId: null } },
  };
  let pending = null; // { resolve, placement, kind }
  let rewardedAd = null;
  let handlersSet = false;
  let lastErrCode = null;

  const log = (name, props) => analytics && analytics.track(name, props);
  const invalidate = () => opts.onChange && opts.onChange();
  const today = () => beijingDateKey(opts.serverNow ? opts.serverNow() : now());

  function outcome(granted, reason, toast, extra) {
    return Object.assign({ granted, reason, toast: toast || null }, extra || {});
  }

  /** Apply the (clamped) remote config from getHome.features. */
  ads.configure = function (features) {
    const i = (features && features.interstitial) || {};
    const c = CONFIG.ads.interstitial;
    ads.remote.interstitial = {
      enabled: !!i.enabled,
      minLifetimeReveals: Number.isFinite(i.minLifetimeReveals) ? Math.max(0, i.minLifetimeReveals) : c.minLifetimeReveals,
      minGapSec: Math.max(c.clampMinGapSec, Number.isFinite(i.minGapSec) ? i.minGapSec : c.minGapSec),
      maxPerDay: Math.max(0, Math.min(c.clampMaxPerDay, Number.isFinite(i.maxPerDay) ? i.maxPerDay : c.maxPerDay)),
    };
    const b = (features && features.banner) || {};
    ads.remote.banner = { enabled: !!b.enabled, adUnitId: b.adUnitId || units.banner || null };
  };

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
    const key = today() + '|' + p.placement;
    const st = store.state.noFillGranted;
    if (!st[key]) {
      st[key] = true;
      store.save();
      p.resolve(outcome(true, 'noFillGrant', '暂无广告，本次免费', { errCode: code, noFill: true }));
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
          // a no-fill can arrive as a load with the platform share page; we disabled it, and if it reports anyway it is no-fill
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
   * Show a rewarded video for placement 'start' | 'palette'. Resolves to
   * { granted, reason: ended|closedEarly|noFillGrant|noFillBlocked|busy, toast, errCode?, noFill? }.
   */
  ads.rewarded = function (placement) {
    if (!REWARD_KIND[placement]) return Promise.resolve(outcome(false, 'badPlacement'));
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

  // ---------------- interstitial (on leaving a reveal only) ----------------

  /** Is an interstitial due when the player leaves a reveal? ctx = { lifetimeReveals } (including this one). Pure. */
  ads.interstitialDue = function (ctx) {
    const c = ads.remote.interstitial;
    if (!c.enabled) return false;
    if (!ctx || (ctx.lifetimeReveals || 0) < c.minLifetimeReveals) return false;
    const st = store.state.interstitial;
    const day = today();
    if (st.day === day && st.count >= c.maxPerDay) return false;
    if (st.lastAt && now() - st.lastAt < c.minGapSec * 1000) return false;
    return true;
  };

  /** Try to show one. Never blocks navigation. Resolves true if shown and counted. */
  ads.interstitial = function (ctx) {
    if (!ads.interstitialDue(ctx)) return Promise.resolve(false);
    if (pending) return Promise.resolve(false);
    log('ad_request', { placement: 'interstitial', stub });
    const count = () => {
      const st = store.state.interstitial;
      const day = today();
      if (st.day !== day) {
        st.day = day;
        st.count = 0;
      }
      st.count++;
      st.lastAt = now();
      store.save();
      log('ad_show', { placement: 'interstitial', stub });
      log('interstitial_show', { reveals: ctx.lifetimeReveals });
    };
    const reject = (code) => {
      // 2001-2003: normal, skip silently. Not counted.
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

  // ---------------- banner ----------------

  /**
   * Where a banner may appear: only 本群接龙 and 我的接龙 in ready/empty states, only if the remote flag is on.
   * Returns { show, reservedHeight } for the screen view model (>= 24 pt gap is the renderer's job; the
   * reserved height includes it). Production banners are created by the renderer layer from the unit id.
   */
  ads.bannerFor = function (screen, state) {
    const ok = (screen === 'group' || screen === 'album') && (state === 'ready' || state === 'empty') && ads.remote.banner.enabled;
    return { show: !!ok, reservedHeight: ok ? 100 + CONFIG.ads.bannerGapPt : 0 };
  };

  return ads;
}

module.exports = { createAds, REWARD_KIND };
