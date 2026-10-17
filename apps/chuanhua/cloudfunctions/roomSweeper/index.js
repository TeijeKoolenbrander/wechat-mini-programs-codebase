'use strict';
// roomSweeper: the 1-minute timer for rooms nobody is watching (spec 3A.5, 3A.7, 7.5, 13.2, AC 144, 53, 154). Idempotent: every step is the same race-safe
// transaction the clients use, so overlapping runs, a tick and a late submit never double-apply. Server-only (FORBIDDEN for any call that carries an
// OPENID) and it runs only for the platform's timer event {Type:'Timer'} (L3, TD-99).
//   1. playing rooms: finish them at once when the kill switch (ugc.createEnabled false) or imageMode 'async' is on (all remaining slots become markers,
//      the room reveals), finish them gameMaxMin (20 min) after the start, and advance rounds overdue by more than 10 s past deadline + grace
//   2. lobbies: close those idle for lobbyIdleMin (30 min), and all of them when the switches are off (the creator gets the createRoom back)
//   3. over rooms: materialise reveals that missed it; delete the signal documents 1 day after the end; delete closed lobbies after 1 day
//   4. heal signals: a seat whose signal is older than the room's version (a failed write) is rewritten
const roomLib = require('./core/room');
const { CONFIG } = require('./core/config');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const roomio = require('./common/roomio');
const ops = require('./common/roomops');
const { now, configuredTimeoutMs } = require('./common/util');

const DAY = 86400e3;

exports.main = store.handler(async (event, { startedAt }) => {
  env.ugcGuard();
  const t = now();
  const deadline = startedAt + 0.8 * configuredTimeoutMs();
  const _ = store._();
  const cfg = await appconfig.get(0);
  const R = cfg.config.room;
  const off = cfg.ugc.createEnabled === false || cfg.config.moderation.imageMode === 'async';
  const summary = { advanced: 0, finished: 0, closed: 0, materialized: 0, signalsDeleted: 0, lobbiesDeleted: 0, healed: 0 };

  // 1. playing rooms
  const playing = (await store.coll('rooms').where({ state: roomLib.STATE.PLAYING }).limit(200).get()).data;
  for (const room of playing) {
    if (now() > deadline) break;
    if (off) {
      await roomio.advanceIfDue(room._id, 'sweeper', 'switch');
      summary.finished++;
    } else if (t >= room.startedAt + R.gameMaxMin * 60e3) {
      await roomio.advanceIfDue(room._id, 'sweeper');
      summary.finished++;
    } else if (t > roomLib.acceptUntil(room) + CONFIG.room.sweepOverdueMs) {
      const after = await roomio.advanceIfDue(room._id, 'sweeper');
      if (after && after.version !== room.version) summary.advanced++;
    }
  }

  // 2. lobbies
  const lobbies = (await store.coll('rooms').where({ state: roomLib.STATE.LOBBY }).limit(200).get()).data;
  for (const room of lobbies) {
    if (now() > deadline) break;
    if (off) {
      if (await ops.closeLobbyNow(room._id, R, 'switch')) summary.closed++;
    } else if (t - room.lastActivityAt >= R.lobbyIdleMin * 60e3) {
      if (await ops.closeLobbyNow(room._id, R, 'idle')) summary.closed++;
    }
  }

  // 3. over rooms
  const unmat = (await store.coll('rooms').where({ state: roomLib.STATE.REVEAL, materialized: false }).limit(50).get()).data;
  for (const room of unmat) {
    if (now() > deadline) break;
    await roomio.materialize(room._id);
    summary.materialized++;
  }
  const over = (await store.coll('rooms').where({ state: _.in([roomLib.STATE.REVEAL, roomLib.STATE.CLOSED]), endedAt: _.lt(t - CONFIG.room.signalKeepMs) }).limit(100).get()).data;
  for (const room of over) {
    if (now() > deadline) break;
    if (room.state === roomLib.STATE.CLOSED && !room.startedAt) {
      await store.coll('room_signals').where({ roomId: room._id }).remove();
      await store.coll('rooms').doc(room._id).remove();
      summary.lobbiesDeleted++;
    } else if (!room.signalsGone) {
      const r = await store.coll('room_signals').where({ roomId: room._id }).remove();
      await store.coll('rooms').doc(room._id).update({ data: { signalsGone: true } });
      summary.signalsDeleted += (r && r.stats && r.stats.removed) || 0;
    }
  }

  // 4. heal signals of rooms that changed in the last 3 minutes
  const live = (await store.coll('rooms').where({ state: _.in([roomLib.STATE.PLAYING, roomLib.STATE.LOBBY, roomLib.STATE.REVEAL]), lastActivityAt: _.gt(t - 3 * 60e3) }).limit(100).get()).data;
  for (const room of live) {
    if (now() > deadline) break;
    let stale = false;
    for (let i = 0; i < room.seats.length && !stale; i++) {
      const s = await store.getDoc('room_signals', room._id + '_' + i);
      if (!s || s.seq < room.version || s._openid !== room.seats[i].openid) stale = true;
    }
    if (stale) {
      await roomio.writeSignals(room);
      summary.healed++;
    }
  }
  return Object.assign({ ok: true }, summary);
}, { auth: false, serverOnly: true, timer: true });
