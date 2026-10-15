'use strict';
// View models for every spec screen and state (spec 8, 12): field names and pre-formatted strings.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/vm');
const St = require('../core/strokes');
const { createMockServer } = require('../js/mock-server');

const NOW = Date.UTC(2026, 10, 20, 4, 0, 0);
const prompts = [{ id: 'A01', text: '小猫吃面条' }, { id: 'B02', text: '热腾腾的饺子' }, { id: 'C03', text: '厨师颠勺' }];
const homeBase = { state: 'ready', dateKey: '20261120', prompts, counts: {}, streak: 0, startsLeft: 3, adStartsLeft: 2, hasGroupContext: false, unseenReveals: 0, restriction: null, ugcPaused: false, warnPending: false, showHowTo: false };
const strokes = (n) => ({ v: 1, s: Array.from({ length: n }, (_, i) => St.makeStroke(i % 6, 1, [[10, 10 + i], [200, 200]])) });

test('home: every state of spec 8.1', () => {
  let v = V.homeVm(homeBase);
  assert.deepEqual(Object.keys(v).filter((k) => !/extra/.test(k)).slice(0, 9), ['state', 'daily', 'streakText', 'start', 'groupLine', 'album', 'restriction', 'ugcPausedText', 'showHowToOnce']);
  assert.equal(v.daily.dateText, '11月20日');
  assert.equal(v.daily.countText, null);
  assert.equal(v.streakText, null);
  assert.deepEqual([v.start.label, v.start.sublabel, v.start.enabled, v.start.freeLeft, v.start.adLeft], ['开一条接龙', '今天还能开 3 条', true, 3, 2]);
  assert.equal(v.groupLine.show, false);
  // count line only when >= 30; streak only when >= 2
  v = V.homeVm(Object.assign({}, homeBase, { counts: { A01: 1000, B02: 1315, C03: 0 }, streak: 4 }));
  assert.equal(v.daily.countText, '全国已有 2,315 条从这里出发');
  assert.equal(v.streakText, '连续接龙 4 天');
  assert.equal(V.homeVm(Object.assign({}, homeBase, { counts: { A01: 29 } })).daily.countText, null);
  assert.equal(V.homeVm(Object.assign({}, homeBase, { counts: { A01: 30 } })).daily.countText, '全国已有 30 条从这里出发');
  assert.equal(V.homeVm(Object.assign({}, homeBase, { streak: 1 })).streakText, null);
  // group line
  v = V.homeVm(Object.assign({}, homeBase, { hasGroupContext: true, waitingInGroup: 2 }));
  assert.deepEqual([v.groupLine.show, v.groupLine.text], [true, '来自群聊 · 本群有 2 条等你接']);
  assert.equal(V.homeVm(Object.assign({}, homeBase, { hasGroupContext: true, waitingInGroup: 0 })).groupLine.text, '来自群聊 · 本群接龙');
  // starts used up
  v = V.homeVm(Object.assign({}, homeBase, { startsLeft: 0 }));
  assert.deepEqual([v.start.label, v.start.enabled, v.start.adLabel, v.start.sublabel], ['今天的 3 条已开完', false, '▶ 看视频再开一条 (剩 2)', null]);
  v = V.homeVm(Object.assign({}, homeBase, { startsLeft: 0, adStartsLeft: 0 }));
  assert.deepEqual([v.start.adLabel, v.start.sublabel], [null, '明天再来开新的吧']);
  // loading, offline, error
  assert.equal(V.homeVm(Object.assign({}, homeBase, { state: 'loading' })).start.enabled, false);
  v = V.homeVm(Object.assign({}, homeBase, { state: 'offline' }));
  assert.deepEqual([v.start.enabled, v.offlineText], [false, '需联网才能接龙']);
  // restricted / paused / warning / how-to / unseen
  v = V.homeVm(Object.assign({}, homeBase, { restriction: { until: Date.UTC(2026, 9, 17, 6, 0), permanent: false } }));
  assert.equal(v.restriction.text, '你暂时不能参与接龙（至 10月17日 14:00）。原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。');
  assert.equal(v.start.enabled, false);
  assert.equal(V.homeVm(Object.assign({}, homeBase, { ugcPaused: true })).ugcPausedText, '接龙维护中，可以先看看已揭晓的接龙');
  assert.equal(V.homeVm(Object.assign({}, homeBase, { warnPending: true })).showRulesWarning, true);
  assert.equal(V.homeVm(Object.assign({}, homeBase, { showHowTo: true })).showHowToOnce, true);
  assert.equal(V.homeVm(Object.assign({}, homeBase, { unseenReveals: 1 })).album.unseenReveals, 1);
});

