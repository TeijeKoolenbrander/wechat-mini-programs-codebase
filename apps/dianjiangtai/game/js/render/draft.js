/**
 * Draft (spec 8.2). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Draft model (+ v1 additions), plus optional extras (CONTRACT.md):
 *   hidden: boolean       识人 run (spec 8.11): no stats / tier / S_r / fit chips are drawn
 *   variantLabel: '识人'|null
 *   roundFetch: 'idle'|'loading'|'failed'   progressive daily delivery (spec 5.2)
 *   poolScroll: px scrolled in the pool list (large text: the whole body scrolls)
 *   flip: 0..1 token flip progress (default 0 in awaitFlip, else 1)
 *   notice: string|null (e.g. "此路无将，重新翻令")
 *   coach: 0|1|2|3|'shiren'   first-run coach mark step (0 = none)
 *   display, t
 *
 * Hit ids: back, primary, undo, retryRound, respin:faction, respin:era,
 *   respinAd:faction, respinAd:era, pool:<generalId>, pool:list (scroll area),
 *   sheet:close (deselect), sheet:list (scroll area inside the detail sheet),
 *   slot:<slot>, coach:next, coach:skip.
 *
 * The primary button is tappable only in awaitFlip (翻令), placed (下一轮)
 * and readyToMarch (出征), and never while roundFetch is loading/failed.
 *
 * Standard layout: tokens, pool (scrolls inside), lineup, primary. Large text:
 * the primary button stays pinned; tokens, pool rows and the lineup scroll as
 * one page (drag area `pool:list`, offset `poolScroll`).
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

/** Seal descriptor for a pool entry (vm.pool[].seal, with fallbacks for older view models). */
function sealSpec(g, vm, hidden) {
  const s = g.seal || {};
  const key = s.factionKey || (vm.tokens && vm.tokens.faction && vm.tokens.faction.key) || g.factionKey || 'qun';
  return {
    text: s.text || g.name,
    name: g.name,
    monogram: s.monogram || g.monogram,
    factionKey: key,
    inkText: s.inkText,
    tier: hidden ? null : g.tier,
    frame: hidden ? 'plain' : s.frame && s.frame !== 'plain' ? s.frame : g.tier,
  };
}

function tokenFaces(vm) {
  const tk = vm.tokens;
  if (!tk) return { fac: null, era: null };
  const key = tk.faction.key;
  return {
    fac: { label: tk.faction.label, color: T.factionColor(key, tk.faction.color), textColor: T.factionInk(key) },
    era: { label: tk.era.label, color: C.lacquer, textColor: C.lacquerGold },
  };
}

/** Header: mode and round, plus the 识人 tag. Returns the y below it. */
function header(ctx, vm, L, hits, y0) {
  const x = L.x0;
  const cw = L.contentW;
  W.backButton(ctx, L, hits, '返回', 'back');
  let y = y0 + L.u(2);
  W.text(ctx, MODE_LABEL[vm.mode] || '', x, y + L.u(14), { size: T.FS.bodyL + 2, weight: 800, serif: true, maxW: cw * 0.6 });
  W.text(ctx, '第 ' + vm.round + ' / 5 轮', x + cw, y + L.u(14), { size: T.FS.bodyL + 2, weight: 800, serif: true, align: 'right' });
  y += L.u(T.isLarge() ? 38 : 32);
  const label = vm.variantLabel || (vm.hidden ? '识人' : null);
  if (label) {
    const pw = W.pill(ctx, L, x, y + L.u(8), label, { size: T.FS.body });
    W.text(ctx, '五德出征后揭晓', x + pw + L.u(8), y + L.u(8), { size: T.FS.body, color: C.sub, maxW: cw - pw - L.u(8) });
    y += L.u(T.isLarge() ? 38 : 28);
  }
  return y;
}

// ---------------------------------------------------------------- tokens

