'use strict';
// rollPrompts: the server-side roll of 3 prompts from 3 categories (spec 4.1, F-2, PO-34, AC 115-119). The bank is SERVER-ONLY (TD-103): only the 3 rolled
// texts leave. A client rng is never trusted.
//   慢慢传 {reroll?, rollId?}      writes players.roll + seenPrompts (ring of the last 300 shown). A plain call returns the CURRENT unused roll (so
//                                  repeated calls cannot browse the bank), else rolls anew; reroll = 换一批, up to CONFIG.roll.rerollsPerPick (5) per pick (a 6th: REROLL_LIMIT, nothing changes).
//   live   {roomId, reroll:true}   round 0 only, up to 5 per pick (a 6th: REROLL_LIMIT), only until the round-0 deadline (no grace); disjoint from every prompt shown in the room.
//                                  Without reroll it returns the seat's current roll. (The first roll comes with getRoom.)
const roll = require('./core/roll');
const roomLib = require('./core/room');
const { mulberry32 } = require('./core/rng');
const store = require('./common/store');
const players = require('./common/players');
const env = require('./common/env');
const roomio = require('./common/roomio');
const { bad } = require('./common/errors');
const { now, randomSeed } = require('./common/util');

const FRESH_MS = 10 * 60e3; // an unused roll is handed out again for this long

const texts = (ids) => ids.map((id) => ({ id, text: roomio.bank().promptById(id).text }));

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'roll', 1, 20);
  const reroll = event.reroll === true;
  const bankLib = roomio.bank().getPrompts();
  const rng = mulberry32(randomSeed());

  if (event.roomId !== undefined) {
    const roomId = roomio.roomIdOf(event);
    const pre = roomId && (await roomio.loadRoom(roomId));
    if (!pre) bad('ROOM_NOT_FOUND');
    const seat0 = roomLib.seatOf(pre, openid);
    if (seat0 < 0) bad('NOT_IN_ROOM');
    if (!reroll) {
      const cur = roomLib.rollOf(pre, seat0);
      if (!cur) bad('BAD_REQUEST');
      return { ok: true, rollId: cur.rollId, prompts: texts(cur.ids), rerollLeft: roll.rerollLeft(cur) };
    }
    const p = await players.read(openid);
    let res = null;
    await store.txn(async (t) => {
      const room = await store.getDocT(t, 'rooms', roomId);
      if (!room) bad('ROOM_NOT_FOUND');
      const seat = roomLib.seatOf(room, openid);
      if (seat < 0) bad('NOT_IN_ROOM');
      const cur = roomLib.rollOf(room, seat);
      if (cur && event.rollId !== undefined && event.rollId !== cur.rollId) bad('BAD_REQUEST'); // a stale rollId: the client reloads
      const block = roomLib.rerollBlock(room, seat, now());
      if (block === 'REROLL_LIMIT') bad(block, { rollId: cur.rollId, rerollLeft: 0 });
      if (block) bad(block);
      const r = roll.reroll({ bank: bankLib, seen: p.seenPrompts || [], firstIds: roll.shownOf(cur), exclude: room.usedPrompts, rng });
      const rollId = roomio.newRollId();
      const next = roomLib.applyReroll(room, seat, rollId, r.ids, now());
      await players.putT(t, 'rooms', roomId, next);
      res = { rollId, ids: r.ids, left: roll.rerollLeft(roomLib.rollOf(next, seat)) };
    });
    await players.mutate(openid, (pl) => Object.assign({}, pl, { seenPrompts: roll.pushSeen(pl.seenPrompts, res.ids) })).catch((e) => console.warn('seenPrompts failed', store.errText(e)));
    return { ok: true, rollId: res.rollId, prompts: texts(res.ids), rerollLeft: res.left };
  }

  // 慢慢传
  const out = await players.mutate(openid, (p) => {
    const cur = p.roll && p.roll.ctx === 'chain' && !p.roll.used ? p.roll : null;
    if (reroll) {
      if (!cur || (event.rollId !== undefined && event.rollId !== cur.rollId)) return { player: p, result: { err: 'BAD_REQUEST' } };
      if (roll.rerollLeft(cur) <= 0) return { player: p, result: { err: 'REROLL_LIMIT', extra: { rollId: cur.rollId, rerollLeft: 0 } } };
      const r = roll.reroll({ bank: bankLib, seen: p.seenPrompts || [], firstIds: roll.shownOf(cur), exclude: [], rng });
      const nr = Object.assign(roll.nextRec(cur, roomio.newRollId(), r.ids), { ctx: 'chain', used: false, at: now() });
      return { player: Object.assign({}, p, { roll: nr, seenPrompts: roll.pushSeen(p.seenPrompts, r.ids) }), result: { roll: nr } };
    }
    if (cur && now() - cur.at < FRESH_MS) return { player: p, result: { roll: cur } };
    const r = roll.rollThree({ bank: bankLib, seen: p.seenPrompts || [], rng });
    const nr = Object.assign(roll.newRec(roomio.newRollId(), r.ids), { ctx: 'chain', used: false, at: now() });
    return { player: Object.assign({}, p, { roll: nr, seenPrompts: roll.pushSeen(p.seenPrompts, r.ids) }), result: { roll: nr } };
  });
  if (out.err) bad(out.err, out.extra);
  return { ok: true, rollId: out.roll.rollId, prompts: texts(out.roll.ids), rerollLeft: roll.rerollLeft(out.roll) };
});
