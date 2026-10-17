'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../core/present');

test('AC 16: a reveal has the label, +score, the 左边/右边 N 格 line and the markers (▼ ◆)', () => {
  const r = P.buildCardReveal({ pos: 63, ref: 60, n: 120, agreePct: 63, group: null });
  assert.equal(r.label, '很同频'); // d 3
  assert.equal(r.scoreText, '+92'); // d 3: 100 - ceil(7.5)
  assert.equal(r.nationText, '全国 ◆ 在你左边 3 格 · 实时');
  assert.equal(r.agreeText, '和全国 63% 的人想法相近');
  assert.equal(r.groupText, null);
  assert.deepEqual(r.markers, [{ pos: 60, kind: 'nation' }, { pos: 63, kind: 'you' }]);
});

test('AC 16: the right side, the same cell, and the 样本少 label below 30 answers', () => {
  assert.equal(P.buildCardReveal({ pos: 40, ref: 52, n: 100, agreePct: null, group: null }).nationText, '全国 ◆ 在你右边 12 格 · 实时');
  assert.equal(P.buildCardReveal({ pos: 40, ref: 40, n: 100, agreePct: null, group: null }).nationText, '全国 ◆ 和你一样 · 实时');
  const small = P.buildCardReveal({ pos: 40, ref: 52, n: 12, agreePct: null, group: null });
  assert.equal(small.nationText, '全国 (样本少) ◆ 在你右边 12 格 · 实时');
  assert.equal(small.agreeText, null, '和全国 x% only with >= 30 answers');
  assert.equal(P.buildCardReveal({ pos: 40, ref: 52, n: 12, agreePct: null, group: null, frozen: true }).nationText, '全国 ◆ 在你右边 12 格 · 定分');
});

test('AC 16: group markers and the 和你一样 rule (|● - ▼| <= 2)', () => {
  const g = { median: 52, n: 4, dots: [30, 50, 54, 70] };
  const r = P.buildCardReveal({ pos: 50, ref: 60, n: 100, agreePct: 40, group: g });
  assert.equal(r.groupText, '本群 4 人 ● 和你一样');
  assert.deepEqual(r.markers.map((m) => m.kind), ['nation', 'group', 'member', 'member', 'member', 'member', 'you']);
  const far = P.buildCardReveal({ pos: 50, ref: 60, n: 100, agreePct: 40, group: { median: 35, n: 2, dots: [30, 40] } });
  assert.equal(far.groupText, '本群 2 人 ● 在你左边 15 格');
  assert.equal(P.buildCardReveal({ pos: 50, ref: 60, n: 100, agreePct: 40, group: { median: null, n: 0, dots: [] } }).groupText, null, 'no ● without another member');
});

test('AC 17: only d <= 2 is a bullseye (confetti, chime, vibrate)', () => {
  const b = (d) => P.buildCardReveal({ pos: 50, ref: 50 + d, n: 50, agreePct: null, group: null }).bullseye;
  assert.equal(b(0), true);
  assert.equal(b(2), true);
  assert.equal(b(2.5), false);
  assert.equal(b(10), false);
});

test('AC 18: day result - total, band, rows, divisive, streak, group line, live vs final', () => {
  const cards = [0, 1, 2, 3, 4].map((i) => ({ prompt: '题' + i, left: '左' + i, right: '右' + i }));
  const o = {
    issueNo: 12,
    cards,
    positions: [50, 50, 50, 50, 50],
    refs: [50, 55, 60, 70, 100],
    total: 412,
    final: false,
    pct: 68,
    divisiveIdx: 2,
    streak: 5,
    group: { gs: 388, mq: 81, n: 6 },
  };
  const r = P.buildDayResult(o);
  assert.equal(r.totalText, '412');
  assert.equal(r.bandLabel, '默契十足');
  assert.equal(r.statusTag, '实时');
  assert.equal(r.percentileText, null, 'no percentile before 定分');
  assert.equal(r.rows.length, 5);
  assert.deepEqual(r.rows[0], { prompt: '题0', left: '左0', right: '右0', you: 50, nation: 50, label: '心有灵犀', scoreText: '+100' });
  assert.equal(r.divisiveText, '今日最有争议：题2 (左2↔右2)');
  assert.equal(r.streakText, '连续 5 天');
  assert.equal(r.groupText, '本群群内默契分 388 · 本群默契度 81');
  const fin = P.buildDayResult({ ...o, final: true });
  assert.equal(fin.statusTag, '定分');
  assert.equal(fin.percentileText, '超过全国 68%');
  assert.equal(P.buildDayResult({ ...o, final: true, pct: null }).percentileText, null);
  assert.equal(P.buildDayResult({ ...o, streak: 1 }).streakText, null);
  assert.equal(P.buildDayResult({ ...o, group: { gs: 388, mq: null, n: 2 } }).groupText, '本群群内默契分 388 · 本群完成满 3 人后计算默契度');
  assert.equal(P.buildDayResult({ ...o, group: null }).groupText, null);
  assert.equal(P.buildDayResult({ ...o, divisiveIdx: null }).divisiveText, null);
});

