'use strict';
/**
 * QA-2 release gate (studio pattern, tools/release-config.js + tests/mode.js): a release build (cloudEnv set) never ships
 * or loads the mock server or the stub renderer, never shows test ads, and the user agreement is final. Dev-state
 * assertions use devOnly, release-state assertions use releaseOnly, so `npm test` is green in both modes. Steps: RELEASE.md.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootGame } = require('./harness');
const build = require('../js/build-config');
const { RELEASE, DEV_BUILD, devOnly, releaseOnly } = require('./mode');
const { DEV_ONLY_FILES, SERVER_ONLY_FILES, termsProblems } = require('../tools/release-config');

const GAME = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(GAME, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const ignoredValues = () => JSON.parse(read('project.config.json')).packOptions.ignore.map((i) => i.value);
const CLOUD = { cloudEnv: 'env-1', fnPrefix: 'chuanhua_', stubAds: false, envKind: 'prod' };

test('the dev-only list is exactly the mock server and the stub renderer', () => {
  assert.deepEqual(DEV_ONLY_FILES.slice().sort(), ['js/mock-server.js', 'js/stub-render.js']);
  for (const f of DEV_ONLY_FILES) assert.ok(fs.existsSync(path.join(GAME, f)), f);
});

test('DEV config: cloudEnv empty, no prefix, stub ads on, the dev files ship so DevTools boots with no backend', devOnly, () => {
  assert.equal(build.cloudEnv, '');
  assert.equal(build.fnPrefix, '');
  assert.equal(build.envKind, 'dev');
  assert.equal(build.stubAds, true);
  for (const f of DEV_ONLY_FILES) assert.ok(!ignoredValues().includes(f), f + ' must not be ignored in dev');
});

test('RELEASE config: cloudEnv set, envKind prod, real ads, every dev-only file in packOptions.ignore, the agreement is final', releaseOnly, () => {
  assert.ok(build.cloudEnv);
  assert.equal(build.envKind, 'prod');
  assert.ok(build.fnPrefix === '' || build.fnPrefix === 'chuanhua_');
  assert.equal(build.stubAds, false, 'stub ads must be off in a release build');
  for (const f of DEV_ONLY_FILES.concat(SERVER_ONLY_FILES)) assert.ok(ignoredValues().includes(f), 'strip ' + f + ' from the release package');
  assert.deepEqual(termsProblems(GAME), [], 'js/terms-text.js still has the draft marker or a placeholder');
});

test('the mock server and the stub renderer are required lazily, only by api.js / renderers.js, never at module top level', () => {
  const users = { 'mock-server': [], 'stub-render': [] };
  for (const f of walk(path.join(GAME, 'js')).filter((x) => x.endsWith('.js'))) {
    const rel = path.relative(GAME, f).split(path.sep).join('/');
    const src = strip(fs.readFileSync(f, 'utf8'));
    for (const k of Object.keys(users)) {
      if (new RegExp("require\\('\\./" + k + "'\\)").test(src)) users[k].push(rel);
      assert.ok(!new RegExp("^(const|let|var) .*require\\('\\./" + k + "'\\)", 'm').test(src), rel + ': top-level require of ' + k);
    }
  }
  assert.deepEqual(users['mock-server'], ['js/api.js']);
  assert.deepEqual(users['stub-render'], ['js/renderers.js']);
  assert.match(strip(read('js/api.js')), /mode === 'mock' && !refuse \? opts\.mockServer \|\| require\('\.\/mock-server'\)/);
});

test('a cloud-mode boot never loads the mock server or the stub renderer, runs prod with real ads and the real renderer', async (t) => {
  const g = bootGame(t, { build: CLOUD });
  await g.settle();
  const loaded = g.loader.loaded();
  for (const f of DEV_ONLY_FILES) assert.ok(!loaded.includes(f), f + ' must not load in a cloud build');
  assert.equal(g.app.api.mode, 'cloud');
  assert.equal(g.app.api.mock, null);
  assert.equal(g.app.renderer.kind, 'real');
  assert.equal(g.app.ads.stub, false);
  assert.ok(!g.frame().includes('广告位（测试）'));
});

test('a cloud boot with only cloudEnv set (stubAds / envKind left at dev values) still has no test ads and is prod', async (t) => {
  const g = bootGame(t, { build: { cloudEnv: 'env-1', stubAds: true, envKind: 'dev' } });
  await g.settle();
  assert.equal(g.app.ads.stub, false);
  assert.equal(g.app.api.mode, 'cloud');
  for (const f of DEV_ONLY_FILES) assert.ok(!g.loader.loaded().includes(f), f);
});

test('a dev boot (the explicit dev build, any config mode) uses the mock server', async (t) => {
  const g = bootGame(t, { build: DEV_BUILD });
  await g.settle();
  assert.equal(g.app.api.mode, 'mock');
  assert.ok(g.loader.loaded().includes('js/mock-server.js'));
});

test('the renderer loader refuses the stub in a cloud build (throws if the real renderer cannot load)', () => {
  const src = strip(read('js/renderers.js'));
  assert.match(src, /if \(cloud\) throw new Error/);
  assert.match(src, /if \(cloud\) return \[\]/);
});

test('nothing in js/ hard-codes contentVersion 1', () => {
  for (const f of walk(path.join(GAME, 'js')).filter((x) => x.endsWith('.js'))) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    assert.ok(!/getContent\(\s*1\s*\)|contentVersion\s*[:=]\s*1\b/.test(src), path.relative(GAME, f));
  }
  assert.ok(typeof RELEASE === 'boolean');
});

// ---- the prompt bank is server-only (CTO ruling, TD-103) -----------------------------------------------------------------------

/** the files a RELEASE package would contain: everything under game/ minus the base packOptions.ignore minus the release-only ignores */
function releasePackFiles() {
  const base = JSON.parse(read('project.config.json')).packOptions.ignore.map((i) => i.value);
  const ignore = new Set(base.concat(DEV_ONLY_FILES, SERVER_ONLY_FILES));
  return walk(GAME).map((f) => path.relative(GAME, f).split(path.sep).join('/')).filter((rel) => {
    if (ignore.has(rel)) return false;
    return !rel.split('/').some((_, i, a) => ignore.has(a.slice(0, i + 1).join('/')));
  });
}

