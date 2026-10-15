'use strict';
// subscribeChallenge: records the owner's one-time subscribe grant for "好友接受了你的挑战" (spec 6.18, 11.2).
// Owner only. The send itself happens when the first other player finishes the challenge (common/challenges.js).
const store = require('./common/store');
const input = require('./common/input');
const features = require('./common/features');
const { now, fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const id = input.challengeId(event.challengeId);
  const ch = await store.getDoc('challenges', id);
  if (!ch || now() > ch.expiresAt) fail('CHALLENGE_EXPIRED', 'challenge expired or missing');
  if (ch.ownerOpenid !== openid) fail('NOT_OWNER', 'only the owner can subscribe');
  const cfg = await features.getAppConfig();
  if (!cfg.subscribe || !cfg.subscribe.tmplId) fail('NO_TEMPLATE', 'subscribe template not configured');
  // one grant per challenge (deterministic _id); a repeat is a no-op
  await store.addIfAbsent('sub_grants', {
    _id: id, ownerOpenid: openid, tmplId: cfg.subscribe.tmplId, grantedAt: now(), used: false,
  });
  return { ok: true, granted: true };
});
