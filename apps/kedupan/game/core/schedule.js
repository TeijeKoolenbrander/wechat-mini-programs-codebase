/**
 * Daily selection (spec 4.2, 5, PD-29, AC 9, 12, 23). Pure JS.
 *
 *  - `pickDay`        one day's 5 items under the PD-29 rules (used by tools/build-schedule.js and by the server's auto path)
 *  - `buildSchedule`  the offline schedule (>= 365 days)
 *  - `validateSchedule` the CI check of AC 9
 *  - `cardsForDate`   schedule lookup by Beijing date key
 *
 * Schedule module format (`core/content/schedule.v1.js`, produced by tools/build-schedule.js; SERVER-ONLY, TD-62):
 *   module.exports = { scheduleVersion, contentVersion, launchDateKey: 'YYYYMMDD', days: [[itemId x5], ...] }
 *   days[0] is issue 1 (launchDateKey).
 */

const { addDays, daysBetween } = require('./date');
const { sub, shuffle, int } = require('./rng');
const { cardOf, itemTags, isMissingModule } = require('./content');

const MIN_DAYS = 365;
const SPECTRUM_GAP_DAYS = 21; // a spectrum may reappear only >= 21 days later (TD-4)
const FESTIVAL_LEAD_DAYS = 3; // festival-tagged items fall on the festival day or up to 3 days before (TD-4)

/**
 * Festival dates by Beijing date key. Only secular festivals (spec 4.5 rule 4 bans religious ones).
 * VERIFIED 2026-10-15 against authoritative sources:
 *  - 2026: 国务院办公厅 "关于2026年部分节假日安排的通知" (2025-11-04, news.cn): 春节 2/17 (holiday 2/15-23), 端午 6/19,
 *    中秋 9/25, 国庆 10/1.
 *  - 2026-2028: Hong Kong Observatory Gregorian-lunar tables (公曆與農曆日期對照表):
 *    https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2026c.txt (also T2027c.txt, T2028c.txt).
 *    Lunar month starts (初一) read from the tables: 2026 正月 2/17, 五月 6/15, 七月 8/13, 八月 9/11;
 *    2027 正月 2/6, 五月 6/5, 七月 8/2, 八月 9/1; 2028 正月 1/26, 五月 5/24 (闰五月 6/23 comes after), 七月 8/20, 八月 9/19.
 *    Then 元宵 = 正月十五 (+14 days), 端午 = 五月初五 (+4), 七夕 = 七月初七 (+6), 中秋 = 八月十五 (+14).
 *  - 元旦 1/1 and 国庆 10/1 are fixed dates. The 2027/2028 State Council notices are not published yet; re-check
 *    them when they appear (usually November of the previous year). Result: the earlier from-memory dates were all
 *    correct; 2026 春节/元宵 were added.
 * Verify again before extending past 2028.
 */
const FESTIVALS = {
  newyear: { label: '元旦', dates: ['20260101', '20270101', '20280101'] },
  spring: { label: '春节', dates: ['20260217', '20270206', '20280126'] },
  lantern: { label: '元宵', dates: ['20260303', '20270220', '20280209'] },
  dragonboat: { label: '端午', dates: ['20260619', '20270609', '20280528'] },
  qixi: { label: '七夕', dates: ['20260819', '20270808', '20280826'] },
  midautumn: { label: '中秋', dates: ['20260925', '20270915', '20281003'] },
  national: { label: '国庆', dates: ['20261001', '20271001', '20281001'] },
};

function seasonOf(dateKey) {
  const m = +dateKey.slice(4, 6);
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** Is `dateKey` the festival day or within FESTIVAL_LEAD_DAYS before it? */
function inFestivalWindow(dateKey, festivalKey) {
  const f = FESTIVALS[festivalKey];
  if (!f) return false;
  return f.dates.some((d) => {
    const diff = daysBetween(dateKey, d);
    return diff >= 0 && diff <= FESTIVAL_LEAD_DAYS;
  });
}

/** Tag check for placing an item on a date: {ok, reason}. */
function tagsAllowOn(tags, dateKey) {
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    if (t.indexOf('season:') === 0 && t.slice(7) !== seasonOf(dateKey)) return { ok: false, reason: t + ' not in ' + seasonOf(dateKey) };
    if (t.indexOf('festival:') === 0) {
      const k = t.slice(9);
      if (!FESTIVALS[k]) return { ok: false, reason: 'unknown festival ' + k };
      if (!inFestivalWindow(dateKey, k)) return { ok: false, reason: t + ' outside its window on ' + dateKey };
    }
  }
  return { ok: true, reason: null };
}

function hasTag(tags, t) {
  return tags.indexOf(t) >= 0;
}
function festivalTagOf(tags) {
  for (let i = 0; i < tags.length; i++) if (tags[i].indexOf('festival:') === 0) return tags[i].slice(9);
  return null;
}