function tokensBlock(ctx, vm, L, hits, x, y, cw) {
  const large = T.isLarge();
  const compact = L.compact;
  const colW = (cw - L.u(12)) / 2;
  const tokH = L.u(large ? 64 : compact ? 48 : 64);
  const flip = vm.flip != null ? vm.flip : vm.phase === 'awaitFlip' ? 0 : 1;
  const faces = tokenFaces(vm);
  const y0 = y;
  W.token(ctx, x, y, colW, tokH, faces.fac, flip);
  W.token(ctx, x + colW + L.u(12), y, colW, tokH, faces.era, flip);
  y += tokH + L.u(6);
  const btnH = T.btn(L, 48);
  ['faction', 'era'].forEach((dim, i) => {
    const rl = respinLabel(vm, dim);
    if (large) {
      W.button(ctx, L, hits, { id: rl.id, x, y, w: cw, h: btnH, label: rl.label, kind: rl.kind, disabled: rl.disabled, size: T.FS.body + 1 });
      y += btnH + L.u(8);
    } else {
      const bx = x + i * (colW + L.u(12));
      W.button(ctx, L, hits, { id: rl.id, x: bx, y, w: colW, h: btnH, label: rl.label, kind: rl.kind, disabled: rl.disabled, size: T.FS.body + 1 });
    }
  });
  if (!large) y += btnH;
  y += L.u(compact && !large ? 6 : 10);
  return y - y0;
}

function tokensHeight(L) {
  const large = T.isLarge();
  const tokH = L.u(large ? 64 : L.compact ? 48 : 64);
  const btnH = T.btn(L, 48);
  return tokH + L.u(6) + (large ? 2 * btnH + L.u(16) : btnH) + L.u(L.compact && !large ? 6 : 10);
}

// ------------------------------------------------------------- pool rows

function statsText(g) {
  const s = g.stats || {};
  return T.STAT_KEYS.map((k) => ({ str: T.STAT_LABEL[k] + s[k], hi: s[k] >= 9 }));
}

/** Layout of one pool row: returns {h, ...}. Pure measurement unless `paint` is set. */
function poolRow(ctx, L, vm, g, rx, ry, rw, paint, selected, hits) {
  const hidden = !!vm.hidden;
  const large = T.isLarge();
  const seal = L.u(48);
  const padX = L.u(8);
  const textX = rx + padX + seal + L.u(10);
  const textW = rx + rw - L.u(8) - textX;
  const lineH = L.u(large ? 26 : 20);
  const blurbLines = hidden && g.blurb ? W.lineCount(ctx, g.blurb, large ? rw - 2 * padX : textW, T.FS.body, 400, false, 2) : 0;

  let h;
  if (large) {
    const sub = hidden ? blurbLines * lineH : L.u(30);
    h = L.u(8) + seal + L.u(6) + sub + L.u(10);
  } else if (hidden) {
    h = Math.max(L.u(64), L.u(8) + L.u(24) + blurbLines * lineH + L.u(8));
  } else {
    h = L.u(64);
  }
  if (!paint) return h;

  const dimmed = !!g.drafted;
  W.card(ctx, rx, ry, rw, h, { fill: dimmed ? C.poolBg : C.tile, stroke: selected ? C.seal : C.line, lw: selected ? 3 : T.isHC() ? 2 : 1.5, r: L.u(10) });
  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.5;
  const spec = sealSpec(g, vm, hidden);
  W.seal(ctx, rx + padX, ry + (large ? L.u(8) : (Math.min(h, L.u(64)) - seal) / 2), seal, spec, { dpr: L.dpr });
  const topY = large ? ry + L.u(8) : ry;
  const nameY = large ? topY + seal / 2 : ry + L.u(hidden ? 20 : 20);
  const nameSize = T.FS.bodyL + 1;
  const nw = W.text(ctx, g.name, textX, nameY, { size: nameSize, weight: 800, serif: true, maxW: textW * 0.6 });
  let nx = textX + nw + L.u(8);
  if (hidden) {
    if (g.courtesy) W.text(ctx, g.courtesy, nx, nameY, { size: T.FS.body, color: C.sub, maxW: rx + rw - L.u(8) - nx });
  } else {
    const tb = W.tierBadge(ctx, nx, nameY - L.u(11), L.u(22), g.tier);
    nx += tb + L.u(8);
    if (g.appearanceNote && !g.drafted) W.text(ctx, g.appearanceNote, nx, nameY, { size: T.FS.body, color: C.sub, maxW: rx + rw - L.u(8) - nx });
  }
  // detail line
  if (hidden) {
    const bx = large ? rx + padX : textX;
    const by = large ? ry + L.u(8) + seal + L.u(6) : ry + L.u(8) + L.u(24);
    if (!large && g.appearanceNote) {
      // appearance note shares the name line in standard mode; keep the blurb on its own line(s)
    }
    W.paragraph(ctx, g.blurb || '', bx, by, large ? rw - 2 * padX : textW, lineH, { size: T.FS.body, color: C.sub, maxLines: 2 });
  } else {
    const items = statsText(g);
    const baseX = large ? rx + padX : textX;
    const availW = large ? rw - 2 * padX : textW;
    const sy = large ? ry + L.u(8) + seal + L.u(6) + L.u(15) : ry + h - L.u(18);
    const widths = items.map((it) => W.measure(ctx, it.str, T.FS.body, it.hi ? 800 : 500, false));
    const sum = widths.reduce((a, b) => a + b, 0);
    const gap = Math.max(L.u(4), Math.min(L.u(large ? 14 : 11), (availW - sum) / (items.length - 1)));
    let sx = baseX;
    items.forEach((it, i) => {
      W.text(ctx, it.str, sx, sy, { size: T.FS.body, weight: it.hi ? 800 : 500, color: it.hi ? C.ink : C.sub });
      sx += widths[i] + gap;
    });
  }
  ctx.restore();
  if (g.drafted) W.text(ctx, '已点将', rx + rw - L.u(10), large ? ry + L.u(8) + seal / 2 : ry + L.u(20), { size: T.FS.body, color: C.sub, align: 'right', weight: 700 });
  else hits.add('pool:' + g.id, rx, ry, rw, h);
  return h;
}

