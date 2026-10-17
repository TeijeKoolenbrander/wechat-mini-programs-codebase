/**
 * Analytics (spec 12, AC 77): our own `track` function, batched (<= 50), flushed on result, on hide and every 20 s,
 * top-level sessionId + clientTs. `wx.reportEvent` is never used. Props never carry an openid, openGId, groupRef,
 * groupid, shareTicket or cloudID. Event names and required props come from core/events.js (one table for client,
 * server and QA); a call with a missing required prop is still sent but recorded in `invalid` so tests catch it.
 */

const { uuid } = require('./util');
const { beijingDateKey } = require('../core/date');
const EV = require('../core/events');
const { guardEventProps } = require('./clue-ui');

const FORBIDDEN_PROPS = ['openid', 'opengid', 'openGId', 'groupRef', 'groupid', 'shareTicket', 'cloudID'];
const MAX_QUEUE = 500;

function createAnalytics(opts) {
  const { api, store, config } = opts;
  const wx = opts.wx;
  const now = opts.now || (() => Date.now());
  const common = { contentVersion: opts.contentVersion, appVersion: opts.appVersion || '0.1.0' };
  const queue = [];
  const invalid = [];
  const sent = []; // every event that left the queue successfully (QA / harness)
  let sessionId = uuid();
  let hiddenAt = 0;
  let timer = null;
  let flushing = false;
  const a = { queue, invalid, sent, EVENTS: EV.CLIENT_EVENT_NAMES };

  const isNewUser = () => store.state.firstDate === beijingDateKey(now());
  a.sessionId = () => sessionId;

  a.track = function (name, props) {
    if (EV.CLIENT_EVENT_NAMES.indexOf(name) < 0) {
      invalid.push('unknown event ' + name);
      return false;
    }
    let p = {};
    const src = props || {};
    for (const k of Object.keys(src)) if (FORBIDDEN_PROPS.indexOf(k) < 0 && src[k] !== undefined) p[k] = src[k];
    // clue events (D-2): an allowlist of enums, ids and counts, so a typed clue can never reach an event (AC 95)
    const guarded = guardEventProps(name, p);
    if (guarded) p = guarded;
    const missing = EV.missingProps(name, p);
    if (missing.length) invalid.push(name + ' missing ' + missing.join(','));
    const ev = { name, sessionId, props: Object.assign({ isNewUser: isNewUser() }, common, p), ts: now() };
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
      .track({ sessionId, events: batch.map((e) => ({ name: e.name, props: e.props, clientTs: e.ts, sessionId: e.sessionId })) })
      .then((r) => {
        flushing = false;
        if (!r || !r.ok) queue.unshift.apply(queue, batch);
        else {
          sent.push.apply(sent, batch);
          if (queue.length) return a.flush();
        }
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

module.exports = { createAnalytics };
