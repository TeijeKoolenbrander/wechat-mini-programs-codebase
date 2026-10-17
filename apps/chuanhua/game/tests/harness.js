'use strict';
/**
 * Headless harness: a fake `wx` + canvas, a virtual clock and a shared mock server, so several players (each a full app:
 * controller, stub renderer, touch router) play one chain together. Players act ONLY through hit areas the renderer returned
 * (taps on their centres) and touches on the drawing canvas, the way a person would; the other side of every call is the real
 * mock server running the real core rules.
 *
 *   const w = world();                              // clock + mock server
 *   const a = await w.player('A', { rules: true }); // booted, home loaded
 *   await a.tap('home:start'); ...                  // tap a hit id
 *   await a.draw(strokes?)                          // touch a few strokes on the canvas
 *   w.advance(ms)                                   // move the virtual clock
 */

const path = require('node:path');
const { createApp } = require('../js/app');
const { createMockServer } = require('../js/mock-server');
const { createLoader } = require('./wechat-loader');

const ROOT = path.join(__dirname, '..');
const SCREEN = { windowWidth: 375, windowHeight: 812, pixelRatio: 3, statusBarHeight: 44 };
const CAPSULE = { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 12:00 BJT, a Tuesday after the daily launch date

function fakeContext(log) {
  const target = {
    measureText: (s) => ({ width: Array.from(String(s)).length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillText: (s) => log.text.push(String(s)),
    drawImage: () => {},
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
}

/** a fake wx for one player. opts: storage, enter, group, subscribe, ad, privacy, noKeyboard, noGroupInfo */
function fakeWx(opts) {
  opts = opts || {};
  const log = { text: [], calls: [], shares: [], menu: [], ads: [], storageWrites: 0, kb: [], canvases: [], feedback: 0, modals: [] };
  const storage = opts.storage || {};
  const handlers = {};
  const call = (name, arg) => log.calls.push(name + (arg !== undefined ? ':' + JSON.stringify(arg) : ''));
  const kb = { input: null, confirm: null, complete: null, open: false };
  const wx = {
    getWindowInfo: () => ({ ...SCREEN, safeArea: { bottom: 778 }, platform: 'ios' }),
    getMenuButtonBoundingClientRect: () => CAPSULE,
    createCanvas: () => {
      const cv = { width: 0, height: 0, getContext: () => fakeContext(log), toTempFilePath: (o) => o.success({ tempFilePath: 'tmp://card.png' }) };
      log.canvases.push(cv);
      return cv;
    },
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => {
      storage[k] = v;
      log.storageWrites++;
    },
    getEnterOptionsSync: () => opts.enter || { scene: 1001, query: {} },
    getAppBaseInfo: () => ({ fontSizeSetting: opts.fontSize || 16 }),
    showShareMenu: (o) => log.menu.push(['showShareMenu', o]),
    updateShareMenu: (o) => {
      log.menu.push(['updateShareMenu', { ...o }]);
      if (o.success) o.success();
    },
    onShareAppMessage: (f) => (handlers.shareMenu = f),
    shareAppMessage: (o) => log.shares.push(o),
    cloud: { CloudID: (id) => ({ cloudID: id }) },
    createRewardedVideoAd: (o) => {
      log.ads.push(['rewarded', o]);
      return { onClose() {}, onError() {}, onLoad() {}, show: () => Promise.resolve(), load: () => Promise.resolve() };
    },
    createInterstitialAd: (o) => {
      log.ads.push(['interstitial', o]);
      return { show: () => Promise.resolve() };
    },
    createBannerAd: (o) => {
      log.ads.push(['banner', o]);
      log.bannerOps = log.bannerOps || [];
      return {
        onError() {}, onLoad() {}, onResize() {}, style: {},
        show: () => (log.bannerOps.push('show'), Promise.resolve()),
        hide: () => log.bannerOps.push('hide'),
        destroy: () => log.bannerOps.push('destroy'),
      };
    },
    createFeedbackButton: () => {
      log.feedback++;
      return { show() {}, hide() {}, style: {} };
    },
    openPrivacyContract: (o) => {
      call('openPrivacyContract');
      if (opts.privacyContractFails) return o.fail({});
      o.success({});
    },
    requestSubscribeMessage: (o) => {
      call('requestSubscribeMessage', o.tmplIds);
      const s = opts.subscribe || {};
      if (s.failCode) return o.fail({ errCode: s.failCode, errMsg: 'fail' });
      o.success({ [o.tmplIds[0]]: s.result || 'accept' });
    },
    createInnerAudioContext: () => ({ play: () => call('audio.play'), stop() {} }),
  };
  if (!opts.noGroupInfo) {
    wx.getGroupEnterInfo = (o) => {
      call('getGroupEnterInfo');
      if (opts.groupEnterFail) return o.fail({ errno: opts.groupEnterFail });
      o.success({ cloudID: opts.groupCloudId || 'cloud-' + (opts.group || 'g1'), encryptedData: 'x', iv: 'y' });
    };
  }
  if (!opts.noKeyboard) {
    wx.showKeyboard = (o) => {
      log.kb.push(['show', o]);
      kb.open = true;
    };
    wx.hideKeyboard = () => {
      log.kb.push(['hide']);
      kb.open = false;
    };
    wx.onKeyboardInput = (f) => (kb.input = f);
    wx.onKeyboardConfirm = (f) => (kb.confirm = f);
    wx.onKeyboardComplete = (f) => (kb.complete = f);
    wx.onKeyboardHeightChange = (f) => (kb.height = f);
  } else {
    wx.showModal = (o) => {
      log.modals.push(o);
      if (opts.modalText !== undefined) o.success({ confirm: true, content: opts.modalText });
    };
  }
  return { wx, log, storage, handlers, kb };
}

/**
 * A virtual-clock world with one mock server. `w.t` is the clock; `w.advance(ms)`; `w.sweep(min)` advances and runs the
 * server's modSweeper (mock verdicts, expiry); players are created with `w.player(name, opts)`.
 */
function world(wopts) {
  wopts = wopts || {};
  const w = { t: wopts.t || T0, players: {} };
  w.now = () => w.t;
  w.srv = createMockServer({ now: w.now, seed: wopts.seed || 7, ...(wopts.server || {}) });
  // virtual timers (the realtime polls and the roomTick plan of js/realtime.js): they fire when the virtual clock passes them
  const queue = [];
  let timerId = 1;
  w.timers = {
    setTimeout(fn, ms) {
      const id = timerId++;
      queue.push({ id, at: w.t + Math.max(0, ms || 0), fn });
      return id;
    },
    clearTimeout(id) {
      const i = queue.findIndex((x) => x.id === id);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  w.pendingTimers = () => queue.length;
  /** move the virtual clock: due timers fire in order at their own time, then every player's controller ticks */
  w.advance = (ms) => {
    const target = w.t + ms;
    for (;;) {
      let due = null;
      for (const q of queue) if (q.at <= target && (!due || q.at < due.at || (q.at === due.at && q.id < due.id))) due = q;
      if (!due) break;
      queue.splice(queue.indexOf(due), 1);
      if (due.at > w.t) w.t = due.at;
      due.fn();
    }
    w.t = target;
    for (const p of Object.values(w.players)) p.app.ctl.tick(p.now());
  };
  /** advance in steps and let the promises settle after every step (a room playing out) */
  w.run = async (ms, step) => {
    const s = step || 500;
    for (let done = 0; done < ms; done += s) {
      w.advance(Math.min(s, ms - done));
      for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    }
  };
  w.sweep = (min) => {
    w.advance(min * 60e3);
    return w.srv.server.modSweeper();
  };
  w.id = (name) => 'openid-' + name;
  w.drawing = (k) => ({ v: 1, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });

  /** boot a player; resolves when home has loaded. opts: { rules:true (pre-agreed), enter, group, build, ...fakeWx opts } */
  w.player = async function (name, opts) {
    opts = opts || {};
    const fw = fakeWx(opts);
    const build = { ...require('./mode').DEV_BUILD, stubAds: opts.stubAds !== false, ...(opts.build || {}) }; // an explicit dev build: the suite runs in both modes
    const skew = opts.skew || 0;
    const app = createApp({ wx: fw.wx, now: () => w.t + skew, mockServer: w.srv, user: w.id(opts.as || name), build, forceStub: !!opts.stub, mockTick: false, setInterval: () => 0, clearInterval() {}, setTimeout, timers: w.timers });
    if (opts.rules) w.srv.call('agreeRules', { version: require('../core/config').CONFIG.rulesVersion }, w.id(opts.as || name));
    if (opts.howto !== false) app.store.state.howtoSeen = true;
    const p = makePlayer(w, name, app, fw);
    p.openid = w.id(opts.as || name);
    w.players[name] = p;
    p.started = app.start(opts.enter || { scene: 1001, query: {} });
    if (opts.noWait) return p;
    await p.started;
    await p.settle();
    return p;
  };
  return w;
}

function makePlayer(w, name, app, fw) {
  const p = { name, app, ctl: app.ctl, wx: fw.wx, log: fw.log, storage: fw.storage, kb: fw.kb, openid: w.id(name), now: () => app.ctl.state.now() };
  let nextTouch = 1;

  p.settle = async () => {
    for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
  };
  /** redraw now; returns all text drawn (joined) */
  p.frame = () => {
    fw.log.text = [];
    app.invalidate();
    app.frame();
    return fw.log.text.join(' | ');
  };
  p.ids = () => {
    p.frame();
    return app.hits.map((h) => h.id);
  };
  p.has = (id) => p.ids().includes(id);
  p.screen = () => app.ctl.view(p.now()).screen;
  p.vm = () => app.ctl.view(p.now()).vm;
  p.view = () => app.ctl.view(p.now());
  p.hit = (id) => {
    p.frame();
    const h = app.hits.slice().reverse().find((x) => x.id === id);
    if (!h) throw new Error(`${name}: no hit ${id} among ${app.hits.map((x) => x.id).join(',')} on ${app.ctl.view(w.t).screen}`);
    return h;
  };
  p.down = (x, y) => {
    const t = { identifier: nextTouch++, clientX: x, clientY: y };
    app.input.touchStart({ touches: [t], changedTouches: [t] });
    return t.identifier;
  };
  p.move = (id, x, y) => app.input.touchMove({ touches: [{ identifier: id, clientX: x, clientY: y }], changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
  p.up = (id, x, y) => app.input.touchEnd({ touches: [], changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
  p.tapAt = (x, y) => p.up(p.down(x, y), x, y);
  /** tap the centre of a hit id, then let promises settle */
  p.tap = async (id) => {
    const h = p.hit(id);
    p.tapAt(h.x + h.w / 2, h.y + h.h / 2);
    await p.settle();
    return id;
  };
  /** touch-draw a stroke through grid-independent px points on the canvas (relative 0..1 coordinates) */
  p.stroke = (pts) => {
    const r = p.hit('draw:canvas');
    const px = (q) => ({ x: r.x + q[0] * r.w, y: r.y + q[1] * r.h });
    const a = px(pts[0]);
    const id = p.down(a.x, a.y);
    for (let i = 1; i < pts.length; i++) {
      const b = px(pts[i]);
      p.move(id, b.x, b.y);
    }
    const e = px(pts[pts.length - 1]);
    p.up(id, e.x, e.y);
    return id;
  };
  /** n strokes, each a short diagonal line in its own place */
  p.scribble = (n) => {
    for (let i = 0; i < (n || 1); i++) {
      const y = 0.1 + ((i * 0.07) % 0.8);
      p.stroke([[0.1, y], [0.3, y + 0.05], [0.5, y], [0.7, y + 0.05]]);
    }
    p.frame();
  };
  p.type = (s) => {
    if (!fw.kb.input) throw new Error('no keyboard handler');
    fw.kb.input({ value: s });
  };
  p.confirmKeyboard = () => fw.kb.confirm && fw.kb.confirm({ value: '' });
  p.text = () => p.frame();
  p.toast = () => {
    const v = app.ctl.view(p.now()).overlay;
    return v.toast ? v.toast.text : null;
  };
  p.call = (fn, data) => w.srv.call(fn, data, p.openid);
  /** the next rooms this player enters: watch() fails `n` times (onError each) -> after two the client polls (js/realtime.js) */
  p.failWatch = (n) => {
    const orig = app.api.realtimeEnv;
    app.api.realtimeEnv = () => ({
      openid: orig().openid,
      watch: (openid, roomId, h) => {
        for (let i = 0; i < n; i++) {
          w.srv.realtime.failNext = 1;
          w.srv.realtime.watch(openid, roomId, h);
        }
        return { close() {} };
      },
    });
  };
  /** warm start / card tap */
  p.show = async (opts) => {
    app.onShow(opts);
    await p.settle();
  };
  p.menuShare = () => fw.handlers.shareMenu();
  /** the app is killed (the OS ends the process): it stops reacting to the clock; storage stays */
  p.kill = () => {
    app.onHide();
    delete w.players[name];
  };
  return p;
}

/** boot the real entry (game.js) under WeChat loading rules with a fake global wx; for the DevTools-boot tests */
function bootGame(t, opts) {
  opts = opts || {};
  if (!t.__timers) {
    t.__timers = true;
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: opts.now || T0 });
  }
  const fw = fakeWx(opts);
  const touch = {};
  let raf = null;
  global.requestAnimationFrame = (cb) => (raf = cb);
  const wx = fw.wx;
  wx.onTouchStart = (f) => (touch.start = f);
  wx.onTouchMove = (f) => (touch.move = f);
  wx.onTouchEnd = (f) => (touch.end = f);
  wx.onTouchCancel = (f) => (touch.cancel = f);
  wx.onShow = (f) => (fw.handlers.show = f);
  wx.onHide = (f) => (fw.handlers.hide = f);
  global.wx = wx;
  // the build config is injected (default: the dev build), so this boot is independent of the config file's mode
  const loader = createLoader(ROOT, { [path.join(ROOT, 'js', 'build-config.js')]: { ...require('./mode').DEV_BUILD, ...(opts.build || {}) } });
  const app = loader.require(path.join(ROOT, 'game.js'), './js/main');
  t.after(() => {
    delete global.wx;
    delete global.requestAnimationFrame;
  });
  return {
    app, loader, log: fw.log, wx, handlers: fw.handlers, touch, storage: fw.storage, kb: fw.kb,
    frame() {
      fw.log.text = [];
      app.invalidate();
      raf();
      return fw.log.text.join(' | ');
    },
    async settle() {
      for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
    },
  };
}

module.exports = { world, fakeWx, bootGame, SCREEN, CAPSULE, T0 };
