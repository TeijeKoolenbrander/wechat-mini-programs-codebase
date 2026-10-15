'use strict';
// Pure chain rules (spec 3.x). No I/O. Shared by claimStep, getChain, getGroupChains and tests.
const { LIMITS } = require('./config');
const { CHAIN_LENGTH, kindOfStep } = require('./util');

const CLOSED_STATES = new Set(['revealed', 'expired', 'abandoned', 'removed']);

function newChain({ id, starter, openGId, groupRef, promptId, promptText, custom, nowMs, dateKey, claimId }) {
  return {
    _id: id,
    starter,
    openGId: openGId || null,
    groupRef: groupRef || null,
    promptId: promptId || null,
    promptText,
    custom: !!custom,
    length: CHAIN_LENGTH,
    state: 'starting',
    passed: 0,
    nextStep: 1,
    claim: { openid: starter, claimId, step: 1, at: nowMs, expiresAt: nowMs + LIMITS.claimTtlMs },
    pending: null,
    stepIds: [null, null, null, null, null, null, null],
    authors: [null, null, null, null, null, null, null],
    participants: [starter],
    involved: [starter],
    perPersonCount: {},
    attempts: 0,
    submits: {},
    hidden: false,
    createdAt: nowMs,
    lastActivityAt: nowMs,
    expiresAt: nowMs + LIMITS.chainTtlMs,
    dateKey,
  };
}

function claimActive(chain, nowMs) {
  return !!(chain.claim && chain.claim.expiresAt > nowMs);
}

/**
 * May `openid` claim the next 棒? Returns {ok:true, step, resume?, bind?} or {ok:false, code, extra?}.
 * `group` = { memberOfChainGroup:boolean, ctxOpenGId:string|null } resolved by the caller from group_members.
 * `ugc` = config.ugcState(); `player` already rolled to today (players.dayOf).
 */
function evaluateClaim({ chain, player, openid, nowMs, ugc, group, restricted }) {
  if (!chain) return { ok: false, code: 'CHAIN_NOT_FOUND' };
  if (chain.state === 'removed') return { ok: false, code: 'CHAIN_REMOVED' };
  if (chain.state === 'abandoned') return { ok: false, code: 'CHAIN_NOT_FOUND' };
  if (chain.hidden) return { ok: false, code: 'CHAIN_HIDDEN' };
  if (CLOSED_STATES.has(chain.state) || nowMs >= chain.expiresAt) return { ok: false, code: 'CHAIN_CLOSED' };
  if (restricted) return { ok: false, code: 'RESTRICTED', extra: { until: restricted.until, permanent: restricted.permanent } };
  if ((player.rulesVersion || 0) < LIMITS.rulesVersion) return { ok: false, code: 'RULES_REQUIRED' };
  if (!ugc.createOk) return { ok: false, code: 'UGC_PAUSED' };
  if (chain.state === 'pending') return { ok: false, code: 'PENDING' };
  const n = chain.nextStep;
  if (!n || chain.passed >= CHAIN_LENGTH) return { ok: false, code: 'CHAIN_CLOSED' };
  const active = claimActive(chain, nowMs);
  if (active && chain.claim.openid !== openid) return { ok: false, code: 'TAKEN' };
  if (active && chain.claim.openid === openid) return { ok: true, step: chain.claim.step, resume: true };
  if (chain.state === 'starting' && chain.starter !== openid) return { ok: false, code: 'CHAIN_CLOSED' };
  if (n > 1 && chain.authors[n - 1] === openid) return { ok: false, code: 'PREV_MINE' };
  if ((chain.perPersonCount[openid] || 0) >= LIMITS.perPersonMax) return { ok: false, code: 'CAP_REACHED' };
  let bind = null;
  if (chain.openGId) {
    if (!group.memberOfChainGroup) {
      return { ok: false, code: group.ctxOpenGId && group.ctxOpenGId !== chain.openGId ? 'WRONG_GROUP' : 'NEED_GROUP' };
    }
  } else if (group.ctxOpenGId) {
    bind = group.ctxOpenGId;
  } else if (!(chain.starter === openid && chain.passed === 0)) {
    return { ok: false, code: 'NEED_GROUP' };
  }
  const day = player.day;
  if (day.steps >= LIMITS.stepsPerDay) return { ok: false, code: 'STEP_LIMIT' };
  if ((day.claims[chain._id] || 0) >= LIMITS.claimsPerChainPerDay) return { ok: false, code: 'CLAIM_LIMIT' };
  return { ok: true, step: n, bind };
}

