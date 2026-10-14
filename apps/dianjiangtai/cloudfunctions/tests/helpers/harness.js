'use strict';
// Test harness: stages the cloud functions (+ synced common + a core) in a temp dir, mocks
// wx-server-sdk with an in-memory db, and lets tests call functions as a given openid.
//   DJ_CORE=real  -> stage with apps/dianjiangtai/game/core instead of tests/fake-core
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sync = require('../../scripts/sync-core');
const { FakeDb } = require('./fake-db');

const FAKE_CORE = path.resolve(__dirname, '..', 'fake-core');
const useReal = process.env.DJ_CORE === 'real';
const CORE_SRC = useReal ? sync.DEFAULT_CORE : FAKE_CORE;

let stageRoot = null;
function stage() {
  if (stageRoot) return stageRoot;
  stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-stage-'));
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
  sync.syncAll({ root: stageRoot, coreSrc: CORE_SRC });
  return stageRoot;
}

let current = { db: null, openid: undefined };
const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return current.db; },
  getWXContext() { return { OPENID: current.openid, APPID: 'wx-test', SOURCE: 'wx_client' }; },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk;
  return origLoad.apply(this, arguments);
};

const realNow = Date.now;

function createHarness({ now = Date.UTC(2026, 10, 3, 4, 0, 0) } = {}) {
  const root = stage();
  for (const k of Object.keys(require.cache)) if (k.startsWith(root)) delete require.cache[k];
  const db = new FakeDb();
  let t = now;
  Date.now = () => t;
  const env = {};
  const h = {
    db,
    root,
    setNow(ms) { t = ms; },
    advance(ms) { t += ms; },
    now() { return t; },
    setEnv(k, v) { if (!(k in env)) env[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; },
    /** call a function as `openid` (undefined => a server/timer-style call with no OPENID) */
    call(fn, event, { openid } = {}) {
      const mod = require(path.join(root, fn, 'index.js'));
      current = { db, openid };
      return mod.main(event);
    },
    mod(fn) { return require(path.join(root, fn, 'index.js')); },
    teardown() {
      Date.now = realNow;
      for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
      delete global.__DJ_GATES; delete global.__DJ_GATES_REACH12; delete global.__DJ_GATES_LOG; delete global.__DJ_BOARD_CAP;
    },
  };
  return h;
}

/** Valid actions for a sheet: each round picks the `rank`-th highest-power general of the pool (0 = best). */
function bestActions(rounds, { rank = 0 } = {}) {
  const core = require(path.join(stage(), 'getDaily', 'core', 'content.js')); // fake or real, same API
  const gens = core.getContent(1).generals;
  const slots = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];
  const used = new Set();
  const actions = [];
  rounds.forEach((r, i) => {
    actions.push({ round: i + 1, type: 'flip' });
    const pool = gens.filter((g) => g.faction === r.faction && g.eras.includes(r.era) && !used.has(g.id));
    pool.sort((a, b) => (b.power || 0) - (a.power || 0));
    const pick = pool[Math.min(rank, pool.length - 1)];
    used.add(pick.id);
    actions.push({ round: i + 1, type: 'pick', generalId: pick.id, slot: slots[i] });
  });
  return actions;
}

module.exports = { createHarness, bestActions, FAKE_CORE, CORE_SRC, useReal };
