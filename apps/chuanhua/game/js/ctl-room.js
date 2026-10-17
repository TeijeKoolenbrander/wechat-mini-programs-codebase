/**
 * Live rooms (spec 3A, 8.16, 8.17): room entry (a non-member), the lobby, the round router and the round-wait screen.
 *
 * ONE ROUTER. Every getRoom answer of a member (from `js/realtime.js`: the signal watch, the 2 s poll after a failed watch, the 10 s
 * safety poll, the roomTick plan, or a submit) goes through `onRoom(resp)`, which decides the screen from the SERVER's state:
 *   lobby    -> lobby                      playing + assignment (round 0) -> pick     playing + assignment (round r) -> draw / describe
 *   playing, my slot resolved or nothing yet -> round wait                 reveal -> overview     closed / removed -> the lobby's closed panel
 * Correctness never depends on `watch`: the router only reads responses, and `roomTick` at deadline + grace + 1 s advances the room even with
 * no signal at all (AC 147). Timers use the server offset (AC 149). A turn whose round the server already left is dropped with
 * "时间到了，这一棒已自动交出" (AC 150).
 */

const { createRealtime } = require('./realtime');
const V = require('./vm');

const POKE_MS = 1500;

module.exports = function install(X) {
  const { c, api, store, S } = X;
  const room = {};
  let rt = null;

  c.room = null; // { roomId, resp (last member view), online, from, activityId, lastPoke }
  c.lobby = null; // { roomId, state: 'ready'|'closed'|'removed', starting }
  c.roomEntry = null; // { roomId, state, resp, joining, otherRoomId, scrollY }
  c.wait = null; // { round, mine } what the player sent in the last round they finished

  const serverNow = () => X.serverNow();

  // ------------------------------------------------------------------------------------------------------------ realtime

  function stopRt() {
    if (rt) {
      rt.stop();
      rt = null;
    }
  }

  function startRt(roomId) {
    stopRt();
    const env = X.deps.realtimeEnv ? X.deps.realtimeEnv() : {};
    const timers = X.deps.timers || { setTimeout, clearTimeout };
    rt = createRealtime({
      call: (name, data) => api[name](data),
      watch: env.watch,
      openid: env.openid,
      now: X.now,
      timers,
      config: c.features.rt,
      graceSec: c.features.room.graceSec,
      onRoom: (resp) => onRoom(resp),
      onMode: (m) => {
        if (m.mode === 'idle') return;
        const props = { mode: m.mode };
        if (m.reason) props.reason = m.reason;
        if (typeof m.latencyMs === 'number') props.latencyMs = Math.round(m.latencyMs);
        X.track('rt_mode', props);
      },
      onStatus: (s) => {
        if (c.room) c.room.online = s.online;
        X.invalidate();
      },
      onGone: (code) => gone(code),
    });
    rt.start(roomId);
  }
  room.rt = () => rt;
  room.refresh = () => (rt ? rt.refresh() : Promise.resolve(null));
  room.stop = function stop() {
    stopRt();
    c.room = null;
  };

  /** the room is gone for this player (not found, not a member, closed): the lobby says so, any other screen goes home */
  function gone(code) {
    stopRt();
    const r = c.room;
    if (c.screen === 'lobby' && c.lobby) {
      c.lobby.state = code === 'ROOM_CLOSED' ? 'closed' : 'removed';
      X.invalidate();
      return;
    }
    if (r && !['home'].includes(c.screen)) X.toast(X.codeText(code));
    c.room = null;
    X.turn.clear();
    c.pick = null;
    X.goHome();
  }
  room.gone = () => {
    stopRt();
    c.room = null;
    X.turn.clear();
    c.pick = null;
    return X.goHome();
  };

  // --------------------------------------------------------------------------------------------------------- the router

  function onRoom(resp) {
    const r = c.room;
    if (!r || resp.roomId !== r.roomId) return;
    X.noteServerTime(resp);
    if (resp.member === false) return gone('NOT_IN_ROOM');
    r.resp = resp;
    r.online = true;
    switch (resp.state) {
      case 'lobby':
        return showLobby(resp);
      case 'playing':
        return showPlaying(resp);
      case 'reveal':
        return showReveal(resp);
      default:
        // closed / removed
        stopRt();
        c.turn && X.turn.clear();
        c.pick = null;
        if (!c.lobby || c.lobby.roomId !== resp.roomId) c.lobby = { roomId: resp.roomId, state: resp.state === 'removed' ? 'removed' : 'closed', starting: false };
        c.lobby.state = resp.state === 'removed' ? 'removed' : 'closed';
        return X.go('lobby');
    }
  }

  function showLobby(resp) {
    if (!c.lobby || c.lobby.roomId !== resp.roomId) c.lobby = { roomId: resp.roomId, state: 'ready', starting: false };
    c.lobby.state = 'ready';
    if (c.screen !== 'lobby') X.go('lobby', c.from.lobby || 'home');
    X.invalidate();
  }

  function showPlaying(resp) {
    const t = c.turn;
    if (resp.assignment) {
      c.lobby = null;
      if (resp.round === 0) {
        if (!c.pick || c.pick.mode !== 'live' || c.pick.roomId !== resp.roomId) {
          if (t) X.turn.clear();
          X.pick.openLive(resp);
        } else {
          X.pick.syncLive(resp);
          if (c.screen !== 'pick') X.go('pick'); // 回到这一局 from another screen
        }
        return;
      }
      if (t && t.mode === 'live' && t.roomId === resp.roomId && t.round === resp.round) {
        X.turn.updateSource(resp.assignment.source);
        t.deadline = resp.deadline;
        if (c.screen !== t.kind) X.go(t.kind);
        return;
      }
      if (t) X.turn.clear();
      if (c.pick) c.pick = null;
      return X.turn.begin({
        mode: 'live', kind: resp.kind === 'draw' ? 'draw' : 'describe', roomId: resp.roomId, round: resp.round, rounds: resp.rounds, chainNo: resp.assignment.chainNo,
        source: resp.assignment.source, deadline: resp.deadline, graceSec: resp.graceSec,
      });
    }
    const slot = resp.me && resp.me.slot;
    const resolved = slot === 'sent' || slot === 'marker';
    // a turn of a round the server has left: the draft is discarded (AC 150)
    if (t && t.mode === 'live' && (t.round < resp.round || resolved)) {
      const stale = t.round < resp.round && !resolved;
      X.turn.clear();
      if (stale) X.toast('时间到了，这一棒已自动交出');
    } else if (t && t.mode === 'live' && t.round === resp.round && slot === 'received') return; // our send is being checked
    if (c.pick && (resp.round > 0 || resolved)) {
      c.pick = null;
      if (!resolved) X.toast('时间到了，这一棒已自动交出');
    }
    if (resp.round === 0 && !resolved) {
      // the room started: the round-0 picker arrives with the next getRoom (roundStartAt, a 1 s head start): the lobby says 马上开始…
      if (!c.lobby) c.lobby = { roomId: resp.roomId, state: 'ready', starting: true };
      c.lobby.starting = true;
      if (c.screen !== 'lobby') X.go('lobby', c.from.lobby || 'home');
      X.invalidate();
      return;
    }
    showRoundWait(resp);
  }

  function showRoundWait(resp) {
    const slot = resp.me && resp.me.slot;
    const resolved = slot === 'sent' || slot === 'marker';
    if (resolved) c.wait = { round: resp.round, mine: resp.mine ? V.mineVmOf(resp.mine) : c.wait && c.wait.round === resp.round ? c.wait.mine : {} };
    else if (!c.wait || c.wait.round >= resp.round) c.wait = c.wait && c.wait.round === resp.round ? c.wait : { round: Math.max(0, resp.round - 1), mine: {} };
    c.lobby = null;
    if (c.screen !== 'roundWait') X.go('roundWait');
    X.invalidate();
  }

  function showReveal(resp) {
    const t = c.turn;
    if (t && t.mode === 'live') {
      X.turn.clear();
      X.toast('时间到了，这一棒已自动交出');
    }
    c.pick = null;
    c.lobby = null;
    c.wait = null;
    if (c.screen === 'overview' || c.screen === 'stepthrough') return X.reveal.onRoomUpdate(resp);
    return X.reveal.openOverview(resp.roomId, { from: (c.room && c.room.from) || 'home' });
  }

  /** after a send (or a send that the server had already taken): the round-wait screen, then the router takes over */
  room.afterSend = function afterSend(o) {
    c.wait = { round: o.round, mine: o.mine || {} };
    c.pick = null;
    c.lobby = null;
    if (c.screen !== 'roundWait') X.go('roundWait');
    X.invalidate();
    if (rt) rt.refresh();
  };

  // ----------------------------------------------------------------------------------------------------- entering a room

  /** a member view of a room (createRoom, joinRoom, startRoom, getRoom, rematch): take the seat in the client */
  room.enter = function enter(resp, o) {
    o = o || {};
    if (c.room && c.room.roomId !== resp.roomId) {
      X.turn.clear();
      c.pick = null;
      c.wait = null;
    }
    c.room = { roomId: resp.roomId, resp, online: true, from: o.from || 'home', activityId: null, lastPoke: 0 };
    c.roomEntry = null;
    c.lobby = null;
    X.noteServerTime(resp);
    if (o.from) c.from.lobby = o.from;
    onRoom(resp);
    startRt(resp.roomId);
    if (resp.state === 'lobby' && X.features().updatableCard) prefetchActivity(resp.roomId);
  };

  /** open a room by id: a member goes straight to the lobby / the round / the overview, anyone else sees the room entry (8.16) */
  room.open = async function open(roomId, o) {
    o = o || {};
    const openEntry = () => {
      c.roomEntry = { roomId, state: 'loading', resp: null, joining: false, otherRoomId: null };
      X.go('roomEntry', o.from || 'home');
    };
    if (!o.quiet) openEntry();
    const r = await api.getRoom(Object.assign({ roomId }, X.groupData()));
    if (!o.quiet && c.screen !== 'roomEntry') return undefined; // the player went elsewhere while it loaded
    if (r && r.ok && r.member) {
      room.enter(r, { from: o.from });
      return r;
    }
    if (o.quiet) openEntry();
    return applyEntry(r, roomId, o);
  };

  function applyEntry(r, roomId, o) {
    const e = c.roomEntry;
    if (!e) return r;
    if (r && r.ok) {
      e.resp = r;
      e.state = r.entryState;
      e.otherRoomId = r.otherRoomId || null;
      e.restrictedUntil = r.restrictedUntil;
      if (o && o.fromCard) X.track('card_open', { cardKind: 'room', hasShareTicket: X.group().status === 'ok', targetState: r.entryState });
      if (r.entryState === 'teaser') {
        // a finished room, not a member: the room teaser (3A.8)
        return X.reveal.openRoomTeaser(roomId, { from: c.from.roomEntry || 'home' });
      }
    } else {
      const code = r ? r.code : 'NETWORK';
      e.resp = null;
      e.state = code === 'ROOM_NOT_FOUND' ? 'notFound' : X.isNet(r) ? 'offline' : 'error';
      if (e.state === 'error') X.track('error', { where: 'getRoom', code });
    }
    X.invalidate();
    return r;
  }

  async function prefetchActivity(roomId) {
    const r0 = c.room;
    if (!r0 || r0.activityId || r0.activityPending) return;
    r0.activityPending = true;
    const r = await api.getRoom({ roomId, wantActivity: true });
    r0.activityPending = false;
    if (r && r.ok && r.activityId) r0.activityId = r.activityId;
  }

  // ---------------------------------------------------------------------------------------------------------- 开一局

  room.create = async function create(from) {
    if (X.home().state !== 'ready') return X.toast(X.codeText('NETWORK'));
    if (c.me.activeRoom) return room.open(c.me.activeRoom.roomId, { from, quiet: true });
    const r = await api.createRoom(X.groupData());
    if (r && r.ok) {
      room.enter(r, { from: from || 'home' }); // room_create is a server event; room_join is the 加入这一局 tap
      return r;
    }
    return createError(r, 'createRoom');
  };

  function createError(r, where) {
    const code = r ? r.code : 'NETWORK';
    if (code === 'RULES_REQUIRED') {
      c.me.rulesVersion = 0;
      return X.openRules(where === 'rematch' ? 'createRoom' : 'createRoom');
    }
    if (code === 'IN_OTHER_ROOM' && r.otherRoomId) {
      X.toast(X.codeText(code));
      return room.open(r.otherRoomId, { from: 'home', quiet: false });
    }
    X.toast(X.codeText(X.isNet(r) ? (r && r.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'NETWORK') : code));
    X.track('error', { where, code });
    return r;
  }

  /** 回到这一局 (home) / the card on home */
  room.resume = function resume(roomId, from) {
    return room.open(roomId, { from: from || 'home', quiet: true });
  };

  // ------------------------------------------------------------------------------------------------------------ room entry

  room.joinAction = async function joinAction() {
    const e = c.roomEntry;
    if (!e || e.joining) return;
    if (X.home().state === 'ready' && !X.rulesAgreed()) return X.openRules('joinRoom');
    e.joining = true;
    X.invalidate();
    const r = await api.joinRoom(Object.assign({ roomId: e.roomId }, X.groupData()));
    e.joining = false;
    if (c.roomEntry !== e) return;
    if (r && r.ok) {
      X.track('room_join', { result: 'ok', seat: r.me ? r.me.seat : undefined });
      room.enter(r, { from: c.from.roomEntry || 'home' });
      return;
    }
    const code = r ? r.code : 'NETWORK';
    const MAP = { ROOM_STARTED: 'started', ROOM_FULL: 'full', ROOM_CLOSED: 'closed', WRONG_GROUP: 'wrongGroup', NEED_GROUP: 'wrongGroup', IN_OTHER_ROOM: 'inOtherRoom', RESTRICTED: 'restricted', UGC_PAUSED: 'ugcPaused', JOIN_LIMIT: 'capReached', STEP_LIMIT: 'capReached', ROOM_NOT_FOUND: 'notFound' };
    const RES = { ROOM_STARTED: 'started', ROOM_FULL: 'full', ROOM_CLOSED: 'closed', WRONG_GROUP: 'wrongGroup', NEED_GROUP: 'needGroup', IN_OTHER_ROOM: 'inOther', JOIN_LIMIT: 'limit', STEP_LIMIT: 'limit' };
    X.track('room_join', { result: RES[code] || 'error' });
    if (code === 'RULES_REQUIRED') {
      c.me.rulesVersion = 0;
      return X.openRules('joinRoom');
    }
    if (MAP[code]) {
      e.state = MAP[code];
      if (code === 'IN_OTHER_ROOM') e.otherRoomId = r.otherRoomId || null;
      if (code === 'RESTRICTED') e.restrictedUntil = r.until || 0;
      return X.invalidate();
    }
    if (code === 'IN_CLAIM') return X.toast(X.codeText(code));
    if (X.isNet(r)) return X.toast(X.codeText(r && r.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'NETWORK'));
    X.track('error', { where: 'joinRoom', code });
    return X.toast(X.codeText(code));
  };

  room.entryHit = function entryHit(id) {
    const e = c.roomEntry;
    if (!e) return undefined;
    switch (id) {
      case 'roomEntry:home':
        return X.goHome();
      case 'roomEntry:join':
        return room.joinAction();
      case 'roomEntry:newRoom':
        return X.startRoomFlow();
      case 'roomEntry:group':
        return X.openGroup('roomEntry');
      case 'roomEntry:backToRoom':
        return e.otherRoomId ? room.open(e.otherRoomId, { from: 'home' }) : undefined;
      case 'roomEntry:leaveOther':
        if (!e.otherRoomId) return undefined;
        return api.leaveRoom({ roomId: e.otherRoomId }).then((r) => {
          if (c.roomEntry !== e) return undefined;
          if (r && r.ok) {
            c.me.activeRoom = null;
            return room.open(e.roomId, { from: c.from.roomEntry || 'home' });
          }
          return X.toast(X.codeText(r ? r.code : 'NETWORK'));
        });
      case 'roomEntry:retry':
        return room.open(e.roomId, { from: c.from.roomEntry || 'home' });
      default:
        return undefined;
    }
  };

  room.entryVm = function entryVm(t) {
    const e = c.roomEntry;
    return V.roomEntryVm({ state: e.state, roomId: e.roomId, joined: e.resp && typeof e.resp.joined === 'number' ? e.resp.joined : null, otherRoomId: e.otherRoomId, joining: e.joining, restrictedUntil: e.restrictedUntil }, X.cm(t));
  };

  // -------------------------------------------------------------------------------------------------------------- the lobby

  room.lobbyVm = function lobbyVm(t) {
    const l = c.lobby;
    const r = c.room;
    return V.lobbyVm({ state: l.state, roomId: l.roomId, resp: r && r.resp, starting: l.starting, offline: !!r && !r.online }, X.cm(t));
  };

  room.lobbyHit = function lobbyHit(id) {
    const l = c.lobby;
    if (!l) return undefined;
    switch (id) {
      case 'lobby:back':
        if (l.state !== 'ready') return X.goHome();
        return X.dialog({ text: '离开这一局？', confirmLabel: '离开', cancelLabel: '继续玩', danger: true, onConfirm: () => room.leave() });
      case 'lobby:home':
        return X.goHome();
      case 'lobby:invite': {
        const r = c.room;
        if (!r || l.state !== 'ready') return undefined;
        return X.share.shareRoomInvite({ roomId: r.roomId, joined: r.resp ? r.resp.joined : 1, activityId: X.features().updatableCard ? r.activityId : null });
      }
      case 'lobby:start':
        return start();
      case 'lobby:slow': {
        const r = c.room;
        if (!r) return undefined;
        room.leave({ silent: true });
        return X.chain.startFlow('slow');
      }
      default:
        return undefined;
    }
  };

  async function start() {
    const l = c.lobby;
    const r = c.room;
    if (!l || !r || l.starting || !r.resp || !r.resp.me.isHost) return undefined;
    if (r.resp.joined < 3) return undefined;
    l.starting = true;
    X.invalidate();
    const res = await api.startRoom({ roomId: r.roomId });
    if (c.lobby !== l) return undefined;
    if (res && res.ok) {
      X.noteServerTime(res);
      r.resp = res;
      onRoom(res);
      return res;
    }
    l.starting = false;
    const code = res ? res.code : 'NETWORK';
    if (code === 'ROOM_STARTED') return rt && rt.refresh();
    if (code === 'RULES_REQUIRED') {
      c.me.rulesVersion = 0;
      return X.openRules('createRoom');
    }
    X.toast(X.codeText(X.isNet(res) ? 'NETWORK' : code));
    X.track('error', { where: 'startRoom', code });
    return X.invalidate();
  }

  /** 离开这一局 (lobby, round wait, draw / describe): the seat is given up, the player goes home */
  room.leave = function leave(o) {
    const r = c.room;
    if (!r) return X.goHome();
    const id = r.roomId;
    const phase = r.resp && r.resp.state === 'lobby' ? 'lobby' : 'playing';
    X.track('room_leave', phase === 'playing' ? { phase, round: r.resp ? Math.min(6, r.resp.round || 0) : 0 } : { phase });
    const left = api.leaveRoom({ roomId: id });
    stopRt();
    c.room = null;
    c.lobby = null;
    c.wait = null;
    c.pick = null;
    X.turn.clear();
    if (c.me.activeRoom && c.me.activeRoom.roomId === id) c.me.activeRoom = null;
    if (o && o.silent) return left;
    // home shows 回到这一局 from getHome: ask again once the seat is really given up (the two calls may cross in the cloud)
    left.then(() => (c.screen === 'home' ? X.refreshHome({ quiet: true }) : undefined));
    return X.goHome();
  };

  // ------------------------------------------------------------------------------------------------------------ round wait

  room.waitVm = function waitVm(t) {
    const r = c.room;
    const resp = r && r.resp;
    const w = c.wait || { round: 0, mine: {} };
    const rounds = resp ? resp.rounds : 0;
    const sameRound = !!resp && resp.state === 'playing' && resp.round === w.round;
    const advanced = !!resp && (resp.round > w.round || resp.state === 'reveal');
    const sec = sameRound && typeof resp.deadline === 'number' ? Math.max(0, Math.ceil((resp.deadline - (t + c.offset)) / 1000)) : 0;
    return V.roundWaitVm(
      {
        roomId: r ? r.roomId : '', round: w.round, rounds, secLeft: sec, warnSec: X.warnSec(), mine: w.mine,
        sent: advanced ? (resp ? resp.activeCount : 0) : resp ? resp.sentCount : 0, active: resp ? resp.activeCount : 0,
        passing: !!resp && (advanced || resp.phase === 'passing' || (typeof resp.deadline === 'number' && sameRound && t + c.offset >= resp.deadline)), offline: !!r && !r.online,
      },
      X.cm(t)
    );
  };

  room.waitHit = function waitHit(id) {
    if (id === 'roundWait:back') return X.dialog({ text: '离开后你的回合会自动跳过，确定离开？', confirmLabel: '离开', cancelLabel: '继续玩', danger: true, onConfirm: () => room.leave() });
    return undefined;
  };

  // ---------------------------------------------------------------------------------------------------------------- clock

  room.tick = function tick(tms) {
    const r = c.room;
    if (!r || !rt) return;
    const resp = r.resp;
    if (!resp || resp.state !== 'playing') return;
    // between rounds the next assignment appears once roundStartAt (a 1 s head start) has passed: ask for it
    const resolved = resp.me && (resp.me.slot === 'sent' || resp.me.slot === 'marker');
    const needs = !resp.assignment && !resolved && !c.turn && !c.pick;
    if (needs && typeof resp.roundStartAt === 'number' && tms + c.offset >= resp.roundStartAt && tms - r.lastPoke > POKE_MS) {
      r.lastPoke = tms;
      rt.refresh();
    }
    if (c.screen === 'roundWait' && typeof resp.deadline === 'number') {
      // the visible countdown and the passing label
      const sec = Math.max(0, Math.ceil((resp.deadline - (tms + c.offset)) / 1000));
      if (sec !== r.waitSec) {
        r.waitSec = sec;
        X.invalidate();
      }
    }
  };

  void store;
  void S;
  return room;
};
