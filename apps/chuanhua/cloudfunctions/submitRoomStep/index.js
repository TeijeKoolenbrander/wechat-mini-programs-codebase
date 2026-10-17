'use strict';
// submitRoomStep: hand in the turn of the current round (spec 3A.5, 5.8, 6.2-6.3, 13.2, AC 128-134, 141, 152-153). Three phases, so the check time never
// holds the room hostage and a double tap / retry is harmless:
//   A  one fast transaction: the caller must be seated, the round must be the current one and the function must have started at or before
//      deadline + grace (else ROUND_OVER); a resolved slot answers ALREADY_SENT with its state; an EMPTY forced send (nothing to send) resolves to the
//      empty marker right here; otherwise the slot becomes `received`.
//   B  outside any transaction: validate, then the synchronous check (game msgSecCheck, rasterise + mediaCheckSync, 5 s). Nothing unchecked is stored.
//   C  one transaction: if the slot is still the `received` one of phase A, resolve it: `sent` (a step document for content), or the marker
//      「（这一棒没传过来）」 when a FORCED send failed (blocked, busy, timed out, rejected: nobody learns why), or, before time-up, reopen it for a resend
//      with the error code. The last resolved slot advances the round in the same transaction.
// The daily turn cap is never applied here: a game already started is finished (3.9). Markers count for neither the cap nor the streak.
const roomLib = require('./core/room');
const allowance = require('./core/allowance');
const text = require('./core/text');
const strokesLib = require('./core/strokes');
const copy = require('./core/copy');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const modio = require('./common/modio');
const env = require('./common/env');
const roomio = require('./common/roomio');
const { bad, errResp } = require('./common/errors');
const { now } = require('./common/util');

