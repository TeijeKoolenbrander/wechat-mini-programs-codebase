#!/usr/bin/env node
/* Validates the content library and the schedule: node tools/validate-content.js */
const path = require('node:path');
const GAME = path.join(__dirname, '..');
const raw = require(path.join(GAME, 'core/content/spectra.v1.js'));
const { validateAll } = require(path.join(GAME, 'core/validate.js'));

const bad = validateAll(raw);
const items = raw.spectra.reduce((n, s) => n + s.items.length, 0);
const perCat = {};
raw.spectra.forEach((s) => (perCat[s.cat] = (perCat[s.cat] || 0) + 1));
console.log('spectra:', raw.spectra.length, 'items:', items, JSON.stringify(perCat));
if (bad.length) {
  console.error(bad.length + ' problems:\n' + bad.join('\n'));
  process.exit(1);
}
console.log('content ok');
