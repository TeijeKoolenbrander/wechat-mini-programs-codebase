/**
 * Group board (6.9) and friend board (6.10). draw(ctx, vm, layout) -> hitAreas.
 * The ranked rows are drawn by the open data domain (opendata/); this screen
 * blits that shared canvas into rect(L, vm).
 *
 * vm = spec 10 Boards model plus extras (CONTRACT.md):
 *   sharedCanvas: the canvas from wx.getOpenDataContext().canvas (state 'ready')
 *   viewerPlayed: boolean (default true) -- false shows "你今天还没参加" + 去答题
 *   t: ms clock (skeleton pulse)
 * Use rect(L, vm) for the open-data canvas size ({x,y,w,h}); it already
 * leaves room for banner.reservedHeight.
 *
 * Hit ids: board:back, board:retry, board:goPlay, board:share, board:contract,
 *   board:agree, board:openSetting, board:list (drag area; forward the offset
 *   to the open data domain as {type:'scroll', offset}).
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function titleOf(vm) {
  const parts = [(vm.kind === 'group' ? '本群' : '好友') + ' · 今日一比'];
  if (vm.issueNo != null) parts[0] += ' 第' + vm.issueNo + '期';
  if (vm.themeLabel) parts[0] += ' · ' + vm.themeLabel;
  return parts[0];
}

/** Rectangle the open data canvas must be sized for. */
function rect(L, vm) {
  const r = L.board;
  const reserved = vm && vm.banner && vm.banner.show ? (vm.banner.reservedHeight || 0) + L.u(24) : 0;
  return { x: r.x, y: r.y, w: r.w, h: Math.max(L.u(140), r.h - reserved) };
}

function message(ctx, L, lines, top) {
  let y = top;
  lines.forEach((ln, i) => {
    const big = i === 0;
    y += W.paragraph(ctx, ln, L.x0 + L.u(8), y, L.contentW - L.u(16), L.u(big ? 32 : 26) * (L.large ? 1.2 : 1), {
      size: big ? T.FS.title : T.FS.bodyL,
      weight: big ? 800 : 500,
      serif: big,
      color: big ? C.ink : C.sub,
      align: 'center',
    }) + L.u(6);
  });
  return y;
}

function selfLine(ctx, L, vm, y) {
  const n = vm.self && vm.self.streak;
  if (n == null) return y;
  const h = L.u(48) * (L.large ? 1.2 : 1);
  W.card(ctx, L.x0, y, L.contentW, h, { fill: 'rgba(184,67,47,0.08)', stroke: C.seal, lw: 1.5 });
  W.text(ctx, '你今日连对 ' + n, L.cx, y + h / 2, { size: T.FS.bodyL, weight: 800, serif: true, align: 'center', maxW: L.contentW - L.u(16) });
  return y + h + L.u(12);
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'board:back');
  W.text(ctx, titleOf(vm), L.x0, L.navBottom + L.u(18), { size: T.FS.bodyL + 2, weight: 800, serif: true, maxW: L.contentW });

  const bh = L.btnH;
  const by = L.bottomEdge - L.bottomPad - bh;
  const top = L.navBottom + L.u(56) * (L.large ? 1.15 : 1);
  const bw = L.contentW;
  const actions = vm.actions || {};
  const gap = L.u(12);
  const primary = (id, label) => W.button(ctx, L, hits, { id, x: L.x0, y: by, w: bw, h: bh, label, kind: 'primary' });
  const second = (id, label, yy) => W.button(ctx, L, hits, { id, x: L.x0, y: yy, w: bw, h: L.btnH2, label, kind: 'secondary', size: T.FS.bodyL });
  const kindShare = vm.kind === 'group' ? '分享到本群' : '分享给好友';

  switch (vm.state) {
    case 'noGroup': {
      message(ctx, L, ['在群聊里点开本游戏的分享卡片，就能看到本群排行', '游戏的其他功能不受影响'], top + L.u(30));
      if (actions.canShareToGroup) second('board:share', kindShare, by);
      break;
    }
    case 'checkingGroup':
    case 'loading': {
      const rowH = L.u(66);
      const n = Math.min(6, Math.max(3, Math.floor((by - top - L.u(40)) / rowH)));
      for (let i = 0; i < n; i++) {
        W.card(ctx, L.x0, top + i * rowH, L.contentW, rowH - L.u(6), { r: L.u(10) });
        W.skeleton(ctx, L.x0 + L.u(12), top + i * rowH + L.u(10), L.u(40), L.u(40), vm.t, L.u(20));
        W.skeleton(ctx, L.x0 + L.u(64), top + i * rowH + L.u(14), L.contentW * 0.4, L.u(16), vm.t, 6);
        W.skeleton(ctx, L.x0 + L.u(64), top + i * rowH + L.u(36), L.contentW * 0.25, L.u(14), vm.t, 6);
      }
      W.text(ctx, vm.state === 'checkingGroup' ? '正在确认群聊…' : '正在读取排行…', L.cx, by + bh / 2, { size: T.FS.bodyL, color: C.sub, align: 'center' });
      break;
    }
    case 'ready': {
      const r = rect(L, vm);
      if (vm.sharedCanvas) {
        try {
          ctx.drawImage(vm.sharedCanvas, r.x, r.y, r.w, r.h);
        } catch (e) {
          /* canvas not ready yet: logic redraws next frame */
        }
      }
      hits.add('board:list', r.x, r.y, r.w, r.h);
      if (vm.viewerPlayed === false) {
        const bw2 = L.u(150);
        W.text(ctx, '你今天还没参加', L.x0, by + bh / 2, { size: T.FS.bodyL, weight: 800, serif: true, color: C.seal, maxW: bw - bw2 - L.u(10) });
        W.button(ctx, L, hits, { id: 'board:goPlay', x: L.x0 + bw - bw2, y: by, w: bw2, h: bh, label: '去答题', kind: 'primary' });
      } else if (actions.canShareToGroup) {
        primary('board:share', kindShare);
      }
      break;
    }
    case 'empty': {
      message(ctx, L, [vm.kind === 'group' ? '本群今天还没有人参加' : '还没有好友参加，叫上他们？'], top + L.u(40));
      if (vm.viewerPlayed === false) {
        primary('board:goPlay', '去答题');
        if (actions.canShareToGroup) second('board:share', vm.kind === 'group' ? '分享到群' : '叫上好友', by - L.btnH2 - gap);
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
      second('board:contract', '查看指引', by - L.btnH2 - gap);
      if (actions.canRetryPrivacy) primary('board:agree', '同意并查看');
      break;
    }
    case 'unauthorized': {
      const y = message(ctx, L, ['你未开启「微信朋友关系」授权，看不到好友与群友的排行', '游戏的其他功能不受影响'], top + L.u(10));
      selfLine(ctx, L, vm, y + L.u(4));
      if (actions.canOpenSetting) primary('board:openSetting', '去设置开启');
      break;
    }
    default:
      break;
  }
  return hits.result();
}

module.exports = { draw, rect, titleOf };
