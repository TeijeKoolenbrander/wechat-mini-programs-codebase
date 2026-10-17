'use strict';
// subscribeReveal: store one grant for the opt-in "接龙揭晓了" notice (spec 10.3, AC 100). Participants only; one doc per
// chain + player, so a repeat tap changes nothing and at most one message is ever sent per grant.
const chainLib = require('./core/chain');
const store = require('./common/store');
const appconfig = require('./common/appconfig');
const { bad } = require('./common/errors');
const { chainIdOf } = require('./common/input');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  await store.rateLimit(openid, 'sub', 1, 20);
  const c = await appconfig.get();
  if (!c.subscribe) bad('NO_TEMPLATE');
  const id = chainIdOf(event);
  const chain = id && (await store.getDoc('chains', id));
  if (!chain) bad('CHAIN_NOT_FOUND');
  if (!chainLib.isParticipant(chain, openid)) bad('NOT_PARTICIPANT');
  await store.addIfAbsent('sub_grants', { _id: chain._id + '_' + openid, chainId: chain._id, openid, tmplId: c.subscribe.tmplId, grantedAt: now(), used: false });
  return { ok: true };
});
