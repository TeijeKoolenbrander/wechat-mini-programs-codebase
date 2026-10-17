'use strict';
// Room I/O (spec 3A): everything that touches the database for a live room. Every DECISION comes from core/room.js (pure, shared with the
// mock server): this module loads, runs the transitions inside a transaction guarded by the room document, and does the work that follows a
// commit (signals, card, events, stats, materialisation). A round advances EXACTLY ONCE however many callers race (the transaction re-reads the
// room and `roomLib.decide` says "none" for the loser).
const roomLib = require('../core/room');
const chainLib = require('../core/chain');
const copy = require('../core/copy');
const schema = require('../core/schema');
const { CONFIG } = require('../core/config');
const { beijingDateKey } = require('../core/date');
const store = require('./store');
const players = require('./players');
const wx = require('./wxapi');
const env = require('./env');
const lifecycle = require('./lifecycle');
const { now, randomId } = require('./util');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const newRoomId = () => randomId(10, B32);
const newRollId = () => 'r' + randomId(11, 'abcdefghijklmnopqrstuvwxyz0123456789');
const ROOM_ID_RE = /^[A-Z2-7]{10}$/;

/** the prompt bank is SERVER-ONLY (TD-103) and loaded lazily: only the functions flagged `bank` in core/schema.js can reach it */
const bank = () => require('../core/prompts');

function roomIdOf(d) {
  return d && typeof d.roomId === 'string' && ROOM_ID_RE.test(d.roomId) ? d.roomId : null;
}
const loadRoom = (id) => store.getDoc('rooms', id);

/** the prompt text of a resolved round-0 slot */
function promptTextOf(slot) {
  if (slot.custom) return slot.text;
  const p = bank().promptById(slot.promptId);
  return p ? p.text : '';
}

// ---- signals (3A.7) -------------------------------------------------------------------------------------------------

/** the content-free doorbell of one seat: ids, counts and timing only (AC 146, 73) */
function signalDoc(room, seat) {
  const doc = {
    _openid: room.seats[seat].openid,
    roomId: room._id,
    seq: room.version,
    state: room.state,
    round: room.round,
    kind: room.kind,
    phase: roomLib.phaseAt(room, now()),
    deadline: room.deadline,
    serverNow: now(),
    sent: roomLib.sentCount(room),
    active: roomLib.activeSeats(room),
  };
  if (room.rematchRoomId) doc.rematchRoomId = room.rematchRoomId;
  return doc;
}

/**
 * Write every seat's signal (best effort, never fails a request). A signal is only replaced by a newer `seq`, so two commits racing
 * to write cannot leave an older state behind; roomSweeper heals any seat that missed one. `prevCount` = the seat count before a lobby
 * shrink, so the trailing signal documents are removed.
 */
async function writeSignals(room, prevCount) {
  const jobs = room.seats.map(async (s, i) => {
    const id = schema.signalId(room._id, i);
    try {
      const cur = await store.getDoc('room_signals', id);
      if (cur && cur.seq > room.version) return;
      await store.coll('room_signals').doc(id).set({ data: signalDoc(room, i) });
    } catch (e) {
      console.warn('signal write failed', id, store.errText(e));
    }
  });
  for (let i = room.seats.length; i < (prevCount || 0); i++) {
    jobs.push(store.coll('room_signals').doc(schema.signalId(room._id, i)).remove().catch(() => {}));
  }
  await Promise.all(jobs);
}

// ---- the updatable room card (9.5) ------------------------------------------------------------------------------------

/** "当前 n/10 人" / started. Errors are logged and never block anything. */
async function updateCard(room, started) {
  if (!room.activityId || room.state === 'removed') return;
  if (room.activityExpiresAt && room.activityExpiresAt <= now()) return;
  try {
    const cfg = await require('./appconfig').get();
    if (!cfg.features.updatableCard) return;
    if (env.envState().mode === 'mock') return;
    let ok = true;
    try {
      await wx.setUpdatableMsg(room.activityId, room.seats.length, cfg.config.room.maxPlayers, !!started);
    } catch (e) {
      ok = false;
      console.warn('setUpdatableMsg (room) failed', store.errText(e));
    }
    await store.writeEvent(null, 'share_update', { result: ok ? 'ok' : 'error', passed: room.seats.length });
  } catch (e) {
    console.warn('room card failed', store.errText(e));
  }
}

