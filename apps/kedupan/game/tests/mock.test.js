/**
 * The mock server is the executable contract of spec 11 (backend copies its behaviour): daily flow, windows,
 * finalisation, streaks, host rounds, groups, boards, archive, extras. Time is controlled through `now`.
 */

const test = require('node:test');
const assert = require('node:assert');
const { createMockServer } = require('../js/mock-server');
const S = require('../core/score');
const D = require('../core/date');

const T0 = Date.UTC(2026, 10, 20, 4, 0, 0); // 2026-11-20 12:00 Beijing
function server(o) {
  const clock = { t: T0 };
  const srv = createMockServer(Object.assign({ now: () => clock.t, population: 0, launchDateKey: '20261101' }, o || {}));
  srv.clock = clock;
  return srv;
}
const me = (id) => ({ openid: id || 'me' });
const DK = '20261120';

function submitAll(srv, openid, pos, groupRef) {
  let last;
  for (let i = 0; i < 5; i++) last = srv.call('submitCard', { dateKey: srv.todayKey(), idx: i, pos: pos[i], groupRef }, me(openid));
  return last;
}

test('AC12/13: two users get the same issue and cards; nothing secret leaks before answering', () => {
  const srv = server();
  const a = srv.call('getDaily', {}, me('a'));
  const b = srv.call('getDaily', {}, me('b'));
  assert.strictEqual(a.issueNo, 20);
  assert.strictEqual(a.issueNo, b.issueNo);
  assert.deepStrictEqual(a.cards, b.cards);
  assert.strictEqual(a.cards.length, 5);
  const dump = JSON.stringify(a);
  assert.ok(!/anchor|hist/.test(dump), 'no anchor or histogram data');
  assert.deepStrictEqual(a.refs, [null, null, null, null, null], 'no refs for unanswered cards');
  assert.deepStrictEqual(a.mine.pos, [null, null, null, null, null]);
  assert.strictEqual(a.divisiveIdx, undefined);
  srv.call('submitCard', { dateKey: DK, idx: 0, pos: 40 }, me('a'));
  const a2 = srv.call('getDaily', {}, me('a'));
  assert.ok(a2.refs[0] !== null && a2.refs[1] === null, 'a ref only for the answered card');
  assert.ok(srv.db.sets[DK].cards[0].anchor !== undefined, 'the anchor exists server-side only');
  // card 1 is easy and the day has a split item (PD-29), cards come from the shipped schedule
  const ids = srv.db.sets[DK].cards.map((c) => c.itemId);
  const content = require('../core/content').getContent(1);
  assert.ok(content.itemById[ids[0]].tags.includes('easy'));
});

test('AC15: submitCard validation, order, idempotence, histogram grows once', () => {
  const srv = server();
  const call = (d) => srv.call('submitCard', Object.assign({ dateKey: DK, idx: 0 }, d), me('a'));
  [50.5, -1, 101, '50', null, NaN].forEach((pos) => assert.strictEqual(call({ pos }).code, 'INVALID_INPUT', String(pos)));
  assert.strictEqual(call({ pos: 5, idx: 1 }).code, 'CARD_ORDER');
  assert.strictEqual(call({ pos: 5, idx: 9 }).code, 'INVALID_INPUT');
  const n0 = srv.db.stats[DK + '_0'].n;
  const first = call({ pos: 70 });
  assert.ok(first.ok);
  assert.strictEqual(srv.db.stats[DK + '_0'].n, n0 + 1);
  assert.strictEqual(srv.db.stats[DK + '_0'].hist[70], 1);
  const again = call({ pos: 20 });
  assert.strictEqual(again.code, 'CARD_DONE');
  assert.strictEqual(again.reveal.pos, 70, 'the stored position wins');
  assert.strictEqual(again.reveal.score, first.score);
  assert.strictEqual(srv.db.stats[DK + '_0'].n, n0 + 1, 'counted once (two identical calls)');
  assert.strictEqual(srv.db.stats[DK + '_0'].hist[20], 0);
  // 0 and 100 are accepted
  const x = srv.call('submitCard', { dateKey: DK, idx: 0, pos: 0 }, me('b'));
  assert.ok(x.ok);
  assert.ok(srv.call('submitCard', { dateKey: DK, idx: 0, pos: 100 }, me('c')).ok);
  assert.strictEqual(srv.call('submitCard', { dateKey: '20261121', idx: 0, pos: 5 }, me('d')).code, 'INVALID_INPUT', 'future date');
  assert.strictEqual(srv.call('submitCard', { dateKey: DK, idx: 0, pos: 5 }, {}).code, 'UNAUTHENTICATED');
});

