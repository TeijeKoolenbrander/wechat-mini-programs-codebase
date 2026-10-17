'use strict';
/**
 * Pre-formatted strings (spec 8, 12: "strings are pre-formatted by logic, not by renderers"). Pure functions from the
 * server's raw fields to the copy the view models carry. The client vm builder (js/vm.js, wiring wave) and the tests use
 * these; renderers never format. Copy is the spec's wording; changing it is a content decision, not a code one.
 */

const { CONFIG } = require('./config');

/**
 * Marker steps (spec 5.8, PO-40): fixed system text standing in for a missing turn. They are stored with `marker` and no
 * content, need no moderation and cannot be reported, laughed at or deleted.
 *   emptyDraw    a drawing turn that ran out with 0 strokes
 *   emptyText    a describe turn that ran out with 0-1 valid characters
 *   notDelivered (live) the turn was sent but blocked, errored, timed out or was rejected locally: nobody learns why
 * `hint` = the free-play line for the player whose source is the marker, by what THEY make next.
 */
const MARKERS = {
  emptyDraw: { text: '（没来得及画）', hint: { draw: '上一棒没来得及画，你自由画一幅吧', describe: '上一棒没来得及画，你随便写一句吧' } },
  emptyText: { text: '（没来得及写）', hint: { draw: '上一棒没来得及写，你自由画一幅吧', describe: '上一棒没来得及写，你随便写一句吧' } },
  notDelivered: { text: '（这一棒没传过来）', hint: { draw: '上一棒没传过来，你自由画一幅吧', describe: '上一棒没传过来，你随便写一句吧' } },
};
const MARKER_KEYS = Object.keys(MARKERS);

/** is this a known marker key (no prototype names) */
function isMarker(m) {
  return typeof m === 'string' && MARKER_KEYS.indexOf(m) >= 0;
}

/** the marker text shown in a step ('（没来得及画）') */
function markerText(m) {
  return isMarker(m) ? MARKERS[m].text : '';
}

/** the free-play line for the player whose source is a marker; `nextKind` = what THEY now make ('draw' | 'describe') */
function markerHint(m, nextKind) {
  return isMarker(m) ? MARKERS[m].hint[nextKind === 'draw' ? 'draw' : 'describe'] : '';
}

/** hidden source (7.1): the strip text for a player who must play freely */
function hiddenHint(nextKind) {
  return '（该内容已被举报隐藏）' + (nextKind === 'draw' ? '你自由画一幅吧' : '你随便写一句吧');
}
const PAUSED_HINT = '内容维护中';

/** the empty marker for a turn of this kind: a drawing turn -> emptyDraw, a describe turn -> emptyText */
function emptyMarkerFor(kind) {
  return kind === 'draw' ? 'emptyDraw' : 'emptyText';
}

/** '4 人已加入（3–10 人）' (8.16) */
function joinedText(n, cfg) {
  const c = cfg || CONFIG.room;
  return n + ' 人已加入（' + c.minPlayers + '–' + c.maxPlayers + ' 人）';
}

function stepTitle(n) {
  return n % 2 === 1 ? '第 ' + n + ' 棒 · 画出来' : '第 ' + n + ' 棒 · 猜一猜';
}

function kindLabel(kind) {
  return kind === 'draw' ? '画一幅' : '猜一句';
}

function progressText(passed, length) {
  return '已传 ' + passed + '/' + (length || CONFIG.chain.length) + ' 棒';
}

/** '还剩 31 小时' / '还剩 40 分钟' */
function timeLeftText(ms) {
  if (typeof ms !== 'number') return null;
  if (ms <= 0) return '即将结束';
  const h = Math.ceil(ms / 3600e3);
  if (ms < 3600e3) return '还剩 ' + Math.max(1, Math.ceil(ms / 60e3)) + ' 分钟';
  return '还剩 ' + h + ' 小时';
}

/** '用时 5 小时' / '用时 40 分钟' */
function durationText(ms) {
  if (ms < 3600e3) return '用时 ' + Math.max(1, Math.round(ms / 60e3)) + ' 分钟';
  return '用时 ' + Math.round(ms / 3600e3) + ' 小时';
}

/** '接龙揭晓 · 6 位群友 · 用时 5 小时' */
function revealHeader(r) {
  return '接龙揭晓 · ' + r.participantCount + ' 位群友 · ' + durationText(r.durationMs);
}

/** '提前揭晓 · 传了 4/6 棒' for early and expiry reveals (AC 84), else null */
function earlyText(r) {
  return r.early ? '提前揭晓 · 传了 ' + r.passed + '/' + r.length + ' 棒' : null;
}

/** '从「A」传成了「B」' with the fallbacks of edge cases 27/28 */
function summaryText(promptText, finalText, passed) {
  if (promptText && finalText) return '从「' + promptText + '」传成了「' + finalText + '」';
  return '传了 ' + passed + ' 棒，看看变成了什么';
}

/** share card title for a reveal (9.3) */
function revealShareTitle(promptText, finalText, passed) {
  if (!promptText || !finalText) return '传了 ' + passed + ' 棒，看看变成了什么';
  return '「' + promptText + '」传了 ' + passed + ' 棒，变成了「' + finalText + '」';
}

/** invite card title (9.1) */
function inviteShareTitle(nextKind, nextStep) {
  return nextKind === 'draw' ? '第 ' + nextStep + ' 棒等你接，你来画画看？' : '第 ' + nextStep + ' 棒等你接，看看你能猜出什么？';
}

