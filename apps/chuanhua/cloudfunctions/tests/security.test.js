'use strict';
// Static checks: security rules, secrets, identity handling, permissions, timeouts, drift (AC 57, 110).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../scripts/sync-core');

const CF = sync.CF_ROOT;
const read = (p) => fs.readFileSync(p, 'utf8');
const FNS = sync.listFunctions();
const commonFiles = fs.readdirSync(path.join(CF, 'common')).filter((f) => f.endsWith('.js'));
const sources = () => [
  ...FNS.map((fn) => [`${fn}/index.js`, read(path.join(CF, fn, 'index.js'))]),
  ...commonFiles.map((f) => [`common/${f}`, read(path.join(CF, 'common', f))]),
];

test('every function from the spec exists', () => {
  const expected = ['getHome', 'agreeRules', 'joinGroup', 'createChain', 'getChain', 'claimStep', 'releaseClaim', 'submitStep', 'onMediaCheck', 'modSweeper',
    'getReveal', 'revealNow', 'laugh', 'report', 'getMyChains', 'getGroupChains', 'deleteMyStep', 'subscribeReveal', 'grantReward', 'admin', 'track', 'cleanup'];
  assert.deepEqual(FNS.slice().sort(), expected.slice().sort());
});

test('database rules: every collection the code touches is deny-all, and no rule exists for an unused one (AC 57)', () => {
  const rules = JSON.parse(read(path.join(CF, 'database', 'rules.json')));
  const used = new Set();
  const patterns = [
    /collection\(\s*'([a-z_]+)'\s*\)/g,
    /(?:getDoc|getDocT|putT|put|addIfAbsent|queryAll|purge|purgeWithFiles|incDoc|bumpAggT)\(\s*(?:t,\s*)?'([a-z_]+)'/g,
    /\{\s*col:\s*'([a-z_]+)'/g,
  ];
  for (const [, src] of sources()) for (const re of patterns) for (const m of src.matchAll(re)) used.add(m[1]);
  assert.ok(used.size >= 15, 'sanity: found the collections: ' + [...used]);
  for (const c of used) assert.ok(rules[c], `no security rule for collection ${c}`);
  for (const [c, r] of Object.entries(rules)) {
    if (c.startsWith('_')) continue;
    assert.deepEqual(r, { read: false, write: false }, `${c} must be deny-all`);
    assert.ok(used.has(c), `rule for unused collection ${c}`);
  }
  // every collection in the spec's data model has a rule
  for (const c of ['chains', 'steps', 'mod_traces', 'mod_log', 'mod_quota', 'reports', 'players', 'group_members', 'group_stats', 'reactions', 'sub_grants', 'daily_stats', 'audit_log', 'events', 'rate_limits', 'app_config', 'meta']) {
    assert.ok(rules[c], `spec collection ${c}`);
  }
});

test('cloud storage rule denies all client reads and writes; nothing in the code hands a client a file reference', () => {
  const rules = JSON.parse(read(path.join(CF, 'storage.rules.json')));
  assert.equal(rules.read, false);
  assert.equal(rules.write, false);
  // only admin and the moderation module touch temp URLs; no client-facing function returns fileID / tempFileURL
  for (const [file, src] of sources()) {
    if (/getTempFileURL|tempFileURL/.test(src)) assert.ok(['admin/index.js', 'common/moderation.js'].includes(file), `${file} must not deal in temp URLs`);
    // submitStep only initialises the stored field (fileID: null); it never returns one
    if (!['common/moderation.js', 'cleanup/index.js', 'admin/index.js', 'submitStep/index.js'].includes(file) && !file.startsWith('common/')) assert.doesNotMatch(src, /fileID/, `${file} must not reference fileID`);
  }
});

test('identity: no function reads an OPENID from client input; getWXContext only in common/store.js', () => {
  for (const [file, src] of sources()) {
    if (file === 'admin/index.js') continue; // admin takes a TARGET openid, behind the console/ADMIN_OPENIDS gate (tested)
    assert.doesNotMatch(src, /(?:event|ev)\.(openid|OPENID|openId|userId|author|starter)\b/, file);
    assert.doesNotMatch(src, /event\[['"]open/i, file);
  }
  for (const [file, src] of sources()) if (file !== 'common/store.js') assert.doesNotMatch(src, /getWXContext/, file);
  const admin = read(path.join(CF, 'admin', 'index.js'));
  assert.match(admin, /if \(openid && !adminList\(\)\.includes\(openid\)\) fail\('FORBIDDEN'/, 'the admin gate is the first statement');
});

test('secrets: env vars only (documented), no AppSecret/session_key anywhere, nothing secret committed in function config', () => {
  const allowedEnv = new Set(['GROUP_REF_PEPPER', 'ENV_KIND', 'MODERATION_MODE', 'MOD_TEXT_DAILY_BUDGET', 'MOCK_MEDIA_DELAY_SEC', 'ADMIN_OPENIDS',
    'PUSH_TOKEN', 'PUSH_AES_KEY', 'PUSH_ALLOW_OPENID', 'MEDIA_CHECK_ROUTE', 'LAUNCH_DATE_KEY', 'TZ']);
  const readme = read(path.join(CF, 'README.md'));
  const found = new Set();
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /appsecret|session_key|code2session|jscode2session|secret\s*[:=]\s*['"]/i, file);
    for (const m of src.matchAll(/process\.env\.([A-Z_]+)/g)) { assert.ok(allowedEnv.has(m[1]), `${file} reads undocumented env ${m[1]}`); found.add(m[1]); }
  }
  for (const v of allowedEnv) assert.ok(readme.includes(v), `README documents ${v}`);
  for (const fn of FNS) {
    const c = JSON.parse(read(path.join(CF, fn, 'function.config.json')));
    assert.deepEqual(Object.keys(c.envVariables), ['TZ'], `${fn}: no secrets in committed function config`);
    assert.equal(c.envVariables.TZ, 'Asia/Shanghai');
  }
  assert.ok(found.has('GROUP_REF_PEPPER') && found.has('MODERATION_MODE') && found.has('ENV_KIND'));
  // no key-looking blobs
  for (const [file, src] of sources()) assert.doesNotMatch(src, /[A-Za-z0-9+/]{40,}={0,2}/, `${file}: long opaque string`);
});

test('every function has an explicit timeout and memory size; spec timeouts are respected', () => {
  const spec = { getHome: 5, agreeRules: 5, joinGroup: 5, createChain: 8, getChain: 5, claimStep: 5, releaseClaim: 5, submitStep: 10, onMediaCheck: 5, modSweeper: 60,
    getReveal: 5, revealNow: 5, laugh: 5, report: 5, getMyChains: 5, getGroupChains: 5, deleteMyStep: 10, subscribeReveal: 5, grantReward: 5, admin: 20, track: 5, cleanup: 120 };
  for (const fn of FNS) {
    const c = JSON.parse(read(path.join(CF, fn, 'function.config.json')));
    assert.equal(c.timeout, spec[fn], `${fn} timeout`);
    assert.ok(c.memorySize >= 256, `${fn} memory`);
    const pkg = JSON.parse(read(path.join(CF, fn, 'package.json')));
    assert.ok(pkg.dependencies['wx-server-sdk'], `${fn} depends on wx-server-sdk`);
  }
});

test('timers: modSweeper every 5 minutes, cleanup 04:00 BJT; both reject client calls', () => {
  const m = JSON.parse(read(path.join(CF, 'modSweeper', 'config.json')));
  assert.deepEqual(m.triggers, [{ name: 'modSweeperTimer', type: 'timer', config: '0 */5 * * * * *' }]);
  const c = JSON.parse(read(path.join(CF, 'cleanup', 'config.json')));
  assert.deepEqual(c.triggers, [{ name: 'cleanupTimer', type: 'timer', config: '0 0 4 * * * *' }]);
  for (const fn of ['modSweeper', 'cleanup']) assert.match(read(path.join(CF, fn, 'index.js')), /serverOnly: true/);
});

test('openapi permissions in config.json cover every cloud call the function can reach', () => {
  const perms = (fn) => {
    const p = path.join(CF, fn, 'config.json');
    return fs.existsSync(p) ? (JSON.parse(read(p)).permissions || { openapi: [] }).openapi : [];
  };
  const need = {
    createChain: ['security.msgSecCheck'],
    submitStep: ['security.msgSecCheck', 'security.mediaCheckAsync', 'security.imgSecCheck', 'updatableMessage.setUpdatableMsg'],
    modSweeper: ['security.mediaCheckAsync', 'security.imgSecCheck', 'subscribeMessage.send', 'updatableMessage.setUpdatableMsg'],
    onMediaCheck: ['updatableMessage.setUpdatableMsg'],
    getChain: ['updatableMessage.createActivityId'],
    revealNow: ['updatableMessage.setUpdatableMsg'],
    admin: ['updatableMessage.setUpdatableMsg'],
  };
  for (const [fn, list] of Object.entries(need)) for (const p of list) assert.ok(perms(fn).includes(p), `${fn} needs ${p}`);
  // and every permission named is one the code actually calls
  const used = new Set();
  for (const [, src] of sources()) {
    for (const m of src.matchAll(/openapi\.(\w+)\.(\w+)/g)) used.add(`${m[1]}.${m[2]}`);
    for (const m of src.matchAll(/\bapi\(\)\.(\w+)/g)) used.add(`updatableMessage.${m[1]}`); // common/activity.js helper
  }
  for (const fn of FNS) for (const p of perms(fn)) assert.ok(used.has(p), `${fn} grants unused permission ${p}`);
});

test('client-facing functions go through the handler wrapper; auth:false only for timers, push and admin', () => {
  const open = new Set(['modSweeper', 'cleanup', 'onMediaCheck', 'admin']);
  for (const fn of FNS) {
    const src = read(path.join(CF, fn, 'index.js'));
    assert.match(src, /store\.handler\(/, `${fn} uses the handler wrapper`);
    assert.equal(/auth:\s*false/.test(src), open.has(fn), `${fn} auth setting`);
  }
});

test('no client code path uploads or exposes an image: only the server writes PNGs (AC 28, 29)', () => {
  for (const [file, src] of sources()) {
    if (file === 'common/moderation.js') continue;
    assert.doesNotMatch(src, /uploadFile/, `${file} must not upload files`);
  }
  assert.match(read(path.join(CF, 'common', 'moderation.js')), /sdk\(\)\.uploadFile/);
});

test('no privacy-sensitive or forbidden API is called anywhere (AC 79)', () => {
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /getUserProfile|setUserCloudStorage|getFriendCloudStorage|saveImageToPhotosAlbum|getLocation|getClipboardData|getShareInfo/, file);
  }
});

test('committed common/ copies match the source of truth (drift check) and the sync tool works end to end', () => {
  assert.deepEqual(sync.checkDrift({ commonOnly: true }), []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-sync-'));
  fs.mkdirSync(path.join(tmp, 'common'));
  fs.mkdirSync(path.join(tmp, 'fnA'));
  fs.writeFileSync(path.join(tmp, 'common', 'x.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(tmp, 'fnA', 'index.js'), '');
  const core = path.join(tmp, 'corefix');
  fs.mkdirSync(core);
  fs.writeFileSync(path.join(core, 'c.js'), 'module.exports = 2;\n');
  sync.syncAll({ root: tmp, coreSrc: core });
  assert.deepEqual(sync.checkDrift({ root: tmp, coreSrc: core }), []);
  fs.writeFileSync(path.join(tmp, 'fnA', 'common', 'x.js'), 'module.exports = 99;\n');
  fs.writeFileSync(path.join(tmp, 'fnA', 'core', 'stale.js'), '');
  const problems = sync.checkDrift({ root: tmp, coreSrc: core });
  assert.ok(problems.some((p) => p.startsWith('differs')) && problems.some((p) => p.startsWith('stale')));
  // a missing core is reported by --check, never silently ignored
  assert.ok(sync.checkDrift({ root: tmp, coreSrc: path.join(tmp, 'nope') }).some((p) => p.includes('core source not found')));
});
