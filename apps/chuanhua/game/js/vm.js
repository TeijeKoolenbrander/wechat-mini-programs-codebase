/**
 * View-model builders: one per spec screen (spec 12, an exact match with the field names there; extra fields
 * the renderers may use are marked `extra`). Pure functions: plain data in, plain data out, with every string
 * pre-formatted here (renderers own only fixed chrome and button labels), so QA can unit-test each screen
 * state without a canvas. js/CONTRACT.md lists the hit ids each screen emits.
 */

const { CONFIG } = require('../core/config');
const C = require('../core/chain');
const Pl = require('../core/players');
const St = require('../core/strokes');
const Tx = require('../core/text');
const { timeLeftText, durationText, thousands, dateText } = require('./util');

// ---------------------------------------------------------------- copy (single source)

const COPY = {
  offlineStart: '需联网才能接龙',
  offlineReveal: '揭晓需联网查看',
  groupDown: '本群接龙暂时打不开',
  ugcPaused: '接龙维护中，可以先看看已揭晓的接龙',
  startsUsed: '今天的 3 条已开完',
  startsUsedHint: '明天再来开新的吧',
  wrongGroup: '接龙只能在发起的群里接力',
  timeUp: '时间到，这一棒交给别人吧',
  claimLost: '超时了，这一棒已被群友接走',
  textBlocked: '这句话没通过审核，换个说法吧',
  textBusy: '审核服务繁忙，请稍后再试',
  textLocal: '换个说法吧',
  promptBlocked: '这个题目不太合适，换一个吧',
  promptBusy: '审核服务繁忙，请稍后再试，或先选一个现成的题目',
  stepLimit: '今天接得够多啦，明天再来',
  pointLimit: '画得太细啦，先交吧',
  coachDraw: '一根手指画，画得丑没关系，越离谱越好笑',
  hiddenReported: '该内容已被举报隐藏',
  hiddenDeleted: '作者已删除这一棒',
  paused: '内容维护中',
};

// ---------------------------------------------------------------- Home

function restrictionText(r) {
  if (!r) return null;
  const when = r.permanent || !r.until ? '' : '（至 ' + Pl.untilText(r.until) + '）';
  return '你暂时不能参与接龙' + when + '。原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。';
}

/**
 * h = { state, dateKey, prompts:[{id,text}], counts:{[id]:n}, streak, startsLeft, adStartsLeft, adState,
 *       waitingInGroup:number|null, hasGroupContext, unseenReveals, restriction, ugcPaused, warnPending, showHowTo }
 */
function homeVm(h) {
  const startsLeft = h.startsLeft === undefined ? CONFIG.allowances.startsFree : h.startsLeft;
  const adLeft = h.adStartsLeft === undefined ? CONFIG.allowances.startsAd : h.adStartsLeft;
  const total = (h.prompts || []).reduce((s, p) => s + ((h.counts && h.counts[p.id]) || 0), 0);
  const usable = h.state === 'ready' && !h.restriction && !h.ugcPaused;
  const used = startsLeft <= 0;
  const start = {
    freeLeft: Math.min(CONFIG.allowances.startsFree, startsLeft),
    adLeft,
    label: used ? COPY.startsUsed : '开一条接龙',
    sublabel: h.state !== 'ready' ? null : used ? (adLeft > 0 ? null : COPY.startsUsedHint) : '今天还能开 ' + startsLeft + ' 条',
    enabled: usable && !used,
    adLabel: used && adLeft > 0 && usable ? '▶ 看视频再开一条 (剩 ' + adLeft + ')' : null, // extra
    adState: h.adState || 'idle', // extra: idle|loading|playing|error
  };
  return {
    state: h.state,
    daily: {
      dateText: dateText(h.dateKey),
      prompts: h.prompts || [],
      countText: total >= CONFIG.daily.nationalCountMin ? '全国已有 ' + thousands(total) + ' 条从这里出发' : null,
    },
    streakText: Pl.streakText(h.streak || 0),
    start,
    groupLine: {
      show: !!h.hasGroupContext,
      text: h.waitingInGroup > 0 ? '来自群聊 · 本群有 ' + h.waitingInGroup + ' 条等你接' : '来自群聊 · 本群接龙',
    },
    album: { unseenReveals: h.unseenReveals || 0 },
    restriction: h.restriction ? { text: restrictionText(h.restriction) } : null,
    ugcPausedText: h.ugcPaused ? COPY.ugcPaused : null,
    showHowToOnce: !!h.showHowTo,
    showRulesWarning: !!h.warnPending,
    offlineText: h.state === 'offline' || h.state === 'error' ? COPY.offlineStart : null, // extra
  };
}

