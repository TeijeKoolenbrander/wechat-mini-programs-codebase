/**
 * Picks the renderer: the real js/render/* from frontend-ui when present, otherwise js/stub-render.js. Both follow
 * js/render/CONTRACT.md:
 *   { kind, makeLayout(info), draw(screen, ctx, vm, layout) -> hits, drawOverlay(ctx, overlayVm, layout) -> hits,
 *     hitTest(hits, x, y), boardRect, bannerRect, shareCard }
 * Screens: home, card, result, create, round, group, archive. A screen the real renderer does not know yet, or one that
 * throws on a view model, falls back to the stub drawer instead of a black screen (the error is kept for QA).
 */

const build = require('./build-config');

/**
 * The stub renderer is dev-only (QA-6): required lazily, and never in a release build (cloudEnv set), where
 * js/stub-render.js is listed in packOptions.ignore. `forceStub` is the test seam.
 */
function loadStub(force) {
  if (build.cloudEnv && !force) return null;
  return require('./stub-render');
}
const NO_HITS = () => [];

function hitTestLocal(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const a = hits[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

/** Renderer exceptions swallowed by the stub fallback (QA can read them). */
const fallbackErrors = [];

function loadRenderers(forceStub) {
  let real = null;
  if (!forceStub) {
    try {
      real = require('./render/index');
    } catch (e) {
      real = null;
    }
  }
  if (real && real.screens && real.makeLayout) {
    return {
      kind: 'real',
      makeLayout: real.makeLayout,
      draw: (screen, ctx, vm, layout) => {
        const s = real.screens[screen];
        if (s) {
          try {
            return s.draw(ctx, vm, layout);
          } catch (e) {
            fallbackErrors.push(screen + ': ' + (e && e.message));
          }
        }
        const stub = loadStub();
        return stub ? stub.draw(screen, ctx, vm, layout) : [];
      },
      drawOverlay: (ctx, ov, layout) => (real.overlay ? real.overlay.draw(ctx, ov, layout) : NO_HITS()),
      hitTest: real.hitTest || hitTestLocal,
      boardRect: real.boardRect || null,
      bannerRect: real.bannerRect || null,
      listRect: real.listRect || null,
      shareCard: real.shareCard || null,
    };
  }
  const stub = loadStub(forceStub);
  if (!stub) throw new Error('release build: js/render/index failed to load and the stub renderer is not shipped');
  return { kind: 'stub', makeLayout: stub.stubLayout, draw: stub.draw, drawOverlay: stub.drawOverlay, hitTest: hitTestLocal, boardRect: null, bannerRect: null, listRect: null, shareCard: null };
}

module.exports = { loadRenderers, hitTestLocal, fallbackErrors };
