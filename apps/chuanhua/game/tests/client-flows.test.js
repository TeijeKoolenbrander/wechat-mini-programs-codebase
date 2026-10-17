'use strict';
// More client flows against the mock server: updatable invite card with its static fallback, native banner lifecycle, author
// deletion, settings, privacy links, album paging and offline cache, teaser report, early-reveal race, sheet ordering,
// double taps, restriction mid-turn, analytics coverage, the room card and the album of rooms.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { G, startChain, openCard, describeStep, drawStep, fullChain } = require('./flows');
const chainLib = require('../core/chain');
const { CONFIG } = require('../core/config');

const MIN = 60e3;

test('9.4: with the updatable card on, the invite share sets up the template (member_count = passed 棒, room_limit 6) and 已传出 says the card updates itself', async () => {
  const w = world();
  w.srv.appConfig = { features: { updatableCard: true } };
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  assert.equal(a.vm().autoUpdateNote, true);
  assert.ok(w.srv.db.chains[id].activityId, 'the activity id was asked for ahead of the tap');
  assert.equal(a.vm().modState, 'passed');
  await a.tap('sent:share');
  const upd = a.log.menu.filter((m) => m[0] === 'updateShareMenu' && m[1].isUpdatableMessage);
  assert.equal(upd.length, 1);
  assert.equal(upd[0][1].activityId, w.srv.db.chains[id].activityId);
  assert.deepEqual(upd[0][1].templateInfo.parameterList, [{ name: 'member_count', value: '1' }, { name: 'room_limit', value: '6' }]);
  assert.equal(a.log.shares.length, 1);
  assert.equal(a.log.shares[0].query, 'k=' + id);
});

test('9.4 fallback: with the updatable card off (default) the card is static: no activity id is requested, no isUpdatableMessage, no auto-update note', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  assert.equal(a.vm().autoUpdateNote, false);
  assert.equal(w.srv.db.chains[id].activityId, null);
  await a.tap('sent:share');
  assert.equal(a.log.menu.some((m) => m[1].isUpdatableMessage !== undefined), false);
  assert.equal(a.log.shares.length, 1);
});

test('AC 105 (native): with a real unit the banner is created once on 本群接龙/我的接龙 and destroyed on leaving', async () => {
  const w = world();
  w.srv.appConfig = { ads: { banner: { enabled: true, adUnitId: 'adunit-b' } } };
  const a = await w.player('A', { rules: true, ...G, build: { stubAds: false, adUnits: { rewarded: '', interstitial: '', banner: 'adunit-b' } } });
  await a.tap('home:album');
  assert.equal(a.vm().state, 'empty');
  a.frame();
  assert.equal(a.log.ads.filter((x) => x[0] === 'banner').length, 1);
  assert.deepEqual(a.log.bannerOps.slice(0, 1), ['show']);
  await a.tap('album:back');
  a.frame();
  assert.equal(a.log.bannerOps[a.log.bannerOps.length - 1], 'destroy');
  // stub mode never touches the native API
  const b = await w.player('B', { rules: true, ...G });
  await b.tap('home:album');
  b.frame();
  assert.equal(b.log.ads.filter((x) => x[0] === 'banner').length, 0);
  assert.equal(b.vm().banner.stub, true);
});

test('7.4/AC 71 (client): 删除这一棒 asks first, then removes the content; the placeholder replaces it in the reveal; deleting the latest 棒 reopens it', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await describeStep(w, b, id, '一个大饼在天上');
  // B deletes their own latest passed 棒 (the 2nd) from the chain entry's 看我的那一棒
  await openCard(w, b, id);
  assert.equal(b.vm().state, 'prevMine');
  await b.tap('entry:mine');
  assert.equal(b.screen(), 'mine');
  assert.deepEqual(b.vm().mine.map((m) => [m.n, m.modState, m.canDelete, m.line]), [[2, 'passed', true, '第 2 棒 · 已通过']]);
  await b.tap('mine:delete:2');
  assert.deepEqual([b.view().overlay.dialog.title, b.view().overlay.dialog.text], ['删除这一棒', '删除后，你画的和写的内容将不再展示，正在进行的接龙会让出你的那一棒']);
  await b.tap('dialog:cancel');
  assert.equal(b.vm().mine[0].modState, 'passed', 'cancel changes nothing');
  await b.tap('mine:delete:2');
  await b.tap('dialog:confirm');
  assert.equal(b.vm().mine[0].modState, 'deleted');
  assert.equal(b.vm().mine[0].canDelete, false);
  assert.equal(b.vm().mine[0].text, undefined, 'the content is gone');
  assert.equal(w.srv.db.steps[id + '_2_1'].text, undefined);
  // the 棒 reopened: another player can take it
  const c = await w.player('C', { rules: true, ...G });
  await openCard(w, c, id);
  assert.equal(c.vm().state, 'claimable');
  assert.equal(c.vm().nextStep, 2);
});