test('the reveal scores match core/score and the reference moves with the crowd (prior W = 10)', () => {
  const srv = server();
  const set = srv.call('getDaily', {}, me('a'));
  void set;
  const anchor = srv.db.sets[DK].cards[0].anchor;
  const r = srv.call('submitCard', { dateKey: DK, idx: 0, pos: anchor }, me('a'));
  assert.strictEqual(r.ref, anchor, 'with no other votes the reference is the anchor');
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.label, '心有灵犀');
  assert.strictEqual(r.agreePct, null, 'under 30 answers');
  for (let i = 0; i < 40; i++) srv.call('submitCard', { dateKey: DK, idx: 0, pos: 5 }, me('v' + i));
  const r2 = srv.call('submitCard', { dateKey: DK, idx: 0, pos: 5 }, me('w'));
  assert.ok(r2.ref < anchor, 'the crowd pulled the reference');
  assert.strictEqual(r2.agreePct !== null, true);
  assert.strictEqual(r2.n, 42);
  assert.strictEqual(r2.score, S.scoreAt(5, r2.ref));
  // a lone voter far from the anchor cannot drag it more than the prior allows
  const srv2 = server();
  const a2 = srv2.db;
  void a2;
  srv2.call('getDaily', {}, me('x'));
  const anc = srv2.db.sets[DK].cards[1].anchor;
  srv2.call('submitCard', { dateKey: DK, idx: 0, pos: 50 }, me('x'));
  const s1 = srv2.call('submitCard', { dateKey: DK, idx: 1, pos: 0 }, me('x'));
  assert.strictEqual(s1.ref, anc, '1 real position at 0 with W = 10 at the anchor leaves the median at the anchor');
});

test('AC20: a daily started on D accepts cards until D+1 00:30, then LATE_SUBMIT; incomplete days never rank or count', () => {
  const srv = server();
  srv.clock.t = Date.UTC(2026, 10, 20, 15, 59, 0); // 23:59
  assert.ok(srv.call('submitCard', { dateKey: DK, idx: 0, pos: 50 }, me('a')).ok);
  srv.clock.t = Date.UTC(2026, 10, 20, 16, 29, 59); // 00:29:59 next day
  assert.ok(srv.call('submitCard', { dateKey: DK, idx: 1, pos: 50 }, me('a')).ok, 'inside the grace window');
  srv.clock.t = Date.UTC(2026, 10, 20, 16, 30, 1); // 00:30:01
  assert.strictEqual(srv.call('submitCard', { dateKey: DK, idx: 2, pos: 50 }, me('a')).code, 'LATE_SUBMIT');
  // a user who never started D gets LATE_SUBMIT for D as well
  assert.strictEqual(srv.call('submitCard', { dateKey: DK, idx: 0, pos: 50 }, me('b')).code, 'LATE_SUBMIT');
  // the partial day is on no board, in no streak
  const fb = srv.call('getFriendBoard', { dateKey: DK }, me('a'));
  assert.strictEqual(fb.rows.length, 0);
  const d = srv.call('getDaily', {}, me('a'));
  assert.strictEqual(d.myStreak.current, 0);
  assert.strictEqual(d.dateKey, '20261121');
  assert.strictEqual(d.yesterday, undefined);
  // the archive offers D for play now that it is closed
  assert.ok(srv.call('getArchive', {}, me('a')).items.some((i) => i.dateKey === DK));
});

test('AC22/AC23: date key at 15:59:59 / 16:00:00 UTC; genDaily is idempotent and rejects an OPENID', () => {
  const srv = server();
  srv.clock.t = Date.UTC(2026, 10, 20, 15, 59, 59);
  assert.strictEqual(srv.call('getDaily', {}, me('a')).dateKey, '20261120');
  srv.clock.t = Date.UTC(2026, 10, 20, 16, 0, 0);
  assert.strictEqual(srv.call('getDaily', {}, me('a')).dateKey, '20261121');
  assert.strictEqual(srv.call('genDaily', {}, me('a')).code, 'FORBIDDEN');
  const a = srv.call('genDaily', {}, {});
  const b = srv.call('genDaily', {}, {});
  assert.strictEqual(a.created, true);
  assert.strictEqual(b.created, false);
  assert.strictEqual(Object.keys(srv.db.sets).filter((k) => k === '20261122').length, 1);
  assert.strictEqual(srv.call('finalizeDay', {}, me('a')).code, 'FORBIDDEN');
  assert.strictEqual(srv.call('sweepRounds', {}, me('a')).code, 'FORBIDDEN');
});

