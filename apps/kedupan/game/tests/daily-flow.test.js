'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');
const SV = require('../core/service');
const { setup, playDay, BJ, content, schedule, allStrings } = require('./helpers');

const T1 = '20261105';
const flat = (x) => JSON.stringify(x);

test('AC 12: two users on the same Beijing date get the same issue and the same 5 cards', () => {
  const { srv } = setup();
  const a = srv.callAs('alice', 'getDaily', {});
  const b = srv.callAs('bob', 'getDaily', {});
  assert.equal(a.ok, true);
  assert.equal(a.dateKey, T1);
  assert.equal(a.issueNo, 5);
  assert.equal(b.issueNo, 5);
  assert.deepEqual(a.cards, b.cards);
  assert.equal(a.cards.length, 5);
  assert.deepEqual(a.cards.map((c) => c.itemId), schedule.days[4]);
  assert.equal(srv.db.sets[T1].source, 'schedule');
});

test('AC 13: getDaily never returns anchors, histograms, or refs for cards the caller has not answered', () => {
  const { srv } = setup();
  srv.seedCrowd(T1, 0, 200);
  srv.seedCrowd(T1, 1, 200);
  const before = srv.callAs('alice', 'getDaily', {});
  assert.deepEqual(before.refs, [null, null, null, null, null]);
  assert.equal(before.mine.total, null);
  assert.ok(!/anchor|hist/.test(flat(before)), 'no anchor or histogram field');
  assert.equal(before.groupRefs, null);
  srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 40 });
  const after = srv.callAs('alice', 'getDaily', {});
  assert.equal(typeof after.refs[0], 'number');
  assert.deepEqual(after.refs.slice(1), [null, null, null, null]);
  assert.equal(after.mine.reveals[0].pos, 40);
  assert.equal(after.mine.reveals[1], null);
  assert.equal(after.divisiveIdx, null, 'only after the day is complete');
  assert.ok(!/anchor|hist/.test(flat(after)));
  // card text carries the category label but no anchor
  assert.deepEqual(Object.keys(after.cards[0]).sort(), ['catLabel', 'itemId', 'left', 'prompt', 'right', 'spectrumId']);
});

test('AC 14/15: submitCard validation - non-integer, out of range, wrong order, second answer', () => {
  const { srv } = setup();
  const call = (d) => srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 50, ...d });
  assert.equal(call({ pos: 50.5 }).code, 'INVALID_INPUT');
  assert.equal(call({ pos: -1 }).code, 'INVALID_INPUT');
  assert.equal(call({ pos: 101 }).code, 'INVALID_INPUT');
  assert.equal(call({ idx: 5 }).code, 'INVALID_INPUT');
  assert.equal(call({ idx: 2 }).code, 'CARD_ORDER');
  assert.equal(srv.db.entries[T1 + '_alice'], undefined, 'rejected calls write nothing');
  const ok = call({ pos: 0 });
  assert.equal(ok.ok, true);
  assert.equal(ok.pos, 0, 'position 0 is valid');
  const again = call({ pos: 90 });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'CARD_DONE');
  assert.equal(again.reveal.pos, 0, 'the stored position wins');
  assert.equal(again.reveal.idx, 0);
  assert.equal(srv.db.entries[T1 + '_alice'].pos[0], 0);
  assert.equal(srv.callAs('alice', 'submitCard', { dateKey: '20261106', idx: 1, pos: 5 }).code, 'INVALID_INPUT', 'future day');
});

test('AC 15: the histogram n grows by exactly 1 per first answer (two parallel identical calls)', async () => {
  const { srv } = setup();
  const { createApi } = require('../js/api');
  const api = createApi({ mockServer: srv });
  await api.getDaily({});
  const [r1, r2] = await Promise.all([api.submitCard({ dateKey: T1, idx: 0, pos: 33 }), api.submitCard({ dateKey: T1, idx: 0, pos: 33 })]);
  assert.deepEqual([r1.ok, r2.ok].sort(), [false, true]);
  assert.equal([r1, r2].find((r) => !r.ok).code, 'CARD_DONE');
  const st = srv.db.stats[T1 + '_0'];
  assert.equal(st.n, 1);
  assert.equal(st.hist[33], 1);
  assert.equal(S.histTotal(st.hist), 1);
});

