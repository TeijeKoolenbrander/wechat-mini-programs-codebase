/**
 * 本群 (group page, spec 6.8). The member list is drawn by the open data
 * domain into the window this file reserves (hitAreas.board).
 */

const T = require('./theme');
const W = require('./widgets');
const K = require('./chrome');
const B = require('./board');
const C = T.C;

function rounds(ctx, L, hits, list, y) {
  W.text(ctx, '本群出题', L.x0, y + L.u(12), { size: W.fs(L, 'bodyL'), weight: 800 });
  y += L.u(32);
  const bs = W.fs(L, 'body');
  const h = Math.max(T.MIN_TAP + L.u(8), bs * 3.1);
  list.slice(0, 10).forEach((r) => {
    W.card(ctx, L.x0, y, L.contentW, h, { r: L.u(12) });
    W.text(ctx, r.title, L.x0 + L.u(14), y + h * 0.34, { size: W.fs(L, 'bodyL'), weight: 800, maxW: L.contentW * 0.55 });
    if (r.mqText) W.text(ctx, r.mqText, L.x0 + L.contentW - L.u(34), y + h * 0.34, { size: bs, weight: 800, align: 'right', color: C.groupText });
    W.text(ctx, r.statusText || '', L.x0 + L.u(14), y + h * 0.72, { size: bs, color: C.sub, maxW: L.contentW - L.u(60) });
    W.iconChevron(ctx, L.x0 + L.contentW - L.u(18), y + h / 2, L.u(14), C.sub, 'right');
    hits.add('group:round:' + r.roundId, L.x0, y, L.contentW, h);
    y += h + L.u(8);
  });
  return y;
}

function stats(ctx, L, vm, y) {
  [
    [vm.countText, C.ink, 700],
    [vm.divisiveText, C.sub, 500],
  ].forEach((ln) => {
    if (ln[0]) y += W.paragraph(ctx, ln[0], L.x0, y, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), weight: ln[2], color: ln[1], align: 'center' });
  });
  return y;
}

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const top = K.header(ctx, L, hits, { title: '本群' + (vm.issueNo ? ' · 第 ' + vm.issueNo + ' 期' : '') });
  const bh = K.btnH(L);
  const banner = K.bannerRect(L, vm.banner);
  const bottom = (banner ? banner.y - L.u(24) : L.bottomEdge - L.bottomPad);
  const state = vm.state || 'loading';
  if (banner) hits.meta.banner = banner;

  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: bottom - top,
    scroll: vm.scrollY || 0,
    id: 'group:scroll',
    draw(c, h) {
      let y = top + L.u(6);
      const tail = () => {
        if (vm.trend && vm.trend.length) y = B.trend(c, L, y + L.u(6), vm.trend) + L.u(4);
        if (vm.rounds && vm.rounds.length) y = rounds(c, L, h, vm.rounds, y + L.u(4));
      };
      switch (state) {
        case 'noGroup':
        case 'groupFailed':
          y += B.notice(c, L, h, {
            y,
            title: '看看本群的默契',
            text: '在群聊里点开本游戏的卡片，就能看到本群的默契度。',
            buttons: [{ id: 'group:share', label: '分享到群', kind: 'secondary' }],
          });
          break;
        case 'checkingGroup':
        case 'loading': {
          W.text(c, state === 'checkingGroup' ? '正在确认群聊…' : '正在取本群数据…', L.cx, y + L.u(16), { size: W.fs(L, 'bodyL'), weight: 700, color: C.sub, align: 'center' });
          y += L.u(40);
          for (let i = 0; i < 4; i++) {
            W.skeleton(c, L.x0, y, L.contentW, B.rowH(L) - L.u(10), vm.t, L.u(12));
            y += B.rowH(L);
          }
          break;
        }
        case 'serverError':
          y += B.notice(c, L, h, { y, title: '本群数据暂时打不开', text: '稍后再试，不影响你玩。', fill: C.noteOrange, buttons: [{ id: 'group:retry', label: '重试', kind: 'primary' }] });
          break;
        case 'empty':
          y += B.notice(c, L, h, { y, title: '本群今天还没有人完成', text: '你来当第一个？', buttons: [{ id: 'group:play', label: '去答题', kind: 'primary' }] });
          tail();
          break;
        case 'notPlayed':
          y = stats(c, L, vm, y) + L.u(10);
          y += B.notice(c, L, h, { y, title: '完成今日刻度后查看本群默契', buttons: [{ id: 'group:play', label: '去答题', kind: 'primary' }], align: 'center' });
          tail();
          break;
        default: {
          // ready, small, privacyDenied, unauthorized
          if (state === 'privacyDenied') {
            y += B.notice(c, L, h, {
              y,
              title: '查看群友昵称需要同意《用户隐私保护指引》',
              text: '不同意也可以看到匿名的群友榜。',
              fill: C.noteOrange,
              buttons: [{ id: 'group:contract', label: '查看指引', kind: 'secondary' }, { id: 'group:agree', label: '同意并查看', kind: 'primary' }],
            }) + L.u(12);
          } else if (state === 'unauthorized') {
            y += B.notice(c, L, h, {
              y,
              title: '开启「微信朋友关系」可显示群友昵称',
              fill: C.noteOrange,
              buttons: [{ id: 'group:openSetting', label: '去设置开启', kind: 'primary' }],
            }) + L.u(12);
          }
          if (vm.mqText && state !== 'small') y = B.gauge(c, L, y, '本群今日默契度', vm.mqText, vm.mq != null ? vm.mq : parseFloat(vm.mqText)) + L.u(4);
          else if (state === 'small') {
            y += W.paragraph(c, '完成人数满 3 人后计算本群默契度', L.x0, y, L.contentW, W.fs(L, 'bodyL') * 1.5, { size: W.fs(L, 'bodyL'), weight: 800, align: 'center', color: C.ink }) + L.u(4);
          }
          y = stats(c, L, vm, y) + L.u(10);
          y += B.box(c, L, h, vm, y) + L.u(8);
          tail();
          y += L.u(8);
          W.button(c, L, h, { id: 'group:share', x: L.x0, y, w: L.contentW, h: bh, label: '分享到本群', kind: 'secondary' });
          y += bh;
        }
      }
      return y + L.u(16);
    },
  });
  return hits.result();
}

module.exports = { draw };
