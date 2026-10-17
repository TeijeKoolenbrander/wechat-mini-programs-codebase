'use strict';
// Daily-set plumbing shared by getDaily, genDaily, submitCard, archive and board functions: creating a day's set
// (schedule or auto path), loading histograms, freezing references (定分). Decisions are the core's; this file only
// reads and writes documents.
const store = require('./store');
const { core, CONFIG, contentMod, content, schedule, launchKeyFromEnv, dateKeyAt } = require('./coreapi');
const { now, newSalt, addDaysKey } = require('./util');

const N = CONFIG.daily.cards;

/** LAUNCH_DATE_KEY env, else meta/launch, else the shipped schedule's launch date, else CONFIG (TD-30). */
async function launchKey() {
  const env = launchKeyFromEnv();
  if (env) return env;
  const m = await store.getDoc('meta', 'launch');
  if (m && /^\d{8}$/.test(m.dateKey)) return m.dateKey;
  const sch = schedule();
  return (sch && sch.launchDateKey) || CONFIG.daily.launchDateKey;
}

/**
 * Create the set for `dateKey`. Returns {set, created} or null when the day is before launch / cannot be built.
 * Order: stats docs (idempotent, zero), then the set (the commit point: a racing creator loses on the fixed _id and
 * re-reads), then item_usage and meta/launch (idempotent, best effort).
 */
async function createSet(dateKey) {
  const launch = await launchKey();
  if (dateKey < launch) return null;
  const c = content();
  const sch = schedule();
  let cards = sch ? core.SCH.cardsForDate(sch, c, dateKey) : null;
  let source = 'schedule';
  if (!cards) {
    source = 'auto';
    const prevIds = [];
    for (let i = 1; i <= core.SCH.SPECTRUM_GAP_DAYS; i++) prevIds.push(addDaysKey(dateKey, -i));
    const blocked = new Set();
    (await store.getMany('daily_sets', prevIds)).forEach((s) => s.cards.forEach((card) => blocked.add(card.spectrumId)));
    const used = new Set((await store.queryAll('item_usage', {}, { field: { _id: true } })).map((d) => d._id));
    if (sch) sch.days.forEach((d) => d.forEach((id) => used.add(id)));
    const ids = core.SCH.pickDay(c, { dateKey, usedItems: used, blockedSpectra: blocked, rng: core.RNG.sub(dateKey, 'auto') });
    if (!ids) return null;
    cards = ids.map((id) => contentMod.cardOf(c, id));
  }
  const set = core.SV.newDailySet({ dateKey, launchKey: launch, cards, source, contentVersion: c.contentVersion, boardSalt: newSalt(), nowMs: now() });
  for (const d of core.SV.newStatsDocs(dateKey)) await store.addIfAbsent('daily_card_stats', d);
  const created = await store.addIfAbsent('daily_sets', set);
  if (!created) return { set: await store.getDoc('daily_sets', dateKey), created: false };
  for (const card of cards) await store.addIfAbsent('item_usage', { _id: card.itemId, dateKey });
  await store.addIfAbsent('meta', { _id: 'launch', dateKey: launch });
  return { set, created: true };
}

/** The set of a day; today's is created lazily when genDaily missed it (spec 4.2). Other days: read only. */
async function ensureSet(dateKey) {
  const s = await store.getDoc('daily_sets', dateKey);
  if (s) return s;
  if (dateKey !== dateKeyAt(now())) return null;
  const r = await createSet(dateKey);
  return r ? r.set : null;
}

/** The five histograms (101 counts each) of a day; a missing stats doc is created zeroed. */
async function loadHists(dateKey) {
  const ids = [0, 1, 2, 3, 4].map((i) => `${dateKey}_${i}`);
  const docs = await store.getMany('daily_card_stats', ids);
  const out = [];
  for (const id of ids) {
    let d = docs.get(id);
    if (!d) {
      await store.addIfAbsent('daily_card_stats', { _id: id, hist: core.S.emptyHist(), n: 0 });
      d = (await store.getDoc('daily_card_stats', id)) || { hist: core.S.emptyHist() };
    }
    out.push(d.hist);
  }
  return out;
}

/** Freeze the references of a closed day on its set (lazy 定分, AC 25). Returns the set (with `final` when closed). */
async function ensureFinal(set, hists) {
  if (Array.isArray(set.final) || !core.W.dayClosed(set.dateKey, now())) return set;
  const f = core.SV.lazyFinal(set, hists || (await loadHists(set.dateKey)), now());
  if (!f) return set;
  let final = f;
  await store.db().runTransaction(async (t) => {
    const cur = await store.getDocT(t, 'daily_sets', set._id);
    if (cur && Array.isArray(cur.final)) {
      final = cur.final;
      return;
    }
    final = f;
    await store.collT(t, 'daily_sets').doc(set._id).update({ data: { final: f } });
  });
  return { ...set, final };
}

/** Latest published set strictly before `dateKey`, or null. */
async function prevPublished(dateKey) {
  const r = await store.coll('daily_sets').where({ _id: store._().lt(dateKey) }).orderBy('_id', 'desc').limit(1).get();
  return r.data[0] || null;
}

module.exports = { launchKey, createSet, ensureSet, loadHists, ensureFinal, prevPublished, N };
