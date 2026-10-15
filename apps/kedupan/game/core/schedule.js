/**
 * Daily schedule builder and checker (spec 4.2, PD-29). Pure CommonJS, deterministic:
 * used offline by tools/build-schedule.js to produce core/content/schedule.v1.js and by the
 * server's auto path (genDaily when the schedule has run out).
 *
 * Rules of one day (checked by checkSchedule and by CI):
 *   1. 5 different categories and 5 different spectra
 *   2. card 1 is an `easy` item
 *   3. at least 1 `split` item
 *   4. no item ever repeats; a spectrum does not repeat within 21 days (positions i and j with |i-j| < 21)
 *   5. season-tagged items fall in their season; festival-tagged items fall within 3 days before the festival
 */

const { sub, int, shuffle } = require('./rng');
const { addDays } = require('./date');
const { FESTIVALS, seasonOf, FESTIVAL_LEAD_DAYS } = require('./content/calendar.v1.js');

const SPECTRUM_GAP_DAYS = 21;

/** Days from `dateKey` to the festival's date in the same or next year, or null. */
function daysToFestival(dateKey, key) {
  const dates = FESTIVALS[key];
  if (!dates) return null;
  let best = null;
  for (let i = 0; i < dates.length; i++) {
    const d = dayNumber(dates[i]) - dayNumber(dateKey);
    if (d >= 0 && (best === null || d < best)) best = d;
  }
  return best;
}

function dayNumber(key) {
  return Math.round(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)) / 86400e3);
}

/** Can this item be scheduled on this date (season and festival tags)? */
function itemAllowedOn(item, dateKey) {
  for (let i = 0; i < item.tags.length; i++) {
    const t = item.tags[i];
    if (t.indexOf('season:') === 0 && t.slice(7) !== seasonOf(dateKey)) return false;
    if (t.indexOf('festival:') === 0) {
      const d = daysToFestival(dateKey, t.slice(9));
      if (d === null || d > FESTIVAL_LEAD_DAYS) return false;
    }
  }
  return true;
}

const isEasy = (it) => it.tags.indexOf('easy') >= 0;
const isSplit = (it) => it.tags.indexOf('split') >= 0;
const hasFestival = (it) => it.tags.some((t) => t.indexOf('festival:') === 0);

/**
 * Pick the 5 item ids of one day. ctx = { dateKey, used: Set(itemId), recentSpectra: Set(spectrumId) (the last 20 days),
 * remaining: {cat: count of unused items} (optional weights) }. Returns ids[5] (card 1 first) or null.
 */
function pickDay(content, ctx, rng) {
  const { dateKey, used, recentSpectra } = ctx;
  // eligible items by spectrum
  const bySpectrum = {};
  const catWeight = {};
  for (let i = 0; i < content.spectra.length; i++) {
    const s = content.spectra[i];
    if (recentSpectra.has(s.id)) continue;
    const elig = [];
    for (let k = 0; k < s.items.length; k++) {
      const it = content.itemById[s.items[k].id];
      if (!used.has(it.id) && itemAllowedOn(it, dateKey)) elig.push(it);
    }
    if (elig.length) {
      bySpectrum[s.id] = elig;
      catWeight[s.cat] = (catWeight[s.cat] || 0) + elig.length;
    }
  }
  const cats = Object.keys(catWeight);
  if (cats.length < 5) return null;

  for (let attempt = 0; attempt < 60; attempt++) {
    // 1. choose 5 categories, weighted by unused supply squared (drains big categories first, keeps small ones alive)
    const pool = cats.slice();
    const chosen = [];
    while (chosen.length < 5) {
      let total = 0;
      for (let i = 0; i < pool.length; i++) total += catWeight[pool[i]] * catWeight[pool[i]];
      let r = rng() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= catWeight[pool[i]] * catWeight[pool[i]];
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      chosen.push(pool.splice(idx, 1)[0]);
    }
    // 2. a festival item in season takes priority for one slot (if one is eligible and its category was chosen or not)
    const slots = chosen.map((c) => ({ cat: c, item: null }));
    const take = (slot, filter) => {
      const specIds = Object.keys(bySpectrum).filter((id) => content.spectrumById[id].cat === slot.cat && !slots.some((o) => o.item && o.item.spectrumId === id));
      const cand = [];
      for (let i = 0; i < specIds.length; i++) {
        const arr = bySpectrum[specIds[i]];
        for (let k = 0; k < arr.length; k++) if (!filter || filter(arr[k])) cand.push(arr[k]);
      }
      if (!cand.length) return false;
      slot.item = cand[int(rng, cand.length)];
      return true;
    };
    // festival items are offered first
    let ok = true;
    const festivalItems = [];
    Object.keys(bySpectrum).forEach((id) => bySpectrum[id].forEach((it) => hasFestival(it) && festivalItems.push(it)));
    if (festivalItems.length && rng() < 0.7) {
      const f = festivalItems[int(rng, festivalItems.length)];
      let slot = slots.find((s) => s.cat === f.cat);
      if (!slot) {
        slot = slots[int(rng, slots.length)];
        slot.cat = f.cat; // replaces a chosen category, so the five stay distinct
      }
      slot.item = f;
    }
    // easy for the first slot without an item, split for another
    const free = slots.filter((s) => !s.item);
    shuffle(rng, free);
    const haveEasy = slots.some((s) => s.item && isEasy(s.item));
    const haveSplit = slots.some((s) => s.item && isSplit(s.item));
    let fi = 0;
    if (!haveEasy && free[fi]) ok = take(free[fi++], isEasy) && ok;
    if (!haveSplit && free[fi]) ok = take(free[fi++], isSplit) && ok;
    for (; fi < free.length; fi++) ok = take(free[fi]) && ok;
    if (!ok) continue;
    // distinct spectra (festival slot may collide)
    const sp = new Set(slots.map((s) => s.item.spectrumId));
    const ct = new Set(slots.map((s) => s.cat));
    if (sp.size !== 5 || ct.size !== 5) continue;
    if (!slots.some((s) => isSplit(s.item))) continue;
    const easy = slots.filter((s) => isEasy(s.item));
    if (!easy.length) continue;
    // card 1: an easy one (prefer a festival-free easy item); the rest in random order
    const first = easy[int(rng, easy.length)];
    const rest = shuffle(rng, slots.filter((s) => s !== first));
    return [first].concat(rest).map((s) => s.item.id);
  }
  return null;
}

