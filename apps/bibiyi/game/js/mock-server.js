/**
 * In-memory stand-in for the cloud functions (spec 11), so the whole game
 * runs before the backend and an AppID exist. It uses the same core/ code the
 * real functions use and follows the same contracts and rules:
 *
 *  - the daily deck is server-stepped: no response ever carries a question
 *    beyond the current one, or the value of an unanswered bottom card (AC 18)
 *  - `answer` is idempotent per k; INVALID_ORDER for a wrong k (AC 20)
 *  - one ranked result per date; answers accepted until D+1 00:30 BJT (AC 23, 24)
 *  - free runs are replayed on submit; the server streak is authoritative (AC 38, 39)
 *  - no openids or openGIds in any response; ranks come only from here
 *
 * The daily pool here is a SYNTHETIC one generated at runtime (labels start
 * with 模拟), because the real daily facts must never ship in the game package
 * (AC 22). Tests may pass `dailyFacts` (e.g. the placeholder export) instead.
 *
 * NOT a security boundary. Real mode (js/api.js) calls wx.cloud.callFunction.
 */

const { hash32, mulberry32 } = require('../core/rng');
const { getContent, indexFacts, LATEST_CONTENT_VERSION } = require('../core/content');
const { getConfig, LATEST_CONFIG_VERSION, resolveInterstitial } = require('../core/config');
const { MEASURES, BY_KEY } = require('../core/measures');
const { generateDaily, buildFreeDeck, themeOf, deckFactIds } = require('../core/deck');
const { replayRun, judge } = require('../core/judge');
const { questionPayload, revealOf, knownFace } = require('../core/question');
const { rarityShare } = require('../core/score');
const { beijingDateKey, issueNo, secondsSinceBeijingMidnight, addDays, windowCloseMs, DAY_MS } = require('../core/date');

const ME = 'mock-openid-me';
const REASON_KEYS = ['value', 'unit', 'name', 'source', 'wording', 'other'];

function err(code, msg, extra) {
  return Object.assign({ ok: false, code, msg: msg || code }, extra || {});
}

const SYN_RANGE = {
  city_pop: [2e5, 3e7], prov_pop: [3e5, 1.3e8], mountain: [500, 8800], river: [100, 6400], lake: [20, 4500], animal_weight: [0.5, 5000], animal_life: [1, 150],
  space_diameter: [100, 1.4e6], structure_len: [50, 150000], structure_height: [10, 830], food_kcal: [20, 900], distance: [100, 4500],
};

/** The mock's own invented daily pool: 40 facts per measure, labels 模拟<measure index>-<n>. Never real data. */
function syntheticDaily() {
  const out = [];
  MEASURES.forEach((m, mi) => {
    const rng = mulberry32(hash32('mock-daily:' + m.key));
    for (let i = 1; i <= 40; i++) {
      let value;
      if (m.kind === 'year') value = Math.round(-1500 + rng() * 3500) || 1;
      else {
        const r = SYN_RANGE[m.key];
        value = Math.round(Math.exp(Math.log(r[0]) + rng() * (Math.log(r[1]) - Math.log(r[0]))) * 100) / 100;
      }
      out.push({
        id: 'mock_' + m.key + '_' + i, measure: m.key, pool: 'daily', label: '模拟' + (mi + 1) + '-' + i, sub: m.kind === 'year' ? ['始建', '建成', '成书', '问世'][i % 4] : null,
        value, approx: false, uncertainty: 0, year: 2020, source: '模拟数据', publisher: '模拟出版方', url: 'https://example.com/mock', licence: 'CC0',
        retrievedAt: '2026-10-15', note: m.key === 'prov_pop' ? '模拟·七普口径' : null, tags: [], status: 'active', since: 1,
      });
    }
  });
  return out;
}

