'use strict';
// startRun / answer: server-stepped runs, no lookahead, idempotency, ordering, windows, finalization, day streaks.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, oracle, playDaily, runId, allStrings, allKeys, HOUR } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); h.loadDailyFacts(); });
afterEach(() => h.teardown());

const A = 'openid-alice-0001';
const B = 'openid-bob-00002';

test('startRun returns question 1: top WITH value and source, bottom WITHOUT any value', async () => {
  await h.call('getDaily', {}, { openid: A });
  const s = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  assert.equal(s.ok, true);
  assert.equal(s.k, 1);
  assert.equal(s.ranked, true);
  assert.equal(s.resumed, false);
  assert.equal(s.deckLength, 40);
  const q = s.question;
  assert.equal(q.k, 1);
  assert.equal(q.segmentStart, true);
  assert.ok(q.top.valueText && q.top.sourceText && q.top.unitText);
  assert.deepEqual(Object.keys(q.bottom).sort(), ['factId', 'label', 'measure', 'unitText']);
  assert.ok(q.verbs.hi && q.verbs.lo);
  assert.deepEqual(s.answered, []);
});

test('NO LOOKAHEAD: over a full scripted run no payload holds a question beyond the current one or an unanswered value', async () => {
  const run = await playDaily(h, A, { right: 40 });
  assert.equal(run.last.ended, true);
  const o = oracle(h, run.start.dateKey);
  const responses = [run.start, ...run.steps];
  // payload i is the response that exposes question i+1 (start -> q1, answer k -> q k+1)
  responses.forEach((resp, i) => {
    const exposed = i + 1; // highest question this payload may mention
    const json = JSON.stringify(resp);
    for (let k = exposed + 1; k <= 40; k++) {
      const q = o.deck.questions[k - 1];
      for (const id of [q.a, q.b]) {
        // a fact may legitimately be in an earlier/current question (chained cards); only forbid ids that first appear later
        const earlier = o.deck.questions.slice(0, exposed).some((e) => e.a === id || e.b === id);
        if (!earlier) {
          assert.equal(json.includes(`"${id}"`), false, `payload ${i} leaks fact id of question ${k}`);
          // the same name can belong to an already exposed fact of another measure (亚洲象 weight vs lifespan): that is no leak
          const sameNameExposed = o.deck.questions.slice(0, exposed).some((e) => [e.a, e.b].some((x) => o.facts[x].label === o.facts[id].label));
          if (!sameNameExposed) assert.equal(json.includes(`"${o.facts[id].label}"`), false, `payload ${i} leaks label of question ${k}`);
        }
      }
    }
    if (resp.question || resp.next) {
      const cur = resp.question || resp.next;
      assert.deepEqual(Object.keys(cur.bottom).sort().filter((k2) => k2 !== 'sub'), ['factId', 'label', 'measure', 'unitText']);
      assert.equal('value' in cur.bottom || 'valueText' in cur.bottom || 'sourceText' in cur.bottom || 'note' in cur.bottom, false);
      assert.equal(JSON.stringify(cur.bottom).includes(String(o.facts[cur.bottom.factId].value)), false);
    }
  });
});

test('getDaily, getBoard, getChallenge and getHistory never carry a question or a future value', async () => {
  const d = await h.call('getDaily', {}, { openid: A });
  const s = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const ch = await playDaily(h, B, { right: 3 });
  const created = await h.call('createChallenge', { runId: ch.start.clientRunId }, { openid: B });
  const resp = [
    d, await h.call('getDaily', {}, { openid: A }),
    await h.call('getBoard', { kind: 'friend', dateKey: '20261015' }, { openid: A }),
    await h.call('getChallenge', { challengeId: created.challengeId }, { openid: A }),
    await h.call('getHistory', {}, { openid: A }),
    await h.call('getHistory', { dateKey: '20261015' }, { openid: A }),
  ];
  const o = oracle(h, '20261015');
  const labels = Object.values(o.facts).map((f) => f.label);
  for (const r of resp) {
    assert.equal(r.ok, true, JSON.stringify(r));
    const json = JSON.stringify(r);
    for (const l of labels) assert.equal(json.includes(`"${l}"`), false, `leaked ${l}`);
    for (const k of ['questions', 'question', 'deck']) assert.ok(!(k in r) || r[k] === null, k);
  }
  assert.ok(s.ok);
});

