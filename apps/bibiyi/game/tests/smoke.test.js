'use strict';
/**
 * Boots the whole game against a fake wx and plays it headlessly with touches:
 * the daily progressive flow, free play with the one 再答一次, challenging a
 * friend's streak, report-an-error, share entry, offline.
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, answer, correctFrom } = require('./harness');
const { getContent } = require('../core/content');
const { beijingDateKey } = require('../core/date');

const FREE = getContent(1);
const freeLookup = correctFrom(FREE.byId);
const events = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const names = (g) => events(g).map((e) => e.name);
const count = (g, name) => names(g).filter((n) => n === name).length;

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  return g;
}

/** record every mock response so payloads can be inspected (AC 18) */
function capture(g) {
  const mock = g.app.api.mock;
  const log = [];
  const orig = mock.call.bind(mock);
  mock.call = (name, data, who) => {
    const r = orig(name, data, who);
    log.push({ name, data, res: JSON.parse(JSON.stringify(r)) });
    return r;
  };
  return log;
}

const dailyLookup = (g) => correctFrom(g.app.api.mock.allIndex.byId);

async function closeHowto(g) {
  if (g.has('sheet:close')) g.tapId('sheet:close');
}

test('boots to home, first launch opens the how-to sheet once, no login and no prompts (AC 1, 66)', async (t) => {
  const g = await startUp(t);
  const text = g.frame();
  assert.ok(text.indexOf('比一比') >= 0, text.slice(0, 200));
  assert.ok(g.has('sheet:close'), 'the how-to sheet opens on first launch');
  assert.strictEqual(g.app.ctl.view().vm.sheet, 'howto');
  g.tapId('sheet:close');
  assert.strictEqual(g.app.ctl.view().vm.sheet, null);
  assert.ok(g.has('home:free') && g.has('home:daily'));
  for (const c of g.log.calls) assert.ok(!/requirePrivacyAuthorize|authorize|setUserCloudStorage|saveImage|requestSubscribe/.test(c), 'no prompt at launch: ' + c);
  assert.ok(g.log.menu.some((m) => m[0] === 'showShareMenu' && m[1].menus[0] === 'shareAppMessage'));
  assert.ok(g.log.menu.some((m) => m[0] === 'updateShareMenu' && m[1].withShareTicket === true && m[1].isUpdatableMessage === undefined));
  assert.strictEqual(count(g, 'session_start'), 1);
  const hv = g.app.ctl.view().vm;
  assert.strictEqual(hv.daily.state, 'available');
  assert.ok(hv.daily.themeLabel && hv.daily.issueNo >= 1);
  assert.strictEqual(hv.free.categoryLabel, '全部');
  // second launch: the how-to sheet does not come back
  const g2 = boot(t, { storage: g.storage });
  await g2.settle();
  assert.strictEqual(g2.app.ctl.view().vm.sheet, null);
});

