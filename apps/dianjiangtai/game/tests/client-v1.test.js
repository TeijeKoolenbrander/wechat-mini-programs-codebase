/**
 * v1 client features, played headlessly through the fake wx (tests/harness.js):
 * progressive daily with relaunch, the Sunday 识人 daily, streaks and history,
 * save to album, subscribe opt-in, display modes, remote config, analytics.
 *
 * Taps on ids the (moving) renderer may not draw yet go straight to the
 * controller (`hit`); everything else uses the drawn hit areas.
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, playDraft } = require('./harness');

const FRIDAY = Date.UTC(2026, 10, 20, 4, 0, 0); // 2026-11-20 12:00 Beijing, a Friday
const SUNDAY = Date.UTC(2026, 10, 22, 4, 0, 0); // 2026-11-22 12:00 Beijing, a Sunday

const hit = (g, id) => g.app.ctl.onHit(id);
const view = (g) => g.app.ctl.view();
const allEvents = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const named = (g, name) => allEvents(g).filter((e) => e.name === name);
const calls = (g, re) => g.log.calls.filter((c) => re.test(c));

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  g.tapId('sheet:close');
  return g;
}

async function flipRound(g) {
  g.tapId('primary');
  await g.settle(); // startRun / getRound answers
  g.wait(1300);
  await g.settle();
}

async function pickFirst(g) {
  g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
  g.tapId((h) => h.id.indexOf('slot:') === 0);
  g.wait(400);
}

/** Run a free run to the verdict. */
async function freeRun(g) {
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  await g.settle();
}

test('progressive daily: getDaily has no rounds, startRun gives round 1, getRound one more per 翻令, never a future round (AC 86)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  assert.strictEqual(g.app.store.state.dailyCache.rounds, undefined);
  g.tapId('home:daily');
  const r = g.app.ctl.state.r;
  assert.strictEqual(r.rounds.length, 0, 'nothing is held before the first 翻令');
  const names = () => g.app.api.mock.calls.map((c) => c.name);
  for (let round = 1; round <= 5; round++) {
    await flipRound(g);
    assert.strictEqual(r.rounds.length, round, 'only the rounds released so far are held');
    assert.strictEqual(view(g).vm.round, round);
    assert.ok(view(g).vm.tokens, 'tokens flipped');
    await pickFirst(g);
    g.tapId('primary'); // 下一轮 / 出征
    g.wait(400);
    await g.settle();
  }
  assert.strictEqual(names().filter((n) => n === 'startRun').length, 1);
  assert.strictEqual(names().filter((n) => n === 'getRound').length, 4);
  const fetches = named(g, 'round_fetch');
  assert.strictEqual(fetches.length, 5);
  assert.ok(fetches.every((e) => e.props.result === 'ok' && typeof e.props.ms === 'number' && e.props.round >= 1));
  assert.strictEqual(view(g).vm.status, 'revealing');
  g.tapId('result:skip');
  await g.settle();
  assert.strictEqual(view(g).vm.status, 'done');
  assert.strictEqual(view(g).vm.record.w + view(g).vm.record.l, 12);
});

test('progressive daily: kill and relaunch mid-run resumes the same round and tokens; the server keeps the frozen prefix (AC 25, 87)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.tapId('home:daily');
  await flipRound(g);
  await pickFirst(g);
  g.tapId('primary');
  g.wait(400);
  await flipRound(g); // round 2 delivered by getRound
  assert.strictEqual(view(g).vm.round, 2);
  const tokens = view(g).vm.tokens;
  const pool = view(g).vm.pool.map((p) => p.id);
  g.hide();
  await g.settle();
  const g2 = boot(t, { storage: g.storage, now: FRIDAY });
  Object.assign(g2.app.api.mock.db, g.app.api.mock.db); // same cloud: the server persists
  await g2.settle();
  assert.strictEqual(view(g2).vm.daily.state, 'inProgress');
  assert.strictEqual(view(g2).vm.daily.round, 2);
  g2.tapId('home:daily');
  await g2.settle();
  assert.strictEqual(view(g2).vm.round, 2);
  assert.deepStrictEqual(view(g2).vm.tokens, tokens);
  assert.deepStrictEqual(view(g2).vm.pool.map((p) => p.id), pool);
  // and it finishes: 3 more rounds
  await pickFirst(g2);
  g2.tapId('primary');
  g2.wait(400);
  for (let round = 3; round <= 5; round++) {
    await flipRound(g2);
    await pickFirst(g2);
    g2.tapId('primary');
    g2.wait(400);
    await g2.settle();
  }
  assert.strictEqual(view(g2).vm.status, 'revealing');
});

