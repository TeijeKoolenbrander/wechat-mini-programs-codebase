'use strict';
// Client-side acceptance tests for the daily flow (spec 2.1, 6.1-6.4, 15), driven through the real main.js, controller,
// vm builders and the stub renderer against the in-memory mock server. Test names carry the AC number.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');
const { boot, T0, BJ } = require('./harness');

const D5 = '20261105';
const DAY = 24 * 3600e3;
const MIN = 60e3;

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}

test('AC 14: the ruler shows no needle until the first touch; 就这儿 is disabled until then; ‹ › move exactly 1 step and clamp; both ends reachable by drag and nudge', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  let vm = h.view().vm;
  assert.equal(vm.needle, null);
  assert.equal(vm.phase, 'empty');
  assert.equal(vm.canConfirm, false);
  assert.equal(vm.hint, '点一下或拖动，放上指针');
  assert.equal(h.has('card:primary'), false, 'the confirm button is disabled (no hit area) without a needle');
  assert.equal(h.has('card:nudgeL'), false);
  h.ctl.K.nudge(1); // a nudge never creates a needle (TD-12)
  assert.equal(h.view().vm.needle, null);

  await h.place(37);
  vm = h.view().vm;
  assert.equal(vm.needle, 37);
  assert.equal(vm.phase, 'placing');
  assert.equal(vm.canConfirm, true);
  assert.equal(h.has('card:primary'), true);
  await h.tap('card:nudgeR');
  assert.equal(h.view().vm.needle, 38);
  await h.tap('card:nudgeL');
  await h.tap('card:nudgeL');
  assert.equal(h.view().vm.needle, 36);

  await h.place(0);
  assert.equal(h.view().vm.needle, 0, 'the left end is reachable by touch');
  await h.tap('card:nudgeL');
  assert.equal(h.view().vm.needle, 0, 'clamped at 0');
  await h.place(100);
  assert.equal(h.view().vm.needle, 100);
  await h.tap('card:nudgeR');
  assert.equal(h.view().vm.needle, 100, 'clamped at 100');

  await h.drag(50, 0, { px: 5000 }); // dragging past the edge and off the band still clamps
  assert.equal(h.view().vm.needle, 100);
  await h.drag(50, 0, { px: -300, dy: 300 });
  assert.equal(h.view().vm.needle, 0);
  for (const p of [1, 13, 50, 87, 99]) {
    await h.place(p);
    assert.ok(Number.isInteger(h.view().vm.needle) && h.view().vm.needle >= 0 && h.view().vm.needle <= 100);
  }
});

test('AC 14: release keeps the needle; a second finger is ignored while one is down', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.place(60);
  assert.equal(h.view().vm.needle, 60);
  const y = h.rulerY();
  h.handlers.start({ changedTouches: [{ identifier: 7, clientX: h.rulerX(20), clientY: y }], touches: [{}] });
  assert.equal(h.view().vm.needle, 20);
  h.handlers.start({ changedTouches: [{ identifier: 8, clientX: h.rulerX(90), clientY: y }], touches: [{}, {}] });
  assert.equal(h.view().vm.needle, 20, 'single-finger routing: the second finger does nothing');
  h.handlers.end({ changedTouches: [{ identifier: 7, clientX: h.rulerX(20), clientY: y }], touches: [] });
  assert.equal(h.view().vm.needle, 20);
});

test('AC 16: a reveal shows ▼ and ◆, the label, +score, the 左边/右边 N 格 line, and 和全国 x% only with >= 30 answers', async (t) => {
  const h = await ready(t);
  h.srv.seedCrowd(D5, 1, 60); // card 2 has a crowd, card 1 does not
  await h.tap('home:daily');
  await h.answer(50);
  let vm = h.view().vm;
  assert.equal(vm.phase, 'revealed');
  assert.deepEqual(vm.reveal.markers.map((m) => m.kind), ['nation', 'you']);
  assert.ok(['心有灵犀', '很同频', '差不多', '有点偏', '想法独特'].includes(vm.reveal.label));
  assert.match(vm.reveal.scoreText, /^\+\d+$/);
  assert.match(vm.reveal.nationText, /^全国 \(样本少\) ◆ (在你左边 \d+ 格|在你右边 \d+ 格|和你一样) · 实时$/);
  assert.equal(vm.reveal.agreeText, null, 'hidden below 30 answers');
  assert.equal(vm.reveal.groupText, null, 'no group context, no group line');
  assert.equal(vm.primaryLabel, '下一张');
  await h.tap('card:primary');
  await h.answer(40);
  vm = h.view().vm;
  assert.match(vm.reveal.agreeText, /^和全国 \d+% 的人想法相近$/);
  assert.match(vm.reveal.nationText, /^全国 ◆ /);
  assert.equal(vm.reveal.markers.some((m) => m.kind === 'group' || m.kind === 'member'), false);
});

