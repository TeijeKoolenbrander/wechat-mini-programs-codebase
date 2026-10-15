/**
 * Fixture view models for every screen x state (spec 6, 10). The same data
 * drives the PNG preview (render.js) and tests/render*.test.js, so they never
 * drift. The facts here are display fixtures only (not content).
 *
 * buildFixtures({createCanvas, L}) -> { group: { state: { mod, vm, under?, overlay? } } }
 *   mod: 'home' | 'play' | ... for screens, 'sheet:report' ... for sheets.
 *   under: { mod, vm } drawn first (a sheet opens over a screen).
 *   overlay: overlay vm drawn last.
 */

const A = {
  city: '#4C6A88',
  geo: '#2F7F76',
  era: '#A97A1F',
  animal: '#6B7B2C',
  space: '#4B4F9A',
  build: '#7B6250',
  food: '#C0662B',
  dist: '#2F7DA6',
};

/** A CardFace (spec 10). */
function face(o) {
  return Object.assign(
    {
      factId: 'f_' + (o.label || 'x'),
      label: '长江',
      subLabel: '全长',
      icon: 'river',
      accent: A.geo,
      valueText: '6,300',
      unitText: '公里',
      approx: false,
      sourceText: '来源：水利部 · 2013',
      canReport: true,
    },
    o
  );
}

const hidden = (o) => face(Object.assign({ valueText: null, sourceText: null, canReport: false }, o));

const CHANGJIANG = face({ label: '长江', factId: 'f_river_changjiang' });
const HUANGHE = face({ label: '黄河', factId: 'f_river_huanghe', valueText: '5,464', sourceText: '来源：水利部 · 2013' });
const HUANGHE_HIDDEN = hidden({ label: '黄河', factId: 'f_river_huanghe' });
const CHENGDU = face({ label: '成都市', factId: 'f_city_pop_chengdu', subLabel: '常住人口（2020）', icon: 'city_pop', accent: A.city, valueText: '2,093.8', unitText: '万人', sourceText: '来源：四川省统计局 · 2021' });
const CHONGQING = face({ label: '重庆市', factId: 'f_city_pop_chongqing', subLabel: '常住人口（2020）', icon: 'city_pop', accent: A.city, valueText: '3,205.4', unitText: '万人', sourceText: '来源：重庆市统计局 · 2021' });
const CHONGQING_HIDDEN = hidden({ label: '重庆市', factId: 'f_city_pop_chongqing', subLabel: '常住人口（2020）', icon: 'city_pop', accent: A.city, unitText: '万人' });
const ZHAOZHOU = face({ label: '赵州桥', factId: 'f_year_zhaozhou', subLabel: '建成', icon: 'year', accent: A.era, valueText: '约 605', unitText: '年', approx: true, sourceText: '来源：国家文物局 · 2019' });
const YINGXIAN_HIDDEN = hidden({ label: '应县木塔', factId: 'f_year_yingxian', subLabel: '始建', icon: 'year', accent: A.era, unitText: '年' });
const YINGXIAN = face({ label: '应县木塔', factId: 'f_year_yingxian', subLabel: '始建', icon: 'year', accent: A.era, valueText: '1056', unitText: '年', sourceText: '来源：国家文物局 · 2019' });
const LONG_TOP = face({ label: '中华人民共和国新疆维吾尔自治区', factId: 'f_long_top', subLabel: '常住人口（2020）', icon: 'prov_pop', accent: A.city, valueText: '2,585.2', unitText: '万人', sourceText: '来源：新疆维吾尔自治区统计局第七次全国人口普查公报（第二号）· 2021' });
const LONG_BOTTOM_HIDDEN = hidden({ label: '内蒙古自治区鄂尔多斯市伊金霍洛旗', factId: 'f_long_bottom', subLabel: '常住人口（2020）', icon: 'prov_pop', accent: A.city, unitText: '万人' });
const LONG_BOTTOM = face({ label: '内蒙古自治区鄂尔多斯市伊金霍洛旗', factId: 'f_long_bottom', subLabel: '常住人口（2020）', icon: 'prov_pop', accent: A.city, valueText: '1,411.8', unitText: '万人', sourceText: '来源：内蒙古自治区统计局 · 2021' });
const MOUNT = face({ label: '珠穆朗玛峰', factId: 'f_mount_everest', subLabel: '海拔', icon: 'mountain', accent: A.geo, valueText: '8,848.86', unitText: '米', sourceText: '来源：自然资源部 · 2020' });
const MOON = face({ label: '月球', factId: 'f_space_moon', subLabel: '直径', icon: 'space_diameter', accent: A.space, valueText: '3,474.8', unitText: '公里', sourceText: '来源：NASA · 2024' });
const DIST = face({ label: '北京—上海', factId: 'f_dist_bj_sh', subLabel: '两地直线距离', icon: 'distance', accent: A.dist, valueText: '1,068', unitText: '公里', sourceText: '来源：GeoNames，本游戏计算 · 2026' });
const CAT = face({ label: '大熊猫', factId: 'f_animal_panda', subLabel: '成年体重（约）', icon: 'animal_weight', accent: A.animal, valueText: '约 100', unitText: '千克', approx: true, sourceText: '来源：国家林草局 · 2021' });
const BIGNUM = face({ label: '地球', factId: 'f_space_earth', subLabel: '直径', icon: 'space_diameter', accent: A.space, valueText: '12,742', unitText: '公里' });
const TOFU = face({ label: '豆腐', factId: 'f_food_tofu', subLabel: '每100克热量（约）', icon: 'food_kcal', accent: A.food, valueText: '约 81', unitText: '千卡', approx: true, sourceText: '来源：USDA FoodData Central · 2019' });
const BRIDGE = face({ label: '港珠澳大桥', factId: 'f_build_hzmb', subLabel: '全长', icon: 'structure_len', accent: A.build, valueText: '55,000', unitText: '米', sourceText: '来源：港珠澳大桥管理局 · 2018' });