function poolEmptyHint(ctx, vm, L, x, y, w, h) {
  if (vm.phase === 'awaitFlip' || !vm.tokens) {
    const failed = vm.roundFetch === 'failed';
    if (h < L.u(70)) {
      W.text(ctx, failed ? '令牌尚未送达 · 当前进度已保存' : '轻点「翻令」，翻出势力与时代', L.cx, y + h / 2, { size: T.FS.body, color: C.sub, align: 'center', maxW: w - L.u(16) });
      return true;
    }
    const l1 = failed ? '令牌尚未送达' : '轻点「翻令」，翻出势力与时代';
    const l2 = failed ? '当前进度已保存' : '这一路的名将会列在这里';
    const lines = [[l1, T.FS.bodyL], [l2, T.FS.body]].reduce((acc, [t, sz]) => acc.concat(W.wrap(ctx, t, w - L.u(24), sz, 400, false).map((ln) => [ln, sz])), []);
    const lh = Math.round(T.FS.body * 1.4);
    lines.forEach(([ln, sz], i) => W.text(ctx, ln, L.cx, y + h / 2 + (i - (lines.length - 1) / 2) * lh, { size: sz, color: C.sub, align: 'center', maxW: w - L.u(16) }));
    return true;
  }
  if (!(vm.pool || []).length) {
    W.text(ctx, '此路无将，重新翻令', L.cx, y + h / 2, { size: T.FS.bodyL, color: C.seal, align: 'center', weight: 700 });
    return true;
  }
  return false;
}

function poolHeader(ctx, vm, L, x, y, cw) {
  const pool = vm.pool || [];
  const open = pool.filter((g) => !g.drafted).length;
  const awaiting = vm.phase === 'awaitFlip' || !vm.tokens;
  W.text(ctx, '可点之将' + (awaiting ? '' : ' (' + open + ')'), x, y + L.u(14), { size: T.FS.bodyL, weight: 800, serif: true });
  if (vm.phase === 'flipped') W.text(ctx, '轻点选一员', x + cw, y + L.u(14), { size: T.FS.body, color: C.sub, align: 'right' });
}

// ---------------------------------------------------------------- lineup