// ---------------------------------------------------------------- Rules sheet

function rulesVm(r, lines) {
  return { version: CONFIG.rulesVersion, open: !!r.open, pendingAction: r.pendingAction || null, lines: lines || [] /* extra */ };
}

// ---------------------------------------------------------------- Picker

/** p = { state, prompts:[{id,text,isDaily}], selectedId, custom:{open,text}, errorText } */
function pickerVm(p) {
  const custom = p.custom || { open: false, text: '' };
  const n = Tx.countCp(custom.text || '');
  const sel = p.selectedId;
  const customOk = custom.open ? n >= CONFIG.text.promptMin && n <= CONFIG.text.promptMax : false;
  return {
    state: p.state,
    prompts: p.prompts || [],
    selectedId: sel || null,
    custom: { open: !!custom.open, text: custom.text || '', count: n + '/' + CONFIG.text.promptMax, error: custom.error || null },
    canStart: p.state === 'ready' && (custom.open ? customOk : !!sel),
    errorText: p.errorText || null,
    drawSec: CONFIG.timers.drawSec, // extra
    startLabel: p.state === 'creating' ? '准备画布…' : custom.open ? '确定' : '开始画 (' + CONFIG.timers.drawSec + ' 秒)', // extra
  };
}

// ---------------------------------------------------------------- Draw

// the palette is the same every frame: two shared arrays (locked / unlocked) instead of 12 new objects per frame
const PALETTES = {};
function paletteVm(unlocked) {
  const k = unlocked ? 'open' : 'locked';
  if (!PALETTES[k]) PALETTES[k] = CONFIG.palette.map((color, idx) => ({ idx, color, locked: idx >= CONFIG.baseColors && !unlocked, name: CONFIG.paletteNames[idx] }));
  return PALETTES[k];
}

/** d = { turn, tool info, drawing (for render), unlocked, paletteAdState, paletteAdOffered, status, errorText, now } */
function drawVm(d) {
  const t = d.turn;
  const info = d.info;
  const timer = C.turnTimer('draw', t.startedAt, d.now, d.cfg);
  const palette = paletteVm(!!d.unlocked);
  return {
    chainId: t.chainId,
    claimId: t.claimId,
    step: t.step,
    title: '第 ' + t.step + ' 棒 · 画出来',
    source: t.source, // { kind: 'prompt'|'text', text }
    sourceLabel: t.step === 1 ? '题目：「' + t.source.text + '」' : '上一棒说：「' + t.source.text + '」', // extra
    canReport: t.step > 1,
    timer: { secLeft: timer.secLeft, warn: timer.warn, text: C.mmss(timer.secLeft) },
    palette,
    colorIdx: info.colorIdx,
    sizeIdx: info.sizeIdx,
    strokes: d.drawing,
    pointsUsed: info.points,
    pointsMax: info.pointsMax,
    paletteAd: { show: !!d.paletteAdOffered && !d.unlocked && info.strokes === 0, state: d.paletteAdState || 'idle' },
    canUndo: info.canUndo,
    canSubmit: info.strokes > 0 && d.status === 'drawing',
    status: d.status,
    errorText: d.errorText || null,
    notice: info.limit ? COPY.pointLimit : null, // extra
    coach: d.coach ? COPY.coachDraw : null, // extra
    confirmClear: !!d.confirmClear, // extra
    brushNames: CONFIG.brushNames, // extra
    brushSizes: CONFIG.brushSizes, // extra
  };
}

// ---------------------------------------------------------------- Describe

