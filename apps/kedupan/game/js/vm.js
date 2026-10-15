/**
 * View-model builders (spec 10). Pure functions: logic formats every string here, renderers only draw.
 * Field names and shapes follow spec 10 exactly; fields marked "extra" are additions renderers may use
 * (documented in js/README.md) and can ignore.
 */

const S = require('../core/score');
const { dateText, dateShort } = require('./util');

const PRIMARY = { confirm: '就这儿', next: '下一张', result: '看结果', retry: '重试' };
const HINT_EMPTY = '点一下或拖动，放上指针';

// ------------------------------------------------------------------ shared

function displayVm(st) {
  const large = !!(st && st.largeText);
  const hc = !!(st && st.highContrast);
  return { largeText: large, highContrast: hc, scale: large ? 1.25 : 1, palette: hc ? 'highContrast' : 'standard' };
}

function featuresVm(f) {
  const x = f || {};
  return {
    subscribe: x.subscribe && x.subscribe.tmplId ? { tmplId: x.subscribe.tmplId } : null,
    banner: x.banner ? { enabled: !!x.banner.enabled, adUnitId: x.banner.adUnitId || null } : { enabled: false, adUnitId: null },
    interstitial: x.interstitial || { enabled: true, everyNSets: 2, minLifetimeSets: 3, minGapSec: 120, maxPerDay: 6 },
  };
}

/** A marker on a ruler (spec 10): pos 0-100 (may be .5). */
function marker(pos, kind) {
  return { pos, kind };
}

function sideText(diff) {
  // diff = reference - you, in steps; negative means the reference is on your left
  const n = Math.round(diff);
  if (n === 0) return null;
  return (n < 0 ? '左边 ' : '右边 ') + Math.abs(n) + ' 格';
}

// ------------------------------------------------------------------ card reveal (6.3)

/**
 * m = { pos, ref, n, agreePct, group:{median, n, dots}|null, mode:'daily'|'archive'|'bonus', live:boolean }
 * -> the spec's `reveal` object.
 */
function revealVm(m) {
  const d = Math.abs(m.pos - m.ref);
  const label = S.labelFor(d);
  const markers = [];
  if (m.group && m.group.dots) m.group.dots.forEach((p) => markers.push(marker(p, 'member')));
  if (m.group && m.group.median !== null && m.group.median !== undefined) markers.push(marker(m.group.median, 'group'));
  markers.push(marker(m.ref, 'nation'));
  markers.push(marker(m.pos, 'you'));
  const side = sideText(m.ref - m.pos);
  const few = m.mode === 'daily' && m.n < 30;
  const nationName = few ? '全国（样本少）' : '全国';
  const tag = m.live ? ' · 实时' : ' · 定分';
  const nationText = nationName + ' ◆ ' + (side ? '在你' + side : '和你在同一格') + tag;
  let groupText = null;
  if (m.group && m.group.n >= 1 && m.group.median !== null && m.group.median !== undefined) {
    const gs = sideText(m.group.median - m.pos);
    groupText = '本群 ' + m.group.n + ' 人 ● ' + (Math.abs(m.group.median - m.pos) <= 2 ? '和你一样' : '在你' + gs);
  }
  return {
    markers,
    label: label.label,
    scoreText: '+' + S.cardScore(d),
    nationText,
    agreeText: m.agreePct === null || m.agreePct === undefined ? null : '和全国 ' + m.agreePct + '% 的人想法相近',
    groupText,
    bullseye: d <= 2,
  };
}

/**
 * Card play (spec 10 "Card play"). m = { mode, index, total, tag, card, phase, needle, reveal, isLast, headerText,
 * touches, coach, sheet, pendingText, errorText }
 */
