'use strict';
// Challenges, report-an-error, share and group entry, boards, history, save image, subscribe, settings.
const test = require('node:test');
const assert = require('node:assert');
const { createMockServer } = require('../js/mock-server');
const { buildFreeDeck } = require('../core/deck');
const J = require('../core/judge');
const { beijingDateKey } = require('../core/date');
const { boot, prepare, FREE, freeLookup, startUp, closeHowto, rights, miss, dailyLookup, events, count } = require('./helpers');

const FRIEND = 'friend-openid-1';

/** a friend finishes a free run on `mock` and challenges with it; returns the challenge id */
function friendFreeChallenge(mock, streak, seed, group) {
  const deck = buildFreeDeck(seed, 1, 1, group, FREE);
  const answers = [];
  for (let k = 1; k <= streak + 1; k++) {
    const q = deck.questions[k - 1];
    const right = J.correctChoice(FREE.byId[q.a], FREE.byId[q.b]);
    answers.push({ k, c: k <= streak ? right : right === 'hi' ? 'lo' : 'hi' });
  }
  const sub = mock.call('submitRun', { clientRunId: 'own-' + seed, seed, group, contentVersion: 1, configVersion: 1, answers, lifeAtK: null, clientStreak: streak }, FRIEND);
  assert.ok(sub.ok, JSON.stringify(sub));
  return mock.call('createChallenge', { runId: 'own-' + seed }, FRIEND).challengeId;
}

/** a friend plays today's daily deck: `streak` right answers then a miss; returns the challenge id */
function friendDailyChallenge(mock, streak, clientRunId) {
  mock.call('getDaily', {}, FRIEND);
  let x = mock.call('startRun', { mode: 'daily', clientRunId }, FRIEND);
  let q = x.question;
  for (let i = 0; i < streak + 1; i++) {
    const right = mock.allIndex.byId[q.bottom.factId].value > mock.allIndex.byId[q.top.factId].value ? 'hi' : 'lo';
    const choice = i < streak ? right : right === 'hi' ? 'lo' : 'hi';
    x = mock.call('answer', { clientRunId, k: q.k, choice }, FRIEND);
    q = x.next;
  }
  assert.ok(x.ended);
  return mock.call('createChallenge', { runId: clientRunId }, FRIEND).challengeId;
}

test('challenge a friend\'s free streak: same deck, one 再答一次 rule for both, comparison "你 N · TA M · 同一套题" (AC 53, 55, 56)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const id = friendFreeChallenge(mock, 4, 777, 'geo');
  const g = await startUp(t, { mockServer: mock, enter: { scene: 1007, query: { c: id } } });
  await g.settle();
  let v = g.view();
  assert.strictEqual(v.screen, 'challenge');
  assert.strictEqual(v.vm.status, 'ready');
  assert.strictEqual(v.vm.ownerStreak, 4);
  assert.strictEqual(v.vm.ownerText, '同一套题，TA 连对 4 个');
  assert.strictEqual(v.vm.kind, 'free');
  assert.strictEqual(v.vm.categoryLabel, '山河');
  assert.strictEqual(v.vm.rulesText, '规则相同：每局可看视频再答一次');
  assert.strictEqual(v.vm.isFriendly, true);
  assert.strictEqual(count(g, 'card_open'), 1);
  // nothing about the owner's answers or facts came with the entry
  const entryRes = JSON.stringify(mock.call('getChallenge', { challengeId: id }));
  assert.ok(!/answers|"value"|valueText|label/.test(entryRes), entryRes);
  g.tapId('challenge:accept');
  v = g.view();
  assert.strictEqual(v.screen, 'play');
  assert.strictEqual(v.vm.mode, 'challenge');
  assert.strictEqual(v.vm.friendly, true);
  assert.strictEqual(v.vm.challenge.ownerStreak, 4);
  assert.strictEqual(v.vm.challenge.passedText, null);
  const deck = buildFreeDeck(777, 1, 1, 'geo', FREE);
  assert.strictEqual(g.app.ctl.state.r.q.top.factId, deck.questions[0].a, "replays the owner's exact deck");
  await rights(g, 4);
  assert.strictEqual(g.view().vm.challenge.passedText, null, 'equal is not past');
  await rights(g, 1);
  assert.strictEqual(g.view().vm.challenge.passedText, '已超过 TA 的 4 ✓');
  assert.strictEqual(g.view().vm.streak, 5);
  await rights(g, 1);
  assert.strictEqual(g.view().vm.challenge.passedText, '已超过 TA 的 4 ✓', 'the line stays, it appeared once');
  // the recipient gets the same single life
  await miss(g);
  assert.strictEqual(g.view().vm.sheet, 'continue');
  g.tapId('continue:result');
  await g.settle();
  v = g.view();
  assert.strictEqual(v.screen, 'result');
  assert.strictEqual(v.vm.streak, 6);
  assert.strictEqual(v.vm.challenge.compareText, '你 6 · TA 4 · 同一套题');
  assert.strictEqual(v.vm.friendlyText, '友谊赛，不计入榜单');
  assert.strictEqual(v.vm.ranked, false);
  assert.strictEqual(g.log.cloudWrites.length, 0);
  assert.strictEqual(mock.db.challenges[id].answers.length, 1);
  assert.strictEqual(mock.db.challenges[id].answers[0].n, 6);
  assert.ok(events(g).some((e) => e.name === 'challenge_answered' && e.props.myStreak === 6 && e.props.ownerStreak === 4));
  // reopening the card shows the answered state
  g.tapId('result:back');
  g.show({ scene: 1007, query: { c: id } });
  await g.settle();
  v = g.view();
  assert.strictEqual(v.vm.status, 'answered');
  assert.strictEqual(v.vm.myStreak, 6);
  g.tapId('challenge:compare');
  assert.strictEqual(g.view().vm.challenge.compareText, '你 6 · TA 4 · 同一套题');
});

