/**
 * Pre-formatted strings and view-model pieces (spec 10: renderers never format; logic does). Pure JS, so QA can test
 * every string. js/vm.js composes these into the full view models; the numbers come from score.js / group.js.
 */

const { CONFIG } = require('./config');
const { scoreAt, dayBand } = require('./score');

const S = CONFIG.score;

function plus(score) {
  return '+' + score;
}

/** "在你左边/右边 N 格" / "和你一样" part for a reference `ref` against position `pos`. */
function sideText(pos, ref, sameWithin) {
  const delta = ref - pos;
  if (Math.abs(delta) <= (sameWithin || 0)) return '和你一样';
  const n = Math.round(Math.abs(delta));
  return (delta < 0 ? '在你左边 ' : '在你右边 ') + n + ' 格';
}

/**
 * Card reveal pieces (spec 6.3, AC 16, 17).
 * @param {{pos:number, ref:number, n:number, agreePct:number|null, group:{median:number|null,n:number,dots:number[]}|null, frozen?:boolean}} o
 *   n = real answers for the card; frozen = a closed day's final reference (archive, bonus): tag 定分, no live wording.
 */
function buildCardReveal(o) {
  const sc = scoreAt(o.pos, o.ref);
  const tag = o.frozen ? '定分' : '实时';
  const nation = o.n < S.smallSampleN && !o.frozen ? '全国 (样本少)' : '全国';
  const nationSide = sideText(o.pos, o.ref, 0);
  const markers = [{ pos: o.ref, kind: 'nation' }];
  let groupText = null;
  if (o.group && o.group.n >= 1 && o.group.median !== null) {
    markers.push({ pos: o.group.median, kind: 'group' });
    for (let i = 0; i < o.group.dots.length; i++) markers.push({ pos: o.group.dots[i], kind: 'member' });
    groupText = '本群 ' + o.group.n + ' 人 ● ' + sideText(o.pos, o.group.median, S.sameAsYouD);
  }
  markers.push({ pos: o.pos, kind: 'you' });
  return {
    markers,
    label: sc.label,
    scoreText: plus(sc.score),
    nationText: nation + ' ◆ ' + nationSide + ' · ' + tag,
    agreeText: o.agreePct === null || o.agreePct === undefined ? null : '和全国 ' + o.agreePct + '% 的人想法相近',
    groupText,
    bullseye: sc.d <= S.bullseyeD,
  };
}

/**
 * Day result pieces (spec 6.4, AC 18).
 * @param {{issueNo:number, cards:Array<{prompt,left,right}>, positions:number[], refs:number[], scores:number[], total:number, final:boolean,
 *   pct:number|null, divisiveIdx:number|null, streak:number, group:{gs:number|null, mq:number|null, n:number}|null}} o
 */
function buildDayResult(o) {
  const rows = o.cards.map((c, i) => {
    const sc = scoreAt(o.positions[i], o.refs[i]);
    return { prompt: c.prompt, left: c.left, right: c.right, you: o.positions[i], nation: o.refs[i], label: sc.label, scoreText: plus(sc.score) };
  });
  let groupText = null;
  if (o.group && o.group.gs !== null && o.group.gs !== undefined) {
    groupText = '本群群内默契分 ' + o.group.gs + ' · ' + (o.group.mq !== null && o.group.mq !== undefined ? '本群默契度 ' + o.group.mq : '本群完成满 3 人后计算默契度');
  }
  const dv = o.divisiveIdx === null || o.divisiveIdx === undefined ? null : o.cards[o.divisiveIdx];
  return {
    issueNo: o.issueNo,
    final: o.final,
    totalText: String(o.total),
    bandLabel: dayBand(o.total),
    statusTag: o.final ? '定分' : '实时',
    percentileText: o.final && o.pct !== null && o.pct !== undefined ? '超过全国 ' + o.pct + '%' : null,
    rows,
    divisiveText: dv ? '今日最有争议：' + dv.prompt + ' (' + dv.left + '↔' + dv.right + ')' : null,
    streakText: streakText(o.streak),
    groupText,
  };
}

