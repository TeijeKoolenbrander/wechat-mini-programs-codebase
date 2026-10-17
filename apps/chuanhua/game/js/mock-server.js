/**
 * In-memory mirror of the cloud functions (spec 13.2, cloudfunctions/CONTRACT.md) so the whole game runs before the
 * backend and an AppID exist. It runs the SAME core/ code the real functions use (chain.js, room.js, roll.js, views.js, allowance.js,
 * strikes.js, moderation.js, text.js, strokes.js), applies the same rules and returns the same shapes and error codes.
 *
 *   const srv = createMockServer({ now, seed });
 *   await srv.call('createRoom', {}, 'openid-A');            // third argument = the caller (default srv.user)
 *   srv.server.modSweeper();                                  // timer function (async-fallback verdicts, expiry, notices)
 *   srv.server.roomSweeper();                                 // timer function (overdue rounds, idle lobbies, 20-minute cap, signals)
 *
 * NOT A SECURITY BOUNDARY and NOT FOR PRODUCTION (PO-14): mock moderation exists only when envKind is 'dev'. With
 * envKind 'prod' and mock moderation every UGC function returns SERVER_CONFIG and logs [ALERT] (AC 51). The build config
 * (js/build-config.js) must never construct this server in a release build. The prompt bank is SERVER-ONLY (TD-103): this
 * dev-only mock loads it through core/prompts.js, which a release package strips together with this file.
 *
 * Mock moderation (6.6): text containing 测试违规 -> risky, 测试复审 -> review (general text API only; the game API treats it as an error),
 * 测试繁忙 -> MODERATION_BUSY, else pass. Drawings are checked SYNCHRONOUSLY (imageMode 'sync', the default): exactly 13 strokes ->
 * risky (IMAGE_BLOCKED), 15 -> timeout (MODERATION_BUSY), otherwise pass. With `appConfig.moderation.imageMode = 'async'` (the dormant
 * fallback, live rooms off) the v1 pipeline applies: drawings are `pending` until `server.modSweeper()` runs MOCK_MEDIA_DELAY_SEC (default 60 s)
 * later; 13 strokes -> risky, 14 -> review, 15 -> no verdict ever (timeout -> re-check -> void).
 *
 * Realtime (3A.7): every room change writes the content-free per-seat signal documents into `srv.db.signals`, exactly like the cloud
 * (`room_signals`). `srv.realtime` is the simulation the client tests drive:
 *   srv.realtime.watch(openid, roomId, {onChange, onError}) -> {close()}   like db.collection('chuanhua_room_signals').where({_openid, roomId}).watch()
 *   srv.realtime.paused = true       signals are written but NOT delivered (a dropped connection); srv.realtime.flush() delivers the latest per watcher
 *   srv.realtime.failNext = n        the next n watch() calls fail with onError (the client falls back to polling after 2)
 *   srv.realtime.unsupported = true  watch() is missing (PC WeChat): srv.realtime.watch is undefined for the client
 *   srv.realtime.deliveries          log of [openid, seq] deliveries
 *
 * Differences from the cloud: no PNG rasterisation, no storage, no real concurrency (calls run one at a time), no `admin`/`cleanup`
 * functions (backend-only; `srv.admin.removeRoom` / `srv.admin.setModeration` are test hooks for the same effects), single process memory.
 * Test hooks: srv.db, srv.alerts, srv.sent, srv.appConfig, srv.failImageCalls, srv.offline, srv.rateLimited.
 */

const { CONFIG, applyRemote, ugcCreateAllowed } = require('../core/config');
const { textFor } = require('../core/codes');
const { hash32, mulberry32 } = require('../core/rng');
const { beijingDateKey } = require('../core/date');
const chainLib = require('../core/chain');
const roomLib = require('../core/room');
const roll = require('../core/roll');
const copy = require('../core/copy');
const allowance = require('../core/allowance');
const strikes = require('../core/strikes');
const mod = require('../core/moderation');
const text = require('../core/text');
const strokes = require('../core/strokes');
const views = require('../core/views');
const prompts = require('../core/prompts');
const schema = require('../core/schema');
const notice = require('../core/notice');
const analytics = require('../core/analytics');

const { STATE, STEP } = chainLib;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ME = 'mock-openid-me';
const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

