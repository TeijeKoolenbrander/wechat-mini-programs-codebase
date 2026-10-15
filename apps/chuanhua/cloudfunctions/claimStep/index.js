'use strict';
// claimStep (spec 3.4, 3.5): the 150 s step lock. Decided by a DB transaction on the chain document, so
// of N concurrent callers exactly one wins; the rest get TAKEN. The previous 棒 is returned ONLY to the
// caller who holds the claim, and only if that 棒 is `passed` and not hidden/deleted (AC 11).
const store = require('./common/store');
const chainLib = require('./common/chain');
const players = require('./common/players');
const groups = require('./common/groups');
const lifecycle = require('./common/lifecycle');
const input = require('./common/input');
const { LIMITS } = require('./common/config');
const { ugcContext } = require('./common/guard');
const { AppError, fail, newClaimId, kindOfStep } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const { nowMs, dateKey, ugc, cfg } = await ugcContext({ create: true });
  const chainId = input.chainId(event.chainId);
  const groupRef = input.optGroupRef(event.groupRef);
  await store.rateLimit(openid, 'claim', 1, 20);

  // kill switch: no previous 棒 is ever returned while viewing is off, and no lock is taken (AC 54)
  if (!ugc.viewOk) return { ok: true, claimId: null, placeholder: 'paused', prev: null };

  const pre = await store.getDoc('chains', chainId);
  if (!pre) fail('CHAIN_NOT_FOUND', 'chain not found');
  const ctxOpenGId = await groups.resolveGroupRef(openid, groupRef, dateKey);
  const member = await groups.isFreshMember(openid, pre.openGId, dateKey);

  let claim = null;
  let chainAfter = null;
  await store.txn(async (t) => {
    const chain = await store.getDocT(t, 'chains', chainId);
    const pc = lifecycle.makePlayerCache(t, nowMs);
    const player = await pc.get(openid);
    players.dayOf(player, dateKey);
    // membership can change between the pre-read and the transaction only by joinGroup (monotone), so the pre-read is safe
    const ev = chainLib.evaluateClaim({
      chain, player, openid, nowMs, ugc, group: { memberOfChainGroup: member, ctxOpenGId }, restricted: players.restriction(player, nowMs),
    });
    if (!ev.ok) throw new AppError(ev.code, ev.code, ev.extra || undefined);
    if (ev.resume) {
      claim = { ...chain.claim };
      chainAfter = chain;
      return;
    }
    if (ev.bind) {
      chain.openGId = ev.bind;
      chain.groupRef = groupRef;
      await lifecycle.bookBindStatsT(t, chain, nowMs);
    }
    claim = { openid, claimId: newClaimId(), step: ev.step, at: nowMs, expiresAt: nowMs + LIMITS.claimTtlMs };
    chain.claim = claim;
    chain.lastActivityAt = nowMs;
    player.day.claims[chainId] = (player.day.claims[chainId] || 0) + 1;
    player.lastActiveAt = nowMs;
    await store.putT(t, 'chains', chain);
    await pc.flush();
    chainAfter = chain;
  });

  // previous 棒: read after the lock is won, from the chain's own passed-step pointers
  const n = claim.step;
  let prev;
  if (n === 1) {
    prev = { kind: 'text', text: chainAfter.promptText };
  } else {
    const prevId = chainAfter.stepIds[n - 1];
    const prevStep = prevId ? await store.getDoc('steps', prevId) : null;
    if (!prevStep || prevStep.state !== 'passed') fail('CHAIN_CLOSED', 'previous step unavailable');
    prev = kindOfStep(n - 1) === 'draw' ? { kind: 'draw', strokes: prevStep.strokes } : { kind: 'text', text: prevStep.text };
  }
  return {
    ok: true,
    claimId: claim.claimId,
    step: n,
    kind: kindOfStep(n),
    expiresAt: claim.expiresAt,
    timerSec: kindOfStep(n) === 'draw' ? cfg.timers.drawSec : cfg.timers.describeSec,
    prev,
  };
});
