/**
 * Day result (spec 6.4). Hero score on top, the five mini rulers, the
 * divisive card line, then the actions anchored to the thumb zone.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./ruler');
const K = require('./chrome');
const S = require('./sheets');
const { Hits } = require('./layout');
const C = T.C;

function hero(ctx, L, vm, y) {
  const cx = L.cx;
  W.text(ctx, '今日默契分', cx, y + L.u(14), { size: W.fs(L, 'bodyL'), weight: 700, color: C.sub, align: 'center' });
  y += L.u(34);
  const hs = W.fs(L, 'hero');
  const tw = W.measure(ctx, vm.totalText || '', hs, 900);
  // the number sits on a strip of tape with an underline of ticks
  W.text(ctx, vm.totalText || '', cx, y + hs * 0.55, { size: hs, weight: 900, align: 'center' });
  const tag = vm.statusTag ? '(' + vm.statusTag + ')' : '';
  if (tag) W.text(ctx, tag, cx + tw / 2 + L.u(8), y + hs * 0.78, { size: W.fs(L, 'body'), weight: 700, color: C.sub });
  y += hs * 1.1;
  if (vm.bandLabel) {
    W.pill(ctx, cx, y + L.u(14), '〔' + vm.bandLabel + '〕', { size: W.fs(L, 'bodyL'), color: C.ink, fill: C.tape, align: 'center', h: W.fs(L, 'bodyL') + L.u(14) });
    y += L.u(40);
  }
  if (vm.percentileText) {
    W.text(ctx, vm.percentileText, cx, y + L.u(12), { size: W.fs(L, 'body'), weight: 700, color: C.sub, align: 'center' });
    y += L.u(30);
  }
  return y;
}

/** One result row (card): prompt, label + score, mini ruler. Returns height. */
function rowCard(ctx, L, x, y, w, r) {
  const pad = L.u(12);
  const bs = W.fs(L, 'body');
  const big = T.MODE.large;
  const lineH = bs * 1.5;
  const mh = R.miniHeight(L);
  const h = pad + lineH + L.u(4) + mh + (big ? lineH : 0) + pad;
  W.card(ctx, x, y, w, h, { r: L.u(12) });
  const iw = w - pad * 2;
  const sc = W.measure(ctx, r.scoreText || '', bs, 900);
  const lw = W.measure(ctx, r.label || '', bs, 800);
  W.text(ctx, r.scoreText || '', x + w - pad, y + pad + lineH / 2, { size: bs, weight: 900, align: 'right' });
  W.text(ctx, r.label || '', x + w - pad - sc - L.u(8), y + pad + lineH / 2, { size: bs, weight: 800, color: T.labelColor(r.label), align: 'right' });
  W.text(ctx, r.prompt || '', x + pad, y + pad + lineH / 2, { size: bs, weight: 800, maxW: iw - sc - lw - L.u(20) });
  const ry = y + pad + lineH + L.u(4);
  const mk = [
    { pos: r.nation, kind: 'nation' },
    { pos: r.you, kind: 'you' },
  ];
  if (big) {
    R.miniRuler(ctx, L, x + pad, ry, iw, { markers: mk });
    W.text(ctx, r.left || '', x + pad, ry + mh + lineH / 2, { size: bs, color: C.sub });
    W.text(ctx, r.right || '', x + w - pad, ry + mh + lineH / 2, { size: bs, color: C.sub, align: 'right' });
  } else {
    const ew = Math.max(W.measure(ctx, r.left || '', bs, 600), W.measure(ctx, r.right || '', bs, 600)) + L.u(6);
    W.text(ctx, r.left || '', x + pad, ry + mh - L.u(8), { size: bs, color: C.sub, maxW: ew });
    W.text(ctx, r.right || '', x + w - pad, ry + mh - L.u(8), { size: bs, color: C.sub, align: 'right', maxW: ew });
    R.miniRuler(ctx, L, x + pad + ew + L.u(6), ry, iw - ew * 2 - L.u(12), { markers: mk });
  }
  return h;
}

function shareRow(ctx, L, hits, y) {
  const bh = K.btnH(L);
  const gap = L.u(10);
  const x = L.x0;
  const w = L.contentW;
  const unit = (w - gap * 2) / 3;
  const shareW = unit * 1.15;
  const oth = (w - shareW - gap * 2) / 2;
  W.button(ctx, L, hits, { id: 'result:share', x, y, w: shareW, h: bh, label: '分享', kind: 'primary' });
  W.button(ctx, L, hits, { id: 'result:group', x: x + shareW + gap, y, w: oth, h: bh, label: '本群' });
  W.button(ctx, L, hits, { id: 'result:friend', x: x + shareW + gap * 2 + oth, y, w: oth, h: bh, label: '好友榜' });
}

