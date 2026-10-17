/**
 * 本群 page and 好友榜 (spec 6.8; CONTRACT "group"). draw(ctx, vm, layout) -> hitAreas.
 * vm = GroupPage or FriendBoard (spec 10) with kind: 'group'|'friend' + {display, sharedCanvas, banner:{show, reservedHeight, stub?}, t, scrollY}.
 * Hit ids: board:back, board:retry, board:goPlay, board:share, board:contract, board:agree, board:openSetting, board:list (drag the
 * open data list), board:round:<roundId>, plus board:scroll (the page scrolls; contract change request).
 *
 * The page is a scrolling stack (stats, open data list, 7-day trend, rounds list) with the voluntary 分享到本群 pinned at the
 * bottom (above the banner when one is shown). The open data canvas is drawn here with drawImage(vm.sharedCanvas, rect); its
 * size is boardRect(L, banner, display) (layout.js). Every state draws and none blocks 返回.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits, boardRect, bannerRect } = require('./layout');
const C = T.COLORS;

function msg(ctx, L, str, color, w, weight, align) {
  const lh = Math.round(T.FS.bodyL * 1.5);
  const n = W.wrap(ctx, str, w - L.u(8), T.FS.bodyL, weight || 600).length;
  return { h: n * lh, draw: (c, x, y, ww) => W.paragraph(c, str, x, y, ww, lh, { size: T.FS.bodyL, weight: weight || 600, color: color || C.ink, align: align || 'center' }) };
}

function btnBlock(ctx, L, hits, o) {
  const h = T.btn(L, 52);
  return { h, draw: (c, x, y, ww) => W.button(c, L, hits, Object.assign({ x, y, w: ww, h }, o)) };
}

function statsBlock(ctx, L, vm, w) {
  const hero = T.FS.hero;
  const lh = Math.round(T.FS.bodyL * 1.4);
  const rows = [];
  if (vm.mqText) rows.push('mq');
  const out = [];
  if (vm.mqText) {
    const h = Math.round(hero * 1.25);
    out.push({
      h,
      draw: (c, x, y, ww) => {
        const label = '本群今日默契度';
        const lw = W.measure(c, label, T.FS.bodyL, 700);
        const mw = W.measure(c, vm.mqText, hero, 800);
        const gap = L.u(12);
        const sx = x + (ww - (lw + gap + mw)) / 2;
        W.text(c, label, sx, y + h / 2 + 3, { size: T.FS.bodyL, weight: 700, color: C.sub });
        W.text(c, vm.mqText, sx + lw + gap, y + h / 2, { size: hero, weight: 800, color: C.groupText });
      },
    });
  }
  if (vm.countText) out.push(msg(ctx, L, vm.countText, C.ink, w, 700));
  if (vm.divisiveText) out.push(msg(ctx, L, vm.divisiveText, C.sub, w, 600));
  void rows;
  void lh;
  return out;
}

function listBlock(ctx, L, hits, vm, rect) {
  return {
    h: rect.h,
    partial: true,
    draw: (c, x, y, ww) => {
      W.card(c, x, y, ww, rect.h, { fill: C.tile, r: L.u(12), shadow: false });
      if (vm.sharedCanvas) {
        try {
          c.drawImage(vm.sharedCanvas, x, y, ww, rect.h);
        } catch (e) {
          /* nothing to draw yet */
        }
      }
      hits.add('board:list', x, y, ww, rect.h);
    },
  };
}

function trendBlock(ctx, L, vm, w) {
  const trend = vm.trend || [];
  if (!trend.length) return null;
  const labelH = Math.round(T.FS.bodyL * 1.5);
  const cellLab = Math.round(T.FS.body * 1.4);
  const cellVal = Math.round(T.FS.bodyL * 1.5);
  const maxLab = Math.max.apply(null, trend.map((t) => W.measure(ctx, t.label, T.FS.body, 600)));
  const single = w / trend.length >= maxLab + L.u(2);
  const cols = single ? trend.length : 4;
  const rowsN = Math.ceil(trend.length / cols);
  const cellH = cellLab + cellVal + L.u(4);
  const h = labelH + L.u(6) + rowsN * cellH;
  return {
    h,
    draw: (c, x, y, ww) => {
      W.text(c, '近 7 天默契度', x, y + labelH / 2, { size: T.FS.bodyL, weight: 700 });
      const cw = ww / cols;
      trend.forEach((t, i) => {
        const cx = x + (i % cols) * cw + cw / 2;
        const cy = y + labelH + L.u(6) + Math.floor(i / cols) * cellH;
        W.text(c, t.label, cx, cy + cellLab / 2, { size: T.FS.body, weight: 600, color: C.sub, align: 'center', minSize: T.FS.body });
        W.text(c, t.value == null ? '—' : String(t.value), cx, cy + cellLab + cellVal / 2, { size: T.FS.bodyL, weight: 800, color: t.value == null ? C.sub : C.groupText, align: 'center' });
      });
    },
  };
}

