'use strict';
// submitGuess (spec 11.2, PD-8, AC 31, AC 32). One guess per user per round; the host cannot guess.
// The guess, the on-time counter and the 8th-guess reveal are serialised by a transaction on the round
// document, so concurrent 8th guesses produce exactly one reveal and the 9th becomes `late`.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const groups = require('./common/groups');
const rounds = require('./common/rounds');
const { AppError, fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const roundId = input.roundId(event.roundId);
  const pos = input.pos(event.pos);
  const groupRef = input.optGroupRef(event.groupRef);
  const nowMs = now();
  await store.rateLimit(openid, 'guess', 1, 30);

  let r = await rounds.loadRound(roundId, openid, nowMs);
  if (r.status === 'draft') fail('ROUND_NOT_FOUND', 'no such round'); // the host's own draft: nobody guesses yet
  if (r.hostOpenid === openid) fail('OWN_ROUND', 'the host cannot guess');
  if (nowMs > r.createdAt + rounds.GUESS_WINDOW_MS) fail('ROUND_EXPIRED', 'guesses closed after 7 days');
  r = await rounds.lazyReveal(r, nowMs); // a 24 h old open round is revealed BEFORE this guess lands
  if (r.status === 'noGuesses') fail('ROUND_EXPIRED', 'the round ended without guesses');

  // only a groupRef the caller really belongs to is recorded (<= 10 per round)
  const validGroup = groupRef && (await groups.isMember(openid, groupRef)) ? groupRef : null;

  const gid = `${roundId}_${openid}`;
  let res;
  try {
    res = await store.db().runTransaction(async (t) => {
      const cur = await store.getDocT(t, 'rounds', roundId);
      if (!cur) throw new AppError('ROUND_NOT_FOUND', 'no such round');
      if (cur.status === 'noGuesses') throw new AppError('ROUND_EXPIRED', 'the round ended without guesses');
      if (await store.getDocT(t, 'guesses', gid)) throw new AppError('ALREADY_GUESSED', 'already guessed');
      const late = cur.status !== 'open';
      const guess = { _id: gid, roundId, openid, pos, ts: nowMs, late };
      if (validGroup) guess.groupRef = validGroup;
      await t.collection('guesses').add({ data: guess });
      const upd = {};
      let guessCount = cur.guessCount;
      let revealedHere = false;
      if (!late) {
        guessCount += 1;
        upd.guessCount = guessCount;
        if (guessCount >= rounds.AUTO_REVEAL_AT) {
          // the 8th on-time guess reveals in the SAME transaction: exactly one reveal, the 9th is late
          Object.assign(upd, { status: 'revealed', revealedAt: nowMs, revealBy: 'count' });
          revealedHere = true;
        }
      }
      if (validGroup && !(cur.groupRefs || []).includes(validGroup) && (cur.groupRefs || []).length < core.cfg().groupRefsCap) {
        upd.groupRefs = [...(cur.groupRefs || []), validGroup];
      }
      if (Object.keys(upd).length) await t.collection('rounds').doc(roundId).update({ data: upd });
      return { late, guessCount, revealedHere, round: { ...cur, ...upd } };
    });
  } catch (e) {
    if (!(e instanceof AppError) && store.isDup(e)) fail('ALREADY_GUESSED', 'already guessed');
    throw e;
  }

  let reveal = null;
  if (res.revealedHere) {
    await rounds.finishReveal(res.round);
    await rounds.notifyRound(res.round, { budgetMs: 2000 });
  }
  const fresh = await store.getDoc('rounds', roundId);
  if (fresh && fresh.status === 'revealed') reveal = await rounds.revealPayload(fresh, openid);
  return { ok: true, late: res.late, guessCount: res.guessCount, ...(reveal ? { reveal } : {}) };
});