test('answers are judged on the server: correct continues with the next question, wrong ends the run', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const o = oracle(h, st.dateKey);
  const r1 = await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.correct(1), ms: 2000 }, { openid: A });
  assert.equal(r1.ok, true);
  assert.equal(r1.correct, true);
  assert.equal(r1.streak, 1);
  assert.equal(r1.ended, false);
  assert.equal(r1.reveal.factId, o.deck.questions[0].b);
  assert.equal(r1.reveal.value, o.facts[o.deck.questions[0].b].value);
  assert.ok(r1.reveal.valueText && r1.reveal.sourceText);
  assert.equal(r1.next.k, 2);
  assert.equal(r1.next.top.factId, o.deck.questions[1].a);
  const r2 = await h.call('answer', { clientRunId: st.clientRunId, k: 2, choice: o.wrong(2), ms: 2000 }, { openid: A });
  assert.equal(r2.correct, false);
  assert.equal(r2.ended, true);
  assert.equal(r2.streak, 1);
  assert.equal(r2.result.n, 1);
  assert.equal(r2.result.endReason, 'miss');
  assert.equal('next' in r2, false);
  assert.equal(r2.result.dayStreak, 1);
});

test('within a segment the bottom card becomes the next top card; a fresh top appears at a segment change', async () => {
  const run = await playDaily(h, A, { right: 40 });
  const o = oracle(h, run.start.dateKey);
  let chains = 0;
  let fresh = 0;
  for (let k = 2; k <= 40; k++) {
    const prev = o.deck.questions[k - 2];
    const q = o.deck.questions[k - 1];
    const payload = run.steps[k - 2].next;
    assert.equal(payload.k, k);
    if (q.a === prev.b) { chains++; assert.equal(payload.segmentStart, false); } else { fresh++; assert.equal(payload.segmentStart, true); }
  }
  assert.ok(chains > 20 && fresh >= 3);
});

test('clearing all 40: cleared, 连对 40, hist[40], daily_results written once', async () => {
  const run = await playDaily(h, A, { right: 40 });
  assert.equal(run.last.ended, true);
  assert.equal(run.last.result.endReason, 'cleared');
  assert.equal(run.last.result.n, 40);
  assert.equal(run.steps.length, 40);
  assert.equal(h.db.all('daily_results').length, 1);
  assert.equal(h.db.all('daily_stats')[0].hist[40], 1);
  const g = await h.call('getDaily', {}, { openid: A });
  assert.equal(g.myStatus, 'done');
  assert.equal(g.myResult.n, 40);
  assert.equal(g.bests.daily, 40);
});

test('answer is idempotent per k: repeats with the same or a different choice return the stored outcome', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const o = oracle(h, st.dateKey);
  const first = await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.correct(1), ms: 1500 }, { openid: A });
  const same = await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.correct(1), ms: 1500 }, { openid: A });
  const flip = await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.wrong(1), ms: 1500 }, { openid: A });
  assert.deepEqual(same, first);
  assert.deepEqual(flip, first);
  assert.equal(flip.correct, true);
  // a miss then a tap changing the choice cannot undo the miss
  const miss = await h.call('answer', { clientRunId: st.clientRunId, k: 2, choice: o.wrong(2), ms: 1500 }, { openid: A });
  const redo = await h.call('answer', { clientRunId: st.clientRunId, k: 2, choice: o.correct(2), ms: 1500 }, { openid: A });
  assert.deepEqual(redo, miss);
  assert.equal(redo.correct, false);
  assert.equal(h.db.all('daily_results').length, 1);
  assert.equal(h.db.all('daily_stats')[0].total, 1);
});