/**
 * Pick one day's 5 item ids (PD-29): 5 different categories and spectra, card 1 `easy`, >= 1 `split`, only unused
 * items, spectra not in `blockedSpectra`, tags valid on the date; a festival-tagged item in its window is preferred.
 * Deterministic for (content, dateKey, seedName | rng, used, blocked). Returns itemId[5] or null.
 * The server's auto path passes rng = sub(dateKey, 'auto') (spec 4.2).
 * @param {{dateKey:string, usedItems:Set<string>|{has:Function}, blockedSpectra:Set<string>, seedName?:string}} o
 */
function pickDay(content, o) {
  const rng = o.rng || sub(o.seedName || 'kedupan-pick', o.dateKey);
  const used = o.usedItems;
  const blocked = o.blockedSpectra || new Set();
  const elig = [];
  for (let i = 0; i < content.itemIds.length; i++) {
    const id = content.itemIds[i];
    if (used.has(id)) continue;
    const e = content.itemIndex[id];
    if (blocked.has(e.spectrum.id)) continue;
    const tags = e.item.tags || [];
    if (!tagsAllowOn(tags, o.dateKey).ok) continue;
    elig.push({ id, spec: e.spectrum.id, cat: e.spectrum.cat, tags });
  }
  const easy = elig.filter((x) => hasTag(x.tags, 'easy'));
  const split = elig.filter((x) => hasTag(x.tags, 'split'));
  const fest = elig.filter((x) => festivalTagOf(x.tags) !== null && inFestivalWindow(o.dateKey, festivalTagOf(x.tags)));
  if (!easy.length || !split.length) return null;

  for (let attempt = 0; attempt < 60; attempt++) {
    const chosen = [];
    const cats = new Set();
    const specs = new Set();
    const take = (x) => {
      if (!x || cats.has(x.cat) || specs.has(x.spec)) return false;
      chosen.push(x);
      cats.add(x.cat);
      specs.add(x.spec);
      return true;
    };
    // card 1: easy; prefer a festival item among the easy ones when it exists
    const fe = fest.filter((x) => hasTag(x.tags, 'easy'));
    take(fe.length && attempt < 30 ? fe[int(rng, fe.length)] : easy[int(rng, easy.length)]);
    // a festival item (any kind) in its window, once per day
    if (!chosen.some((x) => festivalTagOf(x.tags))) {
      const f2 = fest.filter((x) => !cats.has(x.cat) && !specs.has(x.spec));
      if (f2.length && attempt < 30) take(f2[int(rng, f2.length)]);
    }
    // a divisive card
    if (!chosen.some((x) => hasTag(x.tags, 'split'))) {
      const s2 = split.filter((x) => !cats.has(x.cat) && !specs.has(x.spec));
      if (!s2.length) continue;
      take(s2[int(rng, s2.length)]);
    }
    // fillers: festival-tagged items would be out of window on other days, so they are never fillers outside theirs (elig already filters)
    let guard = 0;
    while (chosen.length < 5 && guard++ < 200) {
      const pool = elig.filter((x) => !cats.has(x.cat) && !specs.has(x.spec));
      if (!pool.length) break;
      take(pool[int(rng, pool.length)]);
    }
    if (chosen.length < 5) continue;
    const first = chosen[0];
    const rest = shuffle(rng, chosen.slice(1));
    return [first.id].concat(rest.map((x) => x.id));
  }
  return null;
}

/**
 * Build the schedule: `days` days from `launchKey`, no item ever repeated, no spectrum within 21 days.
 * @returns {{ok:true, schedule:object}|{ok:false, error:string, dayIndex:number}}
 */
function buildSchedule(content, o) {
  const launchKey = o.launchKey;
  const gap = o.gapDays || SPECTRUM_GAP_DAYS;
  const days = o.days || MIN_DAYS;
  const used = new Set();
  const out = [];
  const lastSeen = new Map(); // spectrumId -> day index
  for (let i = 0; i < days; i++) {
    const dateKey = addDays(launchKey, i);
    const blocked = new Set();
    lastSeen.forEach((idx, sid) => {
      if (i - idx < gap) blocked.add(sid);
    });
    const ids = pickDay(content, { dateKey, usedItems: used, blockedSpectra: blocked, seedName: o.seedName || 'kedupan-schedule-v1' });
    if (!ids) return { ok: false, error: 'cannot satisfy PD-29 rules on ' + dateKey + ' (issue ' + (i + 1) + ')', dayIndex: i };
    ids.forEach((id) => {
      used.add(id);
      lastSeen.set(content.itemIndex[id].spectrum.id, i);
    });
    out.push(ids);
  }
  return { ok: true, schedule: { scheduleVersion: 1, contentVersion: content.contentVersion, launchDateKey: launchKey, days: out } };
}

