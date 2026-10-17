'use strict';
// QA (independent): release safety, ads placement, privacy / share compliance. Written from spec 6.6, 9, 11, 15, 19 and the
// studio standard (apps/kedupan/game/project.config.json), not from the developers' tests. Tests marked `todo` document OPEN
// BUGS in docs/chuanhua/qa/bugs.md: they run and report, but do not fail the suite until the owner fixes them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world } = require('./harness');
const { G } = require('./flows');

const GAME = path.join(__dirname, '..');
const REPO = path.join(GAME, '..', '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const pc = () => JSON.parse(read(path.join(GAME, 'project.config.json')));

/** every file the WeChat upload would contain: the project folder minus packOptions.ignore */
function packaged() {
  const ignored = pc().packOptions.ignore.map((x) => x.value);
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(GAME, p).split(path.sep).join('/');
      if (rel === 'project.private.config.json') continue; // DevTools-local, gitignored, never uploaded
      if (ignored.some((i) => rel === i || rel.startsWith(i.replace(/\/$/, '') + '/'))) continue;
      if (e.isDirectory()) walk(p);
      else out.push(rel);
    }
  })(GAME);
  return out;
}

// ------------------------------------------------------------------------------------------------ release safety

test('QA release: the committed build is a DEV build (cloudEnv empty, mock on) and the config says so in one place', require('./mode').devOnly, () => {
  const b = require('../js/build-config');
  assert.equal(b.cloudEnv, '');
  assert.equal(b.envKind, 'dev');
});

test('QA release: a release build (cloudEnv set, envKind prod, stubAds false) talks to the cloud only: no mock server is constructed', async () => {
  const { createApi } = require('../js/api');
  let calls = 0;
  const wx = { cloud: { init() {}, callFunction: (o) => { calls++; o.success({ result: { ok: true, via: o.name } }); } } };
  const api = createApi({ wx, cloudEnv: 'env-prod', envKind: 'prod', fnPrefix: '' });
  assert.equal(api.mode, 'cloud');
  assert.equal(api.mock, null);
  const r = await api.getHome({});
  assert.equal(r.via, 'getHome');
  assert.equal(calls, 1);
  assert.equal(typeof api.tickMock, 'function');
  api.tickMock(); // must be a no-op without a mock
});

test('QA release: envKind prod without a cloud env never falls back to the mock: every call fails closed with SERVER_CONFIG', async () => {
  const { createApi } = require('../js/api');
  const api = createApi({ wx: {}, cloudEnv: '', envKind: 'prod' });
  assert.equal(api.mock, null);
  for (const fn of ['getHome', 'createChain', 'claimStep', 'submitStep', 'getReveal', 'report']) assert.equal((await api[fn]({})).code, 'SERVER_CONFIG', fn);
});

test('QA release: a release config (cloudEnv set) boots the real app with real ads, no stub overlay, no mock ticking', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G, noWait: true, stubAds: false, build: { cloudEnv: 'env-prod', envKind: 'prod', stubAds: false, adUnits: { rewarded: '', interstitial: '', banner: '' } } });
  assert.equal(a.app.api.mode, 'cloud');
  assert.equal(a.app.api.mock, null);
  assert.equal(a.app.ads.stub, false);
});

test('QA-2 release: a build that only sets cloudEnv (the one value the README tells the founder to change) still ships TEST ads ("广告位（测试）") that grant rewards', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G, noWait: true, stubAds: undefined, build: { cloudEnv: 'env-prod' } });
  assert.equal(a.app.api.mode, 'cloud');
  assert.equal(a.app.ads.stub, false, 'cloudEnv set must force stubAds off');
  assert.equal(a.app.api.mock, null);
  const b = await w.player('B', { rules: true, ...G, noWait: true, stubAds: true, build: { cloudEnv: 'env-prod', envKind: 'dev', stubAds: true } });
  assert.equal(b.app.ads.stub, false, 'even an explicit stubAds:true / envKind:dev is overridden when cloudEnv is set');
});

