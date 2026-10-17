'use strict';
// AC 18 (daily caps), 52, 55, 56, 51 (moderation env), 44-48 (verdict planning), 65-66 (strike ladder), 78 (quiet hours),
// 101-102 (rewards), 75 (analytics sanitising), config clamping.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../core/allowance');
const St = require('../core/strikes');
const M = require('../core/moderation');
const N = require('../core/notice');
const An = require('../core/analytics');
const { applyRemote, ugcCreateAllowed, CONFIG } = require('../core/config');
const S = require('../core/strokes');

const D1 = '20261101';
const D2 = '20261102';
const DAY = 86400e3;
const T0 = Date.UTC(2026, 10, 1, 4, 0, 0);

test('AC 18: 3 free starts + up to 2 rewarded; START_LIMIT after; resets at the next Beijing day', () => {
  let p = A.newPlayer('u', T0);
  assert.deepEqual(A.startsLeft(p, D1), { startsLeft: 3, adStartsLeft: 2, freeLeft: 3 });
  for (let i = 0; i < 3; i++) p = A.consumeStart(p, D1);
  assert.equal(A.checkStart(p, D1).code, 'START_LIMIT');
  let g = A.grantReward(p, 'start', false, D1);
  assert.equal(g.ok, true);
  assert.equal(g.startsLeft, 1);
  assert.equal(g.adStartsLeft, 1);
  p = A.consumeStart(g.player, D1);
  g = A.grantReward(p, 'start', false, D1);
  p = A.consumeStart(g.player, D1);
  assert.equal(A.checkStart(p, D1).code, 'START_LIMIT');
  assert.equal(A.grantReward(p, 'start', false, D1).code, 'REWARD_LIMIT', 'a third rewarded start');
  assert.equal(A.checkStart(p, D2), null, 'next day: reset');
  assert.equal(A.startsLeft(p, D2).startsLeft, 3);
});

test('AC 18: 80 sent turns per day, 3 claims per chain per day, 10 reports per day, each with its code', () => {
  let p = A.newPlayer('u', T0);
  for (let i = 0; i < 80; i++) {
    assert.equal(A.checkSteps(p, D1), null);
    p = A.consumeStep(p, D1);
  }
  assert.equal(A.checkSteps(p, D1).code, 'STEP_LIMIT');
  assert.equal(A.checkSteps(p, D2), null);
  for (let i = 0; i < 3; i++) p = A.consumeClaim(p, D1, 'CH1');
  assert.equal(A.checkClaims(p, D1, 'CH1').code, 'CLAIM_LIMIT');
  assert.equal(A.checkClaims(p, D1, 'CH2'), null, 'per chain');
  assert.equal(A.checkClaims(p, D2, 'CH1'), null);
  for (let i = 0; i < 10; i++) {
    assert.equal(A.checkReports(p, D1), null);
    p = A.consumeReport(p, D1);
  }
  assert.equal(A.checkReports(p, D1).code, 'REPORT_LIMIT');
  assert.equal(A.checkReports(p, D2), null);
});

test('AC 46: a void refunds the step and the start only inside the same Beijing day', () => {
  let p = A.consumeStep(A.consumeStart(A.newPlayer('u', T0), D1), D1);
  assert.equal(A.refundStep(A.refundStart(p, D1), D1).day.steps, 0);
  assert.equal(A.refundStart(p, D1).day.starts, 0);
  assert.equal(A.refundStart(p, D2).day.starts, 1, 'a different day: counters were reset, nothing to refund');
  assert.equal(A.refundStep(A.newPlayer('v', T0), D1).day.steps, 0);
});

