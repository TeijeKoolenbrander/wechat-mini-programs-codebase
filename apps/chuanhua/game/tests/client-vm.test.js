'use strict';
// Pure unit tests (no renderer, no mock server) of the rev. 2 view-model builders (js/vm.js), the room share cards and the card entry
// routing (js/share.js): the strings and flags QA reads in the specs, built from raw server answers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/vm');
const { createShare, parseEnter, roomQuery, ROOM_FALLBACK_IMAGE, ROOM_INVITE_TITLE } = require('../js/share');
const { normalizeFeatures } = require('../js/features');
const { CONFIG } = require('../core/config');

const cm = (over) => Object.assign({ display: { largeText: false, highContrast: false }, muted: false, features: normalizeFeatures(null, { adUnits: {} }), ugc: { createEnabled: true, viewEnabled: true }, t: 0 }, over || {});
const seats = (n, me) => Array.from({ length: 10 }, (_, i) => ({ n: i + 1, filled: i < n, me: i + 1 === me, quiet: false }));

test('home: the primary is 开一局 with live rooms on (cap, restriction, offline) and 开一条接龙 with them off; the active room and group lines', () => {
  const ready = { state: 'ready', me: { startsLeft: 3, adStartsLeft: 2, roomsLeft: 4, unseenReveals: 1, streak: 4 }, scrollY: 0 };
  let vm = V.homeVm(ready, cm());
  assert.deepEqual(vm.primary, { kind: 'room', label: '开一局', sublabel: '3–10 人一起，约 3 分钟', enabled: true });
  assert.deepEqual(vm.slowLink, { show: true, label: '慢慢传（不用同时在线）' });
  assert.equal(vm.streakText, '连续接龙 4 天');
  assert.equal(vm.album.unseenReveals, 1);
  vm = V.homeVm({ ...ready, me: { ...ready.me, roomsLeft: 0 } }, cm());
  assert.equal(vm.primary.sublabel, '今天开局次数已用完，明天再来');
  assert.equal(vm.primary.enabled, false);
  vm = V.homeVm({ ...ready, me: { ...ready.me, roomsLeft: 0 }, activeRoom: { roomId: 'R', line: '回到这一局 · 等待开始' } }, cm());
  assert.equal(vm.primary.enabled, true, 'a seated player can still go back to the room');
  assert.deepEqual(vm.activeRoom, { roomId: 'R', line: '回到这一局 · 等待开始' });
  vm = V.homeVm({ ...ready, me: { ...ready.me, restriction: { until: Date.UTC(2026, 10, 5), permanent: false } } }, cm());
  assert.equal(vm.primary.enabled, false);
  assert.match(vm.restriction.text, /^你暂时不能参与接龙/);
  vm = V.homeVm({ ...ready, ugcPaused: true }, cm());
  assert.equal(vm.primary.enabled, false);
  assert.equal(vm.ugcPausedText, '接龙维护中，可以先看看已揭晓的接龙');
  vm = V.homeVm({ state: 'offline', me: {} }, cm());
  assert.equal(vm.primary.sublabel, '需联网才能开局');
  assert.equal(vm.slowLink.show, false);
  const off = cm({ features: normalizeFeatures({ features: { liveRooms: false } }, { adUnits: {} }) });
  vm = V.homeVm(ready, off);
  assert.deepEqual(vm.primary, { kind: 'chain', label: '开一条接龙', sublabel: '今天还能开 3 条', enabled: true });
  assert.equal(vm.slowLink.show, false);
  assert.equal(vm.features.liveRooms, false);
  assert.equal(V.homeVm({ ...ready, me: { ...ready.me, startsLeft: 0 } }, off).primary.sublabel, '今天的 3 条已开完');
  vm = V.homeVm({ ...ready, sheet: 'startLimit' }, cm());
  assert.equal(vm.chainStart.sheet, 'limit');
  assert.equal(vm.sheet, 'startLimit');
  assert.equal(JSON.stringify(vm).includes('daily'), false, 'no 今日起点 and no national count (AC 121)');
});

