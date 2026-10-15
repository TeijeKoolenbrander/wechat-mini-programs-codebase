/**
 * 设置 sheet (spec 6.12), drawn over Home.
 * vm = Settings {muted, largeText, highContrast, privacy, friendScope, album}
 *   plus sheetScroll.
 * Hit ids: settings:sound, settings:largeText, settings:highContrast,
 *   settings:sources, settings:privacy, settings:openSetting (only drawn when
 *   the friend scope is not granted), settings:feedback (logic positions the
 *   native wx.createFeedbackButton over this rect), sheet:close, sheet:list.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

/** Passive status lines (spec 6.12): privacy, friend ranking, album. */
function statusText(vm) {
  const priv = vm.privacy === 'agreed' ? '已同意隐私指引' : vm.privacy === 'denied' ? '未同意隐私指引' : '尚未用到隐私功能';
  const fr = vm.friendScope === 'granted' ? '好友排行：已开启' : vm.friendScope === 'denied' ? '好友排行：未开启' : '好友排行：首次打开榜单时询问';
  const al = vm.album === 'granted' ? '相册：已允许' : vm.album === 'denied' ? '相册：未允许（保存图片时再问）' : null;
  return { priv, fr, al };
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  const rowH = L.rowH;
  const h = Math.min(L.H - L.navBottom, L.u(60) + rowH * 7 + L.u(60) + L.safeBottom);
  const s = W.sheet(ctx, L, hits, { h, title: '设置' });
  const top = s.top - L.u(6);
  const rect = { x: s.x, y: top, w: s.w, h: s.bottom - top };
  const lh = L.u(24) * (L.large ? 1.2 : 1);
  const st = statusText(vm);
  W.scrollRegion(ctx, hits, 'sheet:list', rect, vm.sheetScroll, (c, hh, y0) => {
    let y = y0;
    const line = () => {
      c.fillStyle = C.line;
      c.fillRect(s.x, y, s.w, 1);
    };
    const row = (label, valueText, id, toggleOn) => {
      W.text(c, label, s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600, maxW: s.w - L.u(110) });
      if (toggleOn != null) {
        const tw = L.u(52) * L.k;
        const th = L.u(28) * L.k;
        W.toggle(c, s.x + s.w - tw, y + rowH / 2 - th / 2, tw, th, toggleOn);
        W.text(c, toggleOn ? '开' : '关', s.x + s.w - tw - L.u(10), y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
      } else if (valueText) {
        W.text(c, valueText, s.x + s.w, y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
      }
      hh.add(id, s.x, y, s.w, rowH);
      y += rowH;
      line();
    };
    row('声音（含震动）', null, 'settings:sound', !vm.muted);
    row('大字模式', null, 'settings:largeText', !!vm.largeText);
    row('高对比度', null, 'settings:highContrast', !!vm.highContrast);
    row('数据来源', '查看 ›', 'settings:sources');
    row('用户隐私保护指引', '查看 ›', 'settings:privacy');

    // passive status: privacy, friend ranking (+ 去设置), album
    y += L.u(6);
    y += W.paragraph(c, st.priv, s.x, y, s.w, lh, { size: T.FS.body, color: C.sub, maxLines: 2 });
    const frTop = y;
    const needBtn = vm.friendScope !== 'granted';
    const bw = L.u(92) * (L.large ? 1.25 : 1);
    const frH = Math.max(needBtn ? T.MIN_TAP : 0, W.lineCount(c, st.fr, s.w - (needBtn ? bw + L.u(8) : 0), T.FS.body, 400, false, 2) * lh);
    W.paragraph(c, st.fr, s.x, frTop + (frH - W.lineCount(c, st.fr, s.w - (needBtn ? bw + L.u(8) : 0), T.FS.body, 400, false, 2) * lh) / 2, s.w - (needBtn ? bw + L.u(8) : 0), lh, { size: T.FS.body, color: vm.friendScope === 'granted' ? C.good : C.sub, weight: vm.friendScope === 'granted' ? 700 : 400, maxLines: 2 });
    if (needBtn) W.button(c, L, hh, { id: 'settings:openSetting', x: s.x + s.w - bw, y: frTop, w: bw, h: T.MIN_TAP, label: '去设置', size: T.FS.body });
    y += frH;
    if (st.al) y += W.paragraph(c, st.al, s.x, y, s.w, lh, { size: T.FS.body, color: C.sub, maxLines: 2 });
    y += L.u(8);
    line();
    W.text(c, '联系我们 / 反馈', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600 });
    W.text(c, '›', s.x + s.w, y + rowH / 2, { size: T.FS.bodyL, color: C.sub, align: 'right' });
    hh.add('settings:feedback', s.x, y, s.w, rowH);
    y += rowH;
    return y - y0 + L.u(8);
  });
  return hits.result();
}

module.exports = { draw, statusText };
