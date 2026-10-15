'use strict';
// Test harness: stages the cloud functions (+ synced common + the FAKE core) in a temp dir, mocks
// wx-server-sdk with an in-memory db, and lets tests call functions as a given openid.
// The fake core (tests/fake-core) stands in for minigame-dev's real core until it lands.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sync = require('../../scripts/sync-core');
const { FakeDb } = require('./fake-db');
const fakeContent = require('../fake-core/content');

let stageRoot = null;
function stage() {
  if (stageRoot) return stageRoot;
  stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbyi-stage-'));
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
  sync.syncAll({ root: stageRoot, coreSrc: sync.FAKE_CORE });
  return stageRoot;
}

let current = { db: null, openid: undefined, sent: [] };
const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return current.db; },
  getWXContext() { return { OPENID: current.openid, APPID: 'wx-test', SOURCE: 'wx_client' }; },
  openapi: {
    subscribeMessage: {
      async send(msg) {
        if (current.sendFails) { const e = new Error('send failed'); e.errCode = 43101; throw e; }
        current.sent.push(msg);
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
const HOUR = 3600e3;
/** 2026-10-15 12:00 Beijing time (a Thursday) */
const NOON = Date.UTC(2026, 9, 15, 4, 0, 0);

function createHarness({ now = NOON } = {}) {
  const root = stage();
  for (const k of Object.keys(require.cache)) if (k.startsWith(root)) delete require.cache[k];
  const db = new FakeDb();
  let t = now;
  Date.now = () => t;
  const env = {};
  const h = {
    db,
    root,
    sent: current.sent = [],
    setNow(ms) { t = ms; },
    advance(ms) { t += ms; },
    now() { return t; },
    setEnv(k, v) { if (!(k in env)) env[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; },
    failSends(v = true) { current.sendFails = v; },
    /** call a function as `openid` (undefined => a server/timer-style call with no OPENID) */
    call(fn, event, { openid } = {}) {
      const mod = require(path.join(root, fn, 'index.js'));
      current = { db, openid, sent: h.sent, sendFails: current.sendFails };
      return mod.main(event);
    },
    /** load n synthetic daily facts per measure into daily_facts (content version 1) */
    loadDailyFacts(perMeasure = 20) {
      const facts = fakeContent.synth('daily', perMeasure, 'D');
      for (const f of facts) db.put('daily_facts', { ...f, _id: `v1_${f.id}`, contentVersion: 1 });
      return facts;
    },
    core(name) { return require(path.join(root, 'getDaily', 'core', name)); },
    mod(fn, rel) { return require(path.join(root, fn, rel)); },
    /** patch the staged core config (e.g. impossible gates); modules are re-required per harness */
    patchConfig(fn) {
      for (const f of sync.listFunctions()) fn(require(path.join(root, f, 'core', 'config.js')).getConfig(1));
    },
    teardown() {
      Date.now = realNow;
      for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    },
  };
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-0123456789abcdef0123456789');
  h.setEnv('LAUNCH_DATE_KEY', undefined);
  return h;
}

let n = 0;
const runId = () => `run${String(++n).padStart(6, '0')}abcd`;

/** deck + facts for a date, as the test oracle (never used by the code under test) */
function oracle(h, dateKey) {
  const deck = h.db.all('daily_decks').find((d) => d._id === dateKey);
  const facts = Object.fromEntries(h.db.all('daily_facts').map((f) => [f.id, f]));
  const correct = (k) => {
    const q = deck.questions[k - 1];
    return facts[q.b].value > facts[q.a].value ? 'hi' : 'lo';
  };
  return { deck, facts, correct, wrong: (k) => (correct(k) === 'hi' ? 'lo' : 'hi') };
}

/**
 * Play a ranked/friendly daily run as `openid`: `right` correct answers, then a miss (or clear if right >= 40).
 * Returns {start, steps, last}.
 */
async function playDaily(h, openid, { right = 5, clientRunId = runId(), startEvent = null, ms = 2500 } = {}) {
  const d = await h.call('getDaily', {}, { openid });
  if (!d.ok) throw new Error('getDaily failed ' + JSON.stringify(d));
  const start = await h.call('startRun', startEvent || { mode: 'daily', clientRunId }, { openid });
  if (!start.ok) return { start, steps: [], last: start };
  const dateKey = start.dateKey;
  const o = oracle(h, dateKey);
  const steps = [];
  let last = null;
  for (let k = start.k; k <= 40; k++) {
    const choice = k - start.k < right ? o.correct(k) : o.wrong(k);
    last = await h.call('answer', { clientRunId: start.clientRunId, k, choice, ms }, { openid });
    steps.push(last);
    if (!last.ok || last.ended) break;
  }
  return { start, steps, last };
}

function allStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}
function allKeys(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); allKeys(x, out); }
  return out;
}

module.exports = { createHarness, oracle, playDaily, runId, allStrings, allKeys, NOON, HOUR };
