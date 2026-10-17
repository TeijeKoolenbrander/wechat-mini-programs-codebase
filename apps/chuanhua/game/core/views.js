'use strict';
/**
 * Server-side response builders (spec 3.7, 6.4, 8.7-8.11, 12, 13.2; AC 10, 11, 29, 43, 73, 80, 82, 86, 98). Pure
 * functions from stored documents to the exact objects the cloud functions return, so the real functions, the mock
 * server and the tests share one implementation. Nothing here returns an openid, openGId, nickname, avatar, file id or
 * PNG (AC 29, 73): authorship is reduced to `mine: boolean`.
 *
 * Content (prompt text, 棒 text, strokes) leaves only through claimPrev (the claimant), revealResponse (participants)
 * and teaserView (passed prompt + final sentence). entryView never carries any (AC 10).
 */

const chainLib = require('./chain');
const copy = require('./copy');
const { CONFIG } = require('./config');

const { STATE, STEP } = chainLib;

/** the keys entryView may return: a whitelist that the AC 10 schema test pins */
const ENTRY_KEYS = ['state', 'passed', 'length', 'nextStep', 'nextKind', 'timeLeftMs', 'takenEtaSec', 'isParticipant', 'isStarter',
  'canRevealNow', 'restrictedUntil', 'removedReason', 'pendingStep'];

function isVisible(step) {
  return !!step && step.state === STEP.PASSED;
}

/**
 * getChain response body (never any content).
 * @param {object} chain
 * @param {{openid:string, now:number, rulesOk:boolean, restrictedUntil?:number, ugcOk:boolean, groupOpenGId?:string|null,
 *          memberOfChainGroup?:boolean, stepsToday?:number, claimsOnChainToday?:number}} ctx same context as chain.canClaim
 */
function entryView(chain, ctx) {
  const now = ctx.now;
  const participant = chainLib.isParticipant(chain, ctx.openid);
  const isStarter = chain.starter === ctx.openid;
  const out = {
    state: 'notFound',
    passed: chain.passed,
    length: chain.length,
    nextStep: chain.nextStep,
    nextKind: chain.nextStep ? chainLib.kindOf(chain.nextStep) : null,
    timeLeftMs: null,
    takenEtaSec: null,
    isParticipant: participant,
    isStarter,
    canRevealNow: false,
  };
  if (chain.hidden || chain.state === STATE.REMOVED) {
    out.state = 'removed';
    out.removedReason = chain.hidden ? 'reported' : 'admin';
    return out;
  }
  if (chain.state === STATE.REVEALED) {
    out.state = participant ? 'revealedParticipant' : 'revealedTeaser';
    return out;
  }
  if (chain.state === STATE.EXPIRED) {
    out.state = 'expired';
    return out;
  }
  if (chain.state === STATE.ABANDONED) return out; // notFound
  if (chain.state === STATE.STARTING && !isStarter) return out; // nobody but the starter can know a starting chain

  out.timeLeftMs = Math.max(0, chain.expiresAt - now);
  if (chain.pending) out.pendingStep = chain.pending.n;
  const rev = chainLib.canRevealNow(chain, ctx.openid, now);
  out.canRevealNow = rev.ok;

  const pol = chainLib.policyGate(ctx);
  const ch = chainLib.chainGate(chain, ctx);
  if (ch.code === 'WRONG_GROUP' || ch.code === 'NEED_GROUP') out.state = 'wrongGroup';
  else if (ch.code === 'CHAIN_CLOSED') out.state = 'notFound';
  else if (ch.code === 'IN_ROOM') out.state = 'inRoom';
  else if (ch.code === 'PENDING') out.state = 'pending';
  else if (ch.code === 'TAKEN') {
    out.state = 'taken';
    out.takenEtaSec = ch.etaSec;
  } else if (ch.code === 'PREV_MINE') out.state = 'prevMine';
  else if (ch.code === 'CAP_REACHED') out.state = 'capReached';
  else if (pol) {
    out.state = pol.code === 'RESTRICTED' ? 'restricted' : pol.code === 'UGC_PAUSED' ? 'ugcPaused' : 'rulesRequired';
    if (pol.until) out.restrictedUntil = pol.until;
  } else if (!ch.resume && chainLib.limitGate(ctx)) out.state = 'dailyLimit';
  else out.state = 'claimable';
  return out;
}

