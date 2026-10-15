/**
 * Render tests (node:test, no dependencies): every fixture screen x state x
 * display mode x window size draws without throwing, tap areas and text obey
 * the spec's UI acceptance criteria (AC 44, 70, 71), nothing overlaps the
 * pinned buttons, and the daily share card shows no positions.
 * Run: node --test apps/kedupan/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const render = require('../js/render');
const T = require('../js/render/theme');
const { buildFixtures, MODES, SIZES } = require('../tools/preview/fixtures.js');
const { makeLayout, hitTest } = require('../js/render/layout');

// ---------------------------------------------------------------- mock ctx

function fontSize(f) {
  const m = /([\d.]+)px/.exec(f || '');
  return m ? Number(m[1]) : 10;
}

function textWidth(s, size) {
  let w = 0;
  Array.from(String(s)).forEach((ch) => {
    w += (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.58) * size;
  });
  return w;
}

/** A recording 2D context that tracks translate/clip so hidden text is ignored. */
function mockCtx() {
  const calls = [];
  const state = { font: '10px sans-serif', textAlign: 'left' };
  const stack = [];
  let tx = 0;
  let ty = 0;
  let clip = null;
  let pendingRect = null;
  const grad = { addColorStop() {} };
  const api = {
    save: () => stack.push({ tx, ty, clip }),
    restore: () => {
      const s = stack.pop();
      if (s) ({ tx, ty, clip } = s);
    },
    translate: (x, y) => {
      tx += x;
      ty += y;
    },
    rect: (x, y, w, h) => {
      pendingRect = { x: x + tx, y: y + ty, w, h };
    },
    clip: () => {
      if (pendingRect) clip = pendingRect;
    },
    fillText: (s, x, y) => {
      const size = fontSize(state.font);
      const w = textWidth(s, size);
      const align = state.textAlign;
      const left = (align === 'center' ? x - w / 2 : align === 'right' ? x - w : x) + tx;
      const box = { s: String(s), x: left, y: y + ty - size * 0.6, w, h: size * 1.2, size };
      if (clip && (box.y + box.h <= clip.y || box.y >= clip.y + clip.h || box.x + box.w <= clip.x || box.x >= clip.x + clip.w)) return;
      box.clipped = !!clip;
      if (clip) {
        const y1 = Math.max(box.y, clip.y);
        const y2 = Math.min(box.y + box.h, clip.y + clip.h);
        box.y = y1;
        box.h = y2 - y1;
      }
      calls.push(box);
    },
    measureText: (s) => ({ width: textWidth(s, fontSize(state.font)) }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    fillRect: (x, y, w, h) => {
      // a full-screen fill (desk, scrim, ad stub) hides everything drawn before it
      if (w >= 300 && h >= 500 && x <= 0 && y <= 0) calls.length = 0;
    },
  };
  return new Proxy(
    {},
    {
      get(t, p) {
        if (p === '__calls') return calls;
        if (p in api) return api[p];
        if (p in state) return state[p];
        return () => {};
      },
      set(t, p, v) {
        state[p] = v;
        return true;
      },
    }
  );
}

function mockCreateCanvas(w, h) {
  return { width: w || 0, height: h || 0, getContext: () => mockCtx() };
}

function layoutFor(sz) {
  return makeLayout({
    windowWidth: sz.w,
    windowHeight: sz.h,
    pixelRatio: 2,
    statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.bottomInset },
    menuRect: { ...sz.menu, width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top },
  });
}

const STRUCTURAL = /(:block|:card|:scrim|:body|^sheet:close$|:scroll$|:list$|^board:list$|^coach:block$)/;

