/**
 * Fixture view models for every screen x state (spec 8, 13). The same data
 * drives the PNG preview and tests/render*.test.js (via tests' own import of
 * this file), so they never drift.
 *
 * buildFixtures({createCanvas, L, display}) -> { screen: { state: vm | {vm, overlay} } }
 * `display` ({largeText, highContrast}) is injected into every vm and overlay,
 * so the same fixtures render in all four a11y combinations.
 */

const FAC = { wei: '#B8862B', shu: '#C0392B', wu: '#2E7D7A', qun: '#7A5230', jin: '#C9D3DD' };

// A slice of the roster (stats from spec Appendix B/C). seal = the Seal descriptor of spec 13.
function gen(id, name, courtesy, tier, stats, blurb, extra) {
  return Object.assign(
    {
      id,
      name,
      courtesy,
      monogram: name.slice(-1),
      tier,
      stats: { zhi: stats[0], xin: stats[1], ren: stats[2], yong: stats[3], yan: stats[4] },
      blurb,
      appearanceNote: null,
      statNote: '',
      drafted: false,
      portraitUrl: null,
      faction: 'shu',
    },
    extra || {}
  );
}

const G = {
  liubei: gen('g_liubei', '刘备', '玄德', 'jia', [7, 8, 10, 6, 7], '仁德之君，屡败屡战。'),
  guanyu: gen('g_guanyu', '关羽', '云长', 'jia', [6, 10, 6, 10, 7], '义薄云天，威震华夏。'),
  zhangfei: gen('g_zhangfei', '张飞', '翼德', 'yi', [4, 9, 4, 10, 6], '万人之敌，当阳断桥。'),
  zhuge: gen('g_zhugeliang', '诸葛亮', '孔明', 'jia', [10, 9, 8, 3, 9], '鞠躬尽瘁，运筹帷幄。'),
  zhaoyun: gen('g_zhaoyun', '赵云', '子龙', 'jia', [6, 10, 8, 9, 8], '一身是胆，忠勇无双。', { appearanceNote: '从公孙瓒', faction: 'shu' }),
  machao: gen('g_machao', '马超', '孟起', 'yi', [5, 4, 5, 10, 6], '锦马超，勇冠三军。'),
  huangzhong: gen('g_huangzhong', '黄忠', '汉升', 'yi', [5, 8, 6, 9, 7], '老当益壮，定军斩渊。'),
  weiyan: gen('g_weiyan', '魏延', '文长', 'bing', [6, 5, 4, 9, 5], '子午奇谋，反骨之说。', { appearanceNote: '从刘表' }),
};

for (const k of Object.keys(G)) G[k].seal = { text: G[k].name, monogram: G[k].monogram, factionKey: 'shu', color: FAC.shu, inkText: false, frame: G[k].tier, size: 48 };
G.zhaoyun.seal = Object.assign({}, G.zhaoyun.seal, { factionKey: 'qun', color: FAC.qun });

const JIN = [
  gen('g_simayi', '司马懿', '仲达', 'jia', [10, 6, 5, 6, 10], '隐忍深谋，终成大业。', { faction: 'jin' }),
  gen('g_simashi', '司马师', '子元', 'yi', [8, 6, 5, 7, 8], '沉毅果断，执掌朝政。', { faction: 'jin' }),
  gen('g_yanghu', '羊祜', '叔子', 'yi', [8, 9, 9, 5, 8], '德行服人，镇守荆襄。', { faction: 'jin', appearanceNote: '归晋' }),
  gen('g_duyu', '杜预', '元凯', 'jia', [9, 8, 7, 6, 9], '文武兼备，灭吴首功。', { faction: 'jin' }),
  gen('g_zhangchunhua', '张春华', '', 'bing', [7, 6, 6, 3, 8], '内助谋断。', { faction: 'jin' }),
];
JIN.forEach((g) => (g.seal = { text: g.name, monogram: g.monogram, factionKey: 'jin', color: FAC.jin, inkText: true, frame: g.tier, size: 48 }));

function pool(drafted, list) {
  return (list || Object.values(G)).map((g) => ({ ...g, drafted: drafted.includes(g.id) }));
}

const TOKENS = { faction: { key: 'shu', label: '蜀', color: FAC.shu }, era: { key: 'chibi', label: '赤壁' } };
const TOKENS_JIN = { faction: { key: 'jin', label: '晋', color: FAC.jin }, era: { key: 'guijin', label: '归晋' } };

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
    return { slot, label, generalId: f ? f[0] : null, name: f ? f[1] : null, factionKey: f ? f[4] || 'shu' : null, score: f ? f[2] : null, fit: f ? f[3] : null };
  });
}

