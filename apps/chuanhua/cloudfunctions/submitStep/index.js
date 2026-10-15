'use strict';
// submitStep (spec 3.5, 6.2, 6.3, AC 1, 12, 15, 37-47). Identity from the context only.
//   text:    local rules -> msgSecCheck (sync) -> pass: step is `passed` at once; review/risky: TEXT_BLOCKED
//   drawing: validate strokes -> step is stored `pending` (unseen by everyone but the author) ->
//            server PNG -> mediaCheckAsync; the verdict arrives later (onMediaCheck / modSweeper).
// Idempotent per claimId: a repeat returns the stored result.
const store = require('./common/store');
const chainLib = require('./common/chain');
const players = require('./common/players');
const lifecycle = require('./common/lifecycle');
const moderation = require('./common/moderation');
const activity = require('./common/activity');
const core = require('./common/coreapi');
const input = require('./common/input');
const { validateStrokes, countPoints } = require('./common/strokes');
const { validateText } = require('./common/text');
const { LIMITS } = require('./common/config');
const { ugcContext } = require('./common/guard');
const { AppError, fail, kindOfStep, isInt } = require('./common/util');

function shape(step, chain) {
  const state = step.state === 'passed' ? 'passed' : step.state === 'pending' ? 'pending' : step.state;
  return { ok: true, state, step: step.n, chainState: chain.state, revealed: chain.state === 'revealed' };
}

/** The claim must still be ours. Lazy expiry: an expired claim is fine as long as nobody replaced it (AC 12). */
function ownsClaim(chain, openid, claimId) {
  return !!chain.claim && chain.claim.claimId === claimId && chain.claim.openid === openid;
}

exports.main = store.handler(async (event, { openid }) => {
  const { nowMs, dateKey } = await ugcContext({ create: true });
  const chainId = input.chainId(event.chainId);
  const claimId = input.claimId(event.claimId);
  const hasText = event.text !== undefined && event.text !== null;
  const hasStrokes = event.strokes !== undefined && event.strokes !== null;
  if (hasText === hasStrokes) fail('BAD_INPUT', 'exactly one of text or strokes');
  const clientMs = input.optInt(event.clientMs, 0, 36e5, null);
  const undoCount = input.optInt(event.undoCount, 0, 100000, null);
  await store.rateLimit(openid, 'submit', 1, 10);

  const chain0 = await store.getDoc('chains', chainId);
  if (!chain0) fail('CHAIN_NOT_FOUND', 'chain not found');

  // idempotent replay
  const prior = chain0.submits && chain0.submits[claimId];
  if (prior) {
    const st = await store.getDoc('steps', prior.stepId);
    if (st && st.author === openid) return shape(st, chain0);
  }
  if (!ownsClaim(chain0, openid, claimId)) fail('CLAIM_LOST', 'claim lost');
  if (!['starting', 'open'].includes(chain0.state) || chain0.hidden) fail('CHAIN_CLOSED', 'chain closed');
  const n = chain0.claim.step;
  if (n !== chain0.nextStep) fail('CLAIM_LOST', 'claim lost');
  const kind = kindOfStep(n);
  if ((kind === 'draw') !== hasStrokes) fail('WRONG_KIND', `step ${n} expects ${kind === 'draw' ? 'strokes' : 'text'}`);

  // a restriction that predates this claim blocks the submit; one imposed mid-turn lets the claim finish (edge 19)
  const p0 = await players.loadPlayer(openid, nowMs);
  const rs = players.restriction(p0, nowMs);
  if (rs && !(p0.restrictedAt > chain0.claim.at)) fail('RESTRICTED', 'restricted', { until: rs.until, permanent: rs.permanent });
  if ((p0.rulesVersion || 0) < LIMITS.rulesVersion) fail('RULES_REQUIRED', 'rules not agreed');

  if (kind === 'describe') return submitText({ openid, chainId, claimId, n, text: event.text, nowMs, dateKey, clientMs, undoCount });
  return submitDrawing({ openid, chainId, claimId, n, strokes: event.strokes, nowMs, dateKey, clientMs, undoCount });
});

function newStepDoc(chain, openid, n, claimId, nowMs, dateKey, extra) {
  const attempt = chain.attempts + 1;
  return {
    _id: `${chain._id}_${n}_${attempt}`,
    chainId: chain._id, n, attempt, kind: kindOfStep(n), author: openid, claimId, laughs: 0,
    createdAt: nowMs, dateKey, ...extra,
  };
}

/** Common bookkeeping inside the transaction once the claim is verified. Returns the step or a stored result. */
async function openAttempt(t, { chainId, openid, claimId, n, nowMs, dateKey, pc }) {
  const chain = await store.getDocT(t, 'chains', chainId);
  if (!chain) throw new AppError('CHAIN_NOT_FOUND', 'chain not found');
  const prior = chain.submits && chain.submits[claimId];
  if (prior) return { chain, prior };
  if (!ownsClaim(chain, openid, claimId) || chain.claim.step !== n || n !== chain.nextStep) throw new AppError('CLAIM_LOST', 'claim lost');
  if (!['starting', 'open'].includes(chain.state) || chain.hidden) throw new AppError('CHAIN_CLOSED', 'chain closed');
  const player = await pc.get(openid);
  players.dayOf(player, dateKey);
  if (player.day.steps >= LIMITS.stepsPerDay) throw new AppError('STEP_LIMIT', 'daily step limit');
  if (n === 1 && players.startsLeft(player, dateKey) < 1) throw new AppError('START_LIMIT', 'no starts left today');
  return { chain, player };
}