test('rules sheet and picker', () => {
  assert.deepEqual(V.rulesVm({ open: true, pendingAction: 'start' }), { version: 1, open: true, pendingAction: 'start', lines: [] });
  const p = { state: 'ready', prompts: prompts.map((x) => Object.assign({ isDaily: true }, x)), selectedId: 'A01', custom: { open: false, text: '' }, errorText: null };
  let v = V.pickerVm(p);
  assert.deepEqual([v.state, v.selectedId, v.canStart, v.startLabel], ['ready', 'A01', true, '开始画 (60 秒)']);
  assert.equal(v.custom.count, '0/12');
  v = V.pickerVm(Object.assign({}, p, { state: 'creating' }));
  assert.deepEqual([v.canStart, v.startLabel], [false, '准备画布…']);
  v = V.pickerVm(Object.assign({}, p, { custom: { open: true, text: '一', error: null } }));
  assert.deepEqual([v.canStart, v.custom.count], [false, '1/12']);
  v = V.pickerVm(Object.assign({}, p, { custom: { open: true, text: '我家的小猫', error: '换个说法吧' } }));
  assert.deepEqual([v.canStart, v.custom.count, v.custom.error], [true, '5/12', '换个说法吧']);
  assert.equal(V.pickerVm(Object.assign({}, p, { state: 'offline', errorText: '需联网才能开始' })).state, 'offline');
  assert.equal(V.pickerVm(Object.assign({}, p, { selectedId: null })).canStart, false);
});

test('draw: title, timer, palette, limits, ad offer, report visibility', () => {
  const turn = { chainId: 'c', claimId: 'k', step: 3, startedAt: NOW, source: { kind: 'text', text: '恐龙在学跳舞' } };
  const info = { colorIdx: 0, sizeIdx: 1, points: 10, pointsMax: 4000, canUndo: true, strokes: 1, limit: false };
  let v = V.drawVm({ turn, info, drawing: strokes(1), unlocked: false, paletteAdOffered: true, status: 'drawing', now: NOW + 12e3 });
  assert.deepEqual([v.title, v.canReport, v.timer.secLeft, v.timer.warn, v.timer.text], ['第 3 棒 · 画出来', true, 48, false, '0:48']);
  assert.equal(v.sourceLabel, '上一棒说：「恐龙在学跳舞」');
  assert.equal(v.palette.length, 12);
  assert.equal(v.palette.filter((p) => !p.locked).length, 6);
  assert.deepEqual([v.pointsUsed, v.pointsMax, v.canUndo, v.canSubmit, v.paletteAd.show], [10, 4000, true, true, false]); // a stroke exists: the ad is gone
  v = V.drawVm({ turn, info: Object.assign({}, info, { strokes: 0, canUndo: false }), drawing: strokes(0), unlocked: false, paletteAdOffered: true, status: 'drawing', now: NOW });
  assert.deepEqual([v.canSubmit, v.paletteAd.show], [false, true]);
  v = V.drawVm({ turn, info: Object.assign({}, info, { strokes: 0 }), drawing: strokes(0), unlocked: true, paletteAdOffered: true, status: 'drawing', now: NOW });
  assert.deepEqual([v.paletteAd.show, v.palette.filter((p) => p.locked).length], [false, 0]);
  v = V.drawVm({ turn, info, drawing: strokes(1), unlocked: false, status: 'drawing', now: NOW + 51e3 });
  assert.deepEqual([v.timer.secLeft, v.timer.warn], [9, true]);
  v = V.drawVm({ turn, info: Object.assign({}, info, { limit: true }), drawing: strokes(1), status: 'drawing', now: NOW });
  assert.equal(v.notice, '画得太细啦，先交吧');
  v = V.drawVm({ turn, info, drawing: strokes(1), status: 'submitting', now: NOW });
  assert.deepEqual([v.status, v.canSubmit], ['submitting', false]);
  v = V.drawVm({ turn: Object.assign({}, turn, { step: 1, source: { kind: 'prompt', text: '小猫吃面条' } }), info, drawing: strokes(1), status: 'error', errorText: '没传出去', now: NOW });
  assert.deepEqual([v.canReport, v.sourceLabel, v.errorText, v.title], [false, '题目：「小猫吃面条」', '没传出去', '第 1 棒 · 画出来']);
  assert.equal(V.drawVm({ turn, info, drawing: strokes(1), status: 'drawing', now: NOW, coach: true }).coach, '一根手指画，画得丑没关系，越离谱越好笑');
});

