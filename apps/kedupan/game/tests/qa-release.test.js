'use strict';
// QA: the release gate really trips, and the standard release switch (tools/release-config.js, TD-61) works.
// Copies the game into a temp folder and, there:
//   - hand-flips cloudEnv without the packOptions.ignore entries: the gate must FAIL (mock + stub would ship);
//   - runs `release-config.js --env ... --shared-test-env`: the release-mode suites must PASS, and the pack simulated
//     from packOptions.ignore must hold neither dev file and still load the whole game graph;
//   - `--appid` validates and writes the AppID; without it the shared test AppID stays and a warning is printed;
//   - `--dev` restores the committed files byte for byte (including the test AppID).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GAME = path.join(__dirname, '..');
const TEST_APPID = 'wxcd03c1b62d7eb0e0';
const SKIP = new Set(['node_modules', 'cloudfunctions-deploy']);

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d); else fs.copyFileSync(s, d);
  }
}
// the 用户协议 is still a draft (D-2): the switch refuses a release build unless told otherwise; these tests are about the switch itself
const sw = (g, ...args) => spawnSync(process.execPath, [path.join(g, 'tools', 'release-config.js'), ...args, ...(args.includes('--env') && /^[^-]/.test(args[args.indexOf('--env') + 1] || '-') ? ['--allow-draft-terms'] : [])], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_ENV: 'test' }) });
/** a temp copy that is first reset to the dev state (so the suite also passes when run from a release-mode tree) */
function stage(viaScript) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kdp-rel-'));
  const g = path.join(root, 'apps', 'kedupan', 'game');
  copy(path.join(GAME, '..'), path.join(root, 'apps', 'kedupan')); // the whole app: some tests read ../cloudfunctions
  assert.equal(sw(g, '--dev').status, 0);
  if (viaScript) {
    const r = sw(g, '--env', 'env-release-test', '--shared-test-env');
    assert.equal(r.status, 0, r.stderr);
  } else {
    const bc = path.join(g, 'js', 'build-config.js');
    fs.writeFileSync(bc, fs.readFileSync(bc, 'utf8').replace(/^(\s*)cloudEnv: .*,/m, "$1cloudEnv: 'env-release-test',"));
  }
  return { root, g };
}
function runTests(g, files) {
  return spawnSync(process.execPath, ['--test'].concat(files), { cwd: g, encoding: 'utf8', timeout: 300000, env: Object.assign({}, process.env, { NODE_TEST_CONTEXT: undefined }) });
}