function cardVm(m, display, features) {
  const phase = m.phase;
  let primaryLabel = PRIMARY.confirm;
  if (phase === 'revealed') primaryLabel = m.isLast ? PRIMARY.result : PRIMARY.next;
  else if (phase === 'pending') primaryLabel = PRIMARY.retry;
  return {
    mode: m.mode,
    index: m.index,
    total: m.total,
    tag: m.tag || null,
    card: m.card,
    phase,
    needle: m.needle === undefined ? null : m.needle,
    canConfirm: (phase === 'placing' && m.needle !== null) || phase === 'revealed' || phase === 'pending',
    reveal: m.reveal || null,
    primaryLabel,
    display,
    features,
    // extras
    headerText: m.headerText || '',
    progressText: m.index ? m.index + ' / ' + m.total : '',
    hint: phase === 'empty' ? HINT_EMPTY : null,
    coach: !!m.coach,
    sheet: m.sheet || null,
    pendingText: phase === 'pending' ? m.pendingText || '网络不稳，答案还没送达' : null,
    canReport: phase === 'revealed' && m.canReport !== false,
    ends: { left: m.card.left, right: m.card.right },
  };
}

// ------------------------------------------------------------------ home (6.1)

const BAND_TEXT = (total) => S.bandFor(total).label;

/**
 * h = { state, issueNo, dateKey, answered, total (when done), final, yesterday:{total,pct}|null, streak:{current}, group:{status, ...},
 *       muted, showHowToOnce, sheet, settings, t }
 */
function homeVm(h, display, features) {
  const done = h.state === 'done';
  const yesterdayText = h.yesterday ? '昨日定分 ' + h.yesterday.total + (h.yesterday.pct !== null && h.yesterday.pct !== undefined ? ' · 超过全国 ' + h.yesterday.pct + '%' : '') : null;
  const streak = h.streak && h.streak.current >= 2 ? '连续 ' + h.streak.current + ' 天' : null;
  const statusText = {
    loading: '正在取今日卡片…',
    available: '5 张卡 · 约一分钟',
    inProgress: '已答 ' + (h.answered || 0) + '/5',
    done: '今日默契分 ' + h.total + ' · ' + BAND_TEXT(h.total || 0) + (h.final ? ' (定分)' : ' (实时)'),
    pendingSubmit: '答案待发送',
    error: '今日卡片需联网获取',
    offline: '今日卡片需联网获取',
    unavailable: '今日卡片需联网获取',
  }[h.state];
  const primaryLabel = { available: '开始', inProgress: '继续', done: '看结果', pendingSubmit: '重试', error: '重试', offline: '重试', unavailable: '重试', loading: '' }[h.state];
  return {
    display,
    features,
    daily: {
      state: h.state,
      issueNo: h.issueNo || 0,
      dateKey: h.dateKey || '',
      answered: h.answered || 0,
      scoreText: done ? statusText : null,
      yesterdayText,
      streakText: streak,
      // extras
      title: '每日刻度 · 第 ' + (h.issueNo || 0) + ' 期 · 5 张卡',
      statusText,
      primaryLabel,
      subline: done ? '明日 0:00 换新卡 · 0:30 定分' : null,
    },
    group: { status: h.group.status, bannerText: h.group.status === 'ok' ? '来自群聊 · 查看本群今日默契 ›' : null },
    muted: !!h.muted,
    showHowToOnce: !!h.showHowToOnce,
    // extras
    sheet: h.sheet || null,
    settings: h.settings || null,
    howto: { lines: ['拖动指针，放到你觉得对的位置', '和全国、和群友比比谁更同频', '每天 5 张卡'] },
    t: h.t || 0,
  };
}

/** Settings sheet (spec 10 "Settings"). */
function settingsVm(st, privacy) {
  const friendScope = privacy.friendScope;
  return {
    muted: !!st.muted,
    largeText: !!st.largeText,
    highContrast: !!st.highContrast,
    privacy: privacy.privacy,
    friendScope,
    // extras
    friendLine: friendScope === 'granted' && privacy.privacy === 'agreed' ? '好友排行：已开启' : '好友排行：未开启',
    canOpenSetting: !(friendScope === 'granted' && privacy.privacy === 'agreed'),
  };
}

