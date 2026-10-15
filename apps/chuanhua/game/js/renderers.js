/**
 * The renderer adapter: the real js/render/* (frontend-ui). There is no stub fallback any more; a missing
 * renderer is a build error. A screen that throws on a view model must never take the frame loop down
 * (a dead rAF loop freezes the game), so the error is recorded in `errors` (the integration test asserts it
 * stays empty) and the frame draws nothing.
 *
 *   { makeLayout(info), draw(screen, ctx, vm, layout) -> hits, drawOverlay(ctx, overlayVm, layout) -> hits,
 *     hitTest(hits,x,y), shareCard, errors }
 * The real renderer is `js/render/index.js` exporting { screens: { <screen>: { draw(ctx, vm, layout) } },
 * makeLayout, overlay: { draw(ctx, overlayVm, layout) }, hitTest?, shareCard? }.
 */

const real = require('./render/index');

const errors = [];

function hitTestLocal(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const a = hits[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

function guarded(label, fn) {
  try {
    return fn();
  } catch (e) {
    if (errors.length < 20) errors.push(label + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    return [];
  }
}

function loadRenderers() {
  return {
    kind: 'real',
    makeLayout: real.makeLayout,
    draw: (screen, ctx, vm, layout) => guarded(screen, () => real.screens[screen].draw(ctx, vm, layout)),
    drawOverlay: (ctx, ov, layout) => guarded('overlay', () => (real.overlay ? real.overlay.draw(ctx, ov, layout) : [])),
    hitTest: real.hitTest || hitTestLocal,
    shareCard: real.shareCard || null,
    errors,
  };
}

module.exports = { loadRenderers, hitTestLocal, errors };
