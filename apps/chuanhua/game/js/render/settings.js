/**
 * 设置 sheet over home (spec 8.13): sound, 大字模式, 高对比度, 今日彩笔 unlock, legal links, delete-all, and a pinned
 * 反馈 row (logic positions the native feedback button over `settings:feedback`).
 * vm: {muted, largeText, highContrast, canUnlockPalette, paletteUnlockedToday, paletteAd?, reminderText?, deleteAll:{state}} + display.
 * Rev. 2 (PO-49): this is the ONLY place to unlock 今日彩笔 (▶ 看视频解锁今日彩笔; unlocked: "今日彩笔已解锁（今天有效）"); the 揭晓提醒
 * status line (reminderText) shows the 慢慢传 notice state.
 * `largeText` / `highContrast` are the switch states; the display mode itself is vm.display.
 * Hit ids: settings:sound, settings:largeText, settings:highContrast, settings:rules, settings:terms, settings:privacy,
 * settings:palette, settings:feedback, settings:deleteAll, sheet:close, sheet:list (scroll).
 * The two delete confirmations are overlay dialogs; `confirm1/confirm2` keep the button as it was.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const { Hits } = require('./layout');
const C = T.COLORS;

function toggle(ctx, L, x, cy, on) {
  const w = L.u(54);
  const h = L.u(30);
  const tx = x - w;
  W.fillRR(ctx, tx, cy - h / 2, w, h, h / 2, on ? C.orange : C.disabledFill);
  W.strokeRR(ctx, tx, cy - h / 2, w, h, h / 2, C.ink, 2);
  const kx = on ? tx + w - h / 2 : tx + h / 2;
  ctx.beginPath();
  ctx.arc(kx, cy, h / 2 - L.u(4), 0, Math.PI * 2);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  // the state is also a word, never colour alone
  W.text(ctx, on ? '开' : '关', tx - L.u(8), cy, { size: T.FS.body, weight: 700, color: on ? C.ink : C.sub, align: 'right' });
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  const rowH = Math.max(L.u(56), T.minBtn() + L.u(4));
  const gap = L.u(8);
  const btnH = T.btn(L, 52);
  const del = (vm.deleteAll && vm.deleteAll.state) || 'idle';
  const adState = (vm.paletteAd && vm.paletteAd.state) || 'idle';
  const rows = [
    { id: 'settings:sound', label: '声音', on: !vm.muted },
    { id: 'settings:largeText', label: '大字模式', on: !!vm.largeText },
    { id: 'settings:highContrast', label: '高对比度', on: !!vm.highContrast },
  ];
  const links = [
    { id: 'settings:rules', label: '接龙公约' },
    { id: 'settings:terms', label: '《用户协议》' },
    { id: 'settings:privacy', label: '《用户隐私保护指引》' },
  ];
  const paletteRow = vm.canUnlockPalette || vm.paletteUnlockedToday;
  const remLines = vm.reminderText ? W.wrap(ctx, vm.reminderText, Math.min(L.W, 560) - 2 * L.pad - L.u(8), T.FS.body, 600) : [];
  const remH = remLines.length ? remLines.length * Math.round(T.FS.body * 1.5) + L.u(12) : 0;
  const unlockedLines = vm.paletteUnlockedToday ? W.wrap(ctx, '今日彩笔已解锁（今天有效）', Math.min(L.W, 560) - 2 * L.pad - L.u(56), T.FS.body, 700) : [];
  const ulh = Math.round(T.FS.body * 1.45);
  const unlockedH = Math.max(btnH, unlockedLines.length * ulh + L.u(20));
  const contentH = rows.length * (rowH + gap) + (paletteRow ? (vm.paletteUnlockedToday ? unlockedH : btnH) + gap : 0) + L.u(6) + links.length * (rowH + gap) + (remH ? remH + gap : 0) + L.u(8) + btnH + (del === 'error' || del === 'done' ? Math.round(T.FS.body * 1.6) : 0) + L.u(8);

  S.sheetScroll(ctx, L, hits, {
    title: '设置',
    contentH,
    pinnedH: btnH,
    scroll: vm.sheetScroll,
    drawContent(x, y, w) {
      let cy = y;
      rows.forEach((r) => {
        W.card(ctx, x, cy, w, rowH, { r: L.u(12), shadow: false });
        W.text(ctx, r.label, x + L.u(16), cy + rowH / 2, { size: T.FS.bodyL, weight: 700 });
        toggle(ctx, L, x + w - L.u(16), cy + rowH / 2, r.on);
        hits.add(r.id, x, cy, w, rowH);
        cy += rowH + gap;
      });
      if (paletteRow) {
        if (vm.paletteUnlockedToday) {
          W.card(ctx, x, cy, w, unlockedH, { r: L.u(12), shadow: false, fill: C.greenSoft });
          W.iconCheck(ctx, x + L.u(24), cy + unlockedH / 2, L.u(14), C.greenText);
          unlockedLines.forEach((ln, i) => W.text(ctx, ln, x + L.u(44), cy + unlockedH / 2 + (i - (unlockedLines.length - 1) / 2) * ulh, { size: T.FS.body, weight: 700, color: C.greenText }));
        } else {
          const label = adState === 'loading' ? '广告加载中…' : adState === 'playing' ? '播放中…' : adState === 'error' ? '暂时没有广告，稍后再试' : '看视频解锁今日彩笔';
          W.button(ctx, L, hits, { id: 'settings:palette', x, y: cy, w, h: btnH, label, kind: 'ad', disabled: adState === 'loading' || adState === 'playing' });
        }
        cy += (vm.paletteUnlockedToday ? unlockedH : btnH) + gap;
      }
      cy += L.u(6);
      links.forEach((r) => {
        W.card(ctx, x, cy, w, rowH, { r: L.u(12), shadow: false });
        W.text(ctx, r.label, x + L.u(16), cy + rowH / 2, { size: T.FS.bodyL, weight: 600, maxW: w - L.u(56) });
        W.iconChevron(ctx, x + w - L.u(22), cy + rowH / 2, L.u(14), C.sub);
        hits.add(r.id, x, cy, w, rowH);
        cy += rowH + gap;
      });
      if (remH) {
        remLines.forEach((ln, i) => W.text(ctx, ln, x + L.u(4), cy + L.u(6) + i * Math.round(T.FS.body * 1.5) + Math.round(T.FS.body * 0.75), { size: T.FS.body, weight: 600, color: C.sub }));
        cy += remH + gap;
      }
      cy += L.u(8);
      const busy = del === 'deleting';
      W.button(ctx, L, hits, {
        id: 'settings:deleteAll', x, y: cy, w, h: btnH,
        label: busy ? '正在删除…' : '删除我的全部接龙内容', kind: 'danger', disabled: busy || del === 'done',
      });
      cy += btnH;
      if (del === 'done') W.text(ctx, '已删除', x + w / 2, cy + Math.round(T.FS.body * 0.9), { size: T.FS.body, weight: 700, color: C.greenText, align: 'center' });
      if (del === 'error') W.text(ctx, '没删成功，请重试', x + w / 2, cy + Math.round(T.FS.body * 0.9), { size: T.FS.body, weight: 700, color: C.vermText, align: 'center' });
    },
    drawPinned(x, y, w) {
      W.button(ctx, L, hits, { id: 'settings:feedback', x, y, w, h: btnH, label: '反馈', kind: 'secondary' });
    },
  });
  return hits.result();
}

module.exports = { draw };