test('QA-2 release: js/mock-server.js and js/stub-render.js are not in the uploaded package (packOptions.ignore) or at least never loaded by a release build', () => {
  const files = packaged();
  const api = read(path.join(GAME, 'js', 'api.js'));
  const lazyMock = !/^const .*require\('\.\/mock-server'\)/m.test(api);
  const shippedMock = files.includes('js/mock-server.js');
  assert.ok(!shippedMock || lazyMock, 'mock-server.js ships AND is loaded eagerly at boot');
  assert.ok(!files.includes('js/stub-render.js') || !/^const .*require\('\.\/stub-render'\)/m.test(read(path.join(GAME, 'js', 'renderers.js'))), 'stub-render.js ships AND is loaded eagerly');
});

test('QA-1 release: cloudfunctionRoot is an in-project, gitignored, packOptions-ignored cloudfunctions-deploy/ folder (studio standard, apps/kedupan/game/project.config.json)', () => {
  const c = pc();
  assert.equal(c.cloudfunctionRoot, 'cloudfunctions-deploy/');
  assert.ok(c.packOptions.ignore.some((i) => i.value === 'cloudfunctions-deploy' && i.type === 'folder'));
  assert.match(read(path.join(REPO, '.gitignore')), /apps\/chuanhua\/game\/cloudfunctions-deploy\//);
  const cf = JSON.parse(read(path.join(GAME, '..', 'cloudfunctions', 'package.json')));
  assert.ok(cf.scripts && cf.scripts.pack, 'npm run pack');
});

test('QA release: game/RELEASE.md is in packOptions.ignore (not shipped)', () => {
  assert.ok(!packaged().includes('RELEASE.md'));
});

test('QA release: the package ships no test, tool, markdown, secret or node_modules file; only .js, the two json configs, one png and the tick mp3', () => {
  const files = packaged();
  for (const f of files) {
    assert.ok(!/^(tests|tools|node_modules)\//.test(f), f);
    assert.ok(/\.(js|png|mp3)$/.test(f) || ['game.json', 'project.config.json'].includes(f), 'unexpected file in package: ' + f);
  }
  assert.ok(!files.some((f) => /\.(key|pem|env)$/.test(f)));
});

test('QA release: no secret-looking literal (AppSecret, token, key, JWT) anywhere in the game folder or the cloud functions', () => {
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'out' || e.name === 'tests') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|json)$/.test(e.name) && !/package-lock/.test(e.name)) {
        const s = read(p);
        if (/(app_?secret|appsecret)\s*[:=]\s*['"][0-9a-f]{16,}/i.test(s) || /eyJ[A-Za-z0-9_-]{20,}\./.test(s) || /-----BEGIN [A-Z ]*PRIVATE KEY/.test(s)) bad.push(p);
      }
    }
  };
  walk(GAME);
  walk(path.join(GAME, '..', 'cloudfunctions'));
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------------------------------------ ads placement (AC 106, 163)

const AD_IDS = /^(startLimit:ad|settings:palette|adstub:.*)$|palette|:ad$|reward/i;

test('QA-3 ads (AC 106, 163): no ad or 今日彩笔 offer on the room entry, lobby, pick, draw, describe or round-wait screens, and the draw screen has no unlock pill at all', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  await a.tap('home:primary');
  const roomId = a.ctl.state.room.roomId;
  const seen = {};
  const check = (p) => {
    const s = p.screen();
    seen[s] = true;
    const ids = p.ids();
    assert.deepEqual(ids.filter((id) => AD_IDS.test(id)), [], s + ' offers an ad: ' + ids.join(','));
    assert.ok(!/广告位|看视频|今日彩笔/.test(p.frame()), s + ' draws ad copy');
  };
  check(a); // lobby
  for (const p of [b, c]) {
    w.advance(4000);
    await p.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk' + w.t });
    check(p); // room entry
    await p.tap('roomEntry:join');
  }
  await a.tap('lobby:start');
  await w.run(2500, 250);
  for (const p of [a, b, c]) check(p); // pick
  for (const p of [a, b, c]) await p.tap('pick:start');
  await w.run(2500, 250);
  check(a); // round wait / draw
  for (const p of [a, b, c]) {
    check(p); // draw
    p.scribble(2);
    await p.tap('draw:submit');
    check(p); // round wait
  }
  await w.run(2500, 250);
  for (const p of [a, b, c]) check(p); // describe
  for (const k of ['roomEntry', 'lobby', 'pick', 'roundWait', 'draw', 'describe']) assert.ok(seen[k], 'the check reached ' + k);
});

