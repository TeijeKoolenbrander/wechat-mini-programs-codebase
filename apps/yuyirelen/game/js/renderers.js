/**
 * Picks the renderer: the real js/render/* from frontend-ui when present, otherwise
 * js/stub-render.js. A real renderer that does not (yet) implement a screen falls back to the
 * stub for that screen only, so the game stays playable while frontend-ui lands screens.
 *   { kind, makeLayout(info), draw(screen, ctx, vm, layout) -> hits,
 *     drawOverlay(ctx, overlayVm, layout) -> hits, hitTest(hits,x,y), shareCard }
 */

const stub = require('./stub-render');

function hitTestLocal(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const a = hits[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

function loadRenderers() {
  let real = null;
  try {
    real = require('./render/index');
  } catch (e) {
    real = null; // not shipped yet, or it failed to load: the stub keeps the game playable
  }
  const errors = [];
  if (real && real.screens && real.makeLayout) {
    return {
      kind: 'real',
      errors,
      makeLayout: real.makeLayout,
      draw: (screen, ctx, vm, layout) => {
        try {
          if (real.screens[screen] && real.screens[screen].draw) return real.screens[screen].draw(ctx, vm, layout);
        } catch (e) {
          errors.push(String((e && e.stack) || e)); // a renderer bug must not blank the game: fall through to the stub
        }
        return stub.draw(screen, ctx, vm, layout);
      },
      drawOverlay: (ctx, ov, layout) => (real.overlay ? real.overlay.draw(ctx, ov, layout) : stub.drawOverlay(ctx, ov, layout)),
      hitTest: real.hitTest || hitTestLocal,
      shareCard: real.shareCard || null,
    };
  }
  return { kind: 'stub', makeLayout: stub.stubLayout, draw: stub.draw, drawOverlay: stub.drawOverlay, hitTest: hitTestLocal, shareCard: null };
}

module.exports = { loadRenderers, hitTestLocal };