/** Run fn(ctxInfo) for every fixture x mode x size. */
function eachState(fn, opts) {
  opts = opts || {};
  const sizes = opts.sizes || SIZES;
  const modes = opts.modes || Object.keys(MODES);
  for (const sz of sizes) {
    const L = layoutFor(sz);
    for (const mode of modes) {
      const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] });
      for (const screen of Object.keys(fx)) {
        if (screen === 'shareCard') continue;
        for (const name of Object.keys(fx[screen])) {
          const st = fx[screen][name];
          const ctx = mockCtx();
          const raw = render.screens[screen].draw(ctx, st.vm, L);
          let hits = raw;
          if (st.overlay) hits = raw.concat(render.overlay.draw(ctx, st.overlay, L));
          // hit areas under a full-screen scrim (sheet, dialog, coach) are unreachable
          let cut = -1;
          hits.forEach((h, i) => {
            if (h.w >= L.W - 1 && h.h >= L.H - 1) cut = i;
          });
          if (cut > 0) hits = hits.slice(cut);
          const base = cut > 0 ? raw.slice(Math.max(0, cut)) : raw;
          ['scrollMax', 'ruler', 'board', 'banner'].forEach((k) => {
            hits[k] = raw[k];
            base[k] = raw[k];
          });
          fn({ screen, name, mode, hits, base, calls: ctx.__calls, L, sz, vm: st.vm, st, label: screen + '/' + name + ' [' + mode + ' ' + L.W + 'x' + L.H + ']' });
        }
      }
    }
  }
}

// ------------------------------------------------------------------- tests

test('every screen x state x display mode x size draws and returns hit areas', () => {
  let n = 0;
  eachState((c) => {
    assert.ok(Array.isArray(c.hits), c.label);
    c.hits.forEach((h) => {
      assert.ok(typeof h.id === 'string' && h.id.length, 'id ' + c.label);
      assert.ok([h.x, h.y, h.w, h.h].every(Number.isFinite), 'finite ' + c.label + ' ' + h.id);
    });
    assert.ok(c.hits.scrollMax && typeof c.hits.scrollMax === 'object', 'scrollMax ' + c.label);
    n++;
  });
  assert.ok(n > 1500, 'rendered ' + n);
});

test('AC 70: touch targets are at least 48 x 48', () => {
  eachState((c) => {
    c.hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || h.id === 'ruler') return;
      if (h.w >= c.L.W - 1) return; // full-screen swallowers
      // areas clipped by a scroll viewport can be shorter at the edge
      const edge = h.y <= c.L.navBottom + 1 || h.y + h.h >= c.L.bottomEdge - 1;
      if ((edge || Object.keys(c.hits.scrollMax).some((k) => c.hits.scrollMax[k] > 0)) && h.h < 47.9 && h.h > 0 && h.w >= 47.9) return;
      assert.ok(h.w >= 47.9 && h.h >= 47.9, c.label + ' ' + h.id + ' is ' + h.w.toFixed(1) + 'x' + h.h.toFixed(1));
    });
  });
});

test('AC 70: the ruler touch band is >= 64 tall (>= 80 in large text) and nearly full width', () => {
  let seen = 0;
  eachState((c) => {
    let r = c.hits.find((h) => h.id === 'ruler');
    if (!r) return;
    seen++;
    const need = MODES[c.mode].largeText ? 80 : 64;
    if (r.h < need) {
      // clipped by the scroll viewport: it must be fully reachable by scrolling down
      const key = Object.keys(c.hits.scrollMax).find((k) => c.hits.scrollMax[k] > 0 && /^(play|round):scroll$/.test(k));
      assert.ok(key, c.label + ' band ' + r.h.toFixed(1) + ' is clipped and the screen does not scroll');
      const vm2 = Object.assign({}, c.vm, { scrollY: c.hits.scrollMax[key] });
      const again = render.screens[c.screen].draw(mockCtx(), vm2, c.L);
      r = again.find((h) => h.id === 'ruler');
    }
    assert.ok(r.h >= need, c.label + ' band ' + r.h.toFixed(1));
    assert.ok(r.w >= c.L.contentW, c.label + ' band width');
    assert.ok(c.hits.ruler && c.hits.ruler.x1 > c.hits.ruler.x0, c.label + ' hitAreas.ruler');
  });
  assert.ok(seen > 100);
});

