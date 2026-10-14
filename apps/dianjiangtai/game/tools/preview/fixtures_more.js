/** Fixtures for result, challenge, board, shareCard. */

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

function resultVm(over) {
  return {
    mode: 'daily',
    status: 'done',
    record: { w: 10, l: 2 },
    band: { key: 'bayezhi', label: '霸业将成' },
    comment: '猛将如云，可惜城头少一员稳将。',
    rarityText: '今日仅 6.2% 的主公达到此战绩',
    battles: battles(WIN10),
    lineup: [
      { slot: 'zhugong', name: '刘备', score: 8.2, fit: 'good' },
      { slot: 'junshi', name: '诸葛亮', score: 9.4, fit: 'good' },
      { slot: 'xianfeng', name: '马超', score: 7.9, fit: 'ok' },
      { slot: 'mengjiang', name: '关羽', score: 9.0, fit: 'good' },
      { slot: 'shoujiang', name: '张飞', score: 5.2, fit: 'bad' },
    ],
    morale: { total: 1.12, lord: 0.24, bonds: ['桃园 +0.04'], cohesion: 0.05 },
    replay: { unlocked: false, adState: 'idle' },
    interstitialDue: false,
    scrollY: 0,
    ...over,
  };
}

function add(fx, env, h) {
  void h;
  const L = env.L;
  fx.result = {
    waitingServer: resultVm({ status: 'waitingServer', battles: [], t: 700 }),
    pendingSubmit: resultVm({ status: 'pendingSubmit', battles: [] }),
    error: resultVm({ status: 'error', battles: [] }),
    revealing_early: resultVm({ status: 'revealing', revealCount: 2.5 }),
    revealing_mid: resultVm({ status: 'revealing', revealCount: 9.4 }),
    revealing_full: resultVm({ status: 'revealing', revealCount: 12 }),
    done: resultVm({}),
    done_scrolled: resultVm({ scrollY: 9999 }),
    done_free: resultVm({ mode: 'free', rarityText: '约 14% 的阵容能达到' }),
    done_12_0: resultVm({ record: { w: 12, l: 0 }, band: { key: 'yitong', label: '一统天下' }, comment: '十二战全胜，天下归心。', battles: battles(WIN12), rarityText: '今日仅 0.8% 的主公一统天下', stampT: 1 }),
    done_12_0_stamping: resultVm({ record: { w: 12, l: 0 }, band: { key: 'yitong', label: '一统天下' }, comment: '十二战全胜，天下归心。', battles: battles(WIN12), rarityText: null, stampT: 0.4 }),
    done_zero_rarity: resultVm({ rarityText: null, record: { w: 1, l: 11 }, band: { key: 'x', label: '一败涂地' }, comment: '胜败乃兵家常事，大侠请重新来过。', battles: battles(new Array(12).fill(false).map((_, i) => i === 3)) }),
    privacy_note: resultVm({ privacyNote: true }),
    challenge: resultVm({ mode: 'challenge', challenge: { theirRecord: { w: 11, l: 1 }, theirLineup: [{ slot: 'zhugong', name: '曹操' }, { slot: 'junshi', name: '郭嘉' }, { slot: 'xianfeng', name: '张郃' }, { slot: 'mengjiang', name: '许褚' }, { slot: 'shoujiang', name: '张辽' }] } }),
    challenge_hidden: resultVm({ mode: 'challenge', challenge: { theirRecord: { w: 7, l: 5 }, theirLineup: null } }),
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

  const ch = (status, over) => ({ status, theirRecord: { w: 10, l: 2 }, mode: 'daily', countsAsDaily: false, isFriendly: false, ...over });
  fx.challenge = {
    loading: ch('loading', {}),
    ready_daily: ch('ready', { countsAsDaily: true }),
    ready_free: ch('ready', { mode: 'free' }),
    ready_friendly: ch('ready', { isFriendly: true }),
    expired: ch('expired', {}),
    own: ch('own', { answerCount: 3, bestRecord: { w: 11, l: 1 } }),
    answered: ch('answered', {}),
    offline: ch('offline', {}),
    error: ch('error', {}),
  };

  // ---- board: the open data canvas is rendered by opendata/ with fake rows
  const { buildModel } = require('../../opendata/board');
  const { drawBoard } = require('../../opendata/draw');
  const { hashOf } = require('../../opendata/board');
  const salt = 'a1b2c3d4e5f60718';
  const mk = (id, name, w, s, x) => ({ id, name, w, s, x });
  const players = [
    mk('o1', '张三', 12, 100, '0,3,2,5,1'),
    mk('o2', '李四', 11, 90, '1,2,3,4,5'),
    mk('me', '我', 10, 300, '2,3,4,5,6'),
    mk('o4', '赵六', 10, 500, '6,2,1,0,3'),
    mk('o5', '钱七', 9, 120, '3,3,3,3,3'),
    mk('o6', '孙八', 8, 40, '1,1,2,2,0'),
    mk('o7', '周九', 6, 700, '4,5,6,7,8'),
    mk('o8', '吴十', 3, 50, '4,5,6,7,8'),
  ];
  const roster = Array.from({ length: 10 }, (_, i) => ['备羽飞亮云超忠维操郃'[i], ['shu', 'wei', 'wu', 'qun'][i % 4]]);
  const rawRows = players.filter((p) => p.id !== 'me').map((p) => ({ openid: p.id, nickname: p.name, avatarUrl: '', KVDataList: [{ key: 'd_20261014', value: JSON.stringify({ w: p.w, l: 12 - p.w }) }] }));
  // a tamperer: no server row, KV claims 12-0
  rawRows.push({ openid: 'cheat', nickname: '王五', avatarUrl: '', KVDataList: [{ key: 'd_20261014', value: JSON.stringify({ w: 12, l: 0 }) }] });
  const serverRows = players.map((p) => [hashOf(p.id, salt), p.w, p.s, p.x]);
  const base = { type: 'render', dateKey: '20261014', issueNo: 12, contentVersion: 1, salt, selfHash: hashOf('me', salt), showUnverified: true, rows: serverRows };

  function sharedFor(kind, mode, viewerPlayed, rows, more) {
    const r = L.board;
    const c = env.createCanvas(Math.round(r.w * 2), Math.round(r.h * 2));
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    const msg = { ...base, kind, mode, viewerPlayed, rows: rows || serverRows, ...more };
    const model = buildModel(msg, rawRows);
    drawBoard(ctx, model, { width: r.w, height: r.h, scroll: (more && more.scroll) || 0, roster, images: {}, message: null });
    return c;
  }

  const bv = (kind, state, over) => ({ kind, dateKey: '20261014', issueNo: 12, state, mode: 'full', viewerPlayed: true, self: { record: { w: 10, l: 2 }, bandLabel: '霸业将成' }, actions: { canOpenSetting: false, canRetryPrivacy: false, canShareToGroup: true }, ...over });
  fx.board = {
    group_noGroup: bv('group', 'noGroup', { mode: null }),
    group_checking: bv('group', 'checkingGroup', { mode: null, t: 300 }),
    group_loading: bv('group', 'loading', { t: 300 }),
    group_ready: bv('group', 'ready', { mode: 'group', sharedCanvas: sharedFor('group', 'group', true) }),
    group_ready_scrolled: bv('group', 'ready', { mode: 'group', sharedCanvas: sharedFor('group', 'group', true, null, { scroll: 500 }) }),
    group_ready_notplayed: bv('group', 'ready', { viewerPlayed: false, self: { record: null, bandLabel: null }, sharedCanvas: sharedFor('group', 'group', false) }),
    group_empty: bv('group', 'empty', { viewerPlayed: false, self: { record: null, bandLabel: null } }),
    group_empty_played: bv('group', 'empty', {}),
    group_serverError: bv('group', 'serverError', { mode: null }),
    group_privacyDenied: bv('group', 'privacyDenied', { actions: { canOpenSetting: false, canRetryPrivacy: true, canShareToGroup: false } }),
    group_unauthorized: bv('group', 'unauthorized', { actions: { canOpenSetting: true, canRetryPrivacy: false, canShareToGroup: false } }),
    friend_ready: bv('friend', 'ready', { sharedCanvas: sharedFor('friend', 'full', true) }),
    friend_selfOnly: bv('friend', 'ready', { mode: 'selfOnly', sharedCanvas: sharedFor('friend', 'selfOnly', true, [[hashOf('me', salt), 10, 300, '2,3,4,5,6']]) }),
    friend_empty: bv('friend', 'empty', {}),
    friend_privacyDenied: bv('friend', 'privacyDenied', { actions: { canOpenSetting: false, canRetryPrivacy: true, canShareToGroup: false } }),
    friend_unauthorized: bv('friend', 'unauthorized', { actions: { canOpenSetting: true, canRetryPrivacy: false, canShareToGroup: false } }),
  };

  // ---- share card (rendered once at 500x400)
  const shu = { faction: 'shu', factionLabel: '蜀' };
  const lineup = (names) => names.map((n, i) => ({ slotLabel: ['主公', '军师', '先锋', '猛将', '守将'][i], name: n[0], monogram: n[0][0], faction: n[1], factionLabel: { wei: '魏', shu: '蜀', wu: '吴', qun: '群' }[n[1]], sub: { wei: '魏', shu: '蜀', wu: '吴', qun: '群' }[n[1]] + ' · 赤壁' }));
  const five = lineup([['刘备', 'shu'], ['诸葛亮', 'shu'], ['赵云', 'shu'], ['吕布', 'qun'], ['曹仁', 'wei']]);
  void shu;
  fx.shareCard = {
    free_10_2: { vm: { mode: 'free', record: { w: 11, l: 1 }, bandLabel: '霸业将成', lineup: five, battles: [true, true, true, true, true, true, true, true, false, true, true, true] } },
    daily_10_2: { vm: { mode: 'daily', issueNo: 12, record: { w: 10, l: 2 }, bandLabel: '霸业将成', lineup: five, battles: WIN10 } },
    daily_12_0: { vm: { mode: 'daily', issueNo: 12, record: { w: 12, l: 0 }, bandLabel: '一统天下', lineup: five, battles: WIN12 } },
    free_low: { vm: { mode: 'free', record: { w: 3, l: 9 }, bandLabel: '兵微将寡', lineup: lineup([['诸葛亮', 'shu'], ['司马懿', 'wei'], ['孙策', 'wu'], ['孟获', 'qun'], ['董卓', 'qun']]), battles: [false, false, true, false, false, false, true, false, false, true, false, false] } },
  };
}

module.exports = { add };