const noReport = (f) => Object.assign({}, f, { canReport: false });

function play(over) {
  return Object.assign(
    {
      mode: 'daily',
      ranked: true,
      friendly: false,
      headerText: '今日一比 · 第12期 · 山河',
      streak: 7,
      k: 8,
      deckLength: 40,
      phase: 'awaitAnswer',
      top: CHANGJIANG,
      bottom: HUANGHE_HIDDEN,
      promptText: '黄河 比 长江 ……',
      buttons: { hi: { label: '更长', enabled: true }, lo: { label: '更短', enabled: true } },
      chosen: null,
      correct: null,
      segmentBanner: null,
      lifeUsed: false,
      coachMark: false,
      t: 800,
    },
    over
  );
}

const SOURCES_LINES = [
  { publisher: '国家统计局及各省（区、市）统计局', attribution: '人口数据来源：国家统计局网站及各省（区、市）统计局，第七次全国人口普查公报', url: 'https://www.stats.gov.cn' },
  { publisher: '自然资源部、水利部', attribution: '地理数据：自然资源部、水利部公布数据', url: null },
  { publisher: 'NASA', attribution: '天文数据：NASA', url: 'https://nssdc.gsfc.nasa.gov' },
  { publisher: 'USDA FoodData Central', attribution: '食物热量：USDA FoodData Central (CC0)', url: 'https://fdc.nal.usda.gov' },
  { publisher: 'GeoNames', attribution: '城市坐标：GeoNames (CC BY 4.0)，距离为本游戏计算的直线距离', url: 'https://www.geonames.org' },
  { publisher: '国家文物局', attribution: '文物年代与高度：国家文物局及各文物保护单位公布资料', url: null },
  { publisher: '其他', attribution: '其他：各条目注明的出版物', url: null },
];

function questions(n, missLast) {
  const pairs = [
    [CHANGJIANG, HUANGHE],
    [CHENGDU, CHONGQING],
    [ZHAOZHOU, YINGXIAN],
    [MOUNT, MOON],
    [BRIDGE, DIST],
    [CAT, TOFU],
  ];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pairs[i % pairs.length];
    out.push({ k: i + 1, top: p[0], bottom: p[1], correct: !(missLast && i === n - 1) });
  }
  return out;
}

function resultBase(over) {
  return Object.assign(
    {
      mode: 'daily',
      ranked: true,
      friendly: false,
      status: 'done',
      headerText: '今日一比 · 第 12 期 · 山河',
      streak: 14,
      streakText: '14',
      cleared: false,
      commentText: '有点东西',
      rarityText: '超过今日 82% 的玩家',
      dayStreakText: '连续 5 天',
      miss: { k: 15, top: CHANGJIANG, bottom: HUANGHE, chosenLabel: '你选：更长' },
      questions: questions(15, true),
      saveImage: { state: 'idle' },
      subscribe: { state: 'hidden', challengeId: null },
      privacyNote: null,
      interstitialDue: false,
      t: 500,
    },
    over
  );
}