/** d = { turn, text, status, errorText, now, shake } */
function describeVm(d) {
  const t = d.turn;
  const timer = C.turnTimer('describe', t.startedAt, d.now, d.cfg);
  const n = Tx.countCp(d.text || '');
  return {
    chainId: t.chainId,
    claimId: t.claimId,
    step: t.step,
    title: '第 ' + t.step + ' 棒 · 猜一猜',
    drawing: t.source.strokes,
    canReport: true,
    timer: { secLeft: timer.secLeft, warn: timer.warn, text: C.mmss(timer.secLeft) },
    text: d.text || '',
    count: n + '/' + CONFIG.text.descMax,
    canSubmit: n >= CONFIG.text.descMin && d.status === 'typing',
    status: d.status,
    errorText: d.errorText || null,
    placeholder: '你觉得这画的是什么？', // extra
    focused: d.status === 'typing' || d.status === 'blocked' || d.status === 'busy' || d.status === 'error', // extra: caret shown
    shake: !!d.shake, // extra
  };
}

// ---------------------------------------------------------------- 已传出

const MOD_TEXT = {
  pending: '审核中，通过后传给下一位',
  passed: '已通过',
  blocked: '这一棒没通过内容审核，没有传出去',
  void: '审核超时，这一棒没有传出去，不算你的次数',
};

/** s = { chainId, step, kind, mine:{strokes?,text?}, modState, subscribe, firstTime, revealed, updatable, nextKind } */
function sentVm(s) {
  const next = s.step + 1;
  return {
    chainId: s.chainId,
    step: s.step,
    kind: s.kind,
    mine: s.mine,
    modState: s.modState,
    modText: MOD_TEXT[s.modState] || '',
    nextText: s.modState === 'blocked' || s.modState === 'void' || s.revealed ? null : '通过后，群友就能接第 ' + next + ' 棒',
    autoUpdateNote: !!s.updatable && s.modState !== 'blocked' && s.modState !== 'void',
    subscribe: { state: s.subscribe || 'hidden' },
    firstTimeExplainer: !!s.firstTime,
    explainerText: s.firstTime ? '你只能看到上一棒，下一位也只能看到你这一棒。全部传完后，参与的人一起看揭晓。' : null, // extra
    revealed: !!s.revealed,
    title: '第 ' + s.step + ' 棒已传出', // extra
    canShare: !s.revealed && s.modState !== 'blocked' && s.modState !== 'void', // extra
  };
}

// ---------------------------------------------------------------- Chain entry

const LIMIT_TEXT = { CAP_REACHED: '这条接龙你已经接了 3 棒，留给群友吧', STEP_LIMIT: COPY.stepLimit, CLAIM_LIMIT: '今天在这条接龙上的次数用完啦，明天再来' };

