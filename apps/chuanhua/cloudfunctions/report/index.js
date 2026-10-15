'use strict';
// report (spec 7.1, PO-16, AC 58-61): a report hides the item for EVERYONE immediately. Fixed reasons,
// no free text. If it was the latest passed 棒 of an open chain, that 棒 reopens and the claim on the
// next 棒 is cancelled (the reporter's own claim is released). step 0 = the teaser texts: a custom
// prompt hides the whole chain.
const store = require('./common/store');
const chainLib = require('./common/chain');
const players = require('./common/players');
const lifecycle = require('./common/lifecycle');
const groups = require('./common/groups');
const input = require('./common/input');
const { LIMITS } = require('./common/config');
const { AppError, fail, now, dateKeyAt, kindOfStep, CHAIN_LENGTH } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const chainId = input.chainId(event.chainId);
  const stepNo = input.stepNo(event.step, 0);
  const reason = input.reason(event.reason);
  await store.rateLimit(openid, 'report', 1, 10);
  const nowMs = now();
  const dateKey = dateKeyAt(nowMs);

  const pre = await store.getDoc('chains', chainId);
  if (!pre) fail('CHAIN_NOT_FOUND', 'chain not found');
  const member = await groups.isFreshMember(openid, pre.openGId, dateKey);

  let out = null;
  await store.txn(async (t) => {
    out = null;
    const chain = await store.getDocT(t, 'chains', chainId);
    if (!chain) throw new AppError('CHAIN_NOT_FOUND', 'chain not found');
    const pc = lifecycle.makePlayerCache(t, nowMs);
    const player = await pc.get(openid);
    players.dayOf(player, dateKey);
    if (player.day.reports >= LIMITS.reportsPerDay) throw new AppError('REPORT_LIMIT', 'daily report limit');
    const participant = chainLib.isParticipant(chain, openid);

    let step = null;
    let stepId;
    let wholeChain = false;
    if (stepNo === 0) {
      // teaser target: visible to participants and members of a revealed chain's group
      if (chain.state !== 'revealed' || !(participant || member)) throw new AppError('NOT_PARTICIPANT', 'cannot report this');
      if (chain.custom) {
        wholeChain = true;
        stepId = `${chainId}_0`;
      } else {
        for (let n = CHAIN_LENGTH; n >= 2 && !step; n -= 2) {
          const sid = chain.stepIds[n];
          const s = sid ? await store.getDocT(t, 'steps', sid) : null;
          if (s && s.state === 'passed' && kindOfStep(n) === 'describe') step = s;
        }
        if (!step) throw new AppError('CHAIN_CLOSED', 'nothing to report');
        stepId = step._id;
      }
    } else {
      stepId = chain.stepIds[stepNo];
      if (!stepId) throw new AppError('CHAIN_CLOSED', 'no such step');
      const holdsClaimOnNext = chain.claim && chain.claim.openid === openid && chain.claim.claimId
        && chain.claim.expiresAt > nowMs && chain.claim.step === stepNo + 1 && chain.passed === stepNo;
      const sees = (chain.state === 'revealed' && participant) || holdsClaimOnNext;
      if (!sees) throw new AppError('NOT_PARTICIPANT', 'cannot report this');
      if (chain.authors[stepNo] === openid) throw new AppError('OWN_STEP', 'cannot report your own step');
      step = await store.getDocT(t, 'steps', stepId);
      if (!step) throw new AppError('CHAIN_CLOSED', 'no such step');
    }
    if (wholeChain && chain.starter === openid) throw new AppError('OWN_STEP', 'cannot report your own prompt');
    if (step && step.author === openid) throw new AppError('OWN_STEP', 'cannot report your own step');

    const rid = `${openid}_${stepId}`;
    if (await store.getDocT(t, 'reports', rid)) throw new AppError('DUP_REPORT', 'already reported');
    await t.collection('reports').add({
      data: { _id: rid, reporter: openid, stepId, chainId, reason, state: 'open', createdAt: nowMs, wholeChain },
    });
    player.day.reports += 1;

    let reopened = false;
    let releasedOwnClaim = false;
    if (wholeChain) {
      chain.hidden = true;
      chain.hiddenReason = 'report';
      chain.claim = null;
    } else if (step.state === 'passed') {
      const r = lifecycle.hideStepT(chain, step, { to: 'hidden', reason: 'report', nowMs });
      reopened = r.reopened !== null && r.reopened !== undefined;
      releasedOwnClaim = !!(r.cancelledClaim && r.cancelledClaim.openid === openid);
      await store.putT(t, 'steps', step);
    }
    await store.putT(t, 'chains', chain);
    await pc.flush();
    out = { reopened, releasedOwnClaim };
  });
  await store.writeEvent(null, 'report_submit', { reason, target: stepNo === 0 ? 'teaser' : 'step', reopened: out.reopened });
  return { ok: true, hidden: true, reopened: out.reopened, releasedOwnClaim: out.releasedOwnClaim };
});
