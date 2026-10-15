/**
 * Chain rules and the chain state machine (spec 3, 6.3, 7.1). Pure functions over a plain chain document;
 * the cloud functions run them inside a transaction on the chain doc, the mock server runs them in memory,
 * the client uses the timer helpers and `entryState` copy rules. No clocks, no randomness inside: callers
 * pass `now` (epoch ms) and ids.
 *
 * Chain document (spec 13.1):
 *   { _id, starter, openGId|null, promptId|null, promptText, custom, length: 6,
 *     state: 'starting'|'open'|'pending'|'revealed'|'expired'|'removed'|'abandoned',
 *     passed: 0..6, nextStep: 1..6,
 *     claim: null | { openid, claimId, step, at, expiresAt },
 *     pending: null | { step, author, stepId },              // the drawing under review (chain.state === 'pending')
 *     stepIds[7], authors[7]  (index 0 unused; passed steps only),
 *     participants[] (starter + authors of passed steps), perPersonCount { openid: n } (passed + pending),
 *     createdAt, lastActivityAt, expiresAt, revealedAt|null, revealReason|null ('complete'|'early'|'expiry'), dateKey }
 *
 * Every mutator returns { ok: true, ... } or { ok: false, code } and leaves the doc untouched on failure.
 * Terminal states (revealed, expired, removed, abandoned) never go back to open (AC 20).
 */

const { CONFIG } = require('./config');

const TERMINAL = { revealed: true, expired: true, removed: true, abandoned: true };
const LIVE = { starting: true, open: true, pending: true };

function kindOfStep(n) {
  return n % 2 === 1 ? 'draw' : 'describe';
}

function isTerminal(chain) {
  return !!TERMINAL[chain.state];
}

function newChain(o) {
  const C = CONFIG.chain;
  return {
    _id: o.id,
    starter: o.starter,
    openGId: o.openGId || null,
    promptId: o.promptId || null,
    promptText: o.promptText,
    custom: !!o.custom,
    length: C.length,
    state: 'starting',
    passed: 0,
    nextStep: 1,
    claim: { openid: o.starter, claimId: o.claimId, step: 1, at: o.now, expiresAt: o.now + C.claimTtlMs },
    pending: null,
    stepIds: [null, null, null, null, null, null, null],
    authors: [null, null, null, null, null, null, null],
    participants: [o.starter],
    perPersonCount: {},
    createdAt: o.now,
    lastActivityAt: o.now,
    expiresAt: o.now + C.lifetimeMs,
    revealedAt: null,
    revealReason: null,
    dateKey: o.dateKey || null,
  };
}

function claimActive(chain, now) {
  return !!(chain.claim && now < chain.claim.expiresAt);
}

function isParticipant(chain, openid) {
  return chain.participants.indexOf(openid) >= 0;
}

function countOf(chain, openid) {
  return chain.perPersonCount[openid] || 0;
}

/**
 * Who may take the next 棒 (spec 3.4, PO-3). ctx:
 *   openid, now,
 *   rulesVersion (the player's agreed version), restrictedUntil?, permanent?,
 *   ugc: { createEnabled, autoPausedUntil? },
 *   isMember (group_members row for the chain's group, lastSeen within 30 days), hasGroupContext (a valid joinGroup this entry),
 *   stepsToday, claimsOnChainToday
 * Returns { ok: true, resume?: true } or { ok: false, code, until? }. Code order is the order of the checks.
 */