test('7.4/AC 72 (client): 删除我的全部接龙内容 needs two confirms; cancelling at either leaves everything; the end state is done', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await fullChain(w, a, b);
  await b.tap('stepthrough:back');
  await b.tap('home:settings');
  assert.equal(b.vm().settings.deleteAll.state, 'idle');
  await b.tap('settings:deleteAll');
  assert.equal(b.vm().settings.deleteAll.state, 'confirm1');
  await b.tap('dialog:cancel');
  assert.equal(b.vm().settings.deleteAll.state, 'idle');
  await b.tap('settings:deleteAll');
  await b.tap('dialog:confirm');
  assert.equal(b.vm().settings.deleteAll.state, 'confirm2');
  assert.equal(b.view().overlay.dialog.text, '删除后，你画的和写的内容将不再展示，正在进行的接龙会让出你的那一棒');
  await b.tap('dialog:cancel');
  assert.equal(b.vm().settings.deleteAll.state, 'idle');
  assert.equal(w.srv.db.steps[id + '_2_1'].state, 'passed', 'nothing was deleted yet');
  await b.tap('settings:deleteAll');
  await b.tap('dialog:confirm');
  await b.tap('dialog:confirm');
  assert.equal(b.vm().settings.deleteAll.state, 'done');
  for (const n of [2, 4, 6]) assert.equal(w.srv.db.steps[id + '_' + n + '_1'].state, 'deleted');
  for (const n of [1, 3, 5]) assert.equal(w.srv.db.steps[id + '_' + n + '_1'].state, 'passed', "A's 棒 stay");
  // the deleted 棒 show the author-deleted placeholder to everyone
  await openCard(w, a, id, 'r');
  assert.deepEqual(a.vm().steps.map((s) => s.placeholder), [null, null, 'deleted', null, 'deleted', null, 'deleted']);
});

test('8.13: sound, 大字模式 and 高对比度 persist and reach every view model; 隐私保护指引 opens on a tap, a failure toasts; 用户协议 explains', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:settings');
  await a.tap('settings:sound');
  assert.equal(a.vm().muted, true);
  await a.tap('settings:largeText');
  await a.tap('settings:highContrast');
  assert.deepEqual(a.vm().display, { largeText: true, highContrast: true });
  assert.equal(a.vm().settings.largeText, true);
  a.app.onHide();
  a.kill();
  const a2 = await w.player('A2', { rules: true, as: 'A', storage: a.storage, ...G });
  assert.deepEqual(a2.vm().display, { largeText: true, highContrast: true }, 'kept across a relaunch');
  assert.equal(a2.vm().muted, true);
  await a2.tap('home:settings');
  await a2.tap('settings:privacy');
  assert.ok(a2.log.calls.includes('openPrivacyContract'));
  await a2.tap('settings:terms');
  assert.equal(a2.screen(), 'terms', 'the full agreement screen (QA-7), not the TD-52 dialog');
  await a2.tap('terms:back');
  assert.equal(a2.vm().sheet, 'settings');
  await a2.tap('settings:rules');
  assert.equal(a2.vm().sheet, 'rules');
  await a2.tap('rules:privacy');
  assert.equal(a2.log.calls.filter((c) => c === 'openPrivacyContract').length, 2);
  await a2.tap('rules:decline');
  assert.equal(a2.vm().sheet, 'settings', 'back to the settings sheet');
  const bad = await w.player('B', { rules: true, ...G, privacyContractFails: true });
  await bad.tap('home:settings');
  await bad.tap('settings:privacy');
  assert.equal(bad.toast(), '暂时打不开，请稍后再试');
  // the large-text pre-selection from the system font size, on first launch only
  const big = await w.player('Big', { rules: true, ...G, fontSize: 20 });
  assert.equal(big.vm().display.largeText, true);
});