/** The AC 9 checks. Returns a list of problems (empty = valid). */
function validateSchedule(schedule, content, opts) {
  const errs = [];
  const minDays = (opts && opts.minDays) || MIN_DAYS;
  const gap = (opts && opts.gapDays) || SPECTRUM_GAP_DAYS;
  if (!schedule || !Array.isArray(schedule.days)) return ['schedule.days missing'];
  if (schedule.contentVersion !== content.contentVersion) errs.push('contentVersion mismatch');
  if (!/^\d{8}$/.test(schedule.launchDateKey || '')) errs.push('launchDateKey missing');
  if (schedule.days.length < minDays) errs.push('only ' + schedule.days.length + ' days, need ' + minDays);
  const seenItems = new Map();
  const lastSpec = new Map();
  schedule.days.forEach((ids, i) => {
    const dateKey = /^\d{8}$/.test(schedule.launchDateKey || '') ? addDays(schedule.launchDateKey, i) : null;
    const tag = 'issue ' + (i + 1);
    if (!Array.isArray(ids) || ids.length !== 5) return errs.push(tag + ': needs 5 item ids');
    const cats = new Set();
    const specs = new Set();
    let split = 0;
    ids.forEach((id, c) => {
      const e = content.itemIndex[id];
      if (!e) return errs.push(tag + ': unknown item ' + id);
      if (seenItems.has(id)) errs.push(tag + ': item ' + id + ' repeats (first on issue ' + seenItems.get(id) + ')');
      seenItems.set(id, i + 1);
      if (cats.has(e.spectrum.cat)) errs.push(tag + ': category ' + e.spectrum.cat + ' twice');
      if (specs.has(e.spectrum.id)) errs.push(tag + ': spectrum ' + e.spectrum.id + ' twice');
      cats.add(e.spectrum.cat);
      specs.add(e.spectrum.id);
      const tags = itemTags(content, id);
      if (c === 0 && !hasTag(tags, 'easy')) errs.push(tag + ': card 1 (' + id + ') is not tagged easy');
      if (hasTag(tags, 'split')) split++;
      if (dateKey) {
        const ok = tagsAllowOn(tags, dateKey);
        if (!ok.ok) errs.push(tag + ': ' + id + ' ' + ok.reason);
      }
    });
    if (split < 1) errs.push(tag + ': no split item');
    specs.forEach((sid) => {
      if (lastSpec.has(sid) && i - lastSpec.get(sid) < gap) errs.push(tag + ': spectrum ' + sid + ' repeats within ' + gap + ' days');
      lastSpec.set(sid, i);
    });
  });
  return errs;
}

/**
 * The schedule module, or null when it is absent. It is SERVER-ONLY (TD-62): the client package ignores it
 * (packOptions.ignore), so on a device this is always null. A missing module is detected the Node way
 * (MODULE_NOT_FOUND) and the WeChat way ("module ... is not defined").
 */
function getSchedule() {
  try {
    return require('./content/schedule.v1');
  } catch (e) {
    if (isMissingModule(e)) return null;
    throw e;
  }
}

/** Item ids for a Beijing date key from the schedule, or null (before launch / past the end). */
function idsForDate(schedule, dateKey) {
  if (!schedule) return null;
  const i = daysBetween(schedule.launchDateKey, dateKey);
  return i >= 0 && i < schedule.days.length ? schedule.days[i].slice() : null;
}

/** Server cards (with anchors) for a date from the schedule: card[] | null. */
function cardsForDate(schedule, content, dateKey) {
  const ids = idsForDate(schedule, dateKey);
  if (!ids) return null;
  const cards = ids.map((id) => cardOf(content, id));
  return cards.every(Boolean) ? cards : null;
}

/** Counts that bound how long a library can feed the schedule (the content writer's capacity check). */
function capacityReport(content) {
  const r = { items: content.itemIds.length, spectra: content.spectra.length, easy: 0, split: 0, easyAndSplit: 0, seasonal: 0, festival: 0 };
  content.itemIds.forEach((id) => {
    const t = itemTags(content, id);
    const e = hasTag(t, 'easy');
    const s = hasTag(t, 'split');
    if (e) r.easy++;
    if (s) r.split++;
    if (e && s) r.easyAndSplit++;
    if (t.some((x) => x.indexOf('season:') === 0)) r.seasonal++;
    if (t.some((x) => x.indexOf('festival:') === 0)) r.festival++;
  });
  return r;
}

module.exports = {
  MIN_DAYS,
  SPECTRUM_GAP_DAYS,
  FESTIVAL_LEAD_DAYS,
  FESTIVALS,
  seasonOf,
  inFestivalWindow,
  tagsAllowOn,
  pickDay,
  buildSchedule,
  validateSchedule,
  getSchedule,
  idsForDate,
  cardsForDate,
  capacityReport,
};
