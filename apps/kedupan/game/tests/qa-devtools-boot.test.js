'use strict';
// QA: simulate what WeChat DevTools / the uploader packs. Builds the package from the COMMITTED project.config.json
// (the dev state) and from the release ignore list, loads it under WeChat rules, and boots the mock server from it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createLoader } = require('./wechat-loader');

const GAME = path.join(__dirname, '..');
const { DEV_ONLY_FILES, SERVER_ONLY_FILES } = require('../tools/release-config');

function committed(file) {
  const rel = 'apps/kedupan/game/' + file;
  try {
    return execFileSync('git', ['show', 'HEAD:' + rel], { cwd: GAME, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return fs.readFileSync(path.join(GAME, file), 'utf8');
  }
}

function pack(ignore) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-pack-'));
  fs.cpSync(GAME, dest, {
    recursive: true,
    filter: (src) => {
      const r = path.relative(GAME, src).split(path.sep).join('/');
      if (r === '') return true;
      if (r.startsWith('cloudfunctions-deploy')) return false;
      return !ignore.some((ig) => r === ig || r.startsWith(ig + '/'));
    },
  });
  return dest;
}

const devCfg = JSON.parse(committed('project.config.json'));
const DEV_IGNORE = devCfg.packOptions.ignore.map((x) => x.value);
const RELEASE_IGNORE = Array.from(new Set(DEV_IGNORE.concat(DEV_ONLY_FILES, SERVER_ONLY_FILES)));

test('DevTools boot of the committed dev state: the packed project loads the mock server, builds the server content and serves a daily', () => {
  assert.ok(!DEV_IGNORE.some((v) => SERVER_ONLY_FILES.includes(v) || DEV_ONLY_FILES.includes(v)), 'the committed state ignores neither dev-only nor server-only files');
  assert.match(committed('js/build-config.js'), /cloudEnv:\s*''/, 'the committed state is the mock state');
  const dir = pack(DEV_IGNORE);
  try {
    const L = createLoader(dir);
    const mockFile = path.join(dir, 'js', 'mock-server.js');
    const { createMockServer } = L.load(mockFile);
    const srv = createMockServer({ now: () => Date.UTC(2026, 10, 5, 2, 0, 0), content: L.load(path.join(dir, 'core', 'content.js')).getServerContent() });
    const d = srv.callAs('dev', 'getDaily', {});
    assert.equal(d.ok, true);
    assert.equal(d.cards.length, 5);
    assert.ok(!JSON.stringify(d).includes('anchor'));
    // the main-domain sha256 copy exists, and nothing in the main domain reaches into opendata/ (TD-67)
    assert.ok(fs.existsSync(path.join(dir, 'js', 'sha256.js')));
    for (const f of L.loaded()) assert.ok(!/^opendata\//.test(f), 'the main domain loaded ' + f);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release package: no mock, no stub, no answer key, no schedule; the cloud-mode graph loads without them', () => {
  const dir = pack(RELEASE_IGNORE);
  try {
    for (const f of DEV_ONLY_FILES.concat(SERVER_ONLY_FILES)) assert.ok(!fs.existsSync(path.join(dir, f)), f + ' must not be in the release package');
    const L = createLoader(dir);
    // the client text library loads, with no anchors
    const text = L.load(path.join(dir, 'core', 'content', 'spectra.v1.js'));
    assert.ok(text.spectra.length > 0);
    assert.throws(() => L.load(path.join(dir, 'js', 'mock-server.js')), /ENOENT|not defined/);
    // the server content is unavailable client-side (SERVER_CONFIG), the client text library still works
    const C = L.load(path.join(dir, 'core', 'content.js'));
    assert.ok(C.getContent().spectra.length > 0);
    assert.equal(C.getContent().hasAnchors, false);
    let sc;
    try {
      sc = C.getServerContent();
    } catch (e) {
      sc = null;
    }
    assert.ok(!sc || !sc.hasAnchors, 'no answer key is reachable from the release package');
    // brute force: no file in the package contains the schedule header or the anchor key
    const scan = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') scan(p);
        } else if (/\.(js|json)$/.test(e.name)) {
          const s = fs.readFileSync(p, 'utf8');
          assert.ok(!/"?anchor"?\s*:\s*\d/.test(s) || /tests\//.test(p), 'anchor values in ' + path.relative(dir, p));
        }
      }
    };
    scan(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
