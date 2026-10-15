/**
 * Analytics (spec 15): own `track` cloud function, batched (<= 50 per batch), flushed on the
 * reveal, on hide and every 20 s. `wx.reportEvent` is never used. Every event has a top-level
 * `sessionId` and `clientTs`, plus common props isNewUser, vocabVersion, configVersion,
 * appVersion. NO event ever contains typed text: props named text/input/query are dropped
 * here and rejected by the server (PO-23); out-of-vocabulary attempts are counted via
 * `guess_rejected{reason:'oov', len}` (a number only). Props never carry an openid, openGId
 * or groupRef.
 */

const { uuid } = require('./util');
const { beijingDateKey } = require('../core/date');

const EVENTS = [
  'session_start', 'card_open', 'puzzle_open', 'puzzle_start', 'guess', 'guess_rejected', 'keyboard_open',
  'chips_select', 'hint_unlock', 'hint_use', 'give_up', 'solve', 'reveal_view', 'share_tap',
  'challenge_created', 'challenge_open', 'challenge_finish', 'board_view', 'group_join', 'privacy_result',
  'friend_scope_result', 'board_write', 'archive_view', 'next_puzzle', 'ad_request', 'ad_show', 'ad_reward',
  'ad_close_early', 'ad_error', 'interstitial_show', 'streak_shown', 'display_setting', 'error',
];
const FORBIDDEN_PROPS = ['text', 'input', 'query', 'openid', 'opengid', 'openGId', 'groupRef', 'groupid'];
const MAX_QUEUE = 500;

function createAnalytics(opts) {
  const { api, store, config } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const common = { vocabVersion: opts.vocabVersion || 1, configVersion: config.configVersion, appVersion: opts.appVersion || '0.1.0', platform: opts.platform || 'unknown' };
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
    const ev = { name, props: Object.assign({ isNewUser: isNewUser() }, common, p), clientTs: now(), sessionId };
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
        if (!r || !r.ok) {
          // a rejected batch (e.g. BAD_EVENT) would loop forever: drop it; network failures are kept
          if (r && r.code && r.code !== 'NETWORK' && r.code !== 'TIMEOUT') return;
          queue.unshift.apply(queue, batch);
        } else if (queue.length) return a.flush();
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

module.exports = { createAnalytics, EVENTS, FORBIDDEN_PROPS };
