/**
 * Boot: canvas, render loop (repaints only when something changed or moves), touch routing (one finger at a time;
 * the ruler band gets raw touches through the controller), lifecycle. All game logic lives in js/controller.js and
 * js/flows/*; this file only wires the platform to it. With `build-config.cloudEnv` empty the in-memory mock server
 * is used (lazily required, js/api.js), so the game boots in DevTools with no backend. A release build sets cloudEnv
 * and never loads the mock or the stub renderer (game/RELEASE.md).
 */

const { createStore } = require('./store');
const { createApi } = require('./api');
const { createAnalytics } = require('./analytics');
const { createAds } = require('./ads');
const { createShare } = require('./share');
const { createPrivacy } = require('./privacy');
const { createSubscribe } = require('./subscribe');
const { createOdc } = require('./odc');
const { createAudio } = require('./audio');
const { createController } = require('./controller');
const { loadRenderers } = require('./renderers');
const build = require('./build-config');
const { CONFIG } = require('../core/config');
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
    /* no capsule rect: the renderer falls back to the iOS default */
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

  const sys = () => {
    const w = windowInfo();
    return { windowWidth: w.windowWidth, windowHeight: w.windowHeight, pixelRatio: w.pixelRatio || 1, statusBarHeight: w.statusBarHeight, safeArea: w.safeArea, menuRect: menuRect() };
  };
  let layout = R.makeLayout(sys());

  const content = getContent(); // latest contentVersion; never hard-coded here
  const store = createStore(wx);
  let dirty = true;
  let wasAnimating = false;
  const invalidate = () => {
    dirty = true;
  };

  const api = createApi(build.cloudEnv ? { wx, mode: 'cloud', env: build.cloudEnv, fnPrefix: build.fnPrefix } : { wx, mode: 'mock' });
  const analytics = createAnalytics({ wx, api, store, config: CONFIG, contentVersion: content.contentVersion, appVersion: build.appVersion, setInterval, clearInterval });
  const ads = createAds({ wx, store, analytics, adUnits: build.adUnits, stub: { enabled: build.stubAds }, onChange: invalidate });
  const share = createShare({ wx, api, analytics });
  const privacy = createPrivacy({ wx, store, analytics });
  const subscribe = createSubscribe({ wx, api, store, analytics });
  const odc = createOdc(wx);
  const audio = createAudio(wx, store.state.muted);

  if (R.shareCard) {
    // always the standard look, whatever the display mode (spec 6.11); models come from core/entry.js
    share.cardRenderer = (model) =>
      new Promise((resolve) => {
        try {
          const cv = wx.createCanvas();
          R.shareCard.render(cv, model, { pixelScale: 1 });
          cv.toTempFilePath({ success: (r) => resolve(r.tempFilePath), fail: () => resolve(null) });
        } catch (e) {
          resolve(null);
        }
      });
  }

  const ctl = createController({
    wx, api, store, analytics, ads, share, privacy, subscribe, odc, audio, config: CONFIG, content, invalidate, build,
    getLayout: () => layout,
    boardRect: R.boardRect,
    bannerRect: R.bannerRect,
    listRect: R.listRect,
    relayout: () => {
      layout = R.makeLayout(sys());
    },
  });
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
      const scrollMax = (screenHits && screenHits.scrollMax) || {};
      const ruler = screenHits && screenHits.ruler;
      hits = screenHits.concat(overlayHits);
      hits.scrollMax = scrollMax;
      if (ruler) hits.ruler = ruler;
      ctl.setScrollMax(scrollMax);
      ctl.setHits(hits);
      syncFeedbackButton(view);
    }
    wasAnimating = animating;
    requestAnimationFrame(frame);
  }

  // --- touches: one finger at a time; the ruler band takes raw touches ---
  let finger = null;
  let start = null;
  let scrollId = null;
  let last = null;
  let dragging = false;
  let onRuler = false;

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
    if (finger !== null) return; // a second finger is ignored
    const t = e.changedTouches[0];
    finger = t.identifier;
    start = { x: t.clientX, y: t.clientY };
    last = { x: t.clientX, y: t.clientY };
    dragging = false;
    const id = R.hitTest(hits, t.clientX, t.clientY);
    onRuler = !!id && ctl.isRulerHit(id);
    if (onRuler) {
      ctl.onRulerStart(finger, t.clientX);
      invalidate();
      return;
    }
    scrollId = scrollIdAt(t.clientX, t.clientY);
  });

  wx.onTouchMove &&
    wx.onTouchMove((e) => {
      const t = own(e);
      if (!t) return;
      if (onRuler) {
        ctl.onRulerMove(finger, t.clientX); // even outside the band until the finger lifts
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
    const id = finger;
    finger = null;
    if (onRuler) {
      onRuler = false;
      ctl.onRulerEnd(id);
      invalidate();
      return;
    }
    if (!dragging) {
      const hit = R.hitTest(hits, t.clientX, t.clientY);
      if (hit) ctl.onHit(hit);
    }
    invalidate();
  });

  wx.onTouchCancel((e) => {
    const t = own(e);
    if (!t) return;
    if (onRuler) ctl.onRulerCancel(finger);
    onRuler = false;
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

if (typeof wx !== 'undefined') module.exports = boot();
else module.exports = { boot };
