const test = require('node:test');
const assert = require('node:assert');

const { createApi } = require('../js/api');
const { createAds } = require('../js/ads');
const { createAnalytics } = require('../js/analytics');
const { createStore } = require('../js/store');
const { parseEnter, dailyTitle, freeTitle, challengeTitle, resultQuery } = require('../js/share');
const { getConfig } = require('../core/config');
const { beijingDateKey } = require('../core/date');
const V = require('../js/vm');
const draft = require('../core/draft');

const config = getConfig(1);

function mkAds(t, wxExtra, over) {
  const store = createStore(null);
  const events = [];
  const analytics = { track: (n, p) => events.push([n, p]) };
  let clock = Date.UTC(2026, 10, 20, 4, 0, 0);
  const wx = Object.assign({}, wxExtra);
  const ads = createAds(Object.assign({ wx, config, store, analytics, now: () => clock, adUnits: { rewarded: 'r1', interstitial: 'i1' } }, over));
  return { ads, store, events, wx, tick: (ms) => (clock += ms), now: () => clock };
}

function fakeRewarded(wxLog) {
  const h = {};
  return {
    wxLog,
    ad: {
      onClose: (f) => (h.close = f),
      onError: (f) => (h.error = f),
      onLoad: (f) => (h.load = f),
      show: () => (wxLog.showFails ? Promise.reject(new Error('x')) : Promise.resolve()),
      load: () => Promise.resolve(),
    },
    h,
  };
}

test('api cloud mode: resolves ok results, never rejects, maps failures and timeouts', async () => {
  const calls = [];
  const wx = {
    cloud: {
      init: () => {},
      callFunction: (o) => {
        calls.push(o.name);
        if (o.name === 'getDaily') o.success({ result: { ok: true, dateKey: '20261120' } });
        else if (o.name === 'getBoard') o.fail({ errMsg: 'cloud.callFunction:fail' });
        else if (o.name === 'track') o.success({ result: null });
        /* submitRun: never answers -> timeout */
      },
    },
  };
  let timerCb = null;
  const api = createApi({ wx, mode: 'cloud', env: 'x', setTimeout: (f) => ((timerCb = f), 1), clearTimeout() {} });
  assert.deepStrictEqual(await api.getDaily({}), { ok: true, dateKey: '20261120' });
  assert.strictEqual((await api.getBoard({})).code, 'NETWORK');
  assert.strictEqual((await api.track({ events: [] })).code, 'BAD_RESPONSE');
  const p = api.submitRun({});
  timerCb();
  assert.strictEqual((await p).code, 'TIMEOUT');
  assert.deepStrictEqual(api.NAMES.sort(), ['createChallenge', 'getBoard', 'getChallenge', 'getDaily', 'getHistory', 'getReplay', 'getRound', 'joinGroup', 'startRun', 'submitRun', 'subscribeChallenge', 'track']);
});

test('api mock: the daily client gets status only, then one round at a time; never the seed, battles or best lineup (AC 19, 86)', async () => {
  const api = createApi({ mode: 'mock' });
  const d = await api.getDaily({});
  assert.strictEqual(d.rounds, undefined, 'getDaily carries no rounds');
  const s = JSON.stringify(d);
  for (const k of ['seed', 'bestLineup', 'battle', 'lineup', 'salt', 'rounds']) assert.ok(s.indexOf('"' + k) < 0, k);
  assert.ok(['standard', 'shiren'].includes(d.variant));
  const st = await api.startRun({ mode: 'daily', clientRunId: 'a', dateKey: d.dateKey });
  assert.strictEqual(st.rounds.length, 1, 'startRun returns round 1 only');
  const again = await api.startRun({ mode: 'daily', clientRunId: 'a', dateKey: d.dateKey });
  assert.strictEqual(again.resumed, true);
  assert.deepStrictEqual(again.rounds, st.rounds);
  // getRound refuses to run ahead: no picks yet -> not round 2
  assert.strictEqual((await api.getRound({ clientRunId: 'a', dateKey: d.dateKey, actions: [] })).code, 'INVALID_ACTIONS');
  const d2 = await api.getDaily({});
  assert.strictEqual(d.issueNo, d2.issueNo);
});

