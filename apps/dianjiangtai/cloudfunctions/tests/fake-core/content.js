'use strict';
// TEST DOUBLE of game/core/content.js: 4 factions x 8 generals, every general serves all 4 eras.
// Only contentVersion 1 exists. Power rises with k (0..7 => 3..10).
const FACTIONS = ['wei', 'shu', 'wu', 'qun'];
const ERAS = ['huangjin', 'qunxiong', 'chibi', 'sanfen'];
const generals = [];
for (const f of FACTIONS) {
  for (let k = 0; k < 8; k++) {
    generals.push({ id: `g_${f}${k}`, name: `${f}${k}`, faction: f, eras: ERAS.slice(), power: 3 + k });
  }
}
function getContent(v) {
  if (v !== 1) throw new Error('unknown content version ' + v);
  return { contentVersion: 1, generals };
}
module.exports = { getContent, FACTIONS, ERAS };
