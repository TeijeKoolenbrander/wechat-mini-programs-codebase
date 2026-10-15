/**
 * 本群接龙 (spec 8.10). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 12 本群接龙 model plus extras: display, sheet, scrollY, t.
 * Rows never show content: only the pre-formatted `line` strings. Recent
 * reveals are tappable for everyone (participants open the reveal, others the
 * teaser) and carry the text tag 你参与了 for participants.
 * banner.reservedHeight is pinned above the footer with a 24 pt gap each side
 * (hit id `banner:slot` = where logic places the native banner).
 * Hit ids: back, group:start, group:retry, group:chain:<chainId> (waiting and
 * in-progress rows -> chain entry), group:reveal:<chainId> (participant),
 * group:teaser:<chainId>, banner:slot, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./rows');
const { page } = require('./page');
const C = T.COLORS;

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const state = vm.state || 'loading';
  const bh = W.btnH(L);
  const gap = L.u(8);
  const banner = vm.banner && vm.banner.show && (state === 'ready' || state === 'empty') ? vm.banner : null;
  const bannerH = banner ? Math.max(0, banner.reservedHeight || 50) : 0;
  const bgap = 24;
  const footerH = bh + (banner ? bannerH + bgap : 0);

  return page(ctx, vm, L, {
    back: { label: '返回', id: 'back' },
    title: '本群接龙',
    footerH,
    footer: (c, h, r) => {
      let y = r.y;
      if (banner) {
        c.setLineDash([6, 4]);
        W.strokeRR(c, r.x, y, r.w, bannerH, 8, C.line, 1.5);
        c.setLineDash([]);
        h.add('banner:slot', r.x, y, r.w, bannerH);
        y += bannerH + bgap;
      }
      if (state === 'error') W.button(c, L, h, { id: 'group:retry', x: r.x, y, w: r.w, h: bh, label: '重试', kind: 'primary' });
      else W.button(c, L, h, { id: 'group:start', x: r.x, y, w: r.w, h: bh, label: '开一条接龙', kind: 'primary', disabled: state === 'checkingGroup' });
    },
    body: (c, h, y0, x, w) => {
      let y = y0 + 2;
      const lh = Math.round(T.FS.bodyL * 1.5);
      const msgCard = (msg, sub) => {
        const ph = W.paragraphH(c, msg, w - 32, lh, { size: T.FS.bodyL, weight: 800, round: true });
        const sh = sub ? W.paragraphH(c, sub, w - 32, Math.round(T.FS.body * 1.5), { size: T.FS.body }) + 6 : 0;
        const ch = ph + sh + 32;
        W.card(c, x, y, w, ch, { r: 16 });
        W.paragraph(c, msg, x + 16, y + 16, w - 32, lh, { size: T.FS.bodyL, weight: 800, round: true });
        if (sub) W.paragraph(c, sub, x + 16, y + 16 + ph + 6, w - 32, Math.round(T.FS.body * 1.5), { size: T.FS.body, color: C.sub });
        return ch;
      };
      if (state === 'noGroup') return y + msgCard('在群聊里点开接龙卡片，就能看到本群的接龙') - y0 + 4;
      if (state === 'checkingGroup' || state === 'loading') {
        W.text(c, state === 'checkingGroup' ? '正在确认群聊…' : '正在加载…', x + 4, y + 14, { size: T.FS.bodyL, weight: 700, color: C.sub });
        y += 36;
        for (let i = 0; i < 3; i++) {
          W.skeleton(c, x, y, w, L.u(58), vm.t, 14);
          y += L.u(58) + 10;
        }
        return y - y0;
      }
      if (state === 'error') return y + msgCard('本群接龙暂时打不开', '检查网络后再试一次') - y0 + 4;
      if (state === 'empty') return y + msgCard('本群还没有接龙，开第一条吧') - y0 + 4;

      if (vm.statsText) {
        const sh = W.paragraphH(c, vm.statsText, w - 28, Math.round(T.FS.body * 1.45), { size: T.FS.body, weight: 700 }) + 20;
        W.fillRR(c, x, y, w, sh, 14, C.blueSoft);
        W.strokeRR(c, x, y, w, sh, 14, C.blueText, W.bw());
        W.paragraph(c, vm.statsText, x + 14, y + 10, w - 28, Math.round(T.FS.body * 1.45), { size: T.FS.body, weight: 700 });
        y += sh + 6;
      }
      const waiting = vm.waiting || [];
      const prog = vm.inProgress || [];
      const rev = vm.revealed || [];
      if (waiting.length) {
        y += R.sectionTitle(c, x, y, w, '等你接');
        y += R.cardRows(c, h, x, y, w, waiting.map((r) => ({ id: 'group:chain:' + r.chainId, marker: 'dot', line: r.line, chevron: true }))) + 6;
      }
      if (prog.length) {
        y += R.sectionTitle(c, x, y, w, '进行中');
        y += R.cardRows(c, h, x, y, w, prog.map((r) => ({ id: 'group:chain:' + r.chainId, marker: 'ring', line: r.line }))) + 6;
      }
      if (rev.length) {
        y += R.sectionTitle(c, x, y, w, '最近揭晓');
        y += R.cardRows(c, h, x, y, w, rev.map((r) => ({ id: (r.participant ? 'group:reveal:' : 'group:teaser:') + r.chainId, marker: null, line: r.line, sub: r.participant ? '你参与了 · 点开看完整接龙' : '点开看结果', chevron: true }))) + 6;
      }
      void gap;
      return y - y0 + 4;
    },
  });
}

module.exports = { draw };
