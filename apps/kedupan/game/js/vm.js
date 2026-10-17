/**
 * View-model builders (spec 10, js/render/CONTRACT.md). Pure functions of a controller snapshot `c`:
 *   c = { st, store, display, features, now (device ms, animation clock), srvNow (server-corrected ms), todayKey,
 *         launchKey, ruler, bannerHeight, sharedCanvas }
 * Every dynamic string is formatted here (via core/present.js); renderers never compute a number, label or sentence.
 * Each builder returns exactly the spec 10 shape plus the extras listed per screen in render/CONTRACT.md.
 */

const P = require('../core/present');
const { CONFIG } = require('../core/config');
const { issueNo: issueOfDate } = require('../core/date');
const { checkClue, normalizeClue, RULE_LINE } = require('../core/clue');
const CU = require('./clue-ui');

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const REVEAL_MS = 500;
const CONFETTI_MS = 1500;

// ---- shared ---------------------------------------------------------------------------------------------------------

/** Display modes (spec 6.11): the same object travels in every vm and the overlay vm. */
function displayOf(d) {
  const x = d || {};
  const large = !!x.largeText;
  const hc = !!x.highContrast;
  return { largeText: large, highContrast: hc, scale: large ? 1.25 : 1, palette: hc ? 'highContrast' : 'standard' };
}

/** AIGC label (CTO decision, QA-2): the settings sheet shows it. */
const AIGC_NOTE = '题库内容由 AI 辅助编写，并经人工审核';

function settingsOf(c) {
  const d = c.store.state.display || {};
  const pv = c.store.state.privacy;
  const rv = c.store.state.rulesAgreedVersion;
  return { muted: !!c.store.state.muted, largeText: !!d.largeText, highContrast: !!d.highContrast, privacy: pv.privacy, friendScope: pv.friendScope, aigcNote: AIGC_NOTE, rulesAgreedVersion: typeof rv === 'number' ? rv : null };
}

function revealProgress(c, t0) {
  return t0 ? clamp01((c.now - t0) / REVEAL_MS) : 1;
}

function issueNoNow(c) {
  return c.st.daily ? c.st.daily.issueNo : Math.max(1, issueOfDate(c.todayKey, c.launchKey));
}

function dist(c, key, st) {
  const unlocked = !!(c.store.state.unlocks.day === c.todayKey && c.store.state.unlocks.keys[key]);
  const out = { unlocked, adState: st.adState.distribution };
  const h = st.dist[key];
  if (unlocked && h) out.hist = h.map((x) => (Array.isArray(x) ? x : new Array(21).fill(0)));
  return out;
}

function bannerOf(c, state) {
  const f = c.features.banner;
  const show = !!(f && f.enabled && f.adUnitId) && (state === 'ready' || state === 'empty');
  return { show, reservedHeight: show ? c.bannerHeight || 64 : 0, stub: false };
}

// ---- home -----------------------------------------------------------------------------------------------------------

/** Does the stored unsent card belong to the card the daily is waiting on? */
function pendingFor(pending, daily) {
  return !!(pending && daily && pending.dateKey === daily.dateKey && !daily.mine.complete && pending.idx === daily.mine.answered);
}

function home(c) {
  const st = c.st;
  const d = st.daily;
  const status = st.dailyStatus;
  const state = P.homeDailyState({
    loading: status === 'loading' && !d,
    unavailable: status === 'unavailable',
    offline: status === 'offline',
    error: status === 'error',
    pendingSubmit: pendingFor(c.store.state.pending, d),
    complete: !!(d && d.mine.complete),
    answered: d ? d.mine.answered : 0,
  });
  const total = d && d.mine.total !== null ? d.mine.total : null;
  return {
    daily: {
      state,
      issueNo: issueNoNow(c),
      dateKey: d ? d.dateKey : c.todayKey,
      answered: d ? d.mine.answered : 0,
      scoreText: state === 'done' && total !== null ? P.homeScoreText(total, d.frozen) : null,
      yesterdayText: d && d.yesterday ? P.yesterdayText(d.yesterday.total, d.yesterday.pct) : null,
      streakText: d ? P.streakText(d.myStreak.current) : null,
    },
    group: { status: st.group.status, bannerText: null },
    muted: !!c.store.state.muted,
    showHowToOnce: st.sheet === 'howto' && st.howtoAuto,
    display: displayOf(c.store.state.display),
    features: c.features,
    settings: settingsOf(c),
    sheet: st.sheet,
    sheetScroll: st.sheetScroll,
    scrollY: st.scrollY,
    t: c.now,
  };
}