test('release gate: a hand-flipped cloud build without the ignore entries FAILS the gate (the mock and stub would ship)', () => {
  const { root, g } = stage(false);
  try {
    const r = runTests(g, ['tests/release-gate.test.js']);
    assert.notEqual(r.status, 0, 'the gate must fail\n' + r.stdout.slice(-800));
    assert.match(r.stdout, /packOptions\.ignore lacks js\/mock-server\.js|RELEASE config/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release gate: after the release switch the suites are green, and the simulated pack holds neither dev file', () => {
  const { root, g } = stage(true);
  try {
    const r = runTests(g, ['tests/release-gate.test.js', 'tests/wechat-compat.test.js', 'tests/hygiene.test.js', 'tests/release-gate-pack.test.js', 'tests/api.test.js', 'tests/client-ads.test.js']);
    assert.equal(r.status, 0, 'the release-mode suites must be green\n' + r.stdout.slice(-1500));
    assert.match(r.stdout, /✔ RELEASE config: cloudEnv set/);
    assert.doesNotMatch(r.stdout, /✖/);
    const cfg = JSON.parse(fs.readFileSync(path.join(g, 'project.config.json'), 'utf8'));
    assert.equal(cfg.cloudfunctionRoot, 'cloudfunctions-deploy/');
    assert.equal(cfg.appid, TEST_APPID, 'no --appid: the shared test AppID stays');
    const ignored = cfg.packOptions.ignore;
    const shipped = [];
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r2 = rel ? rel + '/' + e.name : e.name;
        if (r2 === 'project.private.config.json') continue; // DevTools-local, gitignored, never uploaded
        if (ignored.some((i) => (i.type === 'folder' ? r2 === i.value || r2.startsWith(i.value + '/') : r2 === i.value))) continue;
        if (e.isDirectory()) walk(path.join(d, e.name), r2); else shipped.push(r2);
      }
    };
    walk(g, '');
    assert.ok(!shipped.includes('js/mock-server.js') && !shipped.includes('js/stub-render.js'));
    assert.ok(shipped.includes('game.js') && shipped.includes('js/api.js') && shipped.includes('js/renderers.js'));
    assert.ok(!shipped.includes('core/content/anchors.v1.js') && !shipped.includes('core/content/schedule.v1.js'), 'the answer key and the schedule are server-only (TD-62)');
    assert.ok(!shipped.some((f) => /^tests\/|^tools\//.test(f)));
    // the only shipped references to the dev files are the lazy requires in api.js / renderers.js
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, '');
    const refs = shipped.filter((f) => f.endsWith('.js') && /require\(['"]\.\/(mock-server|stub-render)['"]\)/.test(strip(fs.readFileSync(path.join(g, f), 'utf8'))));
    assert.deepEqual(refs.sort(), ['js/api.js', 'js/renderers.js']);
    const total = shipped.reduce((n, f) => n + fs.statSync(path.join(g, f)).size, 0);
    assert.ok(total < 4 * 1024 * 1024, 'main package ' + total);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release switch: --dev restores the dev files byte for byte after --env; fnPrefix follows --shared-test-env; bad input is refused', () => {
  const { root, g } = stage(false);
  try {
    assert.equal(sw(g, '--dev').status, 0);
    const files = ['js/build-config.js', 'project.config.json'];
    const rd = () => files.map((f) => fs.readFileSync(path.join(g, f), 'utf8'));
    const dev = rd();
    assert.match(dev[0], /cloudEnv: '',/);
    assert.equal(sw(g, '--env', 'env-x').status, 0);
    assert.match(rd()[0], /fnPrefix: '',/);
    assert.equal(sw(g, '--env', 'env-x', '--shared-test-env').status, 0);
    assert.match(rd()[0], /fnPrefix: 'kedupan_',/);
    assert.match(rd()[0], /stubAds: false,/);
    assert.match(rd()[0], /adUnits: \{ rewarded: '', interstitial: '' \}/, 'adUnits are never touched');
    const rel = rd();
    assert.equal(sw(g, '--env', 'env-x', '--shared-test-env').status, 0, 'idempotent');
    assert.deepEqual(rd(), rel);
    assert.equal(sw(g, '--dev').status, 0);
    assert.deepEqual(rd(), dev);
    assert.notEqual(sw(g, '--env').status, 0);
    assert.notEqual(sw(g, '--env', "a'b").status, 0);
    assert.notEqual(sw(g).status, 0);
    assert.deepEqual(rd(), dev, 'refused input changes nothing');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release switch: --appid is validated and written, omitted it warns and keeps the test AppID, --dev restores it byte for byte', () => {
  const { root, g } = stage(false);
  try {
    const pc = path.join(g, 'project.config.json');
    assert.equal(sw(g, '--dev').status, 0);
    const dev = fs.readFileSync(pc, 'utf8');
    assert.equal(JSON.parse(dev).appid, TEST_APPID);
    const warn = sw(g, '--env', 'env-x');
    assert.equal(warn.status, 0);
    assert.match(warn.stderr, /release build still uses the shared test AppID/);
    assert.equal(JSON.parse(fs.readFileSync(pc, 'utf8')).appid, TEST_APPID);
    const ok = sw(g, '--env', 'env-x', '--appid', 'wx0123456789abcdef');
    assert.equal(ok.status, 0, ok.stderr);
    assert.doesNotMatch(ok.stderr, /shared test AppID/);
    assert.equal(JSON.parse(fs.readFileSync(pc, 'utf8')).appid, 'wx0123456789abcdef');
    assert.equal(sw(g, '--env', 'env-x', '--appid', 'wx0123456789abcdef').status, 0, 'idempotent');
    const before = fs.readFileSync(pc, 'utf8');
    for (const bad of ['wx123', 'WX0123456789abcdef', 'wx0123456789abcdeg', 'wx0123456789abcdef0', 'abc0123456789abcdef', '']) {
      assert.notEqual(sw(g, '--env', 'env-x', '--appid', bad).status, 0, 'refuse ' + bad);
    }
    assert.notEqual(sw(g, '--env', 'env-x', '--appid').status, 0);
    assert.equal(fs.readFileSync(pc, 'utf8'), before, 'refused input changes nothing');
    assert.equal(sw(g, '--dev').status, 0);
    assert.equal(fs.readFileSync(pc, 'utf8'), dev);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the committed tree is in dev state: project.config.json lists no dev-only file and has the test AppID (run --dev before committing)', { skip: !!require('../js/build-config').cloudEnv && 'tree is in release configuration' }, () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  const ig = cfg.packOptions.ignore.map((i) => i.value);
  assert.ok(!ig.includes('js/mock-server.js') && !ig.includes('js/stub-render.js'));
  assert.equal(cfg.appid, TEST_APPID);
});

test('local DevTools artifacts do not matter: a project.private.config.json and a reformatted project.config.json in a temp copy keep the suite green', () => {
  const { root, g } = stage(false);
  try {
    assert.equal(sw(g, '--dev').status, 0);
    fs.writeFileSync(path.join(g, 'project.private.config.json'), JSON.stringify({ description: 'devtools', projectname: 'x', setting: { compileHotReLoad: true } }, null, '\t'));
    const pcPath = path.join(g, 'project.config.json');
    fs.writeFileSync(pcPath, JSON.stringify(JSON.parse(fs.readFileSync(pcPath, 'utf8')), null, '\t')); // tabs, no trailing newline
    const r = runTests(g, ['tests/wechat-compat.test.js', 'tests/release-gate.test.js', 'tests/release-gate-pack.test.js', 'tests/hygiene.test.js']);
    assert.equal(r.status, 0, 'suite must stay green\n' + r.stdout.slice(-1500));
    assert.equal(sw(g, '--env', 'env-x').status, 0, 'the switch copes with a reformatted file');
    assert.equal(sw(g, '--dev').status, 0);
    assert.equal(sw(g, '--status').stdout.trim(), 'dev');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
