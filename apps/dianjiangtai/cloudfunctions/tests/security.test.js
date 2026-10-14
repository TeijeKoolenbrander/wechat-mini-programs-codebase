'use strict';
// Static checks: security rules, secrets, identity handling, and drift between copies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../scripts/sync-core');
const FAKE_CORE = sync.DEFAULT_CORE; // any directory tree works as drift-test input

const CF = sync.CF_ROOT;
const read = (p) => fs.readFileSync(p, 'utf8');
const sources = () => [
  ...sync.listFunctions().map((fn) => [`${fn}/index.js`, read(path.join(CF, fn, 'index.js'))]),
  ...fs.readdirSync(path.join(CF, 'common')).map((f) => [`common/${f}`, read(path.join(CF, 'common', f))]),
];

test('security rules deny all client reads and writes for every collection the code touches (AC 28)', () => {
  const rules = JSON.parse(read(path.join(CF, 'database', 'rules.json')));
  const used = new Set();
  for (const [, src] of sources()) {
    for (const m of src.matchAll(/(?:collection|getDoc|getDocT|addIfAbsent|queryAll|purge)\(\s*(?:t,\s*)?'([a-z_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\{\s*col:\s*'([a-z_]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 10, 'sanity: found the collections: ' + [...used]);
  for (const c of used) assert.ok(rules[c], `no security rule for collection ${c}`);
  for (const [c, r] of Object.entries(rules)) {
    if (c.startsWith('_')) continue;
    assert.deepEqual(r, { read: false, write: false }, `${c} must be deny-all`);
    assert.ok(used.has(c), `rule for unused collection ${c}`);
  }
});

test('identity: no function reads OPENID/openid from client input', () => {
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /event\.(openid|OPENID|openId|userId)/, file);
    assert.doesNotMatch(src, /event\[['"]open/i, file);
  }
  // getWXContext is only called in common/store.js
  for (const [file, src] of sources()) {
    if (file !== 'common/store.js') assert.doesNotMatch(src, /getWXContext/, file);
  }
});

test('secrets: only env vars; no AppSecret/session_key/code2Session anywhere; no committed pepper values', () => {
  const allowedEnv = new Set(['GROUP_REF_PEPPER', 'JOINGROUP_RETURN_OPENGID', 'LAUNCH_DATE_KEY', 'TZ']);
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /appsecret|session_key|code2session|jscode2session/i, file);
    for (const m of src.matchAll(/process\.env\.([A-Z_]+)/g)) assert.ok(allowedEnv.has(m[1]), `${file} reads undocumented env ${m[1]}`);
  }
  for (const fn of sync.listFunctions()) {
    const c = JSON.parse(read(path.join(CF, fn, 'function.config.json')));
    assert.deepEqual(Object.keys(c.envVariables), ['TZ'], 'no secrets in committed function config');
  }
  const readme = read(path.join(CF, 'README.md'));
  for (const v of ['GROUP_REF_PEPPER', 'JOINGROUP_RETURN_OPENGID', 'LAUNCH_DATE_KEY']) assert.ok(readme.includes(v), `README documents ${v}`);
});

test('every client-facing function derives identity via the handler wrapper; timers are server-only', () => {
  for (const fn of sync.listFunctions()) {
    const src = read(path.join(CF, fn, 'index.js'));
    assert.match(src, /store\.handler\(/, fn);
  }
  for (const fn of ['genDaily', 'cleanup']) {
    assert.match(read(path.join(CF, fn, 'index.js')), /serverOnly:\s*true/, fn);
  }
});

test('drift: common/ copies in every function equal the source (cloud functions deploy one folder each)', () => {
  assert.deepEqual(sync.checkDrift({ commonOnly: true }), []);
});

test('drift: core copies equal game/core when the real core is present', (t) => {
  if (!fs.existsSync(sync.DEFAULT_CORE)) return t.skip('apps/dianjiangtai/game/core not present yet; run "npm run sync" at integration');
  const problems = sync.checkDrift({ coreSrc: sync.DEFAULT_CORE });
  assert.deepEqual(problems, [], 'run: npm run sync');
});

test('drift detector catches missing, changed and stale files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-drift-'));
  const a = path.join(tmp, 'a');
  const b = path.join(tmp, 'b');
  sync.copyDir(FAKE_CORE, a);
  sync.copyDir(FAKE_CORE, b);
  assert.deepEqual(sync.diffDirs(a, b), []);
  fs.appendFileSync(path.join(b, 'sim.js'), '\n// edited copy');
  fs.rmSync(path.join(b, 'rng.js'));
  fs.writeFileSync(path.join(b, 'extra.js'), '');
  const p = sync.diffDirs(a, b).map((x) => x.split(' ')[0]).sort();
  assert.deepEqual(p, ['differs', 'missing', 'stale']);
  assert.equal(sync.diffDirs(a, path.join(tmp, 'nope')).length, 1);
});

test('sync copies common + core into every function and the copy is then drift-free', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-sync-'));
  fs.mkdirSync(path.join(tmp, 'common'));
  fs.writeFileSync(path.join(tmp, 'common', 'x.js'), 'module.exports = 1;');
  for (const fn of ['f1', 'f2']) { fs.mkdirSync(path.join(tmp, fn)); fs.writeFileSync(path.join(tmp, fn, 'index.js'), ''); }
  assert.deepEqual(sync.listFunctions(tmp), ['f1', 'f2']);
  assert.ok(sync.checkDrift({ root: tmp, coreSrc: FAKE_CORE }).length > 0, 'unsynced is drift');
  sync.syncAll({ root: tmp, coreSrc: FAKE_CORE });
  assert.deepEqual(sync.checkDrift({ root: tmp, coreSrc: FAKE_CORE }), []);
  assert.ok(fs.existsSync(path.join(tmp, 'f2', 'core', 'gates.js')));
  assert.throws(() => sync.syncAll({ root: tmp, coreSrc: path.join(tmp, 'missing') }), /core source not found/);
});
