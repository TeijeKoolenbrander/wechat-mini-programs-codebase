/**
 * Cloud function wrapper (spec 13.2). Every call returns a Promise that RESOLVES to the function's result
 * ({ok:true,...}) or to {ok:false, code, message}; it never rejects, so callers branch on `ok`.
 * Modes: 'cloud' (wx.cloud.callFunction) or 'mock' (js/mock-server.js, in memory, same contracts).
 * Identity is never sent: the server reads OPENID from the call context. The client NEVER uploads files
 * (drawings go as stroke JSON in submitStep; the server rasterises, PO-10).
 *
 * Offline: a failed call resolves { ok:false, code:'NETWORK' | 'TIMEOUT' } and the controller shows 重试.
 */

const { createMockServer, ME } = require('./mock-server');

const NAMES = [
  'getHome', 'agreeRules', 'ackWarning', 'joinGroup', 'createChain', 'getChain', 'claimStep', 'releaseClaim', 'submitStep',
  'getReveal', 'revealNow', 'laugh', 'report', 'getMyChains', 'getGroupChains', 'deleteMyStep', 'subscribeReveal', 'grantReward', 'track',
];
const TIMEOUT_MS = { createChain: 8000, submitStep: 10000, track: 6000 };
const DEFAULT_TIMEOUT_MS = 5000;

function createApi(opts) {
  opts = opts || {};
  const wx = opts.wx;
  const mode = opts.mode || 'mock';
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimeout || setTimeout;
  const clearTimer = opts.clearTimeout || clearTimeout;
  const openid = opts.openid || ME;
  const mock = mode === 'mock' ? opts.mockServer || createMockServer({ now }) : null;
  const api = { mode, mock };

  if (mode === 'cloud' && wx && wx.cloud && wx.cloud.init) wx.cloud.init({ env: opts.env, traceUser: false });

  function call(name, data) {
    if (mode === 'mock') return Promise.resolve(mock.call(name, data, openid));
    return new Promise((resolve) => {
      let settled = false;
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(r);
      };
      const timer = setTimer(() => done({ ok: false, code: 'TIMEOUT', message: 'timeout' }), TIMEOUT_MS[name] || DEFAULT_TIMEOUT_MS);
      try {
        wx.cloud.callFunction({
          name,
          data,
          success: (res) => done(res && res.result && typeof res.result === 'object' ? res.result : { ok: false, code: 'BAD_RESPONSE' }),
          fail: (e) => done({ ok: false, code: 'NETWORK', message: (e && e.errMsg) || 'network' }),
        });
      } catch (e) {
        done({ ok: false, code: 'NETWORK', message: String(e && e.message) });
      }
    });
  }

  NAMES.forEach((n) => {
    api[n] = (data) => call(n, data || {});
  });
  api.NAMES = NAMES;
  return api;
}

module.exports = { createApi, NAMES };
