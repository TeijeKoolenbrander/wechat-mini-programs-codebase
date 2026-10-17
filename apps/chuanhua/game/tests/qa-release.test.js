'use strict';
// The release gate really trips and the studio release switch (tools/release-config.js) works. In a temp copy of the game:
//   - hand-flipping cloudEnv without the packOptions.ignore entries makes the gate FAIL;
//   - release mode is REFUSED while the agreement still has the draft marker / placeholders (QA-7);
//   - with a final agreement, `--env ... --shared-test-env` makes the release-mode suite pass and the simulated pack holds
//     neither dev file and still loads the whole game graph;
//   - `--dev` restores both files byte for byte.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GAME = path.join(__dirname, '..');
const SKIP = new Set(['node_modules']);
const DRAFT_TERMS = "'use strict';\nmodule.exports = { title: '传画接龙用户服务协议', draft: '【草稿：未经运营主体审定，不得发布。】', paragraphs: [{ text: '运营主体：【运营主体名称】' }] };\n";
const FINAL_TERMS = "'use strict';\nmodule.exports = { title: '传画接龙用户服务协议', paragraphs: [{ text: '一、服务说明', heading: true }, { text: '正文' }] };\n";

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d); else fs.copyFileSync(s, d);
  }
}
const sw = (g, ...args) => spawnSync(process.execPath, [path.join(g, 'tools', 'release-config.js'), ...args], { encoding: 'utf8' });
/** a temp copy reset to the dev state first (so this file also passes when run from a release-mode tree) */
function stage(how) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-rel-'));
  const g = path.join(root, 'apps', 'chuanhua', 'game');
  copy(GAME, g);
  assert.equal(sw(g, '--dev').status, 0);
  if (how === 'hand') {
    const bc = path.join(g, 'js', 'build-config.js');
    fs.writeFileSync(bc, fs.readFileSync(bc, 'utf8').replace(/^const cloudEnv = .*;$/m, "const cloudEnv = 'env-release-test';"));
  } else if (how === 'draft') {
    fs.writeFileSync(path.join(g, 'js', 'terms-text.js'), DRAFT_TERMS); // whatever the tree holds, this one is a draft
  } else if (how === 'script') {
    fs.writeFileSync(path.join(g, 'js', 'terms-text.js'), FINAL_TERMS);
    const r = sw(g, '--env', 'env-release-test', '--shared-test-env');
    assert.equal(r.status, 0, r.stderr);
  }
  return { root, g };
}
function runTests(g, files) {
  return spawnSync(process.execPath, ['--test'].concat(files), { cwd: g, encoding: 'utf8', timeout: 240000, env: Object.assign({}, process.env, { NODE_TEST_CONTEXT: undefined }) });
}

