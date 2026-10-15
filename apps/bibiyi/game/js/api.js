/**
 * Cloud function wrapper (spec 11.2). Every call returns a Promise that
 * RESOLVES to the function's result ({ok:true,...}) or to
 * {ok:false, code, msg}; it never rejects, so callers branch on `ok`.
 *
 *   getDaily, startRun, answer, submitRun, createChallenge, getChallenge,
 *   subscribeChallenge, joinGroup, getBoard, getHistory, reportFact, track
 *
 * Modes: 'cloud' (wx.cloud.callFunction) or 'mock' (js/mock-server.js, in
 * memory, same contracts). The mock is the default until the founder supplies
 * the AppID and the cloud env id. Identity is never sent: the server reads
 * OPENID from the call context.
 */

const { createMockServer } = require('./mock-server');

const NAMES = ['getDaily', 'startRun', 'answer', 'submitRun', 'createChallenge', 'getChallenge', 'subscribeChallenge', 'joinGroup', 'getBoard', 'getHistory', 'reportFact', 'track'];
// answer: 5 s then the card shows "网络不太好" + 重试 (spec 5.2)
const TIMEOUT_MS = { answer: 5000, startRun: 8000, submitRun: 8000, getDaily: 8000, getBoard: 8000, getHistory: 8000, reportFact: 6000, track: 6000 };

function createApi(opts) {
  opts = opts || {};
  const wx = opts.wx;
  const mode = opts.mode || 'mock';
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimeout || setTimeout;
  const clearTimer = opts.clearTimeout || clearTimeout;
  const mock = mode === 'mock' ? opts.mockServer || createMockServer({ now }) : null;
  const api = { mode, mock };

  if (mode === 'cloud' && wx && wx.cloud && wx.cloud.init) {
    wx.cloud.init({ env: opts.env, traceUser: false });
  }

  function call(name, data) {
    if (mode === 'mock') return Promise.resolve(mock.call(name, data));
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(r);
      };
      timer = setTimer(() => done({ ok: false, code: 'TIMEOUT', msg: 'timeout' }), TIMEOUT_MS[name] || 8000);
      try {
        wx.cloud.callFunction({
          name,
          data,
          success: (res) => done(res && res.result && typeof res.result === 'object' ? res.result : { ok: false, code: 'BAD_RESPONSE' }),
          fail: (e) => done({ ok: false, code: 'NETWORK', msg: (e && e.errMsg) || 'network' }),
        });
      } catch (e) {
        done({ ok: false, code: 'NETWORK', msg: String(e && e.message) });
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
