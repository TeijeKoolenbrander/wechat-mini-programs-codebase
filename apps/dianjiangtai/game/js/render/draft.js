/**
 * Draft (spec 8.2). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Draft model plus optional extras (CONTRACT.md):
 *   poolScroll: px scrolled in the pool list (default 0)
 *   flip: 0..1 token flip progress (default 1 when phase != awaitFlip)
 *   notice: string|null (e.g. "此路无将，重新翻令")
 *   coach: 0|1|2 first-run coach mark step (0 = none)
 *   t: ms clock (skeleton pulse)
 *
 * Hit ids: back, primary, undo, respin:faction, respin:era,
 *   respinAd:faction, respinAd:era, pool:<generalId>, pool:list (scroll area),
 *   sheet:close, slot:<slot>, coach:next, coach:skip.
 *
 * The primary button is tappable only in awaitFlip (翻令), placed (下一轮)
 * and readyToMarch (出征); in flipped/selecting it is drawn disabled.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits, clamp } = require('./layout');
const C = T.COLORS;

const MODE_LABEL = { daily: '今日军令', free: '自由点将', challenge: '同签挑战' };

function respinLabel(vm, dim) {
  const r = vm.respin || {};
  const e = r[dim] || { free: 0, enabled: false };
  const word = dim === 'faction' ? '换势力' : '换时代';
  const awaiting = vm.phase === 'awaitFlip';
  if (e.free > 0) {
    return { label: word + ' ×' + e.free, id: 'respin:' + dim, disabled: awaiting || !e.enabled || vm.phase === 'selecting', kind: 'secondary', hint: !e.enabled && !awaiting ? '此令无可换' : null };
  }
  // free re-spin spent
  if (vm.mode === 'free' && r.adAllowed && r.adLeft > 0) {
    const busy = r.adState === 'playing' || r.adState === 'loading';
    return {
      label: r.adState === 'loading' ? '加载中…' : r.adState === 'playing' ? '观看中…' : '视频再换 ×' + r.adLeft,
      id: 'respinAd:' + dim,
      disabled: awaiting || busy || vm.phase === 'selecting',
      kind: 'ad',
    };
  }
  return { label: '已用', id: null, disabled: true, kind: 'secondary' };
}

function draw(ctx, vm, L) {
  const hits = new Hits();
  W.paper(ctx, L);
  const x = L.x0;
  const cw = L.contentW;
  const phase = vm.phase;
  const compact = L.compact;

  // ---- header ----
  W.backButton(ctx, L, hits, '返回', 'back');
  let y = L.navBottom + L.u(2);
  W.text(ctx, MODE_LABEL[vm.mode] || '', x, y + L.u(14), { size: T.FS.bodyL + 2, weight: 800, serif: true });
  W.text(ctx, '第 ' + vm.round + ' / 5 轮', x + cw, y + L.u(14), { size: T.FS.bodyL + 2, weight: 800, serif: true, align: 'right' });
  y += L.u(32);

  // ---- tokens + re-spin ----
  const colW = (cw - L.u(12)) / 2;
  const tokH = L.u(compact ? 48 : 64);
  const flip = vm.flip != null ? vm.flip : phase === 'awaitFlip' ? 0 : 1;
  const tk = vm.tokens;
  const facFace = tk ? { label: tk.faction.label, color: tk.faction.color || T.factionColor(tk.faction.key) } : null;
  const eraFace = tk ? { label: tk.era.label, color: C.lacquer, textColor: C.lacquerGold } : null;
  const buttons = [
    ['faction', facFace, x],
    ['era', eraFace, x + colW + L.u(12)],
  ];
  const btnH = L.u(48);
  buttons.forEach(([dim, face, bx]) => {
    W.token(ctx, bx, y, colW, tokH, face, flip);
    const rl = respinLabel(vm, dim);
    W.button(ctx, L, hits, { id: rl.id, x: bx, y: y + tokH + L.u(6), w: colW, h: btnH, label: rl.label, kind: rl.kind, disabled: rl.disabled, size: T.FS.body + 1 });
  });
  y += tokH + L.u(6) + btnH + L.u(compact ? 6 : 10);

  // notice line (reflip etc.)
  if (vm.notice) {
    W.text(ctx, vm.notice, L.cx, y + L.u(10), { size: T.FS.body, color: C.seal, align: 'center', weight: 700, maxW: cw });
    y += L.u(24);
  }

  // ---- bottom block: primary row, lineup ----
  const primH = L.u(compact ? 54 : 58);
  const primY = L.bottomEdge - L.bottomPad - primH;

  const chipH = L.u(46);
  const chipGap = L.u(6);
  const lineupH = L.u(26) + chipH * 2 + chipGap;
  const lineupY = primY - L.u(compact ? 6 : 10) - lineupH;

  // ---- pool ----
  const poolHeadH = L.u(28);
  const poolTop = y + poolHeadH;
  const poolBottom = lineupY - L.u(4);
  const poolH = Math.max(L.u(100), poolBottom - poolTop);
  const pool = vm.pool || [];
  W.text(ctx, '可点之将' + (phase === 'awaitFlip' || !tk ? '' : ' (' + pool.length + ')'), x, y + L.u(14), { size: T.FS.bodyL, weight: 800, serif: true });
  if (phase === 'flipped') W.text(ctx, '轻点选一员', x + cw, y + L.u(14), { size: T.FS.body, color: C.sub, align: 'right' });
  drawPool(ctx, vm, L, hits, x, poolTop, cw, poolH);

  // ---- lineup ----
  drawLineup(ctx, vm, L, x, lineupY, cw, chipH, chipGap);

  // ---- primary row ----
  const primEnabled = phase === 'awaitFlip' || phase === 'placed' || phase === 'readyToMarch';
  let px = x;
  let pw = cw;
  if (vm.canUndo) {
    const uw = L.u(92);
    W.button(ctx, L, hits, { id: 'undo', x, y: primY, w: uw, h: primH, label: '撤回', kind: 'secondary', size: T.FS.bodyL });
    px = x + uw + L.u(10);
    pw = cw - uw - L.u(10);
  }
  W.button(ctx, L, hits, { id: 'primary', x: px, y: primY, w: pw, h: primH, label: vm.primaryLabel || '翻令', kind: 'primary', disabled: !primEnabled });

  // ---- selection sheet ----
  let slotHole = null;
  if (vm.selected && phase === 'selecting') slotHole = drawSheet(ctx, vm, L, hits);

  // ---- coach marks ----
  if (vm.coach) drawCoach(ctx, vm, L, hits, { primY, primH, px, pw, poolTop, poolH, x, cw, slotHole });

  return hits.result();
}

function drawPool(ctx, vm, L, hits, x, y, w, h) {
  const pool = vm.pool || [];
  const phase = vm.phase;
  W.fillRR(ctx, x, y, w, h, L.u(12), 'rgba(251,244,226,0.55)');
  W.strokeRR(ctx, x, y, w, h, L.u(12), C.line, 1.5);
  if (phase === 'awaitFlip' || !vm.tokens) {
    W.text(ctx, '轻点「翻令」，翻出势力与时代', L.cx, y + h / 2 - L.u(12), { size: T.FS.bodyL, color: C.sub, align: 'center', maxW: w - L.u(20) });
    W.text(ctx, '这一路的名将会列在这里', L.cx, y + h / 2 + L.u(14), { size: T.FS.body, color: C.sub, align: 'center', maxW: w - L.u(20) });
    return;
  }
  if (!pool.length) {
    W.text(ctx, '此路无将，重新翻令', L.cx, y + h / 2, { size: T.FS.bodyL, color: C.seal, align: 'center', weight: 700 });
    return;
  }
  const rowH = L.u(62);
  const step = rowH + L.u(6);
  const inner = { x: x + L.u(6), y: y + L.u(6), w: w - L.u(12), h: h - L.u(12) };
  const contentH = pool.length * step - L.u(6);
  const maxScroll = Math.max(0, contentH - inner.h);
  hits.scrollMax['pool:list'] = maxScroll;
  const scroll = clamp(vm.poolScroll || 0, 0, maxScroll);
  const selId = vm.selected && vm.selected.generalId;
  const facColor = vm.tokens.faction.color || T.factionColor(vm.tokens.faction.key);

  hits.add('pool:list', inner.x, inner.y, inner.w, inner.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  hits.beginScroll(inner, -scroll);
  pool.forEach((g, i) => {
    const ry = inner.y + i * step - scroll;
    if (ry > inner.y + inner.h || ry + rowH < inner.y) return;
    const rx = inner.x;
    const rw = inner.w - L.u(6);
    const sel = selId === g.id;
    W.card(ctx, rx, ry, rw, rowH, { fill: g.drafted ? 'rgba(251,244,226,0.5)' : C.tile, stroke: sel ? C.seal : C.line, lw: sel ? 3 : 1.5, r: L.u(10) });
    const ms = L.u(44);
    W.monogram(ctx, rx + L.u(8), ry + (rowH - ms) / 2, ms, g.monogram, facColor, { dim: g.drafted });
    const tx = rx + L.u(8) + ms + L.u(10);
    ctx.save();
    if (g.drafted) ctx.globalAlpha = 0.5;
    const nw = W.text(ctx, g.name, tx, ry + L.u(20), { size: T.FS.bodyL + 1, weight: 800, serif: true });
    W.tierBadge(ctx, tx + nw + L.u(8), ry + L.u(20) - L.u(11), L.u(22), g.tier);
    const s = g.stats || {};
    let sx = tx;
    T.STAT_KEYS.forEach((k) => {
      const str = T.STAT_LABEL[k] + s[k];
      const sw = W.text(ctx, str, sx, ry + rowH - L.u(18), { size: T.FS.body, weight: s[k] >= 9 ? 800 : 500, color: s[k] >= 9 ? C.ink : C.sub });
      sx += sw + L.u(compactGap(L));
    });
    ctx.restore();
    if (g.drafted) W.text(ctx, '已点将', rx + rw - L.u(10), ry + L.u(20), { size: T.FS.body, color: C.sub, align: 'right', weight: 700 });
    if (!g.drafted) hits.add('pool:' + g.id, rx, ry, rw, rowH);
  });
  hits.endScroll();
  ctx.restore();
  // scrollbar
  if (maxScroll > 0) {
    const bh = Math.max(L.u(24), inner.h * (inner.h / contentH));
    const by = inner.y + (inner.h - bh) * (scroll / maxScroll);
    W.fillRR(ctx, inner.x + inner.w - 4, by, 3, bh, 1.5, 'rgba(42,33,26,0.35)');
  }
}

function compactGap(L) {
  return L.W < 350 ? 7 : 11;
}

function drawLineup(ctx, vm, L, x, y, w, chipH, gap) {
  W.text(ctx, '我的阵容', x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
  const lineup = vm.lineup || [];
  const cols = 3;
  const cwid = (w - gap * (cols - 1)) / cols;
  const top = y + L.u(26);
  lineup.forEach((e, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cwid + gap);
    const cy = top + row * (chipH + gap);
    const filled = !!e.name;
    W.fillRR(ctx, cx, cy, cwid, chipH, L.u(8), filled ? C.tile : 'rgba(251,244,226,0.35)');
    ctx.save();
    if (!filled) ctx.setLineDash([L.u(4), L.u(3)]);
    W.strokeRR(ctx, cx, cy, cwid, chipH, L.u(8), filled ? (e.fit ? T.FIT_COLOR[e.fit] : C.lineStrong) : C.lineStrong, filled ? 2 : 1.5);
    ctx.restore();
    W.text(ctx, e.label || T.SLOT_LABEL[e.slot] || '', cx + L.u(8), cy + L.u(13), { size: T.FS.body, weight: 700, color: C.sub });
    if (filled && e.fit) W.text(ctx, T.FIT_LABEL[e.fit], cx + cwid - L.u(7), cy + L.u(13), { size: T.FS.body, weight: 700, color: T.FIT_COLOR[e.fit], align: 'right' });
    W.text(ctx, filled ? e.name : '—', cx + L.u(8), cy + L.u(33), { size: T.FS.body + 1, weight: filled ? 800 : 400, serif: filled, color: filled ? C.ink : C.sub, maxW: cwid - L.u(14) });
  });
}

function statCol(ctx, L, x, y, w, key, val) {
  W.text(ctx, T.STAT_LABEL[key], x + w / 2, y + L.u(9), { size: T.FS.body, weight: 600, color: C.sub, align: 'center' });
  W.text(ctx, String(val), x + w / 2, y + L.u(32), { size: T.FS.title + 4, weight: 800, serif: true, color: val >= 9 ? C.seal : C.ink, align: 'center' });
  W.pips(ctx, x + L.u(3), y + L.u(50), w - L.u(6), val, val >= 9 ? C.seal : C.ink);
}

function drawSheet(ctx, vm, L, hits) {
  const sel = vm.selected;
  const g = (vm.pool || []).find((p) => p.id === sel.generalId) || { name: '', monogram: '', tier: null, stats: {} };
  const opts = sel.slotOptions || [];
  const rowsN = Math.ceil(opts.length / 2);
  const noteLines = 2;
  const h = L.u(60) + L.u(70) + L.u(62) + L.u(22) * (1 + noteLines) + L.u(34) + rowsN * L.u(54) + L.u(18) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h, title: '' });
  let y = s.y + L.u(6);
  const facColor = vm.tokens ? vm.tokens.faction.color || T.factionColor(vm.tokens.faction.key) : C.sub;
  const ms = L.u(60);
  W.monogram(ctx, s.x, y, ms, g.monogram, facColor);
  const nx = s.x + ms + L.u(14);
  const nw = W.text(ctx, g.name, nx, y + L.u(20), { size: T.FS.title + 4, weight: 800, serif: true });
  W.tierBadge(ctx, nx + nw + L.u(10), y + L.u(20) - L.u(12), L.u(24), g.tier);
  W.text(ctx, sel.blurb || '', nx, y + L.u(48), { size: T.FS.body, color: C.sub, maxW: s.w - ms - L.u(70) });
  y += ms + L.u(10);

  // stats: five columns with pips
  const colW = s.w / 5;
  T.STAT_KEYS.forEach((k, i) => statCol(ctx, L, s.x + i * colW, y, colW, k, (g.stats || {})[k] || 0));
  y += L.u(68);

  // rationale
  y += W.paragraph(ctx, sel.statNote || '', s.x, y, s.w, L.u(22), { size: T.FS.body, color: C.sub, maxLines: noteLines });
  y += L.u(10);
  W.text(ctx, '放入哪个位置？', s.x, y + L.u(12), { size: T.FS.body + 1, weight: 800 });
  y += L.u(28);

  const gap = L.u(8);
  const bw = (s.w - gap) / 2;
  const hole = { x: s.x - 4, y: y - 4, w: s.w + 8, h: rowsN * (L.u(48) + gap) + 2 };
  opts.forEach((o, i) => {
    const bx = s.x + (i % 2) * (bw + gap);
    const by = y + Math.floor(i / 2) * (L.u(48) + gap);
    const col = T.FIT_COLOR[o.fit] || C.ok;
    W.fillRR(ctx, bx, by, bw, L.u(48), L.u(10), C.tile);
    W.strokeRR(ctx, bx, by, bw, L.u(48), L.u(10), col, 2.5);
    W.text(ctx, o.label || T.SLOT_LABEL[o.slot], bx + L.u(10), by + L.u(24), { size: T.FS.bodyL, weight: 800, serif: true });
    W.text(ctx, Number(o.score).toFixed(1), bx + bw * 0.50, by + L.u(24), { size: T.FS.bodyL, weight: 800, color: C.ink, align: 'center' });
    W.text(ctx, T.FIT_LABEL[o.fit], bx + bw - L.u(10), by + L.u(24), { size: T.FS.body, weight: 700, color: col, align: 'right' });
    hits.add('slot:' + o.slot, bx, by, bw, L.u(48));
  });
  return hole;
}

function dim(ctx, L, hole) {
  ctx.fillStyle = 'rgba(30,22,16,0.62)';
  const { x, y, w, h } = hole;
  ctx.fillRect(0, 0, L.W, y);
  ctx.fillRect(0, y + h, L.W, L.H - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, L.W - x - w, h);
  W.strokeRR(ctx, x, y, w, h, L.u(12), C.lacquerGold, 2.5);
}

function drawCoach(ctx, vm, L, hits, g) {
  const step = vm.coach;
  const steps = {
    1: { text: '第一步：点「翻令」，翻出本轮的势力和时代', hole: { x: g.px - 4, y: g.primY - 4, w: g.pw + 8, h: g.primH + 8 }, above: true },
    2: { text: '第二步：从这里点选一员大将，查看他的五德', hole: { x: g.x, y: g.poolTop, w: g.cw, h: g.poolH }, above: false },
    3: g.slotHole ? { text: '第三步：再点一个位置，把他放进阵容', hole: g.slotHole, above: true } : null,
  };
  const st = steps[step];
  if (!st) return;
  dim(ctx, L, st.hole);
  hits.add('coach:block', 0, 0, L.W, L.H);
  const bw = Math.min(g.cw, L.u(300));
  const bx = L.cx - bw / 2;
  const lines = W.wrap(ctx, st.text, bw - L.u(28), T.FS.bodyL, 700, false);
  const bh = L.u(28) + lines.length * L.u(26) + L.u(52);
  const by = st.above ? st.hole.y - bh - L.u(14) : Math.min(st.hole.y + st.hole.h + L.u(14), L.bottomEdge - bh - L.u(8));
  W.fillRR(ctx, bx, by, bw, bh, L.u(14), C.sheet);
  W.strokeRR(ctx, bx, by, bw, bh, L.u(14), C.lacquerGold, 2);
  lines.forEach((ln, i) => W.text(ctx, ln, bx + L.u(14), by + L.u(22) + i * L.u(26), { size: T.FS.bodyL, weight: 700 }));
  // pointer
  const px = L.cx;
  ctx.fillStyle = C.sheet;
  ctx.beginPath();
  if (st.above) {
    ctx.moveTo(px - L.u(10), by + bh - 1);
    ctx.lineTo(px + L.u(10), by + bh - 1);
    ctx.lineTo(px, by + bh + L.u(10));
  } else {
    ctx.moveTo(px - L.u(10), by + 1);
    ctx.lineTo(px + L.u(10), by + 1);
    ctx.lineTo(px, by - L.u(10));
  }
  ctx.closePath();
  ctx.fill();
  const bY = by + bh - L.u(48);
  W.link(ctx, L, hits, { id: 'coach:skip', x: bx + L.u(14), y: bY + L.u(18), label: '跳过', color: C.sub, size: T.FS.body });
  W.button(ctx, L, hits, { id: 'coach:next', x: bx + bw - L.u(112), y: bY + L.u(2), w: L.u(100), h: L.u(44), label: step === 1 ? '明白了' : '知道了', kind: 'primary', size: T.FS.body + 2 });
}

module.exports = { draw };
