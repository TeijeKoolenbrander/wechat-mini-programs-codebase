'use strict';
// deleteMyStep (spec 7.4, AC 71-72): the author removes their own passed 棒 (or all their content).
// Strokes/text are removed from `steps` and every viewer sees "作者已删除这一棒"; if it was the latest
// passed 棒 of an open chain it reopens. The evidence copy (mod_log text, moderation PNG) stays
// admin-only until day 180 (PO-19).
const store = require('./common/store');
const lifecycle = require('./common/lifecycle');
const input = require('./common/input');
const { AppError, fail, now } = require('./common/util');

const MAX_OPS = 150;

async function deleteOne(openid, chainId, stepId, nowMs) {
  let done = false;
  await store.txn(async (t) => {
    done = false;
    const chain = await store.getDocT(t, 'chains', chainId);
    const step = await store.getDocT(t, 'steps', stepId);
    if (!chain || !step) throw new AppError('CHAIN_NOT_FOUND', 'not found');
    if (step.author !== openid) throw new AppError('FORBIDDEN', 'not your step');
    if (!['passed', 'hidden'].includes(step.state)) throw new AppError('CHAIN_CLOSED', 'step cannot be deleted');
    lifecycle.hideStepT(chain, step, { to: 'deleted', nowMs });
    await store.putT(t, 'steps', step);
    await store.putT(t, 'chains', chain);
    done = true;
  });
  return done;
}

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  if (event.all === true) {
    const _ = store._();
    let count = 0;
    let ops = 0;
    let more = false;
    const rows = await store.db().collection('steps').where({ author: openid, state: _.in(['passed', 'hidden', 'blocked', 'void']) })
      .orderBy('createdAt', 'desc').limit(1000).get();
    for (const s of rows.data) {
      if (ops >= MAX_OPS) { more = true; break; }
      ops += 1;
      if (s.state === 'passed' || (s.state === 'hidden' && s.strokes !== null && s.text !== null)) {
        if (await deleteOne(openid, s.chainId, s._id, nowMs)) count += 1;
      } else if (s.strokes || s.text) {
        // blocked/void content is never shown; drop it from steps as well
        await store.db().collection('steps').doc(s._id).update({ data: { strokes: null, text: null } });
      }
    }
    await store.writeEvent(openid, 'delete_step', { scope: 'all', count });
    return { ok: true, count, more };
  }
  const chainId = input.chainId(event.chainId);
  const n = input.stepNo(event.step);
  const chain = await store.getDoc('chains', chainId);
  if (!chain) fail('CHAIN_NOT_FOUND', 'chain not found');
  const stepId = chain.stepIds[n];
  if (!stepId || chain.authors[n] !== openid) fail('FORBIDDEN', 'not your step');
  const done = await deleteOne(openid, chainId, stepId, nowMs);
  await store.writeEvent(openid, 'delete_step', { scope: 'one', count: done ? 1 : 0 });
  return { ok: true, count: done ? 1 : 0 };
});
