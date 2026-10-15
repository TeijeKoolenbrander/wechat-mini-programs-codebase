'use strict';
// subscribeChallenge: stores the opt-in grant after the client's own requestSubscribeMessage `accept`
// (spec 8.13, 14.2). Owner only. The template id comes from server config (app_config, else env
// SUBSCRIBE_TEMPLATE_ID), never from the client. One grant per challenge (add of the fixed _id).
const store = require('./common/store');
const input = require('./common/input');
const appconfig = require('./common/appconfig');
const { now, fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const id = input.challengeId(event.challengeId);
  await store.rateLimit(openid, 'subscribe', 1, 20);
  const ch = await store.getDoc('challenges', id);
  if (!ch || now() > ch.expiresAt) fail('CHALLENGE_EXPIRED', 'challenge expired or missing');
  if (ch.ownerOpenid !== openid) fail('NOT_OWNER', 'only the challenge owner can subscribe');
  const { tmplId } = await appconfig.subscribeConfig();
  if (!tmplId) fail('NO_TEMPLATE', 'subscribe message is not configured');
  await store.addIfAbsent('sub_grants', {
    _id: id, ownerOpenid: openid, tmplId, grantedAt: now(), used: false,
  });
  return { ok: true, granted: true };
});
