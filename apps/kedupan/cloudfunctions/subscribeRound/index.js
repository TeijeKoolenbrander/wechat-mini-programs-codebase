'use strict';
// subscribeRound: store one opt-in grant for the reveal message (spec 7.4, TD-13). Only the host or a guesser may
// subscribe; a round that is no longer open has nothing left to notify.
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');
const roundsDb = require('./common/rounds-db');
const groups = require('./common/groups');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.subscribeRound(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const feat = core.AD.buildFeatures(await groups.appConfig());
  if (!feat.subscribe) fail('NO_TEMPLATE', 'NO_TEMPLATE');
  const round = await roundsDb.loadRound(v.v.roundId);
  if (!round || round.status === 'draft') fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
  const guessed = round.hostOpenid === openid ? true : !!(await store.getDoc('guesses', `${round._id}_${openid}`));
  if (!guessed) fail('FORBIDDEN', 'FORBIDDEN');
  if (round.status !== 'open') return { ok: true, granted: false };
  await store.addIfAbsent('sub_grants', { _id: `${round._id}_${openid}`, roundId: round._id, openid, tmplId: feat.subscribe.tmplId, grantedAt: now(), used: false });
  return { ok: true, granted: true };
}, { rate: rateOf('subscribeRound') });
