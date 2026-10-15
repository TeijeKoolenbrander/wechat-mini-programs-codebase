'use strict';
// TEST DOUBLE of apps/kedupan/game/core/schedule.js: only pickAutoDaily(content, dateKey, usedSet, recentSpectraSet).
// Deterministic per dateKey; 5 items from 5 categories and 5 spectra, card 1 easy, at least one split.
const crypto = require('crypto');

function rnd(seedStr) {
  let a = crypto.createHash('sha256').update(String(seedStr)).digest().readUInt32BE(0);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickAutoDaily(content, dateKey, used, recentSpectra) {
  const r = rnd(`${dateKey}|auto`);
  const items = Object.values(content.itemById).filter((it) => !used.has(it.id) && !recentSpectra.has(it.spectrumId));
  for (let attempt = 0; attempt < 50; attempt++) {
    const chosen = [];
    const take = (pred) => {
      const pool = items.filter((it) => pred(it) && !chosen.some((c) => c.cat === it.cat || c.spectrumId === it.spectrumId));
      if (!pool.length) return false;
      chosen.push(pool[Math.floor(r() * pool.length)]);
      return true;
    };
    if (!take((it) => it.tags.includes('easy')) || !take((it) => it.tags.includes('split'))) continue;
    while (chosen.length < 5) if (!take(() => true)) break;
    if (chosen.length === 5) return chosen.map((c) => c.id);
  }
  return null;
}
module.exports = { pickAutoDaily };
