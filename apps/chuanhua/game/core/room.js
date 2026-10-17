'use strict';
/**
 * Live rooms (spec 3A, F-5, PO-41..43, AC 135-151): the pure state machine. No I/O, no clock (`now` is always a parameter), no
 * randomness. Every transition takes a `rooms` document and returns a NEW one, so the cloud functions run them inside a
 * transaction (guarded by `version`) and the mock server runs the very same code.
 *
 * ROOM DOCUMENT (spec 13.1):
 *   _id, host (openid; hands over in the lobby), creator (openid), openGId|null, groupRef|null,
 *   state: lobby | playing | reveal | closed | removed
 *   seats: [{openid, joinedAt, status: active | left, lastSeenAt}]   (join order; fixed at start)
 *   n, R, round (0..R; null in the lobby), kind (prompt | draw | describe; null in the lobby), phase ('turn'; `passing` is derived, see phaseAt)
 *   roundStartAt, deadline, timers {promptSec, drawSec, describeSec, graceSec} (snapshot at start)
 *   slots: { '0': [slot per seat], '1': [...], ... }   slot = {state: none | received | sent | blocked | marker, at, attempt, stepId?, marker?, auto?,
 *                                                                 round 0 only: promptId? | custom? + text?}
 *   chainIds: [n]   rolls: [{rollId, ids[3], rerolls 0..5, shownIds[<=18]}] per seat (round 0)   usedPrompts: [ids shown in this room]
 *   version (bumped by every change, = the signal `seq`), rematchRoomId, activityId, activityExpiresAt, materialized,
 *   createdAt, startedAt, endedAt, endedBy (normal | cap | switch | empty | admin), lastActivityAt, dateKey
 *
 * ROTATION (3A.4, AC 139): chain c (started by seat c in round 0) is worked in round r (1..R) by seat (c + r) mod n; equivalently seat s works on
 * chain (s - r) mod n and sees the previous output of seat (s - 1) mod n. With r <= n - 1 nobody touches their own chain or one chain twice.
 */

const { CONFIG } = require('./config');
const copy = require('./copy');
const rollLib = require('./roll');
const { hash32 } = require('./rng');

const L = CONFIG.room;

const STATE = { LOBBY: 'lobby', PLAYING: 'playing', REVEAL: 'reveal', CLOSED: 'closed', REMOVED: 'removed' };
const SLOT = { NONE: 'none', RECEIVED: 'received', SENT: 'sent', BLOCKED: 'blocked', MARKER: 'marker' };

const clone = (o) => JSON.parse(JSON.stringify(o));
const mod = (a, n) => ((a % n) + n) % n;

// ---- shape ----------------------------------------------------------------------------------------------------

/** R = min(n - 1, maxRounds) (3A.4) */
function roundsFor(n, maxRounds) {
  return Math.min(n - 1, maxRounds === undefined ? L.maxRounds : maxRounds);
}

/** round 0 = prompt, odd rounds draw, even rounds describe */
function kindOfRound(r) {
  if (r === 0) return 'prompt';
  return r % 2 === 1 ? 'draw' : 'describe';
}

/** seconds of a round kind from a timers snapshot */
function secFor(kind, timers) {
  const t = timers || L;
  return kind === 'prompt' ? t.promptSec : kind === 'draw' ? t.drawSec : t.describeSec;
}

/** the chain seat `s` works on in round `r` (r = 0: its own) */
function chainOfSeat(s, r, n) {
  return mod(s - r, n);
}
/** the seat that works on chain `c` in round `r` */
function workerOfChain(c, r, n) {
  return mod(c + r, n);
}
/** the seat whose previous-round output seat `s` receives */
function sourceSeat(s, n) {
  return mod(s - 1, n);
}

/** every (round, seat) -> chain assignment of a game, for tests and docs: out[r][s] = chain */
function rotationTable(n, R) {
  const out = [];
  for (let r = 0; r <= R; r++) {
    const row = [];
    for (let s = 0; s < n; s++) row.push(chainOfSeat(s, r, n));
    out.push(row);
  }
  return out;
}

// ---- lookups ----------------------------------------------------------------------------------------------------

function seatOf(room, openid) {
  if (!openid) return -1;
  return room.seats.findIndex((s) => s.openid === openid);
}
function isMember(room, openid) {
  return seatOf(room, openid) >= 0;
}
function activeSeats(room) {
  return room.seats.filter((s) => s.status === 'active').length;
}
function isResolved(slot) {
  return !!slot && (slot.state === SLOT.SENT || slot.state === SLOT.MARKER);
}
function slotAt(room, round, seat) {
  return room.slots && room.slots[String(round)] ? room.slots[String(round)][seat] : null;
}
/** resolved slots (sent or marker) of the current round */
function sentCount(room) {
  if (room.state !== STATE.PLAYING) return 0;
  return room.slots[String(room.round)].filter(isResolved).length;
}

