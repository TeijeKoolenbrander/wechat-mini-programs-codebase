'use strict';
// giveUp: end the play and reveal the answer (spec 4.6, 14.2). Needs at least one step. Idempotent.
// A ranked give-up resets the streak and counts in daily_stats.gaveUp (inside plays.mutate / recordDailyStats).
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const answers = require('./common/answers');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const puzzleId = input.puzzleId(event.puzzleId);
  const nowMs = now();
  const puzzle = await puzzles.load(puzzleId, nowMs);
  const meta = await answers.getMeta(puzzle.answerRef);

  const result = await plays.mutate(openid, puzzle, nowMs, async ({ play, created }) => {
    if (created || play.steps < 1) fail('NOT_STARTED', 'make at least one guess first');
    if (play.status === 'gaveup') return { dirty: false, data: {} };
    if (play.status === 'solved') fail('FINISHED', 'puzzle already solved');
    return { data: {}, finish: 'gaveup' };
  });
  await plays.recordDailyStats(result);
  return { ok: true, answer: meta.word, steps: result.play.steps, best: result.play.best };
});
