'use strict';
// near: the 联想词 for a word (spec 4.2, 14.2): its own top unguessed neighbours from near.bin.
// Answer-independent, so it leaks nothing about the secret word. No answer data is loaded here.
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const rules = require('./common/rules');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const puzzleId = input.puzzleId(event.puzzleId);
  const text = input.wordText(event.word);
  const puzzle = await puzzles.load(puzzleId, now());
  const vocab = coreapi.vocab(puzzle.vocabVersion);
  const idx = rules.lookupWord(vocab, text);
  const play = await store.getDoc('plays', plays.playId(puzzleId, openid));
  return { ok: true, near: plays.chipsFor(vocab, coreapi, idx, play) };
});
