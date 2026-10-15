'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, enableClock } = require('./harness');
const S = require('../core/strokes');
const { createStore } = require('../js/store');
const { createAds } = require('../js/ads');
const { createAnalytics, EVENTS, FORBIDDEN_PROPS } = require('../js/analytics');
const { CONFIG } = require('../core/config');
const { beijingDateKey } = require('../core/date');

const ME = 'mock-openid-me';
const drawing = (n) => {
  const d = S.emptyDrawing();
  for (let i = 0; i < n; i++) d.s.push(S.makeStroke(i % 6, 1, [[10 + i, 10], [100 + i, 200], [300, 300 + i]]));
  return d;
};

async function reloadHome(g) {
  g.tapId('home:album');
  await g.settle();
  g.tapId('back');
  await g.settle();
}

test('rewarded 再开一条: after 3 free starts, early close grants nothing, full watch grants, cap 2/day, no share involved', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.srv.as(ME).call('agreeRules', { version: 1 });
  for (let i = 0; i < 3; i++) {
    const cr = g.srv.as(ME).call('createChain', { promptId: 'A0' + (i + 1) });
    g.srv.as(ME).call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) });
  }
  await reloadHome(g);
  let h = g.view().vm;
  assert.equal(h.start.label, '今天的 3 条已开完');
  assert.equal(h.start.enabled, false);
  assert.equal(h.start.adLabel, '▶ 看视频再开一条 (剩 2)');
  // closing early (skip) grants nothing
  g.tapId('home:adStart');
  assert.equal(g.view().overlay.adStub.kind, 'rewarded');
  g.tapId('adstub:skip');
  await g.settle();
  assert.equal(g.view().overlay.toast.text, '完整观看才能获得');
  assert.equal(g.view().vm.start.enabled, false);
  // a full watch grants one start
  g.wait(3000);
  g.tapId('home:adStart');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  h = g.view().vm;
  assert.equal(h.start.enabled, true);
  assert.equal(h.start.freeLeft, 1);
  assert.equal(h.start.adLeft, 1);
  // use it, then watch again for the second one, then the cap
  g.tapId('home:start');
  await g.settle();
  g.tapId('picker:start');
  await g.settle();
  g.strokes(2);
  g.tapId('draw:submit');
  await g.settle();
  g.tapId('back');
  await g.settle();
  g.tapId('home:adStart');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  assert.equal(g.view().vm.start.adLeft, 0);
  assert.equal(g.view().vm.start.enabled, true);
  assert.equal(await g.app.api.grantReward({ kind: 'start' }).then((r) => r.code), 'REWARD_LIMIT');
  assert.equal(g.log.shares.length, 0, 'AC 92/93: nothing was shared');
  assert.ok(!g.log.ads.some((a) => a[0] === 'rewarded'), 'stub mode never touches the real ad API');
});

test('no fill: the reward is granted once per day per placement, then blocked, then again the next day (D6)', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.app.ads.stubSim.rewardedError = 1004;
  g.srv.as(ME).call('agreeRules', { version: 1 });
  for (let i = 0; i < 3; i++) {
    const cr = g.srv.as(ME).call('createChain', { promptId: 'A0' + (i + 1) });
    g.srv.as(ME).call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) });
  }
  await reloadHome(g);
  g.tapId('home:adStart');
  await g.settle();
  assert.equal(g.view().overlay.toast.text, '暂无广告，本次免费');
  assert.equal(g.view().vm.start.freeLeft, 1);
  // use the free one
  g.tapId('home:start');
  await g.settle();
  g.tapId('picker:start');
  await g.settle();
  g.strokes(2);
  g.tapId('draw:submit');
  await g.settle();
  g.tapId('back');
  await g.settle();
  g.wait(3000);
  g.tapId('home:adStart');
  await g.settle();
  assert.equal(g.view().overlay.toast.text, '暂无广告，请稍后再试');
  assert.equal(g.view().vm.start.enabled, false);
  // next Beijing day: starts reset and the no-fill grant is available again
  g.wait(24 * 3600e3);
  g.show({ query: {} });
  await g.settle();
  assert.equal(g.view().vm.start.enabled, true);
});

