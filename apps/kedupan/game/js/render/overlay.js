/**
 * Overlays drawn on top of any screen, after its own draw(): confirm dialog,
 * toast, stub ad overlay, own privacy dialog (fallback for
 * onNeedPrivacyAuthorization). Concatenate the returned hit areas after the
 * screen's (later areas win).
 *
 * vm: { display?, dialog?, toast?, adStub?, privacy? } (all optional)
 *   dialog:  {title?, text, confirmLabel, cancelLabel?, danger?}
 *   toast:   {text}
 *   adStub:  {kind: 'rewarded'|'interstitial', secondsLeft:number}
 *   privacy: {}
 */

const T = require('./theme');
const W = require('./widgets');
const K = require('./chrome');
const { Hits } = require('./layout');
const C = T.C;

function modalCard(ctx, L, hits, blockId, w, h) {
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add(blockId, 0, 0, L.W, L.H);
  const x = (L.W - w) / 2;
  const y = Math.max(L.navBottom, (L.H - h) / 2 - L.u(20));
  ctx.save();
  if (!T.MODE.hc) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
  }
  W.fillRR(ctx, x, y, w, h, L.u(18), C.bg);
  ctx.restore();
  W.strokeRR(ctx, x, y, w, h, L.u(18), T.MODE.hc ? C.ink : C.lineStrong, T.MODE.hc ? 3 : 2);
  hits.add(blockId + ':card', x, y, w, h);
  return { x, y, w, h };
}

function drawDialog(ctx, L, hits, d) {
  const w = Math.min(L.contentW, L.u(330));
  const inner = w - L.u(40);
  const bs = W.fs(L, 'bodyL');
  const lines = W.wrap(ctx, d.text, inner, bs, 500);
  const bh = K.btnH(L);
  const titleH = d.title ? L.u(34) : 0;
  const h = L.u(26) + titleH + lines.length * bs * 1.5 + L.u(22) + bh + L.u(20);
  const m = modalCard(ctx, L, hits, 'dialog:block', w, h);
  let y = m.y + L.u(28);
  if (d.title) {
    W.text(ctx, d.title, m.x + m.w / 2, y, { size: W.fs(L, 'title'), weight: 800, align: 'center' });
    y += L.u(34);
  }
  lines.forEach((ln, i) => W.text(ctx, ln, m.x + m.w / 2, y + i * bs * 1.5 + bs * 0.75, { size: bs, align: 'center', weight: 500 }));
  const by = m.y + m.h - L.u(20) - bh;
  const bw = d.cancelLabel ? (m.w - L.u(40) - L.u(12)) / 2 : m.w - L.u(40);
  let bx = m.x + L.u(20);
  if (d.cancelLabel) {
    W.button(ctx, L, hits, { id: 'dialog:cancel', x: bx, y: by, w: bw, h: bh, label: d.cancelLabel, kind: 'secondary' });
    bx += bw + L.u(12);
  }
  W.button(ctx, L, hits, { id: 'dialog:confirm', x: bx, y: by, w: bw, h: bh, label: d.confirmLabel || '好', kind: d.danger ? 'danger' : 'primary' });
}

function drawToast(ctx, L, t) {
  const bs = W.fs(L, 'bodyL');
  ctx.font = W.font(bs, 600);
  const tw = Math.min(L.contentW, ctx.measureText(t.text).width + L.u(44));
  const h = bs * 2.4;
  const x = (L.W - tw) / 2;
  const y = L.H * 0.42;
  ctx.save();
  if (!T.MODE.hc) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
  }
  W.fillRR(ctx, x, y, tw, h, h / 2, 'rgba(36,33,30,0.94)');
  ctx.restore();
  W.text(ctx, t.text, L.W / 2, y + h / 2 + 1, { size: bs, weight: 600, color: '#FFFFFF', align: 'center', maxW: tw - L.u(24) });
}

function drawAdStub(ctx, L, hits, a) {
  ctx.fillStyle = '#1B1815';
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add('adstub:block', 0, 0, L.W, L.H);
  const cy = L.H * 0.34;
  W.text(ctx, '广告位（测试）', L.cx, cy, { size: W.fs(L, 'title') * 1.3, weight: 800, color: '#F2C94C', align: 'center' });
  W.text(ctx, a.kind === 'interstitial' ? '插屏广告' : '激励视频', L.cx, cy + L.u(40), { size: W.fs(L, 'bodyL'), color: '#FBF6EC', align: 'center' });
  W.text(ctx, '还剩 ' + Math.max(0, Math.ceil(a.secondsLeft || 0)) + ' 秒', L.cx, cy + L.u(76), { size: W.fs(L, 'bodyL'), color: '#FBF6EC', align: 'center' });
  const bh = K.btnH(L);
  const bw = Math.min(L.contentW, L.u(300));
  const bx = L.cx - bw / 2;
  const by = L.bottomEdge - L.bottomPad - bh * 2 - L.u(14);
  W.button(ctx, L, hits, { id: 'adstub:complete', x: bx, y: by, w: bw, h: bh, label: '模拟看完', kind: 'primary' });
  W.button(ctx, L, hits, { id: 'adstub:skip', x: bx, y: by + bh + L.u(14), w: bw, h: bh, label: '跳过（不给奖励）', kind: 'secondary' });
}

function drawPrivacy(ctx, L, hits) {
  const w = Math.min(L.contentW, L.u(340));
  const bs = W.fs(L, 'bodyL');
  const text = '为了显示群友和好友的昵称，我们需要使用你的微信朋友关系。不同意也能正常玩。';
  const lines = W.wrap(ctx, text, w - L.u(40), bs, 500);
  const bh = K.btnH(L);
  const h = L.u(26) + L.u(34) + lines.length * bs * 1.5 + L.u(10) + T.MIN_TAP + L.u(8) + bh + L.u(20);
  const m = modalCard(ctx, L, hits, 'privacy:block', w, h);
  let y = m.y + L.u(30);
  W.text(ctx, '用户隐私保护提示', m.x + m.w / 2, y, { size: W.fs(L, 'title'), weight: 800, align: 'center' });
  y += L.u(26);
  lines.forEach((ln, i) => W.text(ctx, ln, m.x + L.u(20), y + i * bs * 1.5 + bs * 0.75, { size: bs, weight: 500 }));
  y += lines.length * bs * 1.5 + L.u(8);
  W.link(ctx, L, hits, { id: 'privacy:contract', x: m.x + m.w / 2, y: y + T.MIN_TAP / 2, align: 'center', label: '《用户隐私保护指引》', color: C.youText, underline: true, size: W.fs(L, 'body') });
  const by = m.y + m.h - L.u(20) - bh;
  const bw = (m.w - L.u(40) - L.u(12)) / 2;
  W.button(ctx, L, hits, { id: 'privacy:refuse', x: m.x + L.u(20), y: by, w: bw, h: bh, label: '拒绝', kind: 'secondary' });
  W.button(ctx, L, hits, { id: 'privacy:agree', x: m.x + L.u(20) + bw + L.u(12), y: by, w: bw, h: bh, label: '同意', kind: 'primary' });
}

function draw(ctx, vm, L) {
  const hits = new Hits();
  T.applyDisplay(vm && vm.display);
  if (vm.dialog) drawDialog(ctx, L, hits, vm.dialog);
  if (vm.privacy) drawPrivacy(ctx, L, hits);
  if (vm.adStub) drawAdStub(ctx, L, hits, vm.adStub);
  if (vm.toast) drawToast(ctx, L, vm.toast);
  return hits.result();
}

module.exports = { draw };
