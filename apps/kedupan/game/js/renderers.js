/**
 * Picks the renderer: the real js/render/* from frontend-ui when present and healthy, otherwise
 * js/stub-render.js. If the real renderer is missing, malformed or THROWS while drawing, the game switches to the
 * stub for the rest of the session (and reports it through `onFallback`), so a render bug can never trap the player.
 *   { kind: 'real'|'stub', makeLayout(info), draw(screen, ctx, vm, layout) -> hits, drawOverlay(ctx, ov, layout) -> hits,
 *     hitTest(hits, x, y), shareCard, onFallback }
 * Renderer contract (frontend-ui): js/render/index.js exports { screens: { <screen>: { draw(ctx, vm, layout) -> hits } },
 * makeLayout(info), overlay: { draw(ctx, overlayVm, layout) -> hits }, hitTest?, shareCard? }. See js/README.md.
 */

const stub = require('./stub-render');

const SCREENS = ['home', 'card', 'result', 'archive', 'archiveDay', 'create', 'round', 'group', 'friend'];

function hitTestLocal(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const a = hits[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

/** The topmost hit area (not just its id), so the touch router can read the ruler's rect. */
function hitAt(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const a = hits[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a;
  }
  return null;
}

function loadRenderers(opts) {
  const o = opts || {};
  let real = null;
  if (o.real !== undefined) real = o.real; // test seam: inject a renderer module
  else if (!o.forceStub) {
    try {
      real = require('./render/index');
    } catch (e) {
      real = null;
    }
  }
  const healthy = !!(real && real.screens && typeof real.makeLayout === 'function');
  const R = {
    kind: healthy ? 'real' : 'stub',
    fallbackReason: healthy ? null : real === null ? (o.forceStub ? 'forced' : 'missing') : 'malformed',
    onFallback: null,
    hitTest: (healthy && real.hitTest) || hitTestLocal,
    hitAt,
    shareCard: healthy ? real.shareCard || null : null,
    SCREENS,
  };
  let lastInfo = null;

  function fallback(err, where) {
    if (R.kind === 'stub') return;
    R.kind = 'stub';
    R.fallbackReason = where + ': ' + String((err && err.message) || err).slice(0, 80);
    R.shareCard = null;
    if (R.onFallback) {
      try {
        R.onFallback(err, where);
      } catch (e) {
        /* reporting is best effort */
      }
    }
  }

  R.makeLayout = function (info) {
    lastInfo = info;
    if (R.kind === 'real') {
      try {
        const L = real.makeLayout(info);
        if (L) return L;
        throw new Error('makeLayout returned nothing');
      } catch (e) {
        fallback(e, 'makeLayout');
      }
    }
    return stub.stubLayout(info);
  };

  R.draw = function (screen, ctx, vm, layout) {
    if (R.kind === 'real') {
      try {
        const m = real.screens[screen];
        if (!m || typeof m.draw !== 'function') throw new Error('no renderer for screen ' + screen);
        const hits = m.draw(ctx, vm, layout);
        if (!Array.isArray(hits)) throw new Error('draw returned no hit list');
        return hits;
      } catch (e) {
        fallback(e, 'draw:' + screen);
      }
    }
    return stub.draw(screen, ctx, vm, R.kind === 'stub' && lastInfo ? stub.stubLayout(lastInfo) : layout);
  };

  R.drawOverlay = function (ctx, ov, layout) {
    if (R.kind === 'real') {
      try {
        return real.overlay ? real.overlay.draw(ctx, ov, layout) || [] : [];
      } catch (e) {
        fallback(e, 'overlay');
      }
    }
    return stub.drawOverlay(ctx, ov, R.kind === 'stub' && lastInfo ? stub.stubLayout(lastInfo) : layout);
  };

  return R;
}

module.exports = { loadRenderers, hitTestLocal, hitAt, SCREENS };
