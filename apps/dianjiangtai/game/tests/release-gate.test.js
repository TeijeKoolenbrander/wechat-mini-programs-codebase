'use strict';
/**
 * Release gate (studio standard, as for kedupan and bibiyi): the dev-only pieces (the in-memory mock server, the stub renderer, the
 * test seam) must not reach a release package or run in a cloud build, and the staged cloud function folders must stay out of the
 * game package.
 *
 * "Release build" = build-config cloudEnv set. The committed config is the dev build (cloudEnv empty, mock server) so DevTools boots
 * with no backend; the moment cloudEnv is set, the dev-only files must be listed in project.config.json packOptions.ignore or this
 * file fails. tools/release-config.js does both in one step (see RELEASE.md).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot } = require('./harness');
const build = require('../js/build-config');
const { RELEASE, devOnly, releaseOnly, checkAppId } = require('./mode');
const { DEV_ONLY_FILES, FN_PREFIX } = require('../tools/release-config');

const GAME = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(GAME, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DEV_ONLY = ['js/mock-server.js', 'js/stub-render.js'];
const shipped = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (['tests', 'tools', 'node_modules', 'cloudfunctions-deploy'].includes(e.name) ? [] : shipped(path.join(d, e.name))) : [path.join(d, e.name)]));
const rel = (f) => path.relative(GAME, f).split(path.sep).join('/');

test('the release switch manages exactly the dev-only files under js/ (mock server, stub renderer)', () => {
  assert.deepEqual(DEV_ONLY_FILES.slice().sort(), DEV_ONLY);
  assert.equal(FN_PREFIX, 'dianjiangtai_');
  for (const f of DEV_ONLY) assert.ok(fs.existsSync(path.join(GAME, f)), f);
});

test('project.config.json: the AppID for this mode, portrait game, staged cloud functions as cloudfunctionRoot and out of the package', () => {
  const cfg = JSON.parse(read('project.config.json'));
  checkAppId(cfg.appid);
  assert.equal(cfg.compileType, 'game');
  assert.equal(cfg.cloudfunctionRoot, 'cloudfunctions-deploy/');
  const ignored = cfg.packOptions.ignore;
  assert.ok(ignored.some((i) => i.value === 'cloudfunctions-deploy' && i.type === 'folder'), 'cloudfunctions-deploy is in packOptions.ignore');
  ['tests', 'tools', 'node_modules'].forEach((v) => assert.ok(ignored.some((i) => i.value === v && i.type === 'folder'), v));
  const game = JSON.parse(read('game.json'));
  assert.equal(game.deviceOrientation, 'portrait');
  assert.equal(game.openDataContext, 'opendata');
  assert.equal(read('game.js').trim(), "require('./js/main');");
});

test('the dev build is the committed one: cloudEnv empty, function prefix empty, test ads on (dev only); the prefix follows cloudEnv', devOnly, () => {
  assert.equal(build.cloudEnv, '');
  assert.equal(build.fnPrefix, '');
  assert.equal(build.stubAds, true, 'the dev state shows the 广告位（测试） stub; release-config forces it off');
  assert.deepEqual(build.adUnits, { rewarded: '', interstitial: '' });
  assert.match(read('js/build-config.js'), /const fnPrefix = cloudEnv \? 'dianjiangtai_' : '';/, 'one switch: setting cloudEnv also turns on the dianjiangtai_ function prefix');
});

test('RELEASE config: cloudEnv set, stub ads off, every function called as dianjiangtai_<name>', releaseOnly, () => {
  assert.ok(build.cloudEnv);
  assert.equal(build.stubAds, false, 'RELEASE GATE: stubAds must be false, test ads never ship (AC 43, V1-3)');
  assert.equal(build.fnPrefix, 'dianjiangtai_');
});

test('a release build (cloudEnv set) must list the dev-only files in packOptions.ignore', () => {
  const cfg = JSON.parse(read('project.config.json'));
  const ignored = cfg.packOptions.ignore.map((i) => i.value);
  if (RELEASE) {
    for (const f of DEV_ONLY) assert.ok(ignored.includes(f), 'strip ' + f + ' from the release package');
  } else {
    assert.ok(true, 'dev build: the mock and the stub ship so that DevTools boots with no backend');
  }
});

test('the dev-only files are required lazily, in exactly one place each, and every other shipped file leaves them alone', () => {
  const files = shipped(GAME).filter((f) => f.endsWith('.js'));
  const users = (name) => files.filter((f) => new RegExp("require\\(['\"]\\.{1,2}/(?:js/)?" + name + "['\"]\\)").test(strip(fs.readFileSync(f, 'utf8')))).map(rel).sort();
  assert.deepEqual(users('mock-server'), ['js/api.js']);
  assert.deepEqual(users('stub-render'), ['js/renderers.js']);
  const api = strip(read('js/api.js'));
  assert.match(api, /if \(mode === 'mock'\) mock = opts\.mockServer \|\| require\('\.\/mock-server'\)/, 'mock branch only');
  assert.ok(!/^const .*require\('\.\/mock-server'\)/m.test(api), 'no top-level require of the mock');
  const rend = strip(read('js/renderers.js'));
  assert.match(rend, /function getStub\(\) \{[\s\S]*?try \{\s*stubModule = require\('\.\/stub-render'\);/, 'the stub is required inside a function, in a try');
  assert.ok(!/^const .*require\('\.\/stub-render'\)/m.test(rend), 'no top-level require of the stub');
});

test('every cloud function name goes through ONE table in js/api.js (fnPrefix + name) and nothing else calls wx.cloud.callFunction', () => {
  const users = shipped(GAME).filter((f) => f.endsWith('.js') && /callFunction/.test(strip(fs.readFileSync(f, 'utf8')))).map(rel);
  assert.deepEqual(users, ['js/api.js']);
  const api = strip(read('js/api.js'));
  assert.match(api, /NAMES\.forEach\(\(n\) => \{ FN\[n\] = fnPrefix \+ n; \}\);/);
  assert.match(api, /name: FN\[name\]/);
});

test('the test seam wx.__dianjiangtaiTest is read only by main.js, and nothing under js/ or opendata/ names tests', () => {
  const users = shipped(GAME).filter((f) => f.endsWith('.js') && /__dianjiangtaiTest/.test(strip(fs.readFileSync(f, 'utf8')))).map(rel);
  assert.deepEqual(users, ['js/main.js']);
});

async function playDailyStart(g) {
  await g.settle();
  if (g.has('sheet:close')) g.tapId('sheet:close');
  g.tapId('home:daily');
  g.tapId('primary'); // the first 翻令 anchors the run (startRun)
  await g.settle();
  g.wait(1500);
  await g.settle();
}

test('a cloud build never loads the mock server or the stub renderer, and calls the dianjiangtai_ functions', async (t) => {
  const g = boot(t, { build: { cloudEnv: 'env-1', fnPrefix: 'dianjiangtai_', stubAds: false }, cloud: { prefix: 'dianjiangtai_' } });
  assert.equal(g.app.api.mode, 'cloud');
  assert.equal(g.app.api.mock, null);
  await playDailyStart(g);
  const loaded = g.loader.loaded().map(rel);
  for (const f of DEV_ONLY) assert.ok(!loaded.includes(f), f + ' must not be loaded in a cloud build');
  assert.ok(loaded.includes('js/render/index.js'), 'the real renderer is what draws');
  assert.ok(g.log.cloudCalls.length > 0 && g.log.cloudCalls.every((c) => /^dianjiangtai_/.test(c.name)), JSON.stringify(g.log.cloudCalls));
  assert.ok(g.log.cloudCalls.some((c) => c.name === 'dianjiangtai_getDaily'), 'getDaily was called');
  assert.ok(g.log.cloudCalls.some((c) => c.name === 'dianjiangtai_startRun'), 'startRun was called');
});

test('a release package with the dev-only files stripped boots and starts the daily end to end', async (t) => {
  // the module loader is told those files do not exist (as after packOptions.ignore): any require of them throws "not defined"
  const g = boot(t, { hide: DEV_ONLY, build: { cloudEnv: 'env-1', fnPrefix: 'dianjiangtai_', stubAds: false }, cloud: { prefix: 'dianjiangtai_' } });
  assert.equal(g.app.api.mode, 'cloud');
  assert.equal(g.app.renderer.kind, 'real');
  await playDailyStart(g);
  assert.ok(g.log.cloudCalls.some((c) => c.name === 'dianjiangtai_startRun'));
  assert.ok(g.ids().some((id) => id.indexOf('pool:') === 0 || id === 'primary'), 'the draft screen is up');
  assert.deepEqual(require('../js/renderers').fallbackErrors, [], 'the real renderer never fell back to the (absent) stub');
});

test('a cloud build with the unprefixed names fails loudly (FUNCTION_NOT_FOUND), so the prefix is really what is sent', async (t) => {
  const g = boot(t, { build: { cloudEnv: 'env-1', fnPrefix: '', stubAds: false }, cloud: { prefix: 'dianjiangtai_' } });
  await g.settle();
  assert.ok(g.log.cloudCalls.length > 0);
  assert.ok(g.log.cloudCalls.every((c) => !/^dianjiangtai_/.test(c.name)));
});

test('the dev build boots on the in-memory mock with no wx.cloud call and the real renderer, never the stub', async (t) => {
  const g = boot(t);
  await g.settle();
  assert.equal(g.app.api.mode, 'mock');
  const loaded = g.loader.loaded().map(rel);
  assert.ok(loaded.includes('js/mock-server.js'));
  assert.ok(!loaded.includes('js/stub-render.js'), 'the stub only loads if the real renderer fails');
  assert.equal(g.app.renderer.kind, 'real');
  assert.deepEqual(g.log.cloudCalls, [], 'no wx.cloud call');
});

test('the shipped client has no wx.request, no AppSecret / session_key, no login-profile API (hygiene for the client)', () => {
  const files = shipped(GAME).filter((f) => f.endsWith('.js') && !/[\\/]core[\\/]content[\\/]/.test(f));
  for (const f of files) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    assert.ok(!/wx\.request\b(?!Sub)|AppSecret|session_key|code2Session|getUserProfile|getUserInfo/.test(src), rel(f));
  }
});

test('V1-3: main.js never enables the stub in a cloud build, and a release without ad unit ids is no-fill, not test ads', () => {
  assert.match(read('js/main.js'), /stub: \{ enabled: !!build\.stubAds && !build\.cloudEnv \}/);
  assert.ok(!/!units\.rewarded;/.test(read('js/ads.js').replace(/\/\/.*$/gm, '')), 'ads.js no longer forces the stub when the unit id is empty');
});

test('release-config forces stubAds=false for a release and back to true for --dev', () => {
  const src = read('tools/release-config.js');
  assert.match(src, /mode\.dev\) \{[\s\S]*?setLine\(bc, 'stubAds', 'true'\)[\s\S]*?\} else \{[\s\S]*?setLine\(bc, 'stubAds', 'false'\)/);
});