test('AC 16: with group context and another member who answered, the reveal adds ● and member dots and the group line', async (t) => {
  const h = await ready(t, { enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T-1' } });
  h.joinOther('bob');
  h.joinOther('cat');
  h.otherDaily('bob', [30, 30, 30, 30, 30]);
  h.otherDaily('cat', [70, 70, 70, 70, 70]);
  assert.equal(h.st.group.status, 'ok');
  await h.tap('home:daily');
  await h.answer(50);
  const vm = h.view().vm;
  const kinds = vm.reveal.markers.map((m) => m.kind);
  assert.deepEqual(kinds.filter((k) => k === 'member').length, 2);
  assert.ok(kinds.includes('group') && kinds.includes('nation') && kinds.includes('you'));
  assert.match(vm.reveal.groupText, /^本群 2 人 ● (在你左边 \d+ 格|在你右边 \d+ 格|和你一样)$/);
  assert.equal(vm.reveal.markers.find((m) => m.kind === 'group').pos, 50, 'median of 30 and 70');
});

test('AC 17: 心有灵犀 triggers the chime, vibrateShort and confetti; other labels do not', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  const anchor0 = h.srv.db.sets[D5].cards[0].anchor;
  await h.answer(anchor0); // d = 0
  let vm = h.view().vm;
  assert.equal(vm.reveal.label, '心有灵犀');
  assert.equal(vm.reveal.bullseye, true);
  assert.equal(h.log.vibrate, 1);
  assert.ok(h.log.audio.some((s) => /chime/.test(s)));
  assert.ok(vm.confetti && vm.confetti.t >= 0 && vm.confetti.t < 1);
  h.advance(2000);
  h.app.invalidate();
  assert.equal(h.view().vm.confetti, null, 'the confetti ends');
  await h.tap('card:primary');
  const anchor1 = h.srv.db.sets[D5].cards[1].anchor;
  await h.answer(anchor1 < 50 ? 95 : 5);
  vm = h.view().vm;
  assert.notEqual(vm.reveal.label, '心有灵犀');
  assert.equal(vm.reveal.bullseye, false);
  assert.equal(h.log.vibrate, 1, 'no second vibration');
  assert.equal(vm.confetti, null);
  assert.equal(h.log.audio.filter((s) => /chime/.test(s)).length, 1);
});

test('AC 18: after 5 cards the result shows the live total and band, 5 rows, 今日最有争议 and 实时; the streak line from 2 days', async (t) => {
  const h = await ready(t);
  await h.playDaily([20, 40, 60, 80, 50]);
  assert.equal(h.screen(), 'result');
  let vm = h.view().vm;
  assert.equal(vm.statusTag, '实时');
  assert.equal(vm.final, false);
  assert.equal(vm.rows.length, 5);
  const sum = vm.rows.reduce((a, r) => a + Number(r.scoreText.slice(1)), 0);
  assert.equal(String(sum), vm.totalText);
  assert.equal(vm.bandLabel, S.dayBand(sum));
  assert.match(vm.divisiveText, /^今日最有争议：.+ \(.+↔.+\)$/);
  assert.equal(vm.streakText, null, 'a first day has no streak line');
  assert.equal(vm.percentileText, null, 'no percentile before 定分');
  assert.match(h.lastText(), /今日默契分 \(实时\)/);
  const day1 = sum;

  await h.tap('result:back');
  h.advance(DAY);
  await h.show();
  assert.match(h.lastText(), /昨日定分 \d+/, 'yesterday is final after 00:30');
  assert.equal(h.view().vm.daily.yesterdayText.startsWith('昨日定分 '), true);
  assert.notEqual(day1, undefined);
  await h.playDaily([25, 45, 65, 85, 55]);
  vm = h.view().vm;
  assert.equal(vm.streakText, '连续 2 天');
});

test('AC 18: after D+1 00:30 the result shows 定分 with the frozen references and 超过全国 x% (>= 30 complete dailies)', async (t) => {
  const h = await ready(t);
  // 35 other players finish today so the percentile is shown after 定分
  for (let i = 0; i < 35; i++) h.otherDaily('p' + i, [10 + i, 20 + i, 30 + i, 40 + i, 50 + i]);
  await h.playDaily([50, 50, 50, 50, 50]);
  assert.equal(h.view().vm.statusTag, '实时');
  h.advance(14 * 3600e3 + 31 * MIN); // D+1 00:31
  h.srv.runTimer('finalizeDay');
  await h.show();
  await h.settle();
  const vm = h.view().vm;
  assert.equal(h.screen(), 'result');
  assert.equal(vm.statusTag, '定分');
  assert.equal(vm.final, true);
  assert.match(vm.percentileText, /^超过全国 \d+%$/);
  assert.deepEqual(vm.rows.map((r) => r.nation), h.srv.db.sets[D5].final, 'frozen references');
  assert.match(h.lastText(), /\(定分\)|定分/);
});

test('AC 20: a daily started at 23:59 accepts the remaining cards until D+1 00:30; the result is the old day', async (t) => {
  const h = await ready(t, { now: BJ(2026, 11, 5, 23, 59, 0) });
  await h.tap('home:daily');
  await h.answer(40);
  await h.tap('card:primary');
  h.advance(11 * MIN); // 00:10 on D+1
  for (let i = 1; i < 5; i++) {
    await h.answer(40 + i);
    assert.equal(h.view().vm.phase, 'revealed', 'card ' + (i + 1) + ' is accepted in the grace window');
    await h.tap('card:primary');
  }
  assert.equal(h.screen(), 'result');
  assert.equal(h.st.result.dateKey, D5);
  assert.equal(h.view().vm.statusTag, '实时');
});

test('AC 20: at 00:31 the remaining cards are LATE_SUBMIT: a friendly toast, back home on the new issue', async (t) => {
  const h = await ready(t, { now: BJ(2026, 11, 5, 23, 59, 0) });
  await h.tap('home:daily');
  await h.answer(40);
  await h.tap('card:primary');
  h.advance(32 * MIN); // 00:31
  await h.answer(41);
  assert.equal(h.screen(), 'home');
  assert.match(h.lastText(), /这一期已经结束，可以去往期里玩/);
  assert.equal(h.view().vm.daily.issueNo, 6);
  assert.equal(h.view().vm.daily.state, 'available');
  assert.equal(h.srv.db.entries[D5 + '_' + h.srv.ME].pos.filter((x) => x !== null).length, 1, 'the day stays partial');
});

test('AC 21: in-progress daily resumes at the first unanswered card after kill and relaunch, and on a second device', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.answer(30);
  await h.tap('card:primary');
  await h.answer(70);
  await h.tap('card:primary'); // on card 3 now
  await h.hide();
  h.app.analytics.stopTimer();

  const h2 = await boot(t, { srv: h.srv, storage: JSON.parse(JSON.stringify(h.storage)) });
  assert.equal(h2.screen(), 'home');
  assert.equal(h2.view().vm.daily.state, 'inProgress');
  assert.equal(h2.view().vm.daily.answered, 2);
  await h2.tap('home:daily');
  assert.equal(h2.view().vm.index, 3, 'resumes at card 3');
  assert.equal(h2.view().vm.phase, 'empty');
  assert.equal(h2.view().vm.card.itemId, h.srv.db.sets[D5].cards[2].itemId);

  const h3 = await boot(t, { srv: h.srv, storage: {} }); // a second device: no local state at all
  if (h3.has('sheet:close')) await h3.tap('sheet:close');
  assert.equal(h3.view().vm.daily.state, 'inProgress');
  assert.equal(h3.view().vm.daily.answered, 2);
  await h3.tap('home:daily');
  assert.equal(h3.view().vm.index, 3);
});

