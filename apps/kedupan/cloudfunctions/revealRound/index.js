'use strict';
// revealRound: the host reveals (spec 11.2, AC 32, 33). core/rounds hostRevealCheck decides; the flip itself is the
// shared idempotent reveal (rounds-db), so a host tap racing the 8th guess or the sweep yields one reveal and one
// message per subscribe grant (AC 63).
const store = require('./common/store');
const { fail, rowHash } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');
const roundsDb = require('./common/rounds-db');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.revealRound(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const round = await roundsDb.loadRound(v.v.roundId);
  if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
  const chk = core.R.hostRevealCheck(round, { isHost: round.hostOpenid === openid });
  if (!chk.ok) fail(chk.code, chk.code);
  let next = round;
  let guesses;
  if (chk.already) {
    guesses = await roundsDb.guessesOf(round._id);
  } else {
    const x = await roundsDb.revealRound(round, 'host');
    next = x.round || round;
    guesses = x.guesses;
  }
  return { ok: true, reveal: core.SV.revealOf(next, { viewerOpenid: openid, guesses, hashFn: rowHash }) };
}, { rate: rateOf('revealRound') });
