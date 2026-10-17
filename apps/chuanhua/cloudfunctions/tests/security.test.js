'use strict';
// AC 57 (deny-all rules for every collection and the storage path), 110 (drift between copies), secrets, collection prefix.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../scripts/sync-core');
const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));

const CF = sync.CF_ROOT;
const read = (p) => fs.readFileSync(p, 'utf8');

test('AC 57: database/rules.json denies all client access to every (prefixed) collection and has no extras', () => {
  const rules = JSON.parse(read(path.join(CF, 'database', 'rules.json')));
  const names = Object.keys(rules).filter((k) => !k.startsWith('_'));
  assert.deepEqual(names.sort(), schema.PHYSICAL_COLLECTIONS.slice().sort());
  for (const n of names) {
    assert.ok(n.startsWith('chuanhua_'), n + ' must carry the app slug (shared test cloud environment)');
    if (n === 'chuanhua_room_signals') continue;
    assert.deepEqual(rules[n], { read: false, write: false }, n);
  }
  // the ONE exception: a player reads only their own signal documents; nobody writes them from a client (spec 13.4)
  assert.deepEqual(rules.chuanhua_room_signals, { read: 'doc._openid == auth.openid', write: false });
  assert.equal(names.filter((n) => JSON.stringify(rules[n]) !== JSON.stringify({ read: false, write: false })).length, 1, 'only room_signals is not deny-all');
  assert.ok(!names.includes('chuanhua_meta'), 'meta/launch is gone (F-2)');
});

test('AC 57: storage.rules.json denies every client read and write', () => {
  const r = JSON.parse(read(path.join(CF, 'storage.rules.json')));
  assert.equal(r.read, false);
  assert.equal(r.write, false);
});

test('collection naming: col() prefixes with the app slug and agrees with core/schema', () => {
  const util = require('../common/util');
  assert.equal(util.col('chains'), 'chuanhua_chains');
  for (const c of Object.keys(schema.COLLECTIONS)) assert.equal(util.col(c), schema.collectionName(c));
});

test('identity comes only from the context: common code never reads openid from the event; getWXContext only in store.js', () => {
  const files = fs.readdirSync(path.join(CF, 'common')).map((f) => [f, read(path.join(CF, 'common', f))]);
  for (const [f, src] of files) {
    assert.doesNotMatch(src, /event\.(openid|OPENID|openId|userId)/, f);
    if (f !== 'store.js') assert.doesNotMatch(src, /getWXContext/, f);
  }
});

test('secrets: no AppSecret, session_key, token or key material in the cloud folder (env vars only)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (['node_modules', 'core'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  for (const f of walk(CF)) {
    if (f.endsWith('.md') || f.endsWith('security.test.js')) continue; // docs may say "no AppSecret"; code and config may not contain one
    const src = read(f);
    assert.doesNotMatch(src, /appsecret|session_key|code2session|-----BEGIN|AKID[A-Za-z0-9]{10}/i, f);
    for (const m of src.matchAll(/process\.env\.([A-Z_]+)/g)) assert.ok(schema.ENV_VARS.concat(['CH_CORE_SRC']).includes(m[1]), `${f} reads undocumented env ${m[1]}`);
  }
});

test('sync-core: copies common + core into every function folder, detects drift, ignores non-function folders', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-sync-'));
  fs.mkdirSync(path.join(tmp, 'common'));
  fs.writeFileSync(path.join(tmp, 'common', 'x.js'), 'module.exports = 1;');
  fs.mkdirSync(path.join(tmp, 'getHome'));
  fs.writeFileSync(path.join(tmp, 'getHome', 'index.js'), '');
  fs.mkdirSync(path.join(tmp, 'tests'));
  fs.writeFileSync(path.join(tmp, 'tests', 'index.js'), '');
  assert.deepEqual(sync.listFunctions(tmp), ['getHome']);
  sync.syncAll({ root: tmp, coreSrc: sync.DEFAULT_CORE });
  assert.deepEqual(sync.checkDrift({ root: tmp, coreSrc: sync.DEFAULT_CORE }), []);
  assert.ok(fs.existsSync(path.join(tmp, 'getHome', 'core', 'chain.js')));
  assert.ok(fs.existsSync(path.join(tmp, 'getHome', 'common', 'x.js')));
  fs.appendFileSync(path.join(tmp, 'getHome', 'core', 'chain.js'), '\n// drift');
  fs.writeFileSync(path.join(tmp, 'getHome', 'common', 'stale.js'), '');
  const problems = sync.checkDrift({ root: tmp, coreSrc: sync.DEFAULT_CORE });
  assert.ok(problems.some((p) => /differs .*chain\.js/.test(p)));
  assert.ok(problems.some((p) => /stale .*stale\.js/.test(p)));
});

test('the synced core is pure JS: it requires nothing outside itself (cloud folders deploy alone)', () => {
  for (const f of sync.walk(sync.DEFAULT_CORE)) {
    if (!f.endsWith('.js')) continue;
    const src = read(path.join(sync.DEFAULT_CORE, f)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/require\(\s*'([^']+)'\s*\)/g)) assert.match(m[1], /^\.{1,2}\//, `${f} requires ${m[1]}`);
  }
});

