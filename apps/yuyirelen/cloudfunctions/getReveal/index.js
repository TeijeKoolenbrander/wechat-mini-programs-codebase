'use strict';
// getReveal: the answer, the 100 nearest words and day stats, ONLY to a caller who finished this puzzle
// (spec 14.2, 14.4). A caller who has not finished gets REVEAL_LOCKED and no data.
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const answers = require('./common/answers');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const rules = require('./common/rules');
const { fail, now } = require('./common/util');

const topCache = new Map(); // answerRef -> [[word, rank, isSyn] x 100]; derived from immutable data

exports.main = store.handler(async (event, { openid }) => {
  const puzzleId = input.puzzleId(event.puzzleId);
  const nowMs = now();
  const puzzle = await puzzles.load(puzzleId, nowMs);
  const play = await store.getDoc('plays', plays.playId(puzzleId, openid));
  if (!play || !plays.isFinished(play)) fail('REVEAL_LOCKED', 'finish the puzzle first');

  const vocab = coreapi.vocab(puzzle.vocabVersion);
  const meta = await answers.getMeta(puzzle.answerRef);
  const out = { ok: true, answer: meta.word, outcome: play.status, steps: play.steps, best: play.best };

  if (meta.retired) {
    // PO-27: a retired answer's neighbour list is hidden ("列表维护中"); play and scoring are unaffected
    out.top = null;
    out.topHidden = true;
  } else {
    let top = topCache.get(puzzle.answerRef);
    if (!top) {
      const entry = await answers.load(puzzle.answerRef, vocab.V);
      top = answers.topList(entry, vocab, rules.LIMITS.revealTop);
      if (topCache.size > 64) topCache.clear();
      topCache.set(puzzle.answerRef, top);
    }
    out.top = top;
  }
  const syn = (meta.synonyms || []).map((i) => vocab.words[i]).filter(Boolean);
  if (syn.length) out.synonyms = syn;

  if (puzzle.dateKey) {
    const stats = await store.getDoc('daily_stats', puzzle.dateKey);
    if (stats && Array.isArray(stats.stepsHist) && stats.solved >= rules.LIMITS.statsMinFinishers) {
      out.stats = {
        finishers: stats.solved,
        medianSteps: rules.medianFromHist(stats.stepsHist),
        pctBetter: play.status === 'solved' ? rules.pctBetter(stats.stepsHist, play.steps) : null,
      };
    }
  }
  return out;
});
