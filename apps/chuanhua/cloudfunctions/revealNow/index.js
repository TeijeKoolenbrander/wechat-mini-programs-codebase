'use strict';
// revealNow: the starter reveals early (spec 3.6, AC 16): >= 4 passed 棒, no active claim or pending 棒.
const chainLib = require('./core/chain');
const store = require('./common/store');
const players = require('./common/players');
const lifecycle = require('./common/lifecycle');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { chainIdOf } = require('./common/input');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'revealnow', 1, 10);
  const id = chainIdOf(event);
  if (!id) bad('CHAIN_NOT_FOUND');
  const next = await store.txn(async (t) => {
    const chain = await store.getDocT(t, 'chains', id);
    if (!chain) bad('CHAIN_NOT_FOUND');
    const r = chainLib.canRevealNow(chain, openid, now());
    if (!r.ok) bad(r.code, r.busy ? { busy: true } : null);
    const n = chainLib.applyRevealNow(chain, now());
    await players.putT(t, 'chains', id, n);
    return n;
  });
  await lifecycle.onRevealed(next);
  return { ok: true };
});