/** the activity id of the room card, created lazily on the first share (members only), valid 24 h */
async function activityFor(room) {
  if (room.activityId && room.activityExpiresAt > now()) return room.activityId;
  try {
    const id = env.envState().mode === 'mock' ? 'mock-activity-' + room._id : await wx.createActivityId();
    await store.coll('rooms').doc(room._id).update({ data: { activityId: id, activityExpiresAt: now() + 86400e3 } });
    return id;
  } catch (e) {
    console.warn('createActivityId (room) failed', store.errText(e));
    return null;
  }
}

// ---- settling a room inside a transaction -------------------------------------------------------------------------------

/** the prompts of round 0 are written onto the chain documents when round 0 ends (3A.4) */
async function writeChainPromptsT(t, room) {
  for (let c = 0; c < room.n; c++) {
    const p = roomLib.slotPrompt(room, c);
    if (!p) continue;
    await store.collT(t, 'chains').doc(room.chainIds[c]).update({ data: { promptId: p.promptId, promptText: promptTextOf(p), custom: p.custom, lastActivityAt: now() } });
  }
}

/**
 * Inside a transaction: if the room is due (all slots resolved, deadline + grace passed with nothing in flight, or the 20-minute cap), advance
 * it. Idempotent: the caller passes the room it just read/changed; the loser of a race reads a newer room and gets `due: null`.
 * @returns {Promise<{room, due: null | {action, reason, from, ended, fills, source, prev}}>}
 */
async function settleT(t, room, source, forceFinish) {
  const cfg = await require('./appconfig').get();
  const d = forceFinish ? { action: 'finish', reason: forceFinish } : roomLib.decide(room, now(), cfg.config.room);
  if (d.action === 'none') return { room, due: null };
  const res = d.action === 'finish' ? roomLib.finish(room, now(), d.reason) : roomLib.advance(room, now(), d.reason);
  if (room.round === 0) await writeChainPromptsT(t, res.room);
  return { room: res.room, due: { action: d.action, reason: d.reason, from: room.round, ended: res.ended, fills: res.fills, source, prev: room } };
}

function countMarkers(room) {
  let n = 0;
  for (let r = 1; r <= room.R; r++) for (const s of room.slots[String(r)]) if (s.state === roomLib.SLOT.MARKER) n++;
  return n;
}

/** after the commit that advanced a room: signals, events, stats, materialisation (all best effort) */
async function afterSettle(due, room) {
  if (!due) return;
  await writeSignals(room);
  const prev = due.prev;
  const markers = room.slots[String(due.from)].filter((s) => s.state === roomLib.SLOT.MARKER).length;
  const sent = room.slots[String(due.from)].length - markers;
  const endedBy = due.source === 'sweeper' ? 'sweeper' : due.reason === 'all' ? 'all' : 'deadline';
  await store.writeEvent(null, 'room_round', { round: due.from, kind: prev.kind, n: room.n, sent, markers, endedBy, durationMs: Math.max(0, now() - prev.roundStartAt) });
  if (due.ended) {
    const left = room.seats.filter((s) => s.status === 'left').length;
    const m = countMarkers(room);
    await store.writeEvent(null, 'room_end', { n: room.n, rounds: room.R, durationSec: Math.round((now() - room.startedAt) / 1000), markers: m, left, endedBy: room.endedBy });
    await lifecycle.bumpDaily({ roomsFinished: 1, markers: m });
    await lifecycle.bumpGroup({ openGId: room.openGId }, { rooms: 1 });
    await materialize(room._id);
  }
}

/** settle a room that nobody is touching (tick, sweeper, admin): returns the room as it stands afterwards */
async function advanceIfDue(roomId, source, forceFinish) {
  let box = null;
  const room = await store.txn(async (t) => {
    box = null;
    const cur = await store.getDocT(t, 'rooms', roomId);
    if (!cur) return null;
    const s = await settleT(t, cur, source, cur.state === 'playing' ? forceFinish : null);
    if (!s.due) return cur;
    await players.putT(t, 'rooms', roomId, s.room);
    box = s.due;
    return s.room;
  });
  await afterSettle(box, room);
  return room;
}

