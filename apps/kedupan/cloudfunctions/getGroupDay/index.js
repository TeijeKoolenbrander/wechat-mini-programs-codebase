'use strict';
// getGroupDay: the group page (spec 8.4, PD-5, PD-6). Server-computed, hashed rows; no openids in the response.
// Membership is enforced (NOT_MEMBER). Until the caller has completed the day, member rows, scores, positions,
// 群默契度 and the divisive card are withheld (state `notPlayed`); n, the 7-day trend and the rounds list stay.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const groups = require('./common/groups');
const { fail, now, addDaysKey, isDayClosed, secondsIntoDay } = require('./common/util');

const ROUNDS_SHOWN = 10;

/** n / mq / divisive card of one day for the group (members = everyone who ever joined, PD-6) */
async function dayNumbers(groupRef, dateKey, nowMs) {
  const openids = await groups.memberOpenids(groupRef, nowMs);
  const entries = (await groups.loadEntries(dateKey, openids)).filter((e) => e.complete);
  const g = groups.computeGroup(entries);
  return { entries, g };
}

async function trendFor(groupRef, dateKey, liveNumbers, nowMs) {
  const out = [];
  for (let k = 6; k >= 0; k--) {
    const d = addDaysKey(dateKey, -k);
    if (d === dateKey && liveNumbers) { out.push({ dateKey: d, mq: liveNumbers.mq, n: liveNumbers.n }); continue; }
    if (!isDayClosed(d, nowMs)) {
      // yesterday still inside its 00:30 grace: live numbers, not cached
      if (!(await store.getDoc('daily_sets', d))) { out.push({ dateKey: d, mq: null, n: 0 }); continue; }
      const { g } = await dayNumbers(groupRef, d, nowMs);
      out.push({ dateKey: d, mq: g.mq, n: g.n });
      continue;
    }
    const id = `${groupRef}_${d}`;
    let cached = await store.getDoc('group_daily', id);
    if (!cached) {
      const set = await store.getDoc('daily_sets', d);
      if (!set) { out.push({ dateKey: d, mq: null, n: 0 }); continue; } // unpublished day: nothing to compute or cache
      const { g } = await dayNumbers(groupRef, d, nowMs);
      const { refs, stats } = await daily.currentRefs(set, nowMs);
      cached = { _id: id, groupRef, dateKey: d, n: g.n, mq: g.mq, divisiveIdx: groups.divisiveIdx(stats, refs), computedAt: nowMs };
      await store.addIfAbsent('group_daily', cached);
    }
    out.push({ dateKey: d, mq: cached.n >= 3 ? cached.mq : null, n: cached.n });
  }
  return out;
}

async function roundsFor(groupRef) {
  const r = await store.db().collection('rounds').where({ groupRefs: groupRef }).orderBy('createdAt', 'desc').limit(ROUNDS_SHOWN).get();
  return r.data.filter((x) => x.guessCount > 0 || x.status === 'revealed').map((x) => ({
    roundId: x._id, left: x.left, right: x.right, clue: x.clueText || null, status: x.status,
    mq: x.status === 'revealed' && x.mq != null ? x.mq : null, guesses: x.guessCount,
  }));
}

exports.main = store.handler(async (event, { openid }) => {
  const groupRef = input.groupRef(event.groupRef);
  const dateKey = input.dateKey(event.dateKey);
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);
  if (dateKey > today || dateKey < addDaysKey(today, -1)) fail('INVALID_INPUT', 'board date out of range');
  await store.rateLimit(openid, 'board', 1, 30);
  await groups.requireMember(openid, groupRef);

  const set = await store.getDoc('daily_sets', dateKey);
  if (!set) fail('DAILY_UNAVAILABLE', 'no set for that date');
  const self = await store.getDoc('daily_entries', daily.entryId(dateKey, openid)); // always fresh
  const viewerDone = !!(self && self.complete);

  const { entries, g } = await dayNumbers(groupRef, dateKey, nowMs);
  // the 60 s member-list cache must never hide the caller (just joined, or just completed)
  if (viewerDone && !entries.some((e) => e.openid === openid)) {
    const all = groups.computeGroup([...entries, self]);
    Object.assign(g, all);
  }

  const out = {
    ok: true, dateKey, issueNo: set.issueNo, salt: set.boardSalt, selfHash: groups.hashOf(openid, set.boardSalt),
    viewerDone, n: g.n, mq: null, divisiveIdx: null, rows: [],
  };
  if (viewerDone) {
    const { refs, stats } = await daily.currentRefs(set, nowMs);
    out.mq = g.mq;
    out.divisiveIdx = groups.divisiveIdx(stats, refs);
    let rows = g.members.map((m) => {
      const e = m.entry;
      const row = [groups.hashOf(m.openid, set.boardSalt), m.gs, daily.scoreEntry(e.pos, refs).total, secondsIntoDay(e.completeAt, dateKey), e.pos.join(',')];
      if (e.streak >= 2) row.push(e.streak);
      return { row, openid: m.openid };
    });
    rows.sort((a, b) => ((b.row[1] === null ? -1 : b.row[1]) - (a.row[1] === null ? -1 : a.row[1])) || a.row[3] - b.row[3] || (a.row[0] < b.row[0] ? -1 : 1));
    const cap = core.cfg().groupRowCap;
    if (rows.length > cap) {
      const mine = rows.find((r) => r.openid === openid);
      rows = rows.slice(0, cap);
      if (mine && !rows.includes(mine)) rows.push(mine);
    }
    out.rows = rows.map((r) => r.row);
  }
  out.trend = await trendFor(groupRef, dateKey, { mq: g.mq, n: g.n }, nowMs);
  out.rounds = await roundsFor(groupRef);
  await store.writeEvent(openid, 'board_list', { view: 'group', mode: 'group', rows: out.rows.length, bytes: JSON.stringify(out.rows).length });
  return out;
});