test('AC18/25: live reference until 00:30, frozen after; a read before the timer freezes final[5]; finalizeDay is idempotent and gives the percentile', () => {
  const srv = server({ population: 40 });
  const mineB = submitAll(srv, 'me', [10, 20, 30, 40, 50]);
  assert.ok(mineB.complete);
  const liveRefs = srv.call('getDaily', {}, me('me')).refs;
  // more votes move the live reference
  for (let i = 0; i < 300; i++) srv.call('submitCard', { dateKey: DK, idx: 0, pos: 99 }, me('x' + i));
  const moved = srv.call('getDaily', {}, me('me')).refs;
  assert.ok(moved[0] > liveRefs[0], 'live');
  // after 00:30 the first read freezes final[5]
  srv.clock.t = Date.UTC(2026, 10, 20, 16, 31, 0);
  const next = srv.call('getDaily', {}, me('me'));
  assert.deepStrictEqual(srv.db.sets[DK].final, moved.map((r) => r), 'frozen at the last live value');
  assert.strictEqual(next.yesterday.final, true);
  assert.strictEqual(next.yesterday.pct, null, 'the percentile waits for the timer');
  assert.strictEqual(srv.db.sets[DK].finalHist, null);
  const f1 = srv.call('finalizeDay', {}, {});
  assert.ok(f1.finalized.includes(DK));
  const set = srv.db.sets[DK];
  assert.ok(set.finalHist && set.finalCount === 41 && set.finalizedAt);
  assert.strictEqual(set.finalHist.length, 101);
  const frozen = set.final.slice();
  const f2 = srv.call('finalizeDay', {}, {});
  assert.deepStrictEqual(f2.finalized, []);
  assert.deepStrictEqual(set.final, frozen);
  const y = srv.call('getDaily', {}, me('me')).yesterday;
  assert.strictEqual(typeof y.pct, 'number');
  assert.strictEqual(y.total, S.dayTotal([10, 20, 30, 40, 50], frozen));
  const day = srv.call('getArchiveDay', { dateKey: DK }, me('me'));
  assert.strictEqual(day.mine.total, y.total);
  assert.deepStrictEqual(day.finals, frozen);
  // below 30 complete dailies there is no percentile
  const small = server({ population: 10 });
  submitAll(small, 'me', [1, 2, 3, 4, 5]);
  small.clock.t = Date.UTC(2026, 10, 20, 16, 45, 0);
  small.call('finalizeDay', {}, {});
  assert.strictEqual(small.call('getDaily', {}, me('me')).yesterday.pct, null);
});

test('AC80: streak rules', () => {
  const srv = server();
  const day = (n) => {
    srv.clock.t = T0 + n * 86400e3;
    return srv.todayKey();
  };
  day(0);
  assert.strictEqual(submitAll(srv, 'me', [5, 5, 5, 5, 5]).streak, 1);
  day(1);
  assert.strictEqual(srv.call('getDaily', {}, me('me')).myStreak.current, 1, "yesterday's streak shows all of today until today completes");
  assert.strictEqual(submitAll(srv, 'me', [5, 5, 5, 5, 5]).streak, 2);
  day(2);
  // a partial day does not count; the next complete one restarts at 1
  srv.call('submitCard', { dateKey: srv.todayKey(), idx: 0, pos: 5 }, me('me'));
  day(3);
  assert.strictEqual(srv.call('getDaily', {}, me('me')).myStreak.current, 0, 'a published day closed without a complete daily');
  assert.strictEqual(srv.call('getDaily', {}, me('me')).myStreak.best, 2);
  assert.strictEqual(submitAll(srv, 'me', [5, 5, 5, 5, 5]).streak, 1);
  // duplicate completion does not double count
  assert.strictEqual(srv.call('submitCard', { dateKey: srv.todayKey(), idx: 4, pos: 5 }, me('me')).code, 'CARD_DONE');
  assert.strictEqual(srv.db.players.me.cur, 1);
  assert.strictEqual(srv.db.players.me.total, 3);
  // grace completion counts for D
  const srv2 = server();
  srv2.clock.t = Date.UTC(2026, 10, 20, 15, 58, 0);
  for (let i = 0; i < 3; i++) srv2.call('submitCard', { dateKey: DK, idx: i, pos: 5 }, me('g'));
  srv2.clock.t = Date.UTC(2026, 10, 20, 16, 10, 0);
  for (let i = 3; i < 5; i++) srv2.call('submitCard', { dateKey: DK, idx: i, pos: 5 }, me('g'));
  assert.strictEqual(srv2.db.players.g.last, DK);
});

