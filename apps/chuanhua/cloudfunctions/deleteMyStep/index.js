'use strict';
// deleteMyStep: 删除这一棒 / 删除我的全部接龙内容 (spec 7.4, AC 71, 72). The strokes/text are removed from `steps` and the 棒
// is shown as "作者已删除这一棒"; the moderation evidence (mod_log text copy, PNG) stays admin-only until day 180.
// If it was the latest passed 棒 of an open chain, that 棒 reopens and the claim on the next 棒 is cancelled.
const chainLib = require('./core/chain');
const store = require('./common/store');
const players = require('./common/players');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { chainIdOf, intIn } = require('./common/input');
const { now } = require('./common/util');

const { STEP } = chainLib;
const MAX_PER_CALL = 300;

/** delete one 棒 in a transaction; true if it was deleted */
async function deleteOne(openid, stepId) {
  return store.txn(async (t) => {
    const s = await store.getDocT(t, 'steps', stepId);
    if (!s || s.author !== openid || s.state !== STEP.PASSED || s.marker) return false; // markers cannot be deleted (5.8)
    if (s.roomId) {
      // a step of a room still playing is part of a running round: not offered until the reveal (7.4, AC 71)
      const room = await store.getDocT(t, 'rooms', s.roomId);
      if (room && (room.state === 'playing' || room.state === 'lobby')) return false;
    }
    const next = Object.assign({}, s, { state: STEP.DELETED });
    delete next.strokes;
    delete next.text;
    await players.putT(t, 'steps', stepId, next);
    const chain = await store.getDocT(t, 'chains', s.chainId);
    if (chain) {
      const r = chainLib.reopenLatest(chain, s.n, now());
      if (r.reopened) await players.putT(t, 'chains', chain._id, r.chain);
    }
    return true;
  });
}

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'delete', 1, 10);
  let ids;
  if (event.all === true) {
    const rows = await store.coll('steps').where({ author: openid, state: STEP.PASSED }).orderBy('createdAt', 'desc').limit(MAX_PER_CALL).get();
    ids = rows.data.sort((a, b) => b.n - a.n).map((s) => s._id);
  } else {
    const id = chainIdOf(event);
    const chain = id && (await store.getDoc('chains', id));
    const n = chain && intIn(event.step, 1, chain.length);
    const sid = n && chain.stepIds[n];
    const s = sid && (await store.getDoc('steps', sid));
    if (!s || s.author !== openid || s.state !== STEP.PASSED || s.marker) bad('BAD_REQUEST');
    ids = [sid];
  }
  let count = 0;
  for (const sid of ids) if (await deleteOne(openid, sid)) count++;
  if (event.all !== true && count === 0) bad('BAD_REQUEST');
  await store.writeEvent(openid, 'delete_step', { scope: event.all === true ? 'all' : 'one', count });
  return { ok: true, count };
});
