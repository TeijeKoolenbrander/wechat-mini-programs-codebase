/**
 * 设置 sheet (spec 8.1, 8.11, 11.6): sound, 大字模式, 高对比度, friend-data
 * status line, 用户隐私保护指引, 联系我们/反馈. Drawn over Home.
 * vm: Home view model ({muted, settings:{largeText, highContrast,
 * friendBoardEnabled}}) + sheetScroll.
 * Hit ids: settings:sound, settings:largeText, settings:highContrast,
 * settings:openSetting (only when the friend board is off), settings:privacy,
 * settings:feedback (logic positions the native feedback button over this
 * rect), sheet:close, sheet:list (scroll area).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

function toggle(ctx, x, y, w, h, on) {
  W.fillRR(ctx, x, y, w, h, h / 2, on ? C.good : 'rgba(30,27,24,0.30)');
  if (T.METRICS.hc) W.strokeRR(ctx, x, y, w, h, h / 2, C.ink, 2);
  ctx.beginPath();
  ctx.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function drawInto(ctx, vm, L, hits) {
  const large = T.METRICS.large;
  const rowH = L.u(large ? 68 : 58);
  const set = vm.settings || {};
  const rows = 6;
  const wantH = L.u(64) + rowH * rows + L.u(16) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h: Math.min(wantH, L.H - L.navBottom), title: '设置' });
  const view = { x: s.x - 2, y: s.top - L.u(8), w: s.w + 4, h: s.bottom - (s.top - L.u(8)) };
  const contentH = rowH * rows;
  const maxScroll = Math.max(0, contentH - view.h);
  const off = Math.max(0, Math.min(vm.sheetScroll || 0, maxScroll));
  hits.scrollMax['sheet:list'] = maxScroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  ctx.translate(0, -off);
  if (maxScroll > 0) hits.add('sheet:list', view.x, view.y, view.w, view.h);
  hits.beginScroll(view, -off);
  let y = view.y;
  const line = () => {
    ctx.fillStyle = C.line;
    ctx.fillRect(s.x, y + rowH - 1, s.w, 1);
  };
  const tw = L.u(52);
  const th = L.u(30);

  // sound
  W.iconSpeaker(ctx, s.x + L.u(12), y + rowH / 2, L.u(22), C.ink, vm.muted);
  W.text(ctx, '声音', s.x + L.u(38), y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, vm.muted ? '已关闭' : '已开启', s.x + s.w - tw - L.u(12), y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
  toggle(ctx, s.x + s.w - tw, y + rowH / 2 - th / 2, tw, th, !vm.muted);
  hits.add('settings:sound', s.x, y, s.w, rowH);
  line();
  y += rowH;

  // large text
  W.text(ctx, '大字模式', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, set.largeText ? '已开启' : '已关闭', s.x + s.w - tw - L.u(12), y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
  toggle(ctx, s.x + s.w - tw, y + rowH / 2 - th / 2, tw, th, !!set.largeText);
  hits.add('settings:largeText', s.x, y, s.w, rowH);
  line();
  y += rowH;

  // high contrast
  W.text(ctx, '高对比度', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, set.highContrast ? '已开启' : '已关闭', s.x + s.w - tw - L.u(12), y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
  toggle(ctx, s.x + s.w - tw, y + rowH / 2 - th / 2, tw, th, !!set.highContrast);
  hits.add('settings:highContrast', s.x, y, s.w, rowH);
  line();
  y += rowH;

  // friend ranking status (passive line, with a way to fix it)
  const on = !!set.friendBoardEnabled;
  W.text(ctx, '好友排行：' + (on ? '已开启' : '未开启'), s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600, color: on ? C.good : C.ink });
  if (!on) {
    const bw = L.u(large ? 110 : 96);
    W.button(ctx, L, hits, { id: 'settings:openSetting', x: s.x + s.w - bw, y: y + (rowH - L.u(large ? 52 : 44)) / 2, w: bw, h: L.u(large ? 52 : 44), label: '去设置', size: T.FS.body });
  }
  line();
  y += rowH;

  // privacy guide
  W.text(ctx, '用户隐私保护指引', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, '查看', s.x + s.w - L.u(22), y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
  W.iconChevron(ctx, s.x + s.w - L.u(8), y + rowH / 2, L.u(12), C.sub);
  hits.add('settings:privacy', s.x, y, s.w, rowH);
  line();
  y += rowH;

  // feedback (native createFeedbackButton overlays this rect)
  W.text(ctx, '联系我们 / 反馈', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
  W.iconChevron(ctx, s.x + s.w - L.u(8), y + rowH / 2, L.u(12), C.sub);
  hits.add('settings:feedback', s.x, y, s.w, rowH);

  hits.endScroll();
  ctx.restore();
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  drawInto(ctx, vm || {}, L, hits);
  return hits.result();
}

module.exports = { draw, drawInto };
