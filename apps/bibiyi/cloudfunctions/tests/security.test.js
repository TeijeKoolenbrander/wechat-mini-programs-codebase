'use strict';
// Static checks: security rules, secrets, identity handling, ads/continue absence, drift, error-code coverage,
// the daily-facts import script, and the core contract.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sync = require('../scripts/sync-core');
const importer = require('../scripts/import-daily-facts');

const CF = sync.CF_ROOT;
const read = (p) => fs.readFileSync(p, 'utf8');
const sources = () => [
  ...sync.listFunctions().map((fn) => [`${fn}/index.js`, read(path.join(CF, fn, 'index.js'))]),
  ...fs.readdirSync(path.join(CF, 'common')).filter((f) => f.endsWith('.js')).map((f) => [`common/${f}`, read(path.join(CF, 'common', f))]),
];

test('security rules deny all client reads and writes for every collection the code touches (AC 85)', () => {
  const rules = JSON.parse(read(path.join(CF, 'database', 'rules.json')));
  const used = new Set();
  for (const [, src] of sources()) {
    for (const m of src.matchAll(/(?:collection|getDoc|getDocT|addIfAbsent|queryAll|purge|incDoc)\(\s*(?:t,\s*)?'([a-z_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\{\s*col:\s*'([a-z_]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 15, 'sanity: found the collections: ' + [...used]);
  for (const c of used) assert.ok(rules[c], `no security rule for collection ${c}`);
  for (const [c, r] of Object.entries(rules)) {
    if (c.startsWith('_')) continue;
    assert.deepEqual(r, { read: false, write: false }, `${c} must be deny-all`);
    assert.ok(used.has(c), `rule for unused collection ${c}`);
  }
  const readme = read(path.join(CF, 'README.md'));
  for (const c of Object.keys(rules)) if (!c.startsWith('_')) assert.ok(readme.includes('`' + c + '`'), `README documents ${c}`);
});

test('identity: no function reads OPENID/openid from client input; getWXContext only in common/store.js', () => {
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /event\.(openid|OPENID|openId|userId|ownerOpenid)/, file);
    assert.doesNotMatch(src, /event\[['"]open/i, file);
    if (file !== 'common/store.js') assert.doesNotMatch(src, /getWXContext/, file);
  }
});

test('secrets: only documented env vars; no AppSecret/session_key/code2Session; no secrets in committed config', () => {
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
  for (const v of ['GROUP_REF_PEPPER', 'JOINGROUP_RETURN_OPENGID', 'LAUNCH_DATE_KEY', 'TZ']) assert.ok(readme.includes(v), `README documents ${v}`);
});

test('every function derives identity via the handler wrapper; timer functions are server-only and have a trigger', () => {
  for (const fn of sync.listFunctions()) assert.match(read(path.join(CF, fn, 'index.js')), /store\.handler\(/, fn);
  for (const fn of ['genDaily', 'cleanup']) {
    assert.match(read(path.join(CF, fn, 'index.js')), /serverOnly:\s*true/, fn);
    const c = JSON.parse(read(path.join(CF, fn, 'config.json')));
    assert.equal(c.triggers.length, 1);
    assert.equal(c.triggers[0].type, 'timer');
  }
  assert.equal(JSON.parse(read(path.join(CF, 'genDaily', 'config.json'))).triggers[0].config, '0 0 23 * * * *');
  assert.equal(JSON.parse(read(path.join(CF, 'cleanup', 'config.json'))).triggers[0].config, '0 0 4 * * * *');
  for (const fn of ['submitRun', 'answer', 'getDaily', 'cleanup']) {
    assert.ok(JSON.parse(read(path.join(CF, fn, 'config.json'))).permissions.openapi.includes('subscribeMessage.send'), `${fn} may send the challenge notice`);
  }
});

test('the functions listed in spec 11.2 all exist', () => {
  const want = ['getDaily', 'genDaily', 'startRun', 'answer', 'submitRun', 'createChallenge', 'getChallenge', 'subscribeChallenge', 'joinGroup', 'getBoard', 'getHistory', 'reportFact', 'track', 'cleanup'];
  assert.deepEqual(sync.listFunctions().sort(), want.sort());
});

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('no continue / 再答一次 / ad path exists on the daily-deck functions (AC 43)', () => {
  for (const fn of ['answer', 'startRun', 'getDaily', 'getHistory']) {
    const src = stripComments(read(path.join(CF, fn, 'index.js')));
    assert.doesNotMatch(src, /\b(life|lifeAtK|revive|reward|rewarded|isEnded|adUnit)\b/i, fn);
  }
  for (const f of ['runs.js', 'daily.js']) assert.doesNotMatch(stripComments(read(path.join(CF, 'common', f))), /\b(lifeAtK|rewarded|isEnded)\b/, f);
});

test('nothing reads share data: no function except track mentions shareTicket (shares grant nothing)', () => {
  for (const [file, src] of sources()) if (file !== 'track/index.js') assert.doesNotMatch(src, /shareTicket/, file);
});

test('every error code of spec 11.3 is produced by the code and exercised by a test (AC 86)', () => {
  const codes = ['INVALID_ACTIONS', 'INVALID_ORDER', 'ALREADY_PLAYED', 'NOT_STARTED', 'WINDOW_CLOSED', 'DECK_NOT_FOUND', 'DAILY_UNAVAILABLE', 'CHALLENGE_EXPIRED',
    'OWN_CHALLENGE', 'RUN_NOT_FOUND', 'UNKNOWN_FACT', 'RATE_LIMITED', 'NOT_MEMBER', 'NOT_GROUP', 'BAD_CLOUDID', 'NO_TEMPLATE', 'NOT_OWNER', 'UNAUTHENTICATED',
    'FORBIDDEN', 'SERVER_CONFIG', 'INTERNAL'];
  const code = sources().map(([, s]) => s).join('\n');
  const tests = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && f !== 'security.test.js').map((f) => read(path.join(__dirname, f))).join('\n');
  for (const c of codes) {
    assert.ok(code.includes(`'${c}'`), `no code path produces ${c}`);
    assert.ok(tests.includes(`'${c}'`), `no test exercises ${c}`);
  }
});

test('the game package holds no daily-pool fact and no deck data (AC 22)', () => {
  const game = path.resolve(CF, '..', 'game');
  if (!fs.existsSync(game)) return; // game package not present in this branch yet
  // the real server-only export (game/tools/out is not packaged: project.config.json ignores tools/ and tests/)
  const dailyFile = process.env.BIBIYI_DAILY_EXPORT || path.join(game, 'tools', 'out', 'daily-facts.json');
  const daily = importer.loadExport(dailyFile);
  assert.ok(daily.length > 100, 'the real daily export is present');
  const ignore = JSON.parse(read(path.join(game, 'project.config.json'))).packOptions.ignore.map((x) => x.value);
  assert.ok(ignore.includes('tools') && ignore.includes('tests'), 'tools/ and tests/ are not packaged');
  const files = [];
  (function walk(d, top) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) { if (!(top && ignore.includes(e.name))) walk(path.join(d, e.name), false); } else if (/\.(js|json)$/.test(e.name)) files.push(path.join(d, e.name)); } }(game, true));
  assert.ok(files.length > 20);
  for (const f of files) {
    const s = read(f);
    // fact data as JSON (the synthetic mock pool in js/mock-server.js is invented code, not this)
    assert.doesNotMatch(s, /"pool"\s*:\s*"daily"/, `${f} contains a daily-pool fact`);
    for (const d of daily) {
      assert.equal(s.includes(`"${d.id}"`) || s.includes(`'${d.id}'`), false, `${f} contains daily fact id ${d.id}`);
      assert.equal(s.includes(`"measure":"${d.measure}"`) && s.includes(`"label":"${d.label}"`) && s.split('\n').some((l) => l.includes(`"measure":"${d.measure}"`) && l.includes(`"label":"${d.label}"`)), false, `${f} contains daily fact ${d.label}`);
    }
  }
});

test('drift: common/ copies in every function equal the source', () => {
  assert.deepEqual(sync.checkDrift({ commonOnly: true }), []);
});

test('drift: core copies equal the active core when synced', (t) => {
  const problems = sync.checkDrift({ coreSrc: sync.DEFAULT_CORE });
  assert.deepEqual(problems, [], 'run: npm run sync');
  assert.ok(t);
});

test('drift detector catches missing, changed and stale files; sync makes a tree drift-free', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bbyi-drift-'));
  const a = path.join(tmp, 'a');
  const b = path.join(tmp, 'b');
  sync.copyDir(sync.REAL_CORE, a);
  sync.copyDir(sync.REAL_CORE, b);
  assert.deepEqual(sync.diffDirs(a, b), []);
  fs.appendFileSync(path.join(b, 'deck.js'), '\n// edited copy');
  fs.rmSync(path.join(b, 'rng.js'));
  fs.writeFileSync(path.join(b, 'extra.js'), '');
  assert.deepEqual(sync.diffDirs(a, b).map((x) => x.split(' ')[0]).sort(), ['differs', 'missing', 'stale']);
  const root = path.join(tmp, 'root');
  fs.mkdirSync(path.join(root, 'common'), { recursive: true });
  fs.writeFileSync(path.join(root, 'common', 'x.js'), 'module.exports = 1;');
  for (const fn of ['f1', 'f2']) { fs.mkdirSync(path.join(root, fn)); fs.writeFileSync(path.join(root, fn, 'index.js'), ''); }
  assert.ok(sync.checkDrift({ root, coreSrc: sync.REAL_CORE }).length > 0);
  sync.syncAll({ root, coreSrc: sync.REAL_CORE });
  assert.deepEqual(sync.checkDrift({ root, coreSrc: sync.REAL_CORE }), []);
  assert.throws(() => sync.syncAll({ root, coreSrc: path.join(tmp, 'missing') }), /core source not found/);
});

test('core contract: the active core exposes every call the adapter makes', () => {
  const core = sync.DEFAULT_CORE;
  const need = {
    'date.js': ['beijingDateKey'], 'config.js': ['LATEST_CONFIG_VERSION', 'getConfig'],
    'content.js': ['LATEST_CONTENT_VERSION', 'getContent', 'indexFacts'], 'measures.js': ['BY_KEY', 'CATEGORIES'],
    'deck.js': ['themeOf', 'buildFreeDeck', 'buildDailyDeck'], 'gates.js': ['deckStats', 'passesGates'],
    'judge.js': ['correctChoice', 'replayRun'], 'question.js': ['questionPayload', 'knownFace', 'revealOf'], 'rng.js': ['mulberry32', 'hash32', 'sub'],
  };
  for (const [file, names] of Object.entries(need)) {
    const m = require(path.join(core, file));
    for (const n of names) assert.ok(m[n] !== undefined, `${file} must export ${n}`);
  }
});

// ---------------------------------------------------------------- the daily-facts import script
const fact = (i, extra = {}) => ({
  id: `f_river_x${i}`, measure: 'river', pool: 'daily', label: `河${i}`, sub: null, value: 100 + i, approx: false, uncertainty: 0, year: 2013,
  source: '水利部公报', publisher: '水利部', url: 'https://example.gov.cn/a', licence: 'CN-GOV-GEO', retrievedAt: '2026-10-20',
  verifiedBy: ['author:product-ux', 'verifier:qa'], note: null, tags: [], status: 'active', since: 1, ...extra,
});

test('import script: converts a valid export to _id-keyed JSON Lines and refuses bad exports', () => {
  const facts = [fact(1), fact(2, { measure: 'year', value: -221 })];
  const v = importer.validateFacts(facts);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.perMeasure, { river: 1, year: 1 });
  const lines = importer.toImportLines(facts, 3).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0]._id, 'v3_f_river_x1');
  assert.equal(lines[0].contentVersion, 3);
  assert.equal(lines[0].pool, 'daily');
  const bad = [
    fact(1, { pool: 'free' }), fact(1), fact(3, { value: -5 }), fact(4, { url: 'http://x' }), fact(5, { measure: 'gdp' }),
    fact(6, { label: '一二三四五六七八九十十一' }), fact(7, { id: 'bad id' }), fact(8, { value: NaN }), fact(9, { source: '' }),
    fact(10, { measure: 'year', value: 1.5 }), fact(11, { label: '河1' }), fact(12, { status: 'weird' }),
  ];
  const errs = importer.validateFacts(bad).errors.join('\n');
  for (const needle of ['only daily-pool', 'duplicate id', 'out of range', 'https', 'unknown measure', 'longer than 10', 'bad id', 'finite', 'missing source', 'duplicate label', 'bad status']) {
    assert.ok(errs.includes(needle), `expected a problem containing "${needle}"`);
  }
  assert.ok(importer.validateFacts([]).errors.length);
});

