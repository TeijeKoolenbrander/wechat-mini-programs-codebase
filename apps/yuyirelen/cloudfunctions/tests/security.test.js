'use strict';
// Static checks (rules, secrets, identity, no model calls, drift, no cross-app requires) and the
// response-contract tests (no answerRef / ranks / bank id / answer word reaches a client before finishing).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../scripts/sync-core');
const { createHarness, dailyScenario, gidNext } = require('./helpers/harness');

const CF = sync.CF_ROOT;
const APP_ROOT = path.resolve(CF, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const sources = () => [
  ...sync.listFunctions().map((fn) => [`${fn}/index.js`, read(path.join(CF, fn, 'index.js'))]),
  ...fs.readdirSync(path.join(CF, 'common')).map((f) => [`common/${f}`, read(path.join(CF, 'common', f))]),
];

test('security rules deny all client reads and writes for every collection the code touches (AC 18)', () => {
  const rules = JSON.parse(read(path.join(CF, 'database', 'rules.json')));
  const used = new Set();
  for (const [, src] of sources()) {
    for (const m of src.matchAll(/(?:collection|getDoc|getDocT|addIfAbsent|queryAll|purge)\(\s*(?:t,\s*)?'([a-z_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\{\s*col:\s*'([a-z_]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 12, 'sanity: found the collections: ' + [...used]);
  for (const c of used) assert.ok(rules[c], `no security rule for collection ${c}`);
  for (const [c, r] of Object.entries(rules)) {
    if (c.startsWith('_')) continue;
    assert.deepEqual(r, { read: false, write: false }, `${c} must be deny-all`);
    assert.ok(used.has(c), `rule for unused collection ${c}`);
  }
  const idx = JSON.parse(read(path.join(CF, 'database', 'indexes.json')));
  for (const c of Object.keys(idx)) if (!c.startsWith('_')) assert.ok(rules[c], `index for unknown collection ${c}`);
});

test('identity: no function reads an openid from client input; getWXContext only in common/store.js (AC 106)', () => {
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /event\.(openid|OPENID|openId|userId)/, file);
    assert.doesNotMatch(src, /event\[['"]open/i, file);
    if (file !== 'common/store.js') assert.doesNotMatch(src, /getWXContext/, file);
  }
});

test('secrets: only documented env vars; no AppSecret / session_key / code2Session; no secret in function config (AC 110)', () => {
  const allowedEnv = new Set(['GROUP_REF_PEPPER', 'JOINGROUP_RETURN_OPENGID', 'LAUNCH_DATE_KEY', 'TZ']);
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /appsecret|session_key|code2session|jscode2session/i, file);
    for (const m of src.matchAll(/process\.env\.([A-Z_]+)/g)) assert.ok(allowedEnv.has(m[1]), `${file} reads undocumented env ${m[1]}`);
  }
  for (const fn of sync.listFunctions()) {
    const c = JSON.parse(read(path.join(CF, fn, 'function.config.json')));
    assert.deepEqual(Object.keys(c.envVariables), ['TZ'], fn);
    assert.equal(c.envVariables.TZ, 'Asia/Shanghai');
    assert.ok(Number.isInteger(c.timeout) && c.timeout >= 1, `${fn} has an explicit timeout`);
  }
  const readme = read(path.join(CF, 'README.md'));
  for (const v of allowedEnv) assert.ok(readme.includes(v), `README documents ${v}`);
  // GROUP_REF_PEPPER is only ever read from the environment
  for (const [file, src] of sources()) if (/GROUP_REF_PEPPER/.test(src)) assert.match(src, /process\.env\.GROUP_REF_PEPPER/, file);
});

test('every function derives identity via the handler wrapper; timer functions are server-only with a trigger (AC 107)', () => {
  for (const fn of sync.listFunctions()) assert.match(read(path.join(CF, fn, 'index.js')), /store\.handler\(/, fn);
  for (const fn of ['genDaily', 'cleanup']) {
    assert.match(read(path.join(CF, fn, 'index.js')), /serverOnly:\s*true/, fn);
    const t = JSON.parse(read(path.join(CF, fn, 'config.json')));
    assert.equal(t.triggers[0].type, 'timer');
  }
  assert.equal(JSON.parse(read(path.join(CF, 'genDaily', 'config.json'))).triggers[0].config, '0 0 23 * * * *');
  assert.equal(JSON.parse(read(path.join(CF, 'cleanup', 'config.json'))).triggers[0].config, '0 0 4 * * * *');
  const spec = ['getDaily', 'genDaily', 'startPuzzle', 'guess', 'near', 'useHint', 'giveUp', 'getReveal', 'getHistory', 'createChallenge', 'getChallenge', 'joinGroup', 'getBoard', 'track', 'cleanup'];
  assert.deepEqual(sync.listFunctions().sort(), spec.slice().sort(), 'exactly the functions the spec lists (14.2)');
});

test('no model or embedding call, vector or model file anywhere in the functions (AC 12)', () => {
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /require\(['"](https?|axios|node-fetch|got|request|undici)['"]\)/, file);
    assert.doesNotMatch(src, /\bfetch\(|cloud\.callContainer|cloud\.openapi|cloud\.callFunction/, file);
    assert.doesNotMatch(src, /bge-large|bge-small|Qwen3|sentence-transformers|\.onnx|\.npy|\.safetensors/i, file);
  }
  const bad = [];
  for (const fn of sync.listFunctions()) {
    for (const rel of sync.walk(path.join(CF, fn))) {
      if (/\.(onnx|npy|safetensors|pt|gguf)$/i.test(rel)) bad.push(`${fn}/${rel}`);
      if (/\.bin$/i.test(rel) && !/(^|\/)near\.v\d+\.bin$/.test(rel)) bad.push(`${fn}/${rel}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no file under apps/yuyirelen requires a path outside apps/yuyirelen; no non-.js data require (AC 111)', () => {
  const files = [];
  for (const rel of sync.walk(APP_ROOT)) {
    if (!rel.endsWith('.js') || /(^|\/)(node_modules|\.venv)\//.test(rel)) continue;
    files.push(path.join(APP_ROOT, rel));
  }
  assert.ok(files.length > 10);
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const resolved = path.resolve(path.dirname(f), m[1]);
      assert.ok(resolved.startsWith(APP_ROOT + path.sep), `${path.relative(APP_ROOT, f)} requires outside the app: ${m[1]}`);
    }
  }
});

test('drift: common/ copies in every function equal the source (cloud functions deploy one folder each) (AC 111)', () => {
  assert.deepEqual(sync.checkDrift({ commonOnly: true }), []);
});

test('drift: core and data copies equal their sources when game/core exists', (t) => {
  if (!fs.existsSync(sync.DEFAULT_CORE)) return t.skip('apps/yuyirelen/game/core not present yet; "npm run check" must pass at integration');
  assert.deepEqual(sync.checkDrift({ coreSrc: sync.DEFAULT_CORE }), [], 'run: npm run sync');
});

test('the drift detector catches missing, changed and stale files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-drift-'));
  const src = path.join(tmp, 'src');
  const dest = path.join(tmp, 'dest');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'a.js'), 'a');
  fs.writeFileSync(path.join(src, 'b.js'), 'b');
  assert.match(sync.diffDirs(src, dest)[0], /missing directory/);
  sync.copyDir(src, dest);
  assert.deepEqual(sync.diffDirs(src, dest), []);
  fs.writeFileSync(path.join(dest, 'a.js'), 'changed');
  fs.writeFileSync(path.join(dest, 'extra.js'), 'x');
  fs.rmSync(path.join(dest, 'b.js'));
  assert.deepEqual(sync.diffDirs(src, dest).map((s) => s.split(' ')[0]).sort(), ['differs', 'missing', 'stale']);
});

test('data files are routed only to the functions that need them (vocab: 8, near table: 3)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-data-'));
  fs.mkdirSync(path.join(tmp, 'data'));
  for (const f of ['manifest.json', 'vocab.v1.txt', 'near.v1.bin', 'junk.bin']) fs.writeFileSync(path.join(tmp, 'data', f), 'x');
  assert.deepEqual(sync.dataFilesFor('cleanup', path.join(tmp, 'data')), ['manifest.json']);
  assert.deepEqual(sync.dataFilesFor('getReveal', path.join(tmp, 'data')), ['manifest.json', 'vocab.v1.txt']);
  assert.deepEqual(sync.dataFilesFor('guess', path.join(tmp, 'data')), ['manifest.json', 'near.v1.bin', 'vocab.v1.txt']);
});

// ---------------- response contract ----------------
const SECRET = /answerRef|"ranks"|answer_bank|answer_ranks/;

test('contract: no client-reachable response contains answerRef, ranks or a bank id; the answer word appears only after finishing (AC 13, 14)', async () => {
  const h = createHarness();
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret');
  try {
    const sc = await dailyScenario(h, { answerIdx: 90, synonyms: [91] }); // outside the starter list, so warm-ups cannot contain it
    const answer = h.words[90];
    const bankIds = h.db.all('answer_bank').map((b) => b._id);
    const log = [];
    const call = async (fn, ev, openid) => {
      const r = await h.call(fn, ev, { openid });
      log.push({ fn, openid, finished: false, json: JSON.stringify(r) });
      return r;
    };
    const P = 'd20261103';
    // owner finishes (answer legitimately visible to them) and shares
    await call('guess', { puzzleId: P, word: h.words[50], clientGuessId: gidNext() }, 'owner');
    await call('guess', { puzzleId: P, word: answer, clientGuessId: gidNext() }, 'owner');
    const ownerLogEnd = log.length;
    const ch = await call('createChallenge', { puzzleId: P }, 'owner');
    await h.call('joinGroup', { groupData: { cloudID: 'c', data: { opengid: 'OG1', chat_type: 3 } } }, { openid: 'viewer' });
    // a viewer who has NOT finished calls everything
    const v = 'viewer';
    await call('getDaily', {}, v);
    await call('startPuzzle', { puzzleId: P }, v);
    await call('startPuzzle', { next: true }, v);
    for (let i = 0; i < 12; i++) await call('guess', { puzzleId: P, word: h.words[60 + i], clientGuessId: gidNext() }, v);
    await call('near', { puzzleId: P, word: h.words[60] }, v);
    await call('useHint', { puzzleId: P }, v);
    await call('getReveal', { puzzleId: P }, v);
    await call('getHistory', {}, v);
    await call('getChallenge', { challengeId: ch.challengeId }, v);
    await call('getBoard', { kind: 'friend', dateKey: '20261103' }, v);
    await call('giveUp', { puzzleId: P }, 'nobody-started');
    const viewerEnd = log.length;
    // now the viewer finishes
    const win = await call('guess', { puzzleId: P, word: answer, clientGuessId: gidNext() }, v);
    assert.equal(win.answer, answer);
    await call('getReveal', { puzzleId: P }, v);
    await call('getChallenge', { challengeId: ch.challengeId }, v);

    for (const e of log) {
      assert.ok(!SECRET.test(e.json), `${e.fn}: ${e.json.slice(0, 160)}`);
      for (const id of bankIds) assert.ok(!e.json.includes(id), `${e.fn} leaked a bank id`);
      assert.ok(!e.json.includes(h.db.all('daily_puzzles')[0].boardSalt) || e.fn === 'getBoard', `${e.fn} leaked the board salt`);
    }
    // before finishing, the viewer's responses never carry the answer word
    log.slice(ownerLogEnd + 1, viewerEnd).forEach((e) => {
      if (e.openid === v) assert.ok(!e.json.includes(answer), `${e.fn} leaked the answer before finishing`);
    });
    assert.ok(sc.entries.length > 0);
  } finally {
    h.teardown();
  }
});

test('contract: failures never throw and carry a code (AC: never throws to the client)', async () => {
  const h = createHarness();
  try {
    await dailyScenario(h);
    const calls = {
      getDaily: [{}], startPuzzle: [{}, { puzzleId: 5 }, { next: 'yes' }], guess: [{}, { puzzleId: {}, word: [] }], near: [{}], useHint: [{}, { puzzleId: 'd20261103', k: 'x' }],
      giveUp: [{}], getReveal: [{}], getHistory: [{ cursor: 5 }], createChallenge: [{}], getChallenge: [{}], joinGroup: [{}], getBoard: [{}, { kind: 'group' }], track: [{}, { events: 5 }],
    };
    for (const [fn, evs] of Object.entries(calls)) {
      for (const ev of evs) {
        const r = await h.call(fn, ev, { openid: 'u' });
        assert.ok(r && typeof r === 'object', fn);
        if (!r.ok) assert.ok(typeof r.code === 'string' && r.code !== 'INTERNAL', `${fn} ${JSON.stringify(ev)} -> ${JSON.stringify(r)}`);
      }
    }
  } finally {
    h.teardown();
  }
});
