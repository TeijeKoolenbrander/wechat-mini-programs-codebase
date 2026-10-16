'use strict';
// getChallenge: §13 challenge-entry model plus rounds. The sharer's lineup is withheld until the
// caller has answered (a runs row with this challengeId and the caller's openid exists).
const core = require('./common/coreapi');
const store = require('./common/store');
const limits = require('./common/limits');
const input = require('./common/input');
const rules = require('./common/rules');
const { now, fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const id = input.challengeId(event.challengeId);
  const nowMs = now();
  const ch = await store.getDoc('challenges', id);
  if (!ch || nowMs > ch.expiresAt) fail('CHALLENGE_EXPIRED', 'challenge expired or missing', { status: 'expired' });

  let variant = 'standard';
  if (ch.mode === 'daily' && ch.dateKey) {
    const sd = await store.getDoc('daily_seeds', ch.dateKey);
    variant = (sd && sd.variant) || core.variantFor(ch.dateKey);
  }
  const base = { ok: true, mode: ch.mode, theirRecord: ch.record, dateKey: ch.dateKey || null, variant };

  if (ch.ownerOpenid === openid) {
    const grant = await store.getDoc('sub_grants', id);
    return {
      ...base, status: 'own', answerCount: ch.answerCount, bestAnswer: ch.bestAnswer, countsAsDaily: false, isFriendly: true,
      subscribe: { granted: !!grant },
    };
  }
  const answered = await rules.priorAnswer(openid, id);
  if (answered) {
    const locked = await rules.dailyLocked(ch.mode === 'daily' ? ch.dateKey : null, openid, nowMs);
    return {
      ...base, status: 'answered', theirLineup: locked ? null : ch.lineup, lineupLocked: locked, myRecord: answered.serverRecord,
      countsAsDaily: false, isFriendly: true,
    };
  }
  const countsAsDaily = await rules.challengeCountsAsDaily(ch, openid, nowMs);
  // progressive delivery (spec 5.2): a challenge that counts as today's daily gets its rounds from startRun/getRound
  const out = { ...base, status: 'ready', countsAsDaily, isFriendly: !countsAsDaily };
  if (!countsAsDaily) out.rounds = ch.rounds;
  return out;
}, { rate: limits.rateOf('getChallenge') });
