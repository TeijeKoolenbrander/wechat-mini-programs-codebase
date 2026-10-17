/**
 * "今天的 3 条已开完" sheet over home (spec 8.1, 慢慢传 starts used up): the headline, then either the rewarded
 * "▶ 看视频再开一条 (剩 2)" (when ad starts remain) or "明天再来开新的吧". Never shown in a live game (PO-49).
 * vm: { chainStart: { freeLeft, adLeft, adState?: 'idle'|'loading'|'playing'|'error' } } + display.
 * Hit ids: startLimit:ad, sheet:close (the X, the scrim and 知道了), sheet:list (scroll).
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const { Hits } = require('./layout');
const C = T.COLORS;

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  const cs = (vm && vm.chainStart) || { freeLeft: 0, adLeft: 0 };
  const ad = cs.adLeft > 0;
  const adState = cs.adState || 'idle';
  const textW = Math.min(L.W, 560) - 2 * L.pad;
  const lh = Math.round(T.FS.bodyL * 1.5);
  const head = W.wrap(ctx, '今天的 3 条已开完', textW, T.FS.title, 800);
  const hlh = Math.round(T.FS.title * 1.4);
  const lines = W.wrap(ctx, ad ? '看一个短视频，就能再开一条慢慢传。开一局不受这个限制。' : '明天再来开新的吧。开一局不受这个限制。', textW, T.FS.bodyL, 500);
  const btnH = T.btn(L, 52);
  const contentH = L.u(4) + head.length * hlh + L.u(6) + lines.length * lh + L.u(4);
  const label = adState === 'loading' ? '广告加载中…' : adState === 'playing' ? '播放中…' : adState === 'error' ? '暂时没有广告，稍后再试' : '看视频再开一条 (剩 ' + cs.adLeft + ')';
  S.sheetScroll(ctx, L, hits, {
    title: '慢慢传',
    contentH,
    pinnedH: btnH,
    scroll: vm && vm.sheetScroll,
    drawContent(x, y) {
      let cy = y + 4;
      head.forEach((ln, i) => W.text(ctx, ln, x, cy + i * hlh + hlh / 2, { size: T.FS.title, weight: 800 }));
      cy += head.length * hlh + 6;
      lines.forEach((ln, i) => W.text(ctx, ln, x, cy + i * lh + lh / 2, { size: T.FS.bodyL, weight: 500, color: C.sub }));
      cy += lines.length * lh;
    },
    drawPinned(x, y, w) {
      if (ad) W.button(ctx, L, hits, { id: 'startLimit:ad', x, y, w, h: btnH, label, kind: 'ad', disabled: adState === 'loading' || adState === 'playing' });
      else W.button(ctx, L, hits, { id: 'sheet:close', x, y, w, h: btnH, label: '知道了', kind: 'primary' });
    },
  });
  return hits.result();
}

module.exports = { draw };
