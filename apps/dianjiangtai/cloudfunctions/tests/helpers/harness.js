'use strict';
// Test harness: stages the cloud functions (+ synced common + a core) in a temp dir, mocks
// wx-server-sdk with an in-memory db, and lets tests call functions as a given openid.
// The staged functions run against the REAL game core (apps/dianjiangtai/game/core).
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sync = require('../../scripts/sync-core');
const { FakeDb } = require('./fake-db');
const OPTIMAL_SEEDS = require('../fixtures/optimal-seeds.json');

const CORE_SRC = sync.DEFAULT_CORE;

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
    sdk: fakeSdk,
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
    /** replace gates.acceptDailySeed in every staged function (real acceptance is ~0.4%). Modules are
     *  re-required per harness, so patches never leak between tests. */
    patchGates(accept = () => true) {
      for (const fn of sync.listFunctions()) {
        const dir = path.join(root, fn, 'core');
        const gates = require(path.join(dir, 'gates.js'));
        const sheet = require(path.join(dir, 'sheet.js'));
        const search = require(path.join(dir, 'search.js'));
        gates.acceptDailySeed = (seed) => {
          if (global.__DJ_GATES_LOG) global.__DJ_GATES_LOG.push(seed);
          const rounds = sheet.buildSheet(seed, 1);
          const ok0 = !!accept(seed);
          // acceptance depends ONLY on the predicate (deterministic attempt counts); an undraftable sheet gets a stand-in best
          const real = search.bestLineup(seed, 1, rounds.map((r) => ({ faction: r.faction, era: r.era })), { stopAt12: true });
          const best = real || { lineup: OPTIMAL_SEEDS[0].lineup, record: { w: 12, l: 0 } };
          const ok = ok0;
          const gatesRec = { optimal: best ? best.record : { w: 0, l: 12 }, greedyRate: 0.02, randomRate: 0, K: 400, gateVersion: 1, relaxed: false };
          return ok ? { accepted: true, gates: gatesRec, best, rounds } : { accepted: false, gates: gatesRec };
        };
      }
    },
    /** override boardListCap in the staged live config */
    setBoardCap(n) {
      for (const fn of sync.listFunctions()) {
        const c = require(path.join(root, fn, 'core', 'config.js'));
        c.getConfig(c.LATEST_CONFIG_VERSION).boardListCap = n;
      }
    },
    mod(fn) { return require(path.join(root, fn, 'index.js')); },
    teardown() {
      Date.now = realNow;
      for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    },
  };
  h.patchGates(); // default: every candidate passes (the real gate accepts ~0.4% of seeds)
  return h;
}

/**
 * Valid actions for a sheet, produced by the REAL draft engine (so auto-reflips and fallbacks are honoured).
 * Each round picks the `rank`-th strongest (stat total) general of the pool. opts.respinFirst: use the free
 * faction re-spin in round 1 when it is available; opts.mode: daily|free|challenge.
 */
function bestActions(rounds, { rank = 0, mode = 'daily', respinFirst = false, prelude = [] } = {}) {
  const dir = path.join(stage(), 'getDaily', 'core');
  const draft = require(path.join(dir, 'draft.js'));
  const content = require(path.join(dir, 'content.js'));
  const c = content.getContent(1);
  const total = (id) => Object.values(c.byId[id].stats).reduce((a, b) => a + b, 0);
  const run = draft.createRun({ contentVersion: 1, mode, rounds });
  const actions = [];
  const act = (a) => {
    const r = draft.apply(run, a);
    if (!r.ok) throw new Error('bestActions: ' + r.reason + ' ' + JSON.stringify(a));
    actions.push(a);
  };
  for (let i = 1; i <= 5; i++) {
    if (i > 1) draft.nextRound(run);
    act({ round: i, type: 'flip' });
    if (i === 1 && respinFirst) act({ round: 1, type: 'respinFaction' });
    if (i === 1) for (const pre of prelude) act({ round: 1, ...pre });
    const pool = draft.currentPool(run).map((idx) => c.roster[idx]).sort((a, b) => total(b) - total(a) || (a < b ? -1 : 1));
    act({ round: i, type: 'pick', generalId: pool[Math.min(rank, pool.length - 1)], slot: content.SLOTS[i - 1] });
  }
  return actions;
}

module.exports = { createHarness, bestActions, CORE_SRC, OPTIMAL_SEEDS };