/**
 * The previous 棒 handed to the claimant (claimStep, AC 11). Only a `passed` (not hidden/deleted) previous 棒is served; for
 * 棒 1 the source is the prompt. `viewEnabled === false` returns a placeholder and no content (AC 54).
 * @param {object} chain
 * @param {number} step the 棒 being claimed
 * @param {object|null} prevStep the stored step document of 棒 step-1 (null for 棒 1)
 * @returns {{kind:'prompt'|'text'|'draw'|'marker'|'paused'|'gone', text?:string, strokes?:object, marker?:string, hint?:string, canReport:boolean}}
 */
function claimPrev(chain, step, prevStep, viewEnabled) {
  if (!viewEnabled) return { kind: 'paused', canReport: false };
  if (step === 1) return { kind: 'prompt', text: chain.promptText, canReport: false };
  if (!isVisible(prevStep)) return { kind: 'gone', canReport: false };
  if (prevStep.marker) {
    return { kind: 'marker', marker: prevStep.marker, text: copy.markerText(prevStep.marker), hint: copy.markerHint(prevStep.marker, chainLib.kindOf(step)), canReport: false };
  }
  if (prevStep.kind === 'draw') return { kind: 'draw', strokes: prevStep.strokes, canReport: true };
  return { kind: 'text', text: prevStep.text, canReport: true };
}

/** latest visible sentence (passed text 棒) of a chain, from the step documents */
function finalSentence(chain, stepsByN) {
  for (let n = chain.length; n >= 1; n--) {
    const s = stepsByN[n];
    if (chainLib.kindOf(n) === 'describe' && isVisible(s) && !s.marker) return s.text;
  }
  return null;
}

/**
 * Teaser for non-participants (3.7, 8.9): passed prompt and final sentence, the number of 棒, nothing else.
 * `stepsByN`: {n: stepDoc} for the chain's recorded 棒.
 */
function teaserView(chain, stepsByN, viewEnabled) {
  const paused = viewEnabled === false;
  return {
    chainId: chain._id,
    promptText: paused ? null : chain.promptText,
    finalText: paused ? null : finalSentence(chain, stepsByN),
    passed: chain.passed,
    paused,
  };
}

/**
 * getReveal (3.7, 8.8, AC 80-86). Participants get the strip; everyone else gets {ok:false, code:'NOT_PARTICIPANT', teaser}.
 * @param {object} chain
 * @param {Object<number,object>} stepsByN stored step docs by 棒 number (state passed|hidden|deleted)
 * @param {{openid:string, viewEnabled:boolean, myLaughs?:Object<string,boolean>}} o
 */
function revealResponse(chain, stepsByN, o) {
  if (chain.hidden || chain.state === STATE.REMOVED) return { ok: false, code: 'CHAIN_CLOSED', state: 'removed', removedReason: chain.hidden ? 'reported' : 'admin' };
  if (chain.state !== STATE.REVEALED) return { ok: false, code: 'CHAIN_CLOSED', state: chain.state };
  if (!chainLib.isParticipant(chain, o.openid)) {
    return { ok: false, code: 'NOT_PARTICIPANT', teaser: teaserView(chain, stepsByN, o.viewEnabled) };
  }
  const steps = [];
  for (let n = 1; n <= chain.length; n++) {
    const s = stepsByN[n];
    if (!chain.stepIds[n] || !s) continue;
    const kind = chainLib.kindOf(n);
    const mine = chain.authors[n] === o.openid;
    const row = { n, kind, mine, placeholder: null, laughs: 0, myLaugh: false, canReport: false, canLaugh: false };
    if (s.state === STEP.HIDDEN) row.placeholder = 'reported';
    else if (s.state === STEP.DELETED) row.placeholder = 'deleted';
    else if (s.state !== STEP.PASSED) row.placeholder = 'reported';
    else if (!o.viewEnabled) row.placeholder = 'paused';
    if (!row.placeholder && s.marker) {
      row.marker = s.marker; // fixed system text: no report, no 笑, no delete (5.8)
      row.text = copy.markerText(s.marker);
    } else if (!row.placeholder) {
      if (kind === 'draw') row.strokes = s.strokes;
      else row.text = s.text;
      row.laughs = s.laughs || 0;
      row.myLaugh = !!(o.myLaughs && o.myLaughs[s._id]);
      row.canReport = !mine;
      row.canLaugh = true;
    }
    steps.push(row);
  }
  return {
    ok: true,
    chainId: chain._id,
    mode: chain.mode === 'live' ? 'live' : 'chain',
    state: 'revealed',
    reason: chain.revealReason,
    early: chain.revealReason !== 'complete',
    length: chain.length,
    passed: chain.passed,
    participantCount: chain.participants.length,
    durationMs: Math.max(0, (chain.revealedAt || chain.createdAt) - chain.createdAt),
    prompt: o.viewEnabled
      ? { text: chain.promptText, custom: chain.custom, mine: chain.starter === o.openid, canReport: chain.custom && chain.starter !== o.openid }
      : { text: null, custom: chain.custom, mine: chain.starter === o.openid, canReport: false },
    steps,
  };
}