test('lobby: the start button, hint and link follow the player count and the host flag (spec 8.16)', () => {
  const resp = (joined, host) => ({ roomId: 'R', joined, seats: seats(joined, 1), me: { isHost: host } });
  let vm = V.lobbyVm({ state: 'ready', roomId: 'R', resp: resp(1, true) }, cm());
  assert.equal(vm.start.hint, '把邀请发到群里，群友点开就能加入');
  assert.equal(vm.start.enabled, false);
  assert.equal(vm.joinedText, '1 人已加入（3–10 人）');
  assert.equal(vm.seats.length, 10);
  vm = V.lobbyVm({ state: 'ready', roomId: 'R', resp: resp(2, true) }, cm());
  assert.deepEqual([vm.start.hint, vm.start.slowLink, vm.start.enabled], ['至少 3 人才能开局', true, false]);
  vm = V.lobbyVm({ state: 'ready', roomId: 'R', resp: resp(4, true) }, cm());
  assert.deepEqual([vm.start.label, vm.start.hint, vm.start.slowLink, vm.start.enabled, vm.start.show], ['开始（4 人）', null, false, true, true]);
  vm = V.lobbyVm({ state: 'ready', roomId: 'R', resp: resp(4, false) }, cm());
  assert.deepEqual([vm.start.show, vm.waitingText, vm.isHost], [false, '等房主开始…', false]);
  vm = V.lobbyVm({ state: 'ready', roomId: 'R', resp: resp(4, true), starting: true }, cm());
  assert.equal(vm.state, 'starting');
  assert.equal(vm.start.enabled, false);
  vm = V.lobbyVm({ state: 'ready', roomId: 'R', resp: resp(4, true), offline: true }, cm());
  assert.equal(vm.state, 'offline');
  vm = V.lobbyVm({ state: 'closed', roomId: 'R', resp: null }, cm());
  assert.equal(vm.canInvite, false);
});

test('round wait: the title, the progress line and what comes next (spec 8.17)', () => {
  const base = { roomId: 'R', rounds: 4, secLeft: 21, warnSec: 10, mine: { text: '一只猫' }, sent: 3, active: 5, passing: false, offline: false };
  let vm = V.roundWaitVm({ ...base, round: 2 }, cm());
  assert.equal(vm.title, '已交 · 2/4');
  assert.equal(vm.progressText, '等大家交… 3/5 已交');
  assert.equal(vm.nextText, '下一轮：画出来');
  assert.equal(V.roundWaitVm({ ...base, round: 1 }, cm()).nextText, '下一轮：猜一句');
  assert.equal(V.roundWaitVm({ ...base, round: 3 }, cm()).nextText, '最后一轮了');
  assert.equal(V.roundWaitVm({ ...base, round: 4 }, cm()).nextText, '马上揭晓');
  assert.equal(V.roundWaitVm({ ...base, round: 0 }, cm()).title, '已交 · 选题');
  vm = V.roundWaitVm({ ...base, round: 2, passing: true, offline: true, secLeft: 0 }, cm());
  assert.deepEqual([vm.passing, vm.offlineText, vm.timer.warn], [true, '网络不好，正在重连…', true]);
});

test('room entry: the copy per state; the count shows only where the room is visible; restricted and paused carry their note', () => {
  const e = (state, o) => V.roomEntryVm({ state, roomId: 'R', joined: 4, ...(o || {}) }, cm());
  assert.equal(e('joinable').joinedText, '4 人已加入（3–10 人）');
  assert.equal(e('joinable').headline, '群友开了一局传画');
  assert.equal(e('started').headline, '这一局已经开始了，等下一局吧');
  assert.equal(e('started').joinedText, null);
  assert.equal(e('wrongGroup').headline, '这一局只能在发起的群里加入');
  assert.equal(e('closed').headline, '这一局已经结束了');
  assert.equal(e('full').headline, '这一局满员了（10 人）');
  assert.equal(e('inOtherRoom', { otherRoomId: 'X' }).otherRoomId, 'X');
  assert.match(e('restricted', { restrictedUntil: Date.UTC(2026, 10, 17, 6) }).restrictionText, /^你暂时不能参与接龙（至/);
  assert.equal(e('ugcPaused').restrictionText, '接龙维护中，可以先看看已揭晓的接龙');
  assert.equal(e('joinable', { joining: true }).joining, true);
});