test('home strings and daily state (spec 6.1)', () => {
  assert.equal(P.homeScoreText(412, false), '今日默契分 412 · 默契十足 (实时)');
  assert.equal(P.homeScoreText(455, true), '今日默契分 455 · 灵魂同频 (定分)');
  assert.equal(P.yesterdayText(421, 68), '昨日定分 421 · 超过全国 68%');
  assert.equal(P.yesterdayText(421, null), '昨日定分 421');
  assert.equal(P.homeDailyState({ loading: true }), 'loading');
  assert.equal(P.homeDailyState({ unavailable: true }), 'unavailable');
  assert.equal(P.homeDailyState({ offline: true }), 'offline');
  assert.equal(P.homeDailyState({ error: true }), 'error');
  assert.equal(P.homeDailyState({ pendingSubmit: true, answered: 2 }), 'pendingSubmit');
  assert.equal(P.homeDailyState({ complete: true, answered: 5 }), 'done');
  assert.equal(P.homeDailyState({ answered: 2 }), 'inProgress');
  assert.equal(P.homeDailyState({ answered: 0 }), 'available');
});

test('round strings (spec 6.6, 6.7)', () => {
  assert.equal(P.clueText({ clueMode: 'preset', clueText: '一张电影票' }), '提示：一张电影票');
  assert.equal(P.clueText({ clueMode: 'chat', clueText: null }), '提示在群聊里，看看 TA 怎么说');
  assert.equal(P.clueText({ clueMode: null }), '');
  assert.equal(P.guessCountText(3), '已有 3 人作答');
  assert.equal(P.guessCountText(0), '还没有人作答');
  assert.equal(P.submittedText(5), '已提交 · 已有 5 人作答 · 等待揭晓');
  assert.equal(P.mqText(78), '本题默契值 78');
  assert.equal(P.mqText(null), null);
  assert.equal(P.revealHint(false, 1), '至少 2 人作答后可揭晓');
  assert.equal(P.roundStatusText('open'), '等待揭晓');
  assert.equal(P.roundStatusText('revealed'), '已揭晓');
  assert.equal(P.roundStatusText('noGuesses'), '无人作答');
});

test('round view status for each viewer', () => {
  const s = P.roundViewStatus;
  assert.equal(s({ notFound: true }), 'notFound');
  assert.equal(s({ status: 'noGuesses' }), 'noGuesses');
  assert.equal(s({ status: 'open', isHost: true }), 'hostWaiting');
  assert.equal(s({ status: 'open', isHost: false, myGuess: null }), 'open');
  assert.equal(s({ status: 'open', isHost: false, myGuess: { pos: 3 } }), 'submitted');
  assert.equal(s({ status: 'revealed', isHost: true }), 'revealed');
  assert.equal(s({ status: 'revealed', isHost: false, myGuess: { pos: 3 } }), 'revealed');
  assert.equal(s({ status: 'revealed', isHost: false, myGuess: null }), 'revealedUnplayed');
  assert.equal(s({ status: 'revealed', isHost: false, myGuess: null, expired: true }), 'expired');
});

test('group page state and labels (spec 6.8)', () => {
  assert.equal(P.groupState({ n: 0, viewerDone: true }), 'empty');
  assert.equal(P.groupState({ n: 6, viewerDone: false }), 'notPlayed');
  assert.equal(P.groupState({ n: 2, viewerDone: true }), 'small');
  assert.equal(P.groupState({ n: 3, viewerDone: true }), 'ready');
  assert.equal(P.trendLabel('20261014'), '10/14');
  assert.equal(P.dateText('20261014'), '10月14日');
  assert.equal(P.dateText('20261104'), '11月4日');
});
