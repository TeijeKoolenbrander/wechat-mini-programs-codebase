'use strict';
/**
 * Chain state machine (spec 3, PO-1..PO-6, AC 1-20). Pure functions over the plain `chains` document
 * (spec 13.1). No I/O and no clock: `now` is always a parameter. Every transition returns a NEW document (the input
 * is never mutated), so the cloud functions can run them inside a transaction and the mock server and the tests can
 * compare before/after.
 *
 * Document fields beyond spec 13.1 (decisions TD-2): `pending` (the drawing awaiting its verdict), `attempts[n]`
 * (attempt counter per 棒, for step ids `<chainId>_<n>_<attempt>`), `hidden` ('report' | 'admin' | null, the whole
 * chain hidden by a report on the prompt, edge 29), `revealViewed[]` (participants who opened the reveal, for the
 * 我的接龙 dot).
 *
 * States (doc.state): starting open pending revealed expired removed abandoned. "claimed" is not a state: a claim is
 * the `claim` field and is active while claim.expiresAt > now. An expired claim record is left in place on purpose so a
 * late submit by the same claimant is accepted if nobody claimed since (3.5, AC 12).
 */

const { CONFIG } = require('./config');

const STATE = {
  STARTING: 'starting',
  OPEN: 'open',
  PENDING: 'pending',
  REVEALED: 'revealed',
  EXPIRED: 'expired',
  REMOVED: 'removed',
  ABANDONED: 'abandoned',
};
const TERMINAL = [STATE.REVEALED, STATE.EXPIRED, STATE.REMOVED, STATE.ABANDONED];

/** step (棒 attempt) document states, spec 3.8 */
const STEP = { PENDING: 'pending', PASSED: 'passed', BLOCKED: 'blocked', VOID: 'void', HIDDEN: 'hidden', DELETED: 'deleted' };
/** allowed step transitions; a passed 棒 can later be hidden (report/admin), deleted (author) and an admin may restore */
const STEP_TRANSITIONS = {
  pending: ['passed', 'blocked', 'void'],
  passed: ['hidden', 'deleted'],
  hidden: ['passed', 'deleted'],
  blocked: [],
  void: [],
  deleted: [],
};

const L = CONFIG.chain;

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// ---- shape -------------------------------------------------------------------------------------------------

/** 'draw' for 棒 1, 3, 5 and 'describe' for 棒 2, 4, 6; null outside 1..6 */
function kindOf(n) {
  if (!Number.isInteger(n) || n < 1 || n > L.length) return null;
  return n % 2 === 1 ? 'draw' : 'describe';
}

/** on-screen seconds for a kind (config timers, 60 / 45) */
function timerSec(kind, timers) {
  const t = timers || CONFIG.timers;
  return kind === 'draw' ? t.drawSec : t.describeSec;
}

function stepId(chainId, n, attempt) {
  return chainId + '_' + n + '_' + attempt;
}

function isTerminal(chain) {
  return TERMINAL.includes(chain.state) || !!chain.hidden;
}

function isClaimActive(chain, now) {
  return !!chain.claim && chain.claim.expiresAt > now;
}

function isParticipant(chain, openid) {
  return !!openid && (chain.starter === openid || chain.participants.includes(openid));
}

// ---- creation ----------------------------------------------------------------------------------------------

/**
 * createChain (3.2): the chain starts `starting` with the starter's claim on 棒 1. The start allowance is consumed later,
 * when 棒 1 is submitted (AC 3).
 * @param {{chainId:string, starter:string, claimId:string, now:number, dateKey:string, prompt:{id?:string|null,text:string,custom:boolean},
 *          openGId?:string|null, groupRef?:string|null}} o
 */
