'use strict';
// getChallenge: the challenge entry screen (spec 8.6, 8.7, 14.2).
// ownerWords (the sharer's route) are returned ONLY to a non-owner who has finished that puzzle (14.4 rule 1).
// Nothing here carries an openid.
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const challengeId = input.challengeId(event.challengeId);
  const nowMs = now();
  const ch = await store.getDoc('challenges', challengeId);
  if (!ch) fail('CHALLENGE_NOT_FOUND', 'unknown challenge');
  const puzzle = await puzzles.load(ch.puzzleId, nowMs).catch((e) => {
    if (e.code === 'PUZZLE_NOT_FOUND') fail('CHALLENGE_NOT_FOUND', 'unknown challenge');
    throw e;
  });

  const own = ch.ownerOpenid === openid;
  const mine = await store.getDoc('plays', plays.playId(ch.puzzleId, openid));
  const alreadyFinished = !!mine && plays.isFinished(mine);
  const out = {
    ok: true,
    puzzleId: ch.puzzleId,
    kind: puzzle.kind,
    issueNo: puzzle.issueNo || null,
    practiceNo: puzzle.practiceNo || null,
    owner: { status: ch.status, steps: ch.steps, hints: ch.hints, temps: ch.temps },
    own,
    countsAsToday: puzzle.kind === 'daily' && !mine,
    alreadyFinished,
  };
  if (own) out.ownStats = { finishers: ch.finishers || 0, bestSteps: ch.bestSteps == null ? null : ch.bestSteps };
  if (!own && alreadyFinished) {
    const theirs = await store.getDoc('plays', plays.playId(ch.puzzleId, ch.ownerOpenid));
    if (theirs) {
      const vocab = coreapi.vocab(puzzle.vocabVersion);
      out.ownerWords = theirs.guesses.filter((g) => g.w >= 0).map((g) => [vocab.words[g.w], g.r]);
    }
  }
  return out;
});
