/**
 * View-model builders (spec 10). Pure functions: plain data in, plain data
 * out, so QA can unit-test every screen state without a canvas. All strings
 * are formatted here, never by the renderer. The shapes are the contract with
 * frontend-ui (see js/HOOKS.md for hit ids and screen extras).
 */

const { BY_KEY, CAT_BY_KEY, FREE_GROUPS } = require('../core/measures');
const { promptText: promptOf } = require('../core/question');
const { commentFor, streakText, rarityText: rarityLine, dayStreakText } = require('../core/score');

const HOWTO_LINES = ['1. 上面的卡片告诉你数字。', '2. 猜下面那张比它更多还是更少。', '3. 连对越多越厉害，错一次就结束。今日一比全国同一套题，每天一次。'];

/** 数据来源 page (spec 6.12): one line per publisher, plain text, no links. */
const SOURCES = [
  { publisher: '国家统计局', attribution: '人口数据来源：国家统计局网站及各省（区、市）统计局，第七次全国人口普查公报（https://www.stats.gov.cn）', url: 'https://www.stats.gov.cn' },
  { publisher: '自然资源部、水利部', attribution: '地理数据：自然资源部、水利部公布数据', url: null },
  { publisher: 'NASA', attribution: '天文数据：NASA', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' },
  { publisher: 'USDA FoodData Central', attribution: '食物热量：USDA FoodData Central (CC0)', url: 'https://fdc.nal.usda.gov/' },
  { publisher: 'GeoNames', attribution: '城市坐标：GeoNames (CC BY 4.0)，距离为本游戏计算的直线距离', url: 'https://www.geonames.org/' },
  { publisher: '国家文物局', attribution: '文物年代与高度：国家文物局及各文物保护单位公布资料', url: null },
  { publisher: '各出版方', attribution: '其他：各条目注明的出版物', url: null },
];
const SOURCES_FOOT = '每条数据均标注来源与年份；如发现错误，请在答题后点「数据有误？」';

const REPORT_TITLE = '这条数据有问题？';
const REPORT_THANKS = '已收到，谢谢！我们会核对';

/** " · 山河"; empty when the day has no theme (v1 has none), so no header ends in a dangling dot. */
function themeSuffix(label) {
  return label ? ' · ' + label : '';
}

function displayVm(S) {
  const large = !!S.largeText;
  const hc = !!S.highContrast;
  return { largeText: large, highContrast: hc, scale: large ? 1.25 : 1, palette: hc ? 'highContrast' : 'standard' };
}

/** CardFace (spec 10). `face` is a question.js face, optionally merged with a reveal. */
function faceVm(face, o) {
  const opt = o || {};
  const m = BY_KEY[face.measure];
  const cat = CAT_BY_KEY[m.category];
  return {
    factId: face.factId,
    label: face.label,
    subLabel: face.sub || m.subLabel,
    icon: m.icon,
    accent: cat.accent,
    valueText: face.valueText === undefined ? null : face.valueText,
    unitText: face.unitText,
    approx: !!face.approx,
    sourceText: face.sourceText === undefined ? null : face.sourceText,
    canReport: !!opt.canReport && face.valueText !== undefined,
  };
}

/** A bottom face after its reveal: the hidden face plus the revealed value, source and info. */
function revealedFace(hidden, reveal) {
  return Object.assign({}, hidden, { valueText: reveal.valueText, unitText: reveal.unitText, approx: reveal.approx, sourceText: reveal.sourceText, info: reveal.info, note: reveal.note || null });
}

// ---------------------------------------------------------------- home

/**
 * daily: the controller's home.daily; opts: { free:{categoryKey,categoryLabel,bestText,resumeText}, hasGroupContext,
 * muted, showHowToOnce, friendBoardEnabled, sheet, sheetVm, display, t }
 */
function homeVm(daily, opts) {
  const d = {
    state: daily.state,
    issueNo: daily.issueNo || 0,
    dateKey: daily.dateKey || '',
    themeLabel: daily.themeLabel || '',
    dayStreak: { current: daily.dayCurrent || 0, text: dayStreakText(daily.dayCurrent || 0) },
  };
  if (daily.progressText) d.progressText = daily.progressText;
  if (daily.streak !== undefined) d.streak = daily.streak;
  if (daily.state === 'done') {
    d.rarityText = daily.rarityText || null;
    d.finalizedByWindow = !!daily.finalizedByWindow;
    d.resultText = '今日连对 ' + daily.streak + (daily.rarityShare !== null && daily.rarityShare !== undefined ? ' · ' + rarityLine(daily.rarityShare).replace('超过今日', '超过') : '');
    d.subline = '明日 0:00 换新题';
  }
  return {
    daily: d,
    free: opts.free,
    hasGroupContext: !!opts.hasGroupContext,
    muted: !!opts.muted,
    showHowToOnce: !!opts.showHowToOnce,
    settings: { friendBoardEnabled: !!opts.friendBoardEnabled },
    sheet: opts.sheet || null,
    sheetVm: opts.sheetVm || null,
    display: opts.display,
    t: opts.t || 0,
  };
}

function howtoVm() {
  return { lines: HOWTO_LINES.slice() };
}

function sourcesVm() {
  return { sources: SOURCES.map((s) => ({ publisher: s.publisher, attribution: s.attribution, url: s.url })), footText: SOURCES_FOOT };
}

function settingsVm(S, extra) {
  return { muted: !!S.muted, largeText: !!S.largeText, highContrast: !!S.highContrast, privacy: S.privacy.privacy, friendScope: S.privacy.friendScope, album: extra.album || 'unknown', friendBoardEnabled: !!extra.friendBoardEnabled };
}

/** `minFacts`: categories with fewer free facts are not offered (config.freeGroupMinFacts). 全部 is always there. */
function categoryVm(selected, counts, minFacts) {
  const min = minFacts || 0;
  return { selected, options: FREE_GROUPS.filter((g) => g.key === 'all' || (counts[g.key] || 0) >= min).map((g) => ({ key: g.key, label: g.label, factCount: counts[g.key] || 0 })) };
}

// ---------------------------------------------------------------- play

function headerOf(r, categoryLabel) {
  if (r.mode === 'daily') return '今日一比 · 第' + r.issueNo + '期' + themeSuffix(r.themeLabel);
  if (r.mode === 'challenge') return r.deckKind === 'daily' ? '挑战 · 第' + r.issueNo + '期' + themeSuffix(r.themeLabel) : '挑战 · 随便比比 · ' + categoryLabel;
  return '随便比比 · ' + categoryLabel;
}

/**
 * r: the controller's run context. ui: { revealT, sheet, sheetVm, coach, categoryLabel, display, muted, t }
 * Phases: loading, awaitAnswer, sending, revealing, correct, miss, segmentChange, cleared, netError.
 */
function playVm(r, ui) {
  const q = r.q;
  const revealed = r.phase === 'correct' || r.phase === 'miss' || r.phase === 'cleared';
  const showValue = r.phase === 'revealing' || revealed || r.phase === 'segmentChange';
  const vm = {
    mode: r.mode,
    ranked: !!r.ranked,
    friendly: !!r.friendly,
    headerText: headerOf(r, ui.categoryLabel),
    streak: r.streak,
    k: q ? q.k : r.k,
    deckLength: r.deckLength,
    phase: r.phase,
    top: null,
    bottom: null,
    promptText: '',
    buttons: { hi: { label: '', enabled: false }, lo: { label: '', enabled: false } },
    chosen: r.chosen || null,
    correct: r.phase === 'revealing' || revealed ? r.correct : null,
    segmentBanner: r.phase === 'segmentChange' ? r.banner : null,
    lifeUsed: !!r.lifeUsed,
    coachMark: !!ui.coach,
    revealT: r.phase === 'revealing' ? ui.revealT : revealed ? 1 : 0,
    netError: r.phase === 'netError' ? { text: '网络不太好', retryLabel: '重试' } : null,
    loadingText: r.phase === 'loading' ? (r.mode === 'free' ? '' : '正在出题…') : null,
    sheet: ui.sheet || null,
    sheetVm: ui.sheetVm || null,
    display: ui.display,
    muted: !!ui.muted,
    t: ui.t || 0,
  };
  if (r.challengeInfo) vm.challenge = { ownerStreak: r.challengeInfo.ownerStreak, passedText: r.passed ? '已超过 TA 的 ' + r.challengeInfo.ownerStreak + ' ✓' : null };
  if (q) {
    vm.top = faceVm(q.top, { canReport: true });
    const bottomFace = showValue && r.reveal ? revealedFace(q.bottom, r.reveal) : q.bottom;
    vm.bottom = faceVm(bottomFace, { canReport: revealed });
    vm.bottom.subLabel = q.subLabel;
    vm.top.subLabel = q.topSubLabel;
    vm.promptText = promptOf(q);
    const can = r.phase === 'awaitAnswer';
    vm.buttons = { hi: { label: q.verbs.hi, enabled: can }, lo: { label: q.verbs.lo, enabled: can } };
    if (r.phase === 'revealing' || revealed) vm.verdictText = r.correct ? '对' : '错';
    vm.measureKey = q.measure;
  }
  return vm;
}

function continueSheetVm(r, adState, canOffer) {
  return { visible: true, missText: r.missText || '', adState: adState || 'idle', canOffer: !!canOffer };
}

function sourceSheetVm(face, canReport) {
  const info = face.info || {};
  return {
    factId: face.factId,
    card: face,
    label: face.label,
    valueText: face.valueText,
    unitText: face.unitText,
    subLabel: info.subLabel || '',
    year: info.year,
    yearText: info.year ? String(info.year) : '',
    note: face.note || null,
    publisher: info.publisher || '',
    sourceTitle: info.sourceTitle || '',
    url: info.url || '',
    retrievedAt: info.retrievedAt || '',
    sourceText: face.sourceText,
    canReport: !!canReport,
  };
}

// ---------------------------------------------------------------- report sheet

/** rep: { factId, face, state, selected:{key:true}, alreadyReported } */
function reportVm(rep, reasons) {
  const card = faceVm(rep.face, { canReport: false });
  return {
    factId: rep.factId,
    title: REPORT_TITLE,
    card,
    summaryText: card.label + ' · ' + card.subLabel + ' · ' + card.valueText + ' ' + card.unitText,
    reasons: reasons.map((x) => ({ key: x.key, label: x.label, selected: !!rep.selected[x.key] })),
    state: rep.state,
    alreadyReported: !!rep.alreadyReported,
    submitLabel: rep.alreadyReported ? '更新' : '提交',
    canSubmit: Object.keys(rep.selected).some((k) => rep.selected[k]) && rep.state === 'idle',
  };
}

// ---------------------------------------------------------------- result

/** res: the controller's result object. ui: { sheet, sheetVm, scrollY, display, subscribeState, saveState, t } */
function resultVm(res, ui) {
  const comparable = res.ranked ? null : res.friendly ? '友谊赛，不计入榜单' : null;
  const out = {
    mode: res.mode,
    ranked: !!res.ranked,
    friendly: !!res.friendly,
    status: res.status,
    headerText: res.headerText,
    streak: res.streak,
    streakText: streakText(res.streak, res.lifeUsed),
    cleared: !!res.cleared,
    clearedText: res.cleared ? '全部答对 ' + res.deckLength + ' 题' : null,
    commentText: commentFor(res.streak),
    rarityText: res.rarityShare !== null && res.rarityShare !== undefined ? rarityLine(res.rarityShare) : null,
    dayStreakText: res.dayStreak >= 2 ? dayStreakText(res.dayStreak) : null,
    friendlyText: comparable,
    finalizedNote: res.finalizedByWindow ? '（未答完，按当时连对记入）' : null,
    miss: null,
    questions: (res.questions || []).map((x) => ({
      k: x.k,
      top: faceVm(x.top, { canReport: true }),
      bottom: faceVm(x.bottom, { canReport: true }),
      correct: !!x.correct,
      choiceLabel: x.choiceLabel,
    })),
    saveImage: { state: ui.saveState || 'idle' },
    subscribe: { state: ui.subscribeState || 'hidden', challengeId: ui.subscribeChallengeId || null },
    privacyNote: res.privacyNote ? '未同意隐私指引，好友暂看不到你的成绩' : null,
    interstitialDue: !!res.interstitialDue,
    boardLabel: '看群榜/好友榜',
    againLabel: '再来一局（随便比比）',
    sheet: ui.sheet || null,
    sheetVm: ui.sheetVm || null,
    scrollY: ui.scrollY || 0,
    display: ui.display,
    t: ui.t || 0,
  };
  if (res.miss) {
    out.miss = {
      k: res.miss.k,
      titleText: '倒在第 ' + res.miss.k + ' 题',
      top: faceVm(res.miss.top, { canReport: true }),
      bottom: faceVm(res.miss.bottom, { canReport: true }),
      chosenLabel: '你选：' + res.miss.chosenLabel,
    };
  }
  if (res.challengeCompare) out.challenge = { ownerStreak: res.challengeCompare.ownerStreak, compareText: '你 ' + res.streak + ' · TA ' + res.challengeCompare.ownerStreak + ' · 同一套题' };
  return out;
}

// ---------------------------------------------------------------- challenge entry

function challengeVm(c, ui) {
  const u = ui || {};
  const out = {
    status: c.status,
    ownerStreak: c.ownerStreak || 0,
    kind: c.kind || 'daily',
    countsAsDaily: !!c.countsAsDaily,
    isFriendly: !!c.isFriendly,
    titleText: '好友向你发起了挑战',
    ownerText: '同一套题，TA 连对 ' + (c.ownerStreak || 0) + ' 个',
    rulesText: null,
    display: u.display,
    t: u.t || 0,
  };
  if (c.kind === 'daily') {
    out.issueText = '今日一比 · 第' + c.issueNo + '期' + themeSuffix(c.themeLabel);
    if (c.status === 'ready') {
      if (c.countsAsDaily) out.rulesText = '本局将作为你的今日一比，计入群榜';
      else if (c.pastDeck) out.rulesText = '往期题目 · 友谊赛';
      else out.rulesText = '你已完成今日一比，本局为友谊赛，不计入榜单';
    }
  } else if (c.kind === 'free') {
    out.categoryLabel = c.categoryLabel;
    out.issueText = '随便比比 · 分类：' + c.categoryLabel;
    out.rulesText = '规则相同：每局可看视频再答一次';
  }
  if (c.answerCount !== undefined) out.answerCount = c.answerCount;
  if (c.bestAnswer !== undefined) out.bestAnswer = c.bestAnswer;
  if (c.myStreak !== undefined) out.myStreak = c.myStreak;
  if (c.status === 'own') out.ownText = '这是你发起的挑战';
  if (c.subscribe) out.subscribe = c.subscribe;
  return out;
}

// ---------------------------------------------------------------- boards

function boardVm(b) {
  return {
    kind: b.kind,
    dateKey: b.dateKey,
    issueNo: b.issueNo,
    themeLabel: b.themeLabel || '',
    titleText: (b.kind === 'group' ? '本群 · 今日一比 第' : '好友 · 今日一比 第') + b.issueNo + '期' + themeSuffix(b.themeLabel),
    state: b.state,
    mode: b.mode || null,
    self: { streak: b.selfStreak === undefined ? null : b.selfStreak },
    actions: {
      canOpenSetting: b.state === 'unauthorized',
      canRetryPrivacy: b.state === 'privacyDenied',
      canShareToGroup: b.state === 'noGroup' || b.state === 'empty' || b.state === 'ready',
    },
    banner: { show: !!b.bannerShow, reservedHeight: b.bannerShow ? b.bannerHeight || 0 : 0 },
    sharedCanvas: b.state === 'ready' ? b.sharedCanvas || null : null,
    display: b.display,
    t: b.t || 0,
  };
}

/** Main domain -> open data domain message (spec 10). Rows are [h, n, s, k?]; no answers, no facts. */
function boardMessage(kind, payload, extra) {
  const { shareTicket, groupid, board, dpr, showUnverified } = extra;
  const msg = {
    type: 'render',
    kind,
    dateKey: payload.dateKey,
    issueNo: payload.issueNo,
    contentVersion: payload.contentVersion,
    salt: payload.salt,
    selfHash: payload.selfHash,
    mode: payload.mode,
    rows: payload.rows,
    showUnverified: !!showUnverified,
    width: board.w,
    height: board.h,
    dpr: dpr || 1,
  };
  if (kind === 'group') {
    if (groupid) msg.groupid = groupid;
    else if (shareTicket) msg.shareTicket = shareTicket;
  }
  return msg;
}

// ---------------------------------------------------------------- history

const BUCKETS = [
  { label: '0-4', from: 0, to: 4 },
  { label: '5-9', from: 5, to: 9 },
  { label: '10-14', from: 10, to: 14 },
  { label: '15-19', from: 15, to: 19 },
  { label: '20+', from: 20, to: 1e9 },
];

function dateText(dateKey) {
  return +dateKey.slice(4, 6) + '月' + +dateKey.slice(6, 8) + '日';
}

/** h: { state, items, bestDays, bestDaily } from getHistory */
function historyVm(h, display) {
  const out = { state: h.state, headerText: null, items: [], display };
  if (h.state === 'ready' || h.state === 'empty') {
    out.headerText = '最长连续 ' + (h.bestDays || 0) + ' 天 · 今日一比最佳 ' + (h.bestDaily || 0);
    out.items = (h.items || []).map((it) => ({
      dateKey: it.dateKey,
      issueNo: it.issueNo,
      dateText: dateText(it.dateKey),
      themeLabel: it.themeLabel,
      mineText: it.mine ? '连对 ' + it.mine.n : '未参加',
      isToday: !!it.isToday,
      statusText: it.isToday ? (it.mine ? '今日连对 ' + it.mine.n : it.inProgress ? '进行中' : null) : null,
    }));
  }
  if (h.state === 'empty') out.emptyText = '还没有往期';
  if (h.state === 'offline' || h.state === 'error') out.errorText = '往期需联网查看';
  return out;
}

/** d: { state, dateKey, data (getHistory detail), locked } */
function issueVm(d, display) {
  const out = { state: d.state, dateKey: d.dateKey, issueNo: 0, themeLabel: '', mine: null, stats: null, deck: null, deckLockedText: null, errata: [], display };
  const data = d.data;
  if (!data) return out;
  out.issueNo = data.issue.issueNo;
  out.themeLabel = data.issue.themeLabel;
  out.dateText = dateText(d.dateKey);
  out.titleText = '第' + data.issue.issueNo + '期 · ' + dateText(d.dateKey) + themeSuffix(data.issue.themeLabel);
  if (data.mine) {
    out.mine = { streak: data.mine.streak, missK: data.mine.missK };
    out.mineText = '连对 ' + data.mine.streak + (data.mine.missK ? '（倒在第 ' + data.mine.missK + ' 题）' : '');
  } else out.mineText = '未参加';
  if (data.stats) {
    const total = data.stats.total;
    out.stats = {
      totalText: '本期 ' + total.toLocaleString('en-US') + ' 人参加',
      buckets: BUCKETS.map((b) => {
        let n = 0;
        for (let i = b.from; i <= b.to && i < data.stats.hist.length; i++) n += data.stats.hist[i];
        return { label: b.label, shareText: Math.round((n / total) * 100) + '%' };
      }),
    };
  }
  if (data.deck) {
    out.deck = data.deck.map((row) => ({
      k: row.k,
      top: faceVm(row.a, { canReport: true }),
      bottom: faceVm(row.b, { canReport: true }),
      answerLabel: row.answerLabel,
      mine: row.mine,
    }));
  } else out.deckLockedText = '今日一比结束后公布题目';
  out.errata = (data.errata || []).map((e) => ({ k: e.k, text: e.text }));
  return out;
}

// ---------------------------------------------------------------- share card

/**
 * Share card view model (spec 6.7). Daily: NO fact names or values (marks only).
 * Free: the missed pair's labels and measure, no values. res: the controller's result.
 */
function cardVm(res) {
  const marks = (res.questions || []).map((x) => !!x.correct);
  const base = { mode: res.mode === 'daily' ? 'daily' : 'free', streak: res.streak, marks, cleared: !!res.cleared, rarityText: res.rarityShare !== null && res.rarityShare !== undefined ? rarityLine(res.rarityShare) : null };
  if (res.mode === 'daily') {
    return Object.assign(base, { issueNo: res.issueNo, themeLabel: res.themeLabel, titleText: '比一比 · 今日一比 第' + res.issueNo + '期' + themeSuffix(res.themeLabel), taglineText: '同一套题，你能比我多吗？' });
  }
  const miss = res.miss;
  return Object.assign(base, {
    titleText: '比一比 · 随便比比',
    taglineText: miss ? miss.bottom.label + ' vs ' + miss.top.label + ' · ' + (miss.subLabel || '') + ' · 我选错了' : '',
    pair: miss ? { bottomLabel: miss.bottom.label, topLabel: miss.top.label, subLabel: miss.subLabel || '' } : null,
  });
}

module.exports = {
  themeSuffix, HOWTO_LINES, SOURCES, REPORT_THANKS, REPORT_TITLE, BUCKETS,
  displayVm, faceVm, revealedFace, homeVm, howtoVm, sourcesVm, settingsVm, categoryVm, playVm, continueSheetVm, sourceSheetVm, reportVm, resultVm,
  challengeVm, boardVm, boardMessage, historyVm, issueVm, cardVm, headerOf, dateText,
};
