/**
 * Day result (spec 6.4) and the 全国分布 sheet. draw(ctx, vm, layout) -> hitAreas.
 * vm = DayResult (spec 10) + {display, stale, sheet: null|'distribution', sheetScroll, scrollY, t, revealT}.
 * Layout: header, a scrolling page (result:scroll: total, five mini rulers, lines, ad buttons, 出一道题 / 往期刻度) and the pinned
 * row 分享 / 本群 / 好友榜 at the bottom (thumb zone). The ad buttons sit in the scrolling page, never adjacent to 分享 (AC 55).
 * Hit ids: result:back, result:share, result:group, result:friends, result:bonus, result:distribution, result:host,
 * result:archive, result:scroll, sheet:close, sheet:list, sheet:body.
 */

const T = require('./theme');
const W = require('./widgets');
const ruler = require('./ruler');
const { Hits } = require('./layout');
const C = T.COLORS;

/** 21 bins centred on 0, 5, ..., 100 (TD-16): the bin of position p is floor((p + 2) / 5). */
function binOf(pos) {
  return Math.max(0, Math.min(20, Math.floor((pos + 2) / 5)));
}

function adLabel(base, state) {
  return state === 'loading' || state === 'playing' ? '加载中…' : base;
}

function rowBlock(ctx, L, vm, r, w) {
  const large = T.isLarge();
  const sz = T.FS.bodyL;
  const rm = ruler.metrics(L, true);
  const lineH = Math.round(sz * 1.4);
  const small = Math.round(T.FS.body * 1.4);
  const markers = [{ pos: r.nation, kind: 'nation' }, { pos: r.you, kind: 'you' }];
  const revealT = vm.revealT == null ? 1 : vm.revealT;
  if (large) {
    // one block per row (a scrolling page is cut between rows, so a prompt is never separated from its ruler)
    return [
      {
        h: lineH + rm.total + small + L.u(14),
        draw: (c, x, y, ww) => {
          W.text(c, r.prompt, x, y + lineH / 2, { size: sz, weight: 800, maxW: ww });
          ruler.draw(c, L, { x, y: y + lineH, w: ww, left: r.left, right: r.right, mini: true, markers, revealT, display: vm.display });
          const ly = y + lineH + rm.total + small / 2 + L.u(2);
          W.text(c, r.label, x, ly, { size: T.FS.body, weight: 700, color: C.sub });
          W.text(c, r.scoreText, x + ww, ly, { size: sz, weight: 800, color: C.primary, align: 'right' });
        },
      },
    ];
  }
  return [
    {
      h: lineH + rm.total + L.u(10),
      draw: (c, x, y, ww) => {
        const right = r.label + '  ' + r.scoreText;
        const rw = W.measure(c, right, sz, 700);
        W.text(c, r.prompt, x, y + lineH / 2, { size: sz, weight: 800, maxW: ww - rw - L.u(12) });
        W.text(c, r.label, x + ww - W.measure(c, r.scoreText, sz, 800) - L.u(10), y + lineH / 2, { size: T.FS.body, weight: 700, color: C.sub, align: 'right' });
        W.text(c, r.scoreText, x + ww, y + lineH / 2, { size: sz, weight: 800, color: C.primary, align: 'right' });
        ruler.draw(c, L, { x, y: y + lineH, w: ww, left: r.left, right: r.right, mini: true, markers, revealT, display: vm.display });
      },
    },
  ];
}