/** e = getChain result (+ state override for loading/offline/error), viewer extras: subscribeState */
function entryVm(e) {
  const state = e.state;
  const passed = e.passed || 0;
  const nextStep = e.nextStep || passed + 1;
  const nextKind = e.nextKind || null;
  let headline = '';
  let subline = null;
  let limitText = null;
  let primary = null;
  const kindLine = nextKind === 'describe' ? '上一棒是一幅画，你来猜一句' : '上一棒是一句话，你来画出来';
  switch (state) {
    case 'loading':
      headline = '展开接龙…';
      break;
    case 'claimable':
      headline = '第 ' + nextStep + ' 棒等你接';
      subline = kindLine;
      limitText = '（限时 ' + (nextKind === 'draw' ? CONFIG.timers.drawSec : CONFIG.timers.describeSec) + ' 秒）';
      primary = { label: '接这一棒', enabled: true };
      break;
    case 'rulesRequired':
      headline = '第 ' + nextStep + ' 棒等你接';
      subline = kindLine;
      primary = { label: '接这一棒', enabled: true, opensRules: true };
      break;
    case 'taken':
      headline = '有群友正在接第 ' + nextStep + ' 棒（' + CONFIG.chain.takenEtaText + '）';
      break;
    case 'pending':
      headline = '第 ' + nextStep + ' 棒审核中，通常几分钟';
      break;
    case 'prevMine':
      headline = '上一棒是你传的，等别人接下一棒吧';
      break;
    case 'capReached':
      headline = LIMIT_TEXT[e.code] || LIMIT_TEXT.CAP_REACHED;
      break;
    case 'wrongGroup':
      headline = COPY.wrongGroup;
      break;
    case 'revealedParticipant':
      headline = '接龙揭晓了！';
      primary = { label: '看揭晓', enabled: true };
      break;
    case 'revealedTeaser':
      headline = '一条接龙揭晓了';
      break;
    case 'expired':
      headline = '这条接龙没传完';
      break;
    case 'removed':
      headline = '该接龙已被移除';
      break;
    case 'notFound':
      headline = '找不到这条接龙';
      break;
    case 'restricted':
      headline = restrictionText({ until: e.until, permanent: !e.until });
      break;
    case 'ugcPaused':
      headline = COPY.ugcPaused;
      break;
    case 'offline':
      headline = COPY.offlineStart;
      break;
    default:
      headline = '出错了';
  }
  const live = state === 'claimable' || state === 'taken' || state === 'pending' || state === 'prevMine' || state === 'capReached' || state === 'rulesRequired' || state === 'wrongGroup';
  return {
    state,
    passed,
    length: CONFIG.chain.length,
    nextStep: live ? nextStep : null,
    nextKind: live ? nextKind : null,
    headline,
    subline,
    timeLeftText: live && e.expiresAt ? timeLeftText(e.expiresAt - (e.serverNow || 0)) : null,
    takenEtaText: state === 'taken' ? CONFIG.chain.takenEtaText : null,
    isParticipant: !!e.isParticipant,
    isStarter: !!e.isStarter,
    canRevealNow: !!e.canRevealNow && live,
    canSameAgain: !!e.canSameAgain && (state === 'expired' || state === 'revealedTeaser' || state === 'revealedParticipant'),
    subscribe: { state: e.subscribe || 'hidden' },
    progressText: '已传 ' + passed + '/' + CONFIG.chain.length + ' 棒', // extra
    limitText, // extra
    primary, // extra
    showOthers: live || state === 'expired' || state === 'revealedTeaser', // extra: 看看本群其他接龙
    showNew: state === 'wrongGroup' || state === 'taken' || state === 'removed' || state === 'notFound' || state === 'expired', // extra: 开一条新的
    canShare: !!e.isParticipant && live && state !== 'wrongGroup', // extra: invite card
    canSeeMine: state === 'expired' && !!e.isParticipant, // extra: 看我的那一棒
    retry: state === 'offline' || state === 'error', // extra
    confirmReveal: !!e.confirmReveal, // extra
    notice: state === 'claimable' ? e.notice || null : null, // extra: e.g. 上一棒已隐藏，你可以接这一棒
  };
}

// ---------------------------------------------------------------- Reveal

const T_PROMPT = 800;
const T_DRAW = 2500;
const T_TEXT = 600;
const T_GAP = 400;

/** The auto-play timeline for a list of visible panels (the prompt first). Returns [{ idx, kind, start, end }] and total ms. */
function revealTimeline(steps) {
  const panels = [{ idx: -1, kind: 'prompt', dur: T_PROMPT }];
  steps.forEach((s, i) => {
    if (s.placeholder) return; // hidden/deleted panels are skipped (AC 82)
    panels.push({ idx: i, kind: s.kind, dur: s.kind === 'draw' ? T_DRAW : T_TEXT });
  });
  let t = 0;
  const out = panels.map((p, k) => {
    const start = t;
    t += p.dur + (k < panels.length - 1 ? T_GAP : 0);
    return { idx: p.idx, kind: p.kind, start, end: start + p.dur };
  });
  return { panels: out, total: t };
}

