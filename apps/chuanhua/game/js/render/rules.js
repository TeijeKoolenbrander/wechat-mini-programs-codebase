/**
 * 接龙公约 bottom sheet (spec 8.2). Drawn over home / entry; the caller draws the screen below first.
 * vm: RulesVm {version, open, pendingAction} + display. Hit ids: rules:agree, rules:decline, rules:terms,
 * rules:privacy, sheet:close (scrim and X: same as 先看看), sheet:list (scroll).
 * No pre-ticked box: agreeing is the explicit tap on 同意并开始.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const { Hits } = require('./layout');
const C = T.COLORS;

const BULLETS = [
  '画和字都会先审核，通过后才传给下一位',
  '不画、不写色情低俗、政治、辱骂、广告和联系方式',
  '违规内容会被隐藏，多次违规会被限制',
  '看到不合适的内容，请点「举报」',
];

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  const lh = Math.round(T.FS.bodyL * 1.5);
  const bw = L.u(18);
  const textW = Math.min(L.W, 560) - 2 * L.pad - bw;
  const blocks = BULLETS.map((b) => W.wrap(ctx, b, textW, T.FS.bodyL, 500));
  const linkH = T.MIN_TAP;
  const stacked = T.isLarge() || L.W < 340;
  const contentH = blocks.reduce((a, ln) => a + ln.length * lh + L.u(6), 0) + L.u(8) + linkH * (stacked ? 2 : 1);
  const btnH = T.btn(L, 52);
  const pinnedH = stacked ? btnH * 2 + L.u(10) : btnH;
  S.sheetScroll(ctx, L, hits, {
    title: '接龙公约',
    contentH,
    pinnedH,
    scroll: vm.sheetScroll,
    drawContent(x, y) {
      let cy = y;
      blocks.forEach((lines) => {
        W.text(ctx, '·', x + L.u(4), cy + lh / 2, { size: T.FS.bodyL, weight: 800, color: C.orangeDeep });
        lines.forEach((ln, i) => W.text(ctx, ln, x + bw, cy + i * lh + lh / 2, { size: T.FS.bodyL, weight: 500 }));
        cy += lines.length * lh + L.u(6);
      });
      cy += L.u(8);
      if (stacked) {
        W.link(ctx, L, hits, { id: 'rules:terms', x, y: cy + linkH / 2, label: '《用户协议》', size: T.FS.body });
        W.link(ctx, L, hits, { id: 'rules:privacy', x, y: cy + linkH * 1.5, label: '《用户隐私保护指引》', size: T.FS.body });
      } else {
        const a = W.link(ctx, L, hits, { id: 'rules:terms', x, y: cy + linkH / 2, label: '《用户协议》', size: T.FS.body });
        W.link(ctx, L, hits, { id: 'rules:privacy', x: x + a.w + L.u(24), y: cy + linkH / 2, label: '《用户隐私保护指引》', size: T.FS.body });
      }
    },
    drawPinned(x, y, w) {
      const agree = '同意并开始';
      if (stacked) {
        W.button(ctx, L, hits, { id: 'rules:agree', x, y, w, h: btnH, label: agree, kind: 'primary' });
        W.button(ctx, L, hits, { id: 'rules:decline', x, y: y + btnH + L.u(10), w, h: btnH, label: '先看看', kind: 'secondary' });
      } else {
        const gap = L.u(12);
        const w1 = (w - gap) * 0.4;
        W.button(ctx, L, hits, { id: 'rules:decline', x, y, w: w1, h: btnH, label: '先看看', kind: 'secondary' });
        W.button(ctx, L, hits, { id: 'rules:agree', x: x + w1 + gap, y, w: w - w1 - gap, h: btnH, label: agree, kind: 'primary' });
      }
    },
  });
  return hits.result();
}

module.exports = { draw, BULLETS };
