'use strict';
// claimStep: take the next 棒 (spec 3.5, AC 7-9, 11). One transaction on the chain document: exactly one of any number of
// concurrent claimants wins, the others get TAKEN. The previous 棒 is returned only to the claimant, and only if it is passed.
const { CONFIG } = require('./core/config');
const chainLib = require('./core/chain');
const allowance = require('./core/allowance');
const strikes = require('./core/strikes');
const views = require('./core/views');
const store = require('./common/store');
const players = require('./common/players');
const groups = require('./common/groups');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const ops = require('./common/roomops');
const { bad } = require('./common/errors');
const { chainIdOf } = require('./common/input');
const { now, newClaimId } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'claim', 1, 20);
  const id = chainIdOf(event);
  if (!id || !(await store.getDoc('chains', id))) bad('CHAIN_NOT_FOUND');
  const cfg = await appconfig.get();
  const groupOpenGId = await groups.groupContext(openid, event.groupRef); // independent of the chain: read before the transaction
  const inRoom = !!(await ops.playingRoomOf(await players.read(openid))); // IN_ROOM: finish the running game first (3A.9)

  const cur = await store.txn(async (t) => {
    const chain = await store.getDocT(t, 'chains', id);
    if (!chain) bad('CHAIN_NOT_FOUND');
    const p = await players.getT(t, openid);
    const memberOfChainGroup = chain.openGId ? groups.fresh(await store.getDocT(t, 'group_members', chain.openGId + '_' + openid)) : false;
    const r = strikes.restrictionOf(p, now());
    const dec = chainLib.canClaim(chain, {
      openid,
      now: now(),
      rulesOk: p.rulesVersion >= CONFIG.rulesVersion,
      restrictedUntil: r ? r.until : 0,
      ugcOk: appconfig.createAllowed(cfg).ok,
      inRoom,
      groupOpenGId,
      memberOfChainGroup,
      stepsToday: p.day.steps,
      claimsOnChainToday: p.day.claims[chain._id] || 0,
    });
    if (!dec.ok) bad(dec.code, dec.until ? { until: dec.until } : dec.etaSec ? { etaSec: dec.etaSec } : null);
    if (dec.resume) return chain; // the caller already holds the active claim: same claimId
    const next = chainLib.applyClaim(chain, {
      openid, claimId: newClaimId(), now: now(), bind: dec.bind ? { openGId: dec.bind.openGId, groupRef: event.groupRef } : null,
    });
    await players.putT(t, 'chains', chain._id, next);
    const np = allowance.consumeClaim(p, players.dateKey(), chain._id);
    np.claimRef = { chainId: chain._id, claimId: next.claim.claimId, expiresAt: next.claim.expiresAt };
    await players.putPlayerT(t, np);
    return next;
  });

  const step = cur.claim.step;
  const prevDoc = step > 1 && cur.stepIds[step - 1] ? await store.getDoc('steps', cur.stepIds[step - 1]) : null;
  const prev = views.claimPrev(cur, step, prevDoc, cfg.ugc.viewEnabled);
  const kind = chainLib.kindOf(step);
  await store.writeEvent(openid, 'claim_attempt', { chainId: cur._id, step, result: 'ok' });
  return {
    ok: true,
    serverNow: now(),
    claimId: cur.claim.claimId,
    step,
    kind,
    expiresAt: cur.claim.expiresAt,
    timerSec: chainLib.timerSec(kind, cfg.config.timers),
    prev,
  };
});
