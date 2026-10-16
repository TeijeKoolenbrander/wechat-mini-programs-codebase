/**
 * Cloud function wrapper (spec 14.2). Every call returns a Promise that
 * RESOLVES to the function's result ({ok:true,...}) or to
 * {ok:false, code, message}; it never rejects, so callers branch on `ok`.
 *
 *   getDaily, startRun, submitRun, joinGroup, getBoard, getReplay,
 *   createChallenge, getChallenge, track
 *
 * Modes: 'cloud' (wx.cloud.callFunction) or 'mock' (js/mock-server.js, in
 * memory, same contracts). The mock is the default until the founder supplies
 * the AppID and the cloud env id (D9). Identity is never sent: the server
 * reads OPENID from the call context.
 *
 * Client-side codes (never sent by the server): TIMEOUT, NETWORK, BAD_RESPONSE. The server code RATE_LIMITED (per-openid limits,
 * cloudfunctions/common/limits.js) resolves like any {ok:false, code}; controller.js treats it like a bad connection (isTransient).
 * joinGroup takes {cloudID: <raw string from wx.getGroupEnterInfo>}: the server resolves it, the client never sends a decrypted object.
 */

const buildConfig = require('./build-config');

const NAMES = ['getDaily', 'startRun', 'submitRun', 'joinGroup', 'getBoard', 'getReplay', 'createChallenge', 'getChallenge', 'track', 'getRound', 'getHistory', 'subscribeChallenge'];
const TIMEOUT_MS = { submitRun: 5000, getDaily: 8000, getBoard: 8000, track: 6000, startRun: 5000, getRound: 5000, getHistory: 5000, subscribeChallenge: 5000 };

function createApi(opts) {
  opts = opts || {};
  const wx = opts.wx;
  const mode = opts.mode || 'mock';
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimeout || setTimeout;
  const clearTimer = opts.clearTimeout || clearTimeout;
  // the mock server is dev-only: required here, on the mock branch only, so a release build (cloudEnv set, js/mock-server.js in
  // packOptions.ignore) never loads it (tests/release-gate.test.js)
  let mock = null;
  if (mode === 'mock') mock = opts.mockServer || require('./mock-server').createMockServer({ now });
  // deployed function name = fnPrefix + plain name ('' by default; 'dianjiangtai_' in the shared environment), resolved in ONE table
  const fnPrefix = opts.fnPrefix !== undefined ? opts.fnPrefix : buildConfig.fnPrefix || '';
  const FN = {};
  NAMES.forEach((n) => { FN[n] = fnPrefix + n; });
  const api = { mode, mock, fnPrefix, FN };

  if (mode === 'cloud' && wx && wx.cloud && wx.cloud.init) {
    wx.cloud.init({ env: opts.env, traceUser: false });
  }

  function call(name, data) {
    if (mode === 'mock') return Promise.resolve(mock.call(name, data));
    return new Promise((resolve) => {
      let settled = false;
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(r);
      };
      const timer = setTimer(() => done({ ok: false, code: 'TIMEOUT', message: 'timeout' }), TIMEOUT_MS[name] || 8000);
      try {
        wx.cloud.callFunction({
          name: FN[name],
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