/** milliseconds from the start of a round to the deadline */
function roundMs(room) {
  return secFor(kindOfRound(room.round), room.timers) * 1000;
}
/** a send is accepted when the function started at or before deadline + grace (3A.5) */
function acceptUntil(room) {
  return room.deadline + room.timers.graceSec * 1000;
}

/**
 * `turn` while the timer runs, `passing` before the round starts (the 1 s head start) and from the deadline on (while the last
 * checks finish and the next round is assigned). Derived at read time; never stored (3A.2).
 */
function phaseAt(room, now) {
  if (room.state !== STATE.PLAYING) return null;
  return now < room.roundStartAt || now >= room.deadline ? 'passing' : 'turn';
}

// ---- creation, lobby ----------------------------------------------------------------------------------------------

function newRoom(o) {
  return {
    _id: o.roomId,
    host: o.host,
    creator: o.host, // never changes: the createRoom allowance comes back when the lobby closes unstarted (3.9)
    openGId: o.openGId || null,
    groupRef: o.groupRef || null,
    state: STATE.LOBBY,
    seats: [{ openid: o.host, joinedAt: o.now, status: 'active', lastSeenAt: o.now }],
    n: 0,
    R: 0,
    round: null,
    kind: null,
    phase: null,
    roundStartAt: null,
    deadline: null,
    timers: null,
    slots: null,
    chainIds: null,
    rolls: null,
    usedPrompts: [],
    version: 1,
    rematchRoomId: null,
    activityId: null,
    activityExpiresAt: null,
    materialized: false,
    createdAt: o.now,
    startedAt: null,
    endedAt: null,
    endedBy: null,
    lastActivityAt: o.now,
    dateKey: o.dateKey,
  };
}

function bump(room, now) {
  room.version += 1;
  room.lastActivityAt = now;
  return room;
}

/** can a non-member take a seat? Returns null or an error code (ROOM_STARTED | ROOM_FULL | ROOM_CLOSED) */
function joinBlock(room, cfg) {
  if (room.state === STATE.CLOSED || room.state === STATE.REMOVED) return 'ROOM_CLOSED';
  if (room.state !== STATE.LOBBY) return 'ROOM_STARTED';
  if (room.seats.length >= ((cfg && cfg.maxPlayers) || L.maxPlayers)) return 'ROOM_FULL';
  return null;
}

/** take a seat (call joinBlock first). Binds an unbound room to `bind` ({openGId, groupRef}). */
function join(room, openid, now, bind) {
  const r = clone(room);
  r.seats.push({ openid, joinedAt: now, status: 'active', lastSeenAt: now });
  if (bind && !r.openGId) {
    r.openGId = bind.openGId;
    r.groupRef = bind.groupRef || null;
  }
  return bump(r, now);
}

/**
 * A member leaves the lobby (3A.6): the seat is removed and seats renumber in join order; the earliest-joined remaining member
 * becomes host; the last member leaving closes the room.
 * @returns {{room, closed:boolean, hostChanged:boolean}}
 */
function leaveLobby(room, openid, now) {
  const r = clone(room);
  const i = seatOf(r, openid);
  if (i < 0) return { room, closed: false, hostChanged: false };
  r.seats.splice(i, 1);
  let hostChanged = false;
  let closed = false;
  if (!r.seats.length) {
    r.state = STATE.CLOSED;
    r.endedAt = now;
    r.endedBy = 'empty';
    closed = true;
  } else if (r.host === openid) {
    r.host = r.seats[0].openid;
    hostChanged = true;
  }
  return { room: bump(r, now), closed, hostChanged };
}

/** close an idle lobby (30 min) or a lobby the switches shut */
function closeLobby(room, now, reason) {
  const r = clone(room);
  r.state = STATE.CLOSED;
  r.endedAt = now;
  r.endedBy = reason;
  return bump(r, now);
}

/** record that a seat used the room (lastSeenAt, for the lobby's "可能已离开" hint) */
function touchSeat(room, seat, now) {
  const r = clone(room);
  r.seats[seat].lastSeenAt = now;
  return r; // version untouched: this is not a state change
}

/** can the host start? null or an error code */
function startBlock(room, openid, cfg) {
  if (room.state === STATE.CLOSED || room.state === STATE.REMOVED) return 'ROOM_CLOSED';
  if (room.state !== STATE.LOBBY) return 'ROOM_STARTED';
  if (room.host !== openid) return 'NOT_HOST';
  if (activeSeats(room) < ((cfg && cfg.minPlayers) || L.minPlayers)) return 'NOT_ENOUGH_PLAYERS';
  return null;
}

