/**
 * In-memory stand-in for the cloud functions (spec 11.2), so the whole game runs before the backend and an AppID
 * exist. It runs the SAME core code as the real functions (core/service.js, score.js, group.js, rounds.js, ...) and
 * follows cloudfunctions/CONTRACT.md: same inputs, same response shapes, same error codes, no raw openids in any
 * response. NOT a security boundary.
 *
 * Client-callable: getDaily submitCard getArchive getArchiveDay getBonusCard unlockDistribution joinGroup getGroupDay
 * getFriendBoard createRound setClue getRound submitGuess revealRound subscribeRound reportCard track,
 * and (D-2 typed clues) agreeRules reportClue. setClue {clueMode:'text', clueText} runs the same pipeline as the cloud
 * function (core/ugc.js gate, core/clue.js rules, 50 checks a day, strikes) with the MOCK words standing in for WeChat
 * (测试违规 risky, 测试复审 review, 测试繁忙 error, anything else pass; dev only, there is no prod mock).
 * Console-only: srv.callAs(null, 'admin', {op, ...}) (an openid needs srv.adminOpenids, else FORBIDDEN).
 * Timers (srv.runTimer(name)): genDaily finalizeDay sweepRounds cleanup. A client call to a timer name returns FORBIDDEN.
 *
 * Test/dev hooks: srv.offline, srv.appConfig (ads, subscribe, ugc:{createEnabled,viewEnabled}, moderation:{textApi}),
 * srv.moderate(text) -> {suggest}|{error:true} (override the mock words), srv.db (all collections),
 * srv.callAs(openid, name, data), srv.cloudID(groupId, chatType), srv.rateLimits,
 * srv.seedCrowd(dateKey, idx, n, opts), srv.sent (subscribe messages), srv.calls.
 */

const { CONFIG } = require('../core/config');
const S = require('../core/score');
const { V } = require('../core/input');
const SV = require('../core/service');
const W = require('../core/windows');
const G = require('../core/group');
const R = require('../core/rounds');
const ST = require('../core/streak');
const AD = require('../core/adpolicy');
const SCH = require('../core/schedule');
const U = require('../core/ugc');
const STK = require('../core/strikes');
const MOD = require('../core/moderation');
const EV = require('../core/events');
const { getServerContent, cardOf } = require('../core/content');
const { beijingDateKey, addDays } = require('../core/date');
const { hash32, mulberry32, sub } = require('../core/rng');
const { sha256Hex } = require('./sha256');

const ME = 'mock-openid-me';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TIMERS = ['genDaily', 'finalizeDay', 'sweepRounds', 'cleanup'];
const { CLIENT_FUNCTIONS: CLIENT_BASE } = require('./functions');
// D-2: the two new client functions are part of the contract even while js/functions.js (the client's own list) lags behind
const CLIENT_FUNCTIONS = CLIENT_BASE.concat(['agreeRules', 'reportClue'].filter((n) => CLIENT_BASE.indexOf(n) < 0));
const ROUND_ID_RE = /^[A-Z2-7]{8}$/;

