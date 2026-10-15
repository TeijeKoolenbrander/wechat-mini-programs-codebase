'use strict';
// subscribeRound: stores ONE subscribe-message grant per (round, user) after the user's own accept tap
// (PD-13, spec 7.4). Caller must be the host or have guessed. NO_TEMPLATE when the founder has not configured
// app_config.subscribe.tmplId. Idempotent by deterministic _id.
const store = require('./common/store');
const input = require('./common/input');
const rounds = require('./common/rounds');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const roundId = input.roundId(event.roundId);
  const nowMs = now();
  const cfg = await store.getAppConfig();
  const tmplId = cfg.subscribe && cfg.subscribe.tmplId;
  if (!tmplId) fail('NO_TEMPLATE', 'subscribe message not configured');

  const r = await rounds.loadRound(roundId, openid, nowMs);
  const isHost = r.hostOpenid === openid;
  if (!isHost && !(await store.getDoc('guesses', `${roundId}_${openid}`))) fail('FORBIDDEN', 'only the host or a guesser can subscribe');
  if (r.status === 'revealed' || r.status === 'noGuesses') return { ok: true, granted: false };

  await store.addIfAbsent('sub_grants', { _id: `${roundId}_${openid}`, roundId, openid, tmplId, grantedAt: nowMs, used: false });
  return { ok: true, granted: true };
});
