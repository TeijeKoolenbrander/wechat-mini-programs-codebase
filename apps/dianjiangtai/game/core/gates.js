/**
 * Daily seed gates (spec 7.5, 7.5.1, AC 21, 55).
 *
 *   gateCheck(seed, contentVersion, configVersion) ->
 *     { optimal:{w,l}, greedyRate, randomRate, K, gateVersion, relaxed:false,
 *       pass:{optimal, greedy, random, all} }
 *   acceptDailySeed(seed, opts?) -> { accepted, gates, best? , rounds? }
 *
 * A daily seed fixes the token sheet and the battle/event streams, so the
 * per-seed "rates" come from K simulated players whose CHOICES vary while
 * the seed stays fixed (player j uses sub(seed, 'gate:greedy:' + j) or
 * 'gate:random:' + j for choices only).
 *
 * Gates: optimal (primary tokens, no re-spins) reaches 12-0; greedy 12-0
 * rate in [rateMin, rateMax]; random 12-0 rate <= rateMax.
 */

const { sub } = require('./rng');
const { getConfig, defaultConfigVersion } = require('./config');
const { LATEST_CONTENT_VERSION } = require('./content');
const { makeScenario } = require('./sim');
const { bestLineup } = require('./search');
const { buildSheet } = require('./sheet');
const { playRun } = require('./players');

function population(model, prefix, seed, contentVersion, scn, K, rounds) {
  let perfect = 0;
  for (let j = 0; j < K; j++) {
    const rng = sub(seed, prefix + j);
    const r = playRun(model, seed, contentVersion, 'daily', rng, scn, { rounds });
    if (r.record.l === 0) perfect++;
  }
  return perfect / K;
}

function gateCheck(seed, contentVersion, configVersion) {
  const cv = contentVersion || LATEST_CONTENT_VERSION;
  const config = getConfig(configVersion || defaultConfigVersion(cv));
  const g = config.gates;
  const scn = makeScenario(seed, cv, config.configVersion);
  const rounds = buildSheet(seed, cv, config.configVersion);
  const primary = rounds.map((r) => ({ faction: r.faction, era: r.era }));
  const opt = bestLineup(seed, cv, primary, { scenario: scn, stopAt12: true, rounds });
  const rec = {
    optimal: opt ? opt.record : { w: 0, l: config.battles },
    greedyRate: null,
    randomRate: null,
    K: g.K,
    gateVersion: config.gateVersion,
    relaxed: false,
  };
  const optimalOk = !!opt && opt.record.l === 0;
  if (!optimalOk) {
    rec.pass = { optimal: false, greedy: false, random: false, all: false };
    return rec;
  }
  rec.greedyRate = population('greedyNoisy', 'gate:greedy:', seed, cv, scn, g.K, rounds);
  rec.randomRate = population('random', 'gate:random:', seed, cv, scn, g.K, rounds);
  const greedyOk = rec.greedyRate >= g.greedy.rateMin && rec.greedyRate <= g.greedy.rateMax;
  const randomOk = rec.randomRate < g.random.rateMax;
  rec.pass = { optimal: true, greedy: greedyOk, random: randomOk, all: greedyOk && randomOk };
  return rec;
}

/**
 * Gate-check a candidate and, if it passes, compute the stored `best`
 * (full search, tie-break highest sum of win chances) and the sheet.
 */
function acceptDailySeed(seed, opts) {
  opts = opts || {};
  const cv = opts.contentVersion || LATEST_CONTENT_VERSION;
  const config = getConfig(opts.configVersion || defaultConfigVersion(cv));
  const gates = gateCheck(seed, cv, config.configVersion);
  if (!gates.pass.all) return { accepted: false, gates };
  const rounds = buildSheet(seed, cv, config.configVersion);
  const primary = rounds.map((r) => ({ faction: r.faction, era: r.era }));
  const best = bestLineup(seed, cv, primary, { rounds });
  return { accepted: true, gates, best, rounds };
}

module.exports = { gateCheck, acceptDailySeed };