function newChain(o) {
  return {
    _id: o.chainId,
    starter: o.starter,
    openGId: o.openGId || null,
    groupRef: o.groupRef || null,
    promptId: o.prompt.custom ? null : o.prompt.id || null,
    promptText: o.prompt.text,
    custom: !!o.prompt.custom,
    length: L.length,
    state: STATE.STARTING,
    passed: 0,
    nextStep: 1,
    claim: { openid: o.starter, claimId: o.claimId, step: 1, at: o.now, expiresAt: o.now + L.claimTtlMs },
    pending: null,
    stepIds: [null, null, null, null, null, null, null],
    authors: [null, null, null, null, null, null, null],
    attempts: [0, 0, 0, 0, 0, 0, 0],
    participants: [o.starter],
    perPersonCount: {},
    revealViewed: [],
    createdAt: o.now,
    lastActivityAt: o.now,
    expiresAt: o.now + L.lifetimeMs,
    revealedAt: null,
    revealReason: null,
    activityId: null,
    activityExpiresAt: null,
    hidden: null,
    dateKey: o.dateKey,
  };
}

/**
 * A chain of a live room (3A.4): created for every seat at startRoom. Fields: mode 'live', roomId, seat (the origin), length = R. Its
 * state follows the room: `open` while playing, `revealed` when the room reveals (materialisation, common/roomio.js). Claims are unused
 * (every claim path answers CHAIN_CLOSED). participants = every seat at start, so reports, laughs and the reveal reuse the 慢慢传 machinery.
 * @param {{chainId:string, roomId:string, seat:number, starter:string, participants:string[], rounds:number, now:number, dateKey:string, openGId?:string|null, groupRef?:string|null}} o
 */
function newLiveChain(o) {
  return {
    _id: o.chainId,
    mode: 'live',
    roomId: o.roomId,
    seat: o.seat,
    starter: o.starter,
    openGId: o.openGId || null,
    groupRef: o.groupRef || null,
    promptId: null,
    promptText: null,
    custom: false,
    length: o.rounds,
    state: STATE.OPEN,
    passed: 0,
    nextStep: null,
    claim: null,
    pending: null,
    stepIds: new Array(o.rounds + 1).fill(null),
    authors: new Array(o.rounds + 1).fill(null),
    attempts: new Array(o.rounds + 1).fill(0),
    participants: o.participants.slice(),
    perPersonCount: {},
    revealViewed: [],
    createdAt: o.now,
    lastActivityAt: o.now,
    expiresAt: o.now + L.lifetimeMs,
    revealedAt: null,
    revealReason: null,
    activityId: null,
    activityExpiresAt: null,
    hidden: null,
    dateKey: o.dateKey,
  };
}

// ---- claim -------------------------------------------------------------------------------------------------

/**
 * Policy gate: things about the PLAYER and the system, not the chain (3.4 #1, #2).
 * @param {{rulesOk:boolean, restrictedUntil?:number, ugcOk:boolean, now:number}} ctx
 * @returns {{code:string, until?:number}|null}
 */
function policyGate(ctx) {
  if (!ctx.rulesOk) return { code: 'RULES_REQUIRED' };
  if (ctx.restrictedUntil && ctx.restrictedUntil > ctx.now) return { code: 'RESTRICTED', until: ctx.restrictedUntil };
  if (!ctx.ugcOk) return { code: 'UGC_PAUSED' };
  return null;
}

/** Daily limits (3.4 #8). ctx.stepsToday, ctx.claimsOnChainToday. */
function limitGate(ctx) {
  const a = CONFIG.allowances;
  if ((ctx.stepsToday || 0) >= a.stepsPerDay) return { code: 'STEP_LIMIT' };
  if ((ctx.claimsOnChainToday || 0) >= a.claimsPerChainPerDay) return { code: 'CLAIM_LIMIT' };
  return null;
}

/**
 * Group rule (3.3, AC 7/8). ctx.groupOpenGId = the group of THIS call's valid group context (or null);
 * ctx.memberOfChainGroup = a group_members row for the chain's group with lastSeen within 30 days.
 * @returns {{code:string}|{bind:{openGId:string}|null}}  bind: the chain becomes bound to ctx.groupOpenGId
 */