test('two devices tapping the same k at once: the first answer wins, one outcome, one hist increment', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const o = oracle(h, st.dateKey);
  const [x, y] = await Promise.all([
    h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.wrong(1), ms: 900 }, { openid: A }),
    h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.correct(1), ms: 900 }, { openid: A }),
  ]);
  assert.equal(x.ok && y.ok, true);
  assert.equal(x.correct, y.correct);
  assert.deepEqual(x.reveal, y.reveal);
  const run = h.db.all('run_progress')[0];
  assert.equal(run.answers.length, 1);
  assert.equal(h.db.all('daily_results').length <= 1, true);
  if (!x.correct) assert.equal(h.db.all('daily_stats')[0].total, 1);
});

test('INVALID_ORDER for a k other than the current one, with one `order` flag per ranked run', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  for (const k of [2, 5, 40]) {
    const r = await h.call('answer', { clientRunId: st.clientRunId, k, choice: 'hi', ms: 1000 }, { openid: A });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_ORDER');
  }
  const flags = h.db.all('anomalies').filter((a) => a.kind === 'order');
  assert.equal(flags.length, 1, 'written once per (run, kind)');
  assert.equal(flags[0].openid, A);
  // the run itself is untouched
  assert.equal(h.db.all('run_progress')[0].k, 1);
});

test('input validation: bad k/choice/clientRunId are INVALID_ACTIONS, unknown or foreign runs are NOT_STARTED', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const bad = [
    { clientRunId: st.clientRunId, k: 0, choice: 'hi' }, { clientRunId: st.clientRunId, k: 1.5, choice: 'hi' },
    { clientRunId: st.clientRunId, k: '1', choice: 'hi' }, { clientRunId: st.clientRunId, k: 1, choice: 'big' },
    { clientRunId: 'x', k: 1, choice: 'hi' }, { clientRunId: st.clientRunId, k: 1, choice: 'hi', ms: 'fast' },
    { clientRunId: st.clientRunId, k: 99, choice: 'hi' },
  ];
  for (const e of bad) assert.equal((await h.call('answer', e, { openid: A })).code, 'INVALID_ACTIONS', JSON.stringify(e));
  assert.equal((await h.call('answer', { clientRunId: runId(), k: 1, choice: 'hi' }, { openid: A })).code, 'NOT_STARTED');
  // another player cannot answer Alice's run (identity is the context openid)
  assert.equal((await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: 'hi', openid: A }, { openid: B })).code, 'NOT_STARTED');
});

test('ONE ranked daily per openid: a second startRun resumes the open run, then returns ALREADY_PLAYED with the result', async () => {
  await h.call('getDaily', {}, { openid: A });
  const id1 = runId();
  const st = await h.call('startRun', { mode: 'daily', clientRunId: id1 }, { openid: A });
  const o = oracle(h, st.dateKey);
  await h.call('answer', { clientRunId: id1, k: 1, choice: o.correct(1), ms: 2000 }, { openid: A });
  await h.call('answer', { clientRunId: id1, k: 2, choice: o.correct(2), ms: 2000 }, { openid: A });
  // another device, another clientRunId: resumes the SAME run and hands back its id
  const resumed = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.clientRunId, id1);
  assert.equal(resumed.k, 3);
  assert.equal(resumed.streak, 2);
  assert.equal(resumed.answered.length, 2);
  assert.equal(resumed.question.k, 3);
  assert.equal(resumed.answered[0].bottom.valueText.length > 0, true, 'answered pairs carry their revealed values');
  const g = await h.call('getDaily', {}, { openid: A });
  assert.equal(g.myStatus, 'open');
  assert.deepEqual(g.myRun, { k: 3, streak: 2 });
  await h.call('answer', { clientRunId: id1, k: 3, choice: o.wrong(3), ms: 2000 }, { openid: A });
  const again = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'ALREADY_PLAYED');
  assert.equal(again.result.n, 2);
  assert.equal(h.db.all('run_progress').length, 1);
  assert.equal(h.db.all('daily_results').length, 1);
});

