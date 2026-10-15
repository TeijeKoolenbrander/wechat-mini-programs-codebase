/**
 * Fixture view models for every screen x state (spec 13). Used by render.js
 * (PNG previews) and by tests/render.test.js. The words are made-up samples;
 * none of this ships in the game.
 *
 * buildFixtures({createCanvas, L}) -> { screen: { stateName: { vm, overlay? } } }
 * Display modes are applied by the caller: vm.display = {largeText, highContrast}.
 */

const fmt = require('../../js/render/fmt');
const T = require('../../js/render/theme');
const { drawBoard } = require('../../opendata/draw');
const { buildModel, hashOf } = require('../../opendata/board');

const LABEL = T.BAND_LABEL;

function row(word, rank, o) {
  o = o || {};
  const band = fmt.bandKey(rank);
  return Object.assign(
    { word, rank, rankLabel: fmt.rankLabel(rank), temp: fmt.temperature(rank), band, bandLabel: LABEL[band], isHint: false, isSynonym: false, isLatest: false },
    o
  );
}

const WARMUPS = ['天气', '美食', '工作', '动物', '旅行', '家'];

function ladder12() {
  const rows = [
    row('蔬菜', 37),
    row('火锅', 152, { isLatest: true }),
    row('厨房', 410),
    row('土豆', 300, { isHint: true }),
    row('水果', 612),
    row('餐厅', 1480),
    row('夏天', 2840),
    row('电脑', 5120),
    row('动物', 9812),
    row('医院', 12430),
    row('星期', 19876),
    row('宇宙飞船', 24310),
  ];
  return rows.sort((a, b) => a.rank - b.rank);
}

function temps(n) {
  const out = [];
  let r = 20000;
  for (let i = 0; i < n; i++) {
    r = Math.max(2, Math.round(r * (0.55 + 0.7 * ((i * 37) % 11) / 11)));
    if (i === n - 1) r = 1;
    out.push(fmt.temperature(r));
  }
  return out;
}

function bandsOf(ts) {
  return ts.map((t) => T.bandOfTemp(t));
}

function playBase(o) {
  const lad = ladder12();
  const latest = lad.find((r) => r.word === '火锅');
  return Object.assign(
    {
      puzzleId: 'd20261015',
      kind: 'daily',
      ranked: true,
      title: '今日一词 第128期',
      state: 'result',
      steps: 12,
      hintsUsed: 1,
      firstChar: null,
      warmups: [],
      latest,
      ladder: lad,
      selectedWord: null,
      chips: ['麻辣', '涮肉', '烧烤', '串串', '锅底'],
      keyboard: { open: false, text: '', suggestions: [], heightPx: null },
      hint: { next: 2, state: 'locked', label: '第 20 步后可用提示' },
      adHint: { visible: false, left: 0 },
      toast: null,
      banner: null,
      coach: 0,
      t: 1200,
    },
    o || {}
  );
}