test('AC 16: the reveal carries ref, score, label and the agree % only from 30 answers', () => {
  const { srv } = setup();
  srv.seedCrowd(T1, 0, 10, { mean: 50, sd: 3 });
  const a = srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 50 });
  assert.equal(a.agreePct, null);
  assert.equal(a.n, 11);
  assert.equal(a.small, true);
  srv.seedCrowd(T1, 1, 60, { mean: 50, sd: 3 });
  srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 1, pos: 50 });
  const set = srv.db.sets[T1];
  const card = srv.callAs('bob', 'getDaily', {});
  assert.equal(card.mine.reveals[1], null);
  const mine = srv.callAs('alice', 'getDaily', {});
  const rev = mine.mine.reveals[1];
  assert.ok(rev.agreePct >= 90, 'tight crowd around 50: ' + rev.agreePct);
  assert.equal(rev.small, false);
  assert.equal(rev.ref, S.nationRef(srv.db.stats[T1 + '_1'].hist, set.cards[1].anchor));
  assert.equal(rev.score, S.cardScore(Math.abs(50 - rev.ref)));
});

test('AC 16: with group context and another member\'s answer, the reveal has the group median and dots; without a valid groupRef it is ignored', () => {
  const { srv } = setup();
  const ref = srv.callAs('alice', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  srv.callAs('bob', 'joinGroup', { cloudID: srv.cloudID('G1') });
  srv.callAs('cara', 'joinGroup', { cloudID: srv.cloudID('G1') });
  srv.callAs('bob', 'submitCard', { dateKey: T1, idx: 0, pos: 20 });
  srv.callAs('cara', 'submitCard', { dateKey: T1, idx: 0, pos: 40 });
  // a stranger passing someone else's groupRef gets no group block
  const stranger = srv.callAs('dave', 'submitCard', { dateKey: T1, idx: 0, pos: 10, groupRef: ref });
  assert.equal(stranger.group, null);
  const r = srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 30, groupRef: ref });
  assert.deepEqual(r.group, { median: 30, n: 2, dots: [20, 40] }, 'others only (bob, cara)');
  // first member alone: no ●
  const g2 = srv.callAs('erin', 'joinGroup', { cloudID: srv.cloudID('G2') }).groupRef;
  const lone = srv.callAs('erin', 'submitCard', { dateKey: T1, idx: 0, pos: 30, groupRef: g2 });
  assert.deepEqual(lone.group, { median: null, n: 0, dots: [] });
  // getDaily restores the group block for answered cards only
  const d = srv.callAs('alice', 'getDaily', { groupRef: ref });
  assert.deepEqual(d.groupRefs[0], { median: 30, n: 2, dots: [20, 40] });
  assert.equal(d.groupRefs[1], null);
});

