/**
 * Cloud function wrapper (cloudfunctions/CONTRACT.md section 4). Every call returns a Promise that RESOLVES to the
 * function's result ({ok:true,...}) or to {ok:false, code, message}; it never rejects, so callers branch on `ok`.
 *
 *   Account / policy   getHome agreeRules joinGroup track grantReward
 *   慢慢传 chain       rollPrompts createChain getChain claimStep releaseClaim submitStep revealNow subscribeReveal
 *   Live rooms         createRoom joinRoom leaveRoom startRoom getRoom submitRoomStep roomTick getRoomReveal rematch
 *   Reveal / social    getReveal laugh report getMyChains getGroupChains deleteMyStep
 *   (28 functions, cloudfunctions/CONTRACT.md section 5; tests/client-units.test.js keeps this table equal to core/schema.js)
 *
 * Modes: 'cloud' (wx.cloud.callFunction) or 'mock' (js/mock-server.js, in memory, same contracts and codes). The mock is
 * the default while build-config `cloudEnv` is empty; a PROD build (envKind 'prod') never constructs the mock server
 * (PO-14): without a cloud env every call fails with SERVER_CONFIG.
 *
 * Function names (TD-35): every callFunction name resolves as `fnPrefix + FN[name]` through the ONE table below. The prefix
 * is '' by default and 'chuanhua_' when build-config's cloudEnv is the shared test env. Nothing else in the game knows a
 * deployed function name. Identity is never sent: the server reads OPENID from the call context.
 */

const schema = require('../core/schema');
const { textFor } = require('../core/codes');
const { wxWatch } = require('./realtime');

/** logical name -> deployed name (before the prefix). The single place to rename a function. */
const FN = {
  getHome: 'getHome',
  agreeRules: 'agreeRules',
  joinGroup: 'joinGroup',
  rollPrompts: 'rollPrompts',
  createChain: 'createChain',
  getChain: 'getChain',
  claimStep: 'claimStep',
  releaseClaim: 'releaseClaim',
  submitStep: 'submitStep',
  createRoom: 'createRoom',
  joinRoom: 'joinRoom',
  leaveRoom: 'leaveRoom',
  startRoom: 'startRoom',
  getRoom: 'getRoom',
  submitRoomStep: 'submitRoomStep',
  roomTick: 'roomTick',
  getRoomReveal: 'getRoomReveal',
  rematch: 'rematch',
  getReveal: 'getReveal',
  revealNow: 'revealNow',
  laugh: 'laugh',
  report: 'report',
  getMyChains: 'getMyChains',
  getGroupChains: 'getGroupChains',
  deleteMyStep: 'deleteMyStep',
  subscribeReveal: 'subscribeReveal',
  grantReward: 'grantReward',
  track: 'track',
};
const NAMES = Object.keys(FN);
const DEFAULT_TIMEOUT_MS = 8000;

function fail(code, message) {
  return { ok: false, code, message: message || textFor(code) };
}

/**
 * Transient server answers. The backend answers BUSY_RETRY when a transaction ran out of attempts under contention
 * (nothing was committed, safe to repeat). Every call retries it a few times with short jittered waits before the caller sees it;
 * the callers treat what is left like a network error (controller isNet). The submits (submitStep / submitRoomStep) also retry
 * INTERNAL: until BUSY_RETRY is everywhere on the server, a lost transaction race answered INTERNAL, and a repeated send is
 * idempotent on the server (ALREADY_SENT). Players never see either code (controller codeText).
 */
const BUSY_CODE = 'BUSY_RETRY';
const SEND_FNS = ['submitStep', 'submitRoomStep'];
const BUSY_DEFAULTS = { tries: 3, baseMs: 150, jitterMs: 200 };

