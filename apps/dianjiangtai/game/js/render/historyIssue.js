/**
 * History issue detail (spec 8.9). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 History issue detail model:
 *   { state:'loading'|'ready'|'error'|'offline', dateKey, issueNo, variantLabel,
 *     mine:{record, bandLabel, lineup:[{slot,label,name,seal,stats}]} | null,
 *     stats:{totalText, bands:[{label, shareText}]} | null,
 *     best:{record, lineup:[{slot,label,name,seal}]} | null,
 *     bestLockedText:'今日军令结束后公布' | null }
 *   + extras: scrollY (px), display, t
 * 识人 days show the stats in your lineup too (the day is over). The best
 * lineup block shows bestLockedText while the date is still open.
 * Hit ids: issue:back, issue:retry, issue:list (scroll area;
 *   hitAreas.scrollMax['issue:list']).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const { recordDigits, recordDash, dateText } = require('./fmt');
const C = T.COLORS;

function sealOf(e, fallbackKey) {
  const s = e.seal || {};
  return {
    text: s.text || e.name,
    name: e.name,
    monogram: s.monogram || (e.name ? e.name.slice(-1) : '?'),
    factionKey: s.factionKey || e.factionKey || fallbackKey || 'qun',
    inkText: s.inkText,
    tier: e.tier || null,
    frame: s.frame || e.tier || 'yi',
  };
}

function lineupRowH(L, e) {
  const large = T.isLarge();
  return L.u(large ? (e.stats ? 100 : 68) : 60);
}

function lineupRow(ctx, L, x, y, w, e) {
  const large = T.isLarge();
  const h = lineupRowH(L, e);
  W.card(ctx, x, y, w, h, { fill: C.tile, r: L.u(10) });
  const seal = L.u(48);
  W.seal(ctx, x + L.u(8), large ? y + L.u(10) : y + (h - seal) / 2, seal, sealOf(e), { dpr: L.dpr });
  const tx = x + L.u(8) + seal + L.u(10);
  const ny = large ? y + L.u(10) + seal / 2 - L.u(14) : e.stats ? y + L.u(20) : y + h / 2;
  const sw = W.text(ctx, e.label || T.SLOT_LABEL[e.slot] || '', tx, ny, { size: T.FS.body, color: C.sub, weight: 600 });
  W.text(ctx, e.name, tx + sw + L.u(8), ny, { size: T.FS.bodyL, weight: 800, serif: true, maxW: x + w - tx - sw - L.u(16) });
  if (e.stats) {
    const items = T.STAT_KEYS.map((k) => T.STAT_LABEL[k] + e.stats[k]);
    if (large) {
      const widths = items.map((s) => W.measure(ctx, s, T.FS.body, 500, false));
      const sum = widths.reduce((a, b) => a + b, 0);
      const gap = Math.max(L.u(4), Math.min(L.u(14), (w - L.u(16) - sum) / 4));
      let sx = x + L.u(8);
      items.forEach((s, i) => {
        W.text(ctx, s, sx, y + L.u(10) + seal + L.u(16), { size: T.FS.body, color: C.sub });
        sx += widths[i] + gap;
      });
    } else {
      W.text(ctx, items.join(' '), tx, y + L.u(43), { size: T.FS.body, color: C.sub, maxW: x + w - tx - L.u(8) });
    }
  }
  return h;
}

function bestRowH(L) {
  return L.u(T.isLarge() ? 68 : 60);
}

function bestRow(ctx, L, x, y, w, e) {
  const h = bestRowH(L);
  W.card(ctx, x, y, w, h, { fill: C.tile, r: L.u(10) });
  const seal = L.u(48);
  W.seal(ctx, x + L.u(8), y + (h - seal) / 2, seal, sealOf(e), { dpr: L.dpr });
  const tx = x + L.u(8) + seal + L.u(10);
  const sw = W.text(ctx, e.label || T.SLOT_LABEL[e.slot] || '', tx, y + h / 2, { size: T.FS.body, color: C.sub, weight: 600 });
  W.text(ctx, e.name, tx + sw + L.u(8), y + h / 2, { size: T.FS.bodyL, weight: 800, serif: true, maxW: x + w - tx - sw - L.u(16) });
  return h;
}

function parseShare(s) {
  const n = parseFloat(String(s || '').replace('%', ''));
  return isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

function bandRowH(L) {
  return L.u(T.isLarge() ? 40 : 32);
}

function bandRow(ctx, L, x, y, w, b, maxShare) {
  const h = bandRowH(L);
  const labW = L.u(T.isLarge() ? 96 : 76);
  const valW = L.u(T.isLarge() ? 74 : 58);
  W.text(ctx, b.label, x, y + h / 2, { size: T.FS.body, weight: 600, maxW: labW });
  const bx = x + labW + L.u(6);
  const bw = w - labW - valW - L.u(12);
  const v = parseShare(b.shareText);
  W.fillRR(ctx, bx, y + h / 2 - L.u(5), bw, L.u(10), L.u(5), C.pipOff);
  if (v != null && maxShare > 0) W.fillRR(ctx, bx, y + h / 2 - L.u(5), Math.max(L.u(4), bw * (v / maxShare)), L.u(10), L.u(5), C.seal);
  W.text(ctx, b.shareText, x + w, y + h / 2, { size: T.FS.body, weight: 700, align: 'right', maxW: valW });
  return h;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '往期', 'issue:back');
  const large = T.isLarge();
  const x = L.x0;
  const cw = L.contentW;
  let y = L.navBottom + L.u(2);
  const head = '第' + (vm.issueNo != null ? vm.issueNo : '') + '期 · ' + dateText(vm.dateKey);
  const hw = W.text(ctx, head, x, y + L.u(16), { size: T.FS.title, weight: 800, serif: true, maxW: cw - (vm.variantLabel ? L.u(70) : 0) });
  if (vm.variantLabel) W.pill(ctx, L, x + hw + L.u(10), y + L.u(16), vm.variantLabel, { size: T.FS.body });
  y += L.u(large ? 46 : 40);

  const area = { x, y, w: cw, h: L.bottomEdge - L.bottomPad - y };
  const state = vm.state;
  if (state === 'loading') {
    for (let i = 0; i < 4; i++) {
      W.card(ctx, x, y + i * L.u(70), cw, L.u(64), { r: L.u(10) });
      W.skeleton(ctx, x + L.u(14), y + i * L.u(70) + L.u(14), cw * 0.5, L.u(18), vm.t, 6);
      W.skeleton(ctx, x + L.u(14), y + i * L.u(70) + L.u(40), cw * 0.3, L.u(16), vm.t, 6);
    }
    return hits.result();
  }
  if (state === 'error' || state === 'offline') {
    W.text(ctx, '往期需联网查看', L.cx, y + L.u(60), { size: T.FS.title, weight: 800, serif: true, align: 'center', maxW: cw });
    const bh = T.btn(L, 56);
    W.button(ctx, L, hits, { id: 'issue:retry', x, y: L.bottomEdge - L.bottomPad - bh, w: cw, h: bh, label: '重 试', kind: 'primary' });
    return hits.result();
  }

  // ---- measure
  const mine = vm.mine;
  const secH = L.u(large ? 40 : 34);
  const gap = L.u(6);
  const w = cw - L.u(6);
  let contentH = secH + L.u(large ? 40 : 34);
  if (mine) contentH += mine.lineup.reduce((a, e) => a + lineupRowH(L, e) + gap, 0);
  contentH += L.u(12);
  if (vm.stats) contentH += secH + vm.stats.bands.length * bandRowH(L) + L.u(12);
  const bestHead = secH + (large ? L.u(34) : 0);
  contentH += bestHead;
  if (vm.best) contentH += vm.best.lineup.reduce((a) => a + bestRowH(L) + gap, 0);
  else contentH += L.u(36);

  W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'issue:list', () => {
    let cy = area.y;
    W.text(ctx, '你的战绩', x, cy + secH / 2, { size: T.FS.bodyL, weight: 800, serif: true });
    cy += secH;
    const rec = mine ? recordDigits(mine.record) + (mine.bandLabel ? ' · ' + mine.bandLabel : '') : '未出征';
    W.text(ctx, rec, x, cy + L.u(large ? 18 : 15), { size: T.FS.bodyL + 2, weight: 800, serif: true, color: mine ? C.ink : C.sub, maxW: cw });
    cy += L.u(large ? 40 : 34);
    if (mine) {
      mine.lineup.forEach((e) => {
        cy += lineupRow(ctx, L, x, cy, w, e) + gap;
      });
    }
    cy += L.u(12);
    if (vm.stats) {
      W.text(ctx, '本期战况', x, cy + secH / 2, { size: T.FS.bodyL, weight: 800, serif: true });
      W.text(ctx, vm.stats.totalText || '', x + cw, cy + secH / 2, { size: T.FS.body, color: C.sub, align: 'right', maxW: cw * (large ? 0.6 : 0.6) });
      cy += secH;
      const maxShare = Math.max.apply(null, vm.stats.bands.map((b) => parseShare(b.shareText) || 0).concat([1]));
      vm.stats.bands.forEach((b) => {
        cy += bandRow(ctx, L, x, cy, w, b, maxShare);
      });
      cy += L.u(12);
    }
    const bestTitle = '本期最佳阵容' + (vm.best ? ' ' + recordDash(vm.best.record) : '');
    W.text(ctx, bestTitle, x, cy + secH / 2, { size: T.FS.bodyL, weight: 800, serif: true, maxW: cw });
    if (large) W.text(ctx, '首轮令牌，不换令', x, cy + secH + L.u(14), { size: T.FS.body, color: C.sub, maxW: cw });
    else if (vm.best) W.text(ctx, '首轮令牌，不换令', x + cw, cy + secH / 2, { size: T.FS.body, color: C.sub, align: 'right', maxW: cw * 0.4 });
    cy += bestHead;
    if (vm.best) {
      vm.best.lineup.forEach((e) => {
        cy += bestRow(ctx, L, x, cy, w, e) + gap;
      });
    } else {
      W.text(ctx, vm.bestLockedText || '今日军令结束后公布', x, cy + L.u(18), { size: T.FS.body, color: C.sub, maxW: cw });
    }
  });
  return hits.result();
}

module.exports = { draw };
