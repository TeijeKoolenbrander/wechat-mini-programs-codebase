'use strict';
// Cloud-function test harness: stages every function folder (+ synced common + core) into a temp dir, replaces
// `wx-server-sdk` with a fake (database, storage, openapi, context), and lets tests call a function as a given openid
// (or with no openid = timer / push / console). Functions run UNMODIFIED, against the REAL game core, with a controlled
// clock (Date.now) and process.env set per test. Nothing here touches the network.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { AsyncLocalStorage } = require('async_hooks');
const sync = require('../../scripts/sync-core');
const allowanceLib = require(path.join(sync.DEFAULT_CORE, 'allowance'));
const { FakeDb } = require('./fake-db');

const als = new AsyncLocalStorage();

// ---- the fake wx-server-sdk -----------------------------------------------------------------------------------
/** programmable fake of cloud.openapi, cloud storage and the function context */
function makeSdk(state) {
  const ctx = () => als.getStore() || { openid: undefined, fn: null };
  const perm = (api) => {
    const c = ctx();
    if (c.fn && state.permissions[c.fn] && !state.permissions[c.fn].includes(api)) {
      throw Object.assign(new Error(`openapi ${api}: no permission declared in ${c.fn}/config.json`), { errCode: -604101 });
    }
  };
  const call = async (api, params) => {
    perm(api);
    state.calls.push({ api, params: JSON.parse(JSON.stringify(params)), fn: ctx().fn, at: Date.now() });
    const h = state.handlers[api];
    return h(params);
  };
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database: () => state.db,
    getWXContext: () => ({ OPENID: ctx().openid, APPID: 'wx-test', SOURCE: 'wx_client' }),
    async uploadFile({ cloudPath, fileContent }) {
      if (state.failUpload) throw new Error('uploadFile failed');
      const fileID = 'cloud://test-env.bucket/' + cloudPath;
      state.files.set(fileID, Buffer.from(fileContent));
      return { fileID };
    },
    async getTempFileURL({ fileList }) {
      return {
        fileList: fileList.map((f) => (state.files.has(f.fileID)
          ? { fileID: f.fileID, status: 0, tempFileURL: 'https://tmp.test/' + encodeURIComponent(f.fileID) + '?maxAge=' + f.maxAge, maxAge: f.maxAge }
          : { fileID: f.fileID, status: -503002, errMsg: 'file not exist' })),
      };
    },
    async deleteFile({ fileList }) {
      if (state.failDelete) throw new Error('deleteFile failed');
      return { fileList: fileList.map((id) => ({ fileID: id, status: state.files.delete(id) ? 0 : -503002, errMsg: 'ok' })) };
    },
    /**
     * wx-server-sdk getOpenData({list:[cloudID]}): the fake platform decrypts `cid-<chat>-<openGId>` (see cid()). Programmable via
     * state.openData: Map cloudID -> item, or a function. 'cid-bad-...' answers an item with errCode, 'cid-throw-...' throws.
     */
    async getOpenData({ list }) {
      state.openDataCalls.push(list.slice());
      return {
        list: list.map((id) => {
          if (state.openData.has(id)) return state.openData.get(id);
          if (/^cid-throw-/.test(id)) throw new Error('getOpenData: cloudID expired');
          if (/^cid-bad-/.test(id)) return { cloudID: id, errCode: 87009, errMsg: 'invalid cloudID' };
          const m = /^cid-([0-9]+|x)-(.*)$/.exec(id);
          if (!m) return { cloudID: id, errCode: 87009, errMsg: 'invalid cloudID' };
          return { cloudID: id, data: { opengid: m[2], chat_type: m[1] === 'x' ? undefined : Number(m[1]), watermark: { appid: 'wx-test', timestamp: 1 } } };
        }),
      };
    },
    openapi: {
      wxa: {
        game: {
          contentSpam: {
            mediaCheckSync: (p) => call('wxa.game.contentSpam.mediaCheckSync', p),
            msgSecCheck: (p) => call('wxa.game.contentSpam.msgSecCheck', p),
          },
        },
      },
      security: {
        msgSecCheck: (p) => call('security.msgSecCheck', p),
        mediaCheckAsync: (p) => call('security.mediaCheckAsync', p),
      },
      updatableMessage: {
        createActivityId: (p) => call('updatableMessage.createActivityId', p),
        setUpdatableMsg: (p) => call('updatableMessage.setUpdatableMsg', p),
      },
      subscribeMessage: { send: (p) => call('subscribeMessage.send', p) },
    },
  };
  return sdk;
}

