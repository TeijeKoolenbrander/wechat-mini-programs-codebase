/**
 * Host rounds, guess side and host side (spec 6.6, 6.7; CONTRACT "round"). draw(ctx, vm, layout) -> hitAreas.
 * vm = Round (spec 10) + {display, t, revealT, needle, phase, canConfirm, hint, sharedCanvas, listScroll, hostBand, late}.
 * Hit ids: round:back, round:home, round:ruler, round:nudgeL, round:nudgeR, round:primary, round:reveal, round:reshare,
 * round:late, round:view, round:shareReveal, round:hostAgain, round:subscribe, round:retry, round:daily, round:list, round:scroll,
 * round:report (举报 on a shown typed clue) and the report sheet's clueReport:reason:<r>, clueReport:submit, clueReport:cancel.
 * A round entered by its host never shows the guess controls (OWN_ROUND): the host sees hostWaiting or the reveal.
 * The renderer never computes a position: it draws vm.needle and vm.reveal.markers and reports hitAreas.ruler.
 */

const T = require('./theme');
const W = require('./widgets');
const ruler = require('./ruler');
const play = require('./play');
const CS = require('./clueSheets');
const { Hits } = require('./layout');
const C = T.COLORS;

/**
 * Size of the open data list on the reveal view (logic sizes the shared canvas and postMessage width/height from this). The reveal
 * page scrolls (round:scroll) with the list inside it, so only w and h matter; x and y are nominal.
 */
function listRect(L, display) {
  const large = !!(display && display.largeText);
  const free = L.H - L.navBottom;
  const h = Math.max(L.u(large ? 200 : 150), Math.min(L.u(large ? 360 : 300), free * (large ? 0.45 : 0.38)));
  return { x: L.x0, y: L.navBottom + L.u(large ? 270 : 238), w: L.contentW, h };
}

/** Fixed renderer-owned string (js/render/CONTRACT.md). */
const VIEW_HINT = '看了答案就不能再猜了';

function para(ctx, L, str, o) {
  const lh = Math.round((o.size || T.FS.bodyL) * 1.4);
  const n = W.wrap(ctx, str, o.w, o.size || T.FS.bodyL, o.weight || 600).length;
  return {
    h: n * lh,
    draw: (c, x, y, ww) => W.paragraph(c, str, x, y, ww, lh, { size: o.size || T.FS.bodyL, weight: o.weight || 600, color: o.color || C.ink, align: o.align || 'center' }),
  };
}

function specLine(ctx, L, vm, w) {
  const size = T.FS.prompt;
  return {
    h: Math.round(size * 1.3),
    draw: (c, x, y, ww) => W.text(c, vm.left + ' ↔ ' + vm.right, x + ww / 2, y + Math.round(size * 1.3) / 2, { size, weight: 800, align: 'center', maxW: ww, minSize: T.FS.title }),
  };
}

/**
 * The clue line (spec 6.6, 6.7), finished by logic (vm.clueText): a typed clue in 「」, a preset, the legacy chat line, or the hidden /
 * paused placeholder. 举报 (round:report) sits at the right of the line only while vm.canReport (shown typed clue, not the host); a
 * placeholder is greyed. vm.clueSubText (hidden / paused while guessing is possible) is the second line. The text is wrapped inside a
 * column that leaves room for 举报 on both sides so it stays centred.
 */
