'use strict';
// Guards the "black screen in DevTools" class of bug (code that works in Node but not in a WeChat mini game), the
// package-size budget and the copy-never-import rule (AC 74, 75). WeChat require() only loads .js modules by
// relative/absolute path; no .json, no Node built-ins, no packages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLoader } = require('./wechat-loader');

const GAME = path.join(__dirname, '..');
const APP = path.join(GAME, '..'); // apps/kedupan
const NODE_ONLY = ['assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'http', 'http2', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'readline', 'stream', 'test', 'timers', 'tls', 'url', 'util', 'vm', 'worker_threads', 'zlib'];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const config = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
const IGNORED = config.packOptions.ignore.map((x) => x.value);

/** every file that ships in the mini game package (the project folder minus packOptions.ignore) */
function packageFiles() {
  return walk(GAME, []).filter((f) => {
    const rel = path.relative(GAME, f).split(path.sep).join('/');
    if (rel === 'project.private.config.json') return false; // DevTools-local, gitignored, never uploaded
    return !IGNORED.some((ig) => rel === ig || rel.startsWith(ig + '/'));
  });
}
const rel = (f) => path.relative(GAME, f).split(path.sep).join('/');

/** every .js file that ships and runs: game.js, core/, js/, opendata/ */
const FILES = packageFiles().filter((f) => f.endsWith('.js'));

/** every require("...") / import / dynamic require in the file, with line numbers (comments blanked out) */
function requiresOf(file) {
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');
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

test('scan covers the shipped entry, core, js, flows, render and opendata files; tests and tools never ship', () => {
  const names = FILES.map(rel);
  for (const must of ['game.js', 'core/content.js', 'core/content/spectra.v1.js', 'js/main.js', 'js/controller.js', 'js/flows/daily.js', 'js/render/index.js', 'opendata/index.js']) assert.ok(names.includes(must), must);
  assert.ok(!names.some((r) => /^(tests|tools)\//.test(r)));
  // server-only files are packed in dev (the mock needs them) and ignored in release (release-gate-pack.test.js)
  if (require('./mode').RELEASE) for (const server of ['core/content/anchors.v1.js', 'core/content/schedule.v1.js']) assert.ok(!names.includes(server), server + ' is server-only and must not be packed');
});

test('AC 75: no shipped file requires a non-.js path (WeChat: "module ... is not defined"), and every require is a literal', () => {
  const bad = [];
  for (const f of FILES) {
    for (const r of requiresOf(f)) {
      const where = `${rel(f)}:${r.line} require(${r.arg})`;
      if (r.request === null) bad.push(where + ' is not a string literal');
      // "spectra.v1" is a module name (WeChat appends .js); anything with another extension (.json, .png) is not requireable
      else if (/\.[A-Za-z0-9]+$/.test(path.basename(r.request)) && !/\.v\d+$/.test(r.request) && !r.request.endsWith('.js')) bad.push(where + ' is not a .js file');
    }
  }
  assert.deepEqual(bad, []);
});

test('no Node-only modules or packages in shipped code', () => {
  const bad = [];
  for (const f of FILES) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      const name = r.request.replace(/^node:/, '').split('/')[0];
      if (r.request.startsWith('node:') || NODE_ONLY.includes(name) || !/^(\.{1,2})?\//.test(r.request)) bad.push(`${rel(f)}:${r.line} require('${r.request}')`);
    }
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const g of ['__dirname', '__filename', 'process.env', 'process.argv', 'Buffer.from', 'readFileSync', 'writeFileSync']) {
      const at = code.indexOf(g);
      if (at >= 0 && !/[\w.]/.test(code[at - 1] || ' ')) bad.push(`${rel(f)} uses ${g}`);
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
      try {
        loader.resolve(f, r.request);
      } catch (e) {
        bad.push(`${rel(f)}:${r.line} ${e.message}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('AC 75: nothing under apps/kedupan requires a path outside apps/kedupan (copy, never import)', () => {
  const bad = [];
  const all = [...walk(path.join(APP, 'game'), []), ...walk(path.join(APP, 'cloudfunctions'), [])].filter((f) => f.endsWith('.js') && !/node_modules|\.deploy|cloudfunctions-deploy|tools[\\/]preview/.test(f));
  for (const f of all) {
    for (const r of requiresOf(f)) {
      if (r.request === null || !r.request.startsWith('.')) continue;
      const target = path.resolve(path.dirname(f), r.request);
      if (path.relative(APP, target).startsWith('..')) bad.push(`${path.relative(APP, f)}:${r.line} -> ${r.request}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the wechat loader rejects .json, built-ins and missing modules (self-check of the guard)', () => {
  const loader = createLoader(GAME);
  const from = path.join(GAME, 'core', 'content.js');
  assert.throws(() => loader.resolve(from, './content/spectra.v1.json'), /is not defined/);
  assert.throws(() => loader.resolve(from, 'fs'), /cannot require/);
  assert.throws(() => loader.resolve(from, 'node:path'), /cannot require/);
  assert.throws(() => loader.resolve(from, './content/nope'), /is not defined/);
  assert.ok(loader.resolve(from, './content/spectra.v1'));
});

test('the whole game graph loads under WeChat rules (every core, js, flows and render module, opendata helpers)', () => {
  global.wx = global.wx || {};
  const loader = createLoader(GAME);
  const loaded = [];
  for (const f of FILES) {
    const r = rel(f);
    if (r === 'js/main.js' || r === 'opendata/index.js' || r === 'game.js') continue; // entries with side effects need wx; covered by the harness
    loader.load(f);
    loaded.push(r);
  }
  assert.ok(loaded.length > 40, 'loaded ' + loaded.length);
  const { getContent } = loader.require(path.join(GAME, 'game.js'), './core/content');
  assert.ok(getContent().spectra.length >= 300);
  delete global.wx;
});

test('AC 74: the main package (including opendata/) is within 4 MB and the total within 30 MB; the only images are the icon and the static share fallback', () => {
  const files = packageFiles();
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  assert.ok(bytes <= 4 * 1024 * 1024, 'main package ' + bytes + ' bytes');
  assert.ok(bytes <= 30 * 1024 * 1024);
  const images = files.filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f)).map(rel);
  for (const img of images) assert.ok(/^assets\/(share-fallback|icon)\.(png|jpg)$/.test(img), 'unexpected image ' + img);
  // content stays code: no json in the package either (WeChat cannot require it)
  assert.ok(!files.some((f) => /\.json$/.test(f) && !/^(game|project\.config)\.json$/.test(rel(f))), 'only game.json / project.config.json');
  // the server-only schedule is not in the package (TD-62); on disk it stays small
  assert.ok(fs.statSync(path.join(GAME, 'core', 'content', 'schedule.v1.js')).size < 64 * 1024);
});

test('project.config.json keeps the shared test AppID, a game project, and ignores tests / tools / deploy folders; cloudEnv stays empty in dev', () => {
  require('./mode').checkAppId(config.appid);
  assert.equal(config.compileType, 'game');
  for (const v of ['tests', 'tools', 'cloudfunctions-deploy']) assert.ok(IGNORED.includes(v), v);
  assert.equal(config.cloudfunctionRoot, 'cloudfunctions-deploy/');
  const bc = require('../js/build-config');
  if (!require('./mode').RELEASE) assert.equal(bc.cloudEnv, ''); // dev configuration: mock server
  assert.equal(bc.stubAds, false, 'production builds have stub ads off (AC 61)');
  const game = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
  assert.equal(game.deviceOrientation, 'portrait');
  assert.equal(game.openDataContext, 'opendata');
});

test('AC 29: no shipped file opens a keyboard or declares a text input', () => {
  const bad = [];
  for (const f of FILES) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/<input|<textarea|createInputElement|prompt\s*\(/.test(code)) bad.push(rel(f));
    // D-2 (AC 29): wx.showKeyboard is called from js/keyboard.js only, with a caller-given maxLength (the create flow passes 12)
    if (/showKeyboard/.test(code) && rel(f) !== 'js/keyboard.js') bad.push(rel(f));
  }
  assert.deepEqual(bad, []);
});

test('AC 75 / spec 4.3: wx.reportEvent and the deprecated wx.getShareInfo are never called', () => {
  const bad = [];
  for (const f of FILES) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/wx\.reportEvent|reportEvent\(|wx\.getShareInfo|\.getShareInfo\(/.test(code)) bad.push(rel(f));
  }
  assert.deepEqual(bad, []);
});

// ---- the open data context is isolated, in both directions ----

/**
 * Isolation problems for {file (posix, relative to the game folder), requests[]} entries: a main-domain file must not
 * require anything under the openDataContext folder, and a file inside it must not require anything outside it.
 */
function isolationProblems(entries, odc) {
  const bad = [];
  for (const e of entries) {
    const inOdc = e.file === odc || e.file.startsWith(odc + '/');
    for (const req of e.requests) {
      if (!req.startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(e.file), req));
      const targetInOdc = target === odc || target.startsWith(odc + '/');
      if (!inOdc && targetInOdc) bad.push(`${e.file} requires ${req}: the main domain cannot require files of ${odc}/`);
      if (inOdc && !targetInOdc) bad.push(`${e.file} requires ${req}: ${odc}/ cannot require files outside itself`);
    }
  }
  return bad;
}

test('open data isolation: no main-domain file requires opendata/, no opendata file requires outside it (the rule fails on the old mock-server)', () => {
  const odc = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8')).openDataContext;
  assert.equal(odc, 'opendata');
  // the rule trips on the code as it was: js/mock-server.js required '../opendata/sha256'
  assert.equal(isolationProblems([{ file: 'js/mock-server.js', requests: ['../opendata/sha256'] }], odc).length, 1);
  assert.equal(isolationProblems([{ file: 'opendata/match.js', requests: ['../core/score'] }], odc).length, 1);
  assert.deepEqual(isolationProblems([{ file: 'js/mock-server.js', requests: ['./sha256'] }, { file: 'opendata/match.js', requests: ['./sha256'] }], odc), []);
  const entries = FILES.map((f) => ({ file: rel(f), requests: requiresOf(f).map((r) => r.request).filter((r) => r !== null) }));
  assert.ok(entries.some((e) => e.file.startsWith('opendata/')) && entries.some((e) => e.file.startsWith('js/')));
  assert.deepEqual(isolationProblems(entries, odc), []);
});