test('challenge on today\'s deck: counts as the recipient\'s ranked daily when unplayed (AC 54)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const id = friendDailyChallenge(mock, 3, 'fd1');
  const g = await startUp(t, { mockServer: mock, privacy: { state: 'agreed', scope: true }, enter: { scene: 1007, query: { c: id } } });
  let v = g.view();
  assert.strictEqual(v.screen, 'challenge');
  assert.strictEqual(v.vm.countsAsDaily, true);
  assert.strictEqual(v.vm.rulesText, '本局将作为你的今日一比，计入群榜');
  assert.ok(/今日一比 · 第\d+期/.test(v.vm.issueText));
  g.tapId('challenge:accept');
  await g.settle();
  v = g.view();
  assert.strictEqual(v.vm.mode, 'challenge');
  assert.strictEqual(v.vm.ranked, true);
  assert.strictEqual(v.vm.deckLength, 40);
  await rights(g, 4, dailyLookup(g));
  assert.strictEqual(g.view().vm.challenge.passedText, '已超过 TA 的 3 ✓');
  await miss(g, dailyLookup(g));
  v = g.view();
  assert.strictEqual(v.screen, 'result');
  assert.ok(!g.app.ctl.state.sheets.includes('continue'));
  assert.strictEqual(v.vm.ranked, true);
  assert.strictEqual(v.vm.streak, 4);
  assert.strictEqual(v.vm.challenge.compareText, '你 4 · TA 3 · 同一套题');
  assert.strictEqual(mock.db.results[beijingDateKey(Date.now()) + '_' + mock.ME].n, 4);
  assert.strictEqual(g.log.cloudWrites.length, 1);
  g.tapId('result:back');
  assert.strictEqual(g.view().vm.daily.state, 'done');
  assert.strictEqual(g.log.ads.length, 0);
});

test('challenge on today\'s deck after the recipient already played: a friendly, never ranked, still server-stepped (AC 54)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const id = friendDailyChallenge(mock, 5, 'fd2');
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 2, dailyLookup(g));
  await miss(g, dailyLookup(g));
  g.tapId('result:back');
  g.show({ scene: 1007, query: { c: id } });
  await g.settle();
  let v = g.view();
  assert.strictEqual(v.screen, 'challenge');
  assert.strictEqual(v.vm.countsAsDaily, false);
  assert.strictEqual(v.vm.rulesText, '你已完成今日一比，本局为友谊赛，不计入榜单');
  g.tapId('challenge:accept');
  await g.settle();
  v = g.view();
  assert.strictEqual(v.vm.ranked, false);
  assert.strictEqual(v.vm.friendly, true);
  await rights(g, 1, dailyLookup(g));
  await miss(g, dailyLookup(g));
  v = g.view();
  assert.strictEqual(v.screen, 'result');
  assert.strictEqual(v.vm.ranked, false);
  assert.strictEqual(v.vm.friendlyText, '友谊赛，不计入榜单');
  assert.strictEqual(v.vm.challenge.compareText, '你 1 · TA 5 · 同一套题');
  const mine = Object.values(mock.db.results).filter((r) => r.who === mock.ME);
  assert.strictEqual(mine.length, 1, 'only the first daily is ranked');
  assert.strictEqual(mine[0].n, 2);
});

