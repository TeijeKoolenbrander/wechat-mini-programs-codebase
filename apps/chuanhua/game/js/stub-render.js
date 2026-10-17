/**
 * Dev-only fallback renderer (rev. 2). The real renderer (js/render/*) draws every screen; this exists only so a screen that
 * throws on a view model in DEVTOOLS shows its name and strings instead of a black screen (js/renderers.js). It is NOT driven by
 * the tests and a release build never loads it (build-config / tools/release-config.js strip it). Same contract:
 *   draw(screen, ctx, vm, layout) -> hitAreas[]        drawOverlay(ctx, overlayVm, layout) -> hitAreas[]
 * It draws the strings of the view model and returns NO hit areas except the window-wide `<screen>:block`, so nothing is tappable.
 */

function stubLayout(info) {
  const W = info.windowWidth;
  const H = info.windowHeight;
  const sb = info.statusBarHeight || 20;
  const m = info.menuRect || { left: W - 94, right: W - 7, top: sb + 6, bottom: sb + 38 };
  const navBottom = m.bottom + (m.top - sb);
  const safeBottom = info.safeArea && info.safeArea.bottom != null ? Math.max(0, H - info.safeArea.bottom) : 0;
  const pad = 16;
  return {
    W, H, s: 1, u: (n) => n, dpr: info.pixelRatio || 1, statusBar: sb, navBottom, safeBottom, bottomEdge: H - safeBottom,
    capsule: { x: m.left, y: m.top, w: m.right - m.left, h: m.bottom - m.top }, pad, x0: pad, contentW: W - 2 * pad, cx: W / 2,
  };
}

/** every string leaf of a view model, depth-limited */
function strings(v, out, depth) {
  if (out.length > 24 || depth > 3 || v === null || v === undefined) return;
  if (typeof v === 'string') {
    if (v) out.push(v);
  } else if (Array.isArray(v)) v.slice(0, 6).forEach((x) => strings(x, out, depth + 1));
  else if (typeof v === 'object') for (const k of Object.keys(v)) if (k !== 'strokes' && k !== 'display' && k !== 'features' && k !== 'paragraphs') strings(v[k], out, depth + 1);
}

function draw(screen, ctx, vm, layout) {
  ctx.fillStyle = '#FAF7F0';
  ctx.fillRect(0, 0, layout.W, layout.H);
  ctx.fillStyle = '#222';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(screen, layout.x0, layout.navBottom + 24);
  const lines = [];
  strings(vm, lines, 0);
  ctx.font = '14px sans-serif';
  lines.forEach((s, i) => ctx.fillText(s, layout.x0, layout.navBottom + 52 + i * 20));
  return [{ id: screen + ':block', x: 0, y: 0, w: layout.W, h: layout.H }];
}

function drawOverlay(ctx, ov, layout) {
  const hits = [];
  if (ov && ov.toast) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(layout.x0, layout.H - 120, layout.contentW, 36);
    ctx.fillStyle = '#fff';
    ctx.fillText(ov.toast.text, layout.x0 + 8, layout.H - 96);
  }
  if (ov && ov.dialog) {
    const d = ov.dialog;
    ctx.fillStyle = '#fff';
    ctx.fillRect(layout.x0, layout.H / 2 - 80, layout.contentW, 160);
    ctx.fillStyle = '#222';
    ctx.fillText(d.text || d.title || '', layout.x0 + 12, layout.H / 2 - 40);
    hits.push({ id: 'dialog:confirm', x: layout.x0 + layout.contentW - 112, y: layout.H / 2 + 20, w: 100, h: 44 });
    if (d.cancelLabel) hits.push({ id: 'dialog:cancel', x: layout.x0 + 12, y: layout.H / 2 + 20, w: 100, h: 44 });
  }
  if (ov && ov.adStub) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, layout.W, layout.H);
    ctx.fillStyle = '#fff';
    ctx.fillText('广告位（测试）' + ov.adStub.secondsLeft, layout.W / 2 - 60, layout.H / 2 - 30);
    hits.push({ id: 'adstub:block', x: 0, y: 0, w: layout.W, h: layout.H });
    hits.push({ id: 'adstub:complete', x: layout.W / 2 - 60, y: layout.H / 2, w: 120, h: 44 });
    hits.push({ id: 'adstub:skip', x: layout.W / 2 - 60, y: layout.H / 2 + 56, w: 120, h: 44 });
  }
  return hits;
}

module.exports = { stubLayout, draw, drawOverlay };
