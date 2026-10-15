/**
 * Boot: canvas, render loop (repaints only when something changed or moves), single-finger touch routing
 * (a finger that starts on the drawing canvas draws; every other finger is a tap or a scroll), lifecycle.
 * All game logic lives in js/controller.js; this file only wires the platform to it.
 */

const { createStore } = require('./store');
const { createApi } = require('./api');
const { createAnalytics } = require('./analytics');
const { createAds } = require('./ads');
const { createShare } = require('./share');
const { createPrivacy } = require('./privacy');
const { createKeyboard } = require('./keyboard');
const { createAudio } = require('./audio');
const { createController } = require('./controller');
const { loadRenderers } = require('./renderers');
const build = require('./build-config');
const { CONFIG } = require('../core/config');

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

  const store = createStore(wx);
  let dirty = true;
  let wasAnimating = false;
  const invalidate = () => {
    dirty = true;
  };

  const api = createApi({ wx, mode: build.cloudEnv ? 'cloud' : 'mock', env: build.cloudEnv });
  const analytics = createAnalytics({ wx, api, store, config: CONFIG, promptsVersion: CONFIG.promptsVersion, appVersion: build.appVersion, platform: info.platform, setInterval, clearInterval });
  const ads = createAds({ wx, config: CONFIG, store, analytics, adUnits: build.adUnits, stub: { enabled: build.stubAds }, onChange: invalidate });
  const share = createShare({ wx, api, analytics });
  const privacy = createPrivacy({ wx, store, analytics });
  const keyboard = createKeyboard(wx);
  const audio = createAudio(wx, store.state.muted);

  if (R.shareCard) {
    share.cardRenderer = (card) =>
      new Promise((resolve) => {
        try {
          const cv = wx.createCanvas();
          R.shareCard.render(cv, card, { pixelScale: 1 });
          cv.toTempFilePath({ success: (r) => resolve(r.tempFilePath), fail: () => resolve(null) });
        } catch (e) {
          resolve(null);
        }
      });
  }

  const ctl = createController({ wx, api, store, analytics, ads, share, privacy, keyboard, audio, config: CONFIG, invalidate, getLayout: () => layout });
  const app = { ctl, api, ads, analytics, share, privacy, keyboard, store, renderer: R, invalidate, get layout() { return layout; }, get hits() { return hits; } };

  // --- frame loop ---
  let hits = [];
  let feedbackBtn = null;

  function syncFeedbackButton(view) {
    if (!wx.createFeedbackButton) return;
    const a = view.screen === 'settings' && !view.overlay.sheet ? hits.find((h) => h.id === 'settings:feedback') : null;
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
      ctl.setHits(hits);
      syncFeedbackButton(view);
    }
    wasAnimating = animating;
    requestAnimationFrame(frame);
  }

  // --- touches: one finger at a time ---
  let finger = null;
  let mode = null; // 'draw' | 'tap'
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
      if (e.touches && e.touches.length > 1) return; // a second finger is ignored
      finger = null; // a stale finger (a missed touchend)
    }
    const t = e.changedTouches[0];
    finger = t.identifier;
    start = { x: t.clientX, y: t.clientY };
    last = { x: t.clientX, y: t.clientY };
    dragging = false;
    if (ctl.wantsPointer(t.clientX, t.clientY)) {
      mode = 'draw';
      ctl.onPointer('down', finger, t.clientX, t.clientY);
      return;
    }
    mode = 'tap';
    scrollId = scrollIdAt(t.clientX, t.clientY);
  });

  wx.onTouchMove &&
    wx.onTouchMove((e) => {
      const t = own(e);
      if (!t) return;
      if (mode === 'draw') {
        ctl.onPointer('move', finger, t.clientX, t.clientY);
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
    if (mode === 'draw') {
      ctl.onPointer('up', id, t.clientX, t.clientY);
      mode = null;
      invalidate();
      return;
    }
    mode = null;
    if (!dragging) {
      const hit = R.hitTest(hits, t.clientX, t.clientY);
      if (hit) ctl.onHit(hit);
    }
    invalidate();
  });

  wx.onTouchCancel((e) => {
    const t = own(e);
    if (!t) return;
    if (mode === 'draw') ctl.onPointer('cancel', finger, t.clientX, t.clientY);
    finger = null;
    mode = null;
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
