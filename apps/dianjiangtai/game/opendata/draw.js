/**
 * Draws the board model onto the shared canvas (spec 8.6, 8.7, 11.4).
 * Self-contained (the open data domain cannot require files outside its
 * folder), so the few theme constants are repeated here.
 *
 * drawBoard(ctx, model, opts)
 *   opts: {width, height, scroll, roster, images, message}
 *   roster: [[monogram, factionKey], ...] indexed by roster index (from the
 *     main domain's postMessage field `roster`), used for lineup tiles
 *   images: {avatarUrl: Image|Canvas} loaded avatars (placeholder if missing)
 *   message: string|null  inline status (e.g. read failure) instead of rows
 * Returns {contentHeight, maxScroll}.
 */

const INK = '#2A211A';
const SUB = '#6B5A45';
const SEAL = '#B3261E';
const TILE = '#FBF4E2';
const AMBER = '#9A5A12';
const GOOD = '#2F7D4F';
const FAC = { wei: '#B8862B', shu: '#C0392B', wu: '#2E7D7A', qun: '#7A5230' };
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC",serif';

function bandLabel(w) {
  if (w >= 12) return '一统天下';
  if (w >= 10) return '霸业将成';
  if (w >= 8) return '雄踞一方';
  if (w >= 6) return '三分鼎立';
  if (w >= 4) return '偏安一方';
  if (w >= 2) return '兵微将寡';
  return '一败涂地';
}

