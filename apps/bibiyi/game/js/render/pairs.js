/**
 * Compact fact lines and question-pair rows, shared by the result's missed
 * block, 本局题目, the issue detail and the report sheet. Pure.
 *
 * factLine: [accent dot] label ........ value unit
 *           来源：... · 2013            数据有误？
 * Both lines are >= 30 tall; the report link has its own 48pt tap area, and
 * stacked factLines are >= 60 apart so tap areas never overlap.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function lineH(L) {
  return L.u(30) * (L.large ? 1.2 : 1);
}

/** Height of one factLine (value line + source line). */
function factLineH(L, withSource) {
  return withSource === false ? lineH(L) : lineH(L) * 2;
}

/**
 * Draw one fact. o: {idBase ('result:top'), showReport (default face.canReport),
 * hideValue, dim}. Registers idBase+':report' and idBase+':source'.
 */
function factLine(ctx, L, hits, x, y, w, face, o) {
  o = o || {};
  const lh = lineH(L);
  const accent = T.accentFill(face.accent);
  const dot = L.u(10);
  W.fillRR(ctx, x, y + lh / 2 - dot / 2, dot, dot, dot / 2, accent);
  const unit = face.unitText || '';
  const val = face.valueText == null || o.hideValue ? '？' : (face.approx && face.valueText.charAt(0) !== '约' ? '约 ' : '') + face.valueText;
  const unitSize = T.FS.body;
  const unitW = unit ? W.measure(ctx, unit, unitSize, 600, false) + L.u(4) : 0;
  const valSize = T.FS.bodyL + 4;
  const valW = Math.min(W.measure(ctx, val, valSize, 800, true), w * 0.5);
  // value + unit right-aligned
  if (unit) W.text(ctx, unit, x + w, y + lh / 2 + 1, { size: unitSize, weight: 600, color: C.sub, align: 'right' });
  W.text(ctx, val, x + w - unitW, y + lh / 2, { size: valSize, weight: 800, serif: true, color: o.dim ? C.sub : C.ink, align: 'right', maxW: w * 0.5, minSize: T.FS.body });
  const labW = w - dot - L.u(10) - valW - unitW - L.u(10);
  W.text(ctx, face.label, x + dot + L.u(10), y + lh / 2, { size: T.FS.bodyL, weight: 800, serif: true, color: C.ink, maxW: labW, minSize: T.FS.body });
  if (o.withSource === false) return lh;
  // source line
  const cy = y + lh + lh / 2;
  if (face.sourceText) {
    const showReport = o.showReport != null ? o.showReport : face.canReport;
    const repW = showReport ? W.measure(ctx, '数据有误？', T.FS.body, 600, false) + L.u(4) : 0;
    const srcMax = w - dot - L.u(10) - repW - (repW ? L.u(10) : 0);
    const used = W.text(ctx, face.sourceText, x + dot + L.u(10), cy, { size: T.FS.body, color: C.sub, maxW: srcMax });
    if (o.idBase) W.addTap(hits, L, o.idBase + ':source', x, cy - T.MIN_TAP / 2, Math.min(srcMax, used) + dot + L.u(14), T.MIN_TAP);
    if (showReport) {
      W.text(ctx, '数据有误？', x + w, cy, { size: T.FS.body, weight: 600, color: C.seal, align: 'right' });
      ctx.fillStyle = C.seal;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x + w - repW + L.u(4), cy + T.FS.body * 0.6, repW - L.u(4), 1);
      ctx.globalAlpha = 1;
      if (o.idBase) W.addTap(hits, L, o.idBase + ':report', x + w - repW - L.u(8), cy - T.MIN_TAP / 2, repW + L.u(16), T.MIN_TAP);
    }
  }
  return lh * 2;
}

/** Small mark for a pair: correct / miss / unanswered. */
function markFor(ctx, L, cx, cy, state) {
  const s = L.u(22) * Math.min(L.k, 1.1);
  if (state === 'correct' || state === true) {
    W.fillRR(ctx, cx - s / 2, cy - s / 2, s, s, s / 2, C.goodSoft);
    W.strokeRR(ctx, cx - s / 2, cy - s / 2, s, s, s / 2, C.good, 2);
    W.iconCheck(ctx, cx, cy, s * 0.55, C.good, 2.2);
  } else if (state === 'miss' || state === false) {
    W.fillRR(ctx, cx - s / 2, cy - s / 2, s, s, s / 2, C.badSoft);
    W.strokeRR(ctx, cx - s / 2, cy - s / 2, s, s, s / 2, C.bad, 2);
    W.iconCross(ctx, cx, cy, s * 0.55, C.bad, 2.2);
  } else {
    W.strokeRR(ctx, cx - s / 2, cy - s / 2, s, s, s / 2, C.lineStrong, 1.5);
    W.text(ctx, '—', cx, cy, { size: T.FS.body, color: C.sub, align: 'center' });
  }
}

/**
 * One question pair row: "第 3 题 [mark]  correct answer label", then the two
 * fact lines. Returns its height. item: {k, top, bottom, correct|mine,
 * answerLabel?}. idBase = 'questions:<k>' -> ids idBase:top:report etc.
 */
function pairRow(ctx, L, hits, x, y, w, item, o) {
  o = o || {};
  const headH = L.u(34) * (L.large ? 1.15 : 1);
  W.text(ctx, '第 ' + item.k + ' 题', x, y + headH / 2, { size: T.FS.body, weight: 700, color: C.sub });
  const state = item.mine != null ? item.mine : item.correct;
  const kw = W.measure(ctx, '第 ' + item.k + ' 题', T.FS.body, 700, false);
  markFor(ctx, L, x + kw + L.u(20), y + headH / 2, state);
  if (item.answerLabel) W.text(ctx, '答案：' + item.answerLabel, x + w, y + headH / 2, { size: T.FS.body, weight: 700, color: C.ink, align: 'right' });
  let cy = y + headH;
  const base = (o.idBase || 'questions') + ':' + item.k;
  cy += factLine(ctx, L, hits, x, cy, w, item.top, { idBase: base + ':top', showReport: item.top.canReport !== false });
  cy += factLine(ctx, L, hits, x, cy, w, item.bottom, { idBase: base + ':bottom', showReport: item.bottom.canReport !== false });
  ctx.fillStyle = C.line;
  ctx.fillRect(x, cy + L.u(4), w, 1);
  return cy + L.u(10) - y;
}

function pairRowH(L) {
  return L.u(34) * (L.large ? 1.15 : 1) + factLineH(L) * 2 + L.u(10);
}

module.exports = { factLine, factLineH, pairRow, pairRowH, markFor, lineH };
