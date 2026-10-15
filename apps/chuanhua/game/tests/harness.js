/**
 * Fake `wx` + canvas harness (点将台 pattern). Boots js/main under WeChat module rules against a recording
 * fake platform and drives it with touches on the hit areas the renderer returned, the way a player would.
 * Also `makeClient`: a controller on its own fake wx, sharing one mock server, for multi-player tests.
 */

const path = require('node:path');
const { createLoader } = require('./wechat-loader');

const ROOT = path.join(__dirname, '..');
const SCREEN = { windowWidth: 375, windowHeight: 812, pixelRatio: 3, statusBarHeight: 44 };
const CAPSULE = { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };

function fakeContext(log) {
  const target = {
    measureText: (s) => ({ width: Array.from(String(s)).length * 10 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText: (s) => log.text.push(String(s)),
    drawImage: () => {},
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
}

/** The fake platform. opts: { enter, storage, groupData, groupEnterFail, keyboard: false, subscribe: 'accept'|'reject'|'ban'|false } */
function makeWx(opts, log, handlers) {
  const storage = opts.storage || {};
  const call = (name, arg) => log.calls.push(name + (arg !== undefined ? ':' + JSON.stringify(arg) : ''));
  let raf = null;
  global.requestAnimationFrame = (cb) => (raf = cb);
  const wx = {
    getWindowInfo: () => ({ ...SCREEN, safeArea: { bottom: 778 }, platform: 'ios' }),
    getMenuButtonBoundingClientRect: () => CAPSULE,
    createCanvas: () => ({ width: 0, height: 0, getContext: () => fakeContext(log), toTempFilePath: (o) => o.success({ tempFilePath: 'tmp://card.png' }) }),
    createImage: () => ({}),
    createInnerAudioContext: () => ({ play: () => call('audio.play'), stop() {} }),
    vibrateShort: () => call('vibrateShort'),
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => {
      storage[k] = v;
      log.storageWrites++;
    },
    onTouchStart: (f) => (handlers.start = f),
    onTouchMove: (f) => (handlers.move = f),
    onTouchEnd: (f) => (handlers.end = f),
    onTouchCancel: (f) => (handlers.cancel = f),
    onShow: (f) => (handlers.show = f),
    onHide: (f) => (handlers.hide = f),
    getEnterOptionsSync: () => opts.enter || { scene: 1001, query: {} },
    showShareMenu: (o) => log.menu.push(['showShareMenu', o]),
    updateShareMenu: (o) => log.menu.push(['updateShareMenu', o]),
    onShareAppMessage: (f) => (handlers.shareMenu = f),
    shareAppMessage: (o) => log.shares.push(o),
    getGroupEnterInfo: (o) => {
      call('getGroupEnterInfo');
      if (opts.groupEnterFail) return o.fail({ errno: opts.groupEnterFail });
      o.success({ cloudID: 'cloud-1', encryptedData: 'x', iv: 'y' });
    },
    cloud: { CloudID: (id) => ({ mockData: opts.groupData || { opengid: 'G1', chat_type: 3 }, id }) },
    openPrivacyContract: () => call('openPrivacyContract'),
    showModal: (o) => {
      call('showModal');
      log.modals.push(o);
      if (o.success) o.success({ confirm: true, content: opts.modalInput || '' });
    },
    requestSubscribeMessage: (o) => {
      call('requestSubscribeMessage', o.tmplIds);
      const v = opts.subscribe || 'accept';
      const r = {};
      r[o.tmplIds[0]] = v;
      o.success(r);
    },
    createRewardedVideoAd: (o) => {
      log.ads.push(['rewarded', o]);
      return { onClose() {}, onError() {}, onLoad() {}, show: () => Promise.resolve(), load: () => Promise.resolve() };
    },
    createInterstitialAd: (o) => {
      log.ads.push(['interstitial', o]);
      return { show: () => Promise.resolve() };
    },
    createFeedbackButton: () => ({ show() {}, hide() {}, style: {} }),
  };
  if (opts.keyboard !== false) {
    wx.showKeyboard = (o) => {
      call('showKeyboard');
      log.keyboardOpens.push(o);
    };
    wx.hideKeyboard = () => call('hideKeyboard');
    wx.onKeyboardInput = (f) => (handlers.kbInput = f);
    wx.offKeyboardInput = () => (handlers.kbInput = null);
    wx.onKeyboardConfirm = (f) => (handlers.kbConfirm = f);
    wx.offKeyboardConfirm = () => (handlers.kbConfirm = null);
    wx.onKeyboardComplete = (f) => (handlers.kbComplete = f);
    wx.offKeyboardComplete = () => {};
  }
  return { wx, storage, raf: () => raf };
}

function newLog() {
  return { text: [], calls: [], storageWrites: 0, shares: [], ads: [], menu: [], console: [], modals: [], keyboardOpens: [] };
}

/**
 * opts: { enter, storage, now, groupData, ... } -> g with .app, .log, .tapId(), .draw(), .type() ...
 */
/** A controllable clock for the test (setTimeout, setInterval, Date). Idempotent per test. */
function enableClock(t, now) {
  if (!t.__timers) {
    t.__timers = true;
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: now || Date.UTC(2026, 10, 20, 4, 0, 0) });
  }
}

function boot(t, opts) {
  opts = opts || {};
  enableClock(t, opts.now);
  const log = newLog();
  const handlers = {};
  const plat = makeWx(opts, log, handlers);
  const wx = plat.wx;
  global.wx = wx;
  t.mock.method(console, 'log', (...a) => log.console.push(a.join(' ')));

  const app = createLoader(ROOT).require(path.join(ROOT, 'game.js'), './js/main');
  t.after(() => {
    delete global.wx;
    delete global.requestAnimationFrame;
  });
  let nextId = 1;

  const g = {
    app,
    log,
    wx,
    handlers,
    storage: plat.storage,
    srv: app.api.mock,
    frame() {
      log.text = [];
      plat.raf()();
      return log.text.join('');
    },
    down(x, y) {
      const id = nextId++;
      const touch = { identifier: id, clientX: x, clientY: y };
      handlers.start({ touches: [touch], changedTouches: [touch] });
      return id;
    },
    move(id, x, y) {
      handlers.move({ touches: [{ identifier: id, clientX: x, clientY: y }], changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
    },
    up(id, x, y) {
      handlers.end({ touches: [], changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
    },
    tap(x, y) {
      g.up(g.down(x, y), x, y);
    },
    hit(idOrFn) {
      g.frame();
      const test = typeof idOrFn === 'function' ? idOrFn : (h) => h.id === idOrFn;
      return app.hits.slice().reverse().find(test);
    },
    /** Redraw, find a hit by id (or predicate), tap its centre. Returns the id tapped. */
    tapId(idOrFn) {
      let hit = g.hit(idOrFn);
      // a hit scrolled out of view is not emitted by the renderers: drag the scroll area like a finger would
      for (let i = 0; !hit && i < 80 && g.scrollStep(); i++) hit = g.hit(idOrFn);
      if (!hit) throw new Error('no hit ' + idOrFn + ' among ' + app.hits.map((h) => h.id).join(','));
      g.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
      return hit.id;
    },
    /** Drag the main scroll area (or the open sheet's) one step down; false when already at the end. */
    scrollStep() {
      const max = app.hits.scrollMax || {};
      const sid = max['sheet:scroll'] !== undefined ? 'sheet:scroll' : Object.keys(max).filter((k) => k !== 'sheet:scroll')[0];
      if (!sid) return false;
      const cur = app.ctl.state.ui.scroll[sid] || 0;
      if (cur >= max[sid]) return false;
      app.ctl.onDrag(sid, -120);
      return true;
    },
    scrollTop() {
      app.ctl.state.ui.scroll = {};
    },
    ids() {
      g.frame();
      return app.hits.map((h) => h.id);
    },
    has(id) {
      return g.ids().indexOf(id) >= 0;
    },
    /** Draw a stroke with one finger across the canvas (fractions 0..1 of its rect). */
    stroke(fx0, fy0, fx1, fy1, steps) {
      const cv = g.hit('draw:canvas');
      if (!cv) throw new Error('no draw:canvas');
      const px = (f) => cv.x + f * cv.w;
      const py = (f) => cv.y + f * cv.h;
      const id = g.down(px(fx0), py(fy0));
      const n = steps || 8;
      for (let i = 1; i <= n; i++) g.move(id, px(fx0 + ((fx1 - fx0) * i) / n), py(fy0 + ((fy1 - fy0) * i) / n));
      g.up(id, px(fx1), py(fy1));
    },
    /** Draw `n` separate short strokes. */
    strokes(n) {
      for (let i = 0; i < n; i++) g.stroke(0.1 + (i % 8) * 0.1, 0.1 + Math.floor(i / 8) * 0.1, 0.15 + (i % 8) * 0.1, 0.2 + Math.floor(i / 8) * 0.1, 3);
    },
    /** Type into the platform keyboard. */
    type(value) {
      if (!handlers.kbInput) throw new Error('keyboard not open');
      handlers.kbInput({ value });
    },
    confirmKeyboard(value) {
      handlers.kbConfirm && handlers.kbConfirm({ value });
    },
    wait(ms) {
      t.mock.timers.tick(ms);
    },
    async settle() {
      for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
    },
    show(options) {
      handlers.show(options);
    },
    hide() {
      handlers.hide();
    },
    text() {
      return g.frame();
    },
    view() {
      return app.ctl.view(Date.now());
    },
  };
  return g;
}

/**
 * A second (or third) client for multi-player tests: its own fake wx, store, controller, on a shared mock server.
 * Returns { ctl, api, store, wx, log, view(), hitIds(), ... }.
 */
function makeClient(t, srv, openid, opts) {
  opts = opts || {};
  const { createStore } = require('../js/store');
  const { createApi } = require('../js/api');
  const { createAnalytics } = require('../js/analytics');
  const { createAds } = require('../js/ads');
  const { createShare } = require('../js/share');
  const { createPrivacy } = require('../js/privacy');
  const { createKeyboard } = require('../js/keyboard');
  const { createAudio } = require('../js/audio');
  const { createController } = require('../js/controller');
  const R = require('../js/renderers').loadRenderers();
  const { CONFIG } = require('../core/config');
  const log = newLog();
  const handlers = {};
  const prev = global.requestAnimationFrame;
  const plat = makeWx(Object.assign({}, opts), log, handlers);
  global.requestAnimationFrame = prev;
  const wx = plat.wx;
  const store = createStore(wx);
  const api = createApi({ wx, mode: 'mock', mockServer: srv, openid });
  const analytics = createAnalytics({ wx, api, store, config: CONFIG, promptsVersion: 1 });
  const ads = createAds({ wx, config: CONFIG, store, analytics, adUnits: {}, stub: { enabled: true }, onChange() {} });
  const share = createShare({ wx, api, analytics });
  const privacy = createPrivacy({ wx, store, analytics });
  const keyboard = createKeyboard(wx);
  const audio = createAudio(wx, false);
  const layout = R.makeLayout({ ...SCREEN, safeArea: { bottom: 778 }, menuRect: CAPSULE });
  const ctl = createController({ wx, api, store, analytics, ads, share, privacy, keyboard, audio, config: CONFIG, invalidate() {}, getLayout: () => layout });
  const c = {
    openid,
    ctl,
    api,
    store,
    wx,
    log,
    handlers,
    ads,
    analytics,
    storage: plat.storage,
    layout,
    hits: [],
    frame() {
      const view = ctl.view(Date.now());
      const ctx = fakeContext(log);
      log.text = [];
      const screenHits = R.draw(view.screen, ctx, view.vm, layout);
      const hits = screenHits.concat(R.drawOverlay(ctx, view.overlay, layout));
      hits.scrollMax = screenHits.scrollMax || {};
      c.hits = hits;
      ctl.setHits(hits);
      ctl.setScrollMax(hits.scrollMax);
      return view;
    },
    ids() {
      c.frame();
      return c.hits.map((h) => h.id);
    },
    tapId(id) {
      c.frame();
      let h = c.hits.slice().reverse().find((x) => x.id === id);
      for (let i = 0; !h && i < 80; i++) {
        const sid = Object.keys(c.hits.scrollMax)[0];
        if (!sid || (ctl.state.ui.scroll[sid] || 0) >= c.hits.scrollMax[sid]) break;
        ctl.onDrag(sid, -120);
        c.frame();
        h = c.hits.slice().reverse().find((x) => x.id === id);
      }
      if (!h) throw new Error('no hit ' + id + ' among ' + c.hits.map((x) => x.id).join(','));
      ctl.onHit(h.id);
      return h.id;
    },
    stroke(fx0, fy0, fx1, fy1) {
      c.frame();
      const cv = c.hits.find((h) => h.id === 'draw:canvas');
      const px = (f) => cv.x + f * cv.w;
      const py = (f) => cv.y + f * cv.h;
      ctl.onPointer('down', 1, px(fx0), py(fy0));
      for (let i = 1; i <= 4; i++) ctl.onPointer('move', 1, px(fx0 + ((fx1 - fx0) * i) / 4), py(fy0 + ((fy1 - fy0) * i) / 4));
      ctl.onPointer('up', 1, px(fx1), py(fy1));
    },
    strokes(n) {
      for (let i = 0; i < n; i++) c.stroke(0.1 + (i % 8) * 0.1, 0.1 + Math.floor(i / 8) * 0.1, 0.15 + (i % 8) * 0.1, 0.2 + Math.floor(i / 8) * 0.1);
    },
    type(v) {
      handlers.kbInput({ value: v });
    },
    async settle() {
      for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
    },
    view() {
      return ctl.view(Date.now());
    },
    screen() {
      return ctl.view(Date.now()).screen;
    },
  };
  return c;
}

module.exports = { boot, makeClient, enableClock, SCREEN, CAPSULE, ROOT };
