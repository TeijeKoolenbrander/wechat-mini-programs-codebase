/**
 * Analytics (spec 14): own `track` cloud function, batched (<= 50 per batch), flushed on hide and every
 * 20 s. `wx.reportEvent` is never used. Events NEVER carry user text, strokes, openids or group ids
 * (AC 75): forbidden keys are dropped, and string values over 40 characters are dropped as well (ids and
 * enums are short; free text is not).
 * Server-side events of the spec (mod_verdict, mod_void, chain_reveal, ...) are not in this list.
 */

const { uuid } = require('./util');
const { beijingDateKey } = require('../core/date');

const EVENTS = [
  'session_start', 'card_open', 'group_join', 'rules_view', 'rules_agree', 'picker_view', 'prompt_pick', 'custom_prompt_result',
  'chain_create', 'claim_attempt', 'step_view', 'step_submit', 'step_release', 'step_result', 'reveal_view', 'laugh', 'report_submit',
  'share_tap', 'subscribe_offer', 'subscribe_result', 'same_again', 'group_list_view', 'album_view', 'delete_step', 'restriction_shown',
  'ad_request', 'ad_show', 'ad_reward', 'ad_close_early', 'ad_error', 'interstitial_show', 'error',
];
const FORBIDDEN_PROPS = ['openid', 'opengid', 'openGId', 'groupRef', 'groupid', 'groupId', 'text', 'strokes', 'drawing', 'promptText', 'finalText', 'customText', 'content', 'nickname', 'shareTicket'];
const MAX_QUEUE = 500;
const MAX_STRING = 40;

function createAnalytics(opts) {
  const { api, store, config } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const common = { promptsVersion: opts.promptsVersion, appVersion: opts.appVersion || '0.1.0', platform: opts.platform || 'unknown' };
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
    for (const k of Object.keys(src)) {
      if (src[k] === undefined) continue;
      if (FORBIDDEN_PROPS.indexOf(k) >= 0 && !(k === 'strokes' && typeof src[k] === 'number')) continue; // the event field 'strokes' is a count
      if (typeof src[k] === 'string' && src[k].length > MAX_STRING) continue;
      p[k] = src[k];
    }
    queue.push({ name, props: Object.assign({ isNewUser: isNewUser() }, common, p), sessionId, ts: now() });
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
      .track({ sessionId, events: batch.map((e) => ({ name: e.name, props: e.props, clientTs: e.ts })) })
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

  a.startSession = function (props) {
    sessionId = uuid();
    a.track('session_start', props);
  };

  a.onHide = function () {
    hiddenAt = now();
    a.flush();
  };

  /** Returns true if a new session began (warm start after > 30 min in the background). */
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
