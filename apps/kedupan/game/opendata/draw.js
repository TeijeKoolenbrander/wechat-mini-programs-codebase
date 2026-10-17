/**
 * Draws the open data domain lists onto the shared canvas (spec 8.5, 6.7, 6.8; render/CONTRACT.md "open data domain").
 * Self-contained: the open data context cannot require files outside opendata/, so the few palette constants are repeated here.
 * Pure canvas calls, no wx. Draws what match.buildModel() returns, in the server's order. Never posts anything back.
 *
 *   drawView(ctx, model, opts) -> {contentHeight, maxScroll, viewportHeight, itemEnds, footerTop}
 *   (the list viewport is cut at the last whole item that fits, so no row is half visible above the 最同频 footer; AC 70)
 *   opts: {view: 'group'|'friend'|'round', width, height, scroll, images, palette: 'standard'|'highContrast', scale: 1|1.25,
 *          status: null|'loading'|'readFailed', refs, target, closestH, mode, viewerDone}
 *   model: {rows, peer, selfReported, hasNames}  (match.js)
 *
 * Rows: rank + name ('你', '出题人', the nickname of a match, '群友 A/B/C' otherwise; anonymous rows get no avatar) + the values:
 *   group : 群内 gs and 全国 ns, streak k as "连N" when set
 *   friend: score ns and, when the viewer completed (pos and refs present), a 5-dot strip of how close each card was to the nation
 *   round : the guess as a small ○ (late: dashed), "+s", "差 N 格" from the target, "揭晓后作答" for late, 最懂你 on closestH,
 *           no score for the host row (出题人)
 * Large text (scale 1.25) enlarges the type and rows (100 high), high contrast swaps the palette; shapes never rely on colour.
 */

const STD = {
  ink: '#24211E',
  sub: '#5C5348',
  tile: '#FFFDF8',
  line: 'rgba(36,33,30,0.20)',
  selfFill: 'rgba(240,123,44,0.14)',
  selfLine: '#A8470A',
  pin: 'rgba(251,246,236,0.97)',
  avatar: '#B9AEC0',
  you: '#F07B2C',
  nation: '#2A8C8C',
  nationText: '#1D6666',
  group: '#7D4E8C',
  groupText: '#6D3F7C',
  tag: '#6A3C7C',
  tagInk: '#FFFFFF',
  divider: '#F4EAD3',
};
const HC = {
  ink: '#000000',
  sub: '#1F1F1F',
  tile: '#FFFFFF',
  line: '#5A5A5A',
  selfFill: 'rgba(176,74,0,0.10)',
  selfLine: '#8A3A00',
  pin: '#FFFFFF',
  avatar: '#555555',
  you: '#B04A00',
  nation: '#145F5F',
  nationText: '#0F4C4C',
  group: '#4E2A5C',
  groupText: '#4E2A5C',
  tag: '#000000',
  tagInk: '#FFFFFF',
  divider: '#FFFFFF',
};
const SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

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

