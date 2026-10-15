/**
 * Fixture view models for every screen x state (spec 6, 10). The same data
 * drives the PNG preview and tests/render*.test.js, so they never drift.
 *
 *   buildFixtures({createCanvas, L, display}) -> { <screen>: { <state>: {vm, overlay?} } }
 *
 * `display` is one of MODES (applied to every vm). Open data boards are
 * drawn for real with opendata/draw.js into a fake shared canvas.
 */

const path = require('path');
const T = require(path.join(__dirname, '..', '..', 'js', 'render', 'theme.js'));
const B = require(path.join(__dirname, '..', '..', 'js', 'render', 'board.js'));
const OB = require(path.join(__dirname, '..', '..', 'opendata', 'board.js'));
const OD = require(path.join(__dirname, '..', '..', 'opendata', 'draw.js'));

const MODES = {
  standard: { largeText: false, highContrast: false, scale: 1, palette: 'standard' },
  large: { largeText: true, highContrast: false, scale: 1.25, palette: 'standard' },
  hc: { largeText: false, highContrast: true, scale: 1, palette: 'highContrast' },
  largehc: { largeText: true, highContrast: true, scale: 1.25, palette: 'highContrast' },
};

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, bottomInset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];

const CARD = { itemId: 's001i01', spectrumId: 's001', left: '冷', right: '热', prompt: '火锅', catLabel: '吃喝' };
const CARD2 = { itemId: 's014i03', spectrumId: 's014', left: '便宜', right: '贵', prompt: '一杯奶茶', catLabel: '日常' };
const CARD_LONG = { itemId: 's090i07', spectrumId: 's090', left: '好学', right: '难学', prompt: '周末在家研究怎么做一锅正宗的佛跳墙', catLabel: '吃喝' };

const SALT = 's4ltS4lt';
const ROWS5 = [
  { prompt: '火锅', left: '冷', right: '热', you: 58, nation: 63, label: '很同频', scoreText: '+88' },
  { prompt: '一杯奶茶', left: '便宜', right: '贵', you: 30, nation: 72, label: '想法独特', scoreText: '+0' },
  { prompt: '周末睡到自然醒', left: '浪费', right: '享受', you: 88, nation: 90, label: '心有灵犀', scoreText: '+95' },
  { prompt: '早高峰地铁', left: '轻松', right: '累人', you: 70, nation: 82, label: '差不多', scoreText: '+70' },
  { prompt: '一只橘猫', left: '高冷', right: '黏人', you: 40, nation: 55, label: '有点偏', scoreText: '+63' },
];
const HIST = ROWS5.map((r, i) => {
  const out = [];
  for (let b = 0; b < 21; b++) out.push(Math.round(80 * Math.exp(-Math.pow((b * 5 - r.nation) / (14 + i * 4), 2)) + 6));
  return out;
});

const REVEAL_BASE = {
  markers: [
    { pos: 58, kind: 'you' },
    { pos: 63, kind: 'nation' },
  ],
  label: '很同频',
  scoreText: '+88',
  nationText: '全国 ◆ 在你右边 5 格 · 实时',
  agreeText: '和全国 63% 的人想法相近',
  groupText: null,
  bullseye: false,
};
const REVEAL_GROUP = Object.assign({}, REVEAL_BASE, {
  markers: [
    { pos: 58, kind: 'you' },
    { pos: 63, kind: 'nation' },
    { pos: 60, kind: 'group' },
    { pos: 55, kind: 'member' },
    { pos: 60, kind: 'member' },
    { pos: 72, kind: 'member' },
    { pos: 61, kind: 'member' },
  ],
  groupText: '本群 4 人 ● 和你一样',
});

function mkSys(sz) {
  return sz;
}
void mkSys;

