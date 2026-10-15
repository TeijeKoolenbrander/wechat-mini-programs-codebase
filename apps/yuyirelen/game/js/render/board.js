/**
 * Group board (群榜) and friend board (好友榜), spec 8.8. draw(ctx, vm, layout)
 * -> hitAreas. The ranked rows are drawn by the open data domain (opendata/);
 * this screen blits that shared canvas into boardRect(L, vm).
 *
 * vm = spec 13 Board model, plus extras (CONTRACT.md):
 *   sharedCanvas: canvas from wx.getOpenDataContext().canvas (state 'ready')
 *   viewerPlayed: boolean (default true)   false -> "未开始" + 去猜
 *   canShare: boolean (default true)       shows 分享到本群 / 分享给好友
 *   errorKind: 'list'|'group'              copy for state 'error'
 *   previewFrame: boolean                  dev previews only: outline the banner slot
 *   display, t
 *
 * Hit ids: board:back, board:retry, board:goPlay, board:share,
 *   board:contract, board:agree, board:openSetting, board:list (drag area;
 *   forward the offset to the open data domain as {type:'scroll', offset}).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

/** Rect of the ad banner slot (when vm.bannerVisible), at the bottom, >= 24pt below the buttons. */
function bannerRect(L, vm) {
  if (!vm || !vm.bannerVisible) return null;
  const h = L.u(60);
  return { x: L.x0, y: L.bottomEdge - L.bottomPad - h, w: L.contentW, h };
}

/** Geometry of the bottom stack: action button, footer line and (optional) banner. */
function stack(L, vm) {
  const btnH = L.u(T.METRICS.btn);
  const ban = bannerRect(L, vm);
  const bottom = ban ? ban.y - L.u(24) : L.bottomEdge - L.bottomPad;
  const btnY = bottom - btnH;
  const footH = L.u(T.METRICS.large ? 36 : 30);
  const footY = btnY - L.u(6) - footH;
  return { btnH, btnY, footY, footH, banner: ban, bottom };
}

/** The rect the open data canvas must be sized for (send width/height/dpr in the postMessage). */
function boardRect(L, vm) {
  const s = stack(L, vm || {});
  const top = L.navBottom + L.u(T.METRICS.large ? 52 : 44);
  return { x: L.x0, y: top, w: L.contentW, h: Math.max(L.u(160), s.footY - L.u(6) - top) };
}