test('AC 44: nothing tappable overlaps the capsule menu or sits below the bottom inset', () => {
  eachState((c) => {
    const k = c.L.capsule;
    c.hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || h.w >= c.L.W - 1) return;
      const overlap = h.x < k.x + k.w && h.x + h.w > k.x && h.y < k.y + k.h && h.y + h.h > k.y;
      assert.ok(!overlap, c.label + ' ' + h.id + ' overlaps the capsule');
      assert.ok(h.y + h.h <= c.L.bottomEdge + 0.5, c.label + ' ' + h.id + ' below the safe area');
    });
  });
});

test('no text is drawn in the capsule row on the right', () => {
  eachState((c) => {
    const k = c.L.capsule;
    c.calls.forEach((t) => {
      if (c.screen === 'home' && c.st.overlay) return;
      const overlap = t.x < k.x + k.w && t.x + t.w > k.x && t.y < k.y + k.h && t.y + t.h > k.y;
      assert.ok(!overlap, c.label + ' text "' + t.s + '" in the capsule row');
    });
  });
});

test('primary buttons sit in the bottom 45% (centre) above the inset', () => {
  const primaries = { play: ['play:primary'], host: ['host:share', 'host:retry', 'host:home'], round: ['round:confirm', 'round:reveal', 'round:share', 'round:late', 'round:retry', 'round:host', 'round:daily'], review: ['review:next', 'review:list'], result: ['result:share'] };
  let seen = 0;
  eachState((c) => {
    if (c.L.W > 500 || c.screen === 'home') return;
    (primaries[c.screen] || []).forEach((id) => {
      const h = c.base.filter((a) => a.id === id).pop();
      if (!h || h.y < c.L.navBottom) return;
      seen++;
      assert.ok(h.y + h.h / 2 >= c.L.H * 0.55, c.label + ' ' + id + ' centre ' + (h.y + h.h / 2).toFixed(0));
      assert.ok(h.y + h.h <= c.L.bottomEdge + 0.5);
    });
  });
  assert.ok(seen > 200, 'seen ' + seen);
});

test('home: the daily button sits in the bottom 60% (phones)', () => {
  eachState((c) => {
    if (c.screen !== 'home' || c.L.W > 500 || c.vm.sheet) return;
    const h = c.base.find((a) => a.id === 'home:daily' || a.id === 'home:retry');
    if (!h || h.y < c.L.navBottom) return;
    assert.ok(h.y + h.h / 2 >= c.L.H * 0.4, c.label);
  });
});

test('AC 70/71: text >= 16pt; body >= 20pt-class in large text; prompt and scores meet the spec', () => {
  eachState((c) => {
    c.calls.forEach((t) => {
      if (Array.from(t.s).length <= 1) return; // single glyphs and icons
      assert.ok(t.size >= 15.99, c.label + ' "' + t.s + '" is ' + t.size.toFixed(1) + 'px');
    });
    const big = MODES[c.mode].largeText;
    if (c.screen === 'play' && ['placing', 'longPrompt'].includes(c.name)) {
      const p = c.calls.find((t) => t.s === c.vm.card.prompt || c.vm.card.prompt.startsWith(t.s));
      assert.ok(p && p.size >= (big ? 33.99 : 27.99), c.label + ' prompt size ' + (p && p.size));
    }
    if (c.screen === 'play' && c.name === 'revealedGroup') {
      const s = c.calls.find((t) => t.s === '+88');
      assert.ok(s && s.size >= (big ? 47.99 : 39.99), c.label + ' score size ' + (s && s.size));
    }
    if (c.screen === 'result' && c.name === 'live') {
      const s = c.calls.find((t) => t.s === '412');
      assert.ok(s && s.size >= (big ? 47.99 : 39.99), c.label + ' total size');
    }
    if (big && c.screen === 'play' && c.name === 'placing') {
      const body = c.calls.find((t) => t.s === '2 / 5');
      assert.ok(body && body.size >= 21.9, c.label + ' large body');
    }
  });
});

