'use strict';
// setClue: host only. `preset` needs a clue item of the round's own spectrum (text copied from curated content);
// `chat` means the host speaks in the WeChat chat (no text enters the game, PD-7). Opens the round.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const rounds = require('./common/rounds');
const { AppError, fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const roundId = input.roundId(event.roundId);
  const clueMode = input.clueMode(event.clueMode);
  const nowMs = now();
  const r = await rounds.loadRound(roundId, openid, nowMs);
  if (r.hostOpenid !== openid) fail('NOT_HOST', 'only the host can set the clue');

  let clueItemId = null;
  let clueText = null;
  if (clueMode === 'preset') {
    clueItemId = input.itemId(event.clueItemId);
    const item = core.getItem(clueItemId);
    if (!item || item.spectrumId !== r.spectrumId) fail('INVALID_INPUT', 'clue item does not belong to this spectrum');
    clueText = item.text;
  } else if (event.clueItemId !== undefined && event.clueItemId !== null) {
    fail('INVALID_INPUT', 'chat clues carry no item');
  }

  await store.db().runTransaction(async (t) => {
    const cur = await store.getDocT(t, 'rounds', roundId);
    if (!cur) throw new AppError('ROUND_NOT_FOUND', 'no such round');
    if (cur.status !== 'draft' && cur.status !== 'open') throw new AppError('INVALID_INPUT', 'round is closed');
    if (cur.guessCount > 0) throw new AppError('INVALID_INPUT', 'the clue cannot change after guesses');
    await t.collection('rounds').doc(roundId).update({ data: { clueMode, clueItemId, clueText, status: 'open', openedAt: cur.openedAt || nowMs } });
  });
  return { ok: true };
});
