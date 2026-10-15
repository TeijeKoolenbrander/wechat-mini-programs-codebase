/**
 * Fake `wx` + canvas harness (dianjiangtai/cheatshaizi pattern). Boots js/main against a recording fake
 * platform and drives it with touches on the hit areas the renderer returned, the way a player would.
 * The stub renderer is pinned by default (`forceStub`) so tests do not depend on frontend-ui's hit geometry.
 * Several players can share one mock server: pass `mockServer` and `openid` (boot them one after another;
 * `global.wx` belongs to the app booted last).
 */

const path = require('node:path');
const { createLoader } = require('./wechat-loader');
const { createMockServer } = require('../js/mock-server');

const ROOT = path.join(__dirname, '..');
const SCREEN = { windowWidth: 375, windowHeight: 812, pixelRatio: 3, statusBarHeight: 44 };
const CAPSULE = { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
const DEFAULT_NOW = Date.UTC(2026, 10, 20, 4, 0, 0); // 2026-11-20 12:00 Beijing, issue 20 of a 2026-11-01 launch

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

/** Freeze the fake clock BEFORE creating server data in a test (boot() does it too if you have not). */
function initTime(t, now) {
  if (t.__timers) return;
  t.__timers = true;
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: now || DEFAULT_NOW });
}

/**
 * opts: { enter, storage, privacy:{state, refuse, scope, refuseScope, markerRefuse, settingTo}, groupData, groupEnterFail,
 *         mockServer, openid, population, launchDateKey, forceStub, subscribe, now, ad }
 */