function err(code, message, extra) {
  return { ok: false, code, message: message || code, ...(extra || {}) };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const hex8 = (n) => (n >>> 0).toString(16).padStart(8, '0');

const MOCK_CLOUDID_PREFIX = 'mockcloud_'; // + hex of the UTF-8 JSON: matches the real cloudID wire shape /^[A-Za-z0-9_-]{8,512}$/
/** The mock's synthetic cloudID (what wx.getGroupEnterInfo would give); chatType null omits chat_type. Shared with the fake SDK of the cloud-function tests. */
function encodeMockCloudID(groupId, chatType) {
  const data = { opengid: groupId };
  if (chatType !== null) data.chat_type = chatType === undefined ? 3 : chatType;
  return encodeMockCloudData(data);
}
/** a synthetic cloudID for any payload (tests: single-chat payloads with open_single_roomid) */
function encodeMockCloudData(data) {
  const utf8 = unescape(encodeURIComponent(JSON.stringify(data)));
  let hex = '';
  for (let i = 0; i < utf8.length; i++) hex += utf8.charCodeAt(i).toString(16).padStart(2, '0');
  return MOCK_CLOUDID_PREFIX + hex;
}
/** Inverse of encodeMockCloudID: the decrypted payload, or null for anything that is not a mock cloudID. */
function decodeMockCloudID(s) {
  if (typeof s !== 'string' || s.indexOf(MOCK_CLOUDID_PREFIX) !== 0) return null;
  try {
    const hex = s.slice(MOCK_CLOUDID_PREFIX.length);
    if (!/^([0-9a-f]{2})+$/.test(hex)) return null;
    let utf8 = '';
    for (let i = 0; i < hex.length; i += 2) utf8 += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    const d = JSON.parse(decodeURIComponent(escape(utf8)));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
  } catch (e) {
    return null;
  }
}

function createMockServer(opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now());
  const content = opts.content || getServerContent(opts.contentVersion);
  if (!content) throw new Error('mock server: server content missing (core/content/spectra.v1.js + anchors.v1.js are server-only: packOptions.ignore keeps them out of a package, so the mock cannot boot from a packed copy); pass opts.content');
  const schedule = opts.schedule === undefined ? SCH.getSchedule() : opts.schedule;
  const launchKey = opts.launchKey || (schedule && schedule.launchDateKey) || CONFIG.daily.launchDateKey;
  const random = opts.random || Math.random;
  // parity hook for cloud.getOpenData: (cloudID) => {data}|{errCode}; the default decodes the mock's synthetic cloudIDs
  const resolveOpenData = opts.resolveOpenData || ((cid) => {
    const d = decodeMockCloudID(cid);
    return d ? { cloudID: cid, data: d } : { cloudID: cid, errCode: -1 };
  });

  const db = {
    sets: {}, // dateKey -> daily_sets
    stats: {}, // dateKey_idx -> {hist, n}
    entries: {}, // dateKey_openid
    players: {}, // openid -> player_stats
    members: {}, // openGId_openid
    groupDaily: {},
    rounds: {},
    guesses: {}, // roundId_openid
    grants: {}, // roundId_openid
    revealViews: {}, // roundId_openid: the viewer asked for / was served the answer of a revealed round (L4)
    minute: {}, // fn_openid_minute -> calls (per-minute limiter, M3)
    reports: [],
    clueReports: {}, // roundId_openid -> clue_reports row (D-2): never in a response
    modLog: [], // typed-clue evidence (the blocked text only for non-pass results): never in a response
    audit: [], // admin audit trail
    usage: {}, // itemId -> dateKey
    anomalies: [],
    events: [],
    rate: {}, // bucket_openid_dateKey -> count
  };
  const srv = { db, offline: false, calls: [], sent: [], appConfig: opts.appConfig || null, launchKey };
  let idCounter = 0;

  // ---- plumbing ---------------------------------------------------------------------------------------------------

  const todayKey = () => beijingDateKey(now());
  /** Same as the server: first 12 hex chars of sha256(openid + '|' + salt) (spec 8.3); the open data domain recomputes it. */
  const hashRow = (openid, salt) => sha256Hex(openid + '|' + salt).slice(0, 12);

  function rateTake(openid, bucket, limit) {
    const k = bucket + '_' + openid + '_' + todayKey();
    const c = db.rate[k] || 0;
    if (c >= limit) return false;
    db.rate[k] = c + 1;
    return true;
  }

  function prevPublishedKey(dateKey) {
    let best = null;
    Object.keys(db.sets).forEach((k) => {
      if (k < dateKey && (best === null || k > best)) best = k;
    });
    return best;
  }

  /** item_usage plus every scheduled item: the auto path never repeats either (spec 4.2). */
  function usedItems() {
    const used = new Set(Object.keys(db.usage));
    if (schedule) schedule.days.forEach((d) => d.forEach((id) => used.add(id)));
    return used;
  }

  function createSet(dateKey) {
    if (dateKey < launchKey) return null;
    let cards = schedule ? SCH.cardsForDate(schedule, content, dateKey) : null;
    let source = 'schedule';
    if (!cards) {
      source = 'auto';
      const blocked = new Set();
      for (let i = 1; i <= SCH.SPECTRUM_GAP_DAYS; i++) {
        const s = db.sets[addDays(dateKey, -i)];
        if (s) s.cards.forEach((c) => blocked.add(c.spectrumId));
      }
      const ids = SCH.pickDay(content, { dateKey, usedItems: usedItems(), blockedSpectra: blocked, rng: sub(dateKey, 'auto') });
      if (!ids) return null;
      cards = ids.map((id) => cardOf(content, id));
    }
    const salt = [0, 1, 2, 3].map((i) => hex8(hash32('boardSalt:' + dateKey + ':' + i))).join('');
    const set = SV.newDailySet({ dateKey, launchKey, cards, source, contentVersion: content.contentVersion, boardSalt: salt, nowMs: now() });
    db.sets[dateKey] = set;
    SV.newStatsDocs(dateKey).forEach((d) => {
      db.stats[d._id] = d;
    });
    cards.forEach((c) => {
      db.usage[c.itemId] = dateKey;
    });
    return set;
  }

  /** getDaily lazily creates TODAY's set when genDaily missed it (spec 4.2). */
  function ensureSet(dateKey) {
    if (db.sets[dateKey]) return db.sets[dateKey];
    if (dateKey !== todayKey()) return null;
    return createSet(dateKey);
  }

  const histsOf = (dateKey) => [0, 1, 2, 3, 4].map((i) => db.stats[dateKey + '_' + i].hist);

  /** Freeze the references of a closed day lazily (spec 3.3). */
  function ensureFinal(set) {
    const f = SV.lazyFinal(set, histsOf(set.dateKey), now());
    if (f) set.final = f;
    return set;
  }

  function entryOf(dateKey, openid) {
    return db.entries[dateKey + '_' + openid] || null;
  }

  function groupRefValid(openid, groupRef) {
    return !!groupRef && Object.keys(db.members).some((k) => db.members[k].openid === openid && db.members[k].groupRef === groupRef);
  }
  function membersOfRef(groupRef) {
    return Object.keys(db.members)
      .map((k) => db.members[k])
      .filter((m) => m.groupRef === groupRef)
      .map((m) => m.openid);
  }
  function completeMembers(groupRef, dateKey) {
    return membersOfRef(groupRef)
      .map((o) => ({ openid: o, e: entryOf(dateKey, o) }))
      .filter((x) => SV.isComplete(x.e))
      .map((x) => ({ key: x.openid, pos: x.e.pos, completeAt: x.e.completeAt, streak: x.e.streak }));
  }

  function features() {
    return AD.buildFeatures(srv.appConfig);
  }

  // ---- reveal side effects ------------------------------------------------------------------------------------------

  function guessesOf(roundId) {
    return Object.keys(db.guesses)
      .filter((k) => k.indexOf(roundId + '_') === 0)
      .map((k) => db.guesses[k]);
  }

  function doReveal(round, by) {
    const gs = guessesOf(round._id);
    const next = SV.applyReveal(round, gs, by, now());
    db.rounds[round._id] = next;
    // one message per unused grant, never names or openids (spec 7.4)
    Object.keys(db.grants).forEach((k) => {
      const g = db.grants[k];
      if (g.roundId === round._id && !g.used) {
        g.used = true;
        g.sentAt = now();
        srv.sent.push({ to: g.openid, roundId: round._id, mq: next.mq, left: round.left, right: round.right });
      }
    });
    return next;
  }

  /** Apply the lazy 24 h / 30 min transitions; returns the (maybe changed) round or null when discarded. */
  function lazyRound(round) {
    const t = R.lazyTransition(round, now());
    if (t === 'discard') {
      delete db.rounds[round._id];
      return null;
    }
    if (t === 'reveal') return doReveal(round, 'timer');
    if (t === 'noGuesses') {
      db.rounds[round._id] = { ...round, status: 'noGuesses' };
      return db.rounds[round._id];
    }
    return round;
  }

  // ---- functions ----------------------------------------------------------------------------------------------------

  const fns = {
    getDaily(openid, e) {
      const v = V.getDaily(e);
      if (!v.ok) return err(v.code);
      const today = todayKey();
      const dateKey = v.v.dateKey || today;
      if (!W.liveDay(dateKey, now())) return err('INVALID_INPUT', 'day is closed; use getArchiveDay');
      const set = ensureSet(dateKey);
      if (!set) return err('DAILY_UNAVAILABLE');
      const entry = entryOf(dateKey, openid);
      let blocks = null;
      if (v.v.groupRef && groupRefValid(openid, v.v.groupRef)) {
        const others = membersOfRef(v.v.groupRef)
          .filter((o) => o !== openid)
          .map((o) => entryOf(dateKey, o))
          .filter(Boolean);
        blocks = SV.groupBlocksFor(others, entry);
      }
      const prev = prevPublishedKey(today);
      const prevSet = prev ? ensureFinal(db.sets[prev]) : null;
      const yesterday = SV.yesterdayInfo(prevSet, prev ? entryOf(prev, openid) : null, now());
      const out = SV.dailyView({
        set,
        entry,
        hists: histsOf(dateKey),
        content,
        groupBlocks: blocks,
        streak: ST.display(db.players[openid] || null, today, prev),
        yesterday,
        features: features(),
        nowMs: now(),
      });
      return out;
    },

    submitCard(openid, e) {
      const v = V.submitCard(e);
      if (!v.ok) return err(v.code);
      const { dateKey, idx, pos, groupRef } = v.v;
      const set = ensureSet(dateKey) || db.sets[dateKey] || null;
      const entry = entryOf(dateKey, openid);
      const hists = set ? histsOf(dateKey) : null;
      const blocksFor = (ent) => {
        if (!groupRef || !groupRefValid(openid, groupRef)) return null;
        const others = membersOfRef(groupRef)
          .filter((o) => o !== openid)
          .map((o) => entryOf(dateKey, o))
          .filter(Boolean);
        return SV.groupBlocksFor(others, ent);
      };
      const plan = SV.applySubmit({ set, entry, dateKey, idx, pos, nowMs: now(), openid });
      if (!plan.ok) {
        if (plan.code === 'CARD_DONE') {
          const b = blocksFor(entry);
          const reveal = SV.cardReveal({ set, hists, idx, pos: entry.pos[idx], group: b ? b[idx] : null, nowMs: now() });
          return err('CARD_DONE', 'already answered', { reveal });
        }
        return err(plan.code);
      }
      // write: entry, histogram +1 (once), counters
      db.entries[plan.entry._id] = plan.entry;
      const st = db.stats[dateKey + '_' + idx];
      st.hist[pos] += 1;
      st.n += 1;
      if (plan.fast) db.anomalies.push({ _id: openid + '_' + dateKey + '_fast', kind: 'fast', detail: { ms: plan.entry.completeAt - plan.entry.firstAt }, ts: now() });
      const b = blocksFor(plan.entry);
      const reveal = SV.cardReveal({ set, hists, idx, pos, group: b ? b[idx] : null, nowMs: now() });
      const out = { ok: true, dateKey, ...reveal, complete: plan.complete };
      if (plan.complete) {
        const prev = prevPublishedKey(dateKey);
        const r = ST.onComplete(db.players[openid] || null, dateKey, prev);
        db.players[openid] = { ...(db.players[openid] || {}), ...r.stats, updatedAt: now() }; // merge: player_stats also holds the UGC state
        plan.entry.streak = r.streak;
        Object.assign(out, SV.completionBlock({ set, hists, entry: plan.entry, nowMs: now() }), { streak: { current: r.stats.curStreak, best: r.stats.bestStreak } });
      }
      return out;
    },

    getArchive(openid, e) {
      const v = V.getArchive(e);
      if (!v.ok) return err(v.code);
      const { page, hasMore } = SV.archivePage(Object.keys(db.sets).map((k) => db.sets[k]), v.v.before, v.v.limit, now());
      const items = page.map((s) => SV.archiveItem(ensureFinal(s), entryOf(s.dateKey, openid)));
      const ps = db.players[openid];
      return { ok: true, items, hasMore, bestStreak: ps ? ps.bestStreak || 0 : 0 };
    },

    getArchiveDay(openid, e) {
      const v = V.getArchiveDay(e);
      if (!v.ok) return err(v.code);
      const set = db.sets[v.v.dateKey];
      if (!set) return err('DAY_OPEN', 'no closed day');
      ensureFinal(set);
      const out = SV.archiveDayView(set, entryOf(set.dateKey, openid), content, now());
      return out.ok ? out : err(out.code);
    },

    getBonusCard(openid, e) {
      const v = V.getBonusCard(e);
      if (!v.ok) return err(v.code);
      const closed = Object.keys(db.sets)
        .map((k) => db.sets[k])
        .filter((s) => W.dayClosed(s.dateKey, now()))
        .map(ensureFinal);
      const byDate = {};
      closed.forEach((s) => {
        byDate[s.dateKey] = entryOf(s.dateKey, openid);
      });
      const pick = SV.pickBonusCard(closed, byDate, new Set(v.v.exclude), random, content);
      if (!pick) return err('NO_CARD_AVAILABLE');
      if (!rateTake(openid, 'bonus', CONFIG.limits.bonusPerDay)) return err('RATE_LIMITED');
      return { ok: true, card: pick.card, final: pick.final, dateKey: pick.dateKey, issueNo: pick.issueNo };
    },

    unlockDistribution(openid, e) {
      const v = V.unlockDistribution(e);
      if (!v.ok) return err(v.code);
      const set = db.sets[v.v.dateKey];
      if (!set || v.v.dateKey > todayKey()) return err('INVALID_INPUT');
      if (!rateTake(openid, 'dist', CONFIG.limits.distributionPerDay)) return err('RATE_LIMITED');
      return { ok: true, dateKey: set.dateKey, hist: SV.distributionView(set, entryOf(set.dateKey, openid), histsOf(set.dateKey), now()) };
    },

    joinGroup(openid, e) {
      // parity with cloudfunctions/joinGroup: the raw cloudID string is resolved "server side" (here: the mock's own
      // synthetic codec); a plain object, `groupData` or an unknown string is BAD_CLOUDID, chat_type must be 3 or 4
      const v = V.joinGroup(e);
      if (!v.ok) return err('BAD_CLOUDID');
      // the hook stands in for cloud.getOpenData({list:[cloudID]}): returns the list item {data} or {errCode}
      const item = resolveOpenData(v.v.cloudID);
      const data = item && !item.errCode && item.data && typeof item.data === 'object' && !Array.isArray(item.data) ? item.data : null;
      if (!data) return err('BAD_CLOUDID', 'cloudID invalid or expired');
      const openGId = data.opengid;
      // CTO ruling: chat_type may be absent from the real payload; when present it must be 3 or 4. A single-chat payload
      // (open_single_roomid, no opengid) is never a group.
      const chatOk = data.chat_type === undefined || data.chat_type === 3 || data.chat_type === 4;
      if (typeof openGId !== 'string' || !openGId || openGId.length > 128 || !chatOk) return err('NOT_GROUP');
      const groupRef = (hex8(hash32('ref:' + openGId)) + hex8(hash32(openGId + ':ref'))).slice(0, 16);
      const id = openGId + '_' + openid;
      const dk = todayKey();
      if (!db.members[id]) db.members[id] = { openGId, openid, groupRef, firstSeen: dk, lastSeen: dk };
      else db.members[id].lastSeen = dk;
      return { ok: true, groupRef };
    },

    getGroupDay(openid, e) {
      const v = V.getGroupDay(e);
      if (!v.ok) return err(v.code);
      const { groupRef, dateKey } = v.v;
      if (!groupRefValid(openid, groupRef)) return err('NOT_MEMBER');
      if (!SV.boardDayOk(dateKey, now())) return err('INVALID_INPUT');
      const set = ensureSet(dateKey) || db.sets[dateKey];
      if (!set) return err('DAILY_UNAVAILABLE');
      if (W.dayClosed(dateKey, now())) ensureFinal(set);
      const viewerDone = SV.isComplete(entryOf(dateKey, openid));
      const trend = G.buildTrend(todayKey(), (dk) => {
        if (!db.sets[dk]) return null;
        const list = completeMembers(groupRef, dk).map((m) => m.pos);
        return { mq: G.groupMq(list), n: list.length };
      });
      const rounds = [];
      const seen = new Set();
      Object.keys(db.guesses)
        .map((k) => db.guesses[k])
        .filter((g) => g.groupRef === groupRef)
        .forEach((g) => {
          if (seen.has(g.roundId) || !db.rounds[g.roundId]) return;
          seen.add(g.roundId);
          const r = db.rounds[g.roundId];
          rounds.push({ roundId: r._id, left: r.left, right: r.right, clue: U.publicClueText(r), status: r.status, mq: r.status === 'revealed' ? r.mq : null, guesses: r.guessCount, createdAt: r.createdAt });
        });
      rounds.sort((a, b) => b.createdAt - a.createdAt);
      const top = rounds.slice(0, CONFIG.group.roundsListCap).map((r) => ({ roundId: r.roundId, left: r.left, right: r.right, clue: r.clue, status: r.status, mq: r.mq, guesses: r.guesses }));
      const out = SV.groupDayView({ set, hists: histsOf(dateKey), members: completeMembers(groupRef, dateKey), viewerOpenid: openid, viewerDone, hashFn: hashRow, trend, rounds: top, nowMs: now() });
      return out;
    },

    getFriendBoard(openid, e) {
      const v = V.getFriendBoard(e);
      if (!v.ok) return err(v.code);
      const { dateKey } = v.v;
      if (!SV.boardDayOk(dateKey, now())) return err('INVALID_INPUT');
      const set = ensureSet(dateKey) || db.sets[dateKey];
      if (!set) return err('DAILY_UNAVAILABLE');
      if (W.dayClosed(dateKey, now())) ensureFinal(set);
      const entries = Object.keys(db.entries)
        .map((k) => db.entries[k])
        .filter((x) => x.dateKey === dateKey && SV.isComplete(x))
        .map((x) => ({ key: x.openid, pos: x.pos, completeAt: x.completeAt, streak: x.streak }));
      const viewerDone = SV.isComplete(entryOf(dateKey, openid));
      return SV.friendBoardView({ set, hists: histsOf(dateKey), entries, viewerOpenid: openid, viewerDone, hashFn: hashRow, nowMs: now() });
    },

    createRound(openid, e) {
      const v = V.createRound(e);
      if (!v.ok) return err(v.code);
      const sp = content.spectrumById[v.v.spectrumId];
      if (!sp) return err('INVALID_INPUT', 'unknown spectrum');
      if (!rateTake(openid, 'createRound', CONFIG.limits.createRoundPerDay)) return err('RATE_LIMITED');
      let id = '';
      const r = mulberry32(hash32('round:' + now() + ':' + ++idCounter + ':' + random()));
      for (let i = 0; i < 8; i++) id += B32[Math.floor(r() * 32)];
      const target = R.drawTarget(random());
      const salt = [0, 1].map((i) => hex8(hash32('roundSalt:' + id + ':' + i))).join('');
      db.rounds[id] = SV.newRound({ roundId: id, hostOpenid: openid, spectrum: sp, target, salt, nowMs: now(), contentVersion: content.contentVersion });
      // D-2: the host's typed-clue state (the clue step); a pending strike warning is read once
      const fl = U.flags(srv.appConfig);
      const pv = U.playerView(db.players[openid] || null, now());
      if (pv.warnPending) db.players[openid] = { ...db.players[openid], warnPending: false, updatedAt: now() };
      const ugc = {
        createEnabled: fl.createEnabled,
        rulesVersion: pv.rulesVersion,
        rulesRequiredVersion: CONFIG.ugc.rulesVersion,
        rulesAgreed: pv.rulesAgreed,
        restriction: pv.restriction ? { until: pv.restriction.until, permanent: pv.restriction.permanent } : null,
        warnPending: pv.warnPending,
      };
      return { ok: true, roundId: id, target, left: sp.left, right: sp.right, ugc };
    },

    setClue(openid, e) {
      const v = V.setClue(e);
      if (!v.ok) return err(v.code);
      let round = db.rounds[v.v.roundId];
      if (round) round = lazyRound(round);
      if (!round) return err('ROUND_NOT_FOUND');
      if (v.v.clueMode === 'preset') {
        const res = SV.applyClue(round, round.hostOpenid === openid, { ...v.v, nowMs: now() }, content);
        if (!res.ok) return err(res.code);
        db.rounds[round._id] = res.round;
        return { ok: true, status: 'open', clueMode: 'preset', clueText: res.round.clueText };
      }
      // text: the same pipeline as cloudfunctions/setClue, with the mock words standing in for WeChat (dev only)
      const fl = U.flags(srv.appConfig);
      const gate = U.textGate({ round, isHost: round.hostOpenid === openid, rawText: v.v.clueText, fl, player: db.players[openid] || null, nowMs: now() });
      if (!gate.ok) {
        const { ok, code, ...extra } = gate;
        return err(code, code, extra);
      }
      if (gate.same) return { ok: true, status: 'open', clueMode: 'text', clueText: round.clueText };
      const take = U.takeCheck(db.players[openid] || null, todayKey());
      if (!take.ok) return err('RATE_LIMITED', 'rate limited', { scope: 'day' });
      db.players[openid] = { ...(db.players[openid] || U.newPlayerStats(openid, now())), clueChecks: take.clueChecks, updatedAt: now() };
      const api = fl.textApi;
      const r = srv.moderate ? srv.moderate(gate.text) : MOD.mockText(gate.text); // srv.moderate: test hook {suggest}|{error:true}
      const plan = r.error ? { outcome: 'busy' } : MOD.planOutcome(api, r.suggest);
      const result = plan.outcome === 'busy' ? 'busy' : r.suggest;
      db.modLog.push({ roundId: round._id, openid, kind: 'clue', api: 'mock', result, ...(result === 'pass' ? {} : { text: gate.text }), ts: now() });
      db.events.push({ openid: 'server', sessionId: null, name: 'clue_check', props: { api: 'mock', suggest: plan.outcome === 'busy' ? 'none' : r.suggest, latencyMs: 0 }, clientTs: null, ts: now() });
      if (plan.outcome === 'busy') return err('MODERATION_BUSY');
      if (plan.outcome === 'blocked') {
        if (plan.strike) {
          const sr = STK.applyStrike(db.players[openid], now());
          db.players[openid] = sr.player;
          db.events.push({ openid: 'server', sessionId: null, name: 'strike', props: { cause: 'risky', strikes30d: sr.count }, clientTs: null, ts: now() });
          if (sr.restrictMs > 0) db.events.push({ openid: 'server', sessionId: null, name: 'restrict', props: { cause: 'risky', strikes30d: sr.count, days: Math.round(sr.restrictMs / 86400e3) }, clientTs: null, ts: now() });
        }
        return err('TEXT_BLOCKED');
      }
      db.rounds[round._id] = U.applyTextClue(round, gate.text, { api: 'mock', suggest: 'pass', label: 100, traceId: 'mock-' + hex8(hash32(round._id + ':' + now())) }, now());
      return { ok: true, status: 'open', clueMode: 'text', clueText: gate.text };
    },

    agreeRules(openid, e) {
      const v = V.agreeRules(e);
      if (!v.ok) return err(v.code);
      const r = U.agreeRules(db.players[openid] || null, openid, now());
      db.players[openid] = r.player;
      return { ok: true, rulesVersion: v.v.rulesVersion, changed: r.changed };
    },

    reportClue(openid, e) {
      const v = V.reportClue(e);
      if (!v.ok) return err(v.code);
      let round = db.rounds[v.v.roundId];
      if (round) round = lazyRound(round);
      const fl = U.flags(srv.appConfig);
      const gate = U.reportGate(round, openid, fl);
      if (!gate.ok) return err(gate.code);
      const rid = round._id + '_' + openid;
      if (db.clueReports[rid]) return err('DUP_REPORT');
      if (!rateTake(openid, 'clueReport', CONFIG.limits.clueReportsPerDay)) return err('REPORT_LIMIT', 'REPORT_LIMIT', { scope: 'day' });
      db.clueReports[rid] = { _id: rid, roundId: round._id, openid, reason: v.v.reason, state: 'open', ts: now() };
      if (!gate.alreadyHidden) db.rounds[round._id] = U.hideClue(round, 'report', now());
      return { ok: true, hidden: true };
    },

    getRound(openid, e) {
      const v = V.getRound(e);
      if (!v.ok) return err(v.code);
      let round = db.rounds[v.v.roundId];
      if (round) round = lazyRound(round);
      if (!round) return err('ROUND_NOT_FOUND');
      const g = db.guesses[round._id + '_' + openid] || null;
      // L4 parity with cloudfunctions/getRound: the answer of a revealed round is served by default only to the host, to a
      // player who has guessed and once guessing is closed; anyone else gets it by asking (showAnswer), which is recorded
      let withhold = false;
      if (round.status === 'revealed') {
        const vid = round._id + '_' + openid;
        let served = R.revealServedByDefault(round, { isHost: round.hostOpenid === openid, hasGuess: !!g, nowMs: now() });
        if (!served && v.v.showAnswer) {
          if (!db.revealViews[vid]) db.revealViews[vid] = { _id: vid, roundId: round._id, openid, ts: now() };
          served = true;
        }
        withhold = !served && !db.revealViews[vid];
      }
      // D-2 parity with cloudfunctions/getRound: the typed clue as this viewer may see it, their report state, rules, restriction, warning
      const player = db.players[openid] || null;
      const strikeNotice = round.hostOpenid === openid && !!(player && player.warnPending === true);
      const ugc = { flags: U.flags(srv.appConfig), player, hasReport: !!db.clueReports[round._id + '_' + openid], strikeNotice };
      const out = SV.roundView({ round, viewerOpenid: openid, myGuess: g, guesses: withhold ? [] : guessesOf(round._id), hashFn: hashRow, nowMs: now(), withhold, ugc });
      if (out.ok && strikeNotice) db.players[openid] = { ...player, warnPending: false, updatedAt: now() };
      return out.ok ? out : err(out.code);
    },

    submitGuess(openid, e) {
      const v = V.submitGuess(e);
      if (!v.ok) return err(v.code);
      let round = db.rounds[v.v.roundId];
      if (round) round = lazyRound(round);
      if (!round) return err('ROUND_NOT_FOUND');
      const gid = round._id + '_' + openid;
      const chk = R.guessCheck(round, { isHost: round.hostOpenid === openid, hasGuessed: !!db.guesses[gid], pos: v.v.pos, nowMs: now() });
      if (!chk.ok) return err(chk.code);
      if (round.status === 'revealed' && db.revealViews[gid]) return err('ROUND_EXPIRED'); // L4: already served the answer
      const useRef = v.v.groupRef && groupRefValid(openid, v.v.groupRef) ? v.v.groupRef : null;
      db.guesses[gid] = { _id: gid, roundId: round._id, openid, pos: v.v.pos, ts: now(), late: chk.late, groupRef: useRef };
      let next = { ...round, groupRefs: R.appendGroupRef(round.groupRefs, useRef) };
      if (!chk.late) next.guessCount = round.guessCount + 1;
      db.rounds[round._id] = next;
      if (!chk.late && R.revealsOnGuess(next.guessCount)) next = doReveal(next, 'count');
      const out = { ok: true, late: chk.late, guessCount: next.guessCount, revealed: next.status === 'revealed' };
      if (next.status === 'revealed') out.reveal = SV.revealOf(next, { viewerOpenid: openid, guesses: guessesOf(round._id), hashFn: hashRow });
      return out;
    },

    revealRound(openid, e) {
      const v = V.revealRound(e);
      if (!v.ok) return err(v.code);
      let round = db.rounds[v.v.roundId];
      if (round) round = lazyRound(round);
      if (!round) return err('ROUND_NOT_FOUND');
      const chk = R.hostRevealCheck(round, { isHost: round.hostOpenid === openid });
      if (!chk.ok) return err(chk.code);
      const next = chk.already ? round : doReveal(round, 'host');
      return { ok: true, reveal: SV.revealOf(next, { viewerOpenid: openid, guesses: guessesOf(next._id), hashFn: hashRow }) };
    },

    subscribeRound(openid, e) {
      const v = V.subscribeRound(e);
      if (!v.ok) return err(v.code);
      const feat = features();
      if (!feat.subscribe) return err('NO_TEMPLATE');
      let round = db.rounds[v.v.roundId];
      if (round) round = lazyRound(round);
      if (!round || round.status === 'draft') return err('ROUND_NOT_FOUND');
      if (round.hostOpenid !== openid && !db.guesses[round._id + '_' + openid]) return err('FORBIDDEN');
      if (round.status !== 'open') return { ok: true, granted: false }; // already revealed / over: nothing left to notify
      const id = round._id + '_' + openid;
      if (!db.grants[id]) db.grants[id] = { _id: id, roundId: round._id, openid, tmplId: feat.subscribe.tmplId, grantedAt: now(), used: false };
      return { ok: true, granted: true };
    },

    reportCard(openid, e) {
      const v = V.reportCard(e);
      if (!v.ok) return err(v.code);
      if (!content.itemIndex[v.v.itemId]) return err('INVALID_INPUT');
      if (!rateTake(openid, 'report', CONFIG.limits.reportPerDay)) return err('RATE_LIMITED');
      db.reports.push({ openid, dateKey: v.v.dateKey, itemId: v.v.itemId, reason: v.v.reason, ts: now() });
      return { ok: true };
    },

    track(openid, e) {
      const v = V.track(e);
      if (!v.ok) return err(v.code);
      let accepted = 0;
      v.v.events.forEach((ev) => {
        if (!ev || typeof ev.name !== 'string') return;
        // parity with cloudfunctions/track (L2, AC 95): client events only, props reduced to the per-event allowlist (so a typed clue can never be stored)
        if (EV.CLIENT_EVENT_NAMES.indexOf(ev.name) < 0) return;
        db.events.push({ openid, sessionId: v.v.sessionId, name: ev.name, props: EV.sanitizeProps(ev.name, ev.props), clientTs: ev.clientTs || null, ts: now() });
        accepted++;
      });
      return { ok: true, accepted };
    },
  };

  // ---- admin (console only; not client-callable; spec 11.7) -----------------------------------------------------------------
  // The same ops as cloudfunctions/admin over the in-memory collections. srv.callAs(null, 'admin', {op, ...}) is the console
  // (no OPENID); an openid must be listed in srv.adminOpenids, else FORBIDDEN. Every op writes an audit row.

  const adminAudit = (op, target, before, after, by) => db.audit.push({ op, target, before: before === undefined ? null : before, after: after === undefined ? null : after, by, ts: now() });
  const hiddenOf = (r) => ({ hidden: r.clueHidden === true, by: r.clueHiddenBy || null });
  const clueSummary = (r) => ({ mode: r.clueMode || null, text: typeof r.clueText === 'string' ? r.clueText : null, hidden: r.clueHidden === true, hiddenBy: r.clueHiddenBy || null, hiddenAt: r.clueHiddenAt || null, mod: r.clueMod || null });
  const reportsOfRound = (id) => Object.keys(db.clueReports).map((k) => db.clueReports[k]).filter((r) => r.roundId === id);
  const adminRound = (d) => {
    if (typeof d.roundId !== 'string' || !ROUND_ID_RE.test(d.roundId)) return { bad: err('INVALID_INPUT') };
    const r = db.rounds[d.roundId];
    return r ? { round: r } : { bad: err('ROUND_NOT_FOUND') };
  };
  const adminOps = {
    listReports(d) {
      const state = ['open', 'upheld', 'dismissed'].indexOf(d.state) >= 0 ? d.state : 'open';
      const limit = d.limit === undefined ? 20 : d.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) return err('INVALID_INPUT');
      const rows = Object.keys(db.clueReports).map((k) => db.clueReports[k]).filter((r) => r.state === state).sort((a, b) => a.ts - b.ts).slice(0, limit);
      return { ok: true, items: rows.map((r) => ({ roundId: r.roundId, state: r.state, reason: r.reason, ts: r.ts, ageMs: now() - r.ts, clue: db.rounds[r.roundId] ? clueSummary(db.rounds[r.roundId]) : null })) };
    },
    getRound(d) {
      const x = adminRound(d);
      if (x.bad) return x.bad;
      const r = x.round;
      const host = db.players[r.hostOpenid] || null;
      return {
        ok: true,
        round: {
          roundId: r._id, status: r.status, left: r.left, right: r.right, createdAt: r.createdAt, guessCount: r.guessCount, hostOpenid: r.hostOpenid, clue: clueSummary(r),
          reports: reportsOfRound(r._id).map((q) => ({ reason: q.reason, state: q.state, ts: q.ts, resolvedAt: q.resolvedAt || null })),
          host: host ? { strikes30d: STK.activeStrikes(host.strikes, now()).length, restriction: STK.restrictionOf(host, now()), reviewFlag: host.reviewFlag === true } : null,
          modLog: db.modLog.filter((l) => l.roundId === r._id).map((l) => ({ api: l.api, result: l.result, text: l.text === undefined ? null : l.text, ts: l.ts })),
        },
      };
    },
    sample(d) {
      const n = d.n === undefined ? 20 : d.n;
      if (!Number.isInteger(n) || n < 1 || n > 50) return err('INVALID_INPUT');
      const pool = Object.keys(db.rounds).map((k) => db.rounds[k]).filter((r) => r.clueMode === 'text' && r.clueHidden !== true && typeof r.clueText === 'string' && r.clueMod && r.clueMod.ts >= now() - CONFIG.ugc.sampleWindowMs);
      return { ok: true, items: pool.slice(0, n).map((r) => ({ roundId: r._id, left: r.left, right: r.right, text: r.clueText, ts: r.clueMod.ts })), pool: pool.length };
    },
    upholdReport(d, by) {
      const x = adminRound(d);
      if (x.bad) return x.bad;
      const r = x.round;
      const reps = reportsOfRound(r._id);
      if (!reps.length || r.clueMode !== 'text') return err('INVALID_INPUT');
      if (r.clueUpheld === true) return { ok: true, already: true };
      const before = hiddenOf(r);
      db.rounds[r._id] = { ...r, clueHidden: true, clueHiddenAt: r.clueHiddenAt || now(), clueHiddenBy: r.clueHiddenBy || 'admin', clueUpheld: true };
      reps.forEach((q) => Object.assign(q, { state: 'upheld', resolvedAt: now() }));
      const sr = STK.applyStrike(db.players[r.hostOpenid] || U.newPlayerStats(r.hostOpenid, now()), now());
      db.players[r.hostOpenid] = sr.player;
      db.events.push({ openid: 'server', sessionId: null, name: 'strike', props: { cause: 'upheld', strikes30d: sr.count }, clientTs: null, ts: now() });
      adminAudit('upholdReport', r._id, { clue: before }, { clue: { hidden: true }, reports: reps.length, strikes30d: sr.count, restrictedUntil: sr.restrictedUntil || 0 }, by);
      return { ok: true, strikes30d: sr.count, restrictedUntil: sr.restrictedUntil || 0, flagged: sr.flagged, reports: reps.length };
    },
    dismissReport(d, by) {
      const x = adminRound(d);
      if (x.bad) return x.bad;
      if (d.restore !== undefined && typeof d.restore !== 'boolean') return err('INVALID_INPUT');
      const r = x.round;
      const reps = reportsOfRound(r._id);
      reps.forEach((q) => Object.assign(q, { state: 'dismissed', resolvedAt: now() }));
      let restored = false;
      if (d.restore === true && r.clueHidden === true) {
        const u = U.restoreClue(r);
        if (u.ok) {
          db.rounds[r._id] = u.round;
          restored = true;
        }
      }
      adminAudit('dismissReport', r._id, { clue: hiddenOf(r) }, { reports: reps.length, restore: d.restore === true, restored }, by);
      return { ok: true, restored, reports: reps.length };
    },
    hideClue(d, by) {
      const x = adminRound(d);
      if (x.bad) return x.bad;
      if (x.round.clueMode !== 'text') return err('INVALID_INPUT');
      const changed = x.round.clueHidden !== true;
      if (changed) db.rounds[x.round._id] = U.hideClue(x.round, 'admin', now());
      adminAudit('hideClue', x.round._id, { clue: hiddenOf(x.round) }, { clue: { hidden: true } }, by);
      return { ok: true, changed };
    },
    restoreClue(d, by) {
      const x = adminRound(d);
      if (x.bad) return x.bad;
      if (x.round.clueMode !== 'text') return err('INVALID_INPUT');
      const u = U.restoreClue(x.round);
      if (u.ok) db.rounds[x.round._id] = u.round;
      adminAudit('restoreClue', x.round._id, { clue: hiddenOf(x.round) }, { restored: u.ok, why: u.ok ? null : 'deleted' }, by);
      return { ok: true, restored: u.ok, reason: u.ok ? null : 'deleted' };
    },
    deleteClue(d, by) {
      const x = adminRound(d);
      if (x.bad) return x.bad;
      if (x.round.clueMode !== 'text') return err('INVALID_INPUT');
      db.rounds[x.round._id] = U.deleteClue(x.round, now());
      adminAudit('deleteClue', x.round._id, { clue: { ...hiddenOf(x.round), hadText: typeof x.round.clueText === 'string' } }, { clue: { hidden: true, hadText: false } }, by);
      return { ok: true, deleted: true };
    },
    restrict(d, by) {
      if (typeof d.openid !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(d.openid) || !db.players[d.openid]) return err('INVALID_INPUT');
      const permanent = d.permanent === true;
      if (!permanent && !(Number.isInteger(d.days) && d.days >= 1 && d.days <= 3650)) return err('INVALID_INPUT');
      db.players[d.openid] = STK.restrict(db.players[d.openid], permanent ? { permanent: true } : { days: d.days }, now());
      const p = db.players[d.openid];
      adminAudit('restrict', d.openid, null, { restrictedUntil: p.restrictedUntil, permanent: !!p.restrictPermanent }, by);
      return { ok: true, restrictedUntil: p.restrictedUntil, permanent: !!p.restrictPermanent };
    },
    liftRestriction(d, by) {
      if (typeof d.openid !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(d.openid) || !db.players[d.openid]) return err('INVALID_INPUT');
      const p = db.players[d.openid];
      adminAudit('liftRestriction', d.openid, { restrictedUntil: p.restrictedUntil || 0, permanent: !!p.restrictPermanent }, { restrictedUntil: 0, permanent: false }, by);
      db.players[d.openid] = STK.liftRestriction(p, now());
      return { ok: true, lifted: true };
    },
    setUgc(d, by) {
      const set = {};
      for (const k of ['createEnabled', 'viewEnabled']) {
        if (d[k] === undefined) continue;
        if (typeof d[k] !== 'boolean') return err('INVALID_INPUT');
        set[k] = d[k];
      }
      if (!Object.keys(set).length) return err('INVALID_INPUT');
      const before = srv.appConfig && srv.appConfig.ugc ? { ...srv.appConfig.ugc } : null;
      srv.appConfig = { ...(srv.appConfig || {}), ugc: { createEnabled: true, viewEnabled: true, ...((srv.appConfig && srv.appConfig.ugc) || {}), ...set } };
      adminAudit('setUgc', 'app_config/live', before, srv.appConfig.ugc, by);
      db.events.push({ openid: 'server', sessionId: null, name: 'ugc_pause', props: { createEnabled: srv.appConfig.ugc.createEnabled !== false, viewEnabled: srv.appConfig.ugc.viewEnabled !== false }, clientTs: null, ts: now() });
      return { ok: true, ugc: srv.appConfig.ugc };
    },
    setModeration(d, by) {
      if (d.textApi !== 'game' && d.textApi !== 'general') return err('INVALID_INPUT');
      const before = srv.appConfig && srv.appConfig.moderation ? { ...srv.appConfig.moderation } : null;
      srv.appConfig = { ...(srv.appConfig || {}), moderation: { ...((srv.appConfig && srv.appConfig.moderation) || {}), textApi: d.textApi } };
      adminAudit('setModeration', 'app_config/live', before, srv.appConfig.moderation, by);
      return { ok: true, moderation: srv.appConfig.moderation };
    },
  };
  srv.adminOpenids = opts.adminOpenids || [];
  fns.admin = function admin(openid, e) {
    if (openid && openid !== 'console' && srv.adminOpenids.indexOf(openid) < 0) return err('FORBIDDEN');
    const d = e && typeof e === 'object' && !Array.isArray(e) ? e : {};
    if (typeof d.op !== 'string' || !Object.prototype.hasOwnProperty.call(adminOps, d.op)) return err('INVALID_INPUT');
    const out = adminOps[d.op](d, openid ? 'console/' + openid : 'console');
    return out.ok ? { op: d.op, ...out } : out;
  };

  // ---- timers -------------------------------------------------------------------------------------------------------

  const timers = {
    genDaily() {
      const dk = addDays(todayKey(), 1);
      if (db.sets[dk]) return { ok: true, dateKey: dk, created: false };
      const s = createSet(dk);
      return s ? { ok: true, dateKey: dk, created: true, source: s.source } : err('DAILY_UNAVAILABLE');
    },
    finalizeDay() {
      const out = [];
      Object.keys(db.sets).forEach((k) => {
        const set = db.sets[k];
        if (!W.dayClosed(k, now()) || set.finalizedAt) return;
        ensureFinal(set);
        const complete = Object.keys(db.entries).map((x) => db.entries[x]).filter((x) => x.dateKey === k && SV.isComplete(x)).map((x) => x.pos);
        Object.assign(set, SV.finalAggregate(set.final, complete), { finalizedAt: now() });
        out.push(k);
      });
      return { ok: true, finalized: out };
    },
    sweepRounds() {
      let changed = 0;
      Object.keys(db.rounds).forEach((id) => {
        const r = db.rounds[id];
        const before = r.status;
        const after = lazyRound(r);
        if (!after || after.status !== before) changed++;
      });
      // D-2 alert-only watchdogs (as cloudfunctions/sweepRounds): reports open > 48 h, a high busy rate of the last hour's text checks
      const stale = Object.keys(db.clueReports).filter((k) => db.clueReports[k].state === 'open' && db.clueReports[k].ts < now() - CONFIG.ugc.staleReportAlertMs).length;
      const win = db.modLog.filter((l) => l.ts >= now() - CONFIG.ugc.busyAlert.windowMs);
      const busy = MOD.busyAlert({ total: win.length, busy: win.filter((l) => l.result === 'busy').length });
      return { ok: true, changed, alerts: { staleReports: stale, busy } };
    },
    cleanup() {
      // retention (spec 13): rounds (with their typed clue text), guesses, reveal views, clue reports, mod_log and audit_log at 180 days
      const cutoff = now() - CONFIG.retentionDays * 86400e3;
      const removed = { rounds: 0, guesses: 0, reveal_views: 0, clue_reports: 0, mod_log: 0, audit_log: 0 };
      Object.keys(db.rounds).forEach((k) => {
        if (db.rounds[k].createdAt < cutoff) {
          delete db.rounds[k];
          removed.rounds++;
        }
      });
      Object.keys(db.guesses).forEach((k) => {
        if (db.guesses[k].ts < cutoff) {
          delete db.guesses[k];
          removed.guesses++;
        }
      });
      Object.keys(db.revealViews).forEach((k) => {
        if (db.revealViews[k].ts < cutoff) {
          delete db.revealViews[k];
          removed.reveal_views++;
        }
      });
      Object.keys(db.clueReports).forEach((k) => {
        if (db.clueReports[k].ts < cutoff) {
          delete db.clueReports[k];
          removed.clue_reports++;
        }
      });
      const keep = (list, name) => {
        const before = list.length;
        const kept = list.filter((x) => x.ts >= cutoff);
        list.length = 0;
        kept.forEach((x) => list.push(x));
        removed[name] = before - kept.length;
      };
      keep(db.modLog, 'mod_log');
      keep(db.audit, 'audit_log');
      return { ok: true, removed };
    },
  };

  /** Run as `openid` (default ME). Responses are JSON-cloned like a network boundary. */
  srv.callAs = function callAs(openid, name, data) {
    srv.calls.push({ openid, name, data });
    if (srv.offline) return { ok: false, code: 'NETWORK', message: 'offline' };
    if (TIMERS.indexOf(name) >= 0) return err('FORBIDDEN', 'server-only function');
    if (!fns[name]) return err('INVALID_INPUT', 'unknown function ' + name);
    // M3 parity with store.handler: per-openid fixed-window (1 minute) limit on every client-callable function
    const limit = CONFIG.limits.perMinute[name];
    if (srv.rateLimits && limit && openid) {
      const k = name + '_' + openid + '_' + Math.floor(now() / 60000);
      db.minute[k] = (db.minute[k] || 0) + 1;
      if (db.minute[k] > limit) return err('RATE_LIMITED', 'rate limited', { scope: 'minute' });
    }
    try {
      return clone(fns[name](openid, data === undefined ? {} : clone(data)));
    } catch (e) {
      return err('INTERNAL', String(e && e.message));
    }
  };
  srv.call = (name, data) => srv.callAs(ME, name, data);
  srv.runTimer = (name) => clone(timers[name]());
  srv.ME = ME;
  /** a synthetic cloudID for joinGroup({cloudID}); chatType null omits chat_type (allowed, M1); srv.cloudData(obj) encodes any payload */
  srv.cloudID = (groupId, chatType) => encodeMockCloudID(groupId, chatType);
  srv.cloudData = (data) => encodeMockCloudData(data);
  /** per-minute limiter on/off (M3); tests that hammer one function in one fake minute switch it off */
  srv.rateLimits = opts.rateLimits === true; // off by default (dev play and most tests hammer one function); parity tests switch it on
  srv.NAMES = CLIENT_FUNCTIONS;

  /** Dev helper: add `n` synthetic answers to a card's histogram (normal-ish around `mean`). */
  srv.seedCrowd = function seedCrowd(dateKey, idx, n, o) {
    ensureSet(dateKey);
    const st = db.stats[dateKey + '_' + idx];
    const r = mulberry32(hash32('crowd:' + dateKey + ':' + idx));
    const mean = (o && o.mean) || db.sets[dateKey].cards[idx].anchor;
    const sd = (o && o.sd) || 14;
    for (let i = 0; i < n; i++) {
      const g = (r() + r() + r() + r() - 2) * sd * 1.7;
      const p = Math.max(0, Math.min(100, Math.round(mean + g)));
      st.hist[p] += 1;
      st.n += 1;
    }
  };

  return srv;
}

module.exports = { createMockServer, CLIENT_FUNCTIONS, TIMERS, ME, encodeMockCloudID, encodeMockCloudData, decodeMockCloudID };