test('describe: counter, submit gate, timer 45 s, statuses', () => {
  const turn = { chainId: 'c', claimId: 'k', step: 4, startedAt: NOW, source: { kind: 'draw', strokes: strokes(2) } };
  let v = V.describeVm({ turn, text: '', status: 'typing', now: NOW });
  assert.deepEqual([v.title, v.count, v.canSubmit, v.timer.secLeft, v.canReport], ['第 4 棒 · 猜一猜', '0/16', false, 45, true]);
  assert.equal(v.drawing.s.length, 2);
  v = V.describeVm({ turn, text: '猫', status: 'typing', now: NOW });
  assert.equal(v.canSubmit, false);
  v = V.describeVm({ turn, text: '一只猫在开出租车', status: 'typing', now: NOW + 14e3 });
  assert.deepEqual([v.count, v.canSubmit, v.timer.text], ['8/16', true, '0:31']);
  for (const s of ['submitting', 'blocked', 'busy', 'error', 'timeUp']) assert.equal(V.describeVm({ turn, text: '一只猫', status: s, errorText: 'x', now: NOW }).status, s);
  assert.equal(V.describeVm({ turn, text: '一只猫', status: 'submitting', now: NOW }).canSubmit, false);
});

test('已传出: pending / passed / blocked / void, first-time explainer, subscribe', () => {
  const base = { chainId: 'c', step: 3, kind: 'draw', mine: { strokes: strokes(1) }, modState: 'pending', subscribe: 'offer', firstTime: true, revealed: false, updatable: true };
  let v = V.sentVm(base);
  assert.deepEqual([v.modText, v.nextText, v.autoUpdateNote, v.subscribe.state, v.firstTimeExplainer], ['审核中，通过后传给下一位', '通过后，群友就能接第 4 棒', true, 'offer', true]);
  assert.equal(v.explainerText, '你只能看到上一棒，下一位也只能看到你这一棒。全部传完后，参与的人一起看揭晓。');
  v = V.sentVm(Object.assign({}, base, { modState: 'passed', firstTime: false }));
  assert.deepEqual([v.modText, v.firstTimeExplainer], ['已通过', false]);
  v = V.sentVm(Object.assign({}, base, { modState: 'blocked' }));
  assert.deepEqual([v.modText, v.nextText, v.canShare, v.autoUpdateNote], ['这一棒没通过内容审核，没有传出去', null, false, false]);
  v = V.sentVm(Object.assign({}, base, { modState: 'void' }));
  assert.equal(v.modText, '审核超时，这一棒没有传出去，不算你的次数');
  assert.equal(V.sentVm(Object.assign({}, base, { updatable: false })).autoUpdateNote, false);
  assert.equal(V.sentVm(Object.assign({}, base, { subscribe: undefined })).subscribe.state, 'hidden');
});

