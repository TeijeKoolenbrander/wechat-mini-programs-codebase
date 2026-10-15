'use strict';
// Test harness: stages the cloud functions (+ synced common + a fake core + fixture data) in a temp dir,
// mocks wx-server-sdk with an in-memory db, and lets tests call functions as a given openid.
// The real pipeline data and the real game core are NOT needed: fixtures follow their documented formats.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sync = require('../../scripts/sync-core');
const { FakeDb } = require('./fake-db');
const fx = require('./fixtures');

const stages = new Map(); // V -> {root, words}

function stage(V) {
  if (stages.has(V)) return stages.get(V);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-stage-'));
  const words = fx.makeWords(V);
  const fns = sync.listFunctions();
  for (const fn of fns) {
    const src = path.join(sync.CF_ROOT, fn);
    for (const rel of sync.walk(src)) {
      if (/^(common|core|data|node_modules)\//.test(rel)) continue;
      fs.mkdirSync(path.dirname(path.join(root, fn, rel)), { recursive: true });
      fs.copyFileSync(path.join(src, rel), path.join(root, fn, rel));
    }
    sync.copyDir(path.join(sync.CF_ROOT, 'common'), path.join(root, fn, 'common'));
    // fake core: only what coreapi.js documents it reads
    fs.mkdirSync(path.join(root, fn, 'core'), { recursive: true });
    fs.writeFileSync(path.join(root, fn, 'core', 'starters.js'), `module.exports = ${JSON.stringify(words.slice(0, 30))};\n`);
    fs.writeFileSync(path.join(root, fn, 'core', 'config.js'), 'module.exports = { LATEST_CONFIG_VERSION: 1 };\n');
    // fixture data
    fs.mkdirSync(path.join(root, fn, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, fn, 'data', 'manifest.json'), JSON.stringify({ vocabVersion: 1, gateVersion: 1, configVersion: 1 }));
    fs.writeFileSync(path.join(root, fn, 'data', 'vocab.v1.txt'), words.join('\n') + '\n');
    fs.writeFileSync(path.join(root, fn, 'data', 'near.v1.bin'), fx.makeNearBuffer(V));
  }
  const s = { root, words };
  stages.set(V, s);
  return s;
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
const DAY = 86400000;
// 2026-11-03 04:00 UTC = 12:00 BJT on 20261103
const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);

function createHarness({ now = T0, V = 120 } = {}) {
  const { root, words } = stage(V);
  for (const k of Object.keys(require.cache)) if (k.startsWith(root)) delete require.cache[k];
  const db = new FakeDb();
  let t = now;
  Date.now = () => t;
  const env = {};
  const h = {
    db, root, words, V,
    setNow(ms) { t = ms; },
    advance(ms) { t += ms; },
    now() { return t; },
    /** make this harness's clock the active Date.now (after another harness was torn down) */
    activate() { Date.now = () => t; },
    setEnv(k, v) { if (!(k in env)) env[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; },
    /** call a function as `openid` (undefined => a server/timer-style call with no OPENID) */
    call(fn, event, { openid } = {}) {
      const mod = require(path.join(root, fn, 'index.js'));
      current = { db, openid };
      return mod.main(event);
    },
    /** put bank entries. spec: [{pool, seq|practiceNo, wordIdx, synonyms?, extra?}]; returns [{id, meta, ranks}] */
    seedBank(specs) {
      return specs.map((s, i) => {
        const id = s.id || `bank${String(i).padStart(4, '0')}${s.pool === 'practice' ? 'p' + s.practiceNo : 'd' + s.seq}`;
        const e = fx.bankEntry({ ...s, id, words, V });
        db.put('answer_bank', e.meta);
        db.put('answer_ranks', e.ranksDoc);
        return { id, meta: e.meta, ranks: e.ranks, wordIdx: s.wordIdx };
      });
    },
    /** publish the daily for dateKey via genDaily (needs a seeded bank) */
    publish(dateKey) { return h.call('genDaily', { dateKey }); },
    mod(fn) { return require(path.join(root, fn, 'index.js')); },
    /** the index of a word that is neither the answer nor close: handy for "cold" guesses */
    teardown() {
      Date.now = realNow;
      for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    },
  };
  return h;
}

/** Standard scenario: today's daily (answer = word 10, synonym = word 11) + two practice puzzles, published. */
async function dailyScenario(h, { dateKey = '20261103', answerIdx = 10, synonyms = [11] } = {}) {
  const entries = h.seedBank([
    { pool: 'daily', seq: 1, wordIdx: answerIdx, synonyms },
    { pool: 'daily', seq: 2, wordIdx: 40 },
    { pool: 'practice', practiceNo: 1, wordIdx: 20 },
    { pool: 'practice', practiceNo: 2, wordIdx: 25 },
  ]);
  const r = await h.publish(dateKey);
  if (!r.ok) throw new Error('publish failed ' + JSON.stringify(r));
  return { entries, answer: entries[0] };
}

let gid = 0;
const gidNext = () => `guess${String(++gid).padStart(8, '0')}`;

module.exports = { createHarness, dailyScenario, gidNext, T0, DAY };
