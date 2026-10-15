/**
 * Challenge entry (spec 6.8). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 10 Challenge entry model plus extras (CONTRACT.md):
 *   pastDaily: boolean   daily challenge on a past date ("往期题目 · 友谊赛")
 *   t: ms clock (skeleton pulse), scrollY
 * Statuses: loading | ready | expired | own | answered | retired | offline | error.
 * Hit ids: challenge:accept, challenge:home, challenge:retry, challenge:free,
 *   challenge:daily, challenge:compare, challenge:subscribe, challenge:scroll.
 * There is no back button: this is an entry screen (the capsule row stays empty).
 * The owner's nickname is never shown (we collect none).
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  const x = L.x0;
  const cw = L.contentW;
  const bh = L.btnH;
  const bh2 = L.btnH2;
  const gap = L.u(12);
  const bottom = L.bottomEdge - L.bottomPad;
  const lh = L.u(28) * (L.large ? 1.2 : 1);

  const title = (str) => ({ t: 'title', s: str });
  const line = (str, o) => Object.assign({ t: 'line', s: str }, o);
  let items = [];
  let btns = [];

  switch (vm.status) {
    case 'loading':
      items = [title('展开挑战…'), { t: 'skel' }];
      btns = [{ label: '接受挑战', kind: 'secondary', disabled: true, h: bh }];
      break;
    case 'ready': {
      items = [title('好友向你发起了挑战'), line('同一套题，TA 连对 ' + (vm.ownerStreak != null ? vm.ownerStreak : 0) + ' 个', { size: T.FS.bodyL, weight: 700 })];
      if (vm.kind === 'free') {
        items.push(line('随便比比' + (vm.categoryLabel ? ' · 分类：' + vm.categoryLabel : ''), { size: T.FS.body, color: C.sub }));
        if (vm.rulesText) items.push(line(vm.rulesText, { size: T.FS.body, color: C.sub }));
      } else {
        if (vm.issueText) items.push(line(vm.issueText, { size: T.FS.body, color: C.sub }));
        if (vm.pastDaily) items.push(line('往期题目 · 友谊赛', { size: T.FS.body, weight: 700, color: C.sub }));
        else if (vm.countsAsDaily) items.push({ t: 'notice', s: '本局将作为你的今日一比，计入群榜' });
        else if (vm.isFriendly) items.push(line('你已完成今日一比，本局为友谊赛，不计入榜单', { size: T.FS.body, weight: 700, color: C.sub, wrap: true }));
      }
      btns = [
        { id: 'challenge:accept', label: '接受挑战', kind: 'primary', h: bh },
        { id: 'challenge:home', label: '先去首页看看', kind: 'secondary', h: bh2 },
      ];
      break;
    }
    case 'expired':
      items = [title('这个挑战已经过期了'), line('挑战只保留 7 天', { size: T.FS.body, color: C.sub })];
      btns = [
        { id: 'challenge:daily', label: '今日一比', kind: 'primary', h: bh },
        { id: 'challenge:free', label: '随便比比', kind: 'secondary', h: bh2 },
      ];
      break;
    case 'own': {
      items = [title('这是你发起的挑战'), line('已有 ' + (vm.answerCount || 0) + ' 位好友应战', { size: T.FS.bodyL })];
      if (vm.bestAnswer != null) items.push(line('最佳成绩：连对 ' + vm.bestAnswer, { size: T.FS.bodyL, weight: 800, color: C.seal }));
      const sub = vm.subscribe && vm.subscribe.state;
      if (sub === 'offer' || sub === 'requesting') items.push({ t: 'subscribe', state: sub });
      if (sub === 'granted') items.push(line('好，有人接受挑战会提醒你', { size: T.FS.body, color: C.good, weight: 700 }));
      btns = [{ id: 'challenge:home', label: '回首页', kind: 'primary', h: bh }];
      break;
    }
    case 'answered':
      items = [title('你已应战过这个挑战'), line('TA 连对 ' + (vm.ownerStreak != null ? vm.ownerStreak : 0) + ' 个', { size: T.FS.bodyL })];
      btns = [
        { id: 'challenge:compare', label: '查看对比', kind: 'primary', h: bh },
        { id: 'challenge:home', label: '回首页', kind: 'secondary', h: bh2 },
      ];
      break;
    case 'retired':
      items = [title('这个挑战的题库已更新'), line('无法再玩', { size: T.FS.bodyL })];
      btns = [{ id: 'challenge:free', label: '随便比比', kind: 'primary', h: bh }];
      break;
    case 'offline':
    case 'error':
    default:
      items = [title(vm.status === 'offline' ? '挑战需联网展开' : '挑战暂时打不开'), line('随便比比不受影响', { size: T.FS.body, color: C.sub })];
      btns = [
        { id: 'challenge:retry', label: '重 试', kind: 'primary', h: bh },
        { id: 'challenge:free', label: '随便比比', kind: 'secondary', h: bh2 },
      ];
  }

  // ---- pinned buttons
  let by = bottom;
  btns
    .slice()
    .reverse()
    .forEach((b) => {
      by -= b.h;
      W.button(ctx, L, hits, { x, y: by, w: cw, id: b.id, label: b.label, kind: b.kind, disabled: b.disabled, h: b.h, size: b.kind === 'secondary' ? T.FS.bodyL : undefined });
      by -= gap;
    });

  // ---- content
  const top = L.navBottom + L.u(8);
  const rect = { x: 0, y: top, w: L.W, h: by - top };
  const sealS = L.u(L.compact ? 58 : 76) * Math.min(L.k, 1.1);
  const drawContent = (c, hh, y0) => {
    let y = y0 + (L.compact ? L.u(4) : L.u(24));
    W.seal(c, L.cx, y + sealS / 2, sealS, { rotate: -6 });
    y += sealS + L.u(18);
    items.forEach((it) => {
      if (it.t === 'title') {
        y += W.paragraph(c, it.s, x, y, cw, L.u(34) * (L.large ? 1.2 : 1), { size: T.FS.title, weight: 800, serif: true, align: 'center', maxLines: 2 }) + L.u(4);
      } else if (it.t === 'line') {
        y += W.paragraph(c, it.s, x, y, cw, lh, { size: it.size, weight: it.weight, color: it.color, align: 'center', maxLines: 3 });
      } else if (it.t === 'skel') {
        W.skeleton(c, x + L.u(30), y + L.u(10), cw - L.u(60), L.u(20), vm.t, 8);
        W.skeleton(c, x + L.u(60), y + L.u(46), cw - L.u(120), L.u(20), vm.t, 8);
        y += L.u(80);
      } else if (it.t === 'notice') {
        y += L.u(6);
        const lines = W.wrap(c, it.s, cw - L.u(36), T.FS.body, 700, false);
        const hgt = lines.length * L.u(24) * (L.large ? 1.2 : 1) + L.u(20);
        W.fillRR(c, x, y, cw, hgt, L.u(10), 'rgba(184,67,47,0.09)');
        W.strokeRR(c, x, y, cw, hgt, L.u(10), C.seal, 1.5);
        lines.forEach((ln, i) => W.text(c, ln, L.cx, y + L.u(10) + (L.u(24) * (L.large ? 1.2 : 1)) * (i + 0.5), { size: T.FS.body, weight: 700, color: C.seal, align: 'center' }));
        y += hgt;
      } else if (it.t === 'subscribe') {
        y += L.u(8);
        W.text(c, '好友接受挑战时提醒我', x + L.u(4), y + bh2 / 2, { size: T.FS.body, weight: 600, maxW: cw - L.u(110) });
        W.button(c, L, hh, { id: 'challenge:subscribe', x: x + cw - L.u(96), y, w: L.u(96), h: bh2, label: it.state === 'requesting' ? '请求中' : '提醒我', size: T.FS.body, disabled: it.state === 'requesting' });
        y += bh2;
      }
    });
    return y - y0 + L.u(8);
  };
  W.scrollRegion(ctx, hits, 'challenge:scroll', rect, vm.scrollY, drawContent);
  return hits.result();
}

module.exports = { draw };