test('AC 101/102: rewards are capped (2 starts, 1 palette per day); no-fill grants once per day per placement', () => {
  let p = A.newPlayer('u', T0);
  let g = A.grantReward(p, 'palette', false, D1);
  assert.deepEqual([g.ok, g.paletteToday], [true, true]);
  assert.equal(A.paletteToday(g.player, D1), true);
  assert.equal(A.paletteToday(g.player, D2), false, 'gone after 24:00 BJT (AC 22)');
  assert.equal(A.grantReward(g.player, 'palette', false, D1).code, 'REWARD_LIMIT');
  // no-fill: once per placement per day
  g = A.grantReward(p, 'start', true, D1);
  assert.equal(g.ok, true);
  assert.equal(A.grantReward(g.player, 'start', true, D1).code, 'REWARD_LIMIT');
  assert.equal(A.grantReward(g.player, 'palette', true, D1).ok, true, 'a different placement');
  assert.equal(A.grantReward(g.player, 'start', true, D2).ok, true, 'next day');
  assert.equal(A.grantReward(p, 'coins', false, D1).code, 'BAD_REQUEST');
});

test('AC 65: strike ladder over a rolling 30 days: 1 warn, 2 -> 24 h, 3 -> 7 d, >= 4 -> 30 d + flag', () => {
  let p = A.newPlayer('u', T0);
  let r = St.applyStrike(p, { stepId: 's1', src: 'verdict' }, T0);
  assert.deepEqual([r.count, r.warn, r.restrictedUntil, r.flagged], [1, true, 0, false]);
  assert.equal(r.player.warnPending, true);
  r = St.applyStrike(r.player, { stepId: 's2', src: 'report' }, T0 + 1000);
  assert.deepEqual([r.count, r.restrictedUntil], [2, T0 + 1000 + DAY]);
  assert.equal(St.restrictionOf(r.player, T0 + 2000).until, T0 + 1000 + DAY);
  assert.equal(St.restrictionOf(r.player, T0 + 1000 + DAY), null, 'ends at the end time');
  r = St.applyStrike(r.player, { stepId: 's3', src: 'verdict' }, T0 + 2000);
  assert.equal(r.restrictedUntil, T0 + 2000 + 7 * DAY);
  r = St.applyStrike(r.player, { stepId: 's4', src: 'verdict' }, T0 + 3000);
  assert.deepEqual([r.count, r.restrictedUntil, r.flagged], [4, T0 + 3000 + 30 * DAY, true]);
  r = St.applyStrike(r.player, { stepId: 's5', src: 'verdict' }, T0 + 4000);
  assert.equal(r.restrictedUntil, T0 + 4000 + 30 * DAY, '5th stays at the 30-day rung');
  // rolling window: strikes older than 30 days no longer count
  const later = T0 + 31 * DAY;
  assert.equal(St.activeStrikes(r.player.strikes, later).length, 0);
  const fresh = St.applyStrike(r.player, { stepId: 's6', src: 'verdict' }, later);
  assert.equal(fresh.count, 1);
  assert.equal(fresh.restrictedUntil, r.restrictedUntil, 'a restriction is never shortened by a lower rung');
});

test('AC 65: only risky verdicts and upheld reports are strikes: review, local rejection and void add none (by construction)', () => {
  assert.deepEqual(M.verdictOf('review'), { outcome: 'blocked', strike: false });
  assert.deepEqual(M.verdictOf('risky'), { outcome: 'blocked', strike: true });
  assert.deepEqual(M.verdictOf('pass'), { outcome: 'passed', strike: false });
  assert.equal(M.verdictOf('nonsense'), null);
  assert.equal(M.verdictOf(undefined), null);
});

test('AC 66 and admin ops: restriction copy shows the end time in Beijing time; permanent and lift', () => {
  const until = Date.UTC(2026, 9, 17, 6, 0, 0); // 14:00 BJT
  assert.equal(St.bjtText(until), '10月17日 14:00');
  assert.match(St.restrictionText({ until }), /^你暂时不能参与接龙（至 10月17日 14:00）。原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。$/);
  let p = St.restrict(A.newPlayer('u', T0), { permanent: true }, T0);
  assert.equal(St.restrictionOf(p, T0 + 999 * DAY).permanent, true);
  assert.doesNotMatch(St.restrictionText(St.restrictionOf(p, T0)), /至/);
  p = St.liftRestriction(p);
  assert.equal(St.restrictionOf(p, T0), null);
  p = St.restrict(p, { days: 2 }, T0);
  assert.equal(St.restrictionOf(p, T0).until, T0 + 2 * DAY);
  assert.match(St.WARNING_TEXT, /接龙公约/);
});

