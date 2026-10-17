'use strict';
// createRoom: open a live lobby (spec 3A.3, 13.2, AC 135). The caller becomes host and seat 0 (shown as 1). Checks, in order: live rooms on,
// 公约, restriction, kill switches, image-quota guard (UGC_BUSY at 95%), the daily turn cap and 10 rooms a day, one room at a time
// (IN_OTHER_ROOM; a player already in a lobby gets THAT lobby back, edge 9), no open 慢慢传 claim (IN_CLAIM). A `groupRef` with a fresh membership
// binds the room to that group at once; without it the room is unbound until the first join from a group card.
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const modio = require('./common/modio');
const env = require('./common/env');
const roomio = require('./common/roomio');
const ops = require('./common/roomops');
const roomLib = require('./core/room');
const { bad } = require('./common/errors');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rcreate', 1, 5);
  const cfg = await appconfig.get();
  const p = await players.touch(openid);
  ops.policyOrThrow(p, cfg);
  const lvl = await modio.imageLevel();
  if (lvl === 'pauseCreate' || lvl === 'failClosed') bad('UGC_BUSY');
  const g = await ops.groupFor(openid, event.groupRef, null);
  const out = await store.txn((t) => ops.createT(t, { openid, openGId: g.openGId, groupRef: g.openGId ? event.groupRef : null, existingOk: true }));
  const room = out.room;
  const seat = roomLib.seatOf(room, openid);
  if (out.created) {
    await roomio.writeSignals(room);
    await store.writeEvent(null, 'room_create', { bound: !!room.openGId });
  }
  return roomio.memberResponse(room, seat, openid, cfg);
});
