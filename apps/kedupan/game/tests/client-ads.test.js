'use strict';
// Rewarded-ad edge rules (spec 9, AC 56, 58, 61) beyond the archive/bonus flows in client-archive.test.js.
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

test('AC 58: a fallback-share load (useFallbackSharePage) is no-fill: free once with the message; every instance disables the fallback page', async (t) => {
  const h = await ready(t, { now: D1, build: ADS, rewarded: { mode: 'fallback' } });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  await h.tap('result:distribution');
  assert.equal(h.view().vm.distribution.unlocked, true, 'no-fill grants once');
  assert.match(h.lastText(), /暂无广告，本次免费/);
  assert.equal(h.log.rewarded.length, 1);
  assert.equal(h.log.rewarded[0].disableFallbackSharePage, true);
  assert.ok(h.app.analytics.queue.some((e) => e.name === 'ad_error' && e.props.errCode === 1004));
});

test('AC 61: stub mode logs ad events with stub: true and shows the test overlay; production config has stub off', async (t) => {
  assert.equal(require('../js/build-config').stubAds, false);
  const h = await ready(t, { now: D1, build: { stubAds: true } });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  await h.tap('result:distribution');
  assert.ok(h.ctl.view(Date.now()).overlay.adStub, 'the test ad overlay is up');
  assert.ok(h.has('adstub:skip'));
  await h.tap('adstub:skip'); // closed early: nothing granted
  assert.equal(h.view().vm.distribution.unlocked, false);
  await h.tap('result:distribution');
  h.ctl.K.ads.stubComplete(true);
  await h.settle();
  assert.equal(h.view().vm.distribution.unlocked, true);
  const ads = h.app.analytics.queue.filter((e) => /^ad_/.test(e.name));
  assert.ok(ads.length >= 4 && ads.every((e) => e.props.stub === true));
});

test('AC 56: an early close grants nothing for 全国分布, says 完整观看才能获得, and the server is not asked', async (t) => {
  const h = await ready(t, { now: D1, build: ADS, rewarded: { mode: 'early' } });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  await h.tap('result:distribution');
  assert.equal(h.view().vm.distribution.unlocked, false);
  assert.match(h.lastText(), /完整观看才能获得/);
  assert.equal(h.srv.calls.filter((c) => c.name === 'unlockDistribution').length, 0);
});

test('spec 9: with no ad unit (before 流量主) rewarded placements behave as no-fill and interstitials never show', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.seedDays(3, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  await h.tap('result:distribution');
  assert.equal(h.view().vm.distribution.unlocked, true, 'free once');
  assert.equal(h.log.rewarded.length, 0, 'no ad instance was created');
  await h.tap('sheet:close');
  await h.tap('result:archive');
  for (let i = 0; i < 4; i++) {
    await h.archiveSet('2026110' + (3 - (i % 3)), [10, 30, 50, 70, 90]);
    await h.tap('archive:backList');
  }
  assert.equal(h.log.interstitial.length, 0);
});
