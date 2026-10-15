'use strict';
// Test harness: stages the cloud functions (+ synced common + a core) in a temp dir, mocks wx-server-sdk with an
// in-memory db and a recording subscribeMessage.send, and lets tests call functions as a given openid.
// The core is whatever scripts/sync-core.js resolves (real apps/kedupan/game/core, else tests/fake-core).
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sync = require('../../scripts/sync-core');
const { FakeDb } = require('./fake-db');

let stageRoot = null;
function stage() {
  if (stageRoot) return stageRoot;
  stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-stage-'));
  fs.mkdirSync(path.join(stageRoot, 'common'));
  for (const fn of sync.listFunctions()) {
    const src = path.join(sync.CF_ROOT, fn);
    for (const rel of sync.walk(src)) {
      if (rel.startsWith('common/') || rel.startsWith('core/') || rel.startsWith('node_modules/')) continue;
      fs.mkdirSync(path.dirname(path.join(stageRoot, fn, rel)), { recursive: true });
      fs.copyFileSync(path.join(src, rel), path.join(stageRoot, fn, rel));
    }
  }
  sync.copyDir(path.join(sync.CF_ROOT, 'common'), path.join(stageRoot, 'common'));
  sync.syncAll({ root: stageRoot, coreSrc: sync.DEFAULT_CORE });
  return stageRoot;
}

const state = { db: null, openid: undefined, sent: [], sendError: null };
const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return state.db; },
  getWXContext() { return { OPENID: state.openid, APPID: 'wx-test', SOURCE: 'wx_client' }; },
  openapi: {
    subscribeMessage: {
      async send(args) {
        if (state.sendError) throw Object.assign(new Error('send failed'), { errCode: state.sendError });
        state.sent.push(args);
        return { errCode: 0 };
      },
    },
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk;
  return origLoad.apply(this, arguments);
};

const realNow = Date.now;
const DAY = 86400000;
/** 2026-11-03 12:00 Beijing time (04:00 UTC) */
const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);

function createHarness({ now = T0 } = {}) {
  const root = stage();
  for (const k of Object.keys(require.cache)) if (k.startsWith(root)) delete require.cache[k];
  const db = new FakeDb();
  state.db = db;
  state.sent = [];
  state.sendError = null;
  let t = now;
  Date.now = () => t;
  const env = {};
  const h = {
    db, root, state,
    get sent() { return state.sent; },
    setSendError(code) { state.sendError = code; },
    setNow(ms) { t = ms; },
    advance(ms) { t += ms; },
    now() { return t; },
    setEnv(k, v) { if (!(k in env)) env[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; },
    /** call a function as `openid` (undefined => a server/timer-style call with no OPENID) */
    call(fn, event, { openid } = {}) {
      const mod = require(path.join(root, fn, 'index.js'));
      state.db = db;
      state.openid = openid;
      return mod.main(event);
    },
    mod(fn, file) { return require(path.join(root, fn, ...(file || ['index.js']))); },
    /** BJT wall clock helper */
    bjt(y, mo, d, hh = 0, mm = 0, ss = 0) { return Date.UTC(y, mo - 1, d, hh, mm, ss) - 8 * 3600e3; },
    teardown() {
      Date.now = realNow;
      for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
      const g = require(path.join(root, 'getDaily', 'common', 'groups.js'));
      g.clearCache();
    },
  };
  h.setEnv('LAUNCH_DATE_KEY', '20261101');
  return h;
}

/** play cards 0..n-1 of today's daily for `openid` with the given positions */
async function play(h, openid, positions, extra = {}) {
  const dateKey = extra.dateKey || require(path.join(h.root, 'getDaily', 'common', 'coreapi.js')).dateKeyAt(h.now());
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    out.push(await h.call('submitCard', { dateKey, idx: i, pos: positions[i], ...(extra.groupRef ? { groupRef: extra.groupRef } : {}) }, { openid }));
  }
  return out;
}

module.exports = { createHarness, play, T0, DAY };
