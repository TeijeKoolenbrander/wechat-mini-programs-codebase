/**
 * Overlays drawn on top of any screen, after its own draw(): confirm dialog, toast, stub ad overlay. Concatenate the
 * returned hit areas after the screen's (later areas win) and keep the screen's scrollMax.
 *
 * vm: { dialog?, toast?, adStub?, display? } (all optional)
 *   display: the same {largeText, highContrast} as the screen under it.
 *   dialog:  {title?, text, confirmLabel, cancelLabel?, danger?}   hit ids dialog:confirm, dialog:cancel, dialog:block
 *   toast:   {text}  (no hit areas; logic removes it after ~2 s)
 *   adStub:  {kind: 'rewarded'|'interstitial', secondsLeft}       hit ids adstub:complete, adstub:skip, adstub:block
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

function modalCard(ctx, L, hits, blockId, w, h) {
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add(blockId, 0, 0, L.W, L.H);
  const x = (L.W - w) / 2;
  const y = Math.max(L.navBottom, (L.H - h) / 2 - L.u(20));
  W.card(ctx, x, y, w, h, { r: L.u(18), fill: C.sheet });
  hits.add(blockId + ':card', x, y, w, h);
  return { x, y, w, h };
}

function lineH() {
  return Math.round(T.FS.bodyL * 1.5);
}

function drawDialog(ctx, L, hits, d) {
  const w = Math.min(L.contentW, L.u(T.isLarge() ? 340 : 320));
  const inner = w - L.u(40);
  const lh = lineH();
  const lines = W.wrap(ctx, d.text, inner, T.FS.bodyL, 500);
  const titleH = d.title ? L.u(T.isLarge() ? 44 : 36) : 0;
  const bh = T.btn(L, 52);
  const stacked = T.isLarge() && d.cancelLabel;
  const h = L.u(26) + titleH + lines.length * lh + L.u(22) + (stacked ? 2 * bh + L.u(12) : bh) + L.u(20);
  const m = modalCard(ctx, L, hits, 'dialog:block', w, h);
  let y = m.y + L.u(26);
  if (d.title) {
    W.text(ctx, d.title, m.x + m.w / 2, y + titleH / 2 - L.u(6), { size: T.FS.title, weight: 800, align: 'center', maxW: inner });
    y += titleH;
  }
  lines.forEach((ln, i) => W.text(ctx, ln, m.x + m.w / 2, y + i * lh + lh / 2, { size: T.FS.bodyL, align: 'center', weight: 500 }));
  const kindOk = d.danger ? 'danger' : 'primary';
  if (stacked) {
    const by = m.y + m.h - L.u(20) - 2 * bh - L.u(12);
    W.button(ctx, L, hits, { id: 'dialog:confirm', x: m.x + L.u(20), y: by, w: m.w - L.u(40), h: bh, label: d.confirmLabel || '好', kind: kindOk });
    W.button(ctx, L, hits, { id: 'dialog:cancel', x: m.x + L.u(20), y: by + bh + L.u(12), w: m.w - L.u(40), h: bh, label: d.cancelLabel, kind: 'secondary' });
    return;
  }
  const by = m.y + m.h - L.u(20) - bh;
  const bw = d.cancelLabel ? (m.w - L.u(40) - L.u(12)) / 2 : m.w - L.u(40);
  let bx = m.x + L.u(20);
  if (d.cancelLabel) {
    W.button(ctx, L, hits, { id: 'dialog:cancel', x: bx, y: by, w: bw, h: bh, label: d.cancelLabel, kind: 'secondary' });
    bx += bw + L.u(12);
  }
  W.button(ctx, L, hits, { id: 'dialog:confirm', x: bx, y: by, w: bw, h: bh, label: d.confirmLabel || '好', kind: kindOk });
}

function drawToast(ctx, L, t) {
  const maxTextW = L.contentW - L.u(40);
  const lines = W.wrap(ctx, t.text, maxTextW, T.FS.bodyL, 600).slice(0, 3);
  const widest = Math.max.apply(null, lines.map((ln) => W.measure(ctx, ln, T.FS.bodyL, 600)).concat([0]));
  const tw = Math.min(L.contentW, widest + L.u(40));
  const lh = Math.round(T.FS.bodyL * 1.4);
  const h = Math.max(L.u(46), lines.length * lh + L.u(18));
  const x = (L.W - tw) / 2;
  const y = L.H * 0.42;
  W.fillRR(ctx, x, y, tw, h, Math.min(h / 2, L.u(23)), T.isHC() ? '#000000' : 'rgba(30,27,24,0.92)');
  lines.forEach((ln, i) => W.text(ctx, ln, L.W / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh + 1, { size: T.FS.bodyL, weight: 600, color: '#FFFFFF', align: 'center' }));
}

function drawAdStub(ctx, L, hits, a) {
  ctx.fillStyle = '#1B1815';
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add('adstub:block', 0, 0, L.W, L.H);
  const cy = L.H * 0.36;
  W.text(ctx, '广告位（测试）', L.cx, cy, { size: T.FS.hero, weight: 800, color: '#F2C94C', align: 'center', maxW: L.contentW });
  W.text(ctx, a.kind === 'interstitial' ? '插屏广告' : '激励视频', L.cx, cy + L.u(40), { size: T.FS.bodyL, color: '#FAF7F0', align: 'center' });
  W.text(ctx, '还剩 ' + Math.max(0, Math.ceil(a.secondsLeft || 0)) + ' 秒', L.cx, cy + L.u(76), { size: T.FS.bodyL, color: '#FAF7F0', align: 'center' });
  const bw = Math.min(L.contentW, L.u(300));
  const bx = L.cx - bw / 2;
  const bh = T.btn(L, 52);
  const by = L.bottomEdge - L.bottomPad - bh * 2 - L.u(14);
  W.button(ctx, L, hits, { id: 'adstub:complete', x: bx, y: by, w: bw, h: bh, label: '模拟看完', kind: 'primary' });
  W.button(ctx, L, hits, { id: 'adstub:skip', x: bx, y: by + bh + L.u(14), w: bw, h: bh, label: '跳过（不给奖励）', kind: 'secondary' });
}

function draw(ctx, vm, L) {
  if (vm.display) T.applyDisplay(vm.display);
  const hits = new Hits();
  if (vm.dialog) drawDialog(ctx, L, hits, vm.dialog);
  if (vm.adStub) drawAdStub(ctx, L, hits, vm.adStub);
  if (vm.toast) drawToast(ctx, L, vm.toast);
  return hits.result();
}

module.exports = { draw };
