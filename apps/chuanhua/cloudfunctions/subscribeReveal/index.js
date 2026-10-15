'use strict';
// subscribeReveal (spec 10.3, AC 100): stores ONE grant for the caller on a chain they took part in.
// Only with a configured one-time template; never re-asked by the server; at most one message per grant.
const store = require('./common/store');
const cfgLib = require('./common/config');
const input = require('./common/input');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const chainId = input.chainId(event.chainId);
  const cfg = await cfgLib.getConfig();
  if (!cfg.subscribe) fail('NO_TEMPLATE', 'subscribe template not configured');
  const chain = await store.getDoc('chains', chainId);
  if (!chain || chain.state === 'removed' || chain.state === 'abandoned') fail('CHAIN_NOT_FOUND', 'chain not found');
  if (!chain.involved.includes(openid)) fail('NOT_PARTICIPANT', 'participants only');
  if (['revealed', 'expired'].includes(chain.state)) fail('CHAIN_CLOSED', 'nothing left to wait for');
  await store.addIfAbsent('sub_grants', {
    _id: `${chainId}_${openid}`, chainId, openid, tmplId: cfg.subscribe.tmplId, grantedAt: now(), used: false,
  });
  return { ok: true };
});
