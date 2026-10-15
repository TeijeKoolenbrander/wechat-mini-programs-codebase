/**
 * Issue detail (往期 > 第N期, spec 6.11). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 10 Issue detail model {state, dateKey, issueNo, themeLabel, mine,
 *   stats, deck, deckLockedText, errata} plus extras: dateText ('10月14日'),
 *   scrollY, t.
 * The deck (values + your answers) is only present after D+1 00:30 BJT; before
 * that deck is null and deckLockedText is shown. stats is null below 30 results.
 * Hit ids: issue:back, issue:retry, issue:<k>:top:report, issue:<k>:bottom:report,
 *   issue:<k>:top:source, issue:<k>:bottom:source, issue:scroll.
 * No share button here (spec 6.11).
 */

const T = require('./theme');
const W = require('./widgets');
const P = require('./pairs');
const C = T.COLORS;

function pct(shareText) {
  const m = /(\d+(?:\.\d+)?)/.exec(shareText || '');
  return m ? Math.max(0, Math.min(100, Number(m[1]))) : 0;
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '往期', 'issue:back');
  const x = L.x0;
  const cw = L.contentW;
  const bottom = L.bottomEdge - L.bottomPad;
  const head = '第' + vm.issueNo + '期' + (vm.dateText ? ' · ' + vm.dateText : '') + (vm.themeLabel ? ' · ' + vm.themeLabel : '');
  W.text(ctx, head, x, L.navBottom + L.u(18), { size: T.FS.bodyL + 2, weight: 800, serif: true, maxW: cw });
  const top = L.navBottom + L.u(42);

  if (vm.state === 'loading') {
    for (let i = 0; i < 4; i++) W.skeleton(ctx, x, top + i * L.u(54), cw * (i % 2 ? 0.6 : 0.9), L.u(20), vm.t, 6);
    return hits.result();
  }
  if (vm.state === 'error' || vm.state === 'offline') {
    W.text(ctx, vm.state === 'offline' ? '往期需联网查看' : '这一期暂时打不开', L.cx, top + L.u(60), { size: T.FS.title, weight: 800, serif: true, align: 'center' });
    W.button(ctx, L, hits, { id: 'issue:retry', x, y: bottom - L.btnH, w: cw, h: L.btnH, label: '重 试', kind: 'primary' });
    return hits.result();
  }

  const rect = { x: 0, y: top, w: L.W, h: bottom - top };
  const lh = L.u(26) * (L.large ? 1.2 : 1);
  W.scrollRegion(ctx, hits, 'issue:scroll', rect, vm.scrollY, (c, hh, y0) => {
    let y = y0;
    // your result
    let mine = '你没有参加这一期';
    if (vm.mine) mine = '你的成绩  连对 ' + vm.mine.streak + (vm.mine.missK ? '（倒在第 ' + vm.mine.missK + ' 题）' : '（全部答对）');
    y += W.paragraph(c, mine, x, y, cw, lh, { size: T.FS.bodyL, weight: 800, serif: true, maxLines: 2 }) + L.u(4);
    if (vm.stats) {
      W.text(c, vm.stats.totalText, x, y + lh / 2, { size: T.FS.body, color: C.sub, maxW: cw });
      y += lh + L.u(4);
      (vm.stats.buckets || []).forEach((b) => {
        const lw = L.u(56) * (L.large ? 1.25 : 1);
        W.text(c, b.label, x, y + lh / 2, { size: T.FS.body, weight: 600, color: C.ink });
        const bw = cw - lw - L.u(64) * (L.large ? 1.2 : 1);
        c.fillStyle = C.skeleton;
        c.fillRect(x + lw, y + lh / 2 - L.u(5), bw, L.u(10));
        c.fillStyle = C.ink;
        c.fillRect(x + lw, y + lh / 2 - L.u(5), Math.max(2, (bw * pct(b.shareText)) / 100), L.u(10));
        W.text(c, b.shareText, x + cw, y + lh / 2, { size: T.FS.body, color: C.sub, align: 'right' });
        y += lh;
      });
      y += L.u(4);
    }
    y += L.u(4);
    c.fillStyle = C.rule;
    c.fillRect(x, y, cw, 2);
    y += L.u(10);
    if (vm.deck && vm.deck.length) {
      W.text(c, '本期题目', x, y + lh / 2, { size: T.FS.bodyL, weight: 800, serif: true });
      y += lh + L.u(6);
      vm.deck.forEach((q) => {
        y += P.pairRow(c, L, hh, x, y, cw, q, { idBase: 'issue' });
      });
    } else if (vm.deckLockedText) {
      y += W.paragraph(c, vm.deckLockedText, x, y + L.u(8), cw, lh, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center', maxLines: 2 }) + L.u(16);
    }
    (vm.errata || []).forEach((e) => {
      y += W.paragraph(c, '勘误：第 ' + e.k + ' 题 ' + e.text, x, y, cw, lh, { size: T.FS.body, color: C.seal, weight: 700, maxLines: 3 }) + L.u(6);
    });
    return y - y0 + L.u(8);
  });
  return hits.result();
}

module.exports = { draw };
