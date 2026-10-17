'use strict';
// Guards the "black screen in DevTools" class of bug: code that works in Node but not in a WeChat mini game.
// WeChat require() only loads .js modules by relative/absolute path; no .json, no Node built-ins, no packages.
// Also the code-search ACs: 28 (no uploadFile), 79 (no privacy interfaces), 92/93 (no automatic share), 110 (self-contained).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLoader } = require('./wechat-loader');

const GAME = path.join(__dirname, '..');
const APP = path.join(GAME, '..');
const NODE_ONLY = ['assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'http', 'http2', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'readline', 'stream', 'test', 'timers', 'tls', 'url', 'util', 'vm', 'worker_threads', 'zlib'];

/** every .js file that ships: game.js, core/, js/ (tests/ and tools/ never ship) */
function shippedFiles() {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  })(GAME);
  return out.filter((f) => {
    const rel = path.relative(GAME, f).split(path.sep);
    return (rel[0] === 'game.js' || rel[0] === 'core' || rel[0] === 'js') && !/^(tests|tools|node_modules)$/.test(rel[0]);
  });
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');

/** every require("...") in the file, with line numbers (comments blanked out) */
function requiresOf(file) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const found = [];
  const re = /\brequire\s*\(\s*([^)]*?)\s*\)|\bimport\s*(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    const arg = m[1] !== undefined ? m[1] : `'${m[2]}'`;
    const lit = /^(['"`])([^'"`$]*)\1$/.exec(arg);
    found.push({ line, arg, request: lit ? lit[2] : null });
  }
  return found;
}

const FILES = shippedFiles();
const posix = (f) => path.relative(GAME, f).split(path.sep).join('/');

test('scan covers the shipped entry, core, js files', () => {
  const rel = FILES.map(posix);
  for (const must of ['game.js', 'core/chain.js', 'core/content/prompts.v1.js', 'core/content/blocklist.v1.js', 'js/main.js', 'js/mock-server.js']) assert.ok(rel.includes(must), must);
  assert.ok(!rel.some((r) => /^(tests|tools)\//.test(r)));
});

test('open data domain isolation: game.json declares no openDataContext (PO-9); no shipped file requires into or out of an opendata folder; no such folder exists', () => {
  const gj = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
  assert.equal(gj.openDataContext, undefined, 'if one is ever added, enforce: no main-domain require into it, none out of it');
  for (const d of ['opendata', 'openDataContext']) assert.ok(!fs.existsSync(path.join(GAME, d)), d + ' folder exists');
  const bad = [];
  for (const f of FILES) {
    for (const r of requiresOf(f)) if (r.request && /(^|\/)(opendata|openDataContext)(\/|$)/i.test(r.request)) bad.push(`${posix(f)}:${r.line} require(${r.arg})`);
  }
  assert.deepEqual(bad, []);
});

test('AC 110: no shipped file requires a non-.js path, and every require is a literal', () => {
  const bad = [];
  for (const f of FILES) {
    for (const r of requiresOf(f)) {
      const where = `${posix(f)}:${r.line} require(${r.arg})`;
      if (r.request === null) bad.push(where + ' is not a string literal');
      else if (/\.(json|wxss|wxml|css|png|jpg|jpeg|gif|txt|md|mjs|cjs|ts|node)$/i.test(r.request)) bad.push(where + ' is not a .js file');
    }
  }
  assert.deepEqual(bad, []);
});

test('AC 110: no Node-only modules or packages in shipped code, nothing required from outside apps/chuanhua/game', () => {
  const bad = [];
  for (const f of FILES) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      const name = r.request.replace(/^node:/, '').split('/')[0];
      if (r.request.startsWith('node:') || NODE_ONLY.includes(name) || !/^(\.{1,2})?\//.test(r.request)) bad.push(`${posix(f)}:${r.line} require('${r.request}')`);
      else if (r.request.startsWith('.')) {
        const target = path.resolve(path.dirname(f), r.request);
        if (!target.startsWith(GAME + path.sep)) bad.push(`${posix(f)}:${r.line} leaves the game folder: ${r.request}`);
      }
    }
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    for (const g of ['__dirname', '__filename', 'process.env', 'process.argv', 'Buffer.from', 'readFileSync', 'writeFileSync']) {
      const at = code.indexOf(g);
      if (at >= 0 && !/[\w.]/.test(code[at - 1] || ' ')) bad.push(`${posix(f)} uses ${g}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every require path resolves to an existing .js file when ".js" is appended the way WeChat does', () => {
  const loader = createLoader(GAME);
  const bad = [];
  for (const f of FILES) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      // js/renderers.js loads the real renderer (js/render/index.js) inside try/catch and falls back to the stub until it exists
      if (posix(f) === 'js/renderers.js' && r.request === './render/index' && !fs.existsSync(path.join(GAME, 'js', 'render', 'index.js'))) continue;
      try {
        loader.resolve(f, r.request);
      } catch (e) {
        bad.push(`${posix(f)}:${r.line} ${e.message}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('the wechat loader rejects .json, built-ins and missing modules (self-check of the guard)', () => {
  const loader = createLoader(GAME);
  const from = path.join(GAME, 'core', 'prompts.js');
  assert.throws(() => loader.resolve(from, './content/prompts.v1.json'), /is not defined/);
  assert.throws(() => loader.resolve(from, 'fs'), /cannot require/);
  assert.throws(() => loader.resolve(from, 'node:path'), /cannot require/);
  assert.throws(() => loader.resolve(from, './content/nope'), /is not defined/);
  assert.ok(loader.resolve(from, './content/prompts.v1'));
});

test('the whole game graph loads under WeChat rules (every core and js module, mock server included)', () => {
  global.wx = global.wx || {};
  const loader = createLoader(GAME);
  let loaded = 0;
  for (const f of FILES) {
    if (posix(f) === 'js/main.js' || posix(f) === 'game.js') continue; // entries with side effects, covered by smoke.test.js
    loader.load(f);
    loaded++;
  }
  assert.ok(loaded >= 15, 'loaded ' + loaded);
  const { getPrompts } = loader.require(path.join(GAME, 'game.js'), './core/prompts');
  assert.equal(getPrompts(1).list.length, 423);
});

test('AC 28: no client code path uploads a file or image', () => {
  for (const f of FILES) {
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    assert.doesNotMatch(code, /uploadFile|toTempFilePath.*upload|wx\.cloud\.uploadFile/, posix(f));
  }
});

test('AC 79: no WeChat privacy interface is called (open data domain, album, location, clipboard, profile)', () => {
  const banned = ['setUserCloudStorage', 'getFriendCloudStorage', 'getGroupCloudStorage', 'getOpenDataContext', 'saveImageToPhotosAlbum', 'getLocation', 'chooseLocation',
    'setClipboardData', 'getClipboardData', 'getUserProfile', 'getUserInfo', 'chooseImage', 'chooseMedia', 'startRecord', 'createCameraContext'];
  for (const f of FILES) {
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    for (const b of banned) assert.ok(!code.includes(b), `${posix(f)} mentions ${b}`);
    // wx.getShareInfo (deprecated since 2.17.3) only as the old-client fallback inside js/share.js (TD-80)
    if (posix(f) !== 'js/share.js') assert.ok(!code.includes('getShareInfo'), `${posix(f)} mentions getShareInfo`);
  }
  assert.ok(!fs.existsSync(path.join(GAME, 'opendata')), 'no open data domain folder');
  const gj = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
  assert.equal(gj.openDataContext, undefined);
});

test('AC 92/93: wx.shareAppMessage is called in ONE place (js/share.js, from the explicit-tap functions), the capsule menu is the only other path, and there is no share-for-reward code', () => {
  for (const f of FILES) {
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    const rel = posix(f);
    if (rel !== 'js/share.js') assert.doesNotMatch(code, /shareAppMessage|onShareAppMessage/, rel);
    // the words of a share-for-reward mechanism never appear next to a share or a grant
    assert.doesNotMatch(code, /grantReward\([^)]*share|share[^\n]{0,40}grantReward|useFallbackSharePage\s*:\s*true|disableFallbackSharePage\s*:\s*false/i, rel);
  }
  const share = stripComments(fs.readFileSync(path.join(GAME, 'js', 'share.js'), 'utf8'));
  const calls = share.match(/\.shareAppMessage\(/g) || [];
  assert.equal(calls.length, 4, 'only shareInvite, shareReveal, shareRoomInvite and shareRoomReveal call it');
  // all four are async functions the controller calls from hit handlers only (tap), never from tick / view / start / onShow
  for (const f of ['controller.js', 'ctl-room.js', 'ctl-reveal.js', 'ctl-chain.js', 'ctl-turn.js', 'ctl-pick.js']) {
    const ctl = stripComments(fs.readFileSync(path.join(GAME, 'js', f), 'utf8'));
    for (const region of ['c.tick = function', 'c.view = function', 'c.start = function', 'c.onShow = function', 'room.tick = function', 'reveal.tick = function', 'chain.tick = function', 'turn.tick = function', 'pick.tick = function']) {
      const at = ctl.indexOf(region);
      if (at < 0) continue;
      const end = ctl.indexOf('\n  };', at);
      assert.doesNotMatch(ctl.slice(at, end), /shareInvite|shareReveal|shareRoomInvite|shareRoomReveal|shareAppMessage/, f + ' ' + region);
    }
  }
});

test('project files: shared test appid, game compile type, tests and contracts excluded from the package', () => {
  const pc = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  require('./mode').checkAppId(pc.appid); // dev: the shared test AppID (founder); release: any valid wx + 16 hex
  assert.equal(pc.compileType, 'game');
  const ignored = pc.packOptions.ignore.map((x) => x.value);
  for (const v of ['tests', 'node_modules', 'package.json', 'core/README.md', 'js/render/CONTRACT.md']) assert.ok(ignored.includes(v), v);
  const pkg = JSON.parse(fs.readFileSync(path.join(GAME, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /node --test/);
  assert.ok(fs.existsSync(path.join(APP, 'cloudfunctions', 'package.json')));
});

test('AC 111 (size guard): the shipped game code is far below the 4 MB main package budget', () => {
  // the RELEASE client: the dev-only files (mock server, stub renderer) and the server-only prompt bank are stripped from a release package (TD-103)
  const { DEV_ONLY_FILES, SERVER_ONLY_FILES } = require('../tools/release-config');
  // what the upload really holds: not the dev-only files, not the prompt bank, and not the files project.config.json always ignores (js/render/samples.js is a
  // fixture for the tests and the previews, never required by the game); the 700 KB limit itself is unchanged
  const baseIgnored = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8')).packOptions.ignore.map((x) => x.value);
  const stripped = new Set(DEV_ONLY_FILES.concat(SERVER_ONLY_FILES, baseIgnored));
  let bytes = 0;
  for (const f of FILES) if (!stripped.has(path.relative(GAME, f).split(path.sep).join('/'))) bytes += Buffer.byteLength(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')); // as committed (LF): a Windows CRLF checkout must not change the verdict (as in TD-138)
  assert.ok(bytes < 700 * 1024, 'shipped js is ' + bytes + ' bytes');
});

/** every file the upload would contain: the project folder minus packOptions.ignore (project.config.json) */
function packageFiles() {
  const pc = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  const ignored = pc.packOptions.ignore.map((x) => x.value);
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(GAME, p).split(path.sep).join('/');
      if (rel === 'project.private.config.json') continue; // DevTools-local, gitignored, never uploaded
      if (ignored.some((i) => rel === i || rel.startsWith(i + '/'))) continue;
      if (e.isDirectory()) walk(p);
      else out.push({ rel, bytes: fs.statSync(p).size });
    }
  })(GAME);
  return out;
}

test('AC 111: package size check: main package <= 4 MB, total <= 30 MB, art <= 300 KB, no subpackage folder is missing, no open data domain', () => {
  const files = packageFiles();
  const total = files.reduce((a, f) => a + f.bytes, 0);
  const png = files.filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.rel)).reduce((a, f) => a + f.bytes, 0);
  const audio = files.filter((f) => /\.(mp3|wav|aac|m4a|ogg)$/i.test(f.rel)).reduce((a, f) => a + f.bytes, 0);
  const js = files.filter((f) => f.rel.endsWith('.js')).reduce((a, f) => a + f.bytes, 0);
  console.log(`[package] files ${files.length}, total ${(total / 1024).toFixed(1)} KB, js ${(js / 1024).toFixed(1)} KB, images ${(png / 1024).toFixed(1)} KB, audio ${(audio / 1024).toFixed(1)} KB`);
  const gj = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
  const subpackages = (gj.subpackages || gj.subPackages || []).map((s) => s.root.replace(/\/$/, ''));
  const inSub = files.filter((f) => subpackages.some((s) => f.rel.startsWith(s + '/'))).reduce((a, f) => a + f.bytes, 0);
  const main = total - inSub;
  assert.ok(main <= 4 * 1024 * 1024, 'main package ' + main);
  assert.ok(total <= 30 * 1024 * 1024, 'total ' + total);
  assert.ok(png <= 300 * 1024, 'illustrations ' + png);
  assert.ok(!files.some((f) => /^(opendata|openDataContext)\//.test(f.rel)));
  assert.ok(!files.some((f) => /\.(json)$/.test(f.rel) && !['game.json', 'project.config.json', 'project.private.config.json'].includes(f.rel)), 'no stray .json that code could not require anyway');
  assert.ok(files.some((f) => f.rel === 'assets/share-fallback.png'), 'the static share-card fallback ships in the main package');
});

test('DevTools boot with no backend: game.js boots under WeChat loading rules on the in-memory mock; a first player can start a chain and see it pass moderation', async (t) => {
  const { bootGame, T0 } = require('./harness');
  const g = bootGame(t, { enter: { scene: 1001, query: {} } });
  const text0 = g.frame();
  assert.match(text0, /传\s*画\s*接\s*龙/, 'first paint');
  const tap = (id) => {
    const h = g.app.hits.slice().reverse().find((x) => x.id === id);
    if (!h) throw new Error('no hit ' + id + ' among ' + g.app.hits.map((x) => x.id).join(','));
    const touch = { identifier: 1, clientX: h.x + h.w / 2, clientY: h.y + h.h / 2 };
    g.touch.start({ touches: [touch], changedTouches: [touch] });
    g.touch.end({ touches: [], changedTouches: [touch] });
  };
  await g.settle();
  assert.match(g.frame(), /玩法/, 'first launch shows the 玩法 sheet once');
  assert.equal(g.app.api.mode, 'mock', 'cloudEnv is empty: the mock server answers');
  assert.equal(g.app.api.fnPrefix, '');
  tap('sheet:close');
  g.frame();
  assert.match(g.frame(), /开一局/, 'live rooms are the default: 开一局 is the primary button');
  assert.match(g.frame(), /慢慢传（不用同时在线）/);
  tap('home:slow');
  g.frame();
  tap('rules:agree');
  await g.settle();
  g.frame();
  assert.ok(g.app.hits.some((h) => h.id === 'pick:start'), 'the pick screen is up (3 rolled prompts)');
  tap('pick:start');
  await g.settle();
  g.frame();
  assert.ok(g.app.hits.some((h) => h.id === 'draw:canvas'), 'the drawing screen is up');
  const r = g.app.hits.find((h) => h.id === 'draw:canvas');
  const f = { identifier: 7, clientX: r.x + 40, clientY: r.y + 40 };
  g.touch.start({ touches: [f], changedTouches: [f] });
  g.touch.move({ touches: [{ ...f, clientX: r.x + 140, clientY: r.y + 90 }], changedTouches: [{ ...f, clientX: r.x + 140, clientY: r.y + 90 }] });
  g.touch.end({ touches: [], changedTouches: [{ ...f, clientX: r.x + 140, clientY: r.y + 90 }] });
  g.frame();
  tap('draw:submit');
  await g.settle();
  // drawings are checked synchronously (6.3): the verdict is already in
  assert.match(g.frame(), /已通过/);
  assert.ok(T0 > 0);
  assert.equal(g.log.shares.length, 0, 'nothing was shared on its own');
});

test('project config: appid is the shared test AppID and (dev state) cloudEnv stays empty so the mock is used', () => {
  const build = require('../js/build-config');
  if (!require('./mode').RELEASE) {
    assert.equal(build.cloudEnv, '');
    assert.equal(build.fnPrefix, '');
    assert.equal(build.envKind, 'dev');
  }
  const pc = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  require('./mode').checkAppId(pc.appid);
  assert.equal(pc.compileType, 'game');
  // game.js is the one-line entry; game.json has no subpackages or open data context to break the DevTools boot
  assert.equal(fs.readFileSync(path.join(GAME, 'game.js'), 'utf8').trim(), "require('./js/main');");
});
