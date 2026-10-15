'use strict';
// answer: the server-stepped daily-deck judge (spec 5.2, 11.3; PO-9). One question at a time.
//  - the server judges against ITS values; the client never holds a future question or an unrevealed value
//  - the FIRST answer to a question is final and idempotent (same or different choice returns the stored outcome)
//  - a wrong k is INVALID_ORDER (+ an observe-only `order` flag on ranked runs)
//  - ranked runs accept answers until D+1 00:30 BJT, then WINDOW_CLOSED and finalization at the current streak
//  - the end of a run is ONE transaction: run + daily_results + daily_stats.hist + player_stats
//  - there is NO continue/再答一次 path here: ads never touch a daily-deck run (PO-11)
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const runs = require('./common/runs');
const anomalies = require('./common/anomalies');
const challenges = require('./common/challenges');
const { fail, now, AppError, DECK_LEN } = require('./common/util');

async function resultOut(run) {
  const r = run.result || { n: run.streak, endReason: 'miss' };
  const out = { n: r.n, endReason: r.endReason, rarity: null, dayStreak: null, bestDaily: null };
  if (run.ranked) {
    out.rarity = await runs.rarityFor(run.dateKey, r.n);
    out.dayStreak = r.dayStreak === undefined ? null : r.dayStreak;
    out.bestDaily = r.bestDaily === undefined ? null : r.bestDaily;
  }
  if (run.challengeId) {
    const ch = await store.getDoc('challenges', run.challengeId);
    if (ch) out.compare = { ownerStreak: ch.ownerStreak, myStreak: r.n };
  }
  return out;
}

/** the response for question `ans.k`, rebuilt from stored state (first answer and every repeat look the same) */
async function outcome(run, deck, ans) {
  const ended = !ans.ok || ans.k === DECK_LEN;
  const out = {
    ok: true, k: ans.k, correct: ans.ok, choice: ans.c, reveal: await runs.revealPayload(deck, ans.k),
    streak: run.answers.filter((a) => a.k <= ans.k && a.ok).length, ended,
  };
  if (ended) out.result = await resultOut(run);
  else if (run.status === 'open' && run.k === ans.k + 1) out.next = await runs.questionPayload(deck, run.k);
  return out;
}

exports.main = store.handler(async (event, { openid }) => {
  const clientRunId = input.clientRunId(event.clientRunId);
  const k = input.k40(event.k);
  const choice = input.choice(event.choice);
  const ms = input.ms(event.ms);
  const nowMs = now();

  const run0 = await runs.findRun(openid, clientRunId, nowMs);
  if (!run0) fail('NOT_STARTED', 'no such run: call startRun first');
  const deck = await daily.getDeck(run0.dateKey);
  if (!deck) fail('DECK_NOT_FOUND', 'deck missing');

  // repeats are idempotent, even after the run ended or the window closed
  const prior = run0.answers.find((a) => a.k === k);
  if (prior) return outcome(run0, deck, prior);

  if (run0.status === 'ended') {
    if (run0.endReason === 'window') fail('WINDOW_CLOSED', 'window closed', { result: await resultOut(run0) });
    fail('INVALID_ORDER', 'run already ended');
  }
  if (runs.windowClosed(run0, nowMs)) {
    await runs.finalizeRun(run0._id, 'window', nowMs);
    const fin = await store.getDoc('run_progress', run0._id);
    fail('WINDOW_CLOSED', 'window closed', { result: await resultOut(fin) });
  }
  if (k !== run0.k) {
    if (run0.ranked) await anomalies.record(openid, run0.clientRunId, 'order', run0.dateKey, { k, expected: run0.k });
    fail('INVALID_ORDER', 'not the current question', { expectedK: run0.k });
  }

  // judge on the server, against the server's values
  const { a, b } = await runs.pairOf(deck, k);
  const correct = choice === core.correctChoice(a, b);
  const ended = !correct || k === DECK_LEN;
  const endReason = !correct ? 'miss' : 'cleared';
  if (ended && run0.ranked) await runs.ensureStats(run0.dateKey);
  const prevPub = ended && run0.ranked ? await runs.prevPublished(run0.dateKey) : null;

  let updated = null;
  let stored = null;
  await store.db().runTransaction(async (t) => {
    updated = null;
    stored = null;
    const cur = await store.getDocT(t, 'run_progress', run0._id);
    if (!cur) throw new AppError('RUN_NOT_FOUND', 'no such run');
    const again = cur.answers.find((x) => x.k === k);
    if (again) { stored = { run: cur, ans: again }; return; } // a concurrent tap won: first answer is final
    if (cur.status !== 'open') throw new AppError('INVALID_ORDER', 'run already ended');
    if (cur.k !== k) throw new AppError('INVALID_ORDER', 'not the current question', { expectedK: cur.k });
    const ans = { k, c: choice, ok: correct, ms, at: nowMs };
    const next = {
      ...cur, answers: [...cur.answers, ans], streak: cur.streak + (correct ? 1 : 0), k: ended ? k : k + 1, lastAt: nowMs,
    };
    await t.collection('run_progress').doc(cur._id).update({
      data: { answers: next.answers, streak: next.streak, k: next.k, lastAt: nowMs },
    });
    if (ended) {
      next.result = await runs.applyEnd(t, next, { endReason, endedAt: nowMs, prevPub });
      next.status = 'ended';
      next.endReason = endReason;
    }
    updated = { run: next, ans };
  });
  if (stored) return outcome(stored.run, deck, stored.ans);

  const { run, ans } = updated;
  // observe-only side effects: they can never change the response
  if (run.ranked) for (const kind of anomalies.flagsForAnswers(run.answers)) await anomalies.record(openid, run.clientRunId, kind, run.dateKey, { k });
  if (ended && run.challengeId) await challenges.recordAnswer(run.challengeId, run.streak);
  return outcome(run, deck, ans);
});
