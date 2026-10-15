'use strict';
// Free-run replay (spec 5.3, 5.5, 11.3). The server rebuilds the deck from (seed, versions, group) and
// replays the answers; the SERVER streak is authoritative for everything (bests, challenges).
const core = require('./coreapi');
const { fail } = require('./util');

/**
 * @param deck [{a, b}] fact objects (free pool)
 * @param answers [{k, c}] with k = 1..m in order
 * @param lifeAtK null or the k of the FIRST miss, which 再答一次 forgives (the missed question does not count)
 * @returns {streak, lifeUsed, ended, cleared}
 * Rejects (INVALID_ACTIONS): an answer after the run should have ended, a life not at the first miss,
 * more than one life (the field is a single number), answers beyond the deck.
 */
function replayFree(deck, answers, lifeAtK) {
  if (answers.length > deck.length) fail('INVALID_ACTIONS', 'more answers than questions');
  let streak = 0;
  let lifeUsed = false;
  let ended = false;
  let cleared = false;
  for (const ans of answers) {
    if (ended) fail('INVALID_ACTIONS', 'answer after the run ended');
    const q = deck[ans.k - 1];
    const correct = ans.c === core.correctChoice(q.a, q.b);
    if (correct) {
      streak++;
      if (ans.k === deck.length) { ended = true; cleared = true; }
    } else if (lifeAtK === ans.k && !lifeUsed) {
      lifeUsed = true; // forgiven: does not count, the run continues with the next question
      if (ans.k === deck.length) ended = true;
    } else {
      ended = true;
    }
  }
  if (lifeAtK !== null && !lifeUsed) fail('INVALID_ACTIONS', 'lifeAtK is not at a miss');
  return { streak, lifeUsed, ended, cleared };
}

module.exports = { replayFree };
