/**
 * Every screen x state to preview and test: all of render/samples.js (kept in sync with CONTRACT.md by a test) plus extra
 * states that stress the layouts (2-line source strip, 今日彩笔 unlocked, keyboard open, long texts, 10 chains, the 慢慢传
 * variants, ...). Each fixture: {screen, state, vm, under?: {screen, state, vm?}, overlay?: overlayVm, kind: 'screen'|'sheet'}.
 * `under` is the screen logic would have drawn first (sheets are drawn over a screen).
 * Shared by tests/render.*.test.js and tools/preview/render.js. Not shipped.
 */

const path = require('path');
const R = path.join(__dirname, '..', '..', 'js', 'render');
const S = require(path.join(R, 'samples.js'));
const { sample, SAMPLES } = S;

const SHEETS = { rules: 'home', warning: 'home', howto: 'home', settings: 'home', startLimit: 'home', report: 'stepthrough' };
const NONE = ['overlay', 'shareCard'];

const bigDrawing = (h) => S.busyDrawing(h || 1363);

function build() {
  const out = [];
  for (const screen of Object.keys(SAMPLES)) {
    if (NONE.includes(screen)) continue;
    for (const state of SAMPLES[screen]) {
      const f = { screen, state, vm: sample(screen, state) };
      if (SHEETS[screen]) {
        f.kind = 'sheet';
        f.under = { screen: SHEETS[screen], state: 'ready' };
      } else f.kind = 'screen';
      out.push(f);
    }
  }
  // overlay states over the draw screen
  for (const state of SAMPLES.overlay) {
    out.push({ screen: 'overlay', state, kind: 'overlay', vm: sample('overlay', state), under: { screen: 'draw', state: 'drawing' } });
  }
  // ---- extras (stress states)
  const x = (screen, extra, vm, under) => out.push({ screen, state: 'x_' + extra, vm, kind: SHEETS[screen] ? 'sheet' : 'screen', extra: true, under: under || (SHEETS[screen] ? { screen: SHEETS[screen], state: 'ready' } : undefined) });
  const home = (o) => sample('home', 'ready', o);
  x('home', 'noGroupNoStreak', home({ streakText: null, groupLine: { show: false, text: '', target: 'group' }, album: { unseenReveals: 0 } }));
  x('home', 'activeRoom', home({ activeRoom: { roomId: 'ROOMAAAAAA', line: '回到这一局 · 第 2/4 轮' }, groupLine: { show: true, text: '来自群聊 · 本群有 2 条等你接 ›', target: 'chains' } }));
  x('home', 'activeLobby', home({ activeRoom: { roomId: 'ROOMAAAAAA', line: '回到这一局 · 等待开始' }, groupLine: { show: false, text: '', target: 'group' } }));
  x('home', 'liveOff', home({ primary: { kind: 'chain', label: '开一条接龙', sublabel: '今天还能开 3 条', enabled: true }, slowLink: { show: false, label: '慢慢传（不用同时在线）' }, groupLine: { show: true, text: '来自群聊 · 本群有 2 条等你接 ›', target: 'chains' } }));
  x('home', 'capReached', home({ primary: { kind: 'room', label: '开一局', sublabel: '今天开局次数已用完，明天再来', enabled: false } }));
  x('home', 'restricted', home({ primary: { kind: 'room', label: '开一局', sublabel: null, enabled: false }, restriction: { text: '你被限制参与至 10月17日 14:00，可以先看看已揭晓的接龙' }, slowLink: { show: true, label: '慢慢传（不用同时在线）' }, groupLine: { show: false, text: '', target: 'group' } }));
  x('home', 'ugcPaused', home({ ugcPausedText: '接龙维护中，可以先看看已揭晓的接龙', primary: { kind: 'room', label: '开一局', sublabel: null, enabled: false } }));
  x('startLimit', 'adLoading', sample('startLimit', 'ad', { chainStart: { freeLeft: 0, adLeft: 1, adState: 'loading' } }));

  const pick = (o) => sample('pick', 'ready', o);
  x('pick', 'chain', pick({ mode: 'chain', timer: undefined, subtitle: '你来画第 1 棒', canBack: true, startLabel: '开始画 (60 秒)' }));
  x('pick', 'rerolled', pick({ rerollLeft: 0, rerollDisabled: true, rerollLabel: '换一批机会已用完', rerollTappable: false, timer: { secLeft: 8, warn: true } }));
  x('pick', 'rerollOne', pick({ rerollLeft: 1, rerollDisabled: false, rerollLabel: '换一批（剩1次）', rerollTappable: true }));
  x('pick', 'rerolling', pick({ state: 'rerolling', canStart: false, rerollLeft: 4, rerollDisabled: false, rerollLabel: '换一批（剩4次）', rerollTappable: false }));
  x('pick', 'custom', pick({ custom: { open: true, text: '会飞的鲸鱼', count: '5/12', error: null, passed: false }, canStart: false }));
  x('pick', 'customErr', pick({ custom: { open: true, text: '违规词', count: '3/12', error: '这个题目不太合适，换一个吧', passed: false }, canStart: false }));
  x('pick', 'busy', pick({ state: 'error', errorText: '审核服务繁忙，请稍后再试，或先选一个现成的题目', prompts: [{ id: 'X1', text: '会飞的奶茶店老板' }, { id: 'X2', text: '搬家的蜗牛先生' }, { id: 'X3', text: '用筷子钓鱼的熊' }], selectedId: 'X2' }));

  const draw = (o) => sample('draw', 'drawing', o);
  const unlocked = palette12();
  x('draw', 'twoLines', draw({ source: { kind: 'text', text: '一只穿着雨衣的企鹅在沙漠里骑自行车' }, sourceLines: 2, canvas: { x: 8, y: 204, w: 359, h: 454 }, gridH: 1295 }));
  x('draw', 'unlocked', draw({ palette: unlocked, colorIdx: 7, sizeIdx: 2, strokes: bigDrawing(), timer: { secLeft: 8, warn: true } }));
  x('draw', 'unlockedTwoLines', draw({ palette: unlocked, source: { kind: 'text', text: '一只穿着雨衣的企鹅在沙漠里骑自行车' }, sourceLines: 2, colorIdx: 9 }));
  x('draw', 'coach', draw({ coach: true, strokes: S.emptyDrawing(), canUndo: false, canSubmit: false, source: { kind: 'prompt', text: '月亮吃月饼' }, title: '画出来 · 1/4', canReport: false }));
  x('draw', 'limit', draw({ pointsUsed: 4000, limitText: '画得太细啦，先交吧', strokes: bigDrawing(), colorIdx: 3 }));
  x('draw', 'markerSource', draw({ source: { kind: 'marker', marker: 'emptyText', hint: '上一棒没来得及写，你自由画一幅吧' }, canReport: false, strokes: S.emptyDrawing(), canUndo: false, canSubmit: false }));
  x('draw', 'hiddenSource', draw({ source: { kind: 'hidden', hint: '（该内容已被举报隐藏）你自由画一幅吧' }, sourceLines: 1, canReport: false }));
  x('draw', 'chain', draw({ mode: 'chain', roomId: undefined, round: undefined, rounds: undefined, chainId: 'ABCDEFGHJK', claimId: 'c1', step: 3, title: '第 3 棒 · 画出来', backLabel: '放弃', timer: { secLeft: 12, warn: false } }));
  x('draw', 'chainTimeUp', draw({ mode: 'chain', title: '第 3 棒 · 画出来', backLabel: '放弃', status: 'timeUp', statusText: '时间到，正在交出…', timer: { secLeft: 0, warn: true }, inputLocked: true, canSubmit: false }));

  const desc = (o) => sample('describe', 'typing', o);
  x('describe', 'long', desc({ text: '一只戴着帽子的猫在开出租车去月球', count: '16/16', shake: true, source: { kind: 'draw', strokes: bigDrawing() } }));
  x('describe', 'empty', desc({ text: '', count: '0/16', canSubmit: false, caret: true }));
  x('describe', 'kb', desc({ keyboardH: 260 }));
  x('describe', 'kbBlocked', desc({ keyboardH: 260, status: 'blocked', errorText: '这句话没通过审核，换个说法吧', text: '一只戴着帽子的猫在开出租车去月球', count: '16/16' }));
  x('describe', 'markerSource', desc({ source: { kind: 'marker', marker: 'emptyDraw', hint: '上一棒没来得及画，你随便写一句吧' }, canReport: false }));
  x('describe', 'notDelivered', desc({ source: { kind: 'marker', marker: 'notDelivered', hint: '上一棒没传过来，你随便写一句吧' }, canReport: false }));
  x('describe', 'hiddenSource', desc({ source: { kind: 'hidden', hint: '该内容已被举报隐藏，你随便写一句吧' }, canReport: false }));
  x('describe', 'warn', desc({ timer: { secLeft: 7, warn: true } }));
  x('describe', 'chain', desc({ mode: 'chain', title: '第 4 棒 · 猜一猜', backLabel: '放弃', source: { kind: 'draw', strokes: S.drawing(768) } }));
  x('describe', 'tall', desc({ source: { kind: 'draw', strokes: S.drawing(2048) } }));

  x('roundWait', 'drawing', sample('roundWait', 'ready', { mine: { strokes: S.drawing(1363) }, round: 1, title: '已交 · 1/4', nextText: '下一轮：猜一句' }));
  x('roundWait', 'marker', sample('roundWait', 'ready', { mine: { marker: 'emptyDraw' }, nextText: '最后一轮了' }));
  x('roundWait', 'last', sample('roundWait', 'ready', { round: 4, title: '已交 · 4/4', nextText: '马上揭晓', progressText: '等大家交… 4/5 已交' }));

  x('lobby', 'nonHost', sample('lobby', 'ready', { isHost: false, start: { show: false, enabled: false, label: '', hint: null, slowLink: false }, waitingText: '等房主开始…', seats: S.seats(4, 3, 0) }));
  x('lobby', 'two', sample('lobby', 'ready', { seats: S.seats(2, 1, 0), joinedText: '2 人已加入（3–10 人）', start: { show: true, enabled: false, label: '开始（2 人）', hint: '至少 3 人才能开局', slowLink: true } }));
  x('lobby', 'one', sample('lobby', 'ready', { seats: S.seats(1, 1, 0), joinedText: '1 人已加入（3–10 人）', start: { show: true, enabled: false, label: '开始（1 人）', hint: '把邀请发到群里，群友点开就能加入', slowLink: false } }));
  x('lobby', 'full', sample('lobby', 'ready', { seats: S.seats(10, 7, 4), joinedText: '10 人已加入（3–10 人）', start: { show: true, enabled: true, label: '开始（10 人）', hint: null, slowLink: false } }));

  const st = (o) => sample('stepthrough', 'ready', o);
  const steps = st().steps;
  x('stepthrough', 'start', st({ index: 0, canPrev: false, canNext: true, endAction: 'nextChain' }));
  x('stepthrough', 'startLast', st({ index: 0, canPrev: false, canNext: true, endAction: 'done', header: '第 5 条' }));
  x('stepthrough', 'middleDraw', st({ index: 3, canNext: true, playT: 1 }));
  x('stepthrough', 'replay', st({ index: 3, canNext: true, playT: 0.45 }));
  x('stepthrough', 'myDraw', st({ index: 1, canNext: true, playT: 1 }));
  x('stepthrough', 'finalDraw', st({ steps: steps.map((s, i) => (i === 4 ? { ...s, kind: 'draw', strokes: S.drawing(1363), text: undefined, label: '第 4 棒 · 画 · 最后一棒' } : s)), index: 4, playT: 1 }));
  x('stepthrough', 'marker', st({ steps: steps.map((s, i) => (i === 4 ? { n: 4, label: '第 4 棒 · 猜 · 最后一棒', kind: 'marker', marker: 'emptyText', mine: false, placeholder: null, laughs: 0, myLaugh: false, canLaugh: false, canReport: false } : s)), index: 4 }));
  x('stepthrough', 'hiddenStep', st({ steps: steps.map((s, i) => (i === 4 ? { ...s, placeholder: 'reported', canReport: false, canLaugh: false } : s)), index: 4 }));
  x('stepthrough', 'longText', st({ steps: steps.map((s, i) => (i === 4 ? { ...s, text: '一只戴着帽子的猫在开出租车去月球' } : s)), index: 4 }));
  x('stepthrough', 'chain', st({ mode: 'chain', roomId: undefined, backLabel: '返回', header: '接龙揭晓 · 6 位群友', earlyText: '提前揭晓 · 传了 4/6 棒', canShare: true, chainNo: undefined, chainCount: undefined }));
  const eight = [];
  for (let i = 0; i < 8; i++) eight.push({ n: i, label: i === 0 ? '起点' : '第 ' + i + ' 棒 · ' + (i % 2 ? '画' : '猜') + (i === 7 ? ' · 最后一棒' : ''), kind: i === 0 ? 'prompt' : i % 2 ? 'draw' : 'describe', text: i % 2 ? undefined : i === 0 ? '月亮吃月饼' : '一个大饼在天上', strokes: i % 2 ? S.drawing(1363) : undefined, mine: false, placeholder: null, laughs: i, myLaugh: false, canLaugh: true, canReport: i > 0 });
  x('stepthrough', 'eightSteps', st({ steps: eight, index: 7, dots: { show: false, text: '8/8' }, canShare: true }));

  const ov = (o) => sample('overview', 'ready', o);
  x('overview', 'rematch', ov({ rematch: { label: '再来一局', banner: '房主开了新的一局 · 加入 ›', newRoomId: 'ROOMNNNNNN' } }));
  x('overview', 'two', ov({ cards: ov().cards.slice(0, 2), subtitle: '2 条接龙 · 每条传了 2 棒' }));
  const many = [];
  for (let i = 0; i < 10; i++) many.push({ chainNo: i + 1, chainId: 'CHAIN' + String(i).repeat(5), mineStarted: i === 3, unseen: i % 3 === 0, final: i % 2 ? { kind: 'describe', text: i === 5 ? '一只戴着帽子的猫在开出租车去月球' : '外星人在吃披萨', placeholder: null, loaded: true } : { kind: 'draw', strokes: S.drawing([768, 1024, 1363, 2048][i % 4]), placeholder: null, loaded: i !== 4 } });
  many[6].final = { kind: 'describe', placeholder: 'reported', loaded: true };
  x('overview', 'ten', ov({ cards: many, subtitle: '10 条接龙 · 每条传了 4 棒' }));

  x('teaser', 'room', sample('teaser', 'ready', { kind: 'room', title: '一局传画揭晓了 · 5 条接龙', lines: [{ from: '月亮吃月饼', to: '外星人在吃披萨' }, { from: '企鹅滑滑梯', to: null }, { from: '搬家的蜗牛先生', to: '一只猫在开出租车去月球' }, { from: '熊猫开出租车', to: null }, { from: '用筷子钓鱼的熊', to: '企鹅在沙漠晒太阳' }], passed: 4 }));
  x('teaser', 'chainDraw', sample('teaser', 'ready', { lines: [{ from: '月亮吃月饼', to: null }] }));
  x('group', 'banner', sample('group', 'ready', { banner: { show: true, reservedHeight: 64, stub: true } }));
  x('album', 'banner', sample('album', 'ready', { banner: { show: true, reservedHeight: 64, stub: true }, cursor: 'next' }));
  x('settings', 'unlocked', sample('settings', 'idle', { paletteUnlockedToday: true, canUnlockPalette: false, deleteAll: { state: 'done' }, muted: true, largeText: true }));
  x('settings', 'deleting', sample('settings', 'idle', { deleteAll: { state: 'deleting' }, paletteAd: { state: 'error' }, highContrast: true }));
  x('rules', 'join', sample('rules', 'open', { pendingAction: 'joinRoom' }), { screen: 'roomEntry', state: 'rulesRequired' });
  x('entry', 'claiming', sample('entry', 'claimable', { claiming: true }));
  x('entry', 'draw', sample('entry', 'claimable', { nextStep: 5, nextKind: 'draw', passed: 4, isParticipant: true, canRevealNow: true, subline: '上一棒是一句话，你来画出来（限时 60 秒，时间到会自动交出）' }));
  x('entry', 'subscribe', sample('entry', 'pending', { isParticipant: true, subscribe: { state: 'offer' } }));
  x('sent', 'describe', sample('sent', 'passed', { kind: 'describe', step: 4, mine: { text: '一只猫在开出租车' }, subscribe: { state: 'granted' }, firstTimeExplainer: false }));
  x('sent', 'markerText', sample('sent', 'marker', { kind: 'describe', step: 4, mine: { marker: 'emptyText' }, modText: '时间到，已自动交出（没来得及写）' }));
  x('sent', 'revealed', sample('sent', 'passed', { revealed: true, subscribe: { state: 'hidden' } }));
  x('mine', 'long', sample('mine', 'ready', { mine: sample('mine', 'ready').mine.concat([{ n: 6, kind: 'describe', text: '一只戴着帽子的猫在开出租车去月球', modState: 'hidden', canDelete: false, line: '第 6 棒 · 已被举报隐藏' }]) }));
  return out;
}

function palette12() {
  return S.palette(true);
}

/**
 * What logic does before drawing the draw screen: freeze the canvas rect and the logical height for THIS window and mode
 * (render/draw.js geometry), and keep the sample's strokes in that height. Other screens pass through unchanged.
 */
function prepare(screen, vm, L, ctx, display) {
  if (screen !== 'draw') return vm;
  const Draw = require(path.join(R, 'draw.js'));
  const unlocked = (vm.palette || []).some((p) => p.idx >= 6 && !p.locked);
  const lines = Draw.sourceLinesFor(ctx, L, display, vm.source);
  const g = Draw.geometry(L, { sourceLines: lines, unlocked, display });
  const out = Object.assign({}, vm, { sourceLines: lines, canvas: g.canvas, gridH: g.gridH });
  const st = vm.strokes;
  if (st && st.v === 2 && st.s.length) out.strokes = st.s.length >= 12 ? S.busyDrawing(g.gridH) : S.drawing(g.gridH);
  else if (st && st.v === 2) out.strokes = { v: 2, h: g.gridH, s: [] };
  return out;
}

module.exports = { build, prepare, SHEETS, bigDrawing };
