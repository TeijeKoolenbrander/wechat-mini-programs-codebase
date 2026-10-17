'use strict';
// releaseClaim: give a claim back (放弃). Idempotent; releasing the starter's 棒 1 abandons the chain (spec 3.2, 3.5).
const chainLib = require('./core/chain');
const store = require('./common/store');
const players = require('./common/players');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { chainIdOf, claimIdOf } = require('./common/input');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'release', 1, 20);
  const id = chainIdOf(event);
  if (!id) bad('CHAIN_NOT_FOUND');
  const claimId = claimIdOf(event);
  await store.txn(async (t) => {
    const chain = await store.getDocT(t, 'chains', id);
    if (!chain) bad('CHAIN_NOT_FOUND');
    const r = chainLib.releaseClaim(chain, { openid, claimId, now: now() });
    if (r.released) await players.putT(t, 'chains', id, r.chain);
  });
  return { ok: true };
});