test('no overlap: text never crosses a button edge and never collides with other text', () => {
  const inside = (t, h) => t.x >= h.x - 1 && t.x + t.w <= h.x + h.w + 1 && t.y + 1 >= h.y - 4 && t.y + t.h <= h.y + h.h + 4;
  eachState((c) => {
    if (c.st.overlay && (c.st.overlay.adStub || c.st.overlay.toast)) return; // toasts float over content by design
    const buttons = c.hits.filter((h) => !STRUCTURAL.test(h.id) && h.id !== 'ruler' && h.w < c.L.W - 1);
    c.calls.forEach((t) => {
      if (t.s.length < 2) return;
      buttons.forEach((h) => {
        const ix = Math.min(t.x + t.w, h.x + h.w) - Math.max(t.x, h.x);
        const iy = Math.min(t.y + t.h, h.y + h.h) - Math.max(t.y, h.y);
        if (ix > 3 && iy > 3 && !inside(t, h)) {
          // allow a link whose own grown tap area contains the label horizontally
          assert.fail(c.label + ' text "' + t.s + '" crosses ' + h.id);
        }
      });
    });
    for (let i = 0; i < c.calls.length; i++) {
      for (let j = i + 1; j < c.calls.length; j++) {
        const a = c.calls[i];
        const b = c.calls[j];
        if (a.s.length < 2 && b.s.length < 2) continue;
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix > 4 && iy > Math.min(a.h, b.h) * 0.45 && !(c.name.startsWith('revealAnim') || c.name === 'bullseye')) {
          assert.fail(c.label + ' texts collide: "' + a.s + '" and "' + b.s + '"');
        }
      }
    }
  });
});

test('banner rects are reserved with a >= 24 gap and nothing overlaps them', () => {
  let seen = 0;
  eachState((c) => {
    if (!c.vm.banner || !c.vm.banner.show) {
      assert.ok(!c.hits.banner, c.label + ' banner when off');
      return;
    }
    const b = c.hits.banner;
    assert.ok(b && b.h === c.vm.banner.reservedHeight, c.label + ' banner rect');
    seen++;
    c.hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || h.w >= c.L.W - 1) return;
      assert.ok(h.y + h.h <= b.y - 23.9, c.label + ' ' + h.id + ' within 24 of the banner');
    });
  });
  assert.ok(seen > 20);
});

test('hit ids are documented in CONTRACT.md', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const missing = new Set();
  eachState(
    (c) => {
      c.hits.forEach((h) => {
        if (/:block$|:card$/.test(h.id)) return;
        const norm = h.id
          .replace(/^host:spectrum:\d+$/, 'host:spectrum:<i>')
          .replace(/^host:clue:.+$/, 'host:clue:<itemId>')
          .replace(/^archive:item:.+$/, 'archive:item:<dateKey>')
          .replace(/^group:round:.+$/, 'group:round:<roundId>');
        if (!doc.includes(norm)) missing.add(c.screen + ' ' + norm);
      });
    },
    { sizes: [SIZES[0]], modes: ['standard'] }
  );
  assert.deepStrictEqual([...missing], []);
});

test('scroll areas expose scrollMax; scrolled taps are clipped to the viewport', () => {
  let scrollable = 0;
  eachState((c) => {
    Object.keys(c.hits.scrollMax).forEach((k) => assert.ok(c.hits.scrollMax[k] >= 0, c.label + ' ' + k));
    if (c.hits.scrollMax['play:scroll'] > 0) scrollable++;
  });
  assert.ok(scrollable > 0, 'some play states scroll in large text on small screens');
  // scrolled copy
  const L = layoutFor(SIZES[1]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES.large });
  const vm = Object.assign({}, fx.result.live.vm, { scrollY: 99999 });
  const hits = render.screens.result.draw(mockCtx(), vm, L);
  assert.ok(hits.scrollMax['result:scroll'] > 0);
  hits
    .filter((h) => h.id.startsWith('result:') && !STRUCTURAL.test(h.id) && h.id !== 'result:share' && h.id !== 'result:group' && h.id !== 'result:friend')
    .forEach((h) => assert.ok(h.y >= L.navBottom - 1 && h.y + h.h <= L.bottomEdge + 1, h.id + ' within viewport'));
});

