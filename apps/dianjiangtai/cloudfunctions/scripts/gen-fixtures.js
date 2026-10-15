#!/usr/bin/env node
'use strict';
// Regenerates tests/fixtures/optimal-seeds.cv<N>.json: real seeds whose optimal lineup (for the primary
// tokens, no re-spins) scores 12-0 on the LIVE core. Run after any core retune / content bump:
//   node scripts/gen-fixtures.js [count=8] [startSeed=1000]
// These are test fixtures, NOT a seed bank (never use them as daily seeds; not a spoiler, they are tiny and fixed).
const fs = require('fs');
const path = require('path');
const sync = require('./sync-core');

const core = sync.DEFAULT_CORE;
const content = require(path.join(core, 'content'));
const config = require(path.join(core, 'config'));
const sheet = require(path.join(core, 'sheet'));
const search = require(path.join(core, 'search'));

const count = Number(process.argv[2]) || 8;
let seed = Number(process.argv[3]) || 1000;
const cv = content.LATEST_CONTENT_VERSION;
const cfgV = config.defaultConfigVersion ? config.defaultConfigVersion(cv) : config.LATEST_CONFIG_VERSION;
const out = [];
let tried = 0;
while (out.length < count) {
  const rounds = sheet.buildSheet(seed, cv, cfgV);
  const primary = rounds.map((r) => ({ faction: r.faction, era: r.era }));
  const best = search.bestLineup(seed, cv, primary, { rounds, stopAt12: true, configVersion: cfgV });
  tried++;
  if (best && best.record.w === 12 && best.record.l === 0) {
    out.push({ seed, lineup: best.lineup });
    console.log(`found ${out.length}/${count}: seed ${seed} (${tried} tried)`);
  }
  seed++;
}
const file = path.join(__dirname, '..', 'tests', 'fixtures', `optimal-seeds.cv${cv}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote', file);