function bookAttempt(chain, step, player, claimId, nowMs) {
  chain.attempts = step.attempt;
  chain.submits[claimId] = { stepId: step._id, n: step.n };
  chain.perPersonCount[step.author] = (chain.perPersonCount[step.author] || 0) + 1;
  if (!chain.involved.includes(step.author)) chain.involved.push(step.author);
  chain.lastActivityAt = nowMs;
  player.day.steps += 1;
  if (step.n === 1) player.day.starts += 1; // a start is consumed only now (AC 3)
  player.lastActiveAt = nowMs;
}

async function submitText({ openid, chainId, claimId, n, text, nowMs, dateKey, clientMs, undoCount }) {
  const v = validateText(text, { min: LIMITS.describeMin, max: LIMITS.describeMax, blocklist: core.blocklist() });
  if (!v.ok) fail('TEXT_REJECTED', 'rejected locally'); // no API call, no strike
  const chk = await moderation.checkText(openid, v.text); // MODERATION_BUSY on any failure; nothing stored
  await moderation.writeModLog({
    stepId: `${chainId}_${n}_t${nowMs}`, author: openid, kind: 'text', textCopy: v.text, suggest: chk.suggest, label: chk.label, source: chk.source,
  });
  if (chk.suggest !== 'pass') {
    if (chk.suggest === 'risky') await lifecycle.strikePlayer(openid, `${chainId}_${n}_${nowMs}`, 'verdict', nowMs);
    fail('TEXT_BLOCKED', 'text not accepted'); // the author keeps the claim and retypes
  }
  let result = null;
  let chainOut = null;
  await store.txn(async (t) => {
    result = null;
    const pc = lifecycle.makePlayerCache(t, nowMs);
    const o = await openAttempt(t, { chainId, openid, claimId, n, nowMs, dateKey, pc });
    if (o.prior) { chainOut = o.chain; result = { prior: o.prior }; return; }
    const { chain, player } = o;
    const step = newStepDoc(chain, openid, n, claimId, nowMs, dateKey, {
      text: v.text,
      mod: { kind: 'text', suggest: chk.suggest, label: chk.label, source: chk.source, submittedAt: nowMs, verdictAt: nowMs, retries: 0 },
      clientMs, undoCount,
    });
    bookAttempt(chain, step, player, claimId, nowMs);
    await lifecycle.passStepT(t, { chain, step, nowMs, pc });
    await store.putT(t, 'steps', step);
    await store.putT(t, 'chains', chain);
    await pc.flush();
    chainOut = chain;
    result = { step };
  });
  if (result.prior) {
    const st = await store.getDoc('steps', result.prior.stepId);
    return shape(st, chainOut);
  }
  await store.writeEvent(openid, 'step_result', { step: n, kind: 'describe', result: 'passed' });
  if (chainOut.state === 'revealed') {
    await store.writeEvent(null, 'chain_reveal', { reason: 'complete', passed: chainOut.passed, participants: chainOut.participants.length, durationMin: Math.round((nowMs - chainOut.createdAt) / 60000), custom: chainOut.custom });
  }
  await activity.updateCard(chainOut);
  return shape(result.step, chainOut);
}

async function submitDrawing({ openid, chainId, claimId, n, strokes, nowMs, dateKey, clientMs, undoCount }) {
  const norm = validateStrokes(strokes); // INVALID_STROKES
  await moderation.assertImageCapacity({ forCreate: false }); // 100% of the image quota: fail closed
  let result = null;
  let chainOut = null;
  await store.txn(async (t) => {
    result = null;
    const pc = lifecycle.makePlayerCache(t, nowMs);
    const o = await openAttempt(t, { chainId, openid, claimId, n, nowMs, dateKey, pc });
    if (o.prior) { chainOut = o.chain; result = { prior: o.prior }; return; }
    const { chain, player } = o;
    const step = newStepDoc(chain, openid, n, claimId, nowMs, dateKey, {
      strokes: norm,
      fileID: null,
      state: 'pending',
      mod: { kind: 'image', traceIds: [], submittedAt: nowMs, lastCheckAt: null, callFailed: false, callRetries: 0, nextAttemptAt: null, rechecked: false },
      clientMs, undoCount, points: countPoints(norm),
    });
    bookAttempt(chain, step, player, claimId, nowMs);
    chain.state = 'pending';
    chain.pending = { stepId: step._id, n, author: openid };
    chain.claim = null;
    await store.putT(t, 'steps', step);
    await store.putT(t, 'chains', chain);
    await pc.flush();
    chainOut = chain;
    result = { step };
  });
  if (result.prior) {
    const st = await store.getDoc('steps', result.prior.stepId);
    return shape(st, chainOut);
  }
  await moderation.startMediaCheck(result.step._id); // failures are booked on the step and retried by modSweeper
  const fresh = await store.getDoc('steps', result.step._id);
  const chainNow = await store.getDoc('chains', chainId);
  await store.writeEvent(openid, 'step_result', { step: n, kind: 'draw', result: fresh.state });
  return shape(fresh, chainNow || chainOut);
}
