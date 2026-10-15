/**
 * In-memory stand-in for the cloud functions (spec 11), so the whole game runs before the backend and an
 * AppID exist, and so tests can play several users. It uses the same core/ code the real functions use and
 * follows the same contracts: the server draws round targets, the client never gets an anchor, a histogram
 * or a reference for a card it has not answered, raw openids never leave this file, one answer per card.
 *
 * NOT a security boundary. Real mode (js/api.js) calls wx.cloud.callFunction.
 *
 *   const srv = createMockServer({ now, launchDateKey, population, seed, boardListCap })
 *   srv.call(name, data, { openid })    -> result  (name: any function of spec 11.2; the timer functions
 *                                          genDaily / finalizeDay / sweepRounds / cleanup reject an OPENID with FORBIDDEN)
 *   srv.db, srv.offline, srv.fail       -> test hooks (srv.fail[name] = { code, times })
 */

const { hash32, sub, mulberry32 } = require('../core/rng');
const S = require('../core/score');
const { getContent } = require('../core/content');
const { getConfig, LATEST_CONFIG_VERSION, normalizeFeatures } = require('../core/config');
const { pickAutoDaily } = require('../core/schedule');
const schedule = require('../core/content/schedule.v1.js');
const D = require('../core/date');

const ME = 'mock-openid-me';
const TIMER_FUNCTIONS = ['genDaily', 'finalizeDay', 'sweepRounds', 'cleanup'];
const B32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function err(code, message) {
  return { ok: false, code, message: message || code };
}

