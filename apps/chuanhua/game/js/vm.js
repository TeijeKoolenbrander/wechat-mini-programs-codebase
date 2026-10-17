/**
 * View-model builders (spec 12, js/render/CONTRACT.md, rev. 2). PURE: raw state in, exactly the contract's view models out, with
 * every string pre-formatted (core/copy.js or here); the renderers only draw. No wx, no clock, no network. The tests compare every
 * builder's output with js/render/samples.js (same keys, same types) so the two cannot drift.
 *
 * Shared fields on every vm (CONTRACT "shared"): display, muted, features, ugc, t. Pass them once as `cm` (common):
 *   cm = { display, muted, features, ugc, t }
 */

const strokesLib = require('../core/strokes');
const copy = require('../core/copy');
const strikes = require('../core/strikes');
const codes = require('../core/codes');
const text = require('../core/text');
const allowance = require('../core/allowance');
const { CONFIG } = require('../core/config');
const { whenText } = require('./util');

const POINTS_MAX = CONFIG.strokes.maxPoints;
const LIMIT_TEXT = '画得太细啦，先交吧';
const PATH_LIMIT_TEXT = '线条太多啦，先交吧';
const PAUSED_TEXT = '接龙维护中，可以先看看已揭晓的接龙';
const PLACEHOLDER = { reported: '该内容已被举报隐藏', deleted: '作者已删除这一棒', paused: '内容维护中' };
const SLOW_LABEL = '慢慢传（不用同时在线）';

function displayVm(d) {
  return { largeText: !!(d && d.largeText), highContrast: !!(d && d.highContrast) };
}

function featuresVm(f) {
  return {
    liveRooms: f.liveRooms !== false,
    subscribe: f.subscribe ? { tmplId: f.subscribe.tmplId } : null,
    updatableCard: !!f.updatableCard,
    banner: { enabled: !!f.banner.enabled, adUnitId: f.banner.adUnitId || null },
    interstitial: {
      enabled: !!f.interstitial.enabled,
      minLifetimeReveals: f.interstitial.minLifetimeReveals,
      minGapSec: f.interstitial.minGapSec,
      maxPerDay: f.interstitial.maxPerDay,
    },
  };
}

/** the shared fields every vm carries */
function common(cm) {
  return { display: displayVm(cm.display), muted: !!cm.muted, features: featuresVm(cm.features), ugc: { createEnabled: !!cm.ugc.createEnabled, viewEnabled: !!cm.ugc.viewEnabled }, t: cm.t || 0 };
}

const adState = (s) => (s === 'loading' || s === 'playing' || s === 'error' ? s : 'idle');

// ---------------------------------------------------------------------------------------------------------------- home

/**
 * h = { state, me:{startsLeft, adStartsLeft, roomsLeft, unseenReveals, streak, restriction}, ugcPaused, groupLine, activeRoom, sheet, rules, settings,
 *       adState, scrollY, sheetScroll, howtoSeen }
 */
function homeVm(h, cm) {
  const me = h.me || {};
  const st = h.state;
  const ready = st === 'ready';
  const live = cm.features.liveRooms !== false;
  const sl = me.startsLeft || 0;
  const al = me.adStartsLeft || 0;
  const roomCap = typeof me.roomsLeft === 'number' && me.roomsLeft <= 0 && !h.activeRoom;
  let primary;
  if (st === 'loading') primary = { kind: live ? 'room' : 'chain', label: live ? '开一局' : '开一条接龙', sublabel: null, enabled: false };
  else if (st === 'offline') primary = { kind: live ? 'room' : 'chain', label: live ? '开一局' : '开一条接龙', sublabel: live ? '需联网才能开局' : '需联网才能接龙', enabled: false };
  else if (st === 'error') primary = { kind: live ? 'room' : 'chain', label: live ? '开一局' : '开一条接龙', sublabel: null, enabled: false };
  else if (live) primary = { kind: 'room', label: '开一局', sublabel: roomCap ? '今天开局次数已用完，明天再来' : '3–10 人一起，约 3 分钟', enabled: !roomCap };
  else primary = { kind: 'chain', label: '开一条接龙', sublabel: sl > 0 ? '今天还能开 ' + sl + ' 条' : '今天的 ' + CONFIG.allowances.freeStarts + ' 条已开完', enabled: true };
  if (ready && (me.restriction || h.ugcPaused || !cm.ugc.createEnabled)) primary.enabled = false;
  const sheet = h.sheet || null;
  const out = {
    state: st,
    streakText: ready && me.streak ? allowance.streakText(me.streak) : null,
    primary,
    slowLink: { show: live && ready, label: SLOW_LABEL },
    activeRoom: ready && h.activeRoom ? { roomId: h.activeRoom.roomId, line: h.activeRoom.line } : null,
    groupLine: ready && h.groupLine && h.groupLine.show ? h.groupLine : { show: false, text: '', target: 'group' },
    chainStart: { freeLeft: sl, adLeft: al, sheet: sheet === 'startLimit' ? 'limit' : null, adState: adState(h.adState) },
    album: { unseenReveals: me.unseenReveals || 0 },
    restriction: me.restriction ? { text: strikes.restrictionText(me.restriction) } : null,
    ugcPausedText: h.ugcPaused ? PAUSED_TEXT : null,
    showHowToOnce: sheet === 'howto' && !h.howtoSeen,
    showRulesWarning: sheet === 'warning',
    sheet,
    scrollY: h.scrollY || 0,
    sheetScroll: h.sheetScroll || 0,
  };
  if (sheet === 'rules') out.rules = rulesVm(h.rules || { version: CONFIG.rulesVersion, pendingAction: null }, cm);
  out.settings = settingsVm(h.settings, cm);
  out.warningText = strikes.WARNING_TEXT;
  return Object.assign(out, common(cm));
}