function canClaim(chain, ctx) {
  const no = (code, extra) => Object.assign({ ok: false, code }, extra || {});
  if (!chain) return no('CHAIN_NOT_FOUND');
  if (chain.state === 'removed' || isTerminal(chain)) return no('CHAIN_CLOSED');
  if (!(ctx.rulesVersion >= CONFIG.rulesVersion)) return no('RULES_REQUIRED');
  if (ctx.permanent || (ctx.restrictedUntil && ctx.restrictedUntil > ctx.now)) return no('RESTRICTED', { until: ctx.permanent ? null : ctx.restrictedUntil });
  const ugc = ctx.ugc || { createEnabled: true };
  if (ugc.createEnabled === false || (ugc.autoPausedUntil && ugc.autoPausedUntil > ctx.now)) return no('UGC_PAUSED');
  if (claimActive(chain, ctx.now) && chain.claim.openid === ctx.openid) return { ok: true, resume: true };
  if (chain.state === 'pending') return no('PENDING');
  if (claimActive(chain, ctx.now)) return no('TAKEN');
  if (chain.passed >= chain.length) return no('CHAIN_CLOSED');
  if (chain.passed >= 1 && chain.authors[chain.passed] === ctx.openid) return no('PREV_MINE');
  if (countOf(chain, ctx.openid) >= CONFIG.chain.maxPerPerson) return no('CAP_REACHED');
  if (chain.openGId) {
    if (!ctx.isMember) return no(ctx.hasGroupContext ? 'WRONG_GROUP' : 'NEED_GROUP');
  } else if (!ctx.hasGroupContext && ctx.openid !== chain.starter) {
    return no('NEED_GROUP');
  }
  if ((ctx.stepsToday || 0) >= CONFIG.allowances.stepsPerDay) return no('STEP_LIMIT');
  if ((ctx.claimsOnChainToday || 0) >= CONFIG.allowances.claimsPerChainPerDay) return no('CLAIM_LIMIT');
  return { ok: true };
}

/**
 * Take the claim. `ctx` as for canClaim, plus claimId and optional groupId (binds an unbound chain, spec 3.3).
 * Returns { ok, claim, step, kind, resumed, bound } or the canClaim failure.
 */
function claim(chain, ctx) {
  const can = canClaim(chain, ctx);
  if (!can.ok) return can;
  if (can.resume) return { ok: true, claim: chain.claim, step: chain.claim.step, kind: kindOfStep(chain.claim.step), resumed: true, bound: false };
  chain.claim = { openid: ctx.openid, claimId: ctx.claimId, step: chain.nextStep, at: ctx.now, expiresAt: ctx.now + CONFIG.chain.claimTtlMs };
  let bound = false;
  if (!chain.openGId && ctx.groupId) {
    chain.openGId = ctx.groupId;
    bound = true;
  }
  chain.lastActivityAt = ctx.now;
  return { ok: true, claim: chain.claim, step: chain.nextStep, kind: kindOfStep(chain.nextStep), resumed: false, bound };
}

/** Drop the claim (返回 > 放弃). A starter who releases 第 1 棒 abandons the new chain (spec 3.2). */
function release(chain, openid, claimId, now) {
  if (!chain.claim || chain.claim.openid !== openid || chain.claim.claimId !== claimId) return { ok: false, code: 'CLAIM_LOST' };
  chain.claim = null;
  chain.lastActivityAt = now;
  if (chain.state === 'starting') chain.state = 'abandoned';
  return { ok: true, abandoned: chain.state === 'abandoned' };
}

/**
 * May this submit go ahead? A claim past its TTL is still honoured while nobody else claimed since
 * (lazy expiry, spec 3.5); `kind` must match the step (AC 1).
 */
function checkSubmit(chain, o) {
  if (!LIVE[chain.state] || chain.state === 'pending') return { ok: false, code: isTerminal(chain) ? 'CHAIN_CLOSED' : 'CLAIM_LOST' };
  const c = chain.claim;
  if (!c || c.claimId !== o.claimId || c.openid !== o.openid) return { ok: false, code: 'CLAIM_LOST' };
  if (c.step !== chain.nextStep) return { ok: false, code: 'CLAIM_LOST' };
  if (kindOfStep(c.step) !== o.kind) return { ok: false, code: 'BAD_KIND' };
  return { ok: true, step: c.step, late: o.now >= c.expiresAt };
}

/** A drawing goes to review: chain `pending`, claim consumed, counts against the author's 3 (AC 5). */
function markPending(chain, o) {
  if (!(chain.state === 'starting' || chain.state === 'open') || o.step !== chain.nextStep) return { ok: false, code: 'CLAIM_LOST' };
  chain.state = 'pending';
  chain.pending = { step: o.step, author: o.author, stepId: o.stepId };
  chain.claim = null;
  chain.perPersonCount[o.author] = countOf(chain, o.author) + 1;
  chain.lastActivityAt = o.now;
  return { ok: true };
}

