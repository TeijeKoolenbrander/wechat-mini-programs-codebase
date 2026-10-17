'use strict';
// QA-R2-10 (client part) / AC 104, spec 11: the interstitial is shown at most 3 times a day and at least 180 s apart, even when the
// remote config (or an old clamp of 4 / 120 s in core/config.js) says more.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFeatures } = require('../js/features');
const { createAds } = require('../js/ads');

test('features: remote interstitial values are clamped to 3 a day and 180 s apart; stricter values are honoured', () => {
  const f = normalizeFeatures({ features: { interstitial: { enabled: true, maxPerDay: 4, minGapSec: 120 } } });
  assert.deepEqual([f.interstitial.maxPerDay, f.interstitial.minGapSec], [3, 180]);
  const g = normalizeFeatures({ features: { interstitial: { enabled: true, maxPerDay: 99, minGapSec: 1 } } });
  assert.deepEqual([g.interstitial.maxPerDay, g.interstitial.minGapSec], [3, 180]);
  const ok = normalizeFeatures({ features: { interstitial: { enabled: true, maxPerDay: 2, minGapSec: 600 } } });
  assert.deepEqual([ok.interstitial.maxPerDay, ok.interstitial.minGapSec], [2, 600]);
  const none = normalizeFeatures(null);
  assert.deepEqual([none.interstitial.maxPerDay, none.interstitial.minGapSec], [3, 180]);
});

test('ads.js: refuses a 4th interstitial a day and one inside 180 s even when handed a looser config', () => {
  const clock = { t: Date.UTC(2026, 10, 3, 4) };
  const store = { state: { noFill: { day: '', start: false, palette: false }, interstitial: { day: '', count: 0, lastAt: 0 } }, save() {} };
  const wx = { createInterstitialAd: () => ({ show: () => Promise.resolve() }) };
  const ads = createAds({ wx, store, analytics: { track() {} }, now: () => clock.t, adUnits: { interstitial: 'I' }, stub: { enabled: false } });
  ads.setInterstitialConfig({ enabled: true, minLifetimeReveals: 0, minGapSec: 10, maxPerDay: 9 });
  const c = ads.interstitialConfig();
  assert.deepEqual([c.maxPerDay, c.minGapSec], [3, 180]);
  assert.equal(ads.interstitialDue({ lifetimeReveals: 5 }), true);
  store.state.interstitial.lastAt = clock.t - 120e3;
  assert.equal(ads.interstitialDue({ lifetimeReveals: 5 }), false, '120 s after the last one');
  store.state.interstitial.lastAt = clock.t - 181e3;
  assert.equal(ads.interstitialDue({ lifetimeReveals: 5 }), true, '181 s after');
  // the 4th of the day: the day key is the one the module itself writes after a show
  store.state.interstitial.lastAt = 0;
  const day = require('../core/date').beijingDateKey(clock.t);
  store.state.interstitial = { day, count: 3, lastAt: 0 };
  assert.equal(ads.interstitialDue({ lifetimeReveals: 5 }), false, 'a 4th today');
});
