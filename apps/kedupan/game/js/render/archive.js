/**
 * 往期刻度 (spec 6.9; CONTRACT "archive"): list, day review (read-only) and set end. draw(ctx, vm, layout) -> hitAreas.
 * Which view: vm.kind === 'review' -> review; vm.kind === 'end' (or `nextAvailable` present) -> set end; otherwise the list.
 *  list   : {state, bestStreakText, offlineTag, hasMore, items:[{dateKey, issueNo, dateText, statusText}], banner, scrollY, t, display}
 *           ids archive:back, archive:retry, archive:item:<dateKey>, archive:more, archive:list (page scroll)
 *  review : {state, dateKey, issueNo, kind:'review', rows, mine:{totalText, percentileText}, divisiveText, distribution, sheet, sheetScroll}
 *           ids review:back, review:retry, review:distribution, review:scroll, sheet:close, sheet:list
 *  end    : {totalText, bandLabel, rows, nextAvailable, distribution, adState, sheet}
 *           ids archive:again, archive:backList, archive:distribution
 * Render never knows about interstitials (logic decides on archive:again / archive:backList).
 */

const T = require('./theme');
const W = require('./widgets');
const result = require('./result');
const { Hits, bannerRect } = require('./layout');
const C = T.COLORS;

function msg(ctx, L, str, color, w, weight) {
  const lh = Math.round(T.FS.bodyL * 1.5);
  const n = W.wrap(ctx, str, w - L.u(8), T.FS.bodyL, weight || 600).length;
  return { h: n * lh, draw: (c, x, y, ww) => W.paragraph(c, str, x, y, ww, lh, { size: T.FS.bodyL, weight: weight || 600, color: color || C.ink, align: 'center' }) };
}

function drawList(ctx, vm, L, hits) {
  let top = W.frame(ctx, L, hits, { title: '往期刻度', backId: 'archive:back' });
  const w = L.contentW;
  const bh = T.btn(L, 52);
  const st = vm.state;
  const items = vm.items || [];
  const lh = Math.round(T.FS.body * 1.5);
  // streak line + offline tag
  if (vm.bestStreakText || vm.offlineTag) {
    let x = L.x0;
    if (vm.offlineTag) x += W.pill(ctx, L, L.x0, top + L.u(14), '离线', { color: C.sub, fill: C.skeleton }) + L.u(8);
    if (vm.bestStreakText) W.text(ctx, vm.bestStreakText, x, top + L.u(14), { size: T.FS.body, weight: 600, color: C.sub, maxW: L.x0 + w - x });
    top += lh + L.u(10);
  }
  const showBanner = !!(vm.banner && vm.banner.show && (st === 'ready' || st === 'empty'));
  const bRect = showBanner ? bannerRect(L, vm.banner) : null;
  let bottom = L.bottomEdge - L.bottomPad;
  if (bRect) {
    W.bannerSlot(ctx, L, bRect, vm.banner.stub);
    bottom = bRect.y - L.u(24);
  }
  const blocks = [];
  const rowH = Math.max(L.u(T.isLarge() ? 80 : 62), T.MIN_TAP + L.u(8));
  const itemBlocks = () =>
    items.forEach((it) =>
      blocks.push({
        h: rowH,
        draw: (c, x, y, ww) => {
          W.card(c, x, y, ww, rowH, { fill: C.tile, r: L.u(12), shadow: false });
          const head = '第' + it.issueNo + '期  ' + it.dateText;
          W.text(c, head, x + L.u(14), y + rowH * 0.33, { size: T.FS.bodyL, weight: 800, maxW: ww - L.u(44) });
          W.text(c, it.statusText, x + L.u(14), y + rowH * 0.7, { size: T.FS.body, weight: 600, color: C.sub, maxW: ww - L.u(44) });
          W.text(c, '›', x + ww - L.u(16), y + rowH / 2, { size: T.FS.title, weight: 700, color: C.sub, align: 'center' });
          hits.add('archive:item:' + it.dateKey, x, y, ww, rowH);
        },
      })
    );
  if (st === 'loading') {
    [0, 1, 2, 3, 4].forEach(() => blocks.push({ h: rowH, draw: (c, x, y, ww) => W.skeleton(c, x, y, ww, rowH, vm.t, L.u(12)) }));
  } else if (st === 'empty') {
    blocks.push(msg(ctx, L, '还没有往期，明天再来', C.ink, w, 700));
  } else if ((st === 'error' || st === 'offline') && !items.length) {
    blocks.push(msg(ctx, L, '往期需联网查看', C.ink, w, 700));
    blocks.push({ h: bh, draw: (c, x, y, ww) => W.button(c, L, hits, { id: 'archive:retry', x, y, w: ww, h: bh, label: '重试', kind: 'primary' }) });
  } else {
    itemBlocks();
    if (st === 'error' || st === 'offline') blocks.push({ h: bh, draw: (c, x, y, ww) => W.button(c, L, hits, { id: 'archive:retry', x, y, w: ww, h: bh, label: '重试', kind: 'secondary' }) });
    if (vm.hasMore) blocks.push({ h: bh, draw: (c, x, y, ww) => W.button(c, L, hits, { id: 'archive:more', x, y, w: ww, h: bh, label: '加载更多', kind: 'ghost' }) });
  }
  const area = { x: L.x0, y: top + L.u(2), w, h: bottom - (top + L.u(2)) };
  W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'archive:list', L.u(8));
}

