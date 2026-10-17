'use strict';
// joinRoom: take a seat in a lobby (spec 3A.3, 13.2, AC 136). A seated member just gets the room back (rejoin, any state). Otherwise: the group gate
// (bound room: fresh membership of ITS group, else WRONG_GROUP / NEED_GROUP; unbound room: bound to the joiner's group), the lobby must have a free
// seat (ROOM_STARTED / ROOM_FULL / ROOM_CLOSED), 公约, restriction, kill switches, the turn cap and 30 joins a day (first join of a room only),
// one room at a time, no open claim. The room card's count is updated afterwards.
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const roomio = require('./common/roomio');
const ops = require('./common/roomops');
const roomLib = require('./core/room');
const { bad } = require('./common/errors');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rjoin', 1, 10);
  const roomId = roomio.roomIdOf(event);
  const pre = roomId && (await roomio.loadRoom(roomId));
  if (!pre) bad('ROOM_NOT_FOUND');
  const cfg = await appconfig.get();
  if (roomLib.isMember(pre, openid)) {
    return roomio.memberResponse(pre, roomLib.seatOf(pre, openid), openid, cfg);
  }
  const p = await players.touch(openid);
  ops.policyOrThrow(p, cfg);
  const group = await ops.groupFor(openid, event.groupRef, pre);
  let out = null;
  await store.txn(async (t) => {
    const room = await store.getDocT(t, 'rooms', roomId);
    if (!room) bad('ROOM_NOT_FOUND');
    out = await ops.joinT(t, room, { openid, group, groupRef: event.groupRef, cfgRoom: cfg.config.room });
  });
  if (out.joined) {
    await roomio.writeSignals(out.room);
    await roomio.updateCard(out.room, false);
  }
  return roomio.memberResponse(out.room, out.seat, openid, cfg);
});
