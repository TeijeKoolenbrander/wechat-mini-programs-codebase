/**
 * 设置 sheet (spec 6.1, 6.11). Rows: 声音, 大字模式, 高对比度, 好友排行 status (+ 去设置), 用户隐私保护指引; 联系我们/反馈 is pinned
 * at the bottom and never scrolls (logic places wx.createFeedbackButton over `settings:feedback`).
 * vm.settings = {muted, largeText, highContrast, privacy, friendScope, aigcNote?}; vm.sheetScroll. aigcNote (logic) is a caption line pinned
 * above the feedback row. Rows wrap instead of truncating (the 好友排行 row puts 去设置 on its own line when the label does not fit);
 * when the rows do not fit the list is cut at a row boundary and scrolls.
 * Hit ids: settings:sound, settings:largeText, settings:highContrast, settings:openSetting, settings:rules, settings:terms, settings:privacy, settings:feedback,
 * sheet:close, sheet:list, sheet:body.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function toggle(ctx, L, x, y, on) {
  const w = L.u(52);
  const h = L.u(30);
  W.fillRR(ctx, x, y, w, h, h / 2, on ? C.primary : T.isHC() ? C.tile : 'rgba(36,33,30,0.18)');
  if (T.isHC()) W.strokeRR(ctx, x, y, w, h, h / 2, C.ink, 2.5);
  ctx.beginPath();
  ctx.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = on ? C.primaryInk : T.isHC() ? C.ink : '#FFFFFF';
  ctx.fill();
}

function draw(ctx, L, hits, vm) {
  const st = vm.settings || {};
  const rowH = Math.max(L.u(58), T.minBtn() + L.u(8));
  const sheetW = Math.min(L.W, 560);
  const inW = sheetW - 2 * L.pad;
  const granted = st.friendScope === 'granted';

  const rows = [
    { id: 'settings:sound', label: '声音', on: !st.muted, state: !st.muted ? '开' : '关' },
    { id: 'settings:largeText', label: '大字模式', on: !!st.largeText, state: st.largeText ? '开' : '关' },
    { id: 'settings:highContrast', label: '高对比度', on: !!st.highContrast, state: st.highContrast ? '开' : '关' },
    { friend: true },
    { id: 'settings:privacy', label: '用户隐私保护指引', arrow: true },
    { id: 'settings:rules', label: '发言规则', arrow: true },
    { id: 'settings:terms', label: '《用户协议》', arrow: true },
  ];
  const innerW = sheetW - 2 * L.pad;
  const friendLabel = granted ? '好友排行：已开启' : '好友排行：未开启';
  const friendInline = granted || W.measure(ctx, friendLabel, T.FS.bodyL, 600) <= innerW - L.u(28) - L.u(94);
  const friendH = friendInline ? rowH : rowH + T.minBtn() + L.u(2);
  const blocks = rows.map((r) => ({
    h: r.friend ? friendH : rowH,
    draw: (c, x, y, w) => {
      const bh = (r.friend ? friendH : rowH) - L.u(6);
      W.fillRR(c, x, y, w, bh, L.u(12), C.tile);
      W.strokeRR(c, x, y, w, bh, L.u(12), C.line, T.isHC() ? 2 : 1);
      const cy = y + (rowH - L.u(6)) / 2;
      if (r.friend) {
        W.text(c, friendLabel, x + L.u(14), cy, { size: T.FS.bodyL, weight: 600 });
        if (!granted) {
          const by = friendInline ? y + (rowH - L.u(6) - T.minBtn()) / 2 : y + rowH - L.u(10);
          W.button(c, L, hits, { id: 'settings:openSetting', x: x + w - L.u(94), y: by, w: L.u(86), h: T.minBtn(), label: '去设置', size: T.FS.body, kind: 'secondary' });
        }
      } else if (r.arrow) {
        W.text(c, r.label, x + L.u(14), cy, { size: T.FS.bodyL, weight: 600, maxW: w - L.u(60) });
        W.text(c, '›', x + w - L.u(18), cy, { size: T.FS.title, weight: 700, color: C.sub, align: 'center' });
        hits.add(r.id, x, y, w, rowH - L.u(6));
      } else {
        W.text(c, r.label, x + L.u(14), cy, { size: T.FS.bodyL, weight: 600 });
        W.text(c, r.state, x + w - L.u(52) - L.u(24), cy, { size: T.FS.body, weight: 800, color: r.on ? C.primary : C.sub, align: 'right' });
        toggle(c, L, x + w - L.u(52) - L.u(10), cy - L.u(15), r.on);
        hits.add(r.id, x, y, w, rowH - L.u(6));
      }
    },
  }));
  const fbH = Math.max(T.btn(L, 52), T.MIN_TAP);
  const noteLh = Math.round(T.FS.body * 1.4);
  const noteLines = st.aigcNote ? W.wrapBalanced(ctx, st.aigcNote, innerW, T.FS.body, 500) : [];
  const noteH = noteLines.length ? noteLines.length * noteLh + L.u(8) : 0;
  const total = L.u(70) + blocks.reduce((n, b) => n + b.h, 0) + noteH + fbH + L.u(16) + L.bottomPad;
  const s = W.sheet(ctx, L, hits, { h: Math.min(total, L.H - L.navBottom), title: '设置' });
  const area = { x: s.x, y: s.top, w: s.w, h: s.bottom - s.top - fbH - L.u(10) - noteH };
  W.stack(ctx, L, hits, area, blocks, vm.sheetScroll || 0, 'sheet:list', 0);
  // pinned AIGC note (caption style)
  noteLines.forEach((ln, i) => W.text(ctx, ln, s.x, s.bottom - fbH - L.u(10) - noteH + L.u(4) + noteLh * i + noteLh / 2, { size: T.FS.body, weight: 500, color: C.sub }));
  // pinned feedback row
  const fy = s.bottom - fbH;
  W.fillRR(ctx, s.x, fy, s.w, fbH, L.u(12), C.tile);
  W.strokeRR(ctx, s.x, fy, s.w, fbH, L.u(12), C.lineStrong, T.isHC() ? 2 : 1.5);
  W.text(ctx, '联系我们 / 反馈', s.x + s.w / 2, fy + fbH / 2, { size: T.FS.bodyL, weight: 700, align: 'center' });
  hits.add('settings:feedback', s.x, fy, s.w, fbH);
  void inW;
}

module.exports = { draw };