// ---- card play ------------------------------------------------------------------------------------------------------

function primaryLabelOf(p) {
  if (p.phase === 'pending') return '重试';
  if (p.phase === 'revealed') return p.mode === 'bonus' || p.idx >= 4 ? '看结果' : '下一张';
  return '就这儿';
}

function card(c) {
  const p = c.st.play;
  const revealed = p.phase === 'revealed';
  const needle = revealed || p.phase === 'submitting' || p.phase === 'pending' ? (p.pos === null ? c.ruler.pos : p.pos) : c.ruler.pos;
  let confetti = null;
  if (p.confetti && c.now - p.confetti.t0 < CONFETTI_MS) confetti = { t: clamp01((c.now - p.confetti.t0) / CONFETTI_MS), seed: p.confetti.seed };
  return {
    mode: p.mode,
    index: p.mode === 'bonus' ? null : p.idx + 1,
    total: p.mode === 'bonus' ? null : CONFIG.daily.cards,
    tag: p.mode === 'bonus' ? '加一题 · 不计分' : p.mode === 'archive' ? null : null,
    issueNo: p.issueNo,
    card: p.cards[p.mode === 'bonus' ? 0 : p.idx],
    phase: p.phase,
    needle,
    canConfirm: (p.phase === 'empty' || p.phase === 'placing') && c.ruler.canConfirm(),
    reveal: revealed ? p.reveal : null,
    primaryLabel: primaryLabelOf(p),
    hint: p.phase === 'empty' ? '点一下或拖动，放上指针' : null,
    coach: !!p.coach,
    revealT: revealed ? revealProgress(c, p.revealAt) : 0,
    confetti,
    scrollY: c.st.scrollY,
    submitNote: p.phase === 'pending' ? p.submitNote || '网络不稳，答案还没送达' : null,
    reportSheet: !!p.reportSheet,
    display: displayOf(c.store.state.display),
    t: c.now,
  };
}

// ---- day result -----------------------------------------------------------------------------------------------------

function bonusLeft(c) {
  const b = c.store.state.bonus;
  return Math.max(0, CONFIG.limits.bonusPerDay - (b.day === c.todayKey ? b.used : 0));
}

function result(c) {
  const st = c.st;
  const r = st.result;
  const base = P.buildDayResult({
    issueNo: r.issueNo,
    cards: r.cards,
    positions: r.positions,
    refs: r.refs,
    scores: r.scores,
    total: r.total,
    final: r.final,
    pct: r.pct,
    divisiveIdx: r.divisiveIdx,
    streak: r.streak,
    group: r.groupStats,
  });
  return Object.assign(base, {
    bonus: { left: bonusLeft(c), adState: st.adState.bonus },
    distribution: dist(c, r.dateKey, st),
    display: displayOf(c.store.state.display),
    stale: !!r.stale,
    sheet: st.sheet === 'distribution' ? 'distribution' : null,
    sheetScroll: st.sheetScroll,
    scrollY: st.scrollY,
    t: c.now,
    revealT: clamp01((c.now - (r.enteredAt || 0)) / 800),
  });
}

// ---- create round ---------------------------------------------------------------------------------------------------

