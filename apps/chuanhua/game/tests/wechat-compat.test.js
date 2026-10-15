'use strict';
// Guards the "black screen in DevTools" class of bug: code that works in Node but not in a WeChat mini game.
// WeChat require() only loads .js modules by relative/absolute path; no .json, no Node built-ins, no packages.
// Also scans for APIs this game must never call (privacy, uploads, share-for-reward).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLoader } = require('./wechat-loader');
const { FORBIDDEN_APIS } = require('../js/privacy');

const GAME = path.join(__dirname, '..');
const NODE_ONLY = ['assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'http', 'http2', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'readline', 'stream', 'test', 'timers', 'tls', 'url', 'util', 'vm', 'worker_threads', 'zlib'];

/** every file that ships: game.js, core/, js/ (tests/ and tools/ never ship; there is no opendata/ folder, PO-9) */
function shippedFiles() {
  const out = [path.join(GAME, 'game.js')];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  })(GAME);
  return out.filter((f) => {
    const rel = path.relative(GAME, f).split(path.sep);
    return ['game.js', 'core', 'js'].includes(rel[0]);
  });
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');
}

/** every require("...") / import / dynamic require in the file, with line numbers (comments blanked out) */
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
const JS = FILES.filter((f) => f.endsWith('.js'));
const posix = (f) => path.relative(GAME, f).split(path.sep).join('/');

