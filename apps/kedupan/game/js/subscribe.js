/**
 * Subscribe message "刻度题揭晓了" (spec 7.4, PD-13, AC 62, 63) [COMPLIANCE: opt-in only] [SPIKE].
 *
 *  - available only when remote `features.subscribe.tmplId` exists and the player has not banned subscriptions;
 *    without it the offer is never rendered and wx.requestSubscribeMessage is never called (AC 62)
 *  - wx.requestSubscribeMessage is called ONLY from request(), which the controller calls synchronously from the 提醒我 tap
 *  - accept -> subscribeRound({roundId}) stores one grant; reject -> declined for this round, nothing stored;
 *    ban / 20004 -> declined and the offer is hidden on this device (local flag); other failure -> unavailable
 *  - offered only on the host waiting view and right after a guess (the controller enforces the placement)
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

  /** Offer state for one round: hidden | offer | granted | declined. */
  sub.stateFor = function (features, roundId) {
    if (!roundId) return 'hidden';
    if (st().granted[roundId]) return 'granted';
    if (!sub.templateId(features)) return 'hidden';
    if (st().declined[roundId]) return 'declined';
    return 'offer';
  };

  /** Must run inside the tap handler. Resolves 'granted' | 'declined' | 'unavailable'. `where`: 'host' | 'guess'. */
  sub.request = function (features, roundId, where) {
    const tmplId = sub.templateId(features);
    if (!tmplId || !wx.requestSubscribeMessage) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      const finishReject = (result, errCode) => {
        analytics.track('subscribe_result', Object.assign({ where, result }, errCode !== undefined ? { errCode } : {}));
        st().declined[roundId] = true;
        if (result === 'ban') st().banned = true;
        store.save();
        resolve('declined');
      };
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: (res) => {
          const v = res && res[tmplId];
          if (v === 'accept') {
            analytics.track('subscribe_result', { where, result: 'accept' });
            api.subscribeRound({ roundId }).then((r) => {
              if (r && r.ok) {
                if (r.granted !== false) {
                  st().granted[roundId] = true;
                  store.save();
                  resolve('granted');
                } else resolve('unavailable'); // round already over: nothing to notify
              } else {
                analytics.track('error', { where: 'subscribeRound', code: r ? r.code : 'none' });
                resolve('unavailable');
              }
            });
          } else if (v === 'ban' || v === 'filter') finishReject('ban');
          else finishReject('reject');
        },
        fail: (e) => {
          const code = e && (e.errCode !== undefined ? e.errCode : e.errno);
          if (code === 20004) return finishReject('ban', code);
          analytics.track('subscribe_result', { where, result: 'error', errCode: code });
          resolve('unavailable');
        },
      });
    });
  };

  return sub;
}

module.exports = { createSubscribe };