/**
 * Start the game: fix seats, n and R, snapshot the timers, create the slots and the round-0 deadline (3A.3-3A.5).
 * @param {{now:number, chainIds:string[], rolls:{rollId:string, ids:string[]}[], cfg?:object}} o chainIds and rolls have one entry per seat
 */
function start(room, o) {
  const cfg = o.cfg || L;
  const r = clone(room);
  const n = r.seats.length;
  r.n = n;
  r.R = roundsFor(n, cfg.maxRounds);
  r.timers = { promptSec: cfg.promptSec, drawSec: cfg.drawSec, describeSec: cfg.describeSec, graceSec: cfg.graceSec };
  r.slots = {};
  for (let k = 0; k <= r.R; k++) r.slots[String(k)] = Array.from({ length: n }, () => ({ state: SLOT.NONE, at: null, attempt: 0 }));
  r.chainIds = o.chainIds.slice();
  r.rolls = o.rolls.map((x) => rollLib.newRec(x.rollId, x.ids));
  r.usedPrompts = [].concat(...o.rolls.map((x) => x.ids));
  r.state = STATE.PLAYING;
  r.round = 0;
  r.kind = 'prompt';
  r.phase = 'turn';
  r.roundStartAt = o.now + L.startDelayMs;
  r.deadline = r.roundStartAt + r.timers.promptSec * 1000;
  r.startedAt = o.now;
  for (const s of r.seats) s.status = 'active';
  return bump(r, o.now);
}

// ---- turns ------------------------------------------------------------------------------------------------------

/**
 * Can a send for `round` from `seat` be taken now? (3A.5, edge 1-3)
 * @returns {{ok:true, slot:object} | {ok:false, code:string, slot?:object}}
 */
function sendGate(room, seat, round, now) {
  if (room.state === STATE.CLOSED || room.state === STATE.REMOVED) return { ok: false, code: 'ROOM_CLOSED' };
  if (room.state === STATE.LOBBY) return { ok: false, code: 'BAD_REQUEST' };
  if (room.state === STATE.REVEAL) return { ok: false, code: 'ROUND_OVER' };
  if (!Number.isInteger(round) || round < 0 || round > room.R) return { ok: false, code: 'BAD_REQUEST' };
  if (round < room.round) return { ok: false, code: 'ROUND_OVER' };
  if (round > room.round) return { ok: false, code: 'BAD_REQUEST' };
  const slot = room.slots[String(round)][seat];
  if (isResolved(slot)) return { ok: false, code: 'ALREADY_SENT', slot };
  if (now > acceptUntil(room)) return { ok: false, code: 'ROUND_OVER' };
  if (now < room.roundStartAt - 2000) return { ok: false, code: 'BAD_REQUEST' }; // before the round exists for the client (2 s of clock slack)
  if (slot.state === SLOT.RECEIVED && now - slot.at < L.inFlightMs) return { ok: false, code: 'ALREADY_SENT', slot }; // a check of this very turn is in flight
  return { ok: true, slot };
}

/** phase A: the slot is `received` (a fast transaction); a stale `received` is taken over (attempt + 1) */
function markReceived(room, seat, now) {
  const r = clone(room);
  const s = r.slots[String(r.round)][seat];
  s.state = SLOT.RECEIVED;
  s.at = now;
  s.attempt = (s.attempt || 0) + 1;
  return bump(r, now);
}

/**
 * Phase C guard: is the slot still the one phase A took? (attempt token)
 */
function stillReceived(room, round, seat, attempt) {
  if (room.state !== STATE.PLAYING || room.round !== round) return false;
  const s = room.slots[String(round)][seat];
  return s.state === SLOT.RECEIVED && s.attempt === attempt;
}

/** phase C: the turn passed its check. `extra` = {stepId} or, in round 0, {promptId | (custom, text)} */
function resolveSent(room, seat, extra, now, auto) {
  const r = clone(room);
  const s = r.slots[String(r.round)][seat];
  const keep = { attempt: s.attempt };
  r.slots[String(r.round)][seat] = Object.assign({ state: SLOT.SENT, at: now, auto: !!auto }, keep, extra);
  return bump(r, now);
}

/** phase C or an empty/forced send: a marker step fills the slot (5.8) */
function resolveMarker(room, seat, marker, now, auto) {
  const r = clone(room);
  const s = r.slots[String(r.round)][seat];
  r.slots[String(r.round)][seat] = { state: SLOT.MARKER, at: now, attempt: s.attempt || 0, marker, auto: !!auto };
  return bump(r, now);
}

