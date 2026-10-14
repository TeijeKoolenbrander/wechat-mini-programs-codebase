/**
 * In-memory stand-in for the cloud functions (spec 14.2), so the whole game
 * runs before the backend and an AppID exist. It uses the same core/ code the
 * real functions use, and follows the same contracts, including the rules:
 * the daily client gets rounds only (never the seed), one ranked result per
 * date, lineups withheld until the caller has a ranked result, no openids.
 *
 * NOT a security boundary. Real mode (js/api.js) calls wx.cloud.callFunction.
 */

const { hash32 } = require('../core/rng');
const { getContent, LATEST_CONTENT_VERSION } = require('../core/content');
const { getConfig, LATEST_CONFIG_VERSION } = require('../core/config');
const { buildSheet } = require('../core/sheet');
const { replay } = require('../core/validate');
const { simulate } = require('../core/sim');
const { bestLineup } = require('../core/search');
const { beijingDateKey, issueNo, secondsSinceBeijingMidnight, beijingMidnightMs, DAY_MS } = require('../core/date');

const ME = 'mock-openid-me';

function err(code, msg) {
  return { ok: false, code, msg: msg || code };
}

function createMockServer(opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now());
  const cv = opts.contentVersion || LATEST_CONTENT_VERSION;
  const config = getConfig(opts.configVersion || LATEST_CONFIG_VERSION);
  const db = {
    seeds: {},
    starts: {},
    runs: {},
    results: {},
    stats: {},
    challenges: {},
    groups: {},
    events: [],
    members: {},
  };
  const srv = { offline: false, db, calls: [] };

  function seedFor(dateKey) {
    if (!db.seeds[dateKey]) {
      const seed = hash32('mock-daily:' + dateKey);
      db.seeds[dateKey] = {
        seed,
        issueNo: issueNo(dateKey, config.daily.launchDateKey),
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
    if (st.total < 30) return { share: null, total: st.total };
    let n = 0;
    for (let w = wins; w <= 12; w++) n += st.hist[w];
    return { share: n / st.total, total: st.total };
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
        rounds: s.rounds,
        serverNow: t,
        myStatus: res ? 'done' : db.starts[dateKey + '_' + ME] ? 'started' : 'none',
        myRecord: res ? { w: res.w, l: 12 - res.w } : undefined,
      };
    },

    startRun(d) {
      if (d.mode === 'daily') {
        const dateKey = d.dateKey || beijingDateKey(now());
        const k = dateKey + '_' + ME;
        const resumed = !!db.starts[k];
        if (!resumed) db.starts[k] = { startedAt: now() };
        return { ok: true, resumed };
      }
      return { ok: true, resumed: false };
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
      if (!rep.ok) return { ok: false, code: rep.error, reason: rep.reason, msg: rep.reason };
      const sim = simulate(rep.lineup, seed, cv, config.configVersion);
      let ranked = false;
      const today = beijingDateKey(t);
      const countsAsDaily = (mode === 'daily' || (challenge && challenge.mode === 'daily' && challenge.dateKey === today)) && dateKey === today;
      if (countsAsDaily) {
        const rk = dateKey + '_' + ME;
        if (db.results[rk]) {
          const prev = db.results[rk];
          return Object.assign(err('ALREADY_PLAYED'), { record: { w: prev.w, l: 12 - prev.w }, existing: prev.response });
        }
        const startedDate = dateKey;
        const lateLimit = beijingMidnightMs(t) + config.daily.graceMs;
        if (startedDate !== today && t > lateLimit) return err('LATE_SUBMIT');
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
        db.results[dateKey + '_' + ME] = { w: sim.record.w, s: secondsSinceBeijingMidnight(t), lineup: rep.lineup, response };
      }
      if (challenge) {
        challenge.answers.push({ w: sim.record.w, lineup: rep.lineup, by: ME });
        response.challengeCompare = {
          theirRecord: challenge.record,
          theirLineup: challenge.lineup.map((e) => ({ slot: e.slot, generalId: e.generalId })),
          countsAsDaily: ranked,
        };
      }
      db.runs[runKey] = { response, seed, mode, dateKey, lineup: rep.lineup, tokens: rep.finalTokens, record: sim.record };
      return response;
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
        if (mine) row.push(r.lineup.map((e) => getContent(cv).indexOf[e.generalId]).join(','));
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
      const dailyDone = !!db.results[today + '_' + ME];
      const dailyToday = c.mode === 'daily' && c.dateKey === today;
      const out = {
        ok: true,
        status: c.owner === ME ? 'own' : answered ? 'answered' : 'ready',
        theirRecord: c.record,
        mode: c.mode,
        countsAsDaily: dailyToday && !dailyDone,
        isFriendly: !(dailyToday && !dailyDone),
        answerCount: c.answers.length,
        rounds: c.rounds,
        dateKey: c.dateKey,
      };
      if (c.owner === ME && c.answers.length) out.bestAnswer = Math.max.apply(null, c.answers.map((a) => a.w));
      if (answered) out.theirLineup = c.lineup;
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