function err(code, extra) {
  return Object.assign({ ok: false, code, message: textFor(code) }, extra || {});
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const kindName = (k) => (k === 'prompt' ? 'draw' : k);

function createMockServer(opts) {
  opts = opts || {};
  const nowFn = opts.now || (() => Date.now());
  const rng = mulberry32(opts.seed === undefined ? 20261015 : opts.seed);
  const envKind = opts.envKind || 'dev';
  const moderationMode = opts.moderationMode || 'mock';
  const mockDelayMs = (opts.mockMediaDelaySec === undefined ? CONFIG.moderation.mockMediaDelaySec : opts.mockMediaDelaySec) * 1000;
  const textBudget = opts.textDailyBudget === undefined ? CONFIG.moderation.devTextDailyBudget : opts.textDailyBudget;
  const pepper = opts.pepper || 'mock-pepper';

  const db = {
    chains: {}, steps: {}, rooms: {}, signals: {}, players: {}, members: {}, groupRefs: {}, groupStats: {}, reports: {}, reactions: {},
    modLog: [], traces: {}, quota: {}, events: [], dailyStats: {}, subGrants: {}, modCalls: [],
  };
  const srv = {
    db,
    user: ME,
    offline: false,
    rateLimited: null, // test hook: true or a list of function names answering RATE_LIMITED
    failImageCalls: false, // test hook: mediaCheckAsync calls error out (async fallback, 6.10)
    /**
     * stand-in for the platform's cloud.getOpenData: cloudID -> {cloudID, data:{opengid, chat_type}} or {errCode}. Default: the form
     * `cid-<chat_type|x>-<openGId>` (tests) is decoded; any other cloudID (DevTools has no cloud) gets a stable stand-in group.
     */
    resolveOpenData: opts.resolveOpenData || ((cloudID) => {
      const m = /^cid-([0-9]+|x)-(.*)$/.exec(cloudID);
      if (m) return { cloudID, data: { opengid: m[2], chat_type: m[1] === 'x' ? undefined : Number(m[1]) } };
      return { cloudID, data: { opengid: 'dev-group-' + cloudID, chat_type: 3 } };
    }),
    appConfig: opts.appConfig || null, // the remote app_config document
    imageQuota: opts.imageQuota || CONFIG.moderation.quota.imageDaily,
    alerts: [],
    sent: [], // reveal notices "sent"
    calls: [],
  };

  const now = () => nowFn();
  const dateKey = () => beijingDateKey(now());

  function randId(n, alphabet) {
    let s = '';
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
    return s;
  }
  const newChainId = () => randId(10, B32);
  const newRoomId = () => randId(10, B32);
  const newClaimId = () => 'c' + randId(15, ALPHANUM);
  const newRollId = () => roll.rollId(rng);
  function traceId() {
    return 'mock-trace-' + randId(12, ALPHANUM);
  }
  function refFor(openGId) {
    const a = hash32('ref:' + pepper + '|' + openGId).toString(16).padStart(8, '0');
    const b = hash32('ref2:' + pepper + '|' + openGId).toString(16).padStart(8, '0');
    return a + b;
  }

  // ---- config, env, quota -----------------------------------------------------------------------------------
  const cfg = () => applyRemote(srv.appConfig);
  function envState() {
    return mod.resolveEnv({ envKind, mode: moderationMode });
  }
  function dayQuota(k) {
    if (!db.quota[k]) db.quota[k] = { text: 0, image: 0, errors: 0 };
    return db.quota[k];
  }
  function noteModCall(failed) {
    db.modCalls.push({ at: now(), failed: !!failed });
    if (failed) dayQuota(dateKey()).errors++;
  }

  // ---- players ------------------------------------------------------------------------------------------------
  function getPlayer(openid) {
    let p = db.players[openid];
    if (!p) p = allowance.newPlayer(openid, now());
    p = allowance.rollDay(p, dateKey());
    p.lastActiveAt = now();
    db.players[openid] = p;
    return p;
  }
  const putPlayer = (p) => {
    db.players[p._id] = p;
  };

  function strike(openid, stepId, src) {
    const r = strikes.applyStrike(getPlayer(openid), { stepId, src }, now());
    putPlayer(r.player);
    track(openid, 'strike', { src, level: r.count });
    if (r.restrictMs > 0) track(openid, 'restrict', { src, level: r.count });
    return r;
  }

  function track(openid, name, props) {
    db.events.push({ openid: openid || 'server', name, props: props || {}, ts: now() });
  }

  // ---- context for chain.canClaim -----------------------------------------------------------------------------
  function groupContext(openid, groupRef) {
    if (typeof groupRef !== 'string') return null;
    const openGId = db.groupRefs[groupRef];
    if (!openGId) return null;
    const m = db.members[openGId + '_' + openid];
    return m && now() - m.lastSeen <= CONFIG.chain.membershipFreshMs ? openGId : null;
  }
  function isMember(openid, openGId) {
    const m = openGId && db.members[openGId + '_' + openid];
    return !!m && now() - m.lastSeen <= CONFIG.chain.membershipFreshMs;
  }
  /** the PLAYING room the player is seated in (IN_ROOM, 3A.9) */
  function playingRoomOf(p) {
    const r = p.activeRoomId && db.rooms[p.activeRoomId];
    const i = r ? roomLib.seatOf(r, p._id) : -1;
    return r && r.state === STATE_PLAYING && i >= 0 && r.seats[i].status === 'active' ? r : null;
  }
  /** the lobby or playing room the player is seated in */
  function seatedRoomOf(p) {
    const r = p.activeRoomId && db.rooms[p.activeRoomId];
    const i = r ? roomLib.seatOf(r, p._id) : -1;
    return r && (r.state === 'lobby' || r.state === STATE_PLAYING) && i >= 0 && r.seats[i].status === 'active' ? r : null;
  }
  function holdsClaim(p) {
    const ref = p.claimRef;
    if (!ref || !(ref.expiresAt > now())) return false;
    const chain = db.chains[ref.chainId];
    return !!(chain && chain.claim && chain.claim.openid === p._id && chain.claim.claimId === ref.claimId && chain.claim.expiresAt > now());
  }
  function claimCtx(chain, openid, groupRef) {
    const p = getPlayer(openid);
    const r = strikes.restrictionOf(p, now());
    const c = cfg();
    return {
      openid,
      now: now(),
      rulesOk: p.rulesVersion >= CONFIG.rulesVersion,
      restrictedUntil: r ? r.until : 0,
      ugcOk: ugcCreateAllowed(c.ugc, now()).ok,
      inRoom: !!playingRoomOf(p),
      groupOpenGId: groupContext(openid, groupRef),
      memberOfChainGroup: isMember(openid, chain.openGId),
      stepsToday: p.day.steps,
      claimsOnChainToday: p.day.claims[chain._id] || 0,
    };
  }

  function stepsByN(chain) {
    const out = {};
    for (let n = 1; n <= chain.length; n++) if (chain.stepIds[n] && db.steps[chain.stepIds[n]]) out[n] = db.steps[chain.stepIds[n]];
    return out;
  }
  const putChain = (c) => {
    db.chains[c._id] = c;
  };

  function bumpDaily(fn) {
    const k = dateKey();
    if (!db.dailyStats[k]) db.dailyStats[k] = { started: 0, revealed: 0, rooms: 0, roomsFinished: 0, markers: 0, byPrompt: {} };
    fn(db.dailyStats[k]);
  }
  function bumpGroup(chain, fn) {
    if (!chain.openGId) return;
    if (!db.groupStats[chain.openGId]) db.groupStats[chain.openGId] = { started: 0, revealed: 0, drawings: 0, rooms: 0, lastActivityAt: 0 };
    fn(db.groupStats[chain.openGId]);
    db.groupStats[chain.openGId].lastActivityAt = now();
  }

  // ---- guards -------------------------------------------------------------------------------------------------
  const STATE_PLAYING = 'playing';
  function ugcEnvGuard() {
    const e = envState();
    if (!e.ok) {
      srv.alerts.push(e.alert);
      return err('SERVER_CONFIG');
    }
    return null;
  }

  /** text moderation (6.2): returns {ok:true} | {ok:false, response} ; mock verdict, same decisions as live */
  function moderateText(openid, content, stepId, auto) {
    const e = envState();
    const q = dayQuota(dateKey());
    const api = cfg().config.moderation.textApi === 'general' ? 'general' : 'game';
    if (!mod.textBudgetAllows(e, q.text, textBudget)) {
      noteModCall(true);
      return { ok: false, response: err('MODERATION_BUSY') };
    }
    q.text++;
    const r = mod.mockText(content);
    if (r.error) {
      noteModCall(true);
      return { ok: false, response: err('MODERATION_BUSY') };
    }
    const v = mod.verdictOf(r.suggest);
    if (api === 'game' && r.suggest === 'review') {
      noteModCall(true); // the game API has no `review`: an unknown verdict is an error, never a pass
      return { ok: false, response: err('MODERATION_BUSY') };
    }
    noteModCall(false);
    db.modLog.push({ stepId: stepId || null, author: openid, kind: 'text', textCopy: content, suggest: r.suggest, source: 'mock', ts: now() });
    track(null, 'mod_verdict', { kind: 'text', api, suggest: r.suggest, latencyMs: 0, auto: !!auto, mock: true });
    if (v.outcome === 'passed') return { ok: true };
    if (v.strike) strike(openid, stepId || null, 'verdict');
    return { ok: false, response: err('TEXT_BLOCKED'), strike: v.strike };
  }

  /**
   * The synchronous image check (6.3): quota, mock verdict by stroke count (13 risky, 15 timeout, else pass).
   * @returns {{ok:true} | {ok:false, code:'IMAGE_BLOCKED'|'MODERATION_BUSY'|'INVALID_STROKES', reason?:string}}
   */
  function moderateDrawingSync(openid, drawing, stepId, auto) {
    const lvl = mod.quotaLevel(dayQuota(dateKey()).image, srv.imageQuota);
    if (lvl === 'failClosed') return { ok: false, code: 'MODERATION_BUSY' };
    if (lvl === 'alert') srv.alerts.push('[ALERT] image quota >= 70%');
    const sv = strokes.validate(drawing);
    if (!sv.ok) return { ok: false, code: 'INVALID_STROKES', reason: sv.reason };
    dayQuota(dateKey()).image++;
    const m = mod.mockImageSync(drawing);
    if (m.timeout) {
      noteModCall(true);
      return { ok: false, code: 'MODERATION_BUSY' };
    }
    noteModCall(false);
    const v = mod.verdictOf(m.suggest);
    db.modLog.push({ stepId, author: openid, kind: 'image', suggest: m.suggest, source: 'mock', ts: now() });
    track(null, 'mod_verdict', { kind: 'image', api: 'game', suggest: m.suggest, latencyMs: 0, auto: !!auto, mock: true });
    if (v.outcome === 'passed') return { ok: true };
    if (v.strike) strike(openid, stepId, 'verdict');
    return { ok: false, code: 'IMAGE_BLOCKED' };
  }

  // ---- chain lifecycle helpers ----------------------------------------------------------------------------------
  function onPassed(chain, openid, step, revealed) {
    if (step.kind === 'draw' && !step.marker) bumpGroup(chain, (g) => (g.drawings += 1));
    if (revealed) onRevealed(chain);
  }
  function onRevealed(chain) {
    bumpGroup(chain, (g) => (g.revealed += 1));
    bumpDaily((d) => (d.revealed += 1));
    track(null, 'chain_reveal', { reason: chain.revealReason, passed: chain.passed, participants: chain.participants.length, custom: chain.custom });
  }
  function advanceStreakOf(openid) {
    putPlayer(allowance.advanceStreak(getPlayer(openid), dateKey()));
  }

  // =====================================================================================================================
  // rooms: signals, settle, materialise, views
  // =====================================================================================================================
  const watchers = []; // {openid, roomId, onChange, onError, last}
  const realtime = {
    paused: false,
    failNext: 0,
    unsupported: false,
    deliveries: [],
    watch(openid, roomId, h) {
      if (realtime.unsupported) throw new Error('watch is not available');
      const w = { openid, roomId, onChange: h.onChange, onError: h.onError, last: 0 };
      if (realtime.failNext > 0) {
        realtime.failNext--;
        if (h.onError) h.onError(new Error('watch failed'));
        return { close() {} };
      }
      watchers.push(w);
      // like the platform's init snapshot: the current docs of the owner
      for (const d of Object.values(db.signals)) if (d._openid === openid && d.roomId === roomId && !realtime.paused) deliver(w, d);
      return {
        close() {
          const i = watchers.indexOf(w);
          if (i >= 0) watchers.splice(i, 1);
        },
      };
    },
    flush() {
      for (const w of watchers) for (const d of Object.values(db.signals)) if (d._openid === w.openid && d.roomId === w.roomId && d.seq > w.last) deliver(w, d);
    },
  };
  function deliver(w, d) {
    w.last = d.seq;
    realtime.deliveries.push([w.openid, d.seq]);
    if (w.onChange) w.onChange({ docs: [clone(d)], type: 'update' });
  }
  srv.realtime = realtime;

  function signalDoc(room, seat) {
    const doc = {
      _id: schema.signalId(room._id, seat),
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
  function writeSignals(room, prevCount) {
    room.seats.forEach((s, i) => {
      const id = schema.signalId(room._id, i);
      const cur = db.signals[id];
      if (cur && cur.seq > room.version) return;
      db.signals[id] = signalDoc(room, i);
      if (!realtime.paused) for (const w of watchers) if (w.openid === s.openid && w.roomId === room._id) deliver(w, db.signals[id]);
    });
    for (let i = room.seats.length; i < (prevCount || 0); i++) delete db.signals[schema.signalId(room._id, i)];
  }

  function promptTextOf(slot) {
    if (slot.custom) return slot.text;
    const p = prompts.promptById(slot.promptId);
    return p ? p.text : '';
  }
  function writeChainPrompts(room) {
    for (let c = 0; c < room.n; c++) {
      const p = roomLib.slotPrompt(room, c);
      if (!p) continue;
      const ch = db.chains[room.chainIds[c]];
      ch.promptId = p.promptId;
      ch.promptText = promptTextOf(p);
      ch.custom = p.custom;
      ch.lastActivityAt = now();
    }
  }

  /** the mock's version of common/roomio.js settleT + afterSettle: advance a due room exactly once */
  function settle(room, source, forceFinish) {
    const c = cfg();
    const d = forceFinish ? { action: 'finish', reason: forceFinish } : roomLib.decide(room, now(), c.config.room);
    if (d.action === 'none') return { room, due: null };
    const res = d.action === 'finish' ? roomLib.finish(room, now(), d.reason) : roomLib.advance(room, now(), d.reason);
    if (room.round === 0) writeChainPrompts(res.room);
    db.rooms[room._id] = res.room;
    afterSettle({ action: d.action, reason: d.reason, from: room.round, ended: res.ended, source, prev: room }, res.room);
    return { room: res.room, due: { reason: d.reason, from: room.round, ended: res.ended } };
  }
  function countMarkers(room) {
    let n = 0;
    for (let r = 1; r <= room.R; r++) for (const s of room.slots[String(r)]) if (s.state === roomLib.SLOT.MARKER) n++;
    return n;
  }
  function afterSettle(due, room) {
    writeSignals(room);
    const prev = due.prev;
    const markers = room.slots[String(due.from)].filter((s) => s.state === roomLib.SLOT.MARKER).length;
    const endedBy = due.source === 'sweeper' ? 'sweeper' : due.reason === 'all' ? 'all' : 'deadline';
    track(null, 'room_round', { round: due.from, kind: prev.kind, n: room.n, sent: room.slots[String(due.from)].length - markers, markers, endedBy, durationMs: Math.max(0, now() - prev.roundStartAt) });
    if (due.ended) {
      const m = countMarkers(room);
      track(null, 'room_end', { n: room.n, rounds: room.R, durationSec: Math.round((now() - room.startedAt) / 1000), markers: m, left: room.seats.filter((s) => s.status === 'left').length, endedBy: room.endedBy });
      bumpDaily((d) => {
        d.roomsFinished += 1;
        d.markers += m;
      });
      bumpGroup({ openGId: room.openGId }, (g) => (g.rooms += 1));
      materialize(room._id);
    }
  }
  function materialize(roomId) {
    const room = db.rooms[roomId];
    if (!room || room.state !== 'reveal' || room.materialized) return room;
    const plan = roomLib.materializePlan(room);
    for (const m of plan.markers) {
      if (!db.steps[m.stepId]) {
        db.steps[m.stepId] = {
          _id: m.stepId, chainId: m.chainId, n: m.n, attempt: 1, kind: m.kind, author: m.author, claimId: null, marker: m.marker, auto: true, state: 'passed',
          mod: { kind: 'marker' }, hiddenReason: null, laughs: 0, createdAt: now(),
        };
      }
    }
    for (const c of plan.chains) {
      const chain = db.chains[c.chainId];
      if (!chain || chain.state !== 'open') continue;
      Object.assign(chain, { stepIds: c.stepIds, authors: c.authors, passed: room.R, nextStep: null, state: 'revealed', revealedAt: room.endedAt, revealReason: 'complete', lastActivityAt: now(), roomId: room._id });
    }
    room.materialized = true;
    return room;
  }

  function sourceCtx(room, seat, c) {
    const ci = roomLib.chainOfSeat(seat, room.round, room.n);
    const o = { viewEnabled: c.ugc.viewEnabled, promptText: null, promptCustom: false, promptHidden: false, prevStep: null };
    if (room.round === 1) {
      const p = roomLib.slotPrompt(room, ci);
      if (p) {
        o.promptText = promptTextOf(p);
        o.promptCustom = p.custom;
        if (p.custom) o.promptHidden = !!db.chains[room.chainIds[ci]].hidden;
      }
    } else if (room.round >= 2) {
      const prev = roomLib.slotAt(room, room.round - 1, roomLib.sourceSeat(seat, room.n));
      if (prev && prev.state === roomLib.SLOT.SENT) o.prevStep = db.steps[prev.stepId] || null;
    }
    return o;
  }
  function mineOf(room, seat) {
    const slot = roomLib.slotAt(room, room.round, seat);
    if (slot.state === roomLib.SLOT.MARKER) return { kind: 'marker', marker: slot.marker, text: copy.markerText(slot.marker) };
    if (room.round === 0) return { kind: 'prompt', text: promptTextOf(slot), custom: !!slot.custom };
    const st = db.steps[slot.stepId];
    if (!st) return null;
    return st.kind === 'draw' ? { kind: 'draw', strokes: st.strokes } : { kind: 'describe', text: st.text };
  }
  function memberResponse(room, seat, openid) {
    const c = cfg();
    const o = { now: now() };
    if (room.state === STATE_PLAYING) {
      const slot = room.slots[String(room.round)][seat];
      if (roomLib.isResolved(slot)) o.mine = mineOf(room, seat);
      else if (o.now >= room.roundStartAt) {
        if (room.round === 0) {
          const rl = roomLib.rollOf(room, seat);
          o.promptsView = rl.ids.map((id) => ({ id, text: prompts.promptById(id).text }));
        } else o.source = roomLib.sourceFor(room, seat, sourceCtx(room, seat, c));
      }
    }
    const out = roomLib.memberView(room, seat, openid, o);
    out.features = { liveRooms: c.features.liveRooms };
    return out;
  }

  // =====================================================================================================================
  // client-callable functions
  // =====================================================================================================================
  const fn = {};

  fn.getHome = (d, openid) => {
    d = d || {};
    const c = cfg();
    const p = getPlayer(openid);
    const dk = dateKey();
    const sl = allowance.startsLeft(p, dk);
    const left = allowance.roomsLeft(p, dk);
    const r = strikes.restrictionOf(p, now());
    const warn = p.warnPending;
    if (warn) {
      p.warnPending = false; // read-once: the one-time 公约 sheet (7.3)
      putPlayer(p);
    }
    const unseenChains = Object.values(db.chains).filter((ch) => ch.mode !== 'live' && ch.state === STATE.REVEALED && chainLib.isParticipant(ch, openid) && !ch.revealViewed.includes(openid)).length;
    const unseenRooms = Object.values(db.rooms).filter((rm) => rm.state === 'reveal' && roomLib.isMember(rm, openid) && !(rm.revealViewed || []).includes(openid)).length;
    const paused = ugcCreateAllowed(c.ugc, now());
    const seated = seatedRoomOf(p);
    const out = {
      ok: true,
      dateKey: dk,
      serverNow: now(),
      me: {
        rulesVersion: p.rulesVersion,
        rulesRequiredVersion: CONFIG.rulesVersion,
        restriction: r ? { until: r.until, permanent: r.permanent } : null,
        warnPending: warn,
        startsLeft: sl.startsLeft,
        adStartsLeft: sl.adStartsLeft,
        roomsLeft: left.created,
        joinsLeft: left.joined,
        turnsLeft: left.turns,
        paletteToday: allowance.paletteToday(p, dk),
        streak: allowance.currentStreak(p, dk),
        unseenReveals: unseenChains + unseenRooms,
        activeRoom: seated ? { roomId: seated._id, state: seated.state, round: seated.round, rounds: seated.R } : null,
      },
      features: { liveRooms: c.features.liveRooms, subscribe: c.subscribe, updatableCard: c.features.updatableCard, banner: c.banner, interstitial: c.config.ads.interstitial, rt: c.config.rt },
      room: { minPlayers: c.config.room.minPlayers, maxPlayers: c.config.room.maxPlayers, maxRounds: c.config.room.maxRounds, promptSec: c.config.room.promptSec, drawSec: c.config.room.drawSec, describeSec: c.config.room.describeSec, graceSec: c.config.room.graceSec },
      timers: c.config.timers,
      ugc: { createEnabled: paused.ok && c.ugc.createEnabled, viewEnabled: c.ugc.viewEnabled, pausedSource: paused.source },
    };
    if (typeof d.groupRef === 'string') {
      const openGId = groupContext(openid, d.groupRef);
      if (openGId) {
        const open = Object.values(db.rooms).filter((rm) => rm.openGId === openGId && rm.state === 'lobby' && rm.seats.length < CONFIG.room.maxPlayers).sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0];
        const ctx = { now: now(), rulesOk: p.rulesVersion >= CONFIG.rulesVersion, restrictedUntil: r ? r.until : 0, ugcOk: paused.ok, groupOpenGId: openGId, memberOfChainGroup: true, stepsToday: p.day.steps };
        let waiting = 0;
        const chains = Object.values(db.chains).filter((ch) => ch.openGId === openGId && ch.state === 'open' && ch.mode !== 'live').sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 30);
        for (const ch of chains) {
          const dec = chainLib.canClaim(ch, Object.assign({ openid, claimsOnChainToday: p.day.claims[ch._id] || 0 }, ctx));
          if (dec.ok && !dec.resume) waiting++;
        }
        out.group = { openRoom: open ? { roomId: open._id, joined: open.seats.length } : null, waitingChains: waiting };
      } else out.group = null;
    }
    return out;
  };

  fn.agreeRules = (d, openid) => {
    if (!d || d.version !== CONFIG.rulesVersion) return err('BAD_REQUEST');
    const p = getPlayer(openid);
    p.rulesVersion = d.version;
    putPlayer(p);
    return { ok: true };
  };

  fn.joinGroup = (d, openid) => {
    // Parity with cloudfunctions/joinGroup (M1, TD-96): the request is `{cloudID: <raw string>}`; the openGId comes ONLY from the
    // server-side resolver (the real function calls cloud.getOpenData({list:[cloudID]})), never from the request. `event.groupData`
    // and any object-shaped cloudID are refused.
    const cloudID = d && typeof d.cloudID === 'string' && /^[A-Za-z0-9_-]{8,512}$/.test(d.cloudID) ? d.cloudID : null;
    if (!cloudID) return err('BAD_CLOUDID');
    const item = srv.resolveOpenData(cloudID);
    if (!item || typeof item !== 'object' || item.errCode || !item.data || typeof item.data !== 'object') return err('BAD_CLOUDID');
    const openGId = item.data.opengid;
    const chatTypeAbsent = item.data.chat_type === undefined || item.data.chat_type === null;
    const chatType = Number(item.data.chat_type);
    // studio ruling: chat_type absent or 3 / 4, and an opengid is required (open_single_roomid alone is rejected)
    if (typeof openGId !== 'string' || !openGId || openGId.length > 128 || !(chatTypeAbsent || chatType === 3 || chatType === 4)) return err('NOT_GROUP');
    const ref = refFor(openGId);
    db.groupRefs[ref] = openGId;
    const k = openGId + '_' + openid;
    db.members[k] = Object.assign(db.members[k] || { openGId, openid, groupRef: ref, firstSeen: now() }, { lastSeen: now() });
    return { ok: true, groupRef: ref };
  };

  // ---- prompt rolls (4.1) ----------------------------------------------------------------------------------------------
  const FRESH_MS = 10 * 60e3;
  const textsOf = (ids) => ids.map((id) => ({ id, text: prompts.promptById(id).text }));

  fn.rollPrompts = (d, openid) => {
    d = d || {};
    const reroll = d.reroll === true;
    const bank = prompts.getPrompts();
    if (d.roomId !== undefined) {
      const room = typeof d.roomId === 'string' ? db.rooms[d.roomId] : null;
      if (!room) return err('ROOM_NOT_FOUND');
      const seat = roomLib.seatOf(room, openid);
      if (seat < 0) return err('NOT_IN_ROOM');
      if (!reroll) {
        const cur = roomLib.rollOf(room, seat);
        if (!cur) return err('BAD_REQUEST');
        return { ok: true, rollId: cur.rollId, prompts: textsOf(cur.ids), rerollLeft: roll.rerollLeft(cur) };
      }
      const cur = roomLib.rollOf(room, seat);
      if (cur && d.rollId !== undefined && d.rollId !== cur.rollId) return err('BAD_REQUEST'); // a stale rollId: the client reloads
      const block = roomLib.rerollBlock(room, seat, now());
      if (block === 'REROLL_LIMIT') return err(block, { rollId: cur.rollId, rerollLeft: 0 });
      if (block) return err(block);
      const p = getPlayer(openid);
      const rr = roll.reroll({ bank, seen: p.seenPrompts || [], firstIds: roll.shownOf(cur), exclude: room.usedPrompts, rng });
      const rollId = newRollId();
      db.rooms[room._id] = roomLib.applyReroll(room, seat, rollId, rr.ids, now());
      p.seenPrompts = roll.pushSeen(p.seenPrompts, rr.ids);
      putPlayer(p);
      writeSignals(db.rooms[room._id]);
      return { ok: true, rollId, prompts: textsOf(rr.ids), rerollLeft: roll.rerollLeft(db.rooms[room._id].rolls[seat]) };
    }
    const p = getPlayer(openid);
    const cur = p.roll && p.roll.ctx === 'chain' && !p.roll.used ? p.roll : null;
    let nr;
    if (reroll) {
      if (!cur || (d.rollId !== undefined && d.rollId !== cur.rollId)) return err('BAD_REQUEST');
      if (roll.rerollLeft(cur) <= 0) return err('REROLL_LIMIT', { rollId: cur.rollId, rerollLeft: 0 });
      const rr = roll.reroll({ bank, seen: p.seenPrompts || [], firstIds: roll.shownOf(cur), exclude: [], rng });
      nr = Object.assign(roll.nextRec(cur, newRollId(), rr.ids), { ctx: 'chain', used: false, at: now() });
      p.seenPrompts = roll.pushSeen(p.seenPrompts, rr.ids);
    } else if (cur && now() - cur.at < FRESH_MS) nr = cur;
    else {
      const rr = roll.rollThree({ bank, seen: p.seenPrompts || [], rng });
      nr = Object.assign(roll.newRec(newRollId(), rr.ids), { ctx: 'chain', used: false, at: now() });
      p.seenPrompts = roll.pushSeen(p.seenPrompts, rr.ids);
    }
    p.roll = nr;
    putPlayer(p);
    return { ok: true, rollId: nr.rollId, prompts: textsOf(nr.ids), rerollLeft: roll.rerollLeft(nr) };
  };

  fn.createChain = (d, openid) => {
    d = d || {};
    const p = getPlayer(openid);
    if (p.rulesVersion < CONFIG.rulesVersion) return err('RULES_REQUIRED');
    const r = strikes.restrictionOf(p, now());
    if (r) return err('RESTRICTED', { until: r.until });
    const c = cfg();
    if (!ugcCreateAllowed(c.ugc, now()).ok) return err('UGC_PAUSED');
    const lvl = mod.quotaLevel(dayQuota(dateKey()).image, srv.imageQuota);
    if (lvl === 'pauseCreate' || lvl === 'failClosed') return err('UGC_BUSY');
    const lim = allowance.checkStart(p, dateKey());
    if (lim) return err(lim.code);
    if (playingRoomOf(p)) return err('IN_ROOM');
    let prompt;
    const hasId = typeof d.promptId === 'string';
    const hasCustom = typeof d.customText === 'string';
    if (hasId === hasCustom) return err('BAD_REQUEST');
    if (hasId) {
      const rl = p.roll;
      const valid = !!rl && rl.ctx === 'chain' && !rl.used && rl.rollId === d.rollId && typeof d.rollId === 'string' && rl.ids.includes(d.promptId);
      if (!valid) return err('BAD_REQUEST');
      p.roll = Object.assign({}, rl, { used: true });
      putPlayer(p);
      const pr = prompts.promptById(d.promptId);
      if (!pr || pr.retired) return err('BAD_REQUEST');
      prompt = { id: pr.id, text: pr.text, custom: false };
    } else {
      const v = text.validate(d.customText, 'prompt');
      if (!v.ok) return err('TEXT_REJECTED', { reason: v.reason });
      const m = moderateText(openid, v.text, null);
      if (!m.ok) return m.response;
      prompt = { id: null, text: v.text, custom: true };
    }
    const claimId = newClaimId();
    const gOpen = groupContext(openid, d.groupRef);
    const chain = chainLib.newChain({
      chainId: newChainId(), starter: openid, claimId, now: now(), dateKey: dateKey(), prompt,
      openGId: gOpen, groupRef: gOpen ? d.groupRef : null,
    });
    putChain(chain);
    const p2 = getPlayer(openid);
    p2.claimRef = { chainId: chain._id, claimId, expiresAt: chain.claim.expiresAt };
    if (p2.roll) p2.roll = Object.assign({}, p2.roll, { used: true });
    putPlayer(p2);
    track(openid, 'chain_create', { chainId: chain._id, bound: !!gOpen });
    return {
      ok: true,
      chainId: chain._id,
      serverNow: now(),
      claim: { claimId, step: 1, kind: 'draw', expiresAt: chain.claim.expiresAt, sourceText: prompt.text, timerSec: c.config.timers.drawSec },
    };
  };

  fn.getChain = (d, openid) => {
    const chain = d && db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    const view = views.entryView(chain, claimCtx(chain, openid, d.groupRef));
    const out = Object.assign({ ok: true, chainId: chain._id, serverNow: now() }, view);
    if (d.wantActivity && cfg().features.updatableCard && !chain.hidden && chainLib.isParticipant(chain, openid)) {
      chain.activityId = chain.activityId || 'mock-activity-' + chain._id;
      chain.activityExpiresAt = now() + 24 * 3600e3;
      out.activityId = chain.activityId;
    }
    return out;
  };

  fn.claimStep = (d, openid) => {
    const chain = d && db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    const c = cfg();
    const ctx = claimCtx(chain, openid, d.groupRef);
    const dec = chainLib.canClaim(chain, ctx);
    if (!dec.ok) return err(dec.code, dec.until ? { until: dec.until } : dec.etaSec ? { etaSec: dec.etaSec } : {});
    let cur = chain;
    if (!dec.resume) {
      const gr = dec.bind ? { openGId: dec.bind.openGId, groupRef: d.groupRef } : null;
      cur = chainLib.applyClaim(chain, { openid, claimId: newClaimId(), now: now(), bind: gr });
      putChain(cur);
      const np = allowance.consumeClaim(getPlayer(openid), dateKey(), chain._id);
      np.claimRef = { chainId: chain._id, claimId: cur.claim.claimId, expiresAt: cur.claim.expiresAt };
      putPlayer(np);
    }
    const step = cur.claim.step;
    const prev = views.claimPrev(cur, step, step > 1 ? db.steps[cur.stepIds[step - 1]] : null, c.ugc.viewEnabled);
    const kind = chainLib.kindOf(step);
    track(openid, 'claim_attempt', { chainId: chain._id, step, result: 'ok' });
    return {
      ok: true,
      serverNow: now(),
      claimId: cur.claim.claimId,
      step,
      kind,
      expiresAt: cur.claim.expiresAt,
      timerSec: chainLib.timerSec(kind, c.config.timers),
      prev,
    };
  };

  fn.releaseClaim = (d, openid) => {
    const chain = d && db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    const r = chainLib.releaseClaim(chain, { openid, claimId: d.claimId, now: now() });
    if (r.released) putChain(r.chain);
    return { ok: true };
  };

  function createStep(chain, n, attempt, openid, claimId, extra) {
    const s = Object.assign({
      _id: chainLib.stepId(chain._id, n, attempt), chainId: chain._id, n, attempt, kind: chainLib.kindOf(n), author: openid, claimId,
      state: STEP.PENDING, mod: null, hiddenReason: null, laughs: 0, createdAt: now(),
    }, extra);
    db.steps[s._id] = s;
    return s;
  }

  fn.submitStep = (d, openid) => {
    d = d || {};
    const chain = db.chains[d.chainId];
    if (!chain || chain.mode === 'live') return err('CHAIN_NOT_FOUND');
    // idempotent per claimId: the same claim returns the stored result (17.3)
    for (const s of Object.values(db.steps)) {
      if (s.chainId === chain._id && s.claimId === d.claimId && s.author === openid && s.result) return Object.assign({ ok: true }, s.result);
    }
    const p = getPlayer(openid);
    if (p.rulesVersion < CONFIG.rulesVersion) return err('RULES_REQUIRED');
    const c = cfg();
    if (!ugcCreateAllowed(c.ugc, now()).ok) return err('UGC_PAUSED');
    const imageMode = c.config.moderation.imageMode;
    const auto = d.auto === true;
    if (d.empty === true && !auto) return err('BAD_REQUEST');
    let hasText = typeof d.text === 'string';
    let hasStrokes = d.strokes !== undefined && d.strokes !== null;
    const kind0 = chain.claim ? chainLib.kindOf(chain.claim.step) : null;
    let empty = d.empty === true;
    if (auto && kind0 === 'draw' && !hasText && (!hasStrokes || (Array.isArray(d.strokes.s) && d.strokes.s.length === 0))) empty = true;
    if (auto && kind0 === 'describe' && !hasStrokes && (!hasText || text.validCharCount(d.text) < 2)) empty = true;
    if (empty) {
      hasText = false;
      hasStrokes = false;
    }
    const chk = chainLib.checkSubmit(chain, { openid, claimId: d.claimId, now: now(), hasText, hasStrokes, empty });
    if (!chk.ok) return err(chk.code);
    const claim = chain.claim;
    const r = strikes.restrictionOf(p, now());
    if (r && !(p.restrictedAt > claim.at)) return err('RESTRICTED', { until: r.until }); // edge 19: a claim taken before the restriction may finish
    if (!empty) {
      const stepLim = allowance.checkSteps(p, dateKey());
      if (stepLim) return err(stepLim.code);
    }
    const n = chk.step;
    const kind = chk.kind;
    const attempt = chain.attempts[n] + 1;
    const sid = chainLib.stepId(chain._id, n, attempt);

    const deliver1 = (stepExtra, pr, counters) => {
      const step = createStep(chain, n, attempt, openid, d.claimId, Object.assign({ state: STEP.PASSED, auto }, stepExtra));
      putChain(pr.chain);
      let pl = getPlayer(openid);
      if (counters.turn) pl = allowance.advanceStreak(allowance.consumeStep(pl, dateKey()), dateKey());
      if (n === 1) {
        pl = allowance.consumeStart(pl, dateKey());
        bumpDaily((ds) => {
          ds.started += 1;
          if (chain.promptId) ds.byPrompt[chain.promptId] = (ds.byPrompt[chain.promptId] || 0) + 1;
        });
        bumpGroup(chain, (g) => (g.started += 1));
      }
      putPlayer(pl);
      onPassed(pr.chain, openid, step, pr.revealed);
      const result = { state: stepExtra.marker ? 'marker' : 'passed', step: n, chainState: pr.chain.state, revealed: pr.revealed };
      if (stepExtra.marker) result.marker = stepExtra.marker;
      step.result = result;
      track(openid, 'step_result', { mode: 'chain', chainId: chain._id, step: n, kind, result: result.state === 'marker' ? 'marker' : 'passed' });
      return Object.assign({ ok: true, serverNow: now() }, result);
    };
    const reopenForced = (code, extra, recState) => {
      const next = chainLib.reopenAfterForced(chain, { attempt, now: now() });
      putChain(next);
      db.steps[sid] = {
        _id: sid, chainId: chain._id, n, attempt, kind, author: openid, claimId: d.claimId, state: recState, auto, hiddenReason: null, laughs: 0,
        mod: { kind, suggest: recState === 'blocked' ? 'risky' : 'error', submittedAt: now(), verdictAt: now() }, createdAt: now(),
      };
      track(openid, 'step_result', { mode: 'chain', chainId: chain._id, step: n, kind, result: code === 'MODERATION_BUSY' ? 'busy' : code === 'TEXT_REJECTED' || code === 'INVALID_STROKES' ? 'rejected' : 'blocked' });
      return err(code, Object.assign({ reopened: true }, extra || {}));
    };
    const fail = (code, extra, recState) => (auto ? reopenForced(code, extra, recState || (code === 'TEXT_BLOCKED' || code === 'IMAGE_BLOCKED' ? 'blocked' : 'void')) : err(code, extra));

    if (empty) {
      if (n === 1) {
        const sl = allowance.checkStart(p, dateKey());
        if (sl) return err(sl.code);
      }
      const marker = copy.emptyMarkerFor(kind);
      return deliver1({ marker, mod: { kind: 'marker' } }, chainLib.passMarker(chain, { stepId: sid, openid, attempt, now: now(), marker }), { turn: false });
    }

    if (kind === 'describe') {
      const v = text.validate(d.text, 'describe');
      if (!v.ok) return fail('TEXT_REJECTED', { reason: v.reason }, 'void');
      const m = moderateText(openid, v.text, sid, auto);
      if (!m.ok) return fail(m.response.code);
      return deliver1({ text: v.text, mod: { kind: 'text', api: c.config.moderation.textApi, suggest: 'pass', submittedAt: now(), verdictAt: now() } },
        chainLib.passText(chain, { stepId: sid, openid, attempt, now: now() }), { turn: true });
    }

    // drawing
    const sv = strokes.validate(d.strokes);
    if (!sv.ok) return fail('INVALID_STROKES', { reason: sv.reason }, 'void');
    if (n === 1) {
      const sl = allowance.checkStart(p, dateKey());
      if (sl) return err(sl.code);
    }
    if (imageMode === 'sync') {
      const m = moderateDrawingSync(openid, d.strokes, sid, auto);
      if (!m.ok) return fail(m.code, m.reason ? { reason: m.reason } : null);
      return deliver1({ strokes: clone(d.strokes), mod: { kind: 'image', api: 'game', suggest: 'pass', submittedAt: now(), verdictAt: now() } },
        chainLib.passText(chain, { stepId: sid, openid, attempt, now: now() }), { turn: true });
    }
    // imageMode 'async' (6.10): the v1 pipeline
    const lvl = mod.quotaLevel(dayQuota(dateKey()).image, srv.imageQuota);
    if (lvl === 'failClosed') return err('MODERATION_BUSY');
    if (lvl === 'alert') srv.alerts.push('[ALERT] image quota >= 70%');
    const step = createStep(chain, n, attempt, openid, d.claimId, {
      strokes: clone(d.strokes), mod: { kind: 'image', traceIds: [], submittedAt: now(), lastCheckAt: null, rechecks: 0, callErrors: 0, suggest: null },
    });
    dayQuota(dateKey()).image++;
    callMediaCheck(step, false);
    let pl = allowance.consumeStep(getPlayer(openid), dateKey());
    if (n === 1) {
      pl = allowance.consumeStart(pl, dateKey());
      bumpDaily((ds) => {
        ds.started += 1;
        if (chain.promptId) ds.byPrompt[chain.promptId] = (ds.byPrompt[chain.promptId] || 0) + 1;
      });
      bumpGroup(chain, (g) => (g.started += 1));
    }
    putPlayer(pl);
    const next = chainLib.beginPending(chain, { stepId: sid, openid, attempt, now: now() });
    putChain(next);
    const result = { state: 'pending', step: n, chainState: next.state, revealed: false };
    step.result = result;
    track(openid, 'step_result', { mode: 'chain', chainId: chain._id, step: n, kind: 'draw', result: 'pending' });
    return Object.assign({ ok: true, serverNow: now() }, result);
  };

  /** "call mediaCheckAsync" for a pending drawing (mock: schedule the mock verdict). Returns false when the call errors. */
  function callMediaCheck(step, isRecheck) {
    if (srv.failImageCalls) {
      step.mod.callErrors += 1;
      noteModCall(true);
      return false;
    }
    noteModCall(false);
    const tid = traceId();
    step.mod.traceIds.push(tid);
    step.mod.lastCheckAt = now();
    if (isRecheck) step.mod.rechecks += 1;
    const verdict = mod.mockImage(step.strokes);
    db.traces[tid] = { stepId: step._id, submittedAt: now(), mock: true, deliverAt: verdict ? now() + mockDelayMs : null, suggest: verdict ? verdict.suggest : null };
    return true;
  }

  fn.getReveal = (d, openid) => {
    let chain = d && db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    if (chain.mode === 'live' && chain.state === 'open') {
      const room = db.rooms[chain.roomId];
      if (room && room.state === 'reveal') {
        materialize(room._id);
        chain = db.chains[d.chainId];
      }
    }
    const c = cfg();
    const myLaughs = {};
    for (const rx of Object.values(db.reactions)) if (rx.openid === openid) myLaughs[rx.stepId] = true;
    const resp = views.revealResponse(chain, stepsByN(chain), { openid, viewEnabled: c.ugc.viewEnabled, myLaughs });
    if (resp.ok) {
      if (!chain.revealViewed.includes(openid)) {
        chain.revealViewed.push(openid);
        const p = getPlayer(openid);
        if (chain.mode !== 'live') p.lifetimeReveals += 1;
        putPlayer(p);
      }
      if (chain.mode === 'live') {
        const room = db.rooms[chain.roomId];
        resp.roomId = chain.roomId;
        resp.chainNo = chain.seat + 1;
        resp.chainCount = room ? room.n : null;
        resp.mineStarted = chain.starter === openid;
      }
      resp.serverNow = now();
      return resp;
    }
    return err(resp.code, resp);
  };

  fn.revealNow = (d, openid) => {
    const chain = d && db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    const r = chainLib.canRevealNow(chain, openid, now());
    if (!r.ok) return err(r.code, r.busy ? { busy: true } : {});
    const next = chainLib.applyRevealNow(chain, now());
    putChain(next);
    onRevealed(next);
    return { ok: true };
  };

  fn.laugh = (d, openid) => {
    const chain = d && db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    if (chain.state !== STATE.REVEALED || chain.hidden) return err('CHAIN_CLOSED');
    if (!chainLib.isParticipant(chain, openid)) return err('NOT_PARTICIPANT');
    const sid = chain.stepIds[d.step];
    const s = sid && db.steps[sid];
    if (!s || s.state !== STEP.PASSED || s.marker) return err('BAD_REQUEST');
    const k = s._id + '_' + openid;
    if (db.reactions[k]) {
      delete db.reactions[k];
      s.laughs = Math.max(0, s.laughs - 1);
    } else {
      db.reactions[k] = { stepId: s._id, openid, createdAt: now() };
      s.laughs += 1;
    }
    return { ok: true, laughs: s.laughs, mine: !!db.reactions[k] };
  };

  fn.report = (d, openid) => {
    d = d || {};
    let chainId = d.chainId;
    let n = d.step;
    if (d.reportRef !== undefined) {
      // a LIVE source named by its opaque reference (TD-140): the chain and step come from the caller's own seat, never from the client
      if (typeof d.reportRef !== 'string' || !/^q[0-9a-z]{2,24}$/.test(d.reportRef)) return err('BAD_REQUEST');
      const roomId = validRoomId(d);
      const room = roomId && db.rooms[roomId];
      if (!room) return err('ROOM_NOT_FOUND');
      const seat0 = roomLib.seatOf(room, openid);
      if (seat0 < 0) return err('NOT_MEMBER');
      if (room.state !== STATE_PLAYING) return err('ROUND_OVER');
      if (room.round < 1 || d.reportRef !== roomLib.reportRefFor(room, seat0)) return err('BAD_REQUEST');
      chainId = room.chainIds[roomLib.chainOfSeat(seat0, room.round, room.n)];
      n = room.round - 1;
    }
    const chain = db.chains[chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    if (!CONFIG.reports.reasons.includes(d.reason)) return err('BAD_REQUEST');
    const p = getPlayer(openid);
    const lim = allowance.checkReports(p, dateKey());
    if (lim) return err(lim.code);
    let target;
    if (chain.mode === 'live' && chain.state !== STATE.REVEALED) {
      // a LIVE round (7.1): only the seat working on this chain right now may report the source it was handed
      const room = db.rooms[chain.roomId];
      const seat = room ? roomLib.seatOf(room, openid) : -1;
      if (!room || room.state !== STATE_PLAYING || seat < 0) return err('NOT_PARTICIPANT');
      if (roomLib.chainOfSeat(seat, room.round, room.n) !== chain.seat || n !== room.round - 1) return err('NOT_PARTICIPANT');
      if (n === 0) {
        if (!chain.custom) return err('BAD_REQUEST');
        if (db.reports[schema.reportKey(openid, chain._id, null)]) return err('DUP_REPORT');
        target = { whole: true };
      } else {
        const slot = roomLib.slotAt(room, n, roomLib.workerOfChain(chain.seat, n, room.n));
        if (!slot || slot.state !== roomLib.SLOT.SENT) return err('BAD_REQUEST');
        if (db.reports[schema.reportKey(openid, chain._id, slot.stepId)]) return err('DUP_REPORT');
        const s = db.steps[slot.stepId];
        if (!s || s.state !== STEP.PASSED || s.marker) return err('BAD_REQUEST');
        target = { step: s };
      }
    } else if (n === 0) {
      // the teaser texts: a custom prompt hides the whole chain (edge 29); otherwise the final sentence
      if (!chainLib.isParticipant(chain, openid) && !isMember(openid, chain.openGId)) return err('NOT_MEMBER');
      if (chain.state !== STATE.REVEALED) return err('CHAIN_CLOSED');
      // QA-6: the teaser is ONE item per player and chain, whatever sentence it currently shows
      if (db.reports[schema.reportKey(openid, chain._id, null)]) return err('DUP_REPORT');
      if (chain.custom) target = { whole: true };
      else {
        const sbn = stepsByN(chain);
        let last = null;
        for (let i = chain.length; i >= 1; i--) if (chainLib.kindOf(i) === 'describe' && sbn[i] && sbn[i].state === STEP.PASSED) { last = sbn[i]; break; }
        if (!last) return { ok: true, hidden: true, reopened: false };
        target = { step: last };
      }
    } else {
      const sid = chain.stepIds[n];
      // QA-6: a repeat report by the same player is DUP_REPORT even though the first one already hid the step
      if (sid && db.reports[schema.reportKey(openid, chain._id, sid)]) return err('DUP_REPORT');
      const s = sid && db.steps[sid];
      if (!s || s.state !== STEP.PASSED || s.marker) return err('BAD_REQUEST'); // markers cannot be reported (5.8)
      const holdsNextClaim = chain.claim && chain.claim.openid === openid && chain.claim.step === n + 1 && chain.claim.expiresAt > now();
      const allowed = (chain.state === STATE.REVEALED && chainLib.isParticipant(chain, openid)) || holdsNextClaim;
      if (!allowed) return err('NOT_PARTICIPANT');
      target = { step: s };
    }
    const key = schema.reportKey(openid, chain._id, n === 0 ? null : target.step._id);
    if (db.reports[key]) return err('DUP_REPORT');
    if (target.step && target.step.author === openid) return err('OWN_STEP');
    db.reports[key] = { _id: key, reporter: openid, stepId: target.whole ? null : target.step._id, chainId: chain._id, roomId: chain.roomId || null, reason: d.reason, state: 'open', createdAt: now() };
    putPlayer(allowance.consumeReport(getPlayer(openid), dateKey()));
    let reopened = false;
    let claimReleased = false;
    if (target.whole) {
      putChain(chainLib.setChainHidden(chain, 'report', now()));
    } else {
      target.step.state = STEP.HIDDEN;
      target.step.hiddenReason = 'report';
      const r = chain.mode === 'live' ? { reopened: false } : chainLib.reopenLatest(chain, target.step.n, now());
      if (r.reopened) {
        putChain(r.chain);
        reopened = true;
        claimReleased = !!(r.cancelledClaim && r.cancelledClaim.openid === openid);
      }
    }
    track(openid, 'report_submit', { mode: chain.mode === 'live' ? 'live' : 'chain', reason: d.reason, target: n === 0 ? 'teaser' : 'step', reopened });
    return { ok: true, hidden: true, reopened, claimReleased };
  };

  fn.getMyChains = (d, openid) => {
    d = d || {};
    const mineByChain = {};
    for (const s of Object.values(db.steps)) if (s.author === openid) (mineByChain[s.chainId] = mineByChain[s.chainId] || {})[s._id] = s;
    const ids = new Set(Object.keys(mineByChain));
    for (const ch of Object.values(db.chains)) if (ch.starter === openid && ch.state !== STATE.ABANDONED) ids.add(ch._id);
    const itemFor = (id) => {
      const ch = db.chains[id];
      const mine = {};
      Object.values(mineByChain[id] || {}).forEach((s) => (mine[s._id] = s));
      const byN = {};
      Object.values(mine).forEach((s) => (byN[s.n + '_' + s.attempt] = s));
      return views.albumItem(ch, byN, openid);
    };
    if (d.chainId) {
      const ch = db.chains[d.chainId];
      if (!ch || !ids.has(ch._id)) return err('CHAIN_NOT_FOUND');
      const item = itemFor(ch._id);
      const mine = Object.values(mineByChain[ch._id] || {}).sort((a, b) => a.n - b.n || a.attempt - b.attempt).map((s) => {
        const row = { n: s.n, kind: s.kind, modState: s.state, canDelete: s.state === STEP.PASSED };
        if (s.strokes) row.strokes = s.strokes;
        if (s.text) row.text = s.text;
        return row;
      });
      return { ok: true, item, mine };
    }
    const chainItems = [...ids].filter((id) => db.chains[id] && db.chains[id].mode !== 'live').map(itemFor);
    const roomItems = Object.values(db.rooms)
      .filter((r) => roomLib.isMember(r, openid) && (r.state !== 'closed' || r.startedAt))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .slice(0, 100)
      .map((r) => roomLib.albumItem(r, openid, r.state === 'reveal' && !(r.revealViewed || []).includes(openid)));
    const all = chainItems.concat(roomItems).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    const start = d.cursor ? parseInt(d.cursor, 10) || 0 : 0;
    const page = all.slice(start, start + CONFIG.groupList.albumPage);
    const nextCursor = start + page.length < all.length ? String(start + page.length) : null;
    const p = getPlayer(openid);
    return { ok: true, items: page, cursor: nextCursor, streak: allowance.currentStreak(p, dateKey()), unseenReveals: all.filter((x) => x.unseen).length };
  };

  fn.getGroupChains = (d, openid) => {
    const openGId = d && db.groupRefs[d.groupRef];
    if (!openGId || !isMember(openid, openGId)) return err('NOT_MEMBER');
    const c = cfg();
    const out = { rooms: [], waiting: [], inProgress: [], revealed: [] };
    const rooms = Object.values(db.rooms).filter((r) => r.openGId === openGId);
    for (const rm of rooms.filter((r) => r.state === 'lobby' || r.state === STATE_PLAYING).sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 20)) {
      const row = roomLib.groupRoomRow(rm, { member: roomLib.isMember(rm, openid) });
      if (row) out.rooms.push(Object.assign({ kind: 'room' }, row));
    }
    const chains = Object.values(db.chains).filter((ch) => ch.openGId === openGId && ch.mode !== 'live');
    for (const ch of chains) {
      const ctx = claimCtx(ch, openid, d.groupRef);
      ctx.inRoom = false; // the list is not gated by the room (same as the function)
      const row = views.groupRow(ch, ctx);
      if (!row) continue;
      if (row.section === 'revealed') {
        const sbn = stepsByN(ch);
        out.revealed.push({ kind: 'chain', chainId: ch._id, participant: row.participant, ...(c.ugc.viewEnabled ? { promptText: ch.promptText, finalText: views.finalSentence(ch, sbn) } : { promptText: null, finalText: null, paused: true }), revealedAt: ch.revealedAt });
      } else out[row.section].push(row);
    }
    for (const rm of rooms.filter((r) => r.state === 'reveal').sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, CONFIG.groupList.revealedMax)) {
      out.revealed.push({ kind: 'room', roomId: rm._id, n: rm.n, member: roomLib.isMember(rm, openid), revealedAt: rm.endedAt });
    }
    out.revealed.sort((a, b) => b.revealedAt - a.revealedAt);
    out.revealed = out.revealed.slice(0, CONFIG.groupList.revealedMax);
    out.waiting.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    out.inProgress.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return Object.assign({ ok: true, stats: views.groupStatsView(db.groupStats[openGId]), serverNow: now() }, out);
  };

  function deleteOne(openid, s) {
    if (!s || s.author !== openid || s.state !== STEP.PASSED || s.marker) return false;
    if (s.roomId) {
      const room = db.rooms[s.roomId];
      if (room && (room.state === 'playing' || room.state === 'lobby')) return false;
    }
    s.state = STEP.DELETED;
    delete s.strokes;
    delete s.text;
    const ch = db.chains[s.chainId];
    const r = chainLib.reopenLatest(ch, s.n, now());
    if (r.reopened) putChain(r.chain);
    return true;
  }
  fn.deleteMyStep = (d, openid) => {
    d = d || {};
    let targets;
    if (d.all === true) targets = Object.values(db.steps).filter((s) => s.author === openid && s.state === STEP.PASSED);
    else {
      const chain = db.chains[d.chainId];
      const sid = chain && chain.stepIds[d.step];
      const s = sid && db.steps[sid];
      if (!s || s.author !== openid || s.state !== STEP.PASSED || s.marker) return err('BAD_REQUEST');
      targets = [s];
    }
    targets.sort((a, b) => b.n - a.n);
    let count = 0;
    for (const s of targets) if (deleteOne(openid, s)) count++;
    if (d.all !== true && count === 0) return err('BAD_REQUEST');
    track(openid, 'delete_step', { scope: d.all ? 'all' : 'one', count });
    return { ok: true, count };
  };

  fn.subscribeReveal = (d, openid) => {
    const c = cfg();
    if (!c.subscribe) return err('NO_TEMPLATE');
    const chain = d && db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    if (!chainLib.isParticipant(chain, openid)) return err('NOT_PARTICIPANT');
    const k = chain._id + '_' + openid;
    if (!db.subGrants[k]) db.subGrants[k] = { chainId: chain._id, openid, tmplId: c.subscribe.tmplId, grantedAt: now(), used: false };
    return { ok: true };
  };

  fn.grantReward = (d, openid) => {
    const r = allowance.grantReward(getPlayer(openid), d && d.kind, !!(d && d.noFill), dateKey());
    if (!r.ok) return err(r.code);
    putPlayer(r.player);
    const out = { ok: true };
    if (r.startsLeft !== undefined) out.startsLeft = r.startsLeft;
    if (r.adStartsLeft !== undefined) out.adStartsLeft = r.adStartsLeft;
    if (r.paletteToday !== undefined) out.paletteToday = r.paletteToday;
    return out;
  };

  fn.track = (d, openid) => {
    for (const e of analytics.sanitizeEvents(d && d.events)) db.events.push({ openid, sessionId: e.sessionId, name: e.name, props: e.props, ts: now(), clientTs: e.clientTs });
    return { ok: true };
  };

  // =====================================================================================================================
  // rooms (spec 3A)
  // =====================================================================================================================
  const validRoomId = (d) => (d && typeof d.roomId === 'string' && /^[A-Z2-7]{10}$/.test(d.roomId) ? d.roomId : null);

  /** rules, restriction, kill switch, live-rooms switch (same order as common/roomops.js#policyOrThrow) */
  function policy(p, c) {
    if (!c.features.liveRooms) return err('LIVE_OFF');
    if (p.rulesVersion < CONFIG.rulesVersion) return err('RULES_REQUIRED');
    const r = strikes.restrictionOf(p, now());
    if (r) return err('RESTRICTED', { until: r.until });
    if (!ugcCreateAllowed(c.ugc, now()).ok) return err('UGC_PAUSED');
    return null;
  }
  function refundCreate(room) {
    if (!room.creator) return;
    const p = db.players[room.creator];
    if (p) putPlayer(allowance.refundRoomCreate(p, room.dateKey || dateKey()));
  }
  function createRoomDoc(openid, openGId, groupRef, existingOk) {
    const p = getPlayer(openid);
    const seated = seatedRoomOf(p);
    if (seated) {
      if (seated.state === 'lobby' && existingOk) return { room: seated, created: false };
      return { error: err('IN_OTHER_ROOM', { otherRoomId: seated._id }) };
    }
    if (holdsClaim(p)) return { error: err('IN_CLAIM') };
    const lim = allowance.checkRoomCreate(p, dateKey());
    if (lim) return { error: err(lim.code) };
    let id = newRoomId();
    while (db.rooms[id]) id = newRoomId();
    const room = roomLib.newRoom({ roomId: id, host: openid, openGId, groupRef, now: now(), dateKey: dateKey() });
    db.rooms[id] = room;
    const np = allowance.consumeRoomCreate(p, dateKey());
    np.activeRoomId = id;
    putPlayer(np);
    return { room, created: true };
  }
  /** the group gate and the seat (same order as roomops.joinT); returns {error} or {room, joined, seat} */
  function takeSeat(room, openid, group, groupRef, cfgRoom) {
    const seat = roomLib.seatOf(room, openid);
    if (seat >= 0) return { room, joined: false, seat };
    let bind = null;
    if (room.openGId) {
      if (!group.member) return { error: err(group.openGId && group.openGId !== room.openGId ? 'WRONG_GROUP' : 'NEED_GROUP') };
    } else if (group.openGId) bind = { openGId: group.openGId, groupRef };
    else return { error: err('NEED_GROUP') };
    const block = roomLib.joinBlock(room, cfgRoom);
    if (block) return { error: err(block) };
    const p = getPlayer(openid);
    const seated = seatedRoomOf(p);
    if (seated && seated._id !== room._id) return { error: err('IN_OTHER_ROOM', { otherRoomId: seated._id }) };
    if (holdsClaim(p)) return { error: err('IN_CLAIM') };
    const lim = allowance.checkRoomJoin(p, dateKey(), room._id);
    if (lim) return { error: err(lim.code) };
    const next = roomLib.join(room, openid, now(), bind);
    db.rooms[room._id] = next;
    const np = allowance.consumeRoomJoin(p, dateKey(), room._id);
    np.activeRoomId = room._id;
    putPlayer(np);
    return { room: next, joined: true, seat: next.seats.length - 1 };
  }
  const groupFor = (openid, groupRef, room) => ({ openGId: groupContext(openid, groupRef), member: room && room.openGId ? isMember(openid, room.openGId) : false });

  fn.createRoom = (d, openid) => {
    d = d || {};
    const c = cfg();
    const p = getPlayer(openid);
    const bad = policy(p, c);
    if (bad) return bad;
    const lvl = mod.quotaLevel(dayQuota(dateKey()).image, srv.imageQuota);
    if (lvl === 'pauseCreate' || lvl === 'failClosed') return err('UGC_BUSY');
    const g = groupFor(openid, d.groupRef, null);
    const out = createRoomDoc(openid, g.openGId, g.openGId ? d.groupRef : null, true);
    if (out.error) return out.error;
    if (out.created) {
      writeSignals(out.room);
      track(null, 'room_create', { bound: !!out.room.openGId });
    }
    return memberResponse(out.room, roomLib.seatOf(out.room, openid), openid);
  };

  fn.joinRoom = (d, openid) => {
    d = d || {};
    const roomId = validRoomId(d);
    const pre = roomId && db.rooms[roomId];
    if (!pre) return err('ROOM_NOT_FOUND');
    const c = cfg();
    if (roomLib.isMember(pre, openid)) return memberResponse(pre, roomLib.seatOf(pre, openid), openid);
    const p = getPlayer(openid);
    const bad = policy(p, c);
    if (bad) return bad;
    const out = takeSeat(pre, openid, groupFor(openid, d.groupRef, pre), d.groupRef, c.config.room);
    if (out.error) return out.error;
    if (out.joined) writeSignals(out.room);
    return memberResponse(out.room, out.seat, openid);
  };

  fn.leaveRoom = (d, openid) => {
    const roomId = validRoomId(d);
    if (!roomId) return err('ROOM_NOT_FOUND');
    const room = db.rooms[roomId];
    if (!room) return err('ROOM_NOT_FOUND');
    if (roomLib.seatOf(room, openid) < 0) return err('NOT_IN_ROOM');
    if (room.state !== roomLib.STATE.LOBBY && room.state !== roomLib.STATE.PLAYING) return { ok: true };
    const p = getPlayer(openid);
    if (p.activeRoomId === roomId) {
      p.activeRoomId = null;
      putPlayer(p);
    }
    if (room.state === roomLib.STATE.LOBBY) {
      const res = roomLib.leaveLobby(room, openid, now());
      db.rooms[roomId] = res.room;
      writeSignals(res.room, room.seats.length);
      if (res.closed) refundCreate(res.room);
      track(openid, 'room_leave', { phase: 'lobby' });
      if (res.closed) track(null, 'room_close', { reason: 'empty', n: 0 });
      return { ok: true };
    }
    const lp = roomLib.leavePlaying(room, openid, now());
    if (!lp.changed) return { ok: true };
    db.rooms[roomId] = lp.room;
    const s = settle(lp.room, 'leave', lp.nobodyActive ? 'empty' : null);
    if (!s.due) writeSignals(s.room);
    track(openid, 'room_leave', { phase: 'playing', round: room.round });
    return { ok: true };
  };

  fn.startRoom = (d, openid) => {
    const roomId = validRoomId(d);
    if (!roomId) return err('ROOM_NOT_FOUND');
    const c = cfg();
    if (!c.features.liveRooms) return err('LIVE_OFF');
    if (!ugcCreateAllowed(c.ugc, now()).ok) return err('UGC_PAUSED');
    const room = db.rooms[roomId];
    if (!room) return err('ROOM_NOT_FOUND');
    if (roomLib.seatOf(room, openid) < 0) return err('NOT_IN_ROOM');
    const block = roomLib.startBlock(room, openid, c.config.room);
    if (block) return err(block);
    const bank = prompts.getPrompts();
    const seen = room.seats.map((s) => getPlayer(s.openid).seenPrompts || []);
    const ids = roll.rollRoom({ bank, seenBySeat: seen, rng });
    const rolls = ids.map((x) => ({ rollId: newRollId(), ids: x }));
    const chainIds = room.seats.map(() => newChainId());
    const next = roomLib.start(room, { now: now(), chainIds, rolls, cfg: c.config.room });
    const participants = next.seats.map((s) => s.openid);
    for (let i = 0; i < next.n; i++) {
      putChain(chainLib.newLiveChain({
        chainId: chainIds[i], roomId, seat: i, starter: participants[i], participants, rounds: next.R, now: now(), dateKey: dateKey(),
        openGId: next.openGId, groupRef: next.groupRef,
      }));
    }
    db.rooms[roomId] = next;
    next.seats.forEach((s, i) => {
      const p = getPlayer(s.openid);
      p.seenPrompts = roll.pushSeen(p.seenPrompts, rolls[i].ids);
      putPlayer(p);
    });
    writeSignals(next);
    bumpDaily((ds) => (ds.rooms += 1));
    track(null, 'room_start', { n: next.n, rounds: next.R, lobbySec: Math.round((now() - room.createdAt) / 1000) });
    return memberResponse(next, roomLib.seatOf(next, openid), openid);
  };

  fn.getRoom = (d, openid) => {
    d = d || {};
    const roomId = validRoomId(d);
    const room = roomId && db.rooms[roomId];
    if (!room) return err('ROOM_NOT_FOUND');
    const c = cfg();
    const seat = roomLib.seatOf(room, openid);
    if (seat >= 0) {
      let cur = room;
      if (room.state === roomLib.STATE.LOBBY && now() - room.seats[seat].lastSeenAt > 30e3) {
        cur = roomLib.touchSeat(room, seat, now());
        db.rooms[roomId] = cur;
      }
      const out = memberResponse(cur, seat, openid);
      if (d.wantActivity === true && c.features.updatableCard) {
        cur.activityId = cur.activityId || 'mock-activity-' + cur._id;
        cur.activityExpiresAt = now() + 24 * 3600e3;
        out.activityId = cur.activityId;
      }
      return out;
    }
    const p = getPlayer(openid);
    const g = groupFor(openid, d.groupRef, room);
    let inOtherRoomId = null;
    if (p.activeRoomId && p.activeRoomId !== roomId) {
      const other = seatedRoomOf(p);
      if (other) inOtherRoomId = other._id;
    }
    const r = strikes.restrictionOf(p, now());
    return roomLib.entryView(room, {
      now: now(),
      memberOfRoomGroup: g.member,
      groupOpenGId: g.openGId,
      rulesOk: p.rulesVersion >= CONFIG.rulesVersion,
      restrictedUntil: r ? r.until : 0,
      ugcOk: ugcCreateAllowed(c.ugc, now()).ok && c.features.liveRooms,
      inOtherRoomId,
      capReached: !!allowance.checkRoomJoin(p, dateKey(), roomId),
    });
  };

  fn.roomTick = (d, openid) => {
    const roomId = validRoomId(d);
    const pre = roomId && db.rooms[roomId];
    if (!pre) return err('ROOM_NOT_FOUND');
    if (roomLib.seatOf(pre, openid) < 0) return err('NOT_IN_ROOM');
    const s = pre.state === STATE_PLAYING ? settle(pre, 'tick') : { room: pre };
    return memberResponse(s.room, roomLib.seatOf(s.room, openid), openid);
  };

  fn.submitRoomStep = (d, openid) => {
    d = d || {};
    const roomId = validRoomId(d);
    const round = Number.isInteger(d.round) && d.round >= 0 && d.round <= 6 ? d.round : null;
    if (!roomId || round === null) return err('BAD_REQUEST');
    const auto = d.auto === true;
    if (d.empty === true && !auto) return err('BAD_REQUEST');
    const c = cfg();
    if (!ugcCreateAllowed(c.ugc, now()).ok) return err('UGC_PAUSED');
    const room0 = db.rooms[roomId];
    if (!room0) return err('ROOM_NOT_FOUND');
    const seat = roomLib.seatOf(room0, openid);
    if (seat < 0) return err('NOT_IN_ROOM');
    const kind = roomLib.kindOfRound(round);
    const hasText = typeof d.text === 'string';
    const hasStrokes = d.strokes !== undefined && d.strokes !== null;
    const hasPick = typeof d.promptId === 'string';
    const hasCustom = typeof d.customText === 'string';
    if (kind === 'prompt') {
      if (hasText || hasStrokes) return err('BAD_REQUEST');
      if (!auto && hasPick === hasCustom) return err('BAD_REQUEST');
      if (hasPick && typeof d.rollId !== 'string') return err('BAD_REQUEST');
    } else if (kind === 'draw') {
      if (hasText || hasPick || hasCustom) return err('BAD_REQUEST');
      if (!auto && !hasStrokes) return err('BAD_REQUEST');
    } else {
      if (hasStrokes || hasPick || hasCustom) return err('BAD_REQUEST');
      if (!auto && !hasText) return err('BAD_REQUEST');
    }
    let emptyTurn = false;
    if (kind === 'draw' && auto && (d.empty === true || !hasStrokes || (Array.isArray(d.strokes && d.strokes.s) && d.strokes.s.length === 0))) emptyTurn = true;
    if (kind === 'describe' && auto && (d.empty === true || !hasText || text.validCharCount(d.text) < 2)) emptyTurn = true;

    // phase A
    const gate = roomLib.sendGate(room0, seat, round, now());
    if (!gate.ok) {
      if (gate.code === 'ALREADY_SENT') return err('ALREADY_SENT', { slot: { state: gate.slot.state, marker: gate.slot.marker || null } });
      return err(gate.code);
    }
    const settleAfter = (room, adv) => {
      const s = settle(room, 'submit');
      if (!s.due) writeSignals(s.room);
      return s;
    };
    if (emptyTurn) {
      const marker = copy.emptyMarkerFor(kind);
      const resolved = roomLib.resolveMarker(roomLib.markReceived(room0, seat, now()), seat, marker, now(), true);
      db.rooms[roomId] = resolved;
      const s = settleAfter(resolved);
      track(openid, 'step_result', { mode: 'live', step: round, kind: kindName(kind), result: 'marker' });
      return { ok: true, state: 'marker', marker, round, slot: { state: roomLib.SLOT.MARKER }, serverNow: now(), advanced: !!s.due };
    }
    const received = roomLib.markReceived(room0, seat, now());
    db.rooms[roomId] = received;
    const attempt = received.slots[String(round)][seat].attempt;
    const chainIndex = roomLib.chainOfSeat(seat, round, received.n);
    const chainId = received.chainIds[chainIndex];
    const sid = round >= 1 ? chainId + '_' + round + '_' + attempt : null;

    // phase B
    let verdict = null;
    let fellBack = false;
    if (kind === 'prompt') {
      let pick = null;
      let e0 = null;
      if (hasCustom) {
        const v = text.validate(d.customText, 'prompt');
        if (!v.ok) e0 = { code: 'TEXT_REJECTED', extra: { reason: v.reason } };
        else {
          const m = moderateText(openid, v.text, null, auto);
          if (m.ok) pick = { custom: true, text: v.text };
          else e0 = { code: m.response.code };
        }
      }
      if (!pick && hasPick && (roomLib.rollPickValid(received, seat, d.rollId, d.promptId) || (auto && roomLib.shownPickValid(received, seat, d.promptId)))) pick = { promptId: d.promptId };
      if (!pick && !auto) verdict = { ok: false, code: e0 ? e0.code : 'BAD_REQUEST', extra: e0 ? e0.extra : null };
      if (!pick && auto) {
        pick = { promptId: roomLib.firstPrompt(received, seat) };
        fellBack = !hasPick;
      }
      if (pick) verdict = { ok: true, pick };
    } else if (kind === 'describe') {
      const v = text.validate(d.text, 'describe');
      if (!v.ok) verdict = { ok: false, code: 'TEXT_REJECTED', extra: { reason: v.reason } };
      else {
        const m = moderateText(openid, v.text, sid, auto);
        verdict = m.ok ? { ok: true, text: v.text } : { ok: false, code: m.response.code };
      }
    } else {
      const sv = strokes.validate(d.strokes);
      if (!sv.ok) verdict = { ok: false, code: 'INVALID_STROKES', extra: { reason: sv.reason } };
      else {
        const m = moderateDrawingSync(openid, d.strokes, sid, auto);
        verdict = m.ok ? { ok: true } : { ok: false, code: m.code, extra: m.reason ? { reason: m.reason } : null };
      }
    }

    // phase C
    const room = db.rooms[roomId];
    if (!roomLib.stillReceived(room, round, seat, attempt)) {
      track(openid, 'step_result', { mode: 'live', step: round, kind: kindName(kind), result: 'roundOver' });
      return err(room.state === STATE_PLAYING && room.round === round ? 'ALREADY_SENT' : 'ROUND_OVER');
    }
    let next;
    let state;
    let code = null;
    let extra2 = null;
    let marker = null;
    let failed = null;
    if (verdict.ok) {
      let ex;
      if (kind === 'prompt') ex = verdict.pick.custom ? { custom: true, text: verdict.pick.text } : { promptId: verdict.pick.promptId };
      else {
        ex = { stepId: sid };
        const step = {
          _id: sid, chainId, roomId, n: round, attempt, kind, author: openid, claimId: null, state: 'passed', auto, hiddenReason: null, laughs: 0, createdAt: now(),
          mod: kind === 'draw' ? { kind: 'image', api: 'game', suggest: 'pass', submittedAt: now(), verdictAt: now() } : { kind: 'text', api: 'game', suggest: 'pass', submittedAt: now(), verdictAt: now() },
        };
        if (kind === 'draw') step.strokes = clone(d.strokes);
        else step.text = verdict.text;
        db.steps[sid] = step;
      }
      next = roomLib.resolveSent(room, seat, ex, now(), auto);
      if (!fellBack) putPlayer(allowance.advanceStreak(allowance.consumeStep(getPlayer(openid), dateKey()), dateKey()));
      state = 'sent';
    } else if (auto) {
      next = roomLib.resolveMarker(room, seat, 'notDelivered', now(), true);
      state = 'marker';
      marker = 'notDelivered';
      failed = verdict.code;
    } else {
      next = roomLib.reopenSlot(room, seat, now());
      state = 'blocked';
      code = verdict.code;
      extra2 = verdict.extra;
    }
    db.rooms[roomId] = next;
    const s = settleAfter(next);
    const resultName = state === 'sent' ? 'passed' : state === 'marker' ? 'marker' : code === 'MODERATION_BUSY' ? 'busy' : code === 'TEXT_REJECTED' || code === 'INVALID_STROKES' ? 'rejected' : 'blocked';
    track(openid, 'step_result', { mode: 'live', step: round, kind: kindName(kind), result: resultName });
    if (state === 'blocked') return err(code, Object.assign({ slot: { state: roomLib.SLOT.BLOCKED } }, extra2 || {}));
    const base = { ok: true, state, round, slot: { state: state === 'sent' ? roomLib.SLOT.SENT : roomLib.SLOT.MARKER }, serverNow: now(), advanced: !!s.due };
    if (state === 'marker') {
      base.marker = marker;
      if (failed) base.failed = failed === 'MODERATION_BUSY' ? 'busy' : 'blocked';
    }
    return base;
  };

  fn.getRoomReveal = (d, openid) => {
    const roomId = validRoomId(d);
    let room = roomId && db.rooms[roomId];
    if (!room) return err('ROOM_NOT_FOUND');
    if (room.state === roomLib.STATE.REMOVED || room.state === roomLib.STATE.CLOSED) return err('ROOM_CLOSED', { state: room.state });
    if (room.state !== roomLib.STATE.REVEAL) return err('BAD_REQUEST', { state: room.state });
    const c = cfg();
    room = materialize(roomId) || room;
    const member = roomLib.isMember(room, openid);
    const finals = {};
    const promptTexts = [];
    for (let i = 0; i < room.n; i++) {
      const chain = db.chains[room.chainIds[i]];
      const slot = roomLib.slotAt(room, room.R, roomLib.workerOfChain(i, room.R, room.n));
      const stepDoc = slot && slot.state === roomLib.SLOT.SENT ? db.steps[slot.stepId] || null : null;
      finals[i] = { stepDoc, hidden: !!(chain && (chain.hidden || chain.state === 'removed')) };
      promptTexts[i] = chain ? chain.promptText : null;
    }
    if (!member) {
      return err('NOT_MEMBER', { teaser: { roomId, n: room.n, rounds: room.R, paused: !c.ugc.viewEnabled, lines: roomLib.teaserLines(room, finals, promptTexts, c.ugc.viewEnabled) } });
    }
    if (!(room.revealViewed || []).includes(openid)) {
      room.revealViewed = (room.revealViewed || []).concat(openid);
      const p = getPlayer(openid);
      p.lifetimeReveals = (p.lifetimeReveals || 0) + 1;
      putPlayer(p);
    }
    const out = { ok: true, roomId, n: room.n, rounds: room.R, cards: roomLib.revealCards(room, openid, finals, c.ugc.viewEnabled), serverNow: now() };
    if (room.rematchRoomId) out.rematchRoomId = room.rematchRoomId;
    return out;
  };

  fn.rematch = (d, openid) => {
    const roomId = validRoomId(d);
    const first = roomId && db.rooms[roomId];
    if (!first) return err('ROOM_NOT_FOUND');
    if (roomLib.seatOf(first, openid) < 0) return err('NOT_IN_ROOM');
    if (first.state !== roomLib.STATE.REVEAL) return err('BAD_REQUEST');
    const c = cfg();
    const bad = policy(getPlayer(openid), c);
    if (bad) return bad;
    const old = first;
    let out;
    if (old.rematchRoomId) {
      const target = db.rooms[old.rematchRoomId];
      if (!target) return err('ROOM_CLOSED');
      const r = takeSeat(target, openid, { openGId: old.openGId, member: true }, old.groupRef, c.config.room);
      if (r.error) return r.error;
      out = { room: r.room, created: false, joined: r.joined, old: null };
    } else {
      const cr = createRoomDoc(openid, old.openGId, old.groupRef, false);
      if (cr.error) return cr.error;
      const marked = roomLib.setRematch(old, cr.room._id, now());
      db.rooms[roomId] = marked;
      out = { room: cr.room, created: true, joined: false, old: marked };
    }
    if (out.created || out.joined) writeSignals(out.room);
    if (out.old) writeSignals(out.old);
    if (out.created) track(null, 'room_create', { bound: !!out.room.openGId });
    const res = memberResponse(out.room, roomLib.seatOf(out.room, openid), openid);
    res.created = out.created;
    return res;
  };

  // =====================================================================================================================
  // server-originated functions (timers and pushes)
  // =====================================================================================================================
  const server = {};

  /** push handler for `wxa_media_check` (6.10, async fallback only). Idempotent by trace id; unknown traces are ignored. */
  server.onMediaCheck = (event) => {
    const guard = ugcEnvGuard();
    if (guard) return guard;
    const tr = db.traces[event && event.trace_id];
    if (!tr) return { ok: true, result: 'success', ignored: 'unknown' };
    const step = db.steps[tr.stepId];
    const plan = mod.planVerdict(step && step.state, event.suggest);
    if (plan.strike && plan.action !== 'apply') strike(step.author, step._id, 'verdict'); // late risky on a voided step
    if (plan.action !== 'apply') return { ok: true, result: 'success', ignored: plan.reason };
    const chain = db.chains[step.chainId];
    step.mod.suggest = event.suggest;
    step.mod.verdictAt = now();
    db.modLog.push({ stepId: step._id, author: step.author, kind: 'image', suggest: event.suggest, source: tr.mock ? 'mock' : 'api', ts: now() });
    const res = chainLib.resolvePending(chain, { stepId: step._id, outcome: plan.outcome, now: now() });
    if (res.stale) return { ok: true, result: 'success', ignored: 'stale' };
    step.state = plan.outcome === 'passed' ? STEP.PASSED : STEP.BLOCKED;
    putChain(res.chain);
    if (plan.strike) strike(step.author, step._id, 'verdict');
    if (plan.outcome === 'passed') {
      advanceStreakOf(step.author);
      onPassed(res.chain, step.author, step, res.revealed);
    }
    track(null, 'mod_verdict', { kind: 'image', suggest: event.suggest, mock: !!tr.mock });
    return { ok: true, result: 'success' };
  };

  /** modSweeper (every 5 min in the cloud): async-fallback verdicts, pending timeouts and retries, expiry, notices, breaker, alerts */
  server.modSweeper = () => {
    const guard = ugcEnvGuard();
    if (guard) return guard;
    const t = now();
    const summary = { verdicts: 0, rechecked: 0, voided: 0, retried: 0, revealed: 0, expired: 0, abandoned: 0, notices: 0 };
    // 1. mock verdicts that are due (same path as a real push)
    for (const [tid, tr] of Object.entries(db.traces)) {
      if (tr.mock && !tr.done && tr.deliverAt && tr.deliverAt <= t) {
        tr.done = true;
        server.onMediaCheck({ trace_id: tid, suggest: tr.suggest });
        summary.verdicts++;
      }
    }
    // 2. pending drawings
    for (const step of Object.values(db.steps)) {
      if (step.state !== STEP.PENDING || !step.mod || step.mod.kind !== 'image') continue;
      const plan = mod.planPendingImage(step.mod, t);
      if (plan.action === 'retryCall') {
        if (callMediaCheck(step, false)) summary.retried++;
      } else if (plan.action === 'recheck') {
        if (callMediaCheck(step, true)) summary.rechecked++;
        else voidStep(step, 'error', summary);
      } else if (plan.action === 'void') voidStep(step, plan.reason, summary);
    }
    // 3. chains: abandon, expire, reveal at 48 h
    for (const chain of Object.values(db.chains)) {
      const r = chainLib.sweepChain(chain, t);
      if (r.event) {
        putChain(r.chain);
        if (r.event === 'reveal') {
          onRevealed(r.chain);
          summary.revealed++;
        } else if (r.event === 'expire') summary.expired++;
        else summary.abandoned++;
      }
    }
    // 4. reveal notices (quiet hours 22:00-08:00 BJT hold them until 08:00)
    for (const g of Object.values(db.subGrants)) {
      const chain = db.chains[g.chainId];
      if (g.used || !chain || chain.state !== STATE.REVEALED) continue;
      if (t >= notice.noticeSendTime(chain.revealedAt)) {
        g.used = true;
        g.sentAt = t;
        srv.sent.push({ chainId: chain._id, to: g.openid, at: t });
        summary.notices++;
      }
    }
    // 5. circuit breaker, quota and report-age alerts
    const win = db.modCalls.filter((c) => c.at > t - CONFIG.moderation.breaker.windowMs);
    const br = mod.breakerDecision({ total: win.length, failed: win.filter((c) => c.failed).length }, t);
    if (br.trip) {
      srv.appConfig = srv.appConfig || {};
      srv.appConfig.ugc = Object.assign({}, srv.appConfig.ugc, { autoPausedUntil: br.pausedUntil });
      srv.alerts.push('[ALERT] moderation circuit breaker tripped');
      track(null, 'ugc_pause', { source: 'breaker', on: true });
    }
    if (mod.quotaLevel(dayQuota(dateKey()).image, srv.imageQuota) !== 'ok') srv.alerts.push('[ALERT] image quota >= 70%');
    for (const r of Object.values(db.reports)) if (r.state === 'open' && t - r.createdAt > CONFIG.reports.staleAlertMs) srv.alerts.push('[ALERT] report older than 48h: ' + r._id);
    return Object.assign({ ok: true }, summary);
  };

  function voidStep(step, reason, summary) {
    const chain = db.chains[step.chainId];
    const res = chainLib.resolvePending(chain, { stepId: step._id, outcome: 'void', now: now() });
    if (res.stale) return;
    step.state = STEP.VOID;
    putChain(res.chain);
    // the author's allowance is restored (not their fault, 6.10)
    let p = getPlayer(step.author);
    p = allowance.refundStep(p, dateKey());
    if (step.n === 1) p = allowance.refundStart(p, dateKey());
    putPlayer(p);
    db.modLog.push({ stepId: step._id, author: step.author, kind: 'image', suggest: 'void', label: reason, source: 'sweeper', ts: now() });
    track(null, 'mod_void', { kind: 'image', reason });
    summary.voided++;
  }

  /** roomSweeper (every minute in the cloud): the kill switch / async fallback finish games, the 20-minute cap, overdue rounds, idle lobbies, signals */
  server.roomSweeper = () => {
    const guard = ugcEnvGuard();
    if (guard) return guard;
    const t = now();
    const c = cfg();
    const R = c.config.room;
    const off = c.ugc.createEnabled === false || c.config.moderation.imageMode === 'async';
    const summary = { advanced: 0, finished: 0, closed: 0, materialized: 0, signalsDeleted: 0, lobbiesDeleted: 0, healed: 0 };
    for (const room of Object.values(db.rooms)) {
      if (room.state === STATE_PLAYING) {
        if (off) {
          settle(room, 'sweeper', 'switch');
          summary.finished++;
        } else if (t >= room.startedAt + R.gameMaxMin * 60e3) {
          settle(room, 'sweeper');
          summary.finished++;
        } else if (t > roomLib.acceptUntil(room) + CONFIG.room.sweepOverdueMs) {
          const s = settle(room, 'sweeper');
          if (s.due) summary.advanced++;
        }
      } else if (room.state === roomLib.STATE.LOBBY) {
        if (off || t - room.lastActivityAt >= R.lobbyIdleMin * 60e3) {
          const next = roomLib.closeLobby(room, now(), off ? 'switch' : 'idle');
          db.rooms[room._id] = next;
          writeSignals(next);
          refundCreate(next);
          track(null, 'room_close', { reason: off ? 'admin' : 'idle', n: next.seats.length });
          summary.closed++;
        }
      }
    }
    for (const room of Object.values(db.rooms)) {
      if (room.state === 'reveal' && !room.materialized) {
        materialize(room._id);
        summary.materialized++;
      }
      if ((room.state === 'reveal' || room.state === 'closed') && room.endedAt && room.endedAt < t - CONFIG.room.signalKeepMs) {
        if (room.state === 'closed' && !room.startedAt) {
          for (const id of Object.keys(db.signals)) if (db.signals[id].roomId === room._id) delete db.signals[id];
          delete db.rooms[room._id];
          summary.lobbiesDeleted++;
        } else if (!room.signalsGone) {
          for (const id of Object.keys(db.signals)) if (db.signals[id].roomId === room._id) { delete db.signals[id]; summary.signalsDeleted++; }
          room.signalsGone = true;
        }
      }
    }
    return Object.assign({ ok: true }, summary);
  };

  // ---- test hooks for the admin effects (the mock has no `admin` function) ----------------------------------------------------
  srv.admin = {
    removeRoom(roomId) {
      const room = db.rooms[roomId];
      if (!room) return err('ROOM_NOT_FOUND');
      for (const cid of room.chainIds || []) if (db.chains[cid]) putChain(chainLib.removeChain(db.chains[cid], now()));
      db.rooms[roomId] = roomLib.remove(room, now());
      writeSignals(db.rooms[roomId]);
      return { ok: true, removed: true, was: room.state };
    },
    setModeration(o) {
      srv.appConfig = srv.appConfig || {};
      srv.appConfig.moderation = Object.assign({}, srv.appConfig.moderation, o);
      if (o.imageMode === 'async') {
        for (const room of Object.values(db.rooms)) {
          if (room.state === STATE_PLAYING) settle(room, 'admin', 'switch');
          else if (room.state === roomLib.STATE.LOBBY) {
            const next = roomLib.closeLobby(room, now(), 'switch');
            db.rooms[room._id] = next;
            writeSignals(next);
            refundCreate(next);
          }
        }
      }
      return { ok: true, moderation: srv.appConfig.moderation };
    },
  };

  // =====================================================================================================================
  // dispatcher
  // =====================================================================================================================
  const CLIENT_ONLY = new Set(schema.CLIENT_FUNCTIONS);

  /**
   * Call a function as a client. Resolves to {ok:true,...} or {ok:false, code, message}; never throws. Server-only
   * functions (onMediaCheck, modSweeper, roomSweeper, cleanup) called this way return FORBIDDEN, as in the cloud (a client call
   * carries an OPENID).
   */
  srv.call = (name, data, openid) => {
    srv.calls.push(name);
    if (srv.offline) return { ok: false, code: 'NETWORK', message: 'offline' };
    if (srv.rateLimited === true || (srv.rateLimited && srv.rateLimited.includes(name))) return { ok: false, code: 'RATE_LIMITED', message: 'rate limited' }; // test hook: the server's per-openid limiter (M3)
    const who = openid || srv.user;
    try {
      if (schema.FUNCTIONS[name] && schema.FUNCTIONS[name].caller !== 'client') return err('FORBIDDEN');
      if (!CLIENT_ONLY.has(name) || !fn[name]) return err('BAD_REQUEST');
      if (schema.UGC_FUNCTIONS.includes(name)) {
        const g = ugcEnvGuard();
        if (g) return g;
      }
      return clone(fn[name](data && typeof data === 'object' ? data : {}, who));
    } catch (e) {
      return { ok: false, code: 'INTERNAL', message: String(e && e.message) };
    }
  };
  srv.server = server;
  /** convenience: a caller bound to one openid, like wx.cloud for one player */
  srv.as = (openid) => ({ call: (name, data) => srv.call(name, data, openid), openid });
  srv.ME = ME;
  srv.refFor = refFor;
  return srv;
}

module.exports = { createMockServer, ME };