test('AC 21 / edge 25: killed while a reveal is on screen, the relaunch shows that reveal again', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.answer(33);
  const label = h.view().vm.reveal.label;
  const scoreText = h.view().vm.reveal.scoreText;
  await h.hide();
  const h2 = await boot(t, { srv: h.srv, storage: JSON.parse(JSON.stringify(h.storage)) });
  await h2.tap('home:daily');
  const vm = h2.view().vm;
  assert.equal(vm.phase, 'revealed');
  assert.equal(vm.index, 1);
  assert.equal(vm.reveal.label, label);
  assert.equal(vm.reveal.scoreText, scoreText);
  assert.equal(h2.log.vibrate, 0, 'a re-shown reveal has no effects');
  await h2.tap('card:primary');
  assert.equal(h2.view().vm.index, 2);
});

test('spec 6.2 / 15.2: offline at confirm keeps the position as pending, no reveal, 重试 works, and the home card says 答案待发送', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.place(64);
  h.srv.offline = true;
  await h.tap('card:primary');
  let vm = h.view().vm;
  assert.equal(vm.phase, 'pending');
  assert.equal(vm.reveal, null, 'the reveal needs server data');
  assert.equal(vm.submitNote, '网络不稳，答案还没送达');
  assert.equal(vm.primaryLabel, '重试');
  assert.equal(h.view().vm.needle, 64);
  assert.deepEqual(JSON.parse(h.storage.kd_state_v1).pending, { dateKey: D5, idx: 0, pos: 64 });

  await h.tap('card:back'); // 返回 is allowed
  assert.equal(h.screen(), 'home');
  assert.equal(h.view().vm.daily.state, 'offline', 'the daily itself could not be refreshed offline');
  h.srv.offline = false;
  await h.tap('home:retry'); // reloads the daily; the unsent card is still waiting
  assert.equal(h.view().vm.daily.state, 'pendingSubmit');
  assert.match(h.lastText(), /答案待发送/);
  await h.tap('home:retry'); // delivers it
  assert.equal(h.view().vm.daily.state, 'inProgress');
  await h.tap('home:daily');
  assert.equal(h.view().vm.index, 2, 'the pending card was delivered; the player continues with card 2');
  assert.equal(h.srv.db.entries[D5 + '_' + h.srv.ME].pos[0], 64);
  assert.equal(JSON.parse(h.storage.kd_state_v1).pending, null);
});

