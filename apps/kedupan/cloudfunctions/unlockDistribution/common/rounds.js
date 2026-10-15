'use strict';
// Host rounds (PD-8, PD-9, spec 2.2, 3.5, 11.2): the state machine, reveal payload and subscribe messages.
// States: draft -> open -> revealed | noGuesses. The target never leaves the server for a non-host before the reveal.
const core = require('./coreapi');
const store = require('./store');
const groups = require('./groups');
const { AppError, fail, now, sha256hex } = require('./util');

const HOUR = 3600e3;
const R = core.cfg(); // host-round rules live in core/config.js (rounds.*)
const DRAFT_TTL_MS = R.draftMs;
const AUTO_REVEAL_MS = R.autoRevealMs;
const GUESS_WINDOW_MS = R.guessWindowMs;
const MIN_TO_REVEAL = R.revealMinGuesses;
const AUTO_REVEAL_AT = R.autoRevealAt;
const GUESS_CAP_PER_ROUND_READ = 2000;

const hashOf = (openid, salt) => sha256hex(`${openid}|${salt}`).slice(0, 12);

/** load a round the caller may see: drafts exist for their host only, and are discarded after 30 minutes */
async function loadRound(roundId, openid, nowMs) {
  const r = await store.getDoc('rounds', roundId);
  if (!r) fail('ROUND_NOT_FOUND', 'no such round');
  if (r.status === 'draft' && (r.hostOpenid !== openid || nowMs > r.createdAt + DRAFT_TTL_MS)) fail('ROUND_NOT_FOUND', 'no such round');
  return r;
}

/** score of a guess against the target */
const guessScore = (pos, target) => core.cardScore(Math.abs(pos - target));

/** 本题默契值 (core/score.js roundMq: rounded mean of the on-time scores) */
function computeMq(onTime, target) {
  return core.roundMq(onTime.map((g) => ({ pos: g.pos, late: false })), target);
}

async function loadGuesses(roundId) {
  return store.queryAll('guesses', { roundId }, { max: GUESS_CAP_PER_ROUND_READ });
}

/** the revealed view: everything is derived from the stored guesses; no names, hashed rows only */
async function revealPayload(round, openid) {
  const guesses = await loadGuesses(round._id);
  const onTime = guesses.filter((g) => !g.late).sort((a, b) => a.ts - b.ts || (a._id < b._id ? -1 : 1));
  const late = guesses.filter((g) => g.late).sort((a, b) => a.ts - b.ts);
  const mq = round.mq != null ? round.mq : computeMq(onTime, round.target);
  // 最懂你: smallest distance, ties -> earliest guess (core/score.js bestGuess; onTime is ordered by time)
  const best = core.bestGuess(onTime.map((g) => ({ pos: g.pos, ts: g.ts, late: false, ref: g })), round.target);
  const bestG = best ? best.ref : null;
  const row = (g) => [hashOf(g.openid, round.salt), g.pos, guessScore(g.pos, round.target), !!g.late, false];
  const rows = [
    [hashOf(round.hostOpenid, round.salt), null, null, false, true],
    ...onTime.map(row),
    ...late.map(row),
  ];
  return {
    status: round.status, target: round.target, mq, salt: round.salt, selfHash: hashOf(openid, round.salt),
    bestH: bestG ? hashOf(bestG.openid, round.salt) : null, guesses: onTime.length, rows,
  };
}

/**
 * Side effects of the call that flipped the status (exactly one such call per round): final mq + server event.
 * No further on-time guess can land afterwards (submitGuess checks status inside its transaction).
 */
async function finishReveal(round) {
  if (round.status === 'revealed') {
    const guesses = (await loadGuesses(round._id)).filter((g) => !g.late);
    const mq = computeMq(guesses, round.target);
    await store.db().collection('rounds').doc(round._id).update({ data: { mq } });
    round.mq = mq;
  }
  await store.writeEvent('server', 'round_reveal', {
    roundId: round._id, by: round.revealBy, guesses: round.guessCount, mq: round.mq == null ? null : round.mq, status: round.status,
  });
}

/**
 * Flip an open round to revealed / noGuesses exactly once. `by`: 'host' | 'count' | 'timer'.
 * The status flip is a transaction on the round document, so concurrent reveal paths produce ONE winner.
 * Returns {flipped, round}.
 */
