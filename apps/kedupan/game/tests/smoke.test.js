/**
 * Boots the whole game against a fake wx and plays it headlessly with touches: the daily, the host and guesser
 * sides of a round, the archive, card entries and group context, ads, privacy refusal, offline.
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, playDaily } = require('./harness');

const allEvents = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const events = (g) => allEvents(g).map((e) => e.name);
const count = (g, name) => events(g).filter((n) => n === name).length;
const vm = (g) => g.app.ctl.view().vm;
const screen = (g) => g.app.ctl.view().screen;

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  return g;
}

test('boots to home, first launch shows the howto once, no authorization prompts, share menu registered', async (t) => {
  const g = await startUp(t);
  const text = g.frame();
  assert.ok(text.indexOf('群友刻度盘') >= 0, text.slice(0, 200));
  assert.ok(g.has('sheet:close'), 'howto sheet auto-opens once');
  assert.strictEqual(count(g, 'howto_view'), 1);
  g.tapId('sheet:close');
  assert.ok(!g.has('sheet:close'));
  assert.ok(g.has('home:daily') && g.has('home:host') && g.has('home:archive'));
  assert.strictEqual(vm(g).daily.state, 'available');
  assert.strictEqual(vm(g).daily.issueNo, 20);
  for (const c of g.log.calls) assert.ok(!/requirePrivacyAuthorize|authorize|setUserCloudStorage|requestSubscribeMessage/.test(c), 'no prompt at launch: ' + c);
  assert.ok(g.log.menu.some((m) => m[0] === 'showShareMenu' && m[1].menus[0] === 'shareAppMessage'));
  assert.ok(g.log.menu.some((m) => m[0] === 'updateShareMenu' && m[1].withShareTicket === true && m[1].isUpdatableMessage === undefined));
  assert.strictEqual(count(g, 'session_start'), 1);
  // the howto does not reopen on a second launch
  const g2 = await startUp(t, { storage: g.storage });
  assert.ok(!g2.has('sheet:close'));
});

test('a full daily plays headlessly: 5 cards, reveals, day result', async (t) => {
  const g = await startUp(t);
  await g.ready();
  g.tapId('home:daily');
  assert.strictEqual(screen(g), 'card');
  let v = vm(g);
  assert.strictEqual(v.phase, 'empty');
  assert.strictEqual(v.needle, null);
  assert.strictEqual(v.canConfirm, false);
  assert.strictEqual(v.coach, true);
  assert.strictEqual(v.index, 1);
  assert.strictEqual(v.total, 5);
  // confirm is disabled until the first touch (no hit for a disabled primary)
  assert.ok(!g.has('card:primary') || vm(g).canConfirm === false);
  g.ruler(30);
  v = vm(g);
  assert.strictEqual(v.phase, 'placing');
  assert.strictEqual(v.needle, 30);
  assert.strictEqual(v.coach, false);
  g.drag(30, 80);
  assert.strictEqual(vm(g).needle, 80);
  g.tapId('card:left');
  assert.strictEqual(vm(g).needle, 79);
  g.tapId('card:right');
  g.tapId('card:right');
  assert.strictEqual(vm(g).needle, 81);
  g.ruler(100);
  assert.strictEqual(vm(g).needle, 100);
  g.tapId('card:right');
  assert.strictEqual(vm(g).needle, 100, 'clamped at 100');
  g.ruler(0);
  g.tapId('card:left');
  assert.strictEqual(vm(g).needle, 0, 'clamped at 0');
  g.ruler(88);
  g.tapId('card:primary');
  assert.strictEqual(vm(g).phase, 'submitting');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.phase, 'revealed');
  assert.ok(v.reveal.markers.some((m) => m.kind === 'you' && m.pos === 88));
  assert.ok(v.reveal.markers.some((m) => m.kind === 'nation'));
  assert.match(v.reveal.scoreText, /^\+\d+$/);
  assert.match(v.reveal.nationText, /^全国.*◆ (在你(左边|右边) \d+ 格|和你在同一格) · 实时$/);
  assert.ok(v.reveal.agreeText === null || /^和全国 \d+% 的人想法相近$/.test(v.reveal.agreeText));
  assert.strictEqual(v.primaryLabel, '下一张');
  assert.strictEqual(count(g, 'daily_card_place'), 1);
  assert.strictEqual(count(g, 'daily_card_reveal'), 1);
  g.tapId('card:primary');
  assert.strictEqual(vm(g).index, 2);
  assert.strictEqual(vm(g).phase, 'empty');
  for (let i = 1; i < 5; i++) {
    g.ruler(20 + i * 15);
    g.tapId('card:primary');
    await g.settle();
    if (i < 4) assert.strictEqual(vm(g).primaryLabel, '下一张');
    else assert.strictEqual(vm(g).primaryLabel, '看结果');
    g.tapId('card:primary');
    await g.settle();
  }
  assert.strictEqual(screen(g), 'result');
  const r = vm(g);
  assert.strictEqual(r.rows.length, 5);
  assert.strictEqual(r.statusTag, '实时');
  assert.strictEqual(r.final, false);
  assert.strictEqual(Number(r.totalText), r.rows.reduce((s, x) => s + Number(x.scoreText), 0));
  assert.ok(r.bandLabel);
  assert.ok(/今日最有争议：/.test(r.divisiveText));
  assert.ok(/0:30 定分/.test(r.streakText));
  assert.strictEqual(r.bonus.left, 3);
  assert.strictEqual(count(g, 'daily_complete'), 1);
  assert.strictEqual(count(g, 'daily_result_view'), 1);
  // the marker is written once, exactly {d, s}, under one key
  assert.strictEqual(g.log.cloudWrites.length, 1);
  assert.deepStrictEqual(g.log.cloudWrites[0].map((k) => k.key), ['kd']);
  const kv = JSON.parse(g.log.cloudWrites[0][0].value);
  assert.deepStrictEqual(Object.keys(kv).sort(), ['d', 's']);
  assert.strictEqual(kv.d, '20261120');
  // home now shows done with the live score
  g.tapId('back');
  const h = vm(g);
  assert.strictEqual(h.daily.state, 'done');
  assert.match(h.daily.scoreText, /^今日默契分 \d+ · .+ \(实时\)$/);
  assert.strictEqual(h.daily.subline, '明日 0:00 换新卡 · 0:30 定分');
});