test('AC 18/19: after card 5 the response carries the live total, band, refs and the most divisive card; boards agree with it', () => {
  const { srv } = setup();
  for (let i = 0; i < 5; i++) srv.seedCrowd(T1, i, 80, { sd: i === 3 ? 30 : 4 });
  const ref = srv.callAs('alice', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  srv.callAs('bob', 'joinGroup', { cloudID: srv.cloudID('G1') });
  srv.callAs('cara', 'joinGroup', { cloudID: srv.cloudID('G1') });
  const out = playDay(srv, 'alice', [10, 20, 30, 40, 50]);
  out.slice(0, 4).forEach((r) => assert.equal(r.complete, false));
  const last = out[4];
  assert.equal(last.complete, true);
  const set = srv.db.sets[T1];
  const hists = [0, 1, 2, 3, 4].map((i) => srv.db.stats[T1 + '_' + i].hist);
  const refs = hists.map((h, i) => S.nationRef(h, set.cards[i].anchor));
  assert.deepEqual(last.refs, refs);
  const exp = S.dailyTotal([10, 20, 30, 40, 50], refs);
  assert.equal(last.total, exp.total);
  assert.equal(last.band, S.dayBand(exp.total));
  assert.deepEqual(last.cardScores, exp.scores);
  assert.equal(last.divisiveIdx, 3, 'the card with sd 30 has the widest spread');
  assert.deepEqual(last.streak, { current: 1, best: 1 });
  playDay(srv, 'bob', [12, 22, 32, 42, 52]);
  playDay(srv, 'cara', [90, 80, 70, 60, 50]);
  const day = srv.callAs('alice', 'getDaily', {});
  assert.equal(day.mine.total, last.total);
  assert.equal(day.divisiveIdx, 3);
  const g = srv.callAs('alice', 'getGroupDay', { groupRef: ref, dateKey: T1 });
  const f = srv.callAs('alice', 'getFriendBoard', { dateKey: T1 });
  const mineG = g.rows.find((r) => r[0] === g.selfHash);
  const mineF = f.rows.find((r) => r[0] === f.selfHash);
  assert.equal(mineG[2], exp.total, 'group page national score = day result total');
  assert.equal(mineF[1], exp.total, 'friend board score = day result total');
});

test('AC 20: incomplete days never appear on boards or in streaks; a grace completion counts for D', () => {
  const { srv, clock } = setup();
  srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 10 });
  srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 1, pos: 10 });
  assert.deepEqual(srv.callAs('alice', 'getFriendBoard', { dateKey: T1 }).rows, []);
  assert.equal(srv.db.players.alice, undefined, 'no streak for a partial day');
  clock.set(BJ(T1, 23, 59, 0));
  srv.callAs('bob', 'submitCard', { dateKey: T1, idx: 0, pos: 10 });
  clock.set(BJ('20261106', 0, 20, 0)); // inside the grace window
  for (let i = 1; i < 5; i++) assert.equal(srv.callAs('bob', 'submitCard', { dateKey: T1, idx: i, pos: 10 }).ok, true);
  assert.equal(srv.db.players.bob.lastCompleteDate, T1, 'the completion counts for D, not D+1');
  clock.set(BJ('20261106', 0, 31, 0));
  assert.equal(srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 2, pos: 10 }).code, 'LATE_SUBMIT');
  assert.equal(srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 1, pos: 10 }).code, 'CARD_DONE', 'answered cards still replay');
  assert.equal(srv.db.entries[T1 + '_alice'].completeAt, null);
});

test('AC 21: progress resumes at the first unanswered card on a second device (same server state)', () => {
  const { srv } = setup();
  srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 11 });
  srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 1, pos: 22 });
  const d = srv.callAs('alice', 'getDaily', {});
  assert.deepEqual(d.mine.pos, [11, 22, null, null, null]);
  assert.equal(d.mine.answered, 2);
  assert.equal(d.mine.complete, false);
  assert.equal(d.mine.pos.indexOf(null), 2);
});

test('AC 22: every day key comes from the server clock, not the device (a getDaily at 15:59:59 and 16:00:00 UTC)', () => {
  const { srv, clock } = setup();
  clock.set(Date.UTC(2026, 10, 4, 15, 59, 59));
  assert.equal(srv.callAs('a', 'getDaily', {}).dateKey, '20261104');
  clock.set(Date.UTC(2026, 10, 4, 16, 0, 0));
  assert.equal(srv.callAs('a', 'getDaily', {}).dateKey, '20261105');
});

test('AC 23: genDaily double fire and a racing lazy getDaily create exactly one document; a client call is FORBIDDEN', () => {
  const { srv, clock } = setup();
  clock.set(BJ(T1, 23, 0, 0));
  assert.equal(srv.call('genDaily', {}).code, 'FORBIDDEN');
  const a = srv.runTimer('genDaily');
  const b = srv.runTimer('genDaily');
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(Object.keys(srv.db.sets).filter((k) => k === '20261106').length, 1);
  clock.set(BJ('20261106', 0, 5, 0));
  srv.callAs('a', 'getDaily', {});
  srv.callAs('b', 'getDaily', {});
  assert.equal(Object.keys(srv.db.sets).length, 1, 'the lazy path found the generated set');
  assert.equal(srv.db.sets['20261106'].issueNo, 6);
});