test('spec 15.2: a pending card is retried by 重试 on the card and automatically on relaunch', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.place(15);
  h.srv.offline = true;
  await h.tap('card:primary');
  h.srv.offline = false;
  await h.tap('card:primary'); // 重试
  assert.equal(h.view().vm.phase, 'revealed');
  assert.equal(h.srv.db.entries[D5 + '_' + h.srv.ME].pos[0], 15);

  const h2 = await ready(t);
  await h2.tap('home:daily');
  await h2.place(77);
  h2.srv.offline = true;
  await h2.tap('card:primary');
  h2.srv.offline = false;
  await h2.hide();
  const h3 = await boot(t, { srv: h2.srv, storage: JSON.parse(JSON.stringify(h2.storage)) });
  await h3.settle(20);
  assert.equal(h3.srv.db.entries[D5 + '_' + h3.srv.ME].pos[0], 77, 'sent silently on launch');
  assert.equal(h3.view().vm.daily.answered, 1);
});

test('AC 15 (client): CARD_DONE shows the server position and reveal instead of the local one', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.place(10);
  // another device answers card 1 with 90 first
  h.srv.callAs(h.srv.ME, 'submitCard', { dateKey: D5, idx: 0, pos: 90 });
  await h.tap('card:primary');
  const vm = h.view().vm;
  assert.equal(vm.phase, 'revealed');
  assert.equal(vm.reveal.markers.find((m) => m.kind === 'you').pos, 90, "the server's stored position wins");
  assert.equal(vm.needle, 90);
  const n = h.srv.db.stats[D5 + '_0'].n;
  assert.equal(n, 1, 'the histogram counted once');
});

