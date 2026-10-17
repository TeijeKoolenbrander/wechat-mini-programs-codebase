'use strict';
// startRoom: the host starts the game (spec 3A.3-3A.5, 13.2, AC 137, 138). Host only (NOT_HOST), >= 3 active seats (NOT_ENOUGH_PLAYERS). Fixes the seats,
// n and R = min(n - 1, maxRounds), snapshots the timers, creates the n live chains, rolls the round-0 prompts (one roll per seat, pairwise disjoint,
// none among the seat's last 300 shown) and sets the round-0 deadline. If the lobby changes while the rolls are computed the start is retried.
const roll = require('./core/roll');
const roomLib = require('./core/room');
const chainLib = require('./core/chain');
const { mulberry32 } = require('./core/rng');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const lifecycle = require('./common/lifecycle');
const roomio = require('./common/roomio');
const { bad } = require('./common/errors');
const { now, randomSeed, newChainId } = require('./common/util');

const START_BUDGET_MS = 5000; // the function timeout is 8 s

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rstart', 1, 5);
  const roomId = roomio.roomIdOf(event);
  if (!roomId) bad('ROOM_NOT_FOUND');
  const cfg = await appconfig.get();
  if (!cfg.features.liveRooms) bad('LIVE_OFF');
  if (!appconfig.createAllowed(cfg).ok) bad('UGC_PAUSED');

  let started = null;
  // rolls are kept per openid across attempts: when joins keep landing only the NEW seats are rolled (QA-R2-2c); the lobby is re-read until it is
  // stable (bounded by time, not by a count of 4), then the answer is the retryable BUSY_RETRY, never INTERNAL
  const rollByOpenid = new Map();
  const bankLib = roomio.bank().getPrompts();
  const budgetUntil = Date.now() + START_BUDGET_MS;
  for (let attempt = 0; !started && (attempt < 3 || Date.now() < budgetUntil); attempt++) {
    const pre = await roomio.loadRoom(roomId);
    if (!pre) bad('ROOM_NOT_FOUND');
    if (roomLib.seatOf(pre, openid) < 0) bad('NOT_IN_ROOM');
    const block = roomLib.startBlock(pre, openid, cfg.config.room);
    if (block) bad(block);
    const present = new Set(pre.seats.map((s) => s.openid));
    for (const k of Array.from(rollByOpenid.keys())) if (!present.has(k)) rollByOpenid.delete(k); // a seat that left: its roll is free again
    const used = [];
    rollByOpenid.forEach((r) => used.push(...r.ids));
    const fresh = pre.seats.filter((s) => !rollByOpenid.has(s.openid));
    const seen = await Promise.all(fresh.map(async (s) => (await players.read(s.openid)).seenPrompts || []));
    const rng = mulberry32(randomSeed());
    fresh.forEach((s, i) => {
      const r = roll.rollThree({ bank: bankLib, seen: seen[i], exclude: used, rng });
      used.push(...r.ids); // pairwise disjoint across the whole room
      rollByOpenid.set(s.openid, { rollId: roomio.newRollId(), ids: r.ids });
    });
    const rolls = pre.seats.map((s) => rollByOpenid.get(s.openid));
    const chainIds = pre.seats.map(() => newChainId());
    started = await store.txn(async (t) => {
      const room = await store.getDocT(t, 'rooms', roomId);
      if (!room) bad('ROOM_NOT_FOUND');
      if (room.version !== pre.version) return null; // someone joined or left meanwhile: roll for the new seats only and go again
      const b = roomLib.startBlock(room, openid, cfg.config.room);
      if (b) bad(b);
      const next = roomLib.start(room, { now: now(), chainIds, rolls, cfg: cfg.config.room });
      const participants = next.seats.map((s) => s.openid);
      for (let c = 0; c < next.n; c++) {
        const chain = chainLib.newLiveChain({
          chainId: chainIds[c], roomId, seat: c, starter: participants[c], participants, rounds: next.R, now: now(), dateKey: players.dateKey(),
          openGId: next.openGId, groupRef: next.groupRef,
        });
        await players.putT(t, 'chains', chainIds[c], chain);
      }
      await players.putT(t, 'rooms', roomId, next);
      return { room: next, rolls, lobbySec: Math.round((now() - room.createdAt) / 1000) };
    });
  }
  if (!started) bad('BUSY_RETRY');

  const room = started.room;
  const rolls = started.rolls;
  // the ids that were shown count for the no-repeat window (4.1); best effort, in parallel
  await Promise.all(room.seats.map((s, i) => players.mutate(s.openid, (p) => Object.assign({}, p, { seenPrompts: roll.pushSeen(p.seenPrompts, rolls[i].ids) })).catch((e) => console.warn('seenPrompts failed', store.errText(e)))));
  await roomio.writeSignals(room);
  await roomio.updateCard(room, true);
  await lifecycle.bumpDaily({ rooms: 1 });
  await store.writeEvent(null, 'room_start', { n: room.n, rounds: room.R, lobbySec: started.lobbySec });
  return roomio.memberResponse(room, roomLib.seatOf(room, openid), openid, cfg);
});