test('step-through: the steps of a getReveal answer (labels, markers, placeholders, 笑 / 举报 flags) and the vm (index, dots, end action)', () => {
  const resp = {
    ok: true, chainId: 'C', mode: 'live', passed: 4, length: 4, participantCount: 4, early: false,
    prompt: { text: '月亮吃月饼', custom: true, mine: false, canReport: true },
    steps: [
      { n: 1, kind: 'draw', mine: false, placeholder: null, laughs: 2, myLaugh: false, canReport: true, canLaugh: true, strokes: { v: 2, h: 1363, s: [[0, 1, 5, 5, 3, 3]] } },
      { n: 2, kind: 'describe', mine: true, placeholder: null, laughs: 0, myLaugh: false, canReport: false, canLaugh: true, text: '一个大饼' },
      { n: 3, kind: 'draw', mine: false, placeholder: 'reported', laughs: 0, myLaugh: false, canReport: false, canLaugh: false },
      { n: 4, kind: 'describe', mine: false, placeholder: null, laughs: 0, myLaugh: false, canReport: false, canLaugh: false, marker: 'emptyText', text: '（没来得及写）' },
    ],
  };
  const steps = V.stepsOf(resp);
  assert.deepEqual(steps.map((s) => s.label), ['起点', '第 1 棒 · 画', '第 2 棒 · 猜', '第 3 棒 · 画', '第 4 棒 · 猜 · 最后一棒']);
  assert.deepEqual(steps.map((s) => s.kind), ['prompt', 'draw', 'describe', 'draw', 'marker']);
  assert.equal(steps[0].text, '月亮吃月饼');
  assert.equal(steps[0].canReport, true, 'a custom prompt can be reported');
  assert.equal(steps[3].placeholder, 'reported');
  assert.equal(steps[3].strokes, undefined, 'a hidden step carries no content');
  assert.deepEqual([steps[4].marker, steps[4].canLaugh, steps[4].canReport], ['emptyText', false, false]);
  let vm = V.stepthroughVm({ state: 'ready', mode: 'live', roomId: 'R', chainId: 'C', chainNo: 2, chainCount: 5, mineStarted: true, resp, steps, index: 4, playT: 0.5, nextChain: true }, cm());
  assert.equal(vm.header, '第 2 条 · 你起的');
  assert.deepEqual([vm.index, vm.canPrev, vm.canNext, vm.endAction, vm.backLabel], [4, true, false, null, '全部']);
  assert.equal(vm.dots.show, true);
  vm = V.stepthroughVm({ state: 'ready', mode: 'live', roomId: 'R', chainId: 'C', chainNo: 5, chainCount: 5, resp, steps, index: 0, nextChain: true }, cm());
  assert.deepEqual([vm.endAction, vm.canPrev, vm.canNext], ['nextChain', false, true]);
  vm = V.stepthroughVm({ state: 'ready', mode: 'live', roomId: 'R', chainId: 'C', chainNo: 5, chainCount: 5, resp, steps, index: 0, nextChain: false }, cm());
  assert.equal(vm.endAction, 'done', 'the last chain ends with 看完了');
  vm = V.stepthroughVm({ state: 'ready', mode: 'chain', chainId: 'C', resp: { ...resp, participantCount: 6, passed: 4, length: 6, early: true }, steps, index: 4, canShare: true }, cm());
  assert.equal(vm.header, '接龙揭晓 · 6 位群友');
  assert.equal(vm.earlyText, '提前揭晓 · 传了 4/6 棒');
  assert.equal(vm.backLabel, '返回');
  assert.equal(vm.canShare, true);
  const hidden = steps.map((s) => ({ ...s, placeholder: 'paused' }));
  assert.equal(V.stepthroughVm({ state: 'ready', mode: 'live', chainId: 'C', steps: hidden, index: 0 }, cm()).state, 'paused');
});