/** a block / busy / rejection BEFORE time-up: the slot reopens for a resend (6.4); no version bump needed but the state moved */
function reopenSlot(room, seat, now) {
  const r = clone(room);
  const s = r.slots[String(r.round)][seat];
  s.state = SLOT.BLOCKED;
  s.at = now;
  return bump(r, now);
}

/**
 * Phase B/C failed for a reason that is not the player's (the resolving transaction lost every write conflict, the function threw): put the slot
 * of attempt `attempt` back to `none` (attempt kept, so the counter stays monotonic) so the very next send is accepted instead of answering
 * ALREADY_SENT for the in-flight window. Returns null when the slot is no longer that `received` attempt. (QA-R2-2b)
 */
function releaseReceived(room, round, seat, attempt, now) {
  if (!stillReceived(room, round, seat, attempt)) return null;
  const r = clone(room);
  const s = r.slots[String(round)][seat];
  s.state = SLOT.NONE;
  s.at = null;
  return bump(r, now);
}

/** the first rolled prompt of a seat: the round-0 default (4.2, 5.8) */
function firstPrompt(room, seat) {
  return room.rolls[seat].ids[0];
}

/** the marker for an unresolved turn of the CURRENT round (empty turn, or a check in flight too long) */
function fillSlotsOf(room, round, seat, now, why) {
  const s = room.slots[String(round)][seat];
  if (isResolved(s)) return null;
  if (round === 0) {
    // a chain needs a prompt: the selected (here: the first) rolled prompt, never a marker
    return { state: SLOT.SENT, at: now, attempt: s.attempt || 0, auto: true, promptId: room.rolls[seat].ids[0] };
  }
  const marker = s.state === SLOT.RECEIVED ? 'notDelivered' : copy.emptyMarkerFor(kindOfRound(round));
  return { state: SLOT.MARKER, at: now, attempt: s.attempt || 0, marker, auto: true };
}

/**
 * A seat leaves a game in progress (3A.6): the seat is `left` and its slots in the current and every later round are filled with
 * the empty marker AT ONCE (a `received` slot in flight is left to resolve). Returns {room, ended} where ended = nobody is active.
 */
function leavePlaying(room, openid, now) {
  const i = seatOf(room, openid);
  if (i < 0 || room.state !== STATE.PLAYING) return { room, changed: false };
  const r = clone(room);
  if (r.seats[i].status === 'left') return { room, changed: false };
  r.seats[i].status = 'left';
  for (let k = r.round; k <= r.R; k++) {
    const s = r.slots[String(k)][i];
    if (isResolved(s) || s.state === SLOT.RECEIVED) continue;
    r.slots[String(k)][i] = fillSlotsOf(r, k, i, now);
  }
  return { room: bump(r, now), changed: true, nobodyActive: activeSeats(r) === 0 };
}

// ---- advance ------------------------------------------------------------------------------------------------------

/**
 * Should the room move on? (3A.5)
 *   - 'all'      every seat has a resolved slot (left seats are filled at once): the round ends early
 *   - 'deadline' deadline + grace has passed and no slot has been `received` for less than 8 s (a check in flight)
 *   - 'cap'      gameMaxMin since the start: the sweeper finishes the game
 * @returns {{action:'none'} | {action:'advance', reason:'all'|'deadline'} | {action:'finish', reason:'cap'}}
 */
function decide(room, now, cfg) {
  if (room.state !== STATE.PLAYING) return { action: 'none' };
  const capMs = ((cfg && cfg.gameMaxMin) || L.gameMaxMin) * 60e3;
  if (now >= room.startedAt + capMs) return { action: 'finish', reason: 'cap' };
  const slots = room.slots[String(room.round)];
  if (slots.every(isResolved)) return { action: 'advance', reason: 'all' };
  if (now >= acceptUntil(room)) {
    const inFlight = slots.some((s) => s.state === SLOT.RECEIVED && now - s.at < L.inFlightMs);
    if (!inFlight) return { action: 'advance', reason: 'deadline' };
  }
  return { action: 'none' };
}

/**
 * End the current round (3A.5): every unresolved slot is filled (empty marker; a `received` one older than the in-flight guard
 * becomes 「（这一棒没传过来）」; in round 0 the first rolled prompt), then the next round is scheduled (start = now + 1 s) or, after
 * round R, the room goes to `reveal`.
 * @returns {{room, fills:{round:number, seat:number, state:string, marker?:string, promptId?:string}[], ended:boolean, from:number, sentBefore:number, markersBefore:number}}
 */