test('api mock: one ranked daily result per date; duplicate submit is idempotent; rejects bad actions', async () => {
  const api = createApi({ mode: 'mock' });
  const d = await api.getDaily({});
  const played = await require('./harness').driveProgressive(api, { clientRunId: 'a', dateKey: d.dateKey });
  assert.ok(!played.error, JSON.stringify(played.error));
  const run = { actions: played.actions };
  const r1 = await api.submitRun({ clientRunId: 'a', mode: 'daily', dateKey: d.dateKey, actions: run.actions });
  assert.ok(r1.ok && r1.ranked);
  assert.deepStrictEqual(await api.submitRun({ clientRunId: 'a', mode: 'daily', dateKey: d.dateKey, actions: run.actions }), r1);
  const r2 = await api.submitRun({ clientRunId: 'b', mode: 'daily', dateKey: d.dateKey, actions: run.actions });
  assert.strictEqual(r2.code, 'ALREADY_PLAYED');
  const bad = await api.submitRun({ clientRunId: 'c', mode: 'free', seed: 1, actions: run.actions.slice(0, 3) });
  assert.strictEqual(bad.code, 'INVALID_ACTIONS');
  const board = await api.getBoard({ kind: 'friend', dateKey: d.dateKey });
  assert.strictEqual(board.rows.length, 1);
  assert.ok(!JSON.stringify(board).match(/mock-openid/), 'raw openid never reaches the client');
  assert.strictEqual(board.rows[0][0].length, 12);
  assert.strictEqual(board.rows[0].length, 4, 'lineup x included because the caller has a ranked result');
});

test('ads (real mode): reward only on isEnded === true; instance created with disableFallbackSharePage', async () => {
  const log = {};
  const fr = fakeRewarded(log);
  const m = mkAds(t0(), { createRewardedVideoAd: (o) => ((log.opts = o), fr.ad) });
  const p = m.ads.rewarded('respin', 'run1');
  await Promise.resolve();
  await Promise.resolve();
  fr.h.close({ isEnded: false });
  const early = await p;
  assert.strictEqual(early.granted, false);
  assert.strictEqual(early.toast, '完整观看才能获得');
  assert.strictEqual(log.opts.disableFallbackSharePage, true);
  assert.strictEqual(log.opts.adUnitId, 'r1');
  const p2 = m.ads.rewarded('respin', 'run1');
  await Promise.resolve();
  await Promise.resolve();
  fr.h.close({ isEnded: true });
  assert.strictEqual((await p2).granted, true);
  assert.ok(m.events.some((e) => e[0] === 'ad_reward'));
  assert.ok(m.events.some((e) => e[0] === 'ad_close_early'));
});

test('ads (real mode): error 1004 and onLoad useFallbackSharePage follow the D6 once-per-run rule', async () => {
  const log = {};
  const fr = fakeRewarded(log);
  const m = mkAds(t0(), { createRewardedVideoAd: () => fr.ad });
  const attempt = async (key, trigger) => {
    const p = m.ads.rewarded('respin', key);
    await Promise.resolve();
    await Promise.resolve();
    trigger();
    return p;
  };
  const a = await attempt('runA', () => fr.h.error({ errCode: 1004 }));
  assert.strictEqual(a.granted, true);
  assert.strictEqual(a.toast, '暂无广告，本次免费');
  const b = await attempt('runA', () => fr.h.load({ useFallbackSharePage: true }));
  assert.strictEqual(b.granted, false);
  assert.strictEqual(b.toast, '暂无广告，请稍后再试');
  // a different placement or run gets its own grant
  const c = await (async () => {
    const p = m.ads.rewarded('replay', 'runA');
    await Promise.resolve();
    await Promise.resolve();
    fr.h.error({ errCode: 1000 });
    return p;
  })();
  assert.strictEqual(c.granted, true);
  const d = await attempt('runB', () => fr.h.error({ errCode: 1004 }));
  assert.strictEqual(d.granted, true);
  assert.ok(m.events.filter((e) => e[0] === 'ad_error').every((e) => e[1].errCode !== undefined && e[1].stub === false));
});

