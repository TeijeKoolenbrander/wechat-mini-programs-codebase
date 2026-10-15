/**
 * Puzzle ids, daily window and 再来一题 (spec 4.1, 5.2, 5.3, 9.3). Pure.
 *
 * Puzzle ids: daily "d<YYYYMMDD>", practice "p<n>". Challenge ids: 8 chars [0-9A-Za-z].
 */
const { dateKeyToMs, DAY_MS, issueNo } = require('./date');

function dailyId(dateKey) {
  return 'd' + dateKey;
}

function practiceId(n) {
  return 'p' + n;
}

/** -> { kind: 'daily', dateKey } | { kind: 'practice', n } | null */
function parsePuzzleId(id) {
  const s = String(id || '');
  let m = /^d(\d{8})$/.exec(s);
  if (m) {
    const k = m[1];
    const mo = +k.slice(4, 6);
    const d = +k.slice(6, 8);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { kind: 'daily', dateKey: k };
  }
  m = /^p(\d{1,5})$/.exec(s);
  if (m && +m[1] >= 1) return { kind: 'practice', n: +m[1] };
  return null;
}

function isChallengeId(id) {
  return /^[0-9A-Za-z]{8}$/.test(String(id || ''));
}

/** Is a play started/continued at `nowMs` inside date D's ranked window? [D 00:00, D+1 00:30 BJT) */
function inRankedWindow(dateKey, nowMs, graceMs) {
  const start = dateKeyToMs(dateKey);
  return nowMs >= start && nowMs < start + DAY_MS + graceMs;
}

/** "20261015" -> "10月15日" */
function dateLabel(dateKey) {
  return +dateKey.slice(4, 6) + '月' + +dateKey.slice(6, 8) + '日';
}

/**
 * Title of a puzzle (spec 13 Play.title): "今日一词 第128期" | "往期 第97期" | "练习 #12".
 * kind: 'daily' | 'archive' | 'practice'
 */
function puzzleTitle(kind, issue, practiceNo) {
  if (kind === 'practice') return '练习 #' + practiceNo;
  if (kind === 'archive') return '往期 第' + issue + '期';
  return '今日一词 第' + issue + '期';
}

/**
 * 再来一题 (spec 5.3): the newest UNPLAYED past daily, else the lowest-numbered unplayed
 * practice puzzle, else null. `pastDailies` newest first; `practice` in number order.
 * Each entry { puzzleId, played }. `pool` = 'practice' skips the dailies (去练习).
 */
function nextPuzzle(pastDailies, practice, pool) {
  if (pool !== 'practice') {
    for (const d of pastDailies) if (!d.played) return d.puzzleId;
  }
  for (const p of practice) if (!p.played) return p.puzzleId;
  return null;
}

module.exports = { dailyId, practiceId, parsePuzzleId, isChallengeId, inRankedWindow, dateLabel, puzzleTitle, nextPuzzle, issueNo };