/** Draw a real open-data board into a fake shared canvas for the given rect. */
function fakeBoard(createCanvas, L, kind, spec) {
  const rows = spec.rows;
  const h = B.boxHeight(L, Math.min(rows.length, B.VISIBLE_ROWS));
  const w = L.contentW;
  const canvas = createCanvas(Math.round(w * 2), Math.round(h * 2));
  const ctx = canvas.getContext('2d');
  if (ctx.scale) ctx.scale(2, 2);
  const msg = Object.assign(
    { view: kind, salt: SALT, selfHash: OB.hashOf('me', SALT), viewerDone: true, palette: T.MODE.hc ? 'highContrast' : 'standard' },
    spec.msg,
    { rows }
  );
  const model = OB.buildModel(msg, spec.raw || []);
  OD.drawBoard(ctx, model, { width: w, height: h, scroll: 0, rowH: B.rowH(L), footH: B.footH(L), fontScale: L.s * (T.MODE.large ? 1.2 : 1), palette: msg.palette, images: {} });
  return canvas;
}

const hs = (o) => OB.hashOf(o, SALT);
const RAW = [
  { openid: 'o_zs', nickname: '张三', avatarUrl: '' },
  { openid: 'o_ls', nickname: '李四', avatarUrl: '' },
  { openid: 'o_ww', nickname: '王小明明明', avatarUrl: '' },
];
const GROUP_ROWS = [
  [hs('o_zs'), 455, 430, 40000, '58,30,88,70,40', 5],
  [hs('me'), 412, 401, 41000, '60,28,86,72,45', 3],
  [hs('o_ls'), 398, 380, 42000, '50,40,80,60,60', 1],
  [hs('o_ww'), 380, 366, 43000, '70,20,90,80,30', 0],
  [hs('anon1'), 350, 340, 44000, '55,50,70,65,35', 0],
  [hs('anon2'), 330, 320, 45000, '65,45,75,55,50', 0],
  [hs('anon3'), 300, 290, 46000, '45,55,65,50,70', 0],
];
const FRIEND_ROWS = [
  [hs('o_zs'), 430, 40000, '58,30,88,70,40', 5],
  [hs('me'), 401, 41000, '60,28,86,72,45', 3],
  [hs('o_ls'), 380, 42000, '50,40,80,60,60', 1],
  [hs('anon1'), 340, 44000, '55,50,70,65,35', 0],
  [hs('anon2'), 320, 45000, '65,45,75,55,50', 0],
];
const ROUND_ROWS = [
  [hs('o_zs'), 46, 97, 0, 0],
  [hs('me'), 40, 85, 0, 0],
  [hs('anon1'), 30, 62, 0, 0],
  [hs('anon2'), 52, 92, 0, 0],
  [hs('o_ls'), 20, 40, 1, 0],
  [hs('anon9'), 0, 0, 0, 1],
];