function boardRows() {
  return [];
}

function buildFixtures(ctxArgs) {
  const createCanvas = ctxArgs && ctxArgs.createCanvas;
  const fx = {};
  const add = (group, name, entry) => {
    fx[group] = fx[group] || {};
    fx[group][name] = entry;
  };

  // ------------------------------------------------------------- home
  const homeBase = {
    daily: { state: 'available', issueNo: 12, dateKey: '20261015', themeLabel: '山河', dayStreak: { current: 1, text: null } },
    free: { categoryKey: 'all', categoryLabel: '全部', bestText: '随便比比最佳 23' },
    hasGroupContext: false,
    muted: false,
    showHowToOnce: false,
    settings: { friendBoardEnabled: true },
    t: 600,
  };
  const home = (daily, over) => ({ mod: 'home', vm: Object.assign({}, homeBase, { daily: Object.assign({}, homeBase.daily, daily) }, over) });
  add('home', 'loading', home({ state: 'loading' }));
  add('home', 'available', home({}));
  add('home', 'available_streak', home({ dayStreak: { current: 5, text: '连续 5 天' } }));
  add('home', 'available_group', home({ dayStreak: { current: 5, text: '连续 5 天' } }, { hasGroupContext: true }));
  add('home', 'inProgress', home({ state: 'inProgress', progressText: '已连对 7 · 第 8 题', streak: 7 }));
  add('home', 'done', home({ state: 'done', streak: 14, rarityText: '超过 82% 的玩家', dayStreak: { current: 5, text: '连续 5 天' } }));
  add('home', 'done_window', home({ state: 'done', streak: 9, rarityText: null, finalizedByWindow: true }));
  add('home', 'offline', home({ state: 'offline' }));
  add('home', 'error', home({ state: 'error' }, { free: { categoryKey: 'geo', categoryLabel: '山河', bestText: null }, muted: true }));

  // ------------------------------------------------------------- play
  add('play', 'loading', { mod: 'play', vm: play({ phase: 'loading', top: null, bottom: null, promptText: '正在出题…', buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'awaitAnswer', { mod: 'play', vm: play({}) });
  add('play', 'awaitAnswer_coach', { mod: 'play', vm: play({ streak: 0, k: 1, coachMark: true, mode: 'free', headerText: '随便比比 · 山河', deckLength: 60 }) });
  add('play', 'awaitAnswer_city', { mod: 'play', vm: play({ top: CHENGDU, bottom: CHONGQING_HIDDEN, promptText: '重庆市 比 成都市 ……', buttons: { hi: { label: '更多', enabled: true }, lo: { label: '更少', enabled: true } }, headerText: '今日一比 · 第12期 · 城市' }) });
  add('play', 'awaitAnswer_year', { mod: 'play', vm: play({ top: ZHAOZHOU, bottom: YINGXIAN_HIDDEN, promptText: '应县木塔 比 赵州桥 ……', buttons: { hi: { label: '更晚', enabled: true }, lo: { label: '更早', enabled: true } }, headerText: '今日一比 · 第12期 · 古今' }) });
  add('play', 'awaitAnswer_longname', { mod: 'play', vm: play({ top: LONG_TOP, bottom: LONG_BOTTOM_HIDDEN, promptText: '内蒙古自治区鄂尔多斯市伊金霍洛旗 比 中华人民共和国新疆维吾尔自治区 ……', buttons: { hi: { label: '更多', enabled: true }, lo: { label: '更少', enabled: true } }, headerText: '今日一比 · 第12期 · 城市 · 一段很长的主题名' }) });
  add('play', 'awaitAnswer_streak12', { mod: 'play', vm: play({ streak: 12, k: 13, streakPulse: 0.4, top: MOUNT, bottom: hidden({ label: '乔戈里峰', subLabel: '海拔', icon: 'mountain', accent: A.geo, unitText: '米' }), promptText: '乔戈里峰 比 珠穆朗玛峰 ……', buttons: { hi: { label: '更高', enabled: true }, lo: { label: '更低', enabled: true } } }) });
  add('play', 'awaitAnswer_challenge', { mod: 'play', vm: play({ mode: 'challenge', streak: 15, k: 16, challenge: { ownerStreak: 14, passedText: '已超过 TA 的 14 ✓' }, headerText: '挑战 · 第12期 · 山河' }) });
  add('play', 'sending', { mod: 'play', vm: play({ phase: 'sending', chosen: 'hi', buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'revealing_turn', { mod: 'play', vm: play({ phase: 'revealing', chosen: 'hi', turn: 0.3, count: 0, bottom: HUANGHE, buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'revealing_count', { mod: 'play', vm: play({ phase: 'revealing', chosen: 'lo', turn: 1, count: 0.55, correct: true, bottom: HUANGHE, buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'correct', { mod: 'play', vm: play({ phase: 'correct', chosen: 'lo', correct: true, bottom: HUANGHE, buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'correct_slide', { mod: 'play', vm: play({ phase: 'correct', chosen: 'lo', correct: true, slide: 0.5, streak: 8, bottom: HUANGHE, next: hidden({ label: '澜沧江', subLabel: '全长', icon: 'river', unitText: '公里' }), buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'miss', { mod: 'play', vm: play({ phase: 'miss', chosen: 'hi', correct: false, bottom: HUANGHE, promptText: '黄河 比 长江 ……', buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'miss_shake', { mod: 'play', vm: play({ phase: 'miss', chosen: 'hi', correct: false, shake: 0.2, bottom: HUANGHE, buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'segmentChange', { mod: 'play', vm: play({ phase: 'segmentChange', segmentBanner: '下一组：比海拔', top: MOUNT, bottom: hidden({ label: '乔戈里峰', subLabel: '海拔', icon: 'mountain', accent: A.geo, unitText: '米' }), promptText: '乔戈里峰 比 珠穆朗玛峰 ……', buttons: { hi: { label: '更高', enabled: false }, lo: { label: '更低', enabled: false } } }) });
  add('play', 'cleared', { mod: 'play', vm: play({ phase: 'cleared', streak: 40, k: 40, chosen: 'lo', correct: true, bottom: HUANGHE, stampT: 1, buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'netError', { mod: 'play', vm: play({ phase: 'netError', chosen: 'hi', buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) });
  add('play', 'numbers_approx', { mod: 'play', vm: play({ top: CAT, bottom: hidden({ label: '东北虎', subLabel: '成年体重（约）', icon: 'animal_weight', accent: A.animal, unitText: '千克', approx: true }), promptText: '东北虎 比 大熊猫 ……', buttons: { hi: { label: '更重', enabled: true }, lo: { label: '更轻', enabled: true } }, headerText: '随便比比 · 动物', mode: 'free' }) });
  add('play', 'numbers_big', { mod: 'play', vm: play({ top: BIGNUM, bottom: hidden({ label: '木星', subLabel: '直径', icon: 'space_diameter', accent: A.space, unitText: '公里' }), promptText: '木星 比 地球 ……', buttons: { hi: { label: '更大', enabled: true }, lo: { label: '更小', enabled: true } }, headerText: '随便比比 · 天文', mode: 'free' }) });

  // ----------------------------------------------------------- result
  const res = (over) => ({ mod: 'result', vm: resultBase(over) });
  add('result', 'finalizing', res({ status: 'finalizing', miss: null, commentText: '', rarityText: null, dayStreakText: null }));
  add('result', 'pendingNetwork', res({ status: 'pendingNetwork' }));
  add('result', 'error', res({ status: 'error' }));
  add('result', 'done_daily_miss', res({}));
  add('result', 'done_zero', res({ streak: 0, streakText: '0', commentText: '热身一下，再来！', rarityText: null, dayStreakText: null, miss: { k: 1, top: CHENGDU, bottom: CHONGQING, chosenLabel: '你选：更少' }, questions: questions(1, true) }));
  add('result', 'done_hot', res({ streak: 27, streakText: '27', commentText: '这都知道？！', miss: { k: 28, top: ZHAOZHOU, bottom: YINGXIAN, chosenLabel: '你选：更早' } }));
  add('result', 'done_cleared', res({ streak: 40, streakText: '40', cleared: true, miss: null, commentText: '这都知道？！', questions: questions(40, false) }));
  add('result', 'done_free_life', res({ mode: 'free', ranked: false, headerText: '随便比比 · 山河', streak: 18, streakText: '18（含再答一次）', rarityText: null, dayStreakText: null, subscribe: { state: 'offer', challengeId: 'ab12cd34' } }));
  add('result', 'done_challenge', res({ mode: 'challenge', ranked: false, friendly: true, headerText: '挑战 · 第 12 期 · 山河', streak: 16, streakText: '16', challenge: { ownerStreak: 14, compareText: '你 16 · TA 14 · 同一套题' } }));
  add('result', 'done_save_busy', res({ saveImage: { state: 'saving' }, subscribe: { state: 'granted', challengeId: 'ab12cd34' }, privacyNote: '未同意隐私指引，好友暂看不到你的成绩' }));
  add('result', 'done_longnames', res({ miss: { k: 15, top: LONG_TOP, bottom: LONG_BOTTOM, chosenLabel: '你选：更多' }, headerText: '今日一比 · 第 12 期 · 城市 · 一段很长的主题名' }));

  // ------------------------------------------------------- sheets
  const underPlay = { mod: 'play', vm: play({ phase: 'miss', chosen: 'hi', correct: false, bottom: HUANGHE, mode: 'free', headerText: '随便比比 · 山河', buttons: { hi: { label: '更长', enabled: false }, lo: { label: '更短', enabled: false } } }) };
  const underResult = { mod: 'result', vm: resultBase({}) };
  const underHome = { mod: 'home', vm: Object.assign({}, homeBase, { daily: homeBase.daily }) };
  add('sheets', 'howto', { mod: 'sheet:howto', vm: {}, under: underHome });
  const settings = (o) => Object.assign({ muted: false, largeText: false, highContrast: false, privacy: 'agreed', friendScope: 'granted', album: 'unknown' }, o);
  add('sheets', 'settings', { mod: 'sheet:settings', vm: settings({}), under: underHome });
  add('sheets', 'settings_denied', { mod: 'sheet:settings', vm: settings({ muted: true, privacy: 'denied', friendScope: 'denied', album: 'denied', largeText: true }), under: underHome });
  const opts = [{ key: 'all', label: '全部', factCount: 440 }].concat(
    ['city', 'geo', 'era', 'animal', 'space', 'build', 'food', 'dist'].map((k, i) => ({ key: k, label: ['城市', '山河', '古今', '动物', '天文', '工程', '吃喝', '距离'][i], factCount: 40 + i * 7 }))
  );
  add('sheets', 'picker', { mod: 'sheet:picker', vm: { selected: 'geo', options: opts }, under: underHome });
  const reasons = (sel) =>
    [
      ['value', '数值不对'],
      ['unit', '单位不对'],
      ['name', '名称不对'],
      ['source', '来源对不上'],
      ['wording', '措辞不妥'],
      ['other', '其他'],
    ].map((r) => ({ key: r[0], label: r[1], selected: sel.indexOf(r[0]) >= 0 }));
  const rep = (o) => Object.assign({ factId: 'f_river_huanghe', title: '这条数据有问题？', card: HUANGHE, reasons: reasons([]), state: 'idle', alreadyReported: false }, o);
  add('sheets', 'report_idle', { mod: 'sheet:report', vm: rep({}), under: underResult });
  add('sheets', 'report_selected', { mod: 'sheet:report', vm: rep({ reasons: reasons(['value', 'source']) }), under: underResult });
  add('sheets', 'report_sending', { mod: 'sheet:report', vm: rep({ reasons: reasons(['value']), state: 'sending' }), under: underResult });
  add('sheets', 'report_already', { mod: 'sheet:report', vm: rep({ reasons: reasons(['unit']), alreadyReported: true }), under: underResult });
  add('sheets', 'report_offline', { mod: 'sheet:report', vm: rep({ reasons: reasons(['name']), state: 'offline' }), under: underResult });
  add('sheets', 'source', { mod: 'sheet:source', vm: { card: HUANGHE, publisher: '水利部', sourceTitle: '中国河流名称代码 · 水利部水文年鉴（2013）', yearText: '2013', url: 'https://www.mwr.gov.cn/', retrievedAt: '2026-10-20', note: '全长，方法依数据来源而异' }, under: underResult });
  const rew = (o) => Object.assign({ visible: true, missText: '差一点！黄河 5,464 公里 · 长江 6,300 公里', adState: 'idle', canOffer: true }, o);
  add('sheets', 'rewarded_idle', { mod: 'sheet:rewarded', vm: rew({}), under: underPlay });
  add('sheets', 'rewarded_loading', { mod: 'sheet:rewarded', vm: rew({ adState: 'loading' }), under: underPlay });
  add('sheets', 'rewarded_hidden', { mod: 'sheet:rewarded', vm: rew({ visible: false }), under: underPlay });
  add('sheets', 'questions', { mod: 'sheet:questions', vm: { questions: questions(15, true) }, under: underResult });
  add('sheets', 'questions_empty', { mod: 'sheet:questions', vm: { questions: [] }, under: underResult });

  // ------------------------------------------------------- overlays
  add('overlays', 'dialog_exit', { mod: 'play', vm: play({}), overlay: { dialog: { title: '结束本局？', text: '结束后会显示本局成绩。', confirmLabel: '结束', cancelLabel: '继续答' } } });
  add('overlays', 'dialog_save_denied', { mod: 'result', vm: resultBase({}), overlay: { dialog: { title: '保存图片需要相册权限', text: '请在设置里允许「保存到相册」。', confirmLabel: '去设置', cancelLabel: '取消' } } });
  add('overlays', 'toast', { mod: 'play', vm: play({}), overlay: { toast: { text: '完整观看才能继续' } } });
  add('overlays', 'privacy', { mod: 'home', vm: homeBase, overlay: { privacy: {} } });
  add('overlays', 'adStub', { mod: 'play', vm: play({}), overlay: { adStub: { kind: 'rewarded', secondsLeft: 5 } } });

  // -------------------------------------------------------- challenge
  const chal = (o) => ({ mod: 'challenge', vm: Object.assign({ status: 'ready', ownerStreak: 14, kind: 'daily', issueText: '第 12 期 · 山河', countsAsDaily: true, isFriendly: false, rulesText: null, t: 400 }, o) });
  add('challenge', 'loading', chal({ status: 'loading' }));
  add('challenge', 'ready_counts', chal({}));
  add('challenge', 'ready_friendly', chal({ countsAsDaily: false, isFriendly: true }));
  add('challenge', 'ready_past', chal({ countsAsDaily: false, isFriendly: true, pastDaily: true }));
  add('challenge', 'ready_free', chal({ kind: 'free', categoryLabel: '山河', countsAsDaily: false, isFriendly: true, rulesText: '规则相同：每局可看视频再答一次' }));
  add('challenge', 'expired', chal({ status: 'expired' }));
  add('challenge', 'own', chal({ status: 'own', answerCount: 3, bestAnswer: 17, subscribe: { state: 'offer' } }));
  add('challenge', 'answered', chal({ status: 'answered' }));
  add('challenge', 'retired', chal({ status: 'retired' }));
  add('challenge', 'offline', chal({ status: 'offline' }));
  add('challenge', 'error', chal({ status: 'error' }));

  // ------------------------------------------------------------ board
  let shared = null;
  if (createCanvas) {
    shared = createCanvas(300, 300);
    const c = shared.getContext('2d');
    c.fillStyle = '#EFE9DA';
    c.fillRect(0, 0, 300, 300);
  }
  const board = (o) => ({ mod: 'board', vm: Object.assign({ kind: 'group', dateKey: '20261015', issueNo: 12, themeLabel: '山河', state: 'ready', mode: 'full', self: { streak: 14 }, actions: { canOpenSetting: true, canRetryPrivacy: true, canShareToGroup: true }, banner: { show: false, reservedHeight: 0 }, sharedCanvas: shared, viewerPlayed: true, t: 300 }, o) });
  add('board', 'noGroup', board({ state: 'noGroup' }));
  add('board', 'checkingGroup', board({ state: 'checkingGroup' }));
  add('board', 'loading', board({ state: 'loading' }));
  add('board', 'ready', board({}));
  add('board', 'ready_banner', board({ banner: { show: true, reservedHeight: 80 } }));
  add('board', 'ready_notplayed', board({ viewerPlayed: false }));
  add('board', 'friend_ready', board({ kind: 'friend' }));
  add('board', 'empty', board({ state: 'empty', viewerPlayed: false }));
  add('board', 'serverError', board({ state: 'serverError' }));
  add('board', 'privacyDenied', board({ state: 'privacyDenied' }));
  add('board', 'unauthorized', board({ state: 'unauthorized', kind: 'friend' }));

  // ---------------------------------------------------------- history
  const items = [];
  for (let i = 0; i < 12; i++) {
    items.push({ dateKey: '202610' + (15 - i), issueNo: 12 - i, dateText: '10月' + (15 - i) + '日', themeLabel: ['山河', '城市', '古今', '动物'][i % 4], mineText: i === 1 ? '未参加' : '连对 ' + (9 + (i % 5)), isToday: i === 0, statusText: i === 0 ? '进行中' : null });
  }
  const hist = (o) => ({ mod: 'history', vm: Object.assign({ state: 'ready', headerText: '最长连续 12 天 · 今日一比最佳 23', items, t: 200 }, o) });
  add('history', 'loading', hist({ state: 'loading' }));
  add('history', 'ready', hist({}));
  add('history', 'empty', hist({ state: 'empty', items: [], headerText: null }));
  add('history', 'offline', hist({ state: 'offline' }));
  add('history', 'error', hist({ state: 'error' }));

  const deck = questions(6, false).map((q, i) => ({ k: q.k, top: q.top, bottom: q.bottom, answerLabel: ['更短', '更多', '更晚', '更小', '更短', '更重'][i], mine: i === 4 ? 'miss' : i === 5 ? 'unanswered' : 'correct' }));
  const issue = (o) => ({ mod: 'issue', vm: Object.assign({ state: 'ready', dateKey: '20261014', issueNo: 11, dateText: '10月14日', themeLabel: '山河', mine: { streak: 4, missK: 5 }, stats: { totalText: '本期 2,315 人参加', buckets: [{ label: '0-4', shareText: '31%' }, { label: '5-9', shareText: '42%' }, { label: '10-14', shareText: '19%' }, { label: '15-19', shareText: '6%' }, { label: '20+', shareText: '2%' }] }, deck, deckLockedText: null, errata: [{ k: 3, text: '该数据已更正为 1056 年' }], t: 100 }, o) });
  add('issue', 'ready', issue({}));
  add('issue', 'locked', issue({ deck: null, deckLockedText: '今日一比结束后公布题目', mine: null, stats: null, errata: [] }));
  add('issue', 'loading', issue({ state: 'loading' }));
  add('issue', 'offline', issue({ state: 'offline' }));

  add('sources', 'page', { mod: 'sources', vm: { sources: SOURCES_LINES } });

  // -------------------------------------------------------- shareCard
  const marks14 = new Array(14).fill(true).concat([false]);
  add('shareCard', 'daily', { vm: { mode: 'daily', issueNo: 12, themeLabel: '山河', streak: 14, marks: marks14, rarityText: '超过今日 82% 的玩家' } });
  add('shareCard', 'daily_norarity', { vm: { mode: 'daily', issueNo: 12, themeLabel: '山河', streak: 3, marks: [true, true, true, false], rarityText: null } });
  add('shareCard', 'daily_cleared', { vm: { mode: 'daily', issueNo: 12, themeLabel: '山河', streak: 40, cleared: true, marks: new Array(40).fill(true), rarityText: '超过今日 99% 的玩家' } });
  add('shareCard', 'free', { vm: { mode: 'free', streak: 8, marks: new Array(8).fill(true).concat([false]), hook: { topLabel: '黄河', bottomLabel: '长江', subLabel: '全长' } } });
  add('shareCard', 'free_longnames', { vm: { mode: 'free', streak: 21, marks: new Array(21).fill(true).concat([false]), hook: { topLabel: '内蒙古自治区鄂尔多斯市', bottomLabel: '新疆维吾尔自治区', subLabel: '常住人口（2020）' } } });
  add('shareCard', 'challenge', { vm: { mode: 'challenge', issueNo: 12, streak: 16, marks: new Array(16).fill(true).concat([false]), ownerStreak: 14 } });
  add('shareCard', 'zero', { vm: { mode: 'free', streak: 0, marks: [false], hook: { topLabel: '成都市', bottomLabel: '重庆市', subLabel: '常住人口（2020）' } } });
  add('shareCard', 'saved', { vm: { mode: 'daily', issueNo: 12, themeLabel: '山河', streak: 14, marks: marks14, rarityText: '超过今日 82% 的玩家' }, opts: { saved: true } });

  void boardRows;
  void noReport;
  return fx;
}

module.exports = { buildFixtures, face, hidden };
