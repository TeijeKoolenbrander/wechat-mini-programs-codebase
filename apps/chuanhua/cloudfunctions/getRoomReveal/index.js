'use strict';
// getRoomReveal: the reveal overview of a finished room (spec 3A.8, 8.8, 13.2, AC 145, 156). MEMBERS (everyone seated at the start, also those who left)
// get one card per chain showing ONLY its final step (a sentence, a marker or a placeholder; a final drawing is loaded per chain with getReveal).
// Everyone else gets NOT_MEMBER with the room teaser: the chain count and per chain 「起点」→「终点」 in passed text, or 「起点」→（一幅画）.
const roomLib = require('./core/room');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const roomio = require('./common/roomio');
const { bad, errResp } = require('./common/errors');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'rreveal', 1, 60);
  const roomId = roomio.roomIdOf(event);
  let room = roomId && (await roomio.loadRoom(roomId));
  if (!room) bad('ROOM_NOT_FOUND');
  if (room.state === roomLib.STATE.REMOVED || room.state === roomLib.STATE.CLOSED) return errResp('ROOM_CLOSED', { state: room.state });
  if (room.state !== roomLib.STATE.REVEAL) return errResp('BAD_REQUEST', { state: room.state });
  const cfg = await appconfig.get();
  room = (await roomio.materialize(roomId)) || room;
  const member = roomLib.isMember(room, openid);

  const finals = {};
  const prompts = [];
  for (let c = 0; c < room.n; c++) {
    const chain = await store.getDoc('chains', room.chainIds[c]);
    const slot = roomLib.slotAt(room, room.R, roomLib.workerOfChain(c, room.R, room.n));
    const stepDoc = slot && slot.state === roomLib.SLOT.SENT ? await store.getDoc('steps', slot.stepId) : null;
    finals[c] = { stepDoc, hidden: !!(chain && (chain.hidden || chain.state === 'removed')) };
    prompts[c] = chain ? chain.promptText : null;
  }
  if (!member) {
    return errResp('NOT_MEMBER', {
      teaser: { roomId, n: room.n, rounds: room.R, paused: !cfg.ugc.viewEnabled, lines: roomLib.teaserLines(room, finals, prompts, cfg.ugc.viewEnabled) },
    });
  }
  // first view: remember it (the 我的接龙 dot) and count the lifetime reveal, atomically
  if (!(room.revealViewed || []).includes(openid)) {
    await store.txn(async (t) => {
      const r = await store.getDocT(t, 'rooms', roomId);
      if (!r || (r.revealViewed || []).includes(openid)) return;
      const p = await players.getT(t, openid);
      await players.putT(t, 'rooms', roomId, Object.assign({}, r, { revealViewed: (r.revealViewed || []).concat(openid) }));
      await players.putPlayerT(t, Object.assign({}, p, { lifetimeReveals: (p.lifetimeReveals || 0) + 1 }));
    });
  }
  const out = {
    ok: true,
    roomId,
    n: room.n,
    rounds: room.R,
    cards: roomLib.revealCards(room, openid, finals, cfg.ugc.viewEnabled),
    serverNow: now(),
  };
  if (room.rematchRoomId) out.rematchRoomId = room.rematchRoomId;
  return out;
});