test('release gate: a hand-flipped cloud build without the ignore entries FAILS the gate (the mock and the stub renderer would ship)', () => {
  const { root, g } = stage('hand');
  try {
    const r = runTests(g, ['tests/release-gate.test.js']);
    assert.notEqual(r.status, 0, 'the gate must fail\n' + r.stdout.slice(-800));
    assert.match(r.stdout, /strip js\/mock-server\.js from the release package|strip js\/stub-render\.js/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release switch refuses release mode while the agreement is a draft, and changes nothing', () => {
  const { root, g } = stage('draft');
  try {
    const files = ['js/build-config.js', 'project.config.json'];
    const before = files.map((f) => fs.readFileSync(path.join(g, f), 'utf8'));
    const r = sw(g, '--env', 'env-x');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /user agreement is not final/);
    assert.match(r.stderr, /draft marker|placeholder/);
    assert.deepEqual(files.map((f) => fs.readFileSync(path.join(g, f), 'utf8')), before);
    assert.equal(sw(g, '--status').stdout.trim(), 'dev');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release gate: after the release switch the suite is green in release mode and the simulated pack holds neither dev file', () => {
  const { root, g } = stage('script');
  try {
    const r = runTests(g, ['tests/release-gate.test.js', 'tests/client-units.test.js', 'tests/client-chain.test.js', 'tests/client-room.test.js']);
    assert.equal(r.status, 0, 'the release-mode suite must be green\n' + r.stdout.slice(-1800));
    assert.match(r.stdout, /RELEASE config: cloudEnv set/);
    assert.doesNotMatch(r.stdout, /✖/);
    const cfg = JSON.parse(fs.readFileSync(path.join(g, 'project.config.json'), 'utf8'));
    const ignored = cfg.packOptions.ignore;
    const shipped = [];
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r2 = rel ? rel + '/' + e.name : e.name;
        if (r2 === 'project.private.config.json') continue; // DevTools-local, never uploaded
        if (ignored.some((i) => (i.type === 'folder' ? r2 === i.value || r2.startsWith(i.value + '/') : r2 === i.value))) continue;
        if (e.isDirectory()) walk(path.join(d, e.name), r2); else shipped.push(r2);
      }
    };
    walk(g, '');
    assert.ok(!shipped.includes('js/mock-server.js') && !shipped.includes('js/stub-render.js'));
    assert.ok(shipped.includes('game.js') && shipped.includes('js/terms-text.js') && shipped.includes('js/render/index.js'));
    // no shipped file requires a dev file other than the two lazy call sites
    const refs = shipped.filter((f) => f.endsWith('.js') && /require\('\.\/(mock-server|stub-render)'\)/.test(fs.readFileSync(path.join(g, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
    assert.deepEqual(refs.sort(), ['js/api.js', 'js/renderers.js']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release switch: --dev restores the dev files byte for byte after --env; fnPrefix is always chuanhua_ in release (--shared-test-env is a deprecated alias); bad input is refused', () => {
  const { root, g } = stage('none');
  try {
    fs.writeFileSync(path.join(g, 'js', 'terms-text.js'), FINAL_TERMS);
    const files = ['js/build-config.js', 'project.config.json'];
    // bytes are valid here: stage() ran --dev first, which re-serialises project.config.json canonically, so any DevTools
    // reformatting of the source file is already normalised away before `dev` is captured (and --dev is deterministic).
    const dev = files.map((f) => fs.readFileSync(path.join(g, f), 'utf8'));
    assert.match(dev[0], /const cloudEnv = '';/);
    assert.equal(sw(g, '--env', 'env-x').status, 0);
    assert.match(fs.readFileSync(path.join(g, files[0]), 'utf8'), /const fnPrefix = 'chuanhua_';/); // release is always prefixed (A3)
    assert.equal(sw(g, '--env', 'env-x', '--shared-test-env').status, 0);
    assert.match(fs.readFileSync(path.join(g, files[0]), 'utf8'), /const fnPrefix = 'chuanhua_';\r?\nconst stubAds = false;/);
    assert.equal(sw(g, '--env', 'env-x', '--shared-test-env').status, 0, 'idempotent');
    assert.equal(sw(g, '--dev').status, 0);
    assert.deepEqual(files.map((f) => fs.readFileSync(path.join(g, f), 'utf8')), dev);
    assert.notEqual(sw(g, '--env').status, 0);
    assert.notEqual(sw(g, '--env', "a'b").status, 0);
    assert.notEqual(sw(g).status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the committed tree is in dev state: project.config.json lists no dev-only file (run --dev before committing)', { skip: !!require('../js/build-config').cloudEnv && 'tree is in release configuration' }, () => {
  const ig = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8')).packOptions.ignore.map((i) => i.value);
  assert.ok(!ig.includes('js/mock-server.js') && !ig.includes('js/stub-render.js'));
});

test('local DevTools artifacts do not matter: a project.private.config.json and a reformatted project.config.json in a temp copy keep the suite green', () => {
  const { root, g } = stage('none');
  try {
    copy(path.join(GAME, '..', 'cloudfunctions'), path.join(root, 'apps', 'chuanhua', 'cloudfunctions')); // sibling folder some package tests read
    fs.copyFileSync(path.join(GAME, '..', '..', '..', '.gitignore'), path.join(root, '.gitignore'));
    fs.writeFileSync(path.join(g, 'project.private.config.json'), JSON.stringify({ description: 'devtools', projectname: 'x', setting: { compileHotReLoad: true } }, null, '\t'));
    const pcPath = path.join(g, 'project.config.json');
    fs.writeFileSync(pcPath, JSON.stringify(JSON.parse(fs.readFileSync(pcPath, 'utf8')), null, '\t')); // tabs, no trailing newline
    const r = runTests(g, ['tests/qa-client.test.js', 'tests/wechat-compat.test.js', 'tests/release-gate.test.js']);
    assert.equal(r.status, 0, 'suite must stay green\n' + r.stdout.slice(-1500));
    assert.equal(sw(g, '--dev').status, 0);
    assert.equal(sw(g, '--status').stdout.trim(), 'dev');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
