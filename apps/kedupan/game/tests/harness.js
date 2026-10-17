'use strict';
/**
 * Fake `wx` + canvas harness (点将台 pattern). Boots js/main.js under WeChat require rules against a recording fake
 * platform and drives it the way a player would: taps on the hit areas the renderer returned, raw touches on the
 * ruler band. The in-memory mock server is the backend; `h.srv` is its handle (other players: srv.callAs).
 * Time: node:test mock timers control setTimeout / setInterval / Date, so the mock server's clock moves with them.
 */

const path = require('node:path');
const { legacyChat } = require('./helpers');
const { createLoader } = require('./wechat-loader');

const ROOT = path.join(__dirname, '..');
const SCREEN = { windowWidth: 375, windowHeight: 812, pixelRatio: 3, statusBarHeight: 44 };
const CAPSULE = { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
/** 2026-11-05 10:00 Beijing time (issue 5 of the shipped schedule) */
const T0 = Date.UTC(2026, 10, 5, 2, 0, 0);
const BJ = (y, m, d, h, mi, s) => Date.UTC(y, m - 1, d, h - 8, mi || 0, s || 0);

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
 * opts: { now, enter:{scene,query,shareTicket,chatType}, storage:{}, privacy:{state,refuse,scope,refuseScope,settingTo},
 *         subscribe:{result,failCode}, rewarded:{mode:'end'|'early'|'error'|'fallback', code}, interstitial:{error},
 *         groupEnterFail, kvFail, noCloud }
 */
function boot(t, opts) {
  opts = opts || {};
  if (!t.__timers) {
    t.__timers = true;
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: opts.now || T0 });
  }
  const log = { text: [], calls: [], storageWrites: 0, shares: [], ads: [], menu: [], kv: [], posted: [], subscribe: [], vibrate: 0, audio: [], canvases: [], rewarded: [], interstitial: [], banners: [], feedback: [], keyboard: [] };
  const kbh = {}; // the registered keyboard callbacks (the fake system keyboard, h.kb)
  const storage = opts.storage || {};
  const handlers = {};
  let raf = null;
  const call = (name, arg) => log.calls.push(name + (arg !== undefined ? ':' + JSON.stringify(arg) : ''));
  const p = opts.privacy || {};
  const rw = opts.rewarded || { mode: 'end' };
  let openDataCtx = null;
  const shared = { width: 0, height: 0, getContext: () => fakeContext(log) };

  global.requestAnimationFrame = (cb) => (raf = cb);
  const wx = {
    getWindowInfo: () => ({ ...SCREEN, safeArea: { bottom: 778 }, platform: 'ios' }),
    getMenuButtonBoundingClientRect: () => CAPSULE,
    createCanvas: () => {
      const cv = { width: 0, height: 0, getContext: () => fakeContext(log), toTempFilePath: (o) => o.success({ tempFilePath: 'tmp://card.png' }) };
      log.canvases.push(cv);
      return cv;
    },
    createInnerAudioContext: () => {
      const a = { src: '', play: () => log.audio.push(a.src), stop() {} };
      return a;
    },
    vibrateShort: () => {
      log.vibrate++;
      call('vibrateShort');
    },
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => {
      storage[k] = v;
      log.storageWrites++;
    },
    // system keyboard (typed clue, spec 6.5); h.kb drives it
    showKeyboard: (o) => log.keyboard.push(['show', o]),
    hideKeyboard: () => log.keyboard.push(['hide']),
    updateKeyboard: (o) => log.keyboard.push(['update', o]),
    onKeyboardInput: (f) => (kbh.input = f),
    onKeyboardConfirm: (f) => (kbh.confirm = f),
    onKeyboardComplete: (f) => (kbh.complete = f),
    onKeyboardHeightChange: (f) => (kbh.height = f),
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
      o.success({ cloudID: 'cloud-id-' + (opts.groupId || 'G1'), encryptedData: 'x', iv: 'y' });
    },
    // privacy and friend scope
    getPrivacySetting: (o) => o.success({ needAuthorization: p.state !== 'agreed' }),
    requirePrivacyAuthorize: (o) => {
      call('requirePrivacyAuthorize');
      if (p.refuse) o.fail({ errno: 104 });
      else o.success({});
    },
    getSetting: (o) => {
      call('getSetting');
      o.success({ authSetting: p.scope === undefined ? {} : { 'scope.WxFriendInteraction': p.scope } });
    },
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
      log.kv.push(o.KVDataList);
      if (opts.kvFail || (p.refuse && p.state !== 'agreed')) return o.fail({ errno: opts.kvFail || 104 });
      o.success({});
    },
    getOpenDataContext: () => {
      if (!openDataCtx) openDataCtx = { canvas: shared, postMessage: (m) => log.posted.push(m) };
      return openDataCtx;
    },
    getSharedCanvas: () => shared,
    requestSubscribeMessage: (o) => {
      call('requestSubscribeMessage', o.tmplIds);
      log.subscribe.push(o.tmplIds);
      const s = opts.subscribe || {};
      if (s.failCode) return o.fail({ errCode: s.failCode, errMsg: 'fail' });
      o.success({ [o.tmplIds[0]]: s.result || 'accept' });
    },
    createRewardedVideoAd: (o) => {
      log.rewarded.push(o);
      let onClose = null;
      let onError = null;
      let onLoad = null;
      const ad = {
        onClose: (f) => (onClose = f),
        onError: (f) => (onError = f),
        onLoad: (f) => (onLoad = f),
        load: () => Promise.resolve(),
        show: () => {
          if (rw.mode === 'error') {
            Promise.resolve().then(() => onError && onError({ errCode: rw.code || 1004 }));
            return Promise.reject({ errCode: rw.code || 1004 });
          }
          if (rw.mode === 'fallback') {
            Promise.resolve().then(() => onLoad && onLoad({ useFallbackSharePage: true }));
            return Promise.resolve();
          }
          Promise.resolve().then(() => onClose && onClose({ isEnded: rw.mode === 'end' }));
          return Promise.resolve();
        },
      };
      return ad;
    },
    createInterstitialAd: (o) => {
      log.interstitial.push(o);
      return { show: () => (opts.interstitial && opts.interstitial.error ? Promise.reject({ errCode: opts.interstitial.error }) : Promise.resolve()) };
    },
    createBannerAd: (o) => {
      log.banners.push(o);
      return { onError() {}, onLoad() {}, onResize() {}, show: () => Promise.resolve(), hide() {}, destroy() {}, style: {} };
    },
    createFeedbackButton: (o) => {
      log.feedback.push(o);
      return { show() {}, hide() {}, style: o.style };
    },
  };
  if (!opts.noCloud) wx.cloud = { CloudID: (id) => ({ cloudID: id }) };
  global.wx = wx;

  // a fresh app per boot
  const loader = createLoader(ROOT);
  const main = path.join(ROOT, 'js', 'main.js');
  // test injection: a shared mock server (relaunch / second device) and build-config overrides (ad units, stub ads)
  if (opts.srv) {
    const apiMod = loader.load(path.join(ROOT, 'js', 'api.js'));
    const orig = apiMod.createApi;
    apiMod.createApi = (o) => orig(Object.assign({}, o, { mockServer: opts.srv }));
  }
  // the stub renderer by default (stable text for assertions); { real: true } drives the real js/render/* modules
  if (!opts.real) {
    const rmod = loader.load(path.join(ROOT, 'js', 'renderers.js'));
    const origLoad = rmod.loadRenderers;
    rmod.loadRenderers = () => origLoad(true);
  }
  // always an explicit build (default = the dev build), so the suite is green whatever mode build-config.js is in
  Object.assign(loader.load(path.join(ROOT, 'js', 'build-config.js')), require('./mode').DEV_BUILD, opts.build);
  const app = loader.load(main);

  const h = {
    app,
    loader,
    wx,
    log,
    storage,
    ctl: app.ctl,
    st: app.ctl.st,
    api: app.api,
    srv: app.api.mock,
    groupId: (g) => 'mock-group-' + ('cloud-id-' + (g || 'G1')).slice(-8),
    /** another player joins the group the test player enters with (same group id) and returns their groupRef */
    joinOther(openid, g) {
      return app.api.mock.callAs(openid, 'joinGroup', { cloudID: app.api.mock.cloudID(h.groupId(g)) }).groupRef;
    },
    /** another player answers the first n cards of today's daily at the given positions */
    otherDaily(openid, positions, n) {
      const d = app.api.mock.callAs(openid, 'getDaily', {});
      const out = [];
      for (let i = 0; i < (n === undefined ? 5 : n); i++) out.push(app.api.mock.callAs(openid, 'submitCard', { dateKey: d.dateKey, idx: i, pos: positions[i] }));
      return out;
    },
    handlers,
    legacyChat: (openid, roundId) => legacyChat(app.api.mock, openid, roundId),
    /** the fake system keyboard: type() is what the player enters (the whole box text), height() the keyboard height in px */
    kb: {
      async type(v) {
        kbh.input({ value: v });
        await h.settle();
      },
      async confirm(v) {
        kbh.confirm({ value: v === undefined ? '' : v });
        await h.settle();
      },
      async complete() {
        kbh.complete();
        await h.settle();
      },
      async height(px) {
        kbh.height({ height: px });
        await h.settle();
      },
      shown: () => log.keyboard.filter((e) => e[0] === 'show').length,
    },
    /** on the clue step: the preset tab, the first chip, 发到群里 (the round is shared and the host view opens) */
    async pickPreset(i) {
      if (h.has('create:tab:preset')) await h.tap('create:tab:preset');
      await h.tap('create:clue:' + h.view().vm.clueOptions[i || 0].itemId);
      await h.tap('create:share');
    },
    get hits() {
      return app.hits;
    },
    /** run the queued animation frame (draws the current state) */
    frame() {
      if (raf) {
        const cb = raf;
        raf = null;
        cb();
      }
    },
    /** let promise chains settle (the mock server resolves synchronously, so a few ticks are plenty) */
    async settle(n) {
      for (let i = 0; i < (n || 6); i++) await new Promise((r) => setImmediate(r));
      h.frame();
    },
    advance(ms) {
      t.mock.timers.tick(ms);
    },
    now: () => Date.now(),
    ids() {
      h.frame();
      return app.hits.map((x) => x.id);
    },
    has(id) {
      return h.ids().indexOf(id) >= 0;
    },
    texts() {
      h.frame();
      return log.text.slice();
    },
    /** text drawn in the last frame only */
    lastText() {
      log.text.length = 0;
      app.invalidate();
      h.frame();
      return log.text.join('\n');
    },
    find(id) {
      h.frame();
      for (let i = app.hits.length - 1; i >= 0; i--) if (app.hits[i].id === id) return app.hits[i];
      return null;
    },
    /** a real tap through main.js touch routing */
    async tap(id) {
      const a = h.find(id);
      if (!a) throw new Error('no hit area ' + id + ' among: ' + app.hits.map((x) => x.id).join(', '));
      return h.tapAt(a.x + a.w / 2, a.y + a.h / 2);
    },
    async tapAt(x, y) {
      handlers.start({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }], touches: [{}] });
      handlers.end({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }], touches: [] });
      await h.settle();
    },
    /** x pixel of ruler position p (0..100) on the current screen */
    rulerX(pos) {
      h.frame();
      const r = app.hits.ruler;
      if (!r) throw new Error('no ruler on screen');
      return r.x0 + ((r.x1 - r.x0) * pos) / 100;
    },
    rulerY() {
      h.frame();
      const r = app.hits.ruler;
      return r.y + r.h / 2;
    },
    /** touch the ruler at position p and lift */
    async place(pos) {
      const x = h.rulerX(pos);
      const y = h.rulerY();
      handlers.start({ changedTouches: [{ identifier: 2, clientX: x, clientY: y }], touches: [{}] });
      handlers.end({ changedTouches: [{ identifier: 2, clientX: x, clientY: y }], touches: [] });
      await h.settle();
    },
    /** drag from position a to b (may leave the band and the screen) */
    async drag(a, b, opts2) {
      const y = h.rulerY();
      handlers.start({ changedTouches: [{ identifier: 3, clientX: h.rulerX(a), clientY: y }], touches: [{}] });
      const x1 = opts2 && opts2.px !== undefined ? opts2.px : h.rulerX(b);
      handlers.move({ changedTouches: [{ identifier: 3, clientX: x1, clientY: y + (opts2 && opts2.dy ? opts2.dy : 0) }], touches: [{}] });
      handlers.end({ changedTouches: [{ identifier: 3, clientX: x1, clientY: y }], touches: [] });
      await h.settle();
    },
    /**
     * Create n closed days before the current one: each day, `others` other players finish the daily (0 = just publish the
     * set), then the clock moves one day on. Leaves the clock n days later and reloads the app (onShow).
     */
    async seedDays(n, others) {
      for (let i = 0; i < n; i++) {
        if (!others) app.api.mock.callAs('seed', 'getDaily', {});
        for (let j = 0; j < (others || 0); j++) h.otherDaily('o' + j, [0, 1, 2, 3, 4].map((c) => ((j * 7 + c * 13 + i * 5) % 91) + 4));
        h.advance(24 * 3600e3);
      }
      await h.show();
    },
    /** from the archive list: play the day dateKey as an archive set at the given positions; ends on the set end screen */
    async archiveSet(dateKey, positions) {
      await h.tap('archive:item:' + dateKey);
      for (let i = 0; i < 5; i++) {
        await h.answer(positions ? positions[i] : 20 + i * 15);
        await h.tap('card:primary');
      }
    },
    async show(enter) {
      handlers.show(enter || { scene: 1001, query: {} });
      await h.settle();
    },
    async hide() {
      handlers.hide();
      await h.settle();
    },
    /** place at `pos` and confirm; resolves when the reveal (or the pending note) is on screen */
    async answer(pos) {
      await h.place(pos);
      await h.tap('card:primary');
    },
    /** one full daily with the given 5 positions, tapping through every reveal; ends on the result screen */
    async playDaily(positions) {
      await h.tap('home:daily');
      for (let i = 0; i < 5; i++) {
        await h.answer(positions[i]);
        await h.tap('card:primary'); // 下一张 / 看结果
      }
    },
    screen: () => app.ctl.st.screen,
    view: () => app.ctl.view(Date.now()),
    flush: () => app.analytics.flush().then(() => h.settle()),
    nowSrv: () => app.ctl.K.srvNow(),
    teardown() {
      delete global.wx;
      delete global.requestAnimationFrame;
    },
  };
  return (async () => {
    await h.settle(10);
    return h;
  })();
}

module.exports = { boot, T0, BJ, SCREEN, CAPSULE, ROOT };
