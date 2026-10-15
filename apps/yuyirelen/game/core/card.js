/**
 * Share card data (spec 8.5, 9.1, PO-10). Pure.
 *
 * SPOILER RULE: the card and the share title never contain a word (guess, hint, chip,
 * answer or first character). Every function here takes NUMBERS and fixed labels only, so
 * a word cannot reach the card by accident (AC 70).
 */
const { bandOf, bandByKey } = require('./temp');

/** > maxColumns steps: bucket to maxColumns columns, each the column's hottest step. */
function bucket(temps, bands, maxColumns) {
  const n = temps.length;
  if (n <= maxColumns) return { temps: temps.slice(), bands: bands.slice() };
  const outT = [];
  const outB = [];
  for (let c = 0; c < maxColumns; c++) {
    const lo = Math.floor((c * n) / maxColumns);
    const hi = Math.max(lo + 1, Math.floor(((c + 1) * n) / maxColumns));
    let bi = lo;
    for (let i = lo; i < hi && i < n; i++) if (temps[i] > temps[bi]) bi = i;
    outT.push(temps[bi]);
    outB.push(bands[bi]);
  }
  return { temps: outT, bands: outB };
}

/** "第128期" / "往期 第97期" / "练习 #12" label used on the card header and share title. */
function cardHeader(kind, issueNo, practiceNo) {
  if (kind === 'practice') return '语义热冷 · 练习 #' + practiceNo;
  if (kind === 'archive') return '语义热冷 · 往期 第' + issueNo + '期';
  return '语义热冷 · 今日一词 第' + issueNo + '期';
}

/**
 * Card view model (spec 13 "Share card input").
 * in: { kind, issueNo, practiceNo, outcome: 'solved'|'gaveup', steps, hints, best, temps, bands }
 */
function cardVm(i, maxColumns) {
  const b = bucket(i.temps || [], i.bands || [], maxColumns || 60);
  const solved = i.outcome === 'solved';
  return {
    title: cardHeader(i.kind, i.issueNo, i.practiceNo),
    headline: solved ? i.steps + ' 步猜中' : '未猜中 · 最近第 ' + i.best + ' 名',
    subline: solved ? (i.hints > 0 ? '用了 ' + i.hints + ' 次提示' : '没有用提示') : '共猜了 ' + i.steps + ' 步',
    temps: b.temps,
    bands: b.bands,
    footer: '同一个词，你几步能猜中？',
  };
}

/** Share title (<= 2 lines): "第128期我 21 步猜中，你几步？" (spec 8.5). */
function shareTitle(i) {
  const tag = i.kind === 'practice' ? '练习#' + i.practiceNo : '第' + i.issueNo + '期';
  return i.outcome === 'solved' ? tag + '我 ' + i.steps + ' 步猜中，你几步？' : tag + '没猜中，你来试试？';
}

const MENU_TITLE = '今天全国猜同一个词，来试试？';

module.exports = { bucket, cardVm, shareTitle, cardHeader, MENU_TITLE, bandOf, bandByKey };
