/**
 * Ready-made view models for every screen and state in CONTRACT.md (rev. 2), so the renderers can be built, previewed and
 * tested before the logic exists, and so the logic engineer has a worked example of every vm. Shapes follow CONTRACT.md /
 * spec 12; strings are written exactly as the real vm builder is expected to produce them (core/copy.js). They are
 * hard-coded here on purpose: this file depends on no core module except core/strikes#WARNING_TEXT, so a rewrite of the
 * core copy cannot break the render layer. NOT shipped logic: the real vm.js builds these from server data.
 *
 *   const { sample, SAMPLES, SCREENS, wire } = require('./samples');
 *   sample('draw', 'drawing')                  // a fresh object each call
 *   sample('entry', 'taken', { passed: 4 })    // shallow overrides
 *   wire(absStrokes, h)                        // absolute strokes [{c, w, p}] -> wire Strokes {v:2, h, s}
 */

const strikes = require('../../core/strikes');

const display = () => ({ largeText: false, highContrast: false });
const features = () => ({
  liveRooms: true,
  subscribe: { tmplId: 'sample-template' },
  updatableCard: true,
  banner: { enabled: false, adUnitId: null },
  interstitial: { enabled: true, minLifetimeReveals: 3, minGapSec: 180, maxPerDay: 3 },
});
const ugc = () => ({ createEnabled: true, viewEnabled: true });
const common = () => ({ display: display(), muted: false, features: features(), ugc: ugc(), t: 0 });

/** absolute strokes [{c, w, p:[x0,y0,x1,y1,...]}] -> wire Strokes v2 (first point absolute, then integer deltas) */
function wire(abs, h) {
  const s = abs.map((st) => {
    const out = [st.c, st.w];
    let px = 0;
    let py = 0;
    for (let i = 0; i < st.p.length; i += 2) {
      const x = Math.round(st.p[i]);
      const y = Math.round(st.p[i + 1]);
      if (i === 0) out.push(x, y);
      else out.push(x - px, y - py);
      px = x;
      py = y;
    }
    return out;
  });
  return { v: 2, h: h || 1024, s };
}

function circle(cx, cy, r, n) {
  const p = [];
  for (let k = 0; k <= n; k++) p.push(Math.round(cx + r * Math.cos((k / n) * Math.PI * 2)), Math.round(cy + r * Math.sin((k / n) * Math.PI * 2)));
  return p;
}

/** a small believable scene (a house, a sun, a tree, a dot) designed in a 1024 x 768 box and centred in 1024 x h */
function scene(h) {
  const oy = Math.max(0, Math.round((h - 768) / 2));
  const Y = (a) => a.map((v, i) => (i % 2 ? v + oy : v));
  return [
    { c: 0, w: 1, p: Y([300, 640, 300, 400, 512, 230, 724, 400, 724, 640, 300, 640]) },
    { c: 4, w: 0, p: Y([450, 640, 450, 520, 574, 520, 574, 640]) },
    { c: 1, w: 2, p: Y(circle(850, 170, 52, 14)) },
    { c: 3, w: 1, p: Y([140, 650, 140, 500]) },
    { c: 3, w: 2, p: Y(circle(140, 450, 64, 12)) },
    { c: 0, w: 0, p: Y([60, 652, 964, 652]) },
    { c: 2, w: 2, p: Y([512, 330]) },
  ];
}

/** a busier picture for stress cases: a scribble of 12 strokes in every colour */
function busy(h) {
  const abs = [];
  for (let i = 0; i < 12; i++) {
    const p = [];
    for (let k = 0; k < 14; k++) p.push(Math.round(120 + i * 62 + 80 * Math.sin(k * 0.7 + i)), Math.round(120 + ((h - 240) / 13) * k + 40 * Math.cos(k * 0.5 + i)));
    abs.push({ c: i % 12, w: i % 3, p });
  }
  return abs;
}

const drawing = (h) => wire(scene(h || 1363), h || 1363);
const busyDrawing = (h) => wire(busy(h || 1363), h || 1363);
const emptyDrawing = (h) => ({ v: 2, h: h || 1363, s: [] });

const palette = (unlocked) => ['#1E1B18', '#D8433B', '#F29B30', '#3E9B5A', '#3C78C8', '#7B4FB3', '#F28DB2', '#F2D13C', '#6CC3E0', '#8A5A3B', '#9A9A9A', '#9CCB4A'].map((color, idx) => ({ idx, color, locked: idx >= 6 && !unlocked }));