function groupGate(chain, ctx) {
  if (chain.openGId) {
    if (ctx.memberOfChainGroup) return { bind: null };
    if (ctx.groupOpenGId && ctx.groupOpenGId !== chain.openGId) return { code: 'WRONG_GROUP' };
    return { code: 'NEED_GROUP' };
  }
  if (ctx.groupOpenGId) return { bind: { openGId: ctx.groupOpenGId } };
  // unbound: only the starter may (re)claim 棒 1 without a group (edge 11)
  if (ctx.openid === chain.starter && chain.nextStep === 1) return { bind: null };
  return { code: 'NEED_GROUP' };
}

/**
 * The chain-side blockers in the order the entry screen reports them. Does not look at the player's policy or limits.
 * @returns {{code:string, etaSec?:number, resume?:boolean, bind?:object|null}}  code only when blocked; `resume` when the caller already holds the active claim
 */
function chainGate(chain, ctx) {
  const now = ctx.now;
  if (chain.hidden || chain.mode === 'live') return { code: 'CHAIN_CLOSED' }; // live chains are never claimed (3A.4)
  if (chain.state === STATE.STARTING) {
    // 棒 1 is held by the starter and nobody else can see the chain yet
    if (chain.claim && chain.claim.openid === ctx.openid && chain.claim.expiresAt > now) return { resume: true, bind: null };
    if (isClaimActive(chain, now)) return { code: 'TAKEN', etaSec: Math.ceil((chain.claim.expiresAt - now) / 1000) };
    return { code: 'CHAIN_CLOSED' };
  }
  if (TERMINAL.includes(chain.state)) return { code: 'CHAIN_CLOSED' };
  const g = groupGate(chain, ctx);
  if (g.code) return g;
  if (ctx.inRoom) return { code: 'IN_ROOM' }; // seated in a playing room: finish the game first (3A.9)
  if (chain.state === STATE.PENDING || chain.pending) return { code: 'PENDING' };
  if (isClaimActive(chain, now)) {
    if (chain.claim.openid === ctx.openid) return { resume: true, bind: g.bind };
    return { code: 'TAKEN', etaSec: Math.ceil((chain.claim.expiresAt - now) / 1000) };
  }
  const step = chain.nextStep;
  if (step > 1 && chain.authors[step - 1] === ctx.openid) return { code: 'PREV_MINE' };
  if ((chain.perPersonCount[ctx.openid] || 0) >= L.maxPerPerson) return { code: 'CAP_REACHED' };
  return { bind: g.bind };
}

/**
 * Can this player take the next 棒? The single rule used by claimStep (authoritative) and by the client for the button
 * state (via getChain). Order: policy (rules, restriction, UGC pause), chain blockers (closed, group, pending, taken,
 * previous author, 3-棒 cap), daily limits.
 * @param {object} chain
 * @param {{openid:string, now:number, rulesOk:boolean, restrictedUntil?:number, ugcOk:boolean,
 *          groupOpenGId?:string|null, memberOfChainGroup?:boolean, stepsToday?:number, claimsOnChainToday?:number}} ctx
 * @returns {{ok:true, step:number, kind:string, resume:boolean, bind:object|null} | {ok:false, code:string, until?:number, etaSec?:number}}
 */
function canClaim(chain, ctx) {
  const p = policyGate(ctx);
  if (p) return { ok: false, ...p };
  const c = chainGate(chain, ctx);
  if (c.code) return { ok: false, ...c };
  if (!c.resume) {
    const lim = limitGate(ctx);
    if (lim) return { ok: false, ...lim };
  }
  return { ok: true, step: chain.nextStep, kind: kindOf(chain.nextStep), resume: !!c.resume, bind: c.bind || null };
}