test('spec 6.1: home before the launch day is unavailable with 重试; archive and 出一道题 stay enabled', async (t) => {
  const early = await ready(t, { now: BJ(2026, 10, 30, 10, 0, 0) });
  assert.equal(early.view().vm.daily.state, 'unavailable');
  assert.ok(early.has('home:retry'));
  assert.ok(early.has('home:archive') && early.has('home:host'));
});

test('spec 6.1: home states - offline with 重试, done shows the score line and 看结果', async (t) => {
  const h = await ready(t);
  h.srv.offline = true;
  await h.show();
  assert.equal(h.view().vm.daily.state, 'offline');
  assert.ok(h.has('home:retry') && h.has('home:archive') && h.has('home:host'));
  h.srv.offline = false;
  await h.tap('home:retry');
  assert.equal(h.view().vm.daily.state, 'available');
  await h.playDaily([10, 20, 30, 40, 50]);
  await h.tap('result:back');
  const d = h.view().vm.daily;
  assert.equal(d.state, 'done');
  assert.match(d.scoreText, /^今日默契分 \d+ · .+ \(实时\)$/);
  assert.ok(h.has('home:daily'));
});

test('AC 73: the 玩法 sheet opens once on first launch, the first card shows one coach bubble; neither returns', async (t) => {
  const h = await boot(t);
  assert.equal(h.view().vm.sheet, 'howto');
  assert.equal(h.view().vm.showHowToOnce, true);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'howto_view' && e.props.auto === true).length, 1);
  await h.tap('sheet:close');
  await h.tap('home:howto'); // reachable later, not auto
  assert.equal(h.view().vm.showHowToOnce, false);
  await h.tap('sheet:close');
  await h.tap('home:daily');
  assert.equal(h.view().vm.coach, true);
  assert.ok(h.has('coach:dismiss'));
  await h.place(50);
  assert.equal(h.view().vm.coach, false, 'the first touch dismisses it');

  const h2 = await boot(t, { storage: JSON.parse(JSON.stringify(h.storage)) });
  assert.equal(h2.view().vm.sheet, null, 'no auto sheet on the second launch');
  await h2.tap('home:daily');
  assert.equal(h2.view().vm.coach, false);
});

test('AC 76: mute persists across launches and silences every cue', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.place(10);
  await h.place(40); // crosses 5-step boundaries: tick
  assert.ok(h.log.audio.some((s) => /tick/.test(s)), 'unmuted: ticks play');
  await h.tap('card:back');
  await h.tap('home:sound');
  assert.equal(h.view().vm.muted, true);
  const before = h.log.audio.length;
  await h.tap('home:daily');
  await h.place(90);
  await h.answer(anchorOf(h, 0));
  assert.equal(h.log.audio.length, before, 'muted: not even the chime plays');

  const copy = JSON.parse(h.storage.kd_state_v1);
  copy.viewing = null;
  const h2 = await boot(t, { srv: h.srv, storage: { kd_state_v1: JSON.stringify(copy) } });
  assert.equal(h2.view().vm.muted, true, 'persisted');
  await h2.tap('home:daily');
  await h2.place(10);
  await h2.place(70);
  assert.equal(h2.log.audio.length, 0);
});

function anchorOf(h, i) {
  return h.srv.db.sets[D5].cards[i].anchor;
}

test('AC 81: the same answers give the same totals for a new user, a veteran, and after watching an ad', async (t) => {
  const totals = [];
  for (const v of [{}, { lifetime: 50 }, { ads: true }]) {
    const storage = {};
    if (v.lifetime) storage.kd_state_v1 = JSON.stringify({ v: 1, firstDate: '20260101', lifetimeSets: v.lifetime, howtoSeen: true, coachSeen: true });
    const h = await ready(t, { storage, build: { stubAds: true } }); // each boot has its own fresh server: the same crowd state
    await h.playDaily([20, 40, 60, 80, 50]);
    const total = h.view().vm.totalText;
    if (v.ads) {
      await h.tap('result:distribution');
      h.ctl.K.ads.stubComplete(true);
      await h.settle();
      await h.tap('sheet:close');
      assert.equal(h.view().vm.totalText, total, 'watching an ad changes no score');
    }
    totals.push(total);
  }
  assert.ok(Number(totals[0]) > 0);
  assert.deepEqual([totals[1], totals[2]], [totals[0], totals[0]]);
});