test('progressive daily offline: 令牌传递中断 with 重试, the current round stays playable, retry continues from the same round (AC 87)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.tapId('home:daily');
  await flipRound(g);
  await pickFirst(g);
  g.tapId('primary');
  g.wait(400);
  g.app.api.mock.offline = true;
  g.tapId('primary'); // 翻令 for round 2
  await g.settle();
  let vm = view(g).vm;
  assert.strictEqual(vm.roundFetch, 'failed');
  assert.strictEqual(vm.roundFetchText, '令牌传递中断');
  assert.strictEqual(vm.tokens, null, 'tokens stay face down');
  assert.strictEqual(vm.round, 2);
  assert.strictEqual(named(g, 'round_fetch').filter((e) => e.props.result === 'offline').length, 1);
  // still the same attempt after the network returns
  g.app.api.mock.offline = false;
  hit(g, 'retryRound');
  await g.settle();
  g.wait(1300);
  vm = view(g).vm;
  assert.strictEqual(vm.roundFetch, 'idle');
  assert.strictEqual(vm.round, 2);
  assert.ok(vm.tokens);
});

test('Sunday 识人 daily: stats, tier, fit and S_r hidden until the verdict, then 五德揭晓 reveals them (AC 78)', async (t) => {
  const g = await startUp(t, { now: SUNDAY });
  let home = view(g).vm;
  assert.strictEqual(home.daily.variant, 'shiren');
  assert.strictEqual(home.daily.variantLabel, '识人');
  g.tapId('home:daily');
  await flipRound(g);
  let vm = view(g).vm;
  assert.strictEqual(vm.hidden, true);
  assert.strictEqual(vm.variantLabel, '识人');
  assert.strictEqual(vm.headerTag, '识人 · 五德出征后揭晓');
  assert.ok(vm.shirenCoach && /识人军令/.test(vm.shirenCoach), 'one-time coach line');
  assert.ok(vm.pool.length > 0);
  for (const p of vm.pool) {
    assert.strictEqual(p.stats, null);
    assert.strictEqual(p.tier, null);
    assert.strictEqual(p.seal.frame, 'plain');
    assert.ok(p.name && p.blurb && 'courtesy' in p && p.seal.text === p.name);
  }
  const id = vm.pool.find((p) => !p.drafted).id;
  hit(g, 'pool:' + id);
  vm = view(g).vm;
  assert.strictEqual(vm.selected.statNote, null);
  assert.strictEqual(vm.selected.stats, null);
  assert.strictEqual(vm.selected.tier, null);
  for (const o of vm.selected.slotOptions) assert.ok(o.label && o.score === null && o.fit === null);
  hit(g, 'slot:' + vm.selected.slotOptions[0].slot);
  vm = view(g).vm;
  assert.ok(vm.lineup.some((e) => e.name));
  for (const e of vm.lineup) assert.ok(e.score === null && e.fit === null);
  assert.strictEqual(JSON.stringify(vm).indexOf('statNote') >= 0 && vm.selected !== null, false);
  // play the rest, hidden throughout
  g.wait(400);
  g.tapId('primary');
  g.wait(400);
  for (let round = 2; round <= 5; round++) {
    await flipRound(g);
    assert.strictEqual(view(g).vm.hidden, true);
    await pickFirst(g);
    g.tapId('primary');
    g.wait(400);
    await g.settle();
  }
  await g.settle();
  g.tapId('result:skip'); // the record reveal
  await g.settle();
  vm = view(g).vm;
  assert.strictEqual(vm.status, 'done');
  assert.strictEqual(vm.variantLabel, '识人');
  assert.deepStrictEqual(vm.reveal, { pending: true, step: 0 });
  assert.ok(vm.lineup.length === 5 && vm.lineup.every((e) => e.stats === null && e.tier === null && e.score === null && e.fit === null && e.revealed === false));
  assert.strictEqual(vm.sheet, null);
  g.wait(700); // two steps
  vm = view(g).vm;
  assert.ok(vm.reveal.pending && vm.reveal.step >= 2);
  assert.ok(vm.lineup[0].stats && vm.lineup[0].tier && vm.lineup[0].fit && vm.lineup[0].score !== null, 'revealed slots show everything');
  assert.strictEqual(vm.lineup[4].stats, null, 'later slots still hidden');
  hit(g, 'result:revealSkip'); // a tap skips
  vm = view(g).vm;
  assert.deepStrictEqual(vm.reveal, { pending: false, step: 5 });
  assert.ok(vm.lineup.every((e) => e.stats && e.tier && e.fit && e.score !== null));
  assert.strictEqual(named(g, 'shiren_reveal').length, 1);
  assert.strictEqual(named(g, 'shiren_reveal')[0].props.skipped, true);
  assert.strictEqual(named(g, 'run_start')[0].props.variant, 'shiren');
  assert.strictEqual(named(g, 'run_complete')[0].props.variant, 'shiren');
  // the card carries the tag and the shiren share title
  const card = require('../js/vm').cardVm(g.app.ctl.state.res, g.app.ctl.state.r.run.content);
  assert.strictEqual(card.variantLabel, '识人');
  g.frame();
  g.app.ctl.onDrag('result:scroll', -99999); // the shiren verdict is taller (stats per row): the action buttons are below the fold
  g.tapId('result:share');
  await g.settle();
  assert.ok(/识人军令，我 \d+胜\d+负，你认得几员将？/.test(g.log.shares[0].title), g.log.shares[0].title);
});

