/**
 * Fixture view models for every screen x state (spec 8, 13). The same data
 * drives the PNG preview and tests/render*.test.js (via tests' own import of
 * this file), so they never drift.
 */

const FAC = { wei: '#B8862B', shu: '#C0392B', wu: '#2E7D7A', qun: '#7A5230' };

// A slice of the Appendix B roster (stats are the spec's).
const G = {
  liubei: { id: 'g_liubei', name: '刘备', monogram: '备', tier: 'jia', stats: { zhi: 7, xin: 8, ren: 10, yong: 6, yan: 7 }, drafted: false },
  guanyu: { id: 'g_guanyu', name: '关羽', monogram: '羽', tier: 'jia', stats: { zhi: 6, xin: 10, ren: 6, yong: 10, yan: 7 }, drafted: false },
  zhangfei: { id: 'g_zhangfei', name: '张飞', monogram: '飞', tier: 'yi', stats: { zhi: 4, xin: 9, ren: 4, yong: 10, yan: 6 }, drafted: false },
  zhuge: { id: 'g_zhugeliang', name: '诸葛亮', monogram: '亮', tier: 'jia', stats: { zhi: 10, xin: 9, ren: 8, yong: 3, yan: 9 }, drafted: false },
  zhaoyun: { id: 'g_zhaoyun', name: '赵云', monogram: '云', tier: 'jia', stats: { zhi: 6, xin: 10, ren: 8, yong: 9, yan: 8 }, drafted: false },
  machao: { id: 'g_machao', name: '马超', monogram: '超', tier: 'yi', stats: { zhi: 5, xin: 4, ren: 5, yong: 10, yan: 6 }, drafted: false },
  huangzhong: { id: 'g_huangzhong', name: '黄忠', monogram: '忠', tier: 'yi', stats: { zhi: 5, xin: 8, ren: 6, yong: 9, yan: 7 }, drafted: false },
};

function pool(drafted) {
  return Object.values(G).map((g) => ({ ...g, portraitUrl: null, drafted: drafted.includes(g.id) }));
}

const TOKENS = { faction: { key: 'shu', label: '蜀', color: FAC.shu }, era: { key: 'chibi', label: '赤壁' } };

const SLOTS = [
  ['zhugong', '主公'],
  ['junshi', '军师'],
  ['xianfeng', '先锋'],
  ['mengjiang', '猛将'],
  ['shoujiang', '守将'],
];

function lineup(filled) {
  return SLOTS.map(([slot, label]) => {
    const f = filled[slot];
    return { slot, label, generalId: f ? f[0] : null, name: f ? f[1] : null, score: f ? f[2] : null, fit: f ? f[3] : null };
  });
}

function draftVm(over) {
  return {
    mode: 'daily',
    round: 3,
    phase: 'flipped',
    tokens: TOKENS,
    respin: { faction: { free: 1, enabled: true }, era: { free: 1, enabled: true }, adLeft: 0, adAllowed: false, adState: 'idle' },
    pool: pool([]),
    selected: null,
    lineup: lineup({ zhugong: ['g_liubei', '刘备', 8.2, 'good'], mengjiang: ['g_guanyu', '关羽', 9.0, 'good'] }),
    canUndo: false,
    primaryLabel: '翻令',
    poolScroll: 0,
    ...over,
  };
}

function slotOpts() {
  return [
    { slot: 'junshi', label: '军师', score: 7.0, fit: 'good' },
    { slot: 'xianfeng', label: '先锋', score: 8.5, fit: 'good' },
    { slot: 'shoujiang', label: '守将', score: 8.2, fit: 'good' },
  ];
}