function rulesVm(r, cm) {
  return Object.assign({ version: r.version, open: true, pendingAction: r.pendingAction || null }, common(cm));
}

/** the 用户协议 screen: paragraphs come from the generated js/terms-text.js, scrollY from logic */
function termsVm(terms, scrollY, cm) {
  return Object.assign({ title: terms.title, paragraphs: terms.paragraphs, scrollY: scrollY || 0 }, common(cm));
}

function warningVm(cm) {
  return Object.assign({ text: strikes.WARNING_TEXT }, common(cm));
}

function howtoVm(cm) {
  return common(cm);
}

function settingsVm(s, cm) {
  s = s || {};
  return Object.assign(
    {
      muted: !!cm.muted,
      largeText: !!(cm.display && cm.display.largeText),
      highContrast: !!(cm.display && cm.display.highContrast),
      canUnlockPalette: !!s.canUnlockPalette,
      paletteUnlockedToday: !!s.paletteUnlockedToday,
      paletteAd: { state: adState(s.paletteAdState) },
      reminderText: s.reminderText || null,
      deleteAll: { state: s.deleteAllState || 'idle' },
    },
    common(cm)
  );
}

// ---------------------------------------------------------------------------------------------------------------- pick

/**
 * p = { state ('rerolling' while a 换一批 is in flight), mode, secLeft?, warnSec, rollId, prompts:[{id,text}], selectedId, rerollLeft (0..5), custom:{open,text,error,passed}, errorText, drawSec, scrollY }
 */
/** the 换一批 label (<= 10 characters; the button is sized for the longest one at 320x568 large text): the count while chances remain, then the spent notice (TD-151) */
function rerollLabel(left) {
  return left > 0 ? '换一批（剩' + left + '次）' : '换一批机会已用完';
}

function pickVm(p, cm) {
  const live = p.mode === 'live';
  const sending = p.state === 'sending';
  const custom = p.custom || { open: false, text: '', error: null, passed: false };
  const customOk = custom.open ? text.validCharCount(custom.text || '') >= CONFIG.text.promptMin : false;
  const loading = p.state === 'loading';
  const rerollLeft = loading ? 0 : Math.max(0, Math.min(CONFIG.roll.rerollsPerPick, Number.isInteger(p.rerollLeft) ? p.rerollLeft : 0));
  const canStart = !sending && !loading && p.state !== 'rerolling' && p.state !== 'offline' && p.state !== 'timeUp' && (custom.open ? customOk : !!p.selectedId);
  const out = {
    state: p.state,
    mode: p.mode,
    title: '选一个题目',
    subtitle: live ? '传给下一位来画' : '你来画第 1 棒',
    rollId: p.rollId || '',
    prompts: (p.prompts || []).map((x) => ({ id: x.id, text: x.text })),
    selectedId: p.selectedId || null,
    rerollLeft: rerollLeft,
    rerollDisabled: rerollLeft <= 0,
    rerollTappable: rerollLeft > 0 && p.state === 'ready',
    rerollLabel: rerollLabel(rerollLeft),
    custom: { open: !!custom.open, text: custom.text || '', count: text.count(custom.text || '') + '/' + CONFIG.text.promptMax, error: custom.error || null, passed: !!custom.passed },
    startLabel: sending ? '准备中…' : p.state === 'timeUp' ? '时间到，正在交出…' : live ? '就这个' : '开始画 (' + p.drawSec + ' 秒)',
    canStart,
    errorText: p.errorText || null,
    canBack: !live,
    scrollY: p.scrollY || 0,
  };
  if (live) out.timer = { secLeft: p.secLeft || 0, warn: (p.secLeft || 0) <= (p.warnSec || 10) };
  return Object.assign(out, common(cm));
}

