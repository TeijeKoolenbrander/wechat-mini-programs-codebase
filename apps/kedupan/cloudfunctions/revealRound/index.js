'use strict';
// revealRound: host only, needs >= 2 on-time guesses (TOO_FEW_GUESSES), idempotent (a revealed round just
// returns its reveal again). Side effects (mq, subscribe messages) run once, in the call that flips the status.
const store = require('./common/store');
const input = require('./common/input');
const rounds = require('./common/rounds');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const roundId = input.roundId(event.roundId);
  const nowMs = now();
  let r = await rounds.loadRound(roundId, openid, nowMs);
  if (r.hostOpenid !== openid) fail('NOT_HOST', 'only the host can reveal');
  if (r.status === 'draft') fail('INVALID_INPUT', 'set a clue first');
  r = await rounds.lazyReveal(r, nowMs);
  if (r.status === 'open') {
    const f = await rounds.flipReveal(roundId, 'host', nowMs);
    if (f.flipped) await rounds.notifyRound(f.round, { budgetMs: 2000 });
    r = await store.getDoc('rounds', roundId);
  }
  if (r.status === 'noGuesses') return { ok: true, reveal: { status: 'noGuesses' } };
  return { ok: true, reveal: await rounds.revealPayload(r, openid) };
});
