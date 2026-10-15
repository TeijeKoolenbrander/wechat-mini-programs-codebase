/**
 * Result share card (spec 8.4, 8.12, D4). 500 x 400 (5:4), drawn on an
 * offscreen canvas; look from docs/dianjiangtai/mockups/share-card/sanguo.png.
 *
 *   render(canvas, vm, opts) sets canvas.width/height to 500x400 (x opts.pixelScale)
 *                       and draws; then logic calls canvas.toTempFilePath for
 *                       shareAppMessage imageUrl. opts.saved = true adds the
 *                       "微信小游戏 · 点将台" line (album card, use pixelScale 2).
 *   draw(ctx, vm, opts) draws into a 500x400 logical area at the origin.
 *
 * vm: {
 *   mode: 'daily'|'free',            daily = NO general names (D4), free = names
 *   issueNo?: number,                daily only
 *   variantLabel?: '识人'|null,       adds a small tag next to the issue number (daily)
 *   record: {w,l}, bandLabel: string,
 *   lineup: [{slotLabel, name, monogram, faction:'wei'|'shu'|'wu'|'qun'|'jin',
 *             factionLabel, sub, tier?}],   5 entries; `sub` e.g. "蜀 · 赤壁" (free only)
 *                                          faction = the cell the general was DRAFTED from
 *   battles: boolean[12]             true = win
 * }
 * The card always uses the standard look: large-text and high-contrast never
 * apply (the mode is saved, forced to standard, and restored).
 * The corner tag on the mockup is not part of the shipped card.
 */

const T = require('./theme');
const SealMod = require('./seal');
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

function drawCard(ctx, vm, opts) {
  ctx.save();
  ctx.scale(500 / DW, 400 / DH);
  const daily = vm.mode === 'daily';
  const saved = !!(opts && opts.saved);

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

  const titleText = daily ? '点将台 · 今日军令' + (vm.issueNo != null ? ' 第' + vm.issueNo + '期' : '') : '点将台 · 点将出征';
  t(ctx, titleText, 60, 124, 48, 700, INK);
  if (daily && vm.variantLabel) {
    ctx.font = f(48, 700);
    const tw = ctx.measureText(titleText).width;
    const px = 60 + tw + 20;
    rr(ctx, px, 84, 112, 54, 27);
    ctx.fillStyle = 'rgba(179,38,30,0.10)';
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.stroke();
    t(ctx, vm.variantLabel, px + 56, 124, 34, 700, ACCENT, 'center');
  }
  t(ctx, recordCn(vm.record), 500, 262, 116, 900, INK, 'center');
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
    if (daily) {
      // spoiler protection: faction tile only (the cell it was drafted from), no general name or monogram
      SealMod.draw(ctx, cx - 56, ty + 50, 112, { text: e.factionLabel || T.FACTION_LABEL[e.faction] || '', name: e.factionLabel || T.FACTION_LABEL[e.faction] || '', monogram: e.factionLabel || T.FACTION_LABEL[e.faction] || '', factionKey: e.faction, frame: 'plain' }, { full: true, noCache: true });
      t(ctx, '？', cx, ty + 208, 40, 700, SUB, 'center');
    } else {
      SealMod.draw(ctx, cx - 56, ty + 50, 112, { text: e.name, name: e.name, monogram: e.monogram, factionKey: e.faction, frame: e.tier || 'yi' }, { full: true, noCache: true });
      ctx.font = f(34, 700);
      const nameW = ctx.measureText(e.name).width;
      t(ctx, e.name, cx, ty + 196, nameW > tw - 12 ? Math.floor((34 * (tw - 12)) / nameW) : 34, 700, INK, 'center');
      t(ctx, e.sub || '', cx, ty + 224, 20, 500, SUB, 'center');
    }
  });

  // 12 battle dots
  const dotsY = saved ? 646 : 650;
  const bs = vm.battles || [];
  const step = 880 / 12;
  bs.slice(0, 12).forEach((win, i) => {
    const cx = 60 + step * (i + 0.5);
    ctx.beginPath();
    ctx.arc(cx, dotsY, 14, 0, Math.PI * 2);
    if (win) {
      ctx.fillStyle = INK;
      ctx.fill();
    } else {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  });
  t(ctx, '12 战 · ● 胜  ○ 负', 500, saved ? 692 : 702, 22, 500, SUB, 'center');
  t(ctx, daily ? '同一手令，你能一统天下吗？' : '你能点出一统天下的阵容吗？', 500, saved ? 732 : 748, 34, 700, INK, 'center');
  if (saved) t(ctx, '微信小游戏 · 点将台', 500, 762, 22, 500, SUB, 'center');
  ctx.restore();
}

function draw(ctx, vm, opts) {
  const prev = T.getMode();
  T.setMode(null); // the card is always the standard look
  try {
    drawCard(ctx, vm, opts);
  } finally {
    T.setMode(prev);
  }
}

function render(canvas, vm, opts) {
  const k = (opts && opts.pixelScale) || 1;
  canvas.width = 500 * k;
  canvas.height = 400 * k;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(k, k);
  draw(ctx, vm, opts);
  ctx.restore();
  return canvas;
}

module.exports = { draw, render, WIDTH: 500, HEIGHT: 400 };
