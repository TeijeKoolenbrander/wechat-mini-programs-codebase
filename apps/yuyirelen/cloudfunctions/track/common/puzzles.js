'use strict';
// Puzzle resolution and daily publishing (spec 4.1, 5.1-5.3, 14.1).
//   puzzleId  d<YYYYMMDD>  the daily of that Beijing date (published by genDaily, never a future date)
//             p<n>         practice puzzle n (answer_bank pool 'practice', practiceNo n)
// A past daily is an 'archive' puzzle: unranked, only its own window decides ranked-ness.
const coreapi = require('./coreapi');
const store = require('./store');
const rules = require('./rules');
const { AppError, fail, now, addDaysKey, daysBetween, isDateKey, randomHex } = require('./util');

const ID_RE = /^(?:d(\d{8})|p([1-9]\d{0,4}))$/;
const LOW_BANK = 30;
const dailyDocs = new Map(); // dateKey -> immutable daily_puzzles doc
const practiceDocs = new Map(); // practiceNo -> {answerRef, vocabVersion, configVersion}
const prevCache = new Map(); // dateKey -> previous published dateKey | null

function parseId(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) fail('PUZZLE_NOT_FOUND', 'unknown puzzle');
  if (m[1]) {
    if (!isDateKey(m[1])) fail('PUZZLE_NOT_FOUND', 'unknown puzzle');
    return { kind: 'daily', dateKey: m[1] };
  }
  return { kind: 'practice', practiceNo: Number(m[2]) };
}

/** warm-up words: deterministic per key from the reviewed starter list; never sees an answer (PO-22) */
function warmupsFor(key, vocab) {
  return coreapi.warmups(key, vocab, rules.LIMITS.warmups);
}

async function getDailyDoc(dateKey) {
  if (dailyDocs.has(dateKey)) return dailyDocs.get(dateKey);
  const doc = await store.getDoc('daily_puzzles', dateKey);
  if (doc) {
    if (dailyDocs.size > 64) dailyDocs.clear();
    dailyDocs.set(dateKey, doc);
  }
  return doc;
}

/** the latest published daily strictly before dateKey (streak and display logic), or null */
async function prevPublished(dateKey) {
  if (prevCache.has(dateKey)) return prevCache.get(dateKey);
  const _ = store._();
  const r = await store.db().collection('daily_puzzles').where({ _id: _.lt(dateKey) }).orderBy('_id', 'desc').limit(1).field({ _id: true }).get();
  const key = r.data[0] ? r.data[0]._id : null;
  if (prevCache.size > 64) prevCache.clear();
  prevCache.set(dateKey, key);
  return key;
}

/**
 * Resolve a puzzle id for a caller. Throws PUZZLE_NOT_FOUND for malformed, unpublished and future ids.
 * @returns {{puzzleId, kind:'daily'|'archive'|'practice', dateKey?, issueNo?, practiceNo?, answerRef, vocabVersion, configVersion, warmups}}
 */
async function load(puzzleId, nowMs) {
  const p = parseId(puzzleId);
  if (p.kind === 'daily') {
    const state = rules.windowState(p.dateKey, nowMs);
    if (state === 'future') fail('PUZZLE_NOT_FOUND', 'unknown puzzle');
    const doc = await getDailyDoc(p.dateKey);
    if (!doc) fail('PUZZLE_NOT_FOUND', 'unknown puzzle');
    return {
      puzzleId, kind: state === 'late' ? 'archive' : 'daily', dateKey: p.dateKey, issueNo: doc.issueNo,
      answerRef: doc.answerRef, vocabVersion: doc.vocabVersion, configVersion: doc.configVersion,
      warmups: doc.warmups, boardSalt: doc.boardSalt,
    };
  }
  let e = practiceDocs.get(p.practiceNo);
  if (!e) {
    const r = await store.db().collection('answer_bank').where({ pool: 'practice', practiceNo: p.practiceNo }).field({ vocabVersion: true, gateVersion: true }).limit(1).get();
    if (!r.data[0]) fail('PUZZLE_NOT_FOUND', 'unknown puzzle');
    e = { answerRef: r.data[0]._id, vocabVersion: r.data[0].vocabVersion, configVersion: coreapi.currentVersions().configVersion };
    if (practiceDocs.size > 1500) practiceDocs.clear();
    practiceDocs.set(p.practiceNo, e);
  }
  const vocab = coreapi.vocab(e.vocabVersion);
  return {
    puzzleId, kind: 'practice', practiceNo: p.practiceNo, answerRef: e.answerRef, vocabVersion: e.vocabVersion,
    configVersion: e.configVersion, warmups: warmupsFor('p' + p.practiceNo, vocab),
  };
}

