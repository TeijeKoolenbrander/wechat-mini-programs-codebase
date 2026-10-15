/**
 * In-memory stand-in for the cloud functions (spec 14.2), DEV ONLY (js/dev is excluded from
 * release packages: the real answers and rank lists never ship in the client, AC 17).
 *
 * It follows the real contracts and rules (server computes every rank/step/hint, the client
 * sends only a word and a client guess id, spoilers only after finishing, ranked window,
 * rate limits, streaks, boards without words) but the "similarity" comes from the tiny fake
 * fixture in ./mock-fixture. NOT a security boundary.
 *
 * Test hooks: srv.offline, srv.bankEmpty, srv.calls, srv.db, srv.advance via opts.now,
 * srv.seedStats(dateKey, n, steps), srv.addForeignChallenge(...), srv.addBoardRow(...).
 */

const { hash32 } = require('../../core/rng');
const { getConfig, LATEST_CONFIG_VERSION } = require('../../core/config');
const { dateKeyToMs, beijingDateKey, addDays, issueNo, secondsSinceBeijingMidnight, DAY_MS } = require('../../core/date');
const { temperature, bandOf } = require('../../core/temp');
const { normalizeInput } = require('../../core/normalize');
const { createDict } = require('../../core/dict');
const t2s = require('../../core/t2s');
const vocabText = require('../../core/vocab');
const { warmupsFor } = require('../../core/starters');
const H = require('../../core/hints');
const ST = require('../../core/streak');
const SC = require('../../core/schedule');
const P = require('../../core/play');
const FX = require('./mock-fixture');

const ME = 'mock-openid-me';
const OTHER = 'mock-openid-other';

function err(code, msg) {
  return { ok: false, code, msg: msg || code };
}

