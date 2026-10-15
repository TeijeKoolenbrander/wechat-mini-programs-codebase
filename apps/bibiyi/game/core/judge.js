/**
 * Answer logic and 连对 scoring (spec 2, 5.5, 11.3). A run is a small state
 * machine over a deck. The client uses it for free play; the server uses
 * `replayRun` to validate a submitted free run, and `judge` for every
 * server-stepped daily answer.
 *
 * 连对 (streak) = correct answers before the first miss. The one-time life
 * (再答一次, free runs only) forgives that miss: the missed question does not
 * count and the run continues with the next question.
 */

const { BY_KEY } = require('./measures');

/** The correct button for a pair: 'hi' when the bottom value is greater than the top value. */
function correctChoice(a, b) {
  return b.value > a.value ? 'hi' : 'lo';
}

/** { correct, answer } for `choice` ('hi' | 'lo') on top fact a / bottom fact b. */
function judge(a, b, choice) {
  const answer = correctChoice(a, b);
  return { correct: choice === answer, answer };
}

/** The label of a button choice for a measure: 'hi' -> 更长. */
function choiceLabel(measureKey, choice) {
  const m = BY_KEY[measureKey];
  return choice === 'hi' ? m.hi : m.lo;
}

function createRun(deckLength) {
  return { length: deckLength, k: 1, streak: 0, status: 'open', endReason: null, missK: null, lifeUsed: false, lifeAtK: null, answers: [] };
}

/**
 * Apply one answer to the current question. Mutates `run`.
 * Returns { ok, correct, answer, ended, endReason } or { ok:false, code }.
 */
function applyAnswer(run, deck, byId, choice) {
  if (run.status !== 'open') return { ok: false, code: 'RUN_ENDED' };
  if (choice !== 'hi' && choice !== 'lo') return { ok: false, code: 'BAD_CHOICE' };
  const q = deck.questions[run.k - 1];
  const r = judge(byId[q.a], byId[q.b], choice);
  run.answers.push({ k: run.k, c: choice, ok: r.correct });
  if (r.correct) {
    run.streak++;
    if (run.k >= run.length) {
      run.status = 'ended';
      run.endReason = 'cleared';
    } else run.k++;
  } else {
    run.status = 'ended';
    run.endReason = 'miss';
    run.missK = run.k;
  }
  return { ok: true, correct: r.correct, answer: r.answer, ended: run.status === 'ended', endReason: run.endReason };
}

/** Is the 再答一次 offer valid right now? (free runs only; the caller checks the mode) */
function canUseLife(run) {
  return run.status === 'ended' && run.endReason === 'miss' && !run.lifeUsed;
}

/** Forgive the miss and continue. Returns false if not allowed. */
function useLife(run) {
  if (!canUseLife(run)) return false;
  run.lifeUsed = true;
  run.lifeAtK = run.missK;
  if (run.missK >= run.length) {
    run.endReason = 'cleared';
  } else {
    run.status = 'open';
    run.endReason = null;
    run.k = run.missK + 1;
  }
  return true;
}

/**
 * Server-side replay of a submitted free run (spec 11.3).
 * answers: [{k, c}] in order; lifeAtK: the k of the forgiven miss or null.
 * Returns { ok:true, streak, ended, endReason, lifeUsed, complete } or
 * { ok:false, code:'INVALID_ACTIONS', reason }.
 */
function replayRun(deck, byId, answers, lifeAtK) {
  const bad = (reason) => ({ ok: false, code: 'INVALID_ACTIONS', reason });
  if (!Array.isArray(answers) || !answers.length) return bad('no answers');
  if (answers.length > deck.length + 1) return bad('too many answers');
  if (lifeAtK !== undefined && lifeAtK !== null && !Number.isInteger(lifeAtK)) return bad('bad lifeAtK');
  const run = createRun(deck.length);
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (!a || a.k !== i + 1) return bad('non-sequential k at ' + (i + 1));
    if (run.status !== 'open') return bad('answer after the run ended at ' + a.k);
    const r = applyAnswer(run, deck, byId, a.c);
    if (!r.ok) return bad('bad choice at ' + a.k);
    if (run.status === 'ended' && run.endReason === 'miss' && lifeAtK === a.k && !run.lifeUsed) useLife(run);
  }
  if (lifeAtK !== undefined && lifeAtK !== null && run.lifeAtK !== lifeAtK) return bad('life not at a miss');
  return { ok: true, streak: run.streak, ended: run.status === 'ended', endReason: run.endReason, lifeUsed: run.lifeUsed, complete: run.status === 'ended', missK: run.missK };
}

module.exports = { correctChoice, judge, choiceLabel, createRun, applyAnswer, canUseLife, useLife, replayRun };