test('chain entry: every state of spec 8.7 with its copy, and never any content', () => {
  const live = { passed: 3, length: 6, nextStep: 4, nextKind: 'describe', isParticipant: false, isStarter: false, canRevealNow: false, canSameAgain: false, expiresAt: NOW + 31 * 3600e3 - 1000, serverNow: NOW };
  const e = (state, extra) => V.entryVm(Object.assign({}, live, { state }, extra || {}));
  let v = e('claimable');
  assert.deepEqual([v.headline, v.subline, v.limitText, v.timeLeftText, v.progressText, v.primary.label], ['第 4 棒等你接', '上一棒是一幅画，你来猜一句', '（限时 45 秒）', '还剩 31 小时', '已传 3/6 棒', '接这一棒']);
  assert.equal(e('claimable', { nextStep: 3, nextKind: 'draw' }).limitText, '（限时 60 秒）');
  assert.equal(e('claimable', { nextStep: 3, nextKind: 'draw' }).subline, '上一棒是一句话，你来画出来');
  assert.equal(e('taken').headline, '有群友正在接第 4 棒（约 2 分钟内）');
  assert.equal(e('pending', { nextStep: 3 }).headline, '第 3 棒审核中，通常几分钟');
  assert.equal(e('prevMine').headline, '上一棒是你传的，等别人接下一棒吧');
  assert.equal(e('capReached', { code: 'CAP_REACHED' }).headline, '这条接龙你已经接了 3 棒，留给群友吧');
  assert.equal(e('capReached', { code: 'STEP_LIMIT' }).headline, '今天接得够多啦，明天再来');
  assert.equal(e('wrongGroup').headline, '接龙只能在发起的群里接力');
  assert.equal(e('revealedParticipant', { isParticipant: true }).headline, '接龙揭晓了！');
  assert.equal(e('revealedParticipant', { isParticipant: true }).primary.label, '看揭晓');
  assert.equal(e('revealedTeaser').headline, '一条接龙揭晓了');
  v = e('expired', { isParticipant: true, canSameAgain: true });
  assert.deepEqual([v.headline, v.canSeeMine, v.canSameAgain, v.nextStep], ['这条接龙没传完', true, true, null]);
  assert.equal(e('removed').headline, '该接龙已被移除');
  assert.equal(e('notFound').headline, '找不到这条接龙');
  assert.match(e('restricted', { until: Date.UTC(2026, 9, 17, 6, 0) }).headline, /^你暂时不能参与接龙（至 10月17日 14:00）/);
  assert.equal(e('ugcPaused').headline, '接龙维护中，可以先看看已揭晓的接龙');
  assert.equal(e('offline').headline, '需联网才能接龙');
  assert.equal(e('offline').retry, true);
  assert.equal(e('loading').headline, '展开接龙…');
  assert.equal(e('error').retry, true);
  v = e('rulesRequired');
  assert.equal(v.primary.opensRules, true);
  // starter reveal-now only when allowed and live
  assert.equal(e('claimable', { isStarter: true, canRevealNow: true }).canRevealNow, true);
  assert.equal(e('revealedParticipant', { canRevealNow: true }).canRevealNow, false);
  assert.equal(e('claimable', { isParticipant: true }).canShare, true);
  assert.equal(e('claimable').canShare, false);
  for (const s of ['claimable', 'taken', 'pending', 'prevMine', 'capReached', 'wrongGroup', 'expired', 'removed', 'notFound']) assert.ok(!/小猫|strokes|promptText/.test(JSON.stringify(e(s))), s);
  assert.equal(e('claimable', { notice: '上一棒已隐藏，你可以接这一棒' }).notice, '上一棒已隐藏，你可以接这一棒');
});

const revealData = (over) =>
  Object.assign(
    {
      chainId: 'c',
      promptId: 'A01',
      promptText: '月亮吃月饼',
      custom: false,
      passed: 6,
      early: false,
      participantCount: 6,
      durationMs: 5 * 3600e3,
      steps: [
        { n: 1, kind: 'draw', strokes: strokes(40), mine: false, laughs: 3, myLaugh: false, placeholder: null },
        { n: 2, kind: 'describe', text: '一个大饼在天上', mine: false, laughs: 1, myLaugh: true, placeholder: null },
        { n: 3, kind: 'draw', strokes: strokes(2), mine: true, laughs: 0, myLaugh: false, placeholder: null },
        { n: 4, kind: 'describe', text: '月亮上有兔子', mine: false, laughs: 0, myLaugh: false, placeholder: null },
        { n: 5, kind: 'draw', strokes: strokes(7), mine: false, laughs: 0, myLaugh: false, placeholder: null },
        { n: 6, kind: 'describe', text: '外星人在吃披萨', mine: true, laughs: 0, myLaugh: false, placeholder: null },
      ],
      nationalCount: 2315,
    },
    over || {}
  );