function createMockServer(opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now());
  const cv = opts.contentVersion || LATEST_CONTENT_VERSION;
  const cfgNum = opts.configVersion || LATEST_CONFIG_VERSION;
  const config = getConfig(cfgNum);
  const free = getContent(cv);
  const dailyList = opts.dailyFacts || syntheticDaily();
  const dailyIdx = indexFacts(dailyList, cv);
  const allIdx = indexFacts(free.facts.concat(dailyList), cv);
  const launchKey = opts.launchDateKey || config.daily.launchDateKey;
  const db = {
    decks: {}, progress: {}, byClient: {}, runs: {}, results: {}, stats: {}, players: {}, challenges: {}, groups: {}, members: {}, reports: {},
    overrides: { suspended: [], errata: {} }, rate: {}, anomalies: [], events: [], appConfig: opts.appConfig || { subscribe: null, ads: {} }, fakeRows: [],
  };
  const srv = { offline: false, db, calls: [], retiredVersions: [] };

  const nowKey = () => beijingDateKey(now());
  const hashRow = (openid, salt) => (hash32(openid + '|' + salt).toString(16).padStart(8, '0') + hash32(salt + '|' + openid).toString(16).padStart(8, '0')).slice(0, 12);

  // ---------------------------------------------------------------- decks

  function publishedKeys() {
    return Object.keys(db.decks).sort();
  }

  function suspendedSet() {
    return new Set(db.overrides.suspended.map((s) => s.factId));
  }

  function ensureDeck(dateKey) {
    if (db.decks[dateKey]) return db.decks[dateKey];
    const ex = new Set();
    for (let i = 1; i < config.daily.repeatWindowDays; i++) {
      const d = db.decks[addDays(dateKey, -i)];
      if (d) deckFactIds(d.deck).forEach((id) => ex.add(id));
    }
    const r = generateDaily({ dateKey, index: dailyIdx, contentVersion: cv, configVersion: cfgNum, exclude: ex, suspended: suspendedSet() });
    if (!r.ok) return null;
    db.decks[dateKey] = { deck: r.deck, issueNo: issueNo(dateKey, launchKey), salt: 'salt' + hash32('salt:' + dateKey).toString(16), createdAt: now(), attempts: r.attempts };
    return db.decks[dateKey];
  }

  function themeLabel(dateKey) {
    return themeOf(dateKey).label;
  }

  function questionOf(deckDoc, k) {
    return questionPayload(deckDoc.deck.questions[k - 1], allIdx.byId);
  }

  // ---------------------------------------------------------------- players

  function player(who) {
    return db.players[who] || (db.players[who] = { curDays: 0, bestDays: 0, lastDailyDate: null, totalDailies: 0, bestDaily: 0, bestFree: 0, flags7d: 0, suspect: false });
  }

  function previousPublished(dateKey) {
    const keys = publishedKeys().filter((k) => k < dateKey);
    return keys.length ? keys[keys.length - 1] : null;
  }

  function daysNow(who) {
    const p = player(who);
    const today = nowKey();
    if (!p.lastDailyDate) return { current: 0, best: p.bestDays };
    if (p.lastDailyDate === today || p.lastDailyDate === previousPublished(today)) return { current: p.curDays, best: p.bestDays };
    return { current: 0, best: p.bestDays };
  }

  function rarityFor(dateKey, n) {
    const st = db.stats[dateKey];
    if (!st || st.total < config.rarityMinTotal) return { share: null, total: st ? st.total : 0 };
    return { share: rarityShare(st.hist, st.total, n, config.rarityMinTotal), total: st.total };
  }

  // ---------------------------------------------------------------- run progress

  function progressOf(who, clientRunId) {
    const key = db.byClient[who + '|' + clientRunId];
    return key ? db.progress[key] : null;
  }

  function flag(who, kind, detail, dateKey) {
    db.anomalies.push({ who, kind, detail, dateKey });
    const p = player(who);
    p.flags7d++;
    if (p.flags7d >= config.anomaly.suspectFlags) p.suspect = true;
  }

  /** End a run: write results in one step (the real server uses one transaction). */
  function finalize(run, endReason) {
    if (run.status === 'ended') return run.result;
    run.status = 'ended';
    run.endReason = endReason;
    run.endedAt = now();
    const result = { n: run.streak, endReason };
    if (run.ranked) {
      const dk = run.dateKey;
      const p = player(run.who);
      const prev = previousPublished(dk);
      p.curDays = p.lastDailyDate && p.lastDailyDate === prev ? p.curDays + 1 : 1;
      if (p.lastDailyDate === dk) p.curDays = Math.max(1, p.curDays);
      p.lastDailyDate = dk;
      p.bestDays = Math.max(p.bestDays, p.curDays);
      p.totalDailies++;
      p.bestDaily = Math.max(p.bestDaily, run.streak);
      const st = db.stats[dk] || (db.stats[dk] = { hist: new Array(config.deckLen.daily + 1).fill(0), total: 0 });
      st.hist[run.streak]++;
      st.total++;
      db.results[dk + '_' + run.who] = { who: run.who, dateKey: dk, n: run.streak, endS: secondsSinceBeijingMidnight(now()), dayStreak: p.curDays, endReason };
      result.rarity = rarityFor(dk, run.streak);
      result.dayStreak = p.curDays;
      result.bestDaily = p.bestDaily;
    }
    if (run.challengeId && db.challenges[run.challengeId]) {
      const c = db.challenges[run.challengeId];
      c.answers.push({ by: run.who, n: run.streak });
      result.challengeCompare = { ownerStreak: c.ownerStreak };
    }
    // observe-only anomaly flags
    const ms = run.answers.map((a) => a.ms).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    if (run.ranked && ms.length >= config.anomaly.fastMinAnswers && ms[Math.floor(ms.length / 2)] < config.anomaly.fastMedianMs) flag(run.who, 'fast', ms.length, run.dateKey);
    if (run.ranked && ms.filter((x) => x >= config.anomaly.slowMs).length >= config.anomaly.slowMinAnswers) flag(run.who, 'slow', ms.length, run.dateKey);
    run.result = result;
    return result;
  }

  function finalizeExpired(who) {
    Object.keys(db.progress).forEach((key) => {
      const r = db.progress[key];
      if (r.who === who && r.ranked && r.status === 'open' && now() > windowCloseMs(r.dateKey)) finalize(r, 'window');
    });
  }

  function answeredList(run) {
    const deckDoc = db.decks[run.dateKey];
    return run.answers.map((a) => {
      const q = deckDoc.deck.questions[a.k - 1];
      return { k: a.k, top: knownFace(allIdx.byId[q.a]), bottom: Object.assign({ factId: q.b, label: allIdx.byId[q.b].label }, a.resp.reveal), correct: a.ok, choice: a.c };
    });
  }

  function runView(run, resumed) {
    const out = {
      ok: true, resumed, clientRunId: run.clientRunId, kind: run.kind, ranked: run.ranked, dateKey: run.dateKey, issueNo: db.decks[run.dateKey].issueNo, themeLabel: themeLabel(run.dateKey),
      k: run.k, streak: run.streak, answered: answeredList(run),
    };
    if (run.status === 'open') out.question = questionOf(db.decks[run.dateKey], run.k);
    else out.result = run.result;
    if (run.challengeId) out.challenge = { ownerStreak: db.challenges[run.challengeId].ownerStreak };
    return out;
  }

  // ---------------------------------------------------------------- functions

  const fns = {
    getDaily(d, who) {
      finalizeExpired(who);
      const dateKey = nowKey();
      const deckDoc = ensureDeck(dateKey);
      if (!deckDoc) return err('DAILY_UNAVAILABLE');
      const ranked = db.progress[dateKey + '_' + who];
      const out = {
        ok: true, dateKey, issueNo: deckDoc.issueNo, theme: { key: themeOf(dateKey).key, label: themeOf(dateKey).label }, serverNow: now(),
        myStatus: !ranked ? 'none' : ranked.status === 'open' ? 'open' : 'done', myDays: daysNow(who),
        bests: { daily: player(who).bestDaily, free: player(who).bestFree },
        features: { subscribe: db.appConfig.subscribe && db.appConfig.subscribe.tmplId ? { tmplId: db.appConfig.subscribe.tmplId } : null, banner: db.appConfig.ads.banner || { enabled: false, adUnitId: null }, interstitial: resolveInterstitial(config, db.appConfig.ads.interstitial) },
      };
      if (ranked && ranked.status === 'open') out.myRun = { k: ranked.k, streak: ranked.streak, clientRunId: ranked.clientRunId };
      if (ranked && ranked.status === 'ended') out.myResult = Object.assign({}, ranked.result, { clientRunId: ranked.clientRunId, missK: ranked.missK || null });
      return out;
    },

    startRun(d, who) {
      finalizeExpired(who);
      const t = now();
      let dateKey;
      let kind;
      let ranked = false;
      let challenge = null;
      if (d.mode === 'challenge') {
        challenge = db.challenges[d.challengeId];
        if (!challenge || t > challenge.expiresAt) return err('CHALLENGE_EXPIRED');
        if (challenge.kind !== 'daily') return err('INVALID_ACTIONS', 'free-seed challenges run on the client');
        dateKey = challenge.dateKey;
      } else if (d.mode === 'daily') dateKey = d.dateKey || nowKey();
      else return err('INVALID_ACTIONS');
      if (!db.decks[dateKey]) {
        if (dateKey === nowKey()) {
          if (!ensureDeck(dateKey)) return err('DAILY_UNAVAILABLE');
        } else return err('DECK_NOT_FOUND');
      }
      if (!d.clientRunId) return err('INVALID_ACTIONS');
      const existing = progressOf(who, d.clientRunId);
      if (existing) return runView(existing, true);
      const today = nowKey();
      const rankedKey = dateKey + '_' + who;
      if (dateKey === today) {
        if (db.progress[rankedKey]) {
          const r = db.progress[rankedKey];
          if (r.status === 'open' && (d.mode === 'daily' || (challenge && !r.challengeId))) return runView(r, true);
          if (d.mode === 'daily') return Object.assign(err('ALREADY_PLAYED'), { result: r.result, clientRunId: r.clientRunId });
          kind = 'dailyFriendly';
        } else {
          ranked = true;
          kind = challenge ? 'challengeDaily' : 'daily';
        }
      } else {
        if (d.mode === 'daily') return err('WINDOW_CLOSED');
        kind = 'dailyFriendly';
      }
      const key = ranked ? rankedKey : who + '_' + d.clientRunId;
      const run = { key, who, clientRunId: d.clientRunId, kind, dateKey, challengeId: challenge ? d.challengeId : null, ranked, k: 1, streak: 0, status: 'open', answers: [], startedAt: t, contentVersion: cv, missK: null };
      db.progress[key] = run;
      db.byClient[who + '|' + d.clientRunId] = key;
      return runView(run, false);
    },

    answer(d, who) {
      const run = progressOf(who, d.clientRunId);
      if (!run) return err('RUN_NOT_FOUND');
      if (d.choice !== 'hi' && d.choice !== 'lo') return err('INVALID_ACTIONS');
      if (!Number.isInteger(d.k)) return err('INVALID_ORDER');
      if (d.k < run.k || (run.status === 'ended' && d.k <= run.answers.length)) {
        const a = run.answers[d.k - 1];
        if (!a) return err('INVALID_ORDER');
        return clone(a.resp);
      }
      if (run.status === 'ended') return err('INVALID_ORDER');
      if (run.ranked && now() > windowCloseMs(run.dateKey)) {
        const result = finalize(run, 'window');
        return err('WINDOW_CLOSED', 'window closed', { result, streak: run.streak });
      }
      if (d.k !== run.k) {
        if (run.ranked) flag(who, 'order', d.k, run.dateKey);
        return err('INVALID_ORDER');
      }
      const deckDoc = db.decks[run.dateKey];
      const q = deckDoc.deck.questions[run.k - 1];
      const a = allIdx.byId[q.a];
      const b = allIdx.byId[q.b];
      const j = judge(a, b, d.choice);
      const reveal = revealOf(b);
      if (j.correct) run.streak++;
      const cleared = j.correct && run.k >= deckDoc.deck.length;
      const resp = { ok: true, k: run.k, correct: j.correct, reveal, streak: run.streak, ended: !j.correct || cleared };
      if (!resp.ended) resp.next = questionOf(deckDoc, run.k + 1);
      run.answers.push({ k: run.k, c: d.choice, ok: j.correct, ms: d.ms, at: now(), resp: null });
      const entry = run.answers[run.answers.length - 1];
      if (resp.ended) {
        run.missK = j.correct ? null : run.k;
        resp.result = finalize(run, j.correct ? 'cleared' : 'miss');
      } else run.k++;
      entry.resp = resp;
      return clone(resp);
    },

    submitRun(d, who) {
      const t = now();
      const key = who + '_' + d.clientRunId;
      if (db.runs[key]) return clone(db.runs[key].response);
      if (d.contentVersion !== cv || d.configVersion !== cfgNum) return err('INVALID_ACTIONS', 'unknown content or config version');
      const group = d.group || 'all';
      let deck;
      try {
        deck = buildFreeDeck(d.seed >>> 0, cv, cfgNum, group, free);
      } catch (e) {
        return err('INVALID_ACTIONS', String(e.message));
      }
      const rep = replayRun(deck, free.byId, d.answers, d.lifeAtK === undefined ? null : d.lifeAtK);
      if (!rep.ok) return err(rep.code, rep.reason);
      const mismatch = d.clientStreak !== undefined && d.clientStreak !== rep.streak;
      if (mismatch) flag(who, 'mismatch', d.clientStreak + '/' + rep.streak, nowKey());
      const p = player(who);
      p.bestFree = Math.max(p.bestFree, rep.streak);
      const response = { ok: true, streak: rep.streak, mismatch, endReason: rep.endReason, lifeUsed: rep.lifeUsed };
      if (d.challengeId) {
        const c = db.challenges[d.challengeId];
        if (!c || t > c.expiresAt) response.challengeCompare = null;
        else if (c.kind === 'free') {
          c.answers.push({ by: who, n: rep.streak });
          response.challengeCompare = { ownerStreak: c.ownerStreak };
        }
      }
      db.runs[key] = { who, seed: d.seed >>> 0, group, contentVersion: cv, configVersion: cfgNum, serverStreak: rep.streak, lifeUsed: rep.lifeUsed, mismatch, response, submittedAt: t };
      return clone(response);
    },

    createChallenge(d, who) {
      const t = now();
      let owner = null;
      const run = progressOf(who, d.runId);
      if (run) {
        if (run.status !== 'ended') return err('RUN_NOT_FOUND');
        owner = { kind: 'daily', dateKey: run.dateKey, ownerStreak: run.streak, ownerLifeUsed: false };
      } else if (db.runs[who + '_' + d.runId]) {
        const r = db.runs[who + '_' + d.runId];
        owner = { kind: 'free', seed: r.seed, group: r.group, ownerStreak: r.serverStreak, ownerLifeUsed: r.lifeUsed };
      }
      if (!owner) return err('RUN_NOT_FOUND');
      const id = hash32('ch:' + who + ':' + d.runId).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
      if (!db.challenges[id]) db.challenges[id] = Object.assign({ id, owner: who, contentVersion: cv, configVersion: cfgNum, createdAt: t, expiresAt: t + 7 * DAY_MS, answers: [] }, owner);
      return { ok: true, challengeId: id };
    },

    getChallenge(d, who) {
      const c = db.challenges[d.challengeId];
      const t = now();
      if (!c) return err('CHALLENGE_EXPIRED', 'not found', { status: 'expired' });
      if (t > c.expiresAt) return err('CHALLENGE_EXPIRED', 'expired', { status: 'expired' });
      if (c.contentVersion !== cv || srv.retiredVersions.indexOf(c.contentVersion) >= 0) return { ok: true, status: 'retired', kind: c.kind, ownerStreak: c.ownerStreak };
      const today = nowKey();
      const mine = c.answers.find((a) => a.by === who);
      const rankedToday = !!db.progress[today + '_' + who];
      const dailyToday = c.kind === 'daily' && c.dateKey === today;
      const out = {
        ok: true, status: c.owner === who ? 'own' : mine ? 'answered' : 'ready', ownerStreak: c.ownerStreak, kind: c.kind,
        countsAsDaily: dailyToday && !rankedToday && c.owner !== who, answerCount: c.answers.length,
      };
      out.isFriendly = !out.countsAsDaily;
      if (c.kind === 'daily') {
        out.dateKey = c.dateKey;
        out.issueNo = db.decks[c.dateKey] ? db.decks[c.dateKey].issueNo : issueNo(c.dateKey, launchKey);
        out.themeLabel = themeLabel(c.dateKey);
        out.pastDeck = c.dateKey !== today;
        out.dailyPlayedToday = rankedToday;
      } else {
        out.seed = c.seed;
        out.group = c.group;
        out.contentVersion = c.contentVersion;
        out.configVersion = c.configVersion;
        out.ownerLifeUsed = c.ownerLifeUsed;
      }
      if (c.owner === who && c.answers.length) out.bestAnswer = Math.max.apply(null, c.answers.map((a) => a.n));
      if (mine) out.myStreak = mine.n;
      return out;
    },

    subscribeChallenge(d, who) {
      const c = db.challenges[d.challengeId];
      if (!c) return err('CHALLENGE_EXPIRED');
      if (c.owner !== who) return err('NOT_OWNER');
      if (!db.appConfig.subscribe || !db.appConfig.subscribe.tmplId) return err('NO_TEMPLATE');
      c.subscribed = true;
      return { ok: true, granted: true };
    },

    joinGroup(d, who) {
      const g = d && d.groupData;
      const data = g && g.mockData ? g.mockData : g;
      if (!data || !data.opengid) return err(data && data.code ? data.code : 40097);
      if (data.chat_type !== undefined && data.chat_type !== 3 && data.chat_type !== 4) return err('NOT_GROUP');
      const ref = hash32('pepper:' + data.opengid).toString(16).padStart(8, '0') + hash32(data.opengid + ':p').toString(16).padStart(8, '0');
      db.groups[ref] = db.groups[ref] || {};
      db.members[ref + '_' + who] = true;
      return { ok: true, groupRef: ref };
    },

    getBoard(d, who) {
      const dateKey = d.dateKey || nowKey();
      const deckDoc = ensureDeck(dateKey);
      if (!deckDoc) return err('DECK_NOT_FOUND');
      if (d.kind === 'group' && !db.members[d.groupRef + '_' + who]) return err('NOT_MEMBER');
      const rows = [];
      Object.keys(db.results).forEach((k) => {
        const r = db.results[k];
        if (r.dateKey !== dateKey) return;
        const row = [hashRow(r.who, deckDoc.salt), r.n, r.endS];
        if (r.dayStreak >= 2) row.push(r.dayStreak);
        rows.push(row);
      });
      db.fakeRows.forEach((f) => rows.push(f));
      rows.sort((a, b) => b[1] - a[1] || a[2] - b[2]);
      const cap = config.boardListCap;
      const mode = rows.length > cap ? (d.kind === 'group' ? 'group' : 'selfOnly') : 'full';
      return { ok: true, dateKey, issueNo: deckDoc.issueNo, theme: themeLabel(dateKey), contentVersion: cv, salt: deckDoc.salt, selfHash: hashRow(who, deckDoc.salt), mode, rows: rows.slice(0, cap) };
    },

    getHistory(d, who) {
      finalizeExpired(who);
      const today = nowKey();
      const keys = publishedKeys().filter((k) => k <= today);
      if (!d.dateKey) {
        const items = keys.slice(-30).reverse().map((k) => {
          const r = db.results[k + '_' + who];
          return { dateKey: k, issueNo: db.decks[k].issueNo, themeLabel: themeLabel(k), mine: r ? { n: r.n } : null, isToday: k === today, inProgress: k === today && !r && !!db.progress[k + '_' + who] };
        });
        const p = player(who);
        return { ok: true, items, bestDays: p.bestDays, bestDaily: p.bestDaily };
      }
      const deckDoc = db.decks[d.dateKey];
      if (!deckDoc || d.dateKey > today) return err('DECK_NOT_FOUND');
      const run = db.progress[d.dateKey + '_' + who];
      const st = db.stats[d.dateKey];
      const out = {
        ok: true, issue: { dateKey: d.dateKey, issueNo: deckDoc.issueNo, themeLabel: themeLabel(d.dateKey) },
        mine: run && run.status === 'ended' ? { streak: run.streak, missK: run.missK } : null,
        stats: st && st.total >= config.rarityMinTotal ? { total: st.total, hist: st.hist.slice() } : null, deck: null, errata: (db.overrides.errata[d.dateKey] || []).slice(),
      };
      if (now() > windowCloseMs(d.dateKey)) {
        out.deck = deckDoc.deck.questions.map((q) => {
          const a = allIdx.byId[q.a];
          const b = allIdx.byId[q.b];
          const m = BY_KEY[a.measure];
          const ans = run ? run.answers.find((x) => x.k === q.k) : null;
          return { k: q.k, a: knownFace(a), b: knownFace(b), answerLabel: b.value > a.value ? m.hi : m.lo, mine: ans ? (ans.ok ? 'correct' : 'miss') : 'unanswered' };
        });
      }
      return out;
    },

    reportFact(d, who) {
      const f = allIdx.byId[d.factId];
      if (!f) return err('UNKNOWN_FACT');
      if (!Array.isArray(d.reasons) || !d.reasons.length || d.reasons.some((r) => REASON_KEYS.indexOf(r) < 0)) return err('INVALID_ACTIONS', 'reasons');
      const day = nowKey();
      const rk = who + '|' + day;
      db.rate[rk] = (db.rate[rk] || 0) + 1;
      if (db.rate[rk] > config.report.perDay) return { ok: true, limited: true };
      const key = d.factId + '_' + who;
      db.reports[key] = { factId: d.factId, who, reasons: d.reasons.slice(), where: d.where, dateKey: d.dateKey, ts: now(), status: 'new' };
      const cutoff = now() - config.report.autoSuspendDays * DAY_MS;
      const reporters = Object.keys(db.reports).filter((k) => db.reports[k].factId === d.factId && db.reports[k].ts >= cutoff).length;
      if (reporters >= config.report.autoSuspendReporters && !db.overrides.suspended.some((s) => s.factId === d.factId)) db.overrides.suspended.push({ factId: d.factId, auto: true, since: now() });
      return { ok: true };
    },

    track(d) {
      for (const e of (d && d.events) || []) db.events.push(e);
      return { ok: true };
    },
  };

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  /** Call a function by name as `who` (default: the player). Never throws. */
  srv.call = function (name, data, who) {
    srv.calls.push({ name, data });
    if (srv.offline) return err('NETWORK', 'offline');
    if (!fns[name]) return err('NO_SUCH_FUNCTION');
    try {
      return fns[name](data || {}, who || ME);
    } catch (e) {
      return err('SERVER_ERROR', String(e && e.message));
    }
  };
  srv.ME = ME;
  srv.dailyIndex = dailyIdx;
  srv.allIndex = allIdx;
  srv.ensureDeck = ensureDeck;
  srv.config = config;
  return srv;
}

module.exports = { createMockServer, syntheticDaily, ME };
