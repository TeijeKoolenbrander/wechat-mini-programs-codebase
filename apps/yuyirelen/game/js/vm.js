/**
 * View models (spec 13). Pure functions: the controller passes plain state in, the renderers
 * (frontend-ui) draw what comes out. ALL strings are pre-formatted here; renderers only own
 * fixed chrome (button shapes, section headings the spec lists as fixed copy).
 *
 * Extras beyond spec 13 (additive, documented in js/HOOKS.md): `display`, `sheet`, `t`,
 * `primary`/`secondary` on home, `pending` on a Row, `chipsTitle`, `stepsLabel`, `menu` on play.
 */

const P = require('../core/play');
const { rankLabel, formatCount } = require('../core/temp');
const { hintStatus, atBest } = require('../core/hints');
const { puzzleTitle, dateLabel } = require('../core/schedule');

const HOWTO = {
  lines: ['今天全国猜同一个秘密词。', '每猜一个词，告诉你它离答案第几近：第 1 名就是答案。越红越近，越蓝越远。', '点联想词或自己输入；卡住了就用提示。'],
  note: '每个提示也算一步。只能猜常用词，人名地名不算。',
  /** the picture: a three-row mini ladder */
  picture: [
    { band: 'cold', bandLabel: '冷' },
    { band: 'hot', bandLabel: '热' },
    { band: 'hit', bandLabel: '命中' },
  ],
};

function displayOf(d) {
  return { largeText: !!(d && d.largeText), highContrast: !!(d && d.highContrast) };
}

// ------------------------------------------------------------------ home

function homeDaily(d) {
  const base = { state: d.state, issueNo: d.issueNo || 0, dateKey: d.dateKey || '', puzzleId: d.puzzleId || '', steps: d.steps, best: d.best };
  if (d.best) base.bestLabel = '最近' + rankLabel(d.best);
  base.title = '今日一词' + (d.issueNo ? ' · 第 ' + d.issueNo + ' 期' : '');
  base.secondary = null;
  base.footnote = null;
  switch (d.state) {
    case 'loading':
      base.sub = '正在取今日一词…';
      base.primary = { id: 'home:daily', label: '开始猜', disabled: true };
      break;
    case 'available':
      base.sub = '全国同一个词，第 1 名就是答案';
      base.primary = { id: 'home:daily', label: '开始猜', disabled: false };
      break;
    case 'inProgress':
      base.sub = '已猜 ' + d.steps + ' 步' + (d.best ? ' · ' + base.bestLabel : '');
      base.primary = { id: 'home:daily', label: '继续猜', disabled: false };
      break;
    case 'solved':
      base.sub = '今日 ' + d.steps + ' 步猜中';
      base.primary = { id: 'home:daily', label: '查看答案', disabled: false };
      base.secondary = { id: 'home:next', label: '再来一题' };
      base.footnote = '明日 0:00 换新词';
      break;
    case 'gaveup':
      base.sub = '今日未猜中';
      base.primary = { id: 'home:daily', label: '查看答案', disabled: false };
      base.secondary = { id: 'home:next', label: '再来一题' };
      base.footnote = '明日 0:00 换新词';
      break;
    case 'unavailable':
      base.sub = '今日一词暂未发布';
      base.primary = { id: 'home:practice', label: '练习一题', disabled: false };
      break;
    default:
      base.state = d.state === 'error' ? 'error' : 'offline';
      base.sub = '今日一词需联网获取';
      base.primary = { id: 'home:retry', label: '重试', disabled: false };
  }
  return base;
}

function homeVm(daily, x) {
  const st = x.streak || { current: 0, best: 0 };
  return {
    daily: homeDaily(daily),
    streak: { current: st.current, best: st.best, show: st.current >= 2, label: st.current >= 2 ? '连续猜中 ' + st.current + ' 天' : '' },
    hasGroupContext: !!x.hasGroupContext,
    groupLine: x.hasGroupContext ? '来自群聊 · 查看本群今日战况' : null,
    muted: !!x.muted,
    showHowToOnce: !!x.showHowToOnce,
    settings: { largeText: !!x.display.largeText, highContrast: !!x.display.highContrast, friendBoardEnabled: !!x.friendBoardEnabled },
    sheet: x.sheet || null,
    howto: HOWTO,
    display: displayOf(x.display),
    t: x.t || 0,
  };
}