test('AC82: the fast flag is written for a 5-card sprint under 6 s and changes nothing', () => {
  const srv = server();
  const r = submitAll(srv, 'sprinter', [10, 20, 30, 40, 50]);
  assert.ok(r.complete);
  assert.strictEqual(srv.db.anomalies.length, 1);
  assert.strictEqual(srv.db.anomalies[0].kind, 'fast');
  const total = r.total;
  const srv2 = server();
  for (let i = 0; i < 5; i++) {
    srv2.clock.t += 5000;
    srv2.call('submitCard', { dateKey: DK, idx: i, pos: [10, 20, 30, 40, 50][i] }, me('slow'));
  }
  assert.strictEqual(srv2.db.anomalies.length, 0);
  assert.strictEqual(S.dayTotal([10, 20, 30, 40, 50], srv2.call('getDaily', {}, me('slow')).refs), total, 'same answers, same score');
});

test('AC41: joinGroup is idempotent, one member doc per group+user, groupRef differs from the group id, non-group chats are rejected', () => {
  const srv = server();
  const a = srv.call('joinGroup', { groupData: { opengid: 'GGG', chat_type: 3 } }, me('a'));
  const b = srv.call('joinGroup', { groupData: { opengid: 'GGG', chat_type: 3 } }, me('a'));
  assert.deepStrictEqual(a, b);
  assert.notStrictEqual(a.groupRef, 'GGG');
  assert.ok(!a.groupRef.includes('GGG'));
  assert.strictEqual(Object.keys(srv.db.members).length, 1);
  assert.strictEqual(srv.call('joinGroup', { groupData: { opengid: 'GGG', chat_type: 3 } }, me('b')).groupRef, a.groupRef);
  assert.strictEqual(Object.keys(srv.db.members).length, 2);
  assert.strictEqual(srv.call('joinGroup', { groupData: { chat_type: 1 } }, me('c')).code, 'NOT_GROUP');
  assert.strictEqual(srv.call('joinGroup', { groupData: { opengid: 'X', chat_type: 1 } }, me('c')).code, 'NOT_GROUP');
  assert.strictEqual(srv.call('joinGroup', {}, me('c')).code, 'BAD_CLOUDID');
  assert.strictEqual(Object.keys(srv.db.members).length, 2, 'errors leave no doc');
});

test('AC42/46/47: getGroupDay rows, positions, 群默契度 and the 7-day trend; the friend board ranking and cap', () => {
  const srv = server();
  const ref = srv.joinGroupAs('u1', 'G');
  srv.joinGroupAs('u2', 'G');
  srv.joinGroupAs('u3', 'G');
  const outsider = srv.joinGroupAs('o', 'OTHER');
  submitAll(srv, 'u1', [10, 20, 30, 40, 50], ref);
  submitAll(srv, 'u2', [12, 24, 36, 48, 60], ref);
  srv.call('submitCard', { dateKey: DK, idx: 0, pos: 5, groupRef: ref }, me('u3')); // partial: not a row
  assert.strictEqual(srv.call('getGroupDay', { groupRef: ref, dateKey: DK }, me('o')).code, 'NOT_MEMBER');
  assert.strictEqual(srv.call('getGroupDay', { groupRef: outsider, dateKey: DK }, me('u1')).code, 'NOT_MEMBER');
  // the caller has not completed: no rows, no positions, no mq
  let g = srv.call('getGroupDay', { groupRef: ref, dateKey: DK }, me('u3'));
  assert.strictEqual(g.viewerDone, false);
  assert.deepStrictEqual(g.rows, []);
  assert.strictEqual(g.mq, null);
  assert.strictEqual(g.n, 2);
  g = srv.call('getGroupDay', { groupRef: ref, dateKey: DK }, me('u1'));
  assert.strictEqual(g.n, 2);
  assert.strictEqual(g.mq, null, 'mq only for n >= 3');
  assert.strictEqual(g.rows.length, 2, 'only members with a complete daily');
  assert.ok(g.rows.every((r) => r[4].split(',').length === 5), 'positions for a viewer who completed');
  assert.strictEqual(g.rows[0][1] >= g.rows[1][1], true);
  assert.strictEqual(g.trend.length, 7);
  assert.strictEqual(g.trend[6].n, 2);
  assert.strictEqual(g.trend[6].mq, null, '— for days under 3 members');
  // the third member completes: mq appears and equals the hand computation
  for (let i = 1; i < 5; i++) srv.call('submitCard', { dateKey: DK, idx: i, pos: [0, 70, 80, 90, 100][i], groupRef: ref }, me('u3'));
  g = srv.call('getGroupDay', { groupRef: ref, dateKey: DK }, me('u3'));
  const cards = [0, 1, 2, 3, 4].map((c) => [[10, 20, 30, 40, 50][c], [12, 24, 36, 48, 60][c], [5, 70, 80, 90, 100][c]]);
  assert.strictEqual(g.n, 3);
  assert.strictEqual(g.mq, S.groupMq(cards));
  const mine = g.rows.find((r) => r[0] === g.selfHash);
  assert.strictEqual(mine[1], S.groupScore(cards, 2));
  // AC19: the same R_c under the group page, the friend board and the daily
  const refs = srv.call('getDaily', {}, me('u3')).refs;
  const fb = srv.call('getFriendBoard', { dateKey: DK }, me('u3'));
  assert.strictEqual(mine[2], S.dayTotal([5, 70, 80, 90, 100], refs));
  assert.strictEqual(fb.rows.find((r) => r[0] === fb.selfHash)[1], mine[2]);
  assert.strictEqual(srv.call('getDaily', {}, me('u3')).mine.total, mine[2]);
  // hashes differ between users and between days
  assert.notStrictEqual(g.rows[0][0], g.rows[1][0]);
  srv.clock.t += 86400e3;
  const g2 = srv.call('getGroupDay', { groupRef: ref, dateKey: srv.todayKey() }, me('u1'));
  assert.notStrictEqual(g2.selfHash, srv.call('getGroupDay', { groupRef: ref, dateKey: DK }, me('u1')).selfHash);
  // friend board: ranked by national score then earlier completion, positions only for a viewer who completed, selfOnly above the cap
  const fb1 = srv.call('getFriendBoard', { dateKey: DK }, me('u1'));
  assert.strictEqual(fb1.mode, 'full');
  const scores = fb1.rows.map((r) => r[1]);
  assert.deepStrictEqual(scores, scores.slice().sort((a, b) => b - a));
  assert.ok(fb1.rows.every((r) => typeof r[3] === 'string'));
  const fb0 = srv.call('getFriendBoard', { dateKey: DK }, me('nobody'));
  assert.ok(fb0.rows.every((r) => r[3] === null));
  assert.strictEqual(fb0.refs, null);
  const capped = server({ boardListCap: 2 });
  submitAll(capped, 'a', [1, 1, 1, 1, 1]);
  submitAll(capped, 'b', [2, 2, 2, 2, 2]);
  submitAll(capped, 'c', [3, 3, 3, 3, 3]);
  const cb = capped.call('getFriendBoard', { dateKey: DK }, me('a'));
  assert.strictEqual(cb.mode, 'selfOnly');
  assert.strictEqual(cb.rows.length, 1);
});