function advance(room, now, reason) {
  const r = clone(room);
  const rd = r.round;
  const fills = [];
  const slots = r.slots[String(rd)];
  let sent = 0;
  let markers = 0;
  for (let i = 0; i < r.n; i++) {
    const f = fillSlotsOf(r, rd, i, now, reason === 'deadline' ? 'stale' : undefined);
    if (f) {
      slots[i] = f;
      fills.push({ round: rd, seat: i, state: f.state, marker: f.marker, promptId: f.promptId });
    }
    if (slots[i].state === SLOT.MARKER) markers++;
    else sent++;
  }
  const stats = { sent, markers };
  if (rd >= r.R) {
    r.state = STATE.REVEAL;
    r.phase = null;
    r.endedAt = now;
    r.endedBy = 'normal';
    r.deadline = now;
    return { room: bump(r, now), fills, ended: true, from: rd, stats };
  }
  r.round = rd + 1;
  r.kind = kindOfRound(r.round);
  r.phase = 'turn';
  r.roundStartAt = now + L.startDelayMs;
  r.deadline = r.roundStartAt + secFor(r.kind, r.timers) * 1000;
  return { room: bump(r, now), fills, ended: false, from: rd, stats };
}

/**
 * Finish the whole game at once (20-minute cap, kill switch or fallback switch, everyone left, admin): every unresolved slot of the
 * current and every later round is filled and the room goes to `reveal` (3A.2, 3A.6).
 */
function finish(room, now, reason) {
  const r = clone(room);
  const fills = [];
  for (let k = r.round; k <= r.R; k++) {
    for (let i = 0; i < r.n; i++) {
      const s = r.slots[String(k)][i];
      if (isResolved(s)) continue;
      const f = fillSlotsOf(r, k, i, now, 'stale');
      r.slots[String(k)][i] = f;
      fills.push({ round: k, seat: i, state: f.state, marker: f.marker, promptId: f.promptId });
    }
  }
  r.state = STATE.REVEAL;
  r.round = r.R;
  r.phase = null;
  r.endedAt = now;
  r.endedBy = reason;
  r.deadline = now;
  return { room: bump(r, now), fills, ended: true };
}

/** admin removeRoom / roomSweeper close: a room that is not over becomes removed */
function remove(room, now) {
  const r = clone(room);
  r.state = STATE.REMOVED;
  r.endedAt = r.endedAt || now;
  r.phase = null;
  return bump(r, now);
}

/** 再来一局: the old room remembers the new one (first caller wins, 3A / AC 151) */
function setRematch(room, newRoomId, now) {
  const r = clone(room);
  r.rematchRoomId = newRoomId;
  return bump(r, now);
}

// ---- the round-0 roll -------------------------------------------------------------------------------------------

/** the seat's current roll, or null */
function rollOf(room, seat) {
  return (room.rolls && room.rolls[seat]) || null;
}

/** a forced send (auto) may name any id the seat was shown in this pick, also a set a reroll just replaced (spec 17 edge 26) */
function shownPickValid(room, seat, promptId) {
  const roll = rollOf(room, seat);
  return !!roll && typeof promptId === 'string' && rollLib.shownOf(roll).includes(promptId);
}

/** is `promptId` part of the seat's CURRENT roll `rollId`? (AC 119) */
function rollPickValid(room, seat, rollId, promptId) {
  const roll = rollOf(room, seat);
  return !!roll && typeof rollId === 'string' && roll.rollId === rollId && typeof promptId === 'string' && roll.ids.includes(promptId);
}

/** 换一批 in a room: round 0 only, up to 5 per pick, only until the round-0 deadline (no grace), 4.1, TD-151 */
function rerollBlock(room, seat, now) {
  if (room.state !== STATE.PLAYING || room.round !== 0) return 'BAD_REQUEST';
  const roll = rollOf(room, seat);
  if (!roll) return 'BAD_REQUEST';
  if (isResolved(room.slots['0'][seat])) return 'ALREADY_SENT';
  if (now > room.deadline) return 'ROUND_OVER';
  if (rollLib.rerollLeft(roll) <= 0) return 'REROLL_LIMIT';
  return null;
}

function applyReroll(room, seat, rollId, ids, now) {
  const r = clone(room);
  const old = r.rolls[seat];
  r.rolls[seat] = rollLib.nextRec(old, rollId, ids);
  r.usedPrompts = r.usedPrompts.concat(ids);
  return bump(r, now);
}

// ---- views --------------------------------------------------------------------------------------------------------

/** chain c's origin prompt from the round-0 slot: {promptId, custom, text|null}; null while unresolved */
function slotPrompt(room, c) {
  const s = slotAt(room, 0, c);
  if (!s || s.state !== SLOT.SENT) return null;
  return { promptId: s.promptId || null, custom: !!s.custom, text: s.custom ? s.text : null };
}

