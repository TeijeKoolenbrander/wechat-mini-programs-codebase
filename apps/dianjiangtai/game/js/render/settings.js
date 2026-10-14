/**
 * 隐私与设置 sheet (spec 8.1, 11.6 status line). Drawn over Home.
 * vm: Home view model ({muted, settings:{friendBoardEnabled}}).
 * Hit ids: settings:sound, settings:openSetting (only when friend board is off),
 * settings:privacy, settings:feedback (logic positions the native feedback
 * button over this rect), sheet:close.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

function toggle(ctx, x, y, w, h, on) {
  W.fillRR(ctx, x, y, w, h, h / 2, on ? C.good : 'rgba(42,33,26,0.28)');
  ctx.beginPath();
  ctx.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function drawInto(ctx, vm, L, hits) {
  const rowH = L.u(56);
  const h = L.u(60) + rowH * 4 + L.u(24) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h, title: '隐私与设置' });
  let y = s.top;
  const line = (yy) => {
    ctx.fillStyle = C.line;
    ctx.fillRect(s.x, yy, s.w, 1);
  };

  // sound
  W.iconSpeaker(ctx, s.x + L.u(12), y + rowH / 2, L.u(22), C.ink, vm.muted);
  W.text(ctx, '声音', s.x + L.u(36), y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, vm.muted ? '已静音' : '已开启', s.x + s.w - L.u(72), y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
  toggle(ctx, s.x + s.w - L.u(56), y + rowH / 2 - L.u(14), L.u(52), L.u(28), !vm.muted);
  hits.add('settings:sound', s.x, y, s.w, rowH);
  y += rowH;
  line(y);

  // friend ranking status (passive line)
  const on = !!(vm.settings && vm.settings.friendBoardEnabled);
  W.text(ctx, '好友排行：' + (on ? '已开启' : '未开启'), s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600, color: on ? C.good : C.ink });
  if (!on) {
    W.button(ctx, L, hits, { id: 'settings:openSetting', x: s.x + s.w - L.u(96), y: y + (rowH - L.u(44)) / 2, w: L.u(96), h: L.u(44), label: '去设置', size: T.FS.body });
  }
  y += rowH;
  line(y);

  // privacy guide
  W.text(ctx, '用户隐私保护指引', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, '查看 ›', s.x + s.w, y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
  hits.add('settings:privacy', s.x, y, s.w, rowH);
  y += rowH;
  line(y);

  // feedback (native createFeedbackButton overlays this rect)
  W.text(ctx, '联系我们 / 反馈', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, '›', s.x + s.w, y + rowH / 2, { size: T.FS.bodyL, color: C.sub, align: 'right' });
  hits.add('settings:feedback', s.x, y, s.w, rowH);
}

function draw(ctx, vm, L) {
  const hits = new Hits();
  drawInto(ctx, vm, L, hits);
  return hits.result();
}

module.exports = { draw, drawInto };