function distButton(ctx, L, hits, id, dist, adState) {
  const bh = T.btn(L, 52);
  const unlocked = dist && dist.unlocked;
  const st = adState || (dist && dist.adState) || 'idle';
  const busy = st === 'loading' || st === 'playing';
  return {
    h: bh + (st === 'error' && !unlocked ? Math.round(T.FS.body * 1.5) : 0),
    draw: (c, x, y, ww) => {
      if (unlocked) W.button(c, L, hits, { id, x, y, w: ww, h: bh, label: '查看全国分布' });
      else W.button(c, L, hits, { id, x, y, w: ww, h: bh, label: result.adLabel('视频 全国分布', st), kind: 'ad', disabled: busy });
      if (st === 'error' && !unlocked) W.text(c, '暂无广告，请稍后再试', x + ww / 2, y + bh + Math.round(T.FS.body * 0.8), { size: T.FS.body, weight: 600, color: C.danger, align: 'center', maxW: ww });
    },
  };
}

function totalLine(ctx, L, label, total, sub, w) {
  const hero = T.FS.hero;
  const lab = Math.round(T.FS.bodyL * 1.4);
  const hh = Math.round(hero * 1.2);
  const subH = sub ? Math.round(T.FS.bodyL * 1.4) : 0;
  return {
    h: lab + hh + subH,
    draw: (c, x, y, ww) => {
      W.text(c, label, x + ww / 2, y + lab / 2, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center', maxW: ww });
      W.text(c, total, x + ww / 2, y + lab + hh / 2, { size: hero, weight: 800, align: 'center' });
      if (sub) W.text(c, sub, x + ww / 2, y + lab + hh + subH / 2, { size: T.FS.bodyL, weight: 700, color: C.primary, align: 'center', maxW: ww });
    },
  };
}

function drawReview(ctx, vm, L, hits) {
  const top = W.frame(ctx, L, hits, { title: vm.issueNo != null ? '往期 · 第 ' + vm.issueNo + ' 期' : '往期回顾', backId: 'review:back' });
  const w = L.contentW;
  const bh = T.btn(L, 52);
  const st = vm.state;
  const blocks = [];
  if (st === 'loading') {
    [0, 1, 2].forEach(() => blocks.push({ h: L.u(60), draw: (c, x, y, ww) => W.skeleton(c, x, y, ww, L.u(52), vm.t, L.u(10)) }));
  } else if (st === 'error' || st === 'offline') {
    blocks.push(msg(ctx, L, '往期需联网查看', C.ink, w, 700));
    blocks.push({ h: bh, draw: (c, x, y, ww) => W.button(c, L, hits, { id: 'review:retry', x, y, w: ww, h: bh, label: '重试', kind: 'primary' }) });
  } else {
    const mine = vm.mine || {};
    blocks.push(totalLine(ctx, L, '定分', mine.totalText || '', mine.percentileText, w));
    blocks.push(distButton(ctx, L, hits, 'review:distribution', vm.distribution, vm.distribution && vm.distribution.adState));
    (vm.rows || []).forEach((r) => blocks.push(...result.rowBlock(ctx, L, vm, r, w)));
    if (vm.divisiveText) blocks.push(msg(ctx, L, vm.divisiveText, C.ink, w, 600));
  }
  const area = { x: L.x0, y: top + L.u(4), w, h: L.bottomEdge - L.bottomPad - (top + L.u(4)) };
  W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'review:scroll', L.u(12));
  if (vm.sheet === 'distribution') result.distributionSheet(ctx, L, hits, vm);
}

function drawEnd(ctx, vm, L, hits) {
  const top = W.frame(ctx, L, hits, { title: '往期练习', backId: 'archive:backList' });
  const w = L.contentW;
  const bh = T.btn(L, 52);
  const gap = L.u(10);
  let by = L.bottomEdge - L.bottomPad - bh;
  W.button(ctx, L, hits, { id: 'archive:backList', x: L.x0, y: by, w, h: bh, label: '返回列表', kind: vm.nextAvailable ? 'secondary' : 'primary' });
  if (vm.nextAvailable) {
    by -= bh + gap;
    W.button(ctx, L, hits, { id: 'archive:again', x: L.x0, y: by, w, h: bh, label: '再来一期', kind: 'primary' });
  }
  const blocks = [];
  blocks.push(totalLine(ctx, L, '往期练习 · 不计入排行', vm.totalText, vm.bandLabel, w));
  blocks.push(distButton(ctx, L, hits, 'archive:distribution', vm.distribution, vm.adState || (vm.distribution && vm.distribution.adState)));
  (vm.rows || []).forEach((r) => blocks.push(...result.rowBlock(ctx, L, vm, r, w)));
  const area = { x: L.x0, y: top + L.u(4), w, h: by - L.u(14) - (top + L.u(4)) };
  W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'review:scroll', L.u(12));
  if (vm.sheet === 'distribution') result.distributionSheet(ctx, L, hits, vm);
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  if (vm.kind === 'review') drawReview(ctx, vm, L, hits);
  else if (vm.kind === 'end' || vm.nextAvailable !== undefined) drawEnd(ctx, vm, L, hits);
  else drawList(ctx, vm, L, hits);
  return hits.result();
}

module.exports = { draw };