// ------------------------------------------------------------------ day result (6.4)

/**
 * r = { issueNo, final, cards:[CardText], pos:[5], refs:[5], pct, divisiveIdx, streak, group:{gs, mq, n}|null,
 *       bonus:{left, adState}, distribution:{unlocked, hist, adState}, sheet }
 */
function resultVm(r, display, features) {
  const rows = r.cards.map((c, i) => ({
    prompt: c.prompt,
    left: c.left,
    right: c.right,
    you: r.pos[i],
    nation: r.refs[i],
    label: S.labelFor(Math.abs(r.pos[i] - r.refs[i])).label,
    scoreText: '+' + S.scoreAt(r.pos[i], r.refs[i]),
  }));
  const total = S.dayTotal(r.pos, r.refs);
  const dv = r.divisiveIdx !== null && r.divisiveIdx !== undefined && r.cards[r.divisiveIdx] ? r.cards[r.divisiveIdx] : null;
  const streakParts = [];
  if (r.streak && r.streak.current >= 2) streakParts.push('连续 ' + r.streak.current + ' 天');
  if (!r.final) streakParts.push('0:30 定分');
  let groupText = null;
  if (r.group) {
    if (r.group.gs !== null && r.group.gs !== undefined) {
      groupText = '本群群内默契分 ' + r.group.gs + (r.group.mq !== null && r.group.mq !== undefined ? ' · 本群默契度 ' + r.group.mq : ' · 本群完成满 3 人后计算默契度');
    } else groupText = '本群完成满 2 人后计算群内默契分';
  }
  const bonus = r.bonus || { left: 3, adState: 'idle' };
  const dist = r.distribution || { unlocked: false, adState: 'idle' };
  const out = {
    issueNo: r.issueNo,
    final: !!r.final,
    totalText: String(total),
    bandLabel: S.bandFor(total).label,
    statusTag: r.final ? '定分' : '实时',
    percentileText: r.final && r.pct !== null && r.pct !== undefined ? '超过全国 ' + r.pct + '%' : null,
    rows,
    divisiveText: dv ? '今日最有争议：' + dv.prompt + ' (' + dv.left + '↔' + dv.right + ')' : null,
    streakText: streakParts.length ? streakParts.join(' · ') : null,
    groupText,
    bonus: { left: bonus.left, adState: bonus.adState },
    distribution: { unlocked: !!dist.unlocked, adState: dist.adState },
    display,
    features,
    // extras
    total,
    sheet: r.sheet || null,
    bonusText: bonus.left > 0 ? '▶ 视频 加一题' : '今天的加一题用完了',
    distributionText: '▶ 视频 全国分布',
    offlineNote: r.stale ? '暂未更新' : null,
  };
  if (dist.unlocked && dist.hist) out.distribution.hist = dist.hist;
  return out;
}

// ------------------------------------------------------------------ create round (6.5)

/**
 * m = { step, spectra:[{id,left,right}], freeSwapLeft, adSwapLeft, roundId, target, clueMode, clueOptions, clueItemId, adState, errorText, clueSwapLeft }
 */
function createVm(m, display, features) {
  const band = m.target !== null && m.target !== undefined ? { from: Math.max(0, m.target - 2), to: Math.min(100, m.target + 2) } : null;
  const canShare = m.step === 'pickClue' && !!m.roundId && (m.clueMode === 'chat' || (m.clueMode === 'preset' && !!m.clueItemId));
  const chosen = m.spectrum || null;
  return {
    step: m.step,
    spectra: m.spectra.map((s) => ({ id: s.id, left: s.left, right: s.right })),
    freeSwapLeft: m.freeSwapLeft,
    adSwapLeft: m.adSwapLeft,
    roundId: m.roundId || null,
    targetBand: band,
    clueMode: m.clueMode,
    clueOptions: m.clueOptions,
    clueItemId: m.clueItemId || null,
    canShare,
    display,
    features,
    // extras
    spectrum: chosen ? { id: chosen.id, left: chosen.left, right: chosen.right } : null,
    secretNote: band ? '只有你能看到这个位置' : null,
    chatHint: m.clueMode === 'chat' ? '回群里用一句话或语音给提示，别直接说位置或数字哦' : null,
    clueTitle: '怎么给提示？',
    clueSwapLeft: m.clueSwapLeft,
    adState: m.adState || 'idle',
    errorText: m.errorText || null,
    swapHint: m.adSwapLeft <= 0 && m.freeSwapLeft <= 0 ? '就从这几条里选吧' : null,
    rateLimitedText: m.step === 'rateLimited' ? '今天出的题够多啦，明天再来' : null,
  };
}