function selfLine(ctx, L, vm, y) {
  if (!vm.myLine) return y;
  const h = L.u(T.METRICS.large ? 60 : 52);
  W.card(ctx, L.x0, y, L.contentW, h, { fill: 'rgba(224,138,46,0.14)', stroke: T.BAND_COLOR.hot, lw: 2 });
  W.text(ctx, vm.myLine, L.cx, y + h / 2, { size: T.FS.bodyL, weight: 800, serif: true, align: 'center', maxW: L.contentW - L.u(16) });
  return y + h + L.u(12);
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'board:back');
  W.text(ctx, vm.title || '', L.x0, L.navBottom + L.u(T.METRICS.large ? 24 : 20), { size: T.FS.bodyL + 2, weight: 800, serif: true, maxW: L.contentW });

  const s = stack(L, vm);
  const cw = L.contentW;
  const top = L.navBottom + L.u(T.METRICS.large ? 60 : 52);
  const kind = vm.kind === 'friend' ? 'friend' : 'group';
  const played = vm.viewerPlayed !== false;
  const canShare = vm.canShare !== false;
  const primary = (id, label) => W.button(ctx, L, hits, { id, x: L.x0, y: s.btnY, w: cw, h: s.btnH, label, kind: 'primary' });
  const second = (id, label, y) => W.button(ctx, L, hits, { id, x: L.x0, y, w: cw, h: s.btnH, label, kind: 'secondary', size: T.FS.bodyL });

  switch (vm.state) {
    case 'noGroup': {
      W.message(ctx, L, ['在群聊里点开本游戏的分享卡片，就能看到本群战况', '游戏的其他功能不受影响'], top + L.u(30));
      if (canShare) second('board:share', '分享到群', s.btnY);
      break;
    }
    case 'checkingGroup':
    case 'loading': {
      const n = Math.max(3, Math.floor((s.footY - top) / L.u(66)));
      for (let i = 0; i < Math.min(n, 6); i++) {
        const ry = top + i * L.u(66);
        W.card(ctx, L.x0, ry, cw, L.u(60), { r: L.u(12) });
        W.skeleton(ctx, L.x0 + L.u(12), ry + L.u(10), L.u(40), L.u(40), vm.t, L.u(20));
        W.skeleton(ctx, L.x0 + L.u(64), ry + L.u(14), cw * 0.4, L.u(16), vm.t, 6);
        W.skeleton(ctx, L.x0 + L.u(64), ry + L.u(36), cw * 0.25, L.u(14), vm.t, 6);
      }
      W.text(ctx, vm.state === 'checkingGroup' ? '正在确认群聊…' : '正在读取榜单…', L.cx, s.btnY + s.btnH / 2, { size: T.FS.bodyL, color: C.sub, align: 'center' });
      break;
    }
    case 'ready': {
      const r = boardRect(L, vm);
      if (vm.sharedCanvas) {
        try {
          ctx.drawImage(vm.sharedCanvas, r.x, r.y, r.w, r.h);
        } catch (e) {
          /* canvas not ready yet: logic redraws next frame */
        }
      }
      hits.add('board:list', r.x, r.y, r.w, r.h);
      if (vm.footer) W.text(ctx, vm.footer, L.cx, s.footY + s.footH / 2, { size: T.FS.body, color: C.sub, align: 'center', maxW: cw });
      if (!played) {
        W.text(ctx, '未开始', L.x0, s.btnY + s.btnH / 2, { size: T.FS.bodyL, weight: 800, serif: true, color: C.accent });
        const gw = Math.round(cw * 0.46);
        W.button(ctx, L, hits, { id: 'board:goPlay', x: L.x0 + cw - gw, y: s.btnY, w: gw, h: s.btnH, label: '去猜', kind: 'primary' });
      } else if (canShare) {
        primary('board:share', kind === 'group' ? '分享到本群' : '分享给好友');
      }
      break;
    }
    case 'empty': {
      W.message(ctx, L, [kind === 'group' ? '本群今天还没人开始猜' : '还没有好友开始猜，叫上他们？'], top + L.u(40));
      if (!played) {
        primary('board:goPlay', '去猜');
        if (canShare) second('board:share', kind === 'group' ? '分享到群' : '叫上好友', s.btnY - s.btnH - L.u(12));
      } else if (canShare) primary('board:share', kind === 'group' ? '分享到群' : '叫上好友');
      break;
    }
    case 'error': {
      const grp = vm.errorKind === 'group';
      W.message(ctx, L, [grp ? '没能确认群聊' : '榜单暂时打不开', '网络不太顺，请稍后再试'], top + L.u(40));
      primary('board:retry', '重试');
      break;
    }
    case 'privacyDenied': {
      let y = W.message(ctx, L, ['查看榜单需要同意《用户隐私保护指引》', '不同意也可以继续玩，只是看不到榜单'], top + L.u(10));
      y = selfLine(ctx, L, vm, y + L.u(4));
      second('board:contract', '查看指引', s.btnY - s.btnH - L.u(12));
      primary('board:agree', '同意并查看');
      break;
    }
    case 'scopeDenied': {
      const y = W.message(ctx, L, ['你未开启「微信朋友关系」授权，看不到好友与群友的成绩', '游戏的其他功能不受影响'], top + L.u(10));
      selfLine(ctx, L, vm, y + L.u(4));
      primary('board:openSetting', '去设置开启');
      break;
    }
    default:
      break;
  }
  if (s.banner && vm.previewFrame) {
    // the native banner covers this slot; a faint frame keeps the layout honest in previews
    ctx.setLineDash([L.u(4), L.u(4)]);
    W.strokeRR(ctx, s.banner.x, s.banner.y, s.banner.w, s.banner.h, L.u(8), C.line, 1);
    ctx.setLineDash([]);
  }
  return hits.result();
}

module.exports = { draw, boardRect, bannerRect };
