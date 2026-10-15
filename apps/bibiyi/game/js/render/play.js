/**
 * Play: the question screen (spec 6.3). draw(ctx, vm, layout) -> hitAreas.
 *
 * Two cards stacked, the known card on top (value shown), the unknown card
 * below, joined by the cinnabar 「比」 seal. Two measure-specific answer
 * buttons in the thumb zone. One decision per screen, no timers.
 *
 * vm = spec 10 Play model plus the optional extras in CONTRACT.md:
 *   t, turn, count, slide, shake, streakPulse, stampT, scrollY, next, sheet-free.
 * Hit ids: play:back, play:hi, play:lo, play:cards (tap = skip/continue while
 *   revealing; drag = scroll), play:retry, play:reportTop, play:reportBottom,
 *   play:sourceTop, play:sourceBottom, coach:skip.
 * hitAreas.scrollMax = {'play:cards': n} (large text on small screens).
 */

const T = require('./theme');
const W = require('./widgets');
const F = require('./factcard');
const { clamp } = require('./layout');
const C = T.COLORS;

const REVEAL_PHASES = { revealing: 1, correct: 1, miss: 1, cleared: 1, segmentChange: 1 };

function streakChip(ctx, L, vm, rightX, cy) {
  const n = vm.streak || 0;
  const k = L.k;
  const h = L.u(36) * k;
  const numSize = T.FS.streakHead;
  const lab = '连对';
  const labW = W.measure(ctx, lab, T.FS.body, 700, false);
  const numW = Math.max(W.measure(ctx, String(n), numSize, 900, true), numSize * 0.6);
  const w = L.u(12) + labW + L.u(6) + numW + L.u(12);
  const p = clamp(vm.streakPulse || 0, 0, 1);
  const sc = p > 0 && p < 1 ? 1 + 0.22 * Math.sin(Math.PI * p) : 1;
  const hot = n >= 10;
  const warm = n >= 5;
  const fill = hot ? C.seal : warm ? C.goodSoft : C.card;
  const stroke = hot ? C.seal : warm ? C.good : C.lineStrong;
  const fg = hot ? C.sealInk : C.ink;
  ctx.save();
  ctx.translate(rightX - w / 2, cy);
  ctx.scale(sc, sc);
  W.fillRR(ctx, -w / 2, -h / 2, w, h, h / 2, fill);
  W.strokeRR(ctx, -w / 2, -h / 2, w, h, h / 2, stroke, 2);
  W.text(ctx, lab, -w / 2 + L.u(12), 1, { size: T.FS.body, weight: 700, color: hot ? C.sealInk : C.sub });
  W.text(ctx, String(n), w / 2 - L.u(12), 1, { size: numSize, weight: 900, serif: true, color: fg, align: 'right' });
  ctx.restore();
  return w;
}

/** One big answer button with its direction arrow. */
function answerButton(ctx, L, hits, o) {
  const { x, y, w, h } = o;
  const r = L.u(14);
  const state = o.state; // idle | locked | pending | correct | miss | disabled
  ctx.save();
  if (state === 'locked' || state === 'disabled') ctx.globalAlpha = state === 'disabled' ? 0.45 : 0.55;
  let fill = C.card;
  let fg = C.ink;
  let stroke = C.ink;
  if (state === 'pending') {
    fill = C.ink;
    fg = C.paper;
  } else if (state === 'correct') {
    fill = C.good;
    fg = '#FFFFFF';
    stroke = C.good;
  } else if (state === 'miss') {
    fill = C.bad;
    fg = '#FFFFFF';
    stroke = C.bad;
  }
  if (state === 'idle') {
    // soft offset "printed" edge under the button
    W.fillRR(ctx, x, y + L.u(3), w, h, r, C.ink);
  }
  W.fillRR(ctx, x, y, w, h, r, fill);
  W.strokeRR(ctx, x, y, w, h, r, stroke, 2.5);
  const size = T.FS.button + 4 * (L.large ? 0 : 1);
  const f = W.fit(ctx, o.label, w - L.u(24) - L.u(34), size, 800, true);
  const tw = W.measure(ctx, f.str, f.size, 800, true);
  const ic = L.u(18) * Math.min(L.k, 1.1);
  const total = ic + L.u(10) + tw;
  const sx = x + w / 2 - total / 2;
  W.iconTri(ctx, sx + ic / 2, y + h / 2, ic, fg, o.dir);
  W.text(ctx, f.str, sx + ic + L.u(10), y + h / 2 + 1, { size: f.size, weight: 800, serif: true, color: fg });
  ctx.restore();
  if (o.id) W.addTap(hits, L, o.id, x, y, w, h);
}

