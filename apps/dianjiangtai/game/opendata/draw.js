/**
 * Draws the board model onto the shared canvas (spec 8.6, 8.7, 11.4).
 * Self-contained (the open data domain cannot require files outside its
 * folder), so the few theme constants are repeated here.
 *
 * drawBoard(ctx, model, opts)
 *   opts: {width, height, scroll, roster, images, message, display}
 *   roster: [[monogram, factionKey, tier?], ...] indexed by roster index (from
 *     the main domain's postMessage field `roster`), used for lineup tiles.
 *     factionKey: 'wei'|'shu'|'wu'|'qun'|'jin'
 *   images: {avatarUrl: Image|Canvas} loaded avatars (placeholder if missing)
 *   message: string|null  inline status (e.g. read failure) instead of rows
 *   display: {largeText, highContrast} (postMessage field `display`); large
 *     text scales the type and rows, high contrast swaps the palette
 *   model rows may carry k (server streak): "连N" is drawn for k >= 2
 * Returns {contentHeight, maxScroll}.
 */

const STD = {
  ink: '#2A211A',
  sub: '#6B5A45',
  seal: '#B3261E',
  tile: '#FBF4E2',
  amber: '#8F5410',
  line: 'rgba(42,33,26,0.2)',
  dividerBg: '#EDE0C0',
  dividerLine: 'rgba(42,33,26,0.25)',
  selfFill: 'rgba(179,38,30,0.10)',
  pinFill: 'rgba(241,230,204,0.97)',
  avatar: '#B9A98B',
  fac: { wei: '#B8862B', shu: '#C0392B', wu: '#2E7D7A', qun: '#7A5230', jin: '#C9D3DD' },
  facInk: { wei: '#FFFFFF', shu: '#FFFFFF', wu: '#FFFFFF', qun: '#FFFFFF', jin: '#2A211A' },
};
const HC = {
  ink: '#000000',
  sub: '#2B2B2B',
  seal: '#A0160E',
  tile: '#FFFFFF',
  amber: '#7A3A00',
  line: '#5A5A5A',
  dividerBg: '#FFFFFF',
  dividerLine: '#000000',
  selfFill: 'rgba(160,22,14,0.08)',
  pinFill: '#FFFFFF',
  avatar: '#555555',
  fac: { wei: '#6E4B0D', shu: '#9E2A1E', wu: '#1D5552', qun: '#4F3420', jin: '#3E5568' },
  facInk: { wei: '#FFFFFF', shu: '#FFFFFF', wu: '#FFFFFF', qun: '#FFFFFF', jin: '#FFFFFF' },
};
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