test('import script CLI: reads .js/.json/.jsonl exports, writes only on a clean validation, --check writes nothing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bbyi-imp-'));
  const facts = [fact(1), fact(2)];
  const js = path.join(tmp, 'facts.js');
  fs.writeFileSync(js, `module.exports = { facts: ${JSON.stringify(facts)} };`);
  const json = path.join(tmp, 'facts.json');
  fs.writeFileSync(json, JSON.stringify(facts));
  const jsonl = path.join(tmp, 'facts.jsonl');
  fs.writeFileSync(jsonl, facts.map((f) => JSON.stringify(f)).join('\n'));
  const script = path.join(CF, 'scripts', 'import-daily-facts.js');
  for (const src of [js, json, jsonl]) {
    const out = path.join(tmp, `out-${path.extname(src).slice(1)}.import.jsonl`);
    execFileSync(process.execPath, [script, src, '--version', '2', '--out', out], { stdio: 'pipe' });
    assert.equal(read(out).trim().split('\n').length, 2);
  }
  const never = path.join(tmp, 'never.import.jsonl');
  execFileSync(process.execPath, [script, json, '--version', '2', '--out', never, '--check'], { stdio: 'pipe' });
  assert.equal(fs.existsSync(never), false);
  const badFile = path.join(tmp, 'bad.json');
  fs.writeFileSync(badFile, JSON.stringify([fact(1, { pool: 'free' })]));
  assert.throws(() => execFileSync(process.execPath, [script, badFile, '--version', '2', '--out', never], { stdio: 'pipe' }));
  assert.equal(fs.existsSync(never), false);
  assert.throws(() => execFileSync(process.execPath, [script, json], { stdio: 'pipe' }), /./);
});
