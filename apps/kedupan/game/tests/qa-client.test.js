'use strict';
// QA (independent) client compliance and abuse tests: ads, sharing, rapid taps, fallback-share launch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, BJ } = require('./harness');

const D1 = BJ(2026, 11, 1, 10, 0, 0);
const ADS = { adUnits: { rewarded: 'rw-1', interstitial: 'in-1' } };

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}

test('QA AC 55: with every ad unit configured, a full daily (5 cards, 5 reveals, result) creates no ad of any kind', async (t) => {
  const h = await ready(t, { now: D1, build: ADS });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  assert.equal(h.screen(), 'result');
  assert.equal(h.log.rewarded.length, 0);
  assert.equal(h.log.interstitial.length, 0);
  assert.equal(h.log.banners.length, 0);
  assert.ok(!h.app.analytics.queue.some((e) => /^ad_/.test(e.name)));
});

test('QA AC 50/51: nothing shares until a tap; one tap = one share with an id-only query and no positions; nothing is unlocked by it', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  assert.equal(h.log.shares.length, 0, 'no automatic share');
  const before = JSON.stringify({ b: h.view().vm.bonus, d: h.view().vm.distribution });
  await h.tap('result:share');
  assert.equal(h.log.shares.length, 1);
  const s = h.log.shares[0];
  assert.match(s.query, /^s=d&d=\d{8}$/);
  assert.ok(!/互助|转发|分享到|@所有人|不转/.test(s.title));
  assert.equal(JSON.stringify({ b: h.view().vm.bonus, d: h.view().vm.distribution }), before, 'sharing unlocks nothing');
  // capsule menu: the registered handler returns a plain card, still no side effects
  assert.ok(h.log.menu.some((m) => m[0] === 'showShareMenu'));
  const updates = h.log.menu.filter((m) => m[0] === 'updateShareMenu');
  assert.ok(updates.every((m) => m[1].withShareTicket === true && !('isUpdatableMessage' in m[1])));
  const menu = h.handlers.shareMenu();
  assert.ok(menu.title && !/\d{3}/.test(menu.query || ''));
});

test('QA rapid taps: a double tap on 就这儿 submits the card once', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.seedDays(2, 0);
  await h.tap('home:daily');
  await h.place(50);
  const a = h.find('card:primary');
  const x = a.x + a.w / 2;
  const y = a.y + a.h / 2;
  for (let i = 0; i < 4; i++) {
    h.handlers.start({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }], touches: [{}] });
    h.handlers.end({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }], touches: [] });
  }
  await h.settle(10);
  assert.equal(h.srv.calls.filter((c) => c.name === 'submitCard').length, 1);
});

test('QA AC 58: a launch carrying wxad_fallback_share=1 lands on home, grants nothing, shows no ad', async (t) => {
  const h = await ready(t, { now: D1, build: ADS });
  await h.seedDays(2, 0);
  await h.show({ scene: 1001, query: { wxad_fallback_share: '1' } });
  assert.equal(h.screen(), 'home');
  assert.equal(h.log.rewarded.length + h.log.interstitial.length, 0);
});

test('QA AC 64: nothing privacy- or login-related is called while playing a full daily', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  const bad = h.log.calls.filter((c) => /^(requirePrivacyAuthorize|authorize|openSetting|requestSubscribeMessage|getUserProfile|login)/.test(c));
  assert.deepEqual(bad, []);
  assert.ok(h.log.kv.length <= 1, 'at most the one marker write after the completed daily (spec 8.2)');
});
