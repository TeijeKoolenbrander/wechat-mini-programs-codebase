/**
 * Reveal overview (spec 8.8, F-5, PO-45): opened for every member of a room at the same moment. "全部揭晓！", then one
 * sticky-note card per chain showing ONLY the chain's final step (a drawing contain-fitted and static, or the sentence, or
 * the marker, or a placeholder) plus "第 N 条" and "你起的" on the viewer's own chain. Never a prompt, never an intermediate
 * step. Tap a card -> the step-through on that chain (starts at its final step). The grid is 2 columns at window width >= 360
 * in standard mode, otherwise 1 (320, large text); it scrolls. Pinned footer: [再来一局] [分享揭晓卡], with the rematch banner
 * above it when the host has opened a new room.
 *
 * States loading | ready | notMember | paused | offline | error.
 * Hit ids: overview:back, overview:chain:<chainId>, overview:rematch, overview:joinNew, overview:share, overview:retry,
 * overview:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Art = require('./art');
const Strokes = require('./strokes');
const Ch = require('./chrome');
const MARKERS = require('./describe').MARKER_TEXT;
const C = T.COLORS;

const PH_TEXT = { reported: '该内容已被举报隐藏', deleted: '作者已删除这一棒', paused: '内容维护中' };

/** 2 columns at window width >= 360 in standard mode, else 1 */
function columnsFor(L) {
  return L.W >= 360 && !T.isLarge() ? 2 : 1;
}

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'ready';
  const g = Ch.topBar(ctx, L, hits, { back: '首页', backId: 'overview:back' });
  const bw = L.contentW;
  let y = g.y + g.h + 2;

  const hs = T.isLarge() ? T.FS.title : 26;
  if (st === 'loading' || st === 'ready' || st === 'paused') {
    W.text(ctx, vm.title || '全部揭晓！', L.x0 + 2, y + hs * 0.7, { size: hs, weight: 900, maxW: bw });
    y += Math.round(hs * 1.4);
    const sub = st === 'loading' ? '正在揭晓…' : vm.subtitle;
    if (sub) {
      W.text(ctx, sub, L.x0 + 2, y + 12, { size: T.FS.body, color: C.sub, maxW: bw });
      y += Math.round(T.FS.body * 1.5);
    }
    y += 6;
  }

  if (st === 'notMember') {
    S.statePanel(ctx, L, hits, { y: y + 24, art: 'lock', headline: '只有这一局的群友能看完整揭晓' });
    return hits.result();
  }
  if (st === 'offline' || st === 'error') {
    S.statePanel(ctx, L, hits, { y: y + 24, art: st === 'offline' ? 'offline' : 'error', headline: st === 'offline' ? '揭晓需联网查看' : '出了点小问题，请重试', retryId: 'overview:retry' });
    return hits.result();
  }

  // ---- footer (pinned)
  const rematch = vm.rematch || { label: '再来一局', banner: null };
  const bh = T.btn(L, 56);
  const bannerLines = rematch.banner ? W.wrap(ctx, rematch.banner, bw - 50, T.FS.body, 700).slice(0, 2) : [];
  const bannerH = rematch.banner ? Math.max(T.MIN_TAP, T.minBtn(), bannerLines.length * Math.round(T.FS.body * 1.4) + 16) : 0;
  const stack = T.isLarge() && vm.canShare;
  const btnRows = stack ? 2 : 1;
  const footH = bannerH + (bannerH ? 8 : 0) + btnRows * bh + (btnRows - 1) * 8;
  const footY = L.bottomEdge - 8 - footH;

  // ---- grid
  const cols = columnsFor(L);
  const gap = 10;
  const cw = (bw - (cols - 1) * gap) / cols;
  const pad = 10;
  const rw = cw - 2 * pad;
  const labelH = Math.round(T.FS.bodyL * 1.6);
  const chromeH = pad + 6 + labelH + pad - 2; // card height without the picture
  const areaH = footY - 8 - y;
  // one card must fit the scroll area whole (its label included), so the first card is never cut at rest: on a short window the picture shrinks
  const rh = Math.max(Math.round(rw * 0.45), Math.min(cols === 2 ? Math.round(rw * 1.15) : Math.min(Math.round(rw * 0.8), 240), areaH - 4 - chromeH));
  const cardH = chromeH + rh;
  const cards = st === 'loading' ? [0, 1, 2, 3].map((i) => ({ skeleton: true, i })) : vm.cards || [];
  const rows = Math.ceil(cards.length / cols);
  const area = { x: L.x0, y, w: bw, h: footY - 8 - y };
  const contentH = rows * (cardH + gap) + 4;

  W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'overview:scroll', () => {
    cards.forEach((c, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = L.x0 + col * (cw + gap);
      const cy = area.y + row * (cardH + gap);
      if (c.skeleton) {
        W.skeleton(ctx, x, cy, cw, cardH, (vm.t || 0) + c.i * 160, 14);
        return;
      }
      W.card(ctx, x, cy, cw, cardH, { r: 14, stroke: c.mineStarted ? C.ink : undefined, lw: c.mineStarted ? 2.5 : undefined });
      W.tape(ctx, x + cw * 0.5, cy, 44, (idx % 2 ? 1 : -1) * 0.05);
      const rect = { x: x + pad, y: cy + pad, w: rw, h: rh };
      const f = c.final || {};
      const ph = f.placeholder ? PH_TEXT[f.placeholder] || '内容维护中' : null;
      if (ph) {
        W.fillRR(ctx, rect.x, rect.y, rect.w, rect.h, 8, C.disabledFill);
        const lines = W.wrapBalanced(ctx, ph, rect.w - 12, T.FS.body, 700).slice(0, 4);
        const lh = Math.round(T.FS.body * 1.4);
        lines.forEach((ln, i) => W.text(ctx, ln, rect.x + rect.w / 2, rect.y + rect.h / 2 + (i - (lines.length - 1) / 2) * lh, { size: T.FS.body, weight: 700, color: C.disabledInk, align: 'center' }));
      } else if (f.kind === 'draw') {
        if (f.loaded === false) {
          W.skeleton(ctx, rect.x, rect.y, rect.w, rect.h, (vm.t || 0) + idx * 120, 8);
        } else {
          Strokes.drawStrokes(ctx, f.strokes || { v: 2, h: 1024, s: [] }, rect, { cacheKey: 'ov:' + (vm.roomId || '') + ':' + c.chainId, rev: c.chainId, dpr: L.dpr, frame: true });
        }
      } else {
        W.fillRR(ctx, rect.x, rect.y, rect.w, rect.h, 8, C.sheet);
        W.strokeRR(ctx, rect.x, rect.y, rect.w, rect.h, 8, T.isHC() ? C.ink : C.line, 1.5);
        const isMarker = f.kind === 'marker';
        const txt = isMarker ? MARKERS[f.marker] || '' : '「' + (f.text || '') + '」';
        const size = T.isLarge() ? T.FS.bodyL : 18;
        const lines = W.wrapBalanced(ctx, txt, rect.w - 14, size, 800).slice(0, 5);
        const lh = Math.round(size * 1.35);
        lines.forEach((ln, i) => W.text(ctx, ln, rect.x + rect.w / 2, rect.y + rect.h / 2 + (i - (lines.length - 1) / 2) * lh, { size, weight: 800, color: isMarker ? C.sub : C.ink, align: 'center' }));
      }
      // label row: 第 N 条 · 你起的 ... unseen dot
      const ly = cy + pad + rh + 6 + labelH / 2;
      const label = '第 ' + c.chainNo + ' 条' + (c.mineStarted ? ' · 你起的' : '');
      W.text(ctx, label, x + pad + 2, ly, { size: T.isLarge() ? T.FS.body : T.FS.bodyL, weight: 800, color: c.mineStarted ? C.orangeDeep : C.ink, maxW: rw });
      if (c.unseen) {
        // an unseen chain: a dot on the corner of the note
        ctx.beginPath();
        ctx.arc(x + cw - 8, cy + 8, 8, 0, Math.PI * 2);
        ctx.fillStyle = C.verm;
        ctx.fill();
        ctx.strokeStyle = C.card;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      hits.add('overview:chain:' + c.chainId, x, cy, cw, cardH);
    });
  });

  // ---- footer
  let fy = footY;
  if (rematch.banner) {
    W.fillRR(ctx, L.x0, fy, bw, bannerH, 12, C.blueSoft);
    W.strokeRR(ctx, L.x0, fy, bw, bannerH, 12, C.blueText, T.isHC() ? 2 : 1.5);
    bannerLines.forEach((ln, i) => W.text(ctx, ln, L.x0 + 14, fy + bannerH / 2 + (i - (bannerLines.length - 1) / 2) * Math.round(T.FS.body * 1.4), { size: T.FS.body, weight: 700, color: C.blueText }));
    W.iconChevron(ctx, L.x0 + bw - 18, fy + bannerH / 2, 14, C.blueText);
    hits.add('overview:joinNew', L.x0, fy, bw, bannerH);
    fy += bannerH + 8;
  }
  const loadingFoot = st === 'loading';
  if (stack) {
    W.button(ctx, L, hits, { id: 'overview:rematch', x: L.x0, y: fy, w: bw, h: bh, label: rematch.label || '再来一局', kind: 'primary', disabled: loadingFoot });
    W.button(ctx, L, hits, { id: 'overview:share', x: L.x0, y: fy + bh + 8, w: bw, h: bh, label: '分享揭晓卡', kind: 'secondary', disabled: loadingFoot });
  } else if (vm.canShare) {
    const w1 = (bw - 8) * 0.5;
    W.button(ctx, L, hits, { id: 'overview:rematch', x: L.x0, y: fy, w: w1, h: bh, label: rematch.label || '再来一局', kind: 'primary', disabled: loadingFoot });
    W.button(ctx, L, hits, { id: 'overview:share', x: L.x0 + w1 + 8, y: fy, w: bw - w1 - 8, h: bh, label: '分享揭晓卡', kind: 'secondary', disabled: loadingFoot });
  } else {
    W.button(ctx, L, hits, { id: 'overview:rematch', x: L.x0, y: fy, w: bw, h: bh, label: rematch.label || '再来一局', kind: 'primary', disabled: loadingFoot });
  }
  void Art;
  return hits.result();
}

module.exports = { draw, columnsFor, PH_TEXT };