/** A drawing truncated to progress p in [0,1] by point count (so any stroke count replays in the same time). */
function drawingAt(drawing, p) {
  if (!drawing) return null;
  if (p >= 1) return drawing;
  const total = St.pointCount(drawing);
  let budget = Math.floor(total * Math.max(0, p));
  const out = { v: drawing.v, s: [] };
  for (const st of drawing.s) {
    const n = St.strokePointCount(st);
    if (budget <= 0) break;
    if (n <= budget) {
      out.s.push(st);
      budget -= n;
    } else {
      out.s.push(st.slice(0, 4 + (budget - 1) * 2));
      budget = 0;
    }
  }
  return out;
}

/** Visible texts for the summary line (edge cases 27/28). */
function summaryOf(promptText, steps, passed) {
  let finalText = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].kind === 'describe' && !steps[i].placeholder && steps[i].text) {
      finalText = steps[i].text;
      break;
    }
  }
  if (promptText && finalText) return '从「' + promptText + '」传成了「' + finalText + '」';
  return '传了 ' + passed + ' 棒';
}

/**
 * r = getReveal result; extra: autoplay { enabled, playing, startedAt }, laughs overrides, viewer; now
 * Returns the spec Reveal vm. `play` (extra) gives the renderer per-panel progress for the animation.
 */
function revealVm(r) {
  const base = { chainId: r.chainId, interstitialDue: !!r.interstitialDue };
  if (r.state !== 'ready') {
    return Object.assign(base, {
      state: r.state,
      header: '',
      early: false,
      earlyText: null,
      prompt: { text: '', custom: false },
      steps: [],
      summaryText: '',
      nationalText: null,
      autoplay: { enabled: false, panel: 0, playing: false, progress: 0 },
      canSameAgain: false,
      messageText: r.state === 'offline' || r.state === 'error' ? COPY.offlineReveal : r.state === 'paused' ? COPY.paused : r.state === 'loading' ? '正在展开…' : null, // extra
    });
  }
  const d = r.data;
  const rows = d.steps.map((s) => ({
    n: s.n,
    kind: s.kind,
    strokes: s.strokes,
    text: s.text,
    mine: !!s.mine,
    placeholder: s.placeholder || null,
    placeholderText: s.placeholder === 'reported' ? COPY.hiddenReported : s.placeholder === 'deleted' ? COPY.hiddenDeleted : s.placeholder === 'paused' ? COPY.paused : null, // extra
    laughs: s.laughs,
    myLaugh: !!s.myLaugh,
    canReport: !s.mine && !s.placeholder,
    label: '第' + s.n + '棒' + (s.mine ? ' (你)' : ''), // extra
  }));
  const tl = revealTimeline(rows);
  const ap = r.autoplay || { enabled: false, playing: false, startedAt: 0 };
  const el = ap.playing ? Math.max(0, r.now - ap.startedAt) : tl.total + 1;
  let panel = 0;
  tl.panels.forEach((p, k) => {
    if (el >= p.start) panel = k;
  });
  const cur = tl.panels[panel];
  const curProgress = ap.playing && cur ? Math.max(0, Math.min(1, (el - cur.start) / (cur.end - cur.start))) : 1; // progress inside the current panel
  const play = rows.map(() => ({ shown: true, progress: 1 }));
  if (ap.playing) {
    tl.panels.forEach((p) => {
      if (p.idx < 0) return;
      const shown = el >= p.start;
      const prog = !shown ? 0 : Math.max(0, Math.min(1, (el - p.start) / (p.end - p.start)));
      play[p.idx] = { shown, progress: prog };
    });
    rows.forEach((row, i) => {
      if (row.placeholder) play[i] = { shown: true, progress: 1 };
    });
  }
  const promptShown = !ap.playing || el >= 0;
  return Object.assign(base, {
    state: 'ready',
    header: '接龙揭晓 · ' + d.participantCount + ' 位群友 · ' + durationText(d.durationMs),
    early: !!d.early,
    earlyText: d.early ? '提前揭晓 · 传了 ' + d.passed + '/' + CONFIG.chain.length + ' 棒' : null,
    prompt: { text: d.promptText, custom: !!d.custom },
    steps: rows,
    summaryText: summaryOf(d.promptText, rows, d.passed),
    nationalText: d.nationalCount && d.promptText && !d.custom ? '今天全国 ' + thousands(d.nationalCount) + ' 条接龙从「' + d.promptText + '」出发' : null,
    autoplay: { enabled: !!ap.enabled, panel, playing: !!ap.playing, progress: curProgress },
    canSameAgain: !d.custom,
    play, // extra: per step { shown, progress 0..1 } (draw: replay fraction, describe: typed fraction)
    promptShown, // extra
    timeline: tl, // extra
  });
}