test('AC 44-48: verdict planning: apply on pending; ignore duplicates and unknown; late risky on a void step still strikes', () => {
  assert.deepEqual(M.planVerdict('pending', 'pass'), { action: 'apply', outcome: 'passed', strike: false });
  assert.deepEqual(M.planVerdict('pending', 'review'), { action: 'apply', outcome: 'blocked', strike: false });
  assert.deepEqual(M.planVerdict('pending', 'risky'), { action: 'apply', outcome: 'blocked', strike: true });
  assert.equal(M.planVerdict(null, 'pass').action, 'ignore');
  assert.equal(M.planVerdict(undefined, 'risky').strike, false);
  for (const s of ['passed', 'blocked', 'hidden', 'deleted']) assert.deepEqual([M.planVerdict(s, 'risky').action, M.planVerdict(s, 'risky').strike], ['ignore', false], s);
  assert.deepEqual([M.planVerdict('void', 'risky').action, M.planVerdict('void', 'risky').strike], ['ignore', true]);
  assert.equal(M.planVerdict('void', 'pass').strike, false);
  assert.equal(M.planVerdict('pending', 'weird').action, 'ignore');
});

test('AC 46/47: pending drawing plan: wait 35 min, one re-check, then void; call errors retried at +5 and +10 min, then void', () => {
  const mk = (o) => ({ submittedAt: T0, traceIds: ['t'], lastCheckAt: T0, rechecks: 0, callErrors: 0, ...o });
  const min = 60e3;
  assert.equal(M.planPendingImage(mk(), T0 + 34 * min).action, 'wait');
  assert.equal(M.planPendingImage(mk(), T0 + 35 * min).action, 'recheck');
  assert.equal(M.planPendingImage(mk({ rechecks: 1, lastCheckAt: T0 + 35 * min }), T0 + 69 * min).action, 'wait');
  assert.deepEqual(M.planPendingImage(mk({ rechecks: 1, lastCheckAt: T0 + 35 * min }), T0 + 70 * min), { action: 'void', reason: 'timeout' });
  const err = (n) => mk({ lastCheckAt: null, traceIds: [], callErrors: n });
  assert.equal(M.planPendingImage(err(1), T0 + 4 * min).action, 'wait');
  assert.equal(M.planPendingImage(err(1), T0 + 5 * min).action, 'retryCall');
  assert.equal(M.planPendingImage(err(2), T0 + 9 * min).action, 'wait');
  assert.equal(M.planPendingImage(err(2), T0 + 10 * min).action, 'retryCall');
  assert.deepEqual(M.planPendingImage(err(3), T0 + 10 * min), { action: 'void', reason: 'error' });
});

test('AC 51: mock moderation in production is a configuration error; unknown or unset env is production; dev may mock', () => {
  assert.deepEqual(M.resolveEnv({ envKind: 'prod', mode: 'mock' }), { ok: false, code: 'SERVER_CONFIG', alert: '[ALERT] MODERATION_MODE=mock in production' });
  assert.equal(M.resolveEnv({ envKind: undefined, mode: 'mock' }).ok, false, 'unset ENV_KIND counts as prod');
  assert.equal(M.resolveEnv({ envKind: 'staging', mode: 'mock' }).ok, false);
  assert.deepEqual(M.resolveEnv({ envKind: 'prod' }), { ok: true, envKind: 'prod', mode: 'live' });
  assert.deepEqual(M.resolveEnv({ envKind: 'prod', mode: 'live' }), { ok: true, envKind: 'prod', mode: 'live' });
  assert.deepEqual(M.resolveEnv({ envKind: 'dev', mode: 'mock' }), { ok: true, envKind: 'dev', mode: 'mock' });
  assert.equal(M.resolveEnv({ envKind: 'dev', mode: 'weird' }).ok, false);
});

