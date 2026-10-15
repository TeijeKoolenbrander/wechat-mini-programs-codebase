'use strict';
// getHistory: 往期 list (last <= 30 published issues) and issue detail (spec 6.11, 11.2, PO-17).
// SPOILER LOCK: the detail's full deck (with values and the player's answers) is returned ONLY when
// now > D+1 00:30 BJT. Before that, `deck` is null and `locked` is true. The distribution appears at >= 30 results.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const runs = require('./common/runs');
const pool = require('./common/pool');
const { fail, now, windowEndMs, DECK_LEN } = require('./common/util');

const LIST_MAX = 30;
const BUCKETS = [[0, 0], [1, 5], [6, 10], [11, 15], [16, 20], [21, 30], [31, 39], [40, 40]];

async function list(openid, today) {
  const _ = store._();
  const decks = (await store.db().collection('daily_decks').where({ _id: _.lte(today) }).orderBy('_id', 'desc').limit(LIST_MAX)
    .field({ issueNo: true, theme: true, themeLabel: true }).get()).data;
  const results = decks.length
    ? (await store.db().collection('daily_results').where({ _id: _.in(decks.map((d) => `${d._id}_${openid}`)) }).limit(LIST_MAX)
      .field({ n: true, dateKey: true }).get()).data
    : [];
  const byDate = new Map(results.map((r) => [r.dateKey, r]));
  const open = await store.getDoc('run_progress', runs.rankedId(today, openid));
  const stats = await store.getDoc('player_stats', openid);
  const items = decks.map((d) => {
    const r = byDate.get(d._id);
    const isToday = d._id === today;
    return {
      dateKey: d._id, issueNo: d.issueNo, theme: d.theme, themeLabel: d.themeLabel, isToday,
      mine: r ? { n: r.n } : null,
      status: r ? 'done' : isToday && open && open.status === 'open' ? 'open' : 'none',
    };
  });
  return {
    ok: true, items, bestDays: stats ? stats.bestDays : 0, bestDaily: stats ? stats.bestDaily : 0,
  };
}

async function detail(openid, dateKey, nowMs) {
  const deck = await daily.getDeck(dateKey);
  if (!deck || dateKey > core.dateKeyAt(nowMs)) fail('DECK_NOT_FOUND', 'no such issue');
  const result = await store.getDoc('daily_results', `${dateKey}_${openid}`);
  const run = await store.getDoc('run_progress', runs.rankedId(dateKey, openid));
  const st = await store.getDoc('daily_stats', dateKey);
  const overrides = await pool.getOverrides();

  const out = {
    ok: true,
    issue: { dateKey, issueNo: deck.issueNo, theme: deck.theme, themeLabel: deck.themeLabel },
    mine: result ? { streak: result.n, missK: result.endReason === 'miss' ? result.n + 1 : null, endReason: result.endReason } : null,
    stats: null, deck: null, locked: true,
    errata: ((overrides.errata && overrides.errata[dateKey]) || []).map((e) => ({ k: e.k, text: e.text })),
  };
  if (st && st.total >= 30) {
    out.stats = { total: st.total, buckets: BUCKETS.map(([from, to]) => ({ from, to, count: st.hist.slice(from, to + 1).reduce((a, b) => a + b, 0) })) };
  }
  if (nowMs > windowEndMs(dateKey)) {
    out.locked = false;
    const ids = deck.questions.flatMap((q) => [q.a, q.b]);
    const facts = await pool.getDailyFacts(deck.contentVersion, ids);
    const answers = new Map(((run && run.answers) || []).map((a) => [a.k, a]));
    out.deck = deck.questions.slice(0, DECK_LEN).map((q, i) => {
      const k = i + 1;
      const a = facts.get(q.a);
      const b = facts.get(q.b);
      if (!a || !b) fail('INTERNAL', 'daily content missing');
      const ans = answers.get(k);
      const correct = core.correctChoice(a, b);
      return {
        k, top: runs.fullCard(a), bottom: runs.fullCard(b), answer: correct, answerVerb: core.verbs(a.measure)[correct],
        mine: !run ? null : ans ? (ans.ok ? 'correct' : 'miss') : 'unanswered',
      };
    });
  }
  return out;
}

exports.main = store.handler(async (event, { openid }) => {
  const dateKey = input.optDateKey(event.dateKey);
  const nowMs = now();
  if (!dateKey) return list(openid, core.dateKeyAt(nowMs));
  return detail(openid, dateKey, nowMs);
});
