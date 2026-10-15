'use strict';
// submitCard: the one and only way a position enters the national histogram (spec 11.2, PD-24, PD-25).
// The client sends only {dateKey, idx, pos, groupRef?}; score, reference and label are computed here.
// Order: validate -> rate limit -> window -> one transaction (entry + histogram inc + streak) -> reveal.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const groups = require('./common/groups');
const daily = require('./common/daily');
const { buildReveal } = require('./common/rules');
const { AppError, fail, now, CARDS } = require('./common/util');

const FAST_MS = 6000;

exports.main = store.handler(async (event, { openid }) => {
  const dateKey = input.dateKey(event.dateKey);
  const idx = input.cardIdx(event.idx);
  const pos = input.pos(event.pos);
  const groupRef = input.optGroupRef(event.groupRef);
  const nowMs = now();
  await store.rateLimit(openid, 'submitCard', 1, 60);

  const ws = daily.windowState(dateKey, nowMs);
  if (ws === 'future') fail('INVALID_INPUT', 'date is in the future');
  if (ws === 'late') fail('LATE_SUBMIT', 'that day is closed');

  const id = daily.entryId(dateKey, openid);
  let set;
  if (ws === 'open') {
    set = (await daily.ensureDaily(dateKey)).doc;
  } else {
    // grace window: only a daily whose first card was submitted on D may finish
    set = await store.getDoc('daily_sets', dateKey);
    const e = set && (await store.getDoc('daily_entries', id));
    if (!set || !e) fail('LATE_SUBMIT', 'that day is closed');
  }
  await daily.ensureStats(dateKey);
  const prev = await daily.prevPublishedKey(dateKey); // published days never change, safe outside the txn

  let outcome;
  for (let attempt = 1; ; attempt++) {
    try {
      outcome = await runCardTxn();
      break;
    } catch (e) {
      // optimistic-concurrency conflicts on the real DB: retry; the retry sees the stored card and returns CARD_DONE
      if (e instanceof AppError || attempt >= 3 || !/conflict|abort|rollback|locked/i.test(store.errText(e))) throw e;
    }
  }

  function runCardTxn() {
    return store.db().runTransaction(async (t) => {
      const cur = await store.getDocT(t, 'daily_entries', id);
      if (cur && cur.pos[idx] != null) return { done: true, entry: cur };
      const expected = daily.firstUnanswered(cur);
      if (idx !== expected) throw new AppError('CARD_ORDER', 'cards must be answered in order', { expectedIdx: expected });

      const entry = cur || {
        _id: id, openid, dateKey, pos: new Array(CARDS).fill(null), answeredAt: new Array(CARDS).fill(null),
        firstAt: nowMs, complete: false, contentVersion: set.contentVersion,
      };
      entry.pos = entry.pos.slice();
      entry.answeredAt = entry.answeredAt.slice();
      entry.pos[idx] = pos;
      entry.answeredAt[idx] = nowMs;
      let streak = null;
      let fast = false;
      if (idx === CARDS - 1) {
        entry.complete = true;
        entry.completeAt = nowMs;
        streak = await daily.applyStreak(t, openid, dateKey, prev);
        entry.streak = streak;
        fast = nowMs - entry.answeredAt[0] < FAST_MS;
      }
      await t.collection('daily_entries').doc(id).set({ data: entry });
      const _ = store._();
      await t.collection('daily_card_stats').doc(`${dateKey}_${idx}`).update({ data: { [`hist.${pos}`]: _.inc(1), n: _.inc(1) } });
      return { done: false, entry, streak, fast };
    });
  }

  if (outcome.fast) {
    // observe-only flag; never changes a score, rank or streak (PD-25, AC 82)
    await store.addIfAbsent('anomalies', {
      _id: `${openid}_${dateKey}_fast`, openid, dateKey, kind: 'fast',
      detail: { ms: outcome.entry.completeAt - outcome.entry.answeredAt[0] }, ts: nowMs,
    }).catch(() => {});
  }

  const entry = outcome.entry;
  const { refs, final, stats } = await daily.currentRefs(set, nowMs);
  const reveal = buildReveal(idx, entry.pos[idx], refs, stats, final);

  if (outcome.done) {
    // idempotent retry: same idx again returns the stored reveal and changes nothing
    throw new AppError('CARD_DONE', 'card already answered', { reveal, complete: entry.complete });
  }

  const out = { ok: true, ...reveal, complete: entry.complete };
  if (entry.complete) {
    out.total = daily.scoreEntry(entry.pos, refs).total;
    out.streak = outcome.streak;
  }
  // group block only if the groupRef belongs to the caller; otherwise silently ignored
  if (groupRef && (await groups.isMember(openid, groupRef))) {
    out.group = await groups.othersOnCard(groupRef, dateKey, idx, openid);
  }
  return out;
});
