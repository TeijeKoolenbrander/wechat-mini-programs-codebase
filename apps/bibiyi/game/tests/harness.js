/**
 * Fake `wx` + canvas harness (cheatshaizi / 点将台 pattern). Boots js/main
 * against a recording fake platform and drives it with touches on the hit
 * areas the renderer returned, the way a player would.
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
    drawImage: () => log.images.push(1),
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
}

/**
 * opts: { enter: {scene, query, shareTicket, chatType}, storage: {}, privacy: {...}, groupData, now, mockServer }
 */
function boot(t, opts) {
  opts = opts || {};
  if (!t.__timers) {
    t.__timers = true;
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: opts.now || Date.UTC(2026, 10, 20, 4, 0, 0) });
  }

  const log = { text: [], images: [], calls: [], storageWrites: 0, cloudWrites: [], shares: [], ads: [], menu: [], console: [], saved: [], subscribe: [] };
  const storage = opts.storage || {};
  const handlers = {};
  let raf = null;
  let nextId = 1;
  const call = (name, arg) => log.calls.push(name + (arg !== undefined ? ':' + JSON.stringify(arg) : ''));
  const p = opts.privacy || {};

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
    // privacy and friend scope
    getPrivacySetting: (o) => o.success({ needAuthorization: p.state !== 'agreed' }),
    requirePrivacyAuthorize: (o) => {
      call('requirePrivacyAuthorize');
      if (p.refuse) o.fail({ errno: 104 });
      else o.success({});
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
      return { show() {}, hide() {}, destroy() {}, onError() {} };
    },
    createFeedbackButton: () => ({ show() {}, hide() {}, style: {} }),
    saveImageToPhotosAlbum: (o) => {
      call('saveImageToPhotosAlbum');
      if (opts.albumDeny) return o.fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' });
      log.saved.push(o.filePath);
      o.success({});
    },
    requestSubscribeMessage: (o) => {
      call('requestSubscribeMessage', o.tmplIds);
      log.subscribe.push(o.tmplIds);
      o.success({ [o.tmplIds[0]]: opts.subscribeAnswer || 'accept' });
    },
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
    handlers,
    storage,
    frame() {
      log.text = [];
      const cb = raf;
      cb();
      // the real renderer may draw spaced text a glyph at a time, so join without a separator
      return log.text.join('');
    },
    down(x, y) {
      const id = nextId++;
      const touch = { identifier: id, clientX: x, clientY: y };
      handlers.start({ touches: [touch], changedTouches: [touch] });
      return id;
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
  };
  return g;
}

/**
 * Answer the current question, then play the reveal and the pauses out until the
 * next question (or the miss / result) is showing. `choice`: 'hi' | 'lo' | 'right' |
 * 'wrong'; right / wrong use `lookup(q)` to find the correct button (the test knows
 * the fact pool). opts.stopAtMiss keeps the miss pause on screen.
 */
async function answer(g, choice, lookup, opts) {
  const ctl = g.app.ctl;
  const q = ctl.state.r.q;
  let c = choice;
  if (choice === 'right' || choice === 'wrong') {
    const f = lookup(q);
    c = choice === 'right' ? f : f === 'hi' ? 'lo' : 'hi';
  }
  g.wait(350); // clear the debounce
  g.tapId('answer:' + c);
  for (let i = 0; i < 80; i++) {
    await g.settle();
    g.wait(100);
    g.frame();
    const st = ctl.state;
    if (st.screen !== 'play') break;
    const r = st.r;
    if (st.sheets.length) break;
    if (r.phase === 'awaitAnswer' || r.phase === 'netError') break;
    if (r.phase === 'miss' && opts && opts.stopAtMiss) break;
  }
  await g.settle();
  return c;
}

/** The correct button for a payload, from a fact index. */
function correctFrom(byId) {
  return (q) => (byId[q.bottom.factId].value > byId[q.top.factId].value ? 'hi' : 'lo');
}

module.exports = { boot, answer, correctFrom, SCREEN, CAPSULE };
