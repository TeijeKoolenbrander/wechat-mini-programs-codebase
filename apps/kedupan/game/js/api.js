/**
 * Cloud function wrapper (spec 11.2). Every call returns a Promise that RESOLVES to the function's
 * result ({ok:true,...}) or to {ok:false, code, message}; it never rejects, so callers branch on `ok`.
 * Timer-only functions (genDaily, finalizeDay, sweepRounds, cleanup) are not callable from the client.
 *
 * Modes: 'cloud' (wx.cloud.callFunction) or 'mock' (js/mock-server.js, in memory, same contracts).
 * The mock is the default until the founder supplies the AppID and the cloud env id (H1, H6).
 * Identity is never sent: the server reads OPENID from the call context (the mock takes it from `openid`).
 */

const { createMockServer } = require('./mock-server');

const NAMES = [
  'getDaily', 'submitCard', 'getArchive', 'getArchiveDay', 'getBonusCard', 'unlockDistribution', 'joinGroup', 'getGroupDay',
  'getFriendBoard', 'createRound', 'setClue', 'getRound', 'submitGuess', 'revealRound', 'subscribeRound', 'reportCard', 'track',
];
const TIMEOUT_MS = { submitCard: 5000, createRound: 5000, revealRound: 5000, getDaily: 10000, track: 6000 };
const DEFAULT_TIMEOUT = 8000;

function createApi(opts) {
  opts = opts || {};
  const wx = opts.wx;
  const mode = opts.mode || 'mock';
  const setTimer = opts.setTimeout || setTimeout;
  const clearTimer = opts.clearTimeout || clearTimeout;
  const mock = mode === 'mock' ? opts.mockServer || createMockServer(opts.mock || {}) : null;
  const openid = opts.openid || 'mock-openid-me';
  const api = { mode, mock, openid };

  if (mode === 'cloud' && wx && wx.cloud && wx.cloud.init) {
    wx.cloud.init({ env: opts.env, traceUser: false });
  }

  function normalize(r) {
    if (!r || typeof r !== 'object') return { ok: false, code: 'BAD_RESPONSE', message: 'bad response' };
    if (r.ok === false && r.message === undefined && r.msg !== undefined) r.message = r.msg;
    return r;
  }

  function call(name, data) {
    if (mode === 'mock') {
      try {
        return Promise.resolve(normalize(mock.call(name, data, { openid })));
      } catch (e) {
        return Promise.resolve({ ok: false, code: 'NETWORK', message: String(e && e.message) });
      }
    }
    return new Promise((resolve) => {
      let settled = false;
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(normalize(r));
      };
      const timer = setTimer(() => done({ ok: false, code: 'TIMEOUT', message: 'timeout' }), TIMEOUT_MS[name] || DEFAULT_TIMEOUT);
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

  /** Another player on the same mock server (tests and the offline demo). */
  api.as = function (otherOpenid) {
    return createApi({ wx, mode, mockServer: mock, openid: otherOpenid, env: opts.env });
  };
  return api;
}

module.exports = { createApi, NAMES };
