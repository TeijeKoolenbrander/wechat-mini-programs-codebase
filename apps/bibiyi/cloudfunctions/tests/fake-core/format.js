'use strict';
// TEST DOUBLE of core/format.js. Display formatting is core's job, never the renderer's or the server's.
function group(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** -> {valueText, unitText, approx} for one fact of one measure */
function formatValue(fact, measure) {
  let valueText;
  if (measure.kind === 'year') {
    valueText = fact.value < 0 ? `公元前${-fact.value}` : `公元${fact.value}`;
  } else {
    const v = fact.value * (measure.scale || 1);
    valueText = group(measure.decimals ? v.toFixed(measure.decimals) : Math.round(v));
  }
  return { valueText: (fact.approx ? '约' : '') + valueText, unitText: measure.unit, approx: !!fact.approx };
}
function sourceLine(fact) {
  return `来源：${fact.publisher} · ${fact.year}`;
}
module.exports = { formatValue, sourceLine };
