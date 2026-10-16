'use strict';
// `npm run pack`: one dianjiangtai_<name> folder per function, with common/ and core/, plus a manifest; timers listed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pack } = require('../scripts/deploy-pack');
const sync = require('../scripts/sync-core');

test('pack writes dianjiangtai_<name> folders with common and core, only genDaily and cleanup as timers', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'djt-pack-'));
  try {
    const m = pack({ out });
    const fns = sync.listFunctions();
    assert.equal(m.functions.length, fns.length);
    for (const fn of fns) {
      const dir = path.join(out, 'dianjiangtai_' + fn);
      for (const f of ['index.js', 'package.json', 'function.config.json']) assert.ok(fs.existsSync(path.join(dir, f)), fn + '/' + f);
      assert.ok(fs.existsSync(path.join(dir, 'common')) && fs.existsSync(path.join(dir, 'core')), fn + ' has common/ and core/');
    }
    assert.ok(!fs.existsSync(path.join(out, 'dianjiangtai_common')) && !fs.existsSync(path.join(out, 'dianjiangtai_tests')));
    assert.deepEqual(m.timers.map((t) => t.deployName).sort(), ['dianjiangtai_cleanup', 'dianjiangtai_genDaily']);
    assert.ok(fs.existsSync(path.join(out, 'MANIFEST.json')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('the pack output lives in the game project, git-ignored, out of the package, and is the cloudfunctionRoot', () => {
  const game = path.join(sync.CF_ROOT, '..', 'game');
  const cfg = JSON.parse(fs.readFileSync(path.join(game, 'project.config.json'), 'utf8'));
  assert.equal(cfg.cloudfunctionRoot, 'cloudfunctions-deploy/');
  assert.ok(cfg.packOptions.ignore.some((i) => i.value === 'cloudfunctions-deploy' && i.type === 'folder'));
  assert.match(fs.readFileSync(path.join(game, '.gitignore'), 'utf8'), /^cloudfunctions-deploy\/$/m);
});
