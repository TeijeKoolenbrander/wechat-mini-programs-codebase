'use strict';
// revealNow (spec 3.6, AC 16): the starter reveals early at >= 4 passed 棒, with no claim or pending 棒.
const store = require('./common/store');
const chainLib = require('./common/chain');
const lifecycle = require('./common/lifecycle');
const activity = require('./common/activity');
const input = require('./common/input');
const { AppError, fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const chainId = input.chainId(event.chainId);
  const nowMs = now();
  let chainOut = null;
  await store.txn(async (t) => {
    const chain = await store.getDocT(t, 'chains', chainId);
    if (!chain) throw new AppError('CHAIN_NOT_FOUND', 'chain not found');
    const ok = chainLib.canRevealNow(chain, openid, nowMs);
    if (!ok.ok) throw new AppError(ok.code, ok.code);
    const pc = lifecycle.makePlayerCache(t, nowMs);
    await lifecycle.finalizeRevealT(t, chain, 'early', nowMs, pc);
    await store.putT(t, 'chains', chain);
    await pc.flush();
    chainOut = chain;
  });
  if (!chainOut) fail('INTERNAL', 'no chain');
  await store.writeEvent(null, 'chain_reveal', { reason: 'early', passed: chainOut.passed, participants: chainOut.participants.length, durationMin: Math.round((nowMs - chainOut.createdAt) / 60000), custom: chainOut.custom });
  await activity.updateCard(chainOut);
  return { ok: true };
});