function isParticipant(chain, openid) {
  return chain.starter === openid || chain.participants.includes(openid);
}

function recomputeParticipants(chain) {
  const set = new Set([chain.starter]);
  for (let i = 1; i <= CHAIN_LENGTH; i++) if (chain.authors[i]) set.add(chain.authors[i]);
  chain.participants = [...set];
}

/** Mutates the chain for a passed 棒. Returns true when this was the last 棒 (caller reveals). */
function applyPassed(chain, step, nowMs) {
  chain.passed = step.n;
  chain.stepIds[step.n] = step._id;
  chain.authors[step.n] = step.author;
  chain.pending = null;
  chain.claim = null;
  chain.nextStep = step.n < CHAIN_LENGTH ? step.n + 1 : null;
  if (chain.state !== 'removed') chain.state = 'open';
  recomputeParticipants(chain);
  chain.lastActivityAt = nowMs;
  return step.n === CHAIN_LENGTH;
}

/** A blocked or voided drawing: the same 棒 reopens; the attempt no longer counts toward the cap (3.4 #6). */
function applyReopenAfterFailure(chain, step, nowMs) {
  chain.pending = null;
  chain.claim = null;
  if (chain.state === 'pending') chain.state = 'open';
  chain.nextStep = step.n;
  const c = (chain.perPersonCount[step.author] || 1) - 1;
  if (c <= 0) delete chain.perPersonCount[step.author];
  else chain.perPersonCount[step.author] = c;
  chain.lastActivityAt = nowMs;
}

/**
 * The latest passed 棒 is hidden/deleted in a still-open chain: that 棒 reopens, any claim on the
 * next 棒 is cancelled (spec 7.1, 7.4). Returns {reopened, cancelledClaim}.
 */
function reopenLatest(chain, nowMs) {
  const n = chain.passed;
  const cancelled = chain.claim ? { ...chain.claim } : null;
  chain.stepIds[n] = null;
  chain.authors[n] = null;
  chain.passed = n - 1;
  chain.nextStep = n;
  chain.claim = null;
  chain.state = 'open';
  recomputeParticipants(chain);
  chain.lastActivityAt = nowMs;
  return { reopened: n, cancelledClaim: cancelled };
}

function canRevealNow(chain, openid, nowMs) {
  if (chain.starter !== openid) return { ok: false, code: 'NOT_STARTER' };
  if (chain.state !== 'open') return { ok: false, code: 'CHAIN_CLOSED' };
  if (chain.passed < LIMITS.revealMinPassed || chain.passed >= CHAIN_LENGTH) return { ok: false, code: 'TOO_EARLY' };
  if (chain.pending || claimActive(chain, nowMs)) return { ok: false, code: 'TOO_EARLY' };
  return { ok: true };
}

/** Maps an evaluateClaim failure code to the chain-entry state of spec 8.7 / section 12. */
const ENTRY_STATE = {
  TAKEN: 'taken', PENDING: 'pending', PREV_MINE: 'prevMine', CAP_REACHED: 'capReached',
  WRONG_GROUP: 'wrongGroup', NEED_GROUP: 'wrongGroup', RESTRICTED: 'restricted',
  RULES_REQUIRED: 'rulesRequired', UGC_PAUSED: 'ugcPaused', STEP_LIMIT: 'limit', CLAIM_LIMIT: 'limit',
  CHAIN_REMOVED: 'removed', CHAIN_HIDDEN: 'removed', CHAIN_NOT_FOUND: 'notFound',
};

module.exports = {
  CLOSED_STATES, newChain, claimActive, evaluateClaim, isParticipant, recomputeParticipants, applyPassed,
  applyReopenAfterFailure, reopenLatest, canRevealNow, ENTRY_STATE, kindOfStep,
};