test('AC 52: dev + live caps msgSecCheck calls per day at the budget (default 80); prod and mock are not budgeted', () => {
  const dev = { envKind: 'dev', mode: 'live' };
  assert.equal(M.textBudgetAllows(dev, 79), true);
  assert.equal(M.textBudgetAllows(dev, 80), false);
  assert.equal(M.textBudgetAllows(dev, 5, 5), false);
  assert.equal(M.textBudgetAllows({ envKind: 'prod', mode: 'live' }, 10 ** 6), true);
  assert.equal(M.textBudgetAllows({ envKind: 'dev', mode: 'mock' }, 10 ** 6), true);
});

test('mock moderation rules (6.6): text keywords and drawing stroke counts', () => {
  assert.deepEqual(M.mockText('这是测试违规内容'), { suggest: 'risky' });
  assert.deepEqual(M.mockText('测试复审'), { suggest: 'review' });
  assert.deepEqual(M.mockText('测试繁忙'), { error: true });
  assert.deepEqual(M.mockText('普通的一句话'), { suggest: 'pass' });
  const n = (k) => ({ v: 1, s: Array.from({ length: k }, () => [0, 0, 1, 1]) });
  assert.deepEqual(M.mockImage(n(13)), { suggest: 'risky' });
  assert.deepEqual(M.mockImage(n(14)), { suggest: 'review' });
  assert.equal(M.mockImage(n(15)), null);
  for (const k of [1, 12, 16, 100]) assert.deepEqual(M.mockImage(n(k)), { suggest: 'pass' });
});

test('AC 37/42: the real API parameters: scene 3, version 2, media_type 2, the author\'s openid', () => {
  assert.deepEqual(M.textCheckParams('一只猫', 'oXYZ'), { content: '一只猫', version: 2, scene: 3, openid: 'oXYZ' });
  assert.deepEqual(M.mediaCheckParams('https://tmp/x.png', 'oXYZ'), { media_url: 'https://tmp/x.png', media_type: 2, version: 2, scene: 3, openid: 'oXYZ' });
  assert.equal(M.modPngPath('ABCDEFGHJK', 3, 2, Date.UTC(2026, 10, 15)), 'chuanhua/mod/202611/ABCDEFGHJK/3_2.png');
  assert.equal(M.modPngPath('ABCDEFGHJK', 1, 1, Date.UTC(2026, 9, 31, 16, 0)), 'chuanhua/mod/202611/ABCDEFGHJK/1_1.png', 'month by Beijing time');
});

test('AC 56: image quota levels: ok < 70% <= alert < 95% <= pauseCreate < 100% <= failClosed', () => {
  const lim = 200000;
  assert.equal(M.quotaLevel(139999, lim), 'ok');
  assert.equal(M.quotaLevel(140000, lim), 'alert');
  assert.equal(M.quotaLevel(189999, lim), 'alert');
  assert.equal(M.quotaLevel(190000, lim), 'pauseCreate');
  assert.equal(M.quotaLevel(199999, lim), 'pauseCreate');
  assert.equal(M.quotaLevel(200000, lim), 'failClosed');
});

test('AC 55: breaker trips at >= 50% failures over >= 20 calls and pauses creation for 15 minutes', () => {
  assert.equal(M.breakerDecision({ total: 19, failed: 19 }, T0).trip, false, 'too few calls');
  assert.equal(M.breakerDecision({ total: 20, failed: 9 }, T0).trip, false);
  assert.deepEqual(M.breakerDecision({ total: 20, failed: 10 }, T0), { trip: true, pausedUntil: T0 + 15 * 60e3 });
  // config: UGC paused until
  assert.deepEqual(ugcCreateAllowed({ createEnabled: true, autoPausedUntil: T0 + 1000 }, T0), { ok: false, source: 'breaker' });
  assert.equal(ugcCreateAllowed({ createEnabled: true, autoPausedUntil: T0 }, T0).ok, true);
  assert.deepEqual(ugcCreateAllowed({ createEnabled: false }, T0), { ok: false, source: 'switch' });
  assert.equal(ugcCreateAllowed(undefined, T0).ok, true);
});

