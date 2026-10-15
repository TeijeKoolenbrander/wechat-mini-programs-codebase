/**
 * Fact source sheet (spec 6.12): tap a source line to see where the number
 * came from. Plain text only (no clipboard, no web view).
 *
 * vm = {card: CardFace, measureText?, yearText?, publisher, sourceTitle, url,
 *   retrievedAt, note?, canReport?: boolean, sheetScroll}
 * Hit ids: source:report, sheet:close, sheet:list.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  const card = vm.card || {};
  const btnH = L.btnH2;
  const h = Math.min(L.H - L.navBottom, L.u(470) + (L.large ? L.u(140) : 0));
  const s = W.sheet(ctx, L, hits, { h, title: '数据来源' });
  const top = s.top - L.u(8);
  const showReport = vm.canReport !== false && card.canReport !== false;
  const footH = showReport ? btnH + L.u(12) : 0;
  const rect = { x: s.x, y: top, w: s.w, h: s.bottom - footH - top };
  const lh = L.u(24) * (L.large ? 1.2 : 1);
  W.scrollRegion(ctx, hits, 'sheet:list', rect, vm.sheetScroll, (c, hh, y0) => {
    let y = y0;
    const accent = T.accentFill(card.accent);
    W.fillRR(c, s.x, y + L.u(2), L.u(5), lh * 2 + L.u(2), 2, accent);
    W.text(c, card.label || '', s.x + L.u(14), y + lh / 2 + L.u(2), { size: T.FS.title, weight: 800, serif: true, maxW: s.w - L.u(14) });
    const val = card.valueText == null ? '' : (card.approx && card.valueText.charAt(0) !== '约' ? '约 ' : '') + card.valueText + ' ' + (card.unitText || '');
    W.text(c, [card.subLabel, val].filter(Boolean).join(' · '), s.x + L.u(14), y + lh * 1.6 + L.u(4), { size: T.FS.bodyL, weight: 700, maxW: s.w - L.u(14) });
    y += lh * 2 + L.u(14);
    const rows = [
      ['出版方', vm.publisher],
      ['来源', vm.sourceTitle],
      ['数据年份', vm.yearText],
      ['网址', vm.url],
      ['查阅日期', vm.retrievedAt],
      ['说明', vm.note],
    ].filter((r) => r[1]);
    rows.forEach((r) => {
      c.fillStyle = C.line;
      c.fillRect(s.x, y, s.w, 1);
      y += L.u(6);
      W.text(c, r[0], s.x, y + lh / 2, { size: T.FS.body, weight: 700, color: C.sub });
      y += lh;
      y += W.paragraph(c, String(r[1]), s.x, y, s.w, lh, { size: T.FS.body, color: C.ink, maxLines: 4 }) + L.u(6);
    });
    return y - y0;
  });
  if (footH) W.button(ctx, L, hits, { id: 'source:report', x: s.x, y: s.bottom - btnH, w: s.w, h: btnH, label: '数据有误？', kind: 'secondary', size: T.FS.bodyL });
  return hits.result();
}

module.exports = { draw };