function chipMetrics(L, w, gap) {
  const large = T.isLarge();
  const cols = 3;
  return { cols, cwid: (w - gap * (cols - 1)) / cols, chipH: L.u(large ? 94 : 46) };
}

function lineupHeight(L, gap) {
  const m = chipMetrics(L, L.contentW, gap);
  return L.u(T.isLarge() ? 34 : 26) + m.chipH * 2 + gap;
}

function drawLineup(ctx, vm, L, x, y, w, gap) {
  const large = T.isLarge();
  const hidden = !!vm.hidden;
  const m = chipMetrics(L, w, gap);
  W.text(ctx, '我的阵容', x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
  const lineup = vm.lineup || [];
  const top = y + L.u(large ? 34 : 26);
  lineup.forEach((e, i) => {
    const col = i % m.cols;
    const row = Math.floor(i / m.cols);
    const cx = x + col * (m.cwid + gap);
    const cy = top + row * (m.chipH + gap);
    const filled = !!e.name;
    const fit = hidden ? null : e.fit;
    W.fillRR(ctx, cx, cy, m.cwid, m.chipH, L.u(8), filled ? C.tile : C.poolBg);
    ctx.save();
    if (!filled) ctx.setLineDash([L.u(4), L.u(3)]);
    W.strokeRR(ctx, cx, cy, m.cwid, m.chipH, L.u(8), filled ? (fit ? T.FIT_COLOR[fit] : C.lineStrong) : C.lineStrong, filled ? (T.isHC() ? 3 : 2) : 1.5);
    ctx.restore();
    const lx = cx + L.u(8);
    const label = e.label || T.SLOT_LABEL[e.slot] || '';
    const key = e.factionKey;
    const sealS = L.u(large ? 26 : 22);
    const nameW = filled ? W.measure(ctx, e.name, T.FS.body + 1, 800, true) : 0;
    const withSeal = filled && key && m.cwid - L.u(14) - sealS - L.u(4) >= nameW;
    if (large) {
      W.text(ctx, label, lx, cy + L.u(17), { size: T.FS.body, weight: 700, color: C.sub });
      const ny = cy + L.u(47);
      if (withSeal) W.seal(ctx, lx, ny - sealS / 2, sealS, { name: e.name, monogram: e.name.slice(-1), factionKey: key, frame: 'plain' }, { dpr: L.dpr });
      W.text(ctx, filled ? e.name : '—', lx + (withSeal ? sealS + L.u(4) : 0), ny, { size: T.FS.body + 1, weight: filled ? 800 : 400, serif: filled, color: filled ? C.ink : C.sub, maxW: m.cwid - L.u(14) - (withSeal ? sealS + L.u(4) : 0) });
      if (filled && fit) W.text(ctx, T.FIT_LABEL[fit], lx, cy + L.u(76), { size: T.FS.body, weight: 700, color: T.FIT_COLOR[fit] });
    } else {
      W.text(ctx, label, lx, cy + L.u(13), { size: T.FS.body, weight: 700, color: C.sub });
      if (filled && fit) W.text(ctx, T.FIT_LABEL[fit], cx + m.cwid - L.u(7), cy + L.u(13), { size: T.FS.body, weight: 700, color: T.FIT_COLOR[fit], align: 'right' });
      const ny = cy + L.u(33);
      if (withSeal) W.seal(ctx, lx, ny - sealS / 2, sealS, { name: e.name, monogram: e.name.slice(-1), factionKey: key, frame: 'plain' }, { dpr: L.dpr });
      W.text(ctx, filled ? e.name : '—', lx + (withSeal ? sealS + L.u(4) : 0), ny, { size: T.FS.body + 1, weight: filled ? 800 : 400, serif: filled, color: filled ? C.ink : C.sub, maxW: m.cwid - L.u(14) - (withSeal ? sealS + L.u(4) : 0) });
    }
  });
}

// ------------------------------------------------------------------ draw

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  const phase = vm.phase;
  const large = T.isLarge();
  const x = L.x0;
  const cw = L.contentW;

  let y = header(ctx, vm, L, hits, L.navBottom);

  // ---- pinned bottom: primary row ----
  const primH = T.btn(L, L.compact ? 54 : 58);
  const primY = L.bottomEdge - L.bottomPad - primH;
  const fetch = vm.roundFetch || 'idle';
  const primEnabled = (phase === 'awaitFlip' || phase === 'placed' || phase === 'readyToMarch') && fetch === 'idle';
  const primLabel = fetch === 'loading' ? '翻令中…' : vm.primaryLabel || '翻令';
  let px = x;
  let pw = cw;
  if (vm.canUndo) {
    const uw = L.u(large ? 104 : 92);
    W.button(ctx, L, hits, { id: 'undo', x, y: primY, w: uw, h: primH, label: '撤回', kind: 'secondary', size: T.FS.bodyL });
    px = x + uw + L.u(10);
    pw = cw - uw - L.u(10);
  }
  const gap = L.u(6);
  let boundsBottom = primY - L.u(L.compact ? 6 : 10);

  // retry line (progressive delivery failed), above the primary button
  let retryH = 0;
  if (fetch === 'failed') {
    retryH = T.btn(L, 48) + L.u(6);
    const ry = boundsBottom - retryH + L.u(6);
    W.text(ctx, '令牌传递中断', x, ry + T.btn(L, 48) / 2, { size: T.FS.bodyL, weight: 800, serif: true, color: C.seal, maxW: cw - L.u(120) });
    W.button(ctx, L, hits, { id: 'retryRound', x: x + cw - L.u(104), y: ry, w: L.u(104), h: T.btn(L, 48), label: '重试', kind: 'secondary', size: T.FS.body + 1 });
    boundsBottom -= retryH;
  }
  W.button(ctx, L, hits, { id: 'primary', x: px, y: primY, w: pw, h: primH, label: primLabel, kind: 'primary', disabled: !primEnabled });

  let slotHole = null;
  let coachGeo = { primY, primH, px, pw, x, cw };

  if (large) {
    const area = { x: 0, y, w: L.W, h: boundsBottom - y };
    const pool = vm.pool || [];
    // measure body
    const tokH = tokensHeight(L);
    const headH = L.u(32);
    const noticeH = vm.notice ? L.u(30) : 0;
    const rw = cw - L.u(6);
    let poolH;
    const hintOnly = vm.phase === 'awaitFlip' || !vm.tokens || !pool.length;
    if (hintOnly) poolH = L.u(130);
    else poolH = pool.reduce((a, g) => a + poolRow(ctx, L, vm, g, x, 0, rw, false) + L.u(6), L.u(12));
    const lineH = lineupHeight(L, gap);
    const contentH = tokH + noticeH + headH + poolH + L.u(10) + lineH + L.u(10);
    W.scrollBody(ctx, hits, { x: 0, y: area.y, w: L.W, h: area.h }, contentH, vm.poolScroll, 'pool:list', (sc) => {
      let cy = area.y;
      cy += tokensBlock(ctx, vm, L, hits, x, cy, cw);
      if (vm.notice) {
        W.text(ctx, vm.notice, L.cx, cy + L.u(12), { size: T.FS.body, color: C.seal, align: 'center', weight: 700, maxW: cw });
        cy += noticeH;
      }
      poolHeader(ctx, vm, L, x, cy, cw);
      cy += headH;
      if (hintOnly) {
        W.fillRR(ctx, x, cy, cw, poolH, L.u(12), C.poolBg);
        W.strokeRR(ctx, x, cy, cw, poolH, L.u(12), C.line, 1.5);
        poolEmptyHint(ctx, vm, L, x, cy, cw, poolH);
      } else {
        const selId = vm.selected && vm.selected.generalId;
        let ry = cy + L.u(6);
        pool.forEach((g) => {
          const h = poolRow(ctx, L, vm, g, x, ry, rw, true, selId === g.id, hits);
          ry += h + L.u(6);
        });
      }
      cy += poolH + L.u(10);
      drawLineup(ctx, vm, L, x, cy, cw, gap);
      void sc;
    });
  } else {
    const chipLineupH = lineupHeight(L, gap);
    const lineupY = boundsBottom - chipLineupH;
    const tokH = tokensBlock(ctx, vm, L, hits, x, y, cw);
    y += tokH;
    if (vm.notice) {
      W.text(ctx, vm.notice, L.cx, y + L.u(10), { size: T.FS.body, color: C.seal, align: 'center', weight: 700, maxW: cw });
      y += L.u(24);
    }
    const poolHeadH = L.u(28);
    const poolTop = y + poolHeadH;
    const poolBottom = lineupY - L.u(4);
    const poolH = Math.max(L.u(fetch === 'failed' ? 44 : 100), poolBottom - poolTop);
    poolHeader(ctx, vm, L, x, y, cw);
    drawPoolBox(ctx, vm, L, hits, x, poolTop, cw, poolH);
    drawLineup(ctx, vm, L, x, lineupY, cw, gap);
    coachGeo = Object.assign(coachGeo, { poolTop, poolH });
  }

  // ---- selection sheet ----
  if (vm.selected && phase === 'selecting') slotHole = drawSheet(ctx, vm, L, hits);
  coachGeo.slotHole = slotHole;
  if (large && !coachGeo.poolTop) {
    coachGeo.poolTop = y + tokensHeight(L);
    coachGeo.poolH = Math.max(L.u(120), boundsBottom - coachGeo.poolTop);
  }

  if (vm.coach) drawCoach(ctx, vm, L, hits, coachGeo);
  return hits.result();
}