test('Friday standard daily and free play are never hidden', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  assert.strictEqual(view(g).vm.daily.variant, 'standard');
  assert.strictEqual(view(g).vm.daily.variantLabel, null);
  g.tapId('home:daily');
  await flipRound(g);
  let vm = view(g).vm;
  assert.strictEqual(vm.hidden, false);
  assert.ok(vm.pool[0].stats && vm.pool[0].tier);
  assert.strictEqual(vm.shirenCoach, null);
  hit(g, 'back');
  hit(g, 'dialog:confirm');
  // a free seed on a Sunday is not 识人
  const s = await startUp(t, { now: SUNDAY });
  s.tapId('home:free');
  await flipRound(s);
  vm = view(s).vm;
  assert.strictEqual(vm.hidden, false);
  assert.ok(vm.pool[0].stats);
});

test('shiren challenge that counts as today: no rounds from getChallenge, startRun on accept, played hidden by the recipient (AC 79)', async (t) => {
  const g = await startUp(t, { now: SUNDAY });
  const mock = g.app.api.mock;
  const d = mock.call('getDaily', {});
  const s = mock.db.seeds[d.dateKey];
  mock.db.challenges.ABCD2345 = { owner: 'someone-else', mode: 'daily', seed: s.seed, dateKey: d.dateKey, rounds: s.rounds, record: { w: 9, l: 3 }, lineup: [], expiresAt: Date.now() + 86400000, answers: [] };
  g.app.ctl.onShow({ scene: 1007, query: { c: 'ABCD2345' } });
  await g.settle();
  let vm = view(g).vm;
  assert.strictEqual(vm.status, 'ready');
  assert.strictEqual(vm.countsAsDaily, true);
  assert.strictEqual(vm.variantLabel, '识人');
  assert.strictEqual(g.app.ctl.state.challenge.rounds, undefined);
  hit(g, 'challenge:accept');
  await g.settle();
  assert.strictEqual(view(g).screen, 'draft');
  assert.strictEqual(g.app.ctl.state.r.rounds.length, 1, 'round 1 from startRun');
  await flipRound(g);
  vm = view(g).vm;
  assert.strictEqual(vm.hidden, true);
  assert.ok(vm.pool.every((p) => p.stats === null));
  // offline accept: 战书需联网展开
  const o = await startUp(t, { now: SUNDAY });
  const om = o.app.api.mock;
  om.db.challenges.ABCD2346 = Object.assign({}, mock.db.challenges.ABCD2345, { seed: om.db.seeds[om.call('getDaily', {}).dateKey].seed, rounds: om.db.seeds[om.call('getDaily', {}).dateKey].rounds });
  o.app.ctl.onShow({ scene: 1007, query: { c: 'ABCD2346' } });
  await o.settle();
  om.offline = true;
  hit(o, 'challenge:accept');
  await o.settle();
  assert.strictEqual(view(o).screen, 'challenge');
  assert.strictEqual(view(o).vm.status, 'offline');
});