test('AC 24: replacing a card keeps earlier answers for that index, resets its histogram and logs the edit', () => {
  const { srv, clock } = setup();
  srv.callAs('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 44 });
  const set = srv.db.sets[T1];
  const spare = content.itemIds.find((id) => !schedule.days.flat().includes(id) && id !== set.cards[0].itemId);
  const { cardOf } = require('../core/content');
  const rep = SV.replaceCard(set, 0, cardOf(content, spare), clock.now());
  srv.db.sets[T1] = rep.set;
  srv.db.stats[rep.stats._id] = rep.stats;
  const d = srv.callAs('alice', 'getDaily', {});
  assert.equal(d.cards[0].itemId, spare, 'the next getDaily shows the new card');
  assert.equal(d.mine.pos[0], 44, 'the earlier answer stays valid for the index');
  assert.equal(srv.db.sets[T1].edits.length, 1);
  assert.equal(srv.db.sets[T1].edits[0].from, set.cards[0].itemId);
  assert.equal(srv.db.stats[T1 + '_0'].n, 0, 'the histogram restarted');
  assert.equal(d.cards[1].itemId, set.cards[1].itemId, 'other cards untouched');
});

test('AC 11: the card text always comes from the server copy of the set', () => {
  const { srv } = setup();
  srv.callAs('a', 'getDaily', {});
  srv.db.sets[T1].cards[2].prompt = '服务端文本';
  assert.equal(srv.callAs('b', 'getDaily', {}).cards[2].prompt, '服务端文本');
});

test('AC 25: finalizeDay is idempotent; final/finalHist/finalCount exist; a read after 00:30 computes final lazily', () => {
  const { srv, clock } = setup();
  for (let i = 0; i < 5; i++) srv.seedCrowd(T1, i, 40);
  for (let u = 0; u < 35; u++) playDay(srv, 'u' + u, [10 + u, 20, 30, 40, 50]);
  clock.set(BJ('20261106', 0, 20, 0));
  assert.equal(srv.callAs('u1', 'getArchive', {}).items.some((i) => i.dateKey === T1), false, 'not archived before 00:30');
  clock.set(BJ('20261106', 0, 31, 0));
  assert.equal(srv.db.sets[T1].final, undefined);
  const lazy = srv.callAs('u1', 'getArchiveDay', { dateKey: T1 });
  assert.equal(lazy.ok, true);
  assert.equal(lazy.finals.length, 5, 'lazy final[5]');
  assert.equal(lazy.mine.pct, null, 'percentile waits for the timer');
  const r1 = srv.runTimer('finalizeDay');
  assert.deepEqual(r1.finalized, [T1]);
  const set = srv.db.sets[T1];
  assert.equal(set.finalCount, 35);
  assert.equal(S.histTotal(set.finalHist), 35);
  const snapshot = JSON.stringify(set);
  assert.deepEqual(srv.runTimer('finalizeDay').finalized, [], 'second run is a no-op');
  assert.equal(JSON.stringify(set), snapshot);
  const d2 = srv.callAs('u1', 'getArchiveDay', { dateKey: T1 });
  assert.equal(d2.mine.pct, S.percentile(d2.mine.total, set.finalHist, 35));
});

test('AC 18/38: the next day shows the frozen result (定分) and yesterday\'s total and percentile on getDaily', () => {
  const { srv, clock } = setup();
  for (let u = 0; u < 32; u++) playDay(srv, 'u' + u, [10 + (u % 40), 20, 30, 40, 50]);
  clock.set(BJ('20261106', 9, 0, 0));
  srv.runTimer('finalizeDay');
  const d = srv.callAs('u5', 'getDaily', {});
  assert.equal(d.dateKey, '20261106');
  assert.equal(d.yesterday.final, true);
  const set = srv.db.sets[T1];
  assert.equal(d.yesterday.total, S.dailyTotal([15, 20, 30, 40, 50], set.final).total);
  assert.equal(typeof d.yesterday.pct, 'number');
  assert.equal(srv.callAs('nobody', 'getDaily', {}).yesterday, null, 'only for players who completed it');
  // before 00:30 there is no 定分 line
  const s2 = setup();
  playDay(s2.srv, 'a', [1, 2, 3, 4, 5]);
  s2.clock.set(BJ('20261106', 0, 10, 0));
  assert.equal(s2.srv.callAs('a', 'getDaily', {}).yesterday, null);
  // ... but the live view of D stays readable until it closes
  const live = s2.srv.callAs('a', 'getDaily', { dateKey: T1 });
  assert.equal(live.ok, true);
  assert.equal(live.frozen, false);
  assert.equal(live.mine.complete, true);
});

test('AC 82: the fast flag is written when card 5 completes < 6 s after card 1 and never changes scores', () => {
  const a = setup();
  const b = setup();
  for (const s of [a, b]) for (let i = 0; i < 5; i++) s.srv.seedCrowd(T1, i, 50);
  const slow = (s, who) => {
    for (let i = 0; i < 5; i++) {
      s.clock.add(5000);
      s.srv.callAs(who, 'submitCard', { dateKey: T1, idx: i, pos: 30 + i });
    }
  };
  const fast = (s, who) => {
    for (let i = 0; i < 5; i++) {
      s.clock.add(500);
      s.srv.callAs(who, 'submitCard', { dateKey: T1, idx: i, pos: 30 + i });
    }
  };
  slow(a, 'p');
  fast(b, 'p');
  assert.equal(a.srv.db.anomalies.length, 0);
  assert.equal(b.srv.db.anomalies.length, 1);
  assert.equal(b.srv.db.anomalies[0].kind, 'fast');
  const ta = a.srv.callAs('p', 'getDaily', {}).mine.total;
  const tb = b.srv.callAs('p', 'getDaily', {}).mine.total;
  assert.equal(ta, tb, 'same answers, same score');
  assert.equal(b.srv.db.players.p.curStreak, 1, 'streak unaffected');
});

test('AC 81: positions and outcomes do not depend on new-user status or session count', () => {
  const run = (warm) => {
    const { srv } = setup();
    if (warm) for (let i = 0; i < 12; i++) srv.callAs('veteran', 'getDaily', {});
    for (let i = 0; i < 5; i++) srv.seedCrowd(T1, i, 30);
    return playDay(srv, warm ? 'veteran' : 'newbie', [5, 15, 25, 35, 45]).map((r) => [r.ref, r.score, r.label]);
  };
  assert.deepEqual(run(true), run(false));
});

test('DAILY_UNAVAILABLE before launch; the auto path takes over past the end of the schedule', () => {
  const pre = setup({ date: '20261031' });
  assert.equal(pre.srv.callAs('a', 'getDaily', {}).code, 'DAILY_UNAVAILABLE');
  const far = setup({ date: '20261220' }); // schedule has 40 days from 20261101: ends 20261210
  const d = far.srv.callAs('a', 'getDaily', {});
  assert.equal(d.ok, true);
  assert.equal(far.srv.db.sets['20261220'].source, 'auto');
  const used = new Set(schedule.days.flat());
  d.cards.forEach((c) => assert.ok(!used.has(c.itemId), 'auto path never reuses scheduled items'));
});

test('offline mock returns NETWORK; unknown and timer names are refused', () => {
  const { srv } = setup();
  srv.offline = true;
  assert.equal(srv.call('getDaily', {}).code, 'NETWORK');
  srv.offline = false;
  assert.equal(srv.call('nope', {}).code, 'INVALID_INPUT');
  ['finalizeDay', 'sweepRounds', 'cleanup'].forEach((n) => assert.equal(srv.call(n, {}).code, 'FORBIDDEN'));
});

test('no response contains a raw openid', () => {
  const { srv } = setup();
  playDay(srv, 'secret-openid-xyz', [1, 2, 3, 4, 5]);
  const responses = [
    srv.callAs('secret-openid-xyz', 'getDaily', {}),
    srv.callAs('secret-openid-xyz', 'getFriendBoard', { dateKey: T1 }),
    srv.callAs('secret-openid-xyz', 'getArchive', {}),
  ];
  allStrings(responses).forEach((s) => assert.ok(s.indexOf('secret-openid-xyz') < 0, s));
});
