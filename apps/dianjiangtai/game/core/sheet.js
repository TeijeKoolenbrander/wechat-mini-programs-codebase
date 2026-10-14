/**
 * Token sheet (spec 4, 5.1): everything the client may know about a seed.
 *
 *   buildSheet(seed, contentVersion) -> rounds[5]
 *   round = { faction, era, altFaction[<=3], altEra[<=3], fallback: tokenSet[] }
 *   tokenSet = { faction, era, altFaction, altEra }
 *
 * - The primary cell is uniform over the valid cells. No rarity weighting.
 * - altFaction[k] differs from the current faction (all alternates in a
 *   round are distinct from it and from each other) and forms a valid cell
 *   with the current era; likewise altEra[k]. k is the number of re-spins of
 *   that dimension already used in the round.
 * - fallback holds deterministic replacement token sets for the "pool is
 *   empty after earlier picks" auto-reflip. The last entry is always a cell
 *   too big to be emptied by earlier picks, so a reflip always terminates.
 *
 * The sheet never contains battle or event randomness.
 */

const { sub, int, pick, shuffle } = require('./rng');
const { getContent, cellKey } = require('./content');
const { getConfig, LATEST_CONFIG_VERSION } = require('./config');

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

function buildSheet(seed, contentVersion, configVersion) {
  const content = getContent(contentVersion);
  if (!content) throw new Error('unknown contentVersion ' + contentVersion);
  const config = getConfig(configVersion || LATEST_CONFIG_VERSION);
  const sheetRng = sub(seed, 'sheet');
  const fbRng = sub(seed, 'fallback');
  const cells = content.validCells;
  // Cells that cannot be emptied by the (at most rounds-1) earlier picks.
  const safe = cells.filter((c) => content.cells[cellKey(c.faction, c.era)].length >= config.rounds);

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
    rounds.push(round);
  }
  return rounds;
}

module.exports = { buildSheet, isValidCell, makeTokenSet };