function create(c) {
  const cr = c.st.create;
  const u = cr.ugc;
  const paused = !u.createEnabled;
  const restricted = !paused && !!u.restriction;
  const draft = cr.text || '';
  const local = draft && cr.step === 'pickClue' ? checkClue(draft, { leftLabel: cr.left, rightLabel: cr.right }) : null;
  const shown = cr.serverHint || cr.hint || null;
  const kbOpen = !!cr.kbOpen && cr.step === 'pickClue' && cr.tab === 'text';
  const canShareText = !!local && local.ok && !cr.sending && !paused && !restricted;
  const out = {
    step: cr.step,
    spectra: cr.spectra.map((s) => ({ id: s.id, left: s.left, right: s.right })),
    freeSwapLeft: cr.freeSwapLeft,
    adSwapLeft: cr.adSwapLeft,
    roundId: cr.roundId,
    targetBand: cr.targetBand,
    tab: cr.tab,
    tabs: cr.tabs.slice(),
    textTab: {
      state: paused ? 'paused' : restricted ? 'restricted' : u.rulesAgreed ? 'ready' : 'needsRules',
      text: draft,
      countText: CU.codePoints(normalizeClue(draft)) + '/' + CU.CLUE_MAX,
      hint: cr.busyBox ? null : shown ? shown.text : null,
      reason: cr.busyBox ? 'busy' : shown ? shown.reason : null,
      ruleLine: RULE_LINE,
      restrictionText: restricted ? CU.restrictionText(u.restriction) : null,
      sending: !!cr.sending,
      busyBox: !!cr.busyBox,
    },
    sheet: cr.sheet,
    clueMode: cr.tab,
    clueOptions: cr.clueOptions.map((o) => ({ itemId: o.itemId, text: o.text })),
    clueItemId: cr.clueItemId,
    canShare: cr.step === 'pickClue' && !cr.sharing && (cr.tab === 'text' ? canShareText || (cr.shareConfirm && cr.passed) : cr.clueItemId !== null),
    shareConfirm: !!(cr.shareConfirm && cr.passed),
    display: displayOf(c.store.state.display),
    adState: c.st.adState.swap,
    clueSwapLeft: cr.clueSwapLeft,
    chosen: { left: cr.left, right: cr.right },
    caret: kbOpen && Math.floor(c.now / 500) % 2 === 0 && !cr.sending,
    scrollY: c.st.scrollY,
    t: c.now,
    revealT: 1,
  };
  // keyboardH: pt of the open system keyboard; 0 closed; absent = unknown (TD-75 pattern)
  if (!kbOpen) out.keyboardH = 0;
  else if (typeof c.keyboardHeight === 'number' && c.keyboardHeight > 0) out.keyboardH = c.keyboardHeight;
  return out;
}

// ---- round (guess / host / reveal) ----------------------------------------------------------------------------------

/** vm status of a round for this viewer (spec 10 Round.status, 6.6, 6.7). */
function roundStatus(r, nowMs) {
  if (r.loadState === 'loading') return 'loading';
  if (r.loadState === 'offline') return 'offline';
  if (r.loadState === 'notFound') return 'notFound';
  const d = r.data;
  if (!d) return 'loading';
  if (d.status === 'noGuesses') return d.isHost ? 'noGuesses' : 'expired';
  if (r.lateMode && d.status === 'revealed' && !d.myGuess) return 'open'; // 先猜再看: placing a late guess
  const old = nowMs > d.closesAt;
  const base = P.roundViewStatus({ status: d.status, isHost: d.isHost, myGuess: d.myGuess, expired: false });
  if (base === 'revealedUnplayed' && old) return 'revealed'; // > 7 days: the reveal view only (spec 6.6)
  if (base === 'revealedUnplayed' && (r.viewAnswer || d.reveal)) return 'revealed'; // the server already served the answer (QA-7)
  return base;
}

function revealMarkers(d) {
  const markers = [{ pos: d.reveal.target, kind: 'target' }];
  d.reveal.rows.forEach((row) => {
    if (row[1] === null || row[4] === 1) return; // host row (no guess)
    if (row[0] === d.reveal.selfHash) return; // your own guess is drawn as ▼ below
    markers.push({ pos: row[1], kind: row[3] === 1 ? 'late' : 'member' });
  });
  if (d.myGuess) markers.push({ pos: d.myGuess.pos, kind: 'you' });
  return markers;
}

