'use strict';
// agreeRules: records the 接龙公约 agreement (spec 8.2). Not a WeChat privacy authorisation.
const store = require('./common/store');
const players = require('./common/players');
const { LIMITS } = require('./common/config');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const v = event.version;
  if (!Number.isInteger(v) || v < 1 || v > LIMITS.rulesVersion) fail('BAD_INPUT', 'bad version');
  const nowMs = now();
  await store.txn(async (t) => {
    const p = await players.loadPlayerT(t, openid, nowMs);
    p.rulesVersion = Math.max(p.rulesVersion || 0, v);
    p.lastActiveAt = nowMs;
    await store.putT(t, 'players', p);
  });
  return { ok: true };
});
