'use strict';
// laugh (spec 10.2, AC 83): one 笑 per participant per 棒, toggle, counts only. No ranking.
const store = require('./common/store');
const chainLib = require('./common/chain');
const input = require('./common/input');
const { AppError, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const chainId = input.chainId(event.chainId);
  const n = input.stepNo(event.step);
  await store.rateLimit(openid, 'laugh', 1, 30);
  const nowMs = now();
  let out = null;
  await store.txn(async (t) => {
    const chain = await store.getDocT(t, 'chains', chainId);
    if (!chain || chain.state !== 'revealed' || chain.hidden) throw new AppError('CHAIN_CLOSED', 'not revealed');
    if (!chainLib.isParticipant(chain, openid)) throw new AppError('NOT_PARTICIPANT', 'participants only');
    const stepId = chain.stepIds[n];
    const step = stepId ? await store.getDocT(t, 'steps', stepId) : null;
    if (!step || step.state !== 'passed') throw new AppError('CHAIN_CLOSED', 'step not available');
    const rid = `${stepId}_${openid}`;
    const had = await store.getDocT(t, 'reactions', rid);
    if (had) {
      await t.collection('reactions').doc(rid).remove();
      step.laughs = Math.max(0, (step.laughs || 0) - 1);
    } else {
      await t.collection('reactions').add({ data: { _id: rid, stepId, chainId, openid, createdAt: nowMs } });
      step.laughs = (step.laughs || 0) + 1;
    }
    await store.putT(t, 'steps', step);
    out = { laughs: step.laughs, mine: !had };
  });
  return { ok: true, ...out };
});