/** Write the claim (call only after canClaim said ok and !resume). `bind` = {openGId, groupRef} to bind an unbound chain. */
function applyClaim(chain, o) {
  const c = clone(chain);
  c.claim = { openid: o.openid, claimId: o.claimId, step: chain.nextStep, at: o.now, expiresAt: o.now + L.claimTtlMs };
  if (o.bind && !c.openGId) {
    c.openGId = o.bind.openGId;
    c.groupRef = o.bind.groupRef || c.groupRef;
  }
  c.lastActivityAt = o.now;
  return c;
}

/**
 * Release a claim (放弃). Idempotent: releasing a claim you no longer hold is a no-op (`released:false`).
 * Releasing the starter's 棒 1 while the chain is `starting` abandons the chain (3.2).
 */
function releaseClaim(chain, o) {
  const k = chain.claim;
  if (!k || k.openid !== o.openid || k.claimId !== o.claimId) return { chain, released: false };
  const c = clone(chain);
  c.claim = null;
  if (c.state === STATE.STARTING) c.state = STATE.ABANDONED;
  c.lastActivityAt = o.now;
  return { chain: c, released: true };
}

// ---- submit ------------------------------------------------------------------------------------------------

/**
 * Pre-checks for submitStep (3.5, AC 1, 12). Does not validate the content itself.
 * `late` = the claim had expired but nobody else claimed since (accepted).
 * @param {{openid:string, claimId:string, now:number, hasText:boolean, hasStrokes:boolean}} o
 * @returns {{ok:true, step:number, kind:string, late:boolean} | {ok:false, code:string}}
 */
function checkSubmit(chain, o) {
  if (chain.hidden || [STATE.REVEALED, STATE.EXPIRED, STATE.REMOVED, STATE.ABANDONED].includes(chain.state)) return { ok: false, code: 'CHAIN_CLOSED' };
  const k = chain.claim;
  if (!k || k.openid !== o.openid || k.claimId !== o.claimId || k.step !== chain.nextStep || chain.state === STATE.PENDING) return { ok: false, code: 'CLAIM_LOST' };
  const kind = kindOf(k.step);
  if (o.empty) {
    if (o.hasText || o.hasStrokes) return { ok: false, code: 'BAD_REQUEST' }; // an empty (marker) send carries nothing
  } else {
    if (kind === 'draw' && (!o.hasStrokes || o.hasText)) return { ok: false, code: 'BAD_REQUEST' };
    if (kind === 'describe' && (!o.hasText || o.hasStrokes)) return { ok: false, code: 'BAD_REQUEST' };
  }
  return { ok: true, step: k.step, kind, late: k.expiresAt <= o.now };
}

function addPassed(c, n, sid, author, now, marker) {
  if (marker) c.markers = (c.markers || []).concat(n);
  c.passed = n;
  c.stepIds[n] = sid;
  c.authors[n] = author;
  if (!c.participants.includes(author)) c.participants.push(author);
  c.claim = null;
  c.pending = null;
  c.lastActivityAt = now;
  if (n >= c.length) {
    c.state = STATE.REVEALED;
    c.nextStep = null;
    c.revealedAt = now;
    c.revealReason = 'complete';
  } else {
    c.state = STATE.OPEN;
    c.nextStep = n + 1;
  }
}

/**
 * A description passed the synchronous check (6.2): the 棒 is passed at once. 第 6 棒 reveals the chain in the same
 * call (AC 15). `attempt` is the step attempt number (stepIds are unique per attempt).
 */
function passText(chain, o) {
  const c = clone(chain);
  const n = chain.claim.step;
  c.attempts[n] = o.attempt;
  c.perPersonCount[o.openid] = (c.perPersonCount[o.openid] || 0) + 1;
  addPassed(c, n, o.stepId, o.openid, o.now);
  return { chain: c, revealed: c.state === STATE.REVEALED };
}


/**
 * A forced send with nothing to send (5.8): the 棒 passes as a MARKER step (「（没来得及画）」 / 「（没来得及写）」). It counts as a passed 棒 and in the author's
 * 3-棒 cap (3.4 #6) and the chain moves on; no moderation call. `o.marker` is the copy.MARKERS key.
 */
