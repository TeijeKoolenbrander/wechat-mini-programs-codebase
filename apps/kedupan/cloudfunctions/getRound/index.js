'use strict';
// getRound: role- and state-dependent view (spec 8.4, AC 26, AC 30).
//   guesser, open     {left,right,clue,guessCount,myGuess?}        never the target, never others' guesses
//   host, open        the same + target
//   revealed          + target, mq, salt, selfHash, bestH, rows (hashed; no names, no openids)
// A draft is invisible to everyone but its host. An open round older than 24 h is revealed first (lazy rule).
const store = require('./common/store');
const input = require('./common/input');
const rounds = require('./common/rounds');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const roundId = input.roundId(event.roundId);
  input.optGroupRef(event.groupRef); // validated, not needed for the view
  const nowMs = now();
  let r = await rounds.loadRound(roundId, openid, nowMs);
  r = await rounds.lazyReveal(r, nowMs);

  const isHost = r.hostOpenid === openid;
  const out = {
    ok: true, roundId, status: r.status, isHost, left: r.left, right: r.right, clueMode: r.clueMode,
    clueText: r.clueText || null, guessCount: r.guessCount, createdAt: r.createdAt,
  };
  const mine = await store.getDoc('guesses', `${roundId}_${openid}`);
  if (mine) out.myGuess = { pos: mine.pos, late: !!mine.late };

  if (r.status === 'revealed') {
    Object.assign(out, await rounds.revealPayload(r, openid));
  } else if (isHost && r.status !== 'noGuesses') {
    out.target = r.target; // host only, and only while the round is not revealed (afterwards everyone sees it)
  }
  return out;
});
