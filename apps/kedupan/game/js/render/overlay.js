/**
 * Overlays drawn on top of any screen after its own draw(): confirm dialog, toast, stub ad overlay (QA), own privacy dialog
 * (the spec 8.6 / E4 fallback). Concatenate the returned hit areas after the screen's (later areas win).
 *
 * vm: { dialog?, toast?, adStub?, privacy?, display? } (all optional); pass the same `display` as the screen under it.
 *   dialog:  {title?, text, confirmLabel, cancelLabel?, danger?}   ids dialog:confirm, dialog:cancel, dialog:block
 *   toast:   {text}   no hit areas; logic removes it after ~2 s
 *   adStub:  {kind: 'rewarded'|'interstitial', secondsLeft}   ids adstub:complete, adstub:skip, adstub:block
 *   privacy: {}   ids privacy:agree, privacy:refuse, privacy:contract, privacy:block
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
  ctx.save();
  if (!T.isHC()) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
  }
  W.fillRR(ctx, x, y, w, h, L.u(18), C.sheet);
  ctx.restore();
  W.strokeRR(ctx, x, y, w, h, L.u(18), C.lineStrong, 2);
  hits.add(blockId + ':card', x, y, w, h);
  return { x, y, w, h };
}

const lineH = () => Math.round(T.FS.bodyL * 1.5);

function drawDialog(ctx, L, hits, d) {
  const w = Math.min(L.contentW, L.u(T.isLarge() ? 340 : 320));
  const inner = w - L.u(40);
  const lh = lineH();
  const lines = W.wrap(ctx, d.text, inner, T.FS.bodyL, 500);
  const titleH = d.title ? L.u(T.isLarge() ? 44 : 34) : 0;
  const bh = T.btn(L, 52);
  const stacked = T.isLarge() && d.cancelLabel;
  const h = L.u(28) + titleH + lines.length * lh + L.u(24) + (stacked ? 2 * bh + L.u(12) : bh) + L.u(20);
  const m = modalCard(ctx, L, hits, 'dialog:block', w, h);
  let y = m.y + L.u(28);
  if (d.title) {
    W.text(ctx, d.title, m.x + m.w / 2, y, { size: T.FS.title, weight: 800, align: 'center', maxW: inner });
    y += titleH;
  }
  lines.forEach((ln, i) => W.text(ctx, ln, m.x + m.w / 2, y + i * lh + lh / 2 - L.u(4), { size: T.FS.bodyL, align: 'center', weight: 500 }));
  const kind = d.danger ? 'danger' : 'primary';
  if (stacked) {
    const by = m.y + m.h - L.u(20) - 2 * bh - L.u(12);
    W.button(ctx, L, hits, { id: 'dialog:confirm', x: m.x + L.u(20), y: by, w: m.w - L.u(40), h: bh, label: d.confirmLabel || '好', kind });
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
  W.button(ctx, L, hits, { id: 'dialog:confirm', x: bx, y: by, w: bw, h: bh, label: d.confirmLabel || '好', kind });
}

function drawToast(ctx, L, t) {
  const maxTextW = L.contentW - L.u(40);
  const lines = W.wrap(ctx, t.text, maxTextW, T.FS.bodyL, 600).slice(0, 3);
  const widest = Math.max.apply(null, lines.map((ln) => W.measure(ctx, ln, T.FS.bodyL, 600)));
  const tw = Math.min(L.contentW, widest + L.u(40));
  const lh = Math.round(T.FS.bodyL * 1.4);
  const h = Math.max(L.u(46), lines.length * lh + L.u(18));
  const x = (L.W - tw) / 2;
  const y = L.H * 0.42;
  ctx.save();
  if (!T.isHC()) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
  }
  W.fillRR(ctx, x, y, tw, h, Math.min(h / 2, L.u(23)), T.isHC() ? '#000000' : 'rgba(36,33,30,0.92)');
  ctx.restore();
  lines.forEach((ln, i) => W.text(ctx, ln, L.W / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh + 1, { size: T.FS.bodyL, weight: 600, color: '#FFFFFF', align: 'center' }));
}

function drawAdStub(ctx, L, hits, a) {
  ctx.fillStyle = '#2A1634';
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add('adstub:block', 0, 0, L.W, L.H);
  const cy = L.H * 0.36;
  W.text(ctx, '广告位（测试）', L.cx, cy, { size: T.FS.hero, weight: 800, color: '#F2C94C', align: 'center', maxW: L.contentW, minSize: T.FS.title });
  W.text(ctx, a.kind === 'interstitial' ? '插屏广告' : '激励视频', L.cx, cy + L.u(40), { size: T.FS.bodyL, color: '#FBF6EC', align: 'center' });
  W.text(ctx, '还剩 ' + Math.max(0, Math.ceil(a.secondsLeft || 0)) + ' 秒', L.cx, cy + L.u(76), { size: T.FS.bodyL, color: '#FBF6EC', align: 'center' });
  const bw = Math.min(L.contentW, L.u(300));
  const bx = L.cx - bw / 2;
  const bh = T.btn(L, 52);
  const by = L.bottomEdge - L.bottomPad - bh * 2 - L.u(14);
  W.button(ctx, L, hits, { id: 'adstub:complete', x: bx, y: by, w: bw, h: bh, label: '模拟看完', kind: 'primary' });
  W.button(ctx, L, hits, { id: 'adstub:skip', x: bx, y: by + bh + L.u(14), w: bw, h: bh, label: '跳过（不给奖励）', kind: 'secondary' });
}

function drawPrivacy(ctx, L, hits) {
  const w = Math.min(L.contentW, L.u(T.isLarge() ? 340 : 330));
  const text = '为了在好友榜和群页上显示昵称，我们需要使用你的微信朋友关系。不同意也可以正常玩。';
  const lh = lineH();
  const lines = W.wrap(ctx, text, w - L.u(40), T.FS.bodyL, 500);
  const bh = T.btn(L, 52);
  const stacked = T.isLarge();
  const linkH = T.btn(L, 48);
  const h = L.u(26) + L.u(34) + lines.length * lh + L.u(14) + linkH + L.u(10) + (stacked ? 2 * bh + L.u(12) : bh) + L.u(20);
  const m = modalCard(ctx, L, hits, 'privacy:block', w, h);
  let y = m.y + L.u(30);
  W.text(ctx, '用户隐私保护提示', m.x + m.w / 2, y, { size: T.FS.title, weight: 800, align: 'center', maxW: w - L.u(40) });
  y += L.u(26);
  lines.forEach((ln, i) => W.text(ctx, ln, m.x + L.u(20), y + i * lh + lh / 2, { size: T.FS.bodyL, weight: 500 }));
  y += lines.length * lh + L.u(8);
  W.link(ctx, L, hits, { id: 'privacy:contract', x: m.x + m.w / 2, y: y + linkH / 2, align: 'center', label: '《用户隐私保护指引》', size: T.FS.body });
  if (stacked) {
    const by = m.y + m.h - L.u(20) - 2 * bh - L.u(12);
    W.button(ctx, L, hits, { id: 'privacy:agree', x: m.x + L.u(20), y: by, w: m.w - L.u(40), h: bh, label: '同意', kind: 'primary' });
    W.button(ctx, L, hits, { id: 'privacy:refuse', x: m.x + L.u(20), y: by + bh + L.u(12), w: m.w - L.u(40), h: bh, label: '拒绝', kind: 'secondary' });
    return;
  }
  const by = m.y + m.h - L.u(20) - bh;
  const bw = (m.w - L.u(40) - L.u(12)) / 2;
  W.button(ctx, L, hits, { id: 'privacy:refuse', x: m.x + L.u(20), y: by, w: bw, h: bh, label: '拒绝', kind: 'secondary' });
  W.button(ctx, L, hits, { id: 'privacy:agree', x: m.x + L.u(20) + bw + L.u(12), y: by, w: bw, h: bh, label: '同意', kind: 'primary' });
}

function draw(ctx, vm, L) {
  if (vm.display) T.applyDisplay(vm.display);
  const hits = new Hits();
  if (vm.dialog) drawDialog(ctx, L, hits, vm.dialog);
  if (vm.privacy) drawPrivacy(ctx, L, hits);
  if (vm.adStub) drawAdStub(ctx, L, hits, vm.adStub);
  if (vm.toast) drawToast(ctx, L, vm.toast);
  return hits.result();
}

module.exports = { draw };