test('scan covers the shipped entry, core and js files; no opendata folder, no tests or tools', () => {
  const rel = FILES.map(posix);
  for (const must of ['game.js', 'core/chain.js', 'core/strokes.js', 'core/raster.js', 'core/content/prompts.v1.js', 'js/main.js', 'js/controller.js', 'js/mock-server.js']) assert.ok(rel.includes(must), must);
  assert.ok(!rel.some((r) => /^(tests|tools|opendata)\//.test(r)));
  assert.equal(fs.existsSync(path.join(GAME, 'opendata')), false, 'PO-9: no open data domain folder');
  const cfg = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
  assert.equal(cfg.openDataContext, undefined);
});

test('no shipped file requires a non-.js path (WeChat: "module ... is not defined"), and every require is a literal', () => {
  const bad = [];
  for (const f of JS) {
    for (const r of requiresOf(f)) {
      const where = `${path.relative(GAME, f)}:${r.line} require(${r.arg})`;
      if (r.request === null) bad.push(where + ' is not a string literal');
      else if (/\.[A-Za-z0-9]+$/.test(path.basename(r.request)) && !r.request.endsWith('.js')) bad.push(where + ' is not a .js file');
    }
  }
  assert.deepEqual(bad, []);
});

test('no Node-only modules or packages in shipped code, and nothing reaches outside apps/chuanhua/game (AC 110)', () => {
  const bad = [];
  for (const f of JS) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      const name = r.request.replace(/^node:/, '').split('/')[0];
      if (r.request.startsWith('node:') || NODE_ONLY.includes(name) || !/^(\.{1,2})?\//.test(r.request)) bad.push(`${path.relative(GAME, f)}:${r.line} require('${r.request}')`);
      else if (path.relative(GAME, path.resolve(path.dirname(f), r.request)).startsWith('..')) bad.push(`${path.relative(GAME, f)}:${r.line} escapes the game folder: ${r.request}`);
    }
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    for (const g of ['__dirname', '__filename', 'process.env', 'process.argv', 'Buffer.from', 'readFileSync', 'writeFileSync']) {
      const at = code.indexOf(g);
      if (at >= 0 && !/[\w.]/.test(code[at - 1] || ' ')) bad.push(`${path.relative(GAME, f)} uses ${g}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every require path resolves to an existing .js file when ".js" is appended the way WeChat does', () => {
  const loader = createLoader(GAME);
  const bad = [];
  for (const f of JS) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      if (/^\.\/render\/index$/.test(r.request) && posix(f) === 'js/renderers.js') continue; // optional, frontend-ui; guarded by try/catch
      try {
        loader.resolve(f, r.request);
      } catch (e) {
        bad.push(`${path.relative(GAME, f)}:${r.line} ${e.message}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('the wechat loader rejects .json, built-ins and missing modules (self-check of the guard)', () => {
  const loader = createLoader(GAME);
  const from = path.join(GAME, 'core', 'chain.js');
  assert.throws(() => loader.resolve(from, './content/prompts.v1.json'), /is not defined/);
  assert.throws(() => loader.resolve(from, 'fs'), /cannot require/);
  assert.throws(() => loader.resolve(from, 'node:path'), /cannot require/);
  assert.throws(() => loader.resolve(from, './content/nope'), /is not defined/);
  assert.ok(loader.resolve(from, './content/prompts.v1'));
});

test('the whole game graph loads under WeChat rules (every core and js module)', () => {
  global.wx = global.wx || {};
  const loader = createLoader(GAME);
  let loaded = 0;
  for (const f of JS) {
    const rel = posix(f);
    if (rel === 'js/main.js' || !/^(core|js)\//.test(rel)) continue; // main has side effects and needs wx; covered by smoke.test.js
    if (/^js\/render\//.test(rel)) continue; // frontend-ui loads through the renderers module
    loader.load(f);
    loaded++;
  }
  assert.ok(loaded >= 20, 'loaded ' + loaded);
  const { PROMPTS } = loader.require(path.join(GAME, 'game.js'), './core/prompts');
  assert.equal(PROMPTS.length, 423);
  const { rasterize } = loader.require(path.join(GAME, 'game.js'), './core/raster');
  assert.equal(typeof rasterize, 'function');
});

test('AC 79: no privacy-sensitive, file-upload or fallback-share API in shipped code (privacy.js only lists them)', () => {
  const bad = [];
  for (const f of JS) {
    if (posix(f) === 'js/privacy.js') continue;
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    for (const api of FORBIDDEN_APIS) if (new RegExp('\\b' + api + '\\b').test(code)) bad.push(posix(f) + ' mentions ' + api);
  }
  assert.deepEqual(bad, []);
});

test('AC 28/92/93/104: uploads, share calls and interstitials only happen where the spec allows', () => {
  const where = (needle) => JS.filter((f) => posix(f) !== 'js/privacy.js').filter((f) => stripComments(fs.readFileSync(f, 'utf8')).indexOf(needle) >= 0).map(posix).sort();
  assert.deepEqual(where('uploadFile'), []);
  assert.deepEqual(where('saveImageToPhotosAlbum'), []);
  assert.deepEqual(where('shareAppMessage('), ['js/share.js']);
  assert.deepEqual(where('createInterstitialAd'), ['js/ads.js']);
  assert.deepEqual(where('createRewardedVideoAd'), ['js/ads.js']);
  // the controller calls share.* only from tap handlers (shareInvite/shareReveal), never from a timer or a lifecycle hook
  const ctl = fs.readFileSync(path.join(GAME, 'js', 'controller.js'), 'utf8');
  assert.equal((ctl.match(/share\.shareInvite\(/g) || []).length, 1);
  assert.equal((ctl.match(/share\.shareReveal\(/g) || []).length, 1);
  assert.equal((ctl.match(/ads\.interstitial\(/g) || []).length, 1);
  const leave = ctl.slice(ctl.indexOf('function leaveReveal'), ctl.indexOf('function revealHit'));
  assert.ok(leave.includes('ads.interstitial('), 'the interstitial lives in leaveReveal');
  // no reward call is conditioned on sharing: grantReward is only reached through ads.rewarded outcomes
  assert.ok(!/share[^;]*grantReward|grantReward[^;]*share/.test(ctl));
  const ads = fs.readFileSync(path.join(GAME, 'js', 'ads.js'), 'utf8');
  assert.ok(ads.includes('disableFallbackSharePage: true'));
  const share = fs.readFileSync(path.join(GAME, 'js', 'share.js'), 'utf8');
  assert.ok(!/isUpdatableMessage:\s*false/.test(stripComments(share)));
  assert.ok(!/getShareInfo\(/.test(stripComments(share)));
});

test('package: game.json has no openDataContext; project.config uses the tourist appid and ignores tests/tools', () => {
  const pc = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  assert.equal(pc.appid, 'touristappid'); // TODO(founder, H1): the real AppID
  assert.equal(pc.compileType, 'game');
  const ignored = pc.packOptions.ignore.map((x) => x.value);
  for (const v of ['tests', 'tools', 'node_modules', 'package.json', 'core/README.md']) assert.ok(ignored.includes(v), v);
});

test('content is shipped as .js modules only (no .json content file under core/ or js/)', () => {
  assert.deepEqual(FILES.filter((f) => /\.json$/.test(f)).map(posix), []);
});
