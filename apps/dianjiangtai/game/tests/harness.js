/**
 * Fake `wx` + canvas harness (cheatshaizi pattern). Boots js/main against a
 * recording fake platform and drives it with touches on the hit areas the
 * renderer returned, the way a player would.
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

/**
 * opts: { enter: {scene, query, shareTicket, chatType}, storage: {}, privacy: {...}, groupData, ad: {...} }
 */
function boot(t, opts) {
  opts = opts || {};
  if (!t.__timers) {
    t.__timers = true;
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: opts.now || Date.UTC(2026, 10, 20, 4, 0, 0) });
  }

  const log = { text: [], calls: [], storageWrites: 0, cloudWrites: [], shares: [], ads: [], menu: [], console: [], canvases: [], audio: [] };
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
    createCanvas: () => {
      const cv = { width: 0, height: 0, getContext: () => fakeContext(log), toTempFilePath: (o) => o.success({ tempFilePath: 'tmp://card.png' }) };
      log.canvases.push(cv);
      return cv;
    },
    createImage: () => ({}),
    createInnerAudioContext: () => {
      const c = {
        src: '', loop: false, volume: 1, playing: false, plays: 0,
        play() { this.playing = true; this.plays++; call('audio.play', this.src); },
        stop() { this.playing = false; },
        pause() { this.playing = false; },
        onError() {},
      };
      log.audio.push(c);
      return c;
    },
    loadSubpackage: (o) => {
      call('loadSubpackage', o.name);
      if (opts.audioLoadFails) return o.fail({ errMsg: 'fail' });
      o.success({});
    },
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
    getSetting: (o) => {
      call('getSetting');
      const a = opts.album || {};
      const auth = p.scope === undefined ? {} : { 'scope.WxFriendInteraction': p.scope };
      if (a.scope !== undefined) auth['scope.writePhotosAlbum'] = a.scope;
      o.success({ authSetting: auth });
    },
    // v1: subscribe message, save to album, banner, system font
    requestSubscribeMessage: (o) => {
      call('requestSubscribeMessage', o.tmplIds);
      const s = opts.subscribe || {};
      if (s.failCode) return o.fail({ errCode: s.failCode, errMsg: 'fail' });
      o.success({ [o.tmplIds[0]]: s.result || 'accept' });
    },
    saveImageToPhotosAlbum: (o) => {
      call('saveImageToPhotosAlbum', o.filePath);
      const a = opts.album || {};
      if (a.saveErr) return o.fail(a.saveErr);
      o.success({});
    },
    createBannerAd: (o) => {
      log.ads.push(['banner', o]);
      return { onError() {}, onLoad() {}, onResize() {}, show: () => Promise.resolve(), hide() {}, destroy() {}, style: {} };
    },
    getAppBaseInfo: () => ({ fontSizeSetting: opts.fontSize || 16 }),
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
      // the first-run coach marks block the draft screen: a player skips them (coach tests tap them explicitly)
      if (!g.keepCoach && app.hits.some((h) => h.id === 'coach:skip') && !String(idOrFn).startsWith('coach:')) {
        const sk = app.hits.find((h) => h.id === 'coach:skip');
        g.tap(sk.x + sk.w / 2, sk.y + sk.h / 2);
        g.frame();
      }
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
  };
  return g;
}

/**
 * Play a ranked daily (or a challenge that counts as the daily) against an api object the way the client does:
 * startRun returns round 1, getRound the next ones, the first pool general goes into the next open slot.
 * Resolves { actions, rounds, last } (last = the last getRound/startRun response).
 */
async function driveProgressive(api, o) {
  const draft = require('../core/draft');
  const rounds = [];
  const first = await api.startRun({ mode: o.mode || 'daily', clientRunId: o.clientRunId, dateKey: o.dateKey, challengeId: o.challengeId });
  if (!first.ok) return { error: first };
  rounds.push(...first.rounds);
  const run = draft.createRun({ seed: 0, contentVersion: require('../core/content').LATEST_CONTENT_VERSION, mode: o.mode === 'challenge' ? 'challenge' : 'daily', rounds });
  const content = run.content;
  for (let r = 1; r <= 5; r++) {
    if (r > 1) {
      const resp = await api.getRound({ clientRunId: o.clientRunId, dateKey: o.dateKey, actions: run.actions.slice() });
      if (!resp.ok) return { error: resp, actions: run.actions, rounds };
      rounds[resp.round - 1] = resp.data;
      draft.nextRound(run);
    }
    draft.apply(run, { round: r, type: 'flip' });
    const pool = draft.currentPool(run);
    draft.apply(run, { round: r, type: 'pick', generalId: content.roster[pool[0]], slot: content.slots[r - 1] });
  }
  return { actions: run.actions, rounds };
}

/** Play one full run from the draft screen: 5 rounds, first pool general into the first open slot. */
async function playDraft(g, opts) {
  opts = opts || {};
  for (let round = 1; round <= 5; round++) {
    if (opts.beforeRound) opts.beforeRound(round);
    g.tapId('primary'); // 翻令 (ends coach mark if shown)
    await g.settle(); // a progressive daily fetches the round first
    g.wait(1300);
    await g.settle();
    const pool = g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
    void pool;
    g.tapId((h) => h.id.indexOf('slot:') === 0);
    g.wait(400); // clear the primary-button debounce
    if (round === 5 && opts.beforeMarch) opts.beforeMarch();
    g.tapId('primary'); // 下一轮 / 出征
    g.wait(400);
    await g.settle();
  }
}

module.exports = { boot, playDraft, driveProgressive, SCREEN, CAPSULE };
