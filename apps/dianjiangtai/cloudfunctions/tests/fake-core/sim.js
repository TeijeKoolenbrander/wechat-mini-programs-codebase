'use strict';
// TEST DOUBLE of core/sim.js: wins = clamp(sum(power) - 20, 0, 12). Deterministic, seed-independent.
const { getContent } = require('./content');
const BANDS = [[12, 'yitong'], [10, 'baye'], [8, 'xiongju'], [6, 'sanfen'], [4, 'pian'], [2, 'bing'], [0, 'yibai']];
function simulate(lineup, seed, contentVersion, configVersion) {
  const gens = getContent(contentVersion).generals;
  const power = lineup.reduce((a, l) => a + gens.find((g) => g.id === l.generalId).power, 0);
  const w = Math.max(0, Math.min(12, power - 20));
  const battles = Array.from({ length: 12 }, (_, i) => ({ i: i + 1, win: i < w }));
  const band = BANDS.find((b) => w >= b[0]);
  return { record: { w, l: 12 - w }, battles, events: [], band: { key: band[1], label: band[1] }, morale: { total: 1 } };
}
module.exports = { simulate };
