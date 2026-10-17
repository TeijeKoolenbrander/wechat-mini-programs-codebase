'use strict';
// rematch: 再来一局 (spec 8.8, 13.2, AC 151). A member of a revealed room gets the ONE new room of that game: the first caller creates it (bound to the same
// group; it counts as a createRoom) and records it on the old room in the same transaction, every later caller joins it (counts as a joinRoom). Nobody is
// moved automatically. The old room's signals are bumped so the other members' reveal screens can show "房主开了新的一局 · 加入 ›".
const roomLib = require('./core/room');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const roomio = require('./common/roomio');
const ops = require('./common/roomops');
const { bad } = require('./common/errors');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rmatch', 1, 5);
  const roomId = roomio.roomIdOf(event);
  const first = roomId && (await roomio.loadRoom(roomId));
  if (!first) bad('ROOM_NOT_FOUND');
  if (roomLib.seatOf(first, openid) < 0) bad('NOT_IN_ROOM');
  if (first.state !== roomLib.STATE.REVEAL) bad('BAD_REQUEST');
  const cfg = await appconfig.get();
  const p = await players.touch(openid);
  ops.policyOrThrow(p, cfg);

  let out = null;
  for (let i = 0; i < 4 && !out; i++) {
    const old = await roomio.loadRoom(roomId);
    if (old.rematchRoomId) {
      const target = await roomio.loadRoom(old.rematchRoomId);
      if (!target) bad('ROOM_CLOSED');
      const group = { openGId: old.openGId, member: true }; // the old room's members came in through that group
      let joined = null;
      await store.txn(async (t) => {
        const room = await store.getDocT(t, 'rooms', target._id);
        if (!room) bad('ROOM_NOT_FOUND');
        joined = await ops.joinT(t, room, { openid, group, groupRef: old.groupRef, cfgRoom: cfg.config.room });
      });
      out = { room: joined.room, created: false, joined: joined.joined, old: null };
    } else {
      out = await store.txn(async (t) => {
        const o = await store.getDocT(t, 'rooms', roomId);
        if (o.rematchRoomId) return null; // lost the race: join the winner's room on the next pass
        const c = await ops.createT(t, { openid, openGId: o.openGId, groupRef: o.groupRef, existingOk: false });
        const marked = roomLib.setRematch(o, c.room._id, now());
        await players.putT(t, 'rooms', roomId, marked);
        return { room: c.room, created: true, joined: false, old: marked };
      });
    }
  }
  if (!out) bad('INTERNAL');
  if (out.created || out.joined) await roomio.writeSignals(out.room);
  if (out.old) await roomio.writeSignals(out.old); // the other members' reveal screens learn about the new room
  if (out.joined) await roomio.updateCard(out.room, false);
  if (out.created) await store.writeEvent(null, 'room_create', { bound: !!out.room.openGId });
  const res = await roomio.memberResponse(out.room, roomLib.seatOf(out.room, openid), openid, cfg);
  res.created = out.created;
  return res;
});
