'use strict';
// Guards the "black screen in DevTools" class of bug: code that works in Node but not in a WeChat mini game.
// WeChat require() only loads .js modules by relative/absolute path; no .json, no Node built-ins, no packages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLoader } = require('./wechat-loader');

const GAME = path.join(__dirname, '..');
const APP = path.join(GAME, '..'); // apps/kedupan
const NODE_ONLY = ['assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'http', 'http2', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'readline', 'stream', 'test', 'timers', 'tls', 'url', 'util', 'vm', 'worker_threads', 'zlib'];

/** The one deliberately optional require: js/renderers.js loads frontend-ui's renderer inside try/catch and falls back to the stub. */
const OPTIONAL = new Set(['js/renderers.js::./render/index']);

/** every .js file that ships: game.js, core/, js/, opendata/ (tests/ and tools/ never ship) */
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
    return ['game.js', 'core', 'js', 'opendata'].includes(rel[0]);
  });
}

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

const FILES = shippedFiles();
const posix = (f) => path.relative(GAME, f).split(path.sep).join('/');

test('scan covers the shipped entry, core and js files', () => {
  const rel = FILES.map(posix);
  for (const must of ['game.js', 'core/content.js', 'core/content/spectra.v1.js', 'core/content/schedule.v1.js', 'core/content/src/food.js', 'js/main.js', 'js/controller.js']) assert.ok(rel.includes(must), must);
  assert.ok(!rel.some((r) => /^(tests|tools)\//.test(r)));
});

test('no shipped file requires a non-.js path (WeChat: "module ... is not defined"), and every require is a literal', () => {
  const bad = [];
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    for (const r of requiresOf(f)) {
      const where = `${posix(f)}:${r.line} require(${r.arg})`;
      if (r.request === null) bad.push(where + ' is not a string literal');
      else if (/\.[A-Za-z0-9]+$/.test(path.basename(r.request)) && !r.request.endsWith('.js')) bad.push(where + ' is not a .js file');
    }
  }
  assert.deepEqual(bad, []);
});

test('no Node-only modules or packages in shipped code', () => {
  const bad = [];
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      const name = r.request.replace(/^node:/, '').split('/')[0];
      if (r.request.startsWith('node:') || NODE_ONLY.includes(name) || !/^(\.{1,2})?\//.test(r.request)) bad.push(`${posix(f)}:${r.line} require('${r.request}')`);
    }
    const src = fs.readFileSync(f, 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      if (OPTIONAL.has(posix(f) + '::' + r.request)) continue;
      try {
        loader.resolve(f, r.request);
      } catch (e) {
        bad.push(`${posix(f)}:${r.line} ${e.message}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('AC75: nothing under apps/kedupan/ requires a path outside apps/kedupan/', () => {
  const bad = [];
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    for (const r of requiresOf(f)) {
      if (!r.request || !/^\./.test(r.request)) continue;
      const target = path.resolve(path.dirname(f), r.request);
      if (path.relative(APP, target).startsWith('..')) bad.push(`${posix(f)}:${r.line} ${r.request}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('AC29: no screen accepts typed text (no keyboard, no input) and nothing user-authored is displayed', () => {
  const bad = [];
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const w of ['showKeyboard', 'wx.createInput', 'onKeyboardInput', 'wx.createTextArea', 'wx.hideKeyboard']) if (code.includes(w)) bad.push(`${posix(f)} uses ${w}`);
    for (const w of ['wx.reportEvent', 'getShareInfo', 'code2Session', 'session_key', 'AppSecret']) if (code.includes(w)) bad.push(`${posix(f)} uses ${w}`);
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
  assert.ok(loader.resolve(from, './content/spectra.v1.js'));
});

test('the whole game graph loads under WeChat rules (every core and js module)', () => {
  global.wx = global.wx || {};
  const loader = createLoader(GAME);
  const loaded = [];
  for (const f of FILES.filter((x) => x.endsWith('.js') && (/^(core)\//.test(posix(x)) || /^js\/[^/]+\.js$/.test(posix(x)) || /^js\/flows\//.test(posix(x))))) {
    if (posix(f) === 'js/main.js') continue; // the entry has side effects and needs wx; covered by smoke.test.js
    loader.load(f);
    loaded.push(f);
  }
  assert.ok(loaded.length >= 20, 'loaded ' + loaded.length);
  const { getContent } = loader.require(path.join(GAME, 'game.js'), './core/content');
  assert.ok(getContent(1).spectra.length >= 300);
});

test('AC74: package budget (main package <= 4 MB, only the icon and the share fallback are images)', () => {
  let bytes = 0;
  const images = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!/^(tests|tools|node_modules)$/.test(e.name)) walk(p);
      } else {
        bytes += fs.statSync(p).size;
        if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e.name)) images.push(path.relative(GAME, p));
      }
    }
  })(GAME);
  assert.ok(bytes < 4 * 1024 * 1024, 'size ' + bytes);
  images.forEach((i) => assert.ok(/(icon|share-fallback)/.test(i), 'unexpected image ' + i));
});