function clueBlock(ctx, L, hits, vm, w) {
  const size = T.FS.bodyL;
  const lh = Math.round(size * 1.4);
  // 举报 needs its own width plus a gap on BOTH sides (the text stays centred). When the text would wrap in that narrower column, the
  // text takes the full width and 举报 goes on its own row below it (right-aligned, 48 pt tap band), so it never touches a character.
  const linkW = vm.canReport ? W.measure(ctx, '举报', T.FS.body, 700) : 0;
  const reserve = vm.canReport ? linkW + L.u(16) + L.u(12) : 0;
  let lines = W.wrap(ctx, vm.clueText || '', w - 2 * reserve, size, 700);
  const ownRow = vm.canReport && lines.length > 1;
  if (ownRow) lines = W.wrap(ctx, vm.clueText || '', w, size, 700);
  const slh = Math.round(T.FS.body * 1.4);
  const sub = vm.clueSubText ? W.wrap(ctx, vm.clueSubText, w, T.FS.body, 600) : [];
  const textH = lines.length * lh;
  const main = ownRow ? textH + T.MIN_TAP : Math.max(textH, vm.canReport ? T.MIN_TAP : 0);
  const placeholder = vm.clueState === 'hidden' || vm.clueState === 'paused' || vm.clueMode === 'chat';
  return {
    h: main + sub.length * slh,
    draw: (c, x, y, ww) => {
      const top = ownRow ? y : y + (main - textH) / 2;
      lines.forEach((ln, i) => W.text(c, ln, x + ww / 2, top + i * lh + lh / 2, { size, weight: 700, color: placeholder ? C.sub : C.youText, align: 'center' }));
      if (vm.canReport) W.link(c, L, hits, { id: 'round:report', x: x + ww - L.u(16), y: ownRow ? y + textH + T.MIN_TAP / 2 : y + main / 2, label: '举报', size: T.FS.body, align: 'right', color: C.sub });
      sub.forEach((ln, i) => W.text(c, ln, x + ww / 2, y + main + i * slh + slh / 2, { size: T.FS.body, weight: 600, color: C.sub, align: 'center' }));
    },
  };
}

function subscribeBlock(ctx, L, hits, vm, w) {
  const st = vm.subscribe && vm.subscribe.state;
  if (st !== 'offer' && st !== 'requesting' && st !== 'granted') return null; // hidden | declined | unavailable draw nothing (AC 62)
  const h = Math.max(T.btn(L, 56), L.u(56));
  return {
    h,
    draw: (c, x, y, ww) => {
      W.fillRR(c, x, y, ww, h, L.u(12), C.tintPrimary);
      W.strokeRR(c, x, y, ww, h, L.u(12), C.primary, T.isHC() ? 2 : 1);
      if (st === 'granted') {
        W.iconCheck(c, x + L.u(24), y + h / 2, L.u(16), C.good);
        W.text(c, '已开启提醒', x + L.u(44), y + h / 2, { size: T.FS.bodyL, weight: 700, color: C.good });
        return;
      }
      const bw = L.u(T.isLarge() ? 110 : 96);
      W.text(c, '揭晓时提醒我', x + L.u(14), y + h / 2, { size: T.FS.bodyL, weight: 700, maxW: ww - bw - L.u(30) });
      W.button(c, L, hits, { id: 'round:subscribe', x: x + ww - bw - L.u(8), y: y + (h - T.minBtn()) / 2, w: bw, h: T.minBtn(), label: '提醒我', size: T.FS.body, kind: 'secondary', disabled: st === 'requesting' });
    },
  };
}

