'use strict';
// report: 举报 (spec 7.1, PO-16, AC 58-61). The reported item is hidden for EVERYONE at once, in the same transaction that
// records the report; if it was the latest passed 棒 of an open chain the 棒 reopens and the next claim is cancelled (the
// reporter's own claim is released). No free text: fixed reasons only. Strikes come later from `admin upholdReport`.
const { CONFIG } = require('./core/config');
const chainLib = require('./core/chain');
const roomLib = require('./core/room');
const allowance = require('./core/allowance');
const schema = require('./core/schema');
const store = require('./common/store');
const players = require('./common/players');
const groups = require('./common/groups');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { chainIdOf, intIn } = require('./common/input');
const roomio = require('./common/roomio');
const { now } = require('./common/util');

const { STATE, STEP } = chainLib;

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'report', 1, 10);
  let id;
  let n;
  let pre;
  if (event.reportRef !== undefined) {
    // a LIVE source named by its opaque reference (spec 7.1, TD-140): `{roomId, reportRef, reason}`. The chain and step come from the
    // CALLER'S OWN seat in a playing room, never from the client; the ref is only compared with the one recomputed for that seat.
    if (typeof event.reportRef !== 'string' || !/^q[0-9a-z]{2,24}$/.test(event.reportRef)) bad('BAD_REQUEST');
    const roomId = roomio.roomIdOf(event);
    const room = roomId && (await roomio.loadRoom(roomId));
    if (!room) bad('ROOM_NOT_FOUND');
    const seat = roomLib.seatOf(room, openid);
    if (seat < 0) bad('NOT_MEMBER');
    if (room.state !== roomLib.STATE.PLAYING) bad('ROUND_OVER');
    if (room.round < 1 || event.reportRef !== roomLib.reportRefFor(room, seat)) bad('BAD_REQUEST');
    id = room.chainIds[roomLib.chainOfSeat(seat, room.round, room.n)];
    n = room.round - 1;
    pre = await store.getDoc('chains', id);
    if (!pre) bad('CHAIN_NOT_FOUND');
    if (!CONFIG.reports.reasons.includes(event.reason)) bad('BAD_REQUEST');
  } else {
    id = chainIdOf(event);
    pre = id && (await store.getDoc('chains', id));
    if (!pre) bad('CHAIN_NOT_FOUND');
    if (!CONFIG.reports.reasons.includes(event.reason)) bad('BAD_REQUEST');
    n = intIn(event.step, 0, pre.length);
    if (n === null) bad('BAD_REQUEST');
  }
  const member = n === 0 ? await groups.isMember(openid, pre.openGId) : false;

  const out = await store.txn(async (t) => {
    const chain = await store.getDocT(t, 'chains', id);
    if (!chain) bad('CHAIN_NOT_FOUND');
    const p = await players.getT(t, openid);
    const lim = allowance.checkReports(p, players.dateKey());
    if (lim) bad(lim.code);

    let target; // {whole:true} | {step}
    if (chain.mode === 'live' && chain.state !== STATE.REVEALED) {
      // a LIVE round (7.1): only the seat that works on this chain right now may report the source it was handed (the previous step, or the custom prompt)
      const room = await store.getDocT(t, 'rooms', chain.roomId);
      const seat = room ? roomLib.seatOf(room, openid) : -1;
      if (!room || room.state !== roomLib.STATE.PLAYING || seat < 0) bad('NOT_PARTICIPANT');
      if (roomLib.chainOfSeat(seat, room.round, room.n) !== chain.seat || n !== room.round - 1) bad('NOT_PARTICIPANT');
      if (n === 0) {
        if (!chain.custom) bad('BAD_REQUEST'); // a rolled prompt is never reportable
        if (await store.getDocT(t, 'reports', schema.reportKey(openid, chain._id, null))) bad('DUP_REPORT');
        target = { whole: true };
      } else {
        const slot = roomLib.slotAt(room, n, roomLib.workerOfChain(chain.seat, n, room.n));
        if (!slot || slot.state !== roomLib.SLOT.SENT) bad('BAD_REQUEST'); // a marker has nothing to report
        if (await store.getDocT(t, 'reports', schema.reportKey(openid, chain._id, slot.stepId))) bad('DUP_REPORT');
        const s = await store.getDocT(t, 'steps', slot.stepId);
        if (!s || s.state !== STEP.PASSED || s.marker) bad('BAD_REQUEST');
        target = { step: s };
      }
    } else if (n === 0) {
      // the teaser texts: a custom prompt hides the whole chain (edge 29); otherwise the final sentence (TD-16)
      if (!chainLib.isParticipant(chain, openid) && !member) bad('NOT_MEMBER');
      if (chain.state !== STATE.REVEALED) bad('CHAIN_CLOSED');
      // QA-6: the teaser is ONE item per player and chain, whatever sentence it currently shows
      if (await store.getDocT(t, 'reports', schema.reportKey(openid, chain._id, null))) bad('DUP_REPORT');
      if (chain.custom) target = { whole: true };
      else {
        let last = null;
        for (let i = chain.length; i >= 1 && !last; i--) {
          if (chainLib.kindOf(i) !== 'describe' || !chain.stepIds[i]) continue;
          const s = await store.getDocT(t, 'steps', chain.stepIds[i]);
          if (s && s.state === STEP.PASSED) last = s;
        }
        if (!last) return { none: true };
        target = { step: last };
      }
    } else {
      const sid = chain.stepIds[n];
      // QA-6: a repeat report by the same player is DUP_REPORT even though the first one already hid the step
      if (sid && (await store.getDocT(t, 'reports', schema.reportKey(openid, chain._id, sid)))) bad('DUP_REPORT');
      const s = sid && (await store.getDocT(t, 'steps', sid));
      if (!s || s.state !== STEP.PASSED || s.marker) bad('BAD_REQUEST'); // markers cannot be reported (5.8)
      const holdsNextClaim = !!chain.claim && chain.claim.openid === openid && chain.claim.step === n + 1 && chain.claim.expiresAt > now();
      const allowed = (chain.state === STATE.REVEALED && chainLib.isParticipant(chain, openid)) || holdsNextClaim;
      if (!allowed) bad('NOT_PARTICIPANT');
      target = { step: s };
    }
    // report id <openid>_<chainId>_<stepId|teaser> (core/schema.js#reportKey): a teaser report is keyed 'teaser' whichever
    // sentence (or the whole chain) it hides, a step report by the step document
    const key = schema.reportKey(openid, chain._id, n === 0 ? null : target.step._id);
    if (await store.getDocT(t, 'reports', key)) bad('DUP_REPORT');
    if (target.step && target.step.author === openid) bad('OWN_STEP');
    await players.putT(t, 'reports', key, {
      reporter: openid, stepId: target.whole ? null : target.step._id, chainId: chain._id, roomId: chain.roomId || null, reason: event.reason, state: 'open', createdAt: now(),
    });
    await players.putPlayerT(t, allowance.consumeReport(p, players.dateKey()));
    let reopened = false;
    let claimReleased = false;
    if (target.whole) {
      await players.putT(t, 'chains', chain._id, chainLib.setChainHidden(chain, 'report', now()));
    } else {
      await store.collT(t, 'steps').doc(target.step._id).update({ data: { state: STEP.HIDDEN, hiddenReason: 'report' } });
      // a live chain never reopens: the room keeps running and the step stays in the chain as a hidden placeholder (TD-140)
      const r = chain.mode === 'live' ? { reopened: false } : chainLib.reopenLatest(chain, target.step.n, now());
      if (r.reopened) {
        await players.putT(t, 'chains', chain._id, r.chain);
        reopened = true;
        claimReleased = !!(r.cancelledClaim && r.cancelledClaim.openid === openid);
      }
    }
    return { reopened, claimReleased };
  });
  if (out.none) return { ok: true, hidden: true, reopened: false };
  await store.writeEvent(openid, 'report_submit', { mode: pre.mode === 'live' ? 'live' : 'chain', reason: event.reason, target: n === 0 ? 'teaser' : 'step', reopened: out.reopened });
  return { ok: true, hidden: true, reopened: out.reopened, claimReleased: out.claimReleased };
});
