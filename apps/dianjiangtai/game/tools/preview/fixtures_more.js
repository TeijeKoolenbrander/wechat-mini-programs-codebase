/** Fixtures for result, challenge, board, history, shareCard. */

const TYPES = ['野战', '水战', '攻城', '守城', '奇袭', '安民'];
const CAUSES = ['猛将冲阵，一鼓而下', '周瑜运筹，火攻得手', '先锋破阵，攻城得手', '守将调度失当，城门失守', '军师出奇，截断粮道', '主公仁厚，民心归附'];

function battles(winMask) {
  return winMask.map((win, i) => ({
    i: i + 1,
    typeLabel: TYPES[i % 6],
    win,
    chanceText: ['胜算八成', '胜算六成', '胜算七成', '胜算四成', '胜算九成'][i % 5],
    luckText: ['天时吉', '天时平', '天时凶'][i % 3],
    cause: CAUSES[i % 6],
    event: i === 8 ? '临阵生变' : null,
  }));
}

const WIN10 = [true, true, true, true, true, true, true, true, false, true, true, false];
const WIN12 = new Array(12).fill(true);

const ST = (a) => ({ zhi: a[0], xin: a[1], ren: a[2], yong: a[3], yan: a[4] });
const LINEUP_FULL = [
  { slot: 'zhugong', name: '刘备', score: 8.2, fit: 'good', tier: 'jia', stats: ST([7, 8, 10, 6, 7]), factionKey: 'shu' },
  { slot: 'junshi', name: '诸葛亮', score: 9.4, fit: 'good', tier: 'jia', stats: ST([10, 9, 8, 3, 9]), factionKey: 'shu' },
  { slot: 'xianfeng', name: '马超', score: 7.9, fit: 'ok', tier: 'yi', stats: ST([5, 4, 5, 10, 6]), factionKey: 'qun' },
  { slot: 'mengjiang', name: '关羽', score: 9.0, fit: 'good', tier: 'jia', stats: ST([6, 10, 6, 10, 7]), factionKey: 'shu' },
  { slot: 'shoujiang', name: '张飞', score: 5.2, fit: 'bad', tier: 'bing', stats: ST([4, 9, 4, 10, 6]), factionKey: 'shu' },
];
const LINEUP_PLAIN = LINEUP_FULL.map((e) => ({ slot: e.slot, name: e.name, score: e.score, fit: e.fit, factionKey: e.factionKey, tier: e.tier }));

function resultVm(over) {
  return {
    mode: 'daily',
    status: 'done',
    record: { w: 10, l: 2 },
    band: { key: 'bayezhi', label: '霸业将成' },
    comment: '猛将如云，可惜城头少一员稳将。',
    rarityText: '今日仅 6.2% 的主公达到此战绩',
    battles: battles(WIN10),
    lineup: LINEUP_PLAIN,
    morale: { total: 1.12, lord: 0.24, bonds: ['桃园 +0.04'], cohesion: 0.05 },
    replay: { unlocked: false, adState: 'idle' },
    interstitialDue: false,
    scrollY: 0,
    variantLabel: null,
    reveal: null,
    streak: null,
    saveImage: { state: 'idle' },
    subscribe: { state: 'hidden', challengeId: null },
    ...over,
  };
}