// ---- launch date / issue numbers ----
async function launchKey(dateKey) {
  const env = process.env.LAUNCH_DATE_KEY;
  if (isDateKey(env)) return env;
  let m = await store.getDoc('meta', 'launch');
  if (!m) {
    await store.addIfAbsent('meta', { _id: 'launch', dateKey });
    m = await store.getDoc('meta', 'launch');
  }
  return m.dateKey;
}
async function issueNoFor(dateKey) {
  return Math.max(1, daysBetween(await launchKey(dateKey), dateKey) + 1);
}

// ---- daily publishing ----
function bankFilter(v) {
  return { pool: 'daily', used: false, vocabVersion: v.vocabVersion, gateVersion: v.gateVersion };
}
async function bankLeft(v) {
  return (await store.db().collection('answer_bank').where(bankFilter(v)).count()).total;
}
function zeroStats(dateKey) {
  return { _id: dateKey, solved: 0, gaveUp: 0, started: 0, stepsHist: new Array(rules.LIMITS.histMax + 1).fill(0) };
}

/**
 * Create daily_puzzles/<dateKey> once. `add` with the fixed _id is the uniqueness mechanism; the bank entry is
 * marked used in the SAME transaction, so a losing writer rolls back and consumes nothing (double fire, lazy race).
 */
async function commitDaily(doc, bankId) {
  try {
    await store.db().runTransaction(async (t) => {
      const b = await store.getDocT(t, 'answer_bank', bankId);
      if (!b || b.used) throw new AppError('BANK_USED', 'BANK_USED');
      await t.collection('daily_puzzles').add({ data: doc });
      await t.collection('daily_stats').add({ data: zeroStats(doc._id) });
      await t.collection('answer_bank').doc(bankId).update({ data: { used: true, usedFor: doc._id } });
    });
  } catch (e) {
    if (e && (e.code === 'BANK_USED' || /BANK_USED/.test(String(e.message)))) throw new AppError('BANK_USED', 'BANK_USED');
    if (store.isDup(e)) throw new AppError('EXISTS', 'EXISTS');
    throw e;
  }
}

/** @returns {{doc, created:boolean, bankLeft?:number}}; throws DAILY_UNAVAILABLE when the bank has nothing usable */
async function ensureDaily(dateKey) {
  const existing = await getDailyDoc(dateKey);
  if (existing) return { doc: existing, created: false };
  const v = coreapi.currentVersions();
  const vocab = coreapi.vocab(v.vocabVersion);
  const issueNo = await issueNoFor(dateKey);
  const res = await store.db().collection('answer_bank').where(bankFilter(v)).orderBy('seq', 'asc').limit(10).get();
  for (const entry of res.data) {
    if (entry.retired) continue;
    const doc = {
      _id: dateKey, issueNo, answerRef: entry._id, warmups: warmupsFor(dateKey, vocab), boardSalt: randomHex(16),
      vocabVersion: v.vocabVersion, configVersion: v.configVersion, createdAt: now(), source: 'bank',
    };
    try {
      await commitDaily(doc, entry._id);
    } catch (e) {
      if (e.code === 'EXISTS') return { doc: await getDailyDoc(dateKey), created: false };
      if (e.code === 'BANK_USED') continue;
      throw e;
    }
    dailyDocs.set(dateKey, doc);
    const left = await bankLeft(v);
    if (left < LOW_BANK) console.warn(`[daily] WARNING answer bank low: ${left} daily entries left (< ${LOW_BANK}); import a new batch`);
    return { doc, created: true, bankLeft: left };
  }
  console.error(`[ALERT] no daily puzzle for ${dateKey}: the answer bank has no usable daily entry (vocabVersion ${v.vocabVersion}, gateVersion ${v.gateVersion}). Import answers NOW.`);
  await store.writeEvent('server', 'daily_gen', { dateKey, bankLeft: 0, failed: true });
  throw new AppError('DAILY_UNAVAILABLE', 'no daily puzzle available');
}

function resetCaches() {
  dailyDocs.clear();
  practiceDocs.clear();
  prevCache.clear();
}

module.exports = {
  parseId, load, warmupsFor, prevPublished, ensureDaily, issueNoFor, bankLeft, LOW_BANK, resetCaches, addDaysKey,
};