function streakText(current) {
  return current >= 2 ? '连续 ' + current + ' 天' : null;
}

/** Home "done" line: 今日默契分 412 · 默契十足 (实时) */
function homeScoreText(total, final) {
  return '今日默契分 ' + total + ' · ' + dayBand(total) + ' (' + (final ? '定分' : '实时') + ')';
}

/** Home yesterday line: 昨日定分 421 · 超过全国 68% (pct optional). */
function yesterdayText(total, pct) {
  return '昨日定分 ' + total + (pct !== null && pct !== undefined ? ' · 超过全国 ' + pct + '%' : '');
}

/** Home daily state from what the client knows (spec 6.1 table). */
function homeDailyState(o) {
  if (o.loading) return 'loading';
  if (o.unavailable) return 'unavailable';
  if (o.offline) return 'offline';
  if (o.error) return 'error';
  if (o.pendingSubmit) return 'pendingSubmit';
  if (o.complete) return 'done';
  if (o.answered > 0) return 'inProgress';
  return 'available';
}

// ---- rounds -----------------------------------------------------------------------------------------------------

function clueText(round) {
  if (round.clueMode === 'preset' && round.clueText) return '提示：' + round.clueText;
  if (round.clueMode === 'chat') return '提示在群聊里，看看 TA 怎么说';
  return '';
}
function guessCountText(n) {
  return n > 0 ? '已有 ' + n + ' 人作答' : '还没有人作答';
}
function submittedText(n) {
  return '已提交 · 已有 ' + n + ' 人作答 · 等待揭晓';
}
function revealHint(canReveal, guessCount) {
  if (canReveal) return '第 ' + CONFIG.rounds.autoRevealAtGuesses + ' 人作答或 24 小时后自动揭晓';
  return guessCount < CONFIG.rounds.minGuessesToReveal ? '至少 ' + CONFIG.rounds.minGuessesToReveal + ' 人作答后可揭晓' : '主持人揭晓，或第 ' + CONFIG.rounds.autoRevealAtGuesses + ' 人作答、24 小时后自动揭晓';
}
function mqText(mq) {
  return mq === null || mq === undefined ? null : '本题默契值 ' + mq;
}
function roundStatusText(status) {
  return status === 'revealed' ? '已揭晓' : status === 'noGuesses' ? '无人作答' : '等待揭晓';
}

/** Round view model status for a viewer (spec 10 Round.status). */
function roundViewStatus(r) {
  if (r.notFound) return 'notFound';
  if (r.status === 'noGuesses') return 'noGuesses';
  if (r.status === 'revealed') return r.isHost || r.myGuess ? 'revealed' : r.expired ? 'expired' : 'revealedUnplayed';
  if (r.isHost) return 'hostWaiting';
  return r.myGuess ? 'submitted' : 'open';
}

// ---- group page -------------------------------------------------------------------------------------------------

/** Group page state from a getGroupDay payload (spec 6.8). */
function groupState(p) {
  if (p.n === 0) return 'empty';
  if (!p.viewerDone) return 'notPlayed';
  if (p.n < CONFIG.group.minForMq) return 'small';
  return 'ready';
}
function trendLabel(dateKey) {
  return dateKey.slice(4, 6) + '/' + dateKey.slice(6, 8);
}
function dateText(dateKey) {
  return +dateKey.slice(4, 6) + '月' + +dateKey.slice(6, 8) + '日';
}

module.exports = {
  plus,
  sideText,
  buildCardReveal,
  buildDayResult,
  streakText,
  homeScoreText,
  yesterdayText,
  homeDailyState,
  clueText,
  guessCountText,
  submittedText,
  revealHint,
  mqText,
  roundStatusText,
  roundViewStatus,
  groupState,
  trendLabel,
  dateText,
};
