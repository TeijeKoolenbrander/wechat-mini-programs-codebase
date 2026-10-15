/**
 * Challenge-received entry (spec 8.5). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Challenge entry model (+ v1 additions) plus optional extras:
 *   bestRecord: {w,l} (status 'own': best answer so far)
 *   variantLabel '识人'|null      the challenge is on a 识人 daily seed
 *   subscribe {state}            own challenge only: hidden|offer|requesting|granted|declined|unavailable
 *   lineupLocked                 answered, daily seed (C5)
 *   display, t
 * Statuses: loading | ready | expired | own | answered | offline | error.
 * Hit ids: challenge:accept, challenge:home, challenge:retry, challenge:free,
 *   challenge:daily, challenge:compare (answered), challenge:subscribe (own).
 * There is no back button: this is an entry screen (the capsule row stays empty).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const { recordCn } = require('./fmt');
const C = T.COLORS;

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  const large = T.isLarge();
  const x = L.x0;
  const cw = L.contentW;
  const bh = T.btn(L, 56);
  const bh2 = T.btn(L, 52);
  const gap = L.u(12);
  const bottom = L.bottomEdge - L.bottomPad;

  // title seal and heading, vertically centred in the upper part
  const top = L.navBottom + L.u(8);
  const sealS = L.u(L.compact || large ? 56 : 80);
  let y = top + L.u(L.compact || large ? 4 : 40);
  W.sealStamp(ctx, L.cx, y + sealS / 2, sealS, '战书', '', { rotate: -5 });
  y += sealS + L.u(large ? 14 : 20);

  const fh = (size) => Math.round(size * 1.45);
  const line = (str, o) => {
    const h = o.h || fh(o.size || T.FS.body);
    const lines = W.wrap(ctx, str, cw, o.size || T.FS.body, o.weight, o.serif).slice(0, 3);
    lines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + h / 2 + i * h, { align: 'center', maxW: cw, ...o, h: undefined }));
    y += h * lines.length;
  };
  const stack = (btns) => {
    let by = bottom;
    btns
      .slice()
      .reverse()
      .forEach((b) => {
        const h = b.h ? Math.max(b.h, T.minBtn()) : bh;
        by -= h;
        W.button(ctx, L, hits, { x, y: by, w: cw, ...b, h });
        by -= gap;
      });
  };
  const tag = () => {
    if (!vm.variantLabel) return;
    W.pill(ctx, L, L.cx, y + L.u(14), vm.variantLabel + '军令', { size: T.FS.body, align: 'center' });
    y += L.u(34);
  };

  const rec = vm.theirRecord ? recordCn(vm.theirRecord) : '';
  const head = (str) => line(str, { size: T.FS.title, weight: 800, serif: true, h: L.u(large ? 38 : 40) });

  switch (vm.status) {
    case 'loading':
      head('展开战书…');
      W.skeleton(ctx, x + L.u(30), y + L.u(10), cw - L.u(60), L.u(20), vm.t, 8);
      W.skeleton(ctx, x + L.u(60), y + L.u(46), cw - L.u(120), L.u(20), vm.t, 8);
      stack([{ label: '接受挑战', kind: 'secondary', disabled: true }]);
      break;
    case 'ready':
      head('好友向你下了一封战书');
      tag();
      line('同一手令牌，TA 的战绩：' + rec, { size: T.FS.bodyL });
      line('阵容将在你出征后揭晓', { size: T.FS.body, color: C.sub });
      if (vm.countsAsDaily) {
        y += L.u(6);
        const t = '本局将作为你的今日军令，计入今日群榜';
        const lines = W.wrap(ctx, t, cw - L.u(36), T.FS.body, 700, false);
        const lh = fh(T.FS.body);
        const hh = lines.length * lh + L.u(20);
        W.fillRR(ctx, x, y, cw, hh, L.u(10), C.tintSeal);
        W.strokeRR(ctx, x, y, cw, hh, L.u(10), C.seal, T.isHC() ? 2.5 : 1.5);
        lines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + L.u(10) + lh / 2 + i * lh, { size: T.FS.body, weight: 700, color: C.seal, align: 'center' }));
        y += hh;
      } else if (vm.isFriendly) {
        y += L.u(6);
        y += W.paragraph(ctx, '你已完成今日军令，本局为友谊赛，不计入榜单', x, y, cw, fh(T.FS.body), { size: T.FS.body, weight: 700, color: C.sub, align: 'center' });
      }
      stack([
        { id: 'challenge:accept', label: '接受挑战', kind: 'primary' },
        { id: 'challenge:home', label: '先去首页看看', kind: 'secondary', h: bh2 },
      ]);
      break;
    case 'expired':
      head('这封战书已经过期了');
      line('战书只保留 7 天', { size: T.FS.body, color: C.sub });
      stack([
        { id: 'challenge:daily', label: '今日军令', kind: 'primary' },
        { id: 'challenge:free', label: '去自由点将', kind: 'secondary', h: bh2 },
      ]);
      break;
    case 'own': {
      head('这是你发出的战书');
      tag();
      line('已有 ' + (vm.answerCount || 0) + ' 位好友应战', { size: T.FS.bodyL });
      if (vm.bestRecord) line('最佳战绩：' + recordCn(vm.bestRecord), { size: T.FS.bodyL, weight: 700, color: C.seal });
      const sub = vm.subscribe && vm.subscribe.state;
      const btns = [{ id: 'challenge:home', label: '回首页', kind: 'primary' }];
      if (sub === 'offer' || sub === 'requesting') {
        btns.unshift({ id: 'challenge:subscribe', label: sub === 'requesting' ? '请求中…' : '好友应战时提醒我', kind: 'secondary', h: bh2, disabled: sub === 'requesting' });
      } else if (sub === 'granted') {
        y += L.u(8);
        line('已开启应战提醒', { size: T.FS.bodyL, weight: 700, color: C.good });
      }
      stack(btns);
      break;
    }
    case 'answered':
      head('你已应战过这封战书');
      tag();
      line('TA 的战绩：' + rec, { size: T.FS.bodyL });
      if (vm.lineupLocked) line('对方阵容 · 完成今日军令后可见', { size: T.FS.body, color: C.sub });
      stack([
        { id: 'challenge:compare', label: '查看对比', kind: 'primary' },
        { id: 'challenge:home', label: '回首页', kind: 'secondary', h: bh2 },
      ]);
      break;
    case 'offline':
    case 'error':
    default:
      head(vm.status === 'offline' ? '战书需联网展开' : '战书暂时打不开');
      line('自由点将不受影响', { size: T.FS.body, color: C.sub });
      stack([
        { id: 'challenge:retry', label: '重 试', kind: 'primary' },
        { id: 'challenge:free', label: '去自由点将', kind: 'secondary', h: bh2 },
      ]);
  }
  return hits.result();
}

module.exports = { draw };