test('challenge states: expired, not found, own, retired, offline, and a challenge card during a run waits (AC 57)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const id = friendFreeChallenge(mock, 2, 5, 'all');
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.show({ scene: 1007, query: { c: 'NOSUCHID' } });
  await g.settle();
  assert.strictEqual(g.view().vm.status, 'expired');
  assert.ok(g.has('challenge:free') && g.has('challenge:daily'));
  g.tapId('challenge:free');
  assert.strictEqual(g.view().screen, 'play', 'free play is never blocked');
  g.tapId('back');
  g.tapId('dialog:confirm');
  // a card that arrives mid-run waits until home
  g.tapId('home:free');
  g.show({ scene: 1007, query: { c: id } });
  await g.settle();
  assert.strictEqual(g.view().screen, 'play');
  assert.strictEqual(g.view().overlay.toast.text, '你有一个新挑战');
  g.tapId('back');
  g.tapId('dialog:confirm');
  await g.settle();
  assert.strictEqual(g.view().screen, 'challenge');
  assert.strictEqual(g.view().vm.status, 'ready');
  g.tapId('challenge:home');
  // expiry after 7 days
  g.setTime(Date.now() + 8 * 86400e3);
  g.show({ scene: 1007, query: { c: id } });
  await g.settle();
  assert.strictEqual(g.view().vm.status, 'expired');
  // retired content version
  const id2 = friendFreeChallenge(mock, 1, 6, 'all');
  mock.retiredVersions.push(1);
  g.show({ scene: 1007, query: { c: id2 } });
  await g.settle();
  assert.strictEqual(g.view().vm.status, 'retired');
  // offline
  mock.offline = true;
  g.show({ scene: 1007, query: { c: id2 } });
  await g.settle();
  // (the same card within 3 s is one entry; use another id)
  g.show({ scene: 1007, query: { c: 'ABCDEFGH' } });
  await g.settle();
  assert.strictEqual(g.view().vm.status, 'offline');
  assert.ok(g.has('challenge:retry') && g.has('challenge:free'));
});

test('issuing a challenge: query carries the id only, share grants nothing, own-challenge screen (AC 50, 51, 53)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  const realCard = g.app.share.cardRenderer;
  g.app.share.cardRenderer = null; // simulate a card renderer that is missing
  g.tapId('home:free');
  await rights(g, 3);
  await miss(g);
  g.tapId('continue:result');
  await g.settle();
  assert.strictEqual(g.log.shares.length, 0, 'nothing is shared automatically');
  g.tapId('result:challenge');
  await g.settle();
  assert.strictEqual(g.log.shares.length, 1);
  const s = g.log.shares[0];
  assert.ok(/^c=[0-9A-Z]{8}$/.test(s.query), s.query);
  assert.strictEqual(s.title, '同一套题，我连对 3，你来试试？');
  assert.strictEqual(s.imageUrl, 'assets/share-fallback.png', 'the static image when no card renderer exists');
  assert.ok(typeof realCard === 'function', 'the real renderer provides the share card');
  assert.strictEqual(count(g, 'challenge_created'), 1);
  assert.strictEqual(count(g, 'share_tap'), 1);
  const id = s.query.slice(2);
  // the owner opens it: own view with answer count, never a ranked or playable entry
  g.tapId('result:back');
  g.show({ scene: 1007, query: { c: id } });
  await g.settle();
  const v = g.view();
  assert.strictEqual(v.vm.status, 'own');
  assert.strictEqual(v.vm.ownText, '这是你发起的挑战');
  assert.strictEqual(v.vm.answerCount, 0);
  assert.ok(!g.has('challenge:accept'));
  // a failing createChallenge falls back to a plain result share with the toast
  g.tapId('challenge:home');
  g.tapId('home:free');
  await rights(g, 1);
  await miss(g);
  g.tapId('continue:result');
  await g.settle();
  mock.offline = true;
  g.tapId('result:challenge');
  await g.settle();
  assert.strictEqual(g.log.shares.length, 2);
  assert.ok(/^s=r&m=free/.test(g.log.shares[1].query));
  assert.strictEqual(g.view().overlay.toast.text, '挑战未能生成，已改为分享成绩');
});