test('posFromX maps the ruler track to integers 0-100', () => {
  const tr = { x0: 30, x1: 330 };
  assert.strictEqual(render.posFromX(tr, 30), 0);
  assert.strictEqual(render.posFromX(tr, 330), 100);
  assert.strictEqual(render.posFromX(tr, 180), 50);
  assert.strictEqual(render.posFromX(tr, -50), 0);
  assert.strictEqual(render.posFromX(tr, 900), 100);
  assert.ok(Number.isInteger(render.posFromX(tr, 101.3)));
});

test('hitTest: later areas win (overlays over screens)', () => {
  const hits = [{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'b', x: 10, y: 10, w: 20, h: 20 }];
  assert.strictEqual(hitTest(hits, 15, 15), 'b');
  assert.strictEqual(hitTest(hits, 50, 50), 'a');
  assert.strictEqual(hitTest(hits, 500, 5), null);
});

test('layout: content starts below the capsule row on every size and survives missing menu info', () => {
  SIZES.forEach((sz) => {
    const L = layoutFor(sz);
    assert.strictEqual(L.navBottom, sz.menu.bottom + (sz.menu.top - sz.sb));
    assert.ok(L.contentW <= 500 && L.contentW > 0);
  });
  const L = makeLayout({ windowWidth: 360, windowHeight: 640 });
  assert.ok(L.navBottom > 0 && L.bottomEdge === 640);
});

test('AC 71: contrast tokens (default >= 4.5 body, high contrast >= 7 text and >= 3 markers)', () => {
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const S = T.STANDARD;
  const H = T.HIGH_CONTRAST;
  [['ink', 'bg'], ['sub', 'bg'], ['ink', 'card'], ['sub', 'card'], ['ink', 'noteYellow'], ['ink', 'tape'], ['primaryInk', 'primary'], ['youText', 'bg'], ['nationText', 'bg'], ['groupText', 'bg'], ['targetText', 'bg'], ['lbl1', 'card'], ['lbl2', 'card'], ['lbl3', 'card'], ['lbl4', 'card'], ['lbl5', 'card'], ['danger', 'card'], ['good', 'card'], ['warn', 'noteYellow']].forEach(([f, b]) => {
    assert.ok(ratio(S[f], S[b]) >= 4.5, 'standard ' + f + ' on ' + b + ' = ' + ratio(S[f], S[b]).toFixed(2));
  });
  [['ink', 'bg'], ['sub', 'bg'], ['primaryInk', 'primary'], ['youText', 'bg'], ['nationText', 'bg'], ['groupText', 'bg'], ['targetText', 'bg'], ['lbl1', 'card'], ['lbl2', 'card'], ['lbl3', 'card'], ['lbl4', 'card'], ['lbl5', 'card'], ['ink', 'noteYellow'], ['ink', 'tape'], ['warn', 'noteYellow'], ['good', 'card'], ['danger', 'card']].forEach(([f, b]) => {
    assert.ok(ratio(H[f], H[b]) >= 7, 'high contrast ' + f + ' on ' + b + ' = ' + ratio(H[f], H[b]).toFixed(2));
  });
  ['you', 'nation', 'group', 'target'].forEach((k) => assert.ok(ratio(H[k], H.bg) >= 3, 'high contrast marker ' + k));
});