test('reveal: header, summary, stamps, own marker, national line, early text (AC 74/84)', () => {
  let v = V.revealVm({ state: 'ready', chainId: 'c', data: revealData(), now: NOW, autoplay: { enabled: false, playing: false, startedAt: 0 } });
  assert.equal(v.header, '接龙揭晓 · 6 位群友 · 用时 5 小时');
  assert.equal(v.summaryText, '从「月亮吃月饼」传成了「外星人在吃披萨」');
  assert.equal(v.nationalText, '今天全国 2,315 条接龙从「月亮吃月饼」出发');
  assert.deepEqual(v.steps.map((s) => s.label), ['第1棒', '第2棒', '第3棒 (你)', '第4棒', '第5棒', '第6棒 (你)']);
  assert.deepEqual(v.steps.map((s) => s.canReport), [true, true, false, true, true, false]);
  assert.deepEqual([v.steps[0].laughs, v.steps[1].myLaugh, v.earlyText, v.canSameAgain, v.early], [3, true, null, true, false]);
  assert.ok(v.play.every((p) => p.shown && p.progress === 1));
  v = V.revealVm({ state: 'ready', chainId: 'c', data: revealData({ early: true, passed: 4, steps: revealData().steps.slice(0, 4), nationalCount: null, custom: true }), now: NOW });
  assert.deepEqual([v.earlyText, v.nationalText, v.canSameAgain, v.summaryText], ['提前揭晓 · 传了 4/6 棒', null, false, '从「月亮吃月饼」传成了「月亮上有兔子」']);
  assert.equal(V.revealVm({ state: 'ready', chainId: 'c', data: revealData({ durationMs: 20 * 60e3 }), now: NOW }).header, '接龙揭晓 · 6 位群友 · 用时 20 分钟');
  // non-ready states
  for (const [s, msg] of [['loading', '正在展开…'], ['offline', '揭晓需联网查看'], ['error', '揭晓需联网查看'], ['paused', '内容维护中'], ['notParticipant', null]]) {
    const x = V.revealVm({ state: s, chainId: 'c' });
    assert.equal(x.state, s);
    assert.equal(x.messageText, msg);
    assert.deepEqual(x.steps, []);
  }
});

test('reveal: hidden and deleted 棒 are placeholders, skipped by auto-play; summary falls back (AC 82, edge 27/28)', () => {
  const d = revealData();
  d.steps[2] = { n: 3, kind: 'draw', mine: false, laughs: 0, myLaugh: false, placeholder: 'reported' };
  d.steps[3] = { n: 4, kind: 'describe', mine: false, laughs: 0, myLaugh: false, placeholder: 'deleted' };
  const v = V.revealVm({ state: 'ready', chainId: 'c', data: d, now: NOW });
  assert.equal(v.steps[2].placeholderText, '该内容已被举报隐藏');
  assert.equal(v.steps[3].placeholderText, '作者已删除这一棒');
  assert.ok(!v.steps[2].strokes && !v.steps[3].text);
  assert.deepEqual([v.steps[2].canReport, v.steps[3].canReport], [false, false]);
  const tl = V.revealTimeline(v.steps);
  assert.deepEqual(tl.panels.map((p) => p.idx), [-1, 0, 1, 4, 5]);
  // final text hidden: use the latest visible sentence
  d.steps[5] = { n: 6, kind: 'describe', mine: false, laughs: 0, myLaugh: false, placeholder: 'reported' };
  assert.equal(V.revealVm({ state: 'ready', chainId: 'c', data: d, now: NOW }).summaryText, '从「月亮吃月饼」传成了「一个大饼在天上」');
  const none = revealData();
  none.steps = none.steps.map((s) => (s.kind === 'describe' ? { n: s.n, kind: s.kind, placeholder: 'reported', laughs: 0 } : s));
  assert.equal(V.revealVm({ state: 'ready', chainId: 'c', data: none, now: NOW }).summaryText, '传了 6 棒');
  // paused view
  const paused = revealData();
  paused.steps = paused.steps.map((s) => ({ n: s.n, kind: s.kind, placeholder: 'paused', laughs: 0 }));
  assert.equal(V.revealVm({ state: 'ready', chainId: 'c', data: paused, now: NOW }).steps[0].placeholderText, '内容维护中');
});

