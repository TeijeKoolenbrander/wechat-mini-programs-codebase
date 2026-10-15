'use strict';
// Server-stepped daily-deck runs (spec 5.2, 11.1-11.3): run ids, question/reveal payloads, finalization,
// day streaks, rarity. Used by getDaily, startRun, answer, getHistory, cleanup.
//
// TRUST RULES enforced here:
//  - questionPayload() NEVER contains the bottom card's value, raw number, note or source (core/question.js hiddenFace).
//  - nothing beyond the current question is ever returned; answered pairs are returned only for k < current.
//  - finalization is one transaction: run status + daily_results + daily_stats.hist + player_stats.
const core = require('./coreapi');
const store = require('./store');
const pool = require('./pool');
const daily = require('./daily');
const challenges = require('./challenges');
const { fail, addDaysKey, bjtDayStartMs, windowEndMs, AppError, DECK_LEN } = require('./util');

const rankedId = (dateKey, openid) => `${dateKey}_${openid}`;
const friendlyId = (openid, clientRunId) => `${openid}_${clientRunId}`;

// ---------------------------------------------------------------- cards and payloads
async function factOf(deck, factId) {
  const f = await pool.getDailyFact(deck.contentVersion, factId);
  if (!f) {
    console.error(`[ALERT] daily fact ${factId} (content v${deck.contentVersion}) missing from daily_facts`);
    fail('INTERNAL', 'daily content missing');
  }
  return f;
}
async function pairOf(deck, k) {
  const q = deck.questions[k - 1];
  if (!q) fail('INTERNAL', 'bad question index');
  return { a: await factOf(deck, q.a), b: await factOf(deck, q.b) };
}
/** a card whose value is public (an answered pair, history): the core's known face plus the note */
function fullCard(f) {
  const c = core.knownFace(f);
  if (f.note) c.note = f.note;
  return c;
}
/** the current question: top WITH its value and source, bottom WITHOUT any value (core/question.js builds both) */
async function questionPayload(deck, k) {
  const { a, b } = await pairOf(deck, k);
  const prev = k > 1 ? deck.questions[k - 2] : null;
  return core.questionOf(k, a, b, !prev || prev.b !== deck.questions[k - 1].a);
}
/** the reveal of question k's bottom card (only after k is answered) */
async function revealPayload(deck, k) {
  const { b } = await pairOf(deck, k);
  return core.revealOf(b);
}
/** answered pairs for k < current (resume and 本局题目) */
async function answeredPairs(deck, run) {
  const out = [];
  for (const a of run.answers) {
    const { a: top, b } = await pairOf(deck, a.k);
    out.push({ k: a.k, choice: a.c, correct: a.ok, top: fullCard(top), bottom: fullCard(b) });
  }
  return out;
}

// ---------------------------------------------------------------- run lookup
/** the caller's run by clientRunId: ranked today, else friendly, else ranked yesterday. Verifies ownership. */
async function findRun(openid, clientRunId, nowMs) {
  const today = core.dateKeyAt(nowMs);
  const ids = [rankedId(today, openid), friendlyId(openid, clientRunId), rankedId(addDaysKey(today, -1), openid)]; // ranked-today first: the hot path
  for (const id of ids) {
    const run = await store.getDoc('run_progress', id);
    if (run && run.openid === openid && run.clientRunId === clientRunId) return run;
  }
  return null;
}

// ---------------------------------------------------------------- day streaks and stats
function defaultStats(openid) {
  return {
    _id: openid, curDays: 0, bestDays: 0, lastDailyDate: null, totalDailies: 0, bestDaily: 0, bestFree: 0,
    flags7d: 0, suspect: false, updatedAt: 0,
  };
}
/** the most recent published deck date before dateKey (looks back up to 14 days), or null */
async function prevPublished(dateKey) {
  for (let d = 1; d <= 14; d++) {
    const key = addDaysKey(dateKey, -d);
    if (await daily.getDeck(key)) return key;
  }
  return null;
}
/**
 * Pure day-streak rule (AC 67). Published days only: consecutive published days +1, a missed published day
 * resets to 1, the same date twice never double-counts, an older date finalized late never lowers a newer one.
 */
function nextDayStreak(stats, dateKey, prevPub) {
  const last = stats.lastDailyDate;
  if (last === dateKey) return { curDays: stats.curDays, lastDailyDate: last, counted: false };
  if (last && last > dateKey) return { curDays: stats.curDays, lastDailyDate: last, counted: false };
  const curDays = prevPub && last === prevPub ? stats.curDays + 1 : 1;
  return { curDays, lastDailyDate: dateKey, counted: true };
}
/** the day streak to SHOW today: yesterday's streak stays visible until today's result exists */
async function shownDayStreak(stats, today) {
  if (!stats || !stats.lastDailyDate) return 0;
  if (stats.lastDailyDate === today) return stats.curDays;
  const prev = await prevPublished(today);
  return prev && stats.lastDailyDate === prev ? stats.curDays : 0;
}