test('streak and history: consecutive days build a streak, 往期 lists issues newest first, the best lineup appears only after the window closes (AC 80-82)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  // day 1
  g.tapId('home:daily');
  await playDraft(g);
  await g.settle();
  g.tapId('result:skip');
  await g.settle();
  assert.strictEqual(view(g).vm.streak.text, null, 'no streak text for a first day');
  g.tapId('result:back');
  assert.strictEqual(view(g).vm.daily.streak.text, null);
  // day 2
  g.wait(24 * 3600e3);
  g.show({ scene: 1001, query: {} });
  await g.settle();
  assert.strictEqual(view(g).vm.daily.state, 'available');
  g.tapId('home:daily');
  await playDraft(g);
  await g.settle();
  g.tapId('result:skip');
  await g.settle();
  let vm = view(g).vm;
  assert.deepStrictEqual(vm.streak, { current: 2, text: '连续出征 2 天' });
  assert.strictEqual(named(g, 'streak_shown').filter((e) => e.props.where === 'result').length, 1);
  assert.ok(!/奖励|领取|别断/.test(JSON.stringify(vm.streak)), 'no reward or pressure wording');
  g.tapId('result:back');
  vm = view(g).vm;
  assert.strictEqual(vm.daily.streak.text, '连续出征 2 天');
  assert.strictEqual(named(g, 'streak_shown').filter((e) => e.props.where === 'home').length, 1);
  // history list
  hit(g, 'home:history');
  await g.settle();
  assert.strictEqual(view(g).screen, 'history');
  vm = view(g).vm;
  assert.strictEqual(vm.state, 'ready');
  assert.strictEqual(vm.bestStreakText, '最长连续出征 2 天');
  assert.ok(vm.items.length >= 2 && vm.items.length <= 30);
  assert.ok(vm.items[0].dateKey > vm.items[1].dateKey, 'newest first');
  assert.strictEqual(vm.items[0].isToday, true);
  assert.strictEqual(vm.items[0].statusText, '进行中');
  assert.ok(vm.items[0].mine && vm.items[0].mine.bandLabel);
  assert.ok(/^\d+月\d+日$/.test(vm.items[0].dateText));
  assert.strictEqual(vm.items[1].mine.record.w + vm.items[1].mine.record.l, 12);
  assert.ok(vm.items.slice(2).every((i) => i.mine === null), 'days not played read 未出征');
  assert.strictEqual(named(g, 'history_view').length, 1);
  // today's issue: no best yet; yesterday's: best shown
  hit(g, 'history:item:' + vm.items[0].dateKey);
  let iv = view(g).vm;
  assert.strictEqual(view(g).screen, 'historyIssue');
  assert.strictEqual(iv.mine.lineup.length, 5);
  assert.strictEqual(iv.best, null);
  assert.strictEqual(iv.bestLockedText, '今日军令结束后公布');
  assert.strictEqual(iv.stats, null, 'under 30 runs: no distribution');
  hit(g, 'issue:back');
  assert.strictEqual(view(g).screen, 'history');
  hit(g, 'history:item:' + vm.items[1].dateKey);
  iv = view(g).vm;
  assert.ok(iv.best && iv.best.lineup.length === 5 && iv.best.record.w >= iv.mine.record.w);
  assert.strictEqual(iv.bestLockedText, null);
  assert.strictEqual(named(g, 'history_issue_view').length, 2);
  hit(g, 'issue:back');
  hit(g, 'history:back');
  assert.strictEqual(view(g).screen, 'home');
});

test('history offline shows 往期需联网查看 state with retry, and free play still works', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.app.api.mock.offline = true;
  hit(g, 'home:history');
  await g.settle();
  assert.strictEqual(view(g).vm.state, 'offline');
  g.app.api.mock.offline = false;
  hit(g, 'history:retry');
  await g.settle();
  assert.strictEqual(view(g).vm.state, 'ready');
  hit(g, 'history:back');
  g.tapId('home:free');
  assert.ok(g.has('primary'));
});