function actions(ctx, L, hits, vm, y) {
  const bh = K.btnH(L);
  const gap = L.u(10);
  const x = L.x0;
  const w = L.contentW;
  const y0 = y;
  y += L.u(6);
  // row 2: rewarded (never beside 分享)
  const b = vm.bonus || { left: 0, adState: 'idle' };
  const d = vm.distribution || { unlocked: false, adState: 'idle' };
  const bonusLabel = b.left <= 0 ? '加一题用完了' : b.adState === 'loading' ? '广告加载中…' : '视频 加一题';
  const distLabel = d.unlocked ? '全国分布' : d.adState === 'loading' ? '广告加载中…' : '视频 全国分布';
  const half = (w - gap) / 2;
  const fits = W.measure(ctx, '视频 全国分布', W.fs(L, 'bodyL'), 700) + L.u(54) <= half - L.u(16);
  const bonusBtn = { id: 'result:bonus', label: bonusLabel, kind: b.left <= 0 ? 'secondary' : 'ad', disabled: b.left <= 0 || b.adState === 'loading' || b.adState === 'playing' };
  const distBtn = { id: 'result:dist', label: distLabel, kind: d.unlocked ? 'secondary' : 'ad', disabled: !d.unlocked && (d.adState === 'loading' || d.adState === 'playing') };
  if (fits) {
    W.button(ctx, L, hits, Object.assign({ x, y, w: half, h: bh }, bonusBtn));
    W.button(ctx, L, hits, Object.assign({ x: x + half + gap, y, w: half, h: bh }, distBtn));
    y += bh;
  } else {
    W.button(ctx, L, hits, Object.assign({ x, y, w, h: bh }, bonusBtn));
    y += bh + gap;
    W.button(ctx, L, hits, Object.assign({ x, y, w, h: bh }, distBtn));
    y += bh;
  }
  const hint = b.left <= 0 ? '今天的加一题用完了' : b.adState === 'error' || d.adState === 'error' ? '暂无广告，请稍后再试' : null;
  if (hint) {
    W.text(ctx, hint, L.cx, y + L.u(16), { size: W.fs(L, 'body'), color: C.sub, align: 'center', maxW: w });
    y += L.u(28);
  }
  y += L.u(22);
  // row 3
  W.button(ctx, L, hits, { id: 'result:host', x, y, w: half, h: bh, label: '出一道题' });
  W.button(ctx, L, hits, { id: 'result:archive', x: x + half + gap, y, w: half, h: bh, label: '往期刻度' });
  y += bh;
  return y - y0;
}

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const top = K.header(ctx, L, hits, { back: '首页', title: '每日刻度 · 第 ' + (vm.issueNo || '-') + ' 期' });
  const pTop = K.pinnedTop(L, 1);
  const bottom = pTop - L.u(10);
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: bottom - top,
    scroll: vm.scrollY || 0,
    id: 'result:scroll',
    draw(c, h, vh) {
      let y = hero(c, L, vm, top + L.u(4)) + L.u(6);
      (vm.rows || []).forEach((r) => {
        y += rowCard(c, L, L.x0, y, L.contentW, r) + L.u(8);
      });
      const lines = [];
      if (vm.divisiveText) lines.push([vm.divisiveText, C.ink, 700]);
      if (vm.groupText) lines.push([vm.groupText, C.groupText, 700]);
      if (vm.streakText) lines.push([vm.streakText, C.youText, 800]);
      lines.forEach((ln) => {
        y += W.paragraph(c, ln[0], L.x0, y, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), weight: ln[2], color: ln[1], align: 'center' }) + L.u(2);
      });
      y += L.u(14);
      const ah = actions(W.dryCtx(c), L, new Hits(), vm, 0);
      const ay = Math.max(y, top + vh - ah - L.u(2));
      actions(c, L, h, vm, ay);
      return ay + ah + L.u(4);
    },
  });
  shareRow(ctx, L, hits, pTop);
  if (vm.sheet === 'distribution') S.drawDistribution(ctx, L, hits, vm);
  return hits.result();
}

module.exports = { draw, rowCard, hero };
