'use strict';
// guess: check one guess against the secret answer, entirely server-side (spec 14.2, PO-8).
// The client sends a word string, a client guess id and an input-source tag. It receives a rank, a temperature,
// the step count and (on a solve) the answer. It never receives the rank list, answerRef or the bank.
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const answers = require('./common/answers');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const rules = require('./common/rules');
const { fail, now } = require('./common/util');

function respond({ row, stepNo, play, vocab, dup, entry }) {
  const solved = play.status === 'solved' && row.sv !== undefined;
  const out = {
    ok: true,
    word: vocab.words[row.w],
    r: row.r,
    t: row.t,
    band: rules.bandOf(row.r),
    steps: dup ? play.steps : stepNo,
    best: play.best,
    dup: !!dup,
    solved,
    ranked: play.ranked,
  };
  if (solved) {
    out.solvedBy = row.sv;
    out.answer = entry.meta.word; // only here: the caller's own solving guess
  } else {
    out.near = plays.chipsFor(vocab, coreapi, row.w, play);
  }
  return out;
}

exports.main = store.handler(async (event, { openid }) => {
  const puzzleId = input.puzzleId(event.puzzleId);
  const text = input.wordText(event.word);
  const cg = input.clientGuessId(event.clientGuessId);
  const src = input.guessSource(event.src);
  const nowMs = now();

  const puzzle = await puzzles.load(puzzleId, nowMs);
  const vocab = coreapi.vocab(puzzle.vocabVersion);
  const idx = rules.lookupWord(vocab, text); // NOT_IN_VOCAB: nothing is written, nothing logs the text
  const entry = await answers.load(puzzle.answerRef, vocab.V);
  const r = entry.ranks[idx];
  const temp = rules.tempOf(r, vocab.V);
  const syn = answers.synonymSet(entry.meta);
  const solvedBy = r === 1 ? 'answer' : syn.has(idx) ? 'synonym' : null;

  let result;
  try {
    result = await plays.mutate(openid, puzzle, nowMs, async ({ t, play }) => {
      // 1. idempotent on clientGuessId: the same call again returns the same result, no new step
      const prior = play.guesses.findIndex((g) => g.cg === cg);
      if (prior >= 0) return { dirty: false, data: { row: play.guesses[prior], stepNo: prior + 1, dup: false } };
      if (play.status !== 'playing') fail('FINISHED', 'puzzle already finished');
      // 2. a duplicate word returns the existing row and adds no step
      const dupRow = play.guesses.find((g) => g.w === idx);
      if (dupRow) return { dirty: false, data: { row: dupRow, stepNo: play.steps, dup: true } };
      // 3. limits
      if (play.steps >= rules.LIMITS.guessesPerPuzzle) fail('GUESS_LIMIT', 'guess limit reached');
      await plays.rateLimitT(t, openid, nowMs);

      // 4. accept: one step
      const prevSteps = play.steps;
      const row = { w: idx, r, t: temp, src, cg, ts: nowMs };
      if (solvedBy) row.sv = solvedBy;
      play.guesses.push(row);
      play.steps = play.guesses.length;
      play.best = play.best == null ? r : Math.min(play.best, r);
      const data = { row, stepNo: play.steps, dup: false, hintUnlocked: rules.newlyUnlocked(prevSteps, play.steps, play.hintsUsed) };
      return solvedBy ? { data, finish: 'solved' } : { data };
    });
  } catch (e) {
    if (e && e.code === 'RATE_LIMITED') await plays.flag(openid, puzzleId, 'burst');
    else if (e && e.code === 'GUESS_LIMIT') await plays.flag(openid, puzzleId, 'limit');
    throw e;
  }

  await plays.recordDailyStats(result);
  const { play, data } = result;
  const out = respond({ row: data.row, stepNo: data.stepNo, play, vocab, dup: data.dup, entry });
  if (data.hintUnlocked) out.hintUnlocked = data.hintUnlocked;

  if (result.finish === 'solved' && play.ranked && play.dateKey && play.steps <= 3 && play.hintsUsed.length === 0) {
    await plays.flag(openid, puzzleId, 'fast_solve', { steps: play.steps });
  }
  if (!data.dup && play.guesses.filter((g) => g.ts >= nowMs - 120e3).length >= 100) await plays.flag(openid, puzzleId, 'scripted');
  return out;
});
