'use strict';
// release-config.js flags (A1-A3): --appid, --ad-rewarded / --ad-interstitial, --prefixed-functions (+ deprecated --shared-test-env).
// Runs on a temp copy reset to dev first, so it passes in both modes of the committed tree.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GAME = path.join(__dirname, '..');
const FINAL_TERMS = "'use strict';\nmodule.exports = { title: '传画接龙用户服务协议', paragraphs: [{ text: '一、服务说明', heading: true }, { text: '正文' }] };\n";
function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d); else fs.copyFileSync(s, d);
  }
}
const sw = (g, ...args) => spawnSync(process.execPath, [path.join(g, 'tools', 'release-config.js'), ...args], { encoding: 'utf8' });
const read = (g, f) => fs.readFileSync(path.join(g, f), 'utf8');

test('release switch flags: --appid, ad units and the chuanhua_ prefix are written in release; --dev restores every byte; bad values are refused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-flags-'));
  const g = path.join(root, 'apps', 'chuanhua', 'game');
  try {
    copy(GAME, g);
    assert.equal(sw(g, '--dev').status, 0);
    fs.writeFileSync(path.join(g, 'js', 'terms-text.js'), FINAL_TERMS);
    const files = ['js/build-config.js', 'project.config.json'];
    const dev = files.map((f) => read(g, f));
    assert.equal(JSON.parse(dev[1]).appid, 'wxcd03c1b62d7eb0e0');

    const r = sw(g, '--env', 'env-x', '--appid', 'wx0123456789abcdef', '--ad-rewarded', 'adunit-test1234', '--ad-interstitial', 'adunit-test5678', '--prefixed-functions');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /shared test AppID/);
    assert.equal(JSON.parse(read(g, 'project.config.json')).appid, 'wx0123456789abcdef');
    const bc = read(g, 'js/build-config.js');
    assert.match(bc, /^const fnPrefix = 'chuanhua_';$/m);
    assert.match(bc, /adUnits: \{ rewarded: 'adunit-test1234', interstitial: 'adunit-test5678', banner: '' \},/);

    // no flags: prefix still set, AppID untouched (warning printed), ad units emptied
    const r2 = sw(g, '--env', 'env-x', '--shared-test-env');
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stderr, /shared test AppID/);
    assert.match(read(g, 'js/build-config.js'), /^const fnPrefix = 'chuanhua_';$/m);
    assert.match(read(g, 'js/build-config.js'), /adUnits: \{ rewarded: '', interstitial: '', banner: '' \},/);
    assert.equal(JSON.parse(read(g, 'project.config.json')).appid, 'wx0123456789abcdef', 'without --appid the file keeps its AppID');

    for (const bad of [['--appid', 'wxZZ'], ['--appid', 'WX0123456789ABCDEF'], ['--ad-rewarded', 'nope'], ['--ad-interstitial', 'adunit-']]) {
      const before = files.map((f) => read(g, f));
      const x = sw(g, '--env', 'env-x', ...bad);
      assert.notEqual(x.status, 0, bad.join(' '));
      assert.deepEqual(files.map((f) => read(g, f)), before, 'refused input changes nothing');
    }

    assert.equal(sw(g, '--env', 'env-x', '--appid', 'wx0123456789abcdef', '--ad-rewarded', 'adunit-test1234').status, 0);
    assert.equal(sw(g, '--dev').status, 0);
    assert.deepEqual(files.map((f) => read(g, f)), dev, '--dev restores both files byte for byte, AppID and ad units included');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
