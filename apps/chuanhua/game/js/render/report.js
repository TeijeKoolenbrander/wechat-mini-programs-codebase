/**
 * Report sheet (spec 7.1, 8.12), drawn over draw / describe / reveal / teaser. No free text: one reason tap, then
 * 提交举报. vm: {open, target, reasons, state: idle|submitting|done|limit|dup|error, selected?} + display.
 * Hit ids: report:reason:<porn|politics|abuse|ad|other>, report:submit, report:cancel, report:retry, sheet:close,
 * sheet:list (scroll).
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const { Hits } = require('./layout');
const C = T.COLORS;

const LABELS = { porn: '色情低俗', politics: '政治敏感', abuse: '辱骂攻击', ad: '广告引流', other: '其他不适' };
const MESSAGES = {
  done: '已举报，该内容已隐藏，我们会尽快核实',
  limit: '今天举报次数已达上限',
  dup: '你已举报过这条内容',
  error: '没提交成功，请重试',
};

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  const state = vm.state || 'idle';
  const reasons = vm.reasons && vm.reasons.length ? vm.reasons : Object.keys(LABELS);
  const rowH = Math.max(L.u(52), T.minBtn());
  const btnH = T.btn(L, 52);
  const lh = Math.round(T.FS.bodyL * 1.5);
  const textW = Math.min(L.W, 560) - 2 * L.pad;
  const formState = state === 'idle' || state === 'submitting';
  const msgLines = formState ? [] : W.wrap(ctx, MESSAGES[state] || MESSAGES.error, textW - L.u(8), T.FS.bodyL, 600);
  const intro = '选一个原因，不用写别的。';
  const contentH = formState ? Math.round(T.FS.body * 1.5) + L.u(8) + reasons.length * (rowH + L.u(6)) : msgLines.length * lh + L.u(16);
  const stacked = T.isLarge() || L.W < 340;
  const pinnedH = state === 'error' ? (stacked ? btnH * 2 + L.u(10) : btnH) : formState ? (stacked ? btnH * 2 + L.u(10) : btnH) : btnH;

  S.sheetScroll(ctx, L, hits, {
    title: '举报这条内容',
    contentH,
    pinnedH,
    scroll: vm.sheetScroll,
    drawContent(x, y, w) {
      if (!formState) {
        msgLines.forEach((ln, i) => W.text(ctx, ln, x, y + L.u(8) + i * lh + lh / 2, { size: T.FS.bodyL, weight: 600, color: state === 'done' ? C.greenText : C.ink }));
        return;
      }
      const ih = Math.round(T.FS.body * 1.5);
      W.text(ctx, intro, x, y + ih / 2, { size: T.FS.body, color: C.sub });
      let cy = y + ih + L.u(8);
      reasons.forEach((r) => {
        const on = vm.selected === r;
        const label = LABELS[r] || r;
        W.fillRR(ctx, x, cy, w, rowH, L.u(12), on ? C.orangeSoft : C.card);
        W.strokeRR(ctx, x, cy, w, rowH, L.u(12), on ? C.ink : T.isHC() ? C.ink : C.line, on ? 2 : T.isHC() ? 2 : 1.5);
        // radio: ring, filled with a check mark when selected (not colour alone)
        const rx = x + L.u(24);
        const ry = cy + rowH / 2;
        ctx.beginPath();
        ctx.arc(rx, ry, L.u(11), 0, Math.PI * 2);
        ctx.fillStyle = on ? C.orange : C.card;
        ctx.fill();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (on) W.iconCheck(ctx, rx, ry, L.u(13), C.ink);
        W.text(ctx, label, x + L.u(48), ry, { size: T.FS.bodyL, weight: on ? 800 : 600 });
        if (state === 'idle') hits.add('report:reason:' + r, x, cy, w, rowH);
        cy += rowH + L.u(6);
      });
    },
    drawPinned(x, y, w) {
      const gap = L.u(12);
      if (state === 'done' || state === 'limit' || state === 'dup') {
        W.button(ctx, L, hits, { id: 'sheet:close', x, y, w, h: btnH, label: '好', kind: 'primary' });
      } else if (state === 'error') {
        if (stacked) {
          W.button(ctx, L, hits, { id: 'report:retry', x, y, w, h: btnH, label: '重试', kind: 'primary' });
          W.button(ctx, L, hits, { id: 'report:cancel', x, y: y + btnH + L.u(10), w, h: btnH, label: '取消', kind: 'secondary' });
        } else {
          const w1 = (w - gap) * 0.4;
          W.button(ctx, L, hits, { id: 'report:cancel', x, y, w: w1, h: btnH, label: '取消', kind: 'secondary' });
          W.button(ctx, L, hits, { id: 'report:retry', x: x + w1 + gap, y, w: w - w1 - gap, h: btnH, label: '重试', kind: 'primary' });
        }
      } else {
        const sub = state === 'submitting';
        const can = !!vm.selected && !sub;
        const label = sub ? '提交中…' : '提交举报';
        if (stacked) {
          W.button(ctx, L, hits, { id: 'report:submit', x, y, w, h: btnH, label, kind: 'primary', disabled: !can });
          W.button(ctx, L, hits, { id: 'report:cancel', x, y: y + btnH + L.u(10), w, h: btnH, label: '取消', kind: 'secondary', disabled: sub });
        } else {
          const w1 = (w - gap) * 0.4;
          W.button(ctx, L, hits, { id: 'report:cancel', x, y, w: w1, h: btnH, label: '取消', kind: 'secondary', disabled: sub });
          W.button(ctx, L, hits, { id: 'report:submit', x: x + w1 + gap, y, w: w - w1 - gap, h: btnH, label, kind: 'primary', disabled: !can });
        }
      }
    },
  });
  return hits.result();
}

module.exports = { draw, LABELS };
