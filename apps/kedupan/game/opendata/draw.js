/**
 * Draws a board model onto the shared canvas (spec 8.5). Self-contained (the
 * open data domain cannot require files outside its folder), so the few
 * theme tokens are repeated here, in both palettes.
 *
 * drawBoard(ctx, model, opts)
 *   opts: {width, height, scroll, rowH, footH, fontScale, palette, images, message}
 *   rowH / footH come from the main domain (render/board.js) so the window
 *   shows exactly five rows plus the footer. fontScale >= 1.
 *   images: {avatarUrl: Image|Canvas}; a monogram placeholder is drawn otherwise.
 *   message: inline status text instead of rows.
 * Returns {contentHeight, maxScroll}.
 */

const PALETTES = {
  standard: {
    ink: '#24211E',
    sub: '#5C5249',
    card: '#FFFDF8',
    line: 'rgba(36,33,30,0.20)',
    self: '#F2C94C',
    you: '#F07B2C',
    youText: '#A9470B',
    nation: '#2A8C8C',
    nationText: '#1F6F6F',
    group: '#7D4E8C',
    target: '#D9480F',
    good: '#17734A',
    avatar: '#CDBF9E',
    outline: 1.5,
  },
  highContrast: {
    ink: '#000000',
    sub: '#262626',
    card: '#FFFFFF',
    line: '#000000',
    self: '#FFE680',
    you: '#B04A00',
    youText: '#8F3C00',
    nation: '#145F5F',
    nationText: '#145F5F',
    group: '#4E2A5C',
    target: '#8A2F00',
    good: '#0B5A36',
    avatar: '#BFBFBF',
    outline: 2.5,
  },
};
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

