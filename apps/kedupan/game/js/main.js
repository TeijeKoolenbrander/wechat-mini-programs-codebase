/**
 * Boot: canvas, render loop (repaints only when something changed or moves), single-finger touch routing
 * (taps, the ruler, scroll drags), lifecycle. All game logic lives in js/controller.js; this file only wires
 * the platform to it.
 *
 * Test seam (never set in production): `wx.__kdTest = { mockServer, openid, population, launchDateKey, forceStub }`
 * lets the fake-wx harness share one mock server between several simulated players and pin the renderer.
 */

const { createStore } = require('./store');
const { createApi } = require('./api');
const { createAnalytics } = require('./analytics');
const { createAds } = require('./ads');
const { createShare } = require('./share');
const { createPrivacy } = require('./privacy');
const { createOdc } = require('./odc');
const { createAudio } = require('./audio');
const { createController } = require('./controller');
const { loadRenderers } = require('./renderers');
const build = require('./build-config');
const { getConfig, LATEST_CONFIG_VERSION } = require('../core/config');
const { getContent } = require('../core/content');

const TAP_SLOP = 10;

function windowInfo() {
  if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo();
  return wx.getSystemInfoSync();
}

function menuRect() {
  try {
    const m = wx.getMenuButtonBoundingClientRect();
    if (m && m.bottom > 0) return m;
  } catch (e) {
    /* no capsule rect: renderer falls back to the iOS default */
  }
  return null;
}

