/**
 * Archive day: read-only review of a day played as the daily, and the end of
 * an archive practice set (spec 6.9). Reuses the day-result row cards.
 */

const T = require('./theme');
const W = require('./widgets');
const K = require('./chrome');
const S = require('./sheets');
const B = require('./board');
const Res = require('./result');
const C = T.C;

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const isPlay = vm.kind === 'play';
  const top = K.header(ctx, L, hits, { back: '返回列表', backId: 'review:list', title: (vm.issueNo ? '第 ' + vm.issueNo + ' 期' : '') + (isPlay ? ' · 往期练习' : ' · 回顾') });
  const bh = K.btnH(L);
  const bottom = L.bottomEdge - L.bottomPad;
  const state = vm.state || 'loading';

  if (state === 'loading') {
    W.text(ctx, '正在取这一期…', L.cx, top + L.u(60), { size: W.fs(L, 'bodyL'), weight: 700, color: C.sub, align: 'center' });
    for (let i = 0; i < 4; i++) W.skeleton(ctx, L.x0, top + L.u(90) + i * L.u(74), L.contentW, L.u(64), vm.t, L.u(12));
    return hits.result();
  }
  if (state === 'error' || state === 'offline') {
    B.notice(ctx, L, hits, { y: top + L.u(40), title: '这一期需联网查看', text: '检查网络后点重试。', fill: C.noteOrange, buttons: [{ id: 'review:retry', label: '重试', kind: 'primary' }] });
    return hits.result();
  }

  const pinnedRows = isPlay ? 2 : 1;
  const pTop = K.pinnedTop(L, pinnedRows);
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: pTop - L.u(8) - top,
    scroll: vm.scrollY || 0,
    id: 'review:scroll',
    draw(c, h) {
      let y = top + L.u(4);
      if (isPlay && vm.endText) {
        W.text(c, vm.endText, L.cx, y + L.u(14), { size: W.fs(L, 'bodyL'), weight: 800, color: C.sub, align: 'center', maxW: L.contentW });
        y += L.u(34);
      }
      y = Res.hero(c, L, { totalText: vm.totalText || (vm.mine && vm.mine.totalText), statusTag: isPlay ? null : '定分', bandLabel: vm.bandLabel, percentileText: vm.percentileText || (vm.mine && vm.mine.percentileText) }, y) + L.u(6);
      (vm.rows || []).forEach((r) => {
        y += Res.rowCard(c, L, L.x0, y, L.contentW, r) + L.u(8);
      });
      if (vm.divisiveText) y += W.paragraph(c, vm.divisiveText, L.x0, y, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), weight: 700, align: 'center' }) + L.u(6);
      y += L.u(6);
      const d = vm.distribution || { unlocked: false, adState: 'idle' };
      const label = d.unlocked ? '全国分布' : d.adState === 'loading' ? '广告加载中…' : '视频 全国分布';
      W.button(c, L, h, { id: 'review:dist', x: L.x0, y, w: L.contentW, h: bh, label, kind: d.unlocked ? 'secondary' : 'ad', disabled: !d.unlocked && (d.adState === 'loading' || d.adState === 'playing') });
      y += bh;
      if (d.adState === 'error') {
        W.text(c, '暂无广告，请稍后再试', L.cx, y + L.u(18), { size: W.fs(L, 'body'), color: C.sub, align: 'center' });
        y += L.u(30);
      }
      return y + L.u(10);
    },
  });
  if (isPlay) {
    W.button(ctx, L, hits, { id: 'review:next', x: L.x0, y: pTop, w: L.contentW, h: bh, label: '再来一期', kind: 'primary' });
    W.button(ctx, L, hits, { id: 'review:list', x: L.x0, y: pTop + bh + L.u(10), w: L.contentW, h: bh, label: '返回列表', kind: 'secondary' });
  } else {
    W.button(ctx, L, hits, { id: 'review:list', x: L.x0, y: pTop, w: L.contentW, h: bh, label: '返回列表', kind: 'primary' });
  }
  if (vm.sheet === 'distribution') S.drawDistribution(ctx, L, hits, vm);
  return hits.result();
}

module.exports = { draw };
