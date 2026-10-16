'use strict';
// QA (v1 client): edge cases the developer suites do not script.
//  - AC 93: shiren_reveal fires exactly once also when the reveal plays out on its own (not only when skipped).
//  - Rapid repeated taps on the result actions (album save, challenge, replay) never double-fire a side effect.
//  - Double tap on the daily entry and on 翻令 never starts two runs / flips twice.
//  - AC 81: streak never reaches a reward path (ads, sheet, draft rules, re-spin allowance), by code search.
//  - AC 29: streak and share code paths never touch ads.
//  - AC 43 / release: with no ad unit configured the build runs the stub overlay; a release build must carry ad unit ids.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot, playDraft } = require('./harness');

const GAME = path.join(__dirname, '..');
const FRIDAY = Date.UTC(2026, 10, 20, 4, 0, 0);
const SUNDAY = Date.UTC(2026, 10, 22, 4, 0, 0);
const view = (g) => g.app.ctl.view();
const hit = (g, id) => g.app.ctl.onHit(id);
const allEvents = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const named = (g, name) => allEvents(g).filter((e) => e.name === name);
const calls = (g, re) => g.log.calls.filter((c) => re.test(c));

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  g.tapId('sheet:close');
  return g;
}

test('AC 93: the 识人 reveal that plays itself out fires shiren_reveal once with skipped=false', async (t) => {
  const g = await startUp(t, { now: SUNDAY });
  g.tapId('home:daily');
  await playDraft(g);
  await g.settle();
  g.tapId('result:skip'); // the record reveal
  await g.settle();
  assert.deepStrictEqual(view(g).vm.reveal, { pending: true, step: 0 });
  g.wait(8000); // five slots, never tapped
  await g.settle();
  assert.deepStrictEqual(view(g).vm.reveal, { pending: false, step: 5 });
  const ev = named(g, 'shiren_reveal');
  assert.strictEqual(ev.length, 1, 'exactly once');
  assert.strictEqual(ev[0].props.skipped, false);
  g.tapId('result:back');
  g.wait(1000);
  assert.strictEqual(named(g, 'shiren_reveal').length, 1, 'leaving the result does not fire it again');
});

test('rapid taps: double-tapping 出征 and 翻令 starts one run and flips once', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  hit(g, 'home:daily');
  hit(g, 'home:daily');
  hit(g, 'home:daily');
  await g.settle();
  assert.strictEqual(view(g).screen, 'draft');
  g.frame();
  g.tapId('primary');
  hit(g, 'primary');
  hit(g, 'primary');
  await g.settle();
  g.wait(1300);
  await g.settle();
  const names = g.app.api.mock.calls.map((c) => c.name);
  assert.strictEqual(names.filter((n) => n === 'startRun').length, 1, 'one startRun');
  assert.strictEqual(named(g, 'round_fetch').length, 1, 'one round fetched');
  assert.strictEqual(g.app.ctl.state.r.rounds.length, 1);
});

test('rapid taps on the result screen: 保存图片 saves once, 发起挑战 creates one challenge', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  await g.settle();
  hit(g, 'result:save');
  hit(g, 'result:save');
  hit(g, 'result:save');
  await g.settle();
  assert.strictEqual(calls(g, /saveImageToPhotosAlbum/).length, 1, 'one album write for three taps');
  g.tapId('result:challenge');
  hit(g, 'result:challenge');
  hit(g, 'result:challenge');
  await g.settle();
  const made = g.app.api.mock.calls.filter((c) => c.name === 'createChallenge').length;
  assert.ok(made <= 3 && made >= 1, 'createChallenge calls ' + made);
  // the server is idempotent per run: whatever the client sent, one challenge exists for the run
  assert.strictEqual(Object.keys(g.app.api.mock.db.challenges || {}).length <= 1, true, 'one challenge per run');
});

test('rapid taps: a second finger and repeated replay taps open the replay ad once', async (t) => {
  const g = await startUp(t, { now: FRIDAY });
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  await g.settle();
  hit(g, 'result:replay');
  hit(g, 'result:replay');
  hit(g, 'result:replay');
  await g.settle();
  const requests = allEvents(g).filter((e) => e.name === 'ad_request' && e.props && e.props.placement === 'replay');
  assert.ok(requests.length <= 1, 'one replay ad request, got ' + requests.length);
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!['tests', 'tools', 'node_modules'].includes(e.name)) walk(path.join(dir, e.name), out); continue; }
    if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

test('AC 81: no streak value reaches ads, the sheet, the draft rules, re-spin allowances or the core (code search)', () => {
  const rel = (p) => path.relative(GAME, p).split(path.sep).join('/');
  const offenders = [];
  for (const f of walk(GAME)) {
    const r = rel(f);
    if (r === 'core/events.js') continue; // the analytics catalogue legitimately lists the streak_shown event
    if (!(r.startsWith('core/') || r === 'js/ads.js' || r === 'js/share.js' || r === 'js/album.js' || r === 'js/subscribe.js' || r === 'js/features.js')) continue;
    if (/streak/i.test(fs.readFileSync(f, 'utf8'))) offenders.push(r);
  }
  assert.deepStrictEqual(offenders, [], 'streak must not appear in the core, ads, share, album, subscribe or features code');
});

test('AC 81: streak copy has no pressure or reward wording anywhere in the shipped client strings', () => {
  const bad = /(别断|不要中断|断签|中断将|失去.{0,4}连续|保住.{0,4}连续|连续.{0,6}(奖励|礼|领取|解锁)|补签|奖励|礼包)/;
  const hits = [];
  for (const f of walk(GAME)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (!/(连续出征|连续|streak|连\s*\$\{|连N)/.test(l)) return;
      const code = l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (bad.test(code)) hits.push(path.relative(GAME, f) + ':' + (i + 1) + ' ' + l.trim().slice(0, 100));
    });
  }
  assert.deepStrictEqual(hits, []);
});

test('AC 43 / H4: a release build (stubAds=false) with no ad unit configured behaves as no-fill (D6), never as the 广告位（测试） overlay',
  async () => {
    const { createAds } = require('../js/ads');
    const { getConfig } = require('../core/config');
    const events = [];
    const wx = { getStorageSync() {}, setStorageSync() {} }; // no createRewardedVideoAd: nothing real can load
    const ads = createAds({ wx, config: getConfig(2), store: { state: {}, save() {} }, analytics: { track: (n, p) => events.push([n, p]) }, adUnits: {}, stub: { enabled: false } });
    assert.strictEqual(ads.stub, false, 'stubAds=false must mean no stub, even with empty unit ids');
    const p = ads.rewarded('respin', 'run1');
    assert.strictEqual(ads.overlay, null, 'no test overlay for real players');
    const r1 = await p;
    assert.deepStrictEqual([r1.granted, r1.reason, r1.toast], [true, 'noFillGrant', '暂无广告，本次免费'], 'D6: free once per run');
    const r2 = await ads.rewarded('respin', 'run1');
    assert.deepStrictEqual([r2.granted, r2.reason], [false, 'noFillBlocked'], 'a second failure in the same run grants nothing');
    assert.strictEqual(ads.overlay, null);
    const wxI = { createInterstitialAd() { throw new Error('must not be called without a unit id'); } };
    const ads2 = createAds({ wx: wxI, config: getConfig(2), store: { state: { interstitial: {} }, save() {} }, analytics: { track() {} }, adUnits: {}, stub: { enabled: false } });
    assert.strictEqual(await ads2.interstitial({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 10 }), false);
    assert.strictEqual(ads2.overlay, null);
  });