function createApi(opts) {
  opts = opts || {};
  const wx = opts.wx;
  const envKind = opts.envKind || 'dev';
  const wantMock = !opts.cloudEnv && opts.mode !== 'cloud';
  const mode = wantMock ? 'mock' : 'cloud';
  const fnPrefix = opts.fnPrefix || '';
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimeout || setTimeout;
  const clearTimer = opts.clearTimeout || clearTimeout;
  const user = opts.user; // mock mode only: which player this client is (tests run several clients on one mock server)
  const refuse = mode === 'mock' && envKind === 'prod';
  // the mock is required only on this branch: a cloud build never loads js/mock-server.js (QA-2)
  const mock = mode === 'mock' && !refuse ? opts.mockServer || require('./mock-server').createMockServer({ now, mockMediaDelaySec: opts.mockMediaDelaySec }) : null;
  const api = { mode, mock, fnPrefix, NAMES };

  if (mode === 'cloud' && wx && wx.cloud && wx.cloud.init) {
    try {
      wx.cloud.init({ env: opts.cloudEnv, traceUser: false });
    } catch (e) {
      /* calls fail with NETWORK below */
    }
  }

  /** the deployed name of a function (prefix + table entry) */
  api.deployedName = (name) => fnPrefix + FN[name];

  const busy = Object.assign({}, BUSY_DEFAULTS, opts.busyRetry || {});
  const rnd = busy.random || Math.random;
  const isTransient = (name, r) => !!r && r.ok === false && (r.code === BUSY_CODE || (r.code === 'INTERNAL' && SEND_FNS.includes(name)));

  function call(name, data) {
    return callOnce(name, data).then((r) => retryBusy(name, data, r, 1));
  }
  function retryBusy(name, data, r, attempt) {
    if (!isTransient(name, r) || attempt > busy.tries) return r;
    return new Promise((resolve) => setTimer(resolve, Math.round(busy.baseMs * attempt + rnd() * busy.jitterMs))).then(() =>
      callOnce(name, data).then((r2) => retryBusy(name, data, r2, attempt + 1)),
    );
  }

  function callOnce(name, data) {
    if (refuse) return Promise.resolve(fail('SERVER_CONFIG'));
    if (mode === 'mock') {
      return Promise.resolve().then(() => {
        try {
          return mock.call(name, data, user);
        } catch (e) {
          return fail('INTERNAL', String(e && e.message));
        }
      });
    }
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const done = (r) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimer(timer);
        resolve(r);
      };
      const ms = (schema.FUNCTIONS[name] && schema.FUNCTIONS[name].clientMs) || DEFAULT_TIMEOUT_MS;
      timer = setTimer(() => done(fail('TIMEOUT')), ms);
      try {
        if (!wx || !wx.cloud || !wx.cloud.callFunction) return done(fail('NETWORK'));
        wx.cloud.callFunction({
          name: api.deployedName(name),
          data,
          success: (res) => done(res && res.result && typeof res.result === 'object' && typeof res.result.ok === 'boolean' ? res.result : fail('BAD_RESPONSE')),
          fail: (e) => done(fail('NETWORK', (e && e.errMsg) || 'network')),
        });
      } catch (e) {
        done(fail('NETWORK', String(e && e.message)));
      }
    });
  }

  NAMES.forEach((n) => {
    api[n] = (data) => call(n, data && typeof data === 'object' ? data : {});
  });

  /**
   * The realtime listener for the signal document (spec 3A.7): `watch(openid, roomId, {onChange, onError}) -> {close()} | undefined` and the
   * openid to query with. Cloud: the database watch with the platform's '{openid}' placeholder. Mock: srv.realtime (the simulation with the
   * failNext / paused / unsupported hooks) for this client's user. No watch (undefined) = the client polls.
   */
  api.realtimeEnv = () => {
    if (mode === 'mock') {
      const rtm = mock && mock.realtime;
      const watch = rtm
        ? (openid, roomId, h) => {
            if (rtm.unsupported) return undefined;
            return rtm.watch(openid, roomId, h);
          }
        : undefined;
      return { watch, openid: user || (mock && mock.ME) };
    }
    let db = null;
    try {
      db = wx && wx.cloud && wx.cloud.database ? wx.cloud.database() : null;
    } catch (e) {
      db = null;
    }
    return { watch: db ? wxWatch(db, 'chuanhua_room_signals') : undefined, openid: '{openid}' };
  };

  /** dev only: deliver due mock verdicts, expire claims, send notices (the cloud does this on a timer) */
  api.tickMock = () => {
    if (mock) {
      try {
        mock.server.modSweeper();
      } catch (e) {
        /* dev helper */
      }
    }
  };
  return api;
}

module.exports = { BUSY_CODE, createApi, NAMES, FN };
