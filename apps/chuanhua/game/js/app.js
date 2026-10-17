/**
 * App wiring: platform (canvas, layout, touches, frame loop, lifecycle) around the controller. main.js is the only file that
 * touches the global `wx` event registration; everything here takes `wx` as a dependency, so the headless tests can run
 * several players (each with its own fake wx, all on one mock server and one virtual clock).
 *
 *   const app = createApp({ wx, now?, mockServer?, user?, build?, setInterval?, setTimeout?, clearTimeout?, timers?, forceStub?, mockTick? })
 *   app.start(enterOptions) -> Promise      app.frame() draws if something changed     app.input.touchStart(e) ...
 *   app.onShow(options) / app.onHide()      app.hits (last frame)                       app.ctl / app.api / app.ads ...
 *
 * Touch routing (render/CONTRACT.md "Drawing canvas input contract", copied from 点将台): ONE finger at a time. A touch that
 * starts on `draw:canvas` is a stroke (kept drawing even outside the rect, points clamp to the edge); a touch that starts
 * outside never draws; a second finger is ignored while the first is down. Everything else is tap or scroll.
 */

const { createStore } = require('./store');
const { createApi } = require('./api');
const { createAnalytics } = require('./analytics');
const { createAds } = require('./ads');
const { createShare } = require('./share');
const { createPrivacy } = require('./privacy');
const { createSubscribe } = require('./subscribe');
const { createKeyboard } = require('./keyboard');
const { createAudio } = require('./audio');
const { createController } = require('./controller');
const { loadRenderers } = require('./renderers');
const strokesLib = require('../core/strokes');
const buildDefault = require('./build-config');

const TAP_SLOP = 10;
const SWIPE_PX = 48; // step-through: a horizontal move of >= 48 pt that starts on the note area is a swipe (8.9)
const MOCK_TICK_MS = 2000;
/** properties of a screen's hit-area array that are not hit areas (render/CONTRACT.md conventions) */
const HIT_EXTRAS = ['scrollMax', 'canvas', 'gridH', 'paper', 'geometry', 'drawing', 'input', 'swipe', 'note', 'mineRect', 'rects'];

function windowInfo(wx) {
  if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo();
  return wx.getSystemInfoSync();
}

function menuRect(wx) {
  try {
    const m = wx.getMenuButtonBoundingClientRect();
    if (m && m.bottom > 0) return m;
  } catch (e) {
    /* no capsule rect: the renderer falls back to the iOS default */
  }
  return null;
}

