/**
 * Result share card (spec 8.4, D4). 500 x 400 (5:4), drawn on an offscreen
 * canvas; look from docs/dianjiangtai/mockups/share-card/sanguo.png.
 *
 *   render(canvas, vm)  sets canvas.width/height to 500x400 (x opts.pixelScale)
 *                       and draws; then logic calls wx.canvasToTempFilePath /
 *                       canvas.toTempFilePath for shareAppMessage imageUrl.
 *   draw(ctx, vm)       draws into a 500x400 logical area at the origin.
 *
 * vm: {
 *   mode: 'daily'|'free',            daily = NO general names (D4), free = names
 *   issueNo?: number,                daily only
 *   record: {w,l}, bandLabel: string,
 *   lineup: [{slotLabel, name, monogram, faction:'wei'|'shu'|'wu'|'qun',
 *             factionLabel, sub}],   5 entries; `sub` e.g. "蜀 · 赤壁" (free only)
 *   battles: boolean[12]             true = win
 * }
 * The corner tag on the mockup is not part of the shipped card.
 */

const T = require('./theme');
const { recordCn } = require('./fmt');

const INK = '#2a211a';
const SUB = '#6b5a45';
const ACCENT = '#b3261e';
const TILE = '#fbf4e2';
const STAMP_INK = '#f6e9d0';

// design space is the mockup's 1000 x 800
const DW = 1000;
const DH = 800;

function f(size, weight) {
  return weight + ' ' + size + 'px ' + T.SERIF;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function t(ctx, s, x, y, size, weight, color, align) {
  ctx.font = f(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function stampText(w) {
  if (w >= 12) return ['一统', '点将台'];
  if (w >= 10) return ['大捷', '点将台'];
  return null;
}

function draw(ctx, vm) {
  ctx.save();
  ctx.scale(500 / DW, 400 / DH);
  const daily = vm.mode === 'daily';

  const g = ctx.createLinearGradient(0, 0, 0, DH);
  g.addColorStop(0, '#f1e6cc');
  g.addColorStop(1, '#e3d2ab');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, DW, DH);
  ctx.strokeStyle = 'rgba(42,33,26,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 952, 752);
  ctx.strokeStyle = 'rgba(42,33,26,0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(34, 34, 932, 732);

  t(ctx, daily ? '点将台 · 今日军令' + (vm.issueNo != null ? ' 第' + vm.issueNo + '期' : '') : '点将台 · 点将出征', 60, 124, 48, 700, INK);
  t(ctx, recordCn(vm.record), 500, 262, 116, 900, INK, 'center');
  ctx.font = f(54, 700);
  t(ctx, '〔' + vm.bandLabel + '〕', 500, 332, 54, 700, ACCENT, 'center');

  const st = stampText(vm.record.w);
  if (st) {
    ctx.save();
    ctx.translate(881, 251);
    ctx.rotate((-8 * Math.PI) / 180);
    rr(ctx, -55, -55, 110, 110, 8);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = STAMP_INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(-47, -47, 94, 94);
    t(ctx, st[0], 0, 7, 38, 900, STAMP_INK, 'center');
    t(ctx, st[1], 0, 33, 20, 700, STAMP_INK, 'center');
    ctx.restore();
  }

  // five tiles
  const tw = 164;
  const gap = 20;
  const x0 = 500 - (5 * tw + 4 * gap) / 2;
  const ty = 372;
  (vm.lineup || []).slice(0, 5).forEach((e, i) => {
    const x = x0 + i * (tw + gap);
    const cx = x + tw / 2;
    rr(ctx, x, ty, tw, 236, 14);
    ctx.fillStyle = TILE;
    ctx.fill();
    ctx.strokeStyle = 'rgba(42,33,26,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    t(ctx, e.slotLabel, cx, ty + 36, 26, 700, SUB, 'center');
    rr(ctx, cx - 52, ty + 52, 104, 104, 10);
    ctx.fillStyle = T.factionColor(e.faction);
    ctx.fill();
    if (daily) {
      // spoiler protection: faction tile only, no general name or monogram
      t(ctx, e.factionLabel || T.FACTION_LABEL[e.faction] || '', cx, ty + 128, 66, 900, '#fff', 'center');
      t(ctx, '？', cx, ty + 208, 40, 700, SUB, 'center');
    } else {
      t(ctx, e.monogram, cx, ty + 128, 66, 900, '#fff', 'center');
      ctx.font = f(34, 700);
      const nameW = ctx.measureText(e.name).width;
      t(ctx, e.name, cx, ty + 196, nameW > tw - 12 ? Math.floor((34 * (tw - 12)) / nameW) : 34, 700, INK, 'center');
      t(ctx, e.sub || '', cx, ty + 224, 20, 500, SUB, 'center');
    }
  });

  // 12 battle dots
  const bs = vm.battles || [];
  const step = 880 / 12;
  bs.slice(0, 12).forEach((win, i) => {
    const cx = 60 + step * (i + 0.5);
    ctx.beginPath();
    ctx.arc(cx, 650, 14, 0, Math.PI * 2);
    if (win) {
      ctx.fillStyle = INK;
      ctx.fill();
    } else {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  });
  t(ctx, '12 战 · ● 胜  ○ 负', 500, 702, 22, 500, SUB, 'center');
  t(ctx, daily ? '同一手令，你能一统天下吗？' : '你能点出一统天下的阵容吗？', 500, 748, 34, 700, INK, 'center');
  ctx.restore();
}

function render(canvas, vm, opts) {
  const k = (opts && opts.pixelScale) || 1;
  canvas.width = 500 * k;
  canvas.height = 400 * k;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(k, k);
  draw(ctx, vm);
  ctx.restore();
  return canvas;
}

module.exports = { draw, render, WIDTH: 500, HEIGHT: 400 };