function font(size, weight, serif) {
  return (weight || 400) + ' ' + size + 'px ' + (serif ? SERIF : SANS);
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function txt(ctx, s, x, y, size, weight, color, align, serif, maxW) {
  ctx.font = font(size, weight, serif);
  if (maxW) {
    const w = ctx.measureText(s).width;
    if (w > maxW) ctx.font = font(Math.max(16, size * (maxW / w)), weight, serif);
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function avatar(ctx, x, y, size, row, images) {
  const img = row.avatarUrl && images && images[row.avatarUrl];
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    try {
      ctx.drawImage(img, x, y, size, size);
    } catch (e) {
      /* fall through to placeholder next frame */
    }
  } else {
    ctx.fillStyle = row.self ? SEAL : '#B9A98B';
    ctx.fillRect(x, y, size, size);
    txt(ctx, row.self ? '你' : (row.name || '?').slice(0, 1), x + size / 2, y + size / 2 + 1, size * 0.5, 700, '#fff', 'center', true);
  }
  ctx.restore();
}

function lineupTiles(ctx, x, y, size, idxs, roster) {
  idxs.forEach((idx, i) => {
    const r = (roster && roster[idx]) || ['?', 'qun'];
    const tx = x + i * (size + 3);
    ctx.fillStyle = FAC[r[1]] || SUB;
    rr(ctx, tx, y, size, size, 3);
    ctx.fill();
    txt(ctx, r[0], tx + size / 2, y + size / 2 + 1, size * 0.62, 800, '#fff', 'center', true);
  });
}

function drawBoard(ctx, model, opts) {
  const W = opts.width;
  const H = opts.height;
  const u = Math.max(1, Math.min(1.25, W / 335));
  ctx.clearRect(0, 0, W, H);

  const footerH = 34 * u;
  const rowH = 66 * u;
  const dividerH = 36 * u;

  if (opts.message) {
    txt(ctx, opts.message, W / 2, H / 2, 18 * u, 600, SUB, 'center', false, W - 24);
    return { contentHeight: 0, maxScroll: 0 };
  }
  const empty = !model.ranked.length && !model.unverified.length;
  if (empty) {
    txt(ctx, model.kind === 'group' ? '本群今天还没有人出征' : '还没有好友出征，叫上他们？', W / 2, H / 2, 18 * u, 600, SUB, 'center', false, W - 24);
    return { contentHeight: 0, maxScroll: 0 };
  }

  const listH = H - footerH;
  // content: ranked rows, then (divider + unverified rows)
  const items = [];
  model.ranked.forEach((r) => items.push({ t: 'r', r }));
  if (model.unverified.length) {
    items.push({ t: 'd' });
    model.unverified.forEach((r) => items.push({ t: 'u', r }));
  }
  let contentH = 0;
  items.forEach((it) => (contentH += it.t === 'd' ? dividerH : rowH));
  const maxScroll = Math.max(0, contentH - listH);
  const scroll = Math.max(0, Math.min(opts.scroll || 0, maxScroll));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, listH);
  ctx.clip();
  let y = -scroll;
  let selfVisible = false;
  let selfItem = null;
  items.forEach((it) => {
    const h = it.t === 'd' ? dividerH : rowH;
    if (y + h > 0 && y < listH) {
      if (it.t === 'd') drawDivider(ctx, W, y, dividerH, u, model.unverifiedLabel);
      else {
        drawRow(ctx, model, it, W, y, rowH - 6 * u, u, opts);
        if (it.r.self) selfVisible = y >= 0 && y + rowH <= listH;
      }
    }
    if (it.t === 'r' && it.r.self) selfItem = it;
    y += h;
  });
  ctx.restore();

  // pin the viewer's own row at the bottom of the list if it is scrolled off
  if (selfItem && !selfVisible) {
    const py = listH - rowH;
    ctx.fillStyle = 'rgba(241,230,204,0.97)';
    ctx.fillRect(0, py - 4, W, rowH + 4);
    drawRow(ctx, model, selfItem, W, py, rowH - 6 * u, u, opts);
  }

  // footer note
  const note = model.selfOnly ? '今日出征人数较多，好友战绩暂未校验' : '已出征 ' + model.ranked.length + ' 人 · 战绩经服务器校验';
  txt(ctx, note, W / 2, H - footerH / 2, 16 * u, 500, SUB, 'center', false, W - 8);
  if (maxScroll > 0) {
    const bh = Math.max(24, listH * (listH / contentH));
    ctx.fillStyle = 'rgba(42,33,26,0.3)';
    ctx.fillRect(W - 3, (listH - bh) * (scroll / maxScroll), 3, bh);
  }
  return { contentHeight: contentH, maxScroll };
}

function drawDivider(ctx, W, y, h, u, label) {
  ctx.fillStyle = 'rgba(42,33,26,0.25)';
  ctx.fillRect(0, y + h / 2, W, 1);
  ctx.font = font(16 * u, 700, false);
  const tw = ctx.measureText(label).width + 28 * u;
  ctx.fillStyle = '#EDE0C0';
  ctx.fillRect(W / 2 - tw / 2, y + 4, tw, h - 8);
  txt(ctx, label, W / 2, y + h / 2 + 1, 16 * u, 700, AMBER, 'center');
}

function drawRow(ctx, model, it, W, y, h, u, opts) {
  const r = it.r;
  const ranked = it.t === 'r';
  ctx.fillStyle = r.self ? 'rgba(179,38,30,0.10)' : TILE;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.fill();
  ctx.strokeStyle = r.self ? SEAL : 'rgba(42,33,26,0.2)';
  ctx.lineWidth = r.self ? 2 : 1.5;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.stroke();

  // rank number (ranked rows only; never for unverified)
  if (ranked) {
    const top3 = r.rank <= 3;
    txt(ctx, String(r.rank), 22 * u, y + h / 2, top3 ? 22 * u : 18 * u, 800, top3 ? SEAL : INK, 'center', true);
  } else {
    txt(ctx, '-', 22 * u, y + h / 2, 18 * u, 600, SUB, 'center');
  }
  const as = 40 * u;
  const ax = 42 * u;
  avatar(ctx, ax, y + (h - as) / 2, as, r, opts.images);
  const tx = ax + as + 10 * u;
  const recW = 74 * u;
  txt(ctx, r.name || '好友', tx, y + h * 0.33, 18 * u, 700, INK, 'left', false, W - tx - recW - 8 * u);
  txt(ctx, r.w + '-' + r.l, W - 10 * u, y + h * 0.33, 22 * u, 800, ranked ? INK : SUB, 'right', true);

  // second line
  const ly = y + h * 0.72;
  if (ranked) {
    ctx.font = font(16 * u, 600, false);
    const bl = bandLabel(r.w);
    txt(ctx, bl, tx, ly, 16 * u, 600, r.w >= 12 ? SEAL : SUB, 'left');
    if (r.lineup) {
      const bw = ctx.measureText(bl).width;
      const ts = 22 * u;
      const lx = Math.max(tx + bw + 10 * u, W - 10 * u - 5 * (ts + 3) + 3);
      lineupTiles(ctx, lx, ly - ts / 2, ts, r.lineup, opts.roster);
    }
  } else {
    txt(ctx, model.unverifiedLabel, tx, ly, 16 * u, 700, AMBER, 'left');
  }
}

module.exports = { drawBoard, bandLabel };