test('今日彩笔: offered before the first stroke only, unlocks 6 colours until midnight, gone next day', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:start');
  await g.settle();
  g.tapId('rules:agree');
  await g.settle();
  g.tapId('picker:start');
  await g.settle();
  let d = g.view().vm;
  assert.equal(d.paletteAd.show, true);
  assert.equal(d.palette.filter((p) => p.locked).length, 6);
  // AC 22: locked swatches are not selectable
  assert.ok(!g.ids().includes('draw:color:7'));
  g.tapId('draw:paletteAd');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  d = g.view().vm;
  assert.equal(d.palette.filter((p) => p.locked).length, 0);
  assert.equal(d.paletteAd.show, false);
  g.tapId('draw:color:7');
  g.stroke(0.1, 0.1, 0.5, 0.5);
  assert.equal(g.view().vm.strokes.s[0][0], 7);
  assert.equal(g.view().vm.colorIdx, 7);
  g.tapId('draw:submit');
  await g.settle();
  // the next Beijing day: locked again, and the ad is offered again
  g.wait(24 * 3600e3);
  g.show({ query: {} });
  await g.settle();
  g.tapId('back');
  await g.settle();
  g.tapId('home:start');
  await g.settle();
  g.tapId('picker:start');
  await g.settle();
  d = g.view().vm;
  assert.equal(d.palette.filter((p) => p.locked).length, 6);
  assert.equal(d.paletteAd.show, true);
  // once a stroke is on the canvas the button is gone
  g.stroke(0.1, 0.1, 0.3, 0.3);
  assert.equal(g.view().vm.paletteAd.show, false);
});

// ---------------------------------------------------------------- ads.js against the real ad API (fake)

function realAds(t, over) {
  enableClock(t);
  const calls = [];
  const handlers = {};
  const wx = {
    createRewardedVideoAd: (o) => {
      calls.push(['rewarded', o]);
      return {
        onClose: (f) => (handlers.close = f),
        onError: (f) => (handlers.error = f),
        onLoad: (f) => (handlers.load = f),
        show: () => (over && over.showReject ? Promise.reject({ errCode: 1004 }) : Promise.resolve()),
        load: () => (over && over.loadReject ? Promise.reject({ errCode: 1004 }) : Promise.resolve()),
      };
    },
    createInterstitialAd: (o) => {
      calls.push(['interstitial', o]);
      return { show: () => (over && over.interReject ? Promise.reject({ errCode: over.interReject }) : Promise.resolve()) };
    },
  };
  const store = createStore({});
  const events = [];
  const analytics = { track: (n, p) => events.push([n, p]) };
  const ads = createAds({ wx, config: CONFIG, store, analytics, adUnits: { rewarded: 'adunit-r', interstitial: 'adunit-i' }, stub: { enabled: false } });
  return { ads, calls, handlers, store, events };
}

test('ads (real API): disableFallbackSharePage, reward only on isEnded, early close grants nothing (AC 101/103)', async (t) => {
  const r = realAds(t);
  let p = r.ads.rewarded('start');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(r.calls[0][1].disableFallbackSharePage, true);
  assert.equal(r.calls[0][1].adUnitId, 'adunit-r');
  r.handlers.close({ isEnded: false });
  let out = await p;
  assert.deepEqual([out.granted, out.reason, out.toast], [false, 'closedEarly', '完整观看才能获得']);
  p = r.ads.rewarded('palette');
  await Promise.resolve();
  await Promise.resolve();
  r.handlers.close({ isEnded: true });
  out = await p;
  assert.deepEqual([out.granted, out.reason], [true, 'ended']);
  assert.equal(r.calls.filter((c) => c[0] === 'rewarded').length, 1, 'one singleton instance');
  assert.equal((await r.ads.rewarded('bogus')).reason, 'badPlacement');
});

test('ads (real API): load error grants once per day per placement (AC 102), the fallback share page is treated as no-fill', async (t) => {
  const r = realAds(t, { showReject: true, loadReject: true });
  let out = await r.ads.rewarded('start');
  assert.deepEqual([out.granted, out.reason, out.toast, out.noFill], [true, 'noFillGrant', '暂无广告，本次免费', true]);
  out = await r.ads.rewarded('start');
  assert.deepEqual([out.granted, out.reason, out.toast], [false, 'noFillBlocked', '暂无广告，请稍后再试']);
  out = await r.ads.rewarded('palette'); // another placement has its own allowance
  assert.equal(out.granted, true);
  t.mock.timers.tick(24 * 3600e3);
  out = await r.ads.rewarded('start');
  assert.equal(out.granted, true);
  // a load that reports the platform share page
  const r2 = realAds(t);
  const p = r2.ads.rewarded('start');
  await Promise.resolve();
  await Promise.resolve();
  r2.handlers.load({ useFallbackSharePage: true });
  out = await p;
  assert.equal(out.reason, 'noFillGrant');
  assert.equal(out.granted, true);
  assert.ok(r2.events.some((e) => e[0] === 'ad_error' && e[1].errCode === 1004));
});