test('save to album: nothing album-related before the tap; success saves the 2x card and toasts (AC 83)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  await freeRun(g);
  assert.strictEqual(calls(g, /saveImageToPhotosAlbum|openSetting/).length, 0);
  assert.strictEqual(calls(g, /getSetting/).length, 0, 'no scope read before the tap');
  assert.strictEqual(view(g).vm.saveImage.state, 'idle');
  hit(g, 'result:save');
  await g.settle();
  assert.strictEqual(calls(g, /saveImageToPhotosAlbum/).length, 1);
  assert.strictEqual(view(g).vm.saveImage.state, 'saved');
  assert.strictEqual(view(g).overlay.toast.text, '已保存到相册');
  assert.strictEqual(named(g, 'save_image')[0].props.result, 'saved');
  assert.strictEqual(named(g, 'save_image')[0].props.mode, 'free');
  assert.ok(g.log.calls.every((c) => !/authorize/.test(c)), 'the app never calls wx.authorize for the album');
});

test('save to album denied: permission sheet with 去设置, openSetting only on its tap, no re-prompt, play unaffected (AC 83)', async (t) => {
  const g = await startUp(t, { now: FRIDAY, album: { saveErr: { errMsg: 'saveImageToPhotosAlbum:fail auth deny', errno: 103 } } });
  await freeRun(g);
  hit(g, 'result:save');
  await g.settle();
  let ov = view(g).overlay;
  assert.strictEqual(ov.albumDenied, true, 'overlay.albumDenied: 保存图片需要相册权限 with 去设置 / 取消');
  assert.ok(g.ids().includes('album:openSetting') && g.ids().includes('album:cancel'));
  assert.strictEqual(view(g).vm.saveImage.state, 'denied');
  assert.strictEqual(calls(g, /^openSetting/).length, 0, 'no automatic settings page');
  assert.strictEqual(named(g, 'save_image')[0].props.result, 'scopeDenied');
  hit(g, 'album:cancel');
  assert.ok(!view(g).overlay.albumDenied);
  assert.strictEqual(calls(g, /^openSetting/).length, 0);
  // the scope is now refused: the next tap shows the sheet directly, with no save attempt
  const saves = calls(g, /saveImageToPhotosAlbum/).length;
  g.app.ctl.state.res.saveState = 'idle';
  g.log.calls.length = 0;
  const g2 = await startUp(t, { now: FRIDAY, album: { scope: false } });
  await freeRun(g2);
  hit(g2, 'result:save');
  await g2.settle();
  assert.strictEqual(view(g2).overlay.albumDenied, true, 'sheet shown directly');
  assert.strictEqual(calls(g2, /saveImageToPhotosAlbum/).length, 0);
  g2.tapId('album:openSetting');
  await g2.settle();
  assert.strictEqual(calls(g2, /^openSetting/).length, 1, 'settings opened on the tap only');
  assert.ok(!view(g2).overlay.albumDenied);
  assert.ok(saves >= 1);
  // free play still available
  hit(g2, 'result:again');
  assert.strictEqual(view(g2).screen, 'draft');
});

test('save to album: privacy refusal (104) takes the same sheet; a daily card carries no general names', async (t) => {
  const g = await startUp(t, { now: FRIDAY, album: { saveErr: { errno: 104, errMsg: 'privacy' } } });
  g.tapId('home:daily');
  await playDraft(g);
  await g.settle();
  g.tapId('result:skip');
  await g.settle();
  const card = require('../js/vm').cardVm(g.app.ctl.state.res, g.app.ctl.state.r.run.content);
  assert.ok(card.lineup.every((e) => e.name === '' && e.monogram === ''));
  assert.ok(card.footer.indexOf('点将台') >= 0);
  hit(g, 'result:save');
  await g.settle();
  assert.strictEqual(view(g).overlay.albumDenied, true);
  assert.strictEqual(named(g, 'save_image')[0].props.result, 'privacyDenied');
  assert.strictEqual(named(g, 'save_image')[0].props.mode, 'daily');
});

