/**
 * Prompt picker, 开一条接龙 (spec 8.3). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 12 Picker model plus extras: display, sheet, scrollY, keyboardH,
 *   t (ms; caret blink), drawSec (default 60).
 * Hit ids: back, picker:select:<id>, picker:shuffle, picker:custom,
 *   picker:customInput, picker:customOk, picker:customCancel, picker:start,
 *   picker:retry, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const F = require('./fields');
const { page } = require('./page');
const C = T.COLORS;

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const state = vm.state || 'ready';
  const prompts = vm.prompts || [];
  const custom = vm.custom || { open: false };
  const bad = state === 'error' || state === 'offline';
  const anyNonDaily = prompts.some((p) => !p.isDaily);
  const bh = W.btnH(L);
  const smallH = W.btnH(L, true);
  const gap = L.u(10);
  const footerH = custom.open ? bh : bh;

  return page(ctx, vm, L, {
    back: { label: '返回', id: 'back' },
    title: '选一个起点，你来画第 1 棒',
    footerH,
    footer: (c, h, r) => {
      if (custom.open) {
        const lw = (r.w - gap) * 0.36;
        W.button(c, L, h, { id: 'picker:customCancel', x: r.x, y: r.y, w: lw, h: r.h, label: '取消', kind: 'secondary' });
        W.button(c, L, h, { id: 'picker:customOk', x: r.x + lw + gap, y: r.y, w: r.w - lw - gap, h: r.h, label: state === 'creating' ? '准备画布…' : '确定', kind: 'primary', disabled: !vm.canStart || state === 'creating' });
      } else {
        const label = state === 'creating' ? '准备画布…' : '开始画 (' + (vm.drawSec || 60) + ' 秒)';
        W.button(c, L, h, { id: 'picker:start', x: r.x, y: r.y, w: r.w, h: r.h, label, kind: 'primary', disabled: !vm.canStart || state !== 'ready' });
      }
    },
    body: (c, h, y0, x, w) => {
      let y = y0 + 2;
      if (bad) {
        const msg = vm.errorText || (state === 'offline' ? '需联网才能开始' : '没能准备好，请重试');
        const lh = Math.round(T.FS.bodyL * 1.5);
        const ph = W.paragraphH(c, msg, w - 28, lh, { size: T.FS.bodyL, weight: 700 });
        const ch = ph + 28 + smallH + 12;
        W.card(c, x, y, w, ch, {});
        W.paragraph(c, msg, x + 14, y + 14, w - 28, lh, { size: T.FS.bodyL, weight: 700, color: C.zhuText });
        W.button(c, L, h, { id: 'picker:retry', x: x + 14, y: y + 14 + ph + 12, w: w - 28, h: smallH, label: '重试', kind: 'secondary' });
        return y + ch - y0 + 6;
      }
      if (!custom.open) {
        W.text(c, anyNonDaily ? '换一批的题目' : '今日起点', x, y + 12, { size: T.FS.body, weight: 800, color: C.sub });
        y += 28;
        const rowH = Math.max(L.u(56), T.MODE.largeText ? 64 : 0);
        const ch = prompts.length * rowH + 4;
        W.card(c, x, y, w, ch, { r: 16 });
        prompts.forEach((p, i) => {
          const ry = y + 2 + i * rowH;
          const sel = vm.selectedId === p.id;
          if (sel) {
            W.fillRR(c, x + 4, ry + 3, w - 8, rowH - 6, 12, C.orangeSoft);
            W.strokeRR(c, x + 4, ry + 3, w - 8, rowH - 6, 12, C.ink, 1.5);
          } else if (i > 0) {
            c.fillStyle = C.line;
            c.fillRect(x + 16, ry, w - 32, 1);
          }
          // radio
          c.beginPath();
          c.arc(x + 28, ry + rowH / 2, 11, 0, Math.PI * 2);
          c.fillStyle = C.card;
          c.fill();
          c.strokeStyle = C.ink;
          c.lineWidth = 2;
          c.stroke();
          if (sel) W.iconCheck(c, x + 28, ry + rowH / 2, 14, C.zhuText, 3);
          let chipW = 0;
          if (anyNonDaily && p.isDaily) chipW = W.chip(c, x + w - 16 - (W.measure(c, '今日', T.FS.small, 700) + 18), ry + rowH / 2 - Math.round(T.FS.small * 1.65) / 2, '今日', { fill: C.blueSoft, color: C.blueText, border: C.blueText }) + 8;
          W.text(c, p.text, x + 52, ry + rowH / 2, { size: T.FS.bodyL + 2, weight: sel ? 800 : 700, round: true, maxW: w - 68 - chipW });
          h.add('picker:select:' + p.id, x, ry, w, rowH);
        });
        y += ch + gap;
        const half = (w - gap) / 2;
        W.button(c, L, h, { id: 'picker:shuffle', x, y, w: half, h: smallH, label: '换一批', kind: 'secondary', size: T.FS.body });
        W.button(c, L, h, { id: 'picker:custom', x: x + half + gap, y, w: half, h: smallH, label: '自己出题', kind: 'secondary', size: T.FS.body });
        y += smallH + 6;
        if (vm.canStart === false && !vm.selectedId) {
          W.text(c, '先选一个题目', x, y + 14, { size: T.FS.body, color: C.sub });
          y += 28;
        }
      } else {
        W.text(c, '自己出题（2-12 个字）', x, y + 12, { size: T.FS.body, weight: 800, color: C.sub });
        y += 30;
        const ih = F.inputBox(c, x, y, w, { text: custom.text, placeholder: '比如：会飞的西瓜', count: custom.count, focused: true, t: vm.t, error: custom.error });
        h.add('picker:customInput', x, y, w, ih);
        y += ih + 8;
        if (custom.error) {
          const lh = Math.round(T.FS.body * 1.45);
          const eh = W.paragraph(c, custom.error, x + 4, y, w - 8, lh, { size: T.FS.body, weight: 700, color: C.zhuText });
          y += eh + 4;
        } else {
          W.text(c, '题目会先审核，通过后才开始', x + 4, y + 12, { size: T.FS.small, color: C.sub, maxW: w - 8 });
          y += 28;
        }
      }
      return y - y0;
    },
  });
}

module.exports = { draw };
