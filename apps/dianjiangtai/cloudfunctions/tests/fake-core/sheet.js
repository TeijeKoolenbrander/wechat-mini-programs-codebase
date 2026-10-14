'use strict';
// TEST DOUBLE of core/sheet.js. rounds[5] = {faction, era, altFaction[3], altEra[3]}
const { hash32 } = require('./rng');
const { FACTIONS, ERAS } = require('./content');
function buildSheet(seed, contentVersion) {
  const rounds = [];
  for (let i = 0; i < 5; i++) {
    const h = hash32(`${seed}:sheet:${contentVersion}:${i}`);
    const fi = h % 4;
    const ei = (h >>> 8) % 4;
    rounds.push({
      faction: FACTIONS[fi], era: ERAS[ei],
      altFaction: [1, 2, 3].map((d) => FACTIONS[(fi + d) % 4]),
      altEra: [1, 2, 3].map((d) => ERAS[(ei + d) % 4]),
    });
  }
  return rounds;
}
module.exports = { buildSheet };