// ---- materialisation (idempotent) ----------------------------------------------------------------------------------------

/**
 * Once a room is over: the marker steps become `steps` documents and the n chains get their final shape (stepIds, authors, passed, `revealed`),
 * so reports, 笑, deletion, retention and `getReveal` reuse the 慢慢传 machinery (3A.4). Safe to call any number of times and from any caller.
 */
async function materialize(roomId) {
  const room = await loadRoom(roomId);
  if (!room || room.state !== 'reveal' || room.materialized) return room;
  const plan = roomLib.materializePlan(room);
  const t0 = now();
  for (const m of plan.markers) {
    await store.addIfAbsent('steps', {
      _id: m.stepId, chainId: m.chainId, n: m.n, attempt: 1, kind: m.kind, author: m.author, claimId: null, marker: m.marker, auto: true, state: 'passed',
      mod: { kind: 'marker' }, hiddenReason: null, laughs: 0, createdAt: t0,
    });
  }
  for (const c of plan.chains) {
    const chain = await store.getDoc('chains', c.chainId);
    if (!chain || chain.state !== 'open') continue; // removed / already revealed
    await store.coll('chains').doc(c.chainId).update({
      data: { stepIds: c.stepIds, authors: c.authors, passed: room.R, nextStep: null, state: 'revealed', revealedAt: room.endedAt, revealReason: 'complete', lastActivityAt: t0, roomId: room._id },
    });
  }
  await store.coll('rooms').doc(roomId).update({ data: { materialized: true } });
  return room;
}

// ---- views ------------------------------------------------------------------------------------------------------------------

async function sourceCtx(room, seat, cfg) {
  const c = roomLib.chainOfSeat(seat, room.round, room.n);
  const o = { viewEnabled: cfg.ugc.viewEnabled, promptText: null, promptCustom: false, promptHidden: false, prevStep: null };
  if (room.round === 1) {
    const p = roomLib.slotPrompt(room, c);
    if (p) {
      o.promptText = promptTextOf(p);
      o.promptCustom = p.custom;
      if (p.custom) {
        const chain = await store.getDoc('chains', room.chainIds[c]);
        o.promptHidden = !!(chain && chain.hidden);
      }
    }
  } else if (room.round >= 2) {
    const prev = roomLib.slotAt(room, room.round - 1, roomLib.sourceSeat(seat, room.n));
    if (prev && prev.state === roomLib.SLOT.SENT) o.prevStep = await store.getDoc('steps', prev.stepId);
  }
  return o;
}

async function mineOf(room, seat) {
  const slot = roomLib.slotAt(room, room.round, seat);
  if (slot.state === roomLib.SLOT.MARKER) return { kind: 'marker', marker: slot.marker, text: copy.markerText(slot.marker) };
  if (room.round === 0) return { kind: 'prompt', text: promptTextOf(slot), custom: !!slot.custom };
  const st = await store.getDoc('steps', slot.stepId);
  if (!st) return null;
  return st.kind === 'draw' ? { kind: 'draw', strokes: st.strokes } : { kind: 'describe', text: st.text };
}

/** getRoom for a MEMBER: the lobby/round/reveal state plus ONLY this seat's current assignment (13.2, AC 140) */
async function memberResponse(room, seat, openid, cfg) {
  const o = { now: now() };
  if (room.state === 'playing') {
    const slot = room.slots[String(room.round)][seat];
    if (roomLib.isResolved(slot)) o.mine = await mineOf(room, seat);
    else if (o.now >= room.roundStartAt) {
      if (room.round === 0) {
        const roll = roomLib.rollOf(room, seat);
        o.promptsView = roll.ids.map((id) => ({ id, text: bank().promptById(id).text }));
      } else o.source = roomLib.sourceFor(room, seat, await sourceCtx(room, seat, cfg));
    }
  }
  const out = roomLib.memberView(room, seat, openid, o);
  out.features = { liveRooms: cfg.features.liveRooms };
  return out;
}

module.exports = {
  newRoomId, newRollId, roomIdOf, loadRoom, promptTextOf, signalDoc, writeSignals, updateCard, activityFor,
  settleT, afterSettle, advanceIfDue, materialize, memberResponse, mineOf, sourceCtx, countMarkers, bank,
};
