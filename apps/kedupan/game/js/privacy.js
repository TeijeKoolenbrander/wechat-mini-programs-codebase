/**
 * Privacy and friend-scope authorization flow (spec 8.2, 8.6) [COMPLIANCE].
 *
 * setUserCloudStorage and the friend/group reads are privacy interfaces in the category 微信朋友关系; the
 * reads also need scope.WxFriendInteraction. Rules: never at launch, never during a daily before completion, only
 * on a user action that needs it (the marker write after a completed daily, or a group page / friend board / round
 * reveal tap); refusal never blocks play; no repeated prompting.
 *
 * The KV marker is exactly one key, `kd` = {d: dateKey, s: total}, overwritten daily; it is a presence marker
 * and is never used for ranking (AC 43, 66).
 *
 * Status: { privacy: unknown|agreed|denied, friendScope: unknown|granted|denied, markerPending }
 * Privacy errors: errno 104 = user has not agreed; 112 = scope not declared in the 用户隐私保护指引 (H5).
 */

const SCOPE = 'scope.WxFriendInteraction';
const MARKER_KEY = 'kd';

function errnoOf(e) {
  return e && (e.errno !== undefined ? e.errno : e.errCode);
}

function createPrivacy(opts) {
  const { wx, store, analytics } = opts;
  const st = () => store.state.privacy;
  const save = () => store.save();
  const p = {};

  p.status = function () {
    return { privacy: st().privacy, friendScope: st().friendScope, markerPending: !!st().markerPending };
  };

  /** Is the friend data readable (names)? */
  p.friendDataEnabled = function () {
    return st().privacy === 'agreed' && st().friendScope === 'granted';
  };

  /** Ask WeChat for the privacy agreement. Only ever called from a tap. */
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
   * The gate before names render, called from a tap (group page, friend board, round reveal). Resolves
   * { state: 'ok'|'privacyDenied'|'unauthorized' }. Refusal never blocks the screen: callers still render the
   * server rows anonymously.
   */
  p.ensureForNames = async function (trigger) {
    if (st().privacy !== 'agreed') {
      const r = await p.requestPrivacy(trigger || 'board_open');
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

  /** onShow after the user may have changed settings (edge case 20): re-read the scope. */
  p.refreshOnShow = async function () {
    if (st().friendScope !== 'denied') return st().friendScope;
    const s = await p.readScope();
    if (s === 'granted') {
      st().friendScope = 'granted';
      save();
    }
    return st().friendScope;
  };

  /**
   * Presence-marker write after a completed daily (8.2). Never trusted for ranking. Resolves 'ok'|'privacyDenied'|'error'.
   * On a refusal (104) the write is held (markerPending) and retried only after a later agreement.
   */
  p.writeMarker = function (dateKey, total) {
    return new Promise((resolve) => {
      if (st().privacy === 'denied') {
        st().markerPending = { dateKey, total };
        save();
        analytics.track('marker_write', { result: 'privacyDenied' });
        return resolve('privacyDenied');
      }
      if (!wx.setUserCloudStorage) return resolve('error');
      wx.setUserCloudStorage({
        KVDataList: [{ key: MARKER_KEY, value: JSON.stringify({ d: dateKey, s: total }) }],
        success: () => {
          if (st().privacy !== 'agreed') {
            // the official popup (if any) fired on this first privacy-interface call and the user agreed
            st().privacy = 'agreed';
            analytics.track('privacy_result', { trigger: 'marker_write', result: 'agreed' });
          }
          st().markerPending = null;
          store.state.markerDay = dateKey;
          save();
          analytics.track('marker_write', { result: 'ok' });
          resolve('ok');
        },
        fail: (e) => {
          const code = errnoOf(e);
          if (code === 104) {
            st().privacy = 'denied';
            st().markerPending = { dateKey, total };
            save();
            analytics.track('privacy_result', { trigger: 'marker_write', result: 'denied' });
            analytics.track('marker_write', { result: 'privacyDenied' });
            resolve('privacyDenied');
          } else {
            analytics.track('marker_write', { result: 'error' });
            analytics.track('error', { where: 'marker_write', code: code === undefined ? 'unknown' : code });
            resolve('error');
          }
        },
      });
    });
  };

  /** After the user agrees later: write what was held back. */
  p.flushPending = async function () {
    const m = st().markerPending;
    if (m) await p.writeMarker(m.dateKey, m.total);
  };

  return p;
}

module.exports = { createPrivacy, SCOPE, MARKER_KEY };