test('AC 31: the timeline gives each drawing 2.5 s whatever its stroke count; drawingAt replays by points', () => {
  const v = V.revealVm({ state: 'ready', chainId: 'c', data: revealData(), now: NOW });
  const tl = V.revealTimeline(v.steps);
  const draws = tl.panels.filter((p) => p.kind === 'draw');
  assert.equal(draws.length, 3);
  for (const p of draws) assert.ok(Math.abs(p.end - p.start - 2500) <= 200);
  assert.deepEqual(tl.panels[0], { idx: -1, kind: 'prompt', start: 0, end: 800 });
  assert.equal(tl.panels[2].end - tl.panels[2].start, 600); // a sentence types in 0.6 s
  assert.equal(tl.panels[2].start - tl.panels[1].end, 400); // 0.4 s between panels
  assert.ok(tl.total >= 12000 && tl.total <= 16000, 'about 15 s for 6 棒: ' + tl.total);
  // playback progress per step at a point in time
  const at = (ms) => V.revealVm({ state: 'ready', chainId: 'c', data: revealData(), now: NOW + ms, autoplay: { enabled: true, playing: true, startedAt: NOW } }).play;
  assert.equal(at(0)[0].shown, false);
  assert.equal(at(1300)[0].shown, true);
  assert.ok(at(1200 + 1250)[0].progress > 0.45 && at(1200 + 1250)[0].progress < 0.55, 'half way through the first drawing');
  assert.equal(at(tl.total + 10).every((p) => p.progress === 1), true);
  // drawingAt: monotonic, valid, full at 1, same time for 2 or 40 strokes
  const d = strokes(40);
  let last = 0;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const part = V.drawingAt(d, p);
    assert.equal(St.validate(part).ok, true);
    const n = St.pointCount(part);
    assert.ok(n >= last);
    last = n;
  }
  assert.equal(St.pointCount(V.drawingAt(d, 1)), St.pointCount(d));
  assert.equal(V.drawingAt(d, 0).s.length, 0);
  assert.equal(V.drawingAt(null, 0.5), null);
});

