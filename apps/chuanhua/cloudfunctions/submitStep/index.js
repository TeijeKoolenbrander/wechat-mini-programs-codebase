'use strict';
// submitStep: hand in a 棒 of a 慢慢传 chain (spec 3.5, 5.8, 6.2, 6.3, AC 1, 12, 15, 37-41, 128-134, 152-153). Idempotent per claimId.
//   describe 棒: local rules -> game msgSecCheck (synchronous) -> transaction (step passed, chain advances, 棒 6 reveals)
//   draw 棒:     validate -> rasterise PNG (512 x round(512 h/1024)) -> cloud storage -> temp URL -> mediaCheckSync (5 s) -> the same transaction.
//                Nothing unchecked is ever visible: block / error / timeout leave the 棒 undelivered.
//                imageMode 'async' (the dormant fallback, 6.10): the v1 pipeline, mediaCheckAsync -> `pending` -> verdict by push.
//   forced send (`auto: true`, F-4): nothing to send (0 strokes / < 2 valid characters / `empty`) -> a MARKER step 「（没来得及画）」/「（没来得及写）」 that passes
//                the 棒 on without any check; a send that is blocked, rejected or errors -> the claim is released and the 棒 REOPENS for anyone eligible (the author
//                sees "这一棒没通过内容审核" in 我的接龙). Before time-up a block just returns the error and the author keeps the claim and the work.
// All state changes of one submit commit in ONE transaction (chain, step, player); the moderation calls sit outside it.
const { CONFIG } = require('./core/config');
const chainLib = require('./core/chain');
const allowance = require('./core/allowance');
const strikes = require('./core/strikes');
const text = require('./core/text');
const copy = require('./core/copy');
const strokesLib = require('./core/strokes');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const modio = require('./common/modio');
const lifecycle = require('./common/lifecycle');
const env = require('./common/env');
const raster = require('./common/raster');
const { bad, errResp } = require('./common/errors');
const { chainIdOf, claimIdOf } = require('./common/input');
const { now } = require('./common/util');

const { STEP } = chainLib;
const clone = (o) => JSON.parse(JSON.stringify(o));

/** the stored result of an earlier submit with this claimId (index chainId + claimId) */
async function storedResult(chainId, claimId, openid) {
  const r = await store.coll('steps').where({ chainId, claimId }).limit(10).get();
  const s = (r.data || []).find((x) => x.author === openid && x.result);
  return s ? Object.assign({ ok: true }, s.result) : null;
}