// ------------------------------------------------------------------ round (6.6, 6.7)

function clueTextOf(clueText) {
  return clueText ? '提示：' + clueText : '提示在群聊里，看看 TA 怎么说';
}

/**
 * m = { status, isHost, left, right, clueText, guessCount, myGuess, late, canReveal, reveal:{target,mq,rows,...}|null, needle, phase, subscribe,
 *       lateMode, namesNote, expiredForGuess, errorText, markers }
 */
function roundVm(m, display, features) {
  const cnt = m.guessCount || 0;
  let guessCountText;
  if (m.status === 'submitted') guessCountText = '已提交 · 已有 ' + cnt + ' 人作答 · 等待揭晓';
  else if (m.status === 'noGuesses') guessCountText = '没有人作答，这道题结束了';
  else guessCountText = cnt > 0 ? '已有 ' + cnt + ' 人作答' : '还没有人作答';
  let revealHint = '';
  if (m.status === 'hostWaiting') revealHint = cnt >= 2 ? '第 8 人作答或 24 小时后自动揭晓' : '至少 2 人作答后可揭晓';
  else if (m.status === 'submitted') revealHint = '主持人揭晓，或第 8 人作答、24 小时后自动揭晓';
  const reveal = m.reveal
    ? { target: m.reveal.target, mqText: m.reveal.mq === null || m.reveal.mq === undefined ? '' : '本题默契值 ' + m.reveal.mq, markers: m.reveal.markers }
    : null;
  return {
    status: m.status,
    isHost: !!m.isHost,
    left: m.left || '',
    right: m.right || '',
    clueText: clueTextOf(m.clueText),
    guessCountText,
    canReveal: !!m.canReveal,
    revealHint,
    myGuess: m.myGuess === undefined ? null : m.myGuess,
    late: !!m.late,
    reveal,
    subscribe: m.subscribe || { state: 'hidden' },
    display,
    features,
    // extras
    phase: m.phase || null,
    needle: m.needle === undefined ? null : m.needle,
    canConfirm: m.phase === 'placing' && m.needle !== null && m.needle !== undefined,
    lateMode: !!m.lateMode,
    canLate: m.status === 'revealedUnplayed' && !m.expiredForGuess,
    namesNote: m.namesNote || null,
    rows: m.reveal ? m.reveal.rows : null,
    best: m.reveal ? m.reveal.best : null,
    salt: m.reveal ? m.reveal.salt : null,
    selfHash: m.reveal ? m.reveal.selfHash : null,
    hostBand: m.hostBand || null,
    errorText: m.errorText || null,
    sharedCanvas: m.sharedCanvas || null,
    headerText: m.left ? m.left + ' ↔ ' + m.right + (m.clueText ? ' · ' + clueTextOf(m.clueText) : '') : '',
    hint: m.phase === 'empty' ? HINT_EMPTY : null,
  };
}

/** Open data domain markers for the round reveal: target ▮, on-time guesses ○, late dashed, mine ▼. */
function roundMarkers(target, rows, selfHash) {
  const out = [marker(target, 'target')];
  rows.forEach((r) => {
    if (r[1] === null || r[1] === undefined) return;
    const mine = r[0] === selfHash;
    out.push(marker(r[1], mine ? 'you' : r[3] ? 'late' : 'member'));
  });
  return out;
}

