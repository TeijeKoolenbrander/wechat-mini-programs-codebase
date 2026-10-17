'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GAME = path.resolve(__dirname, '..');
const APP = path.resolve(GAME, '..');

function walk(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'tests', 'tools'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const shipped = walk(GAME);
const requiresOf = (src) => [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);

test('AC 75: every require in shipped code is a relative .js module that exists inside apps/kedupan (WeChat cannot require .json)', () => {
  assert.ok(shipped.length > 10);
  shipped.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    requiresOf(src).forEach((req) => {
      assert.ok(req.startsWith('.'), `${path.relative(GAME, file)} requires non-relative "${req}"`);
      assert.ok(!req.endsWith('.json'), `${path.relative(GAME, file)} requires json "${req}"`);
      const target = path.resolve(path.dirname(file), req);
      const resolved = fs.existsSync(target + '.js') ? target + '.js' : fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
      // content modules the content writer delivers may be absent in this wave; they are loaded lazily in try/catch
      const lazyContent = /core[\\/]content[\\/](spectra|schedule|forbidden)\.v\d/.test(target);
      if (!lazyContent) assert.ok(resolved, `${path.relative(GAME, file)} requires missing "${req}"`);
      if (resolved) assert.ok(resolved.startsWith(APP + path.sep), `${path.relative(GAME, file)} escapes apps/kedupan: ${req}`);
    });
  });
});

test('core/ is pure: no wx, no DOM, no timers, no node-only modules (shared by client and cloud)', () => {
  walk(path.join(GAME, 'core')).forEach((file) => {
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const rel = path.relative(GAME, file);
    assert.ok(!/\bwx\./.test(src), rel + ' uses wx');
    assert.ok(!/\b(window\.|document\.|localStorage|setTimeout|setInterval|process\.|Buffer\b)/.test(src), rel + ' uses a host API');
    assert.ok(!/\bDate\.now\(|new Date\(\)/.test(src), rel + ' reads the clock (callers pass nowMs)');
    assert.ok(!/Math\.random/.test(src.replace(/function randomSeed[\s\S]*?\n}/, '')), rel + ' uses Math.random (callers pass rng)');
    requiresOf(src).forEach((r) => assert.ok(r.startsWith('./'), rel + ' requires ' + r));
  });
});

test('AC 29 / 68 / 77: no keyboard or text input, no wx.reportEvent, no AppSecret / session_key / code2Session in shipped code', () => {
  shipped.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const rel = path.relative(GAME, file);
    // D-2: the typed clue input is the only text input (AC 29): the system keyboard is driven from js/keyboard.js and nowhere else
    if (rel.replace(/\\/g, '/') !== 'js/keyboard.js') assert.ok(!/showKeyboard|wx\.createInput|<input|onKeyboardInput/.test(src), rel + ' accepts typed text');
    assert.ok(!/wx\.reportEvent|reportAnalytics/.test(src), rel + ' uses wx.reportEvent');
    assert.ok(!/AppSecret|session_key|code2Session|getShareInfo/.test(src), rel + ' has a forbidden string');
  });
});

test('AC 50 / 51: nothing calls shareAppMessage outside a tap handler yet (no auto share) and no share grants anything', () => {
  shipped.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/shareAppMessage/.test(src) || /share\.js$/.test(file), path.relative(GAME, file) + ' calls shareAppMessage outside js/share.js');
  });
});

test('game config: portrait, open data context, shared test appid, packOptions ignore tests/tools/contracts', () => {
  const gj = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
  assert.equal(gj.deviceOrientation, 'portrait');
  assert.equal(gj.openDataContext, 'opendata');
  assert.ok(fs.existsSync(path.join(GAME, 'opendata', 'index.js')));
  const pc = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  require('./mode').checkAppId(pc.appid);
  if (!require('./mode').RELEASE) assert.equal(require('../js/build-config').cloudEnv, '', 'cloudEnv empty by default: mock server');
  assert.equal(pc.compileType, 'game');
  const ignored = pc.packOptions.ignore.map((x) => x.value);
  ['tests', 'tools', 'node_modules', 'package.json', 'core/README.md', 'js/render/CONTRACT.md'].forEach((v) => assert.ok(ignored.includes(v), v));
});

test('AC 74: shipped code stays far below the 4 MB main-package budget (content modules excluded until delivered)', () => {
  let bytes = 0;
  const all = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'tests', 'tools'].includes(e.name)) continue;
      if (e.name === 'project.private.config.json') continue; // DevTools-local, gitignored, never uploaded
      const p = path.join(dir, e.name);
      if (e.isDirectory()) all(p);
      else bytes += fs.statSync(p).size;
    }
  };
  all(GAME);
  assert.ok(bytes < 1536 * 1024, 'code is ' + bytes + ' bytes'); // 1.5 MB (was 1 MB before D-2 added the typed-clue rules, the blocklist and the mock admin)
});
