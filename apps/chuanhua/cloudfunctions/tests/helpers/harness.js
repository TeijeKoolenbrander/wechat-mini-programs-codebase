'use strict';
// Test harness: stages the cloud functions (+ synced common + the fake core) in a temp dir, mocks
// wx-server-sdk with an in-memory db and a scriptable openapi, and lets tests call functions as a
// given openid with a controlled clock.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sync = require('../../scripts/sync-core');
const { FakeDb } = require('./fake-db');

const FAKE_CORE = path.resolve(__dirname, '..', 'fake-core');

const stageRoots = {};
/** realCore: stage with apps/chuanhua/game/core (the client contract test) instead of the test double */
function stage(realCore) {
  const key = realCore ? 'real' : 'fake';
  if (stageRoots[key]) return stageRoots[key];
  const stageRoot = (stageRoots[key] = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-stage-' + key + '-')));
  for (const fn of sync.listFunctions()) {
    const src = path.join(sync.CF_ROOT, fn);
    for (const rel of sync.walk(src)) {
      if (rel.startsWith('common/') || rel.startsWith('core/') || rel.startsWith('node_modules/')) continue;
      fs.mkdirSync(path.dirname(path.join(stageRoot, fn, rel)), { recursive: true });
      fs.copyFileSync(path.join(src, rel), path.join(stageRoot, fn, rel));
    }
  }
  sync.copyDir(path.join(sync.CF_ROOT, 'common'), path.join(stageRoot, 'common'));
  sync.syncAll({ root: stageRoot, coreSrc: realCore ? sync.DEFAULT_CORE : FAKE_CORE });
  return stageRoot;
}

let current = { db: null, openid: undefined, sdk: null, source: 'wx_client' };
const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return current.db; },
  getWXContext() { return { OPENID: current.openid, APPID: 'wx-test', SOURCE: current.source }; },
  uploadFile: (a) => current.sdk.run('uploadFile', a),
  getTempFileURL: (a) => current.sdk.run('getTempFileURL', a),
  deleteFile: (a) => current.sdk.run('deleteFile', a),
  downloadFile: (a) => current.sdk.run('downloadFile', a),
  openapi: {
    security: {
      msgSecCheck: (a) => current.sdk.run('msgSecCheck', a),
      mediaCheckAsync: (a) => current.sdk.run('mediaCheckAsync', a),
      imgSecCheck: (a) => current.sdk.run('imgSecCheck', a),
    },
    updatableMessage: {
      createActivityId: (a) => current.sdk.run('createActivityId', a),
      setUpdatableMsg: (a) => current.sdk.run('setUpdatableMsg', a),
    },
    subscribeMessage: { send: (a) => current.sdk.run('send', a) },
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk;
  return origLoad.apply(this, arguments);
};

/** scriptable openapi + storage double */
function makeSdk() {
  const files = new Map();
  let traceSeq = 0;
  const s = {
    calls: {},
    files,
    impl: {
      msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'pass', label: 100 } }),
      mediaCheckAsync: async () => ({ errCode: 0, traceId: `trace${++traceSeq}` }),
      imgSecCheck: async () => ({ errCode: 0 }),
      createActivityId: async () => ({ activityId: 'act1' }),
      setUpdatableMsg: async () => ({ errCode: 0 }),
      send: async () => ({ errCode: 0 }),
      uploadFile: async ({ cloudPath, fileContent }) => {
        const fileID = `cloud://test-env/${cloudPath}`;
        files.set(fileID, fileContent);
        return { fileID };
      },
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map((f) => ({ fileID: f.fileID, tempFileURL: `https://tmp.example/${encodeURIComponent(f.fileID)}?maxAge=${f.maxAge}`, status: 0 })),
      }),
      deleteFile: async ({ fileList }) => ({
        fileList: fileList.map((id) => { const had = files.delete(id); return { fileID: id, status: had ? 0 : -1, errMsg: had ? 'ok' : 'STORAGE_FILE_NONEXIST' }; }),
      }),
      downloadFile: async ({ fileID }) => ({ fileContent: files.get(fileID) }),
    },
    async run(name, args) {
      (s.calls[name] = s.calls[name] || []).push(args);
      return s.impl[name](args);
    },
    count(name) { return (s.calls[name] || []).length; },
    on(name, fn) { s.impl[name] = fn; },
  };
  return s;
}

const realNow = Date.now;
const ENV_KEYS = ['ENV_KIND', 'MODERATION_MODE', 'GROUP_REF_PEPPER', 'MOD_TEXT_DAILY_BUDGET', 'MOCK_MEDIA_DELAY_SEC', 'ADMIN_OPENIDS',
  'PUSH_TOKEN', 'PUSH_AES_KEY', 'PUSH_ALLOW_OPENID', 'MEDIA_CHECK_ROUTE', 'LAUNCH_DATE_KEY'];

function createHarness({ now = Date.UTC(2026, 10, 3, 4, 0, 0), env = {}, realCore = false } = {}) { // 2026-11-03 12:00 BJT
  const root = stage(realCore);
  for (const k of Object.keys(require.cache)) if (k.startsWith(root)) delete require.cache[k];
  const db = new FakeDb();
  const sdk = makeSdk();
  let t = now;
  Date.now = () => t;
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { ENV_KIND: 'dev', MODERATION_MODE: 'mock', GROUP_REF_PEPPER: 'test-pepper-0123456789abcdef0123456789', LAUNCH_DATE_KEY: '20261101' }, env);
  const h = {
    db, sdk, root,
    setNow(ms) { t = ms; },
    advance(ms) { t += ms; },
    now() { return t; },
    setEnv(k, v) { if (v === undefined) delete process.env[k]; else process.env[k] = v; },
    /** call a function as `openid` (undefined => a server/timer/console-style call with no OPENID) */
    call(fn, event, { openid, source } = {}) {
      const mod = require(path.join(root, fn, 'index.js'));
      current = { db, openid, sdk, source: source || (openid ? 'wx_client' : 'wx_server') };
      return mod.main(event);
    },
    mod(rel) { return require(path.join(root, rel)); },
    /** run a staged common/ module's function with the harness context active */
    withCtx(fn) { current = { db, openid: undefined, sdk, source: 'wx_server' }; return fn(); },
    teardown() {
      Date.now = realNow;
      for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    },
  };
  return h;
}

module.exports = { createHarness, FAKE_CORE };
