'use strict';
// The play document and its transactional updates (spec 14.1 `plays`, 14.3).
//
// One play per player per puzzle: _id = <puzzleId>_<openid> (deterministic, so a reinstall resumes the same play
// and a second ranked daily is impossible). `guesses` is the complete step log, in order:
//   {w: vocabIdx | -1, r: rank (0 for the first-character hint), t: temperature, src, cg?, k?, sv?, ts}
// steps === guesses.length (every accepted guess and every hint is one step).
const store = require('./store');
const puzzles = require('./puzzles');
const rules = require('./rules');
const { fail, now } = require('./util');

const playId = (puzzleId, openid) => `${puzzleId}_${openid}`;

function freshPlay(openid, puzzle, nowMs) {
  return {
    _id: playId(puzzle.puzzleId, openid),
    openid,
    puzzleId: puzzle.puzzleId,
    kind: puzzle.kind,
    // ranked is decided by server time at the first step (spec 5.2) and only ever turns false afterwards
    ranked: puzzle.kind === 'daily' && rules.inRankedWindow(puzzle.dateKey, nowMs),
    dateKey: puzzle.dateKey || null,
    guesses: [],
    steps: 0,
    hintsUsed: [],
    adHints: 0,
    best: null,
    status: 'playing',
    startedAt: nowMs,
    lastAt: nowMs,
    vocabVersion: puzzle.vocabVersion,
    configVersion: puzzle.configVersion,
  };
}

const isFinished = (play) => play.status === 'solved' || play.status === 'gaveup';

/** per-player fixed-window limiter inside the caller's transaction (spec 4.2, PO-14) */
async function rateLimitT(t, openid, nowMs) {
  const minute = Math.floor(nowMs / 60000);
  const id = `guess_${openid}_${minute}`;
  const cur = await store.getDocT(t, 'rate_limits', id);
  const count = cur ? cur.count : 0;
  if (count + 1 > rules.LIMITS.guessesPerMinute) fail('RATE_LIMITED', 'rate limited');
  await t.collection('rate_limits').doc(id).set({ data: { bucket: 'guess', openid, count: count + 1, expireAt: nowMs + 3600e3 } });
}

/** apply the finish side effects that live in documents other than the play (inside the transaction) */
async function finishEffectsT(t, openid, play, prevKey, nowMs, outcome) {
  const _ = store._();
  const cur = await store.getDocT(t, 'player_stats', openid);
  const s = cur || { _id: openid, curStreak: 0, bestStreak: 0, lastSolvedDate: null, dailiesSolved: 0, dailiesGaveUp: 0, finishedTotal: 0, flags7d: [], suspect: false };
  s.finishedTotal = (s.finishedTotal || 0) + 1;
  if (play.ranked && play.dateKey) {
    Object.assign(s, rules.nextStreak(s, play.dateKey, prevKey, outcome));
    if (outcome === 'solved') {
      s.dailiesSolved = (s.dailiesSolved || 0) + 1;
      play.streakAt = s.curStreak;
    } else s.dailiesGaveUp = (s.dailiesGaveUp || 0) + 1;
  }
  s.updatedAt = nowMs;
  if (cur) {
    const data = { ...s };
    delete data._id;
    await t.collection('player_stats').doc(openid).set({ data });
  } else await t.collection('player_stats').add({ data: s });

  // challenge bookkeeping (non-owner finishing a challenged puzzle): counter + best steps
  if (play.viaChallenge) {
    const ch = await store.getDocT(t, 'challenges', play.viaChallenge);
    if (ch && ch.ownerOpenid !== openid && ch.puzzleId === play.puzzleId) {
      const data = { finishers: _.inc(1) };
      if (outcome === 'solved' && (ch.bestSteps == null || play.steps < ch.bestSteps)) data.bestSteps = play.steps;
      await t.collection('challenges').doc(ch._id).update({ data });
    }
  }
}

/**
 * Run `body` against the caller's play inside one transaction.
 * body({t, play, created}) mutates `play` and returns {data, finish?: 'solved'|'gaveup', dirty?: false}.
 * dirty:false means nothing is written (idempotent replays, duplicates).
 * @returns {{data, play, created, finish}}
 */