test('same run started concurrently by two devices: one run document', async () => {
  await h.call('getDaily', {}, { openid: A });
  const [x, y] = await Promise.all([
    h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A }),
    h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A }),
  ]);
  assert.equal(x.ok && y.ok, true);
  assert.equal(h.db.all('run_progress').length, 1);
  assert.equal(x.clientRunId, y.clientRunId);
});

test('two players get identical cards question by question, whatever they answer', async () => {
  const ra = await playDaily(h, A, { right: 8 });
  const rb = await playDaily(h, B, { right: 4 });
  const strip = (q) => JSON.stringify(q);
  assert.equal(ra.start.issueNo, rb.start.issueNo);
  assert.equal(ra.start.theme, rb.start.theme);
  assert.equal(strip(ra.start.question), strip(rb.start.question));
  for (let i = 0; i < 3; i++) assert.equal(strip(ra.steps[i].next), strip(rb.steps[i].next));
});

test('no response ever carries an openid (AC 62)', async () => {
  const run = await playDaily(h, A, { right: 6 });
  const bob = await playDaily(h, B, { right: 3 });
  const all = [run.start, ...run.steps, bob.start, ...bob.steps,
    await h.call('getDaily', {}, { openid: A }), await h.call('getBoard', { kind: 'friend', dateKey: '20261015' }, { openid: A })];
  for (const r of all) {
    const strings = allStrings(r);
    for (const id of [A, B]) assert.equal(strings.some((s) => s.includes(id)), false);
    assert.equal(allKeys(r).some((k) => /^(openid|openGId|opengid)$/i.test(k)), false);
  }
});

test('finalization is one transaction: result, histogram and player stats together', async () => {
  const run = await playDaily(h, A, { right: 7 });
  assert.equal(run.last.result.n, 7);
  const res = h.db.all('daily_results');
  assert.equal(res.length, 1);
  assert.equal(res[0]._id, `20261015_${A}`);
  assert.equal(res[0].n, 7);
  assert.equal(res[0].endReason, 'miss');
  assert.equal(res[0].dayStreak, 1);
  assert.equal(res[0].endS, 12 * 3600);
  const st = h.db.all('daily_stats')[0];
  assert.equal(st.total, 1);
  assert.equal(st.hist[7], 1);
  const ps = h.db.all('player_stats')[0];
  assert.deepEqual([ps.curDays, ps.bestDays, ps.lastDailyDate, ps.bestDaily, ps.totalDailies], [1, 1, '20261015', 7, 1]);
});

test('concurrent finalization attempts (answer vs window sweep) yield one result and one hist increment', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const o = oracle(h, st.dateKey);
  await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.correct(1), ms: 2000 }, { openid: A });
  h.bind(A);
  const runs = h.mod('getDaily', 'common/runs');
  const id = `20261015_${A}`;
  const now = h.now();
  const r = await Promise.all([
    runs.finalizeRun(id, 'window', now + 40 * HOUR), runs.finalizeRun(id, 'window', now + 40 * HOUR),
    runs.finalizeRun(id, 'window', now + 41 * HOUR),
  ]);
  assert.equal(r.every((x) => x && x.n === 1), true);
  assert.equal(h.db.all('daily_results').length, 1);
  assert.equal(h.db.all('daily_stats')[0].hist[1], 1);
  assert.equal(h.db.all('daily_stats')[0].total, 1);
  assert.equal(h.db.all('player_stats')[0].totalDailies, 1);
});