test('interstitial: caps (4th lifetime run, every 3rd free run, >=120 s, <=5/day, free only); 2001-2003 skipped silently', async () => {
  let showErr = null;
  const m = mkAds(t0(), { createInterstitialAd: () => ({ show: () => (showErr ? Promise.reject({ errCode: showErr }) : Promise.resolve()) }) });
  const ctx = (n, life, mode) => ({ mode: mode || 'free', sessionFreeRuns: n, lifetimeRuns: life });
  assert.strictEqual(m.ads.interstitialDue(ctx(3, 3)), false, 'not before the 4th lifetime run');
  assert.strictEqual(m.ads.interstitialDue(ctx(2, 10)), false, 'not on the 2nd run');
  assert.strictEqual(m.ads.interstitialDue(ctx(3, 10, 'daily')), false, 'never in daily');
  assert.strictEqual(m.ads.interstitialDue(ctx(3, 10, 'challenge')), false, 'never in challenge');
  assert.strictEqual(m.ads.interstitialDue(ctx(3, 10)), true);
  assert.strictEqual(await m.ads.interstitial(ctx(3, 10)), true);
  assert.strictEqual(m.events.filter((e) => e[0] === 'interstitial_show').length, 1);
  assert.strictEqual(m.ads.interstitialDue(ctx(6, 13)), false, '>=120 s apart');
  m.tick(121000);
  assert.strictEqual(m.ads.interstitialDue(ctx(6, 13)), true);
  // 2001-2003: skipped silently, not counted, no interstitial_show
  for (const code of [2001, 2002, 2003]) {
    showErr = code;
    const before = m.store.state.interstitial.count;
    assert.strictEqual(await m.ads.interstitial(ctx(6, 13)), false);
    assert.strictEqual(m.store.state.interstitial.count, before);
  }
  assert.strictEqual(m.events.filter((e) => e[0] === 'interstitial_show').length, 1);
  assert.deepStrictEqual(m.events.filter((e) => e[0] === 'ad_error').map((e) => e[1].errCode), [2001, 2002, 2003]);
  showErr = null;
  // 5 per day
  for (let n = 1; n <= 5; n++) {
    m.tick(121000);
    await m.ads.interstitial(ctx(3 * n, 20));
  }
  assert.strictEqual(m.store.state.interstitial.count, 5);
  m.tick(121000);
  assert.strictEqual(m.ads.interstitialDue(ctx(30, 40)), false, 'daily cap');
  m.tick(86400000);
  assert.strictEqual(m.ads.interstitialDue(ctx(33, 43)), true, 'cap resets on the next Beijing day');
});

test('stub ads: overlay, complete after 3 s, skip grants nothing, simulated errors', async () => {
  const m = mkAds(t0(), {}, { adUnits: {}, stub: { enabled: true } });
  assert.strictEqual(m.ads.stub, true);
  const p = m.ads.rewarded('respin', 'r');
  assert.ok(m.ads.overlay);
  assert.strictEqual(m.ads.stubComplete(), false, 'too early');
  m.tick(3100);
  assert.strictEqual(m.ads.stubComplete(), true);
  assert.strictEqual((await p).granted, true);
  assert.ok(m.events.filter((e) => e[0].startsWith('ad_')).every((e) => e[1].stub === true));
  const q = m.ads.rewarded('respin', 'r2');
  m.ads.stubSkip();
  assert.strictEqual((await q).granted, false);
  m.ads.stubSim.rewardedError = 1004;
  assert.strictEqual((await m.ads.rewarded('replay', 'r3')).reason, 'noFillGrant');
});

function t0() {
  return {};
}

test('analytics: whitelist, common props, batches of <= 50, requeue on failure, no openid/group props', async () => {
  const sent = [];
  let fail = false;
  const api = { track: (d) => (sent.push(d), Promise.resolve(fail ? { ok: false } : { ok: true })) };
  const store = createStore(null);
  const a = createAnalytics({ api, store, config, contentVersion: 1, appVersion: 'x', now: () => Date.UTC(2026, 10, 20, 4) });
  assert.strictEqual(a.track('not_an_event', {}), false);
  for (let i = 0; i < 120; i++) a.track('draft_pick', { runId: 'r', round: 1, openid: 'LEAK', groupRef: 'LEAK', generalId: 'g_x' });
  const p = a.queue[0].props;
  assert.ok(p.sessionId && p.contentVersion === 1 && p.appVersion === 'x' && 'isNewUser' in p);
  assert.ok(!JSON.stringify(a.queue).includes('LEAK'));
  await a.flush();
  assert.deepStrictEqual(sent.map((s) => s.events.length), [50, 50, 20]);
  fail = true;
  a.track('error', { where: 'x', code: 1 });
  await a.flush();
  assert.strictEqual(a.queue.length, 1, 'failed batch is requeued');
  assert.ok(Object.keys(a.queue[0]).includes('ts'));
});