async function mutate(openid, puzzle, nowMs, body) {
  const id = playId(puzzle.puzzleId, openid);
  const prevKey = puzzle.dateKey ? await puzzles.prevPublished(puzzle.dateKey) : null;
  let out = null;
  await store.db().runTransaction(async (t) => {
    out = null;
    let play = await store.getDocT(t, 'plays', id);
    const created = !play;
    if (created) play = freshPlay(openid, puzzle, nowMs);
    else if (play.ranked && !rules.inRankedWindow(play.dateKey, nowMs)) play.ranked = false; // window closed: unranked from now on
    const res = await body({ t, play, created });
    if (res.dirty === false) {
      out = { data: res.data, play, created: false, finish: null };
      return;
    }
    play.lastAt = nowMs;
    if (res.finish) {
      play.status = res.finish;
      play.finishedAt = nowMs;
      await finishEffectsT(t, openid, play, prevKey, nowMs, res.finish);
    }
    if (created) await t.collection('plays').add({ data: play });
    else {
      const data = { ...play };
      delete data._id;
      await t.collection('plays').doc(id).set({ data });
    }
    out = { data: res.data, play, created, finish: res.finish || null };
  });
  return out;
}

/** aggregate counters for ranked dailies; outside the transaction so one hot document can never fail a player's step */
async function recordDailyStats(result) {
  const { play, created, finish } = result;
  if (!play.dateKey || !play.ranked) return;
  const _ = store._();
  try {
    await store.addIfAbsent('daily_stats', { _id: play.dateKey, solved: 0, gaveUp: 0, started: 0, stepsHist: new Array(rules.LIMITS.histMax + 1).fill(0) });
    const data = {};
    if (created) data.started = _.inc(1);
    if (finish === 'solved') {
      data.solved = _.inc(1);
      data[`stepsHist.${rules.histBucket(play.steps)}`] = _.inc(1);
    } else if (finish === 'gaveup') data.gaveUp = _.inc(1);
    if (Object.keys(data).length) await store.db().collection('daily_stats').doc(play.dateKey).update({ data });
  } catch (e) {
    console.warn('daily_stats update failed', store.errText(e));
  }
}

/** observe-only anomaly flag (spec 14.5): never changes a result, rank or streak; never throws */
async function flag(openid, puzzleId, kind, detail) {
  try {
    const nowMs = now();
    const fresh = await store.addIfAbsent('anomalies', { _id: `${openid}_${puzzleId}_${kind}`, openid, puzzleId, kind, detail: detail || null, ts: nowMs });
    if (!fresh) return;
    const cutoff = nowMs - 7 * 86400e3;
    const cur = await store.getDoc('player_stats', openid);
    const flags = ((cur && cur.flags7d) || []).filter((x) => x >= cutoff);
    flags.push(nowMs);
    const patch = { flags7d: flags, suspect: flags.length >= 5 };
    if (cur) await store.db().collection('player_stats').doc(openid).update({ data: patch });
    else await store.addIfAbsent('player_stats', { _id: openid, curStreak: 0, bestStreak: 0, lastSolvedDate: null, dailiesSolved: 0, dailiesGaveUp: 0, finishedTotal: 0, updatedAt: nowMs, ...patch });
  } catch (e) {
    console.warn('flag failed', kind, store.errText(e));
  }
}

/** the unguessed neighbours of `idx` for the 联想词 strip (answer-independent), as words */
function chipsFor(vocab, coreapi, idx, play, limit = rules.LIMITS.chips) {
  const used = new Set(play ? play.guesses.map((g) => g.w) : []);
  used.add(idx);
  const out = [];
  for (const n of coreapi.neighbours(vocab, idx)) {
    if (used.has(n)) continue;
    out.push(vocab.words[n]);
    if (out.length >= limit) break;
  }
  return out;
}

/** ladder rows the client may see: words, ranks and temperatures only (no answer, no ids) */
function viewGuesses(play, vocab) {
  return play.guesses.filter((g) => g.w >= 0).map((g) => ({ word: vocab.words[g.w], r: g.r, t: g.t, src: g.src }));
}

module.exports = { playId, freshPlay, isFinished, rateLimitT, mutate, recordDailyStats, flag, chipsFor, viewGuesses };