test('subscribe hidden: no template id means no offer and requestSubscribeMessage is never called (AC 84)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  await freeRun(g);
  g.tapId('result:challenge');
  await g.settle();
  assert.strictEqual(view(g).vm.subscribe.state, 'hidden');
  hit(g, 'result:subscribe'); // a stray id does nothing
  await g.settle();
  assert.strictEqual(calls(g, /requestSubscribeMessage/).length, 0);
  assert.strictEqual(named(g, 'subscribe_offer').length, 0);
  assert.strictEqual(g.app.ctl.state.features.subscribe, null);
});

test('subscribe shown: offered only after 发起挑战, requested only from the tap; accept stores one grant, never repeats (AC 84)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.app.api.mock.appConfig = { subscribe: { tmplId: 'TMPL1' } };
  await g.app.ctl.refreshDaily();
  await freeRun(g);
  assert.strictEqual(view(g).vm.subscribe.state, 'hidden', 'not offered before a challenge exists');
  assert.strictEqual(calls(g, /requestSubscribeMessage/).length, 0);
  g.tapId('result:challenge');
  await g.settle();
  let sub = view(g).vm.subscribe;
  assert.strictEqual(sub.state, 'offer');
  assert.ok(/^[0-9A-Z]{8}$/.test(sub.challengeId));
  assert.strictEqual(named(g, 'subscribe_offer').length, 1);
  assert.strictEqual(named(g, 'subscribe_offer')[0].props.where, 'result');
  assert.strictEqual(calls(g, /requestSubscribeMessage/).length, 0, 'offering is not requesting');
  hit(g, 'result:subscribe');
  await g.settle();
  assert.strictEqual(calls(g, /requestSubscribeMessage/).length, 1);
  assert.strictEqual(g.log.calls.find((c) => /requestSubscribeMessage/.test(c)), 'requestSubscribeMessage:["TMPL1"]');
  assert.strictEqual(view(g).vm.subscribe.state, 'granted');
  assert.strictEqual(Object.keys(g.app.api.mock.db.grants).length, 1);
  assert.strictEqual(named(g, 'subscribe_result')[0].props.result, 'accept');
  hit(g, 'result:subscribe'); // repeat taps do nothing
  await g.settle();
  assert.strictEqual(calls(g, /requestSubscribeMessage/).length, 1);
  assert.strictEqual(Object.keys(g.app.api.mock.db.grants).length, 1);
  // the own-challenge screen shows the passive granted state
  g.app.ctl.onShow({ scene: 1007, query: { c: sub.challengeId } });
  await g.settle();
  assert.strictEqual(view(g).vm.status, 'own');
  assert.strictEqual(view(g).vm.subscribe.state, 'granted');
});

test('subscribe reject and ban: nothing stored, not offered again for that challenge; ban hides the offer on this device (AC 84)', async (t) => {
  const g = await startUp(t, { now: FRIDAY, subscribe: { result: 'reject' } });
  g.app.api.mock.appConfig = { subscribe: { tmplId: 'T2' } };
  await g.app.ctl.refreshDaily();
  await freeRun(g);
  g.tapId('result:challenge');
  await g.settle();
  const id = view(g).vm.subscribe.challengeId;
  hit(g, 'result:subscribe');
  await g.settle();
  assert.strictEqual(view(g).vm.subscribe.state, 'declined');
  assert.strictEqual(Object.keys(g.app.api.mock.db.grants).length, 0);
  assert.strictEqual(g.app.store.state.subscribe.declined[id], true);
  // own-challenge screen: the offer is gone for this challenge
  g.app.ctl.onShow({ scene: 1007, query: { c: id } });
  await g.settle();
  assert.notStrictEqual(view(g).vm.subscribe.state, 'offer');
  // ban (20004): hidden on this device from now on
  const b = await startUp(t, { now: FRIDAY, subscribe: { failCode: 20004 } });
  b.app.api.mock.appConfig = { subscribe: { tmplId: 'T3' } };
  await b.app.ctl.refreshDaily();
  await freeRun(b);
  b.tapId('result:challenge');
  await b.settle();
  hit(b, 'result:subscribe');
  await b.settle();
  assert.strictEqual(b.app.store.state.subscribe.banned, true);
  assert.strictEqual(Object.keys(b.app.api.mock.db.grants).length, 0);
  assert.strictEqual(named(b, 'subscribe_result')[0].props.result, 'ban');
  hit(b, 'result:again');
  await playDraft(b);
  b.tapId('result:skip');
  await b.settle();
  b.tapId('result:challenge');
  await b.settle();
  assert.strictEqual(view(b).vm.subscribe.state, 'hidden', 'not offered again on this device');
});

