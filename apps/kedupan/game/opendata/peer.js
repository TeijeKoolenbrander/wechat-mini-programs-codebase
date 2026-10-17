/**
 * 最同频 (spec 3.4, PD-20), computed ONLY here, in the open data domain. The open data context cannot require files outside
 * opendata/, so this is a copy of core/group.js closestPeer; tests/opendata.test.js proves the two agree on random fixtures.
 *
 * viewerPos: number[5] (the viewer's positions). peers: [{key, pos:number[5], completeAt:number}] EXCLUDING the viewer.
 * Smallest mean absolute gap wins; ties go to the earlier completion. Returns {key, gap} (gap is the exact mean; the
 * screen shows Math.round(gap)) or null.
 */
function closestPeer(viewerPos, peers) {
  let best = null;
  for (let i = 0; i < peers.length; i++) {
    const p = peers[i];
    let s = 0;
    for (let c = 0; c < 5; c++) s += Math.abs(viewerPos[c] - p.pos[c]);
    const gap = s / 5;
    if (best === null || gap < best.gap || (gap === best.gap && p.completeAt < best.completeAt)) best = { key: p.key, gap, completeAt: p.completeAt };
  }
  return best ? { key: best.key, gap: best.gap } : null;
}

/** "a,b,c,d,e" (server row `pos`) -> number[5], or null if malformed. */
function parsePos(s) {
  if (typeof s !== 'string') return null;
  const a = s.split(',').map(Number);
  return a.length === 5 && a.every((n) => Number.isInteger(n) && n >= 0 && n <= 100) ? a : null;
}

module.exports = { closestPeer, parsePos };