test('window: answers accepted at D+1 00:29, WINDOW_CLOSED at 00:31 with the run finalized at its streak', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const o = oracle(h, st.dateKey);
  await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: o.correct(1), ms: 2000 }, { openid: A });
  h.setNow(Date.UTC(2026, 9, 15, 16, 29, 0)); // Fri 00:29 BJT
  const ok = await h.call('answer', { clientRunId: st.clientRunId, k: 2, choice: o.correct(2), ms: 2000 }, { openid: A });
  assert.equal(ok.ok, true);
  assert.equal(ok.correct, true);
  // while the grace window is open the next day's getDaily shows yesterday's run as resumable
  const g = await h.call('getDaily', {}, { openid: A });
  assert.equal(g.dateKey, '20261016');
  assert.equal(g.myStatus, 'none');
  assert.deepEqual(g.graceRun, { dateKey: '20261015', k: 3, streak: 2 });
  const resumed = await h.call('startRun', { mode: 'daily', dateKey: '20261015', clientRunId: runId() }, { openid: A });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.dateKey, '20261015');
  assert.equal(resumed.k, 3);
  h.setNow(Date.UTC(2026, 9, 15, 16, 31, 0)); // 00:31
  const late = await h.call('answer', { clientRunId: st.clientRunId, k: 3, choice: o.correct(3), ms: 2000 }, { openid: A });
  assert.equal(late.ok, false);
  assert.equal(late.code, 'WINDOW_CLOSED');
  assert.equal(late.result.n, 2);
  assert.equal(late.result.endReason, 'window');
  const res = h.db.all('daily_results');
  assert.equal(res.length, 1);
  assert.equal(res[0].n, 2);
  assert.equal(res[0].endReason, 'window');
  // idempotent afterwards, and an already answered k still returns its stored outcome
  assert.equal((await h.call('answer', { clientRunId: st.clientRunId, k: 3, choice: 'hi', ms: 1 }, { openid: A })).code, 'WINDOW_CLOSED');
  assert.equal((await h.call('answer', { clientRunId: st.clientRunId, k: 1, choice: 'hi', ms: 1 }, { openid: A })).correct, true);
  assert.equal(h.db.all('daily_stats').find((s) => s._id === '20261015').total, 1);
  // can no longer resume
  assert.equal((await h.call('startRun', { mode: 'daily', dateKey: '20261015', clientRunId: runId() }, { openid: A })).code, 'INVALID_ACTIONS');
});

test('an abandoned open run is finalized at its streak by the next getDaily (window), once, with a note', async () => {
  await h.call('getDaily', {}, { openid: A });
  const st = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: A });
  const o = oracle(h, st.dateKey);
  for (let k = 1; k <= 4; k++) await h.call('answer', { clientRunId: st.clientRunId, k, choice: o.correct(k), ms: 2000 }, { openid: A });
  h.setNow(Date.UTC(2026, 9, 16, 5, 0, 0)); // next day 13:00 BJT
  const g = await h.call('getDaily', {}, { openid: A });
  assert.deepEqual(g.finalized, [{ dateKey: '20261015', n: 4 }]);
  const res = h.db.all('daily_results');
  assert.equal(res.length, 1);
  assert.equal(res[0].n, 4);
  assert.equal(res[0].endReason, 'window');
  assert.equal(res[0].endS, 12 * 3600, 'end time is the last answer, not the sweep time');
  const g2 = await h.call('getDaily', {}, { openid: A });
  assert.equal('finalized' in g2, false, 'the note is shown once');
  assert.equal(g2.myDays.current, 1, "yesterday's day streak is still shown");
});

test('day streaks: consecutive published days +1, a missed published day resets to 1, a deckless date is skipped', async () => {
  const at = (d) => h.setNow(Date.UTC(2026, 9, d, 4, 0, 0));
  at(15); const r1 = await playDaily(h, A, { right: 3 });
  assert.equal(r1.last.result.dayStreak, 1);
  at(16); const r2 = await playDaily(h, A, { right: 3 });
  assert.equal(r2.last.result.dayStreak, 2);
  at(17); await playDaily(h, B, { right: 2 }); // the 17th is published (Bob); Alice skips it
  at(18); const r4 = await playDaily(h, A, { right: 1 });
  assert.equal(r4.last.result.dayStreak, 1, 'a missed published day resets');
  assert.equal(r4.last.result.bestDaily, 3);
  // nobody opens the app on the 19th, so it has no deck and is skipped
  at(20); const r5 = await playDaily(h, A, { right: 2 });
  assert.equal(r5.start.dateKey, '20261020');
  assert.equal(h.db.all('daily_decks').some((d) => d._id === '20261019'), false);
  assert.equal(r5.last.result.dayStreak, 2);
  const ps = h.db.all('player_stats').find((p) => p._id === A);
  assert.deepEqual([ps.curDays, ps.bestDays, ps.totalDailies], [2, 2, 4]);
});

