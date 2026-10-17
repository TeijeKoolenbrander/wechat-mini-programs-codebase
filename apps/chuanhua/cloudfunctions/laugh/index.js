'use strict';
// laugh: toggle the caller's 笑 on one 棒 of a revealed chain (spec 10.2, AC 83). Participants only.
const chainLib = require('./core/chain');
const store = require('./common/store');
const players = require('./common/players');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { chainIdOf, intIn } = require('./common/input');
const { now } = require('./common/util');

const { STATE, STEP } = chainLib;

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'laugh', 1, 20);
  const id = chainIdOf(event);
  const chain = id && (await store.getDoc('chains', id));
  if (!chain) bad('CHAIN_NOT_FOUND');
  if (chain.state !== STATE.REVEALED || chain.hidden) bad('CHAIN_CLOSED');
  if (!chainLib.isParticipant(chain, openid)) bad('NOT_PARTICIPANT');
  const n = intIn(event.step, 1, chain.length);
  const sid = n && chain.stepIds[n];
  if (!sid) bad('BAD_REQUEST');
  return store.txn(async (t) => {
    const s = await store.getDocT(t, 'steps', sid);
    if (!s || s.state !== STEP.PASSED || s.marker) bad('BAD_REQUEST'); // no 笑 on markers
    const rid = sid + '_' + openid;
    const rx = await store.getDocT(t, 'reactions', rid);
    let laughs = s.laughs || 0;
    let mine;
    if (rx) {
      await store.collT(t, 'reactions').doc(rid).remove();
      laughs = Math.max(0, laughs - 1);
      mine = false;
    } else {
      await players.putT(t, 'reactions', rid, { stepId: sid, openid, createdAt: now() });
      laughs += 1;
      mine = true;
    }
    await store.collT(t, 'steps').doc(sid).update({ data: { laughs } });
    return { ok: true, laughs, mine };
  });
});