function hex8(n) {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/** sha256-like short hash for rows (spec 8.3): 12 hex chars, per-salt. */
function rowHash(openid, salt) {
  return (hex8(hash32(openid + '|' + salt)) + hex8(hash32(salt + '|' + openid))).slice(0, 12);
}

function clone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

function createMockServer(opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now());
  const content = getContent(1);
  const config = getConfig(LATEST_CONFIG_VERSION);
  const seed = opts.seed || 'mock';
  const population = opts.population || 0;
  const boardListCap = opts.boardListCap || config.boardListCap;
  let counter = 0;

  const db = {
    meta: { launch: opts.launchDateKey || null },
    sets: {},
    stats: {},
    entries: {},
    players: {},
    members: {},
    groupDaily: {},
    rounds: {},
    guesses: {},
    subs: {},
    sentMessages: [],
    reports: [],
    usage: {},
    anomalies: [],
    events: [],
    rate: {},
    unlocks: {},
    appConfig: { subscribe: null, banner: null, interstitial: null },
  };
  const srv = { db, calls: [], offline: false, fail: {} };

  // ------------------------------------------------------------------ helpers

  const todayKey = () => D.beijingDateKey(now());
  const closedAt = (dk) => D.dateKeyToMs(dk) + D.DAY_MS + config.daily.graceMs;
  const isClosed = (dk) => now() >= closedAt(dk);
  const rate = (fn, openid, limit) => {
    const k = fn + '_' + openid + '_' + todayKey();
    db.rate[k] = (db.rate[k] || 0) + 1;
    return db.rate[k] <= limit;
  };
  const groupRefOf = (openGId) => hex8(hash32('pepper:' + openGId)) + hex8(hash32(openGId + ':pepper'));

  function launchKey() {
    if (!db.meta.launch) db.meta.launch = todayKey();
    return db.meta.launch;
  }

  function newStats(dk, i) {
    const k = dk + '_' + i;
    if (!db.stats[k]) db.stats[k] = { hist: S.newHist(), n: 0 };
    return db.stats[k];
  }

  /** Create the day's set (idempotent by dateKey). Mirrors genDaily + the lazy path of getDaily. */
  function ensureSet(dk) {
    if (db.sets[dk]) return db.sets[dk];
    const launch = launchKey();
    const idx = D.daysBetween(launch, dk);
    let ids = idx >= 0 && idx < schedule.days.length ? schedule.days[idx] : null;
    let source = 'schedule';
    if (!ids) {
      const used = new Set(Object.keys(db.usage));
      const recent = new Set();
      for (let k = 1; k <= 20; k++) {
        const prev = db.sets[D.addDays(dk, -k)];
        if (prev) prev.cards.forEach((c) => recent.add(c.spectrumId));
      }
      ids = pickAutoDaily(content, dk, used, recent);
      source = 'auto';
      if (!ids) return null;
    }
    ids.forEach((id) => (db.usage[id] = dk));
    const rng = sub(seed, 'salt:' + dk);
    const set = {
      dateKey: dk,
      issueNo: D.issueNo(dk, launch),
      contentVersion: content.contentVersion,
      cards: ids.map((id) => {
        const it = content.itemById[id];
        return { itemId: id, spectrumId: it.spectrumId, left: it.left, right: it.right, prompt: it.text, anchor: it.anchor, cat: it.cat };
      }),
      boardSalt: hex8(Math.floor(rng() * 4294967296)) + hex8(Math.floor(rng() * 4294967296)),
      source,
      edits: [],
      final: null,
      finalHist: null,
      finalCount: null,
      finalTotals: null,
      finalizedAt: null,
    };
    db.sets[dk] = set;
    for (let i = 0; i < 5; i++) newStats(dk, i);
    seedPopulation(set);
    return set;
  }

  function normal(rng) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /** Synthetic complete dailies (offline demo and archive percentiles). They are ordinary entries. */
  function seedPopulation(set) {
    for (let k = 0; k < population; k++) {
      const openid = 'syn-' + set.dateKey + '-' + k;
      const rng = sub(seed + ':pop', set.dateKey + ':' + k);
      const pos = set.cards.map((c) => Math.max(0, Math.min(100, Math.round(c.anchor + normal(rng) * 16))));
      const firstAt = D.dateKeyToMs(set.dateKey) + (3600 + ((k * 977) % 70000)) * 1000;
      db.entries[set.dateKey + '_' + openid] = { openid, dateKey: set.dateKey, pos, answeredAt: pos.map((_, i) => firstAt + i * 9000), firstAt, completeAt: firstAt + 45000, streak: 1 };
      pos.forEach((p, i) => {
        const st = newStats(set.dateKey, i);
        st.hist[p]++;
        st.n++;
      });
    }
  }

  function histOf(dk, i) {
    return newStats(dk, i).hist;
  }

  function ensureFinal(dk) {
    const set = db.sets[dk];
    if (!set || set.final || !isClosed(dk)) return;
    set.final = set.cards.map((c, i) => S.nationalRef(histOf(dk, i), c.anchor));
  }

  function lazyFinalizeAll() {
    Object.keys(db.sets).forEach(ensureFinal);
  }

  /** Reference now: frozen once final, else the live median with the prior. */
  function refAt(dk, i) {
    const set = db.sets[dk];
    return set.final ? set.final[i] : S.nationalRef(histOf(dk, i), set.cards[i].anchor);
  }

  function refsAll(dk) {
    return [0, 1, 2, 3, 4].map((i) => refAt(dk, i));
  }

  const entryKey = (dk, openid) => dk + '_' + openid;
  const isComplete = (e) => !!e && e.pos.every((p) => p !== null);
  const answeredCount = (e) => (e ? e.pos.filter((p) => p !== null).length : 0);

  function totalOf(dk, e) {
    return S.dayTotal(e.pos, refsAll(dk));
  }

  function latestKeyBefore(dk) {
    const keys = Object.keys(db.sets)
      .filter((k) => k < dk)
      .sort();
    return keys.length ? keys[keys.length - 1] : null;
  }

  function memberOpenids(groupRef) {
    const out = [];
    Object.keys(db.members).forEach((k) => {
      if (db.members[k].groupRef === groupRef) out.push(db.members[k].openid);
    });
    return out;
  }
  const isMember = (groupRef, openid) => !!groupRef && memberOpenids(groupRef).indexOf(openid) >= 0;

  function playerStreak(openid, dk) {
    const ps = db.players[openid];
    if (!ps) return { current: 0, best: 0 };
    const prev = latestKeyBefore(dk);
    const cur = ps.last === dk || ps.last === prev ? ps.cur : 0;
    return { current: cur, best: ps.best };
  }

  // ------------------------------------------------------------------ reveal payloads

  function groupBlock(dk, idx, openid, groupRef) {
    if (!groupRef || !isMember(groupRef, openid)) return undefined;
    const others = [];
    memberOpenids(groupRef).forEach((o) => {
      if (o === openid) return;
      const e = db.entries[entryKey(dk, o)];
      if (e && e.pos[idx] !== null) others.push(e.pos[idx]);
    });
    return { median: S.groupMedian(others), n: others.length, dots: others.slice(0, 30) };
  }

  function revealFor(dk, idx, openid, groupRef) {
    const e = db.entries[entryKey(dk, openid)];
    const pos = e.pos[idx];
    const ref = refAt(dk, idx);
    const d = Math.abs(pos - ref);
    const hist = histOf(dk, idx);
    const out = { idx, pos, ref, score: S.cardScore(d), label: S.labelFor(d).label, agreePct: S.agreePct(hist, pos), n: S.histCount(hist), complete: isComplete(e) };
    const g = groupBlock(dk, idx, openid, groupRef);
    if (g) out.group = g;
    if (out.complete) {
      out.total = totalOf(dk, e);
      out.streak = e.streak || 1;
    }
    return out;
  }

  // ------------------------------------------------------------------ functions

  const fns = {};

  fns.getDaily = function (d, ctx) {
    if (opts.failDaily) return err('DAILY_UNAVAILABLE', 'no set');
    const dk = todayKey();
    const launch = launchKey();
    // the nightly genDaily would have produced every day since launch
    for (let k = launch; k <= dk; k = D.addDays(k, 1)) ensureSet(k);
    lazyFinalizeAll();
    const set = ensureSet(dk);
    if (!set) return err('DAILY_UNAVAILABLE', 'no set');
    const e = db.entries[entryKey(dk, ctx.openid)];
    const answered = answeredCount(e);
    const refs = set.cards.map((c, i) => (e && e.pos[i] !== null ? refAt(dk, i) : null));
    const mine = { pos: e ? e.pos.slice() : [null, null, null, null, null], answered, complete: isComplete(e) };
    if (mine.complete) mine.total = totalOf(dk, e);
    mine.cardScores = e ? e.pos.map((p, i) => (p === null ? null : S.scoreAt(p, refs[i]))) : [null, null, null, null, null];
    const out = {
      ok: true,
      dateKey: dk,
      issueNo: set.issueNo,
      serverNow: now(),
      cards: set.cards.map((c) => content.cardText(c.itemId) || { itemId: c.itemId, spectrumId: c.spectrumId, left: c.left, right: c.right, prompt: c.prompt, catLabel: content.catLabel[c.cat] }),
      mine,
      refs,
      groupRefs: null,
      myStreak: playerStreak(ctx.openid, dk),
      features: normalizeFeatures(db.appConfig),
    };
    if (d.groupRef && isMember(d.groupRef, ctx.openid)) out.groupRefs = set.cards.map((c, i) => (e && e.pos[i] !== null ? groupBlock(dk, i, ctx.openid, d.groupRef).median : null));
    if (mine.complete) out.divisiveIdx = S.divisiveIdx([0, 1, 2, 3, 4].map((i) => histOf(dk, i)), refsAll(dk));
    const yk = latestKeyBefore(dk);
    const ys = yk && db.sets[yk];
    const ye = yk && db.entries[entryKey(yk, ctx.openid)];
    if (ys && ys.final && isComplete(ye)) {
      const total = S.dayTotal(ye.pos, ys.final);
      let pct = null;
      if (ys.finalizedAt) {
        const lower = ys.finalTotals.filter((t) => t < total).length;
        pct = S.percentile(ys.finalHist, total, ys.finalCount, lower);
      }
      out.yesterday = { dateKey: yk, total, pct, final: true };
    }
    return out;
  };

  fns.genDaily = function (d, ctx) {
    if (ctx.openid) return err('FORBIDDEN', 'timer only');
    const dk = D.addDays(todayKey(), 1);
    const had = !!db.sets[dk];
    const set = ensureSet(dk);
    return set ? { ok: true, dateKey: dk, created: !had } : err('DAILY_UNAVAILABLE');
  };

  fns.finalizeDay = function (d, ctx) {
    if (ctx.openid) return err('FORBIDDEN', 'timer only');
    const done = [];
    Object.keys(db.sets)
      .sort()
      .forEach((dk) => {
        const set = db.sets[dk];
        if (!isClosed(dk) || set.finalizedAt) return;
        ensureFinal(dk);
        const hist = S.newHist();
        const totals = [];
        Object.keys(db.entries).forEach((k) => {
          const e = db.entries[k];
          if (e.dateKey !== dk || !isComplete(e)) return;
          const t = S.dayTotal(e.pos, set.final);
          totals.push(t);
          hist[S.totalBin(t)]++;
        });
        set.finalHist = hist;
        set.finalCount = totals.length;
        set.finalTotals = totals;
        set.finalizedAt = now();
        done.push(dk);
      });
    return { ok: true, finalized: done };
  };

  fns.submitCard = function (d, ctx) {
    const openid = ctx.openid;
    if (typeof d.dateKey !== 'string' || !/^\d{8}$/.test(d.dateKey) || !Number.isInteger(d.idx) || d.idx < 0 || d.idx > 4) return err('INVALID_INPUT', 'dateKey/idx');
    if (!Number.isInteger(d.pos) || d.pos < 0 || d.pos > 100) return err('INVALID_INPUT', 'pos must be an integer 0-100');
    const dk = d.dateKey;
    const today = todayKey();
    if (dk > today) return err('INVALID_INPUT', 'future date');
    lazyFinalizeAll();
    let e = db.entries[entryKey(dk, openid)];
    if (dk !== today) {
      const inGrace = dk === D.addDays(today, -1) && e && e.firstAt && D.beijingDateKey(e.firstAt) === dk && now() < closedAt(dk);
      if (!inGrace) return err('LATE_SUBMIT', 'the day is over');
    }
    const set = ensureSet(dk);
    if (!set) return err('DAILY_UNAVAILABLE');
    if (e && e.pos[d.idx] !== null) {
      const r = err('CARD_DONE', 'already answered');
      r.reveal = revealFor(dk, d.idx, openid, d.groupRef);
      return r;
    }
    const first = e ? e.pos.findIndex((p) => p === null) : 0;
    if (d.idx !== first) return err('CARD_ORDER', 'next card is ' + first);
    if (!e) {
      e = { openid, dateKey: dk, pos: [null, null, null, null, null], answeredAt: [null, null, null, null, null], firstAt: now(), completeAt: null, streak: 0 };
      db.entries[entryKey(dk, openid)] = e;
    }
    e.pos[d.idx] = d.pos;
    e.answeredAt[d.idx] = now();
    const st = newStats(dk, d.idx);
    st.hist[d.pos]++;
    st.n++;
    if (isComplete(e)) {
      e.completeAt = now();
      const prev = latestKeyBefore(dk);
      const ps = db.players[openid] || { cur: 0, best: 0, last: null, total: 0 };
      if (ps.last !== dk) {
        ps.cur = ps.last && ps.last === prev ? ps.cur + 1 : 1;
        ps.best = Math.max(ps.best, ps.cur);
        ps.last = dk;
        ps.total++;
      }
      db.players[openid] = ps;
      e.streak = ps.cur;
      if (e.completeAt - e.answeredAt[0] < 6000) db.anomalies.push({ id: openid + '_' + dk + '_fast', kind: 'fast', ts: now() });
    }
    const out = revealFor(dk, d.idx, openid, d.groupRef);
    return Object.assign({ ok: true }, out);
  };

  /** The nightly genDaily would have published every day since launch. */
  function publishThroughToday() {
    const dk = todayKey();
    for (let k = launchKey(); k <= dk; k = D.addDays(k, 1)) ensureSet(k);
    lazyFinalizeAll();
  }

  function closedKeys() {
    publishThroughToday();
    return Object.keys(db.sets)
      .filter((k) => isClosed(k))
      .sort()
      .reverse();
  }

  fns.getArchive = function (d, ctx) {
    const limit = Math.max(1, Math.min(30, Number.isInteger(d.limit) ? d.limit : 30));
    let keys = closedKeys();
    if (d.before) keys = keys.filter((k) => k < d.before);
    const page = keys.slice(0, limit);
    const items = page.map((k) => {
      const e = db.entries[entryKey(k, ctx.openid)];
      const item = { dateKey: k, issueNo: db.sets[k].issueNo };
      if (isComplete(e)) item.mine = { total: S.dayTotal(e.pos, db.sets[k].final), final: true };
      return item;
    });
    const ps = db.players[ctx.openid];
    return { ok: true, items, hasMore: keys.length > limit, bestStreak: ps ? ps.best : 0 };
  };

  function bins(dk, i) {
    return S.histBins21(histOf(dk, i));
  }

  fns.getArchiveDay = function (d, ctx) {
    const dk = d.dateKey;
    if (typeof dk !== 'string' || !/^\d{8}$/.test(dk)) return err('INVALID_INPUT');
    lazyFinalizeAll();
    const set = db.sets[dk];
    if (!set || !isClosed(dk)) return err('DAY_OPEN', 'not closed yet');
    const e = db.entries[entryKey(dk, ctx.openid)];
    const out = { ok: true, dateKey: dk, issueNo: set.issueNo, cards: set.cards.map((c) => content.cardText(c.itemId)), finals: set.final.slice() };
    if (isComplete(e)) {
      const total = S.dayTotal(e.pos, set.final);
      let pct = null;
      if (set.finalizedAt) pct = S.percentile(set.finalHist, total, set.finalCount, set.finalTotals.filter((t) => t < total).length);
      out.mine = { pos: e.pos.slice(), total, pct };
    }
    if (db.unlocks[entryKey(dk, ctx.openid)]) out.hist = [0, 1, 2, 3, 4].map((i) => bins(dk, i));
    return out;
  };

  fns.getBonusCard = function (d, ctx) {
    if (!rate('bonus', ctx.openid, config.extras.bonusPerDay)) return err('RATE_LIMITED', 'bonus per day');
    const keys = closedKeys();
    const rng = sub(seed + ':bonus', ctx.openid + ':' + todayKey() + ':' + db.rate['bonus_' + ctx.openid + '_' + todayKey()]);
    const pool = [];
    keys.forEach((k) => {
      const e = db.entries[entryKey(k, ctx.openid)];
      db.sets[k].cards.forEach((c, i) => {
        if (!e || e.pos[i] === null) pool.push({ k, i });
      });
    });
    if (!pool.length) {
      db.rate['bonus_' + ctx.openid + '_' + todayKey()]--;
      return err('NO_CARD', 'nothing to play yet');
    }
    const pick = pool[Math.floor(rng() * pool.length)];
    const set = db.sets[pick.k];
    return { ok: true, card: content.cardText(set.cards[pick.i].itemId), final: set.final[pick.i], dateKey: pick.k };
  };

  fns.unlockDistribution = function (d, ctx) {
    const dk = d.dateKey;
    publishThroughToday();
    if (typeof dk !== 'string' || !db.sets[dk]) return err('INVALID_INPUT');
    if (!rate('dist', ctx.openid, config.extras.distributionPerDay)) return err('RATE_LIMITED');
    const e = db.entries[entryKey(dk, ctx.openid)];
    const open = !isClosed(dk);
    const hist = [0, 1, 2, 3, 4].map((i) => (open && !(e && e.pos[i] !== null) ? null : bins(dk, i)));
    db.unlocks[entryKey(dk, ctx.openid)] = true;
    return { ok: true, hist };
  };

  fns.joinGroup = function (d, ctx) {
    const gd = d.groupData && d.groupData.mockData ? d.groupData.mockData : d.groupData;
    if (!gd || typeof gd !== 'object') return err('BAD_CLOUDID');
    if (!gd.opengid || (gd.chat_type !== undefined && gd.chat_type !== 3)) return err('NOT_GROUP');
    const ref = groupRefOf(gd.opengid);
    const k = gd.opengid + '_' + ctx.openid;
    if (!db.members[k]) db.members[k] = { openGId: gd.opengid, openid: ctx.openid, groupRef: ref, firstSeen: now(), lastSeen: now() };
    else db.members[k].lastSeen = now();
    return { ok: true, groupRef: ref };
  };

  function groupData(groupRef, dk) {
    const set = db.sets[dk];
    const members = memberOpenids(groupRef)
      .map((o) => db.entries[entryKey(dk, o)])
      .filter(isComplete);
    const cards = [0, 1, 2, 3, 4].map((c) => members.map((m) => m.pos[c]));
    return { members, cards, set };
  }

  fns.getGroupDay = function (d, ctx) {
    const openid = ctx.openid;
    if (!isMember(d.groupRef, openid)) return err('NOT_MEMBER');
    const today = todayKey();
    if (d.dateKey !== today && d.dateKey !== D.addDays(today, -1)) return err('INVALID_INPUT', 'date');
    lazyFinalizeAll();
    const dk = d.dateKey;
    const set = ensureSet(dk);
    if (!set) return err('DAILY_UNAVAILABLE');
    const mineE = db.entries[entryKey(dk, openid)];
    const viewerDone = isComplete(mineE);
    const g = groupData(d.groupRef, dk);
    const n = g.members.length;
    const refs = refsAll(dk);
    const out = { ok: true, dateKey: dk, issueNo: set.issueNo, salt: set.boardSalt, selfHash: rowHash(openid, set.boardSalt), viewerDone, n, mq: null, divisiveIdx: null, rows: [] };
    if (viewerDone) {
      out.mq = S.groupMq(g.cards);
      out.divisiveIdx = S.divisiveIdx([0, 1, 2, 3, 4].map((i) => histOf(dk, i)), refs);
      let rows = g.members.map((m, i) => {
        const row = [rowHash(m.openid, set.boardSalt), S.groupScore(g.cards, i), S.dayTotal(m.pos, refs), Math.round((m.completeAt - D.dateKeyToMs(dk)) / 1000), m.pos.join(','), m.streak >= 2 ? m.streak : null];
        row._me = m.openid === openid;
        return row;
      });
      rows.sort((a, b) => (b[1] || 0) - (a[1] || 0) || a[3] - b[3]);
      if (rows.length > config.score.groupRowCap) {
        const me = rows.find((r) => r._me);
        rows = rows.slice(0, config.score.groupRowCap);
        if (me && rows.indexOf(me) < 0) rows.push(me);
      }
      out.rows = rows.map((r) => r.slice());
    }
    out.trend = [];
    for (let k = 6; k >= 0; k--) {
      const day = D.addDays(today, -k);
      if (!db.sets[day]) {
        out.trend.push({ dateKey: day, mq: null, n: 0 });
        continue;
      }
      const gd = groupData(d.groupRef, day);
      out.trend.push({ dateKey: day, mq: S.groupMq(gd.cards), n: gd.members.length });
    }
    const rounds = Object.keys(db.rounds)
      .map((k) => db.rounds[k])
      .filter((r) => r.groupRefs.indexOf(d.groupRef) >= 0 && r.guessCount > 0 && r.status !== 'draft')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    out.rounds = rounds.map((r) => ({ roundId: r.id, left: r.left, right: r.right, clue: r.clueText || null, status: r.status, mq: r.mq === undefined ? null : r.mq, guesses: r.guessCount }));
    return out;
  };

  fns.getFriendBoard = function (d, ctx) {
    const openid = ctx.openid;
    const dk = d.dateKey;
    lazyFinalizeAll();
    const set = db.sets[dk] || (dk === todayKey() ? ensureSet(dk) : null);
    if (!set) return err('INVALID_INPUT', 'date');
    const refs = refsAll(dk);
    const mineE = db.entries[entryKey(dk, openid)];
    const viewerDone = isComplete(mineE);
    const all = Object.keys(db.entries)
      .map((k) => db.entries[k])
      .filter((e) => e.dateKey === dk && isComplete(e));
    const mode = all.length > boardListCap ? 'selfOnly' : 'full';
    const list = mode === 'full' ? all : all.filter((e) => e.openid === openid);
    const rows = list
      .map((e) => [rowHash(e.openid, set.boardSalt), S.dayTotal(e.pos, refs), Math.round((e.completeAt - D.dateKeyToMs(dk)) / 1000), viewerDone ? e.pos.join(',') : null, e.streak >= 2 ? e.streak : null])
      .sort((a, b) => b[1] - a[1] || a[2] - b[2]);
    return { ok: true, dateKey: dk, issueNo: set.issueNo, salt: set.boardSalt, selfHash: rowHash(openid, set.boardSalt), viewerDone, mode, refs: viewerDone ? refs : null, rows };
  };

  // ---------------------------------------------------------------- rounds

  function newRoundId() {
    counter++;
    const rng = sub(seed + ':round', String(counter));
    let s = '';
    for (let i = 0; i < 8; i++) s += B32[Math.floor(rng() * 32)];
    return s;
  }

  fns.createRound = function (d, ctx) {
    const sp = content.spectrumById[d.spectrumId];
    if (!sp) return err('INVALID_INPUT', 'unknown spectrum');
    if (!rate('createRound', ctx.openid, config.rounds.perDayLimit)) return err('RATE_LIMITED');
    const id = newRoundId();
    const rng = sub(seed + ':target', id);
    const target = config.rounds.targetMin + Math.floor(rng() * (config.rounds.targetMax - config.rounds.targetMin + 1));
    db.rounds[id] = { id, hostOpenid: ctx.openid, spectrumId: sp.id, left: sp.left, right: sp.right, target, clueMode: null, clueItemId: null, clueText: null, salt: hex8(hash32(id + seed)) + hex8(hash32(seed + id)), createdAt: now(), status: 'draft', revealedAt: null, revealBy: null, guessCount: 0, mq: null, groupRefs: [], contentVersion: 1 };
    return { ok: true, roundId: id, target };
  };

  fns.setClue = function (d, ctx) {
    const r = db.rounds[d.roundId];
    if (!r) return err('ROUND_NOT_FOUND');
    if (r.hostOpenid !== ctx.openid) return err('NOT_HOST');
    if (d.clueMode !== 'preset' && d.clueMode !== 'chat') return err('INVALID_INPUT', 'clueMode');
    if (d.clueMode === 'preset') {
      const it = content.itemById[d.clueItemId];
      if (!it || it.spectrumId !== r.spectrumId) return err('INVALID_INPUT', 'clue item not of this spectrum');
      r.clueItemId = it.id;
      r.clueText = it.text;
    } else {
      r.clueItemId = null;
      r.clueText = null;
    }
    r.clueMode = d.clueMode;
    if (r.status === 'draft') r.status = 'open';
    return { ok: true };
  };

  const guessesOf = (r) =>
    Object.keys(db.guesses)
      .map((k) => db.guesses[k])
      .filter((g) => g.roundId === r.id);

  function sendMessages(r) {
    Object.keys(db.subs).forEach((k) => {
      const s = db.subs[k];
      if (s.roundId !== r.id || s.used) return;
      s.used = true;
      s.sentAt = now();
      db.sentMessages.push({ roundId: r.id, tmplId: s.tmplId, topic: r.left + '↔' + r.right, mqText: '本题默契值 ' + r.mq, page: 'r=' + r.id });
    });
  }

  function reveal(r, by) {
    if (r.status === 'revealed') return;
    const gs = guessesOf(r).filter((g) => !g.late);
    r.mq = S.roundMq(gs, r.target);
    r.status = 'revealed';
    r.revealedAt = now();
    r.revealBy = by;
    sendMessages(r);
  }

  /** Lazy 24 h auto reveal / noGuesses (also what sweepRounds does). */
  function settle(r) {
    if (r.status === 'draft' && now() > r.createdAt + config.rounds.draftMs) {
      delete db.rounds[r.id];
      return false;
    }
    if (r.status === 'open' && now() > r.createdAt + config.rounds.autoRevealMs) {
      const n = guessesOf(r).filter((g) => !g.late).length;
      if (n >= 1) reveal(r, 'timer');
      else r.status = 'noGuesses';
    }
    return true;
  }

  function revealPayload(r, openid) {
    const gs = guessesOf(r);
    const rows = gs.map((g) => [rowHash(g.openid, r.salt), g.pos, S.scoreAt(g.pos, r.target), g.late ? 1 : 0, 0]);
    rows.push([rowHash(r.hostOpenid, r.salt), null, null, 0, 1]);
    const best = S.bestGuess(gs, r.target);
    return { target: r.target, mq: r.mq, salt: r.salt, selfHash: rowHash(openid, r.salt), rows, revealBy: r.revealBy, bestHash: best ? rowHash(best.openid, r.salt) : null };
  }

  function roundView(r, openid) {
    const isHost = r.hostOpenid === openid;
    const mine = db.guesses[r.id + '_' + openid];
    const out = {
      ok: true,
      roundId: r.id,
      status: r.status,
      isHost,
      left: r.left,
      right: r.right,
      clueMode: r.clueMode,
      clueText: r.clueText || null,
      guessCount: guessesOf(r).filter((g) => !g.late).length,
      myGuess: mine ? { pos: mine.pos, late: !!mine.late } : null,
      createdAt: r.createdAt,
      expired: now() > r.createdAt + config.rounds.guessWindowMs,
    };
    if (isHost) out.target = r.target;
    if (r.status === 'revealed') Object.assign(out, revealPayload(r, openid));
    return out;
  }

  fns.getRound = function (d, ctx) {
    const r = db.rounds[d.roundId];
    if (!r) return err('ROUND_NOT_FOUND');
    if (r.status === 'draft' && r.hostOpenid !== ctx.openid) return err('ROUND_NOT_FOUND');
    if (!settle(r)) return err('ROUND_NOT_FOUND');
    return roundView(r, ctx.openid);
  };

  fns.submitGuess = function (d, ctx) {
    const r = db.rounds[d.roundId];
    if (!r || (r.status === 'draft')) return err('ROUND_NOT_FOUND');
    if (!Number.isInteger(d.pos) || d.pos < 0 || d.pos > 100) return err('INVALID_INPUT', 'pos');
    settle(r);
    if (r.hostOpenid === ctx.openid) return err('OWN_ROUND');
    if (db.guesses[r.id + '_' + ctx.openid]) return err('ALREADY_GUESSED');
    if (now() > r.createdAt + config.rounds.guessWindowMs) return err('ROUND_EXPIRED');
    const late = r.status === 'revealed' || r.status === 'noGuesses';
    db.guesses[r.id + '_' + ctx.openid] = { roundId: r.id, openid: ctx.openid, pos: d.pos, ts: now(), late, groupRef: isMember(d.groupRef, ctx.openid) ? d.groupRef : null };
    if (isMember(d.groupRef, ctx.openid) && r.groupRefs.indexOf(d.groupRef) < 0 && r.groupRefs.length < config.rounds.groupRefsCap) r.groupRefs.push(d.groupRef);
    const out = { ok: true, late };
    if (!late) {
      r.guessCount++;
      if (r.guessCount >= config.rounds.autoRevealAt) reveal(r, 'count');
    }
    out.guessCount = guessesOf(r).filter((g) => !g.late).length;
    if (r.status === 'revealed') out.reveal = revealPayload(r, ctx.openid);
    return out;
  };

  fns.revealRound = function (d, ctx) {
    const r = db.rounds[d.roundId];
    if (!r) return err('ROUND_NOT_FOUND');
    if (r.hostOpenid !== ctx.openid) return err('NOT_HOST');
    settle(r);
    if (r.status !== 'revealed') {
      if (guessesOf(r).filter((g) => !g.late).length < config.rounds.revealMinGuesses) return err('TOO_FEW_GUESSES', 'need ' + config.rounds.revealMinGuesses);
      reveal(r, 'host');
    }
    return { ok: true, reveal: revealPayload(r, ctx.openid), guessCount: guessesOf(r).filter((g) => !g.late).length };
  };

  fns.sweepRounds = function (d, ctx) {
    if (ctx.openid) return err('FORBIDDEN', 'timer only');
    Object.keys(db.rounds).forEach((k) => db.rounds[k] && settle(db.rounds[k]));
    return { ok: true };
  };

  fns.subscribeRound = function (d, ctx) {
    const tmpl = db.appConfig.subscribe && db.appConfig.subscribe.tmplId;
    if (!tmpl) return err('NO_TEMPLATE');
    const r = db.rounds[d.roundId];
    if (!r) return err('ROUND_NOT_FOUND');
    if (r.hostOpenid !== ctx.openid && !db.guesses[r.id + '_' + ctx.openid]) return err('FORBIDDEN');
    const k = r.id + '_' + ctx.openid;
    if (!db.subs[k]) db.subs[k] = { roundId: r.id, openid: ctx.openid, tmplId: tmpl, grantedAt: now(), used: false };
    return { ok: true, granted: true };
  };

  fns.reportCard = function (d, ctx) {
    if (['unsuitable', 'ambiguous', 'typo'].indexOf(d.reason) < 0 || typeof d.itemId !== 'string' || !content.itemById[d.itemId]) return err('INVALID_INPUT');
    if (!rate('reportCard', ctx.openid, config.extras.reportsPerDay)) return err('RATE_LIMITED');
    db.reports.push({ openid: ctx.openid, dateKey: d.dateKey || null, itemId: d.itemId, reason: d.reason, ts: now() });
    return { ok: true };
  };

  fns.track = function (d, ctx) {
    if (!Array.isArray(d.events) || d.events.length > 50) return err('INVALID_INPUT');
    d.events.forEach((e) => db.events.push(clone(e)));
    return { ok: true, accepted: d.events.length };
  };

  fns.cleanup = function (d, ctx) {
    if (ctx.openid) return err('FORBIDDEN', 'timer only');
    return { ok: true };
  };

  // ------------------------------------------------------------------ dispatcher and test helpers

  srv.call = function (name, data, ctx) {
    srv.calls.push(name);
    if (srv.offline) return err('NETWORK', 'offline');
    const f = srv.fail[name];
    if (f && f.times > 0) {
      f.times--;
      return err(f.code, f.code);
    }
    const fn = fns[name];
    if (!fn) return err('INTERNAL', 'unknown function ' + name);
    const c = ctx || {};
    if (!c.openid && TIMER_FUNCTIONS.indexOf(name) < 0) return err('UNAUTHENTICATED');
    try {
      return clone(fn(clone(data) || {}, c));
    } catch (e) {
      return err('INTERNAL', String(e && e.message));
    }
  };

  /** Server-side config the console would hold (`app_config`): { subscribe:{tmplId}, banner:{enabled, adUnitId}, interstitial:{...} }. */
  srv.setConfig = function (patch) {
    Object.assign(db.appConfig, patch);
  };

  /** Play one complete daily for `openid` through the real submitCard path. positions: 5 integers. */
  srv.playDaily = function (openid, positions, groupRef) {
    const dk = todayKey();
    let last = null;
    for (let i = 0; i < 5; i++) last = srv.call('submitCard', { dateKey: dk, idx: i, pos: positions[i], groupRef }, { openid });
    return last;
  };

  /** Put `openid` in a group (as joinGroup would). Returns the groupRef. */
  srv.joinGroupAs = function (openid, openGId) {
    const r = srv.call('joinGroup', { groupData: { opengid: openGId, chat_type: 3 } }, { openid });
    return r.groupRef;
  };

  srv.ensureHistory = function () {
    const dk = todayKey();
    for (let k = launchKey(); k <= dk; k = D.addDays(k, 1)) ensureSet(k);
  };
  srv.todayKey = todayKey;
  srv.rowHash = rowHash;
  srv.ME = ME;
  void mulberry32;
  return srv;
}

module.exports = { createMockServer, rowHash, ME };
