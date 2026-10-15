'use strict';
// getChallenge: the challenge entry screen (spec 8.6, 8.7, 14.2).
// ownerWords (the sharer's route) are returned ONLY to a non-owner who has finished that puzzle (14.4 rule 1).
// Nothing here carries an openid. `own` is {finishers, bestSteps} for the owner and null for everyone else.
// A non-owner who has finished the puzzle is counted once per challenge (challenge_takers/<id>_<openid>), which feeds
// the owner's "friends who finished it" numbers.
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const { fail, now } = require('./common/util');

/** idempotent: the deterministic taker doc makes a second call fail with a duplicate and roll back */
async function countTaker(ch, openid, mine, nowMs) {
  try {
    await store.db().runTransaction(async (t) => {
      const cur = await store.getDocT(t, 'challenges', ch._id);
      if (!cur) return;
      await t.collection('challenge_takers').add({ data: { _id: `${ch._id}_${openid}`, challengeId: ch._id, createdAt: nowMs } });
      const data = { finishers: (cur.finishers || 0) + 1 };
      if (mine.status === 'solved' && (cur.bestSteps == null || mine.steps < cur.bestSteps)) data.bestSteps = mine.steps;
      await t.collection('challenges').doc(ch._id).update({ data });
    });
  } catch (e) {
    if (!store.isDup(e)) console.warn('countTaker failed', store.errText(e));
  }
}

exports.main = store.handler(async (event, { openid }) => {
  const challengeId = input.challengeId(event.challengeId);
  const nowMs = now();
  const ch = await store.getDoc('challenges', challengeId);
  if (!ch) fail('CHALLENGE_NOT_FOUND', 'unknown challenge');
  const puzzle = await puzzles.load(ch.puzzleId, nowMs).catch((e) => {
    if (e.code === 'PUZZLE_NOT_FOUND') fail('CHALLENGE_NOT_FOUND', 'unknown challenge');
    throw e;
  });

  const isOwner = ch.ownerOpenid === openid;
  const mine = await store.getDoc('plays', plays.playId(ch.puzzleId, openid));
  const alreadyFinished = !!mine && plays.isFinished(mine);
  const out = {
    ok: true,
    puzzleId: ch.puzzleId,
    kind: puzzle.kind,
    issueNo: puzzle.issueNo || null,
    practiceNo: puzzle.practiceNo || null,
    owner: { status: ch.status, steps: ch.steps, hints: ch.hints, temps: ch.temps },
    own: isOwner ? { finishers: ch.finishers || 0, bestSteps: ch.bestSteps == null ? null : ch.bestSteps } : null,
    countsAsToday: puzzle.kind === 'daily' && !mine,
    alreadyFinished,
  };
  if (!isOwner && alreadyFinished) {
    await countTaker(ch, openid, mine, nowMs);
    const theirs = await store.getDoc('plays', plays.playId(ch.puzzleId, ch.ownerOpenid));
    if (theirs) {
      const vocab = coreapi.vocab(puzzle.vocabVersion);
      out.ownerWords = theirs.guesses.filter((g) => g.w >= 0).map((g) => vocab.words[g.w]);
    }
  }
  return out;
});