const ENTRY_COPY = {
  loading: ['展开接龙…', null],
  claimable: ['第 4 棒等你接', '上一棒是一幅画，你来猜一句（限时 45 秒，时间到会自动交出）'],
  taken: ['有群友正在接第 4 棒（约 2 分钟内）', null],
  pending: ['第 3 棒审核中，通常几分钟', null],
  prevMine: ['上一棒是你传的，等别人接下一棒吧', null],
  capReached: ['这条接龙你已经接了 3 棒，留给群友吧', null],
  wrongGroup: ['接龙只能在发起的群里接力', null],
  revealedParticipant: ['接龙揭晓了！', null],
  revealedTeaser: ['一条接龙揭晓了', null],
  expired: ['这条接龙没传完', null],
  removed: ['该接龙已被举报隐藏', null],
  notFound: ['找不到这条接龙', null],
  restricted: ['第 4 棒等你接', '上一棒是一幅画，你来猜一句（限时 45 秒，时间到会自动交出）'],
  rulesRequired: ['第 4 棒等你接', '上一棒是一幅画，你来猜一句（限时 45 秒，时间到会自动交出）'],
  ugcPaused: ['第 4 棒等你接', '上一棒是一幅画，你来猜一句（限时 45 秒，时间到会自动交出）'],
  dailyLimit: ['第 4 棒等你接', '上一棒是一幅画，你来猜一句（限时 45 秒，时间到会自动交出）'],
  inRoom: ['你正在一局里，先玩完再来接', null],
  offline: ['需联网才能接龙', null],
  error: ['出了点小问题，请重试', null],
};

function entry(state, o) {
  const base = {
    state, passed: 3, length: 6, nextStep: 4, nextKind: 'describe', timeLeftText: '还剩 31 小时', takenEtaText: null,
    isParticipant: false, isStarter: false, canRevealNow: false, pendingStep: 3,
    subscribe: { state: 'hidden' }, claiming: false, restrictionText: null, ...common(),
  };
  const v = Object.assign(base, o || {});
  const c = ENTRY_COPY[state] || ENTRY_COPY.claimable;
  v.headline = c[0];
  v.subline = c[1];
  return v;
}