function createMockServer(opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now());
  const config = getConfig(opts.configVersion || LATEST_CONFIG_VERSION);
  const dict = createDict(opts.vocabText || vocabText);
  const Vf = dict.size;
  const V = Math.max(Vf, opts.virtualV || 30000);
  const launchKey = opts.launchDateKey || config.launchDateKey;

  const db = {
    plays: {},
    stats: {},
    player: { curStreak: 0, bestStreak: 0, lastSolvedDate: null, finishedTotal: 0 },
    challenges: {},
    groups: {},
    members: {},
    events: [],
    anomalies: [],
    boardRows: {}, // dateKey -> extra rows [h, st, n, hi, b, s, k?]
    guessTimes: [],
  };
  const srv = { offline: false, bankEmpty: false, db, calls: [], ME, V };

  // ------------------------------------------------------------ fake similarity

  const groupOf = {};
  Object.keys(FX.GROUPS).forEach((g) => FX.GROUPS[g].forEach((w) => groupOf[w] === undefined && (groupOf[w] = g)));
  const related = new Set(FX.RELATED.map((p) => p.slice().sort().join('|')));

  function score(a, b) {
    if (a === b) return 1e7;
    let s = 0;
    const close = FX.CLOSE[a];
    const ci = close ? close.indexOf(b) : -1;
    if (ci >= 0) s = 5000 - ci * 100;
    else if (groupOf[a] && groupOf[a] === groupOf[b]) s = 1000;
    else if (groupOf[a] && groupOf[b] && related.has([groupOf[a], groupOf[b]].sort().join('|'))) s = 400;
    return s + (hash32(a + '|' + b) % 300);
  }

  const rankCache = {};
  /** sorted[pos] words (pos 0 = the answer), rankOfWord map -> virtual rank */
  function rankList(answer) {
    if (rankCache[answer]) return rankCache[answer];
    const syn = FX.SYNONYMS[answer] || [];
    const sorted = dict.words.slice().sort((x, y) => {
      const sx = syn.indexOf(x) >= 0 ? 1e6 : score(answer, x);
      const sy = syn.indexOf(y) >= 0 ? 1e6 : score(answer, y);
      return sy - sx || dict.idxOf(x) - dict.idxOf(y);
    });
    const rankOf = {};
    const wordAt = {};
    sorted.forEach((w, i) => {
      const pos = i + 1;
      let r = pos;
      if (Vf < V && pos > 100) r = Math.round(100 * Math.pow(V / 100, (pos - 100) / (Vf - 100)));
      rankOf[w] = r;
      wordAt[r] = w;
    });
    rankCache[answer] = { sorted, rankOf, wordAt };
    return rankCache[answer];
  }

  const nearCache = {};
  function nearTop(word) {
    if (nearCache[word]) return nearCache[word];
    const list = dict.words
      .filter((w) => w !== word)
      .sort((x, y) => score(word, y) - score(word, x) || dict.idxOf(x) - dict.idxOf(y))
      .slice(0, config.input.nearTop);
    nearCache[word] = list;
    return list;
  }

  function nearFor(word, guessed) {
    const out = [];
    for (const w of nearTop(word)) {
      if (guessed.indexOf(w) >= 0) continue;
      out.push(w);
      if (out.length >= config.input.assocChips) break;
    }
    return out;
  }

  // ------------------------------------------------------------ puzzles

  function todayKey() {
    return beijingDateKey(now());
  }

  /** -> { id, kind: 'daily'|'archive'|'practice', dateKey?, issueNo?, practiceNo?, answer } | null */
  function puzzleInfo(id) {
    const p = SC.parsePuzzleId(id);
    if (!p) return null;
    if (p.kind === 'daily') {
      const today = todayKey();
      if (p.dateKey < launchKey || p.dateKey > today) return null;
      if (p.dateKey === today && srv.bankEmpty) return null;
      const issue = issueNo(p.dateKey, launchKey);
      return { id, kind: p.dateKey === today ? 'daily' : 'archive', dateKey: p.dateKey, issueNo: issue, answer: FX.DAILY_BANK[(issue - 1) % FX.DAILY_BANK.length] };
    }
    if (p.n > FX.PRACTICE_BANK.length) return null;
    return { id, kind: 'practice', practiceNo: p.n, answer: FX.PRACTICE_BANK[p.n - 1] };
  }

  const finished = (pl) => pl && (pl.status === 'solved' || pl.status === 'gaveup');

  function ensurePlay(info) {
    let pl = db.plays[info.id];
    if (!pl) {
      const t = now();
      pl = db.plays[info.id] = {
        puzzleId: info.id,
        kind: info.kind,
        dateKey: info.dateKey || null,
        ranked: info.kind === 'daily' && SC.inRankedWindow(info.dateKey, t, config.daily.graceMs),
        guesses: [],
        hintsUsed: [],
        adHints: 0,
        best: null,
        status: 'playing',
        startedAt: t,
        lastAt: t,
      };
      if (pl.ranked) statsFor(info.dateKey).started++;
    }
    return pl;
  }

  function statsFor(dateKey) {
    if (!db.stats[dateKey]) db.stats[dateKey] = { started: 0, solved: 0, gaveUp: 0, hist: new Array(81).fill(0) };
    return db.stats[dateKey];
  }

  function playView(pl, info) {
    const view = {
      guesses: pl.guesses.map((g) => {
        const o = { word: g.word, r: g.r, t: g.t, src: g.src };
        if (g.syn) o.syn = true;
        if (g.ch) o.ch = g.ch;
        return o;
      }),
      steps: pl.guesses.length,
      hintsUsed: pl.hintsUsed.slice(),
      adHints: pl.adHints,
      best: pl.best,
      status: pl.status,
    };
    const fc = pl.guesses.find((g) => g.ch);
    if (fc) view.firstChar = fc.ch;
    void info;
    return view;
  }

  function finish(pl, info, status, solvedBy) {
    pl.status = status;
    pl.solvedBy = solvedBy;
    pl.finishedAt = now();
    db.player.finishedTotal++;
    if (pl.ranked) {
      const st = statsFor(pl.dateKey);
      const prevKey = pl.dateKey > launchKey ? addDays(pl.dateKey, -1) : null;
      if (status === 'solved') {
        st.solved++;
        st.hist[Math.min(80, pl.guesses.length)]++;
        Object.assign(db.player, ST.onRankedSolve(db.player, pl.dateKey, prevKey));
        if (pl.guesses.length <= 3 && pl.hintsUsed.length === 0) db.anomalies.push({ kind: 'fast_solve', puzzleId: pl.puzzleId });
      } else {
        st.gaveUp++;
        Object.assign(db.player, ST.onRankedGiveUp(db.player));
      }
    }
    void info;
  }

  function rateCheck(pl) {
    const t = now();
    db.guessTimes = db.guessTimes.filter((x) => t - x < 60000);
    if (db.guessTimes.length >= config.limits.guessesPerMinute) {
      db.anomalies.push({ kind: 'burst', puzzleId: pl && pl.puzzleId });
      return err('RATE_LIMITED', 'too fast');
    }
    if (pl && pl.guesses.length >= config.limits.guessesPerPuzzle) {
      db.anomalies.push({ kind: 'limit', puzzleId: pl.puzzleId });
      return err('GUESS_LIMIT', 'too many guesses');
    }
    return null;
  }

  function bandKey(r) {
    return bandOf(r).key;
  }

  function guessedWords(pl) {
    return pl.guesses.filter((g) => g.word).map((g) => g.word);
  }

  function resultOf(pl, info, g, extra) {
    return Object.assign(
      {
        ok: true,
        word: g.word,
        r: g.r,
        t: g.t,
        band: bandKey(g.r),
        steps: pl.guesses.length,
        best: pl.best,
        dup: false,
        solved: pl.status === 'solved',
        near: nearFor(g.word, guessedWords(pl)),
        ranked: pl.ranked,
      },
      extra || {}
    );
  }

  function isFlagged(info, pl) {
    // window closed mid-play: the play turns unranked (spec 4.1)
    if (pl.ranked && !SC.inRankedWindow(info.dateKey, now(), config.daily.graceMs)) pl.ranked = false;
  }

  // ------------------------------------------------------------ functions

  function hashRow(openid, salt) {
    return (hash32(openid + '|' + salt).toString(16).padStart(8, '0') + hash32(salt + '|' + openid).toString(16).padStart(8, '0')).slice(0, 12);
  }
  const saltFor = (dateKey) => 'salt' + hash32('salt:' + dateKey).toString(16);

  function hintsTotal(pl) {
    return pl.hintsUsed.length + pl.adHints;
  }

  function dailyMy(pl) {
    if (!pl) return { status: 'none', steps: 0, best: null, hints: 0 };
    return { status: pl.status === 'playing' ? 'playing' : pl.status, steps: pl.guesses.length, best: pl.best, hints: hintsTotal(pl) };
  }

  const fns = {
    getDaily() {
      const dateKey = todayKey();
      const info = puzzleInfo(SC.dailyId(dateKey));
      if (!info) return err('DAILY_UNAVAILABLE', 'no daily today');
      const pl = db.plays[info.id];
      const prev = dateKey > launchKey ? addDays(dateKey, -1) : null;
      return {
        ok: true,
        dateKey,
        issueNo: info.issueNo,
        puzzleId: info.id,
        serverNow: now(),
        warmups: warmupsFor(dateKey),
        my: dailyMy(pl),
        myStreak: { current: ST.displayStreak(db.player, dateKey, prev), best: db.player.bestStreak },
        features: { ads: srv.adsConfig || {} },
      };
    },

    startPuzzle(d) {
      let id = d.puzzleId;
      if (d.next) {
        const today = todayKey();
        const past = [];
        for (let k = addDays(today, -1); k >= launchKey; k = addDays(k, -1)) {
          const pid = SC.dailyId(k);
          past.push({ puzzleId: pid, played: finished(db.plays[pid]) });
          if (past.length >= 400) break;
        }
        const prac = FX.PRACTICE_BANK.map((_, i) => ({ puzzleId: SC.practiceId(i + 1), played: finished(db.plays[SC.practiceId(i + 1)]) }));
        id = SC.nextPuzzle(past, prac, d.pool);
        if (!id) return err('PUZZLE_NOT_FOUND', 'none left');
      }
      const info = puzzleInfo(id);
      if (!info) return err('PUZZLE_NOT_FOUND');
      const pl = db.plays[id];
      const key = info.dateKey || 'p' + info.practiceNo;
      const out = {
        ok: true,
        puzzleId: id,
        kind: info.kind,
        ranked: pl ? pl.ranked : info.kind === 'daily' && SC.inRankedWindow(info.dateKey, now(), config.daily.graceMs),
        issueNo: info.issueNo || null,
        practiceNo: info.practiceNo || null,
        dateKey: info.dateKey || null,
        warmups: warmupsFor(key),
        vocabVersion: 1,
        configVersion: config.configVersion,
        play: pl ? playView(pl, info) : { guesses: [], steps: 0, hintsUsed: [], adHints: 0, best: null, status: 'playing' },
      };
      if (pl && finished(pl)) out.answer = info.answer;
      return out;
    },

    guess(d) {
      const info = puzzleInfo(d.puzzleId);
      if (!info) return err('PUZZLE_NOT_FOUND');
      const word = normalizeInput(d.word, t2s);
      if (!dict.has(word)) return err('NOT_IN_VOCAB'); // text is neither stored nor logged
      let pl = db.plays[info.id];
      if (pl && finished(pl)) return err('FINISHED');
      if (pl && d.clientGuessId) {
        const prev = pl.guesses.find((g) => g.cg === d.clientGuessId);
        if (prev) return resultOf(pl, info, prev, { dup: false, solved: pl.status === 'solved', replay: true });
      }
      if (pl && pl.guesses.some((g) => g.word === word)) {
        const g = pl.guesses.find((x) => x.word === word);
        return resultOf(pl, info, g, { dup: true });
      }
      const limited = rateCheck(pl);
      if (limited) return limited;
      pl = ensurePlay(info);
      isFlagged(info, pl);
      db.guessTimes.push(now());
      const rl = rankList(info.answer);
      const r = rl.rankOf[word];
      const syn = (FX.SYNONYMS[info.answer] || []).indexOf(word) >= 0;
      const g = { word, r, t: temperature(r, V), src: d.src || 'typed', cg: d.clientGuessId || null, syn };
      pl.guesses.push(g);
      pl.lastAt = now();
      if (pl.best === null || r < pl.best) pl.best = r;
      const solved = r === 1 || syn;
      if (solved) finish(pl, info, 'solved', syn ? 'synonym' : 'answer');
      return resultOf(pl, info, g, solved ? { solved: true, solvedBy: syn ? 'synonym' : 'answer', answer: info.answer } : {});
    },

    near(d) {
      const info = puzzleInfo(d.puzzleId);
      if (!info) return err('PUZZLE_NOT_FOUND');
      const word = normalizeInput(d.word, t2s);
      if (!dict.has(word)) return err('NOT_IN_VOCAB');
      const pl = db.plays[info.id];
      return { ok: true, near: nearFor(word, pl ? guessedWords(pl) : []) };
    },

    useHint(d) {
      const info = puzzleInfo(d.puzzleId);
      if (!info) return err('PUZZLE_NOT_FOUND');
      let pl = db.plays[info.id];
      if (pl && finished(pl)) return err('FINISHED');
      const source = d.source === 'ad' ? 'ad' : 'ladder';
      const cfg = config.hints;
      const steps = pl ? pl.guesses.length : 0;
      let k = null;
      if (source === 'ad') {
        if (pl ? pl.ranked : info.kind === 'daily' && SC.inRankedWindow(info.dateKey, now(), config.daily.graceMs)) return err('RANKED_NO_AD');
        if (pl && pl.adHints >= cfg.adMaxPerPuzzle) return err('HINT_LIMIT');
      } else {
        const used = pl ? pl.hintsUsed : [];
        if (used.length >= cfg.thresholds.length) return err('HINT_LIMIT');
        k = used.length + 1;
        if (d.k !== undefined && d.k !== k) return err('HINT_LOCKED', 'not the next hint');
        if (steps < cfg.thresholds[k - 1]) return err('HINT_LOCKED');
      }
      pl = ensurePlay(info);
      isFlagged(info, pl);
      const rl = rankList(info.answer);
      if (source === 'ladder' && cfg.kinds[k - 1] === 'firstChar') {
        const ch = Array.from(info.answer)[0];
        pl.guesses.push({ word: null, r: null, t: null, src: 'hint', cg: null, ch });
        pl.hintsUsed.push(k);
        pl.lastAt = now();
        return { ok: true, kind: 'firstChar', ch, steps: pl.guesses.length, best: pl.best, k };
      }
      const best = pl.best === null ? V : pl.best;
      if (H.atBest(best)) return err('AT_BEST');
      const target = source === 'ad' ? H.adTargetRank(best) : H.hintTargetRank(config, k, best);
      const syn = FX.SYNONYMS[info.answer] || [];
      const have = new Set(guessedWords(pl));
      const rank = H.pickHintRank(
        target,
        (x) => {
          const w = rl.wordAt[x];
          return x === 1 || !w || have.has(w) || syn.indexOf(w) >= 0;
        },
        V
      );
      if (rank === null) return err('AT_BEST');
      const word = rl.wordAt[rank];
      const src = source === 'ad' ? 'adhint' : 'hint';
      const g = { word, r: rank, t: temperature(rank, V), src, cg: null };
      pl.guesses.push(g);
      if (source === 'ad') pl.adHints++;
      else pl.hintsUsed.push(k);
      if (pl.best === null || rank < pl.best) pl.best = rank;
      pl.lastAt = now();
      return { ok: true, kind: 'word', word, r: rank, t: g.t, band: bandKey(rank), steps: pl.guesses.length, best: pl.best, k, near: nearFor(word, guessedWords(pl)), ranked: pl.ranked };
    },

    giveUp(d) {
      const info = puzzleInfo(d.puzzleId);
      if (!info) return err('PUZZLE_NOT_FOUND');
      const pl = db.plays[info.id];
      if (!pl || pl.guesses.length < 1) return err('NOT_STARTED', 'need at least one step');
      if (pl.status === 'gaveup' || pl.status === 'solved') return { ok: true, answer: info.answer, steps: pl.guesses.length, best: pl.best, status: pl.status };
      isFlagged(info, pl);
      finish(pl, info, 'gaveup');
      return { ok: true, answer: info.answer, steps: pl.guesses.length, best: pl.best, status: 'gaveup' };
    },

    getReveal(d) {
      const info = puzzleInfo(d.puzzleId);
      if (!info) return err('PUZZLE_NOT_FOUND');
      const pl = db.plays[info.id];
      if (!finished(pl)) return err('REVEAL_LOCKED');
      const rl = rankList(info.answer);
      const syn = FX.SYNONYMS[info.answer] || [];
      const top = [];
      for (let r = 1; r <= 100 && rl.wordAt[r]; r++) top.push([rl.wordAt[r], r, syn.indexOf(rl.wordAt[r]) >= 0]);
      const out = { ok: true, answer: info.answer, top };
      if (info.dateKey) {
        const st = db.stats[info.dateKey];
        if (st && st.solved >= 30) {
          const n = st.solved;
          let acc = 0;
          let median = 0;
          for (let i = 0; i < st.hist.length; i++) {
            acc += st.hist[i];
            if (acc * 2 >= n) {
              median = i;
              break;
            }
          }
          let worse = 0;
          for (let i = pl.guesses.length + 1; i < st.hist.length; i++) worse += st.hist[i];
          out.stats = { finishers: n, medianSteps: median, pctBetter: pl.status === 'solved' ? Math.round((100 * worse) / n) : null };
        }
      }
      return out;
    },

    getHistory(d) {
      const today = todayKey();
      const all = [];
      for (let k = today; k >= launchKey; k = addDays(k, -1)) {
        if (k === today && srv.bankEmpty) continue;
        all.push(k);
      }
      const start = d.cursor ? +d.cursor : 0;
      const page = all.slice(start, start + config.archive.pageSize);
      const items = page.map((k) => {
        const id = SC.dailyId(k);
        const info = puzzleInfo(id);
        const pl = db.plays[id];
        const it = { puzzleId: id, issueNo: info.issueNo, dateKey: k };
        if (pl) it.my = { status: pl.status, steps: pl.guesses.length };
        if (finished(pl)) it.answer = info.answer;
        return it;
      });
      const next = start + page.length < all.length ? String(start + page.length) : null;
      const done = FX.PRACTICE_BANK.filter((_, i) => finished(db.plays[SC.practiceId(i + 1)])).length;
      return { ok: true, items, nextCursor: next, bestStreak: db.player.bestStreak, practice: { done, total: FX.PRACTICE_BANK.length } };
    },

    createChallenge(d) {
      const info = puzzleInfo(d.puzzleId);
      if (!info) return err('PUZZLE_NOT_FOUND');
      const pl = db.plays[info.id];
      if (!finished(pl)) return err('NOT_FINISHED');
      const id = hash32('ch:' + info.id + ':' + ME).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
      if (!db.challenges[id]) db.challenges[id] = challengeFromPlay(id, ME, pl, info);
      return { ok: true, challengeId: id };
    },

    getChallenge(d) {
      const c = db.challenges[d.challengeId];
      if (!c) return err('CHALLENGE_NOT_FOUND');
      const info = puzzleInfo(c.puzzleId);
      if (!info) return err('PUZZLE_NOT_FOUND');
      const mine = db.plays[c.puzzleId];
      const own = c.owner === ME;
      const out = {
        ok: true,
        puzzleId: c.puzzleId,
        kind: info.kind,
        issueNo: info.issueNo || null,
        practiceNo: info.practiceNo || null,
        owner: { status: c.status, steps: c.steps, hints: c.hints, temps: c.temps.slice() },
        own: own ? { finishers: c.finishers, bestSteps: c.bestSteps } : null,
        countsAsToday: info.kind === 'daily' && !mine && SC.inRankedWindow(info.dateKey, now(), config.daily.graceMs),
        alreadyFinished: !!finished(mine),
      };
      if (!own && finished(mine)) {
        out.ownerWords = c.words.slice();
        if (!c.counted) {
          c.counted = true;
          c.finishers++;
          c.bestSteps = c.bestSteps === null ? mine.guesses.length : Math.min(c.bestSteps, mine.guesses.length);
        }
      }
      return out;
    },

    joinGroup(d) {
      const g = d && d.groupData;
      const data = g && g.mockData ? g.mockData : g;
      if (!data || !data.opengid) return err(data && data.code ? data.code : 'BAD_CLOUDID');
      if (data.chat_type !== undefined && data.chat_type !== 3 && data.chat_type !== 4) return err('NOT_GROUP');
      const ref = hash32('pepper:' + data.opengid).toString(16).padStart(8, '0') + hash32(data.opengid + ':p').toString(16).padStart(8, '0');
      db.groups[ref] = db.groups[ref] || {};
      db.members[ref + '_' + ME] = true;
      return { ok: true, groupRef: ref };
    },

    getBoard(d) {
      const today = todayKey();
      const dateKey = d.dateKey || today;
      if (dateKey !== today && dateKey !== addDays(today, -1)) return err('PUZZLE_NOT_FOUND');
      const info = puzzleInfo(SC.dailyId(dateKey));
      if (!info) return err('PUZZLE_NOT_FOUND');
      if (d.kind === 'group' && !db.members[d.groupRef + '_' + ME]) return err('NOT_MEMBER');
      const salt = saltFor(dateKey);
      const rows = [];
      const pl = db.plays[info.id];
      if (pl && pl.ranked && pl.guesses.length) {
        const st = pl.status === 'solved' ? 1 : pl.status === 'gaveup' ? 3 : 2;
        const row = [hashRow(ME, salt), st, pl.guesses.length, hintsTotal(pl), pl.best, secondsSinceBeijingMidnight(pl.finishedAt || pl.lastAt)];
        if (db.player.curStreak >= 2 && st === 1) row.push(db.player.curStreak);
        rows.push(row);
      }
      (db.boardRows[dateKey] || []).forEach((r) => rows.push(r.slice()));
      const cap = config.boardListCap;
      const mode = rows.length > cap ? (d.kind === 'group' ? 'group' : 'selfOnly') : 'full';
      return { ok: true, dateKey, issueNo: info.issueNo, salt, selfHash: hashRow(ME, salt), mode, rows: rows.slice(0, cap) };
    },

    track(d) {
      const evs = (d && d.events) || [];
      for (const e of evs) {
        const props = e.props || {};
        if ('text' in props || 'input' in props || 'query' in props) return err('BAD_EVENT', 'typed text is not accepted');
      }
      for (const e of evs) db.events.push(e);
      return { ok: true };
    },
  };

  function challengeFromPlay(id, owner, pl, info) {
    const entries = pl.guesses.map((g) => P.toEntry({ word: g.word, r: g.r, t: g.t, src: g.src, ch: g.ch }, V));
    return {
      id,
      owner,
      puzzleId: info.id,
      status: pl.status,
      steps: pl.guesses.length,
      hints: hintsTotal(pl),
      temps: P.stepTemps(entries),
      words: pl.guesses.filter((g) => g.word).map((g) => g.word),
      finishers: 0,
      bestSteps: null,
      counted: false,
    };
  }

  /** Test hook: a challenge made by another player (the caller has not played it). */
  srv.addForeignChallenge = function (o) {
    const id = o.id || hash32('foreign:' + o.puzzleId).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
    db.challenges[id] = {
      id,
      owner: OTHER,
      puzzleId: o.puzzleId,
      status: o.status || 'solved',
      steps: o.steps || 21,
      hints: o.hints || 0,
      temps: o.temps || [10, 30, 60, 100],
      words: o.words || ['蔬菜', '番茄'],
      finishers: 0,
      bestSteps: null,
      counted: false,
    };
    return id;
  };

  /** Test hook: other players' finished ranked plays for the day's stats (>= 30 shows the stats lines). */
  srv.seedStats = function (dateKey, n, steps) {
    const st = statsFor(dateKey);
    st.solved += n;
    st.started += n;
    st.hist[Math.min(80, steps || 21)] += n;
  };

  /** Test hook: another player's board row. */
  srv.addBoardRow = function (dateKey, who, status, steps, hints, best, secs, streak) {
    const row = [hashRow(OTHER + who, saltFor(dateKey)), status, steps, hints, best, secs];
    if (streak) row.push(streak);
    (db.boardRows[dateKey] = db.boardRows[dateKey] || []).push(row);
  };

  /** Call a function by name. Never throws. */
  srv.call = function (name, data) {
    srv.calls.push({ name, data });
    if (srv.offline) return err('NETWORK', 'offline');
    if (!fns[name]) return err('NO_SUCH_FUNCTION');
    try {
      return fns[name](data || {});
    } catch (e) {
      return err('INTERNAL', String(e && e.message));
    }
  };
  srv.answerOf = (puzzleId) => {
    const i = puzzleInfo(puzzleId);
    return i ? i.answer : null;
  };
  srv.rankOf = (puzzleId, word) => {
    const i = puzzleInfo(puzzleId);
    return i ? rankList(i.answer).rankOf[word] : null;
  };
  srv.wordAtRank = (puzzleId, r) => {
    const i = puzzleInfo(puzzleId);
    return i ? rankList(i.answer).wordAt[r] : null;
  };
  srv.dict = dict;
  srv.DAY_MS = DAY_MS;
  srv.dateKeyToMs = dateKeyToMs;
  return srv;
}

module.exports = { createMockServer, ME };