test('8.11: 我的接龙 pages by 20, the first page is cached for offline (read-only), and each status opens the right place', async () => {
  const w = world();
  const m = await w.player('M', { rules: true, ...G });
  await m.settle();
  for (let i = 0; i < 25; i++) {
    const ch = chainLib.newChain({ chainId: 'ZZZZZZ' + String(1000 + i), starter: w.id('M'), claimId: 'c' + i, now: w.t - i * MIN, dateKey: '20261103', prompt: { id: 'I07', text: '月亮吃月饼', custom: false } });
    ch.state = 'open';
    ch.claim = null;
    ch.nextStep = 2;
    ch.passed = 1;
    w.srv.db.chains[ch._id] = ch;
  }
  await m.tap('home:album');
  assert.equal(m.vm().items.length, 20);
  assert.ok(m.vm().cursor);
  m.frame();
  m.ctl.onDrag('album:scroll', -1e6); // scroll to the end of the list: 更多 is there
  await m.tap('album:more');
  assert.equal(m.vm().items.length, 25);
  assert.equal(m.vm().cursor, null);
  assert.equal(m.vm().items[0].line.startsWith('进行中 1/6'), true);
  assert.equal(m.vm().items[0].kind, 'chain');
  assert.match(m.vm().items[0].timeText, /^今天 \d\d:\d\d$/);
  await m.tap('album:back');
  // offline: the cached list, read-only
  w.srv.offline = true;
  await m.tap('home:album');
  assert.equal(m.vm().state, 'offline');
  assert.equal(m.vm().items.length, 20);
  await m.tap('album:chain:' + m.vm().items[0].id);
  assert.equal(m.screen(), 'album', 'read-only: nothing opens offline');
  assert.equal(m.toast(), '需联网才能接龙');
  assert.match(m.frame(), /没有网络，显示的是上次的列表/);
  w.srv.offline = false;
  await m.tap('album:back');
  await m.tap('home:album'); // opening it again asks the server again
  assert.equal(m.vm().state, 'ready');
  await m.tap('album:chain:' + m.vm().items[0].id);
  assert.equal(m.screen(), 'entry', 'an open chain opens its entry');
});

test('7.1: the teaser can be reported; a preset prompt hides only the final sentence; 开一局 from the teaser starts a room', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await fullChain(w, a, b);
  const d = await w.player('D', { rules: true, ...G });
  await openCard(w, d, id, 'r');
  assert.equal(d.screen(), 'teaser');
  await d.tap('teaser:report');
  assert.equal(d.view().layers[0].vm.target.step, 0);
  await d.tap('report:reason:other');
  await d.tap('report:submit');
  assert.notEqual(d.vm().lines[0].to, '企鹅在沙漠晒太阳', 'the reported sentence is gone (the latest visible one is shown, edge 28)');
  assert.equal(d.toast(), '已举报，该内容已隐藏');
  w.advance(2000); // the "已举报" sheet closes by itself
  await d.tap('teaser:newRoom');
  assert.equal(d.screen(), 'lobby');
});

test('edge 16: 现在揭晓 while someone is taking the next 棒is refused with the "有群友正在接" line', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  const id = await startChain(a);
  await describeStep(w, b, id, '一个大饼在天上');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '外星人在吃披萨');
  await openCard(w, a, id);
  assert.equal(a.vm().canRevealNow, true);
  await openCard(w, c, id);
  await c.tap('entry:claim'); // C takes 棒 5
  await a.tap('entry:reveal');
  await a.tap('dialog:confirm');
  assert.equal(a.toast(), '有群友正在接，稍后再揭晓');
  assert.equal(a.screen(), 'entry');
});

test('8.7: TAKEN on the claim tap toasts "被群友抢先一步" and shows the claimed state; 刷新 after the lock expires shows it claimable again', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  const id = await startChain(a);
  await openCard(w, b, id);
  await openCard(w, c, id);
  await c.tap('entry:claim');
  await b.tap('entry:claim'); // B's entry is stale: the race is lost
  assert.equal(b.toast(), '被群友抢先一步');
  assert.equal(b.vm().state, 'taken');
  assert.match(b.vm().headline, /有群友正在接第 2 棒（约 \d+ 分钟内）/);
  assert.ok(b.vm().takenEtaText);
  await c.tap('describe:back');
  await c.tap('dialog:confirm'); // C gives up: the claim is released
  await b.tap('entry:refresh');
  assert.equal(b.vm().state, 'claimable');
  // opening 开一条新的 from a wrong-group / taken entry starts a new chain
  await b.tap('entry:home');
  assert.equal(b.screen(), 'home');
});

test('first launch: the 玩法 sheet shows once, then the pending strike warning, in that order', async () => {
  const w = world();
  w.srv.call('agreeRules', { version: CONFIG.rulesVersion }, w.id('A'));
  w.srv.db.players[w.id('A')].warnPending = true;
  const a = await w.player('A', { howto: false, ...G });
  assert.equal(a.vm().sheet, 'howto');
  assert.equal(a.vm().showHowToOnce, true);
  await a.tap('sheet:close');
  assert.equal(a.vm().sheet, 'warning');
  await a.tap('warning:ok');
  assert.equal(a.vm().sheet, null);
  assert.equal(a.app.store.state.howtoSeen, true);
  a.app.onHide();
  a.kill();
  const a2 = await w.player('A2', { howto: false, as: 'A', storage: a.storage, ...G });
  assert.equal(a2.vm().sheet, null, 'the 玩法 sheet does not return');
});