/**
 * The source handed to a seat in round r >= 1 (never other chains' content): from the previous output of seat (s - 1).
 * @param {object} room
 * @param {number} seat
 * @param {{promptText:string|null, promptCustom:boolean, promptHidden:boolean, prevStep:object|null, viewEnabled:boolean}} o
 *   promptText = the chain's prompt (round 1); prevStep = the stored step document of the previous output (rounds >= 2) or null
 * @returns {{kind:'prompt'|'text'|'draw'|'marker'|'hidden'|'paused', ...}}
 */
function sourceFor(room, seat, o) {
  const r = room.round;
  const nextKind = kindOfRound(r);
  if (o.viewEnabled === false) return { kind: 'paused', hint: copy.PAUSED_HINT, canReport: false };
  if (r === 1) {
    if (o.promptHidden) return { kind: 'hidden', hint: copy.hiddenHint(nextKind), canReport: false };
    return { kind: 'prompt', text: o.promptText, custom: !!o.promptCustom, canReport: !!o.promptCustom };
  }
  const prev = slotAt(room, r - 1, sourceSeat(seat, room.n));
  if (prev && prev.state === SLOT.MARKER) return { kind: 'marker', marker: prev.marker, text: copy.markerText(prev.marker), hint: copy.markerHint(prev.marker, nextKind), canReport: false };
  const st = o.prevStep;
  if (!st || st.state !== 'passed') return { kind: 'hidden', hint: copy.hiddenHint(nextKind), canReport: false };
  if (st.marker) return { kind: 'marker', marker: st.marker, text: copy.markerText(st.marker), hint: copy.markerHint(st.marker, nextKind), canReport: false };
  if (st.kind === 'draw') return { kind: 'draw', strokes: st.strokes, canReport: true };
  return { kind: 'text', text: st.text, canReport: true };
}

/**
 * The opaque report reference of the source `seat` is looking at in the current round (spec 7.1, TD-140). It is a pure function of
 * (room, chain, round, seat), so it needs no storage and the mock and the server agree. It names no chain, step or author: two 32-bit
 * FNV/murmur hashes over the room id, the (never client-visible) chain id, the round and the seat. `report` recomputes it for the CALLER'S
 * OWN seat, so another member's ref, a stale ref (a later round) and a guessed ref all fail; it is never used to look anything up.
 */
function reportRefFor(room, seat) {
  const c = chainOfSeat(seat, room.round, room.n);
  const base = [room._id, room.chainIds[c], room.round, seat].join(':');
  return 'q' + hash32(base + ':a').toString(36) + hash32(base + ':b').toString(36);
}

/** the seats list the lobby and the game screens show: numbers only (PO-8), `me`, `quiet` (60 s of silence in the lobby), `left` */
function seatsView(room, openid, now) {
  const slots = room.state === STATE.LOBBY ? Math.max(L.maxPlayers, room.seats.length) : room.seats.length;
  const out = [];
  for (let i = 0; i < slots; i++) {
    const s = room.seats[i];
    out.push({
      n: i + 1,
      filled: !!s,
      me: !!s && s.openid === openid,
      quiet: !!s && room.state === STATE.LOBBY && now - s.lastSeenAt > L.quietMs && s.openid !== openid,
      left: !!s && s.status === 'left',
    });
  }
  return out;
}

/** a lobby's join view for the card/entry: counts only */
function joinedCount(room) {
  return room.seats.length;
}

/**
 * getRoom for a MEMBER (spec 13.2). `o`: {now, source (a sourceFor result, round >= 1 only), promptsView ([{id,text}] of the seat's roll),
 * mine (own resolved content for the current round), rerollLeft}.
 */