// ------------------------------------------------------------------------------------------------------ draw / describe

function paletteVm(unlocked) {
  return strokesLib.COLORS.map((color, idx) => ({ idx, color, locked: idx >= strokesLib.BASE_COLORS && !unlocked }));
}

/**
 * A server Source (or the chain claim's `prev`) -> the vm Source. `nextKind` = what the player makes from it ('draw'|'describe').
 */
function sourceVm(src, nextKind) {
  if (!src) return { kind: 'paused', hint: PLACEHOLDER.paused };
  switch (src.kind) {
    case 'prompt':
      return { kind: 'prompt', text: src.text || '' };
    case 'text':
      return { kind: 'text', text: src.text || '' };
    case 'draw':
      return { kind: 'draw', strokes: src.strokes };
    case 'marker':
      return { kind: 'marker', marker: src.marker, hint: src.hint || copy.markerHint(src.marker, nextKind) };
    case 'paused':
      return { kind: 'paused', hint: src.hint || copy.PAUSED_HINT };
    default:
      return { kind: 'hidden', hint: src.hint || copy.hiddenHint(nextKind) }; // 'hidden' | 'gone'
  }
}

function drawTitle(t) {
  return t.mode === 'live' ? '画出来 · ' + t.round + '/' + t.rounds : copy.stepTitle(t.step);
}
function describeTitle(t) {
  return t.mode === 'live' ? '猜一猜 · ' + t.round + '/' + t.rounds : copy.stepTitle(t.step);
}

const DRAW_STATUS_TEXT = { timeUp: '时间到，正在交出…', sending: '正在交出…', blocked: '这幅画没通过审核，改一改再交', error: '没传出去' };

/**
 * d = { mode, roomId, round, rounds, chainId, claimId, step, source (a vm Source), sourceLines, canReport, secLeft, warnSec, canvas, gridH, palette,
 *       colorIdx, sizeIdx, strokes (absolute recorder strokes), drawingNow, strokesRev, pointsUsed, limited, pathFull, canUndo, canSubmit,
 *       status, statusText, coach }
 */
function drawVm(d, cm) {
  const locked = d.status === 'sending' || d.status === 'timeUp';
  const out = {
    mode: d.mode,
    title: drawTitle(d),
    backLabel: d.mode === 'live' ? '离开' : '放弃',
    source: d.source,
    sourceLines: d.sourceLines === 2 ? 2 : 1,
    canReport: !!d.canReport,
    timer: { secLeft: d.secLeft, warn: d.secLeft <= d.warnSec },
    canvas: d.canvas,
    gridH: d.gridH,
    palette: d.palette,
    colorIdx: d.colorIdx,
    sizeIdx: d.sizeIdx,
    strokes: d.strokes, // absolute recorder strokes [{c,w,p}] with vm.gridH (render/strokes.js draws every form)
    drawingNow: !!d.drawingNow,
    strokesRev: d.strokesRev,
    pointsUsed: d.pointsUsed,
    pointsMax: POINTS_MAX,
    limitText: d.limited ? (d.pathFull ? PATH_LIMIT_TEXT : LIMIT_TEXT) : null,
    canUndo: !!d.canUndo && !locked,
    canSubmit: !!d.canSubmit && !locked,
    inputLocked: locked,
    status: d.status,
    statusText: d.statusText !== undefined && d.statusText !== null ? d.statusText : d.status === 'drawing' ? null : DRAW_STATUS_TEXT[d.status] || null,
    coach: !!d.coach,
  };
  if (d.mode === 'live') {
    out.roomId = d.roomId;
    out.round = d.round;
    out.rounds = d.rounds;
  } else {
    out.chainId = d.chainId;
    out.claimId = d.claimId;
    out.step = d.step;
  }
  return Object.assign(out, common(cm));
}

/** d = { mode, roomId, round, rounds, chainId, claimId, step, source, canReport, secLeft, warnSec, text, canSubmit, keyboardH, status, errorText, caret, shake } */
function describeVm(d, cm) {
  const locked = d.status === 'sending' || d.status === 'timeUp';
  const out = {
    mode: d.mode,
    title: describeTitle(d),
    backLabel: d.mode === 'live' ? '离开' : '放弃',
    source: d.source,
    canReport: !!d.canReport,
    timer: { secLeft: d.secLeft, warn: d.secLeft <= d.warnSec },
    text: d.text,
    count: text.count(d.text) + '/' + CONFIG.text.describeMax,
    canSubmit: !!d.canSubmit && !locked,
    inputLocked: locked,
    status: d.status,
    errorText: d.errorText || null,
    caret: !!d.caret,
    shake: !!d.shake,
  };
  if (typeof d.keyboardH === 'number') out.keyboardH = d.keyboardH;
  if (d.mode === 'live') {
    out.roomId = d.roomId;
    out.round = d.round;
    out.rounds = d.rounds;
  } else {
    out.chainId = d.chainId;
    out.claimId = d.claimId;
    out.step = d.step;
  }
  return Object.assign(out, common(cm));
}