test('display modes: large text and high contrast are saved, combine, reach every screen vm and the layout, and need no restart (AC 89, 90)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  assert.deepStrictEqual(view(g).vm.display, { largeText: false, highContrast: false, scale: 1, palette: 'standard' });
  hit(g, 'settings:largeText');
  assert.deepStrictEqual(view(g).vm.display, { largeText: true, highContrast: false, scale: 1.25, palette: 'standard' });
  assert.strictEqual(view(g).vm.settings.largeText, true);
  hit(g, 'settings:highContrast');
  assert.deepStrictEqual(view(g).vm.display, { largeText: true, highContrast: true, scale: 1.25, palette: 'highContrast' });
  const ev = named(g, 'display_setting');
  assert.strictEqual(ev.length, 2);
  assert.deepStrictEqual([ev[1].props.largeText, ev[1].props.highContrast, ev[1].props.source], [true, true, 'user']);
  // every screen carries it
  g.tapId('home:free');
  assert.strictEqual(view(g).vm.display.palette, 'highContrast');
  await playDraft(g);
  g.tapId('result:skip');
  assert.strictEqual(view(g).screen, 'result');
  assert.strictEqual(view(g).vm.display.largeText, true);
  hit(g, 'result:back');
  hit(g, 'home:history');
  await g.settle();
  assert.strictEqual(view(g).vm.display.largeText, true);
  hit(g, 'history:back');
  hit(g, 'home:friendBoard');
  await g.settle();
  assert.strictEqual(view(g).screen, 'board');
  assert.strictEqual(view(g).vm.display.highContrast, true);
  // persisted across launches
  const g2 = boot(t, { storage: g.storage, now: FRIDAY });
  await g2.settle();
  assert.deepStrictEqual(view(g2).vm.display, { largeText: true, highContrast: true, scale: 1.25, palette: 'highContrast' });
  // switching off again
  hit(g2, 'settings:largeText');
  hit(g2, 'settings:highContrast');
  assert.deepStrictEqual(view(g2).vm.display, { largeText: false, highContrast: false, scale: 1, palette: 'standard' });
  // shared cards never change with the display mode
  const vmMod = require('../js/vm');
  assert.deepStrictEqual(Object.keys(vmMod.cardVm({ mode: 'free', record: { w: 1, l: 11 }, band: { label: 'x' }, lineupDetail: [], battles: [] }, g2.app.ctl.state.r ? g2.app.ctl.state.r.run.content : require('../core/content').getContent(require('../core/content').LATEST_CONTENT_VERSION))).indexOf('display'), -1);
});

test('display: a large system font pre-selects 大字模式 on the first launch only', async (t) => {
  const g = await startUp(t, { now: FRIDAY, fontSize: 20 });
  assert.strictEqual(view(g).vm.display.largeText, true);
  assert.strictEqual(named(g, 'display_setting')[0].props.source, 'auto_first_launch');
  hit(g, 'settings:largeText'); // the player can turn it off
  assert.strictEqual(view(g).vm.display.largeText, false);
  const g2 = boot(t, { storage: g.storage, now: FRIDAY, fontSize: 20 });
  await g2.settle();
  assert.strictEqual(view(g2).vm.display.largeText, false, 'not forced again');
  const n = await startUp(t, { now: FRIDAY });
  assert.strictEqual(view(n).vm.display.largeText, false);
  assert.strictEqual(named(n, 'display_setting').length, 0);
});

