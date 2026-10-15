/**
 * 往期刻度: the archive list (spec 6.9).
 */

const T = require('./theme');
const W = require('./widgets');
const K = require('./chrome');
const B = require('./board');
const C = T.C;

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const top = K.header(ctx, L, hits, { title: '往期刻度', right: vm.bestStreakText || null });
  const banner = K.bannerRect(L, vm.banner);
  const bottom = banner ? banner.y - L.u(24) : L.bottomEdge - L.bottomPad;
  if (banner) hits.meta.banner = banner;
  const state = vm.state || 'loading';
  const items = vm.items || [];
  const bh = K.btnH(L);

  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: bottom - top,
    scroll: vm.scrollY || 0,
    id: 'archive:scroll',
    draw(c, h) {
      let y = top + L.u(4);
      if (state === 'loading') {
        for (let i = 0; i < 6; i++) {
          W.skeleton(c, L.x0, y, L.contentW, L.u(64), vm.t, L.u(12));
          y += L.u(74);
        }
        return y;
      }
      if (state === 'empty') {
        y += B.notice(c, L, h, { y: y + L.u(20), title: '还没有往期', text: '明天再来，这里会出现今天的五张卡。' }) + L.u(20);
        return y;
      }
      if ((state === 'error' || state === 'offline') && !items.length) {
        y += B.notice(c, L, h, { y: y + L.u(20), title: '往期需联网查看', text: '检查网络后点重试。', fill: C.noteOrange, buttons: [{ id: 'archive:retry', label: '重试', kind: 'primary' }] }) + L.u(20);
        return y;
      }
      if (state === 'offline' || state === 'error') {
        W.pill(c, L.x0 + L.contentW, y + L.u(14), '离线 · 显示已缓存的往期', { size: W.fs(L, 'body'), color: C.warn, fill: C.noteYellow, align: 'right' });
        y += L.u(36);
      }
      const bs = W.fs(L, 'body');
      const l1 = W.fs(L, 'bodyL') * 1.35;
      const l2 = bs * 1.35;
      const rh = Math.max(T.MIN_TAP + L.u(16), l1 + l2 + L.u(20));
      items.forEach((it) => {
        W.card(c, L.x0, y, L.contentW, rh, { r: L.u(12) });
        W.text(c, '第 ' + it.issueNo + ' 期', L.x0 + L.u(14), y + L.u(10) + l1 / 2, { size: W.fs(L, 'bodyL'), weight: 900 });
        W.text(c, it.dateText || '', L.x0 + L.contentW - L.u(34), y + L.u(10) + l1 / 2, { size: bs, color: C.sub, align: 'right' });
        const played = /已玩|练习/.test(it.statusText || '');
        W.text(c, it.statusText || '', L.x0 + L.u(14), y + L.u(10) + l1 + l2 / 2, { size: bs, weight: played ? 800 : 500, color: played ? C.nationText : C.sub, maxW: L.contentW - L.u(60) });
        W.iconChevron(c, L.x0 + L.contentW - L.u(18), y + L.u(10) + l1 + l2 / 2, L.u(14), C.sub, 'right');
        h.add('archive:item:' + it.dateKey, L.x0, y, L.contentW, rh);
        y += rh + L.u(8);
      });
      if (vm.hasMore) {
        W.button(c, L, h, { id: 'archive:more', x: L.x0, y: y + L.u(4), w: L.contentW, h: bh, label: '加载更多', kind: 'secondary' });
        y += bh + L.u(8);
      }
      return y + L.u(12);
    },
  });
  return hits.result();
}

module.exports = { draw };
