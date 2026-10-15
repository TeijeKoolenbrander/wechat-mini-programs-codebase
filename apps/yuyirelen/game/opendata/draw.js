/**
 * Draws the board model onto the shared canvas (spec 8.8). Self-contained:
 * the open data domain cannot require files outside its folder, so the few
 * theme constants are repeated here (same values as js/render/theme.js).
 *
 * drawBoard(ctx, model, opts)
 *   opts: {width, height, scroll, images, message, display}
 *     images:  {avatarUrl: Image|Canvas} loaded avatars (placeholder if missing)
 *     message: string|null  inline status (e.g. read failure) instead of rows
 *     display: {largeText, highContrast}  same switches as the main domain
 * Returns {contentHeight, maxScroll, rowH}.
 *
 * Order: solved rows (rank numbers), 正在猜, 未猜中, 未验证. No row contains a word.
 */

const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC",serif';

const PAL = {
  normal: { ink: '#1E1B18', sub: '#5F574D', accent: '#C43D1C', surface: '#FFFDF8', rowLine: 'rgba(30,27,24,0.16)', self: 'rgba(224,138,46,0.16)', selfLine: '#E08A2E', gold: '#8A6414', divider: '#EDE5D4', pin: 'rgba(246,241,231,0.97)', bar: 'rgba(30,27,24,0.3)', warn: '#8A4A00', outline: 1.5 },
  contrast: { ink: '#000000', sub: '#2B2B2B', accent: '#96260A', surface: '#FFFFFF', rowLine: '#000000', self: 'rgba(0,0,0,0.08)', selfLine: '#000000', gold: '#5E4500', divider: '#F0F0F0', pin: 'rgba(255,255,255,0.98)', bar: 'rgba(0,0,0,0.5)', warn: '#7A3F00', outline: 2 },
};