test('share cards and titles: daily names no fact, free names the missed pair (AC 50-52)', async (t) => {
  const g = await startUp(t);
  await closeHowto(g);
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 2, dailyLookup(g));
  await miss(g, dailyLookup(g));
  const res = g.app.ctl.state.res;
  const V = require('../js/vm');
  const card = V.cardVm(res);
  assert.strictEqual(card.mode, 'daily');
  assert.deepStrictEqual(card.marks, [true, true, false]);
  assert.ok(!JSON.stringify(card).includes('模拟'), 'no fact name on the daily card');
  assert.ok(/^比一比 · 今日一比 第\d+期/.test(card.titleText));
  g.tapId('result:share');
  await g.settle();
  assert.strictEqual(g.log.shares.length, 1);
  assert.strictEqual(g.log.shares[0].title, '今日一比我连对 2 个，你能比我多吗？');
  assert.ok(/^s=r&m=daily&d=\d{8}$/.test(g.log.shares[0].query));
  assert.ok(!g.log.shares[0].title.includes('模拟'));
  // free
  g.tapId('result:again');
  await rights(g, 2);
  await miss(g);
  g.tapId('continue:result');
  await g.settle();
  const fres = g.app.ctl.state.res;
  const fcard = V.cardVm(fres);
  assert.strictEqual(fcard.mode, 'free');
  assert.strictEqual(fcard.pair.bottomLabel, fres.miss.bottom.label);
  assert.ok(!JSON.stringify(fcard).includes(fres.miss.bottom.valueText), 'no values on the free card');
  g.tapId('result:share');
  await g.settle();
  const t2 = g.log.shares[1].title;
  const m = fres.miss;
  assert.strictEqual(t2, m.bottom.label + '和' + m.top.label + '谁' + require('../core/measures').BY_KEY[m.measure].hi + '？我栽在这题了');
  assert.ok(/^s=r&m=free/.test(g.log.shares[1].query));
  // the capsule menu share is always a plain result card
  const menu = g.handlers.shareMenu();
  assert.ok(menu.title && menu.query);
  assert.strictEqual(count(g, 'share_tap'), 2 + 1);
});

test('report an error: six fixed reasons, no text input, one report per fact, repeat updates, rate limit (AC 45-47)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:free');
  g.wait(350);
  const lookup = freeLookup;
  const q = g.app.ctl.state.r.q;
  assert.ok(!g.has('report:bottom'), 'no report link on a hidden card');
  g.tapId('answer:' + lookup(q));
  await g.settle();
  g.wait(700);
  g.frame();
  assert.strictEqual(g.view().vm.phase, 'correct');
  assert.ok(g.view().vm.bottom.canReport);
  g.tapId('report:bottom');
  let v = g.view();
  assert.strictEqual(v.vm.sheet, 'report');
  const sv = v.vm.sheetVm;
  assert.strictEqual(sv.title, '这条数据有问题？');
  assert.deepStrictEqual(sv.reasons.map((r) => r.label), ['数值不对', '单位不对', '名称不对', '来源对不上', '措辞不妥', '其他']);
  assert.strictEqual(sv.canSubmit, false, '提交 disabled until a reason is chosen');
  assert.strictEqual(sv.alreadyReported, false);
  assert.ok(!('text' in sv) && !('input' in sv));
  assert.ok(!g.has('report:submit'), 'no submit button while disabled');
  g.tapId('report:reason:value');
  g.tapId('report:reason:unit');
  v = g.view();
  assert.ok(v.vm.sheetVm.canSubmit);
  assert.deepStrictEqual(v.vm.sheetVm.reasons.filter((r) => r.selected).map((r) => r.key), ['value', 'unit']);
  g.tapId('report:submit');
  await g.settle();
  v = g.view();
  assert.strictEqual(v.vm.sheet, null);
  assert.strictEqual(v.overlay.toast.text, '已收到，谢谢！我们会核对');
  const keys = Object.keys(mock.db.reports);
  assert.strictEqual(keys.length, 1);
  assert.strictEqual(mock.db.reports[keys[0]].factId, q.bottom.factId);
  assert.deepStrictEqual(mock.db.reports[keys[0]].reasons, ['value', 'unit']);
  assert.strictEqual(mock.db.reports[keys[0]].where, 'reveal');
  assert.strictEqual(count(g, 'fact_report'), 1);
  // again: the chips come back selected and the button reads 更新; a repeat updates, never adds
  g.tapId('report:bottom');
  v = g.view();
  assert.strictEqual(v.vm.sheetVm.alreadyReported, true);
  assert.strictEqual(v.vm.sheetVm.submitLabel, '更新');
  assert.deepStrictEqual(v.vm.sheetVm.reasons.filter((r) => r.selected).map((r) => r.key), ['value', 'unit']);
  g.tapId('report:reason:unit');
  g.tapId('report:reason:name');
  g.tapId('report:submit');
  await g.settle();
  assert.strictEqual(Object.keys(mock.db.reports).length, 1);
  assert.deepStrictEqual(mock.db.reports[keys[0]].reasons, ['value', 'name']);
  // offline: toast, nothing queued
  g.tapId('report:top');
  g.tapId('report:reason:other');
  mock.offline = true;
  g.tapId('report:submit');
  await g.settle();
  assert.strictEqual(g.view().overlay.toast.text, '网络不太好，稍后再试');
  assert.strictEqual(Object.keys(mock.db.reports).length, 1);
  assert.strictEqual(g.view().vm.sheet, 'report', 'the sheet stays so the player can retry');
  mock.offline = false;
  g.tapId('report:cancel');
  assert.strictEqual(g.view().vm.sheet, null);
  // play was never blocked
  assert.strictEqual(g.view().screen, 'play');
});

