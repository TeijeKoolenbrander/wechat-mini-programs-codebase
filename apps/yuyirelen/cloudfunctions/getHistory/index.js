'use strict';
// getHistory: the archive list, 30 per page, newest first (spec 8.10, 14.2).
// `answer` is included only for puzzles the CALLER finished (spec 14.4 rule 3).
const store = require('./common/store');
const input = require('./common/input');
const coreapi = require('./common/coreapi');
const plays = require('./common/plays');
const { now } = require('./common/util');

const PAGE = 30;
const totalCache = { at: 0, byVersion: new Map() };

async function practiceTotal(vocabVersion, nowMs) {
  if (nowMs - totalCache.at > 60e3) {
    totalCache.at = nowMs;
    totalCache.byVersion.clear();
  }
  if (!totalCache.byVersion.has(vocabVersion)) {
    const r = await store.db().collection('answer_bank').where({ pool: 'practice' }).count();
    totalCache.byVersion.set(vocabVersion, r.total);
  }
  return totalCache.byVersion.get(vocabVersion);
}

exports.main = store.handler(async (event, { openid }) => {
  const cursor = input.optCursor(event.cursor);
  const nowMs = now();
  const today = coreapi.dateKeyAt(nowMs);
  const _ = store._();

  const where = { _id: cursor && cursor <= today ? _.lt(cursor) : _.lte(today) };
  const res = await store.db().collection('daily_puzzles').where(where).orderBy('_id', 'desc').limit(PAGE + 1)
    .field({ _id: true, issueNo: true, answerRef: true }).get();
  const page = res.data.slice(0, PAGE);
  const hasMore = res.data.length > PAGE;

  const mine = new Map();
  if (page.length) {
    const r = await store.db().collection('plays').where({ _id: _.in(page.map((p) => plays.playId('d' + p._id, openid))) })
      .field({ puzzleId: true, status: true, steps: true }).limit(PAGE).get();
    for (const p of r.data) mine.set(p.puzzleId, p);
  }
  const finishedRefs = page.filter((p) => {
    const m = mine.get('d' + p._id);
    return m && (m.status === 'solved' || m.status === 'gaveup');
  }).map((p) => p.answerRef);
  const words = new Map();
  if (finishedRefs.length) {
    const r = await store.db().collection('answer_bank').where({ _id: _.in(finishedRefs) }).field({ word: true }).limit(PAGE).get();
    for (const a of r.data) words.set(a._id, a.word);
  }

  const items = page.map((p) => {
    const m = mine.get('d' + p._id);
    const item = { puzzleId: 'd' + p._id, issueNo: p.issueNo, dateKey: p._id };
    if (m) {
      item.my = { status: m.status, steps: m.steps };
      if ((m.status === 'solved' || m.status === 'gaveup') && words.has(p.answerRef)) item.answer = words.get(p.answerRef);
    }
    return item;
  });

  const [stats, done, total] = await Promise.all([
    store.getDoc('player_stats', openid),
    store.db().collection('plays').where({ openid, kind: 'practice', status: _.neq('playing') }).count(),
    practiceTotal(coreapi.currentVersions().vocabVersion, nowMs),
  ]);
  return {
    ok: true,
    items,
    nextCursor: hasMore ? page[page.length - 1]._id : null,
    bestStreak: (stats && stats.bestStreak) || 0,
    practice: { done: done.total, total },
  };
});