// ------------------------------------------------------------------ play

function playVm(s) {
  const guesses = s.guesses;
  const steps = guesses.length;
  const hs = hintStatus(s.cfg, steps, s.hintsUsed);
  const hint = { next: hs.next, state: hs.state, label: hs.label };
  if (hs.state === 'available' && s.cfg.hints.kinds[hs.next - 1] === 'word' && atBest(P.bestRank(guesses))) {
    hint.state = 'atBest';
    hint.label = '已经只差一步了';
  }
  let latest = null;
  if (s.pending) {
    latest = { word: s.pending.word, rank: null, rankLabel: '', temp: 0, band: 'cold', bandLabel: '', isHint: false, isSyn: false, isLatest: true, pending: true };
  } else if (s.latestWord) latest = P.rowFor(guesses, s.latestWord, s.latestWord);
  const ladder = P.ladderRows(guesses, s.latestWord);
  const chipsWord = s.selectedWord || s.latestWord;
  const adVisible = !s.ranked && s.status === 'playing' && (s.state === 'ready' || s.state === 'result');
  const menuOpen = s.sheet === 'menu';
  return {
    puzzleId: s.puzzleId,
    kind: s.kind,
    ranked: s.ranked,
    title: puzzleTitle(s.kind, s.issueNo, s.practiceNo),
    state: s.state,
    steps,
    stepsLabel: '已猜 ' + steps + ' 步',
    hintsUsed: s.hintsUsed.length + s.adHints,
    firstChar: s.firstChar || null,
    firstCharLabel: s.firstChar ? '首字：' + s.firstChar : null,
    warmups: steps === 0 ? s.warmups.slice(0, 6) : [],
    latest,
    ladder,
    selectedWord: s.selectedWord || null,
    chips: s.chips.slice(0, 5),
    chipsTitle: chipsWord && s.chips.length ? '顺着「' + chipsWord + '」想：' : '',
    keyboard: { open: !!s.kb.open, text: s.kb.text, suggestions: s.kb.suggestions.slice(0, 6), heightPx: s.kb.heightPx },
    hint,
    adHint: { visible: adVisible, left: Math.max(0, s.cfg.hints.adMaxPerPuzzle - s.adHints), busy: !!s.adBusy },
    toast: s.toast || null,
    banner: s.banner || null,
    coach: s.coach || 0,
    flashWord: s.flashWord || null,
    ladderScroll: s.ladderScroll || 0,
    pendingError: s.state === 'offline' ? '网络开小差了' : null,
    sheet: s.sheet || null,
    menu: menuOpen ? { items: [{ id: 'menu:giveup', label: '放弃' }, { id: 'menu:howto', label: '玩法' }] } : null,
    howto: s.sheet === 'howto' ? HOWTO : null,
    display: displayOf(s.display),
    t: s.t || 0,
  };
}

// ------------------------------------------------------------------ reveal

function revealTitle(kind, issueNo, practiceNo) {
  if (kind === 'practice') return '练习 #' + practiceNo;
  if (kind === 'archive') return '往期 · 第 ' + issueNo + ' 期';
  return '今日一词 · 第 ' + issueNo + ' 期';
}

