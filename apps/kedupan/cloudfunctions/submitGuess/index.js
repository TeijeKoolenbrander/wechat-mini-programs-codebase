'use strict';
// submitGuess: one guess per player per round (spec 11.2, AC 30-34). The guess, the on-time counter and the group tag
// commit in one transaction against the round as that transaction reads it. The 8th on-time guess then reveals
// through the single idempotent reveal path (one winner under concurrency, AC 32). A guess on an already revealed round
// is stored `late` and never changes mq.
const store = require('./common/store');
const { fail, now, rowHash } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');
const roundsDb = require('./common/rounds-db');
const groups = require('./common/groups');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.submitGuess(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const { roundId, pos, groupRef } = v.v;
  if (!(await roundsDb.loadRound(roundId))) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
  const useRef = groupRef && (await groups.isMember(openid, groupRef)) ? groupRef : null;
  const _ = store._();
  const gid = `${roundId}_${openid}`;

  let res = null;
  await store.db().runTransaction(async (t) => {
    res = null;
    const round = await store.getDocT(t, 'rounds', roundId);
    const existing = round ? await store.getDocT(t, 'guesses', gid) : null;
    if (!round) {
      res = { ok: false, code: 'ROUND_NOT_FOUND' };
      return;
    }
    const chk = core.R.guessCheck(round, { isHost: round.hostOpenid === openid, hasGuessed: !!existing, pos, nowMs: now() });
    if (!chk.ok) {
      res = chk;
      return;
    }
    // L4: a player who has already been served the answer of a revealed round cannot "guess" it any more
    if (round.status === 'revealed' && (await store.getDocT(t, 'reveal_views', gid))) {
      res = { ok: false, code: 'ROUND_EXPIRED' };
      return;
    }
    await store.collT(t, 'guesses').add({ data: { _id: gid, roundId, openid, pos, ts: now(), late: chk.late, groupRef: useRef } });
    const upd = {};
    const refs = core.R.appendGroupRef(round.groupRefs || [], useRef);
    if (refs !== (round.groupRefs || [])) upd.groupRefs = refs;
    if (!chk.late) upd.guessCount = _.inc(1);
    if (Object.keys(upd).length) await store.collT(t, 'rounds').doc(roundId).update({ data: upd });
    res = { ok: true, late: chk.late, guessCount: round.guessCount + (chk.late ? 0 : 1), status: round.status };
  });
  if (!res.ok) fail(res.code, res.code);

  let round = await store.getDoc('rounds', roundId);
  if (!res.late && core.R.revealsOnGuess(res.guessCount) && round.status !== 'revealed') {
    const x = await roundsDb.revealRound(round, 'count');
    if (x.round) round = x.round;
  }
  const out = { ok: true, late: res.late, guessCount: round.guessCount, revealed: round.status === 'revealed' };
  if (round.status === 'revealed') {
    const guesses = await roundsDb.guessesOf(roundId);
    out.reveal = core.SV.revealOf(round, { viewerOpenid: openid, guesses, hashFn: rowHash });
  }
  return out;
}, { rate: rateOf('submitGuess') });