test('overview: only the final step of each chain; a drawing is a skeleton until its getReveal arrives; markers and placeholders are loaded at once', () => {
  const card = (n, o) => Object.assign({ chainNo: n, chainId: 'AAAAAAAAA' + n, mineStarted: n === 2, finalKind: 'describe', finalText: '外星人' }, o);
  const cards = [
    { card: card(1), loaded: null, unseen: true },
    { card: card(2, { finalKind: 'draw', finalText: undefined }), loaded: null, unseen: false },
    { card: card(3, { finalKind: 'draw', finalText: undefined }), loaded: { strokes: { v: 2, h: 1363, s: [] } }, unseen: false },
    { card: card(4, { finalKind: 'marker', finalMarker: 'emptyText', finalText: '（没来得及写）' }), loaded: null, unseen: false },
    { card: card(5, { placeholder: 'reported' }), loaded: null, unseen: false },
  ];
  const vm = V.overviewVm({ state: 'ready', roomId: 'R', n: 5, rounds: 4, cards, rematchBanner: true, rematchRoomId: 'NEW', canShare: true }, cm());
  assert.equal(vm.subtitle, '5 条接龙 · 每条传了 4 棒');
  assert.deepEqual(vm.cards.map((x) => [x.final.kind, x.final.loaded]), [['describe', true], ['draw', false], ['draw', true], ['marker', true], ['describe', true]]);
  assert.equal(vm.cards[4].final.placeholder, 'reported');
  assert.deepEqual(vm.cards.map((x) => x.mineStarted), [false, true, false, false, false]);
  assert.deepEqual(vm.rematch, { label: '再来一局', banner: '房主开了新的一局 · 加入 ›', newRoomId: 'NEW' });
  assert.doesNotMatch(JSON.stringify(vm), /prompt|promptText/);
  assert.deepEqual(V.overviewVm({ state: 'loading', roomId: 'R', cards }, cm()).cards, [], 'no cards while loading');
});

test('album and group rows: rooms and chains in one list; room lines per status; the group rooms section', () => {
  const now = Date.UTC(2026, 10, 3, 4);
  const room = (status, o) => V.albumRow({ kind: 'room', roomId: 'ROOMAAAAAA', status, n: 5, rounds: 4, round: 2, lastActivityAt: now, revealedAt: now, unseen: false, left: false, ...(o || {}) }, now);
  assert.equal(room('revealed').line, '一局 · 5 条接龙');
  assert.equal(room('revealed', { left: true }).line, '一局 · 5 条接龙（中途离开）');
  assert.equal(room('playing').line, '一局 · 第 2/4 轮进行中');
  assert.equal(room('playing', { round: 0 }).line, '一局 · 选题进行中');
  assert.equal(room('lobby').line, '一局 · 等待开始');
  assert.deepEqual([room('closed').status, room('closed').line], ['removed', '一局 · 已关闭']);
  assert.equal(room('revealed').timeText, '今天 12:00');
  const vm = V.groupVm({ state: 'ready', resp: { rooms: [{ roomId: 'R1', state: 'lobby', joined: 4, joinable: true }, { roomId: 'R2', state: 'playing', round: 2, rounds: 4, joinable: false }], waiting: [], inProgress: [], revealed: [{ kind: 'room', roomId: 'R3', n: 5, member: true, revealedAt: now }], stats: { started: 3, revealed: 2, drawings: 7, rooms: 4 } }, banner: null, nowMs: now }, cm());
  assert.deepEqual(vm.rooms.map((r) => [r.line, r.joinable]), [['4 人已加入 · 等待开始', true], ['第 2/4 轮进行中', false]]);
  assert.deepEqual(vm.revealed[0], { kind: 'room', id: 'R3', line: '一局 · 5 条接龙 · 今天 12:00', member: true });
  assert.equal(vm.statsText, '本群一共玩了 6 局 · 画了 7 幅画');
});

