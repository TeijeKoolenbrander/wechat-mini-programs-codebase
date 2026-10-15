'use strict';
// The server-stepped daily under bad networks, kills and the midnight window (AC 24-26).
const test = require('node:test');
const assert = require('node:assert');
const { createMockServer } = require('../js/mock-server');
const { windowCloseMs, beijingDateKey } = require('../core/date');
const { boot, prepare, startUp, closeHowto, rights, dailyLookup, capture, count } = require('./helpers');

test('daily: a dropped network keeps the tap, shows 网络不太好 + 重试, and resends the same k and choice (AC 26)', async (t) => {
  const g = await startUp(t);
  await closeHowto(g);
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 2, dailyLookup(g));
  const log = capture(g);
  const mock = g.app.api.mock;
  mock.offline = true;
  const q = g.app.ctl.state.r.q;
  const right = dailyLookup(g)(q);
  g.wait(350);
  g.tapId('answer:' + right);
  await g.settle();
  g.wait(100);
  g.frame();
  let v = g.view();
  assert.strictEqual(v.vm.phase, 'netError');
  assert.strictEqual(v.vm.netError.text, '网络不太好');
  assert.strictEqual(v.vm.chosen, right, 'the tapped choice is kept');
  assert.ok(!v.vm.buttons.hi.enabled && !v.vm.buttons.lo.enabled);
  assert.ok(g.has('play:retry') && g.has('back'), '返回 still works');
  // retry while still offline: stays in the error state
  g.tapId('play:retry');
  await g.settle();
  assert.strictEqual(g.view().vm.phase, 'netError');
  // back online: the same k and choice go out and the run continues
  mock.offline = false;
  g.tapId('play:retry');
  await g.settle();
  assert.strictEqual(g.view().vm.phase, 'revealing');
  const sent = log.filter((l) => l.name === 'answer' && l.res.ok);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].data.k, q.k);
  assert.strictEqual(sent[0].data.choice, right);
  g.wait(700);
  g.frame();
  g.wait(700);
  g.frame();
  await g.settle();
  assert.strictEqual(g.view().vm.k, 4);
  assert.strictEqual(g.view().vm.streak, 3);
  assert.ok(count(g, 'q_fetch') >= 5);
  assert.ok(events(g).some((e) => e.name === 'q_fetch' && e.props.result === 'offline'));
});

function events(g) {
  return g.app.api.mock.db.events.concat(g.app.analytics.queue);
}

test('daily: killed while offline mid-answer, relaunch resumes the same question and re-sends the kept tap (AC 26)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 2, dailyLookup(g));
  const q = g.app.ctl.state.r.q;
  const right = dailyLookup(g)(q);
  mock.offline = true;
  g.wait(350);
  g.tapId('answer:' + right);
  await g.settle();
  g.wait(100);
  g.frame();
  assert.strictEqual(g.view().vm.phase, 'netError');
  assert.ok(g.app.store.state.active.pendingChoice, 'the tap is persisted');
  // the app is killed; the network is back
  mock.offline = false;
  const g2 = boot(t, { storage: g.storage, mockServer: mock });
  await g2.settle();
  let hv = g2.view().vm;
  assert.strictEqual(hv.daily.state, 'inProgress');
  assert.strictEqual(hv.daily.progressText, '已连对 2 · 第 3 题');
  g2.tapId('home:daily');
  await g2.settle();
  const v = g2.view();
  assert.strictEqual(v.vm.k, 3);
  assert.strictEqual(v.vm.top.label, q.top.label);
  assert.strictEqual(v.vm.bottom.label, q.bottom.label);
  assert.strictEqual(v.vm.chosen, right);
  assert.strictEqual(v.vm.phase, 'revealing', 'the kept tap was sent after the resume');
  g2.wait(700);
  g2.frame();
  g2.wait(700);
  g2.frame();
  await g2.settle();
  assert.strictEqual(g2.view().vm.k, 4);
  assert.strictEqual(g2.view().vm.streak, 3);
  assert.strictEqual(Object.keys(mock.db.progress).length, 1, 'one attempt only');
  hv = null;
});

test('daily: relaunch while the network is fine restores the same question, streak and history (AC 8)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 3, dailyLookup(g));
  const q = g.app.ctl.state.r.q;
  const g2 = boot(t, { storage: g.storage, mockServer: mock });
  await g2.settle();
  g2.tapId('home:daily');
  await g2.settle();
  const v = g2.view();
  assert.strictEqual(v.vm.k, 4);
  assert.strictEqual(v.vm.streak, 3);
  assert.strictEqual(v.vm.top.label, q.top.label);
  assert.strictEqual(v.vm.bottom.valueText, null);
  assert.strictEqual(g2.app.ctl.state.r.history.length, 3, 'the answered pairs come back for 本局题目');
  // a miss now: the result lists all four pairs
  await rights(g2, 0);
  const lookup = dailyLookup(g2);
  g2.wait(350);
  const wrong = lookup(g2.app.ctl.state.r.q) === 'hi' ? 'lo' : 'hi';
  g2.tapId('answer:' + wrong);
  await g2.settle();
  for (let i = 0; i < 40 && g2.view().screen === 'play'; i++) {
    g2.wait(100);
    g2.frame();
    await g2.settle();
  }
  const rv = g2.view();
  assert.strictEqual(rv.screen, 'result');
  assert.strictEqual(rv.vm.streak, 3);
  assert.strictEqual(rv.vm.questions.length, 4);
});