test('teaser, group, album, detail, report, settings, how-to', () => {
  let v = V.teaserVm({ state: 'ready', promptText: '月亮吃月饼', finalText: '外星人在吃披萨', passed: 6, canSameAgain: true });
  assert.deepEqual([v.promptText, v.finalText, v.passed, v.canSameAgain, v.notice], ['月亮吃月饼', '外星人在吃披萨', 6, true, '完整接龙仅参与的群友可见']);
  assert.equal(V.teaserVm({ state: 'ready', promptText: 'x', passed: 6, canSameAgain: false }).canSameAgain, false);
  for (const s of ['loading', 'removed', 'notFound', 'offline']) assert.equal(V.teaserVm({ state: s }).state, s);

  const gdata = { stats: { revealed: 12, drawings: 41, started: 20 }, waiting: [{ chainId: 'a', nextStep: 4, nextKind: 'describe', passed: 3 }, { chainId: 'b', nextStep: 2, nextKind: 'draw', passed: 1 }], inProgress: [{ chainId: 'c', why: 'pending', nextStep: 3 }, { chainId: 'd', why: 'taken', nextStep: 5 }], revealed: [{ chainId: 'e', promptText: '月亮吃月饼', finalText: '外星人在吃披萨', participant: true }] };
  v = V.groupVm({ state: 'ready', data: gdata });
  assert.equal(v.statsText, '本群已完成 12 条 · 共画了 41 幅画');
  assert.deepEqual(v.waiting.map((x) => x.line), ['第 4 棒 · 猜一句 · 已传 3/6', '第 2 棒 · 画一幅 · 已传 1/6']);
  assert.deepEqual(v.inProgress.map((x) => x.line), ['第 3 棒审核中', '有群友在接第 5 棒']);
  assert.deepEqual(v.revealed, [{ chainId: 'e', line: '「月亮吃月饼」→「外星人在吃披萨」', participant: true }]);
  assert.equal(V.groupVm({ state: 'noGroup' }).explainer, '在群聊里点开接龙卡片，就能看到本群的接龙');
  assert.equal(V.groupVm({ state: 'empty', data: { stats: { revealed: 0, drawings: 0 } } }).emptyText, '本群还没有接龙，开第一条吧');
  assert.equal(V.groupVm({ state: 'error' }).errorText, '本群接龙暂时打不开');
  assert.equal(V.groupVm({ state: 'ready', data: gdata, banner: { show: true, reservedHeight: 124 } }).banner.reservedHeight, 124);

  const items = [
    { chainId: 'a', status: 'revealed', passed: 6, mySteps: [1], promptText: '月亮吃月饼', at: NOW - 3600e3, unseen: true },
    { chainId: 'b', status: 'open', passed: 3, mySteps: [1], at: NOW - 86400e3 },
    { chainId: 'c', status: 'pending', passed: 2, mySteps: [3], at: NOW },
    { chainId: 'd', status: 'expired', passed: 2, mySteps: [2], promptText: '搬家', at: NOW - 3 * 86400e3 },
    { chainId: 'e', status: 'blocked', passed: 4, mySteps: [], blockedStep: 5, at: NOW },
  ];
  v = V.albumVm({ state: 'ready', items, streak: 4, now: NOW });
  assert.deepEqual(v.items.map((x) => x.line), ['已揭晓「月亮吃月饼」', '进行中 3/6 · 我画了第 1 棒', '审核中 · 我画的第 3 棒', '没传完「搬家」', '这一棒没通过审核 · 第 5 棒']);
  assert.deepEqual(v.items.map((x) => x.unseen), [true, false, false, false, false]);
  assert.equal(v.streakText, '连续接龙 4 天');
  assert.match(v.items[0].timeText, /^今天 \d\d:\d\d$/);
  assert.match(v.items[1].timeText, /^昨天 \d\d:\d\d$/);
  assert.match(v.items[3].timeText, /^\d+月\d+日$/);
  assert.equal(V.albumVm({ state: 'empty', items: [] }).emptyText, '还没有接龙，去开一条吧');
  assert.equal(V.albumVm({ state: 'offline', items }).staleNote, '离线中，显示上次的列表');

  const dv = V.detailVm({ chainId: 'c', mine: [{ n: 1, kind: 'draw', strokes: strokes(1), modState: 'passed', canDelete: true }, { n: 3, kind: 'draw', modState: 'pending', canDelete: false }, { n: 5, kind: 'draw', modState: 'hidden', canDelete: true }, { n: 6, kind: 'describe', modState: 'deleted', canDelete: false }] });
  assert.deepEqual(dv.mine.map((m) => m.modText), ['已通过', '审核中，通过后传给下一位', '该内容已被举报隐藏', '作者已删除这一棒']);

  const rv = V.reportVm({ open: true, target: { chainId: 'c', step: 2 }, state: 'idle', reason: 'ad' });
  assert.deepEqual([rv.reasons, rv.selected, rv.state], [['porn', 'politics', 'abuse', 'ad', 'other'], 'ad', 'idle']);
  assert.deepEqual(['done', 'limit', 'dup', 'error'].map((s) => V.reportVm({ open: true, state: s }).message), ['已举报，该内容已隐藏，我们会尽快核实', '今天举报次数已达上限', '你已举报过这条内容', '没举报成功，请重试']);

  const sv = V.settingsVm({ muted: true, largeText: true, highContrast: false, canUnlockPalette: true, paletteUnlockedToday: false, deleteState: 'confirm1' });
  assert.deepEqual([sv.muted, sv.largeText, sv.highContrast, sv.canUnlockPalette, sv.paletteUnlockedToday, sv.deleteAll.state], [true, true, false, true, false, 'confirm1']);
  const hv = V.howtoVm();
  assert.equal(hv.lines.length, 3);
  assert.equal(hv.footer, '所有画和字都会先审核再传给下一位。');
});