function round(c) {
  const st = c.st;
  const r = st.round;
  const d = r.data;
  const status = roundStatus(r, c.srvNow);
  const isHost = !!(d && d.isHost);
  const clue = CU.roundClue(d, { reported: r.reported });
  const guessCount = d ? d.guessCount : 0;
  const placing = status === 'open';
  const showReveal = status === 'revealed' && d && d.reveal;
  const subState = (() => {
    if (!d) return 'hidden';
    const where = status === 'hostWaiting' ? 'host' : status === 'submitted' ? 'guess' : null;
    if (!where) return 'hidden';
    if (r.subRequesting) return 'requesting';
    const s = c.subscribeState(r.roundId);
    return s === 'offer' || s === 'granted' || s === 'declined' ? s : 'hidden';
  })();
  const ph = !placing ? null : r.submitting ? 'submitting' : c.ruler.pos === null ? 'empty' : 'placing';
  return {
    status,
    isHost,
    left: d ? d.left : '',
    right: d ? d.right : '',
    clueMode: clue.mode,
    clueState: clue.state,
    clueText: d ? CU.clueLine(clue, isHost) : '',
    clueSubText: d ? CU.clueSubLine(clue, isHost, status === 'open') : null,
    canReport: clue.canReport,
    reportSheet: r.reportSheet ? { reasons: CU.REPORT_REASONS.slice(), sending: !!r.reportSheet.sending, selected: r.reportSheet.selected || null } : null,
    guessCountText: status === 'submitted' ? P.submittedText(guessCount) : P.guessCountText(guessCount),
    canReveal: !!(d && d.canReveal),
    revealHint: d ? P.revealHint(!!d.canReveal, guessCount) : '',
    myGuess: d && d.myGuess ? d.myGuess.pos : null,
    late: !!(r.lateMode || (d && d.myGuess && d.myGuess.late)),
    reveal: showReveal
      ? { target: d.reveal.target, mqText: P.mqText(d.reveal.mq) || '本题默契值 —', markers: revealMarkers(d) }
      : null,
    subscribe: { state: subState },
    display: displayOf(c.store.state.display),
    t: c.now,
    revealT: showReveal ? revealProgress(c, r.revealAt) : 1,
    needle: placing ? c.ruler.pos : d && d.myGuess ? d.myGuess.pos : null,
    phase: ph,
    canConfirm: placing && !r.submitting && c.ruler.canConfirm(),
    hint: placing && c.ruler.pos === null ? '点一下或拖动，放上指针' : null,
    sharedCanvas: showReveal ? c.sharedCanvas : null,
    listScroll: r.listScroll || 0,
    scrollY: st.scrollY,
    hostBand: isHost && d && typeof d.target === 'number' && status === 'hostWaiting' ? { from: Math.max(0, d.target - 2), to: Math.min(100, d.target + 2) } : null,
  };
}

// ---- group page and friend board ------------------------------------------------------------------------------------

function groupPage(c) {
  const st = c.st;
  const g = st.gpage;
  const p = g.data;
  const d = st.daily;
  let state = g.state;
  const divisive = p && p.divisiveIdx !== null && p.divisiveIdx !== undefined && d ? d.cards[p.divisiveIdx] : null;
  return {
    kind: 'group',
    state,
    issueNo: p ? p.issueNo : issueNoNow(c),
    mqText: p && p.mq !== null && p.mq !== undefined ? String(p.mq) : null,
    countText: p ? '已完成 ' + p.n + ' 人' : '',
    divisiveText: divisive ? '今日最有争议：' + divisive.prompt : null,
    trend: p ? p.trend.map((t) => ({ label: P.trendLabel(t.dateKey), value: t.mq === null ? null : t.mq })) : [],
    rounds: p
      ? p.rounds.map((r) => ({ roundId: r.roundId, title: r.left + '↔' + r.right, mqText: r.mq !== null && r.mq !== undefined ? '默契 ' + r.mq : null, statusText: P.roundStatusText(r.status) }))
      : [],
    banner: bannerOf(c, state),
    display: displayOf(c.store.state.display),
    sharedCanvas: state === 'ready' || state === 'small' || state === 'notPlayed' || state === 'privacyDenied' || state === 'unauthorized' ? c.sharedCanvas : null,
    scrollY: st.scrollY,
    t: c.now,
  };
}

function friendBoard(c) {
  const st = c.st;
  const f = st.fpage;
  const p = f.data;
  const state = f.state;
  let selfText = null;
  if (p && p.mode === 'selfOnly') {
    const mine = p.rows.find((r) => r[0] === p.selfHash);
    selfText = mine ? '你的今日默契分 ' + mine[1] + ' · 已校验' : null;
  }
  return {
    kind: 'friend',
    state,
    mode: p ? p.mode : null,
    issueNo: p ? p.issueNo : issueNoNow(c),
    selfText,
    banner: bannerOf(c, state),
    display: displayOf(c.store.state.display),
    sharedCanvas: state === 'ready' || state === 'privacyDenied' || state === 'unauthorized' ? c.sharedCanvas : null,
    scrollY: st.scrollY,
    t: c.now,
  };
}

// ---- archive --------------------------------------------------------------------------------------------------------

function archiveStatusText(item, plays) {
  if (item.mine) return '已玩 · 定分 ' + item.mine.total;
  const lp = plays[item.dateKey];
  if (lp) return '往期练习 ' + lp.total;
  return '未玩 · 5 张卡';
}

