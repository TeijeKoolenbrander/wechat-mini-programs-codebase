'use strict';
// QA re-check (V1-3, V1-4): edge cases beyond the developer suites.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createAds } = require('../js/ads');
const { createAudio } = require('../js/audio');
const { getConfig } = require('../core/config');

test('V1-3: a release build with no ad unit ids never calls the ad API and never shows the test overlay; main.js never stubs a cloud build', async () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
  assert.ok(/enabled:\s*!!build\.stubAds\s*&&\s*!build\.cloudEnv/.test(main), 'main.js must never stub when cloudEnv is set');
  let created = 0;
  const wx = {
    createRewardedVideoAd() {
      created++;
      throw new Error('must not be called without a unit id');
    },
  };
  const ads = createAds({ wx, config: getConfig(3), store: { state: {}, save() {} }, analytics: { track() {} }, adUnits: { rewarded: '', interstitial: '' }, stub: { enabled: false } });
  const r = await ads.rewarded('replay', 'r1');
  assert.deepStrictEqual([r.granted, r.reason, r.toast], [true, 'noFillGrant', '暂无广告，本次免费']);
  assert.strictEqual(ads.overlay, null);
  assert.strictEqual(created, 0);
  const r2 = await ads.rewarded('replay', 'r1');
  assert.strictEqual(r2.granted, false);
  const r3 = await ads.rewarded('replay', 'r2'); // a new run gets its one free no-fill again
  assert.strictEqual(r3.granted, true);
});

test('V1-4: sound edge cases: muted from the start creates no context; a throwing play() and a late onError stay silent; unknown cue ignored', () => {
  let made = 0;
  const mk = (over) => () => {
    made++;
    return Object.assign({ stop() {}, play() {}, onError(cb) { this._err = cb; } }, over || {});
  };
  const muted = createAudio({ createInnerAudioContext: mk() }, true);
  muted.preload();
  for (const c of ['flip', 'pick', 'win', 'loss', 'nope']) muted.play(c);
  assert.strictEqual(made, 0, 'no audio context while muted');
  const loud = createAudio({ createInnerAudioContext: mk({ play() { throw new Error('boom'); } }) }, false);
  assert.doesNotThrow(() => {
    loud.preload();
    loud.play('flip');
    loud.play('nope');
    loud.setMuted(true);
    loud.setMuted(false);
    loud.play('win');
  });
  let ctx;
  const a = createAudio({ createInnerAudioContext() { ctx = { stop() {}, play() {}, onError(cb) { this._err = cb; } }; return ctx; } }, false);
  a.play('flip');
  ctx._err({ errCode: 10001 });
  assert.doesNotThrow(() => a.play('flip'));
  const none = createAudio({}, false);
  assert.doesNotThrow(() => {
    none.preload();
    none.play('flip');
  });
});