function roundsBlocks(ctx, L, hits, vm, w) {
  const rounds = vm.rounds || [];
  if (!rounds.length) return [];
  const labelH = Math.round(T.FS.bodyL * 1.5);
  const rowH = Math.max(L.u(T.isLarge() ? 76 : 58), T.MIN_TAP + L.u(6));
  const out = [
    { h: labelH, draw: (c, x, y) => W.text(c, '本群出题', x, y + labelH / 2, { size: T.FS.bodyL, weight: 700 }) },
  ];
  rounds.forEach((r) => {
    out.push({
      h: rowH,
      gap: L.u(6),
      draw: (c, x, y, ww) => {
        W.card(c, x, y, ww, rowH, { fill: C.tile, r: L.u(10), shadow: false });
        const mq = r.mqText || '';
        const mw = mq ? W.measure(c, mq, T.FS.bodyL, 800) + L.u(10) : 0;
        W.text(c, r.title, x + L.u(12), y + rowH * 0.34, { size: T.FS.bodyL, weight: 800, maxW: ww - L.u(40) - mw });
        if (mq) W.text(c, mq, x + ww - L.u(28), y + rowH * 0.34, { size: T.FS.bodyL, weight: 800, color: C.groupText, align: 'right' });
        W.text(c, r.statusText || '', x + L.u(12), y + rowH * 0.72, { size: T.FS.body, weight: 600, color: C.sub, maxW: ww - L.u(40) });
        W.text(c, '›', x + ww - L.u(14), y + rowH / 2, { size: T.FS.title, weight: 700, color: C.sub, align: 'center' });
        hits.add('board:round:' + r.roundId, x, y, ww, rowH);
      },
    });
  });
  return out;
}

