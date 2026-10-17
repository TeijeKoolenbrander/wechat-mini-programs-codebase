/**
 * Fixture view models for every screen x state (spec 10, CONTRACT). Shared by the PNG preview tool and tests/render.test.js.
 *   buildFixtures({L, display, sharedCanvas}) -> {screen: {state: {vm, overlay?}}}
 * Strings are what logic would send (pre-formatted); the renderer only lays them out.
 */

const CARD = { itemId: 'i1', spectrumId: 's1', left: '冷', right: '热', prompt: '火锅', catLabel: '吃喝' };
const LONG = { itemId: 'i2', spectrumId: 's2', left: '便宜', right: '昂贵', prompt: '周末睡到自然醒', catLabel: '生活习惯' };

const ROWS = [
  { prompt: '火锅', left: '冷', right: '热', you: 92, nation: 88, label: '很同频', scoreText: '+88' },
  { prompt: '一杯奶茶', left: '便宜', right: '昂贵', you: 30, nation: 62, label: '想法独特', scoreText: '+0' },
  { prompt: '周末睡懒觉', left: '浪费', right: '享受', you: 80, nation: 78, label: '心有灵犀', scoreText: '+95' },
  { prompt: '榴莲', left: '难闻', right: '好闻', you: 12, nation: 35, label: '有点偏', scoreText: '+43' },
  { prompt: '洗碗', left: '放松', right: '疲惫', you: 55, nation: 50, label: '差不多', scoreText: '+88' },
];

function hist(seed) {
  const out = [];
  for (let i = 0; i < 21; i++) out.push(Math.round(30 + 70 * Math.exp(-Math.pow((i - (6 + seed * 3)) / 4, 2)) + ((i * 7 + seed) % 9)));
  return out;
}
const HIST = [0, 1, 2, 3, 4].map(hist);
const TERMS_FIX = require('../../js/terms-text').paragraphs; // the same array every call: the renderer caches its wrapping on it

