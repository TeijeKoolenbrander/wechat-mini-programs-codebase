/**
 * Subscribe message "好友接下了你的战书" (spec 8.13, PO-10) [COMPLIANCE: opt-in only].
 *
 *  - available only when a template id is configured (remote features, or
 *    build-config as a fallback) and the player has not banned subscriptions
 *  - wx.requestSubscribeMessage is called ONLY from request(), which the
 *    controller calls synchronously from the 提醒我 tap; never at launch
 *  - accept -> subscribeChallenge({challengeId}) stores one grant
 *    reject  -> declined for that challenge, nothing stored
 *    ban / 20004 -> declined and the offer is hidden on this device
 *    other failure -> toast, nothing stored
 *  - no reward of any kind
 */

function createSubscribe(opts) {
  const { wx, api, store, analytics } = opts;
  const sub = {};
  const st = () => store.state.subscribe;

  /** tmplId or null (hidden). */
  sub.templateId = function (features) {
    if (!features || !features.subscribe || !features.subscribe.tmplId) return null;
    if (st().banned) return null;
    return features.subscribe.tmplId;
  };

  /** Offer state for one challenge: hidden | offer | granted | declined. */
  sub.stateFor = function (features, challengeId) {
    if (!challengeId) return 'hidden';
    if (st().granted[challengeId]) return 'granted';
    if (!sub.templateId(features)) return 'hidden';
    if (st().declined[challengeId]) return 'declined';
    return 'offer';
  };

  /**
   * Must run inside the tap handler. Resolves 'granted' | 'declined' | 'unavailable'
   * (any other failure; nothing stored).
   */
  sub.request = function (features, challengeId) {
    const tmplId = sub.templateId(features);
    if (!tmplId || !wx.requestSubscribeMessage) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      const finishReject = (result, errCode) => {
        analytics.track('subscribe_result', { result, errCode });
        st().declined[challengeId] = true;
        if (result === 'ban') st().banned = true;
        store.save();
        resolve('declined');
      };
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: (res) => {
          const v = res && res[tmplId];
          if (v === 'accept') {
            analytics.track('subscribe_result', { result: 'accept' });
            api.subscribeChallenge({ challengeId }).then((r) => {
              if (r && r.ok) {
                st().granted[challengeId] = true;
                store.save();
                resolve('granted');
              } else {
                analytics.track('error', { where: 'subscribeChallenge', code: r ? r.code : 'none' });
                resolve('unavailable');
              }
            });
          } else if (v === 'ban' || v === 'filter') finishReject('ban');
          else finishReject('reject');
        },
        fail: (e) => {
          const code = e && (e.errCode !== undefined ? e.errCode : e.errno);
          if (code === 20004) return finishReject('ban', code);
          analytics.track('subscribe_result', { result: 'error', errCode: code });
          resolve('unavailable');
        },
      });
    });
  };

  /** Mark granted from the server (own-challenge screen). */
  sub.markGranted = function (challengeId) {
    if (!st().granted[challengeId]) {
      st().granted[challengeId] = true;
      store.save();
    }
  };

  return sub;
}

module.exports = { createSubscribe };
