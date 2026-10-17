'use strict';
// getGroupDay: the group page (spec 8.4, 3.4): hashed rows, 群默契度, 7-day trend, recent rounds. Membership is checked
// on a fresh row; rows carry only salted hashes (never openids, openGIds or groupRefs).
const store = require('./common/store');
const { fail, now, rowHash } = require('./common/util');
const { core, CONFIG, dateKeyAt, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');
const groups = require('./common/groups');

const GUESS_SCAN = 100; // newest guesses scanned for the rounds list (TD-31)

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.getGroupDay(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const { groupRef, dateKey } = v.v;
  if (!(await groups.isMember(openid, groupRef))) fail('NOT_MEMBER', 'NOT_MEMBER');
  const started = now();
  const nowMs = started;
  if (!core.SV.boardDayOk(dateKey, nowMs)) fail('INVALID_INPUT', 'INVALID_INPUT');
  let set = await daily.ensureSet(dateKey);
  if (!set) fail('DAILY_UNAVAILABLE', 'DAILY_UNAVAILABLE');
  const hists = await daily.loadHists(dateKey);
  if (core.W.dayClosed(dateKey, nowMs)) set = await daily.ensureFinal(set, hists);

  const members = await groups.completeMembers(openid, groupRef, dateKey);
  const viewerDone = members.some((m) => m.key === openid);

  // 7-day trend; closed days are cached in group_daily (recomputable, trend only)
  const today = dateKeyAt(nowMs);
  const dates = core.G.trendDates(today);
  const existing = await store.getMany('daily_sets', dates);
  const cache = await store.getMany('group_daily', dates.map((d) => `${groupRef}_${d}`));
  const lookup = {};
  for (const dk of dates) {
    if (!existing.has(dk)) {
      lookup[dk] = null;
      continue;
    }
    const closed = core.W.dayClosed(dk, nowMs);
    const hit = cache.get(`${groupRef}_${dk}`);
    if (closed && hit) {
      lookup[dk] = { mq: hit.mq, n: hit.n };
      continue;
    }
    const list = (dk === dateKey ? members : await groups.completeMembers(openid, groupRef, dk)).map((m) => m.pos);
    lookup[dk] = { mq: core.G.groupMq(list), n: list.length };
    if (closed) {
      const divisive = core.G.groupDivisiveIdx(list);
      await store.addIfAbsent('group_daily', { _id: `${groupRef}_${dk}`, n: list.length, mq: lookup[dk].mq, divisiveIdx: divisive, computedAt: nowMs });
    }
  }
  const trend = core.G.buildTrend(today, (dk) => lookup[dk] || null);

  // rounds that carry this group's ref (newest first, <= 10)
  const gs = await store.coll('guesses').where({ groupRef }).orderBy('ts', 'desc').limit(GUESS_SCAN).get();
  const roundIds = Array.from(new Set(gs.data.map((g) => g.roundId)));
  const roundDocs = await store.getMany('rounds', roundIds);
  // PD-37: the rounds list carries only a curated preset clue text (U.publicClueText); a typed clue is never public text
  const rounds = roundIds
    .map((id) => roundDocs.get(id))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, CONFIG.group.roundsListCap)
    .map((r) => ({ roundId: r._id, left: r.left, right: r.right, clue: core.U.publicClueText(r), status: r.status, mq: r.status === 'revealed' ? r.mq : null, guesses: r.guessCount }));

  const out = core.SV.groupDayView({ set, hists, members, viewerOpenid: openid, viewerDone, hashFn: rowHash, trend, rounds, nowMs });
  await store.writeSampled('board_list', { view: 'group', mode: out.viewerDone ? 'full' : 'locked', rows: out.rows.length, bytes: JSON.stringify(out).length, ms: now() - started }, CONFIG.caps.boardEventEvery);
  return out;
}, { rate: rateOf('getGroupDay') });
