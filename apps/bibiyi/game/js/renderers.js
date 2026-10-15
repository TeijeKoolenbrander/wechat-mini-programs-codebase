/**
 * Picks the renderer and bridges the two vocabularies.
 *
 * `js/render/*` (frontend-ui) draws one screen or one sheet per module and names
 * its tap areas after the module (`play:hi`, `result:bottom:report`, ...).
 * `js/controller.js` talks in the hook ids documented in js/HOOKS.md (`answer:hi`,
 * `report:miss:bottom`, ...) and hands over ONE view model per screen with
 * `vm.sheet` / `vm.sheetVm`. This file is the only place that knows both:
 *
 *   draw(screen, ctx, vm, layout)
 *     1. rebuilds the layout when the display mode changed (大字模式 / 高对比度)
 *     2. draws the screen, then the open sheet over it (view-model adapters below)
 *     3. renames every hit id to its HOOKS.md name (`mapId`)
 *
 * Interface the game loop uses (stub-render.js implements the same):
 *   { kind, makeLayout(info), draw(screen, ctx, vm, layout) -> hits,
 *     drawOverlay(ctx, overlayVm, layout) -> hits, hitTest(hits,x,y), shareCard }
 *
 * Nothing here draws; it only adapts. Pure, no wx.
 */

const stub = require('./stub-render');

function hitTestLocal(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const a = hits[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.id;
  }
  return null;
}

// ---------------------------------------------------------------- hit ids

/** Render id -> HOOKS.md id. Ids not listed pass through unchanged. */
const ID_MAP = {
  'play:back': 'back',
  'play:hi': 'answer:hi',
  'play:lo': 'answer:lo',
  'play:cards': 'play:cards', // tap = skip, drag = scroll; the controller handles both under this id
  'rewarded:watch': 'continue:video',
  'rewarded:skip': 'continue:result',
  'sources:back': 'sheet:close',
};

const ID_RULES = [
  [/^play:(source|report)(Top|Bottom)$/, (m) => m[1] + ':' + m[2].toLowerCase()],
  [/^result:(top|bottom):(source|report)$/, (m) => m[2] + ':miss:' + m[1]],
  [/^questions:(\d+):(top|bottom):(source|report)$/, (m) => m[3] + ':q:' + m[1] + ':' + m[2]],
  [/^issue:(\d+):(top|bottom):(source|report)$/, (m) => m[3] + ':issue:' + m[1] + ':' + m[2]],
  [/^picker:(.+)$/, (m) => 'category:' + m[1]],
];

function mapId(id) {
  if (ID_MAP[id] !== undefined) return ID_MAP[id];
  for (let i = 0; i < ID_RULES.length; i++) {
    const m = ID_RULES[i][0].exec(id);
    if (m) return ID_RULES[i][1](m);
  }
  return id;
}

function remap(hits, extra) {
  const out = hits.map((h) => {
    const id = extra && extra[h.id] ? extra[h.id] : mapId(h.id);
    return id === h.id ? h : { id, x: h.x, y: h.y, w: h.w, h: h.h };
  });
  const sm = {};
  Object.keys(hits.scrollMax || {}).forEach((k) => {
    sm[extra && extra[k] ? extra[k] : mapId(k)] = hits.scrollMax[k];
  });
  out.scrollMax = sm;
  return out;
}

// ---------------------------------------------------------------- view-model adapters

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Controller play vm -> render play vm: one progress value becomes the flip then the count-up. */
function adaptPlay(vm) {
  if (vm.phase !== 'revealing') return vm;
  const p = clamp01(vm.revealT || 0);
  return Object.assign({}, vm, { turn: clamp01(p / 0.4), count: clamp01((p - 0.4) / 0.6) });
}

function adaptScreenVm(screen, vm) {
  if (screen === 'play') return adaptPlay(vm);
  return vm;
}