function drawPoolBox(ctx, vm, L, hits, x, y, w, h) {
  const pool = vm.pool || [];
  W.fillRR(ctx, x, y, w, h, L.u(12), C.poolBg);
  W.strokeRR(ctx, x, y, w, h, L.u(12), C.line, T.isHC() ? 2 : 1.5);
  if (poolEmptyHint(ctx, vm, L, x, y, w, h)) return;
  const inner = { x: x + L.u(6), y: y + L.u(6), w: w - L.u(12), h: h - L.u(12) };
  const rw = inner.w - L.u(6);
  const heights = pool.map((g) => poolRow(ctx, L, vm, g, inner.x, 0, rw, false));
  const step = L.u(6);
  const contentH = heights.reduce((a, b) => a + b + step, 0) - step;
  const selId = vm.selected && vm.selected.generalId;
  W.scrollBody(ctx, hits, inner, contentH, vm.poolScroll, 'pool:list', () => {
    let ry = inner.y;
    pool.forEach((g, i) => {
      const h = heights[i];
      // skip rows entirely outside the viewport (cheap culling)
      poolRow(ctx, L, vm, g, inner.x, ry, rw, true, selId === g.id, hits);
      ry += h + step;
    });
  });
}

// ----------------------------------------------------------------- sheet

function statCol(ctx, L, x, y, w, key, val, hidden) {
  const large = T.isLarge();
  W.text(ctx, T.STAT_LABEL[key], x + w / 2, y + L.u(large ? 12 : 9), { size: T.FS.body, weight: 600, color: C.sub, align: 'center' });
  W.text(ctx, hidden ? '？' : String(val), x + w / 2, y + L.u(large ? 42 : 32), { size: T.FS.title + 4, weight: 800, serif: true, color: hidden ? C.sub : val >= 9 ? C.seal : C.ink, align: 'center' });
  W.pips(ctx, x + L.u(3), y + L.u(large ? 66 : 50), w - L.u(6), val, val >= 9 ? C.seal : C.ink, hidden);
}