async function ensureStats(dateKey) {
  await store.addIfAbsent('daily_stats', { _id: dateKey, hist: new Array(DECK_LEN + 1).fill(0), total: 0 });
}
/** "超过今日 X% 的玩家": only at >= 30 results that day (PO-30) */
async function rarityFor(dateKey, n) {
  const st = await store.getDoc('daily_stats', dateKey);
  if (!st || st.total < 30) return null;
  const below = st.hist.slice(0, n).reduce((a, b) => a + b, 0);
  return { pct: Math.round((below / st.total) * 1000) / 10, total: st.total };
}

// ---------------------------------------------------------------- finalization
/**
 * Ends `run` inside transaction `t` (caller has re-read `run` inside `t` and checked status === 'open').
 * Ranked runs also write the one daily_results doc (deterministic _id), the histogram and player_stats.
 */
async function applyEnd(t, run, { endReason, endedAt, prevPub }) {
  const n = run.streak;
  const result = { n, endReason };
  if (run.ranked) {
    const _ = store._();
    const endS = Math.max(0, Math.floor((endedAt - bjtDayStartMs(run.dateKey)) / 1000));
    const cur = await store.getDocT(t, 'player_stats', run.openid);
    const stats = { ...defaultStats(run.openid), ...(cur || {}) };
    const ds = nextDayStreak(stats, run.dateKey, prevPub);
    const upd = {
      curDays: ds.curDays, lastDailyDate: ds.lastDailyDate, bestDays: Math.max(stats.bestDays, ds.curDays),
      totalDailies: stats.totalDailies + 1, bestDaily: Math.max(stats.bestDaily, n), updatedAt: endedAt,
    };
    await t.collection('daily_results').add({
      data: {
        _id: rankedId(run.dateKey, run.openid), dateKey: run.dateKey, openid: run.openid, n, endS, dayStreak: ds.curDays,
        endReason, contentVersion: run.contentVersion, endedAt,
      },
    });
    await t.collection('daily_stats').doc(run.dateKey).update({ data: { total: _.inc(1), [`hist.${n}`]: _.inc(1) } });
    if (cur) await t.collection('player_stats').doc(run.openid).update({ data: upd });
    else await t.collection('player_stats').doc(run.openid).set({ data: { ...stats, ...upd } });
    result.dayStreak = ds.curDays;
    result.bestDaily = upd.bestDaily;
    result.bestDays = upd.bestDays;
  }
  await t.collection('run_progress').doc(run._id).update({ data: { status: 'ended', endReason, endedAt, result } });
  return result;
}

/** Ends an open run outside of `answer` (window close). Idempotent; returns the stored result. */
async function finalizeRun(runId, endReason, nowMs) {
  const run0 = await store.getDoc('run_progress', runId);
  if (!run0) return null;
  if (run0.status === 'ended') return run0.result;
  if (run0.ranked) await ensureStats(run0.dateKey);
  const prevPub = run0.ranked ? await prevPublished(run0.dateKey) : null;
  let result = null;
  let ended = null;
  await store.db().runTransaction(async (t) => {
    result = null;
    ended = null;
    const run = await store.getDocT(t, 'run_progress', runId);
    if (!run) return;
    if (run.status === 'ended') { result = run.result; return; }
    const endedAt = endReason === 'window' ? Math.min(nowMs, Math.max(run.lastAt || run.startedAt, run.startedAt)) : nowMs;
    result = await applyEnd(t, run, { endReason, endedAt, prevPub });
    ended = run;
  });
  // exactly one caller wins the transition, so a challenge answer is counted once
  if (ended && ended.challengeId) await challenges.recordAnswer(ended.challengeId, ended.streak);
  return result;
}

/** an open ranked run whose answer window (D+1 00:30 BJT) has closed */
function windowClosed(run, nowMs) {
  return !!run.ranked && nowMs > windowEndMs(run.dateKey);
}

/** Finalize every open ranked run of `openid` whose window closed; returns [{dateKey, n}] */
async function finalizeExpiredFor(openid, nowMs) {
  const r = await store.db().collection('run_progress').where({ openid, status: 'open', ranked: true }).limit(20).get();
  const out = [];
  for (const run of r.data) {
    if (!windowClosed(run, nowMs)) continue;
    const res = await finalizeRun(run._id, 'window', nowMs);
    if (res) out.push({ dateKey: run.dateKey, n: res.n });
  }
  return out;
}

module.exports = {
  rankedId, friendlyId, factOf, pairOf, fullCard, questionPayload, revealPayload, answeredPairs,
  findRun, defaultStats, prevPublished, nextDayStreak, shownDayStreak, ensureStats, rarityFor,
  applyEnd, finalizeRun, windowClosed, finalizeExpiredFor, AppError,
};
