/**
 * Privacy and friend-scope authorization flow (spec 11.6) [COMPLIANCE].
 *
 * setUserCloudStorage / removeUserCloudStorage / friend and group reads are
 * privacy interfaces in the category 微信朋友关系; the reads also need
 * scope.WxFriendInteraction. Rules: never at launch, never during play,
 * only on a user action that needs it (a ranked daily result's marker write,
 * or a board-open tap); refusal never blocks play; no repeated prompting.
 *
 * Status (13): { privacy: unknown|agreed|denied, friendScope: unknown|granted|denied, markerPending }
 *
 * Privacy errors: errno 104 = user has not agreed; 112 = scope not declared
 * in the 用户隐私保护指引 (founder setup step, D9).
 */

const SCOPE = 'scope.WxFriendInteraction';
const MARKER_KEEP_DAYS = 7;
const { addDays } = require('../core/date');

function errnoOf(e) {
  return e && (e.errno !== undefined ? e.errno : e.errCode);
}

function createPrivacy(opts) {
  const { wx, store, analytics } = opts;
  const now = opts.now || (() => Date.now());
  const st = () => store.state.privacy;
  const p = {};

  p.status = function () {
    return { privacy: st().privacy, friendScope: st().friendScope, markerPending: st().markerPending.length > 0 };
  };

  /** Is the friend board usable? (home settings.friendBoardEnabled) */
  p.friendBoardEnabled = function () {
    return st().privacy === 'agreed' && st().friendScope === 'granted';
  };

  const save = () => store.save();

  /**
   * Ask WeChat for the privacy agreement. Only ever called from a tap.
   * Uses wx.requirePrivacyAuthorize when present (it shows the official
   * popup); otherwise the first privacy-interface call shows it.
   */
  p.requestPrivacy = function (trigger) {
    return new Promise((resolve) => {
      const done = (res) => {
        st().privacy = res;
        save();
        analytics.track('privacy_result', { trigger, result: res });
        resolve(res);
      };
      if (!wx.requirePrivacyAuthorize) return done(st().privacy === 'denied' ? 'denied' : 'agreed');
      const ask = () => wx.requirePrivacyAuthorize({ success: () => done('agreed'), fail: () => done('denied') });
      if (wx.getPrivacySetting) {
        wx.getPrivacySetting({
          success: (r) => (r && r.needAuthorization === false ? done('agreed') : ask()),
          fail: ask,
        });
      } else ask();
    });
  };

  /** Read the friend scope setting; resolves 'granted'|'denied'|'unknown'. */
  p.readScope = function () {
    return new Promise((resolve) => {
      if (!wx.getSetting) return resolve('unknown');
      wx.getSetting({
        success: (r) => {
          const v = r && r.authSetting && r.authSetting[SCOPE];
          resolve(v === true ? 'granted' : v === false ? 'denied' : 'unknown');
        },
        fail: () => resolve('unknown'),
      });
    });
  };

  /**
   * The gate before a board renders (11.6 steps 1-2), called from the board
   * tap. Resolves { state: 'ok'|'privacyDenied'|'unauthorized' }.
   */
  p.ensureForBoard = async function () {
    if (st().privacy !== 'agreed') {
      const r = await p.requestPrivacy('board_open');
      if (r !== 'agreed') return { state: 'privacyDenied' };
      await p.flushPending();
    }
    const scope = await p.readScope();
    if (scope === 'granted') {
      st().friendScope = 'granted';
      save();
      analytics.track('friend_scope_result', { result: 'alreadyGranted', via: 'authorize' });
      return { state: 'ok' };
    }
    if (scope === 'denied') {
      st().friendScope = 'denied';
      save();
      analytics.track('friend_scope_result', { result: 'alreadyDenied', via: 'authorize' });
      return { state: 'unauthorized' };
    }
    // never asked: ask from this tap
    const granted = await new Promise((resolve) => {
      if (!wx.authorize) return resolve(true); // the first open-data call will prompt instead
      wx.authorize({ scope: SCOPE, success: () => resolve(true), fail: () => resolve(false) });
    });
    st().friendScope = granted ? 'granted' : 'denied';
    save();
    analytics.track('friend_scope_result', { result: granted ? 'granted' : 'denied', via: 'authorize' });
    return { state: granted ? 'ok' : 'unauthorized' };
  };

  /** [去设置开启]: on tap only. Resolves the new scope. */
  p.openSetting = function () {
    return new Promise((resolve) => {
      if (!wx.openSetting) return resolve(st().friendScope);
      wx.openSetting({
        success: (r) => {
          const v = r && r.authSetting && r.authSetting[SCOPE];
          if (v === true) st().friendScope = 'granted';
          else if (v === false) st().friendScope = 'denied';
          save();
          resolve(st().friendScope);
        },
        fail: () => resolve(st().friendScope),
      });
    });
  };

  /** onShow after the user may have changed settings (edge case 20). */
  p.refreshOnShow = async function () {
    if (st().friendScope !== 'denied') return st().friendScope;
    const s = await p.readScope();
    if (s === 'granted') {
      st().friendScope = 'granted';
      save();
    }
    return st().friendScope;
  };

  /** Display-marker write after a server-confirmed ranked daily (11.2). Never trusted for ranking. */
  p.writeMarker = function (dateKey, marker) {
    return new Promise((resolve) => {
      const pend = st().markerPending;
      if (st().privacy === 'denied') {
        if (!pend.some((m) => m.dateKey === dateKey)) pend.push({ dateKey, marker });
        save();
        analytics.track('board_write', { dateKey, result: 'privacyDenied', st: marker.st });
        return resolve('privacyDenied');
      }
      if (!wx.setUserCloudStorage) return resolve('error');
      wx.setUserCloudStorage({
        KVDataList: [{ key: 'd_' + dateKey, value: JSON.stringify({ s: marker.s, h: marker.h, st: marker.st }) }],
        success: () => {
          if (st().privacy !== 'agreed') st().privacy = 'agreed';
          st().markerPending = pend.filter((m) => m.dateKey !== dateKey);
          if (store.state.markerKeys.indexOf(dateKey) < 0) store.state.markerKeys.push(dateKey);
          save();
          analytics.track('board_write', { dateKey, result: 'ok', st: marker.st });
          p.pruneOld(dateKey);
          resolve('ok');
        },
        fail: (e) => {
          const code = errnoOf(e);
          if (code === 104) {
            st().privacy = 'denied';
            if (!pend.some((m) => m.dateKey === dateKey)) pend.push({ dateKey, marker });
            save();
            analytics.track('privacy_result', { trigger: 'marker_write', result: 'denied' });
            analytics.track('board_write', { dateKey, result: 'privacyDenied', st: marker.st });
            resolve('privacyDenied');
          } else {
            analytics.track('board_write', { dateKey, result: 'error', st: marker.st });
            analytics.track('error', { where: 'board_write', code: code === undefined ? 'unknown' : code });
            resolve('error');
          }
        },
      });
    });
  };

  /** Remove display keys older than 7 days (keeps at most 8 d_ keys). */
  p.pruneOld = function (todayKey) {
    if (!wx.removeUserCloudStorage) return;
    const cutoff = addDays(todayKey, -MARKER_KEEP_DAYS);
    const keys = store.state.markerKeys;
    const old = keys.filter((k) => k < cutoff);
    if (!old.length) return;
    wx.removeUserCloudStorage({
      keyList: old.map((k) => 'd_' + k),
      success: () => {
        store.state.markerKeys = keys.filter((k) => k >= cutoff);
        save();
      },
      fail: () => {},
    });
  };

  /** After the user agrees later (board's 同意并查看): write what was held back. */
  p.flushPending = async function () {
    const pend = st().markerPending.slice();
    for (const m of pend) await p.writeMarker(m.dateKey, m.marker);
  };

  return p;
}

module.exports = { createPrivacy, SCOPE };
