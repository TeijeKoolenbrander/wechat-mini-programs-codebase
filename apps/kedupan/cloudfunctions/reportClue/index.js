'use strict';
// reportClue: 举报 a shown typed clue (spec 11.2, 11.7, D-2, AC 91). The clue is hidden for EVERYONE at once (the host
// included), in the same transaction that stores the report. No free text: five fixed reasons. The reporter is never
// revealed: nothing returned or stored on the round names them (the report row is admin-only). Strikes come later, from
// `admin upholdReport`. One report per player per round (DUP_REPORT), 10 a day per player (REPORT_LIMIT).
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, CONFIG, rateOf, dateKeyAt } = require('./common/coreapi');
const roundsDb = require('./common/rounds-db');
const groups = require('./common/groups');

function failGate(g) {
  const { ok, code, ...extra } = g;
  fail(code, code, extra);
}

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.reportClue(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const { roundId, reason } = v.v;
  const fl = await groups.ugcFlags();
  const round = await roundsDb.loadRound(roundId);
  const gate = core.U.reportGate(round, openid, fl);
  if (!gate.ok) failGate(gate);
  const rid = `${roundId}_${openid}`;
  if (await store.getDoc('clue_reports', rid)) fail('DUP_REPORT', 'DUP_REPORT');
  await store.dayLimit(openid, 'clueReport', CONFIG.limits.clueReportsPerDay, dateKeyAt(now()), 'REPORT_LIMIT');

  let out = null;
  await store.db().runTransaction(async (t) => {
    out = null;
    const cur = await store.getDocT(t, 'rounds', roundId);
    const g = core.U.reportGate(cur, openid, fl);
    if (!g.ok) {
      out = g;
      return;
    }
    if (await store.getDocT(t, 'clue_reports', rid)) {
      out = { ok: false, code: 'DUP_REPORT' };
      return;
    }
    await store.collT(t, 'clue_reports').add({ data: { _id: rid, roundId, openid, reason, state: 'open', ts: now() } });
    if (!g.alreadyHidden) {
      const h = core.U.hideClue(cur, 'report', now());
      await store.collT(t, 'rounds').doc(roundId).update({ data: { clueHidden: true, clueHiddenAt: h.clueHiddenAt, clueHiddenBy: 'report' } });
    }
    out = { ok: true };
  });
  if (!out.ok) failGate(out);
  return { ok: true, hidden: true };
}, { rate: rateOf('reportClue') });