test('draw / describe / pick vms: titles, back labels, source forms, status copy and the lock (spec 8.3-8.5, 12)', () => {
  const draw = (o) => V.drawVm(Object.assign({ mode: 'live', roomId: 'R', round: 1, rounds: 4, source: { kind: 'prompt', text: 'x' }, sourceLines: 1, canReport: false, secLeft: 30, warnSec: 10, canvas: { x: 8, y: 180, w: 359, h: 478 }, gridH: 1363, palette: V.paletteVm(false), colorIdx: 0, sizeIdx: 1, strokes: [], strokesRev: 0, pointsUsed: 0, limited: false, canUndo: false, canSubmit: false, status: 'drawing', coach: false }, o || {}), cm());
  assert.equal(draw().title, '画出来 · 1/4');
  assert.equal(draw().backLabel, '离开');
  assert.equal(draw({ mode: 'chain', step: 3, chainId: 'C', claimId: 'c' }).title, '第 3 棒 · 画出来');
  assert.equal(draw({ mode: 'chain', step: 3 }).backLabel, '放弃');
  assert.equal(draw({ secLeft: 10 }).timer.warn, true);
  assert.equal(draw({ secLeft: 11 }).timer.warn, false);
  assert.equal(draw({ status: 'timeUp' }).statusText, '时间到，正在交出…');
  assert.equal(draw({ status: 'timeUp', canSubmit: true, canUndo: true }).inputLocked, true);
  assert.equal(draw({ status: 'timeUp', canSubmit: true }).canSubmit, false, 'nothing is submittable once the screen is locked');
  assert.equal(draw({ status: 'blocked' }).statusText, '这幅画没通过审核，改一改再交');
  assert.equal(draw({ status: 'blocked' }).inputLocked, false, 'the canvas stays unlocked after a block');
  assert.equal(draw({ limited: true, pathFull: true }).limitText, '线条太多啦，先交吧');
  assert.deepEqual(draw().palette.filter((p) => p.locked).map((p) => p.idx), [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(V.sourceVm({ kind: 'marker', marker: 'emptyDraw' }, 'describe'), { kind: 'marker', marker: 'emptyDraw', hint: '上一棒没来得及画，你随便写一句吧' });
  assert.deepEqual(V.sourceVm({ kind: 'gone' }, 'draw'), { kind: 'hidden', hint: '（该内容已被举报隐藏）你自由画一幅吧' });
  assert.deepEqual(V.sourceVm({ kind: 'paused', hint: '内容维护中' }, 'draw'), { kind: 'paused', hint: '内容维护中' });
  const pick = (o) => V.pickVm(Object.assign({ state: 'ready', mode: 'live', secLeft: 12, warnSec: 10, rollId: 'ROLL', prompts: [{ id: 'A01', text: '猫' }], selectedId: 'A01', rerollLeft: 1, custom: { open: false, text: '', error: null, passed: false }, errorText: null, drawSec: 60 }, o || {}), cm());
  assert.equal(pick().timer.warn, false);
  assert.equal(pick({ secLeft: 9 }).timer.warn, true);
  assert.deepEqual([pick().canBack, pick().startLabel, pick().subtitle], [false, '就这个', '传给下一位来画']);
  const chainPick = pick({ mode: 'chain' });
  assert.deepEqual([chainPick.canBack, chainPick.startLabel, chainPick.subtitle, chainPick.timer], [true, '开始画 (60 秒)', '你来画第 1 棒', undefined]);
  assert.equal(pick({ state: 'loading' }).rerollLeft, 0);
  // AC 166: the 换一批 fields (rerollDisabled is true exactly when rerollLeft is 0; the label is the count, then the spent notice)
  for (let n = 0; n <= 5; n++) {
    const v = pick({ rerollLeft: n });
    assert.deepEqual([v.rerollLeft, v.rerollDisabled, v.rerollTappable, v.rerollLabel], [n, n === 0, n > 0, n ? '换一批（剩' + n + '次）' : '换一批机会已用完']);
  }
  assert.equal(pick({ rerollLeft: 3, state: 'rerolling' }).rerollTappable, false);
  assert.equal(pick({ rerollLeft: 3, state: 'rerolling' }).canStart, false);
  assert.equal(pick({ rerollLeft: 9 }).rerollLeft, 5, 'never above the maximum');
  assert.equal(pick({ custom: { open: true, text: '一', error: null, passed: false } }).canStart, false, 'one character is too short');
  assert.equal(pick({ custom: { open: true, text: '会飞的西瓜', error: null, passed: false } }).custom.count, '5/12');
});

test('card routing (spec 9.6): m= is a room card, k= a chain invite, r= a reveal; malformed ids go home; a ticket asks for the group', () => {
  const room = parseEnter({ scene: 1044, query: 'm=ABCDEFGHJK', shareTicket: 'T' });
  assert.deepEqual([room.kind, room.roomId, room.join, room.fromCard], ['room', 'ABCDEFGHJK', true, 'room']);
  assert.equal(parseEnter({ query: { m: 'ABCDEFGHJK' } }).join, false, 'no ticket: no group context');
  assert.equal(parseEnter({ query: 'm=short' }).kind, 'malformed');
  assert.equal(parseEnter({ query: 'm=ABCDEFGHJK&x=1' }).kind, 'room');
  assert.equal(parseEnter({ query: 'k=ABCDEFGHJK' }).kind, 'invite');
  assert.equal(parseEnter({ query: 'r=ABCDEFGHJK' }).kind, 'reveal');
  assert.equal(parseEnter({ query: 'wxad_fallback_share=1' }).kind, 'fallbackShare');
  assert.equal(roomQuery('ABCDEFGHJK'), 'm=ABCDEFGHJK');
});

test('room share cards (spec 9.1, 9.4): the invite and reveal titles, queries with ids only, no drawing, the static fallback, updatable with room_limit 10', async () => {
  const shared = [];
  const menu = [];
  let handler = null;
  const wx = {
    showShareMenu() {},
    updateShareMenu: (o) => (menu.push({ ...o }), o.success && o.success()),
    onShareAppMessage: (f) => (handler = f),
    shareAppMessage: (o) => shared.push(o),
  };
  const events = [];
  const share = createShare({ wx, api: {}, analytics: { track: (n, p) => events.push([n, p]) } });
  const cards = [];
  share.cardRenderer = async (card) => (cards.push(card), 'tmp://card.png');
  await share.shareRoomInvite({ roomId: 'ABCDEFGHJK', joined: 3, activityId: 'act-1' });
  assert.equal(shared[0].title, ROOM_INVITE_TITLE);
  assert.equal(shared[0].title, '来一局传画接龙吗？画得丑没关系');
  assert.equal(shared[0].query, 'm=ABCDEFGHJK');
  assert.equal(shared[0].imageUrl, 'tmp://card.png');
  assert.deepEqual(cards[0], { kind: 'roomInvite' });
  const upd = menu.find((m) => m.isUpdatableMessage);
  assert.deepEqual(upd.templateInfo.parameterList, [{ name: 'member_count', value: '3' }, { name: 'room_limit', value: '10' }]);
  assert.equal(shared[0].success, undefined, 'the UI never depends on whether a share succeeded');
  // the reveal card of a room: a chain with passed text, or just the count
  await share.shareRoomReveal({ roomId: 'ABCDEFGHJK', chainCount: 5, promptText: '月亮吃月饼', finalText: '外星人在吃披萨' });
  assert.equal(shared[1].title, '我们这一局，「月亮吃月饼」传成了「外星人在吃披萨」');
  assert.equal(shared[1].query, 'm=ABCDEFGHJK');
  assert.deepEqual(cards[1], { kind: 'roomReveal', chainCount: 5, promptText: '月亮吃月饼', finalText: '外星人在吃披萨' });
  await share.shareRoomReveal({ roomId: 'ABCDEFGHJK', chainCount: 5 });
  assert.equal(shared[2].title, '我们这一局传了 5 条接龙，来看看变成了什么');
  assert.deepEqual(cards[2], { kind: 'roomReveal', chainCount: 5 });
  // the card renderer fails: the static room fallback image
  share.cardRenderer = async () => null;
  await share.shareRoomInvite({ roomId: 'ABCDEFGHJK', joined: 1 });
  assert.equal(shared[3].imageUrl, ROOM_FALLBACK_IMAGE);
  assert.equal(ROOM_FALLBACK_IMAGE, 'assets/share-fallback-room.png');
  // the capsule menu in a lobby shares the same card
  share.register(() => ({ kind: 'roomInvite', roomId: 'ABCDEFGHJK' }));
  const m = handler();
  assert.deepEqual(Object.keys(m).sort(), ['imageUrl', 'query', 'title']);
  assert.equal(m.query, 'm=ABCDEFGHJK');
  assert.equal(m.imageUrl, ROOM_FALLBACK_IMAGE);
  assert.deepEqual(events.filter((e) => e[0] === 'share_tap').map((e) => e[1].kind), ['room', 'reveal', 'reveal', 'room', 'menu']);
  assert.ok(CONFIG.promptsVersion === 2);
});