// ---------------------------------------------------------------- Teaser

function teaserVm(t) {
  return {
    state: t.state,
    promptText: t.promptText || '',
    finalText: t.finalText || null,
    passed: t.passed || 0,
    canSameAgain: !!t.canSameAgain && t.state === 'ready',
    notice: '完整接龙仅参与的群友可见', // extra
    summary: t.state === 'ready' ? (t.finalText ? '传了 ' + t.passed + ' 棒' : '传了 ' + t.passed + ' 棒，看看变成了什么') : '', // extra
  };
}

// ---------------------------------------------------------------- 本群接龙

const WHY_TEXT = { pending: (n) => '第 ' + n + ' 棒审核中', taken: (n) => '有群友在接第 ' + n + ' 棒', prevMine: (n) => '第 ' + n + ' 棒等别人来接', capReached: (n) => '第 ' + n + ' 棒你已接满，留给群友', restricted: (n) => '第 ' + n + ' 棒暂时接不了', rules: (n) => '第 ' + n + ' 棒需要先同意接龙公约', paused: (n) => '接龙维护中，第 ' + n + ' 棒稍后再接', closed: (n) => '第 ' + n + ' 棒已关闭', group: (n) => '第 ' + n + ' 棒要在发起的群里接' };

/** g = { state, data (getGroupChains), banner } */
function groupVm(g) {
  const d = g.data || {};
  const kindWord = (k) => (k === 'draw' ? '画一幅' : '猜一句');
  return {
    state: g.state,
    statsText: d.stats ? '本群已完成 ' + d.stats.revealed + ' 条 · 共画了 ' + d.stats.drawings + ' 幅画' : null,
    waiting: (d.waiting || []).map((c) => ({ chainId: c.chainId, line: '第 ' + c.nextStep + ' 棒 · ' + kindWord(c.nextKind) + ' · 已传 ' + c.passed + '/' + CONFIG.chain.length })),
    inProgress: (d.inProgress || []).map((c) => ({ chainId: c.chainId, line: (WHY_TEXT[c.why] || WHY_TEXT.taken)(c.nextStep) })),
    revealed: (d.revealed || []).map((c) => ({ chainId: c.chainId, line: c.finalText ? '「' + c.promptText + '」→「' + c.finalText + '」' : '「' + c.promptText + '」', participant: !!c.participant })),
    banner: g.banner || { show: false, reservedHeight: 0 },
    explainer: g.state === 'noGroup' || g.state === 'failed' ? '在群聊里点开接龙卡片，就能看到本群的接龙' : null, // extra
    emptyText: g.state === 'empty' ? '本群还没有接龙，开第一条吧' : null, // extra
    errorText: g.state === 'error' ? COPY.groupDown : null, // extra
  };
}

// ---------------------------------------------------------------- 我的接龙

function albumLine(it) {
  const mine = (it.mySteps || []).length ? (it.mySteps[0] === 1 && it.mySteps.length === 1 ? '我画了第 1 棒' : '我传了第 ' + it.mySteps.join('、') + ' 棒') : '';
  switch (it.status) {
    case 'revealed':
      return '已揭晓「' + (it.promptText || '') + '」';
    case 'open':
      return '进行中 ' + it.passed + '/' + CONFIG.chain.length + (mine ? ' · ' + mine : '');
    case 'pending':
      return '审核中 · 我' + (it.mySteps.length && it.mySteps[it.mySteps.length - 1] % 2 === 1 ? '画' : '写') + '的第 ' + it.mySteps[it.mySteps.length - 1] + ' 棒';
    case 'expired':
      return '没传完' + (it.promptText ? '「' + it.promptText + '」' : '');
    case 'blocked':
      return '这一棒没通过审核 · 第 ' + it.blockedStep + ' 棒';
    case 'removed':
      return '该接龙已被移除';
    default:
      return '';
  }
}

