'use strict';
// getChallenge: §13 challenge-entry model plus rounds. The sharer's lineup is withheld until the
// caller has answered (a runs row with this challengeId and the caller's openid exists).
const store = require('./common/store');
const input = require('./common/input');
const rules = require('./common/rules');
const { now, fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const id = input.challengeId(event.challengeId);
  const nowMs = now();
  const ch = await store.getDoc('challenges', id);
  if (!ch || nowMs > ch.expiresAt) fail('CHALLENGE_EXPIRED', 'challenge expired or missing', { status: 'expired' });

  const base = { ok: true, mode: ch.mode, theirRecord: ch.record, dateKey: ch.dateKey || null };

  if (ch.ownerOpenid === openid) {
    return { ...base, status: 'own', answerCount: ch.answerCount, bestAnswer: ch.bestAnswer, countsAsDaily: false, isFriendly: true };
  }
  const answered = await rules.priorAnswer(openid, id);
  if (answered) {
    return {
      ...base, status: 'answered', theirLineup: ch.lineup, myRecord: answered.serverRecord,
      countsAsDaily: false, isFriendly: true,
    };
  }
  const countsAsDaily = await rules.challengeCountsAsDaily(ch, openid, nowMs);
  return { ...base, status: 'ready', rounds: ch.rounds, countsAsDaily, isFriendly: !countsAsDaily };
});