function passMarker(chain, o) {
  const c = clone(chain);
  const n = chain.claim.step;
  c.attempts[n] = o.attempt;
  c.perPersonCount[o.openid] = (c.perPersonCount[o.openid] || 0) + 1;
  addPassed(c, n, o.stepId, o.openid, o.now, o.marker);
  return { chain: c, revealed: c.state === STATE.REVEALED };
}

/**
 * Blocked, rejected or failed at a FORCED send in 慢慢传 (3.5, 5.8, AC 132): the claim is released and the same 棒 reopens for anyone eligible.
 * The attempt number is kept so the next step id does not collide with the author's own blocked record. The author's cap slot is not used.
 */
function reopenAfterForced(chain, o) {
  const c = clone(chain);
  const n = chain.claim.step;
  c.attempts[n] = o.attempt;
  c.claim = null;
  c.state = STATE.OPEN;
  c.nextStep = n;
  c.lastActivityAt = o.now;
  return c;
}

/**
 * A drawing was rasterised and sent to mediaCheckAsync: the 棒 is pending and the chain is not claimable (6.3, AC 13).
 * It counts toward the author's 3-棒 cap while pending (3.4 #6).
 */
function beginPending(chain, o) {
  const c = clone(chain);
  const n = chain.claim.step;
  c.attempts[n] = o.attempt;
  c.pending = { stepId: o.stepId, n, attempt: o.attempt, author: o.openid, submittedAt: o.now };
  c.perPersonCount[o.openid] = (c.perPersonCount[o.openid] || 0) + 1;
  c.claim = null;
  c.state = STATE.PENDING;
  c.lastActivityAt = o.now;
  return c;
}

/**
 * A verdict for the pending drawing: outcome 'passed' | 'blocked' | 'void' (6.3 step 6/7). A verdict for a step that
 * is not the chain's pending step (late, duplicate, removed chain) returns {stale:true} and changes nothing.
 * Blocked and void reopen the same 棒 and give the cap slot back (AC 5, 46).
 */
function resolvePending(chain, o) {
  if (!chain.pending || chain.pending.stepId !== o.stepId || chain.state !== STATE.PENDING) return { chain, stale: true, revealed: false };
  const c = clone(chain);
  const { n, author } = chain.pending;
  if (o.outcome === 'passed') {
    addPassed(c, n, o.stepId, author, o.now);
    return { chain: c, stale: false, revealed: c.state === STATE.REVEALED };
  }
  c.perPersonCount[author] = Math.max(0, (c.perPersonCount[author] || 0) - 1);
  c.pending = null;
  c.claim = null;
  c.state = STATE.OPEN;
  c.nextStep = n;
  c.lastActivityAt = o.now;
  return { chain: c, stale: false, revealed: false };
}

/**
 * A passed 棒 stops being served (report hide, admin hide, author delete): if it is the LATEST passed 棒 of an open
 * chain it reopens, the claim on the next 棒 is cancelled and the author's cap slot is given back (7.1, 7.4, AC 60,
 * 71). Anything else (older 棒, revealed chain, a later 棒 pending) leaves the chain untouched.
 * @returns {{chain, reopened:boolean, cancelledClaim:object|null}}
 */
function reopenLatest(chain, n, now) {
  if (chain.state !== STATE.OPEN || chain.pending || chain.passed !== n || n < 1) return { chain, reopened: false, cancelledClaim: null };
  const c = clone(chain);
  const author = c.authors[n];
  c.passed = n - 1;
  c.stepIds[n] = null;
  c.authors[n] = null;
  c.nextStep = n;
  if (author) c.perPersonCount[author] = Math.max(0, (c.perPersonCount[author] || 0) - 1);
  const cancelled = c.claim && c.claim.expiresAt > now ? c.claim : null;
  c.claim = null;
  c.lastActivityAt = now;
  return { chain: c, reopened: true, cancelledClaim: cancelled };
}

