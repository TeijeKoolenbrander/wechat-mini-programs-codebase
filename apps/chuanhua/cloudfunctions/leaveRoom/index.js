'use strict';
// leaveRoom: 离开这一局 (spec 3A.6, 13.2, AC 142, 143).
//   lobby   : the seat is removed, seats renumber in join order, the earliest-joined member becomes host if the host left, the last member closes the room
//             (and gives the creator's createRoom back); the room card count is updated.
//   playing : the seat becomes `left`; its slot in the current and every later round is filled with the empty marker AT ONCE (round 0: the first rolled
//             prompt), which can end the round early; if nobody is active the game finishes into the reveal. The player can still open the reveal later.
//   other   : nothing to do (idempotent).
const roomLib = require('./core/room');
const store = require('./common/store');
const players = require('./common/players');
const env = require('./common/env');
const roomio = require('./common/roomio');
const ops = require('./common/roomops');
const { bad } = require('./common/errors');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rleave', 1, 10);
  const roomId = roomio.roomIdOf(event);
  if (!roomId) bad('ROOM_NOT_FOUND');
  let box = null;
  await store.txn(async (t) => {
    box = null;
    const room = await store.getDocT(t, 'rooms', roomId);
    if (!room) bad('ROOM_NOT_FOUND');
    if (roomLib.seatOf(room, openid) < 0) bad('NOT_IN_ROOM');
    if (room.state !== roomLib.STATE.LOBBY && room.state !== roomLib.STATE.PLAYING) return;
    const p = await players.getT(t, openid);
    if (p.activeRoomId === roomId) await players.putPlayerT(t, Object.assign({}, p, { activeRoomId: null }));
    if (room.state === roomLib.STATE.LOBBY) {
      const res = roomLib.leaveLobby(room, openid, now());
      await players.putT(t, 'rooms', roomId, res.room);
      box = { kind: 'lobby', room: res.room, closed: res.closed, prevCount: room.seats.length };
      return;
    }
    const lp = roomLib.leavePlaying(room, openid, now());
    if (!lp.changed) return;
    const s = await roomio.settleT(t, lp.room, 'leave', lp.nobodyActive ? 'empty' : null);
    await players.putT(t, 'rooms', roomId, s.room);
    box = { kind: 'playing', room: s.room, due: s.due, round: room.round };
  });
  if (box && box.kind === 'lobby') {
    await roomio.writeSignals(box.room, box.prevCount);
    await roomio.updateCard(box.room, false);
    if (box.closed) await ops.refundCreate(box.room);
    await store.writeEvent(openid, 'room_leave', { phase: 'lobby' });
    if (box.closed) await store.writeEvent(null, 'room_close', { reason: 'empty', n: 0 });
  } else if (box && box.kind === 'playing') {
    if (box.due) await roomio.afterSettle(box.due, box.room);
    else await roomio.writeSignals(box.room);
    await store.writeEvent(openid, 'room_leave', { phase: 'playing', round: box.round });
  }
  return { ok: true };
});
