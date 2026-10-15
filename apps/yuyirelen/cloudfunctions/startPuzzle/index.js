'use strict';
// startPuzzle: open (or resume) a puzzle and return the caller's play (spec 14.2).
// It does NOT create a play: opening without guessing doesn't count as playing (the first guess does).
// {next:true} resolves 再来一题: the newest unfinished past daily, else the lowest unfinished practice puzzle (5.3);
// {next:true, pool:'practice'} skips the dailies (去练习).
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const answers = require('./common/answers');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const rules = require('./common/rules');
const { fail, now } = require('./common/util');

const NEXT_SCAN = 100;

async function finishedPlayIds(ids) {
  const _ = store._();
  const out = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const r = await store.db().collection('plays').where({ _id: _.in(ids.slice(i, i + 50)) }).field({ puzzleId: true, status: true }).limit(50).get();
    for (const p of r.data) if (p.status === 'solved' || p.status === 'gaveup') out.add(p.puzzleId);
  }
  return out;
}

async function newestUnfinishedPastDaily(openid, nowMs) {
  const _ = store._();
  const today = coreapi.dateKeyAt(nowMs);
  const past = await store.db().collection('daily_puzzles').where({ _id: _.lt(today) }).orderBy('_id', 'desc').limit(NEXT_SCAN).field({ _id: true }).get();
  const keys = past.data.map((d) => d._id).filter((k) => rules.windowState(k, nowMs) === 'late');
  const done = await finishedPlayIds(keys.map((k) => plays.playId('d' + k, openid)));
  for (const k of keys) if (!done.has('d' + k)) return 'd' + k;
  return null;
}

async function lowestUnfinishedPractice(openid, nowMs) {
  const _ = store._();
  const fin = await store.queryAll('plays', { openid, kind: 'practice', status: _.neq('playing') }, { field: { puzzleId: true } });
  const finished = new Set(fin.map((p) => p.puzzleId));
  for (let n = 1; n < 100000; n++) {
    if (finished.has('p' + n)) continue;
    try {
      await puzzles.load('p' + n, nowMs);
      return 'p' + n;
    } catch (e) {
      if (e.code === 'PUZZLE_NOT_FOUND') return null; // end of the pool
      throw e;
    }
  }
  return null;
}

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  let puzzleId;
  if (event.next === true) {
    puzzleId = (event.pool !== 'practice' && (await newestUnfinishedPastDaily(openid, nowMs))) || (await lowestUnfinishedPractice(openid, nowMs));
    if (!puzzleId) fail('PUZZLE_NOT_FOUND', 'nothing left to play');
  } else puzzleId = input.puzzleId(event.puzzleId);

  const puzzle = await puzzles.load(puzzleId, nowMs);
  const vocab = coreapi.vocab(puzzle.vocabVersion);
  const play = await store.getDoc('plays', plays.playId(puzzleId, openid));

  const ranked = play ? play.ranked && rules.inRankedWindow(play.dateKey, nowMs) : puzzle.kind === 'daily';
  const needsAnswer = !!play && (play.hintsUsed.includes(3) || plays.isFinished(play));
  const meta = needsAnswer ? await answers.getMeta(puzzle.answerRef) : null;
  const firstChar = meta && play.hintsUsed.includes(3) ? Array.from(meta.word)[0] : undefined;

  const out = {
    ok: true,
    puzzleId,
    kind: play ? play.kind : puzzle.kind,
    ranked,
    dateKey: puzzle.dateKey || null,
    issueNo: puzzle.issueNo || null,
    practiceNo: puzzle.practiceNo || null,
    warmups: puzzle.warmups,
    vocabVersion: puzzle.vocabVersion,
    configVersion: puzzle.configVersion,
    serverNow: nowMs,
    play: {
      guesses: play ? plays.viewGuesses(play, vocab, firstChar) : [],
      steps: play ? play.steps : 0,
      hintsUsed: play ? play.hintsUsed : [],
      adHints: play ? play.adHints : 0,
      best: play ? play.best : null,
      status: play ? play.status : 'playing',
    },
  };
  if (firstChar) out.play.firstChar = firstChar;
  if (play && plays.isFinished(play)) out.answer = meta.word; // finished plays only (spoiler rule 14.4)
  return out;
});
