'use strict';
// getDaily: today's five cards and the caller's progress. Creates the set lazily if genDaily missed.
// Never returns the anchor, histograms, or a reference for a card the caller has not answered (AC 13).
// Optional `dateKey` = yesterday inside the 00:30 grace window, so a daily started on D can be finished.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const groups = require('./common/groups');
const daily = require('./common/daily');
const { fail, now, addDaysKey, CARDS } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);
  const groupRef = input.optGroupRef(event.groupRef);
  const reqKey = input.optDateKey(event.dateKey);

  let dateKey = today;
  let set;
  if (reqKey && reqKey !== today) {
    if (daily.windowState(reqKey, nowMs) !== 'grace') fail('LATE_SUBMIT', 'that day is closed');
    set = await store.getDoc('daily_sets', reqKey);
    const e = set && (await store.getDoc('daily_entries', daily.entryId(reqKey, openid)));
    if (!set || !e) fail('LATE_SUBMIT', 'that day is closed');
    dateKey = reqKey;
  } else {
    set = (await daily.ensureDaily(today)).doc;
  }

  const entry = await store.getDoc('daily_entries', daily.entryId(dateKey, openid));
  const pos = entry ? entry.pos : new Array(CARDS).fill(null);
  const answered = pos.filter((p) => p != null).length;
  const complete = answered === CARDS;

  const { refs, final, stats } = await daily.currentRefs(set, nowMs);
  const { cardScores, total } = daily.scoreEntry(pos, refs);

  const out = {
    ok: true, dateKey, issueNo: set.issueNo, serverNow: nowMs,
    cards: set.cards.map(daily.publicCard),
    mine: { pos, answered, complete, final, total: answered ? total : undefined, cardScores },
    myStreak: await daily.currentStreak(openid, today),
  };
  // refs only for cards the caller has answered, plus the national n / agreement for them
  out.refs = refs.map((r, i) => (pos[i] == null ? null : r));
  out.nationalN = stats.map((s, i) => (pos[i] == null ? null : s.n));

  if (groupRef && (await groups.isMember(openid, groupRef))) {
    out.groupRefs = [];
    for (let i = 0; i < CARDS; i++) {
      if (pos[i] == null) { out.groupRefs.push(null); continue; }
      const g = await groups.othersOnCard(groupRef, dateKey, i, openid);
      out.groupRefs.push(g.median);
    }
  } else {
    out.groupRefs = null;
  }

  // yesterday's 定分 (only when it is closed and the caller completed it)
  const yKey = addDaysKey(today, -1);
  const ySet = await store.getDoc('daily_sets', yKey);
  const yEntry = ySet && (await store.getDoc('daily_entries', daily.entryId(yKey, openid)));
  if (ySet && yEntry && yEntry.complete) {
    const fin = await daily.ensureFinal(ySet, nowMs);
    if (fin) {
      const yTotal = daily.scoreEntry(yEntry.pos, fin).total;
      let pct = null;
      if (ySet.finalCount >= 30 && Array.isArray(ySet.finalHist)) {
        let below = 0;
        for (let b = 0; b < core.totalBin(yTotal); b++) below += ySet.finalHist[b] || 0;
        pct = Math.floor((100 * below) / ySet.finalCount);
      }
      out.yesterday = { total: yTotal, pct, final: true };
    }
  }

  const cfg = await store.getAppConfig();
  out.features = {
    subscribeTmplId: (cfg.subscribe && cfg.subscribe.tmplId) || null,
    ads: cfg.ads || null,
  };
  return out;
});
