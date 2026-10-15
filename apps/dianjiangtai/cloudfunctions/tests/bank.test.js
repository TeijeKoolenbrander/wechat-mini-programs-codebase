'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare } = require('../scripts/prepare-bank');
const { OPTIMAL_SEEDS, CV, CFG, GATE } = require('./helpers/harness');

const entry = (i, over = {}) => ({
  seed: OPTIMAL_SEEDS[i].seed, contentVersion: CV, configVersion: CFG, gateVersion: GATE,
  best: { lineup: OPTIMAL_SEEDS[i].lineup, record: { w: 12, l: 0 } }, gates: { pass: true }, used: false, ...over,
});

test('prepare-bank: valid generator output becomes console-importable docs with stable ids', () => {
  const { out, problems } = prepare([entry(0), entry(1)], 123);
  assert.deepEqual(problems, []);
  assert.equal(out.length, 2);
  assert.equal(out[0]._id, `bank_${OPTIMAL_SEEDS[0].seed}`);
  assert.equal(out[0].used, false);
  assert.equal(out[0].importedAt, 123);
  assert.deepEqual(Object.keys(out[0]).sort(), ['_id', 'best', 'configVersion', 'contentVersion', 'gateVersion', 'gates', 'importedAt', 'seed', 'used']);
});

test('prepare-bank: skips bad seeds, duplicates, version mismatches and non-12-0 lineups', () => {
  const bad = entry(2);
  const c = require(require('path').join(require('../scripts/sync-core').DEFAULT_CORE, 'content')).getContent(CV);
  const weakest = c.generals.map((g) => [g.id, Object.values(g.stats).reduce((a, b) => a + b, 0)]).sort((a, b) => a[1] - b[1]).slice(0, 5);
  bad.best = { lineup: OPTIMAL_SEEDS[2].lineup.map((l, i) => ({ slot: l.slot, generalId: weakest[i][0] })), record: { w: 12, l: 0 } }; // claims 12-0, plays badly
  const { out, problems } = prepare([
    entry(0), entry(0), entry(1, { contentVersion: 9 }), entry(1, { gateVersion: 0 }), bad,
    { seed: -1 }, null, entry(4, { best: { lineup: [] } }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(problems.length, 7);
  assert.ok(problems.some((p) => /not 12-0/.test(p)));
});

test('fixtures: tests/fixtures/optimal-seeds.json still holds 12-0 optima for the live core (regenerate after a core retune)', () => {
  const sim = require(require('path').join(require('../scripts/sync-core').DEFAULT_CORE, 'sim'));
  const cfgV = require(require('path').join(require('../scripts/sync-core').DEFAULT_CORE, 'config')).LATEST_CONFIG_VERSION;
  assert.ok(OPTIMAL_SEEDS.length >= 8);
  for (const f of OPTIMAL_SEEDS) assert.equal(sim.simulate(f.lineup, f.seed, CV, cfgV).record.w, 12, 'seed ' + f.seed);
});
