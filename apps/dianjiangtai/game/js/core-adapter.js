/**
 * The one place where the client touches core details that the UI needs reshaped (seals, appearance notes,
 * 已点将 rows, drafted-cell factions). It uses the final core API (core/README.md): date.weekdayOf / variantOf,
 * draft.draftedInCell, draft.currentPool, content.appearanceNote. It still tolerates contentVersion 1 content
 * (single appearance, four factions) for old stored runs. If the core API names change, fix them here only.
 *
 *  - general.appearances: [{ faction, eras[], note? }] (content 1: derived from faction/eras)
 *  - content.cells['faction|era'] = roster indexes of the (uncapped) cell
 *  - draft.currentPool(run) = roster indexes of the selectable (undrafted, capped) pool
 *  - run.picks[] = { round, generalId, slot, faction? }, run.finalTokens[round-1] = { faction, era }
 *  - config.shiren.weekday (default 0 = Sunday)
 */

const draft = require('../core/draft');
const { SLOTS, appearanceNote: coreAppearanceNote } = require('../core/content');
const dateMod = require('../core/date');

const FALLBACK_FACTION_COLOR = { jin: '#DCE3EA' };
const SHIREN_WEEKDAY_DEFAULT = 0;

function weekdayOf(dateKey) {
  return dateMod.weekdayOf(dateKey);
}

/** 'shiren' on the configured weekday (Beijing date key), otherwise 'standard'. */
function variantFor(config, dateKey) {
  const wd = config && config.shiren && config.shiren.weekday !== undefined ? config.shiren.weekday : SHIREN_WEEKDAY_DEFAULT;
  return dateMod.variantOf(dateKey, wd);
}

function appearancesOf(g) {
  if (g.appearances && g.appearances.length) return g.appearances;
  return [{ faction: g.faction, eras: g.eras }];
}

/** Appearance note (e.g. 从公孙瓒) for the cell the general is shown in, or null. */
function appearanceNote(g, factionKey, content) {
  if (content && content.byId && content.byId[g.id]) return coreAppearanceNote(content, g.id, factionKey) || null;
  const a = appearancesOf(g).find((x) => x.faction === factionKey);
  return a && a.note ? a.note : null;
}

function cellKeyOf(faction, era) {
  return faction + '|' + era;
}

function factionColor(content, key) {
  const f = content.factionByKey && content.factionByKey[key];
  return (f && f.color) || FALLBACK_FACTION_COLOR[key] || '#7A5230';
}

/** Seal descriptor (spec 13 `Seal`). frame: 'plain' when hidden. */
function sealOf(content, gid, opts) {
  const g = content.byId[gid];
  opts = opts || {};
  const factionKey = opts.factionKey || g.faction;
  const frame = opts.hidden ? 'plain' : g.tier;
  return { text: g.name, monogram: g.monogram, factionKey, color: factionColor(content, factionKey), inkText: factionKey === 'jin', frame, size: opts.size || 0 };
}

/** Roster indexes of a cell (uncapped), [] if the cell does not exist. */
function cellMembers(content, faction, era) {
  return content.cells[cellKeyOf(faction, era)] || [];
}

/** How many undrafted generals the current cell has before any cap (analytics `poolTotal`). */
function poolTotal(run) {
  if (!run.token) return 0;
  return cellMembers(run.content, run.token.faction, run.token.era).filter((gi) => !run.drafted[run.content.roster[gi]]).length;
}

/** Roster indexes of drafted generals who belong to the current cell (shown dimmed, 已点将). */
function draftedInCell(run) {
  if (!run.token) return [];
  return draft.draftedInCell(run, run.token.faction, run.token.era);
}

/** { slot -> factionKey } of the cell each lineup general was drafted from. */
function draftedFactions(run) {
  const out = {};
  for (const p of run.picks) {
    const t = run.finalTokens[p.round - 1];
    out[p.slot] = p.faction || (t ? t.faction : run.content.byId[p.generalId].faction);
  }
  return out;
}

/** Picks drafted from a non-primary appearance (analytics `multiAppearancePicks`). */
function multiAppearancePicks(run) {
  const f = draftedFactions(run);
  return run.picks.filter((p) => f[p.slot] !== run.content.byId[p.generalId].faction).length;
}

/** Rebuild a run from released rounds and actions. Returns { run, ok }. */
function replayInto(opts, actions) {
  const run = draft.createRun(opts);
  for (const a of actions) {
    const r = draft.apply(run, a);
    if (!r.ok) return { run, ok: false, reason: r.reason };
  }
  return { run, ok: true };
}

module.exports = { SLOTS, weekdayOf, variantFor, appearancesOf, appearanceNote, sealOf, factionColor, cellMembers, poolTotal, draftedInCell, draftedFactions, multiAppearancePicks, replayInto };