test('AC26: round targets are server-drawn integers 5-95, roughly uniform; never sent to a guesser before the reveal', () => {
  const srv = server();
  const draws = [];
  for (let u = 0; u < 500; u++) {
    for (let k = 0; k < 20; k++) {
      const r = srv.call('createRound', { spectrumId: 's001' }, me('h' + u));
      assert.ok(r.ok);
      draws.push(r.target);
    }
  }
  assert.strictEqual(draws.length, 10000);
  assert.ok(Math.min(...draws) >= 5 && Math.max(...draws) <= 95);
  assert.ok(draws.every(Number.isInteger));
  const deciles = new Array(10).fill(0);
  draws.forEach((d) => deciles[Math.min(9, Math.floor((d - 5) / 9))]++);
  deciles.forEach((n) => assert.ok(n / draws.length >= 0.08 && n / draws.length <= 0.12, 'decile ' + n));
  assert.strictEqual(srv.call('createRound', { spectrumId: 's001' }, me('h0')).code, 'RATE_LIMITED', '20 per day (AC 35)');
  assert.strictEqual(srv.call('createRound', { spectrumId: 'nope' }, me('zz')).code, 'INVALID_INPUT');
});

test('AC28/30/31/32/34: setClue, guesses, reveal paths and drafts', () => {
  const srv = server();
  const c = srv.call('createRound', { spectrumId: 's001' }, me('h'));
  const id = c.roundId;
  const wrongItem = require('../core/content').getContent(1).spectrumById.s002.items[0].id;
  assert.strictEqual(srv.call('setClue', { roundId: id, clueMode: 'preset', clueItemId: wrongItem }, me('h')).code, 'INVALID_INPUT');
  assert.strictEqual(srv.call('setClue', { roundId: id, clueMode: 'chat' }, me('other')).code, 'NOT_HOST');
  assert.strictEqual(srv.call('getRound', { roundId: id }, me('g1')).code, 'ROUND_NOT_FOUND', 'drafts are not found for others');
  assert.ok(srv.call('getRound', { roundId: id }, me('h')).ok);
  assert.ok(srv.call('setClue', { roundId: id, clueMode: 'preset', clueItemId: 's001i03' }, me('h')).ok);
  assert.strictEqual(srv.call('getRound', { roundId: id }, me('g1')).clueText, require('../core/content').getContent(1).itemById.s001i03.text);
  // guesses
  assert.strictEqual(srv.call('submitGuess', { roundId: id, pos: 50 }, me('h')).code, 'OWN_ROUND');
  assert.strictEqual(srv.call('submitGuess', { roundId: id, pos: 50.5 }, me('g1')).code, 'INVALID_INPUT');
  assert.ok(srv.call('submitGuess', { roundId: id, pos: 50 }, me('g1')).ok);
  assert.strictEqual(srv.call('submitGuess', { roundId: id, pos: 60 }, me('g1')).code, 'ALREADY_GUESSED');
  assert.strictEqual(srv.call('revealRound', { roundId: id }, me('h')).code, 'TOO_FEW_GUESSES');
  assert.strictEqual(srv.call('revealRound', { roundId: id }, me('g1')).code, 'NOT_HOST');
  const open = srv.call('getRound', { roundId: id }, me('g2'));
  assert.strictEqual(open.target, undefined);
  assert.strictEqual(open.rows, undefined);
  assert.strictEqual(open.guessCount, 1);
  // the 8th on-time guess reveals by itself, exactly once; the 9th is late
  for (let i = 2; i <= 7; i++) assert.ok(srv.call('submitGuess', { roundId: id, pos: 40 + i }, me('g' + i)).ok);
  const eighth = srv.call('submitGuess', { roundId: id, pos: 99 }, me('g8'));
  assert.ok(eighth.reveal && eighth.reveal.target === c.target);
  assert.strictEqual(srv.db.rounds[id].revealBy, 'count');
  const mq = srv.db.rounds[id].mq;
  const ninth = srv.call('submitGuess', { roundId: id, pos: 1 }, me('g9'));
  assert.strictEqual(ninth.late, true);
  assert.ok(ninth.reveal);
  assert.strictEqual(srv.db.rounds[id].mq, mq, 'late guesses are excluded from 默契值');
  const rv = srv.call('getRound', { roundId: id }, me('g2'));
  assert.strictEqual(rv.target, c.target);
  assert.strictEqual(rv.rows.filter((r) => r[3] === 1).length, 1);
  assert.strictEqual(rv.rows.filter((r) => r[4] === 1).length, 1);
  // host reveal with >= 2, idempotent
  const c2 = srv.call('createRound', { spectrumId: 's001' }, me('h'));
  srv.call('setClue', { roundId: c2.roundId, clueMode: 'chat' }, me('h'));
  srv.call('submitGuess', { roundId: c2.roundId, pos: 30 }, me('a'));
  srv.call('submitGuess', { roundId: c2.roundId, pos: 31 }, me('b'));
  const r1 = srv.call('revealRound', { roundId: c2.roundId }, me('h'));
  const r2 = srv.call('revealRound', { roundId: c2.roundId }, me('h'));
  assert.ok(r1.ok && r2.ok);
  assert.strictEqual(r1.reveal.mq, r2.reveal.mq);
  assert.strictEqual(srv.db.rounds[c2.roundId].revealBy, 'host');
  // 24 h: >= 1 guess reveals, 0 guesses -> noGuesses (lazy read and sweep), > 7 days -> ROUND_EXPIRED
  const c3 = srv.call('createRound', { spectrumId: 's001' }, me('h'));
  srv.call('setClue', { roundId: c3.roundId, clueMode: 'chat' }, me('h'));
  srv.call('submitGuess', { roundId: c3.roundId, pos: 30 }, me('a'));
  const c4 = srv.call('createRound', { spectrumId: 's001' }, me('h'));
  srv.call('setClue', { roundId: c4.roundId, clueMode: 'chat' }, me('h'));
  srv.clock.t += 25 * 3600e3;
  assert.strictEqual(srv.call('getRound', { roundId: c3.roundId }, me('x')).status, 'revealed');
  assert.strictEqual(srv.db.rounds[c3.roundId].revealBy, 'timer');
  srv.call('sweepRounds', {}, {});
  assert.strictEqual(srv.db.rounds[c4.roundId].status, 'noGuesses');
  srv.clock.t += 8 * 86400e3;
  assert.strictEqual(srv.call('submitGuess', { roundId: c3.roundId, pos: 5 }, me('late')).code, 'ROUND_EXPIRED');
  // AC34: a draft without a clue is gone after 30 min
  const c5 = srv.call('createRound', { spectrumId: 's001' }, me('h2'));
  srv.clock.t += 31 * 60 * 1000;
  assert.strictEqual(srv.call('getRound', { roundId: c5.roundId }, me('x')).code, 'ROUND_NOT_FOUND');
  assert.strictEqual(srv.call('getRound', { roundId: c5.roundId }, me('h2')).code, 'ROUND_NOT_FOUND');
});