async function flipReveal(roundId, by, nowMs = now()) {
  const res = await store.db().runTransaction(async (t) => {
    const r = await store.getDocT(t, 'rounds', roundId);
    if (!r) throw new AppError('ROUND_NOT_FOUND', 'no such round');
    if (r.status !== 'open') return { flipped: false, round: r };
    if (by === 'host' && r.guessCount < MIN_TO_REVEAL) throw new AppError('TOO_FEW_GUESSES', 'need at least 2 guesses', { guessCount: r.guessCount });
    const status = by === 'timer' && r.guessCount === 0 ? 'noGuesses' : 'revealed';
    const upd = { status, revealedAt: nowMs, revealBy: by };
    await t.collection('rounds').doc(roundId).update({ data: upd });
    return { flipped: true, round: { ...r, ...upd } };
  });
  if (res.flipped) await finishReveal(res.round);
  return res;
}

/** lazy 24 h rule: any read/write of an open round older than 24 h reveals it first */
async function lazyReveal(round, nowMs = now()) {
  if (round.status === 'open' && nowMs > round.createdAt + AUTO_REVEAL_MS) {
    const r = await flipReveal(round._id, 'timer', nowMs);
    if (r.flipped) await notifyRound(r.round, { budgetMs: 2000 });
    return r.round;
  }
  return round;
}

// ---------------- subscribe messages (PD-13, spec 7.4) ----------------
function fmtBjt(ms) {
  const d = new Date(ms + 8 * HOUR);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function sendFn() {
  const { cloud } = store;
  return cloud.openapi && cloud.openapi.subscribeMessage && cloud.openapi.subscribeMessage.send
    ? (a) => cloud.openapi.subscribeMessage.send(a)
    : null;
}

/**
 * Claim every unused grant for the round (transaction per grant => at most ONE message per grant even if
 * the host tap, the 8th guess and the hourly sweep race), then send. Best effort within `budgetMs`;
 * whatever is left is picked up by sweepRounds. No names or openids in the message.
 */
async function notifyRound(round, { budgetMs = 2000 } = {}) {
  if (round.status !== 'revealed') return { sent: 0 };
  const cfg = await store.getAppConfig();
  const sub = cfg.subscribe;
  const send = sendFn();
  if (!sub || !sub.tmplId || !sub.fields || !send) return { sent: 0 };
  const deadline = now() + budgetMs;
  const grants = (await store.db().collection('sub_grants').where({ roundId: round._id, used: false }).limit(100).get()).data;
  let sent = 0;
  for (const g of grants) {
    if (now() >= deadline) break;
    const claimed = await store.db().runTransaction(async (t) => {
      const cur = await store.getDocT(t, 'sub_grants', g._id);
      if (!cur || cur.used) return false;
      await t.collection('sub_grants').doc(g._id).update({ data: { used: true, sentAt: now() } });
      return true;
    });
    if (!claimed) continue;
    const f = sub.fields;
    const data = {
      [f.topic]: { value: `${round.left}↔${round.right}`.slice(0, 20) },
      [f.result]: { value: `本题默契值 ${round.mq == null ? '-' : round.mq}`.slice(0, 20) },
      [f.time]: { value: fmtBjt(now()) },
    };
    try {
      await send({ touser: g.openid, templateId: sub.tmplId, page: `index?r=${round._id}`, data, miniprogramState: sub.state || 'formal' });
      sent++;
    } catch (e) {
      await store.db().collection('sub_grants').doc(g._id).update({ data: { sendErrCode: e && (e.errCode || e.code) ? String(e.errCode || e.code) : 'ERR' } }).catch(() => {});
    }
  }
  if (sent) await store.writeEvent('server', 'subscribe_send', { roundId: round._id, sent });
  return { sent };
}

module.exports = {
  DRAFT_TTL_MS, AUTO_REVEAL_MS, GUESS_WINDOW_MS, MIN_TO_REVEAL, AUTO_REVEAL_AT,
  hashOf, loadRound, guessScore, computeMq, loadGuesses, revealPayload, finishReveal, flipReveal, lazyReveal, notifyRound, groups,
};
