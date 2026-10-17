'use strict';
// roomTick: advance the room if it is due, then return it (spec 3A.5, 13.2, AC 141). Every client calls it at deadline + grace + 1 s and then every 2 s
// until the round changes, so a round always advances even when no signal arrives. IDEMPOTENT and race-safe: the advance is one transaction on the room
// document that re-reads the room, so any number of concurrent ticks / submits / sweeper runs produce exactly one advance. Members only.
const roomLib = require('./core/room');
const store = require('./common/store');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const roomio = require('./common/roomio');
const { bad } = require('./common/errors');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rtick', 1, 40);
  const roomId = roomio.roomIdOf(event);
  const pre = roomId && (await roomio.loadRoom(roomId));
  if (!pre) bad('ROOM_NOT_FOUND');
  if (roomLib.seatOf(pre, openid) < 0) bad('NOT_IN_ROOM');
  const cfg = await appconfig.get();
  const room = await roomio.advanceIfDue(roomId, 'tick');
  return roomio.memberResponse(room, roomLib.seatOf(room, openid), openid, cfg);
});
