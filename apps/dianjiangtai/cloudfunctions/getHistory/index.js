'use strict';
// getHistory: the caller's last <= 30 published issues (spec 8.9, 14.2, AC 82).
// Spoiler rules: `best` only once the date's submit window has closed (D+1 00:30 BJT); for an open date the
// caller's own lineup/record appear only if they have played it, and the distribution only after they played.
// Never returns a seed, rounds, or any other player's data.
const core = require('./common/coreapi');
const store = require('./common/store');
const rules = require('./common/rules');
const { isInt, fail, now } = require('./common/util');

const MAX = 30;
const MIN_DIST = 30;

function bestOf(seedDoc) {
  try {
    if (!seedDoc.best) return null;
    const lineup = core.normaliseLineup(seedDoc.best.lineup);
    if (!lineup) return null;
    return { lineupIdx: core.lineupToIdx(lineup, seedDoc.contentVersion), record: seedDoc.best.record || { w: 12, l: 0 } };
  } catch (e) {
    return null;
  }
}

exports.main = store.handler(async (event, { openid }) => {
  let limit = MAX;
  if (event.limit !== undefined && event.limit !== null) {
    if (!isInt(event.limit, 1, MAX)) fail('INVALID_ACTIONS', 'bad limit');
    limit = event.limit;
  }
  const nowMs = now();
  const _ = store._();
  const seeds = (await store.db().collection('daily_seeds').where({ _id: _.lte(core.dateKeyAt(nowMs)) }).orderBy('_id', 'desc').limit(limit).get()).data;
  const keys = seeds.map((s) => s._id);
  let results = [];
  let stats = [];
  if (keys.length) {
    results = (await store.db().collection('daily_results').where({ _id: _.in(keys.map((k) => `${k}_${openid}`)) }).limit(MAX).get()).data;
    stats = (await store.db().collection('daily_stats').where({ _id: _.in(keys) }).limit(MAX).get()).data;
  }
  const mine = new Map(results.map((r) => [r.dateKey, r]));
  const dist = new Map(stats.map((s) => [s._id, s]));

  const items = seeds.map((s) => {
    const closed = rules.windowState(s._id, nowMs) === 'late';
    const item = {
      dateKey: s._id, issueNo: s.issueNo, variant: s.variant || core.variantFor(s._id), status: closed ? 'closed' : 'open',
    };
    const r = mine.get(s._id);
    const st = dist.get(s._id);
    if (r) {
      item.mine = { w: r.w, l: r.l, lineupIdx: r.lineupIdx, lineupFac: r.lineupFac || null };
      const band = core.bandOf(s.configVersion, r.w);
      if (band) item.mine.band = band;
      if (st && st.total >= MIN_DIST) {
        const atOrBetter = st.hist.slice(r.w).reduce((a, b) => a + b, 0);
        item.mine.rarity = { pct: Math.round((atOrBetter / st.total) * 1000) / 10, total: st.total };
      }
    }
    if (st && st.total >= MIN_DIST && (closed || r)) {
      item.total = st.total;
      item.hist = st.hist;
    }
    if (closed) {
      const best = bestOf(s);
      if (best) item.best = best;
    }
    return item;
  });
  const ps = await store.getDoc('player_stats', openid);
  return { ok: true, items, bestStreak: (ps && ps.bestStreak) || 0 };
});
