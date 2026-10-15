/**
 * Category picker sheet for 随便比比 (spec 6.14). One tap selects and closes.
 * vm = {selected, options:[{key, label, factCount}], sheetScroll}
 * Hit ids: picker:<key> ('all' for 全部), sheet:close, sheet:list.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  const opts = vm.options || [];
  const rowH = Math.max(T.MIN_TAP, L.u(56) * (L.large ? 1.15 : 1));
  const gap = L.u(10);
  const cols = L.large ? 1 : 2;
  const rows = Math.ceil(opts.length / cols);
  const h = Math.min(L.H - L.navBottom, L.u(70) + rows * (rowH + gap) + L.u(24) + L.safeBottom);
  const s = W.sheet(ctx, L, hits, { h, title: '选择分类' });
  const top = s.top - L.u(6);
  const rect = { x: s.x, y: top, w: s.w, h: s.bottom - top };
  const cw = (s.w - (cols - 1) * gap) / cols;
  W.scrollRegion(ctx, hits, 'sheet:list', rect, vm.sheetScroll, (c, hh, y0) => {
    opts.forEach((o, i) => {
      const x = s.x + (i % cols) * (cw + gap);
      const y = y0 + Math.floor(i / cols) * (rowH + gap);
      const sel = o.key === vm.selected;
      W.fillRR(c, x, y, cw, rowH, L.u(12), sel ? C.ink : C.card);
      if (!sel) W.strokeRR(c, x, y, cw, rowH, L.u(12), C.lineStrong, 1.5);
      const fg = sel ? C.paper : C.ink;
      const accent = T.ACCENTS[o.key];
      const lx = x + L.u(34);
      if (accent) {
        c.beginPath();
        c.arc(x + L.u(18), y + rowH / 2, L.u(7), 0, Math.PI * 2);
        c.fillStyle = sel ? C.paper : T.accentFill(accent);
        c.fill();
      } else {
        W.iconCheck(c, x + L.u(18), y + rowH / 2, L.u(12), sel ? C.paper : C.sub, 2);
      }
      W.text(c, o.label, lx, y + rowH / 2, { size: T.FS.bodyL, weight: 700, color: fg, maxW: cw - L.u(34) - L.u(64) });
      if (o.factCount != null) W.text(c, o.factCount + ' 条', x + cw - L.u(12), y + rowH / 2, { size: T.FS.body, color: sel ? C.paper : C.sub, align: 'right' });
      hh.add('picker:' + o.key, x, y, cw, rowH);
    });
    return rows * (rowH + gap);
  });
  return hits.result();
}

module.exports = { draw };