test('AC 10: getChain never carries prompt text, 棒 text or strokes for any state (schema test on the mock)', () => {
  let t = NOW;
  const srv = createMockServer({ now: () => t, rasterize: false });
  const a = srv.as('A');
  const b = srv.as('B');
  [a, b].forEach((u) => u.call('agreeRules', { version: 1 }));
  const ref = a.call('joinGroup', { groupData: { mockData: { opengid: 'G', chat_type: 3 } } }).groupRef;
  const refB = b.call('joinGroup', { groupData: { mockData: { opengid: 'G', chat_type: 3 } } }).groupRef;
  const cr = a.call('createChain', { customText: '独一无二的题目', groupRef: ref });
  const secret = (r) => /独一无二|strokes|"text"|promptText|一句秘密的话|"s":\[/.test(JSON.stringify(r));
  const seen = new Set();
  const look = (who, refx) => {
    const r = who.call('getChain', { chainId: cr.chainId, groupRef: refx });
    seen.add(r.state);
    assert.equal(secret(r), false, r.state + ': ' + JSON.stringify(r));
  };
  look(a, ref); // starting
  a.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: strokes(2) });
  look(b, refB); // pending
  t += 61e3;
  look(b, refB); // claimable
  look(a, ref); // prevMine
  const cl = b.call('claimStep', { chainId: cr.chainId, groupRef: refB });
  look(a, ref); // taken
  b.call('submitStep', { chainId: cr.chainId, claimId: cl.claimId, text: '一句秘密的话' });
  look(b, undefined); // prevMine
  b.call('agreeRules', { version: 1 });
  look(srv.as('N'), undefined); // wrongGroup (not agreed, no membership)
  a.call('revealNow', { chainId: cr.chainId });
  t += 49 * 3600e3;
  srv.sweep();
  look(a, ref); // expired
  srv.admin.removeChain(cr.chainId);
  look(a, ref); // removed
  assert.ok(seen.size >= 6, [...seen].join(','));
  assert.equal(secret(a.call('getChain', { chainId: 'nope' })), false);
  // a revealed chain: still no content from getChain (only getReveal serves it)
  const cr2 = a.call('createChain', { promptId: 'A01', groupRef: ref });
  a.call('submitStep', { chainId: cr2.chainId, claimId: cr2.claim.claimId, strokes: strokes(2) });
  const chain2 = srv.db.chains[cr2.chainId];
  chain2.state = 'revealed';
  chain2.participants = ['A'];
  const rg = a.call('getChain', { chainId: cr2.chainId, groupRef: ref });
  assert.equal(rg.state, 'revealedParticipant');
  assert.equal(/小猫|strokes|"text"|promptText/.test(JSON.stringify(rg)), false);
  assert.equal(b.call('getChain', { chainId: cr2.chainId, groupRef: refB }).state, 'revealedTeaser');
});

test('AC 73: no function returns an openid, group id, nickname or avatar to a client', () => {
  let t = NOW;
  const srv = createMockServer({ now: () => t, rasterize: false });
  const A = srv.as('openid-AAA');
  const B = srv.as('openid-BBB');
  [A, B].forEach((u) => u.call('agreeRules', { version: 1 }));
  const ref = A.call('joinGroup', { groupData: { mockData: { opengid: 'OPENGID-777', chat_type: 3 } } });
  const refB = B.call('joinGroup', { groupData: { mockData: { opengid: 'OPENGID-777', chat_type: 3 } } }).groupRef;
  const out = [ref];
  const cr = A.call('createChain', { promptId: 'A01', groupRef: ref.groupRef });
  out.push(cr, A.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: strokes(2) }));
  t += 61e3;
  out.push(A.call('getHome'), B.call('getChain', { chainId: cr.chainId, groupRef: refB }));
  const cl = B.call('claimStep', { chainId: cr.chainId, groupRef: refB });
  out.push(cl, B.call('submitStep', { chainId: cr.chainId, claimId: cl.claimId, text: '一只猫' }), A.call('getMyChains', {}), A.call('getMyChains', { chainId: cr.chainId }), B.call('getGroupChains', { groupRef: refB }));
  const chain = srv.db.chains[cr.chainId];
  chain.state = 'revealed';
  out.push(A.call('getReveal', { chainId: cr.chainId }), srv.as('C').call('getReveal', { chainId: cr.chainId }), A.call('deleteMyStep', { all: true }), A.call('grantReward', { kind: 'start' }), A.call('track', { events: [] }));
  const json = JSON.stringify(out);
  assert.ok(!/openid-AAA|openid-BBB|OPENGID-777|nickname|avatar/i.test(json), json.slice(0, 200));
  // and no PNG url / file id leaves the server (AC 29)
  assert.ok(!/fileID|\.png|tempFileURL|cloud:\/\//.test(json));
});