/** The sheet module and its view model for `vm.sheet`; null when the sheet has no module. */
function sheetPlan(R, kind, vm) {
  const sv = Object.assign({}, vm.sheetVm || {}, { sheetScroll: vm.sheetScroll || 0 });
  switch (kind) {
    case 'howto':
      return { mod: R.sheets.howto, vm: sv };
    case 'settings':
      return { mod: R.sheets.settings, vm: sv };
    case 'category':
      return { mod: R.sheets.picker, vm: sv };
    case 'continue':
      return { mod: R.sheets.rewarded, vm: sv };
    case 'source':
      return { mod: R.sheets.source, vm: sv };
    case 'report':
      return { mod: R.sheets.report, vm: sv };
    case 'questions':
      return { mod: R.sheets.questions, vm: sv };
    case 'sources':
      // a full page in the render layer, a sheet for the controller: back = close
      return { mod: R.screens.sources, vm: { sources: sv.sources, scrollY: sv.sheetScroll }, ids: { 'sources:scroll': 'sheet:list' }, page: true };
    case 'albumDenied':
      return { dialog: { title: sv.text, text: '请在设置里允许「保存到相册」。', confirmLabel: sv.openLabel, cancelLabel: sv.cancelLabel }, ids: { 'dialog:confirm': 'save:openSetting', 'dialog:cancel': 'sheet:close' } };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- the real renderer

function realRenderers(real) {
  const cache = { sys: null, key: null, layout: null };
  let lastDisplay = null;

  function displayKey(d) {
    return d ? (d.largeText ? 'L' : '-') + (d.highContrast ? 'H' : '-') : '--';
  }

  function makeLayout(info) {
    const sys = Object.assign({}, info);
    cache.sys = sys;
    cache.key = displayKey(sys.display);
    cache.layout = real.makeLayout(sys);
    return cache.layout;
  }

  /** The layout for this display mode (rebuilt only when 大字模式 / 高对比度 changed). */
  function layoutFor(layout, display) {
    const d = display || lastDisplay;
    lastDisplay = d || lastDisplay;
    if (!d) return layout;
    const k = displayKey(d);
    if (layout && layout.display && displayKey(layout.display) === k) return layout;
    if (cache.layout && cache.key === k) return cache.layout;
    if (!cache.sys) return layout;
    cache.sys = Object.assign({}, cache.sys, { display: { largeText: !!d.largeText, highContrast: !!d.highContrast } });
    cache.key = k;
    cache.layout = real.makeLayout(cache.sys);
    return cache.layout;
  }

  function draw(screen, ctx, vm, layout) {
    const L = layoutFor(layout, vm.display);
    let hits = real.screens[screen].draw(ctx, adaptScreenVm(screen, vm), L);
    hits = remap(hits);
    if (vm.sheet) {
      const plan = sheetPlan(real, vm.sheet, vm);
      if (plan) {
        let sh;
        if (plan.dialog) sh = real.overlay.draw(ctx, { dialog: plan.dialog }, L);
        else sh = plan.mod.draw(ctx, plan.vm, L);
        hits = real.mergeHits(hits, remap(sh, plan.ids));
      }
    }
    return hits;
  }

  function drawOverlay(ctx, ov, layout) {
    if (!ov || (!ov.dialog && !ov.toast && !ov.adStub && !ov.privacy)) return remap(Object.assign([], { scrollMax: {} }));
    return remap(real.overlay.draw(ctx, ov, layoutFor(layout, null)));
  }

  /** Controller card vm (HOOKS.md) -> render card vm (CONTRACT.md). */
  function adaptCard(card) {
    const out = Object.assign({}, card);
    if (card.pair) out.hook = { topLabel: card.pair.topLabel, bottomLabel: card.pair.bottomLabel, subLabel: card.pair.subLabel };
    return out;
  }

  return {
    kind: 'real',
    makeLayout,
    draw,
    drawOverlay,
    hitTest: real.hitTest || hitTestLocal,
    shareCard: real.shareCard
      ? {
          render: (canvas, card, opts) => real.shareCard.render(canvas, adaptCard(card), opts),
          draw: real.shareCard.draw ? (ctx, card, opts) => real.shareCard.draw(ctx, adaptCard(card), opts) : undefined,
        }
      : null,
    // exposed for the contract tests
    mapId,
  };
}

function loadRenderers() {
  let real = null;
  try {
    real = require('./render/index');
  } catch (e) {
    real = null;
  }
  if (real && real.screens && real.makeLayout) return realRenderers(real);
  return { kind: 'stub', makeLayout: stub.stubLayout, draw: stub.draw, drawOverlay: stub.drawOverlay, hitTest: hitTestLocal, shareCard: null, mapId: (id) => id };
}

module.exports = { loadRenderers, hitTestLocal, mapId, ID_MAP, ID_RULES, sheetPlan };