// ------------------------------------------------------------------------------------------------------ round wait / lobby

/** what the player sent, from the server's `mine` ({kind:'prompt'|'draw'|'describe'|'marker', ...}) -> the vm shape */
function mineVmOf(m) {
  if (!m) return {};
  if (m.kind === 'draw') return { strokes: m.strokes };
  if (m.kind === 'marker') return { marker: m.marker };
  return { text: m.text };
}

/** r = { roomId, round, rounds, secLeft, warnSec, mine, sent, active, passing, offline } */
function roundWaitVm(r, cm) {
  let nextText;
  if (r.round >= r.rounds) nextText = '马上揭晓';
  else if (r.round + 1 === r.rounds) nextText = '最后一轮了';
  else nextText = '下一轮：' + ((r.round + 1) % 2 === 1 ? '画出来' : '猜一句');
  return Object.assign(
    {
      roomId: r.roomId,
      round: r.round,
      rounds: r.rounds,
      title: r.round === 0 ? '已交 · 选题' : '已交 · ' + r.round + '/' + r.rounds,
      timer: { secLeft: r.secLeft, warn: r.secLeft <= (r.warnSec || 10) },
      mine: r.mine || {},
      progressText: '等大家交… ' + (r.sent || 0) + '/' + (r.active || 0) + ' 已交',
      nextText,
      passing: !!r.passing,
      offlineText: r.offline ? '网络不好，正在重连…' : null,
    },
    common(cm)
  );
}

/** l = { state, roomId, resp (member view in the lobby, or null), starting, offline } */
function lobbyVm(l, cm) {
  const resp = l.resp;
  const seats = resp ? resp.seats : [];
  const filledN = resp ? resp.joined : 0;
  const isHost = !!(resp && resp.me && resp.me.isHost);
  const full = [];
  for (let i = 0; i < 10; i++) {
    const s = seats[i];
    full.push({ n: i + 1, filled: !!(s && s.filled), me: !!(s && s.me), quiet: !!(s && s.quiet) });
  }
  const cfg = CONFIG.room;
  let hint = null;
  let slowLink = false;
  if (isHost && filledN <= 1) hint = '把邀请发到群里，群友点开就能加入';
  else if (isHost && filledN < cfg.minPlayers) {
    hint = '至少 ' + cfg.minPlayers + ' 人才能开局';
    slowLink = true;
  }
  const state = l.state === 'ready' && l.starting ? 'starting' : l.state === 'ready' && l.offline ? 'offline' : l.state;
  return Object.assign(
    {
      state,
      roomId: l.roomId,
      seats: full,
      joinedText: resp ? copy.joinedText(filledN) : '',
      isHost,
      start: { show: isHost, enabled: isHost && filledN >= cfg.minPlayers && !l.starting, label: '开始（' + filledN + ' 人）', hint, slowLink },
      waitingText: !isHost && state !== 'closed' && state !== 'removed' ? '等房主开始…' : null,
      canInvite: state === 'ready' || state === 'starting' || state === 'offline',
      scrollY: l.scrollY || 0,
    },
    common(cm)
  );
}

const ROOM_ENTRY = {
  loading: { headline: '', subline: null },
  joinable: { headline: '群友开了一局传画', subline: '每人选一个题目，轮流画和猜，大约 3 分钟' },
  full: { headline: '这一局满员了（10 人）', subline: null },
  started: { headline: '这一局已经开始了，等下一局吧', subline: null },
  teaser: { headline: '这一局已经揭晓了', subline: '完整内容仅这一局的群友可见' },
  wrongGroup: { headline: '这一局只能在发起的群里加入', subline: null },
  closed: { headline: '这一局已经结束了', subline: null },
  removed: { headline: '这一局已被移除', subline: null },
  notFound: { headline: '找不到这一局', subline: null },
  inOtherRoom: { headline: '你还在另一局里', subline: '先回到那一局，或者离开它' },
  restricted: { headline: '群友开了一局传画', subline: null },
  rulesRequired: { headline: '群友开了一局传画', subline: '每人选一个题目，轮流画和猜，大约 3 分钟' },
  ugcPaused: { headline: '群友开了一局传画', subline: null },
  capReached: { headline: '今天加入的局数已用完', subline: '明天再来' },
  offline: { headline: '需联网才能加入', subline: null },
  error: { headline: '出了点小问题，请重试', subline: null },
};

