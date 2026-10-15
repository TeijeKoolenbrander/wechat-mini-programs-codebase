'use strict';
// startRun: starts or resumes a server-stepped daily-deck run (spec 5.2, 5.4, 11.2). Returns question 1
// (or the current open question + the answered pairs on resume). Free-seed challenges never call this.
//   ranked   : today's deck, the caller has no ranked run yet (home 开始, or a challenge on today's deck)
//   friendly : a challenge on a past deck, or on today's deck after the caller already has a ranked run
const store = require('./common/store');
const core = require('./common/coreapi');
const input = require('./common/input');
const daily = require('./common/daily');
const runs = require('./common/runs');
const challenges = require('./common/challenges');
const { fail, now, configuredTimeoutMs, addDaysKey } = require('./common/util');

async function payload(run, deck, resumed, challenge) {
  const out = {
    ok: true, resumed, clientRunId: run.clientRunId, kind: run.kind, ranked: run.ranked, friendly: !run.ranked,
    dateKey: run.dateKey, issueNo: deck.issueNo, theme: deck.theme, themeLabel: deck.themeLabel, deckLength: deck.questions.length,
    k: run.k, streak: run.streak, question: await runs.questionPayload(deck, run.k),
    answered: await runs.answeredPairs(deck, run),
  };
  if (challenge) out.challenge = { ownerStreak: challenge.ownerStreak };
  return out;
}

exports.main = store.handler(async (event, { openid, startedAt }) => {
  const mode = input.startMode(event.mode);
  const clientRunId = input.clientRunId(event.clientRunId);
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);
  await store.rateLimit(openid, 'start', 1, 30);

  let dateKey;
  let kind;
  let ranked;
  let challenge = null;
  let deck;

  if (mode === 'daily') {
    dateKey = input.optDateKey(event.dateKey) || today;
    ranked = true;
    kind = 'daily';
    if (dateKey !== today) {
      // only to RESUME yesterday's open ranked run inside its grace window; never to create anything
      const y = dateKey === addDaysKey(today, -1) ? await store.getDoc('run_progress', runs.rankedId(dateKey, openid)) : null;
      if (!y || y.status !== 'open' || runs.windowClosed(y, nowMs)) fail('INVALID_ACTIONS', 'daily can only be started for today');
      deck = await daily.getDeck(dateKey);
      if (!deck) fail('DECK_NOT_FOUND', 'deck missing');
      return payload(y, deck, true, null);
    }
    deck = (await daily.ensureDaily(dateKey, { startedAt, timeoutMs: configuredTimeoutMs() })).doc;
  } else {
    challenge = await challenges.loadAnswerable(input.challengeId(event.challengeId), openid, nowMs);
    if (challenge.kind !== 'daily') fail('INVALID_ACTIONS', 'free challenges are played on the client');
    dateKey = challenge.dateKey;
    deck = await daily.getDeck(dateKey);
    if (!deck) fail('DECK_NOT_FOUND', 'deck missing');
    const prior = await challenges.priorAnswer(openid, challenge._id);
    if (prior && prior.source === 'run_progress') {
      const p = prior.doc;
      if (p.status === 'ended') fail('ALREADY_PLAYED', 'challenge already played', { clientRunId: p.clientRunId, result: p.result });
      return payload(p, deck, true, challenge);
    }
    ranked = await challenges.countsAsDaily(challenge, openid, nowMs);
    kind = 'challengeDaily'; // ranked or friendly is carried by `ranked`
    if (!ranked) kind = 'dailyFriendly';
  }

  const id = ranked ? runs.rankedId(dateKey, openid) : runs.friendlyId(openid, clientRunId);
  const existing = await store.getDoc('run_progress', id);
  if (existing) {
    if (existing.status === 'ended') {
      const rarity = existing.ranked ? await runs.rarityFor(existing.dateKey, existing.result.n) : null;
      fail('ALREADY_PLAYED', 'daily already played', { clientRunId: existing.clientRunId, result: { ...existing.result, rarity } });
    }
    return payload(existing, deck, true, challenge);
  }

  const doc = {
    _id: id, openid, clientRunId, kind, dateKey, challengeId: challenge ? challenge._id : null, ranked, k: 1, streak: 0,
    status: 'open', answers: [], startedAt: nowMs, lastAt: nowMs, contentVersion: deck.contentVersion,
  };
  const created = await store.addIfAbsent('run_progress', doc);
  if (!created) {
    const again = await store.getDoc('run_progress', id);
    if (again && again.status === 'ended') fail('ALREADY_PLAYED', 'daily already played', { clientRunId: again.clientRunId, result: again.result });
    return payload(again || doc, deck, true, challenge);
  }
  if (ranked) await runs.ensureStats(dateKey);
  return payload(doc, deck, false, challenge);
});