function totalBlock(ctx, L, vm, w) {
  const hero = T.FS.hero;
  const hHero = Math.round(hero * 1.2);
  const lab = Math.round(T.FS.bodyL * 1.4);
  const pillH = T.FS.body + L.u(10);
  const h = lab + hHero + L.u(6) + pillH + L.u(4);
  return {
    h,
    draw: (c, x, y, ww) => {
      W.text(c, '今日默契分', x + ww / 2, y + lab / 2, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
      const tw = W.measure(c, vm.totalText, hero, 800);
      const tag = '(' + vm.statusTag + ')';
      const tagW = W.measure(c, tag, T.FS.body, 700);
      const stale = vm.stale ? W.measure(c, '暂未更新', T.FS.body, 700) + L.u(10) : 0;
      const gap = L.u(8);
      const total = tw + gap + tagW + (stale ? gap + stale : 0);
      let sx = x + ww / 2 - total / 2;
      const cy = y + lab + hHero / 2;
      W.text(c, vm.totalText, sx, cy, { size: hero, weight: 800, color: C.ink });
      sx += tw + gap;
      W.text(c, tag, sx, cy + hero * 0.12, { size: T.FS.body, weight: 700, color: C.sub });
      if (stale) W.text(c, '暂未更新', sx + tagW + gap, cy + hero * 0.12, { size: T.FS.body, weight: 700, color: C.danger });
      W.pill(c, L, x + ww / 2, y + lab + hHero + L.u(6) + pillH / 2, vm.bandLabel, { align: 'center', size: T.FS.body, color: C.primary });
    },
  };
}

function textBlock(ctx, L, str, color, w, weight) {
  const lh = Math.round(T.FS.bodyL * 1.4);
  const n = W.wrap(ctx, str, w, T.FS.bodyL, weight || 600).length;
  return { h: n * lh, draw: (c, x, y, ww) => W.paragraph(c, str, x, y, ww, lh, { size: T.FS.bodyL, weight: weight || 600, color, align: 'center' }) };
}

function distributionSheet(ctx, L, hits, vm) {
  const d = vm.distribution || {};
  const s0 = W.sheet(ctx, L, hits, { h: L.H - L.navBottom, title: '全国分布' });
  const w = s0.w;
  const barH = L.u(T.isLarge() ? 56 : 46);
  const lh = Math.round(T.FS.bodyL * 1.4);
  const hist = d.hist || [];
  const blocks = [];
  (vm.rows || []).forEach((r, i) => {
    const bins = hist[i] || [];
    const max = Math.max(1, ...bins);
    const h = lh + L.u(18) + barH + Math.round(T.FS.body * 1.4) + L.u(6);
    blocks.push({
      h,
      draw: (c, x, y, ww) => {
        W.text(c, r.prompt, x, y + lh / 2, { size: T.FS.bodyL, weight: 800, maxW: ww });
        const by = y + lh + L.u(18);
        const bw = ww / 21;
        // ▼ at the bin of `you` (shape differs from bars)
        const yb = binOf(r.you);
        bins.forEach((n, k) => {
          const bh = Math.max(2, (barH * n) / max);
          c.fillStyle = k === yb ? C.you : C.nation;
          c.globalAlpha = T.isHC() ? 1 : k === yb ? 1 : 0.8;
          c.fillRect(x + k * bw + 1, by + barH - bh, Math.max(1, bw - 2), bh);
          c.globalAlpha = 1;
        });
        c.fillStyle = C.ink;
        c.fillRect(x, by + barH, ww, 2);
        ruler.drawYou(c, x + yb * bw + bw / 2, by - 1, L.u(16), {});
        const ly = by + barH + Math.round(T.FS.body * 1.4) / 2 + 2;
        W.text(c, r.left, x, ly, { size: T.FS.body, weight: 700, color: C.sub });
        W.text(c, r.right, x + ww, ly, { size: T.FS.body, weight: 700, color: C.sub, align: 'right' });
      },
    });
  });
  const area = { x: s0.x, y: s0.top, w, h: s0.bottom - s0.top };
  if (!blocks.length) W.text(ctx, '暂无分布数据', L.cx, area.y + L.u(40), { size: T.FS.bodyL, color: C.sub, align: 'center' });
  W.stack(ctx, L, hits, area, blocks, vm.sheetScroll || 0, 'sheet:list', L.u(14));
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  let top = W.frame(ctx, L, hits, { title: vm.issueNo != null ? '每日刻度 · 第 ' + vm.issueNo + ' 期' : '每日刻度', backLabel: '首页', backId: 'result:back' });
  const gap = L.u(10);
  const bh = T.btn(L, 52);
  const large = T.isLarge();

  // pinned row: 分享 / 本群 / 好友榜
  const py = L.bottomEdge - L.bottomPad - bh;
  const bw = (L.contentW - 2 * gap) / 3;
  W.button(ctx, L, hits, { id: 'result:share', x: L.x0, y: py, w: bw, h: bh, label: '分享', kind: 'primary' });
  W.button(ctx, L, hits, { id: 'result:group', x: L.x0 + bw + gap, y: py, w: bw, h: bh, label: '本群' });
  W.button(ctx, L, hits, { id: 'result:friends', x: L.x0 + 2 * (bw + gap), y: py, w: bw, h: bh, label: '好友榜' });

  const w = L.contentW;
  const blocks = [totalBlock(ctx, L, vm, w)];
  (vm.rows || []).forEach((r) => blocks.push(...rowBlock(ctx, L, vm, r, w)));
  if (vm.percentileText) blocks.push(textBlock(ctx, L, vm.percentileText, C.ink, w, 700));
  if (vm.divisiveText) blocks.push(textBlock(ctx, L, vm.divisiveText, C.ink, w, 600));
  if (vm.streakText) blocks.push(textBlock(ctx, L, vm.final ? vm.streakText : vm.streakText + ' · 0:30 定分', C.sub, w, 600));
  if (vm.groupText) blocks.push(textBlock(ctx, L, vm.groupText, C.groupText, w, 700));

  // ad row (never adjacent to 分享) and the rest
  const bonus = vm.bonus || { left: 0, adState: 'idle' };
  const dist = vm.distribution || { unlocked: false, adState: 'idle' };
  const bonusOut = bonus.left === 0;
  const bonusBusy = bonus.adState === 'loading' || bonus.adState === 'playing';
  const distBusy = dist.adState === 'loading' || dist.adState === 'playing';
  const adBtn = (c, id, x, y, ww, label, disabled) => W.button(c, L, hits, { id, x, y, w: ww, h: bh, label, kind: 'ad', disabled });
  const bonusLabel = bonusOut ? '今天的加一题用完了' : adLabel('视频 加一题', bonus.adState);
  const distLabel = dist.unlocked ? '查看全国分布' : adLabel('视频 全国分布', dist.adState);
  const adErr = [];
  if (bonus.adState === 'error') adErr.push('暂无广告，请稍后再试');
  if (dist.adState === 'error' && !dist.unlocked && adErr.length === 0) adErr.push('暂无广告，请稍后再试');
  const errH = Math.round(T.FS.body * 1.4);
  // side by side only when both labels fit their half (at the smallest allowed size); otherwise full-width rows
  const halfW = (w - gap) / 2 - L.u(16) - L.u(T.isLarge() ? 26 : 22) - L.u(8);
  const sideBySide = W.measure(ctx, bonusLabel, T.FS.body, 700) <= halfW && W.measure(ctx, distLabel, T.FS.body, 700) <= halfW;
  if (!large && !bonusOut && sideBySide) {
    blocks.push({
      h: bh,
      gap: L.u(22),
      draw: (c, x, y, ww) => {
        const hw = (ww - gap) / 2;
        adBtn(c, 'result:bonus', x, y, hw, bonusLabel, bonusBusy);
        if (dist.unlocked) W.button(c, L, hits, { id: 'result:distribution', x: x + hw + gap, y, w: hw, h: bh, label: distLabel });
        else adBtn(c, 'result:distribution', x + hw + gap, y, hw, distLabel, distBusy);
      },
    });
  } else {
    blocks.push({
      h: bh,
      gap: L.u(22),
      draw: (c, x, y, ww) => (bonusOut ? W.button(c, L, hits, { x, y, w: ww, h: bh, label: bonusLabel, kind: 'ghost', disabled: true }) : adBtn(c, 'result:bonus', x, y, ww, bonusLabel, bonusBusy)),
    });
    blocks.push({
      h: bh,
      draw: (c, x, y, ww) => (dist.unlocked ? W.button(c, L, hits, { id: 'result:distribution', x, y, w: ww, h: bh, label: distLabel }) : adBtn(c, 'result:distribution', x, y, ww, distLabel, distBusy)),
    });
  }
  if (adErr.length) blocks.push({ h: errH, draw: (c, x, y, ww) => W.text(c, adErr[0], x + ww / 2, y + errH / 2, { size: T.FS.body, weight: 600, color: C.danger, align: 'center', maxW: ww }) });
  blocks.push({
    h: bh,
    gap: L.u(22),
    draw: (c, x, y, ww) => {
      const hw = (ww - gap) / 2;
      W.button(c, L, hits, { id: 'result:host', x, y, w: hw, h: bh, label: '出一道题' });
      W.button(c, L, hits, { id: 'result:archive', x: x + hw + gap, y, w: hw, h: bh, label: '往期刻度' });
    },
  });
  const area = { x: L.x0, y: top + L.u(4), w, h: py - L.u(14) - (top + L.u(4)) };
  W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'result:scroll', L.u(12));
  if (vm.sheet === 'distribution') distributionSheet(ctx, L, hits, vm);
  return hits.result();
}

module.exports = { draw, binOf, rowBlock, distributionSheet, adLabel };