/** one 本群接龙 row classification for a viewer (8.10, AC 98). Reasons for "进行中": pending, taken, prevMine, capReached, dailyLimit. */
function groupRow(chain, ctx) {
  const e = entryView(chain, ctx);
  if (e.state === 'removed' || e.state === 'notFound' || e.state === 'wrongGroup') return null;
  if (e.state === 'revealedParticipant' || e.state === 'revealedTeaser') {
    return { section: 'revealed', chainId: chain._id, participant: e.state === 'revealedParticipant', revealedAt: chain.revealedAt };
  }
  if (e.state === 'expired') return null;
  const base = { chainId: chain._id, nextStep: e.nextStep, nextKind: e.nextKind, passed: e.passed, lastActivityAt: chain.lastActivityAt };
  if (e.state === 'claimable' || e.state === 'rulesRequired') return { section: 'waiting', ...base };
  return { section: 'inProgress', reason: e.state, ...base };
}

/** aggregate line for the group (10.1): counts only, no people */
function groupStatsView(stats) {
  const s = stats || {};
  return { started: s.started || 0, revealed: s.revealed || 0, drawings: s.drawings || 0, rooms: s.rooms || 0 };
}

/**
 * 我的接龙 row (8.11) for a player who started or authored a 棒. Own 棒 only; the prompt is shown when the chain is
 * revealed or the viewer started it (an author of 棒 3 never saw the prompt, decisions TD-9).
 * @param {object} chain
 * @param {Object<number,object>} mineSteps the viewer's own step docs by 棒 (any state)
 * @param {string} openid
 */
function albumItem(chain, mineSteps, openid) {
  const mine = Object.keys(mineSteps).map((k) => {
    const s = mineSteps[k];
    const row = { n: s.n, kind: s.kind, modState: s.state === STEP.HIDDEN ? 'hidden' : s.state, canDelete: s.state === STEP.PASSED && !s.marker };
    if (s.marker) row.marker = s.marker;
    return row;
  }).sort((a, b) => a.n - b.n);
  let status;
  if (chain.hidden || chain.state === STATE.REMOVED) status = 'removed';
  else if (chain.state === STATE.REVEALED) status = 'revealed';
  else if (chain.state === STATE.EXPIRED) status = 'expired';
  else if (mine.some((m) => m.modState === 'pending')) status = 'pending';
  else if (mine.length && mine.every((m) => m.modState === 'blocked' || m.modState === 'void')) status = 'blocked';
  else status = 'open';
  const showPrompt = status === 'revealed' || (chain.starter === openid && status !== 'removed');
  return {
    kind: 'chain',
    chainId: chain._id,
    status,
    passed: chain.passed,
    length: chain.length,
    promptText: showPrompt ? chain.promptText : null,
    finalText: null,
    mine,
    lastActivityAt: chain.lastActivityAt,
    revealedAt: chain.revealedAt,
    unseen: chain.state === STATE.REVEALED && chainLib.isParticipant(chain, openid) && !chain.revealViewed.includes(openid),
    isStarter: chain.starter === openid,
  };
}

module.exports = { ENTRY_KEYS, entryView, claimPrev, teaserView, revealResponse, groupRow, groupStatsView, albumItem, finalSentence, CONFIG };