test('daily: answers are refused after D+1 00:30 and the run is finalized at its current streak (AC 24, 25)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 2, dailyLookup(g));
  const dateKey = beijingDateKey(Date.now());
  // 00:29: still accepted
  g.setTime(windowCloseMs(dateKey) - 60000);
  await rights(g, 1, dailyLookup(g));
  assert.strictEqual(g.view().vm.streak, 3);
  // 00:31: refused, finalized at 3
  g.setTime(windowCloseMs(dateKey) + 60000);
  g.wait(350);
  const q = g.app.ctl.state.r.q;
  g.tapId('answer:' + dailyLookup(g)(q));
  await g.settle();
  const v = g.view();
  assert.strictEqual(v.screen, 'result');
  assert.strictEqual(v.vm.streak, 3);
  assert.ok(v.vm.finalizedNote);
  assert.strictEqual(g.view().overlay.toast.text, '今日一比已结束，按当前连对记入');
  assert.strictEqual(mock.db.results[dateKey + '_' + mock.ME].endReason, 'window');
  const late = mock.call('answer', { clientRunId: g.app.ctl.state.r.clientRunId, k: 4, choice: 'hi' });
  assert.ok(late.ok === true || late.code === 'INVALID_ORDER' || late.code === 'WINDOW_CLOSED');
});

test('daily: an abandoned run is finalized by the next getDaily after the window, with the home note once (AC 25)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 4, dailyLookup(g));
  const dateKey = beijingDateKey(Date.now());
  g.tapId('back');
  g.tapId('dialog:confirm');
  await g.settle();
  g.setTime(windowCloseMs(dateKey) + 3600e3);
  const day = mock.call('getDaily', {});
  assert.strictEqual(day.ok, true);
  assert.strictEqual(mock.db.results[dateKey + '_' + mock.ME].n, 4);
  assert.strictEqual(mock.db.results[dateKey + '_' + mock.ME].endReason, 'window');
  const h = mock.call('getHistory', { dateKey });
  assert.strictEqual(h.mine.streak, 4);
  assert.ok(h.deck && h.deck.length === 40, 'the whole deck opens once the window is closed');
  assert.strictEqual(h.deck.filter((r) => r.mine === 'correct').length, 4);
});

test('daily: two users get identical cards question by question (AC 19) and idempotent answers (AC 20)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const a = mock.call('startRun', { mode: 'daily', clientRunId: 'a1' }, 'userA');
  const b = mock.call('startRun', { mode: 'daily', clientRunId: 'b1' }, 'userB');
  assert.deepStrictEqual(a.question, b.question);
  const byId = mock.allIndex.byId;
  let qa = a.question;
  let qb = b.question;
  for (let i = 0; i < 4; i++) {
    const right = byId[qa.bottom.factId].value > byId[qa.top.factId].value ? 'hi' : 'lo';
    const wrong = right === 'hi' ? 'lo' : 'hi';
    const ra = mock.call('answer', { clientRunId: 'a1', k: qa.k, choice: right }, 'userA');
    const rb = mock.call('answer', { clientRunId: 'b1', k: qb.k, choice: i === 3 ? wrong : right }, 'userB');
    assert.ok(ra.correct);
    if (rb.next) assert.deepStrictEqual(ra.next.top, rb.next.top);
    // repeating the same call, or another choice, returns the stored outcome
    const again = mock.call('answer', { clientRunId: 'a1', k: qa.k, choice: right }, 'userA');
    const flip = mock.call('answer', { clientRunId: 'a1', k: qa.k, choice: wrong }, 'userA');
    assert.deepStrictEqual(again, ra);
    assert.deepStrictEqual(flip, ra);
    qa = ra.next;
    qb = rb.next;
    if (!qb) break;
  }
  // skipping ahead is refused and flagged
  assert.strictEqual(mock.call('answer', { clientRunId: 'a1', k: qa.k + 3, choice: 'hi' }, 'userA').code, 'INVALID_ORDER');
  assert.ok(mock.db.anomalies.some((x) => x.kind === 'order'));
  // userB missed on question 4: ended, no more answers
  assert.strictEqual(mock.call('answer', { clientRunId: 'b1', k: 5, choice: 'hi' }, 'userB').code, 'INVALID_ORDER');
});
