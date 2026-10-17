/**
 * Picks the renderer: the real js/render/* from frontend-ui, with js/stub-render.js (a generic dev fallback that only names the screen) for a
 * screen that throws on a view model in DevTools (never in a cloud build). Both follow
 * js/render/CONTRACT.md:
 *   { kind, makeLayout(info), draw(screen, ctx, vm, layout) -> hits, drawOverlay(ctx, overlayVm, layout) -> hits,
 *     hitTest(hits, x, y), shareCard }
 * The real entry is js/render/index.js exporting { makeLayout, hitTest?, screens: {home, picker, ..., rules, report}, overlay,
 * shareCard? } (the 点将台 shape). A screen the real renderer does not know yet, or one that throws on a view model, falls back
 * to the stub drawer instead of a black screen (QA can read `fallbackErrors`).
 */

/** the dev fallback; required lazily and never when `cloudEnv` is set, so a release package can drop the file (QA-2) */
let stubMod = null;
function stubRenderer() {
  if (!stubMod) stubMod = require('./stub-render');
  return stubMod;
}

function hitTestLocal(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const a = hits[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

const fallbackErrors = [];

function loadRenderers(opts) {
  const cloud = !!(opts && opts.cloudEnv);
  let real = null;
  if (cloud || !(opts && opts.forceStub)) {
    try {
      real = require('./render/index');
    } catch (e) {
      real = null;
      if (e && e.code !== 'MODULE_NOT_FOUND' && !/is not defined|Cannot find module/.test(String(e.message))) fallbackErrors.push('render/index: ' + e.message);
    }
  }
  if (real && real.makeLayout && (real.screens || real.draw)) {
    const screens = real.screens || {};
    return {
      kind: 'real',
      makeLayout: real.makeLayout,
      draw: (screen, ctx, vm, layout) => {
        const s = screens[screen];
        if (s && s.draw) {
          try {
            return s.draw(ctx, vm, layout);
          } catch (e) {
            fallbackErrors.push(screen + ': ' + (e && e.message));
          }
        }
        if (cloud) return []; // a release build never falls back to the stub: a screen the real renderer cannot draw draws nothing
        return stubRenderer().draw(screen, ctx, vm, layout);
      },
      drawOverlay: (ctx, ov, layout) => {
        try {
          return real.overlay && real.overlay.draw ? real.overlay.draw(ctx, ov, layout) : [];
        } catch (e) {
          fallbackErrors.push('overlay: ' + (e && e.message));
          return cloud ? [] : stubRenderer().drawOverlay(ctx, ov, layout);
        }
      },
      hitTest: real.hitTest || hitTestLocal,
      bannerRect: real.bannerRect || null,
      shareCard: real.shareCard || null,
      strokes: real.strokes || null,
    };
  }
  if (cloud) throw new Error('js/render/index failed to load in a cloud build; refusing to show the dev stub renderer');
  const stub = stubRenderer();
  return { kind: 'stub', makeLayout: stub.stubLayout, draw: stub.draw, drawOverlay: stub.drawOverlay, hitTest: hitTestLocal, bannerRect: null, shareCard: null, strokes: null };
}

module.exports = { loadRenderers, hitTestLocal, fallbackErrors };
