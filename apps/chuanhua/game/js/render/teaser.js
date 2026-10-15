/**
 * Reveal teaser for non-participants (spec 8.9). draw(ctx, vm, layout).
 * Shows only the prompt and the final sentence (both already moderated text)
 * and the number of 棒. Never drawings, never middle steps.
 *
 * vm = spec 12 Teaser model plus extras: display, sheet, report, t.
 * Missing finalText shows a dash line, never anything else.
 * Hit ids: back, teaser:sameAgain, teaser:group, teaser:report, teaser:retry,
 *   plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const { page } = require('./page');
const C = T.COLORS;

function quoteCard(ctx, x, y, w, text, tint) {
  const size = T.FS.hero - 2;
  const lh = Math.round(size * 1.35);
  const lines = W.wrap(ctx, '「' + text + '」', w - 36, size, 900, true).slice(0, 3);
  const h = lines.length * lh + 30;
  W.sticker(ctx, x, y, w, h, 16, { fill: tint });
  lines.forEach((ln, i) => W.text(ctx, ln, x + w / 2, y + 15 + lh * i + lh / 2, { size, weight: 900, round: true, align: 'center', maxW: w - 24, minSize: 22 }));
  return h;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const state = vm.state || 'loading';
  const bh = W.btnH(L);
  const smallH = W.btnH(L, true);
  const gap = L.u(8);
  const ready = state === 'ready';
  const acts = [];
  if (ready && vm.canSameAgain) acts.push({ id: 'teaser:sameAgain', label: '同题再传' });
  if (ready) acts.push({ id: 'teaser:group', label: '看看本群其他接龙' });
  if (state === 'offline') acts.push({ id: 'teaser:retry', label: '重试' });
  const footerH = acts.length ? bh + (acts.length - 1) * (smallH + gap) : 0;

  return page(ctx, vm, L, {
    back: { label: '返回', id: 'back' },
    footerH,
    center: true,
    footer: (c, h, r) => {
      let y = r.y;
      acts.forEach((a, i) => {
        const hh = i === 0 ? bh : smallH;
        W.button(c, L, h, { id: a.id, x: r.x, y, w: r.w, h: hh, label: a.label, kind: i === 0 ? 'primary' : 'secondary', size: i === 0 ? T.FS.button : T.FS.body });
        y += hh + gap;
      });
    },
    body: (c, h, y0, x, w) => {
      let y = y0 + 6;
      const cx = x + w / 2;
      const msgOnly = { removed: '该接龙已被移除', notFound: '找不到这条接龙', offline: '需联网才能查看' }[state];
      if (state === 'loading') {
        W.skeleton(c, cx - w * 0.3, y, w * 0.6, 26, vm.t, 13);
        W.skeleton(c, x + 8, y + 44, w - 16, 70, vm.t, 16);
        W.text(c, '正在打开…', cx, y + 140, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
        return y + 160 - y0;
      }
      if (msgOnly) {
        W.iconStatus(c, cx, y + 30, 52, 'void');
        y += 78;
        y += W.paragraph(c, msgOnly, x + 4, y, w - 8, Math.round(T.FS.hero * 1.3), { size: T.FS.hero - 4, weight: 900, round: true, align: 'center' });
        return y - y0 + 8;
      }
      W.text(c, '一条接龙揭晓了', cx, y + 16, { size: T.FS.title, weight: 900, round: true, align: 'center', maxW: w });
      W.squiggle(c, cx - 50, y + 40, 100, C.zhu);
      y += 62;
      y += quoteCard(c, x + 4, y, w - 8, vm.promptText || '', '#FFF1D6') + 4;
      W.arrowDown(c, cx - 34, y + 2, y + 38, C.ink, 3);
      W.text(c, '传了 ' + (vm.passed || 0) + ' 棒', cx + 6, y + 20, { size: T.FS.bodyL, weight: 800, round: true });
      y += 42;
      const fin = vm.finalText;
      if (fin) y += quoteCard(c, x + 4, y, w - 8, fin, C.card) + 12;
      else {
        W.fillRR(c, x + 4, y, w - 8, 64, 16, C.disabledFill);
        W.text(c, '终点暂不可见', cx, y + 32, { size: T.FS.bodyL, weight: 700, color: C.disabledInk, align: 'center' });
        y += 76;
      }
      y += W.paragraph(c, '完整接龙仅参与的群友可见', x + 4, y, w - 8, Math.round(T.FS.bodyL * 1.5), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
      W.link(c, h, { id: 'teaser:report', x: cx, y: y + 24, label: '举报', icon: 'flag', align: 'center', color: C.sub, size: T.FS.small });
      y += 48;
      return y - y0 + 4;
    },
  });
}

module.exports = { draw };
