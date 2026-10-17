/**
 * Analytics (spec 14, AC 75): our own `track` cloud function, batched (<= 50 per call), flushed on hide and every 20 s.
 * `wx.reportEvent` is never used. Events never carry user text, strokes, openids, group ids or share tickets: the client
 * drops forbidden keys and non-scalar values before queueing, and the server runs core/analytics.sanitizeEvents on top
 * (defence in depth). Top-level `sessionId` and `clientTs`; common props isNewUser, appVersion, promptsVersion.
 */

const { uuid } = require('./util');
const { beijingDateKey } = require('../core/date');
const { EVENT_NAMES, FORBIDDEN_KEYS } = require('../core/analytics');
const { CONFIG } = require('../core/config');

const MAX_QUEUE = 500;
const MAX_BATCH = 50;
const FLUSH_MS = 20000;
const SESSION_GAP_MS = 30 * 60e3;

function scalar(v) {
  return typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 40);
}

function createAnalytics(opts) {
  const { api, store } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const common = { appVersion: opts.appVersion || '1.0.0', promptsVersion: opts.promptsVersion || CONFIG.promptsVersion };
  const queue = [];
  let sessionId = uuid();
  let hiddenAt = 0;
  let timer = null;
  let flushing = false;
  const a = { queue, EVENTS: EVENT_NAMES };

  const isNewUser = () => store.state.firstDate === beijingDateKey(now());

  a.sessionId = () => sessionId;

  /** returns false for an unknown event name (dropped) */
  a.track = function (name, props) {
    if (EVENT_NAMES.indexOf(name) < 0) return false;
    const p = {};
    const src = props && typeof props === 'object' ? props : {};
    for (const k of Object.keys(src)) {
      const countOnly = k === 'strokes' && typeof src[k] === 'number'; // step_submit.strokes is a count (TD-36)
      if ((FORBIDDEN_KEYS.test(k) && !countOnly) || src[k] === undefined || !scalar(src[k])) continue;
      p[k] = src[k];
    }
    queue.push({ name, props: Object.assign({ isNewUser: isNewUser() }, common, p), sessionId, clientTs: now() });
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

  /** Send everything queued, up to 50 per call. A failed batch goes back to the front of the queue. */
  a.flush = function () {
    if (flushing || queue.length === 0) return Promise.resolve();
    flushing = true;
    const batch = queue.splice(0, MAX_BATCH);
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
    if (hiddenAt && now() - hiddenAt > SESSION_GAP_MS) {
      hiddenAt = 0;
      a.startSession(props);
      return true;
    }
    hiddenAt = 0;
    return false;
  };

  a.startTimer = function () {
    if (timer || !opts.setInterval) return;
    timer = opts.setInterval(() => a.flush(), FLUSH_MS);
  };
  a.stopTimer = function () {
    if (timer && opts.clearInterval) opts.clearInterval(timer);
    timer = null;
  };
  return a;
}

module.exports = { createAnalytics };