function createApp(deps) {
  const wx = deps.wx;
  const build0 = deps.build || buildDefault;
  // QA-2: a cloud build is always prod with real ads, whatever the other fields say
  const build = build0.cloudEnv ? Object.assign({}, build0, { envKind: 'prod', stubAds: false }) : build0;
  const now = deps.now || (() => Date.now());
  const R = loadRenderers({ forceStub: deps.forceStub, cloudEnv: build.cloudEnv });
  const info = windowInfo(wx);
  const dpr = info.pixelRatio || 1;

  // the first wx.createCanvas() is the screen
  const canvas = wx.createCanvas();
  canvas.width = Math.round(info.windowWidth * dpr);
  canvas.height = Math.round(info.windowHeight * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx.scale) ctx.scale(dpr, dpr);
  // finished strokes are cached in an offscreen canvas (60 fps with many strokes, AC 32): render/strokes.js asks for (w, h)
  if (R.strokes && R.strokes.setCanvasFactory && wx.createCanvas) {
    R.strokes.setCanvasFactory((w, h) => {
      const cv = wx.createCanvas();
      cv.width = w;
      cv.height = h;
      return cv;
    });
  }

  const store = createStore(wx);
  let displayNow = () => ({ largeText: false, highContrast: false });
  const sys = () => {
    const w = windowInfo(wx);
    return { windowWidth: w.windowWidth, windowHeight: w.windowHeight, pixelRatio: w.pixelRatio || 1, statusBarHeight: w.statusBarHeight, safeArea: w.safeArea, menuRect: menuRect(wx), display: displayNow() };
  };
  let layout = R.makeLayout(sys());
  displayNow = () => {
    const d = store.state.display || {};
    return { largeText: !!d.largeText, highContrast: !!d.highContrast, scale: d.largeText ? 1.25 : 1, palette: d.highContrast ? 'highContrast' : 'standard' };
  };

  let dirty = true;
  let wasAnimating = false;
  const invalidate = () => {
    dirty = true;
  };

  const api = createApi({
    wx, now, cloudEnv: build.cloudEnv, fnPrefix: build.fnPrefix, envKind: build.envKind, mockServer: deps.mockServer, user: deps.user, mockMediaDelaySec: build.mockMediaDelaySec,
  });
  const analytics = createAnalytics({ wx, api, store, now, appVersion: build.appVersion, setInterval: deps.setInterval, clearInterval: deps.clearInterval });
  const ads = createAds({ wx, store, analytics, now, adUnits: build.adUnits, stub: { enabled: !!build.stubAds }, onChange: invalidate, offset: () => (ctl ? ctl.state.offset : 0) });
  const share = createShare({ wx, api, analytics });
  const privacy = createPrivacy({ wx, analytics });
  const subscribe = createSubscribe({ wx, api, store, analytics });
  const keyboard = createKeyboard(wx);
  const audio = createAudio(wx, store.state.muted);

  if (R.shareCard && R.shareCard.render) {
    // always the standard look, whatever the display mode (render/CONTRACT.md shareCard); no user drawings, ever (PO-24)
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

  // the draw screen's pure geometry (render/CONTRACT.md): the controller freezes the canvas rect and `h` at turn open (AC 126)
  const geometry = {
    draw(source, unlocked) {
      if (R.canvasRectFor) return R.canvasRectFor(ctx, layout, displayNow(), source, unlocked);
      // no real renderer (a dev stub): the free space between the bar and the tool rows, clamped like the real one (core/strokes.canvasFit)
      const top = (layout.navBottom || 64) + 48 + 48;
      const free = { x: 8, y: top, w: layout.W - 16, h: Math.max(96, (layout.bottomEdge || layout.H) - 8 - 48 - 8 - 48 - 8 - top) };
      const fit = strokesLib.canvasFit(free);
      return { x: fit.x, y: fit.y, w: fit.w, h: fit.h, gridH: fit.gridH, sourceLines: 1 };
    },
  };

  // the realtime timers (polls, the roomTick plan): injectable so the headless tests drive them with a virtual clock
  const timers = deps.timers || { setTimeout: deps.setTimeout || setTimeout, clearTimeout: deps.clearTimeout || clearTimeout };
  const ctl = createController({
    wx, api, store, analytics, ads, share, privacy, subscribe, keyboard, audio, build, now, invalidate, geometry, timers,
    realtimeEnv: () => api.realtimeEnv(),
    getLayout: () => layout,
    bannerRect: R.bannerRect,
    relayout: () => {
      layout = R.makeLayout(sys());
    },
    setTimeout: deps.setTimeout,
  });

  let hits = [];
  let feedbackBtn = null;

  const app = {
    ctl, api, ads, analytics, share, privacy, subscribe, keyboard, store, renderer: R, invalidate, canvas, ctx,
    get layout() {
      return layout;
    },
    get hits() {
      return hits;
    },
  };

  /** the native feedback button sits over the settings row (render/CONTRACT.md settings) */
  function syncFeedbackButton(view) {
    if (!wx.createFeedbackButton) return;
    const a = view.screen === 'home' && view.vm.sheet === 'settings' ? hits.find((h) => h.id === 'settings:feedback') : null;
    try {
      if (a) {
        if (!feedbackBtn) feedbackBtn = wx.createFeedbackButton({ type: 'text', text: '', style: { left: a.x, top: a.y, width: a.w, height: a.h, backgroundColor: '#00000000', color: '#00000000' } });
        else if (feedbackBtn.style) {
          feedbackBtn.style.left = a.x;
          feedbackBtn.style.top = a.y;
        }
        if (feedbackBtn.show) feedbackBtn.show();
      } else if (feedbackBtn && feedbackBtn.hide) feedbackBtn.hide();
    } catch (e) {
      /* the feedback button is optional */
    }
  }

  /** Draws when something changed or moves. Returns true if it drew. */
  app.frame = function () {
    const t = now();
    const animating = ctl.animating(t);
    if (!(dirty || animating || wasAnimating)) {
      ctl.tick(t); // time-driven transitions (timers, polls) still run on a still screen; they invalidate when needed
      if (!dirty) return false;
    }
    dirty = false;
    const view = ctl.view(t);
    const base = R.draw(view.screen, ctx, view.vm, layout) || [];
    let h = base;
    for (const layer of view.layers) h = h.concat(R.draw(layer.screen, ctx, layer.vm, layout) || []);
    h = h.concat(R.drawOverlay(ctx, view.overlay, layout) || []);
    // the extras of the screen's own result (scroll limits, the exact paper rect, the swipe region) survive the concatenation
    for (const k of HIT_EXTRAS) if (base[k] !== undefined) h[k] = base[k];
    if (!h.scrollMax) h.scrollMax = {};
    hits = h;
    ctl.setHits(hits);
    syncFeedbackButton(view);
    wasAnimating = animating;
    return true;
  };

  // ------------------------------------------------------------------------------------------------ touches

  let finger = null;
  let startPt = null;
  let lastPt = null;
  let mode = null; // 'draw' | 'tap'
  let scrollId = null;
  let dragging = false;
  let swipeStart = false;

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

  app.input = {
    touchStart(e) {
      if (finger !== null && e.touches && e.touches.length > 1) return; // a second finger is ignored while the first is down
      const t = e.changedTouches[0];
      if (mode === 'draw') ctl.strokeEnd(); // a stale stroke (missed touchend) is closed
      finger = t.identifier;
      startPt = { x: t.clientX, y: t.clientY };
      lastPt = { x: t.clientX, y: t.clientY };
      dragging = false;
      scrollId = null;
      swipeStart = !!(hits.swipe && t.clientX >= hits.swipe.x && t.clientX <= hits.swipe.x + hits.swipe.w && t.clientY >= hits.swipe.y && t.clientY <= hits.swipe.y + hits.swipe.h);
      mode = 'tap';
      // the topmost area under the finger decides: a sheet or dialog over the canvas keeps the stroke from starting
      const top = R.hitTest(hits, t.clientX, t.clientY);
      if (top === 'draw:canvas' && ctl.strokeBegin(t.clientX, t.clientY)) mode = 'draw';
      else scrollId = scrollIdAt(t.clientX, t.clientY);
    },
    touchMove(e) {
      const t = own(e);
      if (!t) return;
      if (mode === 'draw') {
        ctl.strokeMove(t.clientX, t.clientY);
        lastPt = { x: t.clientX, y: t.clientY };
        return;
      }
      if (!dragging && Math.abs(t.clientY - startPt.y) + Math.abs(t.clientX - startPt.x) > TAP_SLOP) dragging = true;
      if (dragging && scrollId) ctl.onDrag(scrollId, t.clientY - lastPt.y);
      lastPt = { x: t.clientX, y: t.clientY };
    },
    touchEnd(e) {
      const t = own(e);
      if (!t) return;
      finger = null;
      if (mode === 'draw') {
        ctl.strokeEnd();
        mode = null;
        return;
      }
      mode = null;
      if (!dragging) {
        const id = R.hitTest(hits, t.clientX, t.clientY);
        if (id) ctl.onHit(id);
      } else if (swipeStart) {
        // a horizontal move of >= 48 pt that started on the note, more horizontal than vertical: right = earlier, left = later
        const dx = t.clientX - startPt.x;
        const dy = t.clientY - startPt.y;
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) ctl.onSwipe(dx > 0 ? 'prev' : 'next');
      }
      swipeStart = false;
      invalidate();
    },
    touchCancel(e) {
      if (!own(e)) return;
      finger = null;
      dragging = false;
      if (mode === 'draw') ctl.strokeEnd();
      mode = null;
    },
  };

  app.onShow = function (opts) {
    layout = R.makeLayout(sys());
    ctl.onShow(opts || (wx.getEnterOptionsSync && wx.getEnterOptionsSync()));
    invalidate();
  };
  app.onHide = function () {
    ctl.onHide();
  };

  /** cold start: first paint is the home skeleton; resolves when home data and any card entry have loaded */
  app.start = function (enter) {
    const opts = enter || (wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : wx.getLaunchOptionsSync && wx.getLaunchOptionsSync()) || {};
    if (api.mode === 'mock' && deps.mockTick !== false && deps.setInterval) {
      deps.setInterval(() => api.tickMock(), MOCK_TICK_MS); // dev only: the in-memory mock delivers its moderation verdicts
    }
    return ctl.start(opts);
  };

  return app;
}

module.exports = { createApp };
