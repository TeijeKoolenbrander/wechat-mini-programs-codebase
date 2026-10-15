'use strict';
// getChallenge: the challenge-entry model (spec 5.4, 6.8, 11.2). SPOILER LOCK: this response never contains the
// owner's answers, any fact label/value or any part of a daily deck. It carries the owner's 连对, the deck kind and
// the counting rule. Free challenges also return the seed/group/versions the recipient needs to replay the SAME
// free deck (the free pool is public and bundled; nothing secret).
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const challenges = require('./common/challenges');
const { now, fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const id = input.challengeId(event.challengeId);
  const nowMs = now();
  const ch = await store.getDoc('challenges', id);
  if (!ch || nowMs > ch.expiresAt) fail('CHALLENGE_EXPIRED', 'challenge expired or missing', { status: 'expired' });

  const base = { ok: true, challengeId: id, kind: ch.kind, ownerStreak: ch.ownerStreak, expiresAt: ch.expiresAt };
  if (ch.kind === 'daily') {
    const deck = await daily.getDeck(ch.dateKey);
    if (deck) Object.assign(base, { dateKey: ch.dateKey, issueNo: deck.issueNo, theme: deck.theme, themeLabel: deck.themeLabel });
  } else {
    base.group = ch.group;
    base.ownerLifeUsed = !!ch.ownerLifeUsed;
  }

  if (ch.ownerOpenid === openid) {
    return { ...base, status: 'own', answerCount: ch.answerCount, bestAnswer: ch.bestAnswer, countsAsDaily: false, isFriendly: true };
  }
  if (ch.kind === 'free' && !(core.isKnownContentVersion(ch.contentVersion) && core.isKnownConfigVersion(ch.configVersion))) {
    return { ...base, status: 'retired', countsAsDaily: false, isFriendly: true };
  }
  const prior = await challenges.priorAnswer(openid, id);
  if (prior) {
    const d = prior.doc;
    return {
      ...base, status: 'answered', myStreak: prior.source === 'runs' ? d.serverStreak : d.streak,
      runOpen: prior.source === 'run_progress' && d.status === 'open', countsAsDaily: false, isFriendly: true,
    };
  }
  if (ch.kind === 'free') {
    return {
      ...base, status: 'ready', seed: ch.seed, contentVersion: ch.contentVersion, configVersion: ch.configVersion,
      countsAsDaily: false, isFriendly: true,
    };
  }
  const countsAsDaily = await challenges.countsAsDaily(ch, openid, nowMs);
  return { ...base, status: 'ready', countsAsDaily, isFriendly: !countsAsDaily };
});