// ------------------------------------------------------------------ group page and friend board (6.8)

function bannerVm(features, screenOk) {
  const on = !!(features && features.banner && features.banner.enabled && features.banner.adUnitId) && screenOk;
  return { show: on, reservedHeight: on ? 100 : 0 };
}

/**
 * g = { state, base, issueNo, n, mq, viewerDone, divisiveIdx, cards, trend:[{dateKey, mq}], rounds, banner, ... }
 */
function groupVm(g, display, features) {
  const trend = (g.trend || []).map((t) => ({ label: dateShort(t.dateKey), value: t.mq === undefined ? null : t.mq }));
  while (trend.length < 7 && g.trend) trend.unshift({ label: '', value: null });
  const dv = g.divisiveIdx !== null && g.divisiveIdx !== undefined && g.cards && g.cards[g.divisiveIdx] ? g.cards[g.divisiveIdx].prompt : null;
  const n = g.n || 0;
  return {
    state: g.state,
    issueNo: g.issueNo || 0,
    mqText: g.mq !== null && g.mq !== undefined ? '本群今日默契度 ' + g.mq : null,
    countText: n > 0 ? '已完成 ' + n + ' 人' : '本群今天还没有人完成',
    divisiveText: dv ? '今日最有争议：' + dv : null,
    trend,
    rounds: (g.rounds || []).map((r) => ({
      roundId: r.roundId,
      title: r.left + '↔' + r.right,
      mqText: r.mq !== null && r.mq !== undefined ? '默契 ' + r.mq : null,
      statusText: r.status === 'revealed' ? '已揭晓 · ' + r.guesses + ' 人作答' : r.status === 'noGuesses' ? '无人作答' : '进行中 · ' + r.guesses + ' 人作答',
    })),
    banner: g.banner || bannerVm(features, false),
    display,
    features,
    // extras
    base: g.base || null,
    explainer: g.state === 'noGroup' || g.state === 'groupFailed' ? '在群聊里点开本游戏的卡片，就能看到本群的默契度' : null,
    stateText: groupStateText(g),
    smallText: g.base === 'small' ? '完成人数满 3 人后计算本群默契度' : null,
    notice: g.notice || null,
    sharedCanvas: g.sharedCanvas || null,
    rowCount: g.rowCount || 0,
    viewerDone: !!g.viewerDone,
    canShare: true,
  };
}

function groupStateText(g) {
  switch (g.state) {
    case 'checkingGroup':
      return '正在确认群聊…';
    case 'loading':
      return '加载中…';
    case 'notPlayed':
      return '完成今日刻度后查看本群默契';
    case 'small':
      return '完成人数满 3 人后计算本群默契度';
    case 'empty':
      return '本群今天还没有人完成';
    case 'serverError':
      return '本群数据暂时打不开';
    case 'privacyDenied':
      return '查看群友昵称需要同意《用户隐私保护指引》';
    case 'unauthorized':
      return '开启「微信朋友关系」可显示群友昵称';
    default:
      return null;
  }
}

function friendVm(f, display, features) {
  return {
    state: f.state,
    mode: f.mode || null,
    issueNo: f.issueNo || 0,
    selfText: f.selfText || null,
    banner: f.banner || bannerVm(features, false),
    display,
    features,
    // extras
    title: '好友 · 今日刻度',
    stateText: friendStateText(f),
    base: f.base || null,
    sharedCanvas: f.sharedCanvas || null,
    rowCount: f.rowCount || 0,
    viewerDone: !!f.viewerDone,
  };
}

function friendStateText(f) {
  switch (f.state) {
    case 'loading':
      return '加载中…';
    case 'empty':
      return '还没有好友完成今日刻度';
    case 'serverError':
      return '好友榜暂时打不开';
    case 'privacyDenied':
      return '查看好友昵称需要同意《用户隐私保护指引》';
    case 'unauthorized':
      return '开启「微信朋友关系」可显示好友昵称';
    default:
      return null;
  }
}