test('report: unknown fact ids, bad reasons, rate limit and auto-suspend at 5 distinct players (AC 47, 48)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const fact = mock.dailyIndex.facts[0].id;
  assert.strictEqual(mock.call('reportFact', { factId: 'nope', reasons: ['value'] }).code, 'UNKNOWN_FACT');
  assert.strictEqual(mock.call('reportFact', { factId: fact, reasons: ['free text'] }).code, 'INVALID_ACTIONS');
  assert.strictEqual(mock.call('reportFact', { factId: fact, reasons: [] }).code, 'INVALID_ACTIONS');
  // one person reporting repeatedly never suspends
  for (let i = 0; i < 6; i++) assert.ok(mock.call('reportFact', { factId: fact, reasons: ['value'] }, 'p1').ok);
  assert.strictEqual(mock.db.overrides.suspended.length, 0);
  for (let i = 2; i <= 4; i++) mock.call('reportFact', { factId: fact, reasons: ['name'] }, 'p' + i);
  assert.strictEqual(mock.db.overrides.suspended.length, 0, '4 distinct reporters do not suspend');
  mock.call('reportFact', { factId: fact, reasons: ['unit'] }, 'p5');
  assert.deepStrictEqual(mock.db.overrides.suspended.map((s) => [s.factId, s.auto]), [[fact, true]]);
  assert.strictEqual(Object.keys(mock.db.reports).length, 5);
  // rate limit: the 21st report of a day is acknowledged but stored nowhere
  const facts = mock.dailyIndex.facts.slice(1, 40).map((f) => f.id);
  let limited = 0;
  facts.forEach((id) => {
    const r = mock.call('reportFact', { factId: id, reasons: ['value'] }, 'spammer');
    if (r.limited) limited++;
  });
  assert.strictEqual(Object.keys(mock.db.reports).filter((k) => k.endsWith('_spammer')).length, 20);
  assert.strictEqual(limited, facts.length - 20);
  // suspended facts are skipped by future decks, and a published deck is never edited
  const day1 = mock.ensureDeck('20261120');
  const before = JSON.stringify(day1.deck);
  mock.call('reportFact', { factId: day1.deck.questions[0].b, reasons: ['value'] }, 'x1');
  assert.strictEqual(JSON.stringify(mock.db.decks['20261120'].deck), before);
});

test('share entry: a group card calls getGroupEnterInfo and joinGroup and shows the banner; fallback and malformed entries change nothing (AC 44, 58)', async (t) => {
  const g = await startUp(t, { enter: { scene: 1044, query: 's=r&m=daily&d=20261120', shareTicket: 'tk1', chatType: 1 } });
  await g.settle();
  await closeHowto(g);
  assert.ok(g.log.calls.includes('getGroupEnterInfo'));
  assert.strictEqual(g.app.ctl.state.group.status, 'ok');
  assert.ok(g.app.ctl.state.group.groupRef);
  assert.ok(!/G1/.test(g.app.ctl.state.group.groupRef), 'the openGId never reaches the client');
  const hv = g.view().vm;
  assert.strictEqual(hv.hasGroupContext, true);
  assert.ok(g.has('home:groupBanner'));
  assert.strictEqual(count(g, 'card_open'), 1);
  assert.strictEqual(count(g, 'group_join'), 1);
  assert.strictEqual(g.log.shares.length, 0);
  // fallback-share launch grants nothing and starts nothing
  const f = await startUp(t, { enter: { scene: 1001, query: { wxad_fallback_share: '1' } } });
  assert.strictEqual(f.view().screen, 'home');
  assert.strictEqual(f.view().vm.hasGroupContext, false);
  assert.strictEqual(f.log.ads.length, 0);
  assert.ok(f.app.analytics.queue.some((e) => e.name === 'error' && e.props.code === 'wxad_fallback_share'));
  // malformed
  const m = await startUp(t, { enter: { scene: 1001, query: { c: 'bad!' } } });
  assert.strictEqual(m.view().screen, 'home');
  // a card without a ticket: no join
  const n = await startUp(t, { enter: { scene: 1007, query: 's=r&m=free&d=' } });
  assert.ok(!n.log.calls.includes('getGroupEnterInfo'));
  assert.strictEqual(n.view().vm.hasGroupContext, false);
  // join failure: nothing else changes
  const bad = await startUp(t, { enter: { scene: 1044, query: 's=r&m=daily&d=20261120', shareTicket: 'tk1' }, groupData: { opengid: 'G2', chat_type: 1 } });
  assert.strictEqual(bad.app.ctl.state.group.status, 'failed');
  assert.strictEqual(bad.view().vm.hasGroupContext, false);
  assert.strictEqual(bad.view().screen, 'home');
});

