'use strict';
// TEST DOUBLE of core/search.js: greedy best power per round from the final tokens.
const { getContent } = require('./content');
const { simulate } = require('./sim');
const SLOTS = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];
function bestLineup(seed, contentVersion, finalTokens) {
  const gens = getContent(contentVersion).generals;
  const used = new Set();
  const lineup = finalTokens.map((t, i) => {
    const pool = gens.filter((g) => g.faction === t.faction && g.eras.includes(t.era) && !used.has(g.id));
    const best = pool.sort((a, b) => b.power - a.power)[0];
    used.add(best.id);
    return { slot: SLOTS[i], generalId: best.id };
  });
  return { lineup, record: simulate(lineup, seed, contentVersion, 1).record };
}
module.exports = { bestLineup };
