/**
 * Challenge-received entry (spec 8.5). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Challenge entry model plus optional extras:
 *   bestRecord: {w,l} (status 'own': best answer so far)
 *   t: ms clock (skeleton pulse)
 * Statuses: loading | ready | expired | own | answered | offline | error.
 * Hit ids: challenge:accept, challenge:home, challenge:retry, challenge:free,
 *   challenge:daily, challenge:compare (answered).
 * There is no back button: this is an entry screen (the capsule row stays empty).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const { recordCn } = require('./fmt');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = new Hits();
  W.paper(ctx, L);
  const x = L.x0;
  const cw = L.contentW;
  const bh = L.u(56);
  const gap = L.u(12);
  const bottom = L.bottomEdge - L.bottomPad;

  // title seal and heading, vertically centred in the upper part
  const top = L.navBottom + L.u(12);
  const sealS = L.u(L.compact ? 64 : 80);
  let y = top + L.u(L.compact ? 8 : 40);
  W.sealStamp(ctx, L.cx, y + sealS / 2, sealS, '战书', '', { rotate: -5 });
  y += sealS + L.u(20);

  const line = (str, o) => {
    W.text(ctx, str, L.cx, y + (o.h || L.u(28)) / 2, { align: 'center', maxW: cw, ...o });
    y += o.h || L.u(28);
  };
  const stack = (btns) => {
    let by = bottom;
    btns
      .slice()
      .reverse()
      .forEach((b) => {
        by -= b.h || bh;
        W.button(ctx, L, hits, { x, y: by, w: cw, h: b.h || bh, ...b });
        by -= gap;
      });
  };

  const rec = vm.theirRecord ? recordCn(vm.theirRecord) : '';

  switch (vm.status) {
    case 'loading':
      line('展开战书…', { size: T.FS.title, weight: 800, serif: true, h: L.u(40) });
      W.skeleton(ctx, x + L.u(30), y + L.u(10), cw - L.u(60), L.u(20), vm.t, 8);
      W.skeleton(ctx, x + L.u(60), y + L.u(46), cw - L.u(120), L.u(20), vm.t, 8);
      stack([{ label: '接受挑战', kind: 'secondary', disabled: true }]);
      break;
    case 'ready':
      line('好友向你下了一封战书', { size: T.FS.title, weight: 800, serif: true, h: L.u(40) });
      line('同一手令牌，TA 的战绩：' + rec, { size: T.FS.bodyL, h: L.u(30) });
      line('阵容将在你出征后揭晓', { size: T.FS.body, color: C.sub, h: L.u(30) });
      if (vm.countsAsDaily) {
        y += L.u(6);
        const t = '本局将作为你的今日军令，计入今日群榜';
        const lines = W.wrap(ctx, t, cw - L.u(36), T.FS.body, 700, false);
        const hh = lines.length * L.u(24) + L.u(20);
        W.fillRR(ctx, x, y, cw, hh, L.u(10), 'rgba(179,38,30,0.09)');
        W.strokeRR(ctx, x, y, cw, hh, L.u(10), C.seal, 1.5);
        lines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + L.u(22) + i * L.u(24) - L.u(2), { size: T.FS.body, weight: 700, color: C.seal, align: 'center' }));
        y += hh;
      } else if (vm.isFriendly) {
        y += L.u(6);
        y += W.paragraph(ctx, '你已完成今日军令，本局为友谊赛，不计入榜单', x, y, cw, L.u(24), { size: T.FS.body, weight: 700, color: C.sub, align: 'center' });
      }
      stack([
        { id: 'challenge:accept', label: '接受挑战', kind: 'primary' },
        { id: 'challenge:home', label: '先去首页看看', kind: 'secondary', h: L.u(52) },
      ]);
      break;
    case 'expired':
      line('这封战书已经过期了', { size: T.FS.title, weight: 800, serif: true, h: L.u(40) });
      line('战书只保留 7 天', { size: T.FS.body, color: C.sub });
      stack([
        { id: 'challenge:daily', label: '今日军令', kind: 'primary' },
        { id: 'challenge:free', label: '去自由点将', kind: 'secondary', h: L.u(52) },
      ]);
      break;
    case 'own':
      line('这是你发出的战书', { size: T.FS.title, weight: 800, serif: true, h: L.u(40) });
      line('已有 ' + (vm.answerCount || 0) + ' 位好友应战', { size: T.FS.bodyL, h: L.u(30) });
      if (vm.bestRecord) line('最佳战绩：' + recordCn(vm.bestRecord), { size: T.FS.bodyL, weight: 700, color: C.seal, h: L.u(30) });
      stack([{ id: 'challenge:home', label: '回首页', kind: 'primary' }]);
      break;
    case 'answered':
      line('你已应战过这封战书', { size: T.FS.title, weight: 800, serif: true, h: L.u(40) });
      line('TA 的战绩：' + rec, { size: T.FS.bodyL, h: L.u(30) });
      stack([
        { id: 'challenge:compare', label: '查看对比', kind: 'primary' },
        { id: 'challenge:home', label: '回首页', kind: 'secondary', h: L.u(52) },
      ]);
      break;
    case 'offline':
    case 'error':
    default:
      line(vm.status === 'offline' ? '战书需联网展开' : '战书暂时打不开', { size: T.FS.title, weight: 800, serif: true, h: L.u(40) });
      line('自由点将不受影响', { size: T.FS.body, color: C.sub });
      stack([
        { id: 'challenge:retry', label: '重 试', kind: 'primary' },
        { id: 'challenge:free', label: '去自由点将', kind: 'secondary', h: L.u(52) },
      ]);
  }
  return hits.result();
}

module.exports = { draw };