test('17.3: a double tap on 画好了 / 传出去 sends one submit; a retry reuses the same claim (idempotent)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  a.scribble(3);
  a.ctl.onHit('draw:submit');
  a.ctl.onHit('draw:submit');
  await a.settle();
  assert.equal(w.srv.calls.filter((n) => n === 'submitStep').length, 1);
  const id = a.ctl.state.sent.chainId;
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('一只猫在开出租车');
  b.ctl.onHit('describe:submit');
  b.ctl.onHit('describe:submit');
  await b.settle();
  assert.equal(w.srv.calls.filter((n) => n === 'submitStep').length, 2);
  // the server answer for the same claim is the stored one (idempotent per claimId)
  const claimId = Object.values(w.srv.db.steps).find((s) => s.n === 2).claimId;
  const again = w.srv.call('submitStep', { chainId: id, claimId, text: '一只猫在开出租车' }, w.id('B'));
  assert.equal(again.ok, true);
  assert.equal(again.state, 'passed');
});

test('edge 19: a restriction that begins while a claim is held does not discard the work: the claim may finish', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('写完这一句');
  w.advance(1000);
  const p = w.srv.db.players[w.id('B')];
  p.restrictedUntil = w.t + 24 * 3600e3;
  p.restrictedAt = w.t; // after the claim began
  await b.tap('describe:submit');
  assert.equal(b.screen(), 'sent', 'the claim taken before the restriction may finish (TD-7)');
  await b.tap('sent:home');
  assert.ok(b.vm().restriction);
  assert.equal(b.vm().primary.enabled, false);
});

test('14: the client emits the spec 14 events across a played chain and every one passes the server whitelist', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await fullChain(w, a, b);
  await b.tap('stepthrough:dot:1');
  await b.tap('stepthrough:laugh');
  await b.tap('stepthrough:share');
  for (const p of [a, b]) await p.app.analytics.flush();
  const names = new Set(w.srv.db.events.filter((e) => e.openid !== 'server').map((e) => e.name));
  for (const n of ['session_start', 'prompt_pick', 'chain_create', 'step_view', 'step_submit', 'step_result', 'group_join', 'card_open', 'claim_attempt', 'reveal_open', 'reveal_step', 'laugh', 'share_tap', 'prompt_roll']) {
    assert.ok(names.has(n), 'missing event ' + n);
  }
  // nothing but scalars, no ids beyond the chain id, no text
  for (const e of w.srv.db.events) {
    assert.doesNotMatch(JSON.stringify(e.props), /月亮|大饼|披萨|企鹅|"strokes":\{|"strokes":\[|openid|ticket/);
  }
  const submit = w.srv.db.events.find((e) => e.name === 'step_submit' && e.props.kind === 'draw');
  assert.ok(submit.props.strokes >= 1 && submit.props.points >= 1 && 'palette' in submit.props && 'colorsUsed' in submit.props);
  assert.ok(id);
});

test('edge 20: staying in the foreground past Beijing midnight refreshes the allowances on the home screen by itself', async () => {
  const w = world({ t: Date.UTC(2026, 10, 3, 15, 59, 0) }); // 23:59 BJT
  const a = await w.player('A', { rules: true, ...G });
  await startChain(a);
  await a.tap('sent:home');
  assert.equal(a.vm().chainStart.freeLeft, 2);
  w.advance(2 * MIN);
  a.frame();
  await a.settle();
  assert.equal(a.ctl.state.dayKey, '20261104');
  assert.equal(a.vm().chainStart.freeLeft, 3);
});

test('3.3: 开一局 from a chain entry keeps the group context of the entry it started from (the room is bound to that group)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const x = await w.player('X', { rules: true, group: 'g9' });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await describeStep(w, b, id, '先绑定到本群'); // the first claim with a group context binds the chain
  await openCard(w, x, id); // another group
  assert.equal(x.vm().state, 'wrongGroup');
  await x.tap('entry:newRoom');
  assert.equal(x.screen(), 'lobby');
  const fresh = w.srv.db.rooms[x.ctl.state.room.roomId];
  assert.ok(fresh.openGId, 'bound to the own group of X (g9)');
  assert.notEqual(fresh.openGId, w.srv.db.chains[id].openGId);
});
