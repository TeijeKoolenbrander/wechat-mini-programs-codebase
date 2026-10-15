'use strict';
// Transactional state transitions shared by submitStep, the verdict handler, modSweeper, report,
// deleteMyStep, revealNow and admin. Every function takes a transaction `t` and mutates documents
// through it; callers run them inside store.txn(). Player documents go through a PlayerCache so a
// player touched twice in one transaction is written once.
const store = require('./store');
const chainLib = require('./chain');
const players = require('./players');
const { CHAIN_LENGTH, bjtHour, bjtMidnightMs, HOUR_MS, DAY_MS, dateKeyAt } = require('./util');

function makePlayerCache(t, nowMs) {
  const m = new Map();
  return {
    async get(openid) {
      if (!m.has(openid)) m.set(openid, await players.loadPlayerT(t, openid, nowMs));
      return m.get(openid);
    },
    async flush() {
      for (const p of m.values()) await store.putT(t, 'players', p);
    },
  };
}

async function bumpAggT(t, col, id, initial, mutate) {
  const d = (await store.getDocT(t, col, id)) || { _id: id, ...initial };
  mutate(d);
  await store.putT(t, col, d);
}

/** 08:00 BJT hold for reveal notices sent in quiet hours 22:00-08:00 (PO-26, AC 78). */
function noticeDueAt(ms) {
  const h = bjtHour(ms);
  if (h >= 8 && h < 22) return ms;
  const midnight = bjtMidnightMs(ms);
  return h < 8 ? midnight + 8 * HOUR_MS : midnight + DAY_MS + 8 * HOUR_MS;
}

/** Reveal a chain (complete | early | expiry) and book the aggregate stats. Mutates `chain`. */
async function finalizeRevealT(t, chain, reason, nowMs, pc) {
  chain.state = 'revealed';
  chain.revealedAt = nowMs;
  chain.revealReason = reason;
  chain.claim = null;
  chain.pending = null;
  chain.noticeDue = noticeDueAt(nowMs);
  chain.noticeSent = false;
  chain.lastActivityAt = nowMs;
  const dk = dateKeyAt(nowMs);
  await bumpAggT(t, 'daily_stats', dk, { started: 0, revealed: 0, byPrompt: {} }, (d) => { d.revealed = (d.revealed || 0) + 1; });
  if (chain.openGId) {
    await bumpAggT(t, 'group_stats', chain.openGId, { started: 0, revealed: 0, drawings: 0, lastActivityAt: nowMs }, (d) => {
      d.revealed = (d.revealed || 0) + 1;
      d.lastActivityAt = nowMs;
    });
  }
  for (const o of chain.participants) {
    const p = await pc.get(o);
    p.lifetimeReveals = (p.lifetimeReveals || 0) + 1;
  }
}

/** Stats booked when a 棒 passes. */
async function bookPassStatsT(t, chain, step, nowMs) {
  const dk = dateKeyAt(nowMs);
  if (step.n === 1) {
    await bumpAggT(t, 'daily_stats', dk, { started: 0, revealed: 0, byPrompt: {} }, (d) => {
      d.started = (d.started || 0) + 1;
      if (chain.promptId && !chain.custom) {
        d.byPrompt = d.byPrompt || {};
        d.byPrompt[chain.promptId] = (d.byPrompt[chain.promptId] || 0) + 1;
      }
    });
  }
  if (chain.openGId) {
    await bumpAggT(t, 'group_stats', chain.openGId, { started: 0, revealed: 0, drawings: 0, lastActivityAt: nowMs }, (d) => {
      if (step.n === 1) d.started = (d.started || 0) + 1;
      if (step.kind === 'draw') d.drawings = (d.drawings || 0) + 1;
      d.lastActivityAt = nowMs;
    });
  }
}

/** A group binds late (first claim with group context): book what already passed. */
async function bookBindStatsT(t, chain, nowMs) {
  if (!chain.passed) return;
  const draws = Math.ceil(chain.passed / 2);
  await bumpAggT(t, 'group_stats', chain.openGId, { started: 0, revealed: 0, drawings: 0, lastActivityAt: nowMs }, (d) => {
    d.started = (d.started || 0) + 1;
    d.drawings = (d.drawings || 0) + draws;
    d.lastActivityAt = nowMs;
  });
}

/**
 * A 棒 passed moderation. Sets step.state, advances the chain (revealing on 第 6 棒), updates the
 * author's streak. Returns {revealed}. Caller persists chain, step and pc.
 */
async function passStepT(t, { chain, step, nowMs, pc }) {
  step.state = 'passed';
  const last = chainLib.applyPassed(chain, step, nowMs);
  const author = await pc.get(step.author);
  players.noteStepPassed(author, dateKeyAt(nowMs));
  if (chain.state === 'removed') return { revealed: false };
  await bookPassStatsT(t, chain, step, nowMs);
  if (last) await finalizeRevealT(t, chain, 'complete', nowMs, pc);
  return { revealed: last };
}

/** A drawing was blocked (review/risky) or voided (system fault): the 棒 reopens. */
async function failStepT(t, { chain, step, outcome, nowMs, pc }) {
  step.state = outcome; // 'blocked' | 'void'
  if (chain.pending && chain.pending.stepId === step._id) {
    chainLib.applyReopenAfterFailure(chain, step, nowMs);
  }
  if (outcome === 'void') {
    const author = await pc.get(step.author);
    players.refundVoid(author, step);
  }
}

/**
 * Hide (report/admin) or delete (author) a passed 棒. In a still-open chain the latest passed 棒
 * reopens and any claim on the next 棒 is cancelled. Returns {reopened, cancelledClaim}.
 */
function hideStepT(chain, step, { to, reason, nowMs }) {
  step.state = to; // 'hidden' | 'deleted'
  if (reason) step.hiddenReason = reason;
  if (to === 'deleted') { step.strokes = null; step.text = null; }
  const isLatest = chain.stepIds[chain.passed] === step._id && chain.state === 'open';
  if (!isLatest) return { reopened: null, cancelledClaim: null };
  return chainLib.reopenLatest(chain, nowMs);
}

/** One strike for a player outside any other transaction (blocked text, custom prompt). Idempotent per key. */
async function strikePlayer(openid, key, src, nowMs) {
  let res = null;
  await store.txn(async (t) => {
    const p = await players.loadPlayerT(t, openid, nowMs);
    res = players.addStrike(p, key, src, nowMs);
    await store.putT(t, 'players', p);
  });
  if (res && res.added) await store.writeEvent(openid, 'strike', { src, level: res.level });
  return res;
}

module.exports = {
  strikePlayer, makePlayerCache, bumpAggT, noticeDueAt, finalizeRevealT, bookPassStatsT, bookBindStatsT,
  passStepT, failStepT, hideStepT, CHAIN_LENGTH,
};
