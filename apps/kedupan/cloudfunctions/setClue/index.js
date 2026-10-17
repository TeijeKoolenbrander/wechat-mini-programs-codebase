'use strict';
// setClue: the host sets the clue and the round opens (spec 11.2, 11.6, D-2, AC 28, 87-90, 94, 98, 99).
//   preset: clueItemId must belong to the round's spectrum; the curated text is copied from content.
//   text  : the host's own words. Order: host -> state -> hidden -> identical text -> UGC_PAUSED -> RULES_REQUIRED ->
//           RESTRICTED -> local rules (TEXT_REJECTED, no WeChat call, no strike) -> 50 checks a day (RATE_LIMITED scope day)
//           -> WeChat text check. pass: stored and the round opens. risky: TEXT_BLOCKED + a strike. general-API review:
//           TEXT_BLOCKED, no strike. ANYTHING else: MODERATION_BUSY. A non-pass leaves the round document untouched.
//   'chat' (我在群里说) is gone: INVALID_INPUT.
// Nobody but the author sees the text until the check returned `pass`: it is written to the round only after that, in the
// same transaction that re-checks the round (a guess, a discard or a second call landing meanwhile wins cleanly).
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, content, rateOf, dateKeyAt } = require('./common/coreapi');
const roundsDb = require('./common/rounds-db');
const groups = require('./common/groups');
const players = require('./common/players');
const modio = require('./common/modio');
const env = require('./common/env');

function failGate(g) {
  const { ok, code, ...extra } = g;
  fail(code, code, extra);
}

async function presetClue(v, openid) {
  if (!(await roundsDb.loadRound(v.roundId))) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
  let res = null;
  await store.db().runTransaction(async (t) => {
    res = null;
    const round = await store.getDocT(t, 'rounds', v.roundId);
    if (!round) {
      res = { ok: false, code: 'ROUND_NOT_FOUND' };
      return;
    }
    res = core.SV.applyClue(round, round.hostOpenid === openid, { ...v, nowMs: now() }, content(round.contentVersion));
    if (!res.ok) return;
    await store.collT(t, 'rounds').doc(round._id).update({ data: { status: 'open', clueMode: 'preset', clueItemId: res.round.clueItemId, clueText: res.round.clueText } });
  });
  if (!res.ok) fail(res.code, res.code);
  return { ok: true, status: 'open', clueMode: 'preset', clueText: res.round.clueText };
}

async function textClue(v, openid) {
  env.ugcGuard(); // mock moderation in production refuses every typed-clue call
  const round = await roundsDb.loadRound(v.roundId);
  if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
  const fl = await groups.ugcFlags();
  const player = await players.read(openid);
  const gate = core.U.textGate({ round, isHost: round.hostOpenid === openid, rawText: v.clueText, fl, player, nowMs: now() });
  if (!gate.ok) failGate(gate);
  if (gate.same) return { ok: true, status: 'open', clueMode: 'text', clueText: round.clueText };

  // probing guard: 50 WeChat checks a user and Beijing day (local rejections never get here)
  const dk = dateKeyAt(now());
  const take = await players.mutate(openid, (p) => {
    const r = core.U.takeCheck(p, dk);
    return r.ok ? { player: { ...p, clueChecks: r.clueChecks, updatedAt: now() }, result: true } : { player: p, result: false };
  });
  if (!take) fail('RATE_LIMITED', 'rate limited', { scope: 'day' });

  const chk = await modio.checkText({ openid, text: gate.text, roundId: round._id });
  if (!chk.ok) {
    if (chk.strike) await players.strike(openid, 'risky');
    fail(chk.code, chk.code);
  }

  // commit: re-read the round inside the transaction and decide again on the fresh document (L1)
  let out = null;
  await store.db().runTransaction(async (t) => {
    out = null;
    const cur = await store.getDocT(t, 'rounds', round._id);
    const g = core.U.textGate({ round: cur, isHost: !!cur && cur.hostOpenid === openid, rawText: v.clueText, fl, player, nowMs: now() });
    if (!g.ok) {
      out = g;
      return;
    }
    if (g.same) {
      out = { ok: true };
      return;
    }
    const next = core.U.applyTextClue(cur, gate.text, chk.mod, now());
    await store.collT(t, 'rounds').doc(cur._id).update({ data: { status: 'open', clueMode: 'text', clueItemId: null, clueText: next.clueText, clueMod: next.clueMod } });
    out = { ok: true };
  });
  if (!out.ok) failGate(out);
  return { ok: true, status: 'open', clueMode: 'text', clueText: gate.text };
}

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.setClue(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  return v.v.clueMode === 'text' ? textClue(v.v, openid) : presetClue(v.v, openid);
}, { rate: rateOf('setClue') });
