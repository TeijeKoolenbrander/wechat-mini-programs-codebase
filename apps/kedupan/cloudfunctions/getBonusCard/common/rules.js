'use strict';
// Reveal payload for one answered card (shared by submitCard and the CARD_DONE replay).
const core = require('./coreapi');

/** pos is the caller's stored position; refs/stats from daily.currentRefs (live or final) */
function buildReveal(idx, pos, refs, stats, final) {
  const ref = refs[idx];
  const d = Math.abs(pos - ref);
  return {
    idx, pos, ref, d,
    score: core.cardScore(d),
    label: core.cardLabel(d),
    agreePct: core.agreePct(stats[idx].hist, pos),
    n: stats[idx].n,
    final: !!final,
  };
}

module.exports = { buildReveal };