function build(opts) {
  const display = opts.display || { largeText: false, highContrast: false, scale: 1, palette: 'standard' };
  const d = Object.assign({ scale: display.largeText ? 1.25 : 1, palette: display.highContrast ? 'highContrast' : 'standard' }, display);
  const sc = opts.sharedCanvas || null;
  const T = 1234;

  const settings = { muted: false, largeText: !!d.largeText, highContrast: !!d.highContrast, privacy: 'agreed', friendScope: 'granted', aigcNote: '题库内容由 AI 辅助编写，并经人工审核' };
  const homeBase = { display: d, t: T, muted: false, settings, sheet: null, group: { status: 'none', bannerText: null }, features: {}, daily: { state: 'available', issueNo: 12, dateKey: '20261105', answered: 0, scoreText: null, yesterdayText: '昨日定分 421 · 超过全国 68%', streakText: '连续 5 天' } };
  const home = (daily, extra) => ({ vm: Object.assign({}, homeBase, { daily: Object.assign({}, homeBase.daily, daily) }, extra || {}) });

  const cardBase = { display: d, t: T, mode: 'daily', issueNo: 12, index: 2, total: 5, tag: null, card: CARD, phase: 'empty', needle: null, canConfirm: false, reveal: null, primaryLabel: '就这儿', hint: '点一下或拖动，放上指针', coach: false, revealT: 1, confetti: null, submitNote: null, reportSheet: false };
  const reveal = (extra) => Object.assign({ markers: [{ pos: 64, kind: 'you' }, { pos: 60, kind: 'nation' }, { pos: 66, kind: 'group' }, { pos: 55, kind: 'member' }, { pos: 72, kind: 'member' }, { pos: 40, kind: 'member' }], label: '很同频', scoreText: '+88', nationText: '全国 ◆ 在你左边 3 格 · 实时', agreeText: '和全国 63% 的人想法相近', groupText: '本群 4 人 ● 和你一样', bullseye: false }, extra || {});
  const card = (extra) => ({ vm: Object.assign({}, cardBase, extra) });

  const dayBase = { display: d, t: T, revealT: 1, issueNo: 12, final: false, totalText: '412', bandLabel: '默契十足', statusTag: '实时', percentileText: null, rows: ROWS, divisiveText: '今日最有争议：一杯奶茶（便宜↔昂贵）', streakText: '连续 5 天', groupText: '本群群内默契分 388 · 本群默契度 81', bonus: { left: 2, adState: 'idle' }, distribution: { unlocked: false, hist: HIST, adState: 'idle' }, stale: false, sheet: null };
  const day = (extra) => ({ vm: Object.assign({}, dayBase, extra) });

  // typed clue (D-2): the textTab of the create vm, as logic builds it
  const RULE_LINE = '最多 12 个字 · 不写数字、位置和两头的词';
  const textTab = (x) => Object.assign({ state: 'ready', text: '', countText: '0/12', hint: null, reason: null, ruleLine: RULE_LINE, restrictionText: null, sending: false, busyBox: false }, x || {});
  const kbH = opts.L ? Math.round(opts.L.H * 0.42) : 340; // a plausible system keyboard height for this window
  const createBase = { display: d, t: T, step: 'pickSpectrum', spectra: [{ id: 'a', left: '冷', right: '热' }, { id: 'b', left: '便宜', right: '昂贵' }, { id: 'c', left: '好学', right: '难学' }], freeSwapLeft: 1, adSwapLeft: 3, adState: 'idle', clueSwapLeft: 1, roundId: null, targetBand: null, tab: 'text', tabs: ['text', 'preset'], textTab: textTab(), sheet: null, clueMode: 'text', clueOptions: [], clueItemId: null, canShare: false, shareConfirm: false, caret: false, keyboardH: 0 };
  const clueOptions = ['一张电影票', '一把雨伞', '一次理发', '一斤苹果', '一杯咖啡', '一本书'].map((x, i) => ({ itemId: 'c' + i, text: x }));
  const create = (extra) => ({ vm: Object.assign({}, createBase, extra) });
  const clueBase = { step: 'pickClue', roundId: 'ABCD2345', targetBand: { from: 38, to: 42 }, clueOptions, chosen: { left: '便宜', right: '昂贵' } };
  const typed = (x, tt) => Object.assign({}, clueBase, { tab: 'text', clueMode: 'text', textTab: textTab(tt) }, x || {});
  const presetTab = (x) => Object.assign({}, clueBase, { tab: 'preset', clueMode: 'preset' }, x || {});

  const roundBase = { display: d, t: T, revealT: 1, status: 'open', isHost: false, left: '便宜', right: '昂贵', clueMode: 'preset', clueState: 'shown', clueSubText: null, canReport: false, reportSheet: null, clueText: '提示：一张电影票', guessCountText: '已有 3 人作答', canReveal: false, revealHint: '至少 2 人作答后可揭晓', myGuess: null, late: false, reveal: null, subscribe: { state: 'hidden' }, needle: null, phase: 'empty', canConfirm: false, hint: '点一下或拖动，放上指针', sharedCanvas: sc, listScroll: 0, hostBand: null };
  const round = (extra) => ({ vm: Object.assign({}, roundBase, extra) });
  const roundReveal = { target: 40, mqText: '本题默契值 78', markers: [{ pos: 40, kind: 'target' }, { pos: 35, kind: 'member' }, { pos: 44, kind: 'member' }, { pos: 58, kind: 'member' }, { pos: 20, kind: 'late' }, { pos: 47, kind: 'you' }] };

  const groupBase = { display: d, t: T, kind: 'group', state: 'ready', issueNo: 12, mqText: '81', countText: '已完成 6 人', divisiveText: '今日最有争议：一杯奶茶', trend: ['10/09', '10/10', '10/11', '10/12', '10/13', '10/14', '10/15'].map((l, i) => ({ label: l, value: i === 4 ? null : 70 + i * 2 })), rounds: [{ roundId: 'R1', title: '便宜↔昂贵', mqText: '默契 78', statusText: '已揭晓 · 6 人作答' }, { roundId: 'R2', title: '冷↔热', mqText: null, statusText: '进行中 · 2 人作答' }, { roundId: 'R3', title: '好学↔难学', mqText: '默契 64', statusText: '已揭晓 · 4 人作答' }], banner: { show: false, reservedHeight: 0 }, sharedCanvas: sc, scrollY: 0 };
  const group = (extra) => ({ vm: Object.assign({}, groupBase, extra) });
  const friendBase = { display: d, t: T, kind: 'friend', state: 'ready', mode: 'full', issueNo: 12, selfText: null, banner: { show: false, reservedHeight: 0 }, sharedCanvas: sc, scrollY: 0 };
  const friend = (extra) => ({ vm: Object.assign({}, friendBase, extra) });

  const items = [
    { dateKey: '20261104', issueNo: 11, dateText: '11月4日', statusText: '已玩 · 定分 421' },
    { dateKey: '20261103', issueNo: 10, dateText: '11月3日', statusText: '未玩 · 5 张卡' },
    { dateKey: '20261102', issueNo: 9, dateText: '11月2日', statusText: '往期练习 380' },
    { dateKey: '20261101', issueNo: 8, dateText: '11月1日', statusText: '未玩 · 5 张卡' },
    { dateKey: '20261031', issueNo: 7, dateText: '10月31日', statusText: '已玩 · 定分 388' },
    { dateKey: '20261030', issueNo: 6, dateText: '10月30日', statusText: '未玩 · 5 张卡' },
  ];
  const listBase = { display: d, t: T, state: 'ready', bestStreakText: '最长连续 12 天', offlineTag: false, hasMore: true, items, banner: { show: false, reservedHeight: 0 } };
  const archive = (extra) => ({ vm: Object.assign({}, listBase, extra) });
  const reviewBase = { display: d, t: T, revealT: 1, state: 'ready', dateKey: '20261104', issueNo: 11, kind: 'review', rows: ROWS, mine: { totalText: '421', percentileText: '超过全国 68%' }, divisiveText: '当天最有争议：一杯奶茶', distribution: { unlocked: false, hist: HIST, adState: 'idle' }, sheet: null };
  const endBase = { display: d, t: T, revealT: 1, kind: 'end', totalText: '380', bandLabel: '默契不错', rows: ROWS, nextAvailable: true, distribution: { unlocked: false, hist: HIST, adState: 'idle' }, adState: 'idle', sheet: null };

  const fx = {
    home: {
      loading: home({ state: 'loading', yesterdayText: null, streakText: null }),
      available: home({}),
      available_group: home({}, { group: { status: 'ok', bannerText: null } }),
      inProgress: home({ state: 'inProgress', answered: 2 }),
      done: home({ state: 'done', scoreText: '今日默契分 412 · 默契十足 (实时)' }, { group: { status: 'ok', bannerText: null } }),
      pendingSubmit: home({ state: 'pendingSubmit' }),
      error: home({ state: 'error' }),
      offline: home({ state: 'offline' }),
      unavailable: home({ state: 'unavailable' }),
      muted: home({}, { muted: true }),
      howto: home({}, { sheet: 'howto' }),
      rules: home({}, { sheet: 'rules' }),
      settings: home({}, { sheet: 'settings' }),
      settings_scrolled: home({}, { sheet: 'settings', sheetScroll: 9999 }), // scrolled to the end: shows the 发言规则 and 《用户协议》 rows
      settings_off: home({}, { sheet: 'settings', settings: Object.assign({}, settings, { friendScope: 'denied', muted: true }) }),
    },
    card: {
      empty: card({}),
      empty_coach: card({ coach: true }),
      placing: card({ phase: 'placing', needle: 64, canConfirm: true }),
      placing_long: card({ card: LONG, phase: 'placing', needle: 3, canConfirm: true }),
      submitting: card({ phase: 'submitting', needle: 64 }),
      pending: card({ phase: 'pending', needle: 64, submitNote: '网络不稳，答案还没送达', primaryLabel: '重试' }),
      revealed: card({ phase: 'revealed', needle: 64, reveal: reveal(), primaryLabel: '下一张' }),
      revealed_bullseye: card({ phase: 'revealed', needle: 64, reveal: reveal({ bullseye: true, label: '心有灵犀', scoreText: '+97' }), primaryLabel: '看结果', index: 5, confetti: { t: 0.35, seed: 5 } }),
      revealed_solo: card({ phase: 'revealed', needle: 64, reveal: reveal({ agreeText: null, groupText: null, markers: [{ pos: 64, kind: 'you' }, { pos: 60, kind: 'nation' }] }), primaryLabel: '下一张' }),
      revealing: card({ phase: 'revealed', needle: 64, reveal: reveal(), primaryLabel: '下一张', revealT: 0.4 }),
      report: card({ phase: 'revealed', needle: 64, reveal: reveal(), primaryLabel: '下一张', reportSheet: true }),
      archive: card({ mode: 'archive', phase: 'placing', needle: 20, canConfirm: true }),
      bonus: card({ mode: 'bonus', index: null, total: null, tag: '加一题 · 不计分', phase: 'placing', needle: 50, canConfirm: true }),
    },
    result: {
      live: day({}),
      final: day({ final: true, statusTag: '定分', percentileText: '超过全国 68%' }),
      stale: day({ stale: true }),
      solo: day({ groupText: null, streakText: null, divisiveText: null }),
      bonus_spent: day({ bonus: { left: 0, adState: 'idle' } }),
      bonus_loading: day({ bonus: { left: 2, adState: 'loading' } }),
      bonus_error: day({ bonus: { left: 2, adState: 'error' } }),
      dist_unlocked: day({ distribution: { unlocked: true, hist: HIST, adState: 'idle' } }),
      distribution: day({ sheet: 'distribution', distribution: { unlocked: true, hist: HIST, adState: 'idle' } }),
    },
    create: {
      pick_free: create({}),
      pick_ad: create({ freeSwapLeft: 0, adSwapLeft: 2 }),
      pick_ad_loading: create({ freeSwapLeft: 0, adSwapLeft: 2, adState: 'loading' }),
      pick_ad_error: create({ freeSwapLeft: 0, adSwapLeft: 2, adState: 'error' }),
      pick_spent: create({ freeSwapLeft: 0, adSwapLeft: 0 }),
      creating: create({ step: 'creating' }),
      clue_text_empty: create(typed()),
      clue_text_typed: create(typed({ canShare: true }, { text: '冬天的被窝', countText: '5/12' })),
      clue_text_hint: create(typed({}, { text: '左边一点', countText: '4/12', hint: '别直接说位置，换个说法吧', reason: 'position' })),
      clue_text_endlabel: create(typed({}, { text: '很贵', countText: '2/12', hint: '别用刻度两头的词（便宜、昂贵）', reason: 'endLabel' })),
      clue_text_sending: create(typed({ canShare: true }, { text: '冬天的被窝', countText: '5/12', sending: true })),
      clue_text_busy: create(typed({ canShare: true }, { text: '冬天的被窝', countText: '5/12', busyBox: true, reason: 'busy' })),
      clue_text_blocked: create(typed({}, { text: '冬天的被窝', countText: '5/12', hint: '这个提示没通过审核，换个说法吧', reason: 'moderation' })),
      clue_text_confirm: create(typed({ canShare: true, shareConfirm: true }, { text: '冬天的被窝', countText: '5/12' })),
      clue_text_restricted: create(typed({ tab: 'text' }, { state: 'restricted', restrictionText: '你暂时不能自己写提示（至 10月17日 14:00）。原因：多次写的提示未通过审核。如有疑问，请在「设置 · 联系我们」反馈。可以先选一个提示词。' })),
      clue_kb_empty: create(typed({ keyboardH: kbH, caret: true })),
      clue_kb_typed: create(typed({ keyboardH: kbH, canShare: true, caret: true }, { text: '冬天的被窝', countText: '5/12' })),
      clue_kb_hint: create(typed({ keyboardH: kbH }, { text: '左边一点', countText: '4/12', hint: '别直接说位置，换个说法吧', reason: 'position' })),
      clue_kb_long: create(typed({ keyboardH: kbH, canShare: true }, { text: '外婆家的饭好香好香啊', countText: '10/12' })),
      clue_kb_unknown: create(Object.assign(typed({ canShare: true }, { text: '冬天的被窝', countText: '5/12' }), { keyboardH: undefined })),
      clue_rules: create(typed({ sheet: 'rules' })),
      clue_rules_end: create(typed({ sheet: 'rules', sheetScroll: 9999 })),
      clue_rules_readonly: create(typed({ sheet: 'rulesReadOnly' })),
      clue_warn: create(typed({ sheet: 'warn' })),
      clue_preset: create(presetTab()),
      clue_picked: create(presetTab({ clueItemId: 'c1', canShare: true })),
      clue_preset_spent: create(presetTab({ clueSwapLeft: 0, clueItemId: 'c1', canShare: true })),
      clue_paused: create(presetTab({ tabs: ['preset'], textTab: textTab({ state: 'paused' }) })),
      sharing: create({ step: 'sharing' }),
      error: create({ step: 'error' }),
      rateLimited: create({ step: 'rateLimited' }),
    },
    round: {
      loading: round({ status: 'loading' }),
      open_empty: round({}),
      open_placing: round({ phase: 'placing', needle: 41, canConfirm: true }),
      open_chat_clue: round({ clueText: '提示在群聊里，看看 TA 怎么说', phase: 'placing', needle: 90, canConfirm: true }),
      open_submitting: round({ phase: 'submitting', needle: 41 }),
      submitted_offer: round({ status: 'submitted', guessCountText: '已提交 · 已有 5 人作答 · 等待揭晓', revealHint: '主持人揭晓，或第 8 人作答、24 小时后自动揭晓', subscribe: { state: 'offer' } }),
      submitted_granted: round({ status: 'submitted', guessCountText: '已提交 · 已有 5 人作答 · 等待揭晓', revealHint: '主持人揭晓，或第 8 人作答、24 小时后自动揭晓', subscribe: { state: 'granted' } }),
      submitted_none: round({ status: 'submitted', guessCountText: '已提交 · 已有 5 人作答 · 等待揭晓', revealHint: '主持人揭晓，或第 8 人作答、24 小时后自动揭晓', subscribe: { state: 'declined' } }),
      host_wait: round({ status: 'hostWaiting', isHost: true, hostBand: { from: 38, to: 42 }, guessCountText: '已有 1 人作答', canReveal: false, revealHint: '至少 2 人作答后可揭晓', subscribe: { state: 'offer' } }),
      host_ready: round({ status: 'hostWaiting', isHost: true, hostBand: { from: 38, to: 42 }, guessCountText: '已有 5 人作答', canReveal: true, revealHint: '第 8 人作答或 24 小时后自动揭晓', subscribe: { state: 'requesting' } }),
      unplayed: round({ status: 'revealedUnplayed' }),
      revealed: round({ status: 'revealed', reveal: roundReveal }),
      revealed_host: round({ status: 'revealed', isHost: true, reveal: Object.assign({}, roundReveal, { markers: roundReveal.markers.slice(0, 5) }) }),
      clue_typed: round({ clueText: '提示：「冬天的被窝」', clueMode: 'text', clueState: 'shown', canReport: true, phase: 'placing', needle: 41, canConfirm: true }),
      clue_typed_long: round({ clueText: '提示：「外婆家的饭好香好香啊」', clueMode: 'text', clueState: 'shown', canReport: true }),
      clue_hidden: round({ clueText: '提示已被举报隐藏', clueMode: 'text', clueState: 'hidden', clueSubText: '凭感觉猜一猜，或回群里问问出题人' }),
      clue_hidden_host: round({ status: 'hostWaiting', isHost: true, hostBand: { from: 38, to: 42 }, clueText: '你的提示被举报隐藏了，群友仍可继续猜', clueMode: 'text', clueState: 'hidden', guessCountText: '已有 1 人作答', revealHint: '至少 2 人作答后可揭晓' }),
      clue_paused: round({ clueText: '提示暂不显示', clueMode: 'text', clueState: 'paused', clueSubText: '凭感觉猜一猜，或回群里问问出题人' }),
      clue_host_typed: round({ status: 'hostWaiting', isHost: true, hostBand: { from: 38, to: 42 }, clueText: '提示：「冬天的被窝」', clueMode: 'text', clueState: 'shown', guessCountText: '已有 5 人作答', canReveal: true, revealHint: '第 8 人作答或 24 小时后自动揭晓' }),
      clue_reveal_typed: round({ status: 'revealed', clueText: '提示：「冬天的被窝」', clueMode: 'text', clueState: 'shown', canReport: true, reveal: roundReveal }),
      report_sheet: round({ clueText: '提示：「冬天的被窝」', clueMode: 'text', clueState: 'shown', canReport: true, reportSheet: { reasons: ['porn', 'politics', 'abuse', 'ads', 'other'], sending: false, selected: 'abuse' } }),
      report_sending: round({ clueText: '提示：「冬天的被窝」', clueMode: 'text', clueState: 'shown', canReport: true, reportSheet: { reasons: ['porn', 'politics', 'abuse', 'ads', 'other'], sending: true, selected: 'abuse' } }),
      expired: round({ status: 'expired' }),
      noGuesses: round({ status: 'noGuesses', isHost: true }),
      notFound: round({ status: 'notFound' }),
      offline: round({ status: 'offline' }),
    },
    group: {
      noGroup: group({ state: 'noGroup', mqText: null, trend: [], rounds: [] }),
      checkingGroup: group({ state: 'checkingGroup' }),
      groupFailed: group({ state: 'groupFailed' }),
      loading: group({ state: 'loading' }),
      notPlayed: group({ state: 'notPlayed', mqText: null, countText: '本群已完成 6 人' }),
      ready: group({}),
      ready_banner: group({ banner: { show: true, reservedHeight: 60, stub: true } }),
      small: group({ state: 'small', mqText: null, countText: '本群已完成 2 人' }),
      empty: group({ state: 'empty', mqText: null, countText: null, banner: { show: true, reservedHeight: 60, stub: true } }),
      serverError: group({ state: 'serverError' }),
      privacyDenied: group({ state: 'privacyDenied' }),
      unauthorized: group({ state: 'unauthorized' }),
      friend_loading: friend({ state: 'loading' }),
      friend_ready: friend({}),
      friend_selfOnly: friend({ mode: 'selfOnly', selfText: '你的今日默契分 412（已校验）' }),
      friend_empty: friend({ state: 'empty' }),
      friend_serverError: friend({ state: 'serverError' }),
      friend_privacyDenied: friend({ state: 'privacyDenied' }),
      friend_unauthorized: friend({ state: 'unauthorized' }),
    },
    terms: {
      top: { vm: { display: d, t: T, title: '群友刻度盘用户协议', scrollY: 0, paragraphs: TERMS_FIX } },
    },
    archive: {
      list_loading: archive({ state: 'loading', items: [] }),
      list_ready: archive({}),
      list_banner: archive({ banner: { show: true, reservedHeight: 60, stub: true } }),
      list_empty: archive({ state: 'empty', items: [], bestStreakText: null, hasMore: false }),
      list_error: archive({ state: 'error', items: [] }),
      list_offline_cached: archive({ state: 'offline', offlineTag: true }),
      review: { vm: reviewBase },
      review_loading: { vm: Object.assign({}, reviewBase, { state: 'loading' }) },
      review_error: { vm: Object.assign({}, reviewBase, { state: 'error' }) },
      review_distribution: { vm: Object.assign({}, reviewBase, { sheet: 'distribution', distribution: { unlocked: true, hist: HIST, adState: 'idle' } }) },
      end: { vm: endBase },
      end_last: { vm: Object.assign({}, endBase, { nextAvailable: false }) },
    },
    overlay: {
      dialog: { vm: {}, overlay: { display: d, dialog: { title: '确认离开？', text: '这一期还没有做完，下次可以继续。', confirmLabel: '离开', cancelLabel: '留下' } } },
      toast: { vm: {}, overlay: { display: d, toast: { text: '这一期已经结束，可以去往期里玩' } } },
      adStub: { vm: {}, overlay: { display: d, adStub: { kind: 'rewarded', secondsLeft: 3 } } },
      privacy: { vm: {}, overlay: { display: d, privacy: {} } },
    },
  };

  const shareCard = {
    daily: { issueNo: 12, rows: ROWS.map((r) => ({ prompt: r.prompt, left: r.left, right: r.right, label: r.label })), totalText: '412', band: '默契十足', tagline: '你会把指针放在哪？' },
    round: { left: '便宜', right: '昂贵', clueLine: '提示：一张电影票', tagline: '群友出了一道刻度题' },
    round_chat: { left: '便宜', right: '昂贵', clueLine: '提示在群聊里', tagline: '群友出了一道刻度题' },
    round_typed: { left: '便宜', right: '昂贵', clueLine: '提示在题目里，点开看看', tagline: '群友出了一道刻度题' },
    reveal: { left: '便宜', right: '昂贵', target: 40, guesses: [35, 44, 58, 20, 47, 40], mqText: '本题默契值 78 · 6 人作答' },
    group: { title: '本群今日默契度 81' },
    group_plain: { title: '本群今日刻度' },
  };
  return { fx, shareCard, CARD };
}