/** e = { state, roomId, joined, otherRoomId, joining, restrictedUntil, scrollY } */
function roomEntryVm(e, cm) {
  const base = ROOM_ENTRY[e.state] || ROOM_ENTRY.error;
  const withCount = ['joinable', 'rulesRequired', 'restricted', 'ugcPaused'].includes(e.state) && typeof e.joined === 'number';
  let restrictionText = null;
  if (e.state === 'restricted') restrictionText = strikes.restrictionText({ until: e.restrictedUntil || 0, permanent: (e.restrictedUntil || 0) >= strikes.FOREVER });
  else if (e.state === 'ugcPaused') restrictionText = PAUSED_TEXT;
  const out = {
    state: e.state,
    roomId: e.roomId || '',
    joinedText: withCount ? copy.joinedText(e.joined) : null,
    headline: base.headline,
    subline: base.subline,
    joining: !!e.joining,
    restrictionText,
    scrollY: e.scrollY || 0,
  };
  if (e.state === 'inOtherRoom' && e.otherRoomId) out.otherRoomId = e.otherRoomId;
  return Object.assign(out, common(cm));
}

// ------------------------------------------------------------------------------------------------------------------- sent

const MOD_TEXT = {
  pending: '审核中',
  passed: '已通过',
  blocked: '这一棒没通过内容审核，没有传出去',
  void: '审核超时，这一棒没有传出去，不算你的次数',
};

/** s = { chainId, step, kind, mine:{strokes?|text?|marker?}, modState, subscribe, firstTimeExplainer, revealed, updatableCard, length } */
function sentVm(s, cm) {
  const next = s.step + 1;
  const len = s.length || CONFIG.chain.length;
  let nextText = null;
  if (s.modState === 'pending') nextText = '通过后，群友就能接第 ' + next + ' 棒';
  else if ((s.modState === 'passed' || s.modState === 'marker') && !s.revealed && next <= len) nextText = '群友现在可以接第 ' + next + ' 棒';
  const live = s.modState === 'pending' || s.modState === 'passed' || s.modState === 'marker';
  const mine = s.mine && s.mine.marker ? { marker: s.mine.marker } : s.kind === 'draw' ? { strokes: s.mine && s.mine.strokes } : { text: s.mine && s.mine.text };
  const modText = s.modState === 'marker' ? '时间到，已自动交出' + copy.markerText(s.mine && s.mine.marker) : MOD_TEXT[s.modState];
  return Object.assign(
    {
      chainId: s.chainId,
      step: s.step,
      kind: s.kind,
      mine,
      modState: s.modState,
      modText,
      nextText,
      autoUpdateNote: !!(s.updatableCard && live),
      subscribe: { state: s.subscribe },
      firstTimeExplainer: !!s.firstTimeExplainer,
      revealed: !!s.revealed,
      scrollY: s.scrollY || 0,
    },
    common(cm)
  );
}

// ------------------------------------------------------------------------------------------------------------------ entry

function etaText(sec) {
  if (typeof sec !== 'number' || sec <= 0) return null;
  return '约 ' + Math.max(1, Math.ceil(sec / 60)) + ' 分钟内';
}

/** e = { state, resp (the getChain response or null), claiming, subscribe, limitCode, errorText, scrollY } */
function entryVm(e, cm) {
  const r = e.resp || {};
  const state = e.state;
  const base = {
    state,
    passed: r.passed || 0,
    length: r.length || CONFIG.chain.length,
    nextStep: r.nextStep || null,
    nextKind: r.nextKind || null,
    pendingStep: r.pendingStep,
    removedReason: r.removedReason,
  };
  const c = copy.entryCopy(base);
  let headline = c.headline;
  let subline = c.subline;
  if (state === 'dailyLimit') {
    headline = codes.textFor(e.limitCode || 'STEP_LIMIT');
    subline = null;
  } else if (state === 'restricted') {
    headline = '你暂时不能参与接龙';
    subline = null;
  } else if (state === 'rulesRequired') {
    subline = '先同意接龙公约，就能接这一棒';
  } else if (state === 'ugcPaused') {
    headline = PAUSED_TEXT;
    subline = null;
  } else if (state === 'error') {
    headline = e.errorText || c.headline;
  }
  const restrictedUntil = r.restrictedUntil;
  return Object.assign(
    {
      state,
      passed: base.passed,
      length: base.length,
      nextStep: base.nextStep,
      nextKind: base.nextKind,
      headline,
      subline,
      timeLeftText: state === 'loading' || state === 'offline' || state === 'error' ? null : copy.timeLeftText(r.timeLeftMs),
      takenEtaText: state === 'taken' ? etaText(r.takenEtaSec) : null,
      isParticipant: !!r.isParticipant,
      isStarter: !!r.isStarter,
      canRevealNow: !!r.canRevealNow && state !== 'loading',
      pendingStep: r.pendingStep || null,
      subscribe: { state: e.subscribe || 'hidden' },
      claiming: !!e.claiming,
      restrictionText: state === 'restricted' ? strikes.restrictionText({ until: restrictedUntil || 0, permanent: restrictedUntil >= strikes.FOREVER }) : null,
      scrollY: e.scrollY || 0,
    },
    common(cm)
  );
}