test('display modes: applyDisplay switches sizes and palette, and resets', () => {
  T.applyDisplay({ largeText: true, highContrast: true });
  assert.ok(T.FS.prompt >= 34 && T.FS.score >= 48 && T.FS.buttonH >= 56 && T.FS.band >= 80 && T.FS.body >= 20);
  assert.strictEqual(T.C.bg, '#FFFFFF');
  T.applyDisplay(null);
  assert.ok(T.FS.prompt >= 28 && T.FS.score >= 40 && T.FS.body >= 16);
  assert.strictEqual(T.C.bg, '#FBF6EC');
});

test('share cards: 500x400, standard look, and the daily card draws no positions (AC 52)', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES.largehc });
  Object.keys(fx.shareCard).forEach((name) => {
    const canvas = { width: 0, height: 0, getContext: () => mockCtx() };
    // render() uses the canvas ctx; keep a handle to inspect the text it draws
    const ctx = mockCtx();
    canvas.getContext = () => ctx;
    render.shareCard.render(canvas, fx.shareCard[name].vm, { pixelScale: 2 });
    assert.strictEqual(canvas.width, 1000);
    assert.strictEqual(canvas.height, 800);
    assert.strictEqual(T.C.bg, '#FBF6EC', 'standard look even after a high-contrast screen');
    ctx.__calls.forEach((t) => assert.ok(t.size >= 15.99, name + ' "' + t.s + '" ' + t.size));
    ctx.__calls.forEach((t) => assert.ok(t.x >= -1 && t.x + t.w <= 501 && t.y >= -1 && t.y + t.h <= 401, name + ' "' + t.s + '" inside the card'));
  });
  const vm = JSON.parse(JSON.stringify(fx.shareCard.daily.vm));
  vm.rows.forEach((r, i) => Object.assign(r, { you: 4100 + i, nation: 4200 + i, pos: 4300 + i, median: 4400 + i, scoreText: '+4500' }));
  vm.groupText = '本群 4600';
  const ctx = mockCtx();
  render.shareCard.draw(ctx, vm);
  const all = ctx.__calls.map((t) => t.s).join('|');
  assert.ok(!/4[1-6]\d\d/.test(all), 'no positions, medians or group numbers on the daily card: ' + all);
  assert.ok(all.includes('火锅') && all.includes('很同频') && all.includes('412'));
});

test('every action is reachable by scrolling to the end (320x568, all display modes)', () => {
  const want = [
    ['result', 'live', ['result:bonus', 'result:dist', 'result:host', 'result:archive']],
    ['host', 'pickClue', ['host:clueSwap', 'host:clue:i1', 'host:mode:chat']],
    ['round', 'revealedAnon', ['round:openSetting']],
    ['round', 'revealedPrivacy', ['round:contract', 'round:agree']],
    ['round', 'submitted', ['round:subscribe']],
    ['review', 'review', ['review:dist']],
    ['group', 'ready', ['group:share', 'group:round:r1']],
    ['archive', 'ready', ['archive:more', 'archive:item:20261009']],
  ];
  ['standard', 'large', 'hc', 'largehc'].forEach((mode) => {
    const L = layoutFor(SIZES[1]);
    const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] });
    want.forEach(([screen, name, ids]) => {
      const vm = fx[screen][name].vm;
      const first = render.screens[screen].draw(mockCtx(), vm, L);
      const key = Object.keys(first.scrollMax).find((k) => /:scroll$/.test(k));
      const hits = render.screens[screen].draw(mockCtx(), Object.assign({}, vm, { scrollY: first.scrollMax[key] }), L);
      ids.forEach((id) => {
        const h = hits.find((a) => a.id === id);
        assert.ok(h, screen + '/' + name + ' [' + mode + '] ' + id + ' not reachable');
        assert.ok(h.w >= 47.9 && h.h >= 47.9, screen + '/' + name + ' [' + mode + '] ' + id + ' size ' + h.w + 'x' + h.h);
      });
    });
  });
});