function clockText(ts, nowMs) {
  const d = new Date(ts + 8 * 3600e3);
  const n = new Date(nowMs + 8 * 3600e3);
  const hhmm = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  if (d.toISOString().slice(0, 10) === n.toISOString().slice(0, 10)) return '今天 ' + hhmm;
  const y = new Date(nowMs + 8 * 3600e3 - 86400e3);
  if (d.toISOString().slice(0, 10) === y.toISOString().slice(0, 10)) return '昨天 ' + hhmm;
  return d.getUTCMonth() + 1 + '月' + d.getUTCDate() + '日';
}

/** a = { state, items, cursor, streak, banner, now, stale } */
function albumVm(a) {
  return {
    state: a.state,
    streakText: Pl.streakText(a.streak || 0),
    items: (a.items || []).map((it) => ({ chainId: it.chainId, status: it.status, line: albumLine(it), timeText: clockText(it.at, a.now || 0), unseen: !!it.unseen })),
    cursor: a.cursor || null,
    banner: a.banner || { show: false, reservedHeight: 0 },
    emptyText: a.state === 'empty' ? '还没有接龙，去开一条吧' : null, // extra
    staleNote: a.state === 'offline' ? '离线中，显示上次的列表' : null, // extra
    offlineNote: a.state === 'offline' && (a.items || []).length > 0, // extra: the cached list is shown read-only
  };
}

/** Own-棒 detail. d = getMyChains({chainId}).items[0] */
function detailVm(d) {
  return {
    chainId: d.chainId,
    mine: (d.mine || []).map((m) => ({ n: m.n, kind: m.kind, strokes: m.strokes, text: m.text, modState: m.modState, canDelete: !!m.canDelete, modText: MOD_TEXT[m.modState] || (m.modState === 'hidden' ? COPY.hiddenReported : m.modState === 'deleted' ? COPY.hiddenDeleted : '') })),
  };
}

// ---------------------------------------------------------------- sheets, settings

function reportVm(r) {
  return {
    open: !!r.open,
    target: r.target || { chainId: null, step: 0 },
    reasons: CONFIG.report.reasons,
    reasonLabels: CONFIG.report.reasonLabels, // extra
    selected: r.reason || null, // extra
    reason: r.reason || null, // extra: the same value under the name the renderer reads
    state: r.state || 'idle',
    message: { done: '已举报，该内容已隐藏，我们会尽快核实', limit: '今天举报次数已达上限', dup: '你已举报过这条内容', error: '没举报成功，请重试', idle: '', submitting: '' }[r.state || 'idle'], // extra
  };
}

function settingsVm(s) {
  return {
    muted: !!s.muted,
    largeText: !!s.largeText,
    highContrast: !!s.highContrast,
    canUnlockPalette: !!s.canUnlockPalette,
    paletteUnlockedToday: !!s.paletteUnlockedToday,
    deleteAll: { state: s.deleteState || 'idle' },
    paletteAdState: s.paletteAdState || 'idle', // extra
    subscribeStatusText: s.subscribeNote || null, // extra
    version: s.version || '', // extra
  };
}

function howtoVm() {
  return {
    lines: ['1. 开一条接龙：选个题目，画出来。', '2. 发到群里，群友只能看到上一棒：是画就猜一句，是字就画出来。', '3. 传完 6 棒，参与的人一起看它变成了什么。'],
    footer: '所有画和字都会先审核再传给下一位。',
  };
}

module.exports = {
  COPY,
  restrictionText,
  homeVm,
  rulesVm,
  pickerVm,
  drawVm,
  describeVm,
  sentVm,
  entryVm,
  revealVm,
  revealTimeline,
  drawingAt,
  summaryOf,
  teaserVm,
  groupVm,
  albumVm,
  albumLine,
  detailVm,
  reportVm,
  settingsVm,
  howtoVm,
  MOD_TEXT,
  T_DRAW,
};