test('QA ads: 今日彩笔 is unlocked in 设置 only: the settings sheet offers it, nothing else does', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:settings');
  assert.ok(a.ids().includes('settings:palette'));
  assert.match(a.frame(), /看视频解锁今日彩笔/);
});

// ------------------------------------------------------------------------------------------------ share and privacy (AC 79, 92-95)

test('QA share (AC 92, 93): no share-for-reward wording anywhere in shipped copy or renderers', () => {
  const bad = [];
  const re = /(分享(后|才能|即可|可得|可以获得|解锁|领取|得)|邀请(好友)?(得|领|奖励|解锁)|转发(领|得|解锁)|助力|拉人|砍一刀)/;
  for (const rel of packaged().filter((f) => f.endsWith('.js'))) {
    const s = read(path.join(GAME, rel)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const m = s.match(re);
    if (m) bad.push(rel + ': ' + m[0]);
  }
  assert.deepEqual(bad, []);
});

test('QA share (PO-24): the share-card renderer never receives or draws strokes; the static fallback image has no text and is a real PNG', () => {
  const sc = read(path.join(GAME, 'js', 'render', 'shareCard.js'));
  assert.doesNotMatch(sc, /drawStrokes|strokes|\.s\b/);
  const png = fs.readFileSync(path.join(GAME, 'assets', 'share-fallback.png'));
  assert.equal(png.slice(1, 4).toString(), 'PNG');
  assert.ok(png.length < 300 * 1024);
});

test('QA-9 assets: the tick sound and the share fallback art ship (generated by tools/assets/build-assets.js)', () => {
  const mp3 = fs.readFileSync(path.join(GAME, 'assets', 'tick.mp3'));
  assert.ok(mp3.length > 200 && mp3.length < 20 * 1024, 'tick.mp3 is tiny: ' + mp3.length);
  assert.ok((mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0) || mp3.slice(0, 3).toString() === 'ID3', 'tick.mp3 is an MP3 stream');
  const png = fs.readFileSync(path.join(GAME, 'assets', 'share-fallback.png'));
  assert.equal(png.readUInt32BE(16), 500);
  assert.equal(png.readUInt32BE(20), 400);
  assert.ok(png.length < 100 * 1024, 'share art stays small: ' + png.length);
  const room = fs.readFileSync(path.join(GAME, 'assets', 'share-fallback-room.png'));
  assert.equal(room.slice(1, 4).toString(), 'PNG');
  assert.equal(room.readUInt32BE(16), 500, 'the room card fallback is 5:4 as well');
  assert.equal(room.readUInt32BE(20), 400);
  assert.ok(fs.existsSync(path.join(GAME, 'tools', 'assets', 'build-assets.js')));
});

test('QA-9 audio wiring: SOUND_SRC.tick points at assets/tick.mp3', () => {
  assert.match(read(path.join(GAME, 'js', 'audio.js')), /tick:\s*['"]assets\/tick\.mp3['"]/);
});

test('QA-7 privacy (spec 8.2, 8.13, 15, H6): the 《用户协议》 link opens a real agreement, not a stand-in dialog', () => {
  const ctl = read(path.join(GAME, 'js', 'controller.js'));
  assert.doesNotMatch(ctl, /完整协议见《用户隐私保护指引》/, 'the 用户协议 dialog is a 3-line stand-in that points at the privacy guide');
  assert.match(ctl, /go\('terms'\)/, 'the link opens the terms screen (see tests/terms.test.js for the flows)');
});
