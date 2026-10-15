/**
 * Token sheet (spec 4, 5.1): everything the client may know about a seed.
 *
 *   buildSheet(seed, contentVersion[, configVersion]) -> rounds[5]
 *   round = { faction, era, altFaction[<=3], altEra[<=3], fallback: tokenSet[], pools? }
 *   tokenSet = { faction, era, altFaction, altEra }
 *   pools = { 'faction|era': [rosterIndex, ...] }   (contentVersion 2 only)
 *
 * - The primary cell is uniform over the valid cells. No rarity weighting.
 * - altFaction[k] differs from the current faction (all alternates in a
 *   round are distinct from it and from each other) and forms a valid cell
 *   with the current era; likewise altEra[k]. k is the number of re-spins of
 *   that dimension already used in the round.
 * - fallback holds deterministic replacement token sets for the "pool is
 *   empty after earlier picks" auto-reflip. The last entry is always a cell
 *   too big to be emptied by earlier picks, so a reflip always terminates.
 * - pools (v2, spec 4 "Pool"): for every valid cell with more than poolCap
 *   generals, the round's pool ORDER, a seeded shuffle of the cell's roster
 *   indexes (sub(seed, 'pool:' + round + ':' + faction + ':' + era), round
 *   1-based). The pool is the first poolCap undrafted generals in that
 *   order. Because the order rides in the round, the daily client (which
 *   has no seed) and the server derive identical pools. Cells with at most
 *   poolCap generals have no entry (all undrafted members are shown).
 *
 * The sheet never contains battle or event randomness.
 */

const { sub, int, pick, shuffle } = require('./rng');
const { getContent, cellKey } = require('./content');
const { getConfig, defaultConfigVersion } = require('./config');

function isValidCell(content, faction, era) {
  const c = content.cells[cellKey(faction, era)];
  return !!c && c.length >= content.minCell;
}

function makeTokenSet(content, rng, cell, altCount) {
  const altFaction = shuffle(
    rng,
    content.factions.map((f) => f.key).filter((f) => f !== cell.faction && isValidCell(content, f, cell.era))
  ).slice(0, altCount);
  const altEra = shuffle(
    rng,
    content.eras.map((e) => e.key).filter((e) => e !== cell.era && isValidCell(content, cell.faction, e))
  ).slice(0, altCount);
  return { faction: cell.faction, era: cell.era, altFaction, altEra };
}

/** The seeded pool order of a cell in round `round` (1-based): roster indexes. */
function poolOrder(seed, content, round, faction, era) {
  const cell = content.cells[cellKey(faction, era)].slice();
  return shuffle(sub(seed >>> 0, 'pool:' + round + ':' + faction + ':' + era), cell);
}

function buildSheet(seed, contentVersion, configVersion) {
  const content = getContent(contentVersion);
  if (!content) throw new Error('unknown contentVersion ' + contentVersion);
  const config = getConfig(configVersion || defaultConfigVersion(contentVersion));
  const sheetRng = sub(seed, 'sheet');
  const fbRng = sub(seed, 'fallback');
  const cells = content.validCells;
  // Cells that cannot be emptied by the (at most rounds-1) earlier picks.
  const safe = cells.filter((c) => content.cells[cellKey(c.faction, c.era)].length >= config.rounds);
  const big = cells.filter((c) => content.cells[cellKey(c.faction, c.era)].length > config.poolCap);

  const rounds = [];
  for (let r = 0; r < config.rounds; r++) {
    const cell = pick(sheetRng, cells);
    const round = makeTokenSet(content, sheetRng, cell, config.altCount);
    round.fallback = [];
    for (let k = 0; k < config.fallbackCount; k++) {
      const last = k === config.fallbackCount - 1 && safe.length > 0;
      const c = last ? safe[int(fbRng, safe.length)] : cells[int(fbRng, cells.length)];
      round.fallback.push(makeTokenSet(content, fbRng, c, config.altCount));
    }
    if (big.length > 0) {
      round.pools = {};
      for (const c of big) round.pools[cellKey(c.faction, c.era)] = poolOrder(seed, content, r + 1, c.faction, c.era);
    }
    rounds.push(round);
  }
  return rounds;
}

module.exports = { buildSheet, isValidCell, makeTokenSet, poolOrder };
