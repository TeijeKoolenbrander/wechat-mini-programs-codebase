'use strict';
// Guards the "black screen in DevTools" class of bug: code that works in Node but not in a WeChat mini game.
// WeChat require() only loads .js modules by relative/absolute path; no .json, no Node built-ins, no packages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLoader } = require('./wechat-loader');

const GAME = path.join(__dirname, '..');
const NODE_ONLY = ['assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'http', 'http2', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'readline', 'stream', 'test', 'timers', 'tls', 'url', 'util', 'vm', 'worker_threads', 'zlib'];

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
    return ['game.js', 'core', 'js', 'opendata'].includes(rel[0]) && !/^(tests|tools|node_modules)$/.test(rel[0]);
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

// requires wrapped in try/catch on purpose: frontend-ui's renderer (js/render) and the dev-only mock (js/dev)
const OPTIONAL = ['./render/index'];
const FILES = shippedFiles();
const posix = (f) => path.relative(GAME, f).split(path.sep).join('/');

test('scan covers the shipped entry, core and js files', () => {
  const rel = FILES.map(posix);
  for (const must of ['game.js', 'core/vocab.js', 'core/t2s.js', 'js/main.js', 'js/controller.js', 'js/dev/mock-server.js']) assert.ok(rel.includes(must), must);
  assert.ok(!rel.some((r) => /^(tests|tools)\//.test(r)));
});

test('no shipped file requires a non-.js path (WeChat: "module ... is not defined"), and every require is a literal', () => {
  const bad = [];
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    for (const r of requiresOf(f)) {
      const where = `${path.relative(GAME, f)}:${r.line} require(${r.arg})`;
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
      if (r.request.startsWith('node:') || NODE_ONLY.includes(name) || !/^(\.{1,2})?\//.test(r.request)) bad.push(`${path.relative(GAME, f)}:${r.line} require('${r.request}')`);
    }
    const src = fs.readFileSync(f, 'utf8');
    for (const g of ['__dirname', '__filename', 'process.env', 'process.argv', 'Buffer.from', 'readFileSync', 'writeFileSync']) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const at = code.indexOf(g);
      if (at >= 0 && !/[\w.]/.test(code[at - 1] || ' ')) bad.push(`${path.relative(GAME, f)} uses ${g}`);
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
      try {
        loader.resolve(f, r.request);
      } catch (e) {
        if (!OPTIONAL.includes(r.request)) bad.push(`${path.relative(GAME, f)}:${r.line} ${e.message}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('no shipped file requires a path outside apps/yuyirelen (AC 111)', () => {
  const bad = [];
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    for (const r of requiresOf(f)) {
      if (r.request === null || !r.request.startsWith('.')) continue;
      const target = path.resolve(path.dirname(f), r.request);
      if (!target.startsWith(GAME)) bad.push(`${path.relative(GAME, f)}:${r.line} ${r.request}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the wechat loader rejects .json, built-ins and missing modules (self-check of the guard)', () => {
  const loader = createLoader(GAME);
  const from = path.join(GAME, 'core', 'dict.js');
  assert.throws(() => loader.resolve(from, './vocab.json'), /is not defined/);
  assert.throws(() => loader.resolve(from, 'fs'), /cannot require/);
  assert.throws(() => loader.resolve(from, 'node:path'), /cannot require/);
  assert.throws(() => loader.resolve(from, './nope'), /is not defined/);
  assert.ok(loader.resolve(from, './vocab'));
  const hidden = createLoader(GAME, { hide: ['js/dev'] });
  assert.throws(() => hidden.resolve(path.join(GAME, 'js', 'api.js'), './dev/mock-server'), /is not defined/);
});

test('the whole game graph loads under WeChat rules (entry, every core and js module)', () => {
  global.wx = global.wx || {};
  const loader = createLoader(GAME);
  const loaded = [];
  for (const f of FILES.filter((x) => x.endsWith('.js'))) {
    const rel = posix(f);
    if (rel === 'game.js' || rel === 'js/main.js' || rel === 'opendata/index.js' || /^js\/render\//.test(rel) || /^opendata\//.test(rel)) continue; // entries with side effects need wx; covered by smoke.test.js
    loader.load(f);
    loaded.push(f);
  }
  assert.ok(loaded.length >= 20, 'loaded ' + loaded.length);
  const vocab = loader.require(path.join(GAME, 'game.js'), './core/vocab');
  assert.equal(typeof vocab, 'string');
  assert.ok(vocab.split('\n').length > 100);
  const t2s = loader.require(path.join(GAME, 'game.js'), './core/t2s');
  assert.equal(t2s['蕃'], '番');
});
