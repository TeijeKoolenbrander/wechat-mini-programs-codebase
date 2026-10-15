/**
 * The analytic difficulty model and daily gates (spec 4.4, PO-8). No
 * simulation: the chance that a typical player gets question k right is a
 * function of the gap and the measure; P(streak >= n) is the running product.
 */

const { BY_KEY } = require('./measures');

/** |ln(b/a)|-style gap used by the model: ratio kind ln(max/min), year kind delta years / yearDivisor. */
function modelGap(config, m, a, b) {
  if (m.kind === 'year') return Math.abs(b.value - a.value) / config.model.yearDivisor;
  const hi = Math.max(a.value, b.value);
  const lo = Math.min(a.value, b.value);
  return Math.log(hi / lo);
}

/** P(typical player answers correctly) for a pair. */
function questionProb(config, m, a, b) {
  const g = modelGap(config, m, a, b);
  const p = config.model;
  return p.pMin + (p.pMax - p.pMin) * (1 - Math.exp(-g / m.knowledgeScale));
}

/**
 * deck: { questions: [{a, b}] }. Returns
 * { probs[], cum[] (cum[n] = P(streak >= n), cum[0] = 1), median, p20, pFull }.
 * median = the largest n with cum[n] >= 0.5.
 */
function deckStats(deck, byId, config) {
  const probs = [];
  const cum = [1];
  deck.questions.forEach((q) => {
    const a = byId[q.a];
    const b = byId[q.b];
    const p = questionProb(config, BY_KEY[a.measure], a, b);
    probs.push(p);
    cum.push(cum[cum.length - 1] * p);
  });
  let median = 0;
  for (let n = 1; n < cum.length; n++) if (cum[n] >= 0.5) median = n;
  return { probs, cum, median, p20: cum.length > 20 ? cum[20] : cum[cum.length - 1], pFull: cum[cum.length - 1] };
}

/** { pass, reasons[] } against config.gates. */
function passesGates(stats, config) {
  const g = config.gates;
  const reasons = [];
  if (stats.median < g.median[0] || stats.median > g.median[1]) reasons.push('median ' + stats.median);
  if (stats.p20 < g.p20[0] || stats.p20 > g.p20[1]) reasons.push('p20 ' + stats.p20.toFixed(4));
  if (stats.pFull > g.pFull) reasons.push('pFull ' + stats.pFull.toFixed(5));
  return { pass: reasons.length === 0, reasons };
}

module.exports = { modelGap, questionProb, deckStats, passesGates };
