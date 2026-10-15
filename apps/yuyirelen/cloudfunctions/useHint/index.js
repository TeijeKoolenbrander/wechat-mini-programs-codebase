'use strict';
// useHint: the free hint ladder (10/20/30/40) and unranked-only rewarded hints (spec 4.4, 14.2).
// Hints are chosen, counted (one step each) and limited here; the client cannot ask for a specific word.
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const answers = require('./common/answers');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const rules = require('./common/rules');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const puzzleId = input.puzzleId(event.puzzleId);
  const source = input.hintSource(event.source);
  const askedK = input.optHintK(event.k);
  const nowMs = now();

  const puzzle = await puzzles.load(puzzleId, nowMs);
  const vocab = coreapi.vocab(puzzle.vocabVersion);
  const entry = await answers.load(puzzle.answerRef, vocab.V);
  const syn = answers.synonymSet(entry.meta);

  const result = await plays.mutate(openid, puzzle, nowMs, async ({ t, play, created }) => {
    if (play.status !== 'playing') fail('FINISHED', 'puzzle already finished');
    let hint;
    if (source === 'ad') {
      // rewarded hints never touch a ranked play, so ads cannot buy rank (PO-4)
      if (play.ranked) fail('RANKED_NO_AD', 'rewarded hints are for unranked play');
      if (play.adHints >= rules.LIMITS.adHintsPerPuzzle) fail('HINT_LIMIT', 'rewarded hint limit reached');
      hint = { k: null, cap: null, word: true };
    } else {
      if (play.hintsUsed.length >= rules.HINTS.length) fail('HINT_LIMIT', 'all hints used');
      const next = play.hintsUsed.length + 1;
      if (created || (askedK != null && askedK !== next)) fail('HINT_LOCKED', 'hint not available');
      const def = rules.HINTS[next - 1];
      if (play.steps < def.at) fail('HINT_LOCKED', 'hint not available yet');
      hint = { k: next, cap: def.cap, word: def.cap != null };
    }

    const prevSteps = play.steps;
    let row;
    let payload;
    if (hint.word) {
      const taken = new Set(play.guesses.filter((g) => g.w >= 0).map((g) => g.r));
      for (const s of syn) taken.add(entry.ranks[s]); // a synonym would solve the puzzle: never hand one out
      const rank = rules.pickHintRank({ best: play.best, cap: hint.cap, V: vocab.V, taken });
      if (rank == null) fail('AT_BEST', 'already one step away');
      await plays.rateLimitT(t, openid, nowMs);
      const w = entry.inverse[rank - 1];
      row = { w, r: rank, t: rules.tempOf(rank, vocab.V), src: source === 'ad' ? 'adhint' : 'hint', ts: nowMs };
      if (hint.k) row.k = hint.k;
      payload = { kind: 'word', row };
    } else {
      await plays.rateLimitT(t, openid, nowMs);
      const bestT = play.best == null ? 0 : rules.tempOf(play.best, vocab.V);
      row = { w: -1, r: 0, t: bestT, src: 'hint', k: hint.k, ts: nowMs };
      payload = { kind: 'firstChar', row, ch: Array.from(entry.meta.word)[0] };
    }
    play.guesses.push(row);
    play.steps = play.guesses.length;
    if (hint.k) play.hintsUsed.push(hint.k);
    else play.adHints += 1;
    if (row.w >= 0) play.best = play.best == null ? row.r : Math.min(play.best, row.r);
    payload.hintUnlocked = rules.newlyUnlocked(prevSteps, play.steps, play.hintsUsed);
    return { data: payload };
  });

  await plays.recordDailyStats(result);
  const { play, data } = result;
  const out = { ok: true, kind: data.kind, steps: play.steps, best: play.best, ranked: play.ranked };
  if (data.row.k) out.k = data.row.k;
  if (data.kind === 'word') {
    out.word = vocab.words[data.row.w];
    out.r = data.row.r;
    out.t = data.row.t;
    out.band = rules.bandOf(data.row.r);
    out.near = plays.chipsFor(vocab, coreapi, data.row.w, play);
  } else {
    out.ch = data.ch;
  }
  if (data.hintUnlocked) out.hintUnlocked = data.hintUnlocked;
  return out;
});