test('package.json test script uses the node runner', () => {
  const pkg = JSON.parse(read(path.join(CF, 'package.json')));
  assert.match(pkg.scripts.test, /node --test/);
});

const FNS = Object.keys(schema.FUNCTIONS);
const fnFiles = (fn) => sync.walk(path.join(CF, fn)).filter((f) => !f.startsWith('common/') && !f.startsWith('core/') && !f.startsWith('node_modules/'));

test('every function in core/schema.js has a folder with index.js, package.json, function.config.json (the contract timeout) and config.json; no extra function folders', () => {
  assert.deepEqual(sync.listFunctions().sort(), FNS.slice().sort());
  for (const fn of FNS) {
    assert.deepEqual(fnFiles(fn).sort(), ['config.json', 'function.config.json', 'index.js', 'package.json'], fn);
    const fc = JSON.parse(read(path.join(CF, fn, 'function.config.json')));
    assert.equal(fc.timeout, schema.FUNCTIONS[fn].timeoutSec, fn + ' timeout');
    assert.equal(fc.envVariables.TZ, 'Asia/Shanghai', fn);
    assert.ok(!('GROUP_REF_PEPPER' in fc.envVariables) && Object.keys(fc.envVariables).length === 1, fn + ': secrets and ids are set in the console only');
    const pkg = JSON.parse(read(path.join(CF, fn, 'package.json')));
    assert.equal(pkg.main, 'index.js');
    assert.ok(pkg.dependencies['wx-server-sdk'], fn);
    assert.deepEqual(Object.keys(pkg.dependencies), ['wx-server-sdk'], fn + ' has no other dependency');
  }
});

test('config.json: openapi permissions cover the contract (and the two documented extras); timers are exactly the contract cron, named with the deployed chuanhua_ name', () => {
  for (const fn of FNS) {
    const cfg = JSON.parse(read(path.join(CF, fn, 'config.json')));
    const have = (cfg.permissions && cfg.permissions.openapi) || [];
    for (const api of schema.FUNCTIONS[fn].openapi || []) assert.ok(have.includes(api), fn + ' needs ' + api);
    const timer = schema.FUNCTIONS[fn].timer;
    if (timer) assert.deepEqual(cfg.triggers, [{ name: 'chuanhua_' + fn + '_timer', type: 'timer', config: timer }], fn);
    else assert.equal(cfg.triggers, undefined, fn);
  }
  const extra = require('../scripts/scaffold').EXTRA_OPENAPI;
  assert.deepEqual(Object.keys(extra).sort(), ['getChain', 'revealNow']);
  assert.deepEqual(require('../scripts/scaffold').run(true), [], 'generated deploy files are in sync with core/schema.js (npm run scaffold)');
});

test('AC 110: the committed common/ and core/ copies in every function folder are identical to their sources (no drift)', () => {
  assert.deepEqual(sync.checkDrift(), []);
});

test('every collection the code touches is a declared (deny-all) collection, and every declared collection is used', () => {
  const used = new Set();
  const files = [];
  for (const fn of FNS) files.push(path.join(CF, fn, 'index.js'));
  for (const f of fs.readdirSync(path.join(CF, 'common'))) files.push(path.join(CF, 'common', f));
  for (const f of files) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/(?:coll|collT|getDoc|getDocT|addIfAbsent|bump|queryAll|putT)\((?:t, |tx, )?'([a-z_]+)'/g)) used.add(m[1]);
  }
  const declared = new Set(Object.keys(schema.COLLECTIONS));
  for (const u of used) assert.ok(declared.has(u), 'undeclared collection ' + u);
  for (const d of declared) assert.ok(used.has(d) || d === 'meta', 'unused collection ' + d); // meta/launch is read by getHome through getDoc('meta')
});

test('identity: no function reads openid / OPENID / userId from the event; only common/store.js reads the context', () => {
  for (const fn of FNS) {
    const src = read(path.join(CF, fn, 'index.js'));
    assert.doesNotMatch(src, /event\.(openid|OPENID|openId|userId|unionid)/, fn);
    assert.doesNotMatch(src, /getWXContext/, fn);
    assert.doesNotMatch(src, /cloud\.openapi|\.uploadFile\(|\.getTempFileURL\(|\.deleteFile\(/, fn + ' talks to the platform only through common/wxapi.js');
  }
  for (const f of fs.readdirSync(path.join(CF, 'common'))) {
    const src = read(path.join(CF, 'common', f));
    if (f !== 'wxapi.js') assert.doesNotMatch(src, /openapi\.|\.uploadFile\(|\.getTempFileURL\(|\.deleteFile\(/, f);
  }
});

test('client-facing code never exposes storage: only admin and the moderation pipeline touch fileIDs / temp URLs', () => {
  const allowed = new Set(['admin', 'cleanup', 'submitStep', 'submitRoomStep', 'modSweeper', 'onMediaCheck']);
  for (const fn of FNS) {
    const src = read(path.join(CF, fn, 'index.js'));
    if (!allowed.has(fn)) assert.doesNotMatch(src, /fileID|tempUrl|tempFileURL/, fn);
  }
});