/** Text that shrinks to fit maxW down to minSize, then truncates with an ellipsis. Returns the drawn width. */
function txt(ctx, s, x, y, size, weight, color, align, maxW, minSize) {
  s = String(s);
  ctx.font = font(size, weight);
  let w = ctx.measureText(s).width;
  if (maxW && w > maxW) {
    ctx.font = font(Math.max(minSize || 16, size * (maxW / w)), weight);
    w = ctx.measureText(s).width;
    if (w > maxW) {
      const chars = Array.from(s);
      while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
      s = chars.join('') + '…';
      w = ctx.measureText(s).width;
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  return w;
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
    ctx.fillStyle = row.isSelf ? P.selfLine : P.avatar;
    ctx.fillRect(x, y, size, size);
    txt(ctx, row.isSelf ? '你' : Array.from(row.name || '?')[0], x + size / 2, y + size / 2 + 1, size * 0.5, 700, '#FFFFFF', 'center');
  }
  ctx.restore();
}

function pill(ctx, P, x, y, label, size, align) {
  ctx.font = font(size, 800);
  const w = ctx.measureText(label).width + size * 0.9;
  const h = size * 1.5;
  const px = align === 'right' ? x - w : x;
  ctx.fillStyle = P.tag;
  rr(ctx, px, y - h / 2, w, h, h / 2);
  ctx.fill();
  txt(ctx, label, px + w / 2, y + 1, size, 800, P.tagInk, 'center');
  return w;
}

/** A guess marker: hollow ○ (dashed when late). */
function guessDot(ctx, P, cx, cy, r, late) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = P.group;
  ctx.lineWidth = 2.2;
  if (late) ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * 5-dot strip (friend board): one dot per card, by how far that friend's needle was from the nation's ◆.
 * close (<= 6 steps): solid disc; near (<= 20): ring with a centre dot; far: hollow ring. Shapes, not colours, carry the meaning.
 */
function dotStrip(ctx, P, x, y, r, pos, refs) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (r * 2 + 5) + r;
    const d = Math.abs(pos[i] - refs[i]);
    ctx.beginPath();
    ctx.arc(cx, y, r, 0, Math.PI * 2);
    if (d <= 6) {
      ctx.fillStyle = P.nation;
      ctx.fill();
    } else {
      ctx.strokeStyle = P.nation;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (d <= 20) {
        ctx.beginPath();
        ctx.arc(cx, y, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = P.nation;
        ctx.fill();
      }
    }
  }
}

function parsePos(s) {
  if (typeof s !== 'string') return null;
  const a = s.split(',').map(Number);
  return a.length === 5 && a.every((n) => Number.isInteger(n) && n >= 0 && n <= 100) ? a : null;
}

function drawRow(ctx, P, o, row, y, h, ctxo) {
  const { W, u, fs, large, view } = o;
  ctx.fillStyle = row.isSelf ? P.selfFill : P.tile;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.fill();
  ctx.strokeStyle = row.isSelf ? P.selfLine : P.line;
  ctx.lineWidth = row.isSelf ? 2.5 : 1.5;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.stroke();

  const l1 = large ? y + h * 0.27 : y + h * 0.33;
  const l2 = large ? y + h * 0.6 : y + h * 0.72;
  const nameSize = 18 * u * fs;
  const small = 16 * u * fs;
  let tx = 12 * u;
  if (view !== 'round') {
    const top3 = row.rank <= 3;
    txt(ctx, String(row.rank), 20 * u, large ? y + h * 0.3 : y + h / 2, (top3 ? 22 : 18) * u * fs, 800, P.ink, 'center', 34 * u, 16);
    tx = 40 * u;
  } else {
    guessDot(ctx, P, 18 * u, large ? y + h * 0.3 : y + h / 2, 7 * u, row.late);
    tx = 38 * u;
  }
  if (!row.anonymous && !row.isHost) {
    const as = 38 * u;
    avatar(ctx, P, tx, large ? y + h * 0.3 - as / 2 : y + (h - as) / 2, as, row, ctxo.images);
    tx += as + 10 * u;
  }
  // values on the right
  let rightW = 0;
  const rx = W - 10 * u;
  if (view === 'group') {
    const gs = '群内 ' + row.gs;
    txt(ctx, gs, rx, l1, nameSize + 2 * u, 800, P.groupText, 'right');
    ctx.font = font(nameSize + 2 * u, 800);
    rightW = ctx.measureText(gs).width + 8 * u;
    txt(ctx, '全国 ' + row.ns, rx, l2, small, 700, P.nationText, 'right');
  } else if (view === 'friend') {
    txt(ctx, String(row.ns), rx, l1, 22 * u * fs, 800, P.nationText, 'right');
    ctx.font = font(22 * u * fs, 800);
    rightW = ctx.measureText(String(row.ns)).width + 8 * u;
    const pos = parsePos(row.pos);
    if (pos && o.refs && o.refs.length === 5) dotStrip(ctx, P, rx - 5 * (2 * 5 * u * (large ? 1.2 : 1) + 5) + 5, l2, 5 * u * (large ? 1.2 : 1), pos, o.refs);
  } else {
    // round
    if (row.isHost) {
      // host row: no score
    } else if (row.late) {
      txt(ctx, '揭晓后作答', rx, l2, small, 700, P.sub, 'right');
    } else {
      txt(ctx, '+' + row.s, rx, l1, 22 * u * fs, 800, P.groupText, 'right');
      ctx.font = font(22 * u * fs, 800);
      rightW = ctx.measureText('+' + row.s).width + 8 * u;
      if (o.target != null && row.g != null) txt(ctx, '差 ' + Math.abs(row.g - o.target) + ' 格', rx, l2, small, 700, P.sub, 'right');
    }
  }
  const tag = view === 'round' && o.closestH && row.h === o.closestH ? '最懂你' : null;
  const streak = view === 'group' && row.k >= 2 ? '连' + row.k : null;
  const nameMax = W - tx - rightW - 12 * u;
  const nw = txt(ctx, row.name || '好友', tx, l1, nameSize, 700, P.ink, 'left', nameMax, large ? 20 : 16);
  if (streak) txt(ctx, streak, tx, l2, small, 700, P.selfLine, 'left', W / 2 - tx);
  if (tag) pill(ctx, P, Math.min(tx + nw + 8 * u, W - 96 * u * fs), l2, tag, small, 'left');
  void nw;
}