function legend(ctx, L, vm, w) {
  const items = [['target', '目标'], ['member', '猜测']];
  if (vm.reveal && vm.reveal.markers.some((m) => m.kind === 'you')) items.push(['you', '你']);
  if (vm.reveal && vm.reveal.markers.some((m) => m.kind === 'late')) items.push(['late', '揭晓后作答']);
  const rowH = Math.round(T.FS.body * 1.6);
  const gap = L.u(14);
  const iw = L.u(18);
  const wid = items.map((it) => iw + 6 + W.measure(ctx, it[1], T.FS.body, 600));
  // greedy rows so the legend never runs past the screen edge
  const rows = [[]];
  let cur = 0;
  items.forEach((it, i) => {
    if (rows[rows.length - 1].length && cur + gap + wid[i] > w) {
      rows.push([]);
      cur = 0;
    }
    cur += (rows[rows.length - 1].length ? gap : 0) + wid[i];
    rows[rows.length - 1].push(i);
  });
  return {
    h: rows.length * rowH,
    draw: (c, x, y, ww) => {
      rows.forEach((row, ri) => {
        const tw = row.reduce((s2, i, k) => s2 + wid[i] + (k ? gap : 0), 0);
        let cx = x + (ww - tw) / 2;
        const cy = y + ri * rowH + rowH / 2;
        row.forEach((i) => {
          const it = items[i];
          const ix = cx + iw / 2;
          if (it[0] === 'target') ruler.drawTarget(c, ix, cy, L.u(16), L.u(6));
          else if (it[0] === 'member') ruler.drawMember(c, ix, cy, L.u(6), false);
          else if (it[0] === 'late') ruler.drawMember(c, ix, cy, L.u(6), true);
          else ruler.drawYou(c, ix, cy + L.u(7), L.u(14), {});
          W.text(c, it[1], cx + iw + 6, cy, { size: T.FS.body, weight: 600, color: C.sub });
          cx += wid[i] + gap;
        });
      });
    },
  };
}

function stateScreen(ctx, L, hits, top, title, text, buttons) {
  const mid = top + (L.bottomEdge - top) * 0.28;
  W.stateMessage(ctx, L, hits, { y: mid, title, text, buttons });
}

