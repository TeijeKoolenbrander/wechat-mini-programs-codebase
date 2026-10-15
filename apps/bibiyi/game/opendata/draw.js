/**
 * Draws the board model onto the shared canvas (spec 6.9, 6.10, 8).
 * Self-contained (the open data domain cannot require files outside its
 * folder), so the few theme constants are repeated here.
 *
 * drawBoard(ctx, model, opts)
 *   opts: {width, height, scroll, images, message, largeText, highContrast}
 *   images: {avatarUrl: Image|Canvas} loaded avatars (placeholder if missing)
 *   message: string|null  inline status (e.g. read failure) instead of rows
 * Returns {contentHeight, maxScroll}.
 */

const STD = { ink: '#1F2328', sub: '#58606A', seal: '#B8432F', card: '#FFFFFF', paper: '#FAF7F0', amber: '#8A5A00', line: 'rgba(31,35,40,0.16)', avatar: '#B8B2A3' };
const HC = { ink: '#000000', sub: '#262B31', seal: '#8E1F10', card: '#FFFFFF', paper: '#FFFFFF', amber: '#5A3F00', line: '#000000', avatar: '#777777' };
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC",serif';

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
      /* placeholder next frame */
    }
  } else {
    ctx.fillStyle = row.self ? P.seal : P.avatar;
    ctx.fillRect(x, y, size, size);
    txt(ctx, row.self ? '你' : (row.name || '?').slice(0, 1), x + size / 2, y + size / 2 + 1, size * 0.5, 700, '#fff', 'center', true, 0, 10);
  }
  ctx.restore();
}

function drawBoard(ctx, model, opts) {
  const P = opts.highContrast ? HC : STD;
  const W = opts.width;
  const H = opts.height;
  const k = opts.largeText ? 1.25 : 1;
  const u = Math.max(1, Math.min(1.25, W / 335)) * k;
  const body = 16 * k;
  ctx.clearRect(0, 0, W, H);

  const footerH = 34 * u;
  const rowH = 66 * u;
  const dividerH = 36 * u;

  if (opts.message) {
    txt(ctx, opts.message, W / 2, H / 2, 18 * u, 600, P.sub, 'center', false, W - 24, body);
    return { contentHeight: 0, maxScroll: 0 };
  }
  if (!model.ranked.length && !model.unverified.length) {
    txt(ctx, model.kind === 'group' ? '本群今天还没有人参加' : '还没有好友参加，叫上他们？', W / 2, H / 2, 18 * u, 600, P.sub, 'center', false, W - 24, body);
    return { contentHeight: 0, maxScroll: 0 };
  }

  const listH = H - footerH;
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
      if (it.t === 'd') drawDivider(ctx, P, W, y, dividerH, u, model.unverifiedLabel, body);
      else {
        drawRow(ctx, P, model, it, W, y, rowH - 6 * u, u, body, opts);
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
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, py - 4, W, rowH + 4);
    drawRow(ctx, P, model, selfItem, W, py, rowH - 6 * u, u, body, opts);
  }

  const note = model.selfOnly ? '今日参加人数较多，好友成绩暂未校验' : '已参加 ' + model.ranked.length + ' 人 · 成绩经服务器校验';
  txt(ctx, note, W / 2, H - footerH / 2, body, 500, P.sub, 'center', false, W - 8, body);
  if (maxScroll > 0) {
    const bh = Math.max(24, listH * (listH / contentH));
    ctx.fillStyle = 'rgba(31,35,40,0.3)';
    ctx.fillRect(W - 3, (listH - bh) * (scroll / maxScroll), 3, bh);
  }
  return { contentHeight: contentH, maxScroll };
}

function drawDivider(ctx, P, W, y, h, u, label, body) {
  ctx.fillStyle = P.line;
  ctx.fillRect(0, y + h / 2, W, 1);
  ctx.font = font(body, 700, false);
  const tw = ctx.measureText(label).width + 28 * u;
  ctx.fillStyle = P.paper;
  ctx.fillRect(W / 2 - tw / 2, y + 4, tw, h - 8);
  txt(ctx, label, W / 2, y + h / 2 + 1, body, 700, P.amber, 'center', false, 0, body);
}

function drawRow(ctx, P, model, it, W, y, h, u, body, opts) {
  const r = it.r;
  const ranked = it.t === 'r';
  ctx.fillStyle = r.self ? 'rgba(184,67,47,0.10)' : P.card;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.fill();
  ctx.strokeStyle = r.self ? P.seal : P.line;
  ctx.lineWidth = r.self ? 2 : 1.5;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.stroke();

  // rank number (ranked rows only; never for unverified). Ties share it.
  if (ranked) {
    const top3 = r.rank <= 3;
    txt(ctx, String(r.rank), 22 * u, y + h / 2, (top3 ? 22 : 18) * u, 800, top3 ? P.seal : P.ink, 'center', true, 0, body);
  } else {
    txt(ctx, '-', 22 * u, y + h / 2, 18 * u, 600, P.sub, 'center', false, 0, body);
  }
  const as = 40 * u;
  const ax = 42 * u;
  avatar(ctx, P, ax, y + (h - as) / 2, as, r, opts.images);
  const tx = ax + as + 10 * u;
  // right: 连对 N
  ctx.font = font(22 * u, 800, true);
  const numW = ctx.measureText(String(r.n)).width;
  ctx.font = font(body, 600, false);
  const labW = ctx.measureText('连对 ').width;
  const recW = numW + labW + 6 * u;
  txt(ctx, String(r.n), W - 10 * u, y + h * 0.36, 22 * u, 800, ranked ? P.ink : P.sub, 'right', true, 0, body);
  txt(ctx, '连对', W - 10 * u - numW - 6 * u, y + h * 0.36, body, 600, P.sub, 'right', false, 0, body);
  txt(ctx, r.name || '好友', tx, y + h * 0.36, 18 * u, 700, P.ink, 'left', false, W - tx - recW - 18 * u, body);
  // second line
  const ly = y + h * 0.74;
  if (ranked) {
    if (r.k >= 2) txt(ctx, '连续' + r.k + '天', tx, ly, body, 600, P.sub, 'left', false, W - tx - 8 * u, body);
  } else {
    txt(ctx, model.unverifiedLabel, tx, ly, body, 700, P.amber, 'left', false, 0, body);
  }
}

module.exports = { drawBoard };
