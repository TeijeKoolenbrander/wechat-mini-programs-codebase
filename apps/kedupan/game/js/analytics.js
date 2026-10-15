/**
 * Analytics (spec 12): our own `track` cloud function, batched (<= 50 per batch), flushed on the day
 * result, on hide and every 20 s. `wx.reportEvent` is never used (AC 77). Events carry a top-level
 * `sessionId` and `clientTs`; props never carry an openid, openGId or groupRef (AC 49).
 * Server-side events (round_reveal, subscribe_send, daily_gen, finalize_day, board_list) are not listed here.
 */

const { uuid } = require('./util');
const { beijingDateKey } = require('../core/date');

const EVENTS = [
  'session_start', 'card_open', 'howto_view', 'daily_card_place', 'daily_card_reveal', 'daily_complete', 'daily_result_view',
  'share_tap', 'round_create', 'round_clue', 'round_guess', 'round_view', 'group_join', 'group_view', 'friend_board_view',
  'archive_view', 'archive_set_complete', 'bonus_card', 'distribution_unlock', 'card_report', 'privacy_result',
  'friend_scope_result', 'marker_write', 'ad_request', 'ad_show', 'ad_reward', 'ad_close_early', 'ad_error',
  'interstitial_show', 'subscribe_offer', 'subscribe_result', 'display_setting', 'error',
];
const FORBIDDEN_PROPS = ['openid', 'opengid', 'openGId', 'groupRef', 'groupid', 'shareTicket'];
const MAX_QUEUE = 500;

function createAnalytics(opts) {
  const { api, store, config } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const common = { contentVersion: opts.contentVersion, appVersion: opts.appVersion || '0.1.0' };
  const queue = [];
  let sessionId = uuid();
  let hiddenAt = 0;
  let timer = null;
  let flushing = false;
  const a = { queue, EVENTS };

  function isNewUser() {
    return store.state.firstDate === beijingDateKey(now());
  }

  a.sessionId = () => sessionId;

  a.track = function (name, props) {
    if (EVENTS.indexOf(name) < 0) return false;
    const p = {};
    const src = props || {};
    for (const k of Object.keys(src)) if (FORBIDDEN_PROPS.indexOf(k) < 0 && src[k] !== undefined) p[k] = src[k];
    const ev = { name, sessionId, props: Object.assign({ isNewUser: isNewUser() }, common, p), clientTs: now() };
    queue.push(ev);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    if (name === 'error' && wx && wx.getGameLogManager) {
      try {
        wx.getGameLogManager().log({ level: 'error', key: String(p.where || 'error'), value: String(p.code || '') });
      } catch (e) {
        /* optional */
      }
    }
    return true;
  };

  /** Send everything queued, up to 50 per call. Failed batches go back to the queue. */
  a.flush = function () {
    if (flushing || queue.length === 0) return Promise.resolve();
    flushing = true;
    const batch = queue.splice(0, config.analytics.maxBatch);
    return api
      .track({ events: batch })
      .then((r) => {
        flushing = false;
        if (!r || !r.ok) queue.unshift.apply(queue, batch);
        else if (queue.length) return a.flush();
      })
      .catch(() => {
        flushing = false;
        queue.unshift.apply(queue, batch);
      });
  };

  /** A new session on cold start, or on a warm start after > 30 min in the background. */
  a.startSession = function (props) {
    sessionId = uuid();
    a.track('session_start', props);
  };

  a.onHide = function () {
    hiddenAt = now();
    a.flush();
  };

  /** Returns true if a new session began. */
  a.onShow = function (props) {
    if (hiddenAt && now() - hiddenAt > config.analytics.sessionGapMs) {
      hiddenAt = 0;
      a.startSession(props);
      return true;
    }
    hiddenAt = 0;
    return false;
  };

  a.startTimer = function () {
    if (timer || !opts.setInterval) return;
    timer = opts.setInterval(() => a.flush(), config.analytics.flushMs);
  };
  a.stopTimer = function () {
    if (timer && opts.clearInterval) opts.clearInterval(timer);
    timer = null;
  };
  return a;
}

module.exports = { createAnalytics, EVENTS };
