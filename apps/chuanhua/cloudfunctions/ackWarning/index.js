'use strict';
// ackWarning: the player saw the one-time strike warning sheet (spec 8.1). getHome keeps returning
// me.warnPending=true until this (or agreeRules) clears it, so a crash before the sheet is seen cannot lose
// the warning. Idempotent. Only clears the flag; a strike is never created or removed here.
const store = require('./common/store');
const players = require('./common/players');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  await store.txn(async (t) => {
    const p = await players.loadPlayerT(t, openid, nowMs);
    if (!p.warnPending) return;
    p.warnPending = false;
    await store.putT(t, 'players', p);
  });
  return { ok: true };
});