function revealVm(s) {
  const guesses = s.guesses;
  const steps = guesses.length;
  const hints = s.hintsUsed.length + s.adHints;
  const best = P.bestRank(guesses);
  const solved = s.outcome === 'solved';
  const st = s.stats;
  const stats = { show: false };
  if (st && st.finishers >= 30) {
    stats.show = true;
    const whose = s.kind === 'daily' ? '今日' : '本期';
    stats.line1 = whose + ' ' + formatCount(st.finishers) + ' 人猜中 · 中位数 ' + st.medianSteps + ' 步';
    if (s.ranked && solved && st.pctBetter !== null && st.pctBetter !== undefined) stats.line2 = '你比 ' + st.pctBetter + '% 的人少用了步数';
  }
  const streakOn = s.ranked && solved && s.kind === 'daily' && s.streak && s.streak.current >= 2;
  let compare = null;
  if (s.compare) {
    const c = s.compare;
    compare = {
      mySteps: steps,
      theirSteps: c.theirSteps,
      theirStatus: c.theirStatus,
      theirTemps: c.theirTemps,
      line: '你 ' + steps + ' 步 · TA ' + c.theirSteps + ' 步',
    };
    if (c.theirWords) compare.theirWords = c.theirWords;
  }
  return {
    puzzleId: s.puzzleId,
    kind: s.kind,
    ranked: s.ranked,
    title: revealTitle(s.kind, s.issueNo, s.practiceNo),
    answer: s.answer,
    answerLabel: solved ? '' : '答案',
    outcome: s.outcome,
    summary: P.summaryLine(s.outcome, steps, hints, best),
    temps: P.stepTemps(guesses),
    bands: P.stepBands(guesses),
    stats,
    streak: { show: !!streakOn, label: streakOn ? '连续猜中 ' + s.streak.current + ' 天' : '' },
    top: { state: s.top.state, items: s.top.items, errorText: s.top.state === 'error' ? '列表暂时打不开' : null, hidden: !!s.top.hidden },
    compare,
    canShare: true,
    nextLabel: '再来一题',
    nextEnabled: !s.nextBusy,
    sheet: s.sheet || null,
    scrollY: s.scrollY || 0,
    display: displayOf(s.display),
    t: s.t || 0,
  };
}

// ------------------------------------------------------------------ challenge entry

function challengeVm(c, display, t) {
  const out = {
    state: c.status,
    puzzleId: c.puzzleId || '',
    kind: c.kind || 'daily',
    issueLabel: '',
    owner: c.owner || { status: 'solved', steps: 0, hints: 0, temps: [] },
    countsAsToday: !!c.countsAsToday,
    alreadyFinished: !!c.alreadyFinished,
    headline: '',
    note: '',
    primaryLabel: '我来猜',
    secondaryLabel: '先去首页看看',
    display: displayOf(display),
    t: t || 0,
  };
  if (c.own) out.own = c.own;
  if (c.status === 'ready' || c.status === 'own') {
    out.issueLabel = c.kind === 'practice' ? '练习 #' + c.practiceNo : '第 ' + c.issueNo + ' 期';
    const who = c.status === 'own' ? '你' : '好友';
    out.headline = c.owner.status === 'solved' ? who + '在' + out.issueLabel + '用了 ' + c.owner.steps + ' 步' : who + '在' + out.issueLabel + '没有猜中';
    out.sub = 'TA 的猜词路线在你完成后可见';
    out.note = c.countsAsToday ? '这就是今日一词，计入今日榜单' : '往期题，不计入榜单';
    if (c.status === 'own') {
      out.sub = '这是你分享的成绩';
      out.ownLine = c.own && c.own.finishers > 0 ? '已有 ' + c.own.finishers + ' 位好友完成' + (c.own.bestSteps ? ' · 最少 ' + c.own.bestSteps + ' 步' : '') : '还没有好友完成';
      out.note = '';
    }
  } else if (c.status === 'notFound') {
    out.headline = '这道题找不到了';
    out.primaryLabel = '去首页';
  } else if (c.status === 'offline') {
    out.headline = '需联网展开';
    out.primaryLabel = '重试';
  } else if (c.status === 'loading') {
    out.headline = '正在展开…';
  }
  return out;
}

// ------------------------------------------------------------------ board