test('boards: privacy first at the board tap, server rows only, shared ranks come from the server (AC 59-66)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock, enter: { scene: 1044, query: 's=r&m=daily&d=x', shareTicket: 'tk' }, privacy: { state: 'agreed', scope: true } });
  await closeHowto(g);
  // someone else has a result so the board has rows
  const dk = beijingDateKey(Date.now());
  mock.call('getDaily', {}, 'other');
  let x = mock.call('startRun', { mode: 'daily', clientRunId: 'o1' }, 'other');
  const right = (q) => (mock.allIndex.byId[q.bottom.factId].value > mock.allIndex.byId[q.top.factId].value ? 'hi' : 'lo');
  x = mock.call('answer', { clientRunId: 'o1', k: 1, choice: right(x.question) }, 'other');
  x = mock.call('answer', { clientRunId: 'o1', k: 2, choice: right(x.next) === 'hi' ? 'lo' : 'hi' }, 'other');
  assert.ok(x.ended);
  g.tapId('home:groupBoard');
  await g.settle();
  let v = g.view();
  assert.strictEqual(v.screen, 'board');
  assert.strictEqual(v.vm.state, 'ready');
  assert.strictEqual(v.vm.kind, 'group');
  const msg = g.log.odc[g.log.odc.length - 1];
  assert.strictEqual(msg.type, 'render');
  assert.ok(msg.rows.length === 1 && msg.rows[0][1] === 1, 'rows are [hash, n, s, k?] with the server streak');
  const txt = JSON.stringify(msg);
  assert.ok(!/other|openid|opengid/i.test(txt), 'no openid in the message');
  assert.ok(!('answers' in msg));
  assert.strictEqual(msg.salt, mock.db.decks[dk].salt);
  assert.strictEqual(msg.shareTicket, 'tk');
  assert.strictEqual(v.vm.banner.show, false, 'banner default off');
  assert.ok(!g.log.ads.some((a) => a[0] === 'banner'));
  g.tapId('board:back');
  assert.strictEqual(g.view().screen, 'home');
  // refused privacy: only the boards show the explainer
  const r = await startUp(t, { privacy: { state: 'unknown', refuse: true }, enter: { scene: 1044, query: 's=r&m=daily&d=x', shareTicket: 'tk' } });
  await closeHowto(r);
  r.tapId('home:groupBoard');
  await r.settle();
  assert.strictEqual(r.view().vm.state, 'privacyDenied');
  assert.ok(r.has('board:agree'));
  r.tapId('board:back');
  r.tapId('home:free');
  assert.strictEqual(r.view().screen, 'play', 'free play unaffected');
  // friend scope refused
  const s = await startUp(t, { privacy: { state: 'agreed', scope: false } });
  await closeHowto(s);
  s.tapId('home:friendBoard');
  await s.settle();
  assert.strictEqual(s.view().vm.state, 'unauthorized');
  assert.ok(s.has('board:openSetting'));
  // no group context: explainer
  const n = await startUp(t, { privacy: { state: 'agreed', scope: true } });
  await closeHowto(n);
  n.tapId('home:groupBoard');
  assert.strictEqual(n.view().vm.state, 'noGroup');
  assert.ok(n.has('board:share'));
  n.tapId('board:share');
  assert.strictEqual(n.log.shares.length, 1);
});

