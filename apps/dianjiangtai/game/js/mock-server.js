/**
 * In-memory stand-in for the cloud functions (spec 14.2), so the whole game
 * runs before the backend and an AppID exist. It uses the same core/ code the
 * real functions use, and follows the same contracts, including the rules:
 * the daily client gets rounds one at a time (progressive delivery, PO-8) and
 * never the seed, one ranked result per date, lineups withheld until the
 * caller has a ranked result, streaks and history, no openids.
 *
 * Functions: getDaily, startRun, getRound, submitRun, getHistory,
 * subscribeChallenge, joinGroup, getBoard, getReplay, createChallenge,
 * getChallenge, track.
 *
 * NOT a security boundary. Real mode (js/api.js) calls wx.cloud.callFunction.
 * Test hooks: srv.appConfig (the remote app_config document), srv.offline,
 * srv.db.unpublished[dateKey] = true (a date with no published seed).
 */

const { hash32 } = require('../core/rng');
const { getContent, LATEST_CONTENT_VERSION } = require('../core/content');
const { getConfig, LATEST_CONFIG_VERSION } = require('../core/config');
const { buildSheet } = require('../core/sheet');
const { replay } = require('../core/validate');
const { simulate } = require('../core/sim');
const { bestLineup } = require('../core/search');
const { dateKeyToMs, beijingDateKey, issueNo, secondsSinceBeijingMidnight, beijingMidnightMs, addDays, DAY_MS } = require('../core/date');
const draft = require('../core/draft');
const adapter = require('./core-adapter');

const ME = 'mock-openid-me';
const HISTORY_MAX = 30;

function err(code, msg) {
  return { ok: false, code, message: msg || code };
}