test('day streak across an unpublished day continues; shown streak stays through today until the result exists', async () => {
  const at = (d, hr = 4) => h.setNow(Date.UTC(2026, 9, d, hr, 0, 0));
  at(15); await playDaily(h, A, { right: 2 });
  at(16); await playDaily(h, A, { right: 2 });
  // the 17th has NO deck (nobody called anything); on the 18th Alice plays: previous published day is the 16th
  at(18);
  const g = await h.call('getDaily', {}, { openid: A });
  assert.equal(g.myDays.current, 2, 'yesterday-published streak still visible all through today');
  const r = await playDaily(h, A, { right: 2 });
  assert.equal(r.last.result.dayStreak, 3);
  // duplicate finalization of the same date never double counts
  h.bind(A);
  const runs = h.mod('getDaily', 'common/runs');
  const stats = h.db.all('player_stats').find((p) => p._id === A);
  assert.deepEqual(runs.nextDayStreak(stats, '20261018', '20261016'), { curDays: 3, lastDailyDate: '20261018', counted: false });
  // a gap of a published day resets the shown streak
  at(19); await h.call('getDaily', {}, { openid: B });
  at(21);
  const g2 = await h.call('getDaily', {}, { openid: A });
  assert.equal(g2.myDays.current, 0);
});

test('anomaly flags: fast/slow are written once per (run, kind) and never change a response', async () => {
  const fast = await playDaily(h, A, { right: 12, ms: 100 });
  const calm = await playDaily(h, B, { right: 12, ms: 2500 });
  assert.equal(JSON.stringify(fast.steps), JSON.stringify(calm.steps), 'identical responses with and without flags');
  const aFlags = h.db.all('anomalies').filter((a) => a.openid === A);
  assert.deepEqual(aFlags.map((a) => a.kind), ['fast']);
  assert.equal(h.db.all('anomalies').filter((a) => a.openid === B).length, 0);
  assert.equal(h.db.all('player_stats').find((p) => p._id === A).suspect, false);

  const h2 = createHarness(); h2.loadDailyFacts();
  const slow = await playDaily(h2, A, { right: 6, ms: 61000 });
  assert.deepEqual(h2.db.all('anomalies').map((a) => a.kind), ['slow']);
  assert.equal(slow.last.ok, true);
  h2.teardown();
});

test('player_stats.suspect turns true at >= 5 flags in 7 days (manual review only)', async () => {
  h.bind(A);
  const an = h.mod('getDaily', 'common/anomalies');
  for (let i = 0; i < 4; i++) await an.record(A, `run${i}aaaaaaaa`, 'order', '20261015');
  assert.equal(h.db.all('player_stats').find((p) => p._id === A).suspect, false);
  await an.record(A, 'run9aaaaaaaa', 'fast', '20261015');
  const ps = h.db.all('player_stats').find((p) => p._id === A);
  assert.equal(ps.suspect, true);
  assert.equal(ps.flags7d, 5);
  assert.equal(await an.record(A, 'run9aaaaaaaa', 'fast', '20261015'), false, 'no duplicate flag');
});

test('rarity appears only from 30 results that day (PO-30)', async () => {
  const run = await playDaily(h, A, { right: 10 });
  assert.equal(run.last.result.rarity, null);
  const st = h.db.all('daily_stats')[0];
  const hist = new Array(41).fill(0);
  hist[2] = 40; hist[10] = 1;
  h.db.put('daily_stats', { ...st, hist, total: 41 });
  const g = await h.call('getDaily', {}, { openid: A });
  assert.deepEqual(g.myResult.rarity, { pct: 97.6, total: 41 });
});