test('AC 78: reveal notices are held between 22:00 and 08:00 Beijing time until 08:00', () => {
  const bj = (d, h, m) => Date.UTC(2026, 10, d, h - 8, m || 0);
  assert.equal(N.noticeSendTime(bj(5, 12)), bj(5, 12));
  assert.equal(N.noticeSendTime(bj(5, 8)), bj(5, 8));
  assert.equal(N.noticeSendTime(bj(5, 21, 59)), bj(5, 21, 59));
  assert.equal(N.noticeSendTime(bj(5, 22)), bj(6, 8));
  assert.equal(N.noticeSendTime(bj(5, 23, 30)), bj(6, 8));
  assert.equal(N.noticeSendTime(bj(6, 0, 1)), bj(6, 8));
  assert.equal(N.noticeSendTime(bj(6, 7, 59)), bj(6, 8));
  assert.equal(N.inQuietHours(bj(6, 3)), true);
});

test('remote config is clamped; missing or bad config means defaults (UGC on, optional features off)', () => {
  const d = applyRemote(null);
  assert.deepEqual(d.ugc, { createEnabled: true, viewEnabled: true, autoPausedUntil: 0 });
  assert.equal(d.subscribe, null);
  assert.equal(d.features.updatableCard, false);
  assert.equal(d.banner.enabled, false);
  assert.equal(d.config.timers.drawSec, 60);
  const r = applyRemote({ ugc: { createEnabled: false }, timers: { drawSec: 9999, describeSec: 3 }, ads: { interstitial: { minGapSec: 5, maxPerDay: 99, minLifetimeReveals: 3 }, banner: { enabled: true, adUnitId: 'u' } }, subscribe: { tmplId: 'T' }, features: { updatableCard: true } });
  assert.equal(r.ugc.createEnabled, false);
  assert.equal(r.ugc.viewEnabled, true);
  assert.equal(r.config.timers.drawSec, 180);
  assert.equal(r.config.timers.describeSec, 15);
  assert.equal(r.config.ads.interstitial.minGapSec, 180);
  assert.equal(r.config.ads.interstitial.maxPerDay, 3);
  assert.deepEqual(r.subscribe, { tmplId: 'T' });
  assert.equal(r.features.updatableCard, true);
  assert.deepEqual(r.banner, { enabled: true, adUnitId: 'u' });
  assert.equal(applyRemote({ ugc: 'nope', timers: 5 }).ugc.createEnabled, true);
  assert.equal(CONFIG.timers.drawSec, 60, 'defaults untouched');
});

test('AC 75: analytics events keep only whitelisted names and scalar props; text, strokes, ids and long strings are dropped', () => {
  const clean = An.sanitizeEvents([
    { name: 'step_submit', props: { chainId: 'ABCDEFGHJK', step: 3, kind: 'draw', durationMs: 5000, auto: false, text: '你好', strokes: { v: 1 }, openid: 'o123456789012345678901234567', groupRef: 'abc', promptText: 'x' }, sessionId: 's1', clientTs: 5 },
    { name: 'not_an_event', props: {} },
    { name: 'error', props: { where: 'x'.repeat(100), code: 'NETWORK', nested: { a: 1 }, arr: [1], nul: null, ownerOpenid: 'oAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } },
    null,
    'x',
  ]);
  assert.equal(clean.length, 2);
  assert.deepEqual(clean[0].props, { chainId: 'ABCDEFGHJK', step: 3, kind: 'draw', durationMs: 5000, auto: false });
  assert.deepEqual(clean[1].props, { code: 'NETWORK' });
  assert.equal(clean[0].sessionId, 's1');
  assert.deepEqual(An.sanitizeEvents('nope'), []);
  assert.equal(An.sanitizeEvents(Array.from({ length: 80 }, () => ({ name: 'error', props: {} }))).length, 50);
  for (const e of clean) assert.doesNotMatch(JSON.stringify(e), /你好|strokes|openid|groupRef/i);
});

test('strokes sanity for the policy tests: the mock image rule counts strokes of a validated drawing', () => {
  assert.equal(S.validate({ v: 1, s: Array.from({ length: 13 }, () => [0, 0, 1, 1]) }).ok, true);
});