/**
 * Open data fixtures: match.buildModel inputs for each view, so the lists are drawn from the real data model.
 * Returns [{name, msg, kv}] where msg is the postMessage payload (width/height filled by the caller) and kv the storage rows.
 */
function opendataFixtures() {
  const { rowHash } = require('../../opendata/match');
  const salt = 'saltsalt';
  const ids = ['u_me', 'u_a', 'u_b', 'u_c', 'u_d', 'u_e'];
  const h = (i) => rowHash(ids[i], salt);
  const names = ['我自己', '张三', '李四', '王五', '赵六', '一个特别特别长的昵称名字'];
  const kv = (idx) => idx.map((i) => ({ openid: ids[i], nickname: names[i], avatarUrl: '', KVDataList: [{ key: 'kd', value: '{"d":"20261105","s":400}' }] }));
  const posS = (a) => a.join(',');
  const refs = [88, 62, 78, 35, 50];
  const groupRows = [
    [h(1), 455, 430, 100, posS([90, 60, 80, 30, 52]), 5],
    [h(0), 412, 401, 300, posS([92, 30, 80, 12, 55]), 0],
    [h(2), 380, 380, 500, posS([70, 65, 70, 40, 45]), 2],
    [h(3), 355, 360, 700, null, null],
    [rowHash('nobody1', salt), 300, 350, 800, null, null],
    [rowHash('nobody2', salt), 280, 340, 900, null, null],
    [rowHash('nobody3', salt), 250, 300, 950, null, null],
  ];
  const friendRows = [
    [h(1), 430, 100, posS([90, 60, 80, 30, 52]), 5],
    [h(0), 401, 300, posS([92, 30, 80, 12, 55]), 0],
    [h(2), 380, 500, posS([70, 65, 70, 40, 45]), null],
    [h(4), 360, 700, null, null],
  ];
  const roundRows = [
    [rowHash('host', salt), null, null, 0, 1],
    [h(1), 41, 98, 0, 0],
    [h(0), 47, 83, 0, 0],
    [h(2), 58, 55, 0, 0],
    [rowHash('nobody1', salt), 20, 50, 1, 0],
    [h(3), 35, 88, 0, 0],
  ];
  const base = { type: 'render', salt, selfHash: h(0), viewerDone: true, dateKey: '20261105' };
  return [
    { name: 'group', msg: Object.assign({}, base, { view: 'group', rows: groupRows }), kv: kv([0, 1, 2, 3]) },
    { name: 'group_anon', msg: Object.assign({}, base, { view: 'group', rows: groupRows }), kv: [] },
    { name: 'friend', msg: Object.assign({}, base, { view: 'friend', rows: friendRows, refs }), kv: kv([0, 1, 2, 4]) },
    { name: 'friend_selfOnly', msg: Object.assign({}, base, { view: 'friend', mode: 'selfOnly', rows: friendRows.slice(1, 2), refs }), kv: kv([0, 1, 2]) },
    { name: 'round', msg: Object.assign({}, base, { view: 'round', rows: roundRows, target: 40, closestH: h(1) }), kv: kv([0, 1, 2, 3]) },
    { name: 'round_anon', msg: Object.assign({}, base, { view: 'round', rows: roundRows, target: 40, closestH: h(1) }), kv: [] },
  ];
}

module.exports = { buildFixtures: build, opendataFixtures, ROWS, CARD };