function drawSheet(ctx, vm, L, hits) {
  const sel = vm.selected;
  const hidden = !!vm.hidden;
  const large = T.isLarge();
  const g = (vm.pool || []).find((p) => p.id === sel.generalId) || { name: '', monogram: '', tier: null, stats: {} };
  const opts = sel.slotOptions || [];
  const oneCol = large;
  const rowsN = oneCol ? opts.length : Math.ceil(opts.length / 2);
  const slotH = T.btn(L, 48);
  const slotGap = L.u(8);
  const sealS = L.u(large ? 80 : 72);
  const sw = Math.min(L.W, 560) - 2 * L.pad;
  const textW = sw - sealS - L.u(14);
  const blurbLines = sel.blurb ? W.lineCount(ctx, sel.blurb, textW, T.FS.body, 400, false, 2) : 0;
  const lineH = L.u(large ? 26 : 22);
  const noteLine = sel.appearanceNote ? 1 : 0;
  const topH = Math.max(sealS, L.u(34) + blurbLines * lineH + noteLine * lineH) + L.u(10);
  const statsH = L.u(large ? 92 : 68);
  const noteLines = hidden || !sel.statNote ? 0 : W.lineCount(ctx, sel.statNote, sw, T.FS.body, 400, false, large ? 4 : 2);
  const noteH = noteLines * lineH + L.u(10);
  const hintH = hidden ? L.u(30) : 0;
  const askH = L.u(large ? 36 : 28);
  const slotsH = rowsN * (slotH + slotGap);
  const contentH = topH + statsH + hintH + noteH + askH + slotsH + L.u(8);
  const wanted = L.u(large ? 68 : 60) + contentH + L.u(14) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h: Math.min(wanted, L.H - L.navBottom), title: '' });
  const area = { x: s.x, y: s.top - L.u(large ? 36 : 40), w: s.w, h: s.bottom - (s.top - L.u(large ? 36 : 40)) };
  let hole = null;

  W.scrollBody(ctx, hits, area, contentH, vm.sheetScroll, 'sheet:list', (sc) => {
    let y = area.y + L.u(2);
    const spec = sealSpec(Object.assign({}, g, { seal: sel.seal || g.seal }), vm, hidden);
    W.seal(ctx, s.x, y, sealS, Object.assign({}, spec, { factionKey: (sel.seal && sel.seal.factionKey) || (g.faction) || spec.factionKey }), { dpr: L.dpr, full: true });
    const nx = s.x + sealS + L.u(14);
    const nw = W.text(ctx, g.name, nx, y + L.u(20), { size: T.FS.title + 4, weight: 800, serif: true, maxW: textW * 0.7 });
    if (!hidden) W.tierBadge(ctx, nx + nw + L.u(10), y + L.u(20) - L.u(12), L.u(24), g.tier);
    else if (g.courtesy) W.text(ctx, g.courtesy, nx + nw + L.u(10), y + L.u(20), { size: T.FS.body, color: C.sub, maxW: textW - nw - L.u(10) });
    let ty = y + L.u(34);
    if (sel.blurb) ty += W.paragraph(ctx, sel.blurb, nx, ty, textW, lineH, { size: T.FS.body, color: C.sub, maxLines: 2 });
    if (sel.appearanceNote) W.text(ctx, sel.appearanceNote, nx, ty + lineH / 2, { size: T.FS.body, color: C.seal, weight: 700, maxW: textW });
    y += topH;

    // stats: five columns with pips ('？' until the verdict in a 识人 run)
    const colW = s.w / 5;
    T.STAT_KEYS.forEach((k, i) => statCol(ctx, L, s.x + i * colW, y, colW, k, (g.stats || {})[k] || 0, hidden));
    y += statsH;
    if (hidden) {
      W.text(ctx, '五德出征后揭晓', s.x + s.w / 2, y - L.u(8) + hintH / 2, { size: T.FS.body, color: C.sub, align: 'center', maxW: s.w });
      y += hintH;
    }
    if (!hidden && sel.statNote) y += W.paragraph(ctx, sel.statNote, s.x, y, s.w, lineH, { size: T.FS.body, color: C.sub, maxLines: large ? 4 : 2 });
    y += L.u(10);
    W.text(ctx, '放入哪个位置？', s.x, y + L.u(12), { size: T.FS.body + 1, weight: 800 });
    y += askH;

    const bw = oneCol ? s.w : (s.w - slotGap) / 2;
    hole = { x: s.x - 4, y: y - 4 - sc, w: s.w + 8, h: rowsN * (slotH + slotGap) - slotGap + 8 };
    opts.forEach((o, i) => {
      const bx = oneCol ? s.x : s.x + (i % 2) * (bw + slotGap);
      const by = y + (oneCol ? i : Math.floor(i / 2)) * (slotH + slotGap);
      const col = hidden ? C.lineStrong : T.FIT_COLOR[o.fit] || C.ok;
      W.fillRR(ctx, bx, by, bw, slotH, L.u(10), C.tile);
      W.strokeRR(ctx, bx, by, bw, slotH, L.u(10), col, T.isHC() ? 3 : 2.5);
      const label = o.label || T.SLOT_LABEL[o.slot];
      if (hidden || o.score == null) {
        W.text(ctx, label, bx + bw / 2, by + slotH / 2, { size: T.FS.bodyL, weight: 800, serif: true, align: 'center' });
      } else {
        W.text(ctx, label, bx + L.u(10), by + slotH / 2, { size: T.FS.bodyL, weight: 800, serif: true });
        W.text(ctx, Number(o.score).toFixed(1), bx + bw * 0.50, by + slotH / 2, { size: T.FS.bodyL, weight: 800, color: C.ink, align: 'center' });
        W.text(ctx, T.FIT_LABEL[o.fit] || '', bx + bw - L.u(10), by + slotH / 2, { size: T.FS.body, weight: 700, color: col, align: 'right' });
      }
      hits.add('slot:' + o.slot, bx, by, bw, slotH);
    });
  });
  if (hole) {
    // clamp to the visible sheet area for the coach spotlight
    const y1 = Math.max(hole.y, area.y);
    const y2 = Math.min(hole.y + hole.h, area.y + area.h);
    hole = { x: hole.x, y: y1, w: hole.w, h: Math.max(L.u(40), y2 - y1) };
  }
  return hole;
}

