'use strict';
// Daily sets, national references (live and final), windows, streak. Spec sections 3.3, 4.2, 5, 11.4.
const core = require('./coreapi');
const store = require('./store');
const {
  AppError, fail, addDaysKey, daysBetween, randomHex, now, isDayClosed, bjtDayStartMs, GRACE_MS, CARDS,
} = require('./util');

const emptyHist = () => new Array(101).fill(0);

// ---------- launch date / issue number ----------
async function launchKey(dateKey) {
  const env = process.env.LAUNCH_DATE_KEY;
  if (/^\d{8}$/.test(env || '')) return env;
  let m = await store.getDoc('meta', 'launch');
  if (!m) {
    await store.addIfAbsent('meta', { _id: 'launch', dateKey });
    m = await store.getDoc('meta', 'launch');
  }
  return m.dateKey;
}
async function issueNoFor(dateKey) {
  const launch = await launchKey(dateKey);
  return Math.max(1, daysBetween(launch, dateKey) + 1);
}

// ---------- card shapes ----------
function cardFromItem(it) {
  return { itemId: it.id, spectrumId: it.spectrumId, left: it.left, right: it.right, prompt: it.text, anchor: it.anchor, cat: it.cat };
}
/** what clients may see: never the anchor */
function publicCard(c, idx) {
  return { idx, itemId: c.itemId, spectrumId: c.spectrumId, left: c.left, right: c.right, prompt: c.prompt, catLabel: core.catLabel(c.cat) };
}

// ---------- daily_sets: idempotent create ----------
async function ensureStats(dateKey) {
  for (let i = 0; i < CARDS; i++) {
    await store.addIfAbsent('daily_card_stats', { _id: `${dateKey}_${i}`, dateKey, idx: i, hist: emptyHist(), n: 0 });
  }
}

/**
 * Create daily_sets/<dateKey> once. `add` with the fixed _id is the uniqueness mechanism, so a double-fired
 * genDaily and a racing lazy getDaily produce exactly one document. Returns {doc, created}.
 */
async function ensureDaily(dateKey) {
  const existing = await store.getDoc('daily_sets', dateKey);
  if (existing) return { doc: existing, created: false };

  const issueNo = await issueNoFor(dateKey);
  let items = core.scheduleCards(issueNo);
  let source = 'schedule';
  if (!items) {
    const used = new Set((await store.queryAll('item_usage', {}, { field: { _id: true } })).map((d) => d._id));
    const _ = store._();
    const recent = (await store.db().collection('daily_sets').where({ _id: _.lt(dateKey) }).orderBy('_id', 'desc').limit(20).get()).data;
    const recentSpectra = new Set(recent.flatMap((s) => s.cards.map((c) => c.spectrumId)));
    items = core.autoCards(dateKey, used, recentSpectra);
    source = 'auto';
    console.error(`[ALERT] ${core.hasSchedule() ? 'schedule exhausted' : 'no shipped schedule'} at issue ${issueNo} (${dateKey}); ${items ? 'auto path used' : 'auto path FAILED'}`);
  }
  if (!items) throw new AppError('DAILY_UNAVAILABLE', 'no daily set could be created');

  const doc = {
    _id: dateKey, issueNo, contentVersion: core.CONTENT_VERSION(), cards: items.map(cardFromItem),
    boardSalt: randomHex(16), edits: [], source, createdAt: now(),
  };
  const created = await store.addIfAbsent('daily_sets', doc);
  if (!created) return { doc: await store.getDoc('daily_sets', dateKey), created: false };
  await ensureStats(dateKey);
  for (const it of items) await store.addIfAbsent('item_usage', { _id: it.id, dateKey });
  return { doc, created: true };
}

// ---------- national references ----------
async function statsDocs(dateKey) {
  const docs = await Promise.all(Array.from({ length: CARDS }, (_, i) => store.getDoc('daily_card_stats', `${dateKey}_${i}`)));
  return docs.map((d, i) => d || { _id: `${dateKey}_${i}`, hist: emptyHist(), n: 0 });
}
/** live R_c for every card from the current histograms (+ prior) */
function liveRefs(set, stats) {
  return set.cards.map((c, i) => core.refFromHist(stats[i].hist, c.anchor));
}

/**
 * Final references (定分). Null while the day is still open (before D+1 00:30 BJT).
 * After that: the frozen set.final, or computed from the histograms and stored once (lazy path).
 */