test('remote config: banner is off by default, on only for board ready/empty states; interstitial caps follow the config (AC 91, 92)', async (t) => {
  const g = await startUp(t, { now: FRIDAY, privacy: { state: 'agreed', scope: true } });
  assert.strictEqual(g.app.ctl.state.features.banner.enabled, false);
  hit(g, 'home:friendBoard');
  await g.settle();
  assert.strictEqual(view(g).vm.state, 'empty');
  assert.deepStrictEqual(view(g).vm.banner, { show: false, reservedHeight: 0, stub: false });
  assert.strictEqual(g.log.ads.filter((a) => a[0] === 'banner').length, 0, 'no createBannerAd when off');
  hit(g, 'board:back');
  g.app.api.mock.appConfig = { ads: { banner: { enabled: true, adUnitId: 'adunit-1' }, interstitial: { everyNRuns: 4, maxPerDay: 3, minGapSec: 10, minLifetimeRuns: 1 } } };
  await g.app.ctl.refreshDaily();
  assert.strictEqual(view(g).vm.display.palette, 'standard');
  assert.strictEqual(view(g).screen, 'home');
  assert.ok(!('banner' in view(g).vm), 'no banner on home');
  hit(g, 'home:friendBoard');
  await g.settle();
  const b = view(g).vm.banner;
  assert.strictEqual(b.show, true);
  assert.ok(b.reservedHeight > 0);
  assert.strictEqual(b.stub, true, 'ad stub mode: the renderer draws the grey test bar, no native banner');
  // leaving the board removes it
  hit(g, 'board:back');
  assert.ok(!('banner' in view(g).vm));
  // interstitial caps: clamped (minGapSec >= 60), everyNRuns 4
  const f = g.app.ctl.state.features.interstitial;
  assert.deepStrictEqual([f.everyNRuns, f.maxPerDay, f.minGapSec, f.minLifetimeRuns], [4, 3, 60, 2]);
  assert.strictEqual(g.app.ads.interstitialConfig().everyNRuns, 4);
});

test('remote config unreadable (getDaily failing, or app_config missing): safe defaults, no error shown, still playable (AC 94)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.app.api.mock.appConfig = { subscribe: { tmplId: 'X' }, ads: { banner: { enabled: true, adUnitId: 'u' } } };
  await g.app.ctl.refreshDaily();
  assert.ok(g.app.ctl.state.features.subscribe && g.app.ctl.state.features.banner.enabled);
  g.app.api.mock.offline = true;
  await g.app.ctl.refreshDaily();
  const f = g.app.ctl.state.features;
  assert.strictEqual(f.subscribe, null);
  assert.strictEqual(f.banner.enabled, false);
  assert.deepStrictEqual(f.interstitial, { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 });
  assert.ok(!view(g).overlay.toast && !view(g).overlay.dialog, 'no error UI for the config');
  g.tapId('home:free');
  assert.ok(g.has('primary'));
  const m = await startUp(t, { now: FRIDAY });
  m.app.api.mock.appConfig = null;
  await m.app.ctl.refreshDaily();
  assert.strictEqual(m.app.ctl.state.features.subscribe, null);
});

test('analytics: v1 events fire with their props and a top-level session id (AC 93)', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.tapId('home:daily');
  await playDraft(g);
  await g.settle();
  g.tapId('result:skip');
  await g.settle();
  const pick = named(g, 'draft_pick')[0].props;
  assert.ok(pick.pickFaction && pick.poolSize >= 1 && pick.poolTotal >= pick.poolSize);
  assert.strictEqual(named(g, 'run_start')[0].props.variant, 'standard');
  const rc = named(g, 'run_complete')[0].props;
  assert.strictEqual(rc.variant, 'standard');
  assert.strictEqual(typeof rc.multiAppearancePicks, 'number');
  assert.strictEqual(named(g, 'round_fetch').length, 5);
  assert.ok(named(g, 'draft_pick').every((e) => e.props.sessionId));
  assert.ok(g.app.analytics.EVENTS.includes('save_image') && g.app.analytics.EVENTS.includes('subscribe_result'));
  for (const n of ['round_fetch', 'shiren_reveal', 'streak_shown', 'history_view', 'history_issue_view', 'save_image', 'subscribe_offer', 'subscribe_result', 'display_setting']) {
    assert.ok(g.app.analytics.EVENTS.includes(n), n);
  }
});

test('a renderer that cannot draw a newer view model falls back to the stub instead of a black screen', async (t) => {
  const g = await startUp(t, { now: SUNDAY });
  g.tapId('home:daily');
  await flipRound(g);
  const text = g.frame();
  assert.ok(text.length > 0, 'something is drawn');
  assert.ok(g.app.hits.some((h) => h.id === 'primary' || h.id.indexOf('pool:') === 0), 'the draft stays playable');
});