function defaultHandlers(state) {
  let trace = 0;
  let act = 0;
  return {
    'security.msgSecCheck': async () => ({ errCode: 0, errMsg: 'ok', result: { suggest: 'pass', label: 100 }, detail: [] }),
    'wxa.game.contentSpam.msgSecCheck': async () => ({ errCode: 0, errMsg: 'ok', trace_id: 'gt-1', result: { suggest: 'pass', label: 100 }, detail: [] }),
    'wxa.game.contentSpam.mediaCheckSync': async () => ({ errCode: 0, errMsg: 'ok', trace_id: 'gm-1', result: { suggest: 'pass', label: 100 }, detail: [] }),
    'security.mediaCheckAsync': async () => ({ errCode: 0, errMsg: 'ok', trace_id: 'trace-' + ++trace }),
    'updatableMessage.createActivityId': async () => ({ errCode: 0, activityId: 'act-' + ++act, expirationTime: Date.now() + 86400e3 }),
    'updatableMessage.setUpdatableMsg': async () => ({ errCode: 0 }),
    'subscribeMessage.send': async () => ({ errCode: 0 }),
  };
}

// ---- staging --------------------------------------------------------------------------------------------------
let stageRoot = null;
function stage() {
  if (stageRoot) return stageRoot;
  // The copies in every function folder must be current: `npm test` syncs first (pretest). Test files run in parallel
  // processes, so no file writes the repo here; it only verifies.
  const drift = sync.checkDrift();
  if (drift.length) throw new Error('common/ or core/ copies are stale, run `npm run sync`:\n' + drift.slice(0, 5).join('\n'));
  stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-fns-'));
  for (const fn of sync.listFunctions()) {
    const src = path.join(sync.CF_ROOT, fn);
    for (const rel of sync.walk(src)) {
      fs.mkdirSync(path.dirname(path.join(stageRoot, fn, rel)), { recursive: true });
      fs.copyFileSync(path.join(src, rel), path.join(stageRoot, fn, rel));
    }
  }
  return stageRoot;
}

let currentSdk = null;
const origLoad = Module._load;
Module._load = function patched(request) {
  if (request === 'wx-server-sdk' && currentSdk) return currentSdk;
  return origLoad.apply(this, arguments);
};

const TIMER_FNS = ['modSweeper', 'cleanup', 'roomSweeper'];
/** test cloudID the fake platform can decrypt: cid-<chat_type|x>-<openGId> (x = no chat_type). Real cloudIDs are opaque. */
const cid = (openGId, chatType = 3) => 'cid-' + (chatType === null ? 'x' : chatType) + '-' + openGId;
const realNow = Date.now;
const ENV_KEYS = ['ENV_KIND', 'MODERATION_MODE', 'MOD_TEXT_DAILY_BUDGET', 'MOD_IMAGE_DAILY_BUDGET', 'MOCK_SYNC_DELAY_MS', 'MOCK_MEDIA_DELAY_SEC', 'ADMIN_OPENIDS', 'GROUP_REF_PEPPER', 'PUSH_TOKEN', 'PUSH_AES_KEY'];

/**
 * @param {{now?:number, env?:object}} [o] env: process.env overrides (default: dev + mock moderation, pepper set)
 */