/** Text; shrinks to fit maxW down to minSize, then truncates with an ellipsis. */
function txt(ctx, s, x, y, size, weight, color, align, serif, maxW, minSize) {
  s = String(s);
  ctx.font = font(size, weight, serif);
  if (maxW) {
    const w = ctx.measureText(s).width;
    if (w > maxW) {
      ctx.font = font(Math.max(minSize || 16, size * (maxW / w)), weight, serif);
      if (ctx.measureText(s).width > maxW) {
        const chars = Array.from(s);
        while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
        s = chars.join('') + '…';
      }
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function avatar(ctx, P, x, y, size, row, images) {
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
    ctx.fillStyle = row.self ? P.seal : P.avatar;
    ctx.fillRect(x, y, size, size);
    txt(ctx, row.self ? '你' : (row.name || '?').slice(0, 1), x + size / 2, y + size / 2 + 1, size * 0.5, 700, '#fff', 'center', true);
  }
  ctx.restore();
}

/** Mini seal tile: monogram on the faction colour with the tier as a thin frame. */
function lineupTiles(ctx, P, x, y, size, idxs, roster) {
  idxs.forEach((idx, i) => {
    const r = (roster && roster[idx]) || ['?', 'qun'];
    const tx = x + i * (size + 3);
    const fill = P.fac[r[1]] || P.sub;
    ctx.fillStyle = fill;
    rr(ctx, tx, y, size, size, 3);
    ctx.fill();
    if (r[2] === 'jia') {
      ctx.strokeStyle = P === HC ? '#000000' : '#C9973A';
      ctx.lineWidth = 1.5;
      rr(ctx, tx + 1, y + 1, size - 2, size - 2, 2);
      ctx.stroke();
    }
    txt(ctx, r[0], tx + size / 2, y + size / 2 + 1, size * 0.62, 800, P.facInk[r[1]] || '#fff', 'center', true);
  });
}

function drawBoard(ctx, model, opts) {
  const d = opts.display || {};
  const P = d.highContrast ? HC : STD;
  const large = !!d.largeText;
  const W = opts.width;
  const H = opts.height;
  const u = Math.max(1, Math.min(1.25, W / 335));
  const fs = large ? 1.25 : 1; // type scale
  ctx.clearRect(0, 0, W, H);

  const footerH = (large ? 46 : 34) * u;
  const rowH = (large ? 100 : 66) * u;
  const dividerH = (large ? 44 : 36) * u;

  if (opts.message) {
    txt(ctx, opts.message, W / 2, H / 2, 18 * u * fs, 600, P.sub, 'center', false, W - 24, large ? 20 : 16);
    return { contentHeight: 0, maxScroll: 0 };
  }
  const empty = !model.ranked.length && !model.unverified.length;
  if (empty) {
    txt(ctx, model.kind === 'group' ? '本群今天还没有人出征' : '还没有好友出征，叫上他们？', W / 2, H / 2, 18 * u * fs, 600, P.sub, 'center', false, W - 24, large ? 20 : 16);
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
      if (it.t === 'd') drawDivider(ctx, P, W, y, dividerH, u, fs, model.unverifiedLabel);
      else {
        drawRow(ctx, P, model, it, W, y, rowH - 6 * u, u, fs, large, opts);
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
    ctx.fillStyle = P.pinFill;
    ctx.fillRect(0, py - 4, W, rowH + 4);
    drawRow(ctx, P, model, selfItem, W, py, rowH - 6 * u, u, fs, large, opts);
  }

  // footer note
  const note = model.selfOnly ? '今日出征人数较多，好友战绩暂未校验' : '已出征 ' + model.ranked.length + ' 人 · 战绩经服务器校验';
  if (large && W < 400) {
    // two short lines instead of one shrunken line
    const parts = note.split(' · ');
    if (parts.length === 2) {
      txt(ctx, parts[0] + ' · ' + parts[1], W / 2, H - footerH / 2, 20, 500, P.sub, 'center', false, W - 8, 20);
    } else txt(ctx, note, W / 2, H - footerH / 2, 20, 500, P.sub, 'center', false, W - 8, 20);
  } else {
    txt(ctx, note, W / 2, H - footerH / 2, 16 * u * fs, 500, P.sub, 'center', false, W - 8, large ? 20 : 16);
  }
  if (maxScroll > 0) {
    const bh = Math.max(24, listH * (listH / contentH));
    ctx.fillStyle = d.highContrast ? '#000000' : 'rgba(42,33,26,0.3)';
    ctx.fillRect(W - 3, (listH - bh) * (scroll / maxScroll), 3, bh);
  }
  return { contentHeight: contentH, maxScroll };
}

function drawDivider(ctx, P, W, y, h, u, fs, label) {
  ctx.fillStyle = P.dividerLine;
  ctx.fillRect(0, y + h / 2, W, 1);
  ctx.font = font(16 * u * fs, 700, false);
  const tw = ctx.measureText(label).width + 28 * u;
  ctx.fillStyle = P.dividerBg;
  ctx.fillRect(W / 2 - tw / 2, y + 4, tw, h - 8);
  txt(ctx, label, W / 2, y + h / 2 + 1, 16 * u * fs, 700, P.amber, 'center', false, null, 16);
}

function drawRow(ctx, P, model, it, W, y, h, u, fs, large, opts) {
  const r = it.r;
  const ranked = it.t === 'r';
  ctx.fillStyle = r.self ? P.selfFill : P.tile;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.fill();
  ctx.strokeStyle = r.self ? P.seal : P.line;
  ctx.lineWidth = r.self ? 2.5 : 1.5;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.stroke();

  // rank number (ranked rows only; never for unverified)
  const l1 = large ? y + h * 0.27 : y + h * 0.33;
  if (ranked) {
    const top3 = r.rank <= 3;
    txt(ctx, String(r.rank), 22 * u, large ? y + h * 0.3 : y + h / 2, (top3 ? 22 : 18) * u * fs, 800, top3 ? P.seal : P.ink, 'center', true, 36 * u, 18);
  } else {
    txt(ctx, '-', 22 * u, large ? y + h * 0.3 : y + h / 2, 18 * u * fs, 600, P.sub, 'center');
  }
  const as = 40 * u;
  const ax = 42 * u;
  avatar(ctx, P, ax, large ? y + h * 0.3 - as / 2 : y + (h - as) / 2, as, r, opts.images);
  const tx = ax + as + 10 * u;
  const recSize = 22 * u * fs;
  ctx.font = font(recSize, 800, true);
  const recStr = r.w + '-' + r.l;
  const recW = ctx.measureText(recStr).width + 8 * u;
  const streak = ranked && r.k >= 2 ? '连' + r.k : null;
  ctx.font = font(16 * u * fs, 700, false);
  const streakW = streak ? ctx.measureText(streak).width + 8 * u : 0;
  const nameMax = W - tx - recW - streakW - 12 * u;
  const nameSize = 18 * u * fs;
  ctx.font = font(nameSize, 700, false);
  const nw = Math.min(ctx.measureText(r.name || '好友').width, nameMax);
  txt(ctx, r.name || '好友', tx, l1, nameSize, 700, P.ink, 'left', false, nameMax, large ? 20 : 16);
  if (streak) txt(ctx, streak, tx + nw + 8 * u, l1, 16 * u * fs, 700, P.seal, 'left', false, null, 16);
  txt(ctx, recStr, W - 10 * u, l1, recSize, 800, ranked ? P.ink : P.sub, 'right', true);

  // second line
  const ly = large ? y + h * 0.56 : y + h * 0.72;
  const lsize = 16 * u * fs;
  if (ranked) {
    ctx.font = font(lsize, 600, false);
    const bl = bandLabel(r.w);
    txt(ctx, bl, tx, ly, lsize, 600, r.w >= 12 ? P.seal : P.sub, 'left', false, null, 16);
    if (r.lineup) {
      const bw = ctx.measureText(bl).width;
      const free = large ? W - 10 * u - tx : W - 10 * u - (tx + bw + 10 * u);
      let ts = Math.min((large ? 26 : 22) * u, free / 5 - 3);
      if (ts >= 14) {
        const lx = large ? tx : W - 10 * u - 5 * (ts + 3) + 3;
        lineupTiles(ctx, P, lx, large ? y + h * 0.8 - ts / 2 : ly - ts / 2, ts, r.lineup, opts.roster);
      }
    }
  } else {
    txt(ctx, model.unverifiedLabel, tx, ly, lsize, 700, P.amber, 'left', false, W - tx - 10 * u, 16);
  }
}

module.exports = { drawBoard, bandLabel };