function drawBase(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  const top = W.frame(ctx, L, hits, { backId: 'round:back' });
  const w = L.contentW;
  const bh = T.btn(L, 52);
  const gap = L.u(10);
  const status = vm.status;

  if (status === 'loading') {
    W.text(ctx, '展开题目…', L.cx, top + L.u(60), { size: T.FS.title, weight: 800, align: 'center' });
    W.skeleton(ctx, L.x0 + w * 0.2, top + L.u(96), w * 0.6, L.u(30), vm.t);
    W.skeleton(ctx, L.x0 + w * 0.3, top + L.u(140), w * 0.4, L.u(22), vm.t);
    W.skeleton(ctx, L.x0 + L.u(16), top + L.u(200), w - L.u(32), L.u(60), vm.t);
    return hits.result();
  }

  if (status === 'open') {
    const g = play.geometry(L, { secondary: true });
    const needle = vm.needle == null ? null : vm.needle;
    const rg = ruler.draw(ctx, L, { x: 0, y: g.rulerY, w: L.W, left: vm.left, right: vm.right, needle, markers: [], interactive: true, locked: vm.phase === 'submitting', revealT: 0, t: vm.t, hint: needle == null ? vm.hint : null, display: vm.display });
    ruler.addHit(hits, 'round:ruler', rg, L);
    const pr = play.primaryRect(L, g);
    play.nudges(ctx, L, hits, g, 'round', needle != null && vm.phase !== 'submitting', L.x0, L.x0 + L.contentW);
    const sub = vm.phase === 'submitting';
    W.button(ctx, L, hits, { id: 'round:primary', x: pr.x, y: g.primaryY, w: pr.w, h: g.bh, label: sub ? '提交中…' : '就这儿', kind: 'primary', disabled: sub || !vm.canConfirm });
    W.button(ctx, L, hits, { id: 'round:home', x: L.x0, y: g.secondaryY, w, h: g.bh, label: '先去首页看看', kind: 'ghost' });
    const blocks = [
      para(ctx, L, '群友出了一道刻度题', { w, size: T.FS.bodyL, weight: 700, color: C.sub }),
      specLine(ctx, L, vm, w),
      clueBlock(ctx, L, hits, vm, w),
      para(ctx, L, vm.guessCountText, { w, size: T.FS.body, weight: 600, color: C.sub }),
    ];
    const area = { x: L.x0, y: top + L.u(2), w, h: g.rulerY - L.u(6) - (top + L.u(2)) };
    const total = blocks.reduce((s, b, i) => s + b.h + (i ? L.u(8) : 0), 0);
    const a2 = total <= area.h ? { x: area.x, y: area.y + (area.h - total) / 2, w: area.w, h: total } : area;
    W.stack(ctx, L, hits, a2, blocks, vm.scrollY || 0, 'round:scroll', L.u(8));
    return hits.result();
  }

  if (status === 'submitted') {
    const blocks = [
      para(ctx, L, '已提交', { w, size: T.FS.hero * 0.8, weight: 800, align: 'center' }),
      specLine(ctx, L, vm, w),
      para(ctx, L, vm.guessCountText, { w, size: T.FS.bodyL, weight: 700, color: C.primary }),
      para(ctx, L, vm.revealHint, { w, size: T.FS.body, weight: 600, color: C.sub }),
    ];
    const sb = subscribeBlock(ctx, L, hits, vm, w);
    if (sb) blocks.push(sb);
    const py = L.bottomEdge - L.bottomPad - bh;
    W.button(ctx, L, hits, { id: 'round:home', x: L.x0, y: py, w, h: bh, label: '回首页', kind: 'primary' });
    const area = { x: L.x0, y: top + L.u(8), w, h: py - L.u(12) - (top + L.u(8)) };
    W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'round:scroll', L.u(12));
    return hits.result();
  }

  if (status === 'hostWaiting') {
    const py = L.bottomEdge - L.bottomPad - bh;
    const ry = py - L.u(8) - bh;
    W.button(ctx, L, hits, { id: 'round:reveal', x: L.x0, y: ry, w, h: bh, label: '揭晓', kind: 'primary', disabled: !vm.canReveal });
    W.button(ctx, L, hits, { id: 'round:reshare', x: L.x0, y: py, w, h: bh, label: '再发到群里', kind: 'secondary' });
    const blocks = [
      specLine(ctx, L, vm, w),
      clueBlock(ctx, L, hits, vm, w),
      {
        h: ruler.height(L),
        draw: (c, x, y) => ruler.draw(c, L, { x: 0, y, w: L.W, left: vm.left, right: vm.right, needle: null, markers: [], band: vm.hostBand || null, interactive: false, revealT: 1, t: vm.t, display: vm.display }),
      },
      para(ctx, L, '只有你能看到这个位置', { w, size: T.FS.body, weight: 700, color: C.youText }),
      para(ctx, L, vm.guessCountText, { w, size: T.FS.bodyL, weight: 700, color: C.primary }),
      para(ctx, L, vm.revealHint, { w, size: T.FS.body, weight: 600, color: C.sub }),
    ];
    const sb = subscribeBlock(ctx, L, hits, vm, w);
    if (sb) blocks.push(sb);
    const area = { x: L.x0, y: top + L.u(2), w, h: ry - L.u(10) - (top + L.u(2)) };
    W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'round:scroll', L.u(8));
    return hits.result();
  }

  if (status === 'revealedUnplayed') {
    // renderer-owned hint under 直接看答案 (spec 6.6, AC 33): body size, secondary colour, not tappable, wraps (never truncates)
    const hint = para(ctx, L, VIEW_HINT, { w, size: T.FS.body, weight: 600, color: C.sub });
    const hintGap = L.u(4);
    const py = L.bottomEdge - L.bottomPad - hint.h - hintGap - bh;
    const ly = py - L.u(8) - bh;
    W.button(ctx, L, hits, { id: 'round:late', x: L.x0, y: ly, w, h: bh, label: '先猜再看', kind: 'primary' });
    W.button(ctx, L, hits, { id: 'round:view', x: L.x0, y: py, w, h: bh, label: '直接看答案', kind: 'secondary' });
    hint.draw(ctx, L.x0, py + bh + hintGap, w);
    const blocks = [para(ctx, L, '已揭晓', { w, size: T.FS.hero * 0.8, weight: 800 }), specLine(ctx, L, vm, w), clueBlock(ctx, L, hits, vm, w)];
    const area = { x: L.x0, y: top + L.u(8), w, h: ly - L.u(12) - (top + L.u(8)) };
    W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'round:scroll', L.u(12));
    return hits.result();
  }

  if (status === 'revealed') {
    const r = vm.reveal || { markers: [], mqText: '' };
    const py = L.bottomEdge - L.bottomPad - bh;
    const hw = (w - gap) / 2;
    W.button(ctx, L, hits, { id: 'round:shareReveal', x: L.x0, y: py, w: hw, h: bh, label: '分享揭晓', kind: 'primary' });
    W.button(ctx, L, hits, { id: 'round:hostAgain', x: L.x0 + hw + gap, y: py, w: hw, h: bh, label: '我也出一道' });
    const rect = listRect(L, vm.display);
    const headH = Math.round(T.FS.bodyL * 1.6);
    const mqH = Math.round(T.FS.hero * 1.25);
    const lg = legend(ctx, L, vm, w);
    const blocks = [
      { h: headH, draw: (c, x, y, ww) => W.text(c, vm.left + ' ↔ ' + vm.right, x + ww / 2, y + headH / 2, { size: T.FS.bodyL, weight: 800, align: 'center', maxW: ww }) },
      clueBlock(ctx, L, hits, vm, w),
      { h: ruler.height(L), draw: (c, x, y) => ruler.draw(c, L, { x: 0, y, w: L.W, left: vm.left, right: vm.right, needle: null, markers: r.markers, interactive: false, revealT: vm.revealT == null ? 1 : vm.revealT, t: vm.t, display: vm.display }) },
      { h: mqH, draw: (c, x, y, ww) => W.text(c, r.mqText, x + ww / 2, y + mqH / 2, { size: T.FS.hero, weight: 800, color: C.primary, align: 'center', maxW: ww, minSize: T.FS.title }) },
      lg,
      {
        h: rect.h,
        partial: true,
        draw: (c, x, y, ww) => {
          W.card(c, x, y, ww, rect.h, { fill: C.tile, r: L.u(12), shadow: false });
          if (vm.sharedCanvas) {
            try {
              c.drawImage(vm.sharedCanvas, x, y, ww, rect.h);
            } catch (e) {
              /* a missing shared canvas draws nothing; the card frame stays */
            }
          }
          hits.add('round:list', x, y, ww, rect.h);
        },
      },
    ];
    const area = { x: L.x0, y: top + L.u(2), w, h: py - L.u(12) - (top + L.u(2)) };
    W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'round:scroll', L.u(6));
    return hits.result();
  }

  if (status === 'expired') {
    stateScreen(ctx, L, hits, top, null, '这道题已经结束了', [{ id: 'round:daily', label: '去每日刻度', kind: 'primary' }, { id: 'round:home', label: '去首页' }]);
  } else if (status === 'noGuesses') {
    stateScreen(ctx, L, hits, top, null, '没有人作答，这道题结束了', [{ id: 'round:hostAgain', label: vm.isHost ? '再出一道' : '我也出一道', kind: 'primary' }, { id: 'round:home', label: '去首页' }]);
  } else if (status === 'notFound') {
    stateScreen(ctx, L, hits, top, null, '找不到这道题', [{ id: 'round:home', label: '去首页', kind: 'primary' }]);
  } else if (status === 'offline') {
    stateScreen(ctx, L, hits, top, null, '题目需联网展开', [{ id: 'round:retry', label: '重试', kind: 'primary' }, { id: 'round:home', label: '去首页' }]);
  }
  return hits.result();
}

/** The screen, plus the 举报 reason sheet over it (spec 6.12) when vm.reportSheet is set. */
function draw(ctx, vm, L) {
  const hits = drawBase(ctx, vm, L);
  if (!vm.reportSheet) return hits;
  const h2 = new Hits();
  CS.report(ctx, L, h2, vm.reportSheet, vm);
  const res = hits.concat(h2.result());
  res.scrollMax = Object.assign({}, hits.scrollMax, h2.scrollMax);
  if (hits.ruler) res.ruler = hits.ruler;
  return res;
}

module.exports = { draw, listRect };
