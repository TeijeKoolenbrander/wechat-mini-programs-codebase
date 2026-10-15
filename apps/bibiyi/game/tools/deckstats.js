#!/usr/bin/env node
/**
 * Daily deck gate statistics (spec 4.4, AC 30).
 *
 *   node tools/deckstats.js [--dates N] [--attempts N] [--check] [--facts FILE]
 *
 * For N consecutive dates (default 10,000 is the CI figure; default here 365 for speed)
 * runs the nightly generation loop over the daily pool in tools/out/daily-facts.json and
 * reports: the candidate pass rate (decks built that passed the gates / decks built), how
 * many dates fell back to DAILY_UNAVAILABLE, the attempts per accepted deck, the model
 * median / P(>=20) / P(40) distribution, and the weekday mix. With --check it exits 1 when
 * the candidate pass rate is below 20% or any date has no deck.
 */

const fs = require('node:fs');
const path = require('node:path');
const { indexFacts } = require('../core/content');
const { LATEST_CONFIG_VERSION, getConfig } = require('../core/config');
const { generateDaily } = require('../core/deck');
const { addDays } = require('../core/date');

function run(opts) {
  const o = opts || {};
  const file = o.facts || path.join(__dirname, 'out', 'daily-facts.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const index = indexFacts(data.facts, data.contentVersion);
  const config = getConfig(LATEST_CONFIG_VERSION);
  const dates = o.dates || 365;
  const start = o.start || '20261101';
  let candidatesBuilt = 0;
  let candidatesPassed = 0;
  let unavailable = 0;
  let attemptsSum = 0;
  const medians = [];
  const p20s = [];
  const pFulls = [];
  const history = [];
  for (let d = 0; d < dates; d++) {
    const dateKey = addDays(start, d);
    const ex = new Set();
    history.slice(-(config.daily.repeatWindowDays - 1)).forEach((ids) => ids.forEach((id) => ex.add(id)));
    const r = generateDaily({ dateKey, index, contentVersion: data.contentVersion, configVersion: LATEST_CONFIG_VERSION, exclude: ex, maxAttempts: o.attempts });
    candidatesBuilt += r.built;
    if (!r.ok) {
      unavailable++;
      history.push([]);
      continue;
    }
    candidatesPassed++;
    attemptsSum += r.attempts;
    medians.push(r.stats.median);
    p20s.push(r.stats.p20);
    pFulls.push(r.stats.pFull);
    const ids = [];
    r.deck.questions.forEach((q) => {
      if (q.segStart) ids.push(q.a);
      ids.push(q.b);
    });
    history.push(ids);
  }
  const passRate = candidatesBuilt ? candidatesPassed / candidatesBuilt : 0;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return { dates, accepted: candidatesPassed, unavailable, candidatesBuilt, passRate, attemptsPerDeck: candidatesPassed ? attemptsSum / candidatesPassed : 0, medianAvg: avg(medians), p20Avg: avg(p20s), pFullMax: Math.max.apply(null, pFulls.concat([0])), placeholder: !!data.placeholder };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (n) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const r = run({ dates: opt('--dates') ? Number(opt('--dates')) : 365, attempts: opt('--attempts') ? Number(opt('--attempts')) : undefined, facts: opt('--facts') });
  console.log(JSON.stringify(r, null, 2));
  if (argv.indexOf('--check') >= 0 && (r.passRate < 0.2 || r.unavailable > 0)) {
    console.error('FAIL: candidate pass rate ' + (r.passRate * 100).toFixed(1) + '% (need >= 20%), unavailable dates ' + r.unavailable);
    process.exit(1);
  }
}

module.exports = { run };