function font(size, weight, serif) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + (serif ? SERIF : SANS);
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function txt(ctx, s, x, y, size, weight, color, align, serif, maxW, minSize) {
  ctx.font = font(size, weight, serif);
  if (maxW) {
    const w = ctx.measureText(s).width;
    if (w > maxW) ctx.font = font(Math.max(minSize || 16, size * (maxW / w)), weight, serif);
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function avatar(ctx, x, y, size, row, images, p) {
  const img = row.avatarUrl && images && images[row.avatarUrl];
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    try {
      ctx.drawImage(img, x, y, size, size);
    } catch (e) {
      /* fall through to the placeholder next frame */
    }
  } else {
    ctx.fillStyle = row.self ? p.accent : '#8C8272';
    ctx.fillRect(x, y, size, size);
    txt(ctx, row.self ? '你' : (row.name || '?').slice(0, 1), x + size / 2, y + size / 2 + 1, size * 0.5, 700, '#fff', 'center', true, null);
  }
  ctx.restore();
}

function drawBoard(ctx, model, opts) {
  const W = opts.width;
  const H = opts.height;
  const large = !!(opts.display && opts.display.largeText);
  const p = opts.display && opts.display.highContrast ? PAL.contrast : PAL.normal;
  const u = Math.max(1, Math.min(1.25, W / 335));
  const f = large ? 1.25 : 1; // type scale
  ctx.clearRect(0, 0, W, H);

  const rowH = (large ? 80 : 66) * u;
  const dividerH = (large ? 44 : 38) * u;

  if (opts.message) {
    txt(ctx, opts.message, W / 2, H / 2, 18 * u * f, 600, p.sub, 'center', false, W - 24);
    return { contentHeight: 0, maxScroll: 0, rowH };
  }
  const total = model.solved.length + model.playing.length + model.gaveup.length + model.unverified.length;
  if (!total && !model.othersPlaying) {
    txt(ctx, model.kind === 'group' ? '本群今天还没人开始猜' : '还没有好友开始猜，叫上他们？', W / 2, H / 2, 18 * u * f, 600, p.sub, 'center', false, W - 24);
    return { contentHeight: 0, maxScroll: 0, rowH };
  }

  const items = [];
  model.solved.forEach((r) => items.push({ t: 'solved', r }));
  if (model.playing.length) {
    items.push({ t: 'd', label: '正在猜' });
    model.playing.forEach((r) => items.push({ t: 'playing', r }));
  }
  if (model.othersPlaying) items.push({ t: 'note', label: '另有 ' + model.othersPlaying + ' 人正在猜' });
  if (model.gaveup.length) {
    items.push({ t: 'd', label: '未猜中' });
    model.gaveup.forEach((r) => items.push({ t: 'gaveup', r }));
  }
  if (model.unverified.length) {
    items.push({ t: 'd', label: model.unverifiedLabel });
    model.unverified.forEach((r) => items.push({ t: 'unverified', r }));
  }
  let contentH = 0;
  items.forEach((it) => (contentH += it.t === 'd' ? dividerH : it.t === 'note' ? dividerH : rowH));
  const maxScroll = Math.max(0, contentH - H);
  const scroll = Math.max(0, Math.min(opts.scroll || 0, maxScroll));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  let y = -scroll;
  let selfItem = null;
  let selfVisible = false;
  items.forEach((it) => {
    const h = it.t === 'd' || it.t === 'note' ? dividerH : rowH;
    if (y + h > 0 && y < H) {
      if (it.t === 'd') drawDivider(ctx, W, y, dividerH, u * f, it.label, p);
      else if (it.t === 'note') txt(ctx, it.label, W / 2, y + h / 2, 16 * u * f, 600, p.sub, 'center', false, W - 16);
      else {
        drawRow(ctx, it, W, y, rowH - 6 * u, u, f, opts, p);
        if (it.r.self) selfVisible = y >= 0 && y + rowH <= H;
      }
    }
    if (it.r && it.r.self) selfItem = it;
    y += h;
  });
  ctx.restore();

  // the viewer's own row stays pinned at the bottom while it is scrolled off
  if (selfItem && !selfVisible) {
    const py = H - rowH;
    ctx.fillStyle = p.pin;
    ctx.fillRect(0, py - 4, W, rowH + 4);
    drawRow(ctx, selfItem, W, py, rowH - 6 * u, u, f, opts, p);
  }

  if (maxScroll > 0) {
    const bh = Math.max(24, H * (H / contentH));
    ctx.fillStyle = p.bar;
    ctx.fillRect(W - 3, (H - bh) * (scroll / maxScroll), 3, bh);
  }
  return { contentHeight: contentH, maxScroll, rowH };
}

function drawDivider(ctx, W, y, h, uf, label, p) {
  ctx.fillStyle = p.rowLine;
  ctx.fillRect(0, y + h / 2, W, 1);
  ctx.font = font(16 * uf, 700, false);
  const tw = ctx.measureText(label).width + 28 * uf;
  ctx.fillStyle = p.divider;
  ctx.fillRect(W / 2 - tw / 2, y + 4, tw, h - 8);
  txt(ctx, label, W / 2, y + h / 2 + 1, 16 * uf, 700, p.warn, 'center', false, null);
}

function drawRow(ctx, it, W, y, h, u, f, opts, p) {
  const r = it.r;
  const kind = it.t;
  ctx.fillStyle = r.self ? p.self : p.surface;
  rr(ctx, 0, y, W, h, 12 * u);
  ctx.fill();
  ctx.strokeStyle = r.self ? p.selfLine : p.rowLine;
  ctx.lineWidth = r.self ? 2 : p.outline > 1.5 ? 1.5 : 1.2;
  rr(ctx, 0, y, W, h, 12 * u);
  ctx.stroke();

  // rank number: solved rows only
  if (kind === 'solved') {
    const top3 = r.rank <= 3;
    txt(ctx, String(r.rank), 22 * u, y + h / 2, (top3 ? 24 : 20) * u * Math.min(f, 1.1), 800, top3 ? p.gold : p.ink, 'center', true, 34 * u, 16);
  } else {
    txt(ctx, '·', 22 * u, y + h / 2, 22 * u, 800, p.sub, 'center', false, null);
  }
  const as = 40 * u;
  const ax = 42 * u;
  avatar(ctx, ax, y + (h - as) / 2, as, r, opts.images, p);
  const tx = ax + as + 10 * u;

  // right-hand value
  let right = '';
  let rightSize = 22;
  if (kind === 'solved') right = r.n + ' 步';
  else if (kind === 'playing') {
    right = '已猜 ' + r.n + ' 步';
    rightSize = 17;
  } else if (kind === 'gaveup') {
    right = '最近第 ' + String(r.b).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 名';
    rightSize = 17;
  }
  ctx.font = font(rightSize * u * f, 800, kind === 'solved');
  const rw = right ? ctx.measureText(right).width : 0;
  if (right) txt(ctx, right, W - 10 * u, y + h * (kind === 'solved' ? 0.5 : 0.33), rightSize * u * f, 800, kind === 'solved' ? p.ink : p.sub, 'right', kind === 'solved', null);

  const nameMax = W - tx - (kind === 'solved' ? rw : 0) - 12 * u;
  txt(ctx, r.name || '好友', tx, y + h * (kind === 'solved' ? 0.33 : 0.33), 18 * u * f, 700, p.ink, 'left', false, kind === 'solved' ? nameMax : W - tx - 10 * u);

  // second line
  const ly = y + h * 0.73;
  let line = '';
  let color = p.sub;
  if (kind === 'solved') line = '提示 ' + r.hi + (r.k >= 2 ? '  连' + r.k : '');
  else if (kind === 'playing') line = '最近第 ' + String(r.b).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 名';
  else if (kind === 'gaveup') line = '未猜中';
  else {
    line = '未验证';
    color = p.warn;
  }
  txt(ctx, line, tx, ly, 16 * u * f, kind === 'unverified' ? 700 : 600, color, 'left', false, W - tx - 12 * u);
}

module.exports = { drawBoard };