function buildFixtures(opts) {
  const L = opts.L;
  const display = opts.display || MODES.standard;
  const createCanvas = opts.createCanvas;
  T.applyDisplay(display);
  const V = (vm) => ({ vm: Object.assign({ display }, vm) });
  const O = (vm, ov) => ({ vm: Object.assign({ display }, vm), overlay: Object.assign({ display }, ov) });
  const fx = {};

  // ----------------------------------------------------------------- home
  const daily = (over) => Object.assign({ state: 'available', issueNo: 12, dateKey: '20261015', answered: 0, scoreText: null, yesterdayText: null, streakText: null }, over);
  const home = (vm) => Object.assign({ daily: daily(), group: { status: 'none', bannerText: null }, muted: false, showHowToOnce: false, t: 1200 }, vm);
  fx.home = {
    loading: V(home({ daily: daily({ state: 'loading' }) })),
    available: V(home({})),
    availableFull: V(home({ daily: daily({ yesterdayText: '昨日定分 421 · 超过全国 68%', streakText: '连续 5 天' }), group: { status: 'ok', bannerText: '查看本群今日默契' } })),
    inProgress: V(home({ daily: daily({ state: 'inProgress', answered: 2 }) })),
    done: V(home({ daily: daily({ state: 'done', answered: 5, scoreText: '今日默契分 412 · 默契十足 (实时)', streakText: '连续 5 天' }), group: { status: 'ok', bannerText: '查看本群今日默契' } })),
    pendingSubmit: V(home({ daily: daily({ state: 'pendingSubmit', answered: 3 }) })),
    error: V(home({ daily: daily({ state: 'error' }) })),
    offline: V(home({ daily: daily({ state: 'offline' }), muted: true })),
    groupChecking: V(home({ group: { status: 'checking', bannerText: null } })),
    sheetHowto: V(home({ sheet: 'howto' })),
    sheetSettings: V(home({ sheet: 'settings', settings: { muted: false, largeText: display.largeText, highContrast: display.highContrast, privacy: 'agreed', friendScope: 'denied' } })),
    sheetSettingsOn: V(home({ sheet: 'settings', settings: { muted: true, largeText: true, highContrast: false, privacy: 'unknown', friendScope: 'granted' } })),
    ovDialog: O(home({ daily: daily({ state: 'done', answered: 5, scoreText: '今日默契分 412 · 默契十足 (实时)' }) }), { dialog: { title: '要离开吗', text: '这道题还没有提交，离开后需要重新放置指针。', confirmLabel: '离开', cancelLabel: '留下' } }),
    ovToast: O(home({}), { toast: { text: '你有一道新刻度题' } }),
    ovAd: O(home({}), { adStub: { kind: 'rewarded', secondsLeft: 3 } }),
    ovPrivacy: O(home({}), { privacy: {} }),
  };

  // ----------------------------------------------------------------- play
  const play = (vm) => Object.assign({ mode: 'daily', index: 2, total: 5, issueNo: 12, tag: null, card: CARD, phase: 'empty', needle: null, canConfirm: false, reveal: null, primaryLabel: '就这儿', t: 900 }, vm);
  fx.play = {
    emptyCoach: V(play({ coach: true, index: 1 })),
    empty: V(play({})),
    placing: V(play({ phase: 'placing', needle: 62, canConfirm: true, dragging: true })),
    placingAtZero: V(play({ phase: 'placing', needle: 0, canConfirm: true })),
    placingAtMax: V(play({ phase: 'placing', needle: 100, canConfirm: true })),
    submitting: V(play({ phase: 'submitting', needle: 62, canConfirm: false })),
    pending: V(play({ phase: 'pending', needle: 62, notice: '网络不稳，答案还没送达', primaryLabel: '重试' })),
    revealedNation: V(play({ phase: 'revealed', needle: 58, reveal: REVEAL_BASE, primaryLabel: '下一张' })),
    revealedGroup: V(play({ phase: 'revealed', needle: 58, reveal: REVEAL_GROUP, primaryLabel: '下一张' })),
    revealedLast: V(play({ index: 5, phase: 'revealed', needle: 58, reveal: Object.assign({}, REVEAL_GROUP, { agreeText: null }), primaryLabel: '看结果' })),
    revealAnimating: V(play({ phase: 'revealed', needle: 58, reveal: REVEAL_GROUP, primaryLabel: '下一张', revealT: 0.4, textT: 0.3 })),
    bullseye: V(play({ phase: 'revealed', needle: 63, reveal: Object.assign({}, REVEAL_GROUP, { markers: REVEAL_GROUP.markers.map((m) => (m.kind === 'you' ? { pos: 63, kind: 'you' } : m)), label: '心有灵犀', scoreText: '+100', nationText: '全国 ◆ 就在这里 · 实时', bullseye: true }), primaryLabel: '下一张', confettiT: 0.35 })),
    archive: V(play({ mode: 'archive', issueNo: 9, phase: 'revealed', needle: 40, reveal: Object.assign({}, REVEAL_BASE, { nationText: '全国 ◆ 在你右边 23 格 · 定分', label: '想法独特', scoreText: '+0', agreeText: '和全国 12% 的人想法相近' }), primaryLabel: '下一张' })),
    bonus: V(play({ mode: 'bonus', index: null, total: null, tag: '加一题 · 不计分', card: CARD2, phase: 'placing', needle: 33, canConfirm: true })),
    longPrompt: V(play({ card: CARD_LONG, phase: 'placing', needle: 20, canConfirm: true })),
    longPromptRevealed: V(play({ card: CARD_LONG, phase: 'revealed', needle: 58, reveal: REVEAL_GROUP, primaryLabel: '下一张' })),
    sheetReport: V(play({ phase: 'revealed', needle: 58, reveal: REVEAL_GROUP, primaryLabel: '下一张', sheet: 'report' })),
  };

  // --------------------------------------------------------------- result
  const result = (vm) => Object.assign({ issueNo: 12, final: false, totalText: '412', bandLabel: '默契十足', statusTag: '实时', percentileText: null, rows: ROWS5, divisiveText: '今日最有争议：一杯奶茶 (便宜↔贵)', streakText: '连续 5 天 · 0:30 定分', groupText: null, bonus: { left: 3, adState: 'idle' }, distribution: { unlocked: false, adState: 'idle' }, t: 0 }, vm);
  fx.result = {
    live: V(result({})),
    final: V(result({ final: true, statusTag: '定分', percentileText: '超过全国 68%', streakText: '连续 5 天' })),
    group: V(result({ groupText: '本群群内默契分 388 · 本群默契度 81' })),
    groupSmall: V(result({ groupText: '本群完成满 3 人后计算默契度' })),
    low: V(result({ totalText: '168', bandLabel: '独树一帜', divisiveText: null, streakText: null })),
    bonusSpent: V(result({ bonus: { left: 0, adState: 'idle' } })),
    adLoading: V(result({ bonus: { left: 2, adState: 'loading' }, distribution: { unlocked: false, adState: 'loading' } })),
    adError: V(result({ bonus: { left: 2, adState: 'error' }, distribution: { unlocked: false, adState: 'error' } })),
    unlocked: V(result({ distribution: { unlocked: true, adState: 'idle', hist: HIST } })),
    sheetDistribution: V(result({ distribution: { unlocked: true, adState: 'idle', hist: HIST }, sheet: 'distribution' })),
  };

  // ----------------------------------------------------------------- host
  const SPEC3 = [{ id: 's014', left: '冷', right: '热' }, { id: 's022', left: '便宜', right: '贵' }, { id: 's031', left: '好学', right: '难学' }];
  const CLUES = [
    { itemId: 'i1', text: '一张电影票' },
    { itemId: 'i2', text: '一把雨伞' },
    { itemId: 'i3', text: '一次理发' },
    { itemId: 'i4', text: '一斤苹果' },
    { itemId: 'i5', text: '一杯咖啡' },
    { itemId: 'i6', text: '一本书' },
  ];
  const host = (vm) => Object.assign({ step: 'pickSpectrum', spectra: SPEC3, freeSwapLeft: 1, adSwapLeft: 3, roundId: null, targetBand: null, clueMode: 'preset', clueOptions: [], clueItemId: null, canShare: false, t: 0 }, vm);
  const clueVm = { step: 'pickClue', left: '便宜', right: '贵', roundId: 'r1', targetBand: { from: 35, to: 39 }, clueOptions: CLUES, clueSwapLeft: 1 };
  fx.host = {
    pickSpectrum: V(host({})),
    swapUsed: V(host({ freeSwapLeft: 0, adSwapLeft: 3 })),
    swapExhausted: V(host({ freeSwapLeft: 0, adSwapLeft: 0 })),
    adLoading: V(host({ freeSwapLeft: 0, adSwapLeft: 2, adState: 'loading' })),
    creating: V(host({ step: 'creating', t: 400 })),
    pickClue: V(host(clueVm)),
    pickClueSelected: V(host(Object.assign({}, clueVm, { clueItemId: 'i1', canShare: true }))),
    pickClueSwapUsed: V(host(Object.assign({}, clueVm, { clueItemId: 'i2', canShare: true, clueSwapLeft: 0 }))),
    clueChat: V(host(Object.assign({}, clueVm, { clueMode: 'chat', canShare: true }))),
    sharing: V(host(Object.assign({}, clueVm, { step: 'sharing', clueItemId: 'i1', canShare: true }))),
    error: V(host({ step: 'error' })),
    rateLimited: V(host({ step: 'rateLimited' })),
  };

  // ---------------------------------------------------------------- round
  const round = (vm) => Object.assign({ status: 'open', isHost: false, left: '便宜', right: '贵', clueText: '提示：一张电影票', guessCountText: '已有 3 人作答', canReveal: false, revealHint: '', myGuess: null, late: false, reveal: null, subscribe: { state: 'hidden' }, needle: null, canConfirm: false, t: 600 }, vm);
  const RREV = { target: 38, mqText: '本题默契值 78', markers: [{ pos: 38, kind: 'target' }, { pos: 46, kind: 'member' }, { pos: 40, kind: 'member' }, { pos: 30, kind: 'member' }, { pos: 52, kind: 'member' }, { pos: 41, kind: 'member' }, { pos: 20, kind: 'late' }, { pos: 45, kind: 'you' }] };
  const rboard = () => fakeBoard(createCanvas, L, 'round', { rows: ROUND_ROWS, raw: RAW, msg: { target: 38 } });
  fx.round = {
    loading: V(round({ status: 'loading' })),
    open: V(round({})),
    openPlaced: V(round({ needle: 47, canConfirm: true, dragging: true })),
    openChat: V(round({ clueText: '提示在群聊里，看看 TA 怎么说', needle: 12, canConfirm: true })),
    openSubmitting: V(round({ needle: 47, canConfirm: false, submitting: true })),
    submitted: V(round({ status: 'submitted', myGuess: 47, guessCountText: '已有 5 人作答', revealHint: '主持人揭晓，或第 8 人作答、24 小时后自动揭晓', subscribe: { state: 'offer' } })),
    submittedGranted: V(round({ status: 'submitted', myGuess: 47, guessCountText: '已有 5 人作答', revealHint: '主持人揭晓，或第 8 人作答、24 小时后自动揭晓', subscribe: { state: 'granted' } })),
    revealedUnplayed: V(round({ status: 'revealedUnplayed' })),
    lateGuess: V(round({ late: true, needle: 33, canConfirm: true })),
    hostWaitingFew: V(round({ status: 'hostWaiting', isHost: true, hostTarget: 38, guessCountText: '已有 1 人作答', canReveal: false, revealHint: '至少 2 人作答后可揭晓' })),
    hostWaiting: V(round({ status: 'hostWaiting', isHost: true, hostTarget: 38, guessCountText: '已有 5 人作答', canReveal: true, revealHint: '第 8 人作答或 24 小时后自动揭晓', subscribe: { state: 'offer' } })),
    hostRevealing: V(round({ status: 'hostWaiting', isHost: true, hostTarget: 38, guessCountText: '已有 5 人作答', canReveal: true, revealing: true, revealHint: '第 8 人作答或 24 小时后自动揭晓' })),
    revealed: V(round({ status: 'revealed', reveal: RREV, myGuess: 45, boardRows: 6, sharedCanvas: rboard() })),
    revealedAnon: V(round({ status: 'revealed', reveal: RREV, myGuess: 45, boardRows: 6, namesState: 'unauthorized', sharedCanvas: fakeBoard(createCanvas, L, 'round', { rows: ROUND_ROWS, raw: [], msg: { target: 38 } }) })),
    revealedPrivacy: V(round({ status: 'revealed', reveal: RREV, myGuess: 45, boardRows: 6, namesState: 'privacyDenied', sharedCanvas: fakeBoard(createCanvas, L, 'round', { rows: ROUND_ROWS, raw: [], msg: { target: 38 } }) })),
    revealedNoMine: V(round({ status: 'revealed', reveal: { target: 38, mqText: '本题默契值 78', markers: RREV.markers.filter((m) => m.kind !== 'you' && m.kind !== 'late') }, boardRows: 5, subscribe: { state: 'hidden' }, sharedCanvas: rboard() })),
    expiredReveal: V(round({ status: 'expired', reveal: RREV, myGuess: 45, boardRows: 6, sharedCanvas: rboard() })),
    expired: V(round({ status: 'expired' })),
    noGuessesHost: V(round({ status: 'noGuesses', isHost: true })),
    noGuessesGuest: V(round({ status: 'noGuesses' })),
    notFound: V(round({ status: 'notFound' })),
    offline: V(round({ status: 'offline' })),
  };

  // ---------------------------------------------------------------- group
  const trend = [
    { label: '10/09', value: 72 },
    { label: '10/10', value: 68 },
    { label: '10/11', value: 81 },
    { label: '10/12', value: 75 },
    { label: '10/13', value: null },
    { label: '10/14', value: 79 },
    { label: '10/15', value: 81 },
  ];
  const grounds = [
    { roundId: 'r1', title: '便宜↔贵', mqText: '默契 78', statusText: '6 人作答 · 已揭晓' },
    { roundId: 'r2', title: '冷↔热', mqText: null, statusText: '2 人作答 · 等待揭晓' },
  ];
  const gboard = (n) => fakeBoard(createCanvas, L, 'group', { rows: GROUP_ROWS.slice(0, n), raw: RAW });
  const group = (vm) => Object.assign({ state: 'ready', issueNo: 12, mqText: '81', mq: 81, countText: '已完成 7 人', divisiveText: '今日最有争议：一杯奶茶', trend, rounds: grounds, banner: { show: false, reservedHeight: 0 }, boardRows: 5, t: 0 }, vm);
  fx.group = {
    noGroup: V(group({ state: 'noGroup', mqText: null })),
    checkingGroup: V(group({ state: 'checkingGroup' })),
    groupFailed: V(group({ state: 'groupFailed' })),
    loading: V(group({ state: 'loading' })),
    notPlayed: V(group({ state: 'notPlayed', mqText: null, countText: '本群已完成 6 人' })),
    ready: V(group({ sharedCanvas: gboard(7) })),
    readyBanner: V(group({ sharedCanvas: gboard(7), banner: { show: true, reservedHeight: 100 } })),
    small: V(group({ state: 'small', mqText: null, mq: null, countText: '已完成 2 人', divisiveText: null, boardRows: 2, sharedCanvas: gboard(2) })),
    empty: V(group({ state: 'empty', mqText: null, countText: '', trend: trend.map((t) => ({ label: t.label, value: null })) })),
    serverError: V(group({ state: 'serverError' })),
    privacyDenied: V(group({ state: 'privacyDenied', sharedCanvas: fakeBoard(createCanvas, L, 'group', { rows: GROUP_ROWS, raw: [] }) })),
    unauthorized: V(group({ state: 'unauthorized', sharedCanvas: fakeBoard(createCanvas, L, 'group', { rows: GROUP_ROWS, raw: [] }) })),
  };

  // --------------------------------------------------------------- friend
  const fboard = (n, raw, extra) => fakeBoard(createCanvas, L, 'friend', { rows: FRIEND_ROWS.slice(0, n), raw: raw || RAW, msg: Object.assign({ refs: [63, 72, 90, 82, 55] }, extra) });
  const friend = (vm) => Object.assign({ state: 'ready', mode: 'full', issueNo: 12, selfText: null, banner: { show: false, reservedHeight: 0 }, boardRows: 5, t: 0 }, vm);
  fx.friend = {
    loading: V(friend({ state: 'loading', mode: null })),
    ready: V(friend({ sharedCanvas: fboard(5) })),
    readyBanner: V(friend({ sharedCanvas: fboard(5), banner: { show: true, reservedHeight: 100 } })),
    empty: V(friend({ state: 'empty', mode: null })),
    serverError: V(friend({ state: 'serverError', mode: null })),
    privacyDenied: V(friend({ state: 'privacyDenied', sharedCanvas: fboard(5, []) })),
    unauthorized: V(friend({ state: 'unauthorized', sharedCanvas: fboard(5, []) })),
    selfOnly: V(friend({ mode: 'selfOnly', selfText: '你的成绩已校验，好友的成绩为自报，不排名次。', boardRows: 3, sharedCanvas: fboard(1, [{ openid: 'o_zs', nickname: '张三', avatarUrl: '', KVDataList: [{ key: 'kd', value: JSON.stringify({ d: '20261015', s: 480 }) }] }, { openid: 'o_ls', nickname: '李四', avatarUrl: '', KVDataList: [{ key: 'kd', value: JSON.stringify({ d: '20261015', s: 300 }) }] }], { mode: 'selfOnly' }) })),
  };

  // -------------------------------------------------------------- archive
  const items = [
    { dateKey: '20261014', issueNo: 11, dateText: '10月14日', statusText: '已玩 · 定分 421' },
    { dateKey: '20261013', issueNo: 10, dateText: '10月13日', statusText: '未玩 · 5 张卡' },
    { dateKey: '20261012', issueNo: 9, dateText: '10月12日', statusText: '往期练习 380' },
    { dateKey: '20261011', issueNo: 8, dateText: '10月11日', statusText: '未玩 · 5 张卡' },
    { dateKey: '20261010', issueNo: 7, dateText: '10月10日', statusText: '已玩 · 定分 455' },
    { dateKey: '20261009', issueNo: 6, dateText: '10月9日', statusText: '未玩 · 5 张卡' },
  ];
  const archive = (vm) => Object.assign({ state: 'ready', bestStreakText: '最长连续 12 天', hasMore: true, items, banner: { show: false, reservedHeight: 0 }, t: 0 }, vm);
  fx.archive = {
    loading: V(archive({ state: 'loading', items: [] })),
    ready: V(archive({})),
    readyEnd: V(archive({ hasMore: false, items: items.slice(0, 3) })),
    readyBanner: V(archive({ banner: { show: true, reservedHeight: 100 } })),
    empty: V(archive({ state: 'empty', items: [], hasMore: false, bestStreakText: null })),
    error: V(archive({ state: 'error', items: [], hasMore: false })),
    offlineCached: V(archive({ state: 'offline' })),
  };

  // --------------------------------------------------------------- review
  const review = (vm) => Object.assign({ state: 'ready', dateKey: '20261014', issueNo: 11, kind: 'review', cards: [], finals: [], mine: { positions: [58, 30, 88, 70, 40], totalText: '421', percentileText: '超过全国 68%' }, totalText: '421', bandLabel: '默契十足', percentileText: '超过全国 68%', rows: ROWS5, divisiveText: '这一期最有争议：一杯奶茶 (便宜↔贵)', distribution: { unlocked: false, adState: 'idle' }, t: 0 }, vm);
  fx.review = {
    review: V(review({})),
    reviewUnlocked: V(review({ distribution: { unlocked: true, adState: 'idle', hist: HIST }, sheet: 'distribution' })),
    playEnd: V(review({ kind: 'play', endText: '往期练习 380 · 不计入排行', totalText: '380', bandLabel: '默契十足', percentileText: null, mine: null })),
    loading: V(review({ state: 'loading' })),
    error: V(review({ state: 'error' })),
  };

  // ------------------------------------------------------------ shareCard
  const dailyRows = ROWS5.map((r) => ({ prompt: r.prompt, left: r.left, right: r.right, label: r.label }));
  fx.shareCard = {
    daily: { vm: { type: 'daily', issueNo: 12, totalText: '412', bandLabel: '默契十足', rows: dailyRows } },
    round: { vm: { type: 'round', left: '便宜', right: '贵', clueText: '提示：一张电影票' } },
    roundChat: { vm: { type: 'round', left: '好学', right: '难学', clueText: null } },
    reveal: { vm: { type: 'reveal', left: '便宜', right: '贵', target: 38, guesses: [46, 40, 30, 52, 41, 20], mqText: '本题默契值 78', countText: '6 人作答' } },
    group: { vm: { type: 'group', mqText: '81' } },
    groupSmall: { vm: { type: 'group', mqText: null } },
  };

  T.applyDisplay(null);
  return fx;
}

module.exports = { buildFixtures, MODES, SIZES };