function font(size, weight) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + SANS;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function txt(ctx, s, x, y, size, weight, color, align, maxW) {
  ctx.font = font(size, weight);
  if (maxW) {
    const w = ctx.measureText(s).width;
    if (w > maxW) ctx.font = font(Math.max(16, size * (maxW / w)), weight);
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function avatar(ctx, P, x, y, size, e, images) {
  const img = e.avatarUrl && images && images[e.avatarUrl];
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    try {
      ctx.drawImage(img, x, y, size, size);
    } catch (err) {
      /* placeholder next frame */
    }
  } else {
    ctx.fillStyle = e.self ? P.you : P.avatar;
    ctx.fillRect(x, y, size, size);
    const ch = e.self ? '你' : e.host ? '题' : e.anon ? String(e.name).slice(-1) : String(e.name || '?').slice(0, 1);
    txt(ctx, ch, x + size / 2, y + size / 2 + 1, size * 0.5, 800, e.self ? '#FFFFFF' : P.ink, 'center');
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Five tiny cells: each shows a dot offset from the nation's diamond. */
function strip(ctx, P, x, y, cell, pos, refs) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (cell + 3) + cell / 2;
    ctx.fillStyle = P.line;
    ctx.fillRect(cx - cell / 2, y + 1, cell, 2);
    // the nation's diamond at the centre
    ctx.beginPath();
    ctx.moveTo(cx, y - 5);
    ctx.lineTo(cx + 4, y + 2);
    ctx.lineTo(cx, y + 9);
    ctx.lineTo(cx - 4, y + 2);
    ctx.closePath();
    ctx.fillStyle = P.nation;
    ctx.fill();
    const off = Math.max(-1, Math.min(1, ((pos[i] - (refs ? refs[i] : 50)) / 50) * 1.4));
    ctx.beginPath();
    ctx.arc(cx + off * (cell / 2 - 3), y + 2, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = P.you;
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawEntry(ctx, P, model, e, i, W, y, h, f, opts) {
  const pad = 8 * f;
  if (e.self) {
    ctx.fillStyle = P.self;
    rr(ctx, 4, y + 3, W - 8, h - 6, 10 * f);
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = P.outline;
    ctx.stroke();
  } else if (i % 2) {
    ctx.fillStyle = 'rgba(36,33,30,0.04)';
    rr(ctx, 4, y + 3, W - 8, h - 6, 10 * f);
    ctx.fill();
  }
  const cy = y + h / 2;
  // rank (group / friend) or a badge (round)
  const view = model.view;
  let left = pad + 4;
  if (view === 'round') {
    left += 2;
  } else {
    const top3 = e.rank <= 3;
    txt(ctx, String(e.rank), left + 12 * f, cy, (top3 ? 22 : 18) * f, 900, top3 ? P.youText : P.ink, 'center');
    left += 28 * f;
  }
  const as = Math.min(h - 14, 40 * f);
  avatar(ctx, P, left, cy - as / 2, as, e, opts.images);
  const tx = left + as + 10 * f;
  const rightW = (view === 'round' ? 84 : view === 'group' ? 118 : 84) * f;
  const nameMax = W - tx - rightW - pad;
  txt(ctx, e.name, tx, cy - 10 * f, 18 * f, 800, P.ink, 'left', nameMax);
  // second line + right block
  if (view === 'group') {
    txt(ctx, e.k >= 2 ? '连续 ' + e.k + ' 天' : e.anon ? '' : '', tx, cy + 13 * f, 16 * f, 500, P.sub, 'left', nameMax);
    txt(ctx, '群内 ' + e.gs, W - pad - 4, cy - 10 * f, 20 * f, 900, P.ink, 'right');
    txt(ctx, '全国 ' + e.ns, W - pad - 4, cy + 13 * f, 16 * f, 600, P.sub, 'right');
  } else if (view === 'friend') {
    txt(ctx, String(e.ns), W - pad - 4, cy - 10 * f, 22 * f, 900, P.ink, 'right');
    if (e.pos) strip(ctx, P, tx, cy + 10 * f, 11 * f, e.pos, model.refs);
    else txt(ctx, e.k >= 2 ? '连续 ' + e.k + ' 天' : '', tx, cy + 13 * f, 16 * f, 500, P.sub, 'left', nameMax);
  } else {
    // round
    let sub = e.host ? '出题人' : e.gap != null ? '差 ' + e.gap + ' 格' : '';
    if (e.late) sub = '揭晓后作答 · ' + sub;
    txt(ctx, sub, tx, cy + 13 * f, 16 * f, 600, e.late ? P.sub : P.ink, 'left', nameMax);
    if (e.best) {
      ctx.font = font(16 * f, 800);
      const bw = ctx.measureText('最懂你').width + 14 * f;
      ctx.fillStyle = P.good;
      rr(ctx, W - pad - 4 - bw, cy + 2 * f, bw, 22 * f, 11 * f);
      ctx.fill();
      txt(ctx, '最懂你', W - pad - 4 - bw / 2, cy + 13 * f, 16 * f, 800, '#FFFFFF', 'center');
    }
    if (!e.host) txt(ctx, '+' + e.s, W - pad - 4, cy - 10 * f, 22 * f, 900, e.late ? P.sub : P.ink, 'right');
    if (e.late) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = P.sub;
      ctx.lineWidth = 1.2;
      rr(ctx, 4, y + 3, W - 8, h - 6, 10 * f);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawUnverified(ctx, P, u, W, y, h, f, images) {
  const cy = y + h / 2;
  const as = Math.min(h - 14, 36 * f);
  avatar(ctx, P, 12 * f, cy - as / 2, as, { name: u.name, avatarUrl: u.avatarUrl }, images);
  txt(ctx, u.name, 12 * f + as + 10 * f, cy - 10 * f, 18 * f, 700, P.ink, 'left', W * 0.5);
  txt(ctx, '好友自报', 12 * f + as + 10 * f, cy + 13 * f, 16 * f, 700, P.sub, 'left');
  txt(ctx, String(u.reported), W - 12 * f, cy, 20 * f, 800, P.sub, 'right');
}

function drawBoard(ctx, model, opts) {
  const P = PALETTES[opts.palette === 'highContrast' ? 'highContrast' : 'standard'];
  const W = opts.width;
  const H = opts.height;
  const f = Math.max(1, opts.fontScale || 1);
  const rowH = opts.rowH || 60 * f;
  const footH = opts.footH || 56 * f;
  ctx.clearRect(0, 0, W, H);

  if (opts.message) {
    txt(ctx, opts.message, W / 2, H / 2, 18 * f, 700, P.sub, 'center', W - 24);
    return { contentHeight: 0, maxScroll: 0 };
  }
  const items = model.entries.map((e) => ({ t: 'e', e }));
  if (model.unverified && model.unverified.length) model.unverified.forEach((u) => items.push({ t: 'u', u }));
  if (!items.length) {
    txt(ctx, model.view === 'round' ? '还没有人作答' : '今天还没有人完成', W / 2, H / 2, 18 * f, 700, P.sub, 'center', W - 24);
    return { contentHeight: 0, maxScroll: 0 };
  }
  const listH = H - footH;
  const contentH = items.length * rowH;
  const maxScroll = Math.max(0, contentH - listH);
  const scroll = Math.max(0, Math.min(opts.scroll || 0, maxScroll));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, listH);
  ctx.clip();
  let selfItem = null;
  let selfVisible = false;
  items.forEach((it, i) => {
    const y = i * rowH - scroll;
    if (y + rowH > 0 && y < listH) {
      if (it.t === 'e') drawEntry(ctx, P, model, it.e, i, W, y, rowH, f, opts);
      else drawUnverified(ctx, P, it.u, W, y, rowH, f, opts.images);
    }
    if (it.t === 'e' && it.e.self) {
      selfItem = { it, i };
      selfVisible = y >= 0 && y + rowH <= listH;
    }
  });
  ctx.restore();
  // pin the viewer's own row when it is scrolled out of the window
  if (selfItem && !selfVisible) {
    const py = listH - rowH;
    ctx.fillStyle = P.card;
    ctx.fillRect(0, py, W, rowH);
    drawEntry(ctx, P, model, selfItem.it.e, selfItem.i, W, py, rowH, f, opts);
  }
  // footer: 最同频 / notes
  const lines = [];
  if (model.matchText) lines.push([model.matchText, P.nationText, 800]);
  if (model.selfOnly) lines.push(['今天好友较多，好友成绩为自报', P.sub, 500]);
  if (!lines.length && model.view !== 'round') lines.push([model.viewerDone ? '再多几位群友答完，就能比出谁最同频' : '完成今日刻度后可看最同频', P.sub, 500]);
  lines.slice(0, 2).forEach((ln, i, arr) => {
    const cy = H - footH + footH * ((i + 0.5) / arr.length);
    txt(ctx, ln[0], W / 2, cy, 16 * f, ln[2], ln[1], 'center', W - 16);
  });
  ctx.fillStyle = P.line;
  ctx.fillRect(10, listH, W - 20, 1);
  if (maxScroll > 0) {
    const bh = Math.max(24, listH * (listH / contentH));
    ctx.fillStyle = P.line;
    ctx.fillRect(W - 3, (listH - bh) * (scroll / maxScroll), 3, bh);
  }
  return { contentHeight: contentH, maxScroll };
}

module.exports = { drawBoard };
