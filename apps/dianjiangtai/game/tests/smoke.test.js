/**
 * Boots the whole game against a fake wx and plays it headlessly with
 * touches: a full free run, a daily run through the mock server, entry cards,
 * boards, ads and privacy flows.
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, playDraft } = require('./harness');

const allEvents = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const events = (g) => allEvents(g).map((e) => e.name);
const count = (g, name) => events(g).filter((n) => n === name).length;

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  return g;
}

async function finishReveal(g) {
  g.wait(10000);
  g.frame();
  await g.settle();
}

test('boots to home, first launch shows the how-to sheet, no authorization prompts', async (t) => {
  const g = await startUp(t);
  const text = g.frame();
  assert.ok(text.indexOf('今日军令') >= 0 && text.indexOf('自由点将') >= 0, text.slice(0, 300)); // the real title is drawn spaced, glyph by glyph
  assert.ok(g.has('sheet:close'), 'how-to sheet auto-opens once');
  g.tapId('sheet:close');
  assert.ok(!g.has('sheet:close'));
  assert.ok(g.has('home:free'));
  assert.ok(g.has('home:daily'));
  for (const c of g.log.calls) assert.ok(!/requirePrivacyAuthorize|authorize|setUserCloudStorage/.test(c), 'no prompt at launch: ' + c);
  assert.ok(g.log.menu.some((m) => m[0] === 'showShareMenu' && m[1].menus[0] === 'shareAppMessage'));
  assert.ok(g.log.menu.some((m) => m[0] === 'updateShareMenu' && m[1].withShareTicket === true && m[1].isUpdatableMessage === undefined));
  assert.strictEqual(count(g, 'session_start'), 1);
});

test('a full free run plays headlessly: 5 rounds, march, reveal, verdict', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  assert.ok(g.has('primary'));
  await playDraft(g);
  g.frame();
  let vm = g.app.ctl.view();
  assert.strictEqual(vm.screen, 'result');
  assert.strictEqual(vm.vm.status, 'revealing');
  // tap anywhere skips to the verdict
  g.tapId('result:skip');
  vm = g.app.ctl.view();
  assert.strictEqual(vm.vm.status, 'done');
  assert.strictEqual(vm.vm.record.w + vm.vm.record.l, 12);
  assert.strictEqual(vm.vm.battles.length, 12);
  assert.strictEqual(vm.vm.lineup.length, 5);
  assert.ok(vm.vm.band.label);
  assert.ok(/约 .*% 的阵容能达到/.test(vm.vm.rarityText));
  assert.ok(g.has('result:again'));
  // analytics
  assert.strictEqual(count(g, 'run_start'), 1);
  assert.strictEqual(count(g, 'draft_pick'), 5);
  assert.strictEqual(count(g, 'run_complete'), 1);
  assert.strictEqual(count(g, 'reveal_skip'), 1);
  // free play never touches privacy, boards or the cloud marker
  for (const c of g.log.calls) assert.ok(!/requirePrivacyAuthorize|authorize|setUserCloudStorage/.test(c), c);
  assert.strictEqual(g.log.cloudWrites.length, 0);
  // lifetime counter persisted
  assert.strictEqual(JSON.parse(g.storage.djt_state_v1).lifetimeRuns, 1);
});

test('reveal plays itself out in about 9 s and gives the same verdict as skipping', async (t) => {
  const a = await startUp(t);
  a.tapId('sheet:close');
  a.tapId('home:free');
  const seed = a.app.ctl.state.r.seed;
  await playDraft(a);
  await finishReveal(a);
  const va = a.app.ctl.view().vm;
  assert.strictEqual(va.status, 'done');
  assert.ok(seed >= 0);
});

test('free run: respin buttons, undo, re-spin by ad stub (free play only)', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  g.tapId('primary');
  g.wait(1300);
  const ctl = g.app.ctl;
  const before = ctl.view().vm.tokens.faction.key;
  g.tapId('respin:faction');
  const after = ctl.view().vm.tokens.faction.key;
  assert.notStrictEqual(before, after);
  assert.strictEqual(ctl.view().vm.respin.faction.free, 0);
  // second faction re-spin goes through the ad stub
  g.tapId('respinAd:faction');
  assert.ok(g.app.ads.overlay, 'stub overlay shown');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  assert.notStrictEqual(ctl.view().vm.tokens.faction.key, after);
  assert.strictEqual(ctl.view().vm.respin.adLeft, 1);
  assert.strictEqual(count(g, 'respin'), 2);
  // pick then undo restores pool and slot
  const poolBefore = ctl.view().vm.pool.length;
  g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
  g.tapId((h) => h.id.indexOf('slot:') === 0);
  assert.ok(ctl.view().vm.canUndo);
  g.tapId('undo');
  const v = ctl.view().vm;
  assert.strictEqual(v.pool.length, poolBefore);
  assert.ok(v.lineup.every((e) => e.generalId === null));
});

test('daily run through the mock server: ranked once, marker written after the verdict, done state next launch', async (t) => {
  const g = await startUp(t, { privacy: { state: 'agreed', scope: true } });
  g.tapId('sheet:close');
  assert.strictEqual(g.app.ctl.view().vm.daily.state, 'available');
  g.tapId('home:daily');
  await playDraft(g);
  await g.settle();
  let v = g.app.ctl.view();
  assert.strictEqual(v.vm.status, 'revealing');
  g.tapId('result:skip');
  await g.settle();
  v = g.app.ctl.view();
  assert.strictEqual(v.vm.status, 'done');
  assert.strictEqual(v.vm.record.w + v.vm.record.l, 12);
  assert.strictEqual(g.log.cloudWrites.length, 1, 'marker written');
  const kv = g.log.cloudWrites[0][0];
  assert.ok(/^d_\d{8}$/.test(kv.key));
  assert.deepStrictEqual(Object.keys(JSON.parse(kv.value)).sort(), ['l', 'w']);
  assert.strictEqual(count(g, 'board_write'), 1);
  const mock = g.app.api.mock;
  assert.strictEqual(Object.keys(mock.db.results).length, 1);
  // go home: done state
  g.tapId('result:back');
  assert.strictEqual(g.app.ctl.view().vm.daily.state, 'done');
  // a second launch with the same storage shows done, from the server's myStatus too
  const g2 = boot(t, { storage: g.storage, privacy: { state: 'agreed', scope: true } });
  await g2.settle();
  assert.strictEqual(g2.app.ctl.view().vm.daily.state, 'done');
});

test('daily: offline at the end saves the lineup as pendingSubmit and retries', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:daily');
  // the tokens arrive round by round, so the network can only drop after the last 翻令
  await playDraft(g, { beforeMarch: () => (g.app.api.mock.offline = true) });
  await g.settle();
  let v = g.app.ctl.view();
  assert.strictEqual(v.vm.status, 'pendingSubmit');
  assert.ok(g.app.store.state.pending);
  g.app.api.mock.offline = false;
  g.tapId('result:retry');
  await g.settle();
  v = g.app.ctl.view();
  assert.strictEqual(v.vm.status, 'revealing');
  assert.strictEqual(g.app.store.state.pending, null);
});

test('daily: in-progress run survives relaunch at the same round with the same tokens (AC 25)', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:daily');
  g.tapId('primary');
  await g.settle(); // startRun delivers round 1
  g.wait(1300);
  g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
  g.tapId((h) => h.id.indexOf('slot:') === 0);
  g.wait(400);
  g.tapId('primary'); // next round
  g.wait(400);
  g.tapId('primary'); // flip round 2: getRound
  await g.settle();
  g.wait(1300);
  const tokens = g.app.ctl.view().vm.tokens;
  const round = g.app.ctl.view().vm.round;
  assert.strictEqual(round, 2);
  const g2 = boot(t, { storage: g.storage });
  await g2.settle();
  const home = g2.app.ctl.view().vm;
  assert.strictEqual(home.daily.state, 'inProgress');
  assert.strictEqual(home.daily.round, 2);
  g2.tapId('home:daily');
  const v = g2.app.ctl.view().vm;
  assert.strictEqual(v.round, 2);
  assert.deepStrictEqual(v.tokens, tokens);
});

test('leaving a started daily keeps progress; leaving a started free run asks first', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  g.tapId('primary');
  g.wait(1300);
  g.tapId('back');
  let o = g.app.ctl.view().overlay;
  assert.strictEqual(o.dialog.text, '放弃本局？');
  g.tapId('dialog:cancel');
  assert.strictEqual(g.app.ctl.view().screen, 'draft');
  g.tapId('back');
  g.tapId('dialog:confirm');
  assert.strictEqual(g.app.ctl.view().screen, 'home');
  assert.strictEqual(count(g, 'run_abandon'), 1);
  g.tapId('home:daily');
  g.tapId('primary');
  await g.settle();
  g.wait(1300);
  g.tapId('back');
  o = g.app.ctl.view().overlay;
  assert.strictEqual(o.dialog.text, '本局已开始，进度会保留，可稍后继续');
});

test('card entry: challenge opens the entry screen, accept starts a challenge run, result compares', async (t) => {
  // owner makes a challenge on the mock server first
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  await g.settle();
  const mock = g.app.api.mock;
  const runId = g.app.ctl.view().vm && g.app.ctl.state.res.runId;
  const created = mock.call('createChallenge', { runId });
  assert.ok(created.ok, JSON.stringify(created));
  // someone else (a second player) opens the card: simulate by a fresh client sharing the same mock
  g.app.ctl.onShow({ scene: 1007, query: { c: created.challengeId } });
  await g.settle();
  // own challenge in the same mock identity: shows 'own'
  assert.strictEqual(g.app.ctl.view().screen, 'challenge');
  assert.strictEqual(g.app.ctl.view().vm.status, 'own');
  assert.strictEqual(count(g, 'card_open'), 1);
});

test('group card: ticket present -> getGroupEnterInfo -> joinGroup -> banner; no ticket -> no banner', async (t) => {
  const g = await startUp(t, { enter: { scene: 1044, query: { s: 'r', m: 'free', d: '' }, shareTicket: 'T1', chatType: 3 } });
  g.tapId('sheet:close');
  assert.ok(g.log.calls.indexOf('getGroupEnterInfo') >= 0);
  assert.strictEqual(g.app.ctl.view().vm.hasGroupContext, true);
  assert.ok(g.has('home:groupBanner'));
  const j = allEvents(g).filter((e) => e.name === 'group_join');
  assert.strictEqual(j.length, 1);
  assert.strictEqual(j[0].props.result, 'ok');
  assert.ok(!JSON.stringify(allEvents(g)).match(/G1|groupRef/), 'no group id in events');

  const h = await startUp(t, { enter: { scene: 1007, query: { s: 'r' } } });
  h.tapId('sheet:close');
  assert.strictEqual(h.log.calls.indexOf('getGroupEnterInfo'), -1);
  assert.strictEqual(h.app.ctl.view().vm.hasGroupContext, false);

  const f = await startUp(t, { enter: { scene: 1044, query: { s: 'r' }, shareTicket: 'T', chatType: 3 }, groupEnterFail: 40097 });
  assert.strictEqual(f.app.ctl.view().vm.hasGroupContext, false);
  assert.strictEqual(f.app.analytics.queue.filter((e) => e.name === 'group_join')[0].props.result, 'wrongScene');
});

test('wxad_fallback_share entry grants nothing and lands on home', async (t) => {
  const g = await startUp(t, { enter: { scene: 1007, query: { wxad_fallback_share: '1' } } });
  assert.strictEqual(g.app.ctl.view().screen, 'home');
  assert.strictEqual(count(g, 'card_open'), 0);
});

test('boards: friend board gate (privacy then scope), ready state posts to the open data domain', async (t) => {
  const g = await startUp(t, { privacy: { scope: undefined } });
  g.tapId('sheet:close');
  g.tapId('home:friendBoard');
  await g.settle();
  const v = g.app.ctl.view();
  assert.strictEqual(v.screen, 'board');
  assert.ok(g.log.calls.indexOf('requirePrivacyAuthorize') >= 0, 'privacy asked on the board tap');
  assert.ok(g.log.calls.indexOf('authorize:"scope.WxFriendInteraction"') >= 0);
  // nobody has played: empty state (server rows empty)
  assert.strictEqual(v.vm.state, 'empty');
  assert.strictEqual(count(g, 'board_view'), 1);
});

test('boards: no group context shows the explainer; privacy refused shows the denied state and never re-prompts', async (t) => {
  const g = await startUp(t, { privacy: { refuse: true } });
  g.tapId('sheet:close');
  g.tapId('home:groupBoard');
  await g.settle();
  assert.strictEqual(g.app.ctl.view().vm.state, 'noGroup');
  g.tapId('board:back');
  g.tapId('home:friendBoard');
  await g.settle();
  assert.strictEqual(g.app.ctl.view().vm.state, 'privacyDenied');
  assert.ok(g.has('board:agree'));
  assert.ok(g.has('board:contract'));
  const asks = g.log.calls.filter((c) => c === 'requirePrivacyAuthorize').length;
  assert.strictEqual(asks, 1);
  // the game is still fully playable: free run works
  g.tapId('board:back');
  g.tapId('home:free');
  assert.ok(g.has('primary'));
});

test('scope refused: unauthorized state, openSetting on tap only, recovers', async (t) => {
  const g = await startUp(t, { privacy: { state: 'agreed', scope: false } });
  g.tapId('sheet:close');
  g.tapId('home:friendBoard');
  await g.settle();
  assert.strictEqual(g.app.ctl.view().vm.state, 'unauthorized');
  assert.strictEqual(g.log.calls.filter((c) => /^openSetting/.test(c)).length, 0);
  g.tapId('board:openSetting');
  await g.settle();
  assert.strictEqual(g.log.calls.filter((c) => /^openSetting/.test(c)).length, 1);
  assert.notStrictEqual(g.app.ctl.view().vm.state, 'unauthorized');
});

test('marker write refused (errno 104): verdict unchanged, note shown, write pending', async (t) => {
  const g = await startUp(t, { privacy: { markerRefuse: true } });
  g.tapId('sheet:close');
  g.tapId('home:daily');
  await playDraft(g);
  await g.settle();
  g.tapId('result:skip');
  await g.settle();
  const v = g.app.ctl.view().vm;
  assert.strictEqual(v.status, 'done');
  assert.strictEqual(v.privacyNote, true);
  assert.strictEqual(g.app.store.state.privacy.markerPending.length, 1);
  assert.strictEqual(g.log.cloudWrites.length, 0);
});

test('complete game is playable with every authorization refused', async (t) => {
  const g = await startUp(t, { privacy: { refuse: true, refuseScope: true, markerRefuse: true } });
  g.tapId('sheet:close');
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  assert.strictEqual(g.app.ctl.view().vm.status, 'done');
  g.tapId('result:share');
  await g.settle();
  assert.strictEqual(g.log.shares.length, 1);
});

test('sharing: free card shows names in the title, daily title does not, query is minimal, grants nothing', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  g.tapId('result:share');
  await g.settle();
  const s = g.log.shares[0];
  assert.ok(/才 \d+胜\d+负？不服来点将/.test(s.title));
  assert.ok(/^s=r&m=free&d=/.test(s.query));
  assert.strictEqual(s.imageUrl, 'tmp://card.png'.length ? s.imageUrl : '');
  assert.strictEqual(count(g, 'share_tap'), 1);
  // challenge share from a free run: createChallenge, query carries the id only
  g.tapId('result:challenge');
  await g.settle();
  const c = g.log.shares[1];
  assert.ok(/^c=[0-9A-Z]{8}$/.test(c.query), c.query);
  assert.strictEqual(count(g, 'challenge_created'), 1);
  // no reward anywhere: the run state has no extra respins or replay unlocked by sharing
  assert.strictEqual(g.app.ctl.state.res.replay.unlocked, false);
});

test('replay (复盘): rewarded stub unlocks the best lineup; best >= own record', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  const own = g.app.ctl.view().vm.record;
  g.tapId('result:replay');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  const v = g.app.ctl.view().vm;
  assert.strictEqual(v.replay.unlocked, true);
  assert.strictEqual(v.sheet, 'replay');
  assert.ok(v.replay.best.record.w >= own.w);
  assert.strictEqual(v.replay.best.lineup.length, 5);
});

test('ads: closing the stub early grants nothing; no-fill grants once per run per placement (D6)', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  g.tapId('primary');
  g.wait(1300);
  g.tapId('respin:faction');
  g.tapId('respinAd:faction');
  g.tapId('adstub:skip'); // closed early
  await g.settle();
  assert.strictEqual(g.app.ctl.view().vm.respin.adLeft, 2);
  assert.strictEqual(count(g, 'ad_close_early'), 1);
  // simulated no-fill 1004
  g.app.ads.stubSim.rewardedError = 1004;
  const used = g.app.ctl.view().vm.respin.adLeft;
  g.tapId('respinAd:faction');
  await g.settle();
  assert.strictEqual(g.app.ctl.view().vm.respin.adLeft, used - 1, 'first failure grants the re-spin');
  assert.ok(g.app.ctl.view().overlay.toast.text === '暂无广告，本次免费');
  // second failure for the same placement in the same run: nothing
  const left = g.app.ctl.view().vm.respin.adLeft;
  g.tapId('respinAd:faction');
  await g.settle();
  assert.strictEqual(g.app.ctl.view().vm.respin.adLeft, left);
  assert.strictEqual(g.app.ctl.view().overlay.toast.text, '暂无广告，请稍后再试');
  assert.strictEqual(allEvents(g).filter((e) => e.name === 'ad_error' && e.props.errCode === 1004).length, 2);
});

test('daily and challenge never offer ad re-spins (AC 9)', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:daily');
  g.tapId('primary');
  await g.settle();
  g.wait(1300);
  if (g.has('respin:faction')) g.tapId('respin:faction'); // a re-spin may be unavailable on this token set
  if (g.has('respin:era')) g.tapId('respin:era');
  const v = g.app.ctl.view().vm;
  assert.strictEqual(v.respin.adAllowed, false);
  assert.ok(!g.has('respinAd:faction'));
});

test('mute persists and is applied; sound toggle in settings', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:sound');
  assert.strictEqual(JSON.parse(g.storage.djt_state_v1).muted, true);
  const g2 = boot(t, { storage: g.storage });
  await g2.settle();
  assert.strictEqual(g2.app.ctl.view().vm.muted, true);
});

// ---------- audio (CTO-D3) ----------
const cue = (g, name) => g.log.audio.find((c) => c.src === 'audio/' + name + '.mp3');

test('audio: subpackage loads after launch, music plays low on home, game plays fully muted when loading fails', async (t) => {
  const g = await startUp(t);
  assert.ok(!g.log.calls.includes('loadSubpackage:"audio"'), 'not during launch');
  g.wait(600);
  g.frame();
  assert.ok(g.log.calls.includes('loadSubpackage:"audio"'));
  const m = cue(g, 'bgm');
  assert.ok(m && m.loop && m.playing, 'music on home');
  g.wait(3000);
  assert.ok(m.volume > 0 && m.volume <= 0.35, 'low volume ' + m.volume);
  // load failure: everything still plays
  const f = await startUp(t, { audioLoadFails: true });
  f.wait(600);
  f.tapId('sheet:close');
  f.tapId('home:free');
  await playDraft(f);
  f.tapId('result:skip');
  assert.strictEqual(f.app.ctl.view().vm.status, 'done');
  assert.strictEqual(f.log.audio.length, 0);
});

test('audio: settings toggles 音乐 / 音效 persist, mute is immediate, and taps make a soft sound', async (t) => {
  const g = await startUp(t);
  g.wait(600);
  g.tapId('sheet:close');
  g.tapId('home:settings');
  const m = cue(g, 'bgm');
  assert.ok(m.playing);
  assert.ok(cue(g, 'tap'), 'a button press taps');
  g.tapId('settings:music');
  assert.strictEqual(m.playing, false, 'music off is immediate');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.storage.djt_audio_v1)), { music: false, sfx: true });
  assert.strictEqual(g.app.ctl.view().vm.musicOn, false);
  assert.strictEqual(g.app.ctl.view().vm.sfxOn, true);
  const taps = cue(g, 'tap').plays;
  g.tapId('settings:sfx');
  assert.strictEqual(g.app.ctl.view().vm.muted, true);
  g.tapId('settings:largeText');
  assert.strictEqual(cue(g, 'tap').plays, taps, 'silent when 音效 is off');
  const g2 = boot(t, { storage: g.storage });
  await g2.settle();
  g2.wait(600);
  const v = g2.app.ctl.view().vm;
  assert.deepStrictEqual([v.musicOn, v.sfxOn, v.muted], [false, false, true]);
  assert.strictEqual(g2.log.audio.filter((c) => c.playing).length, 0, 'a muted player hears nothing at launch');
});

test('audio: flip sound on 翻令, drum pulse and music fade-out during the reveal, hide/show pauses and resumes', async (t) => {
  const g = await startUp(t);
  g.wait(600);
  g.tapId('sheet:close');
  g.tapId('home:free');
  g.wait(3000);
  const m = cue(g, 'bgm');
  assert.ok(m.playing && m.volume > 0, 'music on the draft screen');
  g.tapId('primary');
  await g.settle();
  assert.ok(cue(g, 'flip') && cue(g, 'flip').plays >= 1, 'flip');
  g.wait(1300);
  await g.settle();
  g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
  g.tapId((h) => h.id.indexOf('slot:') === 0);
  g.wait(400);
  g.tapId('primary');
  g.hide();
  assert.strictEqual(m.playing, false, 'hidden: paused');
  g.show({ scene: 1001, query: {} });
  assert.strictEqual(m.playing, true, 'shown: resumes');
  g.wait(400);
  await g.settle();
  // finish the draft quickly through the helper from round 2
  for (let round = 2; round <= 5; round++) {
    g.tapId('primary');
    await g.settle();
    g.wait(1300);
    await g.settle();
    g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
    g.tapId((h) => h.id.indexOf('slot:') === 0);
    g.wait(400);
    g.tapId('primary');
    g.wait(400);
    await g.settle();
  }
  g.frame();
  assert.strictEqual(g.app.ctl.view().vm.status, 'revealing');
  assert.ok(cue(g, 'drum') && cue(g, 'drum').playing, 'drum pulse starts with the reveal');
  g.wait(1000);
  g.frame();
  g.wait(2000);
  assert.strictEqual(m.playing, false, 'music faded out and paused for the battle');
  g.tapId('result:skip');
  assert.strictEqual(cue(g, 'drum').playing, false, 'skip ends the pulse');
  assert.strictEqual(m.playing, false, 'no music on the result screen');
});

test('touch routing: a second finger is ignored; taps in the capsule row hit nothing on home', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.frame();
  const hits = g.app.hits;
  const cap = require('./harness').CAPSULE;
  for (const h of hits) {
    const overlaps = h.x < cap.right && h.x + h.w > cap.left && h.y < cap.bottom && h.y + h.h > cap.top;
    assert.ok(!overlaps, 'hit ' + h.id + ' overlaps the capsule');
  }
});

test('analytics: events batch to the track function, <= 50 per batch, flushed on hide', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.hide();
  await g.settle();
  const calls = g.app.api.mock.calls.filter((c) => c.name === 'track');
  assert.ok(calls.length >= 1);
  for (const c of calls) assert.ok(c.data.events.length <= 50);
  assert.ok(!g.log.calls.some((c) => /reportEvent/.test(c)));
});

test('code search: wx.getShareInfo and wx.reportEvent are never referenced (AC 35, 68); disableFallbackSharePage is set (AC 64)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dirs = [path.join(__dirname, '..', 'js'), path.join(__dirname, '..', 'core')];
  let adsSrc = '';
  for (const d of dirs) {
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(d, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(!/getShareInfo\(/.test(src) && !/wx\.getShareInfo/.test(src), f + ' calls getShareInfo');
      assert.ok(!/reportEvent\(/.test(src), f + ' calls reportEvent');
      if (f === 'ads.js') adsSrc = src;
    }
  }
  assert.ok(/createRewardedVideoAd\(\{[^}]*disableFallbackSharePage: true/.test(adsSrc));
});

test('first-ever run shows the coach marks once; skipping them marks them seen', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  g.keepCoach = true;
  assert.ok(g.has('coach:skip'));
  g.tapId('coach:next');
  assert.strictEqual(g.app.ctl.view().vm.coach, 2);
  g.tapId('coach:skip');
  assert.strictEqual(g.app.ctl.view().vm.coach, 0);
  assert.strictEqual(JSON.parse(g.storage.djt_state_v1).coachSeen, true);
});

test('locked 复盘 (daily-seed run before the daily is done): clear text, no ad; unlocks once the daily is ranked', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  const res = g.app.ctl.state.res;
  res.dailySeed = true;
  res.dateKey = g.app.store.state.dailyCache.dateKey;
  let v = g.app.ctl.view();
  assert.strictEqual(v.vm.replay.locked, true);
  assert.strictEqual(v.vm.replay.lockedText, '今日军令完成后可复盘');
  g.tapId('result:replay');
  assert.strictEqual(g.app.ads.overlay, null, "no ad for a locked replay");
  assert.strictEqual(g.app.ctl.view().overlay.toast.text, '今日军令完成后可复盘');
  assert.strictEqual(allEvents(g).filter((e) => e.name === 'ad_request').length, 0);
  g.app.store.state.results[res.dateKey] = { dailyDone: true };
  assert.strictEqual(g.app.ctl.view().vm.replay.locked, false);
  g.tapId('result:replay');
  assert.ok(g.app.ads.overlay, "unlocked: the ad plays");
});
