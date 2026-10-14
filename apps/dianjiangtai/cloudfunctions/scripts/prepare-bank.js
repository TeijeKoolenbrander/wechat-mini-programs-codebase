#!/usr/bin/env node
'use strict';
// Turns the seed-bank file written by the game's generator into a cloud-console import file
// (JSON Lines, one document per line) for the `daily_seed_bank` collection.
//
//   1. node apps/dianjiangtai/game/tools/simstats.js --bank 60 --bank-file <tmp>/bank.json
//      (about 27 s per 5 seeds, so roughly 5-6 minutes for 60)
//   2. node scripts/prepare-bank.js <tmp>/bank.json <tmp>/bank.import.jsonl
//   3. Cloud console > database > daily_seed_bank > Import (JSON Lines, conflict mode: skip)
//   4. delete both files. The file lists FUTURE daily seeds (a spoiler): never commit it.
//
// Every entry is re-verified with the real core before it is written: matching live versions, and the
// stored best lineup really scores 12-0 on the rebuilt sheet. Ids are `bank_<seed>`, so importing the
// same file twice cannot duplicate an entry.
const fs = require('fs');
const path = require('path');

const core = path.resolve(__dirname, '..', '..', 'game', 'core');
const content = require(path.join(core, 'content'));
const config = require(path.join(core, 'config'));
const sheet = require(path.join(core, 'sheet'));
const sim = require(path.join(core, 'sim'));

function prepare(entries, now = Date.now()) {
  const cv = content.LATEST_CONTENT_VERSION;
  const cfgV = config.LATEST_CONFIG_VERSION;
  const gateV = config.getConfig(cfgV).gateVersion;
  const out = [];
  const problems = [];
  const seen = new Set();
  for (const e of entries) {
    const why = (m) => problems.push(`seed ${e && e.seed}: ${m}`);
    if (!e || !Number.isInteger(e.seed) || e.seed < 0 || e.seed > 4294967295) { why('bad seed'); continue; }
    if (seen.has(e.seed)) { why('duplicate seed'); continue; }
    if (e.contentVersion !== cv || e.configVersion !== cfgV || e.gateVersion !== gateV) { why('version mismatch with the live core'); continue; }
    if (!e.best || !Array.isArray(e.best.lineup) || e.best.lineup.length !== 5) { why('no best lineup'); continue; }
    if (!sheet.buildSheet(e.seed, cv, cfgV)) { why('cannot build sheet'); continue; }
    const r = sim.simulate(e.best.lineup, e.seed, cv, cfgV).record;
    if (r.w !== 12 || r.l !== 0) { why(`best lineup scores ${r.w}-${r.l}, not 12-0`); continue; }
    seen.add(e.seed);
    out.push({
      _id: `bank_${e.seed}`, seed: e.seed, contentVersion: cv, configVersion: cfgV, gateVersion: gateV,
      best: { lineup: e.best.lineup, record: r }, gates: e.gates, used: false, importedAt: now,
    });
  }
  return { out, problems };
}

module.exports = { prepare };

if (require.main === module) {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error('usage: node scripts/prepare-bank.js <bank.json from simstats --bank> <out.jsonl>');
    process.exit(2);
  }
  const { out, problems } = prepare(JSON.parse(fs.readFileSync(src, 'utf8')));
  problems.forEach((p) => console.error('skipped ' + p));
  fs.writeFileSync(dest, out.map((d) => JSON.stringify(d)).join('\n') + '\n');
  console.log(`wrote ${out.length} entries to ${dest} (${problems.length} skipped). Import it, then delete both files.`);
  if (out.length < 10) console.error('WARNING: fewer than 10 days of seeds');
}
