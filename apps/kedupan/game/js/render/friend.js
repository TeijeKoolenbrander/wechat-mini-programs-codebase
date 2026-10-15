/**
 * 好友榜 (friend board, spec 6.8). Rows are drawn by the open data domain
 * into the window reserved here (hitAreas.board).
 */

const T = require('./theme');
const W = require('./widgets');
const K = require('./chrome');
const B = require('./board');
const C = T.C;

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const top = K.header(ctx, L, hits, { title: '好友 · 今日刻度' + (vm.issueNo ? ' · 第 ' + vm.issueNo + ' 期' : '') });
  const banner = K.bannerRect(L, vm.banner);
  const bottom = banner ? banner.y - L.u(24) : L.bottomEdge - L.bottomPad;
  if (banner) hits.meta.banner = banner;
  const state = vm.state || 'loading';

  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: bottom - top,
    scroll: vm.scrollY || 0,
    id: 'friend:scroll',
    draw(c, h) {
      let y = top + L.u(6);
      const list = () => {
        if (vm.mode === 'selfOnly') {
          y += B.notice(c, L, h, { y, title: '今天好友较多', text: vm.selfText || '你的成绩已校验，好友的成绩为自报，不排名次。', fill: C.noteBlue, tape: false }) + L.u(12);
        } else if (vm.selfText) {
          y += W.paragraph(c, vm.selfText, L.x0, y, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), weight: 700, align: 'center' }) + L.u(8);
        }
        y += B.box(c, L, h, vm, y) + L.u(8);
      };
      switch (state) {
        case 'loading':
          W.text(c, '正在取好友成绩…', L.cx, y + L.u(16), { size: W.fs(L, 'bodyL'), weight: 700, color: C.sub, align: 'center' });
          y += L.u(40);
          for (let i = 0; i < 4; i++) {
            W.skeleton(c, L.x0, y, L.contentW, B.rowH(L) - L.u(10), vm.t, L.u(12));
            y += B.rowH(L);
          }
          break;
        case 'empty':
          y += B.notice(c, L, h, { y, title: '还没有好友完成今日刻度', text: '你先答，好友来了就能比一比。', buttons: [{ id: 'friend:play', label: '去答题', kind: 'primary' }] });
          break;
        case 'serverError':
          y += B.notice(c, L, h, { y, title: '好友榜暂时打不开', text: '稍后再试，不影响你玩。', fill: C.noteOrange, buttons: [{ id: 'friend:retry', label: '重试', kind: 'primary' }] });
          break;
        case 'privacyDenied':
          y += B.notice(c, L, h, {
            y,
            title: '查看好友昵称需要同意《用户隐私保护指引》',
            text: '不同意也可以看到匿名的好友榜。',
            fill: C.noteOrange,
            buttons: [{ id: 'friend:contract', label: '查看指引', kind: 'secondary' }, { id: 'friend:agree', label: '同意并查看', kind: 'primary' }],
          }) + L.u(12);
          list();
          break;
        case 'unauthorized':
          y += B.notice(c, L, h, { y, title: '开启「微信朋友关系」可显示好友昵称', fill: C.noteOrange, buttons: [{ id: 'friend:openSetting', label: '去设置开启', kind: 'primary' }] }) + L.u(12);
          list();
          break;
        default:
          list();
      }
      return y + L.u(16);
    },
  });
  return hits.result();
}

module.exports = { draw };
