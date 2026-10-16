'use strict';
// Per-openid fixed-window (1 minute) rate limits for EVERY client-callable function (security hardening M3). One table, one
// place; store.handler() applies it right after the identity check and BEFORE the function body, so a flood is refused before
// any expensive read. Exceeding the limit returns {ok:false, code:'RATE_LIMITED'}; the client degrades gracefully (js/api.js
// and js/controller.js treat it like a bad connection: retry UI, queued submit, track re-queue).
//
//   reads    ~60/min  (getDaily, getHistory, getChallenge, getReplay; getBoard 30: it can fan out into a 50-id batched read)
//   writes   ~20/min  (startRun, submitRun, createChallenge, subscribeChallenge, joinGroup)
//   getRound 60/min   the one deliberate exception: the per-round fetch of a daily run (4 a run). Retries and two devices must
//                     never lock a player out of finishing; 60 still stops a script
//   track    300 EVENTS/min (cost = events in the batch, a batch holds <= 50)
//
// Server-only functions (genDaily, cleanup) carry no limit: they are refused unless they come from a timer trigger.
const LIMITS = {
  getDaily: { limit: 60 },
  getHistory: { limit: 60 },
  getChallenge: { limit: 60 },
  getReplay: { limit: 60 },
  getBoard: { limit: 30 },
  getRound: { limit: 60 },
  startRun: { limit: 20 },
  submitRun: { limit: 20 },
  createChallenge: { limit: 20 },
  subscribeChallenge: { limit: 20 },
  joinGroup: { limit: 20 },
  track: { limit: 300, cost: (event) => (event && Array.isArray(event.events) ? Math.max(1, Math.min(event.events.length, 50)) : 1) },
};

/** handler option for function `name`: {bucket, limit, cost?} */
function rateOf(name) {
  const l = LIMITS[name];
  if (!l) throw new Error('no rate limit defined for ' + name);
  return Object.assign({ bucket: name }, l);
}

module.exports = { LIMITS, rateOf };
