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
    if (rel.join('/') === 'project.private.config.json') return false; // DevTools-local, gitignored, never uploaded
    return ['game.js', 'core', 'js', 'opendata'].includes(rel[0]) && rel.length >= 1 && !/^(tests|tools|node_modules)$/.test(rel[0]);
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

test('scan covers the shipped entry, core, js and opendata files', () => {
  const rel = FILES.map((f) => path.relative(GAME, f).split(path.sep).join('/'));
  for (const must of ['game.js', 'core/content.js', 'core/content/generals.v1.js', 'js/main.js', 'opendata/index.js']) assert.ok(rel.includes(must), must);
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
        bad.push(`${path.relative(GAME, f)}:${r.line} ${e.message}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('the wechat loader rejects .json, built-ins and missing modules (self-check of the guard)', () => {
  const loader = createLoader(GAME);
  const from = path.join(GAME, 'core', 'content.js');
  assert.throws(() => loader.resolve(from, './content/generals.v1.json'), /is not defined/);
  assert.throws(() => loader.resolve(from, 'fs'), /cannot require/);
  assert.throws(() => loader.resolve(from, 'node:path'), /cannot require/);
  assert.throws(() => loader.resolve(from, './content/nope'), /is not defined/);
  assert.ok(loader.resolve(from, './content/generals.v1'));
});

test('the whole game graph loads under WeChat rules (entry, every core and js module, opendata)', () => {
  global.wx = global.wx || {};
  const loader = createLoader(GAME);
  const loaded = [];
  const posix = (f) => path.relative(GAME, f).split(path.sep).join('/');
  for (const f of FILES.filter((x) => x.endsWith('.js') && /^(core|opendata)\//.test(posix(x)) || /^js\/[^/]+\.js$/.test(posix(x)))) {
    if (posix(f) === 'js/main.js' || posix(f) === 'opendata/index.js') continue; // entries with side effects need wx; covered by smoke.test.js
    loader.load(f);
    loaded.push(f);
  }
  assert.ok(loaded.length >= 5, 'loaded ' + loaded.length);
  const { getContent } = loader.require(path.join(GAME, 'game.js'), './core/content');
  assert.equal(getContent(1).generals.length, 32);
});

test('openDataContext isolation: main domain never requires opendata/, opendata/ never requires outside itself', () => {
  const bad = [];
  for (const f of FILES) {
    const rel = path.relative(GAME, f).split(path.sep);
    const inOpen = rel[0] === 'opendata';
    for (const r of requiresOf(f)) {
      if (r.request === null || !r.request.startsWith('.')) continue;
      const tRel = path.relative(GAME, path.resolve(path.dirname(f), r.request)).split(path.sep);
      const targetOpen = tRel[0] === 'opendata';
      if (!inOpen && targetOpen) bad.push(`${rel.join('/')}:${r.line} (main domain) requires ${r.request} inside opendata/`);
      if (inOpen && !targetOpen) bad.push(`${rel.join('/')}:${r.line} (opendata) requires ${r.request} outside opendata/`);
    }
  }
  assert.deepEqual(bad, []);
});
