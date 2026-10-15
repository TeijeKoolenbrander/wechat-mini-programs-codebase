'use strict';
// TEST DOUBLE of apps/kedupan/game/core/score.js, implementing the formulas of spec sections 3.1-3.3
// with the primitive names that common/coreapi.js assumes. Only used until the real core lands
// (scripts/sync-core.js falls back to this folder when game/core does not exist).

/** s(d) = max(0, 100 - ceil(2.5 d)) */
function cardScore(d) {
  return Math.max(0, 100 - Math.ceil(2.5 * d));
}
function cardLabel(d) {
  if (d <= 2) return '心有灵犀';
  if (d <= 6) return '很同频';
  if (d <= 12) return '差不多';
  if (d <= 20) return '有点偏';
  return '想法独特';
}
/** median of a sorted-expanded multiset given as a 101-bin histogram; null when empty */
function medianOfHist(hist) {
  let m = 0;
  for (let i = 0; i < hist.length; i++) m += hist[i];
  if (m === 0) return null;
  const kth = (k) => {
    let acc = 0;
    for (let v = 0; v < hist.length; v++) {
      acc += hist[v];
      if (acc > k) return v;
    }
    return hist.length - 1;
  };
  return (kth(Math.floor((m - 1) / 2)) + kth(Math.floor(m / 2))) / 2;
}
function medianOfValues(values) {
  if (!values.length) return null;
  const v = values.slice().sort((a, b) => a - b);
  return (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2;
}
/** R = median(real positions + W virtual votes at the anchor) */
function referenceFromHist(hist, anchor, W) {
  const h = hist.slice();
  h[anchor] = (h[anchor] || 0) + W;
  return medianOfHist(h);
}
function dayBand(total) {
  if (total >= 450) return '灵魂同频';
  if (total >= 380) return '默契十足';
  if (total >= 300) return '大体同频';
  if (total >= 200) return '各有想法';
  return '独树一帜';
}

module.exports = { cardScore, cardLabel, medianOfHist, medianOfValues, referenceFromHist, dayBand };
