'use strict';
// TEST DOUBLE of core/gates.js: the analytic daily difficulty gate (spec 4.4). No simulation.
const config = require('./config');
const content = require('./content');

function gapOf(a, b, measure) {
  return measure.kind === 'year' ? Math.abs(b.value - a.value) / 100 : Math.abs(Math.log(b.value / a.value));
}
/** p_k for one question */
function pOf(a, b, measure, cfg) {
  const s = cfg.model.scales[measure.key] || measure.knowledgeScale;
  return cfg.model.pMin + (cfg.model.pMax - cfg.model.pMin) * (1 - Math.exp(-gapOf(a, b, measure) / s));
}
/** questions: [{a, b}] fact objects (with measure + value) -> {median, p20, p40, pass} */
function evaluateDeck(questions, configVersion) {
  const cfg = config.getConfig(configVersion);
  const measures = content.getMeasures();
  let cum = 1;
  let median = 0;
  let p20 = 0;
  questions.forEach((q, i) => {
    cum *= pOf(q.a, q.b, measures[q.a.measure], cfg);
    if (cum >= 0.5) median = i + 1;
    if (i + 1 === 20) p20 = cum;
  });
  const p40 = questions.length >= 40 ? cum : 0;
  const g = cfg.gates;
  const pass = median >= g.median[0] && median <= g.median[1] && p20 >= g.p20[0] && p20 <= g.p20[1] && p40 <= g.p40Max;
  return { median, p20, p40, pass };
}
module.exports = { evaluateDeck, pOf, gapOf };