/** A step passed moderation (text immediately, drawing on its verdict). Reveals at the last 棒. */
function passStep(chain, o) {
  if (!LIVE[chain.state] || o.step !== chain.nextStep) return { ok: false, code: 'CHAIN_CLOSED' };
  const wasPending = !!(chain.pending && chain.pending.step === o.step);
  if (!wasPending) chain.perPersonCount[o.author] = countOf(chain, o.author) + 1;
  chain.pending = null;
  chain.claim = null;
  chain.authors[o.step] = o.author;
  chain.stepIds[o.step] = o.stepId;
  if (chain.participants.indexOf(o.author) < 0) chain.participants.push(o.author);
  chain.passed = o.step;
  chain.nextStep = o.step + 1;
  chain.state = 'open';
  chain.lastActivityAt = o.now;
  let revealed = false;
  if (o.step >= chain.length) {
    reveal(chain, 'complete', o.now);
    revealed = true;
  }
  return { ok: true, revealed };
}

/** A pending drawing was blocked (review/risky) or voided (timeouts): the 棒 reopens, the attempt stops counting. */
function dropPending(chain, now) {
  if (chain.state !== 'pending' || !chain.pending) return { ok: false, code: 'NOT_PENDING' };
  const a = chain.pending.author;
  chain.perPersonCount[a] = Math.max(0, countOf(chain, a) - 1);
  chain.pending = null;
  chain.state = 'open';
  chain.lastActivityAt = now;
  return { ok: true };
}

function reveal(chain, reason, now) {
  if (chain.state === 'removed') return { ok: false, code: 'CHAIN_CLOSED' };
  chain.state = 'revealed';
  chain.revealReason = reason;
  chain.revealedAt = now;
  chain.claim = null;
  chain.pending = null;
  chain.lastActivityAt = now;
  return { ok: true };
}

function canRevealNow(chain, openid, now) {
  if (!chain) return { ok: false, code: 'CHAIN_NOT_FOUND' };
  if (chain.starter !== openid) return { ok: false, code: 'NOT_STARTER' };
  if (isTerminal(chain)) return { ok: false, code: 'CHAIN_CLOSED' };
  if (chain.passed < CONFIG.chain.minReveal) return { ok: false, code: 'TOO_EARLY' };
  if (chain.state === 'pending') return { ok: false, code: 'PENDING' };
  if (claimActive(chain, now)) return { ok: false, code: 'TAKEN' };
  return { ok: true };
}

function revealNow(chain, openid, now) {
  const can = canRevealNow(chain, openid, now);
  if (!can.ok) return can;
  return reveal(chain, 'early', now);
}

/**
 * A passed 棒 is hidden (report/admin) or deleted by its author (spec 7.1, 7.4). If it was the latest passed
 * 棒 of a live chain it reopens: `cancelledClaim` is the claim on the next 棒 that must be released,
 * `voidedPending` a drawing under review that was built on it.
 */
function reopenStep(chain, step, now) {
  const out = { ok: true, reopened: false, cancelledClaim: null, voidedPending: null };
  if (!LIVE[chain.state] || step !== chain.passed || step < 1) return out;
  const author = chain.authors[step];
  if (chain.pending) {
    out.voidedPending = chain.pending;
    const pa = chain.pending.author;
    chain.perPersonCount[pa] = Math.max(0, countOf(chain, pa) - 1);
    chain.pending = null;
  }
  if (chain.claim) {
    out.cancelledClaim = chain.claim;
    chain.claim = null;
  }
  chain.authors[step] = null;
  chain.stepIds[step] = null;
  chain.perPersonCount[author] = Math.max(0, countOf(chain, author) - 1);
  chain.passed = step - 1;
  chain.nextStep = step;
  chain.state = 'open';
  chain.participants = [chain.starter].concat(chain.authors.filter((a) => a && a !== chain.starter).filter((a, i, arr) => arr.indexOf(a) === i));
  chain.lastActivityAt = now;
  out.reopened = true;
  return out;
}