// ------------------------------------------------------------------ archive (6.9)

/** a = { state, bestStreak, hasMore, items:[{dateKey, issueNo, mine, local}], offlineNote } */
function archiveListVm(a, display, features) {
  return {
    state: a.state,
    bestStreakText: a.bestStreak > 0 ? '最长连续 ' + a.bestStreak + ' 天' : null,
    hasMore: !!a.hasMore,
    items: (a.items || []).map((it) => ({
      dateKey: it.dateKey,
      issueNo: it.issueNo,
      dateText: dateText(it.dateKey),
      statusText: it.mine ? '已玩 · 定分 ' + it.mine.total : it.local ? '往期练习 ' + it.local.total : '未玩 · 5 张卡',
    })),
    banner: a.banner || bannerVm(features, false),
    display,
    features,
    // extras
    title: '往期刻度',
    emptyText: a.state === 'empty' ? '还没有往期，明天再来' : null,
    errorText: a.state === 'error' || a.state === 'offline' ? '往期需联网查看' : null,
    offlineNote: a.offlineNote ? '离线' : null,
  };
}

/** a = { state, dateKey, issueNo, kind, cards, finals, mine, done, practiceTotal, divisiveText, dist, sheet } */
function archiveDayVm(a, display, features) {
  const mine = a.mine
    ? {
        positions: a.mine.positions,
        totalText: String(a.mine.total),
        percentileText: a.mine.pct !== null && a.mine.pct !== undefined ? '超过全国 ' + a.mine.pct + '%' : null,
      }
    : null;
  return {
    state: a.state,
    dateKey: a.dateKey,
    issueNo: a.issueNo,
    kind: a.kind,
    cards: a.cards || [],
    finals: a.finals || [],
    mine,
    display,
    features,
    // extras
    dateText: a.dateKey ? dateText(a.dateKey) : '',
    done: !!a.done,
    practiceText: a.done && a.mine ? '往期练习 ' + a.mine.total + ' · 不计入排行' : null,
    bandLabel: a.mine ? S.bandFor(a.mine.total).label : null,
    rows: a.mine && a.cards
      ? a.cards.map((c, i) => ({ prompt: c.prompt, left: c.left, right: c.right, you: a.mine.positions[i], nation: a.finals[i], label: S.labelFor(Math.abs(a.mine.positions[i] - a.finals[i])).label, scoreText: '+' + S.scoreAt(a.mine.positions[i], a.finals[i]) }))
      : null,
    distribution: a.dist || { unlocked: false, adState: 'idle' },
    sheet: a.sheet || null,
    canNext: !!a.canNext,
  };
}

// ------------------------------------------------------------------ main -> open data domain

/**
 * type 'render' message (spec 10). `anon` is an extra: true when privacy or the friend scope was refused,
 * so the open data domain should not even try to read friend data and renders "群友 A/B/C".
 */
function odcMessage(view, o) {
  const msg = {
    type: 'render',
    view,
    salt: o.salt,
    selfHash: o.selfHash,
    viewerDone: !!o.viewerDone,
    rows: o.rows,
    width: o.width,
    height: o.height,
    dpr: o.dpr || 1,
    palette: o.palette,
    scale: o.scale,
    anon: !!o.anon,
  };
  if (o.shareTicket) msg.shareTicket = o.shareTicket;
  if (o.groupid) msg.groupid = o.groupid;
  if (o.refs) msg.refs = o.refs;
  if (o.mode) msg.mode = o.mode;
  return msg;
}

module.exports = {
  PRIMARY,
  HINT_EMPTY,
  displayVm,
  featuresVm,
  marker,
  revealVm,
  cardVm,
  homeVm,
  settingsVm,
  resultVm,
  createVm,
  roundVm,
  roundMarkers,
  clueTextOf,
  groupVm,
  friendVm,
  bannerVm,
  archiveListVm,
  archiveDayVm,
  odcMessage,
  sideText,
};
