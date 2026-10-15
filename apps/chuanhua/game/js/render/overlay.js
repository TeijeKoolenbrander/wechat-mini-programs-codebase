/**
 * Overlays drawn on top of any screen, after its own draw(): confirm dialog,
 * toast, stub ad overlay (QA only). Concatenate the returned hit areas after
 * the screen's (later areas win).
 *
 * vm: { dialog?, toast?, adStub?, display? }
 *   dialog: {title?, text, confirmLabel, cancelLabel?, danger?}
 *           hit ids dialog:confirm, dialog:cancel, dialog:block
 *   toast:  {text}  (no hit areas; logic removes it after ~2 s)
 *   adStub: {kind: 'rewarded'|'interstitial', secondsLeft}
 *           hit ids adstub:complete, adstub:skip, adstub:block
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

function drawDialog(ctx, L, hits, d) {
  const w = Math.min(L.contentW, L.u(330));
  const inner = w - L.u(40);
  const lh = Math.round(T.FS.bodyL * 1.5);
  const lines = W.wrap(ctx, d.text, inner, T.FS.bodyL, 700);
  const titleH = d.title ? Math.round(T.FS.title * 1.5) : 0;
  const bh = W.btnH(L);
  const h = L.u(24) + titleH + lines.length * lh + L.u(22) + bh + L.u(20);
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add('dialog:block', 0, 0, L.W, L.H);
  const x = (L.W - w) / 2;
  const y = Math.max(L.navBottom, (L.H - h) / 2 - L.u(20));
  W.sticker(ctx, x, y, w, h, 18, { fill: C.sheet });
  hits.add('dialog:block:card', x, y, w, h);
  let cy = y + L.u(24);
  if (d.title) {
    W.text(ctx, d.title, x + w / 2, cy + titleH / 2, { size: T.FS.title, weight: 800, round: true, align: 'center', maxW: inner });
    cy += titleH;
  }
  lines.forEach((ln, i) => W.text(ctx, ln, x + w / 2, cy + i * lh + lh / 2, { size: T.FS.bodyL, weight: 700, align: 'center' }));
  const by = y + h - L.u(20) - bh;
  const gap = L.u(12);
  if (d.cancelLabel) {
    const bw = (w - L.u(40) - gap) / 2;
    W.button(ctx, L, hits, { id: 'dialog:cancel', x: x + L.u(20), y: by, w: bw, h: bh, label: d.cancelLabel, kind: 'secondary' });
    W.button(ctx, L, hits, { id: 'dialog:confirm', x: x + L.u(20) + bw + gap, y: by, w: bw, h: bh, label: d.confirmLabel || '好', kind: d.danger ? 'danger' : 'primary' });
  } else {
    W.button(ctx, L, hits, { id: 'dialog:confirm', x: x + L.u(20), y: by, w: w - L.u(40), h: bh, label: d.confirmLabel || '好', kind: 'primary' });
  }
}

function drawToast(ctx, L, t) {
  const size = T.FS.bodyL;
  const lines = W.wrap(ctx, t.text, L.contentW - L.u(48), size, 700).slice(0, 2);
  const lh = Math.round(size * 1.4);
  const tw = Math.min(L.contentW, Math.max.apply(null, lines.map((s) => W.measure(ctx, s, size, 700))) + L.u(40));
  const h = lines.length * lh + L.u(24);
  const x = (L.W - tw) / 2;
  const y = L.H * 0.42;
  W.fillRR(ctx, x, y + 3, tw, h, h / 2.4, C.ink);
  W.fillRR(ctx, x, y, tw, h, h / 2.4, T.MODE.highContrast ? '#000000' : '#2A2622');
  lines.forEach((ln, i) => W.text(ctx, ln, L.W / 2, y + L.u(12) + lh * i + lh / 2, { size, weight: 700, color: '#FFFFFF', align: 'center', maxW: tw - L.u(24) }));
}

function drawAdStub(ctx, L, hits, a) {
  ctx.fillStyle = '#1B1815';
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add('adstub:block', 0, 0, L.W, L.H);
  const cy = L.H * 0.34;
  W.text(ctx, '广告位（测试）', L.cx, cy, { size: T.FS.hero, weight: 800, round: true, color: C.orange, align: 'center' });
  W.text(ctx, a.kind === 'interstitial' ? '插屏广告' : '激励视频', L.cx, cy + L.u(40), { size: T.FS.bodyL, color: '#FFFFFF', align: 'center' });
  W.text(ctx, '还剩 ' + Math.max(0, Math.ceil(a.secondsLeft || 0)) + ' 秒', L.cx, cy + L.u(76), { size: T.FS.bodyL, color: '#FFFFFF', align: 'center' });
  const bw = Math.min(L.contentW, L.u(300));
  const bx = L.cx - bw / 2;
  const bh = W.btnH(L);
  const by = L.bottomEdge - L.bottomPad - bh * 2 - L.u(14);
  W.button(ctx, L, hits, { id: 'adstub:complete', x: bx, y: by, w: bw, h: bh, label: '模拟看完', kind: 'primary' });
  W.button(ctx, L, hits, { id: 'adstub:skip', x: bx, y: by + bh + L.u(14), w: bw, h: bh, label: '跳过（不给奖励）', kind: 'secondary' });
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  if (vm.dialog) drawDialog(ctx, L, hits, vm.dialog);
  if (vm.adStub) drawAdStub(ctx, L, hits, vm.adStub);
  if (vm.toast) drawToast(ctx, L, vm.toast);
  return hits.result();
}

module.exports = { draw };