// ----------------------------------------------------------------- coach

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
    shiren: { text: '识人军令：五德暂不显示，凭你对三国人物的了解点将。出征后揭晓。', hole: null, above: false },
  };
  const st = steps[step];
  if (!st) return;
  if (st.hole) dim(ctx, L, st.hole);
  else {
    ctx.fillStyle = 'rgba(30,22,16,0.62)';
    ctx.fillRect(0, 0, L.W, L.H);
  }
  hits.add('coach:block', 0, 0, L.W, L.H);
  const bw = Math.min(g.cw, L.u(T.isLarge() ? 340 : 300));
  const bx = L.cx - bw / 2;
  const lineH = L.u(T.isLarge() ? 30 : 26);
  const lines = W.wrap(ctx, st.text, bw - L.u(28), T.FS.bodyL, 700, false);
  const btnH = T.btn(L, 44);
  const bh = L.u(24) + lines.length * lineH + L.u(10) + btnH + L.u(12);
  let by;
  if (!st.hole) by = Math.max(L.navBottom + L.u(10), (L.H - bh) / 2);
  else if (st.above) by = Math.max(L.navBottom, st.hole.y - bh - L.u(14));
  else by = Math.max(L.navBottom, Math.min(st.hole.y + st.hole.h + L.u(14), L.bottomEdge - bh - L.u(8)));
  if (st.hole && st.above && by + bh + L.u(14) > st.hole.y) by = Math.max(L.navBottom, st.hole.y - bh - L.u(14));
  W.fillRR(ctx, bx, by, bw, bh, L.u(14), C.sheet);
  W.strokeRR(ctx, bx, by, bw, bh, L.u(14), C.lacquerGold, 2);
  lines.forEach((ln, i) => W.text(ctx, ln, bx + L.u(14), by + L.u(14) + lineH / 2 + i * lineH, { size: T.FS.bodyL, weight: 700 }));
  if (st.hole) {
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
  }
  const bY = by + bh - btnH - L.u(10);
  if (step !== 'shiren') W.link(ctx, L, hits, { id: 'coach:skip', x: bx + L.u(14), y: bY + btnH / 2, label: '跳过', color: C.sub, size: T.FS.body });
  W.button(ctx, L, hits, { id: 'coach:next', x: bx + bw - L.u(120), y: bY, w: L.u(108), h: btnH, label: step === 1 ? '明白了' : '知道了', kind: 'primary', size: T.FS.body + 2 });
}

module.exports = { draw, clamp };