function skeletonRows(ctx, L, vm, w) {
  const rh = L.u(52);
  return [0, 1, 2, 3, 4].map((i) => ({ h: rh, gap: L.u(8), draw: (c, x, y, ww) => W.skeleton(c, x, y, ww, rh, vm.t, L.u(10)) }));
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  const friend = vm.kind === 'friend';
  const title = friend ? '好友 · 今日刻度' : vm.issueNo != null ? '本群 · 第 ' + vm.issueNo + ' 期' : '本群';
  const top = W.frame(ctx, L, hits, { title, backId: 'board:back' });
  const w = L.contentW;
  const bh = T.btn(L, 52);
  const st = vm.state;
  const gap = L.u(12);
  const banner = vm.banner || { show: false, reservedHeight: 0 };
  const showBanner = !!(banner.show && (st === 'ready' || st === 'empty'));
  const bRect = showBanner ? bannerRect(L, banner) : null;
  const rect = boardRect(L, showBanner ? banner : null, vm.display);

  const blocks = [];
  const add = (b) => b && blocks.push(b);
  const stats = () => statsBlock(ctx, L, vm, w).forEach(add);
  const list = () => add(listBlock(ctx, L, hits, vm, rect));
  const trendRounds = () => {
    if (friend) return;
    add(trendBlock(ctx, L, vm, w));
    roundsBlocks(ctx, L, hits, vm, w).forEach(add);
  };
  const goPlay = () => add(btnBlock(ctx, L, hits, { id: 'board:goPlay', label: '去答题', kind: 'primary' }));
  let pinnedShare = false;

  if (!friend) {
    switch (st) {
      case 'noGroup':
      case 'groupFailed':
        add(msg(ctx, L, '在群聊里点开本游戏的卡片，就能看到本群的默契度', C.ink, w, 700));
        add(btnBlock(ctx, L, hits, { id: 'board:share', label: '分享到群', kind: 'secondary' }));
        break;
      case 'checkingGroup':
        add({ h: Math.round(T.FS.bodyL * 1.5), draw: (c, x, y, ww) => W.text(c, '正在确认群聊…', x + ww / 2, y + 12, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' }) });
        skeletonRows(ctx, L, vm, w).slice(0, 3).forEach(add);
        break;
      case 'loading':
        skeletonRows(ctx, L, vm, w).forEach(add);
        break;
      case 'notPlayed':
        if (vm.countText) add(msg(ctx, L, vm.countText, C.ink, w, 700));
        add(msg(ctx, L, '完成今日刻度后查看本群默契', C.sub, w, 600));
        goPlay();
        trendRounds();
        break;
      case 'ready':
        stats();
        list();
        trendRounds();
        pinnedShare = true;
        break;
      case 'small':
        add(msg(ctx, L, '完成人数满 3 人后计算本群默契度', C.ink, w, 700));
        if (vm.countText) add(msg(ctx, L, vm.countText, C.sub, w, 600));
        list();
        trendRounds();
        break;
      case 'empty':
        add(msg(ctx, L, '本群今天还没有人完成', C.ink, w, 700));
        goPlay();
        trendRounds();
        break;
      case 'serverError':
        add(msg(ctx, L, '本群数据暂时打不开', C.ink, w, 700));
        add(btnBlock(ctx, L, hits, { id: 'board:retry', label: '重试', kind: 'primary' }));
        break;
      case 'privacyDenied':
      case 'unauthorized':
        stats();
        add(msg(ctx, L, st === 'privacyDenied' ? '查看群友昵称需要同意《用户隐私保护指引》' : '开启「微信朋友关系」可显示群友昵称', C.ink, w, 700));
        if (st === 'privacyDenied') {
          add({
            h: bh,
            draw: (c, x, y, ww) => {
              const hw = (ww - L.u(10)) / 2;
              W.button(c, L, hits, { id: 'board:contract', x, y, w: hw, h: bh, label: '查看指引', size: T.FS.body });
              W.button(c, L, hits, { id: 'board:agree', x: x + hw + L.u(10), y, w: hw, h: bh, label: '同意并查看', kind: 'primary', size: T.FS.body });
            },
          });
        } else add(btnBlock(ctx, L, hits, { id: 'board:openSetting', label: '去设置开启', kind: 'primary' }));
        list();
        trendRounds();
        break;
      default:
        break;
    }
  } else {
    switch (st) {
      case 'loading':
        skeletonRows(ctx, L, vm, w).forEach(add);
        break;
      case 'ready':
        if (vm.selfText) add(msg(ctx, L, vm.selfText, C.ink, w, 700));
        if (vm.mode === 'selfOnly') add(msg(ctx, L, '好友的成绩为自报，不计排名', C.sub, w, 600));
        list();
        break;
      case 'empty':
        add(msg(ctx, L, '还没有好友完成今日刻度', C.ink, w, 700));
        goPlay();
        break;
      case 'serverError':
        add(msg(ctx, L, '好友榜暂时打不开', C.ink, w, 700));
        add(btnBlock(ctx, L, hits, { id: 'board:retry', label: '重试', kind: 'primary' }));
        break;
      case 'privacyDenied':
      case 'unauthorized':
        if (vm.selfText) add(msg(ctx, L, vm.selfText, C.ink, w, 700));
        add(msg(ctx, L, st === 'privacyDenied' ? '查看好友昵称需要同意《用户隐私保护指引》' : '开启「微信朋友关系」可显示好友昵称', C.ink, w, 700));
        if (st === 'privacyDenied') {
          add({
            h: bh,
            draw: (c, x, y, ww) => {
              const hw = (ww - L.u(10)) / 2;
              W.button(c, L, hits, { id: 'board:contract', x, y, w: hw, h: bh, label: '查看指引', size: T.FS.body });
              W.button(c, L, hits, { id: 'board:agree', x: x + hw + L.u(10), y, w: hw, h: bh, label: '同意并查看', kind: 'primary', size: T.FS.body });
            },
          });
        } else add(btnBlock(ctx, L, hits, { id: 'board:openSetting', label: '去设置开启', kind: 'primary' }));
        list();
        break;
      default:
        break;
    }
  }

  // pinned bottom: banner placeholder (stub only) and the voluntary share button
  let bottom = L.bottomEdge - L.bottomPad;
  if (bRect) {
    W.bannerSlot(ctx, L, bRect, banner.stub);
    bottom = bRect.y - L.u(24);
  }
  if (pinnedShare) {
    const sy = bottom - bh;
    W.button(ctx, L, hits, { id: 'board:share', x: L.x0, y: sy, w, h: bh, label: '分享到本群', kind: 'secondary' });
    bottom = sy - L.u(10);
  } else if (bRect) bottom -= 0;
  const area = { x: L.x0, y: top + L.u(2), w, h: bottom - (top + L.u(2)) };
  W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'board:scroll', gap);
  return hits.result();
}

module.exports = { draw };
