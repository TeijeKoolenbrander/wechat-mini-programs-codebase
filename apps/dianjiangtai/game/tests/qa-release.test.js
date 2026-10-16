'use strict';
// QA: the release gate really trips, and the standard release switch (tools/release-config.js, TD-9) works.
// Copies the game into a temp folder and, there:
//   - hand-flips cloudEnv without the packOptions.ignore entries: the gate must FAIL (the mock and stub renderer would ship);
//   - runs `release-config.js --env ... --shared-test-env`: the release-mode suite must PASS, and the pack simulated
//     from packOptions.ignore must hold neither dev file, no answer data, and still load the whole game graph;
//   - `--dev` restores the committed files byte for byte.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GAME = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'cloudfunctions-deploy']);

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d); else fs.copyFileSync(s, d);
  }
}
const sw = (g, ...args) => spawnSync(process.execPath, [path.join(g, 'tools', 'release-config.js'), ...args], { encoding: 'utf8' });
/** a temp copy that is first reset to the dev state (so the suite also passes when run from a release-mode tree) */
function stage(viaScript) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'djt-rel-'));
  const g = path.join(root, 'apps', 'dianjiangtai', 'game');
  copy(GAME, g);
  assert.equal(sw(g, '--dev').status, 0);
  if (viaScript) {
    const r = sw(g, '--env', 'env-release-test', '--shared-test-env');
    assert.equal(r.status, 0, r.stderr);
  } else {
    const bc = path.join(g, 'js', 'build-config.js');
    fs.writeFileSync(bc, fs.readFileSync(bc, 'utf8').replace(/^const cloudEnv = .*;$/m, "const cloudEnv = 'env-release-test';"));
  }
  return { root, g };
}
function runTests(g, files) {
  return spawnSync(process.execPath, ['--test'].concat(files), { cwd: g, encoding: 'utf8', timeout: 280000, env: Object.assign({}, process.env, { NODE_TEST_CONTEXT: undefined }) });
}

