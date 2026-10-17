'use strict';
// The shared building blocks of createRoom / joinRoom / rematch (spec 3A.3, 3A.9): the gates a player passes before taking a seat, and the two
// transactional writes (a new lobby, a new seat). No prompt-bank code lives here: lobbies hold no content.
const roomLib = require('../core/room');
const allowance = require('../core/allowance');
const strikes = require('../core/strikes');
const { CONFIG } = require('../core/config');
const store = require('./store');
const players = require('./players');
const appconfig = require('./appconfig');
const roomio = require('./roomio');
const { bad } = require('./errors');
const { now } = require('./util');

/**
 * Rules, restriction, kill switch and the live-rooms switch (AC 19, 53, 154). Throws coded errors.
 * `cfg` = appconfig.get(). Returns nothing.
 */
function policyOrThrow(p, cfg) {
  if (!cfg.features.liveRooms) bad('LIVE_OFF');
  if (p.rulesVersion < CONFIG.rulesVersion) bad('RULES_REQUIRED');
  const r = strikes.restrictionOf(p, now());
  if (r) bad('RESTRICTED', { until: r.until });
  if (!appconfig.createAllowed(cfg).ok) bad('UGC_PAUSED');
}

/** the room the player is seated in (lobby or playing, seat active), or null; a stale pointer is ignored (lazy, 3A.9) */
async function seatedRoomT(t, p) {
  if (!p.activeRoomId) return null;
  const r = await store.getDocT(t, 'rooms', p.activeRoomId);
  if (!r || (r.state !== 'lobby' && r.state !== 'playing')) return null;
  const i = roomLib.seatOf(r, p._id);
  return i >= 0 && r.seats[i].status === 'active' ? r : null;
}

/** the PLAYING room the player is seated in (active seat), or null: a 慢慢传 claim is refused while it exists (IN_ROOM, 3A.9) */
async function playingRoomOf(p) {
  if (!p.activeRoomId) return null;
  const r = await store.getDoc('rooms', p.activeRoomId);
  const i = r ? roomLib.seatOf(r, p._id) : -1;
  return r && r.state === 'playing' && i >= 0 && r.seats[i].status === 'active' ? r : null;
}

/** IN_CLAIM: the player holds a live 慢慢传 claim (the pointer is verified against the chain, edge: stale pointers are ignored) */
async function holdsClaimT(t, p) {
  const ref = p.claimRef;
  if (!ref || !(ref.expiresAt > now())) return false;
  const chain = await store.getDocT(t, 'chains', ref.chainId);
  return !!(chain && chain.claim && chain.claim.openid === p._id && chain.claim.claimId === ref.claimId && chain.claim.expiresAt > now());
}

/** the creator gets the allowance back when a lobby closes unstarted (3.9) */
async function refundCreate(room) {
  if (!room.creator) return;
  await players.mutate(room.creator, (p) => allowance.refundRoomCreate(p, room.dateKey || players.dateKey())).catch((e) => console.warn('refund failed', store.errText(e)));
}

/**
 * Inside a transaction: a new lobby with `openid` as host and seat 0. Throws the coded errors. `existingOk`: seated in a lobby already ->
 * returns that lobby (edge 9) instead of IN_OTHER_ROOM.
 * @returns {Promise<{room, created:boolean}>}
 */
async function createT(t, o) {
  const p = await players.getT(t, o.openid);
  const seated = await seatedRoomT(t, p);
  if (seated) {
    if (seated.state === 'lobby' && o.existingOk) return { room: seated, created: false };
    bad('IN_OTHER_ROOM', { otherRoomId: seated._id });
  }
  if (await holdsClaimT(t, p)) bad('IN_CLAIM');
  const lim = allowance.checkRoomCreate(p, players.dateKey());
  if (lim) bad(lim.code);
  let room = null;
  for (let i = 0; i < 4 && !room; i++) {
    const id = roomio.newRoomId();
    if (await store.getDocT(t, 'rooms', id)) continue;
    room = roomLib.newRoom({ roomId: id, host: o.openid, openGId: o.openGId, groupRef: o.groupRef, now: now(), dateKey: players.dateKey() });
  }
  if (!room) bad('INTERNAL');
  await players.putT(t, 'rooms', room._id, room);
  const np = allowance.consumeRoomCreate(p, players.dateKey());
  np.activeRoomId = room._id;
  await players.putPlayerT(t, np);
  return { room, created: true };
}

/**
 * Inside a transaction: take a seat in `room` (already read in this transaction). Throws the coded errors in the order of 13.2.
 * `group` = {openGId, member} from the pre-read group context. Idempotent for a seated member.
 * @returns {Promise<{room, joined:boolean, seat:number}>}
 */
async function joinT(t, room, o) {
  const seat = roomLib.seatOf(room, o.openid);
  if (seat >= 0) return { room, joined: false, seat };
  // the group gate first: a stranger learns nothing about the room beyond "wrong group" (8.16)
  let bind = null;
  if (room.openGId) {
    if (!o.group.member) bad(o.group.openGId && o.group.openGId !== room.openGId ? 'WRONG_GROUP' : 'NEED_GROUP');
  } else if (o.group.openGId) bind = { openGId: o.group.openGId, groupRef: o.groupRef };
  else bad('NEED_GROUP');
  const block = roomLib.joinBlock(room, o.cfgRoom);
  if (block) bad(block);
  const p = await players.getT(t, o.openid);
  const seated = await seatedRoomT(t, p);
  if (seated && seated._id !== room._id) bad('IN_OTHER_ROOM', { otherRoomId: seated._id });
  if (await holdsClaimT(t, p)) bad('IN_CLAIM');
  const lim = allowance.checkRoomJoin(p, players.dateKey(), room._id);
  if (lim) bad(lim.code);
  const next = roomLib.join(room, o.openid, now(), bind);
  await players.putT(t, 'rooms', room._id, next);
  const np = allowance.consumeRoomJoin(p, players.dateKey(), room._id);
  np.activeRoomId = room._id;
  await players.putPlayerT(t, np);
  return { room: next, joined: true, seat: next.seats.length - 1 };
}

/**
 * Close a lobby (idle 30 min, or the switches are off / admin). `why` = idle | switch | admin; an idle close re-checks the idle time inside the
 * transaction. The creator gets the createRoom back. Returns true when this call closed it.
 */
async function closeLobbyNow(roomId, cfgRoom, why) {
  let closed = null;
  await store.txn(async (t) => {
    closed = null;
    const r = await store.getDocT(t, 'rooms', roomId);
    if (!r || r.state !== roomLib.STATE.LOBBY) return;
    if (why === 'idle' && now() - r.lastActivityAt < cfgRoom.lobbyIdleMin * 60e3) return;
    const next = roomLib.closeLobby(r, now(), why);
    await players.putT(t, 'rooms', roomId, next);
    closed = next;
  });
  if (!closed) return false;
  await roomio.writeSignals(closed);
  await refundCreate(closed);
  await store.writeEvent(null, 'room_close', { reason: why === 'idle' ? 'idle' : 'admin', n: closed.seats.length });
  return true;
}


/** the group context of a call: the openGId of a valid groupRef and whether the caller is a fresh member of `room`'s group */
async function groupFor(openid, groupRef, room) {
  const { groupContext, isMember } = require('./groups');
  const openGId = await groupContext(openid, groupRef);
  const member = room && room.openGId ? await isMember(openid, room.openGId) : false;
  return { openGId, member };
}

module.exports = { closeLobbyNow, policyOrThrow, playingRoomOf, seatedRoomT, holdsClaimT, refundCreate, createT, joinT, groupFor };
