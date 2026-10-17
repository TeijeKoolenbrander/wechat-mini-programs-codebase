'use strict';
// Runs the REAL cloud functions (index.js of every function folder, as synced) against the fake database and a fake
// wx-server-sdk. Nothing is mocked inside the functions: only the SDK boundary (identity, database, openapi) and the
// clock. The functions are staged into a temp directory through the real sync script, so the test also proves that
// `npm run sync` ships a runnable bundle (common/ + core/ + the content library + schedule.v1.js when present).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const sync = require('../../scripts/sync-core');
const { FakeDb, clone } = require('./fake-db');
const { decodeMockCloudID } = require('../../../game/js/mock-server');

const GAME_CORE = path.resolve(sync.CF_ROOT, '..', 'game', 'core');
const PEPPER = 'test-pepper-0123456789abcdef0123456789abcdef';

const sdk = {
  DYNAMIC_CURRENT_ENV: 'dynamic-env',
  state: {
    openid: null, sent: [], failSend: null, db: null, openData: [], mod: { game: null, general: null }, modCalls: [],
    async runMod(api, params) {
      sdk.state.modCalls.push({ api, params: clone(params) });
      const h = sdk.state.mod[api];
      if (typeof h === 'function') return h(params);
      return { errCode: 0, errMsg: 'ok', result: { suggest: 'pass', label: 100 }, trace_id: 'T-' + api + '-' + sdk.state.modCalls.length };
    },
  },
  init() {},
  getWXContext() {
    return { OPENID: sdk.state.openid, APPID: 'wxtest', ENV: 'test' };
  },
  database() {
    return sdk.state.db;
  },
  /** cloud.getOpenData as the platform answers it: a list item per cloudID, {cloudID, json} or {cloudID, errCode, errMsg} (M1) */
  async getOpenData(arg) {
    sdk.state.openData.push(arg);
    const list = (arg && arg.list) || [];
    return {
      list: list.map((id) => {
        const d = decodeMockCloudID(id);
        if (!d) return { cloudID: id, errCode: -601034, errMsg: 'invalid or expired cloudID' };
        return { cloudID: id, data: Object.assign({ watermark: { appid: 'wxtest', timestamp: 1 } }, d) };
      }),
    };
  },
  openapi: {
    // the two content-security calls of setClue (D-2). state.mod.game / state.mod.general = (params) => response | Promise (a test sets
    // them; the default answers `pass`). Every call is recorded in state.modCalls with its params.
    wxa: {
      game: {
        contentSpam: {
          async msgSecCheck(params) {
            return sdk.state.runMod('game', params);
          },
        },
      },
    },
    security: {
      async msgSecCheck(params) {
        return sdk.state.runMod('general', params);
      },
    },
    subscribeMessage: {
      async send(msg) {
        if (sdk.state.failSend) throw Object.assign(new Error('send failed'), { errCode: sdk.state.failSend });
        sdk.state.sent.push(clone(msg));
        return { errCode: 0 };
      },
    },
  },
};

let hooked = false;
function hookSdk() {
  if (hooked) return;
  hooked = true;
  const orig = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'wx-server-sdk') return sdk;
    return orig.call(this, request, parent, isMain);
  };
}

/**
 * Stage the cloudfunctions tree into a temp dir and sync common/ + core into every function.
 * @param {{schedule?:object|null}} o schedule: written as core/content/schedule.v1.js in a temp copy of the game core
 */
function stage(o) {
  o = o || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-real-'));
  fs.cpSync(path.join(sync.CF_ROOT, 'common'), path.join(root, 'common'), { recursive: true });
  for (const fn of sync.listFunctions(sync.CF_ROOT)) {
    fs.mkdirSync(path.join(root, fn));
    for (const f of ['index.js', 'package.json', 'function.config.json', 'config.json']) {
      const src = path.join(sync.CF_ROOT, fn, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, fn, f));
    }
  }
  const coreSrc = path.join(root, '_core_src');
  fs.cpSync(GAME_CORE, coreSrc, { recursive: true });
  fs.rmSync(path.join(coreSrc, 'content', 'schedule.v1.js'), { force: true });
  if (o.schedule) fs.writeFileSync(path.join(coreSrc, 'content', 'schedule.v1.js'), 'module.exports = ' + JSON.stringify(o.schedule) + ';\n');
  const log = console.warn;
  console.warn = () => {};
  try {
    sync.syncAll({ root, coreSrc });
  } finally {
    console.warn = log;
  }
  return { root, coreSrc, dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/**
 * @param {{stage:{root:string}, clock:{now:()=>number}, appConfig?:object|null, env?:object}} o
 */
function createRealBackend(o) {
  hookSdk();
  const db = new FakeDb();
  sdk.state.db = db;
  sdk.state.sent = [];
  sdk.state.openData = [];
  sdk.state.failSend = null;
  sdk.state.openid = null;
  sdk.state.mod = { game: null, general: null };
  sdk.state.modCalls = [];
  process.env.GROUP_REF_PEPPER = PEPPER;
  process.env.KD_CACHE_SEC = '0';
  process.env.KD_EVENT_SAMPLE_EVERY = '1';
  delete process.env.LAUNCH_DATE_KEY;
  // typed-clue moderation: the dev + mock rig by default (the mock words, no delay); a test overrides through o.env
  process.env.ENV_KIND = 'dev';
  process.env.MODERATION_MODE = 'mock';
  process.env.MOCK_SYNC_DELAY_MS = '0';
  delete process.env.MOD_TEXT_DAILY_BUDGET;
  delete process.env.ADMIN_OPENIDS;
  Object.assign(process.env, o.env || {});
  const realNow = Date.now;
  Date.now = () => o.clock.now();
  if (o.appConfig) db.put('kedupan_app_config', { _id: 'live', ...o.appConfig });
  const mains = {};
  const main = (name) => {
    if (!mains[name]) mains[name] = require(path.join(o.stage.root, name, 'index.js')).main;
    return mains[name];
  };
  const be = {
    kind: 'real',
    db,
    sdk,
    /** a client call as `openid` (the trusted context identity); openid null = no identity */
    async callAs(openid, name, data) {
      const m = main(name);
      sdk.state.openid = openid;
      const p = m(data === undefined ? {} : clone(data), {});
      return clone(await p);
    },
    async runTimer(name) {
      const m = main(name);
      sdk.state.openid = null;
      // what the platform sends on a timer firing (L3): functions refuse a call without this marker
      return clone(await m({ Type: 'Timer', TriggerName: name + 'Timer', Time: new Date(o.clock.now()).toISOString(), Message: '' }, {}));
    },
    dispose() {
      Date.now = realNow;
    },
  };
  return be;
}

module.exports = { stage, createRealBackend, sdk, PEPPER, GAME_CORE };
