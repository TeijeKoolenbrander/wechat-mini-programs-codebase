/**
 * Overlays drawn on top of any screen or sheet, after its own draw():
 * confirm dialog, toast, stub ad overlay, own privacy dialog (fallback for
 * onNeedPrivacyAuthorization). Concatenate the returned hit areas after the
 * screen's (later areas win).
 *
 * vm: { dialog?, toast?, adStub?, privacy? } (all optional)
 *   dialog:  {title?, text, confirmLabel, cancelLabel?, danger?}
 *            hit ids dialog:confirm, dialog:cancel, dialog:block
 *   toast:   {text}  (no hit areas; logic removes it after ~2s)
 *   adStub:  {kind: 'rewarded'|'interstitial', secondsLeft}
 *            hit ids adstub:complete, adstub:skip
 *   privacy: {}  hit ids privacy:agree, privacy:refuse, privacy:contract
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function modalCard(ctx, L, hits, blockId, w, h) {
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add(blockId, 0, 0, L.W, L.H);
  const x = (L.W - w) / 2;
  const y = Math.max(L.navBottom, (L.H - h) / 2 - L.u(20));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = T.MODE.highContrast ? 0 : 18;
  ctx.shadowOffsetY = 4;
  W.fillRR(ctx, x, y, w, h, L.u(16), C.sheet);
  ctx.restore();
  W.strokeRR(ctx, x, y, w, h, L.u(16), T.MODE.highContrast ? C.ink : C.lineStrong, 2);
  hits.add(blockId + ':card', x, y, w, h);
  return { x, y, w, h };
}

function drawDialog(ctx, L, hits, d) {
  const w = Math.min(L.contentW, L.u(320) * (L.large ? 1.1 : 1));
  const inner = w - L.u(40);
  const lh = L.u(27) * (L.large ? 1.2 : 1);
  const lines = W.wrap(ctx, d.text, inner, T.FS.bodyL, 500, false);
  const titleH = d.title ? L.u(34) * (L.large ? 1.2 : 1) : 0;
  const bh = L.btnH;
  const stacked = !!d.cancelLabel && L.large;
  const h = L.u(28) + titleH + lines.length * lh + L.u(24) + bh * (stacked ? 2 : 1) + (stacked ? L.u(10) : 0) + L.u(20);
  const m = modalCard(ctx, L, hits, 'dialog:block', w, h);
  let y = m.y + L.u(28);
  if (d.title) {
    W.text(ctx, d.title, m.x + m.w / 2, y, { size: T.FS.title, weight: 800, serif: true, align: 'center', maxW: inner });
    y += titleH;
  }
  lines.forEach((ln, i) => W.text(ctx, ln, m.x + m.w / 2, y + i * lh + L.u(8), { size: T.FS.bodyL, align: 'center', weight: 500 }));
  const by = m.y + m.h - L.u(20) - bh;
  if (stacked) {
    W.button(ctx, L, hits, { id: 'dialog:confirm', x: m.x + L.u(20), y: by - bh - L.u(10), w: inner, h: bh, label: d.confirmLabel || '好', kind: d.danger ? 'danger' : 'primary' });
    W.button(ctx, L, hits, { id: 'dialog:cancel', x: m.x + L.u(20), y: by, w: inner, h: bh, label: d.cancelLabel, kind: 'secondary' });
    return;
  }
  const bw = d.cancelLabel ? (m.w - L.u(40) - L.u(12)) / 2 : m.w - L.u(40);
  let bx = m.x + L.u(20);
  if (d.cancelLabel) {
    W.button(ctx, L, hits, { id: 'dialog:cancel', x: bx, y: by, w: bw, h: bh, label: d.cancelLabel, kind: 'secondary' });
    bx += bw + L.u(12);
  }
  W.button(ctx, L, hits, { id: 'dialog:confirm', x: bx, y: by, w: bw, h: bh, label: d.confirmLabel || '好', kind: d.danger ? 'danger' : 'primary' });
}

function drawToast(ctx, L, t) {
  ctx.font = W.font(T.FS.bodyL, 600, false);
  const tw = Math.min(L.contentW, ctx.measureText(t.text).width + L.u(40));
  const h = L.u(46) * (L.large ? 1.2 : 1);
  const x = (L.W - tw) / 2;
  const y = L.H * 0.42;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = T.MODE.highContrast ? 0 : 10;
  W.fillRR(ctx, x, y, tw, h, h / 2, C.toastBg);
  ctx.restore();
  W.text(ctx, t.text, L.W / 2, y + h / 2 + 1, { size: T.FS.bodyL, weight: 600, color: '#FFFFFF', align: 'center', maxW: tw - L.u(24) });
}

function drawAdStub(ctx, L, hits, a) {
  ctx.fillStyle = '#16181C';
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add('adstub:block', 0, 0, L.W, L.H);
  const cy = L.H * 0.36;
  W.text(ctx, '广告位（测试）', L.cx, cy, { size: T.FS.hero, weight: 800, serif: true, color: '#F2E6CC', align: 'center' });
  W.text(ctx, a.kind === 'interstitial' ? '插屏广告' : '激励视频', L.cx, cy + L.u(40), { size: T.FS.bodyL, color: '#F2E6CC', align: 'center' });
  W.text(ctx, '还剩 ' + Math.max(0, Math.ceil(a.secondsLeft || 0)) + ' 秒', L.cx, cy + L.u(76), { size: T.FS.bodyL, color: '#F2E6CC', align: 'center' });
  const bw = Math.min(L.contentW, L.u(300));
  const bx = L.cx - bw / 2;
  const by = L.bottomEdge - L.bottomPad - L.btnH - L.btnH2 - L.u(28);
  W.button(ctx, L, hits, { id: 'adstub:complete', x: bx, y: by, w: bw, h: L.btnH, label: '模拟看完', kind: 'primary' });
  W.button(ctx, L, hits, { id: 'adstub:skip', x: bx, y: by + L.btnH + L.u(24), w: bw, h: L.btnH2, label: '跳过（不给奖励）', kind: 'secondary' });
}

function drawPrivacy(ctx, L, hits) {
  const w = Math.min(L.contentW, L.u(330) * (L.large ? 1.1 : 1));
  const text = '为了在好友榜和群榜上显示你的成绩，我们需要使用你的微信朋友关系。';
  const lh = L.u(27) * (L.large ? 1.2 : 1);
  const lines = W.wrap(ctx, text, w - L.u(40), T.FS.bodyL, 500, false);
  const bh = L.btnH;
  const h = L.u(26) + L.u(34) + lines.length * lh + L.u(14) + T.MIN_TAP + L.u(10) + bh + L.u(20);
  const m = modalCard(ctx, L, hits, 'privacy:block', w, h);
  let y = m.y + L.u(30);
  W.text(ctx, '用户隐私保护提示', m.x + m.w / 2, y, { size: T.FS.title, weight: 800, serif: true, align: 'center', maxW: w - L.u(32) });
  y += L.u(26);
  lines.forEach((ln, i) => W.text(ctx, ln, m.x + L.u(20), y + i * lh + L.u(8), { size: T.FS.bodyL, weight: 500 }));
  y += lines.length * lh + L.u(8);
  W.link(ctx, L, hits, { id: 'privacy:contract', x: m.x + m.w / 2, y: y + L.u(18), align: 'center', label: '《用户隐私保护指引》', color: C.seal, underline: true, size: T.FS.body });
  const by = m.y + m.h - L.u(20) - bh;
  const bw = (m.w - L.u(40) - L.u(12)) / 2;
  W.button(ctx, L, hits, { id: 'privacy:refuse', x: m.x + L.u(20), y: by, w: bw, h: bh, label: '拒绝', kind: 'secondary' });
  W.button(ctx, L, hits, { id: 'privacy:agree', x: m.x + L.u(20) + bw + L.u(12), y: by, w: bw, h: bh, label: '同意', kind: 'primary' });
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  if (vm.dialog) drawDialog(ctx, L, hits, vm.dialog);
  if (vm.privacy) drawPrivacy(ctx, L, hits);
  if (vm.adStub) drawAdStub(ctx, L, hits, vm.adStub);
  if (vm.toast) drawToast(ctx, L, vm.toast);
  return hits.result();
}

module.exports = { draw };