function memberView(room, seat, openid, o) {
  const now = o.now;
  const out = {
    ok: true,
    roomId: room._id,
    member: true,
    state: room.state,
    round: room.round,
    rounds: room.R,
    kind: room.kind,
    phase: phaseAt(room, now),
    roundStartAt: room.roundStartAt,
    deadline: room.deadline,
    roundSec: room.state === STATE.PLAYING ? secFor(room.kind, room.timers) : null,
    graceSec: room.timers ? room.timers.graceSec : L.graceSec,
    serverNow: now,
    version: room.version,
    n: room.state === STATE.LOBBY ? room.seats.length : room.n,
    joined: room.seats.length,
    minPlayers: L.minPlayers,
    maxPlayers: L.maxPlayers,
    me: {
      seat,
      isHost: room.host === openid,
      status: room.seats[seat].status,
      slot: room.state === STATE.PLAYING ? room.slots[String(room.round)][seat].state : null,
    },
    seats: seatsView(room, openid, now),
    sentCount: sentCount(room),
    activeCount: activeSeats(room),
  };
  if (room.state === STATE.PLAYING) {
    const slot = room.slots[String(room.round)][seat];
    if (isResolved(slot)) {
      if (o.mine) out.mine = o.mine;
    } else if (now >= room.roundStartAt) {
      const a = { chainNo: chainOfSeat(seat, room.round, room.n) + 1 };
      if (room.round === 0) {
        const roll = rollOf(room, seat);
        a.roll = { rollId: roll.rollId, prompts: o.promptsView || [], rerollLeft: rollLib.rerollLeft(roll) };
      } else {
        a.source = o.source && o.source.canReport ? Object.assign({}, o.source, { reportRef: reportRefFor(room, seat) }) : o.source;
      }
      out.assignment = a;
    }
  }
  if (room.state === STATE.REVEAL || room.state === STATE.CLOSED) {
    out.endedBy = room.endedBy;
    if (room.rematchRoomId) out.rematchRoomId = room.rematchRoomId;
  }
  return out;
}

/**
 * getRoom for a NON-member: entry fields only, no content (3A.7, 8.16).
 * `ctx`: {memberOfRoomGroup:boolean, groupOpenGId:string|null, rulesOk, restrictedUntil, ugcOk, inOtherRoomId:string|null, capReached:boolean}
 * @returns the entry `entryState` (see spec 12 Room entry) and counts
 */
function entryView(room, ctx) {
  const out = {
    ok: true,
    roomId: room._id,
    member: false,
    state: room.state,
    joined: room.seats.length,
    minPlayers: L.minPlayers,
    maxPlayers: L.maxPlayers,
    entryState: 'joinable',
    serverNow: ctx.now,
  };
  if (room.state === STATE.REMOVED) out.entryState = 'removed';
  else if (room.state === STATE.CLOSED) out.entryState = 'closed';
  else if (room.state === STATE.REVEAL) out.entryState = 'teaser';
  else {
    // a non-member learns nothing about a bound room beyond "wrong group" unless they hold a fresh membership
    const bound = !!room.openGId;
    const groupOk = bound ? !!ctx.memberOfRoomGroup : !!ctx.groupOpenGId;
    if (!groupOk) out.entryState = 'wrongGroup';
    else if (room.state === STATE.PLAYING) out.entryState = 'started';
    else if (room.seats.length >= L.maxPlayers) out.entryState = 'full';
    else if (ctx.inOtherRoomId) {
      out.entryState = 'inOtherRoom';
      out.otherRoomId = ctx.inOtherRoomId;
    } else if (!ctx.rulesOk) out.entryState = 'rulesRequired';
    else if (ctx.restrictedUntil && ctx.restrictedUntil > ctx.now) {
      out.entryState = 'restricted';
      out.restrictedUntil = ctx.restrictedUntil;
    } else if (!ctx.ugcOk) out.entryState = 'ugcPaused';
    else if (ctx.capReached) out.entryState = 'capReached';
  }
  if (out.entryState === 'wrongGroup') {
    out.joined = null; // nothing about the room leaks
    out.state = null;
  }
  return out;
}

/**
 * The reveal cards (getRoomReveal, 3A.8, 8.8): ONLY the final step of every chain.
 * @param {object} room a room in `reveal`
 * @param {string} openid a member
 * @param {Object<number,{stepDoc:object|null, hidden:boolean}>} finals by chain index c: the stored final step (round R) and the chain's hidden flag
 * @param {boolean} viewEnabled
 */
function revealCards(room, openid, finals, viewEnabled) {
  const seat = seatOf(room, openid);
  const cards = [];
  for (let c = 0; c < room.n; c++) {
    const f = finals[c] || {};
    const slot = slotAt(room, room.R, workerOfChain(c, room.R, room.n));
    const card = { chainNo: c + 1, chainId: room.chainIds[c], mineStarted: c === seat, finalKind: kindOfRound(room.R) };
    if (!viewEnabled) card.placeholder = 'paused';
    else if (f.hidden) card.placeholder = 'reported';
    else if (slot && slot.state === SLOT.MARKER) {
      card.finalKind = 'marker';
      card.finalMarker = slot.marker;
      card.finalText = copy.markerText(slot.marker);
    } else if (f.stepDoc && f.stepDoc.state === 'hidden') card.placeholder = 'reported';
    else if (f.stepDoc && f.stepDoc.state === 'deleted') card.placeholder = 'deleted';
    else if (f.stepDoc && f.stepDoc.state === 'passed') {
      if (f.stepDoc.kind === 'describe') card.finalText = f.stepDoc.text;
    } else card.placeholder = 'reported';
    cards.push(card);
  }
  return cards;
}