// -------------------------------------------------------------------------------------------- overview / step-through / teaser

/**
 * One overview card's final step from a getRoomReveal card (+ the loaded drawing of a getReveal answer, for a drawn final).
 * c = {chainNo, chainId, mineStarted, finalKind, finalText?, finalMarker?, placeholder?}; loaded = { strokes } | null
 */
function overviewFinal(c, loaded) {
  if (c.placeholder) return { kind: c.finalKind === 'draw' ? 'draw' : c.finalKind === 'marker' ? 'marker' : 'describe', placeholder: c.placeholder, loaded: true };
  if (c.finalKind === 'marker') return { kind: 'marker', marker: c.finalMarker, placeholder: null, loaded: true };
  if (c.finalKind === 'describe') return { kind: 'describe', text: c.finalText || '', placeholder: null, loaded: true };
  if (loaded && loaded.strokes) return { kind: 'draw', strokes: loaded.strokes, placeholder: null, loaded: true };
  if (loaded && loaded.placeholder) return { kind: 'draw', placeholder: loaded.placeholder, loaded: true };
  return { kind: 'draw', strokes: strokesLib.empty(1024), placeholder: null, loaded: false };
}

/** o = { state, roomId, n, rounds, cards:[{card, loaded, unseen}], rematchBanner, rematchRoomId, canShare, interstitialDue, scrollY } */
function overviewVm(o, cm) {
  const cards = (o.cards || []).map((x) => ({ chainNo: x.card.chainNo, chainId: x.card.chainId, mineStarted: !!x.card.mineStarted, unseen: !!x.unseen, final: overviewFinal(x.card, x.loaded) }));
  const ready = o.state === 'ready' || o.state === 'paused';
  const rematch = { label: '再来一局', banner: o.rematchBanner ? '房主开了新的一局 · 加入 ›' : null };
  if (o.rematchRoomId) rematch.newRoomId = o.rematchRoomId;
  return Object.assign(
    {
      state: o.state,
      roomId: o.roomId,
      title: '全部揭晓！',
      subtitle: ready && o.n ? o.n + ' 条接龙 · 每条传了 ' + o.rounds + ' 棒' : '',
      cards: ready ? cards : [],
      rematch,
      canShare: !!o.canShare,
      interstitialDue: !!o.interstitialDue,
      scrollY: o.scrollY || 0,
    },
    common(cm)
  );
}

/** the latest visible sentence of a step list (edge 28) */
function finalSentence(steps) {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].kind === 'describe' && !steps[i].placeholder && steps[i].text) return steps[i].text;
  return null;
}

/**
 * A getReveal answer -> the step-through steps (index 0 = 起点 ... last = final), with the labels of CONTRACT.md.
 */
function stepsOf(resp) {
  const out = [];
  const pr = resp.prompt || {};
  const paused = pr.text === null && !pr.custom && resp.steps.length > 0 && resp.steps.every((s) => s.placeholder === 'paused');
  out.push({
    n: 0, label: '起点', kind: 'prompt', mine: !!pr.mine,
    placeholder: pr.text === null || pr.text === undefined ? (paused || (resp.steps[0] && resp.steps[0].placeholder === 'paused') ? 'paused' : 'reported') : null,
    laughs: 0, myLaugh: false, canLaugh: false, canReport: !!pr.canReport,
  });
  if (!out[0].placeholder) out[0].text = pr.text;
  const last = resp.steps.length ? resp.steps[resp.steps.length - 1].n : 0;
  for (const s of resp.steps) {
    const isMarker = !!s.marker && !s.placeholder;
    const row = {
      n: s.n,
      label: '第 ' + s.n + ' 棒 · ' + (s.kind === 'draw' ? '画' : '猜') + (s.n === last ? ' · 最后一棒' : ''),
      kind: isMarker ? 'marker' : s.kind,
      mine: !!s.mine,
      placeholder: s.placeholder || null,
      laughs: s.laughs || 0,
      myLaugh: !!s.myLaugh,
      canLaugh: !!s.canLaugh && !isMarker && !s.placeholder,
      canReport: !!s.canReport && !isMarker && !s.placeholder,
    };
    if (!row.placeholder) {
      if (isMarker) row.marker = s.marker;
      else if (s.kind === 'draw') row.strokes = s.strokes;
      else row.text = s.text;
    }
    out.push(row);
  }
  return out;
}