test('daily: server-stepped one question at a time, nothing ahead of the current question (AC 2, 3, 4, 18, 27)', async (t) => {
  const g = await startUp(t, { privacy: { state: 'agreed', scope: true } });
  await closeHowto(g);
  const log = capture(g);
  g.tapId('home:daily');
  await g.settle();
  let v = g.view();
  assert.strictEqual(v.screen, 'play');
  assert.strictEqual(v.vm.mode, 'daily');
  assert.strictEqual(v.vm.phase, 'awaitAnswer');
  assert.ok(v.vm.top.valueText && v.vm.top.sourceText && v.vm.top.unitText);
  assert.strictEqual(v.vm.bottom.valueText, null, 'the bottom card has no value');
  assert.strictEqual(v.vm.bottom.sourceText, null);
  assert.strictEqual(v.vm.bottom.canReport, false, 'no report link on a hidden card (AC 45)');
  assert.ok(/^.+ 比 .+ ……$/.test(v.vm.promptText));
  const verbs = [v.vm.buttons.hi.label, v.vm.buttons.lo.label];
  assert.ok(verbs.every((l) => l.length === 2 && l !== '大' && l !== '小'));
  assert.ok(v.vm.deckLength === 40 && v.vm.k === 1 && v.vm.streak === 0);
  assert.ok(v.vm.coachMark, 'first-run coach bubble');

  // 6 right answers, then a miss
  const first = v.vm.top.label;
  let streak = 0;
  for (let i = 0; i < 6; i++) {
    const before = g.view().vm;
    await answer(g, 'right', dailyLookup(g));
    v = g.view();
    streak++;
    assert.strictEqual(v.screen, 'play');
    assert.strictEqual(v.vm.streak, streak);
    assert.strictEqual(v.vm.k, streak + 1);
    assert.strictEqual(v.vm.bottom.valueText, null);
    if (!v.vm.top.label) assert.fail();
    void before;
  }
  assert.ok(!g.view().vm.coachMark, 'the coach bubble is gone after the first answer');
  assert.notStrictEqual(g.view().vm.top.label, first);

  // captured payloads: only the current question, never the unanswered bottom value or source
  const mock = g.app.api.mock;
  const allText = JSON.stringify(log.map((l) => l.res));
  for (const call of log.filter((l) => l.name === 'startRun' || l.name === 'answer')) {
    const q = call.res.question || call.res.next;
    if (q) {
      const b = mock.allIndex.byId[q.bottom.factId];
      assert.strictEqual(q.bottom.valueText, undefined);
      assert.strictEqual(q.bottom.sourceText, undefined);
      assert.ok(!JSON.stringify(q.bottom).includes('"value"'));
      assert.ok(Object.keys(q).indexOf('questions') < 0);
      void b;
    }
  }
  const deck = mock.db.decks[Object.keys(mock.db.decks)[0]].deck;
  // no future question id appears in any response before it is current
  const futureIds = deck.questions.slice(8).map((q) => q.b);
  for (const id of futureIds) assert.ok(!allText.includes('"' + id + '"'), 'future fact leaked: ' + id);
  assert.ok(!allText.includes('"questions"'));
  assert.strictEqual(g.log.ads.length, 0, 'no ad object created in a daily run (AC 27)');
  assert.ok(!g.app.ads.overlay);

  // a miss ends the run, no 再答一次 in the daily
  await answer(g, 'wrong', dailyLookup(g), { stopAtMiss: true });
  v = g.view();
  assert.strictEqual(v.vm.phase, 'miss');
  assert.strictEqual(v.vm.verdictText, '错');
  assert.ok(v.vm.bottom.valueText, 'both values stay visible on a miss');
  assert.ok(v.vm.bottom.canReport);
  g.wait(1300);
  g.frame();
  await g.settle();
  v = g.view();
  assert.strictEqual(v.screen, 'result');
  assert.ok(!g.app.ctl.state.sheets.includes('continue'), 'no continue sheet in a daily');
  assert.strictEqual(v.vm.streak, 6);
  assert.strictEqual(v.vm.streakText, '6');
  assert.strictEqual(v.vm.ranked, true);
  assert.ok(v.vm.miss && v.vm.miss.k === 7 && v.vm.miss.titleText === '倒在第 7 题');
  assert.ok(v.vm.miss.top.valueText && v.vm.miss.bottom.valueText && v.vm.miss.bottom.canReport);
  assert.strictEqual(v.vm.questions.length, 7);
  assert.strictEqual(g.log.ads.length, 0);
  assert.strictEqual(g.log.cloudWrites.length, 1, 'marker written after the ranked result');
  assert.deepStrictEqual(JSON.parse(g.log.cloudWrites[0][0].value), { n: 6 });
  assert.strictEqual(count(g, 'run_start'), 1);
  assert.strictEqual(count(g, 'run_complete'), 1);
  assert.ok(count(g, 'q_fetch') >= 8);
  // the result survives going home, which shows the done card
  g.tapId('result:back');
  const hv = g.view().vm;
  assert.strictEqual(hv.daily.state, 'done');
  assert.strictEqual(hv.daily.streak, 6);
  // a second start never gives a second ranked attempt
  assert.strictEqual(mock.call('startRun', { mode: 'daily', clientRunId: 'zzz' }).code, 'ALREADY_PLAYED');
  assert.strictEqual(Object.keys(mock.db.results).length, 1);
  void beijingDateKey;
});