async function ensureFinal(set, nowMs) {
  if (Array.isArray(set.final) && set.final.length === CARDS) return set.final;
  if (!isDayClosed(set._id, nowMs)) return null;
  const stats = await statsDocs(set._id);
  const final = liveRefs(set, stats);
  const stored = await store.db().runTransaction(async (t) => {
    const cur = await store.getDocT(t, 'daily_sets', set._id);
    if (cur && Array.isArray(cur.final) && cur.final.length === CARDS) return cur.final;
    await t.collection('daily_sets').doc(set._id).update({ data: { final, frozenAt: now() } });
    return final;
  });
  set.final = stored;
  return stored;
}
/** references to use for a day right now: final if frozen/closed, otherwise live. {refs, final:boolean, stats} */
async function currentRefs(set, nowMs, stats) {
  const fin = await ensureFinal(set, nowMs);
  const st = stats || (await statsDocs(set._id));
  return { refs: fin || liveRefs(set, st), final: !!fin, stats: st };
}

// ---------- scoring a player's entry ----------
/** per-card scores for answered cards (null otherwise) and the sum so far */
function scoreEntry(pos, refs) {
  const cardScores = pos.map((p, i) => (p == null ? null : core.cardScore(Math.abs(p - refs[i]))));
  const total = cardScores.reduce((a, s) => a + (s || 0), 0);
  return { cardScores, total };
}

// ---------- windows ----------
/** 'open' (today), 'grace' (yesterday before D+1 00:30), 'late', 'future' */
function windowState(dateKey, nowMs) {
  const today = core.dateKeyAt(nowMs);
  if (dateKey === today) return 'open';
  if (dateKey > today) return 'future';
  if (dateKey === addDaysKey(today, -1) && nowMs < bjtDayStartMs(today) + GRACE_MS) return 'grace';
  return 'late';
}

// ---------- streak (PD-17, 11.4) ----------
/** latest published day before dateKey */
async function prevPublishedKey(dateKey) {
  const _ = store._();
  const r = await store.db().collection('daily_sets').where({ _id: _.lt(dateKey) }).orderBy('_id', 'desc').limit(1).field({ _id: true }).get();
  return r.data[0] ? r.data[0]._id : null;
}
/** the streak to show at `today` (does not count today unless completed) */
async function currentStreak(openid, today) {
  const ps = await store.getDoc('player_stats', openid);
  if (!ps) return { current: 0, best: 0 };
  let current = 0;
  if (ps.lastCompleteDate === today) current = ps.curStreak;
  else if (ps.lastCompleteDate && ps.lastCompleteDate === (await prevPublishedKey(today))) current = ps.curStreak;
  return { current, best: ps.bestStreak || 0 };
}
/**
 * The streak update, applied inside the transaction that completes a daily. `prev` was read before the
 * transaction (published days never change). Returns the entry's streak and writes player_stats.
 */
async function applyStreak(t, openid, dateKey, prev) {
  const ps = await store.getDocT(t, 'player_stats', openid);
  let cur;
  let last = dateKey;
  if (ps && ps.lastCompleteDate && ps.lastCompleteDate > dateKey) {
    // a grace-window completion of an older day after a newer day was already completed: counts as a day, keeps the streak
    cur = ps.curStreak;
    last = ps.lastCompleteDate;
    await t.collection('player_stats').doc(openid).set({
      data: { ...ps, totalDays: (ps.totalDays || 0) + 1, updatedAt: now() },
    });
    return 1;
  }
  cur = ps && prev && ps.lastCompleteDate === prev ? ps.curStreak + 1 : 1;
  const best = Math.max(ps ? ps.bestStreak || 0 : 0, cur);
  await t.collection('player_stats').doc(openid).set({
    data: { curStreak: cur, bestStreak: best, lastCompleteDate: last, totalDays: (ps ? ps.totalDays || 0 : 0) + 1, flags7d: ps ? ps.flags7d || 0 : 0, updatedAt: now() },
  });
  return cur;
}

// ---------- entries ----------
const entryId = (dateKey, openid) => `${dateKey}_${openid}`;
const firstUnanswered = (entry) => {
  if (!entry) return 0;
  const i = entry.pos.findIndex((p) => p == null);
  return i < 0 ? CARDS : i;
};

module.exports = {
  emptyHist, launchKey, issueNoFor, cardFromItem, publicCard, ensureDaily, ensureStats, statsDocs, liveRefs,
  ensureFinal, currentRefs, scoreEntry, windowState, prevPublishedKey, currentStreak, applyStreak, entryId, firstUnanswered,
};
