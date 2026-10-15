/**
 * 本局题目 sheet (spec 6.5): every answered pair of the run, with both values,
 * the result mark, the source, and "数据有误？" per fact. Daily: answered
 * questions only. Drawn over the result screen.
 *
 * vm = {questions:[{k, top:CardFace, bottom:CardFace, correct:boolean}], sheetScroll}
 * Hit ids: questions:<k>:top:report, questions:<k>:bottom:report,
 *   questions:<k>:top:source, questions:<k>:bottom:source,
 *   sheet:list (scroll), sheet:close.
 */

const T = require('./theme');
const W = require('./widgets');
const P = require('./pairs');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  const qs = vm.questions || [];
  const h = Math.min(L.H - L.navBottom, L.H * 0.86);
  const s = W.sheet(ctx, L, hits, { h, title: '本局题目' + (qs.length ? '（' + qs.length + '）' : '') });
  const top = s.top - L.u(8);
  const rect = { x: s.x, y: top, w: s.w, h: s.bottom - top };
  W.scrollRegion(ctx, hits, 'sheet:list', rect, vm.sheetScroll, (c, hh, y0) => {
    if (!qs.length) {
      W.text(c, '还没有答题', s.x + s.w / 2, y0 + L.u(40), { size: T.FS.bodyL, color: C.sub, align: 'center' });
      return L.u(80);
    }
    let y = y0;
    qs.forEach((q) => {
      y += P.pairRow(c, L, hh, s.x, y, s.w, q, { idBase: 'questions' });
    });
    return y - y0;
  });
  return hits.result();
}

module.exports = { draw };