test('the server-only list is exactly the prompt bank files and core/prompts.js, and they exist', () => {
  assert.deepEqual(SERVER_ONLY_FILES.slice().sort(), ['core/content/prompts.v1.js', 'core/content/prompts.v2.js', 'core/prompts.js']);
  for (const f of SERVER_ONLY_FILES) assert.ok(fs.existsSync(path.join(GAME, f)), f);
});

test('the packed RELEASE client contains no prompt-bank text and no file that requires the bank', () => {
  const v2 = require('../core/content/prompts.v2');
  const sample = v2.prompts.filter((_, i) => i % 40 === 0).map((p) => p.text).filter((t) => t.length >= 5);
  assert.ok(sample.length > 30);
  const files = releasePackFiles().filter((f) => f.endsWith('.js'));
  assert.ok(files.includes('core/room.js') && files.includes('core/text.js'), 'the pack simulation sees the shipped core');
  const leaks = [];
  const reqRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const rel of files) {
    const src = read(rel);
    const hit = sample.filter((t) => src.includes(t));
    if (hit.length > 2) leaks.push(rel + ' carries bank text (' + hit.slice(0, 3).join(',') + ')');
    let m;
    while ((m = reqRe.exec(strip(src)))) {
      if (!m[1].startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])).replace(/\.js$/, '') + '.js';
      if (SERVER_ONLY_FILES.includes(target)) leaks.push(rel + ' requires ' + target + ', which a release package strips');
    }
  }
  assert.deepEqual(leaks, []);
});
