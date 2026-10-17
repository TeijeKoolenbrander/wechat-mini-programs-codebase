'use strict';
// getRoom: the room for a MEMBER (lobby, the current round with the caller's own assignment only, or the reveal state) and the entry fields for a
// NON-member (spec 3A.7, 8.16, 13.2, AC 140). Content never leaves except the caller's current source / roll / own sent turn, and only after the
// round started (a 1 s head start after each advance). Other seats' openids, work and chains are never returned (schema test).
// `groupRef` lets a non-member's entry say wrongGroup; `wantActivity` (members, card feature on) returns the room card's activity id.
const roomLib = require('./core/room');
const allowance = require('./core/allowance');
const strikes = require('./core/strikes');
const { CONFIG } = require('./core/config');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const roomio = require('./common/roomio');
const ops = require('./common/roomops');
const { bad } = require('./common/errors');
const { now } = require('./common/util');

const TOUCH_EVERY_MS = 30e3;

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rget', 1, 60);
  const roomId = roomio.roomIdOf(event);
  const room = roomId && (await roomio.loadRoom(roomId));
  if (!room) bad('ROOM_NOT_FOUND');
  const cfg = await appconfig.get();
  const seat = roomLib.seatOf(room, openid);

  if (seat >= 0) {
    let cur = room;
    // lobby presence: the server only records when a member last used the room (3A.6), at most every 30 s, no state change
    if (room.state === roomLib.STATE.LOBBY && now() - room.seats[seat].lastSeenAt > TOUCH_EVERY_MS) {
      try {
        cur = await store.txn(async (t) => {
          const r = await store.getDocT(t, 'rooms', roomId);
          if (!r || r.state !== roomLib.STATE.LOBBY || roomLib.seatOf(r, openid) < 0) return r || room;
          const n = roomLib.touchSeat(r, roomLib.seatOf(r, openid), now());
          await players.putT(t, 'rooms', roomId, n);
          return n;
        });
      } catch (e) {
        console.warn('touchSeat failed', store.errText(e));
      }
    }
    const out = await roomio.memberResponse(cur, roomLib.seatOf(cur, openid), openid, cfg);
    if (event.wantActivity === true && cfg.features.updatableCard) {
      const id = await roomio.activityFor(cur);
      if (id) out.activityId = id;
    }
    return out;
  }

  const [p, group] = await Promise.all([players.read(openid), ops.groupFor(openid, event.groupRef, room)]);
  let inOtherRoomId = null;
  if (p.activeRoomId && p.activeRoomId !== roomId) {
    const other = await roomio.loadRoom(p.activeRoomId);
    const i = other ? roomLib.seatOf(other, openid) : -1;
    if (other && (other.state === 'lobby' || other.state === 'playing') && i >= 0 && other.seats[i].status === 'active') inOtherRoomId = other._id;
  }
  const r = strikes.restrictionOf(p, now());
  const ctx = {
    now: now(),
    memberOfRoomGroup: group.member,
    groupOpenGId: group.openGId,
    rulesOk: p.rulesVersion >= CONFIG.rulesVersion,
    restrictedUntil: r ? r.until : 0,
    ugcOk: appconfig.createAllowed(cfg).ok && cfg.features.liveRooms,
    inOtherRoomId,
    capReached: !!allowance.checkRoomJoin(p, players.dateKey(), roomId),
  };
  return roomLib.entryView(room, ctx);
});