test('banner: only with the remote switch and a real ad unit, on boards in ready or empty (AC 73)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  mock.db.appConfig.ads = { banner: { enabled: true, adUnitId: 'adunit-banner' } };
  const g = await startUp(t, { mockServer: mock, privacy: { state: 'agreed', scope: true } });
  await closeHowto(g);
  // stub mode (no ad units in the build): banner stays off even when the config turns it on
  g.tapId('home:friendBoard');
  await g.settle();
  assert.ok(!g.log.ads.some((a) => a[0] === 'banner'));
  assert.strictEqual(g.app.ads.bannerAllowed(), false);
});

test('history: list of issues, own result, the deck only after the window (AC 69)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:history');
  await g.settle();
  let v = g.view();
  assert.strictEqual(v.screen, 'history');
  assert.strictEqual(v.vm.state, 'ready');
  assert.strictEqual(v.vm.items.length, 1);
  assert.strictEqual(v.vm.items[0].isToday, true);
  assert.strictEqual(v.vm.items[0].mineText, '未参加');
  assert.strictEqual(v.vm.headerText, '最长连续 0 天 · 今日一比最佳 0');
  g.tapId('history:item:' + v.vm.items[0].dateKey);
  await g.settle();
  v = g.view();
  assert.strictEqual(v.screen, 'issue');
  assert.strictEqual(v.vm.deck, null);
  assert.strictEqual(v.vm.deckLockedText, '今日一比结束后公布题目');
  assert.strictEqual(v.vm.stats, null, 'the distribution needs 30 results');
  assert.strictEqual(count(g, 'history_issue_view'), 1);
  // after the window the deck opens, with the player's answers and report links
  const dk = beijingDateKey(Date.now());
  g.tapId('issue:back');
  g.tapId('history:back');
  g.tapId('home:daily');
  await g.settle();
  await rights(g, 3, dailyLookup(g));
  g.tapId('back');
  g.tapId('dialog:confirm');
  await g.settle();
  const { windowCloseMs } = require('../core/date');
  g.setTime(windowCloseMs(dk) + 120000);
  mock.call('getDaily', {});
  g.tapId('home:history');
  await g.settle();
  v = g.view();
  assert.ok(v.vm.items.length >= 1);
  const item = v.vm.items.find((i) => i.dateKey === dk);
  assert.strictEqual(item.mineText, '连对 3');
  g.tapId('history:item:' + dk);
  await g.settle();
  v = g.view();
  assert.strictEqual(v.vm.deck.length, 40);
  assert.strictEqual(v.vm.mineText, '连对 3');
  assert.strictEqual(v.vm.deck.filter((r) => r.mine === 'correct').length, 3);
  assert.ok(v.vm.deck[0].bottom.canReport && v.vm.deck[0].bottom.valueText);
  g.tapId('report:issue:1:bottom');
  assert.strictEqual(g.view().vm.sheet, 'report');
});

test('save image and subscribe offers appear only after their taps and degrade without setup (AC 83, 84)', async (t) => {
  prepare(t);
  const mock = createMockServer({ now: () => Date.now() });
  const g = await startUp(t, { mockServer: mock });
  await closeHowto(g);
  g.tapId('home:free');
  await rights(g, 2);
  await miss(g);
  g.tapId('continue:result');
  await g.settle();
  assert.ok(!g.log.calls.some((c) => /saveImage|requestSubscribe/.test(c)), 'nothing album-related before the tap');
  assert.strictEqual(g.view().vm.subscribe.state, 'hidden');
  // no card renderer: saving reports an error and grants nothing
  const realCard = g.app.share.cardRenderer;
  g.app.share.cardRenderer = null;
  g.tapId('result:save');
  await g.settle();
  assert.strictEqual(g.view().vm.saveImage.state, 'error');
  assert.ok(!g.log.calls.some((c) => /saveImage/.test(c)));
  // with a renderer the card is saved
  assert.ok(typeof realCard === 'function');
  g.app.share.cardRenderer = (card, scale) => Promise.resolve('tmp://card@' + scale + '.png');
  g.tapId('result:save');
  await g.settle();
  assert.strictEqual(g.view().vm.saveImage.state, 'saved');
  assert.deepStrictEqual(g.log.saved, ['tmp://card@2.png']);
  // album denied: a sheet with 去设置, no automatic re-ask
  const d = await startUp(t, { albumDeny: true });
  await closeHowto(d);
  d.app.share.cardRenderer = () => Promise.resolve('tmp://c.png');
  d.tapId('home:free');
  await rights(d, 1);
  await miss(d);
  d.tapId('continue:result');
  await d.settle();
  d.tapId('result:save');
  await d.settle();
  assert.strictEqual(d.view().vm.saveImage.state, 'denied');
  assert.strictEqual(d.view().vm.sheet, 'albumDenied');
  assert.strictEqual(d.log.calls.filter((c) => /saveImageToPhotosAlbum/.test(c)).length, 1);
  // subscribe: hidden without a template; with one the offer follows a created challenge
  assert.strictEqual(g.log.subscribe.length, 0);
  mock.db.appConfig.subscribe = { tmplId: 'TMPL1' };
  const s = await startUp(t, { mockServer: mock });
  await closeHowto(s);
  s.tapId('home:free');
  await rights(s, 1);
  await miss(s);
  s.tapId('continue:result');
  await s.settle();
  assert.strictEqual(s.view().vm.subscribe.state, 'hidden', 'not before a challenge exists');
  s.tapId('result:challenge');
  await s.settle();
  assert.strictEqual(s.view().vm.subscribe.state, 'offer');
  s.tapId('result:subscribe');
  await s.settle();
  assert.deepStrictEqual(s.log.subscribe, [['TMPL1']]);
  assert.strictEqual(s.view().vm.subscribe.state, 'granted');
  assert.ok(Object.values(mock.db.challenges).some((c) => c.subscribed));
});