function archiveList(c) {
  const a = c.st.arch;
  const plays = c.store.state.archivePlays;
  const best = a.bestStreak;
  return {
    kind: 'list',
    state: a.state,
    bestStreakText: best >= 2 ? '最长连续 ' + best + ' 天' : null,
    offlineTag: !!a.offline,
    hasMore: !!a.hasMore,
    items: a.items.map((it) => ({ dateKey: it.dateKey, issueNo: it.issueNo, dateText: P.dateText(it.dateKey), statusText: archiveStatusText(it, plays) })),
    banner: bannerOf(c, a.state),
    display: displayOf(c.store.state.display),
    scrollY: c.st.scrollY,
    t: c.now,
  };
}

function percentText(pct) {
  return pct === null || pct === undefined ? null : '超过全国 ' + pct + '%';
}

function review(c) {
  const rv = c.st.arch.review;
  const base = rv.data
    ? P.buildDayResult({
        issueNo: rv.data.issueNo,
        cards: rv.data.cards,
        positions: rv.data.mine.pos,
        refs: rv.data.finals,
        scores: rv.data.mine.cardScores,
        total: rv.data.mine.total,
        final: true,
        pct: rv.data.mine.pct,
        divisiveIdx: null,
        streak: 0,
        group: null,
      })
    : null;
  return {
    kind: 'review',
    state: rv.state,
    dateKey: rv.dateKey,
    issueNo: rv.data ? rv.data.issueNo : 0,
    cards: rv.data ? rv.data.cards : [],
    finals: rv.data ? rv.data.finals : [],
    mine: rv.data ? { positions: rv.data.mine.pos, totalText: String(rv.data.mine.total), percentileText: percentText(rv.data.mine.pct) } : null,
    rows: base ? base.rows : [],
    divisiveText: null,
    distribution: dist(c, rv.dateKey, c.st),
    sheet: c.st.sheet === 'distribution' ? 'distribution' : null,
    sheetScroll: c.st.sheetScroll,
    display: displayOf(c.store.state.display),
    scrollY: c.st.scrollY,
    t: c.now,
  };
}

function setEnd(c) {
  const e = c.st.arch.end;
  const base = P.buildDayResult({
    issueNo: e.issueNo,
    cards: e.cards,
    positions: e.positions,
    refs: e.finals,
    scores: e.scores,
    total: e.total,
    final: true,
    pct: null,
    divisiveIdx: null,
    streak: 0,
    group: null,
  });
  return {
    kind: 'end',
    totalText: base.totalText,
    bandLabel: base.bandLabel,
    rows: base.rows,
    nextAvailable: !!e.nextDateKey,
    distribution: dist(c, e.dateKey, c.st),
    adState: c.st.adState.distribution,
    sheet: c.st.sheet === 'distribution' ? 'distribution' : null,
    sheetScroll: c.st.sheetScroll,
    display: displayOf(c.store.state.display),
    scrollY: c.st.scrollY,
    t: c.now,
  };
}

function archive(c) {
  const a = c.st.arch;
  return a.view === 'review' ? review(c) : a.view === 'end' ? setEnd(c) : archiveList(c);
}

// ---- overlay --------------------------------------------------------------------------------------------------------

/** The 用户协议 screen: the SAME paragraphs array every frame (the renderer caches its wrapping on it). */
function terms(c, t) {
  return { title: t.title, paragraphs: t.paragraphs, scrollY: c.st.scrollY, display: displayOf(c.store.state.display), t: c.now };
}

function overlay(c) {
  const st = c.st;
  const ov = { display: displayOf(c.store.state.display) };
  if (st.toast && c.now < st.toast.until) ov.toast = { text: st.toast.text };
  if (st.dialog) ov.dialog = st.dialog;
  if (c.adOverlay) ov.adStub = { kind: c.adOverlay.kind, secondsLeft: Math.max(0, Math.ceil((c.adOverlay.durationMs - (c.now - c.adOverlay.startedAt)) / 1000)) };
  return ov;
}

module.exports = {
  displayOf,
  home,
  card,
  result,
  create,
  round,
  roundStatus,
  groupPage,
  friendBoard,
  archive,
  archiveList,
  review,
  setEnd,
  terms,
  overlay,
  pendingFor,
  archiveStatusText,
  percentText,
  bonusLeft,
  REVEAL_MS,
  CONFETTI_MS,
};