function drawDivider(ctx, P, W, y, h, u, fs, label) {
  ctx.fillStyle = P.line;
  ctx.fillRect(0, y + h / 2, W, 1);
  ctx.font = font(16 * u * fs, 700);
  const tw = ctx.measureText(label).width + 28 * u;
  ctx.fillStyle = P.divider;
  ctx.fillRect(W / 2 - tw / 2, y + 4, tw, h - 8);
  txt(ctx, label, W / 2, y + h / 2 + 1, 16 * u * fs, 700, P.sub, 'center', null, 16);
}

function wrapLines(ctx, s, maxW, size, weight) {
  ctx.font = font(size, weight);
  const lines = [];
  let line = '';
  Array.from(s).forEach((ch) => {
    if (line && ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
    } else line += ch;
  });
  if (line) lines.push(line);
  return lines;
}

function drawView(ctx, model, opts) {
  const P = opts.palette === 'highContrast' ? HC : STD;
  const large = opts.scale > 1;
  const W = opts.width;
  const H = opts.height;
  const u = Math.max(1, Math.min(1.25, W / 335));
  const fs = large ? 1.25 : 1;
  const view = opts.view || 'group';
  ctx.clearRect(0, 0, W, H);
  const o = { W, u, fs, large, view, refs: opts.refs, target: opts.target, closestH: opts.closestH, images: opts.images };

  const centered = (s) => {
    const lines = wrapLines(ctx, s, W - 24, 18 * u * fs, 600);
    const lh = 26 * u * fs;
    lines.forEach((ln, i) => txt(ctx, ln, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh, 18 * u * fs, 600, P.sub, 'center'));
    return { contentHeight: 0, maxScroll: 0 };
  };
  if (opts.status === 'loading') return centered(view === 'friend' ? '正在读取好友…' : '正在读取…');
  // opts.anonymous (message field `anonymous`): names are unavailable (privacy or scope refused) -> no avatars, no nicknames,
  // no 好友自报 and no 最同频 line, even if a model row happens to be matched. 你 and 出题人 stay.
  const anon = !!opts.anonymous;
  const rows = anon
    ? (model.rows || []).map((r) => (r.isSelf || r.isHost ? Object.assign({}, r, { avatarUrl: null }) : Object.assign({}, r, { anonymous: true, avatarUrl: null, name: r.matched ? '群友' : r.name })))
    : model.rows || [];
  const selfRep = anon ? [] : model.selfReported || [];
  if (!rows.length && !selfRep.length) return centered(view === 'group' ? '本群今天还没有人完成' : view === 'friend' ? '还没有好友完成今日刻度' : '还没有人作答');

  const rowH = (large ? 100 : 66) * u;
  const dividerH = (large ? 44 : 36) * u;
  // footer: 最同频 line (viewer completed, a matched peer exists)
  let footerLines = [];
  const lhF = 22 * u * fs;
  if (model.peer && !anon) {
    footerLines = wrapLines(ctx, '今天和你最同频：' + model.peer.name + '（平均只差 ' + model.peer.gapText + ' 格）', W - 12, 16 * u * fs, 700).slice(0, 2);
  }
  const footerH = footerLines.length ? footerLines.length * lhF + 10 * u : 0;
  const listMax = H - footerH;

  const items = [];
  rows.forEach((r) => items.push({ t: 'r', r }));
  if (selfRep.length) {
    items.push({ t: 'd', label: '好友自报' });
    selfRep.forEach((r) => items.push({ t: 's', r }));
  }
  let contentH = 0;
  // The viewport is cut at an item boundary (the last whole row that fits), so at scroll 0 no row is ever half visible above the
  // footer; the footer is pinned to the bottom of the canvas on its own opaque strip.
  let listH = listMax;
  const ends = [];
  if (items.length) {
    let acc = 0;
    let fit = 0;
    items.forEach((it) => {
      acc += it.t === 'd' ? dividerH : rowH;
      ends.push(acc);
      if (acc <= listMax) fit = acc;
    });
    contentH = acc;
    if (acc > listMax && fit > 0) listH = fit;
  }
  const maxScroll = Math.max(0, contentH - listH);
  const scroll = Math.max(0, Math.min(opts.scroll || 0, maxScroll));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, listH);
  ctx.clip();
  let y = -scroll;
  let selfItem = null;
  let selfVisible = false;
  items.forEach((it) => {
    const h = it.t === 'd' ? dividerH : rowH;
    if (y + h > 0 && y < listH) {
      if (it.t === 'd') drawDivider(ctx, P, W, y, dividerH, u, fs, it.label);
      else if (it.t === 's') drawSelfReported(ctx, P, o, it.r, y, rowH - 6 * u);
      else {
        drawRow(ctx, P, o, it.r, y, rowH - 6 * u, opts);
        if (it.r.isSelf) selfVisible = y >= 0 && y + rowH <= listH;
      }
    }
    if (it.t === 'r' && it.r.isSelf) selfItem = it;
    y += h;
  });
  ctx.restore();
  if (selfItem && !selfVisible) {
    const py = listH - rowH;
    ctx.fillStyle = P.pin;
    ctx.fillRect(0, py - 4, W, rowH + 4);
    drawRow(ctx, P, o, selfItem.r, py, rowH - 6 * u, opts);
  }
  if (footerLines.length) {
    const fy = H - footerH;
    ctx.fillStyle = P.pin;
    ctx.fillRect(0, fy, W, footerH);
    ctx.fillStyle = P.line;
    ctx.fillRect(0, fy, W, 1);
    footerLines.forEach((ln, i) => txt(ctx, ln, W / 2, fy + 5 * u + lhF / 2 + i * lhF, 16 * u * fs, 700, P.nationText, 'center'));
  }
  if (maxScroll > 0) {
    const bh = Math.max(24, listH * (listH / contentH));
    ctx.fillStyle = opts.palette === 'highContrast' ? '#000000' : 'rgba(36,33,30,0.3)';
    ctx.fillRect(W - 3, (listH - bh) * (scroll / maxScroll), 3, bh);
  }
  return { contentHeight: contentH, maxScroll, viewportHeight: listH, itemEnds: ends, footerTop: H - footerH };
}

/** friend selfOnly: "好友自报" rows, no rank number. */
function drawSelfReported(ctx, P, o, r, y, h) {
  const { W, u, fs, large } = o;
  ctx.fillStyle = P.tile;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.fill();
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 1.5;
  rr(ctx, 0, y, W, h, 10 * u);
  ctx.stroke();
  const l1 = large ? y + h * 0.3 : y + h * 0.36;
  const l2 = large ? y + h * 0.68 : y + h * 0.72;
  txt(ctx, r.name, 12 * u, l1, 18 * u * fs, 700, P.ink, 'left', W - 100 * u, 16);
  txt(ctx, r.scoreText, W - 10 * u, l1, 22 * u * fs, 800, P.sub, 'right');
  txt(ctx, r.label || '好友自报', 12 * u, l2, 16 * u * fs, 700, P.sub, 'left');
}

module.exports = { drawView, STD, HC };
