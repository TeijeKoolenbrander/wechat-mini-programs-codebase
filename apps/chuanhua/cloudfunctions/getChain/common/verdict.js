'use strict';
// Image verdicts (spec 6.3 step 6, AC 44-48). One code path for the real push (onMediaCheck), the mock verdicts that
// modSweeper delivers in dev, and nothing else. The decision comes from core/moderation.planVerdict; everything that
// changes (trace, step, chain, author's strike or streak) commits in ONE transaction, so a duplicate push can never
// apply twice and a verdict can never half-apply.
const chainLib = require('../core/chain');
const allowance = require('../core/allowance');
const mod = require('../core/moderation');
const store = require('./store');
const players = require('./players');
const modio = require('./modio');
const lifecycle = require('./lifecycle');
const { now, sleep } = require('./util');

const { STEP } = chainLib;

/**
 * @param {{traceId:string, suggest:*, label?:*}} v
 * @returns {Promise<{ok:true, applied:boolean, ignored?:string}>}
 */
async function applyImageVerdict(v) {
  const { traceId, suggest } = v;
  if (typeof traceId !== 'string' || !traceId || traceId.length > 128) return { ok: true, applied: false, ignored: 'unknown' };
  const trace = await store.getDoc('mod_traces', traceId);
  if (!trace) return { ok: true, applied: false, ignored: 'unknown' };
  // the push can race the submitStep transaction that creates the step: give it a moment (only for a fresh trace)
  let probe = await store.getDoc('steps', trace.stepId);
  for (let i = 0; i < 3 && !probe && now() - trace.submittedAt < 30000; i++) {
    await sleep(400);
    probe = await store.getDoc('steps', trace.stepId);
  }
  if (!probe) return { ok: true, applied: false, ignored: 'unknown' };

  const out = await store.txn(async (t) => {
    const tr = await store.getDocT(t, 'mod_traces', traceId);
    if (!tr || tr.done) return { kind: 'duplicate' };
    const st = await store.getDocT(t, 'steps', trace.stepId);
    const plan = mod.planVerdict(st && st.state, suggest);
    if (plan.reason === 'badSuggest' || plan.reason === 'unknown') return { kind: 'ignored', reason: plan.reason }; // not a verdict: stays pending, nothing marked done
    await players.putT(t, 'mod_traces', traceId, Object.assign({}, tr, { done: true, suggest, verdictAt: now() }));
    if (plan.action !== 'apply') {
      let strike = null;
      if (plan.strike) strike = await players.strikeT(t, st.author, st._id, 'verdict'); // a late risky on a voided step: strike, no visibility change
      return { kind: 'ignored', reason: plan.reason, step: st, strike };
    }
    const chain = await store.getDocT(t, 'chains', st.chainId);
    const res = chain ? chainLib.resolvePending(chain, { stepId: st._id, outcome: plan.outcome, now: now() }) : { stale: true };
    const next = Object.assign({}, st, {
      state: plan.outcome === 'passed' ? STEP.PASSED : STEP.BLOCKED,
      mod: Object.assign({}, st.mod, { suggest, label: v.label === undefined ? null : v.label, verdictAt: now() }),
    });
    await players.putT(t, 'steps', st._id, next);
    if (!res.stale) await players.putT(t, 'chains', chain._id, res.chain);
    let strike = null;
    if (plan.strike) strike = await players.strikeT(t, st.author, st._id, 'verdict');
    else if (plan.outcome === 'passed' && !res.stale) {
      const p = await players.getT(t, st.author);
      await players.putPlayerT(t, allowance.advanceStreak(p, players.dateKey()));
    }
    return { kind: 'applied', step: next, chain: res.stale ? null : res.chain, revealed: !!res.revealed, plan, strike, stale: !!res.stale };
  });

  if (out.kind === 'duplicate') return { ok: true, applied: false, ignored: 'duplicate' };
  if (out.kind === 'ignored') {
    if (out.step) {
      await modio.logMod({ stepId: out.step._id, author: out.step.author, kind: 'image', fileID: out.step.fileID || null, suggest, label: v.label === undefined ? null : v.label, source: trace.mock ? 'mock' : 'api' });
    }
    if (out.strike) await emitStrike(out.step.author, out.strike);
    return { ok: true, applied: false, ignored: out.reason };
  }
  await modio.logMod({ stepId: out.step._id, author: out.step.author, kind: 'image', fileID: out.step.fileID || null, suggest, label: v.label === undefined ? null : v.label, source: trace.mock ? 'mock' : 'api' });
  if (out.strike) await emitStrike(out.step.author, out.strike);
  if (out.plan.outcome === 'passed' && out.chain) await lifecycle.onPassed(out.chain, out.step, out.revealed);
  await store.writeEvent(null, 'mod_verdict', { kind: 'image', suggest: String(suggest), mock: !!trace.mock });
  return { ok: true, applied: true, stale: out.stale };
}

async function emitStrike(openid, r) {
  await store.writeEvent(openid, 'strike', { src: 'verdict', level: r.count });
  if (r.restrictMs > 0) await store.writeEvent(openid, 'restrict', { src: 'verdict', level: r.count });
}

module.exports = { applyImageVerdict, emitStrike };