const { SLOT } = roomLib;
const clone = (o) => JSON.parse(JSON.stringify(o));

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rsubmit', 1, 30);
  const roomId = roomio.roomIdOf(event);
  const round = Number.isInteger(event.round) && event.round >= 0 && event.round <= 6 ? event.round : null;
  if (!roomId || round === null) bad('BAD_REQUEST');
  const auto = event.auto === true;
  if (event.empty === true && !auto) bad('BAD_REQUEST'); // `empty` only rides on a forced send (AC 25 / 13.2)
  const cfg = await appconfig.get();
  if (!appconfig.createAllowed(cfg).ok) bad('UGC_PAUSED');
  const pre = await roomio.loadRoom(roomId);
  if (!pre) bad('ROOM_NOT_FOUND');
  const seat = roomLib.seatOf(pre, openid);
  if (seat < 0) bad('NOT_IN_ROOM');

  // ---- the shape of the send for this kind of round (static: nothing is touched yet)
  const kind = roomLib.kindOfRound(round);
  const hasText = typeof event.text === 'string';
  const hasStrokes = event.strokes !== undefined && event.strokes !== null;
  const hasPick = typeof event.promptId === 'string';
  const hasCustom = typeof event.customText === 'string';
  if (kind === 'prompt') {
    if (hasText || hasStrokes) bad('BAD_REQUEST');
    if (!auto && hasPick === hasCustom) bad('BAD_REQUEST');
    if (hasPick && typeof event.rollId !== 'string') bad('BAD_REQUEST');
  } else if (kind === 'draw') {
    if (hasText || hasPick || hasCustom) bad('BAD_REQUEST');
    if (!auto && !hasStrokes) bad('BAD_REQUEST');
  } else {
    if (hasStrokes || hasPick || hasCustom) bad('BAD_REQUEST');
    if (!auto && !hasText) bad('BAD_REQUEST');
  }
  // 0 strokes / fewer than 2 valid characters at a forced send = nothing to send (5.8)
  let emptyTurn = false;
  if (kind === 'draw' && auto && (event.empty === true || !hasStrokes || (Array.isArray(event.strokes && event.strokes.s) && event.strokes.s.length === 0))) emptyTurn = true;
  if (kind === 'describe' && auto && (event.empty === true || !hasText || text.validCharCount(event.text) < 2)) emptyTurn = true;

  // ---- phase A
  let a = null;
  await store.txn(async (t) => {
    a = null;
    const room = await store.getDocT(t, 'rooms', roomId);
    if (!room) bad('ROOM_NOT_FOUND');
    const sNow = roomLib.seatOf(room, openid);
    if (sNow < 0) bad('NOT_IN_ROOM');
    const gate = roomLib.sendGate(room, sNow, round, now());
    if (!gate.ok) {
      if (gate.code === 'ALREADY_SENT') {
        a = { already: true, slot: gate.slot };
        return;
      }
      bad(gate.code);
    }
    if (emptyTurn) {
      const marker = copy.emptyMarkerFor(kind);
      const slot0 = roomLib.markReceived(room, sNow, now()); // keeps the attempt counter monotonic
      const resolved = roomLib.resolveMarker(slot0, sNow, marker, now(), true);
      const s = await roomio.settleT(t, resolved, 'submit');
      await players.putT(t, 'rooms', roomId, s.room);
      a = { room: s.room, due: s.due, marker, seat: sNow };
      return;
    }
    const next = roomLib.markReceived(room, sNow, now());
    await players.putT(t, 'rooms', roomId, next);
    a = { room: next, seat: sNow, attempt: next.slots[String(round)][sNow].attempt };
  });
  if (a.already) return errResp('ALREADY_SENT', { slot: { state: a.slot.state, marker: a.slot.marker || null } });
  if (a.marker) {
    await roomio.afterSettle(a.due, a.room);
    if (!a.due) await roomio.writeSignals(a.room);
    await store.writeEvent(openid, 'step_result', { mode: 'live', step: round, kind: kind === 'prompt' ? 'draw' : kind, result: 'marker' });
    return { ok: true, state: 'marker', marker: a.marker, round, slot: { state: SLOT.MARKER }, serverNow: now(), advanced: !!a.due };
  }
  const seatNo = a.seat;
  const attempt = a.attempt;
  const chainIndex = roomLib.chainOfSeat(seatNo, round, a.room.n);
  const chainId = a.room.chainIds[chainIndex];
  const sid = round >= 1 ? chainId + '_' + round + '_' + attempt : null;

  // phases B and C run inside one guard: whatever fails there that is not the player's doing (the resolving transaction lost every write conflict,
  // a check threw) gives the slot back (`received` -> `none`) so the very next send is taken, instead of the slot staying `received` for the
  // 8 s in-flight window while every retry answers ALREADY_SENT and a drawing that PASSED its check ends up replaced by the marker (QA-R2-2b).
  let c = null;
  try {
    c = await checkAndResolve();
  } catch (e) {
    await releaseSlot();
    throw e;
  }
  async function releaseSlot() {
    try {
      await store.txn(async (t) => {
        const room = await store.getDocT(t, 'rooms', roomId);
        const next = room && roomLib.releaseReceived(room, round, seatNo, attempt, now());
        if (next) await players.putT(t, 'rooms', roomId, next);
      });
    } catch (e2) {
      console.warn('release of a received slot failed', store.errText(e2)); // the 8 s in-flight takeover (sendGate) is the last resort
    }
  }

  async function checkAndResolve() {
  // ---- phase B: validate and check (outside any transaction)
  let verdict = null; // {ok:true, ...content} | {ok:false, code, extra}
  let pick = null; // round 0
  let fellBack = false;
  if (kind === 'prompt') {
    let err = null;
    if (hasCustom) {
      const v = text.validate(event.customText, 'prompt');
      if (!v.ok) err = { code: 'TEXT_REJECTED', extra: { reason: v.reason } };
      else {
        const m = await modio.checkText({ openid, text: v.text, stepId: null, auto });
        if (m.ok) pick = { custom: true, text: v.text };
        else err = { code: m.code };
      }
    }
    if (!pick && hasPick && (roomLib.rollPickValid(a.room, seatNo, event.rollId, event.promptId) || (auto && roomLib.shownPickValid(a.room, seatNo, event.promptId)))) pick = { promptId: event.promptId };
    if (!pick && !auto) verdict = { ok: false, code: err ? err.code : 'BAD_REQUEST', extra: err ? err.extra : null };
    if (!pick && auto) {
      pick = { promptId: roomLib.firstPrompt(a.room, seatNo) }; // 4.2 / AC 120: the selected rolled prompt (the first if none was tapped)
      fellBack = !hasPick;
    }
    if (pick) verdict = { ok: true, pick };
  } else if (kind === 'describe') {
    const v = text.validate(event.text, 'describe');
    if (!v.ok) verdict = { ok: false, code: 'TEXT_REJECTED', extra: { reason: v.reason } };
    else {
      const m = await modio.checkText({ openid, text: v.text, stepId: sid, auto });
      verdict = m.ok ? { ok: true, text: v.text } : { ok: false, code: m.code };
    }
  } else {
    const sv = strokesLib.validate(event.strokes);
    if (!sv.ok) verdict = { ok: false, code: 'INVALID_STROKES', extra: { reason: sv.reason } };
    else {
      const m = await modio.checkDrawingSync({ openid, chainId, n: round, attempt, stepId: sid, strokes: event.strokes, auto });
      verdict = m.ok ? { ok: true, fileID: m.fileID } : { ok: false, code: m.code, extra: m.reason ? { reason: m.reason } : null };
    }
  }

  // ---- phase C
  let c = null;
  await store.txn(async (t) => {
    c = null;
    const room = await store.getDocT(t, 'rooms', roomId);
    if (!room) bad('ROOM_NOT_FOUND');
    if (!roomLib.stillReceived(room, round, seatNo, attempt)) {
      // the round moved on (or the slot was taken over / filled by leaveRoom) while the check ran: the late verdict is logged, nothing is delivered
      c = { late: true, code: room.state === roomLib.STATE.PLAYING && room.round === round ? 'ALREADY_SENT' : 'ROUND_OVER' };
      return;
    }
    let next;
    let pl = null;
    if (verdict.ok) {
      let extra;
      if (kind === 'prompt') extra = verdict.pick.custom ? { custom: true, text: verdict.pick.text } : { promptId: verdict.pick.promptId };
      else {
        extra = { stepId: sid };
        const step = {
          _id: sid, chainId, roomId, n: round, attempt, kind, author: openid, claimId: null, state: 'passed', auto, hiddenReason: null, laughs: 0, createdAt: now(),
          mod: kind === 'draw' ? { kind: 'image', api: 'game', suggest: 'pass', submittedAt: now(), verdictAt: now() } : { kind: 'text', api: 'game', suggest: 'pass', submittedAt: now(), verdictAt: now() },
        };
        if (kind === 'draw') {
          step.strokes = clone(event.strokes);
          step.fileID = verdict.fileID;
        } else step.text = verdict.text;
        await players.putT(t, 'steps', sid, step);
      }
      next = roomLib.resolveSent(room, seatNo, extra, now(), auto);
      if (!fellBack) {
        pl = await players.getT(t, openid);
        pl = allowance.advanceStreak(allowance.consumeStep(pl, players.dateKey()), players.dateKey());
        await players.putPlayerT(t, pl);
      }
      c = { state: 'sent' };
    } else if (auto) {
      next = roomLib.resolveMarker(room, seatNo, 'notDelivered', now(), true); // 「（这一棒没传过来）」: no reason is given to anyone (5.8)
      c = { state: 'marker', marker: 'notDelivered', failed: verdict.code };
    } else {
      next = roomLib.reopenSlot(room, seatNo, now()); // before time-up: the author keeps the work and may fix and resend
      c = { state: 'blocked', code: verdict.code, extra: verdict.extra };
    }
    const s = await roomio.settleT(t, next, 'submit');
    await players.putT(t, 'rooms', roomId, s.room);
    c.room = s.room;
    c.due = s.due;
  });
  return c;
  }
  if (c.late) {
    await store.writeEvent(openid, 'step_result', { mode: 'live', step: round, kind: kind === 'prompt' ? 'draw' : kind, result: 'roundOver' });
    return errResp(c.code, c.code === 'ALREADY_SENT' ? { slot: { state: 'received' } } : {});
  }
  await roomio.afterSettle(c.due, c.room);
  if (!c.due) await roomio.writeSignals(c.room);
  const resultName = c.state === 'sent' ? 'passed' : c.state === 'marker' ? 'marker' : c.code === 'MODERATION_BUSY' ? 'busy' : c.code === 'TEXT_REJECTED' || c.code === 'INVALID_STROKES' ? 'rejected' : 'blocked';
  await store.writeEvent(openid, 'step_result', { mode: 'live', step: round, kind: kind === 'prompt' ? 'draw' : kind, result: resultName });
  if (c.state === 'blocked') return errResp(c.code, Object.assign({ slot: { state: SLOT.BLOCKED } }, c.extra || {}));
  const base = { ok: true, state: c.state, round, slot: { state: c.state === 'sent' ? SLOT.SENT : SLOT.MARKER }, serverNow: now(), advanced: !!c.due };
  if (c.state === 'marker') {
    base.marker = c.marker;
    if (c.failed) base.failed = c.failed === 'MODERATION_BUSY' ? 'busy' : 'blocked'; // the author's own toast only (6.4)
  }
  return base;
});