/** a slice of the real draft agreement (docs/chuanhua/release/user-agreement.txt): (shaped exactly like tools/build-terms.js output: 【重要】 stripped, important set; no draft/title line) intro, 一, 二, part of 三, 五 */
const TERMS_SLICE = [
  {"text":"版本：第 1 版　更新日期：【生效日期】　生效日期：【生效日期】"},
  {"text":"欢迎使用「传画接龙」！"},
  {"text":"本协议是你与【运营主体名称】（以下简称「我们」）之间关于使用「传画接龙」微信小游戏（以下简称「本游戏」）的约定。《接龙公约》是本协议的一部分。"},
  {"text":"请你仔细阅读本协议，尤其是标有【重要】的条款：违规处理、内容授权、内容保存、免责与责任限制、争议解决。","important":true},
  {"text":"在本游戏中，开一条接龙或接一棒之前，我们会展示《接龙公约》。你点击「同意并开始」，即表示你已阅读并同意本协议。如果你不同意，可以点击「先看看」，不参与创作。"},
  {"text":"如果你未满 18 周岁，请在监护人的陪同下阅读本协议，并在监护人的同意和指导下使用本游戏（见第十条）。"},
  {"text":"一、服务说明","heading":true},
  {"text":"1. 本游戏是运行在微信内的「传画」小游戏。一条接龙由一个起点题目和 6 棒组成，按「画一幅、猜一句、画一幅……」交替进行。每一位接棒的人只能看到上一棒：上一棒是一句话，就把它画出来；上一棒是一幅画，就用一句话说出画的是什么。传完后，大家一起看这句话变成了什么。"},
  {"text":"2. 每条接龙只属于一个微信群。只有通过该群里的接龙卡片进入过本游戏的群成员，才能接这条接龙。本游戏没有公开的接龙广场、陌生人匹配、聊天或私信功能。"},
  {"text":"3. 接龙进行中，每个人只能看到自己要接的上一棒。接龙揭晓后，完整内容只对这条接龙的参与者可见。参与者是指起点人和每一棒通过审核的作者。其他人打开揭晓卡片，只能看到起点题目、最后一句话和传了几棒。"},
  {"text":"4. 本游戏不显示昵称和头像。每一棒只显示「第几棒」，你自己的那一棒会标出「你」。"},
  {"text":"5. 本游戏的基本规则（以游戏内显示为准，我们可能根据运营需要调整）：\n· 每天可以免费开 3 条接龙，看完激励视频最多再开 2 条；\n· 每天最多传 40 棒；\n· 同一条接龙中，每人最多接 3 棒，且不能连续接两棒；\n· 画一棒限时 60 秒，猜一句限时 45 秒；\n· 一条接龙要在 48 小时内传完。传了 4 棒及以上的，可以提前揭晓或到期揭晓；不足 4 棒的，到期后视为没传完。"},
  {"text":"6. 本游戏免费提供，通过广告获得收入。激励视频的奖励（多开一条接龙、当天使用的「今日彩笔」）只能在本游戏内使用，没有现金价值，不能转让、兑换或提现。本游戏不出售任何道具，也没有虚拟货币。"},
  {"text":"7. 分享接龙卡片完全自愿。分享不会获得任何奖励，不分享也不影响你参与。"},
  {"text":"8. 「揭晓时提醒我」是自愿订阅的一次性提醒。22:00 至次日 08:00 之间揭晓的，提醒会推迟到 08:00 发送。"},
  {"text":"9. 预设题目由我们创作整理，其中部分题目在人工智能辅助下起草，并经人工审核修改。本游戏不向你提供人工智能生成内容的功能。"},
  {"text":"三、内容规范","heading":true},
  {"text":"你在本游戏中画的画、写的一句话、自己出的题目，统称「你的内容」。你的内容会被群友看到，请遵守法律法规（包括《网络安全法》《网络信息内容生态治理规定》《未成年人保护法》等）、《腾讯微信软件许可及服务协议》及微信小游戏平台的运营规范。"},
  {"text":"你不得画出或写出以下内容：","important":true},
  {"text":"1. 政治类：反对宪法基本原则、危害国家安全和统一、损害国家荣誉和利益的内容；国家领导人和其他真实政治人物；国旗、国徽、地图等国家标志；政治事件和政治口号。"},
  {"text":"2. 色情低俗：裸体、性器官、性行为、性暗示；任何涉及未成年人的性内容。"},
  {"text":"3. 暴力血腥恐怖：杀人、伤害、虐待；自残、自杀；枪支等武器；恐怖主义、极端主义。"},
  {"text":"五、举报","heading":true},
  {"text":"1. 看到不合适的内容，请点「举报」，并选择理由：色情低俗、政治敏感、辱骂攻击、广告引流、其他不适。可以举报的地方包括：\n· 接棒时看到的上一棒；\n· 揭晓中的每一棒；\n· 揭晓预告中的文字。"},
  {"text":"2. 举报提交后，该内容会立即对所有人隐藏。如果被举报的是一条进行中接龙的最新一棒，这一棒会重新开放给群友来接。如果被举报的是自己出的题目，整条接龙会被隐藏。","important":true},
  {"text":"3. 我们不会向任何人透露举报人。"},
  {"text":"4. 每人每天最多举报 10 次，同一内容只能举报一次，不能举报自己的内容。"},
  {"text":"5. 我们会核实举报。举报成立的，内容保持隐藏，并对作者记违规一次；不成立的，内容可能恢复显示。"},
  {"text":"6. 你也可以通过微信提供的投诉功能（右上角菜单中的「投诉」）向微信平台投诉。"},
  {"text":"7. 对于恶意举报等滥用行为，我们可以限制相关用户参与接龙。","important":true},
];

const ROOM_ENTRY = {
  loading: { headline: '', subline: null, joinedText: null },
  joinable: { headline: '群友开了一局传画', subline: '每人选一个题目，轮流画和猜，大约 3 分钟', joinedText: '4 人已加入（3–10 人）' },
  full: { headline: '这一局满员了（10 人）', subline: null, joinedText: null },
  started: { headline: '这一局已经开始了，等下一局吧', subline: null, joinedText: null },
  teaser: { headline: '这一局已经揭晓了', subline: '完整内容仅这一局的群友可见', joinedText: null },
  wrongGroup: { headline: '这一局只能在发起的群里加入', subline: null, joinedText: null },
  closed: { headline: '这一局已经结束了', subline: null, joinedText: null },
  removed: { headline: '这一局已被移除', subline: null, joinedText: null },
  notFound: { headline: '找不到这一局', subline: null, joinedText: null },
  inOtherRoom: { headline: '你还在另一局里', subline: '先回到那一局，或者离开它', joinedText: null },
  restricted: { headline: '群友开了一局传画', subline: null, joinedText: '4 人已加入（3–10 人）', restrictionText: '你被限制参与至 10月17日 14:00，可以先看看已揭晓的接龙' },
  rulesRequired: { headline: '群友开了一局传画', subline: '每人选一个题目，轮流画和猜，大约 3 分钟', joinedText: '4 人已加入（3–10 人）' },
  ugcPaused: { headline: '群友开了一局传画', subline: null, joinedText: '4 人已加入（3–10 人）', restrictionText: '接龙维护中，可以先看看已揭晓的接龙' },
  capReached: { headline: '今天加入的局数已用完', subline: '明天再来', joinedText: null },
  offline: { headline: '需联网才能加入', subline: null, joinedText: null },
  error: { headline: '出了点小问题，请重试', subline: null, joinedText: null },
};

