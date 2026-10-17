'use strict';
/**
 * QA-6 release gate (three-way split, TD-61): a release build (cloudEnv set) never ships or loads the mock server or
 * the stub renderer and runs with stubAds false. Mode-independent checks run always; `releaseOnly` checks the release
 * state written by tools/release-config.js; `devOnly` checks the committed dev defaults. Steps: game/RELEASE.md.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot } = require('./harness');
const build = require('../js/build-config');
const { devOnly, releaseOnly, DEV_BUILD } = require('./mode');

const GAME = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(GAME, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DEV_ONLY = ['js/mock-server.js', 'js/stub-render.js']; // = DEV_ONLY_FILES in tools/release-config.js (asserted below)
const FNPREFIX = 'kedupan_';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

/** The release rules as one function, so the same check is exercised on a simulated release config. */
function releaseProblems(b, cfg) {
  const out = [];
  if (!b.cloudEnv) out.push('cloudEnv empty');
  if (b.stubAds) out.push('stubAds must be false');
  const ignored = cfg.packOptions.ignore.map((i) => i.value);
  for (const f of DEV_ONLY) if (!ignored.includes(f)) out.push('packOptions.ignore lacks ' + f);
  return out;
}
/** the project config with the dev-only entries removed (the dev state), whatever mode the tree is in */
function devConfig() {
  const cfg = JSON.parse(read('project.config.json'));
  cfg.packOptions.ignore = cfg.packOptions.ignore.filter((i) => !DEV_ONLY.includes(i.value));
  return cfg;
}

// ---- both modes ----

test('tools/release-config.js manages exactly the dev-only files of this gate', () => {
  const rc = require('../tools/release-config');
  assert.deepEqual(rc.DEV_ONLY_FILES, DEV_ONLY);
  assert.equal(rc.FN_PREFIX, FNPREFIX);
  for (const f of DEV_ONLY) assert.ok(fs.existsSync(path.join(GAME, f)), f);
});

test('project.config.json: cloudfunctionRoot and its ignore entry exist in both modes', () => {
  const cfg = JSON.parse(read('project.config.json'));
  assert.equal(cfg.cloudfunctionRoot, 'cloudfunctions-deploy/');
  const ignored = cfg.packOptions.ignore.map((i) => i.value);
  for (const f of ['cloudfunctions-deploy', 'tests', 'tools']) assert.ok(ignored.includes(f), f);
});

test('release gate logic: flags a release config that forgets the ignore entries or leaves stubAds on', () => {
  const cfg = devConfig();
  const rel = { cloudEnv: 'env-1', stubAds: false };
  assert.ok(releaseProblems(rel, cfg).some((p) => /mock-server/.test(p)), 'dev config lacks the ignore entries');
  const withIgnore = { packOptions: { ignore: cfg.packOptions.ignore.concat(DEV_ONLY.map((value) => ({ value, type: 'file' }))) } };
  assert.deepEqual(releaseProblems(rel, withIgnore), []);
  assert.deepEqual(releaseProblems({ cloudEnv: 'e', stubAds: true }, withIgnore), ['stubAds must be false']);
  assert.deepEqual(releaseProblems({ cloudEnv: '', stubAds: false }, withIgnore), ['cloudEnv empty']);
});

test('the mock server and the stub renderer are required lazily, never at module top level', () => {
  for (const f of walk(path.join(GAME, 'js')).filter((x) => x.endsWith('.js'))) {
    const rel = path.relative(GAME, f).split(path.sep).join('/');
    const src = strip(fs.readFileSync(f, 'utf8'));
    assert.ok(!/^(const|let|var) .*require\('\.\/(mock-server|stub-render)'\)/m.test(src), rel + ': top-level require of a dev-only file');
  }
  assert.ok(!/require\('\.\/mock-server'\)/.test(strip(read('js/main.js'))));
});

test('a cloud-mode boot never requires the mock server or the stub renderer', async (t) => {
  const g = await boot(t, { real: true, build: { cloudEnv: 'env-1', fnPrefix: FNPREFIX, stubAds: false } });
  await g.settle();
  const loaded = g.loader.loaded();
  for (const f of DEV_ONLY) assert.ok(!loaded.includes(f), f + ' must not load in a cloud build');
  assert.equal(g.app.api.mode, 'cloud');
  assert.equal(g.app.api.mock, null);
  assert.equal(g.app.renderer.kind, 'real');
});

test('a dev boot (the explicit dev build, so also in release configuration) uses the mock server', async (t) => {
  const g = await boot(t, { build: DEV_BUILD });
  await g.settle();
  assert.equal(g.app.api.mode, 'mock');
  assert.ok(g.loader.loaded().includes('js/mock-server.js'));
});

test('nothing in js/ hard-codes contentVersion 1', () => {
  for (const f of walk(path.join(GAME, 'js')).filter((x) => x.endsWith('.js'))) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    assert.ok(!/getContent\(\s*1\s*\)|contentVersion\s*[:=]\s*1\b/.test(src), path.relative(GAME, f));
  }
});

test('the settings vm carries the AIGC note', async (t) => {
  const g = await boot(t);
  await g.settle();
  if (g.has('sheet:close')) await g.tap('sheet:close');
  await g.tap('home:settings');
  assert.equal(g.view().vm.settings.aigcNote, '题库内容由 AI 辅助编写，并经人工审核');
});

// ---- release configuration only ----

test('RELEASE config: cloudEnv set, real ads, fnPrefix "" or kedupan_, every dev-only file is in packOptions.ignore (QA-6)', releaseOnly, () => {
  const cfg = JSON.parse(read('project.config.json'));
  assert.deepEqual(releaseProblems(build, cfg), []);
  assert.ok(build.fnPrefix === '' || build.fnPrefix === FNPREFIX, 'fnPrefix is "" or ' + FNPREFIX + ', got ' + build.fnPrefix);
  assert.equal(build.stubAds, false, 'stub ads must be off in a release build');
});

// ---- dev configuration only ----

test('DEV config: cloudEnv empty, no fnPrefix, stubAds false, the mock files are not ignored (DevTools boots the mock)', devOnly, () => {
  const ignored = JSON.parse(read('project.config.json')).packOptions.ignore.map((i) => i.value);
  assert.equal(build.cloudEnv, '');
  assert.equal(build.fnPrefix, '');
  assert.equal(build.stubAds, false);
  for (const f of DEV_ONLY) assert.ok(!ignored.includes(f), f + ' must not be ignored in dev (the mock would not boot)');
});
