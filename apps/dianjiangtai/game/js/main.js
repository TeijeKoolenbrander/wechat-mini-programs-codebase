/**
 * Boot: canvas, render loop (repaints only when something changed or moves),
 * single-finger touch routing, lifecycle. All game logic lives in
 * js/controller.js; this file only wires the platform to it.
 */

const { createStore } = require('./store');
const { createApi } = require('./api');
const { createAnalytics } = require('./analytics');
const { createAds } = require('./ads');
const { createShare } = require('./share');
const { createPrivacy } = require('./privacy');
const { createSubscribe } = require('./subscribe');
const { createAlbum } = require('./album');
const { createOdc } = require('./odc');
const { createAudio } = require('./audio');
const { createController } = require('./controller');
const { loadRenderers } = require('./renderers');
const build = require('./build-config');
const { getConfig, LATEST_CONFIG_VERSION } = require('../core/config');
const { getContent, LATEST_CONTENT_VERSION } = require('../core/content');

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
  const R = loadRenderers();
  const info = windowInfo();
  const dpr = info.pixelRatio || 1;

  // the first wx.createCanvas() is the screen
  const canvas = wx.createCanvas();
  canvas.width = Math.round(info.windowWidth * dpr);
  canvas.height = Math.round(info.windowHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // display settings (spec 8.10) travel to the renderer in the layout info as well as in every vm
  let displayNow = () => ({ largeText: false, highContrast: false, scale: 1, palette: 'standard' });
  const sys = () => {
    const w = windowInfo();
    return { windowWidth: w.windowWidth, windowHeight: w.windowHeight, pixelRatio: w.pixelRatio || 1, statusBarHeight: w.statusBarHeight, safeArea: w.safeArea, menuRect: menuRect(), display: displayNow() };
  };
  let layout = R.makeLayout(sys());

  const config = getConfig(LATEST_CONFIG_VERSION);
  const content = getContent(LATEST_CONTENT_VERSION);
  const store = createStore(wx);
  let dirty = true;
  let wasAnimating = false;
  const invalidate = () => {
    dirty = true;
  };

  const api = createApi({ wx, mode: build.cloudEnv ? 'cloud' : 'mock', env: build.cloudEnv });
  const analytics = createAnalytics({ wx, api, store, config, contentVersion: content.contentVersion, appVersion: build.appVersion, platform: info.platform, setInterval, clearInterval });
  const ads = createAds({ wx, config, store, analytics, adUnits: build.adUnits, stub: { enabled: build.stubAds }, onChange: invalidate });
  const share = createShare({ wx, api, analytics });
  const privacy = createPrivacy({ wx, store, analytics });
  const subscribe = createSubscribe({ wx, api, store, analytics });
  const album = createAlbum({ wx, share, analytics });
  displayNow = () => {
    const d = store.state.display || {};
    return { largeText: !!d.largeText, highContrast: !!d.highContrast, scale: d.largeText ? 1.25 : 1, palette: d.highContrast ? 'highContrast' : 'standard' };
  };
  const odc = createOdc(wx);
  const audio = createAudio(wx, store.state.muted);

  if (R.shareCard) {
    // always the standard look, whatever the display mode: one consistent card for a group (spec 8.10)
    share.cardRenderer = (card, opts) =>
      new Promise((resolve) => {
        try {
          const cv = wx.createCanvas();
          R.shareCard.render(cv, card, { pixelScale: (opts && opts.pixelScale) || 1 });
          cv.toTempFilePath({ success: (r) => resolve(r.tempFilePath), fail: () => resolve(null) });
        } catch (e) {
          resolve(null);
        }
      });
  }

  const ctl = createController({
    wx, api, store, analytics, ads, share, privacy, odc, audio, config, content, invalidate, subscribe, album, build,
    getLayout: () => layout,
    boardRect: R.boardRect,
    bannerRect: R.bannerRect,
    relayout: () => {
      layout = R.makeLayout(sys());
    },
  });
  const app = { ctl, api, ads, analytics, share, privacy, odc, store, renderer: R, invalidate, get layout() { return layout; }, get hits() { return hits; } };

  // --- frame loop ---
  let hits = [];
  let feedbackBtn = null;

  function syncFeedbackButton(view) {
    const a = view.screen === 'home' && view.vm.sheet === 'settings' ? hits.find((h) => h.id === 'settings:feedback') : null;
    if (!wx.createFeedbackButton) return;
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

  wx.onTouchStart((e) => {
    if (finger !== null) {
      if (e.touches && e.touches.length > 1) return;
    }
    const t = e.changedTouches[0];
    finger = t.identifier;
    start = { x: t.clientX, y: t.clientY };
    last = { x: t.clientX, y: t.clientY };
    scrollId = scrollIdAt(t.clientX, t.clientY);
    dragging = false;
  });

  wx.onTouchMove &&
    wx.onTouchMove((e) => {
      const t = own(e);
      if (!t) return;
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