test('analytics: a warm start after > 30 min in the background begins a new session', () => {
  const api = { track: () => Promise.resolve({ ok: true }) };
  const store = createStore(null);
  let now = 1e12;
  const a = createAnalytics({ api, store, config, contentVersion: 1, now: () => now });
  a.startSession({});
  const s1 = a.sessionId();
  a.onHide();
  now += 10 * 60000;
  assert.strictEqual(a.onShow({}), false);
  assert.strictEqual(a.sessionId(), s1);
  a.onHide();
  now += 31 * 60000;
  assert.strictEqual(a.onShow({}), true);
  assert.notStrictEqual(a.sessionId(), s1);
});

test('share: titles, queries and entry routing (9.4)', () => {
  assert.strictEqual(dailyTitle({ w: 10, l: 2 }), '我今日 10胜2负，同一手令牌，你敢来吗？');
  assert.strictEqual(freeTitle({ w: 9, l: 3 }, ['关羽', '吕布']), '关羽+吕布才 9胜3负？不服来点将');
  assert.strictEqual(challengeTitle({ w: 10, l: 2 }), '同一手令牌，我 10胜2负，敢接战书吗？');
  assert.strictEqual(resultQuery('daily', '20261120'), 's=r&m=daily&d=20261120');
  assert.strictEqual(parseEnter({ query: 'c=ABCD2345' }).kind, 'challenge');
  assert.strictEqual(parseEnter({ query: { c: 'ABCD2345' }, shareTicket: 't' }).join, true);
  assert.strictEqual(parseEnter({ query: { c: 'bad' } }).kind, 'malformed');
  assert.strictEqual(parseEnter({ query: { s: 'r' }, shareTicket: 't' }).join, true);
  assert.strictEqual(parseEnter({ query: { s: 'r' } }).join, false);
  assert.strictEqual(parseEnter({ query: { wxad_fallback_share: '1' } }).kind, 'fallbackShare');
  assert.strictEqual(parseEnter({ query: { zzz: '1' } }).kind, 'malformed');
  assert.strictEqual(parseEnter({}).kind, 'none');
  // no titles claim exaggerated or forbidden wording
  const C = require('../core/content');
  for (const s of [dailyTitle({ w: 1, l: 1 }), freeTitle({ w: 1, l: 1 }, ['a', 'b']), challengeTitle({ w: 1, l: 1 })]) for (const f of C.FORBIDDEN_TERMS) assert.ok(s.indexOf(f) < 0);
});

