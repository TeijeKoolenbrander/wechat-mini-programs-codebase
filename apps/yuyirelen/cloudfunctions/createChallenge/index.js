'use strict';
// createChallenge: a shareable, spoiler-free record of the caller's finished play (spec 9.1, 14.2).
// One per owner per puzzle: the id is a keyed hash, so repeat calls return the same id and the id reveals nothing.
// Stores step count, hint count and the per-step temperature series only: never a word.
const store = require('./common/store');
const input = require('./common/input');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const { fail, now, hmacHex, base32From } = require('./common/util');

function pepper() {
  const p = process.env.GROUP_REF_PEPPER;
  if (!p) fail('SERVER_CONFIG', 'GROUP_REF_PEPPER not configured');
  return p;
}

exports.main = store.handler(async (event, { openid }) => {
  const puzzleId = input.puzzleId(event.puzzleId);
  const nowMs = now();
  await puzzles.load(puzzleId, nowMs);
  const play = await store.getDoc('plays', plays.playId(puzzleId, openid));
  if (!play || !plays.isFinished(play)) fail('NOT_FINISHED', 'finish the puzzle first');

  const challengeId = base32From(hmacHex(pepper(), `${puzzleId}|${openid}`));
  await store.addIfAbsent('challenges', {
    _id: challengeId,
    ownerOpenid: openid,
    puzzleId,
    status: play.status,
    steps: play.steps,
    hints: play.hintsUsed.length + (play.adHints || 0),
    temps: play.guesses.map((g) => g.t),
    createdAt: nowMs,
    finishers: 0,
    bestSteps: null,
  });
  return { ok: true, challengeId };
});