exports.main = store.handler(async (event, { openid }) => {
  const e = env.ugcGuard();
  await store.rateLimit(openid, 'submit', 1, 30);
  const chainId = chainIdOf(event);
  const chain = chainId && (await store.getDoc('chains', chainId));
  if (!chain || chain.mode === 'live') bad('CHAIN_NOT_FOUND');
  const claimId = claimIdOf(event);
  const prior = await storedResult(chainId, claimId, openid); // idempotent per claimId (17.3)
  if (prior) return prior;

  const p = await players.touch(openid);
  if (p.rulesVersion < CONFIG.rulesVersion) bad('RULES_REQUIRED');
  const cfg = await appconfig.get();
  if (!appconfig.createAllowed(cfg).ok) bad('UGC_PAUSED');
  const imageMode = cfg.config.moderation.imageMode;

  const auto = event.auto === true;
  if (event.empty === true && !auto) bad('BAD_REQUEST'); // `empty` only rides on a forced send (spec 13.2)
  let hasText = typeof event.text === 'string';
  let hasStrokes = event.strokes !== undefined && event.strokes !== null;
  // a forced send with nothing in it becomes a marker (5.8): 0 strokes, or fewer than 2 valid characters
  const kind0 = chain.claim ? chainLib.kindOf(chain.claim.step) : null;
  let empty = event.empty === true;
  if (auto && kind0 === 'draw' && !hasText && (!hasStrokes || (Array.isArray(event.strokes.s) && event.strokes.s.length === 0))) empty = true;
  if (auto && kind0 === 'describe' && !hasStrokes && (!hasText || text.validCharCount(event.text) < 2)) empty = true;
  if (empty) {
    hasText = false;
    hasStrokes = false;
  }
  const chk = chainLib.checkSubmit(chain, { openid, claimId, now: now(), hasText, hasStrokes, empty });
  if (!chk.ok) bad(chk.code);
  const r = strikes.restrictionOf(p, now());
  if (r && !(p.restrictedAt > chain.claim.at)) bad('RESTRICTED', { until: r.until }); // edge 19 / TD-7: a claim taken before the restriction may finish
  if (!empty) {
    const stepLim = allowance.checkSteps(p, players.dateKey());
    if (stepLim) bad(stepLim.code);
  }
  const n = chk.step;
  const kind = chk.kind;
  const attempt = chain.attempts[n] + 1;
  const sid = chainLib.stepId(chain._id, n, attempt);
  const lateCheck = () => ({ openid, claimId, now: now(), hasText, hasStrokes, empty });

  /** the transaction that records a delivered 棒: `step` fields on top of the base, `pass` = which chain transition, `markPlayer` = turn counters */
  async function commit(stepExtra, passFn, counters) {
    const out = await store.txn(async (t) => {
      const fresh = await store.getDocT(t, 'chains', chain._id);
      const again = fresh && chainLib.checkSubmit(fresh, lateCheck());
      if (!again || !again.ok || fresh.attempts[n] + 1 !== attempt) return { replay: true, code: again && again.code };
      const pl = await players.getT(t, openid);
      if (n === 1 && allowance.checkStart(pl, players.dateKey())) return { limit: 'START_LIMIT' };
      const pr = passFn(fresh);
      const result = { state: stepExtra.marker ? 'marker' : 'passed', step: n, chainState: pr.chain.state, revealed: pr.revealed };
      if (stepExtra.marker) result.marker = stepExtra.marker;
      const step = Object.assign({
        _id: sid, chainId: chain._id, n, attempt, kind, author: openid, claimId, state: STEP.PASSED, auto, hiddenReason: null, laughs: 0, result, createdAt: now(),
      }, stepExtra);
      await players.putT(t, 'steps', sid, step);
      await players.putT(t, 'chains', chain._id, pr.chain);
      let pl2 = pl;
      if (counters.turn) pl2 = allowance.advanceStreak(allowance.consumeStep(pl2, players.dateKey()), players.dateKey());
      if (n === 1) pl2 = allowance.consumeStart(pl2, players.dateKey());
      await players.putPlayerT(t, pl2);
      return { chain: pr.chain, step, result };
    });
    if (out.limit) bad(out.limit);
    if (out.replay) return (await storedResult(chainId, claimId, openid)) || bad(out.code || 'CLAIM_LOST');
    if (n === 1) await lifecycle.onStarted(out.chain);
    await lifecycle.onPassed(out.chain, out.step, out.result.revealed);
    await store.writeEvent(openid, 'step_result', { mode: 'chain', chainId: chain._id, step: n, kind, result: out.result.state === 'marker' ? 'marker' : 'passed' });
    return Object.assign({ ok: true, serverNow: now() }, out.result);
  }

  /** a FORCED send that did not pass: release the claim, reopen the 棒, keep a record for the author's 我的接龙 (5.8, AC 132) */
  async function reopenForced(code, extra, recState) {
    await store.txn(async (t) => {
      const fresh = await store.getDocT(t, 'chains', chain._id);
      const again = fresh && chainLib.checkSubmit(fresh, lateCheck());
      if (!again || !again.ok || fresh.attempts[n] + 1 !== attempt) return;
      const next = chainLib.reopenAfterForced(fresh, { attempt, now: now() });
      await players.putT(t, 'chains', chain._id, next);
      await players.putT(t, 'steps', sid, {
        _id: sid, chainId: chain._id, n, attempt, kind, author: openid, claimId, state: recState, auto, hiddenReason: null, laughs: 0, mod: { kind, suggest: recState === 'blocked' ? 'risky' : 'error', submittedAt: now(), verdictAt: now() }, createdAt: now(),
      });
    });
    await store.writeEvent(openid, 'step_result', { mode: 'chain', chainId: chain._id, step: n, kind, result: code === 'MODERATION_BUSY' ? 'busy' : code === 'TEXT_REJECTED' || code === 'INVALID_STROKES' ? 'rejected' : 'blocked' });
    return errResp(code, Object.assign({ reopened: true }, extra || {}));
  }
  const fail = (code, extra, recState) => (auto ? reopenForced(code, extra, recState || (code === 'TEXT_BLOCKED' || code === 'IMAGE_BLOCKED' ? 'blocked' : 'void')) : bad(code, extra));

  // ------------------------------------------------------------------------------------------------------------ marker
  if (empty) {
    if (n === 1) {
      const sl = allowance.checkStart(p, players.dateKey());
      if (sl) bad(sl.code);
    }
    const marker = copy.emptyMarkerFor(kind);
    return commit({ marker, mod: { kind: 'marker' } }, (fresh) => chainLib.passMarker(fresh, { stepId: sid, openid, attempt, now: now(), marker }), { turn: false });
  }

  // ------------------------------------------------------------------------------------------------------------ describe
  if (kind === 'describe') {
    const v = text.validate(event.text, 'describe');
    if (!v.ok) return fail('TEXT_REJECTED', { reason: v.reason }, 'void');
    const m = await modio.checkText({ openid, text: v.text, stepId: sid, auto });
    if (!m.ok) return fail(m.code);
    return commit({ text: v.text, mod: { kind: 'text', api: cfg.config.moderation.textApi, suggest: 'pass', submittedAt: now(), verdictAt: now() } },
      (fresh) => chainLib.passText(fresh, { stepId: sid, openid, attempt, now: now() }), { turn: true });
  }

  // ------------------------------------------------------------------------------------------------------------ drawing
  const sv = raster.validateDrawing(event.strokes);
  if (!sv.ok) return fail('INVALID_STROKES', { reason: sv.reason }, 'void');
  if (n === 1) {
    const sl = allowance.checkStart(p, players.dateKey());
    if (sl) bad(sl.code);
  }
  const strokes = clone(event.strokes);

  if (imageMode === 'sync') {
    const m = await modio.checkDrawingSync({ openid, chainId: chain._id, n, attempt, stepId: sid, strokes, auto });
    if (!m.ok) return fail(m.code, m.reason ? { reason: m.reason } : null);
    return commit({ strokes, fileID: m.fileID, mod: { kind: 'image', api: 'game', suggest: 'pass', submittedAt: now(), verdictAt: now() } },
      (fresh) => chainLib.passText(fresh, { stepId: sid, openid, attempt, now: now() }), { turn: true });
  }

  // ---- imageMode 'async' (6.10): the v1 pipeline, kept dormant behind the configuration switch
  const lvl = await modio.imageLevel();
  if (lvl === 'failClosed') bad('MODERATION_BUSY');
  if (lvl === 'alert') modio.alert('image quota >= 70% of the daily mediaCheckAsync limit; ask WeChat for a raise (Handoff H11)');
  const img = raster.strokesToPng(strokes);
  if (!img.ok) bad('INVALID_STROKES', { reason: img.reason });
  let fileID;
  try {
    fileID = await modio.storePng(chain._id, n, attempt, img.png);
  } catch (err) {
    console.error('[ALERT] moderation PNG upload failed', store.errText(err));
    bad('MODERATION_BUSY'); // fail closed: nothing stored, the claim stays
  }
  const sent = await modio.sendImageCheck({ stepId: sid, openid, fileID, strokes });
  const t0 = now();
  const modBlock = {
    kind: 'image', traceIds: sent.ok ? [sent.traceId] : [], submittedAt: t0, lastCheckAt: sent.ok ? t0 : null, rechecks: 0,
    callErrors: sent.ok ? 0 : 1, suggest: null, label: null,
  };
  const out = await store.txn(async (t) => {
    const fresh = await store.getDocT(t, 'chains', chain._id);
    const again = fresh && chainLib.checkSubmit(fresh, lateCheck());
    if (!again || !again.ok || fresh.attempts[n] + 1 !== attempt) return { replay: true, code: again && again.code };
    const pl = await players.getT(t, openid);
    if (n === 1 && allowance.checkStart(pl, players.dateKey())) return { limit: 'START_LIMIT' };
    const next = chainLib.beginPending(fresh, { stepId: sid, openid, attempt, now: now() });
    const result = { state: 'pending', step: n, chainState: next.state, revealed: false };
    const step = {
      _id: sid, chainId: chain._id, n, attempt, kind: 'draw', author: openid, claimId, strokes, fileID, state: STEP.PENDING,
      mod: modBlock, hiddenReason: null, laughs: 0, result, createdAt: now(),
    };
    await players.putT(t, 'steps', sid, step);
    await players.putT(t, 'chains', chain._id, next);
    let pl2 = allowance.consumeStep(pl, players.dateKey());
    if (n === 1) pl2 = allowance.consumeStart(pl2, players.dateKey());
    await players.putPlayerT(t, pl2);
    return { chain: next, result };
  });
  if (out.limit) bad(out.limit);
  if (out.replay) return (await storedResult(chainId, claimId, openid)) || bad(out.code || 'CLAIM_LOST');
  if (n === 1) await lifecycle.onStarted(out.chain);
  await store.writeEvent(openid, 'step_result', { mode: 'chain', chainId: chain._id, step: n, kind: 'draw', result: 'pending', mock: e.mode === 'mock' });
  return Object.assign({ ok: true, serverNow: now() }, out.result);
});