test('view models: draft vm matches the spec 13 shape; daily card has no names', () => {
  const run = draft.createRun({ seed: 3, contentVersion: 1, mode: 'free' });
  let vm = V.draftVm(run, {});
  assert.strictEqual(vm.phase, 'awaitFlip');
  assert.strictEqual(vm.primaryLabel, '翻令');
  assert.strictEqual(vm.tokens, null);
  assert.strictEqual(vm.lineup.length, 5);
  draft.apply(run, { round: 1, type: 'flip' });
  const first = V.draftVm(run, {}).pool[0];
  vm = V.draftVm(run, { selectedId: first.id });
  assert.strictEqual(vm.phase, 'selecting');
  assert.strictEqual(vm.selected.slotOptions.length, 5);
  for (const o of vm.selected.slotOptions) assert.ok(['good', 'ok', 'bad'].includes(o.fit) && typeof o.score === 'number');
  assert.strictEqual(vm.respin.adAllowed, true);
  assert.strictEqual(vm.respin.faction.free, 1);
  for (const k of ['id', 'name', 'monogram', 'portraitUrl', 'tier', 'stats', 'drafted']) assert.ok(k in first);
  const content = run.content;
  const res = { mode: 'daily', record: { w: 10, l: 2 }, band: { label: 'x' }, issueNo: 3, battles: [], lineupDetail: ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'].map((s, k) => ({ slot: s, generalId: content.roster[k] })) };
  const card = V.cardVm(res, content);
  for (const e of card.lineup) assert.strictEqual(e.name, '');
  const free = V.cardVm(Object.assign({}, res, { mode: 'free' }), content);
  assert.ok(free.lineup.every((e) => e.name.length > 0));
});

test('result vm: pre-formatted battle rows and rarity lines', () => {
  const res = {
    mode: 'daily', status: 'done', record: { w: 12, l: 0 }, band: { key: 'yitong', label: '一统天下' }, comment: 'c',
    rarity: { share: 0.008, total: 100 }, battles: [{ i: 1, typeLabel: '野战', win: true, p: 0.8, luck: 'ping', cause: 'x', event: null }],
    lineupDetail: [], morale: { total: 1.1, lord: 0.2, bonds: ['桃园'], bondBonus: 0.04, cohesion: 0.05 },
  };
  res.rarityText = V.rarityText(res, config);
  assert.strictEqual(res.rarityText, '今日仅 0.8% 的主公一统天下');
  const vm = V.resultVm(res, {});
  assert.strictEqual(vm.battles[0].chanceText, '胜算八成');
  assert.strictEqual(vm.battles[0].luckText, '天时平');
  assert.strictEqual(vm.morale.bonds[0], '桃园 +0.04');
  res.rarity = { share: null, total: 10 };
  assert.strictEqual(V.rarityText(res, config), null, 'hidden under 30 runs');
  assert.strictEqual(V.rarityText({ mode: 'free', record: { w: 7, l: 5 } }, config).startsWith('约 '), true);
});

test('Beijing day roll: dateKey follows the server offset, not the device clock', () => {
  assert.strictEqual(beijingDateKey(Date.UTC(2026, 10, 20, 15, 59, 59)), '20261120');
  assert.strictEqual(beijingDateKey(Date.UTC(2026, 10, 20, 16, 0, 0)), '20261121');
});

test('mock server mirrors the backend spoiler lock: getReplay REPLAY_LOCKED and sealed challenge lineups', async () => {
  const { createMockServer } = require('../js/mock-server');
  const now = Date.UTC(2026, 10, 20, 4, 0, 0);
  const srv = createMockServer({ now: () => now });
  const d = srv.call('getDaily', {});
  const seed = srv.db.seeds[d.dateKey].seed;
  srv.db.runs['mock-openid-me_r1'] = { response: {}, seed, mode: 'free', dateKey: d.dateKey, lineup: [], tokens: [], record: { w: 1, l: 11 } };
  assert.strictEqual(srv.call('getReplay', { runId: 'r1' }).code, 'REPLAY_LOCKED');
  srv.db.results[d.dateKey + '_mock-openid-me'] = { w: 5, s: 1, lineup: [], response: {} };
  assert.notStrictEqual(srv.call('getReplay', { runId: 'r1' }).code, 'REPLAY_LOCKED');
  srv.db.runs['mock-openid-me_r2'] = { response: {}, seed: 12345, mode: 'free', dateKey: d.dateKey, lineup: [], tokens: [], record: { w: 1, l: 11 } };
  delete srv.db.results[d.dateKey + '_mock-openid-me'];
  assert.notStrictEqual(srv.call('getReplay', { runId: 'r2' }).code, 'REPLAY_LOCKED', 'a free seed is never locked');
  // after D+1 00:30 the seal lifts
  

});

test('vm: locked texts for 复盘 and the opponent lineup', () => {
  const base = { mode: 'challenge', status: 'done', record: { w: 3, l: 9 }, band: {}, battles: [], lineupDetail: [], morale: null, challenge: { theirRecord: { w: 12, l: 0 }, theirLineup: null, lineupLocked: true } };
  const vm = V.resultVm(base, { replayLocked: true });
  assert.strictEqual(vm.replay.locked, true);
  assert.strictEqual(vm.replay.lockedText, '今日军令完成后可复盘');
  assert.strictEqual(vm.challenge.lineupLocked, true);
  assert.strictEqual(vm.challenge.lockedText, '对方阵容 · 完成今日军令后可见');
  assert.strictEqual(vm.challenge.theirLineup, null);
  assert.strictEqual(V.resultVm(base, {}).replay.locked, false);
  assert.strictEqual(V.challengeVm({ status: 'answered', lineupLocked: true }).lockedText, '对方阵容 · 完成今日军令后可见');
});