function createMockServer(opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now());
  const cv = opts.contentVersion || LATEST_CONTENT_VERSION;
  const config = getConfig(opts.configVersion || LATEST_CONFIG_VERSION);
  const db = {
    seeds: {},
    starts: {},
    progress: {}, // dateKey_ME -> { clientRunId, mode, challengeId, actions, released }
    runs: {},
    results: {},
    stats: {},
    playerStats: {}, // ME -> { cur, best, last, total }
    challenges: {},
    grants: {}, // challengeId -> { tmplId }
    groups: {},
    events: [],
    members: {},
    anomalies: [],
    bests: {},
    unpublished: {},
  };
  const srv = { offline: false, db, calls: [], appConfig: opts.appConfig || null };

  function published(dateKey) {
    return dateKey >= config.daily.launchDateKey && !db.unpublished[dateKey];
  }

  function seedFor(dateKey) {
    if (!db.seeds[dateKey]) {
      const seed = hash32('mock-daily:' + dateKey);
      db.seeds[dateKey] = {
        seed,
        issueNo: issueNo(dateKey, config.daily.launchDateKey),
        variant: adapter.variantFor(config, dateKey),
        rounds: buildSheet(seed, cv, config.configVersion),
        salt: 'salt' + hash32('salt:' + dateKey).toString(16),
      };
    }
    return db.seeds[dateKey];
  }

  function hashRow(openid, salt) {
    return (hash32(openid + '|' + salt).toString(16).padStart(8, '0') + hash32(salt + '|' + openid).toString(16).padStart(8, '0')).slice(0, 12);
  }

  function rarityFor(dateKey, wins) {
    const st = db.stats[dateKey] || { hist: new Array(13).fill(0), total: 0 };
    if (st.total < 30) return null; // same as the backend: no rarity under 30 runs
    let n = 0;
    for (let w = wins; w <= 12; w++) n += st.hist[w];
    return { pct: Math.round((n / st.total) * 1000) / 10, total: st.total };
  }

  /** Spoiler rule (backend dailyLocked): a daily-seed run stays sealed until the caller has a ranked daily for that date, or D+1 00:30. */
  function dailyLocked(dateKey, seed) {
    const s = db.seeds[dateKey];
    if (!s || s.seed !== seed) return false;
    if (db.results[dateKey + '_' + ME]) return false;
    return now() < dateKeyToMs(dateKey) + DAY_MS + config.daily.graceMs;
  }

  function windowClosed(dateKey) {
    return now() > dateKeyToMs(dateKey) + DAY_MS + config.daily.graceMs;
  }

  function flag(kind, dateKey, detail) {
    db.anomalies.push({ kind, dateKey, detail });
  }

  /** The remote feature document (PO-11): missing -> everything optional is off. */
  function features() {
    const c = srv.appConfig || {};
    // the backend shape (common/appconfig.js): { ads: { banner, interstitial }, subscribe? }
    const f = { ads: { banner: (c.ads && c.ads.banner) || { enabled: false, adUnitId: '' }, interstitial: Object.assign({}, require('./features').interstitialDefaults(config), c.ads && c.ads.interstitial) } };
    if (c.subscribe && c.subscribe.tmplId) f.subscribe = { tmplId: c.subscribe.tmplId };
    return f;
  }

  /** Latest published date before dateKey. */
  function prevPublished(dateKey) {
    let k = addDays(dateKey, -1);
    for (let i = 0; i < 400 && k >= config.daily.launchDateKey; i++) {
      if (published(k)) return k;
      k = addDays(k, -1);
    }
    return null;
  }

  function streakNow(today) {
    const ps = db.playerStats[ME];
    if (!ps) return { current: 0, best: 0 };
    const alive = ps.last === today || ps.last === prevPublished(today);
    return { current: alive ? ps.cur : 0, best: ps.best };
  }

  /** Does this challenge run count as the caller's daily (spec 9.3 step 5)? */
  function challengeCountsAsDaily(c, today) {
    return c.mode === 'daily' && c.dateKey === today && !db.results[today + '_' + ME];
  }

  function actionsExtend(prefix, actions) {
    if (actions.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) if (JSON.stringify(prefix[i]) !== JSON.stringify(actions[i])) return false;
    return true;
  }

  const fns = {
    getDaily() {
      const t = now();
      const dateKey = beijingDateKey(t);
      const s = seedFor(dateKey);
      const res = db.results[dateKey + '_' + ME];
      return {
        ok: true,
        dateKey,
        issueNo: s.issueNo,
        variant: s.variant,
        serverNow: t,
        myStatus: res ? 'done' : db.starts[dateKey + '_' + ME] ? 'started' : 'none',
        myRecord: res ? { w: res.w, l: 12 - res.w } : undefined,
        myStreak: streakNow(dateKey),
        features: features(),
      };
    },

    startRun(d) {
      const t = now();
      let dateKey = d.dateKey || beijingDateKey(t);
      let progressive = d.mode === 'daily';
      let mode = 'daily';
      if (d.challengeId) {
        const ch = db.challenges[d.challengeId];
        if (!ch) return err('SEED_NOT_FOUND');
        mode = 'challenge';
        dateKey = ch.dateKey;
        progressive = challengeCountsAsDaily(ch, beijingDateKey(t));
      }
      if (!progressive) return { ok: true, resumed: false };
      const k = dateKey + '_' + ME;
      if (db.results[k]) return err('ALREADY_PLAYED');
      const rounds = seedFor(dateKey).rounds;
      let p = db.progress[k];
      const resumed = !!p;
      if (!p) {
        p = db.progress[k] = { clientRunId: d.clientRunId, mode, challengeId: d.challengeId || null, actions: [], released: 1 };
        db.starts[k] = { startedAt: t };
      }
      return { ok: true, resumed, rounds: rounds.slice(0, p.released), actions: p.actions.slice(), clientRunId: p.clientRunId };
    },

    getRound(d) {
      const dateKey = d.dateKey || beijingDateKey(now());
      const k = dateKey + '_' + ME;
      const p = db.progress[k];
      if (!p) return err('NOT_STARTED');
      const actions = d.actions;
      if (!Array.isArray(actions)) return err('INVALID_ACTIONS');
      const s = seedFor(dateKey);
      const run = draft.createRun({ seed: s.seed, contentVersion: cv, configVersion: config.configVersion, mode: p.mode === 'challenge' ? 'challenge' : 'daily', rounds: s.rounds });
      for (const a of actions) {
        if (!draft.apply(run, a).ok) {
          flag('invalid_ranked', dateKey);
          return err('INVALID_ACTIONS');
        }
      }
      const n = run.picks.length; // the actions must end exactly after the pick of round n (1..4)
      if (n < 1 || n > 4 || run.phase !== 'placed' || run.round !== n) return err('INVALID_ACTIONS');
      const next = n + 1;
      // same rules as the backend getRound
      if (actionsExtend(p.actions, actions)) {
        if (p.released < n) return err('INVALID_ACTIONS'); // cannot skip a round
        if (p.released < next || p.actions.length !== actions.length) {
          p.actions = actions.map((a) => Object.assign({}, a));
          p.released = Math.max(p.released, next);
        }
        return { ok: true, round: next, data: s.rounds[n], released: p.released };
      }
      if (actionsExtend(actions, p.actions) && next <= p.released) return { ok: true, round: next, data: s.rounds[n], released: p.released }; // stale retry
      flag('prefix', dateKey);
      return err('INVALID_ACTIONS');
    },

    submitRun(d) {
      const t = now();
      const runKey = ME + '_' + d.clientRunId;
      if (db.runs[runKey]) return db.runs[runKey].response;
      let seed;
      let dateKey = d.dateKey || beijingDateKey(t);
      let mode = d.mode;
      let challenge = null;
      if (mode === 'daily') {
        if (!db.seeds[dateKey]) return err('SEED_NOT_FOUND');
        seed = db.seeds[dateKey].seed;
      } else if (d.challengeId) {
        challenge = db.challenges[d.challengeId];
        if (!challenge) return err('SEED_NOT_FOUND');
        if (t > challenge.expiresAt) return err('CHALLENGE_EXPIRED');
        seed = challenge.seed;
        dateKey = challenge.dateKey;
        mode = 'challenge';
      } else {
        seed = d.seed >>> 0;
      }
      const rep = replay(seed, cv, d.actions, mode === 'free' ? 'free' : mode);
      if (!rep.ok) {
        if (mode === 'daily') flag('invalid_ranked', dateKey);
        return { ok: false, code: rep.error, reason: rep.reason, message: rep.reason };
      }
      const sim = simulate(rep.lineup, seed, cv, config.configVersion);
      if (d.clientRecord && (d.clientRecord.w !== sim.record.w || d.clientRecord.l !== sim.record.l)) flag('mismatch', dateKey, { client: d.clientRecord, server: sim.record });
      let ranked = false;
      const today = beijingDateKey(t);
      const countsAsDaily = (mode === 'daily' || (challenge && challenge.mode === 'daily' && challenge.dateKey === today)) && dateKey === today;
      let streak = null;
      if (countsAsDaily) {
        const rk = dateKey + '_' + ME;
        if (db.results[rk]) {
          const prev = db.results[rk];
          return Object.assign(err('ALREADY_PLAYED'), { result: prev.response });
        }
        const startedDate = dateKey;
        const lateLimit = beijingMidnightMs(t) + config.daily.graceMs;
        if (startedDate !== today && t > lateLimit) return err('LATE_SUBMIT');
        // progressive delivery (PO-8): all five rounds released, actions extend the frozen prefix exactly
        const p = db.progress[rk];
        if (!p) return err('NOT_STARTED');
        if (p.released < 5 || !actionsExtend(p.actions, d.actions)) {
          flag('prefix', dateKey);
          flag('invalid_ranked', dateKey);
          return Object.assign(err('INVALID_ACTIONS'), { reason: 'PREFIX' });
        }
        ranked = true;
      } else if (mode === 'daily') {
        return err('LATE_SUBMIT');
      }
      const response = {
        ok: true,
        record: sim.record,
        battles: sim.battles.map((b) => ({ i: b.i, type: b.type, typeLabel: b.typeLabel, win: b.win, p: b.p, luck: b.luck, cause: b.cause, event: b.event, causeSlot: b.causeSlot })),
        events: sim.events,
        band: { key: sim.band.key, label: sim.band.label },
        rarity: ranked ? rarityFor(dateKey, sim.record.w) : null,
        ranked,
      };
      if (ranked) {
        const st = db.stats[dateKey] || (db.stats[dateKey] = { hist: new Array(13).fill(0), total: 0 });
        st.hist[sim.record.w]++;
        st.total++;
        // streak (PO-6): consecutive published dates; unpublished dates are skipped
        const ps = db.playerStats[ME] || (db.playerStats[ME] = { cur: 0, best: 0, last: null, total: 0 });
        ps.cur = ps.last && ps.last === prevPublished(dateKey) ? ps.cur + 1 : 1;
        ps.best = Math.max(ps.best, ps.cur);
        ps.last = dateKey;
        ps.total++;
        streak = { current: ps.cur, best: ps.best };
        response.streak = streak;
        // factions of the drafted cells (lineupFac), in slot order
        const rr = adapter.replayInto({ seed, contentVersion: cv, configVersion: config.configVersion, mode: mode === 'challenge' ? 'challenge' : 'daily' }, d.actions).run;
        const facBySlot = adapter.draftedFactions(rr);
        db.results[dateKey + '_' + ME] = { w: sim.record.w, s: secondsSinceBeijingMidnight(t), lineup: rep.lineup, lineupFac: rep.lineup.map((e) => facBySlot[e.slot]), response, streak: streak.current };
      }
      if (challenge) {
        challenge.answers.push({ w: sim.record.w, lineup: rep.lineup, by: ME });
        const locked = dailyLocked(challenge.dateKey, challenge.seed);
        response.challengeCompare = {
          theirRecord: challenge.record,
          theirLineup: locked ? null : challenge.lineup.map((e) => ({ slot: e.slot, generalId: e.generalId })),
          lineupLocked: locked,
          countsAsDaily: ranked,
        };
      }
      db.runs[runKey] = { response, seed, mode, dateKey, lineup: rep.lineup, tokens: rep.finalTokens, record: sim.record };
      return response;
    },

    getHistory(d) {
      const limit = Math.max(1, Math.min(HISTORY_MAX, (d && d.limit) || HISTORY_MAX));
      const t = now();
      const today = beijingDateKey(t);
      const items = [];
      let k = today;
      for (let i = 0; i < 400 && items.length < limit && k >= config.daily.launchDateKey; i++) {
        if (published(k)) {
          const s = seedFor(k);
          const it = { dateKey: k, issueNo: s.issueNo, variant: s.variant };
          const res = db.results[k + '_' + ME];
          if (res) it.mine = { w: res.w, l: 12 - res.w, lineupIdx: res.lineup.map((e) => getContent(cv).indexOf[e.generalId]), lineupFac: res.lineupFac };
          const st = db.stats[k];
          if (st && st.total >= 30) {
            it.total = st.total;
            it.hist = st.hist.slice();
          }
          if (windowClosed(k)) {
            if (!db.bests[k]) {
              const b = bestLineup(s.seed, cv, s.rounds.map((r) => ({ faction: r.faction, era: r.era })), { configVersion: config.configVersion });
              db.bests[k] = b ? { lineupIdx: b.lineup.map((e) => getContent(cv).indexOf[e.generalId]), lineupFac: b.lineup.map((e) => e.faction), record: b.record } : { none: true };
            }
            if (!db.bests[k].none) it.best = db.bests[k];
          }
          items.push(it);
        }
        k = addDays(k, -1);
      }
      const ps = db.playerStats[ME];
      return { ok: true, items, bestStreak: ps ? ps.best : 0 };
    },

    subscribeChallenge(d) {
      const tmplId = features().subscribe && features().subscribe.tmplId;
      if (!tmplId) return err('NO_TEMPLATE');
      const c = db.challenges[d.challengeId];
      if (!c) return err('SEED_NOT_FOUND');
      if (c.owner !== ME) return err('NOT_OWNER');
      if (!db.grants[d.challengeId]) db.grants[d.challengeId] = { tmplId, used: false };
      return { ok: true, granted: true };
    },

    joinGroup(d) {
      const g = d && d.groupData;
      const data = g && g.mockData ? g.mockData : g;
      if (!data || !data.opengid) return { ok: false, code: data && data.code ? data.code : 40097 };
      if (data.chat_type !== undefined && data.chat_type !== 3 && data.chat_type !== 4) return { ok: false, code: 'NOT_GROUP' };
      const ref = hash32('pepper:' + data.opengid).toString(16).padStart(8, '0') + hash32(data.opengid + ':p').toString(16).padStart(8, '0');
      db.groups[ref] = db.groups[ref] || {};
      db.members[ref + '_' + ME] = true;
      return { ok: true, groupRef: ref };
    },

    getBoard(d) {
      const t = now();
      const dateKey = d.dateKey || beijingDateKey(t);
      const s = seedFor(dateKey);
      if (d.kind === 'group' && !db.members[d.groupRef + '_' + ME]) return err('BAD_GROUP');
      const mine = db.results[dateKey + '_' + ME];
      const rows = [];
      for (const k of Object.keys(db.results)) {
        if (k.indexOf(dateKey + '_') !== 0) continue;
        const r = db.results[k];
        const openid = k.slice(dateKey.length + 1);
        const row = [hashRow(openid, s.salt), r.w, r.s];
        row.push(mine ? r.lineup.map((e) => getContent(cv).indexOf[e.generalId]).join(',') : null);
        if (r.streak >= 2) row.push(r.streak);
        rows.push(row);
      }
      (db.fakeRows || []).forEach((f) => rows.push(f));
      rows.sort((a, b) => b[1] - a[1] || a[2] - b[2]);
      const cap = config.boardListCap;
      const mode = rows.length > cap ? (d.kind === 'group' ? 'group' : 'selfOnly') : 'full';
      return {
        ok: true,
        dateKey,
        issueNo: s.issueNo,
        variant: s.variant,
        contentVersion: cv,
        salt: s.salt,
        selfHash: hashRow(ME, s.salt),
        mode,
        viewerPlayed: !!mine,
        rows: rows.slice(0, cap),
      };
    },

    getReplay(d) {
      const run = db.runs[ME + '_' + d.runId];
      if (!run) return err('SEED_NOT_FOUND');
      if (run.mode === 'daily' && !db.results[run.dateKey + '_' + ME]) return err('NOT_YET');
      if (dailyLocked(run.dateKey, run.seed)) return err('REPLAY_LOCKED');
      const best = bestLineup(run.seed, cv, run.tokens);
      return { ok: true, best: best ? { lineup: best.lineup, record: best.record } : null };
    },

    createChallenge(d) {
      const run = db.runs[ME + '_' + d.runId];
      if (!run) return err('SEED_NOT_FOUND');
      const id = hash32('ch:' + d.runId).toString(32).toUpperCase().padStart(8, '0').slice(0, 8);
      if (!db.challenges[id]) {
        db.challenges[id] = {
          owner: ME,
          mode: run.mode === 'free' ? 'free' : 'daily',
          seed: run.seed,
          dateKey: run.dateKey,
          rounds: buildSheet(run.seed, cv, config.configVersion),
          record: run.record,
          lineup: run.lineup,
          expiresAt: now() + 7 * DAY_MS,
          answers: [],
        };
      }
      return { ok: true, challengeId: id };
    },

    getChallenge(d) {
      const c = db.challenges[d.challengeId];
      const t = now();
      if (!c) return Object.assign(err('NOT_FOUND'), { status: 'expired' });
      if (t > c.expiresAt) return Object.assign(err('CHALLENGE_EXPIRED'), { status: 'expired' });
      const today = beijingDateKey(t);
      const answered = c.answers.some((a) => a.by === ME);
      const dailyToday = c.mode === 'daily' && c.dateKey === today;
      const counts = challengeCountsAsDaily(c, today);
      const out = {
        ok: true,
        status: c.owner === ME ? 'own' : answered ? 'answered' : 'ready',
        theirRecord: c.record,
        mode: c.mode,
        variant: c.mode === 'daily' ? adapter.variantFor(config, c.dateKey) : 'standard',
        countsAsDaily: dailyToday && counts,
        isFriendly: !(dailyToday && counts),
        answerCount: c.answers.length,
        dateKey: c.dateKey,
      };
      // a run that counts as today's daily gets its tokens round by round (startRun / getRound)
      if (!(dailyToday && counts)) out.rounds = c.rounds;
      if (c.owner === ME) out.subscribe = { granted: !!db.grants[d.challengeId] };
      if (c.owner === ME && c.answers.length) { const bw = Math.max.apply(null, c.answers.map((a) => a.w)); out.bestAnswer = { w: bw, l: 12 - bw }; }
      const locked = answered && dailyLocked(c.dateKey, c.seed);
      if (answered) {
        out.theirLineup = locked ? null : c.lineup;
        out.lineupLocked = locked;
      }
      return out;
    },

    track(d) {
      for (const e of (d && d.events) || []) db.events.push(e);
      return { ok: true };
    },
  };

  /** Call a function by name. Never throws. */
  srv.call = function (name, data) {
    srv.calls.push({ name, data });
    if (srv.offline) return err('NETWORK', 'offline');
    if (!fns[name]) return err('NO_SUCH_FUNCTION');
    try {
      return fns[name](data || {});
    } catch (e) {
      return err('SERVER_ERROR', String(e && e.message));
    }
  };
  srv.ME = ME;
  return srv;
}

module.exports = { createMockServer };
