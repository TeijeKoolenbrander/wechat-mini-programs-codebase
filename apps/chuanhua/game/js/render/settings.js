/**
 * 设置 (spec 8.13). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 12 Settings {muted, largeText, highContrast, canUnlockPalette,
 *   paletteUnlockedToday, deleteAll:{state}} plus extras: display (switch
 *   modes live: logic sets display from largeText/highContrast), sheet,
 *   scrollY, subscribeStatusText (passive 揭晓提醒 line, optional), version.
 * deleteAll.state confirm1/confirm2 draws its own confirm dialog (ids
 *   dialog:confirm, dialog:cancel); deleting/done/error show a status line.
 * Hit ids: back, settings:sound, settings:largeText, settings:highContrast,
 *   settings:palette, settings:rules, settings:terms, settings:privacy,
 *   settings:feedback (put the native feedback button over this rect),
 *   settings:deleteAll, settings:deleteRetry, dialog:confirm, dialog:cancel,
 *   dialog:block, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./rows');
const overlay = require('./overlay');
const { page } = require('./page');
const C = T.COLORS;

const DELETE_TEXT = {
  confirm1: { text: '确定要删除我的全部接龙内容吗？', confirmLabel: '继续', cancelLabel: '取消' },
  confirm2: { text: '删除后，你画的和写的内容将不再展示，正在进行的接龙会让出你的那一棒', confirmLabel: '删除', cancelLabel: '取消', danger: true },
};

function draw(ctx, vm, L) {
  const del = (vm.deleteAll && vm.deleteAll.state) || 'idle';
  const v2 = Object.assign({}, vm, { display: vm.display || { largeText: !!vm.largeText, highContrast: !!vm.highContrast } });
  T.applyDisplay(v2.display);
  const hits = page(ctx, v2, L, {
    back: { label: '返回', id: 'back' },
    title: '设置',
    body: (c, h, y0, x, w) => {
      let y = y0 + 2;
      const rowH = Math.max(T.MODE.largeText ? 64 : 58, Math.round(T.FS.bodyL * 2.5));
      const group = (title, rows) => {
        y += R.sectionTitle(c, x, y, w, title);
        const total = rows.length * rowH + 4;
        W.card(c, x, y, w, total, { r: 16 });
        rows.forEach((fn, i) => {
          const ry = y + 2 + i * rowH;
          if (i > 0) {
            c.fillStyle = C.line;
            c.fillRect(x + 16, ry, w - 32, 1);
          }
          fn(ry);
        });
        y += total + 6;
      };
      const toggleRow = (id, label, on) => (ry) => {
        W.text(c, label, x + 16, ry + rowH / 2, { size: T.FS.bodyL, weight: 700, maxW: w - 150 });
        const tw = 52;
        W.toggle(c, x + w - 16 - tw, ry + rowH / 2 - 15, tw, 30, on);
        W.text(c, on ? '开' : '关', x + w - 16 - tw - 10, ry + rowH / 2, { size: T.FS.body, weight: 800, color: on ? C.good : C.sub, align: 'right' });
        h.add(id, x, ry, w, rowH);
      };
      const linkRow = (id, label, trail) => (ry) => {
        W.text(c, label, x + 16, ry + rowH / 2, { size: T.FS.bodyL, weight: 700, maxW: w - 80 });
        W.text(c, trail || '›', x + w - 18, ry + rowH / 2 - (trail ? 0 : 1), { size: trail ? T.FS.body : T.FS.title, weight: 700, color: C.sub, align: 'right' });
        h.add(id, x, ry, w, rowH);
      };
      group('声音与显示', [
        toggleRow('settings:sound', '声音', !vm.muted),
        toggleRow('settings:largeText', '大字模式', !!vm.largeText),
        toggleRow('settings:highContrast', '高对比度', !!vm.highContrast),
      ]);
      if (vm.canUnlockPalette || vm.paletteUnlockedToday) {
        group('画笔', [
          (ry) => {
            W.text(c, '今日彩笔', x + 16, ry + rowH / 2, { size: T.FS.bodyL, weight: 700 });
            if (vm.paletteUnlockedToday) {
              W.iconCheck(c, x + w - 100, ry + rowH / 2, 14, C.good, 3);
              W.text(c, '今日已解锁', x + w - 16, ry + rowH / 2, { size: T.FS.body, weight: 800, color: C.good, align: 'right' });
            } else {
              const bw2 = Math.min(w * 0.58, 190);
              W.button(c, L, h, { id: 'settings:palette', x: x + w - 12 - bw2, y: ry + (rowH - 46) / 2, w: bw2, h: 46, label: '看视频解锁', kind: 'ad', size: T.FS.body });
            }
          },
        ]);
      }
      const subLine = vm.subscribeStatusText;
      group('关于', [
        linkRow('settings:rules', '接龙公约'),
        linkRow('settings:terms', '《用户协议》'),
        linkRow('settings:privacy', '《用户隐私保护指引》'),
        linkRow('settings:feedback', '联系我们 · 反馈'),
      ]);
      if (subLine) {
        y += W.paragraph(c, subLine, x + 4, y, w - 8, Math.round(T.FS.body * 1.5), { size: T.FS.body, color: C.sub }) + 6;
      }
      // delete all
      y += R.sectionTitle(c, x, y, w, '我的内容');
      const bh = W.btnH(L, true);
      const status = { deleting: '正在删除…', done: '已删除，你的内容不会再展示', error: '没删成，请重试' }[del];
      if (status) {
        const ph = W.paragraph(c, status, x + 4, y, w - 8, Math.round(T.FS.body * 1.5), { size: T.FS.body, weight: 700, color: del === 'error' ? C.zhuText : C.ink });
        y += ph + 6;
      }
      if (del === 'error') {
        W.button(c, L, h, { id: 'settings:deleteRetry', x, y, w, h: bh, label: '重试', kind: 'danger', size: T.FS.body });
        y += bh + 8;
      } else if (del === 'idle' || del === 'confirm1' || del === 'confirm2') {
        W.button(c, L, h, { id: 'settings:deleteAll', x, y, w, h: bh, label: '删除我的全部接龙内容', kind: 'danger', size: T.FS.body });
        y += bh + 8;
      }
      if (vm.version) y += W.paragraph(c, '版本 ' + vm.version, x + 4, y, w - 8, Math.round(T.FS.small * 1.6), { size: T.FS.small, color: C.sub, align: 'center' }) + 4;
      return y - y0 + 8;
    },
  });
  if (DELETE_TEXT[del]) {
    const out = hits.concat(overlay.draw(ctx, { display: v2.display, dialog: DELETE_TEXT[del] }, L));
    out.layoutInfo = hits.layoutInfo;
    out.scrollMax = hits.scrollMax;
    return out;
  }
  return hits;
}

module.exports = { draw };
