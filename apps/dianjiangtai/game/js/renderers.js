/**
 * Picks the renderer: the real js/render/* from frontend-ui when present,
 * otherwise js/stub-render.js. Both follow js/render/CONTRACT.md.
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

/** Renderer exceptions swallowed by the stub fallback (QA can read them). */
const fallbackErrors = [];

function loadRenderers() {
  let real = null;
  try {
    real = require('./render/index');
  } catch (e) {
    real = null;
  }
  if (real && real.screens && real.makeLayout) {
    return {
      kind: 'real',
      makeLayout: real.makeLayout,
      // A screen the real renderer does not know yet (v1 history), or one that throws on a newer view model
      // (for example a 识人 draft with null stats), falls back to the stub drawer instead of a black screen.
      draw: (screen, ctx, vm, layout) => {
        const s = real.screens[screen];
        if (s) {
          try {
            return s.draw(ctx, vm, layout);
          } catch (e) {
            fallbackErrors.push(screen + ': ' + (e && e.message));
          }
        }
        return stub.draw(screen, ctx, vm, layout);
      },
      drawOverlay: (ctx, ov, layout) => (real.overlay ? real.overlay.draw(ctx, ov, layout) : []),
      hitTest: real.hitTest || hitTestLocal,
      shareCard: real.shareCard || null,
    };
  }
  return { kind: 'stub', makeLayout: stub.stubLayout, draw: stub.draw, drawOverlay: stub.drawOverlay, hitTest: hitTestLocal, shareCard: null };
}

module.exports = { loadRenderers, hitTestLocal, fallbackErrors };