function boot(t, opts) {
  opts = opts || {};
  initTime(t, opts.now);

  const log = { text: [], calls: [], storageWrites: 0, cloudWrites: [], shares: [], ads: [], menu: [], console: [], subscribe: [], banners: [] };
  const storage = opts.storage || {};
  const handlers = {};
  let raf = null;
  let nextId = 1;
  const call = (name, arg) => log.calls.push(name + (arg !== undefined ? ':' + JSON.stringify(arg) : ''));
  const p = opts.privacy || {};
  const server = opts.mockServer || createMockServer({ population: opts.population === undefined ? 40 : opts.population, launchDateKey: opts.launchDateKey || '20261101' });

  global.requestAnimationFrame = (cb) => (raf = cb);
  const wx = {
    __kdTest: { mockServer: server, openid: opts.openid, population: opts.population, launchDateKey: opts.launchDateKey, forceStub: opts.forceStub !== false, realRenderer: opts.realRenderer },
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
    // privacy and friend scope
    getPrivacySetting: (o) => o.success({ needAuthorization: p.state !== 'agreed' }),
    requirePrivacyAuthorize: (o) => {
      call('requirePrivacyAuthorize');
      if (p.refuse) o.fail({ errno: 104 });
      else {
        p.state = 'agreed';
        o.success({});
      }
    },
    getSetting: (o) => o.success({ authSetting: p.scope === undefined ? {} : { 'scope.WxFriendInteraction': p.scope } }),
    authorize: (o) => {
      call('authorize', o.scope);
      if (p.refuseScope) o.fail({ errMsg: 'refused' });
      else {
        p.scope = true;
        o.success({});
      }
    },
    openSetting: (o) => {
      call('openSetting');
      p.scope = p.settingTo === undefined ? true : p.settingTo;
      o.success({ authSetting: { 'scope.WxFriendInteraction': p.scope } });
    },
    openPrivacyContract: () => call('openPrivacyContract'),
    setUserCloudStorage: (o) => {
      call('setUserCloudStorage');
      if (p.markerRefuse) return o.fail({ errno: 104 });
      log.cloudWrites.push(o.KVDataList);
      o.success({});
    },
    removeUserCloudStorage: (o) => {
      call('removeUserCloudStorage', o.keyList);
      o.success({});
    },
    getOpenDataContext: () => ({ postMessage: (m) => (log.odc = (log.odc || []).concat([m])), canvas: { width: 0, height: 0 } }),
    getSharedCanvas: () => ({}),
    requestSubscribeMessage: (o) => {
      call('requestSubscribeMessage');
      log.subscribe.push(o.tmplIds);
      const r = opts.subscribe === undefined ? 'accept' : opts.subscribe;
      if (typeof r === 'number') return o.fail({ errCode: r });
      o.success({ [o.tmplIds[0]]: r });
    },
    createRewardedVideoAd: (o) => {
      log.ads.push(['rewarded', o]);
      return { onClose() {}, onError() {}, onLoad() {}, show: () => Promise.resolve(), load: () => Promise.resolve() };
    },
    createInterstitialAd: (o) => {
      log.ads.push(['interstitial', o]);
      return { show: () => Promise.resolve() };
    },
    createBannerAd: (o) => {
      log.banners.push(o);
      return { show() {}, hide() {}, onError() {} };
    },
    createFeedbackButton: () => ({ show() {}, hide() {}, style: {} }),
  };
  global.wx = wx;
  t.mock.method(console, 'log', (...a) => log.console.push(a.join(' ')));

  // WeChat resolution rules (.js only, relative paths, no Node built-ins), fresh module cache per boot
  const app = createLoader(ROOT).require(path.join(ROOT, 'game.js'), './js/main');
  t.after(() => {
    delete global.wx;
    delete global.requestAnimationFrame;
  });

  const g = {
    app,
    log,
    wx,
    server,
    handlers,
    storage,
    frame() {
      log.text = [];
      const cb = raf;
      cb();
      return log.text.join('\n');
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
    /** Redraw, find a hit by id (or predicate), tap its centre. Returns the id tapped. */
    tapId(idOrFn) {
      g.frame();
      const test = typeof idOrFn === 'function' ? idOrFn : (h) => h.id === idOrFn;
      const hit = app.hits.slice().reverse().find(test);
      if (!hit) throw new Error('no hit ' + idOrFn + ' among ' + app.hits.map((h) => h.id).join(','));
      g.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
      return hit.id;
    },
    ids() {
      g.frame();
      return app.hits.map((h) => h.id);
    },
    has(id) {
      return g.ids().indexOf(id) >= 0;
    },
    /** Touch the ruler at position 0..100 (a tap). */
    ruler(pos) {
      g.frame();
      const h = app.hits.find((x) => x.id === 'ruler');
      if (!h) throw new Error('no ruler among ' + app.hits.map((x) => x.id).join(','));
      const x = h.x + (pos / 100) * h.w;
      g.tap(x, h.y + h.h / 2);
    },
    /** Drag across the ruler from `a` to `b`, ending on b. */
    drag(a, b) {
      g.frame();
      const h = app.hits.find((x) => x.id === 'ruler');
      const xa = h.x + (a / 100) * h.w;
      const xb = h.x + (b / 100) * h.w;
      const y = h.y + h.h / 2;
      const id = g.down(xa, y);
      g.move(id, (xa + xb) / 2, y);
      g.move(id, xb, y);
      g.up(id, xb, y);
    },
    wait(ms) {
      t.mock.timers.tick(ms);
    },
    /** Let pending promises (mock server, awaits) settle. */
    async settle() {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    },
    show(options) {
      handlers.show(options);
    },
    hide() {
      handlers.hide();
    },
    view() {
      return app.ctl.view();
    },
    /** Dismiss the first-launch howto sheet. */
    async ready() {
      await g.settle();
      if (g.has('sheet:close')) g.tapId('sheet:close');
    },
  };
  return g;
}

/** Play the 5 daily cards from the home screen: tap 开始, then place and confirm each card. positions: 5 ints. */
async function playDaily(g, positions) {
  g.tapId('home:daily');
  for (let i = 0; i < 5; i++) {
    g.ruler(positions[i]);
    g.tapId('card:primary'); // 就这儿
    await g.settle();
    g.tapId('card:primary'); // 下一张 / 看结果
    await g.settle();
  }
}

module.exports = { boot, initTime, playDaily, SCREEN, CAPSULE, DEFAULT_NOW };