function hiddenize(pl) {
  return pl.map((g) => ({ ...g, tier: null, stats: null, seal: { ...g.seal, frame: 'plain' } }));
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
    hidden: false,
    variantLabel: null,
    roundFetch: 'idle',
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

function hiddenSlotOpts() {
  return slotOpts().map((o) => ({ slot: o.slot, label: o.label, score: null, fit: null }));
}

const SEL_ZHAOYUN = () => ({ generalId: 'g_zhaoyun', seal: G.zhaoyun.seal, blurb: '一身是胆，忠勇无双。', statNote: '信10：终身无二主；智6：以勇略见长而非谋主。', appearanceNote: '从公孙瓒', slotOptions: slotOpts() });

function buildFixtures(env) {
  const fx = {};

  // ---------------- home
  const dailyBase = { issueNo: 12, dateKey: '20261014', variant: 'standard', variantLabel: null, streak: { current: 0, text: null } };
  const home = (daily, over) => ({ daily: { ...dailyBase, ...daily }, hasGroupContext: false, muted: false, showHowToOnce: false, settings: { friendBoardEnabled: true }, nav: { historyEnabled: true }, sheet: null, ...over });
  const S5 = { current: 5, text: '连续出征 5 天' };
  const SHIREN = { variant: 'shiren', variantLabel: '识人' };
  fx.home = {
    loading: home({ state: 'loading' }),
    available: home({ state: 'available' }),
    available_shiren: home({ state: 'available', ...SHIREN }),
    available_streak: home({ state: 'available', streak: S5 }),
    available_shiren_streak: home({ state: 'available', ...SHIREN, streak: S5 }, { hasGroupContext: true }),
    available_group: home({ state: 'available' }, { hasGroupContext: true }),
    available_nohistory: home({ state: 'available' }, { nav: { historyEnabled: false } }),
    inProgress: home({ state: 'inProgress', round: 3 }),
    inProgress_streak: home({ state: 'inProgress', round: 3, streak: S5 }),
    done: home({ state: 'done', record: { w: 10, l: 2 }, bandLabel: '霸业将成', streak: S5 }),
    done_shiren: home({ state: 'done', record: { w: 10, l: 2 }, bandLabel: '霸业将成', ...SHIREN, streak: { current: 12, text: '连续出征 12 天' } }),
    pendingSubmit: home({ state: 'pendingSubmit' }),
    offline: home({ state: 'offline' }),
    error: home({ state: 'error' }),
    muted: home({ state: 'available' }, { muted: true }),
    howto: home({ state: 'available' }, { sheet: 'howto' }),
    settings_on: home({ state: 'available' }, { sheet: 'settings' }),
    settings_off: home({ state: 'available' }, { sheet: 'settings', muted: true, settings: { friendBoardEnabled: false } }),
    settings_album: home({ state: 'available' }, { sheet: 'settings', settings: { friendBoardEnabled: false, album: 'denied' } }),
  };

  // ---------------- draft
  const fullLineup = lineup({ zhugong: ['g_liubei', '刘备', 8.2, 'good'], junshi: ['g_zhugeliang', '诸葛亮', 9.4, 'good'], xianfeng: ['g_machao', '马超', 7.9, 'ok'], mengjiang: ['g_guanyu', '关羽', 9.0, 'good'], shoujiang: ['g_zhangfei', '张飞', 5.2, 'bad'] });
  const respinSpent = { faction: { free: 0, enabled: true }, era: { free: 0, enabled: true }, adLeft: 2, adAllowed: true, adState: 'idle' };
  const sel2 = () => ({ generalId: 'g_zhugeliang', seal: G.zhuge.seal, blurb: '鞠躬尽瘁，运筹帷幄。', statNote: '智10：蜀汉谋主；勇3：不擅冲阵。', appearanceNote: null, slotOptions: SLOTS.map(([slot, label], i) => ({ slot, label, score: [8.1, 9.4, 4.6, 3.1, 7.2][i], fit: ['good', 'good', 'bad', 'bad', 'ok'][i] })) });
  const hid = { hidden: true, variantLabel: '识人', pool: hiddenize(pool([])) };
  const hidLineup = lineup({ zhugong: ['g_liubei', '刘备', null, null], mengjiang: ['g_guanyu', '关羽', null, null] });
  fx.draft = {
    awaitFlip: draftVm({ phase: 'awaitFlip', tokens: null, pool: [], round: 1, lineup: lineup({}), flip: 0 }),
    flipping: draftVm({ phase: 'flipped', flip: 0.7 }),
    flipped: draftVm({}),
    flipped_scrolled: draftVm({ poolScroll: 120, pool: pool(['g_guanyu']) }),
    flipped_drafted: draftVm({ pool: pool(['g_zhaoyun', 'g_weiyan']) }),
    flipped_jin: draftVm({ tokens: TOKENS_JIN, pool: pool([], JIN), lineup: lineup({ zhugong: ['g_simayi', '司马懿', 8.0, 'good', 'jin'] }) }),
    selecting: draftVm({ phase: 'selecting', selected: SEL_ZHAOYUN() }),
    selecting_five: draftVm({ phase: 'selecting', round: 1, lineup: lineup({}), selected: sel2() }),
    selecting_jin: draftVm({ phase: 'selecting', tokens: TOKENS_JIN, pool: pool([], JIN), selected: { generalId: 'g_simayi', seal: JIN[0].seal, blurb: '隐忍深谋，终成大业。', statNote: '智10：谋略冠绝；严10：治军有度。', appearanceNote: null, slotOptions: slotOpts() } }),
    placed: draftVm({ phase: 'placed', canUndo: true, primaryLabel: '下一轮', pool: pool(['g_zhaoyun']), lineup: lineup({ zhugong: ['g_liubei', '刘备', 8.2, 'good'], mengjiang: ['g_guanyu', '关羽', 9.0, 'good'], xianfeng: ['g_zhaoyun', '赵云', 8.5, 'good', 'qun'] }) }),
    readyToMarch: draftVm({ phase: 'readyToMarch', round: 5, canUndo: true, primaryLabel: '出征', pool: pool(['g_zhaoyun']), lineup: fullLineup }),
    respin_none: draftVm({ respin: { faction: { free: 1, enabled: false }, era: { free: 1, enabled: true }, adLeft: 0, adAllowed: false, adState: 'idle' } }),
    daily_spent: draftVm({ respin: { faction: { free: 0, enabled: true }, era: { free: 0, enabled: true }, adLeft: 0, adAllowed: false, adState: 'idle' } }),
    free_ad: draftVm({ mode: 'free', respin: respinSpent }),
    free_ad_loading: draftVm({ mode: 'free', respin: { ...respinSpent, adState: 'loading' } }),
    reflip_notice: draftVm({ phase: 'flipped', notice: '此路无将，重新翻令', pool: pool([]).slice(0, 2) }),
    pool_empty: draftVm({ pool: [] }),
    challenge: draftVm({ mode: 'challenge' }),
    round_loading: draftVm({ phase: 'awaitFlip', tokens: null, pool: [], round: 2, roundFetch: 'loading', flip: 0.4 }),
    round_failed: draftVm({ phase: 'awaitFlip', tokens: null, pool: [], round: 2, roundFetch: 'failed', flip: 0 }),
    hidden_awaitFlip: draftVm({ ...hid, phase: 'awaitFlip', tokens: null, pool: [], round: 1, lineup: lineup({}), flip: 0 }),
    hidden_flipped: draftVm({ ...hid, lineup: hidLineup }),
    hidden_selecting: draftVm({ ...hid, phase: 'selecting', lineup: hidLineup, selected: { ...SEL_ZHAOYUN(), seal: { ...G.zhaoyun.seal, frame: 'plain' }, statNote: null, slotOptions: hiddenSlotOpts() } }),
    hidden_placed: draftVm({ ...hid, phase: 'placed', canUndo: true, primaryLabel: '下一轮', lineup: lineup({ zhugong: ['g_liubei', '刘备', null, null], mengjiang: ['g_guanyu', '关羽', null, null], xianfeng: ['g_zhaoyun', '赵云', null, null, 'qun'] }) }),
    hidden_failed: draftVm({ ...hid, phase: 'awaitFlip', tokens: null, pool: [], round: 2, roundFetch: 'failed', lineup: hidLineup }),
    hidden_coach: draftVm({ ...hid, lineup: lineup({}), round: 1, coach: 'shiren' }),
    coach1: draftVm({ phase: 'awaitFlip', tokens: null, pool: [], round: 1, lineup: lineup({}), flip: 0, coach: 1 }),
    coach2: draftVm({ coach: 2, round: 1, lineup: lineup({}) }),
    coach3: draftVm({ phase: 'selecting', coach: 3, round: 1, lineup: lineup({}), selected: SEL_ZHAOYUN() }),
    confirm_back: { vm: draftVm({}), overlay: { dialog: { text: '本局已开始，进度会保留，可稍后继续', confirmLabel: '先回首页', cancelLabel: '继续点将' } } },
    confirm_back_free: { vm: draftVm({ mode: 'free' }), overlay: { dialog: { text: '放弃本局？', confirmLabel: '放弃', cancelLabel: '继续点将', danger: true } } },
    toast_ad: { vm: draftVm({ mode: 'free', respin: respinSpent }), overlay: { toast: { text: '暂无广告，本次免费' } } },
    adstub: { vm: draftVm({ mode: 'free', respin: respinSpent }), overlay: { adStub: { kind: 'rewarded', secondsLeft: 2 } } },
    privacy: { vm: draftVm({}), overlay: { privacy: {} } },
  };

  require('./fixtures_more.js').add(fx, env, { G, FAC, pool, draftVm, lineup, SLOTS, JIN });
  return inject(fx, env && env.display);
}

/** Put `display` into every vm and overlay. */
function inject(fx, display) {
  if (!display) return fx;
  Object.keys(fx).forEach((screen) => {
    Object.keys(fx[screen]).forEach((name) => {
      const st = fx[screen][name];
      if (screen === 'shareCard') return;
      if (st && st.vm !== undefined) {
        st.vm.display = { ...display };
        if (st.overlay) st.overlay.display = { ...display };
      } else st.display = { ...display };
    });
  });
  return fx;
}

module.exports = { buildFixtures };
