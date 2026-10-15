'use strict';
// releaseClaim (spec 3.5): the claimant gives the 棒 back. Idempotent; a stale claimId is a no-op.
const store = require('./common/store');
const input = require('./common/input');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const chainId = input.chainId(event.chainId);
  const claimId = input.claimId(event.claimId);
  const nowMs = now();
  let released = false;
  await store.txn(async (t) => {
    released = false;
    const chain = await store.getDocT(t, 'chains', chainId);
    if (!chain || !chain.claim || chain.claim.claimId !== claimId || chain.claim.openid !== openid) return;
    chain.claim = null;
    chain.lastActivityAt = nowMs;
    // a starter who walks away from 第 1 棒 before submitting leaves nothing behind (spec 3.2)
    if (chain.state === 'starting') chain.state = 'abandoned';
    await store.putT(t, 'chains', chain);
    released = true;
  });
  return { ok: true, released };
});
