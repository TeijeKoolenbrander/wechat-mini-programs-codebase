/**
 * 已传出, after a submit (spec 8.6). draw(ctx, vm, layout) -> hitAreas.
 *
 * The author always sees their own 棒 here (the only place besides 我的接龙),
 * with its moderation state as a stamp (icon + text, never colour alone).
 * Anything but passed/pending hides the share button: nothing was passed on.
 *
 * vm = spec 12 已传出 model plus extras: display, sheet, scrollY.
 *   mine.strokes | mine.text is the author's own content.
 *   modState defaults to 'pending' when missing (fail closed).
 * Hit ids: back (首页), sent:share, sent:reveal, sent:subscribe, sent:group,
 *   sent:again, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./strokes');
const { page } = require('./page');
const C = T.COLORS;

const STAMP = { pending: '审核中', passed: '已通过', blocked: '没通过', void: '已超时' };
const MOD_TEXT = {
  pending: '审核中，通过后传给下一位',
  passed: '已通过',
  blocked: '这一棒没通过内容审核，没有传出去',
  void: '审核超时，这一棒没有传出去，不算你的次数',
};

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const mod = STAMP[vm.modState] ? vm.modState : 'pending';
  const mine = vm.mine || {};
  const sub = (vm.subscribe && vm.subscribe.state) || 'hidden';
  const bh = W.btnH(L);
  const smallH = W.btnH(L, true);
  const gap = L.u(8);
  const passedOn = mod === 'pending' || mod === 'passed';
  const showSub = sub === 'offer' || sub === 'requesting';
  const primaryId = vm.revealed ? 'sent:reveal' : passedOn ? 'sent:share' : 'sent:again';
  const primaryLabel = vm.revealed ? '看揭晓' : passedOn ? '发到群里接龙' : '再开一条';
  const footerH = bh + (showSub ? gap + smallH : 0) + (primaryId === 'sent:again' ? gap + smallH : gap + smallH);

  return page(ctx, vm, L, {
    back: { label: '首页', id: 'back' },
    title: '第 ' + (vm.step || '') + ' 棒已传出',
    footerH,
    footer: (c, h, r) => {
      let y = r.y;
      W.button(c, L, h, { id: primaryId, x: r.x, y, w: r.w, h: bh, label: primaryLabel, kind: 'primary' });
      y += bh;
      if (showSub) {
        y += gap;
        W.button(c, L, h, { id: 'sent:subscribe', x: r.x, y, w: r.w, h: smallH, label: sub === 'requesting' ? '请求中…' : '揭晓时提醒我', kind: 'secondary', size: T.FS.body, disabled: sub === 'requesting' });
        y += smallH;
      }
      y += gap;
      const half = (r.w - gap) / 2;
      if (primaryId === 'sent:again') {
        W.button(c, L, h, { id: 'sent:group', x: r.x, y, w: r.w, h: smallH, label: '看看本群其他接龙', kind: 'secondary', size: T.FS.body });
      } else {
        W.button(c, L, h, { id: 'sent:group', x: r.x, y, w: half, h: smallH, label: '本群其他接龙', kind: 'secondary', size: T.FS.body });
        W.button(c, L, h, { id: 'sent:again', x: r.x + half + gap, y, w: half, h: smallH, label: '再开一条', kind: 'secondary', size: T.FS.body });
      }
    },
    body: (c, h, y0, x, w) => {
      let y = y0 + 4;
      const size = T.FS.body;
      const lh = Math.round(size * 1.5);
      const modText = vm.modText || MOD_TEXT[mod];
      const isDraw = vm.kind === 'draw' || (mine.strokes && !mine.text);
      if (isDraw) {
        const th = Math.min(w * 0.46, L.u(150));
        const ch = th + 24;
        W.card(c, x, y, w, ch, { r: 16 });
        const rect = { x: x + 12, y: y + 12, w: th, h: th };
        S.draw(c, mine.strokes && mine.strokes.s ? mine.strokes : null, rect, { bg: '#FFFFFF', radius: 6, border: C.ink, borderWidth: 2 });
        const rx = rect.x + th + 14;
        const rw = x + w - 12 - rx;
        W.stamp(c, rx + Math.min(rw, 120) / 2 + 2, y + 34, mod, STAMP[mod]);
        const ph = W.paragraph(c, modText, rx, y + 64, rw, lh, { size, weight: 700, color: mod === 'blocked' || mod === 'void' ? C.zhuText : C.ink });
        y += Math.max(ch, 64 + ph + 14) + 12;
      } else {
        const txt = mine.text || '';
        const tl = Math.round(T.FS.bodyL * 1.5) + 2;
        const th = W.paragraphH(c, txt, w - 32, tl, { size: T.FS.bodyL + 2, weight: 800, round: true });
        const mh = W.paragraphH(c, modText, w - 32, lh, { size, weight: 700 });
        const ch = 18 + th + 14 + 46 + 8 + mh + 14;
        W.card(c, x, y, w, ch, { r: 16 });
        W.paragraph(c, '「' + txt + '」', x + 16, y + 16, w - 32, tl, { size: T.FS.bodyL + 2, weight: 800, round: true });
        W.stamp(c, x + 16 + 56, y + 16 + th + 36, mod, STAMP[mod]);
        W.paragraph(c, modText, x + 16, y + 16 + th + 66, w - 32, lh, { size, weight: 700, color: mod === 'blocked' || mod === 'void' ? C.zhuText : C.ink });
        y += ch + 12;
      }
      if (vm.nextText && passedOn) y += W.paragraph(c, vm.nextText, x + 2, y, w - 4, lh, { size, weight: 700 }) + 4;
      if (vm.autoUpdateNote && passedOn) y += W.paragraph(c, '之前发到群里的卡片会自动更新进度', x + 2, y, w - 4, lh, { size, color: C.sub }) + 4;
      if (sub === 'granted') {
        W.iconCheck(c, x + 12, y + lh / 2, 14, C.good, 3);
        W.text(c, '揭晓时会提醒你', x + 30, y + lh / 2, { size, weight: 700, color: C.good });
        y += lh + 4;
      } else if (sub === 'unavailable') {
        W.text(c, '提醒未开启', x + 2, y + lh / 2, { size, color: C.sub });
        y += lh + 4;
      }
      if (vm.firstTimeExplainer) {
        const t = '你只能看到上一棒，下一位也只能看到你这一棒。全部传完后，参与的人一起看揭晓。';
        const eh = W.paragraphH(c, t, w - 28, lh, { size, weight: 600 }) + 24;
        y += 6;
        W.fillRR(c, x, y, w, eh, 14, C.blueSoft);
        W.strokeRR(c, x, y, w, eh, 14, C.blueText, W.bw());
        W.paragraph(c, t, x + 14, y + 12, w - 28, lh, { size, weight: 600 });
        y += eh + 4;
      }
      return y - y0;
    },
  });
}

module.exports = { draw };
