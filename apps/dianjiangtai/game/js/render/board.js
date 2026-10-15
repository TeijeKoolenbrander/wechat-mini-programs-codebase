/**
 * Group board (8.6) and friend board (8.7). draw(ctx, vm, layout) -> hitAreas.
 * The ranked rows themselves are drawn by the open data domain (opendata/),
 * and this screen blits that shared canvas into the board rect.
 *
 * vm = spec 13 Leaderboards model (+ v1 additions) plus extras (CONTRACT.md):
 *   sharedCanvas: the canvas from wx.getOpenDataContext().canvas (state 'ready')
 *   variantLabel: '识人'|null   shown as a badge in the title row
 *   banner: {show, reservedHeight, stub?}  banner slot (spec 12): honoured only
 *     in the ready and empty states; the board canvas and the footer move up by
 *     reservedHeight + 24pt so the banner never touches a row or a button
 *   display, t
 * Board rect: use layout.boardRect(L, vm.banner) for the open data canvas size
 * (same as L.board when there is no banner). Native banner position:
 * layout.bannerRect(L, vm.banner).
 *
 * Hit ids: board:back, board:retry, board:goPlay, board:share, board:contract,
 *   board:agree, board:openSetting, board:list (scroll area while ready).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits, boardRect, bannerRect } = require('./layout');
const { recordDigits } = require('./fmt');
const C = T.COLORS;

function titleOf(vm) {
  return (vm.kind === 'group' ? '本群' : '好友') + ' · 今日军令' + (vm.issueNo != null ? ' 第' + vm.issueNo + '期' : '');
}

function message(ctx, L, lines, top) {
  const large = T.isLarge();
  let y = top;
  lines.forEach((ln, i) => {
    const big = i === 0;
    const size = big ? (large ? T.FS.bodyL : T.FS.title) : large ? T.FS.body : T.FS.bodyL;
    const lh = Math.round(size * 1.4);
    y += W.paragraph(ctx, ln, L.x0 + L.u(8), y, L.contentW - L.u(16), lh, {
      size,
      weight: big ? 800 : 500,
      serif: big,
      color: big ? C.ink : C.sub,
      align: 'center',
    }) + L.u(6);
  });
  return y;
}

function selfLine(ctx, L, vm, y) {
  const rec = vm.self && vm.self.record;
  if (!rec) return y;
  const s = '你今日 ' + recordDigits(rec) + (vm.self.bandLabel ? ' · ' + vm.self.bandLabel : '');
  const h = T.btn(L, 48);
  W.card(ctx, L.x0, y, L.contentW, h, { fill: C.tintSeal, stroke: C.seal, lw: T.isHC() ? 2.5 : 1.5 });
  W.text(ctx, s, L.cx, y + h / 2 + 1, { size: T.FS.bodyL, weight: 800, serif: true, align: 'center', maxW: L.contentW - L.u(16) });
  return y + h + L.u(12);
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'board:back');
  const large = T.isLarge();
  const titleY = L.navBottom + L.u(18);
  let tw = L.contentW;
  let pw = 0;
  if (vm.variantLabel) {
    pw = W.measure(ctx, vm.variantLabel, T.FS.body, 800, true) + L.u(16);
    tw = L.contentW - pw - L.u(8);
  }
  W.text(ctx, titleOf(vm), L.x0, titleY, { size: large ? T.FS.bodyL : T.FS.bodyL + 2, weight: 800, serif: true, maxW: tw, minSize: T.FS.body });
  if (vm.variantLabel) W.pill(ctx, L, L.x0 + L.contentW, titleY, vm.variantLabel, { size: T.FS.body, align: 'right' });

  const bannerOn = (vm.state === 'ready' || vm.state === 'empty') && vm.banner && vm.banner.show && vm.banner.reservedHeight > 0;
  const banner = bannerOn ? vm.banner : null;
  const shift = banner ? banner.reservedHeight + L.u(24) : 0;
  const bh = T.btn(L, 56);
  const by = L.bottomEdge - L.bottomPad - bh - shift;
  const top = L.navBottom + L.u(large ? 60 : 56);
  const bw = L.contentW;
  const actions = vm.actions || {};
  const primary = (id, label) => W.button(ctx, L, hits, { id, x: L.x0, y: by, w: bw, h: bh, label, kind: 'primary' });
  const second = (id, label, yy) => W.button(ctx, L, hits, { id, x: L.x0, y: yy, w: bw, h: T.btn(L, 52), label, kind: 'secondary', size: T.FS.bodyL });
  const secondY = by - T.btn(L, 52) - L.u(12);

  switch (vm.state) {
    case 'noGroup': {
      message(ctx, L, ['在群聊里点开本游戏的分享卡片，就能看到本群排行', '游戏的其他功能不受影响'], top + L.u(30));
      if (actions.canShareToGroup) second('board:share', '分享到群', by);
      break;
    }
    case 'checkingGroup':
    case 'loading': {
      const rowH = L.u(large ? 76 : 66);
      const n = Math.max(3, Math.floor((by - top - L.u(40)) / rowH));
      for (let i = 0; i < Math.min(n, 6); i++) {
        W.card(ctx, L.x0, top + i * rowH, L.contentW, rowH - L.u(6), { r: L.u(10) });
        W.skeleton(ctx, L.x0 + L.u(12), top + i * rowH + L.u(10), L.u(40), L.u(40), vm.t, L.u(20));
        W.skeleton(ctx, L.x0 + L.u(64), top + i * rowH + L.u(14), L.contentW * 0.4, L.u(16), vm.t, 6);
        W.skeleton(ctx, L.x0 + L.u(64), top + i * rowH + L.u(36), L.contentW * 0.25, L.u(14), vm.t, 6);
      }
      W.text(ctx, vm.state === 'checkingGroup' ? '正在确认群聊…' : '正在读取排行…', L.cx, by + bh / 2, { size: T.FS.bodyL, color: C.sub, align: 'center', maxW: L.contentW });
      break;
    }
    case 'ready': {
      const r = boardRect(L, banner);
      if (vm.sharedCanvas) {
        try {
          ctx.drawImage(vm.sharedCanvas, r.x, r.y, r.w, r.h);
        } catch (e) {
          /* canvas not ready yet: logic redraws next frame */
        }
      }
      hits.add('board:list', r.x, r.y, r.w, r.h);
      if (!vm.viewerPlayed) {
        // keep the footer for the call to play; the open data canvas already has its own footnote
        const gw = L.u(large ? 120 : 140);
        W.text(ctx, '你今天还没出征', L.x0, by + bh / 2, { size: T.FS.bodyL, weight: 800, serif: true, color: C.seal, maxW: L.contentW - gw - L.u(8) });
        W.button(ctx, L, hits, { id: 'board:goPlay', x: L.x0 + L.contentW - gw, y: by, w: gw, h: bh, label: '去出征', kind: 'primary' });
      } else if (actions.canShareToGroup) {
        primary('board:share', vm.kind === 'group' ? '分享到本群' : '分享给好友');
      } else {
        W.text(ctx, '出征后可看他人阵容', L.cx, by + bh / 2, { size: T.FS.body, color: C.sub, align: 'center', maxW: L.contentW });
      }
      break;
    }
    case 'empty': {
      message(ctx, L, [vm.kind === 'group' ? '本群今天还没有人出征' : '还没有好友出征，叫上他们？'], top + L.u(40));
      if (!vm.viewerPlayed) {
        primary('board:goPlay', '去出征');
        if (actions.canShareToGroup) second('board:share', vm.kind === 'group' ? '分享到群' : '叫上好友', secondY);
      } else if (actions.canShareToGroup) primary('board:share', vm.kind === 'group' ? '分享到群' : '叫上好友');
      break;
    }
    case 'serverError': {
      message(ctx, L, [vm.kind === 'group' ? '群榜暂时打不开' : '好友榜暂时打不开', '网络不太顺，请稍后再试'], top + L.u(40));
      primary('board:retry', '重 试');
      break;
    }
    case 'privacyDenied': {
      let y = message(ctx, L, ['查看排行需要同意《用户隐私保护指引》', '不同意也可以继续玩，只是看不到排行'], top + L.u(10));
      y = selfLine(ctx, L, vm, y + L.u(4));
      second('board:contract', '查看指引', secondY);
      if (actions.canRetryPrivacy) primary('board:agree', '同意并查看');
      break;
    }
    case 'unauthorized': {
      let y = message(ctx, L, ['你未开启「微信朋友关系」授权，看不到好友与群友的排行', '游戏的其他功能不受影响'], top + L.u(10));
      selfLine(ctx, L, vm, y + L.u(4));
      if (actions.canOpenSetting) primary('board:openSetting', '去设置开启');
      break;
    }
    default:
      break;
  }
  if (banner) W.bannerSlot(ctx, L, bannerRect(L, banner), banner.stub);
  return hits.result();
}

module.exports = { draw };