function buildFixtures(env) {
  const fx = {};

  // ---------------- home
  const dailyBase = { issueNo: 12, dateKey: '20261014' };
  const home = (daily, over) => ({ daily: { ...dailyBase, ...daily }, hasGroupContext: false, muted: false, showHowToOnce: false, settings: { friendBoardEnabled: true }, sheet: null, ...over });
  fx.home = {
    loading: home({ state: 'loading' }),
    available: home({ state: 'available' }),
    available_group: home({ state: 'available' }, { hasGroupContext: true }),
    inProgress: home({ state: 'inProgress', round: 3 }),
    done: home({ state: 'done', record: { w: 10, l: 2 }, bandLabel: '霸业将成' }),
    pendingSubmit: home({ state: 'pendingSubmit' }),
    offline: home({ state: 'offline' }),
    error: home({ state: 'error' }),
    muted: home({ state: 'available' }, { muted: true }),
    howto: home({ state: 'available' }, { sheet: 'howto' }),
    settings_on: home({ state: 'available' }, { sheet: 'settings' }),
    settings_off: home({ state: 'available' }, { sheet: 'settings', muted: true, settings: { friendBoardEnabled: false } }),
  };

  // ---------------- draft
  const fullLineup = lineup({ zhugong: ['g_liubei', '刘备', 8.2, 'good'], junshi: ['g_zhugeliang', '诸葛亮', 9.4, 'good'], xianfeng: ['g_machao', '马超', 7.9, 'ok'], mengjiang: ['g_guanyu', '关羽', 9.0, 'good'], shoujiang: ['g_zhangfei', '张飞', 5.2, 'bad'] });
  const respinSpent = { faction: { free: 0, enabled: true }, era: { free: 0, enabled: true }, adLeft: 2, adAllowed: true, adState: 'idle' };
  fx.draft = {
    awaitFlip: draftVm({ phase: 'awaitFlip', tokens: null, pool: [], round: 1, lineup: lineup({}), flip: 0 }),
    flipping: draftVm({ phase: 'flipped', flip: 0.7 }),
    flipped: draftVm({}),
    flipped_scrolled: draftVm({ poolScroll: 120, pool: pool(['g_guanyu']) }),
    selecting: draftVm({ phase: 'selecting', selected: { generalId: 'g_zhaoyun', blurb: '一身是胆，忠勇无双。', statNote: '信10：终身无二主；智6：以勇略见长而非谋主。', slotOptions: slotOpts() } }),
    selecting_five: draftVm({ phase: 'selecting', round: 1, lineup: lineup({}), selected: { generalId: 'g_zhugeliang', blurb: '鞠躬尽瘁，运筹帷幄。', statNote: '智10：蜀汉谋主；勇3：不擅冲阵。', slotOptions: SLOTS.map(([slot, label], i) => ({ slot, label, score: [8.1, 9.4, 4.6, 3.1, 7.2][i], fit: ['good', 'good', 'bad', 'bad', 'ok'][i] })) } }),
    placed: draftVm({ phase: 'placed', canUndo: true, primaryLabel: '下一轮', pool: pool(['g_zhaoyun']), lineup: lineup({ zhugong: ['g_liubei', '刘备', 8.2, 'good'], mengjiang: ['g_guanyu', '关羽', 9.0, 'good'], xianfeng: ['g_zhaoyun', '赵云', 8.5, 'good'] }) }),
    readyToMarch: draftVm({ phase: 'readyToMarch', round: 5, canUndo: true, primaryLabel: '出征', pool: pool(['g_zhaoyun']), lineup: fullLineup }),
    respin_none: draftVm({ respin: { faction: { free: 1, enabled: false }, era: { free: 1, enabled: true }, adLeft: 0, adAllowed: false, adState: 'idle' } }),
    daily_spent: draftVm({ respin: { faction: { free: 0, enabled: true }, era: { free: 0, enabled: true }, adLeft: 0, adAllowed: false, adState: 'idle' } }),
    free_ad: draftVm({ mode: 'free', respin: respinSpent }),
    free_ad_loading: draftVm({ mode: 'free', respin: { ...respinSpent, adState: 'loading' } }),
    reflip_notice: draftVm({ phase: 'flipped', notice: '此路无将，重新翻令', pool: pool([]).slice(0, 2) }),
    pool_empty: draftVm({ pool: [] }),
    challenge: draftVm({ mode: 'challenge' }),
    coach1: draftVm({ phase: 'awaitFlip', tokens: null, pool: [], round: 1, lineup: lineup({}), flip: 0, coach: 1 }),
    coach2: draftVm({ coach: 2, round: 1, lineup: lineup({}) }),
    coach3: draftVm({ phase: 'selecting', coach: 3, round: 1, lineup: lineup({}), selected: { generalId: 'g_zhaoyun', blurb: '一身是胆，忠勇无双。', statNote: '信10：终身无二主；智6：以勇略见长而非谋主。', slotOptions: slotOpts() } }),
    confirm_back: { vm: draftVm({}), overlay: { dialog: { text: '本局已开始，进度会保留，可稍后继续', confirmLabel: '先回首页', cancelLabel: '继续点将' } } },
    confirm_back_free: { vm: draftVm({ mode: 'free' }), overlay: { dialog: { text: '放弃本局？', confirmLabel: '放弃', cancelLabel: '继续点将', danger: true } } },
    toast_ad: { vm: draftVm({ mode: 'free', respin: respinSpent }), overlay: { toast: { text: '暂无广告，本次免费' } } },
    adstub: { vm: draftVm({ mode: 'free', respin: respinSpent }), overlay: { adStub: { kind: 'rewarded', secondsLeft: 2 } } },
  };

  require('./fixtures_more.js').add(fx, env, { G, FAC, pool, draftVm, lineup, SLOTS });
  return fx;
}

module.exports = { buildFixtures };