function buttonStates(vm) {
  const b = vm.buttons || {};
  const hi = b.hi || { label: '', enabled: false };
  const lo = b.lo || { label: '', enabled: false };
  const phase = vm.phase;
  const chosen = vm.chosen || null;
  const out = { hi: 'idle', lo: 'idle' };
  if (phase === 'awaitAnswer') {
    out.hi = hi.enabled ? 'idle' : 'disabled';
    out.lo = lo.enabled ? 'idle' : 'disabled';
    return out;
  }
  if (phase === 'loading' || phase === 'netError' || phase === 'cleared' || phase === 'segmentChange') {
    out.hi = out.lo = 'disabled';
    if (phase === 'netError' && chosen) out[chosen] = 'pending';
    return out;
  }
  // sending / revealing / correct / miss
  ['hi', 'lo'].forEach((key) => {
    if (key === chosen) out[key] = phase === 'correct' ? 'correct' : phase === 'miss' ? 'miss' : 'pending';
    else out[key] = 'locked';
  });
  return out;
}

function coachBubble(ctx, L, hits, x, w, btnTopY) {
  const msg = '下面这张比上面多还是少？点一下';
  const lines = W.wrap(ctx, msg, w - L.u(14) - L.u(48), T.FS.body, 600, false);
  const lh = T.FS.body * 1.3;
  const h = lines.length * lh + L.u(16);
  const ptr = L.u(9);
  const y = btnTopY - ptr - L.u(4) - h;
  W.fillRR(ctx, x, y, w, h, L.u(12), C.ink);
  ctx.beginPath();
  ctx.moveTo(L.cx - L.u(9), y + h - 1);
  ctx.lineTo(L.cx + L.u(9), y + h - 1);
  ctx.lineTo(L.cx, btnTopY - L.u(3));
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
  lines.forEach((ln, i) => W.text(ctx, ln, x + L.u(14), y + L.u(8) + lh * (i + 0.5), { size: T.FS.body, weight: 600, color: C.paper }));
  W.iconClose(ctx, x + w - L.u(22), y + h / 2, L.u(12), C.paper);
  hits.add('coach:skip', x, y + h / 2 - Math.max(h, T.MIN_TAP) / 2, w, Math.max(h, T.MIN_TAP));
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'play:back');
  const x = L.x0;
  const cw = L.contentW;
  const phase = vm.phase || 'awaitAnswer';
  const t = vm.t;

  // ---- header row: mode / issue / theme left, streak chip right
  let y = L.navBottom + L.u(2);
  const headH = L.u(L.compact ? 36 : 40) * (L.large ? 1.2 : 1);
  const chipW = streakChip(ctx, L, vm, x + cw, y + headH / 2);
  W.text(ctx, vm.headerText || '', x, y + headH / 2, { size: T.FS.bodyL, weight: 700, color: C.ink, maxW: cw - chipW - L.u(10) });
  y += headH;

  // progress rail (k of deckLength answered)
  const total = vm.deckLength || 40;
  const done = clamp((vm.k != null ? vm.k - 1 : 0) + (phase === 'correct' || phase === 'cleared' ? 1 : 0), 0, total);
  ctx.fillStyle = C.line;
  ctx.fillRect(x, y + L.u(2), cw, 4);
  ctx.fillStyle = C.ink;
  ctx.fillRect(x, y + L.u(2), (cw * done) / total, 4);
  y += L.u(L.compact ? 8 : 12);

  // challenge: quiet inline line, once
  if (vm.challenge && vm.challenge.passedText) {
    W.text(ctx, vm.challenge.passedText, x, y + L.u(12), { size: T.FS.body, weight: 700, color: C.good, maxW: cw });
    y += L.u(26) * (L.large ? 1.1 : 1);
  }

  // ---- bottom-anchored stack: buttons, prompt
  const bottom = L.bottomEdge - L.bottomPad;
  const bh = L.btnH;
  const btnY = bottom - bh;
  const gapBtn = L.u(16);
  const btnW = (cw - gapBtn) / 2;
  const promptH = L.u(L.compact ? 26 : 30) * (L.large ? 1.2 : 1);
  const promptY = btnY - L.u(8) - promptH;
  const vpTop = y;
  const vpBottom = promptY - L.u(2);
  const vpH = Math.max(L.u(120), vpBottom - vpTop);

  // ---- cards
  const faces = [vm.top, vm.bottom].filter(Boolean);
  const cardH = F.cardHeight(ctx, L, faces.length ? faces : [{ label: '', subLabel: '' }], cw);
  const sealS = L.u(44) * Math.min(L.k, 1.1);
  let gap = L.u(L.compact ? 20 : 24);
  const natural = 2 * cardH + gap;
  let scrollMax = 0;
  let topMargin = 0;
  if (natural <= vpH) {
    const extra = vpH - natural;
    gap += Math.min(extra * 0.3, L.u(28));
    topMargin = Math.max(0, (vpH - (2 * cardH + gap)) * 0.45);
  } else {
    scrollMax = Math.ceil(natural + L.u(8) - vpH);
  }
  const reveal = !!REVEAL_PHASES[phase];
  let scrollY = 0;
  if (scrollMax > 0) {
    scrollY = typeof vm.scrollY === 'number' ? vm.scrollY : phase === 'awaitAnswer' || phase === 'loading' ? 0 : scrollMax;
    scrollY = clamp(scrollY, 0, scrollMax);
  }
  const clip = { x: 0, y: vpTop, w: L.W, h: vpH };
  const topY = vpTop + topMargin + (scrollMax > 0 ? L.u(8) : 0) - scrollY;
  const botY = topY + cardH + gap;

  // whole-viewport area: tap = skip / continue, drag = scroll
  if (reveal || scrollMax > 0) hits.add('play:cards', 0, vpTop, L.W, vpH);
  hits.scrollMax['play:cards'] = scrollMax;
  hits.beginScroll(clip, 0); // the y values are already shifted; this clips taps to the viewport

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, vpTop, L.W, vpH);
  ctx.clip();

  const slide = phase === 'correct' ? clamp(vm.slide || 0, 0, 1) : 0;
  const moving = slide > 0;
  const loading = phase === 'loading';
  const topRect = { x, y: topY, w: cw, h: cardH };
  const botRect = { x, y: botY, w: cw, h: cardH };

  if (loading) {
    F.draw(ctx, L, hits, null, topRect, { slot: 'top', t });
    F.draw(ctx, L, hits, null, botRect, { slot: 'bottom', t });
  } else if (moving) {
    const delta = cardH + gap;
    F.draw(ctx, L, hits, vm.top, { x, y: topY - slide * cardH * 0.55, w: cw, h: cardH }, { slot: 'top', noHits: true, alpha: 1 - slide });
    F.draw(ctx, L, hits, vm.bottom, { x, y: botY - slide * delta, w: cw, h: cardH }, { slot: 'bottom', noHits: true, countP: 1, pill: slide < 0.35 ? true : null });
    if (vm.next && slide > 0.6) F.draw(ctx, L, hits, vm.next, { x, y: botY + (1 - slide) * L.u(26), w: cw, h: cardH }, { slot: 'bottom', noHits: true, hidden: true, alpha: Math.max(0, (slide - 0.6) / 0.4) });
  } else {
    F.draw(ctx, L, hits, vm.top, topRect, { slot: 'top' });

    // bottom card: hidden, turning, or revealed
    let turn = 0;
    let countP = 1;
    let hidden = true;
    let pill = null;
    let shimmerT = null;
    if (phase === 'sending') {
      shimmerT = t == null ? 0 : t;
    } else if (phase === 'revealing') {
      turn = typeof vm.turn === 'number' ? clamp(vm.turn, 0, 1) : 1;
      countP = typeof vm.count === 'number' ? clamp(vm.count, 0, 1) : 1;
      hidden = turn < 0.5;
      pill = countP >= 1 && vm.correct != null ? vm.correct : null;
    } else if (phase === 'correct' || phase === 'miss' || phase === 'cleared') {
      turn = 1;
      hidden = false;
      pill = phase === 'cleared' ? null : phase === 'correct';
    }
    let sx = 1;
    if (phase === 'revealing' && turn > 0 && turn < 1) sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * turn)));
    let dx = 0;
    if (phase === 'miss' && typeof vm.shake === 'number' && vm.shake > 0 && vm.shake < 1) dx = Math.sin(vm.shake * Math.PI * 6) * (1 - vm.shake) * L.u(9);
    ctx.save();
    ctx.translate(x + cw / 2 + dx, botY + cardH / 2);
    ctx.scale(sx, 1);
    ctx.translate(-(x + cw / 2), -(botY + cardH / 2));
    F.draw(ctx, L, hits, vm.bottom, botRect, {
      slot: 'bottom',
      hidden,
      countP,
      pill,
      shimmerT,
      noHits: sx < 0.99 || dx !== 0,
      alpha: phase === 'netError' ? 0.9 : 1,
    });
    ctx.restore();
  }
  hits.endScroll();

  // ---- seal or segment banner in the gap
  const gapCy = topY + cardH + gap / 2;
  const sealA = moving ? 1 - slide : 1;
  if (phase === 'segmentChange' && vm.segmentBanner) {
    const bh2 = L.u(38) * (L.large ? 1.2 : 1);
    const f = W.fit(ctx, vm.segmentBanner, cw - L.u(40), T.FS.bodyL, 700, false);
    const bw = Math.min(cw, W.measure(ctx, f.str, f.size, 700, false) + L.u(40));
    W.fillRR(ctx, L.cx - bw / 2, gapCy - bh2 / 2, bw, bh2, bh2 / 2, C.ink);
    W.text(ctx, f.str, L.cx, gapCy + 1, { size: f.size, weight: 700, color: C.paper, align: 'center' });
  } else if (!loading) {
    ctx.save();
    ctx.globalAlpha = sealA;
    W.seal(ctx, L.cx, gapCy, sealS, { rotate: -6 });
    ctx.restore();
  } else {
    W.seal(ctx, L.cx, gapCy, sealS, { rotate: -6 });
  }

  // ---- states drawn over the bottom card
  if (phase === 'netError') {
    W.card(ctx, x, botY, cw, cardH, { r: L.u(14), fill: C.card, stroke: C.lineStrong, lw: 2 });
    W.text(ctx, '网络不太好', L.cx, botY + cardH * 0.28, { size: T.FS.title, weight: 800, serif: true, align: 'center', maxW: cw - L.u(24) });
    W.text(ctx, '你的选择已保留', L.cx, botY + cardH * 0.28 + L.u(26), { size: T.FS.body, color: C.sub, align: 'center', maxW: cw - L.u(24) });
    const rb = L.btnH2;
    W.button(ctx, L, hits, { id: 'play:retry', x: L.cx - Math.min(cw - L.u(48), L.u(200)) / 2, y: botY + cardH - rb - L.u(14), w: Math.min(cw - L.u(48), L.u(200)), h: rb, label: '重试', kind: 'primary' });
  }
  if (phase === 'cleared') {
    const sw = Math.min(cw - L.u(24), L.u(250));
    const sh = L.u(84) * (L.large ? 1.2 : 1);
    ctx.save();
    W.fillRR(ctx, L.cx - sw / 2, gapCy - sh / 2, sw, sh, sh * 0.12, C.paper);
    ctx.restore();
    W.stamp(ctx, L.cx, gapCy, sw, sh, '全部答对', { progress: vm.stampT == null ? 1 : vm.stampT });
  }
  ctx.restore();

  // scroll hint
  if (scrollMax > 0) W.scrollbar(ctx, L.x0 + cw + L.u(8), vpTop, vpH, scrollY, scrollMax);

  // ---- prompt (or the one-time coach bubble) and the answer buttons
  const coach = !!vm.coachMark && phase === 'awaitAnswer';
  if (coach) {
    coachBubble(ctx, L, hits, x, cw, btnY);
  } else {
    W.text(ctx, vm.promptText || '', L.cx, promptY + promptH / 2, { size: T.FS.bodyL, weight: 700, serif: true, color: C.ink, align: 'center', maxW: cw });
  }
  const st = buttonStates(vm);
  const b = vm.buttons || {};
  answerButton(ctx, L, hits, { id: st.hi === 'idle' ? 'play:hi' : null, x, y: btnY, w: btnW, h: bh, label: (b.hi && b.hi.label) || '', dir: 'up', state: st.hi });
  answerButton(ctx, L, hits, { id: st.lo === 'idle' ? 'play:lo' : null, x: x + btnW + gapBtn, y: btnY, w: btnW, h: bh, label: (b.lo && b.lo.label) || '', dir: 'down', state: st.lo });
  return hits.result();
}

module.exports = { draw, buttonStates };