/** headline/subline of the chain entry screen per state (8.7); `v` is the getChain response */
function entryCopy(v) {
  const sec = v.nextKind === 'draw' ? CONFIG.timers.drawSec : CONFIG.timers.describeSec;
  const step = v.nextStep;
  switch (v.state) {
    case 'claimable':
    case 'rulesRequired':
    case 'restricted':
    case 'ugcPaused':
    case 'dailyLimit':
      return {
        headline: '第 ' + step + ' 棒等你接',
        subline: (v.nextKind === 'draw' ? '上一棒是一句话，你来画出来' : '上一棒是一幅画，你来猜一句') + '（限时 ' + sec + ' 秒，时间到会自动交出）',
      };
    case 'inRoom':
      return { headline: '你正在一局里，先玩完再来接', subline: null };
    case 'taken':
      return { headline: '有群友正在接第 ' + step + ' 棒（约 2 分钟内）', subline: null };
    case 'pending':
      return { headline: '第 ' + (v.pendingStep || step - 1) + ' 棒审核中，通常几分钟', subline: null };
    case 'prevMine':
      return { headline: '上一棒是你传的，等别人接下一棒吧', subline: null };
    case 'capReached':
      return { headline: '这条接龙你已经接了 ' + CONFIG.chain.maxPerPerson + ' 棒，留给群友吧', subline: null };
    case 'wrongGroup':
      return { headline: '接龙只能在发起的群里接力', subline: null };
    case 'revealedParticipant':
      return { headline: '接龙揭晓了！', subline: null };
    case 'revealedTeaser':
      return { headline: '一条接龙揭晓了', subline: null };
    case 'expired':
      return { headline: '这条接龙没传完', subline: null };
    case 'removed':
      return { headline: v.removedReason === 'reported' ? '该接龙已被举报隐藏' : '该接龙已被移除', subline: null };
    case 'notFound':
      return { headline: '找不到这条接龙', subline: null };
    case 'offline':
      return { headline: '需联网才能接龙', subline: null };
    case 'loading':
      return { headline: '展开接龙…', subline: null };
    default:
      return { headline: '出了点小问题，请重试', subline: null };
  }
}

/** 本群接龙 rows (8.10) */
function groupWaitingLine(r) {
  return '第 ' + r.nextStep + ' 棒 · ' + (r.nextKind === 'draw' ? '画一幅' : '猜一句') + ' · 已传 ' + r.passed + '/' + CONFIG.chain.length;
}
function groupInProgressLine(r) {
  if (r.reason === 'pending') return '第 ' + (r.nextStep - 1 || 1) + ' 棒审核中';
  if (r.reason === 'taken') return '有群友在接第 ' + r.nextStep + ' 棒';
  if (r.reason === 'prevMine') return '第 ' + r.nextStep + ' 棒 · 上一棒是你传的';
  if (r.reason === 'capReached') return '第 ' + r.nextStep + ' 棒 · 你已接满 ' + CONFIG.chain.maxPerPerson + ' 棒';
  return '第 ' + r.nextStep + ' 棒 · ' + progressText(r.passed);
}
function groupStatsText(s) {
  return '本群一共玩了 ' + ((s.rooms || 0) + s.revealed) + ' 局 · 画了 ' + s.drawings + ' 幅画';
}
function groupRevealedLine(promptText, finalText) {
  return promptText && finalText ? '「' + promptText + '」→「' + finalText + '」' : '一条接龙';
}

/** 我的接龙 line (8.11) */
function albumLine(it) {
  switch (it.status) {
    case 'revealed':
      return '已揭晓' + (it.promptText ? '「' + it.promptText + '」' : '');
    case 'pending':
      return '审核中 · 我画的第 ' + (it.mine.filter((m) => m.modState === 'pending')[0] || { n: '?' }).n + ' 棒';
    case 'blocked':
      return '这一棒没通过审核 · 第 ' + it.mine[it.mine.length - 1].n + ' 棒';
    case 'expired':
      return '没传完' + (it.promptText ? '「' + it.promptText + '」' : '');
    case 'removed':
      return '该接龙已被移除';
    default: {
      const first = it.mine.filter((m) => m.modState === 'passed')[0];
      return '进行中 ' + it.passed + '/' + it.length + (first ? ' · 我' + (first.kind === 'draw' ? '画' : '写') + '了第 ' + first.n + ' 棒' : '');
    }
  }
}

/** home primary button label (8.1) */
function startCopy(startsLeft, adStartsLeft) {
  if (startsLeft > 0) return { label: '开一条接龙', sublabel: '今天还能开 ' + startsLeft + ' 条', enabled: true };
  if (adStartsLeft > 0) return { label: '今天的 ' + CONFIG.allowances.freeStarts + ' 条已开完', sublabel: '▶ 看视频再开一条 (剩 ' + adStartsLeft + ')', enabled: false };
  return { label: '今天的 ' + CONFIG.allowances.freeStarts + ' 条已开完', sublabel: '明天再来开新的吧', enabled: false };
}

/** '10月15日' from 'YYYYMMDD' */
function dateText(dateKey) {
  return parseInt(dateKey.slice(4, 6), 10) + '月' + parseInt(dateKey.slice(6, 8), 10) + '日';
}

module.exports = {
  MARKERS, isMarker, markerText, markerHint, hiddenHint, PAUSED_HINT, emptyMarkerFor, joinedText, stepTitle, kindLabel, progressText, timeLeftText, durationText, revealHeader, earlyText,
  summaryText, revealShareTitle, inviteShareTitle, entryCopy, groupWaitingLine, groupInProgressLine, groupStatsText, groupRevealedLine,
  albumLine, startCopy, dateText,
};
