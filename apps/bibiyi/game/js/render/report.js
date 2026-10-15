/**
 * Report sheet "这条数据有问题？" (spec 6.6, 3.8): the fact, fixed reasons as
 * multi-select chips, no free text. Drawn over any screen. Never blocks play.
 *
 * vm = spec 10 Report model {factId, title, card, reasons:[{key,label,selected}],
 *   state:'idle'|'sending'|'sent'|'offline', alreadyReported} plus sheetScroll.
 * Hit ids: report:reason:<key>, report:submit (disabled until >= 1 chip, and
 *   while sending), report:cancel, sheet:close, sheet:list.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  const card = vm.card || {};
  const reasons = vm.reasons || [];
  const any = reasons.some((r) => r.selected);
  const gap = L.u(10);
  const chipH = Math.max(T.MIN_TAP, L.u(48) * (L.large ? 1.15 : 1));
  const btnH = L.btnH;
  const h = Math.min(L.H - L.navBottom, L.u(80) + L.u(100) + Math.ceil(reasons.length / 2) * (chipH + gap) + btnH + L.u(36) + L.safeBottom + (L.large ? L.u(40) : 0));
  const s = W.sheet(ctx, L, hits, { h, title: vm.title || '这条数据有问题？' });
  const top = s.top - L.u(8);
  const footerH = btnH + L.u(12);
  const rect = { x: s.x, y: top, w: s.w, h: s.bottom - footerH - top };
  const lh = L.u(24) * (L.large ? 1.2 : 1);
  const sending = vm.state === 'sending';
  const sent = vm.state === 'sent';
  W.scrollRegion(ctx, hits, 'sheet:list', rect, vm.sheetScroll, (c, hh, y0) => {
    let y = y0;
    // the fact: label, sub-label, value unit, source
    const accent = T.accentFill(card.accent);
    W.fillRR(c, s.x, y + L.u(4), L.u(5), lh * 2 - L.u(2), 2, accent);
    const head = [card.label, card.subLabel].filter(Boolean).join(' · ');
    W.text(c, head, s.x + L.u(14), y + lh / 2 + L.u(2), { size: T.FS.bodyL, weight: 800, serif: true, maxW: s.w - L.u(14) });
    const val = card.valueText == null ? '' : (card.approx && card.valueText.charAt(0) !== '约' ? '约 ' : '') + card.valueText + ' ' + (card.unitText || '');
    W.text(c, val, s.x + L.u(14), y + lh * 1.5 + L.u(2), { size: T.FS.body, weight: 700, color: C.ink, maxW: s.w - L.u(14) });
    y += lh * 2 + L.u(2);
    if (card.sourceText) y += W.paragraph(c, card.sourceText, s.x + L.u(14), y, s.w - L.u(14), lh, { size: T.FS.body, color: C.sub, maxLines: 2 });
    y += L.u(12);
    if (vm.alreadyReported) {
      W.text(c, '你已反馈过这条，可以更新原因', s.x, y + lh / 2, { size: T.FS.body, weight: 700, color: C.sub, maxW: s.w });
      y += lh + L.u(6);
    }
    // chips: two columns
    const cw = (s.w - gap) / 2;
    reasons.forEach((r, i) => {
      const x = s.x + (i % 2) * (cw + gap);
      const cy = y + Math.floor(i / 2) * (chipH + gap);
      W.chip(c, L, hh, { id: sending || sent ? null : 'report:reason:' + r.key, x, y: cy, w: cw, h: chipH, label: r.label, selected: !!r.selected });
    });
    y += Math.ceil(reasons.length / 2) * (chipH + gap);
    if (vm.state === 'offline') {
      y += W.paragraph(c, '网络不太好，稍后再试', s.x, y, s.w, lh, { size: T.FS.body, weight: 700, color: C.bad });
    }
    return y - y0;
  });

  // pinned footer: 提交 / 更新 and 取消
  const fy = s.bottom - btnH;
  const half = (s.w - L.u(12)) / 2;
  const label = sending ? '提交中…' : sent ? '已提交' : vm.alreadyReported ? '更新' : '提交';
  W.button(ctx, L, hits, { id: 'report:submit', x: s.x, y: fy, w: half, h: btnH, label, kind: 'primary', disabled: !any || sending || sent });
  W.button(ctx, L, hits, { id: 'report:cancel', x: s.x + half + L.u(12), y: fy, w: half, h: btnH, label: '取消', kind: 'secondary', size: T.FS.bodyL });
  return hits.result();
}

module.exports = { draw };