function manyRows(n) {
  const words = ['番茄', '西红柿', '黄瓜', '茄子', '辣椒', '白菜', '萝卜', '土豆', '洋葱', '南瓜', '玉米', '豆腐', '米饭', '面条', '饺子', '包子', '汤', '牛肉', '猪肉', '鸡蛋'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(row(words[i % words.length] + (i >= words.length ? i : ''), 20 + i * i * 9 + i * 40));
  return out;
}

function sharedBoardCanvas(createCanvas, L, vmLike, display) {
  if (!createCanvas) return null;
  const { boardRect } = require('../../js/render/board');
  const r = boardRect(L, vmLike);
  const dpr = 2;
  const c = createCanvas(Math.round(r.w * dpr), Math.round(r.h * dpr));
  const ctx = c.getContext('2d');
  if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const salt = 's4lt';
  const mk = (id, name) => ({ openid: id, nickname: name, avatarUrl: '', KVDataList: [] });
  const raw = [mk('a', '张三'), mk('me', '你'), mk('c', '李四'), mk('d', '王五'), mk('e', '赵六'), mk('f', '陈七'), mk('g', '周八'), mk('h', '吴九')];
  raw[7].KVDataList = [{ key: 'd_20261015', value: JSON.stringify({ s: 12, h: 0, st: 'solved' }) }];
  raw.push({ openid: 'zz', nickname: '孙十', avatarUrl: '', KVDataList: [{ key: 'd_20261015', value: JSON.stringify({ s: 3, h: 0, st: 'solved' }) }] });
  const hs = (id) => hashOf(id, salt);
  const rows = [
    [hs('a'), 1, 14, 0, 1, 3000, 5],
    [hs('me'), 1, 21, 1, 1, 3600],
    [hs('c'), 2, 9, 0, 6, 4200],
    [hs('d'), 3, 41, 3, 41, 5000],
    [hs('e'), 1, 26, 2, 1, 3700],
    [hs('f'), 2, 4, 0, 1280, 4300],
    [hs('g'), 3, 66, 4, 8, 6000],
  ];
  const model = buildModel({ kind: vmLike.kind, dateKey: '20261015', salt, selfHash: hs('me'), mode: 'full', rows, showUnverified: true }, raw);
  drawBoard(ctx, model, { width: r.w, height: r.h, scroll: 0, images: {}, display });
  return c;
}

function buildFixtures(env) {
  const L = env.L;
  const cc = env.createCanvas;
  const lad = ladder12();
  const t21 = temps(21);
  const b21 = bandsOf(t21);
  const display = env.display || null;

  // ------------------------------------------------------------- home
  const homeBase = {
    daily: { state: 'available', issueNo: 128, dateKey: '20261015', puzzleId: 'd20261015' },
    streak: { current: 0, best: 0, show: false },
    hasGroupContext: false,
    muted: false,
    showHowToOnce: false,
    settings: { largeText: false, highContrast: false, friendBoardEnabled: true },
    sheet: null,
    t: 900,
  };
  const home = (daily, o) => ({ vm: Object.assign({}, homeBase, { daily: Object.assign({}, homeBase.daily, daily) }, o || {}) });
  const homeFx = {
    loading: home({ state: 'loading' }),
    available: home({}),
    available_group_streak: home({}, { hasGroupContext: true, streak: { current: 5, best: 12, show: true } }),
    inProgress: home({ state: 'inProgress', steps: 12, best: 37, bestLabel: '最近第 37 名' }),
    solved: home({ state: 'solved', steps: 21 }, { streak: { current: 5, best: 12, show: true } }),
    gaveup: home({ state: 'gaveup' }),
    unavailable: home({ state: 'unavailable' }),
    offline: home({ state: 'offline' }),
    error: home({ state: 'error' }, { muted: true }),
    sheet_howto: home({}, { sheet: 'howto' }),
    sheet_settings: home({}, { sheet: 'settings', settings: { largeText: false, highContrast: false, friendBoardEnabled: false } }),
    sheet_settings_on: home({}, { sheet: 'settings', muted: true, settings: { largeText: true, highContrast: false, friendBoardEnabled: true } }),
  };

  // ------------------------------------------------------------- play
  const kbSuggest = ['番茄', '番茄酱', '番薯'];
  const playFx = {
    starting: { vm: playBase({ state: 'starting', steps: 0, latest: null, ladder: [], chips: [], hintsUsed: 0 }) },
    ready: { vm: playBase({ state: 'ready', steps: 0, latest: null, ladder: [], chips: [], warmups: WARMUPS, hintsUsed: 0, hint: { next: 1, state: 'locked', label: '第 10 步后可用提示' } }) },
    ready_coach1: { vm: playBase({ state: 'ready', steps: 0, latest: null, ladder: [], chips: [], warmups: WARMUPS, hintsUsed: 0, coach: 1, hint: { next: 1, state: 'locked', label: '第 10 步后可用提示' } }) },
    result: { vm: playBase({}) },
    result_coach2: { vm: playBase({ coach: 2 }) },
    result_coach3: { vm: playBase({ coach: 3 }) },
    result_long_chips: { vm: playBase({ chips: ['麻辣烫', '涮羊肉', '烧烤摊', '串串香', '火锅底料'] }) },
    result_selected: { vm: playBase({ selectedWord: '蔬菜', chips: ['青菜', '白菜', '菠菜', '芹菜', '蔬果'] }) },
    result_scrolled: { vm: playBase({ ladder: manyRows(30).concat(ladder12()).sort((a, b) => a.rank - b.rank), ladderScroll: 200 }) },
    result_enter: { vm: playBase({ enterWord: '火锅', enterT: 0.5 }) },
    hot_latest: { vm: playBase({ latest: row('番薯', 3, { isLatest: true }), ladder: [row('番薯', 3, { isLatest: true })].concat(lad.slice(0, 6)), chips: ['红薯', '山药', '芋头', '土豆', '玉米'] }) },
    synonym: { vm: playBase({ latest: row('西红柿', 2, { isLatest: true, isSynonym: true }), chips: ['番茄', '圣女果', '蔬菜', '水果', '红色'] }) },
    waiting: { vm: playBase({ state: 'waiting', pendingWord: '蔬菜' }) },
    duplicate: { vm: playBase({ flashWord: '火锅', flashT: 0.3, toast: '已经猜过「火锅」了 · 第 152 名' }), overlay: { toast: { text: '已经猜过「火锅」了 · 第 152 名' } } },
    not_in_vocab: { vm: playBase({}), overlay: { toast: { text: '词库里没有「火星人」，换个常用词试试' } } },
    rate_limited: { vm: playBase({}), overlay: { toast: { text: '猜得太快了，歇一下' } } },
    hint_available: { vm: playBase({ steps: 20, hint: { next: 2, state: 'available', label: '提示 2 可用' } }) },
    hint_atBest: { vm: playBase({ steps: 22, latest: row('番薯', 2, { isLatest: true }), ladder: [row('番薯', 2, { isLatest: true })].concat(lad.slice(0, 5)), hint: { next: 2, state: 'atBest', label: '已经只差一步了' } }) },
    hint_exhausted_first: { vm: playBase({ steps: 45, hintsUsed: 4, firstChar: '番', hint: { next: null, state: 'exhausted', label: '提示已用完' } }) },
    unranked_ad: { vm: playBase({ kind: 'practice', ranked: false, title: '练习 #12', adHint: { visible: true, left: 3 } }) },
    unranked_ad_zero: { vm: playBase({ kind: 'archive', ranked: false, title: '往期 第97期', adHint: { visible: true, left: 0 }, hint: { next: 2, state: 'available', label: '提示 2 可用' }, steps: 20 }) },
    offline: { vm: playBase({ state: 'offline', pendingWord: '蔬菜' }) },
    error: { vm: playBase({ state: 'error', errorText: '出错了，请重试' }) },
    window_closed: { vm: playBase({ banner: '今日一词已结束，本局不计入榜单' }) },
    solvedAnim: { vm: playBase({ state: 'solvedAnim', solvedT: 0.6, latest: row('番茄', 1, { isLatest: true }), chips: [], ladder: [row('番茄', 1, { isLatest: true })].concat(lad.slice(0, 5)) }) },
    menu_open: { vm: playBase({ menuOpen: true }) },
    giveup_dialog: { vm: playBase({}), overlay: { dialog: { title: '放弃这一题？', text: '放弃后会显示答案。今日一词将记为未猜中，连续猜中天数会中断。', confirmLabel: '放弃并看答案', cancelLabel: '再想想', danger: true } } },
    giveup_dialog_unranked: { vm: playBase({ kind: 'practice', ranked: false, title: '练习 #12' }), overlay: { dialog: { title: '放弃这一题？', text: '放弃后会显示答案。', confirmLabel: '放弃并看答案', cancelLabel: '再想想', danger: true } } },
    sheet_howto: { vm: playBase({ sheet: 'howto' }) },
    keyboard_open: { vm: playBase({ keyboard: { open: true, text: '番', suggestions: kbSuggest, heightPx: 291 }, latest: row('蔬菜', 37, { isLatest: true }) }) },
    keyboard_open_noheight: { vm: playBase({ keyboard: { open: true, text: '番', suggestions: ['番茄', '番茄酱', '番薯', '番茄汤', '番外', '番石榴'], heightPx: null }, latest: row('蔬菜', 37, { isLatest: true }) }) },
    keyboard_open_empty: { vm: playBase({ keyboard: { open: true, text: '', suggestions: [], heightPx: 291 }, latest: row('蔬菜', 37, { isLatest: true }) }) },
    keyboard_open_nomatch: { vm: playBase({ keyboard: { open: true, text: '火星人', suggestions: [], heightPx: null }, latest: row('蔬菜', 37, { isLatest: true }) }) },
    keyboard_waiting: { vm: playBase({ state: 'waiting', pendingWord: '番茄', keyboard: { open: true, text: '', suggestions: kbSuggest, heightPx: 291 } }) },
  };

  // ------------------------------------------------------------ reveal
  const items100 = [
    { rank: 2, word: '西红柿', mine: true, synonym: true },
    { rank: 3, word: '土豆', mine: true, synonym: false },
    { rank: 4, word: '黄瓜', mine: false, synonym: false },
    { rank: 5, word: '茄子', mine: false, synonym: false },
    { rank: 6, word: '辣椒', mine: true, synonym: false },
    { rank: 7, word: '青椒', mine: false, synonym: false },
    { rank: 8, word: '蔬菜', mine: true, synonym: false },
    { rank: 9, word: '圣女果', mine: false, synonym: false },
    { rank: 10, word: '番茄酱', mine: false, synonym: false },
    { rank: 11, word: '白菜', mine: false, synonym: false },
    { rank: 12, word: '洋葱', mine: false, synonym: false },
    { rank: 13, word: '萝卜', mine: false, synonym: false },
  ];
  for (let i = 14; i <= 100; i++) items100.push({ rank: i, word: '菜名' + i, mine: false, synonym: false });
  const revealBase = {
    puzzleId: 'd20261015',
    kind: 'daily',
    ranked: true,
    title: '今日一词 · 第 128 期',
    answer: '番茄',
    outcome: 'solved',
    summary: '21 步猜中 · 用了 1 次提示',
    temps: t21,
    bands: b21,
    stats: { show: true, line1: '今日 2,315 人猜中 · 中位数 21 步', line2: '你比 64% 的人少用了步数' },
    streak: { show: true, label: '连续猜中 5 天' },
    top: { state: 'ready', items: items100 },
    compare: null,
    canShare: true,
    nextLabel: '再来一题',
    t: 900,
  };
  const rv = (o) => ({ vm: Object.assign({}, revealBase, o || {}) });
  const theirT = temps(18);
  const revealFx = {
    solved: rv(),
    solved_loading: rv({ top: { state: 'loading', items: [] } }),
    list_error: rv({ top: { state: 'error', items: [] } }),
    no_stats: rv({ stats: { show: false }, streak: { show: false } }),
    gaveup: rv({ outcome: 'gaveup', summary: '未猜中 · 最近第 3 名', stats: { show: false }, streak: { show: false }, temps: temps(30), bands: bandsOf(temps(30)) }),
    unranked: rv({ kind: 'archive', ranked: false, title: '往期 · 第 97 期', answer: '番薯', stats: { show: true, line1: '共 1,204 人猜中 · 中位数 19 步' }, streak: { show: false } }),
    practice: rv({ kind: 'practice', ranked: false, title: '练习 #12', answer: '洗衣机', stats: { show: false }, streak: { show: false } }),
    compare: rv({ compare: { mySteps: 21, theirSteps: 18, theirStatus: 'solved', theirTemps: theirT, theirWords: ['蔬菜', '火锅', '西红柿', '番茄'] } }),
    compare_words: rv({ showTheirs: true, compare: { mySteps: 21, theirSteps: 18, theirStatus: 'solved', theirTemps: theirT, theirWords: ['蔬菜', '火锅', '厨房', '土豆', '黄瓜', '西红柿', '番茄'] } }),
    scrolled: rv({ scrollY: 520 }),
    long_answer: rv({ answer: '电冰箱专卖店' }),
  };

  // --------------------------------------------------------- challenge
  const chBase = {
    state: 'ready',
    puzzleId: 'd20261015',
    kind: 'daily',
    issueLabel: '第 128 期',
    owner: { status: 'solved', steps: 21, hints: 1, temps: t21, bands: b21 },
    countsAsToday: true,
    alreadyFinished: false,
    t: 900,
  };
  const ch = (o) => ({ vm: Object.assign({}, chBase, o || {}) });
  const challengeFx = {
    loading: ch({ state: 'loading' }),
    ready_today: ch(),
    ready_past: ch({ kind: 'archive', issueLabel: '第 97 期', countsAsToday: false }),
    ready_gaveup: ch({ owner: { status: 'gaveup', steps: 40, hints: 2, temps: temps(40), bands: bandsOf(temps(40)) } }),
    own: ch({ state: 'own', own: { finishers: 3, bestSteps: 17 } }),
    own_none: ch({ state: 'own', own: { finishers: 0, bestSteps: null } }),
    already_finished: ch({ alreadyFinished: true }),
    notFound: ch({ state: 'notFound' }),
    offline: ch({ state: 'offline' }),
  };

  // ------------------------------------------------------------- board
  const bd = (o) => {
    const vm = Object.assign({ kind: 'group', state: 'ready', title: '本群 · 今日一词 第128期', footer: '已有 7 人参与 · 成绩经服务器校验', mode: 'full', myLine: '你今日 21 步猜中', bannerVisible: false, viewerPlayed: true, canShare: true, t: 900 }, o || {});
    if (vm.state === 'ready') vm.sharedCanvas = sharedBoardCanvas(cc, L, vm, env.display);
    return { vm };
  };
  const boardFx = {
    noGroup: bd({ state: 'noGroup' }),
    checkingGroup: bd({ state: 'checkingGroup' }),
    loading: bd({ state: 'loading' }),
    ready: bd({}),
    ready_banner: bd({ bannerVisible: true, previewFrame: true }),
    ready_notplayed: bd({ viewerPlayed: false }),
    empty: bd({ state: 'empty' }),
    empty_notplayed: bd({ state: 'empty', viewerPlayed: false }),
    error: bd({ state: 'error' }),
    error_group: bd({ state: 'error', errorKind: 'group' }),
    privacyDenied: bd({ state: 'privacyDenied' }),
    scopeDenied: bd({ state: 'scopeDenied' }),
    friend_ready: bd({ kind: 'friend', title: '好友 · 今日一词 第128期', footer: '今日参与人数较多，好友成绩暂未校验', mode: 'selfOnly' }),
    friend_empty: bd({ kind: 'friend', state: 'empty', title: '好友 · 今日一词 第128期' }),
  };

  // ----------------------------------------------------------- archive
  const arItems = [
    { puzzleId: 'd20261015', issueNo: 128, dateLabel: '10月15日', status: 'today', answer: '番茄', line: '今日 · 21步猜中' },
    { puzzleId: 'd20261014', issueNo: 127, dateLabel: '10月14日', status: 'solved', answer: '番薯', line: '番薯 · 18步' },
    { puzzleId: 'd20261013', issueNo: 126, dateLabel: '10月13日', status: 'unplayed', line: '未玩 · 去猜' },
    { puzzleId: 'd20261012', issueNo: 125, dateLabel: '10月12日', status: 'playing', line: '进行中 · 9步' },
    { puzzleId: 'd20261011', issueNo: 124, dateLabel: '10月11日', status: 'gaveup', answer: '洗衣机', line: '洗衣机 · 未猜中' },
    { puzzleId: 'd20261010', issueNo: 123, dateLabel: '10月10日', status: 'solved', answer: '电冰箱', line: '电冰箱 · 31步' },
    { puzzleId: 'd20261009', issueNo: 122, dateLabel: '10月9日', status: 'unplayed', line: '未玩 · 去猜' },
    { puzzleId: 'd20261008', issueNo: 121, dateLabel: '10月8日', status: 'solved', answer: '足球', line: '足球 · 12步' },
  ];
  const ar = (o) => ({ vm: Object.assign({ state: 'ready', bestStreak: 12, items: arItems, hasMore: false, practice: { done: 3, total: 300 }, t: 900 }, o || {}) });
  const archiveFx = {
    loading: ar({ state: 'loading', items: [] }),
    ready: ar(),
    ready_more: ar({ hasMore: true, scrollY: 140 }),
    empty: ar({ state: 'empty', items: [], bestStreak: 0 }),
    error: ar({ state: 'error', items: [] }),
  };

  // ------------------------------------------------------- share cards
  const t80 = temps(80);
  const cards = {
    solved: { vm: { title: '语义热冷 · 今日一词 第128期', headline: '21 步猜中', subline: '用了 1 次提示', temps: t21, bands: b21, footer: '同一个词，你几步能猜中？' } },
    solved_fast: { vm: { title: '语义热冷 · 今日一词 第128期', headline: '9 步猜中', subline: '没有用提示', temps: temps(9), bands: bandsOf(temps(9)), footer: '同一个词，你几步能猜中？' } },
    gaveup: { vm: { title: '语义热冷 · 今日一词 第128期', headline: '未猜中 · 最近第 3 名', subline: '用了 2 次提示', temps: temps(34), bands: bandsOf(temps(34)), footer: '同一个词，你几步能猜中？' } },
    many_steps: { vm: { title: '语义热冷 · 今日一词 第128期', headline: '80 步猜中', subline: '用了 4 次提示', temps: t80, bands: bandsOf(t80), footer: '同一个词，你几步能猜中？' } },
    unranked: { vm: { title: '语义热冷 · 往期 第97期', headline: '18 步猜中', subline: '没有用提示', temps: temps(18), bands: bandsOf(temps(18)), footer: '同一个词，你几步能猜中？' } },
    practice: { vm: { title: '语义热冷 · 练习 #12', headline: '27 步猜中', subline: '用了 3 次提示', temps: temps(27), bands: bandsOf(temps(27)), footer: '同一个词，你几步能猜中？' } },
  };

  const fx = { home: homeFx, play: playFx, reveal: revealFx, challenge: challengeFx, board: boardFx, archive: archiveFx, shareCard: cards };
  void lad;
  void display;
  return fx;
}

module.exports = { buildFixtures, row, WARMUPS };
