/**
 * Privacy and friend-scope authorization flow (spec 8.2, 8.6) [COMPLIANCE].
 *
 * setUserCloudStorage and the friend / group reads are privacy interfaces in the category 微信朋友关系; the reads also
 * need scope.WxFriendInteraction. Rules: never at launch, never during a daily before completion; only on a user
 * action that needs it (the marker write after a completed daily, or the group page / friend board / round reveal
 * tap); refusal never blocks play (every view still renders anonymously); no repeated prompting.
 *
 * The marker is ONE key `kd` = {d: dateKey, s: total}, overwritten daily. It is a presence marker only, never used to
 * rank (AC 43, 66). Privacy errors: errno 104 = the user has not agreed; 112 = scope not declared in the 用户隐私保护指引
 * (founder step H5).
 */

const SCOPE = 'scope.WxFriendInteraction';
const KEY = 'kd';

function errnoOf(e) {
  return e && (e.errno !== undefined ? e.errno : e.errCode);
}

function createPrivacy(opts) {
  const { wx, store, analytics } = opts;
  const st = () => store.state.privacy;
  const save = () => store.save();
  const p = {};

  p.status = function () {
    return { privacy: st().privacy, friendScope: st().friendScope, markerPending: st().markerPending !== null };
  };

  /** Names can be shown (privacy agreed and scope granted). */
  p.namesEnabled = () => st().privacy === 'agreed' && st().friendScope === 'granted';

  /** Ask WeChat for the privacy agreement. Only ever called from a tap. */
  p.requestPrivacy = function (trigger) {
    return new Promise((resolve) => {
      const done = (res) => {
        st().privacy = res;
        save();
        analytics.track('privacy_result', { result: res, trigger });
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
   * The gate before a names view renders (spec 8.6), called from the tap that opens the group page / friend board /
   * round reveal. Resolves { state: 'ok' | 'privacyDenied' | 'unauthorized' }.
   */
  p.ensureForBoard = async function (trigger) {
    // a refusal is remembered: opening the page again does not prompt again (only 同意并查看 asks, spec 8.6, AC 65)
    if (st().privacy === 'denied') return { state: 'privacyDenied' };
    if (st().privacy !== 'agreed') {
      const r = await p.requestPrivacy(trigger || 'board_open');
      if (r !== 'agreed') return { state: 'privacyDenied' };
      await p.flushPending();
    }
    const scope = await p.readScope();
    if (scope === 'granted') {
      st().friendScope = 'granted';
      save();
      analytics.track('friend_scope_result', { result: 'alreadyGranted' });
      return { state: 'ok' };
    }
    if (scope === 'denied') {
      st().friendScope = 'denied';
      save();
      analytics.track('friend_scope_result', { result: 'alreadyDenied' });
      return { state: 'unauthorized' };
    }
    // never asked: ask from this tap
    const granted = await new Promise((resolve) => {
      if (!wx.authorize) return resolve(true); // the first open-data call will prompt instead
      wx.authorize({ scope: SCOPE, success: () => resolve(true), fail: () => resolve(false) });
    });
    st().friendScope = granted ? 'granted' : 'denied';
    save();
    analytics.track('friend_scope_result', { result: granted ? 'granted' : 'denied' });
    return { state: granted ? 'ok' : 'unauthorized' };
  };

  /** Passive state check that never prompts: used where there was no tap (a round opened from a chat card). */
  p.passiveState = function () {
    if (st().privacy === 'denied') return 'privacyDenied';
    if (st().privacy === 'agreed' && st().friendScope === 'granted') return 'ok';
    if (st().friendScope === 'denied') return 'unauthorized';
    return 'unknown';
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

  /** onShow after the user may have changed the settings (AC 65). Never prompts. */
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
   * Presence-marker write: after a completed daily (user tap on 看结果) or the first round guess of a day. One key `kd`,
   * value {d, s}. On refusal (104) it is held (`markerPending`) and retried only after a later agreement.
   */
  p.writeMarker = function (dateKey, total) {
    return new Promise((resolve) => {
      const val = { d: dateKey, s: total };
      const hold = (why) => {
        st().markerPending = val;
        save();
        analytics.track('marker_write', { result: why });
        resolve(why);
      };
      if (st().privacy === 'denied') return hold('privacyDenied');
      if (!wx.setUserCloudStorage) return resolve('error');
      wx.setUserCloudStorage({
        KVDataList: [{ key: KEY, value: JSON.stringify(val) }],
        success: () => {
          if (st().privacy !== 'agreed') {
            st().privacy = 'agreed'; // the write only succeeds after the player agreed in the official popup
            analytics.track('privacy_result', { result: 'agreed', trigger: 'marker_write' });
          }
          st().markerPending = null;
          st().markerDay = dateKey;
          save();
          analytics.track('marker_write', { result: 'ok' });
          resolve('ok');
        },
        fail: (e) => {
          const code = errnoOf(e);
          if (code === 104) {
            st().privacy = 'denied';
            analytics.track('privacy_result', { result: 'denied', trigger: 'marker_write' });
            hold('privacyDenied');
          } else {
            analytics.track('marker_write', { result: 'error' });
            analytics.track('error', { where: 'marker_write', code: code === undefined ? 'unknown' : code });
            resolve('error');
          }
        },
      });
    });
  };

  /** After the user agrees later (同意并查看): write what was held back. */
  p.flushPending = async function () {
    const m = st().markerPending;
    if (m) await p.writeMarker(m.d, m.s);
  };

  return p;
}

module.exports = { createPrivacy, SCOPE, KEY };