function createHarness(o) {
  o = o || {};
  const root = stage();
  for (const k of Object.keys(require.cache)) if (k.startsWith(root)) delete require.cache[k];
  const state = { db: new FakeDb(), files: new Map(), calls: [], handlers: {}, permissions: {}, failUpload: false, failDelete: false, openData: new Map(), openDataCalls: [], rollSeq: 0 };
  Object.assign(state.handlers, defaultHandlers(state));
  for (const fn of sync.listFunctions()) {
    const f = path.join(root, fn, 'config.json');
    const cfg = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    state.permissions[fn] = ((cfg.permissions || {}).openapi) || [];
  }
  // The v1 suites were written for the image pipeline that is now the dormant FALLBACK (imageMode 'async', spec 6.10): they run with that switch on.
  // The new suites (rooms, sync moderation, sync chains) pass `imageMode: 'sync'`, the product default.
  state.legacyAsync = (o.imageMode || 'async') === 'async';
  const rawPut = state.db.put.bind(state.db);
  state.db.put = (name, doc) => {
    if (state.legacyAsync && name === 'chuanhua_app_config' && doc && !doc.moderation) doc = Object.assign({}, doc, { moderation: { imageMode: 'async', textApi: 'general' } });
    return rawPut(name, doc);
  };
  if (state.legacyAsync) state.db.put('chuanhua_app_config', { _id: 'live' });
  const sdk = makeSdk(state);
  currentSdk = sdk;
  let t = o.now === undefined ? Date.UTC(2026, 10, 3, 4, 0, 0) : o.now; // 2026-11-03 12:00 BJT
  Date.now = () => t;
  const saved = {};
  const setEnv = (k, v) => {
    if (!(k in saved)) saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  const env = Object.assign({ ENV_KIND: 'dev', MODERATION_MODE: 'mock', MOCK_SYNC_DELAY_MS: '0', GROUP_REF_PEPPER: 'test-pepper-0123456789-abcdefghijklmnop' }, o.env || {});
  for (const k of ENV_KEYS) setEnv(k, env[k]);

  const h = {
    db: state.db,
    sdk,
    state,
    root,
    files: state.files,
    /** every openapi call so far: {api, params, fn, at} */
    get calls() { return state.calls; },
    setNow(ms) { t = ms; },
    advance(ms) { t += ms; },
    now() { return t; },
    setEnv,
    /** program an openapi function: h.handle('security.msgSecCheck', async (params) => ({...})) */
    handle(api, fn) { state.handlers[api] = fn; },
    module(fn) {
      currentSdk = sdk;
      return require(path.join(root, fn, 'index.js'));
    },
    /** call a function as `openid`; undefined = no OPENID (timer / push / console) */
    call(fn, event, { openid, raw } = {}) {
      currentSdk = sdk;
      const mod = require(path.join(root, fn, 'index.js'));
      // createChain takes a preset prompt only from the caller's current server roll (F-2): the v1 scenarios say `promptId` and get a roll seeded for them
      if (fn === 'createChain' && openid && event && typeof event.promptId === 'string' && event.rollId === undefined) {
        const p = state.db.get('chuanhua_players', openid) || allowanceLib.newPlayer(openid, t);
        p.roll = { rollId: 'rtest' + String(++state.rollSeq).padStart(6, '0'), ctx: 'chain', ids: [event.promptId], rerolls: 0, shownIds: [event.promptId], used: false, at: t };
        state.db.put('chuanhua_players', p);
        event = Object.assign({}, event, { rollId: p.roll.rollId });
      }
      // the platform's timer trigger event; `raw: true` sends the event untouched (to prove the marker is required)
      if (TIMER_FNS.includes(fn) && !openid && !raw && event && event.Type === undefined) event = Object.assign({ Type: 'Timer', TriggerName: 'test' }, event);
      return als.run({ openid, fn }, () => mod.main(event));
    },
    /** drop the module-level caches (app_config etc.) of every staged function */
    resetCaches() {
      for (const fn of sync.listFunctions()) {
        const m = path.join(root, fn, 'common', 'appconfig.js');
        if (require.cache[m]) require.cache[m].exports.reset();
      }
    },
    teardown() {
      Date.now = realNow;
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      if (currentSdk === sdk) currentSdk = null;
    },
  };
  return h;
}

module.exports = { createHarness, stage, als, cid };