test('release gate: a hand-flipped cloud build without the ignore entries FAILS the gate (the mock and stub renderer would ship)', () => {
  const { root, g } = stage(false);
  try {
    const r = runTests(g, ['tests/release-gate.test.js']);
    assert.notEqual(r.status, 0, 'the gate must fail\n' + r.stdout.slice(-800));
    assert.match(r.stdout, /strip js\/mock-server\.js|strip js\/stub-render\.js/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release gate: after the release switch the suite is green, and the simulated pack holds neither dev file nor any answer data', () => {
  const { root, g } = stage(true);
  try {
    const r = runTests(g, ['tests/release-gate.test.js', 'tests/client-units.test.js', 'tests/modules.test.js']);
    assert.equal(r.status, 0, 'the release-mode suite must be green\n' + r.stdout.slice(-1500));
    assert.match(r.stdout, /✔ RELEASE config: cloudEnv set/);
    assert.match(r.stdout, /✔ a release package with the dev-only files stripped boots/);
    assert.doesNotMatch(r.stdout, /✖/);
    // simulate the DevTools pack: apply packOptions.ignore, then check what ships
    const cfg = JSON.parse(fs.readFileSync(path.join(g, 'project.config.json'), 'utf8'));
    assert.equal(cfg.cloudfunctionRoot, 'cloudfunctions-deploy/');
    const ignored = cfg.packOptions.ignore;
    const shipped = [];
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r2 = rel ? rel + '/' + e.name : e.name;
        if (r2 === 'project.private.config.json') continue; // DevTools-local, gitignored, never uploaded
        const hit = ignored.some((i) => (i.type === 'folder' ? r2 === i.value || r2.startsWith(i.value + '/') : r2 === i.value));
        if (hit) continue;
        if (e.isDirectory()) walk(path.join(d, e.name), r2); else shipped.push(r2);
      }
    };
    walk(g, '');
    assert.ok(!shipped.includes('js/stub-render.js') && !shipped.includes('js/mock-server.js'));
    assert.ok(shipped.includes('game.js') && shipped.includes('js/render/index.js'));
    assert.ok(!shipped.some((f) => /^tests\/|^tools\/|^cloudfunctions-deploy\//.test(f)), 'no tests, tools or staged functions in the pack');
    // the answer key never ships: no seed bank, no best-lineup file, no tooling output
    assert.ok(!shipped.some((f) => /bank|simstats|optimal/i.test(f)), 'no seed bank or optimum data in the pack');
    const total = shipped.reduce((n, f) => n + fs.statSync(path.join(g, f)).size, 0);
    assert.ok(total < 4 * 1024 * 1024, 'main package ' + total);
    const w = runTests(g, ['tests/modules.test.js']);
    assert.equal(w.status, 0, w.stdout.slice(-1500));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release switch: --dev restores the dev files byte for byte after --env; fnPrefix is always dianjiangtai_ in release; --appid and the ad unit flags are written and restored; bad input is refused', () => {
  const { root, g } = stage(false);
  try {
    assert.equal(sw(g, '--dev').status, 0);
    const files = ['js/build-config.js', 'project.config.json'];
    const dev = files.map((f) => fs.readFileSync(path.join(g, f), 'utf8'));
    assert.match(dev[0], /const cloudEnv = '';/);
    assert.equal(sw(g, '--env', 'env-x').status, 0);
    assert.match(fs.readFileSync(path.join(g, files[0]), 'utf8'), /const fnPrefix = 'dianjiangtai_';/, 'staged names are always dianjiangtai_<name>');
    assert.equal(sw(g, '--env', 'env-x', '--prefixed-functions').status, 0);
    assert.match(fs.readFileSync(path.join(g, files[0]), 'utf8'), /const fnPrefix = 'dianjiangtai_';\r?\nconst stubAds = false;/);
    assert.equal(sw(g, '--env', 'env-x', '--shared-test-env').status, 0, 'idempotent; the old flag name is still accepted');
    // --appid and the ad unit ids: written in release mode, restored by --dev
    const wAppid = sw(g, '--env', 'env-x', '--appid', 'wx0123456789abcdef', '--ad-rewarded', 'adunit-0123456789abcdef', '--ad-interstitial', 'adunit-fedcba9876543210');
    assert.equal(wAppid.status, 0, wAppid.stderr);
    assert.doesNotMatch(wAppid.stderr, /shared test AppID/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(g, files[1]), 'utf8')).appid, 'wx0123456789abcdef');
    assert.match(fs.readFileSync(path.join(g, files[0]), 'utf8'), /adUnits: \{ rewarded: 'adunit-0123456789abcdef', interstitial: 'adunit-fedcba9876543210' \},/);
    assert.equal(sw(g, '--env', 'env-x', '--appid', 'wx0123456789abcdef').status, 0, 'a later release run without ad ids resets them');
    assert.match(fs.readFileSync(path.join(g, files[0]), 'utf8'), /adUnits: \{ rewarded: '', interstitial: '' \},/);
    const noAppid = sw(g, '--env', 'env-x');
    assert.match(noAppid.stderr, /shared test AppID/, 'warns while the test AppID is kept');
    assert.equal(JSON.parse(fs.readFileSync(path.join(g, files[1]), 'utf8')).appid, 'wx0123456789abcdef', 'no --appid keeps the file value');
    assert.notEqual(sw(g, '--env', 'env-x', '--appid', 'wx123').status, 0);
    assert.notEqual(sw(g, '--env', 'env-x', '--appid').status, 0);
    assert.notEqual(sw(g, '--env', 'env-x', '--ad-rewarded', 'nope').status, 0);
    assert.equal(sw(g, '--dev').status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(g, files[1]), 'utf8')).appid, 'wxcd03c1b62d7eb0e0', '--dev restores the test AppID');
    assert.deepEqual(files.map((f) => fs.readFileSync(path.join(g, f), 'utf8')), dev);
    assert.notEqual(sw(g, '--env').status, 0);
    assert.notEqual(sw(g, '--env', "a'b").status, 0);
    assert.notEqual(sw(g).status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the committed tree is in dev state: project.config.json lists no dev-only file (run --dev before committing)', { skip: !!require('../js/build-config').cloudEnv && 'tree is in release configuration' }, () => {
  const ig = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8')).packOptions.ignore.map((i) => i.value);
  assert.ok(!ig.includes('js/stub-render.js') && !ig.includes('js/mock-server.js'));
});

test('local DevTools artifacts do not matter: a project.private.config.json and a reformatted project.config.json in a temp copy keep the suite green', () => {
  const { root, g } = stage(false);
  try {
    assert.equal(sw(g, '--dev').status, 0);
    fs.writeFileSync(path.join(g, 'project.private.config.json'), JSON.stringify({ description: 'devtools', projectname: 'x', setting: { compileHotReLoad: true } }, null, '\t'));
    const pcPath = path.join(g, 'project.config.json');
    fs.writeFileSync(pcPath, JSON.stringify(JSON.parse(fs.readFileSync(pcPath, 'utf8')), null, '\t')); // tabs, no trailing newline
    const r = runTests(g, ['tests/modules.test.js', 'tests/release-gate.test.js', 'tests/client-units.test.js']);
    assert.equal(r.status, 0, 'suite must stay green\n' + r.stdout.slice(-1500));
    assert.equal(sw(g, '--env', 'env-x', '--shared-test-env').status, 0, 'the switch copes with a reformatted file');
    assert.equal(sw(g, '--dev').status, 0);
    assert.equal(sw(g, '--status').stdout.trim(), 'dev');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