/**
 * s = { state, mode, roomId, chainId, chainNo, chainCount, mineStarted, resp (getReveal ok or null), steps, index, playT, nextChain, canShare, interstitialDue,
 *       backLabel }
 */
function stepthroughVm(s, cm) {
  const steps = s.steps || [];
  const resp = s.resp;
  const live = s.mode === 'live';
  const paused = steps.length > 0 && steps.every((x) => x.placeholder === 'paused');
  const state = s.state === 'ready' && paused ? 'paused' : s.state;
  const index = steps.length ? Math.max(0, Math.min(steps.length - 1, s.index)) : 0;
  let header = '';
  if (resp) {
    header = live ? '第 ' + s.chainNo + ' 条' + (s.mineStarted ? ' · 你起的' : '') : '接龙揭晓 · ' + resp.participantCount + ' 位群友';
  }
  const endAction = steps.length && index === 0 ? (live && s.nextChain ? 'nextChain' : 'done') : null;
  const out = {
    state,
    mode: s.mode,
    chainId: s.chainId,
    header,
    earlyText: resp ? copy.earlyText(resp) : null,
    backLabel: s.backLabel || (live ? '全部' : '返回'),
    steps,
    index,
    playT: typeof s.playT === 'number' ? s.playT : 1,
    dots: { show: steps.length > 1, text: steps.length > 1 ? index + 1 + '/' + steps.length : null },
    canPrev: index > 0,
    canNext: steps.length > 0 && index < steps.length - 1,
    endAction,
    canShare: !!s.canShare,
    interstitialDue: !!s.interstitialDue,
  };
  if (live) {
    out.roomId = s.roomId;
    out.chainNo = s.chainNo;
    out.chainCount = s.chainCount;
  }
  return Object.assign(out, common(cm));
}

/** t = { state, kind:'chain'|'room', teaser (the server teaser or null), scrollY } */
function teaserVm(t, cm) {
  const k = t.teaser || {};
  const ready = t.state === 'ready' || t.state === 'offline';
  let lines = [];
  let title;
  if (t.kind === 'room') {
    title = '一局传画揭晓了' + (ready && k.n ? ' · ' + k.n + ' 条接龙' : '');
    lines = ready && Array.isArray(k.lines) ? k.lines.map((l) => ({ from: l.from || '', to: l.to || null })) : [];
  } else {
    title = '一条接龙揭晓了';
    lines = ready && k.promptText ? [{ from: k.promptText, to: k.finalText || null }] : [];
  }
  const out = { state: t.state, kind: t.kind === 'room' ? 'room' : 'chain', title, lines, paused: !!k.paused, scrollY: t.scrollY || 0 };
  if (t.kind !== 'room') out.passed = k.passed || 0;
  return Object.assign(out, common(cm));
}

// ------------------------------------------------------------------------------------------------------------- group / album

/** b = { show, reservedHeight, stub } */
function bannerVm(b) {
  return b ? { show: !!b.show, reservedHeight: b.reservedHeight || 0, stub: !!b.stub } : { show: false, reservedHeight: 0, stub: false };
}

/** g = { state, resp (getGroupChains ok or null), banner, scrollY, nowMs } */
function groupVm(g, cm) {
  const r = g.resp;
  const ready = (g.state === 'ready' || g.state === 'empty') && r;
  const rooms = ready
    ? (r.rooms || []).map((x) => ({
        roomId: x.roomId,
        line: x.state === 'lobby' ? (x.joined || 0) + ' 人已加入 · 等待开始' : x.round === 0 ? '选题进行中' : '第 ' + (x.round || 1) + '/' + (x.rounds || 1) + ' 轮进行中',
        joinable: !!x.joinable,
      }))
    : [];
  const waiting = ready ? r.waiting.map((x) => ({ chainId: x.chainId, line: copy.groupWaitingLine(x) })) : [];
  const inProgress = ready ? r.inProgress.map((x) => ({ chainId: x.chainId, line: copy.groupInProgressLine(x) })) : [];
  const revealed = ready
    ? r.revealed.map((x) =>
        x.kind === 'room'
          ? { kind: 'room', id: x.roomId, line: '一局 · ' + x.n + ' 条接龙 · ' + whenText(x.revealedAt, g.nowMs || 0), member: !!x.member }
          : { kind: 'chain', id: x.chainId, line: copy.groupRevealedLine(x.promptText, x.finalText), member: !!x.participant }
      )
    : [];
  const st = ready && r.stats && ((r.stats.rooms || 0) + r.stats.revealed > 0 || r.stats.drawings > 0) ? copy.groupStatsText(r.stats) : null;
  return Object.assign(
    { state: g.state, statsText: g.state === 'ready' ? st : null, rooms, waiting, inProgress, revealed, banner: bannerVm(g.banner), scrollY: g.scrollY || 0 },
    common(cm)
  );
}

