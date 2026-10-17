/**
 * Subscribe message "接龙揭晓了" (spec 10.3, PO-26, AC 100) [COMPLIANCE: opt-in only].
 *
 *  - available only when a template id is configured (remote app_config via getHome, or build-config as a fallback) and
 *    the player has not banned subscriptions: without one the offer is 'hidden' and the button never shows
 *  - wx.requestSubscribeMessage is called ONLY from request(), which the controller calls synchronously from the 揭晓时提醒我 tap;
 *    never at launch
 *  - accept -> subscribeReveal({chainId}) stores one grant (the server keeps one doc per chain+player: at most one message)
 *    reject -> declined for that chain, never offered again for it; ban / 20004 -> declined and hidden on this device
 *    other failure -> 'unavailable' (the caller toasts "提醒未开启"), nothing stored
 *  - no reward of any kind
 */

function createSubscribe(opts) {
  const { wx, api, store, analytics } = opts;
  const sub = {};
  const st = () => store.state.subscribe;

  /** tmplId or null (hidden) */
  sub.templateId = function (features) {
    if (!features || !features.subscribe || !features.subscribe.tmplId) return null;
    if (st().banned) return null;
    return features.subscribe.tmplId;
  };

  /** Offer state for one chain: hidden | offer | granted | declined. */
  sub.stateFor = function (features, chainId) {
    if (!chainId) return 'hidden';
    if (st().granted[chainId]) return 'granted';
    if (!sub.templateId(features)) return 'hidden';
    if (st().declined[chainId]) return 'declined';
    return 'offer';
  };

  /** Must run inside the tap handler. Resolves 'granted' | 'declined' | 'unavailable' (any other failure; nothing stored). */
  sub.request = function (features, chainId) {
    const tmplId = sub.templateId(features);
    if (!tmplId || !wx.requestSubscribeMessage) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      const finishReject = (result, errCode) => {
        analytics.track('subscribe_result', { result, errCode });
        st().declined[chainId] = true;
        if (result === 'ban') st().banned = true;
        store.save();
        resolve('declined');
      };
      try {
        wx.requestSubscribeMessage({
          tmplIds: [tmplId],
          success: (res) => {
            const v = res && res[tmplId];
            if (v === 'accept') {
              analytics.track('subscribe_result', { result: 'accept' });
              api.subscribeReveal({ chainId }).then((r) => {
                if (r && r.ok) {
                  st().granted[chainId] = true;
                  store.save();
                  resolve('granted');
                } else {
                  analytics.track('error', { where: 'subscribeReveal', code: r ? r.code : 'none' });
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
      } catch (e) {
        resolve('unavailable');
      }
    });
  };

  return sub;
}

module.exports = { createSubscribe };