/**
 * The room teaser for non-members (3A.8, 8.10): chain count and, per chain, 「起点」→「终点」 when both are passed text, else the end is
 * null ("（一幅画）"). Passed texts only, never a drawing.
 */
function teaserLines(room, finals, prompts, viewEnabled) {
  const lines = [];
  for (let c = 0; c < room.n; c++) {
    const f = finals[c] || {};
    const p = prompts[c];
    const line = { from: viewEnabled && p && !f.hidden ? p : null, to: null };
    const sd = f.stepDoc;
    if (viewEnabled && !f.hidden && sd && sd.state === 'passed' && sd.kind === 'describe' && !sd.marker) line.to = sd.text;
    lines.push(line);
  }
  return lines;
}

/** 我的接龙 row for a room (8.12): newest-first sorting uses lastActivityAt */
function albumItem(room, openid, unseen) {
  const seat = seatOf(room, openid);
  let status = 'revealed';
  if (room.state === STATE.LOBBY) status = 'lobby';
  else if (room.state === STATE.PLAYING) status = 'playing';
  else if (room.state === STATE.REMOVED) status = 'removed';
  else if (room.state === STATE.CLOSED) status = 'closed';
  return {
    kind: 'room',
    roomId: room._id,
    status,
    n: room.n || room.seats.length,
    rounds: room.R,
    round: room.round,
    lastActivityAt: room.lastActivityAt,
    revealedAt: room.endedAt,
    unseen: !!unseen,
    left: seat >= 0 && room.seats[seat].status === 'left',
  };
}

/** one 本群接龙 row for an open or recent room */
function groupRoomRow(room, ctx) {
  if (room.state === STATE.LOBBY) return { section: 'rooms', roomId: room._id, state: 'lobby', joined: room.seats.length, joinable: room.seats.length < L.maxPlayers, lastActivityAt: room.lastActivityAt, member: !!ctx.member };
  if (room.state === STATE.PLAYING) return { section: 'rooms', roomId: room._id, state: 'playing', round: room.round, rounds: room.R, joinable: false, lastActivityAt: room.lastActivityAt, member: !!ctx.member };
  if (room.state === STATE.REVEAL) return { section: 'revealed', roomId: room._id, n: room.n, member: !!ctx.member, revealedAt: room.endedAt, lastActivityAt: room.lastActivityAt };
  return null;
}

/** what the materialiser must write once a room is over (idempotent): marker step documents and the chains' final shape */
function materializePlan(room) {
  const markers = [];
  const chains = [];
  for (let c = 0; c < room.n; c++) {
    const stepIds = new Array(room.R + 1).fill(null);
    const authors = new Array(room.R + 1).fill(null);
    for (let r = 1; r <= room.R; r++) {
      const w = workerOfChain(c, r, room.n);
      const s = slotAt(room, r, w);
      authors[r] = room.seats[w].openid;
      if (s && s.state === SLOT.SENT) stepIds[r] = s.stepId;
      else if (s && s.state === SLOT.MARKER) {
        const id = markerStepId(room.chainIds[c], r);
        stepIds[r] = id;
        markers.push({ stepId: id, chainId: room.chainIds[c], n: r, kind: kindOfRound(r), author: room.seats[w].openid, marker: s.marker, auto: true });
      }
    }
    chains.push({ chainId: room.chainIds[c], c, stepIds, authors });
  }
  return { markers, chains };
}

/** a marker step's document id (never collides with `<chainId>_<n>_<attempt>`) */
function markerStepId(chainId, n) {
  return chainId + '_' + n + '_m';
}

module.exports = {
  releaseReceived,
  STATE, SLOT,
  roundsFor, kindOfRound, secFor, chainOfSeat, workerOfChain, sourceSeat, rotationTable,
  seatOf, isMember, activeSeats, isResolved, slotAt, sentCount, roundMs, acceptUntil, phaseAt,
  newRoom, joinBlock, join, leaveLobby, closeLobby, touchSeat, startBlock, start,
  sendGate, markReceived, stillReceived, resolveSent, resolveMarker, reopenSlot, firstPrompt, leavePlaying,
  decide, advance, finish, remove, setRematch,
  rollOf, rollPickValid, shownPickValid, rerollBlock, applyReroll,
  slotPrompt, sourceFor, reportRefFor, seatsView, joinedCount, memberView, entryView, revealCards, teaserLines, albumItem, groupRoomRow,
  materializePlan, markerStepId,
};