/**
 * Build the whole schedule. opts: { launchDateKey, days (default 365), seed (default 'kedupan-v1') }.
 * Returns { scheduleVersion, contentVersion, launchDateKey, days: [[id x5], ...] }  (issue N = days[N-1]).
 * Throws when a day cannot be filled.
 */
function buildSchedule(content, opts) {
  const o = opts || {};
  const launch = o.launchDateKey;
  const days = o.days || 365;
  const seed = o.seed || 'kedupan-v1';
  const used = new Set();
  const out = [];
  const history = []; // spectrum ids per day
  for (let i = 0; i < days; i++) {
    const dateKey = addDays(launch, i);
    const recent = new Set();
    for (let k = Math.max(0, i - (SPECTRUM_GAP_DAYS - 1)); k < i; k++) history[k].forEach((id) => recent.add(id));
    const ids = pickDay(content, { dateKey, used, recentSpectra: recent }, sub(seed, 'day:' + i));
    if (!ids) throw new Error('schedule: cannot fill day ' + (i + 1) + ' (' + dateKey + ')');
    ids.forEach((id) => used.add(id));
    history.push(ids.map((id) => content.itemById[id].spectrumId));
    out.push(ids);
  }
  return { scheduleVersion: 1, contentVersion: content.contentVersion, launchDateKey: launch, days: out };
}

/**
 * Server auto path (spec 4.2): 5 unused items by the same rules with a deterministic seed.
 * `used` = Set of item ids already published (item_usage), `recentSpectra` = Set of spectrum ids of the last 20 days.
 * seedName = sub(dateKey, 'auto'). Returns ids[5] or null.
 */
function pickAutoDaily(content, dateKey, used, recentSpectra) {
  return pickDay(content, { dateKey, used, recentSpectra }, sub(dateKey, 'auto'));
}

/** Check a schedule against all rules. Returns an array of human-readable violations ([] = ok). */
function checkSchedule(content, schedule, minDays) {
  const bad = [];
  const need = minDays === undefined ? 365 : minDays;
  if (schedule.days.length < need) bad.push('only ' + schedule.days.length + ' days, need ' + need);
  const seen = new Map();
  const lastSpec = new Map();
  schedule.days.forEach((ids, i) => {
    const dk = addDays(schedule.launchDateKey, i);
    const label = 'issue ' + (i + 1) + ' ' + dk;
    if (ids.length !== 5) return bad.push(label + ': not 5 cards');
    const items = ids.map((id) => content.itemById[id]);
    if (items.some((it) => !it)) return bad.push(label + ': unknown item id');
    if (new Set(items.map((it) => it.cat)).size !== 5) bad.push(label + ': categories not distinct');
    if (new Set(items.map((it) => it.spectrumId)).size !== 5) bad.push(label + ': spectra not distinct');
    if (!isEasy(items[0])) bad.push(label + ': card 1 is not easy');
    if (!items.some(isSplit)) bad.push(label + ': no split item');
    items.forEach((it) => {
      if (seen.has(it.id)) bad.push(label + ': item ' + it.id + ' repeats issue ' + seen.get(it.id));
      seen.set(it.id, i + 1);
      if (!itemAllowedOn(it, dk)) bad.push(label + ': item ' + it.id + ' (' + it.tags.join(',') + ') is out of season/festival window');
      if (lastSpec.has(it.spectrumId) && i - lastSpec.get(it.spectrumId) < SPECTRUM_GAP_DAYS) bad.push(label + ': spectrum ' + it.spectrumId + ' repeats within ' + SPECTRUM_GAP_DAYS + ' days');
      lastSpec.set(it.spectrumId, i);
    });
  });
  return bad;
}

module.exports = { buildSchedule, pickDay, pickAutoDaily, checkSchedule, itemAllowedOn, SPECTRUM_GAP_DAYS };