function roomEntry(state) {
  return { state, roomId: 'ROOMAAAAAA', joining: false, ...(state === 'inOtherRoom' ? { otherRoomId: 'ROOMBBBBBB' } : {}), restrictionText: null, ...ROOM_ENTRY[state], ...common() };
}

const seats = (filled, me, quiet) => Array.from({ length: 10 }, (v, i) => ({ n: i + 1, filled: i < filled, me: i + 1 === me, quiet: quiet === i + 1 }));

function lobby(state, o) {
  return Object.assign({
    state, roomId: 'ROOMAAAAAA', seats: seats(4, 1, 3), joinedText: '4 人已加入（3–10 人）', isHost: true,
    start: { show: true, enabled: true, label: '开始（4 人）', hint: null, slowLink: false }, waitingText: null, canInvite: true, ...common(),
  }, o || {});
}

const chainSteps = () => [
  { n: 0, label: '起点', kind: 'prompt', text: '月亮吃月饼', mine: false, placeholder: null, laughs: 0, myLaugh: false, canLaugh: false, canReport: false },
  { n: 1, label: '第 1 棒 · 画', kind: 'draw', strokes: drawing(1363), mine: true, placeholder: null, laughs: 3, myLaugh: false, canLaugh: true, canReport: false },
  { n: 2, label: '第 2 棒 · 猜', kind: 'describe', text: '一个大饼在天上', mine: false, placeholder: null, laughs: 1, myLaugh: true, canLaugh: true, canReport: true },
  { n: 3, label: '第 3 棒 · 画', kind: 'draw', strokes: drawing(1024), mine: false, placeholder: null, laughs: 0, myLaugh: false, canLaugh: true, canReport: true },
  { n: 4, label: '第 4 棒 · 猜 · 最后一棒', kind: 'describe', text: '外星人在吃披萨', mine: false, placeholder: null, laughs: 2, myLaugh: false, canLaugh: true, canReport: true },
];

function stepthrough(state, o) {
  const steps = chainSteps();
  return Object.assign({
    state, mode: 'live', roomId: 'ROOMAAAAAA', chainId: 'ABCDEFGHJK', chainNo: 2, chainCount: 5, header: '第 2 条 · 你起的', earlyText: null, backLabel: '全部',
    steps, index: steps.length - 1, playT: 1, dots: { show: true, text: null }, canPrev: true, canNext: false, endAction: null, canShare: false, interstitialDue: false, ...common(),
  }, o || {});
}

const card = (no, id, final, extra) => Object.assign({ chainNo: no, chainId: id, mineStarted: false, unseen: false, final }, extra || {});

function overview(state, o) {
  return Object.assign({
    state, roomId: 'ROOMAAAAAA', title: '全部揭晓！', subtitle: '5 条接龙 · 每条传了 4 棒', scrollY: 0,
    cards: [
      card(1, 'AAAAAAAAAA', { kind: 'draw', strokes: drawing(1363), placeholder: null, loaded: true }, { unseen: true }),
      card(2, 'BBBBBBBBBB', { kind: 'describe', text: '外星人在吃披萨', placeholder: null, loaded: true }, { mineStarted: true }),
      card(3, 'CCCCCCCCCC', { kind: 'marker', marker: 'emptyText', placeholder: null, loaded: true }),
      card(4, 'DDDDDDDDDD', { kind: 'draw', strokes: drawing(1024), placeholder: null, loaded: true }, { unseen: true }),
      card(5, 'EEEEEEEEEE', { kind: 'describe', text: '企鹅在沙漠晒太阳', placeholder: null, loaded: true }),
    ],
    rematch: { label: '再来一局', banner: null }, canShare: true, interstitialDue: false, ...common(),
  }, o || {});
}