// ---- reveal, expiry, removal -------------------------------------------------------------------------------

/** 现在揭晓 (3.6, AC 16). Precedence: CHAIN_CLOSED, NOT_STARTER, TOO_EARLY (< 4 passed, or a claim/pending is active: `busy`). */
function canRevealNow(chain, openid, now) {
  if (isTerminal(chain) || chain.state === STATE.STARTING) return { ok: false, code: 'CHAIN_CLOSED' };
  if (chain.starter !== openid) return { ok: false, code: 'NOT_STARTER' };
  if (chain.passed < L.earlyRevealMin) return { ok: false, code: 'TOO_EARLY' };
  if (chain.pending || chain.state === STATE.PENDING || isClaimActive(chain, now)) return { ok: false, code: 'TOO_EARLY', busy: true };
  return { ok: true };
}

function applyRevealNow(chain, now) {
  const c = clone(chain);
  c.state = STATE.REVEALED;
  c.nextStep = null;
  c.claim = null;
  c.revealedAt = now;
  c.revealReason = 'early';
  c.lastActivityAt = now;
  return c;
}

/**
 * modSweeper's per-chain step (3.6, AC 17, 3.2). Returns {chain, event} where event is
 * null | 'abandoned' | 'reveal' (expiry reveal) | 'expire'.
 *  - a `starting` chain whose claim expired is abandoned (edge 10);
 *  - at expiresAt: wait while a claim is active or a drawing is pending; then >= 4 passed reveals ('expiry'), fewer expires.
 */
function sweepChain(chain, now) {
  if (isTerminal(chain) || chain.mode === 'live') return { chain, event: null };
  if (chain.state === STATE.STARTING) {
    if (!isClaimActive(chain, now)) {
      const c = clone(chain);
      c.state = STATE.ABANDONED;
      c.claim = null;
      return { chain: c, event: 'abandoned' };
    }
    return { chain, event: null };
  }
  if (now < chain.expiresAt) return { chain, event: null };
  if (chain.pending || chain.state === STATE.PENDING || isClaimActive(chain, now)) return { chain, event: null };
  const c = clone(chain);
  c.claim = null;
  c.lastActivityAt = now;
  if (c.passed >= L.earlyRevealMin) {
    c.state = STATE.REVEALED;
    c.nextStep = null;
    c.revealedAt = now;
    c.revealReason = 'expiry';
    return { chain: c, event: 'reveal' };
  }
  c.state = STATE.EXPIRED;
  c.nextStep = null;
  return { chain: c, event: 'expire' };
}

/** admin removeChain (any state -> removed, AC 64) */
function removeChain(chain, now) {
  const c = clone(chain);
  c.state = STATE.REMOVED;
  c.claim = null;
  c.pending = null;
  c.lastActivityAt = now;
  return c;
}

/** a report on the prompt hides the whole chain (edge 29, AC 61); admin may restore (hidden: null) */
function setChainHidden(chain, reason, now) {
  const c = clone(chain);
  c.hidden = reason || null;
  if (reason) c.claim = null;
  c.lastActivityAt = now;
  return c;
}

// ---- derived values the entry screen needs -------------------------------------------------------------------

/** Which of the viewer's 棒 numbers exist as passed in this chain (from authors[]) */
function myPassedSteps(chain, openid) {
  const out = [];
  for (let n = 1; n <= chain.length; n++) if (chain.authors[n] === openid) out.push(n);
  return out;
}

module.exports = {
  STATE, STEP, STEP_TRANSITIONS, TERMINAL,
  kindOf, timerSec, stepId, isTerminal, isClaimActive, isParticipant,
  newChain, newLiveChain, policyGate, limitGate, groupGate, chainGate, canClaim, applyClaim, releaseClaim,
  checkSubmit, passText, passMarker, reopenAfterForced, beginPending, resolvePending, reopenLatest,
  canRevealNow, applyRevealNow, sweepChain, removeChain, setChainHidden, myPassedSteps,
};