test('settings: sound, 大字模式 and 高对比度 persist, sources page lists every publisher (AC 17, 78, 79)', async (t) => {
  const g = await startUp(t);
  await closeHowto(g);
  g.tapId('home:settings');
  let v = g.view();
  assert.strictEqual(v.vm.sheet, 'settings');
  g.tapId('settings:largeText');
  g.tapId('settings:highContrast');
  g.tapId('settings:sound');
  v = g.view();
  assert.deepStrictEqual(v.vm.display, { largeText: true, highContrast: true, scale: 1.25, palette: 'highContrast' });
  assert.strictEqual(v.vm.muted, true);
  assert.strictEqual(count(g, 'display_setting'), 2);
  g.tapId('settings:sources');
  v = g.view();
  assert.strictEqual(v.vm.sheet, 'sources');
  const text = JSON.stringify(v.vm.sheetVm);
  assert.ok(text.includes('国家统计局网站') && text.includes('https://www.stats.gov.cn'));
  assert.ok(text.includes('GeoNames (CC BY 4.0)'));
  assert.ok(text.includes('NASA') && text.includes('USDA FoodData Central'));
  g.tapId('sheet:close');
  g.tapId('sheet:close');
  assert.strictEqual(g.view().vm.sheet, null);
  const g2 = boot(t, { storage: g.storage });
  await g2.settle();
  assert.deepStrictEqual(g2.view().vm.display, { largeText: true, highContrast: true, scale: 1.25, palette: 'highContrast' });
  assert.strictEqual(g2.view().vm.muted, true);
  // muted: no sound and no vibration on a miss
  g2.tapId('home:free');
  await rights(g2, 1);
  await miss(g2);
  assert.ok(!g2.log.calls.some((c) => /audio.play|vibrateShort/.test(c)));
});

test('sources: tapping a source line opens the sheet with the URL as plain text (AC 16)', async (t) => {
  const g = await startUp(t);
  await closeHowto(g);
  g.tapId('home:free');
  g.tapId('source:top');
  const v = g.view();
  assert.strictEqual(v.vm.sheet, 'source');
  const s = v.vm.sheetVm;
  assert.ok(s.url.startsWith('https://'));
  assert.ok(s.publisher && s.year && s.sourceTitle && s.retrievedAt);
  assert.strictEqual(count(g, 'source_view'), 1);
  assert.ok(g.has('source:report'));
  g.tapId('source:report');
  assert.strictEqual(g.view().vm.sheet, 'report');
});

test('every revealed value shows its unit, 约 when approximate, and the source line (AC 16, 82)', async (t) => {
  const g = await startUp(t);
  await closeHowto(g);
  g.tapId('home:free');
  g.wait(350);
  g.tapId('answer:' + freeLookup(g.app.ctl.state.r.q));
  await g.settle();
  g.wait(700);
  g.frame();
  const v = g.view().vm;
  for (const f of [v.top, v.bottom]) {
    assert.ok(f.valueText && f.unitText && /^来源：.+ · \d{4}$/.test(f.sourceText), JSON.stringify(f));
  }
  assert.strictEqual(v.top.unitText, v.bottom.unitText, 'both cards use the same unit');
  assert.strictEqual(v.verdictText, '对');
});