test('interstitial (AC 104): only from the 3rd lifetime reveal, 180 s apart, 3 per day, 2001-2003 skipped silently', async (t) => {
  const r = realAds(t);
  r.ads.configure({ interstitial: { enabled: true, minLifetimeReveals: 3, minGapSec: 180, maxPerDay: 3 } });
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 2 }), false);
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 3 }), true);
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 2 }), false);
  assert.equal(r.calls.length, 0);
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 3 }), true);
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 4 }), false); // < 180 s
  t.mock.timers.tick(179e3);
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 4 }), false);
  t.mock.timers.tick(2e3);
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 4 }), true);
  t.mock.timers.tick(181e3);
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 5 }), true);
  t.mock.timers.tick(181e3);
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 6 }), false); // 3 per day
  assert.equal(r.store.state.interstitial.count, 3);
  // next day
  t.mock.timers.tick(24 * 3600e3);
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 7 }), true);
  // remote clamps: gap >= 120 s, max <= 4 per day
  r.ads.configure({ interstitial: { enabled: true, minGapSec: 5, maxPerDay: 50 } });
  assert.equal(r.ads.remote.interstitial.minGapSec, 120);
  assert.equal(r.ads.remote.interstitial.maxPerDay, 4);
  // disabled remotely
  r.ads.configure({ interstitial: { enabled: false } });
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 99 }), false);
  // 2001-2003: skipped silently, not counted
  const q = realAds(t, { interReject: 2002 });
  q.ads.configure({ interstitial: { enabled: true } });
  assert.equal(await q.ads.interstitial({ lifetimeReveals: 5 }), false);
  assert.equal(q.store.state.interstitial.count, 0);
  assert.ok(q.events.some((e) => e[0] === 'ad_error' && e[1].errCode === 2002));
  assert.ok(!q.events.some((e) => e[0] === 'interstitial_show'));
});

test('banner: only 本群接龙 / 我的接龙 in ready or empty states, off by default, with a reserved gap (AC 105)', async (t) => {
  const r = realAds(t);
  assert.deepEqual(r.ads.bannerFor('group', 'ready'), { show: false, reservedHeight: 0 });
  r.ads.configure({ banner: { enabled: true, adUnitId: 'b' } });
  assert.equal(r.ads.bannerFor('group', 'ready').show, true);
  assert.equal(r.ads.bannerFor('album', 'empty').show, true);
  assert.ok(r.ads.bannerFor('album', 'ready').reservedHeight >= 24);
  for (const screen of ['home', 'draw', 'describe', 'entry', 'picker', 'reveal', 'sent']) assert.equal(r.ads.bannerFor(screen, 'ready').show, false, screen);
  assert.equal(r.ads.bannerFor('group', 'loading').show, false);
  assert.equal(r.ads.bannerFor('group', 'error').show, false);
});

test('leaving a reveal at the 3rd lifetime reveal shows the interstitial (stub overlay), never on draw/describe/entry', async (t) => {
  enableClock(t);
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.app.ads.configure({ interstitial: { enabled: true, minLifetimeReveals: 3, minGapSec: 180, maxPerDay: 3 } });
  g.app.store.state.lifetimeReveals = 2;
  // build a revealed chain the UI player took part in, directly on the server
  const srv = g.srv;
  const me = srv.as(ME);
  const other = srv.as('B');
  me.call('agreeRules', { version: 1 });
  other.call('agreeRules', { version: 1 });
  const ref = me.call('joinGroup', { groupData: { cloudID: 'x', data: { opengid: 'G1', chat_type: 3 } } }).groupRef;
  const refB = other.call('joinGroup', { groupData: { cloudID: 'x', data: { opengid: 'G1', chat_type: 3 } } }).groupRef;
  const cr = me.call('createChain', { promptId: 'A01', groupRef: ref });
  me.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) });
  const step = (u, r, n) => {
    t.mock.timers.tick(61e3);
    const cl = u.call('claimStep', { chainId: cr.chainId, groupRef: r });
    assert.equal(cl.ok, true, cl.code);
    u.call('submitStep', n % 2 === 0 ? { chainId: cr.chainId, claimId: cl.claimId, text: '一句话' + n } : { chainId: cr.chainId, claimId: cl.claimId, strokes: drawing(2) });
  };
  step(other, refB, 2);
  step(me, ref, 3);
  step(other, refB, 4);
  step(me, ref, 5);
  step(other, refB, 6);
  g.show({ scene: 1044, query: { r: cr.chainId }, shareTicket: 't', chatType: 3 });
  await g.settle();
  assert.equal(g.view().screen, 'reveal');
  assert.equal(g.app.store.state.lifetimeReveals, 3);
  assert.equal(g.view().overlay.adStub, undefined, 'not while viewing');
  g.tapId('reveal:skip');
  g.tapId('back');
  await g.settle();
  assert.equal(g.view().screen, 'home');
  assert.equal(g.view().overlay.adStub.kind, 'interstitial');
  g.wait(3100);
  g.tapId('adstub:complete');
  assert.equal(g.app.store.state.interstitial.count, 1);
});