function remove(chain, now) {
  chain.state = 'removed';
  chain.claim = null;
  chain.pending = null;
  chain.lastActivityAt = now;
  return { ok: true };
}

/**
 * Time-driven transitions (modSweeper, spec 3.6): returns { event: null|'abandoned'|'revealed'|'expired'|'wait' }.
 * Expiry waits while a claim or a pending drawing is active.
 */
function sweep(chain, now) {
  if (chain.state === 'starting') {
    if (chain.claim && now >= chain.claim.expiresAt + CONFIG.chain.abandonGraceMs) {
      chain.claim = null;
      chain.state = 'abandoned';
      return { event: 'abandoned' };
    }
    return { event: null };
  }
  if (chain.state !== 'open' && chain.state !== 'pending') return { event: null };
  if (now < chain.expiresAt) return { event: null };
  if (chain.state === 'pending' || claimActive(chain, now)) return { event: 'wait' };
  chain.claim = null;
  if (chain.passed >= CONFIG.chain.minReveal) {
    reveal(chain, 'expiry', now);
    return { event: 'revealed' };
  }
  chain.state = 'expired';
  chain.lastActivityAt = now;
  return { event: 'expired' };
}

// ---------------------------------------------------------------- views of a chain (no content)

/** Entry-screen state for a viewer (spec 8.7). viewer = canClaim ctx (+ nothing else). */
function entryState(chain, viewer) {
  if (!chain) return { state: 'notFound' };
  if (chain.state === 'removed') return { state: 'removed' };
  if (chain.state === 'abandoned') return { state: 'notFound' };
  const participant = isParticipant(chain, viewer.openid);
  if (chain.state === 'revealed') return { state: participant ? 'revealedParticipant' : 'revealedTeaser' };
  if (chain.state === 'expired') return { state: 'expired' };
  const can = canClaim(chain, viewer);
  if (can.ok) return { state: 'claimable' };
  const map = {
    PENDING: 'pending',
    TAKEN: 'taken',
    PREV_MINE: 'prevMine',
    CAP_REACHED: 'capReached',
    STEP_LIMIT: 'capReached',
    CLAIM_LIMIT: 'capReached',
    WRONG_GROUP: 'wrongGroup',
    NEED_GROUP: 'wrongGroup',
    RESTRICTED: 'restricted',
    RULES_REQUIRED: 'rulesRequired',
    UGC_PAUSED: 'ugcPaused',
    CHAIN_CLOSED: 'notFound',
  };
  return { state: map[can.code] || 'notFound', code: can.code, until: can.until };
}

// ---------------------------------------------------------------- turn timer (client)

function timerSeconds(kind, cfg) {
  const t = (cfg && cfg.timers) || CONFIG.timers;
  return kind === 'draw' ? t.drawSec : t.describeSec;
}

/** Wall-clock countdown for a turn that started at `startedAt` (spec 3.5, 8.4: keeps running in the background). */
function turnTimer(kind, startedAt, now, cfg) {
  const total = timerSeconds(kind, cfg);
  const left = Math.max(0, Math.ceil((startedAt + total * 1000 - now) / 1000));
  const warnSec = ((cfg && cfg.timers) || CONFIG.timers).warnSec;
  return { secLeft: left, warn: left <= warnSec && left > 0, over: left <= 0, total };
}

/** What happens when the timer ends (AC 14): a drawing with >= 1 stroke or a text with >= 2 valid characters is submitted. */
function timeUpAction(kind, o) {
  if (kind === 'draw') return o.strokes >= 1 ? 'submit' : 'release';
  return o.chars >= CONFIG.text.descMin ? 'submit' : 'release';
}

function mmss(sec) {
  const s = Math.max(0, sec | 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

module.exports = {
  kindOfStep,
  isTerminal,
  newChain,
  claimActive,
  isParticipant,
  canClaim,
  claim,
  release,
  checkSubmit,
  markPending,
  passStep,
  dropPending,
  reveal,
  canRevealNow,
  revealNow,
  reopenStep,
  remove,
  sweep,
  entryState,
  turnTimer,
  timeUpAction,
  mmss,
  TERMINAL,
};
