/**
 * 隐私与设置 sheet (spec 8.1, 8.10, 11.6 status line). Drawn over Home.
 * vm: Home view model ({muted, musicOn, sfxOn, settings:{friendBoardEnabled, album?}, display,
 * sheetScroll}), or the spec 13 Settings model ({muted, largeText,
 * highContrast, privacy, friendScope, album}) when drawn on its own.
 *
 * Rows: 音乐 toggle, 音效 toggle; 显示: 大字模式 toggle, 高对比度 toggle; 好友排行 status
 * (+ 去设置 when off); 相册权限 status (only when the album scope was
 * refused); 用户隐私保护指引; and, pinned under the scroll area, 联系我们 / 反馈.
 * The toggles show the mode that is actually being rendered.
 *
 * Hit ids: settings:music, settings:sfx (settings:sound is retired from this sheet; the controller still accepts it), settings:largeText, settings:highContrast,
 * settings:openSetting (only when friend board is off), settings:openAlbum
 * (only when album is 'denied'; map it to wx.openSetting), settings:privacy,
 * settings:feedback (logic positions the native feedback button over this
 * rect; it is pinned, never scrolled), sheet:close, sheet:list (scroll area).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

function toggle(ctx, L, x, y, on) {
  const w = L.u(T.isLarge() ? 72 : 64);
  const h = L.u(T.isLarge() ? 38 : 34);
  W.fillRR(ctx, x, y, w, h, h / 2, on ? C.good : T.isHC() ? C.sub : 'rgba(42,33,26,0.30)');
  ctx.beginPath();
  ctx.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  // state glyph on the empty side of the track (never colour alone)
  W.text(ctx, on ? '开' : '关', on ? x + h * 0.48 : x + w - h * 0.48, y + h / 2 + 1, { size: T.FS.body, weight: 800, color: '#FFFFFF', align: 'center', minSize: 12 });
  return { w, h };
}

function drawInto(ctx, vm, L, hits) {
  const large = T.isLarge();
  const rowH = Math.max(L.u(56), T.btn(L, 56)) * (large ? 1.1 : 1);
  const album = vm.settings && vm.settings.album != null ? vm.settings.album : vm.album;
  const showAlbum = album === 'denied';
  const friendOn = vm.settings && vm.settings.friendBoardEnabled != null ? !!vm.settings.friendBoardEnabled : vm.friendScope === 'granted' && vm.privacy === 'agreed';
  const sectionH = L.u(large ? 40 : 34);
  const rows = 2 + 2 + 1 + (showAlbum ? 1 : 0) + 1;
  const contentH = rows * rowH + sectionH + L.u(8);
  const footH = rowH;
  const wanted = L.u(60) + contentH + footH + L.u(12) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h: Math.min(wanted, L.H - L.navBottom), title: '隐私与设置' });
  const area = { x: s.x, y: s.top - L.u(6), w: s.w, h: s.bottom - footH - (s.top - L.u(6)) };
  const line = (yy) => {
    ctx.fillStyle = C.line;
    ctx.fillRect(s.x, yy, s.w, T.isHC() ? 2 : 1);
  };
  const tx = s.x + s.w - L.u(T.isLarge() ? 72 : 64);

  W.scrollBody(ctx, hits, area, contentH, vm.sheetScroll, 'sheet:list', () => {
    let y = area.y;

    // sound: 音乐 and 音效 are separate switches (CTO-D3); either off is silent at once
    const musicOn = vm.musicOn != null ? !!vm.musicOn : vm.settings && vm.settings.musicOn != null ? !!vm.settings.musicOn : !vm.muted;
    const sfxOn = vm.sfxOn != null ? !!vm.sfxOn : vm.settings && vm.settings.sfxOn != null ? !!vm.settings.sfxOn : !vm.muted;
    [
      ['settings:music', '音乐', musicOn],
      ['settings:sfx', '音效', sfxOn],
    ].forEach(([id, label, on]) => {
      W.text(ctx, label, s.x + L.u(12), y + rowH / 2, { size: T.FS.bodyL, weight: 600, maxW: tx - s.x - L.u(24) });
      toggle(ctx, L, tx, y + (rowH - L.u(large ? 38 : 34)) / 2, on);
      hits.add(id, s.x, y, s.w, rowH);
      y += rowH;
      line(y);
    });

    // 显示
    W.text(ctx, '显示', s.x, y + sectionH / 2 + L.u(4), { size: T.FS.body, weight: 800, color: C.sub });
    y += sectionH;

    [
      ['settings:largeText', '大字模式', T.isLarge()],
      ['settings:highContrast', '高对比度', T.isHC()],
    ].forEach(([id, label, on]) => {
      W.text(ctx, label, s.x + L.u(12), y + rowH / 2, { size: T.FS.bodyL, weight: 600, maxW: tx - s.x - L.u(24) });
      toggle(ctx, L, tx, y + (rowH - L.u(large ? 38 : 34)) / 2, on);
      hits.add(id, s.x, y, s.w, rowH);
      y += rowH;
      line(y);
    });

    // friend ranking status (passive line)
    const bw = L.u(large ? 104 : 96);
    W.text(ctx, '好友排行：' + (friendOn ? '已开启' : '未开启'), s.x, y + rowH / 2, { size: large ? T.FS.body : T.FS.bodyL, weight: 600, color: friendOn ? C.good : C.ink, maxW: s.w - bw - L.u(12) });
    if (!friendOn) {
      W.button(ctx, L, hits, { id: 'settings:openSetting', x: s.x + s.w - bw, y: y + (rowH - T.btn(L, 44)) / 2, w: bw, h: T.btn(L, 44), label: '去设置', size: T.FS.body });
    }
    y += rowH;
    line(y);

    if (showAlbum) {
      W.text(ctx, '相册权限：未开启', s.x, y + rowH / 2, { size: large ? T.FS.body : T.FS.bodyL, weight: 600, maxW: s.w - bw - L.u(12) });
      W.button(ctx, L, hits, { id: 'settings:openAlbum', x: s.x + s.w - bw, y: y + (rowH - T.btn(L, 44)) / 2, w: bw, h: T.btn(L, 44), label: '去设置', size: T.FS.body });
      y += rowH;
      line(y);
    }

    // privacy guide
    W.text(ctx, '用户隐私保护指引', s.x, y + rowH / 2, { size: T.FS.bodyL, weight: 600, maxW: s.w - L.u(70) });
    W.text(ctx, '查看 ›', s.x + s.w, y + rowH / 2, { size: T.FS.body, color: C.sub, align: 'right' });
    hits.add('settings:privacy', s.x, y, s.w, rowH);
  });

  // feedback (native createFeedbackButton overlays this rect): pinned
  const fy = s.bottom - footH;
  line(fy);
  W.text(ctx, '联系我们 / 反馈', s.x, fy + footH / 2, { size: T.FS.bodyL, weight: 600 });
  W.text(ctx, '›', s.x + s.w, fy + footH / 2, { size: T.FS.bodyL, color: C.sub, align: 'right' });
  hits.add('settings:feedback', s.x, fy, s.w, footH);
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display || { largeText: vm.largeText, highContrast: vm.highContrast });
  const hits = new Hits();
  drawInto(ctx, vm, L, hits);
  return hits.result();
}

module.exports = { draw, drawInto };
