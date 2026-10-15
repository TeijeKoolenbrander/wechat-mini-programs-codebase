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

/** every file that ships: game.js, core/, js/, opendata/ (tests/ and tools/ never ship) */
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
  if (file.endsWith('facts.free.js')) return []; // generated data module, no requires (and a large file)
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

const FILES = shippedFiles().filter((f) => f.endsWith('.js'));
const posix = (f) => path.relative(GAME, f).split(path.sep).join('/');
// frontend-ui's js/render/ is optional until it lands: js/renderers.js loads it inside try/catch
const OPTIONAL_REQUIRE = (file, request) => posix(file) === 'js/renderers.js' && request === './render/index' && !fs.existsSync(path.join(GAME, 'js', 'render', 'index.js'));

test('scan covers the shipped entry, core, js files and the generated content', () => {
  const rel = FILES.map(posix);
  for (const must of ['game.js', 'core/content.js', 'core/content/facts.free.js', 'core/deck.js', 'js/main.js', 'js/controller.js', 'js/mock-server.js']) assert.ok(rel.includes(must), must);
  assert.ok(!rel.some((r) => /^(tests|tools)\//.test(r)));
});

test('no shipped file requires a non-.js path (WeChat: "module ... is not defined"), and every require is a literal', () => {
  const bad = [];
  for (const f of FILES) {
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
  for (const f of FILES) {
    for (const r of requiresOf(f)) {
      if (r.request === null) continue;
      const name = r.request.replace(/^node:/, '').split('/')[0];
      if (r.request.startsWith('node:') || NODE_ONLY.includes(name) || !/^(\.{1,2})?\//.test(r.request)) bad.push(`${path.relative(GAME, f)}:${r.line} require('${r.request}')`);
    }
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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
  for (const f of FILES) {
    for (const r of requiresOf(f)) {
      if (r.request === null || OPTIONAL_REQUIRE(f, r.request)) continue;
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
  assert.throws(() => loader.resolve(from, './content/facts.free.json'), /is not defined/);
  assert.throws(() => loader.resolve(from, 'fs'), /cannot require/);
  assert.throws(() => loader.resolve(from, 'node:path'), /cannot require/);
  assert.throws(() => loader.resolve(from, './content/nope'), /is not defined/);
  assert.ok(loader.resolve(from, './content/facts.free'));
});

test('the whole game graph loads under WeChat rules (every core and js module)', () => {
  global.wx = global.wx || {};
  const loader = createLoader(GAME);
  let loaded = 0;
  for (const f of FILES) {
    const rel = posix(f);
    if (rel === 'js/main.js') continue; // entry with side effects needs wx; covered by smoke.test.js
    if (/^(core|js)\//.test(rel) && !/^js\/render\//.test(rel)) {
      loader.load(f);
      loaded++;
    }
  }
  assert.ok(loaded >= 20, 'loaded ' + loaded);
  const { getContent } = loader.require(path.join(GAME, 'game.js'), './core/content');
  assert.ok(getContent(1).facts.length > 100);
});

test('the game package holds no daily-pool fact and no deck data (AC 22)', () => {
  const daily = JSON.parse(fs.readFileSync(path.join(GAME, 'tools', 'out', 'daily-facts.json'), 'utf8'));
  const files = shippedFiles().map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
  const hits = [];
  for (const fact of daily.facts) {
    for (const { f, text } of files) {
      if (text.includes('"' + fact.id + '"') || text.includes("'" + fact.id + "'")) hits.push(posix(f) + ' has daily id ' + fact.id);
      // the same name may be a free fact of ANOTHER measure (AnAge weight vs lifespan); the same measure is a leak
      if (text.split('\n').some((line) => line.includes('"measure":"' + fact.measure + '"') && line.includes('"label":"' + fact.label + '"'))) hits.push(posix(f) + ' has daily label ' + fact.label);
    }
  }
  assert.deepEqual(hits.slice(0, 10), []);
});