function add(fx, env, h) {
  const L = env.L;
  const display = env.display || null;
  const S5 = { current: 5, text: '连续出征 5 天' };
  const SH = { variantLabel: '识人' };
  const rev = (step, pending) => ({ pending, step });
  fx.result = {
    waitingServer: resultVm({ status: 'waitingServer', battles: [], t: 700 }),
    pendingSubmit: resultVm({ status: 'pendingSubmit', battles: [] }),
    error: resultVm({ status: 'error', battles: [] }),
    revealing_early: resultVm({ status: 'revealing', revealCount: 2.5 }),
    revealing_mid: resultVm({ status: 'revealing', revealCount: 9.4 }),
    revealing_full: resultVm({ status: 'revealing', revealCount: 12 }),
    revealing_shiren: resultVm({ status: 'revealing', revealCount: 6.3, ...SH }),
    done: resultVm({}),
    done_streak: resultVm({ streak: S5 }),
    done_scrolled: resultVm({ scrollY: 9999 }),
    done_free: resultVm({ mode: 'free', rarityText: '约 14% 的阵容能达到' }),
    done_12_0: resultVm({ record: { w: 12, l: 0 }, band: { key: 'yitong', label: '一统天下' }, comment: '十二战全胜，天下归心。', battles: battles(WIN12), rarityText: '今日仅 0.8% 的主公一统天下', stampT: 1, streak: S5 }),
    done_12_0_stamping: resultVm({ record: { w: 12, l: 0 }, band: { key: 'yitong', label: '一统天下' }, comment: '十二战全胜，天下归心。', battles: battles(WIN12), rarityText: null, stampT: 0.4 }),
    done_zero_rarity: resultVm({ rarityText: null, record: { w: 1, l: 11 }, band: { key: 'x', label: '一败涂地' }, comment: '胜败乃兵家常事，大侠请重新来过。', battles: battles(new Array(12).fill(false).map((_, i) => i === 3)) }),
    privacy_note: resultVm({ privacyNote: true }),
    shiren_reveal0: resultVm({ ...SH, lineup: LINEUP_FULL, reveal: rev(0, true), streak: S5 }),
    shiren_reveal2: resultVm({ ...SH, lineup: LINEUP_FULL, reveal: rev(2, true), streak: S5 }),
    shiren_reveal_done: resultVm({ ...SH, lineup: LINEUP_FULL, reveal: rev(5, false), streak: S5 }),
    shiren_reveal_scrolled: resultVm({ ...SH, lineup: LINEUP_FULL, reveal: rev(3, true), scrollY: 9999 }),
    save_rendering: resultVm({ saveImage: { state: 'rendering' } }),
    save_saving: resultVm({ saveImage: { state: 'saving' } }),
    save_saved: { vm: resultVm({ saveImage: { state: 'saved' } }), overlay: { toast: { text: '已保存到相册' } } },
    save_denied: { vm: resultVm({ saveImage: { state: 'denied' } }), overlay: { albumDenied: true } },
    save_error: resultVm({ saveImage: { state: 'error' }, scrollY: 9999 }),
    subscribe_offer: resultVm({ mode: 'challenge', subscribe: { state: 'offer', challengeId: 'c1' }, scrollY: 9999 }),
    subscribe_requesting: resultVm({ subscribe: { state: 'requesting', challengeId: 'c1' }, scrollY: 9999 }),
    subscribe_granted: resultVm({ subscribe: { state: 'granted', challengeId: 'c1' }, scrollY: 9999 }),
    challenge: resultVm({ mode: 'challenge', challenge: { theirRecord: { w: 11, l: 1 }, theirLineup: [{ slot: 'zhugong', name: '曹操' }, { slot: 'junshi', name: '郭嘉' }, { slot: 'xianfeng', name: '张郃' }, { slot: 'mengjiang', name: '许褚' }, { slot: 'shoujiang', name: '张辽' }] } }),
    challenge_hidden: resultVm({ mode: 'challenge', challenge: { theirRecord: { w: 7, l: 5 }, theirLineup: null } }),
    challenge_locked: resultVm({ mode: 'challenge', challenge: { theirRecord: { w: 7, l: 5 }, theirLineup: null, lineupLocked: true } }),
    replay_locked: resultVm({ replay: { unlocked: false, adState: 'idle', locked: true, lockedText: '今日军令完成后可复盘' } }),
    replay_loading: resultVm({ replay: { unlocked: false, adState: 'loading' } }),
    replay_unlocked: resultVm({ replay: { unlocked: true, adState: 'idle', best: { lineup: [], record: { w: 12, l: 0 } } } }),
    breakdown: resultVm({ sheet: 'breakdown' }),
    breakdown_scrolled: resultVm({ sheet: 'breakdown', sheetScroll: 9999 }),
    replay_sheet: resultVm({
      sheet: 'replay',
      replay: {
        unlocked: true,
        adState: 'idle',
        best: {
          lineup: [
            { slot: 'zhugong', name: '刘备', score: 8.2 },
            { slot: 'junshi', name: '诸葛亮', score: 9.4 },
            { slot: 'xianfeng', name: '赵云', score: 8.5 },
            { slot: 'mengjiang', name: '关羽', score: 9.0 },
            { slot: 'shoujiang', name: '黄忠', score: 7.1 },
          ],
          record: { w: 12, l: 0 },
        },
      },
    }),
    toast_late: { vm: resultVm({}), overlay: { toast: { text: '军令已过期，本局记为友谊赛' } } },
  };

  const ch = (status, over) => ({ status, theirRecord: { w: 10, l: 2 }, mode: 'daily', countsAsDaily: false, isFriendly: false, variantLabel: null, ...over });
  fx.challenge = {
    loading: ch('loading', {}),
    ready_daily: ch('ready', { countsAsDaily: true }),
    ready_shiren: ch('ready', { countsAsDaily: true, variantLabel: '识人' }),
    ready_free: ch('ready', { mode: 'free' }),
    ready_friendly: ch('ready', { isFriendly: true }),
    expired: ch('expired', {}),
    own: ch('own', { answerCount: 3, bestRecord: { w: 11, l: 1 } }),
    own_subscribe: ch('own', { answerCount: 0, subscribe: { state: 'offer' } }),
    own_subscribe_requesting: ch('own', { answerCount: 0, subscribe: { state: 'requesting' } }),
    own_subscribed: ch('own', { answerCount: 3, bestRecord: { w: 11, l: 1 }, subscribe: { state: 'granted' } }),
    answered: ch('answered', {}),
    answered_locked: ch('answered', { lineupLocked: true, variantLabel: '识人' }),
    offline: ch('offline', {}),
    error: ch('error', {}),
  };

  // ---- board: the open data canvas is rendered by opendata/ with fake rows
  const { buildModel } = require('../../opendata/board');
  const { drawBoard } = require('../../opendata/draw');
  const { hashOf } = require('../../opendata/board');
  const { boardRect } = require('../../js/render/layout');
  const salt = 'a1b2c3d4e5f60718';
  const mk = (id, name, w, s, x, k) => ({ id, name, w, s, x, k });
  const players = [
    mk('o1', '张三', 12, 100, '0,3,2,5,1', 5),
    mk('o2', '李四', 11, 90, '1,2,3,4,5', 12),
    mk('me', '我', 10, 300, '2,3,4,5,6', 3),
    mk('o4', '赵六', 10, 500, '6,2,1,0,3', 1),
    mk('o5', '钱七', 9, 120, '3,3,3,3,3', 2),
    mk('o6', '孙八', 8, 40, '1,1,2,2,0', 0),
    mk('o7', '周九', 6, 700, '4,5,6,7,8', 0),
    mk('o8', '吴十', 3, 50, '4,5,6,7,8', 0),
  ];
  const facs = ['shu', 'wei', 'wu', 'qun', 'jin'];
  const roster = Array.from({ length: 10 }, (_, i) => ['备羽飞亮云超忠维操懿'[i], facs[i % 5], i % 3 === 0 ? 'jia' : 'yi']);
  const rawRows = players.filter((p) => p.id !== 'me').map((p) => ({ openid: p.id, nickname: p.name, avatarUrl: '', KVDataList: [{ key: 'd_20261014', value: JSON.stringify({ w: p.w, l: 12 - p.w }) }] }));
  // a tamperer: no server row, KV claims 12-0
  rawRows.push({ openid: 'cheat', nickname: '王五', avatarUrl: '', KVDataList: [{ key: 'd_20261014', value: JSON.stringify({ w: 12, l: 0 }) }] });
  const serverRows = players.map((p) => [hashOf(p.id, salt), p.w, p.s, p.x, p.k]);
  const base = { type: 'render', dateKey: '20261014', issueNo: 12, contentVersion: 2, salt, selfHash: hashOf('me', salt), showUnverified: true, rows: serverRows };

  function sharedFor(kind, mode, viewerPlayed, rows, more, banner) {
    const r = boardRect(L, banner || null);
    const c = env.createCanvas(Math.round(r.w * 2), Math.round(r.h * 2));
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    const msg = { ...base, kind, mode, viewerPlayed, rows: rows || serverRows, ...more };
    const model = buildModel(msg, rawRows);
    drawBoard(ctx, model, { width: r.w, height: r.h, scroll: (more && more.scroll) || 0, roster, images: {}, message: null, display });
    return c;
  }

  const BAN = { show: true, reservedHeight: 56, stub: true };
  const bv = (kind, state, over) => ({ kind, dateKey: '20261014', issueNo: 12, state, mode: 'full', viewerPlayed: true, self: { record: { w: 10, l: 2 }, bandLabel: '霸业将成' }, actions: { canOpenSetting: false, canRetryPrivacy: false, canShareToGroup: true }, variantLabel: null, banner: { show: false, reservedHeight: 0 }, ...over });
  fx.board = {
    group_noGroup: bv('group', 'noGroup', { mode: null }),
    group_checking: bv('group', 'checkingGroup', { mode: null, t: 300 }),
    group_loading: bv('group', 'loading', { t: 300 }),
    group_ready: bv('group', 'ready', { mode: 'group', sharedCanvas: sharedFor('group', 'group', true) }),
    group_ready_shiren: bv('group', 'ready', { mode: 'group', variantLabel: '识人', sharedCanvas: sharedFor('group', 'group', true) }),
    group_ready_banner: bv('group', 'ready', { mode: 'group', banner: BAN, sharedCanvas: sharedFor('group', 'group', true, null, null, BAN) }),
    group_ready_scrolled: bv('group', 'ready', { mode: 'group', sharedCanvas: sharedFor('group', 'group', true, null, { scroll: 500 }) }),
    group_ready_notplayed: bv('group', 'ready', { viewerPlayed: false, self: { record: null, bandLabel: null }, sharedCanvas: sharedFor('group', 'group', false) }),
    group_empty: bv('group', 'empty', { viewerPlayed: false, self: { record: null, bandLabel: null } }),
    group_empty_banner: bv('group', 'empty', { viewerPlayed: true, banner: BAN }),
    group_serverError: bv('group', 'serverError', { mode: null }),
    group_privacyDenied: bv('group', 'privacyDenied', { actions: { canOpenSetting: false, canRetryPrivacy: true, canShareToGroup: false } }),
    group_unauthorized: bv('group', 'unauthorized', { actions: { canOpenSetting: true, canRetryPrivacy: false, canShareToGroup: false } }),
    friend_ready: bv('friend', 'ready', { sharedCanvas: sharedFor('friend', 'full', true) }),
    friend_ready_banner: bv('friend', 'ready', { banner: BAN, sharedCanvas: sharedFor('friend', 'full', true, null, null, BAN) }),
    friend_selfOnly: bv('friend', 'ready', { mode: 'selfOnly', sharedCanvas: sharedFor('friend', 'selfOnly', true, [[hashOf('me', salt), 10, 300, '2,3,4,5,6', 3]]) }),
    friend_empty: bv('friend', 'empty', {}),
    friend_privacyDenied: bv('friend', 'privacyDenied', { actions: { canOpenSetting: false, canRetryPrivacy: true, canShareToGroup: false } }),
    friend_unauthorized: bv('friend', 'unauthorized', { actions: { canOpenSetting: true, canRetryPrivacy: false, canShareToGroup: false } }),
  };

  // ---- history list
  const item = (no, dateKey, dateText, mine, extra) => ({ dateKey, issueNo: no, dateText, variantLabel: null, mine, isToday: false, statusText: null, ...extra });
  const rec = (w, l, band) => ({ record: { w, l }, bandLabel: band });
  const items30 = [
    item(12, '20261015', '10月15日', rec(10, 2, '霸业将成'), { variantLabel: '识人', isToday: true, statusText: '进行中' }),
    item(11, '20261014', '10月14日', rec(9, 3, '雄踞一方')),
    item(10, '20261013', '10月13日', null),
    item(9, '20261012', '10月12日', rec(12, 0, '一统天下')),
    item(8, '20261011', '10月11日', rec(6, 6, '三分鼎立')),
    item(7, '20261010', '10月10日', rec(4, 8, '偏安一方'), { variantLabel: '识人' }),
    item(6, '20261009', '10月9日', null),
    item(5, '20261008', '10月8日', rec(8, 4, '雄踞一方')),
  ];
  fx.history = {
    loading: { state: 'loading', bestStreakText: null, items: [], t: 300 },
    ready: { state: 'ready', bestStreakText: '最长连续出征 12 天', items: items30 },
    ready_scrolled: { state: 'ready', bestStreakText: '最长连续出征 12 天', items: items30, scrollY: 9999 },
    ready_nostreak: { state: 'ready', bestStreakText: null, items: items30.slice(1, 4) },
    empty: { state: 'empty', bestStreakText: null, items: [] },
    error: { state: 'error', bestStreakText: null, items: [] },
    offline: { state: 'offline', bestStreakText: null, items: [] },
  };

  // ---- history issue detail
  const sealOf = (name, key, tier) => ({ text: name, monogram: name.slice(-1), factionKey: key, color: '#000', inkText: key === 'jin', frame: tier, size: 48 });
  const mineLineup = (withStats) => [
    ['zhugong', '主公', '刘备', 'shu', 'jia', [7, 8, 10, 6, 7]],
    ['junshi', '军师', '庞统', 'shu', 'yi', [9, 6, 6, 4, 7]],
    ['xianfeng', '先锋', '魏延', 'shu', 'bing', [6, 5, 4, 9, 5]],
    ['mengjiang', '猛将', '吕布', 'qun', 'jia', [4, 2, 3, 10, 5]],
    ['shoujiang', '守将', '司马懿', 'jin', 'jia', [10, 6, 5, 6, 10]],
  ].map((a) => ({ slot: a[0], label: a[1], name: a[2], seal: sealOf(a[2], a[3], a[4]), tier: a[4], stats: withStats ? ST(a[5]) : null }));
  const bestLineup = [
    ['zhugong', '主公', '曹操', 'wei', 'jia'],
    ['junshi', '军师', '诸葛亮', 'shu', 'jia'],
    ['xianfeng', '先锋', '赵云', 'qun', 'jia'],
    ['mengjiang', '猛将', '关羽', 'shu', 'jia'],
    ['shoujiang', '守将', '夏侯渊', 'wei', 'yi'],
  ].map((a) => ({ slot: a[0], label: a[1], name: a[2], seal: sealOf(a[2], a[3], a[4]) }));
  const detail = (over) => ({
    state: 'ready',
    dateKey: '20261014',
    issueNo: 11,
    variantLabel: null,
    mine: { record: { w: 9, l: 3 }, bandLabel: '雄踞一方', lineup: mineLineup(false) },
    stats: { totalText: '共 2,315 人出征', bands: [{ label: '一统天下', shareText: '0.4%' }, { label: '霸业将成', shareText: '9%' }, { label: '雄踞一方', shareText: '31%' }, { label: '三分鼎立', shareText: '38%' }, { label: '偏安一方', shareText: '16%' }, { label: '兵微将寡', shareText: '5%' }] },
    best: { record: { w: 12, l: 0 }, lineup: bestLineup },
    bestLockedText: null,
    ...over,
  });
  fx.historyIssue = {
    loading: { state: 'loading', dateKey: '20261014', issueNo: 11, t: 300 },
    ready: detail({}),
    ready_scrolled: detail({ scrollY: 9999 }),
    ready_shiren: detail({ variantLabel: '识人', mine: { record: { w: 9, l: 3 }, bandLabel: '雄踞一方', lineup: mineLineup(true) } }),
    ready_today: detail({ dateKey: '20261015', issueNo: 12, variantLabel: '识人', best: null, bestLockedText: '今日军令结束后公布', mine: { record: { w: 10, l: 2 }, bandLabel: '霸业将成', lineup: mineLineup(true) } }),
    ready_notplayed: detail({ mine: null }),
    ready_nostats: detail({ stats: null }),
    error: { state: 'error', dateKey: '20261014', issueNo: 11 },
    offline: { state: 'offline', dateKey: '20261014', issueNo: 11 },
  };

  // ---- share card (rendered once at 500x400)
  const LAB = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', jin: '晋' };
  const lineup = (names) => names.map((n, i) => ({ slotLabel: ['主公', '军师', '先锋', '猛将', '守将'][i], name: n[0], monogram: n[0].slice(-1), faction: n[1], factionLabel: LAB[n[1]], sub: LAB[n[1]] + ' · 赤壁', tier: n[2] || 'yi' }));
  const five = lineup([['刘备', 'shu', 'jia'], ['诸葛亮', 'shu', 'jia'], ['赵云', 'qun', 'jia'], ['吕布', 'qun', 'jia'], ['曹仁', 'wei', 'yi']]);
  const withJin = lineup([['司马懿', 'jin', 'jia'], ['羊祜', 'jin', 'yi'], ['夏侯渊', 'wei', 'yi'], ['周瑜', 'wu', 'jia'], ['张春华', 'jin', 'bing']]);
  fx.shareCard = {
    free_10_2: { vm: { mode: 'free', record: { w: 11, l: 1 }, bandLabel: '霸业将成', lineup: five, battles: [true, true, true, true, true, true, true, true, false, true, true, true] } },
    free_jin: { vm: { mode: 'free', record: { w: 8, l: 4 }, bandLabel: '雄踞一方', lineup: withJin, battles: [true, true, false, true, true, true, true, false, false, true, true, true] } },
    daily_10_2: { vm: { mode: 'daily', issueNo: 12, record: { w: 10, l: 2 }, bandLabel: '霸业将成', lineup: five, battles: WIN10 } },
    daily_shiren: { vm: { mode: 'daily', issueNo: 12, variantLabel: '识人', record: { w: 10, l: 2 }, bandLabel: '霸业将成', lineup: withJin, battles: WIN10 } },
    daily_12_0: { vm: { mode: 'daily', issueNo: 12, record: { w: 12, l: 0 }, bandLabel: '一统天下', lineup: five, battles: WIN12 } },
    free_low: { vm: { mode: 'free', record: { w: 3, l: 9 }, bandLabel: '兵微将寡', lineup: lineup([['诸葛亮', 'shu'], ['司马懿', 'wei'], ['孙策', 'wu'], ['孟获', 'qun'], ['董卓', 'qun', 'bing']]), battles: [false, false, true, false, false, false, true, false, false, true, false, false] } },
  };
  void h;
}

module.exports = { add };