function boardVm(b, x) {
  const kind = b.kind;
  const state = b.state;
  const issue = b.issueNo ? ' 第' + b.issueNo + '期' : '';
  const my = b.self;
  let myLine = '';
  if (my) myLine = my.status === 'solved' ? '你今日 ' + my.steps + ' 步猜中' : my.status === 'gaveup' ? '你今日未猜中' : my.status === 'playing' ? '你今日已猜 ' + my.steps + ' 步' : '你今日还没开始';
  const rows = b.rowCount || 0;
  return {
    kind,
    state,
    title: (kind === 'group' ? '本群' : '好友') + ' · 今日一词' + issue,
    footer: rows > 0 ? '已有 ' + rows + ' 人参与 · 成绩经服务器校验' : '成绩经服务器校验',
    mode: b.mode || undefined,
    myLine,
    viewerPlayed: !!(my && my.status !== 'none'),
    bannerVisible: !!(x && x.bannerEnabled) && (state === 'ready' || state === 'empty'),
    canShareToGroup: state === 'noGroup' || state === 'ready' || state === 'empty',
    explainer: state === 'noGroup' ? '在群聊里点开本游戏的分享卡片，就能看到本群战况' : '',
    sharedCanvas: b.sharedCanvas || null,
    display: displayOf(x && x.display),
    t: (x && x.t) || 0,
  };
}

/** The message posted to the open data domain (frontend-ui's opendata/ reads these fields). */
function boardMessage(kind, payload, extra) {
  const { groupid, shareTicket, board, dpr } = extra;
  const msg = {
    type: 'render',
    kind,
    dateKey: payload.dateKey,
    issueNo: payload.issueNo,
    salt: payload.salt,
    selfHash: payload.selfHash,
    mode: payload.mode,
    rows: payload.rows, // [h, st, n, hi, b, s, k?]  st: 1 solved, 2 playing, 3 gave up
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

// ------------------------------------------------------------------ archive

function archiveLine(it) {
  switch (it.status) {
    case 'today':
      return '今日 · ' + (it.my ? (it.my.status === 'solved' ? it.my.steps + '步猜中' : it.my.status === 'gaveup' ? '未猜中' : '进行中 ' + it.my.steps + '步') : '去猜');
    case 'solved':
      return it.answer + ' · ' + it.my.steps + '步';
    case 'gaveup':
      return it.answer + ' · 未猜中';
    case 'playing':
      return '进行中 ' + it.my.steps + '步';
    default:
      return '未玩  去猜';
  }
}

function archiveVm(a, display, t) {
  const items = (a.items || []).map((it) => {
    const isToday = !!it.today;
    const my = it.my || null;
    let status = 'unplayed';
    if (isToday) status = 'today';
    else if (my && my.status === 'solved') status = 'solved';
    else if (my && my.status === 'gaveup') status = 'gaveup';
    else if (my && my.steps > 0) status = 'playing';
    const row = { puzzleId: it.puzzleId, issueNo: it.issueNo, dateLabel: dateLabel(it.dateKey), status, title: '第' + it.issueNo + '期 ' + dateLabel(it.dateKey) };
    if ((status === 'solved' || status === 'gaveup') && it.answer) row.answer = it.answer;
    row.line = archiveLine({ status, answer: row.answer, my });
    return row;
  });
  const pr = a.practice || { done: 0, total: 0 };
  return {
    state: a.state,
    bestStreak: a.bestStreak || 0,
    bestStreakLabel: a.bestStreak ? '最长连续猜中 ' + a.bestStreak + ' 天' : '',
    items,
    hasMore: !!a.hasMore,
    loadingMore: !!a.loadingMore,
    practice: { done: pr.done, total: pr.total, line: '练习题  已完成 ' + pr.done + ' / ' + pr.total, cta: '去练习' },
    emptyText: a.state === 'empty' ? '还没有往期，先去练习吧' : '',
    errorText: a.state === 'error' ? '往期需联网查看' : '',
    scrollY: a.scrollY || 0,
    display: displayOf(display),
    t: t || 0,
  };
}

module.exports = { HOWTO, homeVm, playVm, revealVm, challengeVm, boardVm, boardMessage, archiveVm, revealTitle, displayOf };