test('AC63: one subscribe message per grant, even with two reveal paths; none without a template', () => {
  const srv = server();
  const c = srv.call('createRound', { spectrumId: 's001' }, me('h'));
  srv.call('setClue', { roundId: c.roundId, clueMode: 'chat' }, me('h'));
  assert.strictEqual(srv.call('subscribeRound', { roundId: c.roundId }, me('h')).code, 'NO_TEMPLATE');
  srv.setConfig({ subscribe: { tmplId: 'T' } });
  assert.strictEqual(srv.call('subscribeRound', { roundId: c.roundId }, me('stranger')).code, 'FORBIDDEN');
  assert.ok(srv.call('subscribeRound', { roundId: c.roundId }, me('h')).ok);
  assert.ok(srv.call('subscribeRound', { roundId: c.roundId }, me('h')).ok, 'idempotent');
  srv.call('submitGuess', { roundId: c.roundId, pos: 20 }, me('g1'));
  srv.call('submitGuess', { roundId: c.roundId, pos: 30 }, me('g2'));
  assert.ok(srv.call('subscribeRound', { roundId: c.roundId }, me('g1')).ok);
  assert.strictEqual(Object.keys(srv.db.subs).length, 2);
  srv.call('revealRound', { roundId: c.roundId }, me('h'));
  srv.call('revealRound', { roundId: c.roundId }, me('h'));
  srv.clock.t += 25 * 3600e3;
  srv.call('sweepRounds', {}, {});
  assert.strictEqual(srv.db.sentMessages.length, 2, 'two grants, two messages');
  srv.db.sentMessages.forEach((m) => {
    assert.strictEqual(m.page, 'r=' + c.roundId);
    assert.ok(!JSON.stringify(m).includes('openid'));
  });
});