const ALBUM_ROOM_STATUS = { revealed: 'revealed', playing: 'playing', lobby: 'lobby', removed: 'removed', closed: 'removed' };

/** one 我的接龙 row (a getMyChains item, room or chain) -> { kind, id, status, line, timeText, unseen } */
function albumRow(it, nowMs) {
  if (it.kind === 'room') {
    const status = ALBUM_ROOM_STATUS[it.status] || 'removed';
    let line;
    if (it.status === 'revealed') line = '一局 · ' + (it.n || 0) + ' 条接龙' + (it.left ? '（中途离开）' : '');
    else if (it.status === 'playing') line = it.round === 0 ? '一局 · 选题进行中' : '一局 · 第 ' + (it.round || 1) + '/' + (it.rounds || 1) + ' 轮进行中';
    else if (it.status === 'lobby') line = '一局 · 等待开始';
    else if (it.status === 'closed') line = '一局 · 已关闭';
    else line = '该局已被移除';
    return { kind: 'room', id: it.roomId, status, line, timeText: whenText(it.revealedAt || it.lastActivityAt, nowMs), unseen: !!it.unseen };
  }
  return {
    kind: 'chain',
    id: it.chainId,
    status: it.status,
    line: it.line !== undefined ? it.line : copy.albumLine(it),
    timeText: it.timeText !== undefined ? it.timeText : whenText(it.revealedAt || it.lastActivityAt, nowMs),
    unseen: !!it.unseen,
  };
}

/** a = { state, items (getMyChains items or already-built rows), cursor, streak, streakText, banner, scrollY, nowMs } */
function albumVm(a, cm) {
  const items = (a.items || []).map((it) => (it.id && it.line !== undefined && it.timeText !== undefined && it.kind ? it : albumRow(it, a.nowMs)));
  return Object.assign(
    {
      state: a.state,
      streakText: a.streakText !== undefined ? a.streakText : a.streak ? allowance.streakText(a.streak) : null,
      items,
      cursor: a.cursor || null,
      banner: bannerVm(a.banner),
      scrollY: a.scrollY || 0,
    },
    common(cm)
  );
}

const MINE_LINE = { pending: '审核中', passed: '已通过', marker: '时间到，已自动交出', blocked: '没通过审核', void: '审核超时', hidden: '已被举报隐藏', deleted: '已删除' };

/** m = { state, chainId, rows (getMyChains{chainId}.mine), scrollY } */
function mineVm(m, cm) {
  const mine = (m.rows || []).map((r) => {
    const o = { n: r.n, kind: r.kind, modState: r.marker ? 'marker' : r.modState, canDelete: !!r.canDelete && !r.marker, line: '第 ' + r.n + ' 棒 · ' + (MINE_LINE[r.marker ? 'marker' : r.modState] || r.modState) };
    if (r.marker) o.marker = r.marker;
    else {
      if (r.strokes) o.strokes = r.strokes;
      if (r.text) o.text = r.text;
    }
    return o;
  });
  return Object.assign({ state: m.state, chainId: m.chainId, mine, scrollY: m.scrollY || 0 }, common(cm));
}

/** r = { open, target:{chainId, step, roomId?}, state, selected } */
function reportVm(r, cm) {
  const target = { chainId: r.target.chainId, step: r.target.step };
  if (r.target.roomId) target.roomId = r.target.roomId;
  return Object.assign({ open: !!r.open, target, reasons: CONFIG.reports.reasons.slice(), state: r.state, selected: r.selected || null }, common(cm));
}

/** o = { dialog, toast, adStub } */
function overlayVm(o, display) {
  const out = { display: displayVm(display) };
  if (o.dialog) out.dialog = { title: o.dialog.title, text: o.dialog.text, confirmLabel: o.dialog.confirmLabel, cancelLabel: o.dialog.cancelLabel, danger: !!o.dialog.danger };
  if (o.toast) out.toast = { text: o.toast.text };
  if (o.adStub) out.adStub = { kind: o.adStub.kind, secondsLeft: o.adStub.secondsLeft };
  return out;
}

module.exports = {
  displayVm, common, homeVm, rulesVm, termsVm, warningVm, howtoVm, settingsVm, pickVm, drawVm, describeVm, roundWaitVm, lobbyVm, roomEntryVm, sentVm, entryVm,
  overviewVm, overviewFinal, stepsOf, stepthroughVm, teaserVm, groupVm, albumVm, albumRow, mineVm, reportVm, overlayVm, paletteVm, sourceVm, mineVmOf, finalSentence, etaText,
  LIMIT_TEXT, PATH_LIMIT_TEXT, PAUSED_TEXT, PLACEHOLDER, MOD_TEXT, SLOW_LABEL, ROOM_ENTRY,
};