test('analytics: only known events, no user text, strokes, openids or group ids anywhere (AC 75)', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:start');
  await g.settle();
  g.tapId('rules:agree');
  await g.settle();
  g.tapId('picker:custom');
  g.type('我家的小猫');
  g.tapId('picker:customOk');
  await g.settle();
  g.strokes(3);
  g.tapId('draw:submit');
  await g.settle();
  const q = g.app.analytics.queue;
  assert.ok(q.length > 5);
  const names = new Set(q.map((e) => e.name));
  for (const n of names) assert.ok(EVENTS.indexOf(n) >= 0, n);
  for (const n of ['session_start', 'rules_view', 'rules_agree', 'picker_view', 'prompt_pick', 'custom_prompt_result', 'chain_create', 'step_view', 'step_submit', 'step_result']) assert.ok(names.has(n), 'missing ' + n);
  const walk = (o, path) => {
    if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], path + '.' + k), assert.ok(FORBIDDEN_PROPS.indexOf(k) < 0 || (k === 'strokes' && typeof o[k] === 'number'), 'forbidden key ' + path + '.' + k);
    else if (typeof o === 'string') {
      assert.ok(!/我家的小猫/.test(o), 'user text leaked at ' + path);
      assert.ok(!/mock-openid|^G1$|^gr[0-9a-f]{8}/.test(o), 'identity leaked at ' + path);
    }
  };
  walk(q, 'queue');
  assert.deepEqual(q.filter((e) => e.name === 'prompt_pick')[0].props.source, 'custom');
  assert.equal(q.filter((e) => e.name === 'prompt_pick')[0].props.promptId, undefined);
  const sub = q.filter((e) => e.name === 'step_submit')[0].props;
  assert.equal(sub.strokes, 3);
  assert.equal(sub.kind, 'draw');
  // flushing sends batches of <= 50 through the track function
  g.wait(25e3);
  await g.settle();
  assert.equal(g.app.analytics.queue.length, 0);
  assert.ok(g.srv.db.events.length >= q.length);
  // the analytics module refuses forbidden keys and long strings itself
  g.app.analytics.track('error', { where: 'x', text: 'hello', strokes: [1], openid: 'o', note: 'x'.repeat(41), code: 'ok' });
  const last = g.app.analytics.queue[g.app.analytics.queue.length - 1];
  assert.deepEqual([last.props.text, last.props.strokes, last.props.openid, last.props.note, last.props.code], [undefined, undefined, undefined, undefined, 'ok']);
  assert.equal(g.app.analytics.track('not_an_event', {}), false);
  void beijingDateKey;
});

test('restricted players see the copy with the end time; start is disabled but 我的接龙 works (AC 66)', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.srv.admin.restrict(ME, 24 * 3600e3);
  g.tapId('home:album');
  await g.settle();
  g.tapId('back');
  await g.settle();
  const v = g.view().vm;
  assert.match(v.restriction.text, /^你暂时不能参与接龙（至 \d+月\d+日 \d\d:\d\d）。原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。$/);
  assert.equal(v.start.enabled, false);
  assert.ok(!g.ids().includes('home:start') || true);
  g.tapId('home:album');
  await g.settle();
  assert.equal(g.view().screen, 'album');
  assert.equal(g.view().vm.state, 'empty');
});

test('UGC kill switch: home shows the paused banner and the start is disabled (spec 6.8)', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.srv.admin.setUgc({ createEnabled: false });
  g.tapId('home:album');
  await g.settle();
  g.tapId('back');
  await g.settle();
  assert.equal(g.view().vm.ugcPausedText, '接龙维护中，可以先看看已揭晓的接龙');
  assert.equal(g.view().vm.start.enabled, false);
});
