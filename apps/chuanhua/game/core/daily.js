/**
 * 今日起点 (spec 4.1, PO-21): the same 3 prompts for everyone on a Beijing date. Pure; the server answers
 * `getHome` with this and the client can compute it offline.
 *
 *   dailyIds(dateKey[, launchKey]) -> 3 prompt ids
 *   daily(dateKey[, launchKey]) -> [{id, text}]
 *
 * A fixed shuffle of all non-retired ids (mulberry32(hash32("chuanhua-daily-v1"))) is walked 3 per day from
 * the launch date, wrapping after floor(active / 3) = 141 days, so no prompt repeats within 141 days.
 * Retiring a prompt changes the shuffle: bump `daily.seedName` in config when you do, never mid-run.
 */

const { CONFIG } = require('./config');
const { mulberry32, hash32, shuffle } = require('./rng');
const { daysBetween } = require('./date');
const { active, byId } = require('./prompts');

let ORDER = null;
function order() {
  if (!ORDER) {
    ORDER = shuffle(
      mulberry32(hash32(CONFIG.daily.seedName)),
      active().map((p) => p.id)
    );
  }
  return ORDER;
}

function dailyIds(dateKey, launchKey) {
  const o = order();
  const per = CONFIG.daily.perDay;
  const cycle = Math.floor(o.length / per);
  const day = daysBetween(launchKey || CONFIG.daily.launchDateKey, dateKey);
  const idx = ((day % cycle) + cycle) % cycle;
  return o.slice(idx * per, idx * per + per);
}

function daily(dateKey, launchKey) {
  return dailyIds(dateKey, launchKey).map((id) => ({ id, text: byId(id).text }));
}

module.exports = { dailyIds, daily };