test('AC36/39/40: archive paging and DAY_OPEN, bonus cards, 全国分布 only for answered cards of an open day', () => {
  const srv = server({ launchDateKey: '20261001' });
  const first = srv.call('getArchive', {}, me('a'));
  assert.strictEqual(first.items.length, 30);
  assert.strictEqual(first.hasMore, true);
  assert.strictEqual(first.items[0].dateKey, '20261119', 'newest first');
  assert.ok(!first.items.some((i) => i.dateKey === DK), 'today never appears');
  const second = srv.call('getArchive', { before: first.items[29].dateKey }, me('a'));
  assert.strictEqual(first.items.length + second.items.length, 50, '50 closed days from 10/01 to 11/19');
  assert.strictEqual(second.hasMore, false);
  assert.strictEqual(srv.call('getArchiveDay', { dateKey: DK }, me('a')).code, 'DAY_OPEN');
  srv.clock.t = Date.UTC(2026, 10, 20, 16, 29, 0);
  assert.strictEqual(srv.call('getArchiveDay', { dateKey: DK }, me('a')).code, 'DAY_OPEN', 'until 00:30');
  srv.clock.t = Date.UTC(2026, 10, 20, 16, 31, 0);
  assert.ok(srv.call('getArchiveDay', { dateKey: DK }, me('a')).ok);
  srv.clock.t = T0 + 86400e3;
  // bonus: an unanswered item of a closed day, 3 a day
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const b = srv.call('getBonusCard', {}, me('a'));
    assert.ok(b.ok && b.card.itemId && typeof b.final === 'number' && /^\d{8}$/.test(b.dateKey));
    assert.ok(!JSON.stringify(b).includes('anchor'));
    seen.add(b.card.itemId);
  }
  assert.strictEqual(srv.call('getBonusCard', {}, me('a')).code, 'RATE_LIMITED');
  // 全国分布 for an open day: only the cards the caller answered
  const s2 = server();
  s2.call('submitCard', { dateKey: DK, idx: 0, pos: 40 }, me('p'));
  const u = s2.call('unlockDistribution', { dateKey: DK }, me('p'));
  assert.strictEqual(u.hist[0].length, 21);
  assert.strictEqual(u.hist[1], null);
  assert.strictEqual(s2.call('getArchiveDay', { dateKey: '20261119' }, me('p')).hist, undefined, 'locked until the rewarded unlock');
  assert.strictEqual(s2.call('unlockDistribution', { dateKey: '20261119' }, me('p')).hist.every((h) => h.length === 21), true, 'a closed day gives all five');
  assert.strictEqual(s2.call('getArchiveDay', { dateKey: '20261119' }, me('p')).hist.length, 5, 'unlocked: histograms with the day');
  assert.strictEqual(s2.call('getArchiveDay', { dateKey: '20261118' }, me('p')).hist, undefined, 'a different set is not unlocked');
});