function boot() {
  const seam = wx.__kdTest || {};
  const R = loadRenderers({ forceStub: !!seam.forceStub, real: seam.realRenderer });
  const info = windowInfo();
  const dpr = info.pixelRatio || 1;

  // the first wx.createCanvas() is the screen
  const canvas = wx.createCanvas();
  canvas.width = Math.round(info.windowWidth * dpr);
  canvas.height = Math.round(info.windowHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const sys = () => {
    const w = windowInfo();
    return { windowWidth: w.windowWidth, windowHeight: w.windowHeight, pixelRatio: w.pixelRatio || 1, statusBarHeight: w.statusBarHeight, safeArea: w.safeArea, menuRect: menuRect() };
  };
  let layout = R.makeLayout(sys());
  let lastKind = R.kind;

  const config = getConfig(LATEST_CONFIG_VERSION);
  const content = getContent(1);
  const store = createStore(wx);
  let dirty = true;
  let wasAnimating = false;
  const invalidate = () => {
    dirty = true;
  };

  const api = createApi({
    wx,
    mode: build.cloudEnv ? 'cloud' : 'mock',
    env: build.cloudEnv,
    mockServer: seam.mockServer,
    openid: seam.openid,
    mock: { population: seam.population !== undefined ? seam.population : build.mockPopulation, launchDateKey: seam.launchDateKey },
  });
  const analytics = createAnalytics({ wx, api, store, config, contentVersion: content.contentVersion, appVersion: build.appVersion, setInterval, clearInterval });
  R.onFallback = (err, where) => analytics.track('error', { where: 'render', code: String(where).slice(0, 40) });
  const ctlRef = {};
  const ads = createAds({ wx, config, store, analytics, adUnits: build.adUnits, stub: { enabled: build.stubAds }, onChange: invalidate, getFeatures: () => (ctlRef.ctl ? ctlRef.ctl.features : null) });
  const share = createShare({ wx, api, analytics });
  const privacy = createPrivacy({ wx, store, analytics });
  const odc = createOdc(wx);
  const audio = createAudio(wx, store.state.muted);

  share.cardRenderer = (card) =>
    new Promise((resolve) => {
      if (!R.shareCard) return resolve(null);
      try {
        const cv = wx.createCanvas();
        R.shareCard.render(cv, card, { pixelScale: 1 });
        cv.toTempFilePath({ success: (r) => resolve(r.tempFilePath), fail: () => resolve(null) });
      } catch (e) {
        resolve(null);
      }
    });

  const ctl = createController({ wx, api, store, analytics, ads, share, privacy, odc, audio, config, content, invalidate, getLayout: () => layout });
  ctlRef.ctl = ctl;
  const app = { ctl, api, ads, analytics, share, privacy, odc, store, renderer: R, invalidate, get layout() { return layout; }, get hits() { return hits; } };

  // --- frame loop ---
  let hits = [];
  let feedbackBtn = null;

  function syncFeedbackButton(view) {
    if (!wx.createFeedbackButton) return;
    const a = view.screen === 'home' && view.vm.sheet === 'settings' ? hits.find((h) => h.id === 'settings:feedback') : null;
    if (a) {
      if (!feedbackBtn) feedbackBtn = wx.createFeedbackButton({ type: 'text', text: '', style: { left: a.x, top: a.y, width: a.w, height: a.h, backgroundColor: '#00000000', color: '#00000000' } });
      else if (feedbackBtn.style) {
        feedbackBtn.style.left = a.x;
        feedbackBtn.style.top = a.y;
      }
      if (feedbackBtn.show) feedbackBtn.show();
    } else if (feedbackBtn && feedbackBtn.hide) feedbackBtn.hide();
  }

  function frame() {
    const now = Date.now();
    const animating = ctl.animating(now);
    if (dirty || animating || wasAnimating) {
      dirty = false;
      const view = ctl.view(now);
      const screenHits = R.draw(view.screen, ctx, view.vm, layout);
      const overlayHits = R.drawOverlay(ctx, view.overlay, layout);
      if (R.kind !== lastKind) {
        // the real renderer threw: rebuild the layout for the stub and repaint
        lastKind = R.kind;
        layout = R.makeLayout(sys());
        dirty = true;
      }
      const scrollMax = (screenHits && screenHits.scrollMax) || {};
      hits = screenHits.concat(overlayHits);
      hits.scrollMax = scrollMax;
      ctl.setScrollMax(scrollMax);
      syncFeedbackButton(view);
    }
    wasAnimating = animating;
    requestAnimationFrame(frame);
  }

  // --- touches: one finger at a time ---
  let finger = null;
  let start = null;
  let scrollId = null;
  let last = null;
  let dragging = false;
  let ruler = null; // the ruler hit area while a finger is on it

  function own(e) {
    const list = e.changedTouches || [];
    for (let i = 0; i < list.length; i++) if (list[i].identifier === finger) return list[i];
    return null;
  }

  function scrollIdAt(x, y) {
    const keys = hits.scrollMax || {};
    for (let i = hits.length - 1; i >= 0; i--) {
      const a = hits[i];
      if (keys[a.id] !== undefined && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
    }
    return null;
  }

  /** x -> 0..100 across the ruler's track (the ruler hit area's x and w ARE the track span). */
  function rulerPos(x) {
    const r = ruler;
    return Math.round(Math.max(0, Math.min(1, (x - r.x) / r.w)) * 100);
  }

  wx.onTouchStart((e) => {
    if (finger !== null && e.touches && e.touches.length > 1) return;
    const t = e.changedTouches[0];
    finger = t.identifier;
    start = { x: t.clientX, y: t.clientY };
    last = { x: t.clientX, y: t.clientY };
    dragging = false;
    ruler = null;
    const top = R.hitAt(hits, t.clientX, t.clientY);
    if (top && top.id === 'ruler') {
      ruler = top;
      ctl.onRuler(rulerPos(t.clientX), 'start');
      invalidate();
      return;
    }
    scrollId = scrollIdAt(t.clientX, t.clientY);
  });

  wx.onTouchMove &&
    wx.onTouchMove((e) => {
      const t = own(e);
      if (!t) return;
      if (ruler) {
        ctl.onRuler(rulerPos(t.clientX), 'move');
        invalidate();
        return;
      }
      if (!dragging && Math.abs(t.clientY - start.y) + Math.abs(t.clientX - start.x) > TAP_SLOP) dragging = true;
      if (dragging && scrollId) {
        ctl.onDrag(scrollId, t.clientY - last.y);
        invalidate();
      }
      last = { x: t.clientX, y: t.clientY };
    });

  wx.onTouchEnd((e) => {
    const t = own(e);
    if (!t) return;
    finger = null;
    if (ruler) {
      ctl.onRuler(rulerPos(t.clientX), 'end');
      ruler = null;
      invalidate();
      return;
    }
    if (!dragging) {
      const id = R.hitTest(hits, t.clientX, t.clientY);
      if (id) ctl.onHit(id);
    }
    invalidate();
  });

  wx.onTouchCancel((e) => {
    if (!own(e)) return;
    finger = null;
    dragging = false;
    ruler = null;
  });

  wx.onShow((opts) => {
    layout = R.makeLayout(sys());
    ctl.onShow(opts || (wx.getEnterOptionsSync && wx.getEnterOptionsSync()));
    invalidate();
  });
  wx.onHide && wx.onHide(() => ctl.onHide());

  ctl.start(wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : wx.getLaunchOptionsSync && wx.getLaunchOptionsSync());
  requestAnimationFrame(frame);
  return app;
}

const app = boot();
module.exports = app;