const BUILDERS = {
  home: (() => {
    const ready = () => ({
      state: 'ready', streakText: '连续接龙 4 天',
      primary: { kind: 'room', label: '开一局', sublabel: '3–10 人一起，约 3 分钟', enabled: true },
      slowLink: { show: true, label: '慢慢传（不用同时在线）' },
      activeRoom: null,
      groupLine: { show: true, text: '来自群聊 · 本群有一局正在等人 ›', target: 'room', roomId: 'ROOMAAAAAA' },
      chainStart: { freeLeft: 3, adLeft: 2, sheet: null, adState: 'idle' },
      album: { unseenReveals: 1 }, restriction: null, ugcPausedText: null, showHowToOnce: false, showRulesWarning: false, sheet: null, scrollY: 0, ...common(),
    });
    return {
      loading: () => ({ ...ready(), state: 'loading', streakText: null, primary: { kind: 'room', label: '开一局', sublabel: null, enabled: false }, groupLine: { show: false, text: '', target: 'group' } }),
      ready,
      offline: () => ({ ...ready(), state: 'offline', streakText: null, primary: { kind: 'room', label: '开一局', sublabel: '需联网才能开局', enabled: false }, groupLine: { show: false, text: '', target: 'group' } }),
      error: () => ({ ...ready(), state: 'error', primary: { kind: 'room', label: '开一局', sublabel: null, enabled: false }, groupLine: { show: false, text: '', target: 'group' } }),
    };
  })(),
  rules: { open: () => ({ version: 2, open: true, pendingAction: 'createRoom', ...common() }) },
  warning: { open: () => ({ text: strikes.WARNING_TEXT, ...common() }) },
  howto: { open: () => ({ ...common() }) },
  startLimit: {
    ad: () => ({ chainStart: { freeLeft: 0, adLeft: 2, adState: 'idle' }, ...common() }),
    none: () => ({ chainStart: { freeLeft: 0, adLeft: 0, adState: 'idle' }, ...common() }),
  },
  pick: (() => {
    const ready = () => ({
      state: 'ready', mode: 'live', title: '选一个题目', subtitle: '传给下一位来画', timer: { secLeft: 24, warn: false },
      rollId: 'ROLL000001', prompts: [{ id: 'I1001', text: '月亮吃月饼' }, { id: 'A0003', text: '企鹅滑滑梯' }, { id: 'G0023', text: '熊猫开出租车' }],
      selectedId: 'I1001', rerollLeft: 5, rerollDisabled: false, rerollLabel: '换一批（剩5次）', rerollTappable: true, custom: { open: false, text: '', count: '0/12', error: null, passed: false },
      startLabel: '就这个', canStart: true, errorText: null, canBack: false, scrollY: 0, ...common(),
    });
    return {
      loading: () => ({ ...ready(), state: 'loading', prompts: [], selectedId: null, canStart: false, rerollLeft: 0, rerollDisabled: true, rerollLabel: '换一批机会已用完', rerollTappable: false }),
      ready,
      rerolling: () => ({ ...ready(), state: 'rerolling', canStart: false, rerollLeft: 4, rerollLabel: '换一批（剩4次）', rerollTappable: false }),
      sending: () => ({ ...ready(), state: 'sending', canStart: false, startLabel: '准备中…', rerollTappable: false }),
      error: () => ({ ...ready(), state: 'error', rerollTappable: false, errorText: '审核服务繁忙，请稍后再试，或先选一个现成的题目' }),
      offline: () => ({ ...ready(), state: 'offline', canStart: false, errorText: '需联网才能开始' }),
      timeUp: () => ({ ...ready(), state: 'timeUp', timer: { secLeft: 0, warn: true }, canStart: false }),
    };
  })(),
  draw: (() => {
    const drawing_ = () => ({
      mode: 'live', roomId: 'ROOMAAAAAA', round: 1, rounds: 4, title: '画出来 · 1/4', backLabel: '离开',
      source: { kind: 'text', text: '恐龙在学跳舞' }, sourceLines: 1, canReport: true, timer: { secLeft: 48, warn: false },
      canvas: { x: 8, y: 180, w: 359, h: 478 }, gridH: 1363, palette: palette(false), colorIdx: 0, sizeIdx: 1,
      strokes: drawing(1363), strokesRev: 3, pointsUsed: 24, pointsMax: 4000, limitText: null,
      canUndo: true, canSubmit: true, inputLocked: false, status: 'drawing', statusText: null, coach: false, ...common(),
    });
    return {
      drawing: drawing_,
      sending: () => ({ ...drawing_(), status: 'sending', statusText: '正在交出…', inputLocked: true, canSubmit: false, canUndo: false }),
      blocked: () => ({ ...drawing_(), status: 'blocked', statusText: '这幅画没通过审核，改一改再交' }),
      error: () => ({ ...drawing_(), status: 'error', statusText: '没传出去' }),
      timeUp: () => ({ ...drawing_(), status: 'timeUp', statusText: '时间到，正在交出…', timer: { secLeft: 0, warn: true }, inputLocked: true, canSubmit: false, canUndo: false }),
    };
  })(),
  describe: (() => {
    const typing = () => ({
      mode: 'live', roomId: 'ROOMAAAAAA', round: 2, rounds: 4, title: '猜一猜 · 2/4', backLabel: '离开',
      source: { kind: 'draw', strokes: drawing(1363) }, canReport: true, timer: { secLeft: 31, warn: false },
      text: '一只猫在开出租车', count: '8/16', canSubmit: true, inputLocked: false, status: 'typing', errorText: null, caret: true, shake: false, ...common(),
    });
    return {
      typing,
      sending: () => ({ ...typing(), status: 'sending', errorText: '审核中…', inputLocked: true, canSubmit: false }),
      blocked: () => ({ ...typing(), status: 'blocked', errorText: '这句话没通过审核，换个说法吧' }),
      busy: () => ({ ...typing(), status: 'busy', errorText: '审核服务繁忙，请稍后再试' }),
      error: () => ({ ...typing(), status: 'error', errorText: '没传出去' }),
      timeUp: () => ({ ...typing(), status: 'timeUp', errorText: '时间到，正在交出…', timer: { secLeft: 0, warn: true }, inputLocked: true, canSubmit: false }),
    };
  })(),
  roundWait: (() => {
    const ready = () => ({
      roomId: 'ROOMAAAAAA', round: 2, rounds: 4, title: '已交 · 2/4', timer: { secLeft: 21, warn: false },
      mine: { text: '一个大饼在天上' }, progressText: '等大家交… 3/5 已交', nextText: '下一轮：画出来', passing: false, offlineText: null, ...common(),
    });
    return {
      ready,
      passing: () => ({ ...ready(), passing: true, nextText: '下一轮：画出来' }),
      offline: () => ({ ...ready(), offlineText: '网络不好，正在重连…' }),
    };
  })(),
  lobby: {
    ready: () => lobby('ready'),
    starting: () => lobby('starting'),
    closed: () => lobby('closed', { seats: seats(0, 0), joinedText: '' }),
    removed: () => lobby('removed', { seats: seats(0, 0), joinedText: '' }),
    offline: () => lobby('offline'),
  },
  roomEntry: Object.keys(ROOM_ENTRY).reduce((o, k) => { o[k] = () => roomEntry(k); return o; }, {}),
  sent: (() => {
    const base = (modState, modText) => ({
      chainId: 'ABCDEFGHJK', step: 3, kind: 'draw', mine: { strokes: drawing(1363) }, modState, modText, nextText: '群友现在可以接第 4 棒', autoUpdateNote: true,
      subscribe: { state: 'offer' }, firstTimeExplainer: true, revealed: false, ...common(),
    });
    return {
      pending: () => base('pending', '审核中'),
      passed: () => base('passed', '已通过'),
      marker: () => ({ ...base('marker', '时间到，已自动交出（没来得及画）'), mine: { marker: 'emptyDraw' } }),
      blocked: () => ({ ...base('blocked', '这一棒没通过内容审核，没有传出去'), nextText: null, subscribe: { state: 'hidden' } }),
      void: () => ({ ...base('void', '审核超时，这一棒没有传出去，不算你的次数'), nextText: null, subscribe: { state: 'hidden' } }),
    };
  })(),
  entry: (() => {
    const states = {
      loading: { passed: 0, nextStep: null, nextKind: null },
      claimable: {},
      taken: { takenEtaText: '约 2 分钟内' },
      pending: {},
      prevMine: { isParticipant: true },
      capReached: { isParticipant: true },
      wrongGroup: {},
      inRoom: {},
      revealedParticipant: { passed: 6, nextStep: null, nextKind: null, isParticipant: true, timeLeftText: null },
      revealedTeaser: { passed: 6, nextStep: null, nextKind: null, timeLeftText: null },
      expired: { passed: 2, nextStep: null, nextKind: null, timeLeftText: null, isParticipant: true },
      removed: { timeLeftText: null },
      notFound: { passed: 0, nextStep: null, nextKind: null, timeLeftText: null },
      restricted: { restrictionText: '你被限制参与至 10月17日 14:00，可以先看看已揭晓的接龙' },
      rulesRequired: {},
      ugcPaused: {},
      dailyLimit: {},
      offline: { timeLeftText: null },
      error: { timeLeftText: null },
    };
    const out = {};
    for (const s of Object.keys(states)) out[s] = () => entry(s, states[s]);
    out.claimable_starter = () => entry('claimable', { passed: 4, nextStep: 5, nextKind: 'draw', isStarter: true, isParticipant: true, canRevealNow: true });
    return out;
  })(),
  overview: {
    loading: () => overview('loading', { cards: [], subtitle: '' }),
    ready: () => overview('ready'),
    notMember: () => overview('notMember', { cards: [] }),
    paused: () => overview('paused', { cards: overview('ready').cards.map((c) => ({ ...c, final: { kind: c.final.kind, placeholder: 'paused', loaded: true } })) }),
    offline: () => overview('offline', { cards: [] }),
    error: () => overview('error', { cards: [] }),
  },
  stepthrough: {
    loading: () => stepthrough('loading', { steps: [], index: 0, header: '' }),
    ready: () => stepthrough('ready'),
    notParticipant: () => stepthrough('notParticipant', { steps: [], index: 0 }),
    paused: () => stepthrough('paused', { steps: chainSteps().map((s) => ({ n: s.n, label: s.label, kind: s.kind, mine: s.mine, placeholder: 'paused', laughs: 0, myLaugh: false, canLaugh: false, canReport: false })) }),
    offline: () => stepthrough('offline', { steps: [], index: 0 }),
    error: () => stepthrough('error', { steps: [], index: 0 }),
  },
  teaser: (() => {
    const ready = () => ({ state: 'ready', kind: 'chain', title: '一条接龙揭晓了', lines: [{ from: '月亮吃月饼', to: '企鹅在沙漠晒太阳' }], passed: 6, paused: false, scrollY: 0, ...common() });
    return {
      loading: () => ({ ...ready(), state: 'loading', lines: [] }),
      ready,
      removed: () => ({ ...ready(), state: 'removed', lines: [] }),
      notFound: () => ({ ...ready(), state: 'notFound', lines: [] }),
      offline: () => ({ ...ready(), state: 'offline' }),
    };
  })(),
  group: (() => {
    const ready = () => ({
      state: 'ready', statsText: '本群一共玩了 12 局 · 画了 41 幅画',
      rooms: [{ roomId: 'ROOMAAAAAA', line: '4 人已加入 · 等待开始', joinable: true }, { roomId: 'ROOMBBBBBB', line: '第 2/4 轮进行中', joinable: false }],
      waiting: [{ chainId: 'AAAAAAAAAA', line: '第 4 棒 · 猜一句 · 已传 3/6' }, { chainId: 'BBBBBBBBBB', line: '第 2 棒 · 猜一句 · 已传 1/6' }],
      inProgress: [{ chainId: 'CCCCCCCCCC', line: '第 4 棒有人在接 · 已传 3/6' }],
      revealed: [{ kind: 'room', id: 'ROOMCCCCCC', line: '一局 · 5 条接龙 · 今天 20:14', member: true }, { kind: 'chain', id: 'FFFFFFFFFF', line: '「搬家」→「一只猫在开出租车」', member: false }],
      banner: { show: false, reservedHeight: 0 }, scrollY: 0, ...common(),
    });
    const none = { statsText: null, rooms: [], waiting: [], inProgress: [], revealed: [] };
    return {
      noGroup: () => ({ ...ready(), state: 'noGroup', ...none }),
      checkingGroup: () => ({ ...ready(), state: 'checkingGroup', ...none }),
      loading: () => ({ ...ready(), state: 'loading', ...none }),
      ready,
      empty: () => ({ ...ready(), state: 'empty', ...none }),
      error: () => ({ ...ready(), state: 'error' }),
    };
  })(),
  album: (() => {
    const mk = (kind, status, id, line, unseen) => ({ kind, id, status, line, timeText: '今天 20:14', unseen: !!unseen });
    const ready = () => ({
      state: 'ready', streakText: '连续接龙 4 天', cursor: null, banner: { show: false, reservedHeight: 0 }, scrollY: 0, ...common(),
      items: [
        mk('room', 'revealed', 'ROOMCCCCCC', '一局 · 5 条接龙', true), mk('room', 'playing', 'ROOMBBBBBB', '一局 · 第 2/4 轮进行中'), mk('chain', 'revealed', 'AAAAAAAAAA', '已揭晓「月亮吃月饼」', true),
        mk('chain', 'open', 'BBBBBBBBBB', '慢慢传 · 进行中 3/6 · 我画了第 1 棒'), mk('chain', 'expired', 'CCCCCCCCCC', '没传完「搬家」'), mk('chain', 'blocked', 'DDDDDDDDDD', '这一棒没通过审核 · 第 5 棒'),
      ],
    });
    return {
      loading: () => ({ ...ready(), state: 'loading', items: [], streakText: null }),
      ready,
      empty: () => ({ ...ready(), state: 'empty', items: [], streakText: null }),
      error: () => ({ ...ready(), state: 'error', items: [] }),
      offline: () => ({ ...ready(), state: 'offline' }),
    };
  })(),
  mine: (() => {
    const ready = () => ({
      state: 'ready', chainId: 'ABCDEFGHJK', scrollY: 0, ...common(),
      mine: [
        { n: 1, kind: 'draw', strokes: drawing(1363), modState: 'passed', canDelete: true, line: '第 1 棒 · 已通过' },
        { n: 3, kind: 'draw', marker: 'emptyDraw', modState: 'marker', canDelete: false, line: '第 3 棒 · 时间到，已自动交出' },
        { n: 5, kind: 'describe', text: '企鹅在沙漠晒太阳', modState: 'blocked', canDelete: true, line: '第 5 棒 · 这一棒没通过审核' },
      ],
    });
    return { loading: () => ({ ...ready(), state: 'loading', mine: [] }), ready, error: () => ({ ...ready(), state: 'error', mine: [] }) };
  })(),
  report: (() => {
    const idle = () => ({ open: true, target: { chainId: 'ABCDEFGHJK', step: 2, roomId: 'ROOMAAAAAA' }, reasons: ['porn', 'politics', 'abuse', 'ad', 'other'], state: 'idle', selected: 'abuse', ...common() });
    const mk = (state) => () => ({ ...idle(), state });
    return { idle, submitting: mk('submitting'), done: mk('done'), limit: mk('limit'), dup: mk('dup'), error: mk('error') };
  })(),
  settings: {
    idle: () => ({
      muted: false, largeText: false, highContrast: false, canUnlockPalette: true, paletteUnlockedToday: false, paletteAd: { state: 'idle' },
      reminderText: '揭晓提醒：慢慢传揭晓时提醒你（每次需要你点一下）', deleteAll: { state: 'idle' }, ...common(),
    }),
  },
  terms: { ready: () => ({ title: '用户协议', paragraphs: TERMS_SLICE, scrollY: 0, ...common() }) },
  overlay: {
    dialog: () => ({ dialog: { title: '离开这一局？', text: '离开后你的回合会自动跳过，确定离开？', confirmLabel: '离开', cancelLabel: '继续玩', danger: true }, display: display() }),
    toast: () => ({ toast: { text: '群里有新消息，交完这一棒再看' }, display: display() }),
    adStub: () => ({ adStub: { kind: 'rewarded', secondsLeft: 3 }, display: display() }),
  },
  shareCard: {
    invite: () => ({ kind: 'invite', passed: 3, length: 6 }),
    reveal: () => ({ kind: 'reveal', promptText: '月亮吃月饼', finalText: '企鹅在沙漠晒太阳', participantCount: 6 }),
    roomInvite: () => ({ kind: 'roomInvite' }),
    roomReveal: () => ({ kind: 'roomReveal', chainCount: 5, promptText: '月亮吃月饼', finalText: '外星人在吃披萨' }),
  },
};

const SCREENS = Object.keys(BUILDERS);

/** a fresh view model for screen + state (shallow `overrides`) */
function sample(screen, state, overrides) {
  const b = BUILDERS[screen] && BUILDERS[screen][state];
  if (!b) throw new Error('no sample for ' + screen + '/' + state);
  return Object.assign(b(), overrides || {});
}

/** every screen -> state list that has a sample */
const SAMPLES = {};
for (const s of SCREENS) SAMPLES[s] = Object.keys(BUILDERS[s]);

module.exports = { sample, SAMPLES, SCREENS, wire, scene, busy, drawing, busyDrawing, emptyDrawing, palette, lobby, stepthrough, overview, roomEntry, entry, seats };
