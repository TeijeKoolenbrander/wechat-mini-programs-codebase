'use strict';
// QA-1 (studio standard, apps/kedupan): `npm run pack` writes upload-ready chuanhua_<name> folders into
// game/cloudfunctions-deploy/, the folder is ignored by git and the package, and project.config.json points at it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sync = require('../scripts/sync-core');
const { pack } = require('../scripts/deploy-pack');
const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));

const CF = sync.CF_ROOT;
const GAME = path.join(CF, '..', 'game');
const REPO = path.join(CF, '..', '..', '..');

test('QA-1: pack builds chuanhua_-prefixed folders (index, package, config, common, core), the timers and no tests', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-pack-'));
  try {
    const m = pack({ out, noSync: true });
    const fns = sync.listFunctions();
    assert.equal(m.functions.length, Object.keys(schema.FUNCTIONS).length);
    assert.equal(m.functions.length, 33);
    assert.deepEqual(fs.readdirSync(out).filter((d) => d !== 'MANIFEST.json').sort(), fns.map((n) => 'chuanhua_' + n).sort());
    assert.deepEqual(m.timers.map((t) => [t.deployName, t.cron]).sort(), [['chuanhua_cleanup', '0 0 4 * * * *'], ['chuanhua_modSweeper', '0 */5 * * * * *'], ['chuanhua_roomSweeper', '0 */1 * * * * *']]);
    for (const f of m.functions) {
      for (const p of ['index.js', 'package.json', 'function.config.json', 'common/util.js', 'core/chain.js', 'core/room.js']) {
        assert.ok(fs.existsSync(path.join(out, f.deployName, p)), f.deployName + '/' + p);
      }
      // the prompt bank is SERVER-ONLY (TD-103): only the functions flagged `bank` carry it
      for (const p of schema.BANK_FILES) {
        assert.equal(fs.existsSync(path.join(out, f.deployName, 'core', p)), !!schema.FUNCTIONS[f.repoName].bank, f.deployName + '/core/' + p);
      }
      assert.ok(!fs.existsSync(path.join(out, f.deployName, 'tests')));
    }
    assert.ok(fs.existsSync(path.join(out, 'MANIFEST.json')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('QA-1: the default output is game/cloudfunctions-deploy, git-ignored, packOptions-ignored and the cloudfunctionRoot', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(CF, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.pack, 'node scripts/deploy-pack.js');
  const src = fs.readFileSync(path.join(CF, 'scripts', 'deploy-pack.js'), 'utf8');
  assert.match(src, /'game', 'cloudfunctions-deploy'/);
  assert.match(fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8'), /^apps\/chuanhua\/game\/cloudfunctions-deploy\/$/m);
  const pc = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  assert.equal(pc.cloudfunctionRoot, 'cloudfunctions-deploy/');
  assert.ok(pc.packOptions.ignore.some((i) => i.value === 'cloudfunctions-deploy' && i.type === 'folder'));
  assert.match(fs.readFileSync(path.join(CF, 'README.md'), 'utf8'), /npm run pack/);
});

test('QA-10: the README says a typo in ENV_KIND is treated as prod', () => {
  const readme = fs.readFileSync(path.join(CF, 'README.md'), 'utf8');
  assert.match(readme, /typo in `ENV_KIND` is treated as `prod`/);
  assert.doesNotMatch(readme, /typo in `ENV_KIND` = `SERVER_CONFIG`/);
});