test('AC79: card reports take three reasons only, 10 a day, no text stored', () => {
  const srv = server();
  assert.strictEqual(srv.call('reportCard', { itemId: 's001i01', reason: 'rude' }, me('a')).code, 'INVALID_INPUT');
  assert.strictEqual(srv.call('reportCard', { itemId: 'zzz', reason: 'typo' }, me('a')).code, 'INVALID_INPUT');
  for (let i = 0; i < 10; i++) assert.ok(srv.call('reportCard', { itemId: 's001i01', reason: ['unsuitable', 'ambiguous', 'typo'][i % 3], dateKey: DK, text: 'ignored' }, me('a')).ok);
  assert.strictEqual(srv.call('reportCard', { itemId: 's001i01', reason: 'typo' }, me('a')).code, 'RATE_LIMITED');
  assert.ok(srv.db.reports.every((r) => !('text' in r)));
});

test('AC49: no response over a scripted session contains an openid or a group id', () => {
  const srv = server({ population: 20 });
  const responses = [];
  const call = (name, data, who) => {
    const r = srv.call(name, data, me(who));
    responses.push(JSON.stringify(r));
    return r;
  };
  const ref = srv.joinGroupAs('player-secret-1', 'GROUP-SECRET');
  responses.push(ref);
  srv.joinGroupAs('player-secret-2', 'GROUP-SECRET');
  call('getDaily', { groupRef: ref }, 'player-secret-1');
  for (let i = 0; i < 5; i++) call('submitCard', { dateKey: DK, idx: i, pos: 10 * i + 5, groupRef: ref }, 'player-secret-1');
  submitAll(srv, 'player-secret-2', [20, 30, 40, 50, 60], ref);
  call('getDaily', { groupRef: ref }, 'player-secret-1');
  call('getGroupDay', { groupRef: ref, dateKey: DK }, 'player-secret-1');
  call('getFriendBoard', { dateKey: DK }, 'player-secret-1');
  const c = call('createRound', { spectrumId: 's001' }, 'player-secret-1');
  call('setClue', { roundId: c.roundId, clueMode: 'chat' }, 'player-secret-1');
  call('submitGuess', { roundId: c.roundId, pos: 50, groupRef: ref }, 'player-secret-2');
  call('submitGuess', { roundId: c.roundId, pos: 60 }, 'other-secret');
  call('revealRound', { roundId: c.roundId }, 'player-secret-1');
  call('getRound', { roundId: c.roundId }, 'player-secret-2');
  const dump = responses.join('\n');
  ['player-secret', 'other-secret', 'GROUP-SECRET', 'openid', 'openGId', 'opengid'].forEach((s) => assert.ok(!dump.includes(s), 'leaked ' + s));
  // the same user's hash differs between two rounds
  const c2 = call('createRound', { spectrumId: 's001' }, 'player-secret-1');
  call('setClue', { roundId: c2.roundId, clueMode: 'chat' }, 'player-secret-1');
  assert.notStrictEqual(srv.call('getRound', { roundId: c.roundId }, me('player-secret-2')).selfHash, srv.call('getRound', { roundId: c2.roundId }, me('player-secret-2')).selfHash);
});

test('the mock honours failure hooks: offline and one-shot errors, and never throws', () => {
  const srv = server();
  srv.offline = true;
  assert.strictEqual(srv.call('getDaily', {}, me('a')).code, 'NETWORK');
  srv.offline = false;
  srv.fail.getDaily = { code: 'INTERNAL', times: 1 };
  assert.strictEqual(srv.call('getDaily', {}, me('a')).code, 'INTERNAL');
  assert.ok(srv.call('getDaily', {}, me('a')).ok);
  assert.strictEqual(srv.call('nope', {}, me('a')).code, 'INTERNAL');
  assert.strictEqual(srv.call('track', { events: new Array(51).fill({}) }, me('a')).code, 'INVALID_INPUT');
  assert.ok(srv.call('track', { events: [{ name: 'x' }] }, me('a')).ok);
  const feat = srv.call('getDaily', {}, me('a')).features;
  assert.deepStrictEqual(feat.subscribe, null);
  assert.strictEqual(feat.banner.enabled, false);
  assert.strictEqual(feat.interstitial.maxPerDay, 6);
  srv.setConfig({ subscribe: { tmplId: 'T1' }, interstitial: { everyNSets: 1, minGapSec: 1, maxPerDay: 99 } });
  const f2 = srv.call('getDaily', {}, me('a')).features;
  assert.strictEqual(f2.subscribe.tmplId, 'T1');
  assert.deepStrictEqual([f2.interstitial.everyNSets, f2.interstitial.minGapSec, f2.interstitial.maxPerDay], [2, 60, 8], 'remote caps are clamped');
  void D;
});
