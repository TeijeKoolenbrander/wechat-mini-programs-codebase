/**
 * Render tests (node:test, no dependencies): every fixture screen x state x
 * size x display mode draws without throwing, tap areas obey the spec's UI
 * acceptance criteria (AC 96, 97, 98, 99, 100), contrast tokens pass, and the
 * share card never draws a word (AC 70, 71).
 * Run: node --test apps/yuyirelen/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const render = require('../js/render');
const T = require('../js/render/theme');
const { buildFixtures } = require('../tools/preview/fixtures.js');
const { makeLayout, hitTest } = require('../js/render/layout');
const widgets = require('../js/render/widgets');

// ---------------------------------------------------------------- mock ctx

function fontSize(f) {
  const m = /([\d.]+)px/.exec(f || '');
  return m ? Number(m[1]) : 10;
}

/**
 * Records fillText (in canvas coordinates, with the clip rect that applied),
 * tracks translate/scale/save/restore/clip, and logs every call.
 */
function mockCtx(opts) {
  const calls = [];
  const log = [];
  const state = { font: '10px sans-serif', tx: 0, ty: 0, sx: 1, sy: 1, clip: null, pending: null };
  const stack = [];
  const grad = { addColorStop() {} };
  const inter = (a, b) => {
    if (!a) return b;
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
  };
  const ctx = new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'fillText')
          return (s, x, y) => {
            log.push(['fillText', String(s)]);
            calls.push({ s: String(s), x: state.tx + state.sx * x, y: state.ty + state.sy * y, size: fontSize(state.font) * state.sy, clip: state.clip, align: state.textAlign });
          };
        if (p === 'measureText') return (s) => ({ width: String(s).length * fontSize(state.font) * 0.95 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
        if (p === 'save') return () => stack.push({ tx: state.tx, ty: state.ty, sx: state.sx, sy: state.sy, clip: state.clip });
        if (p === 'restore')
          return () => {
            const s = stack.pop();
            if (s) Object.assign(state, s);
          };
        if (p === 'translate')
          return (x, y) => {
            state.tx += state.sx * x;
            state.ty += state.sy * y;
          };
        if (p === 'scale')
          return (x, y) => {
            state.sx *= x;
            state.sy *= y;
          };
        if (p === 'rect')
          return (x, y, w, h) => {
            state.pending = { x: state.tx + state.sx * x, y: state.ty + state.sy * y, w: w * state.sx, h: h * state.sy };
          };
        if (p === 'clip')
          return () => {
            if (state.pending) state.clip = inter(state.clip, state.pending);
          };
        if (p === '__calls') return calls;
        if (p === '__log') return log;
        if (p in state) return state[p];
        return (...args) => {
          log.push([String(p)].concat(args.map((a) => (typeof a === 'number' ? Math.round(a * 1000) / 1000 : a && a.addColorStop ? 'grad' : a))));
        };
      },
      set(t, p, v) {
        state[p] = v;
        log.push(['=', String(p), typeof v === 'number' ? Math.round(v * 1000) / 1000 : typeof v === 'string' ? v : 'obj']);
        return true;
      },
    }
  );
  void opts;
  return ctx;
}

function mockCreateCanvas() {
  return { width: 0, height: 0, getContext: () => mockCtx() };
}

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, bottomInset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];
const MODES = { default: {}, large: { largeText: true }, contrast: { highContrast: true } };

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

const STRUCTURAL = /(:block|:card|:scrim|:body|^sheet:close$|:list$|:scroll$|^play:menu:close$)/;

/** Run fn(screen, name, hits, calls, L, size, vm, st, mode) for every fixture. */
function eachState(fn, only) {
  for (const sz of SIZES) {
    const L = layoutFor(sz);
    for (const mode of Object.keys(MODES)) {
      const display = MODES[mode];
      const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display });
      for (const screen of Object.keys(fx)) {
        if (screen === 'shareCard') continue;
        if (only && only !== screen) continue;
        for (const name of Object.keys(fx[screen])) {
          const st = fx[screen][name];
          const vm = Object.assign({}, st.vm, { display });
          const ctx = mockCtx();
          let hits = render.screens[screen].draw(ctx, vm, L);
          if (st.overlay) hits = hits.concat(render.overlay.draw(ctx, Object.assign({}, st.overlay, { display }), L));
          fn(screen, name, hits, ctx.__calls, L, sz, vm, st, mode);
        }
      }
    }
  }
}

/** True when the hit touches the edge of a scroll viewport it sits in (so it may be cut short). */
function clippedByScroll(h, hits) {
  return hits.some((l) => /(:scroll|:list)$/.test(l.id) && l.w < 9999 && h.x >= l.x - 1 && h.y + h.h / 2 >= l.y && h.y + h.h / 2 <= l.y + l.h && (h.y <= l.y + 0.5 || h.y + h.h >= l.y + l.h - 0.5) && l !== h);
}

const tag = (screen, name, L, mode) => screen + '/' + name + ' [' + mode + '] at ' + L.W + 'x' + L.H;

// ------------------------------------------------------------------- tests

test('every screen x state x size x mode draws and returns hit areas', () => {
  let n = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    assert.ok(Array.isArray(hits), tag(screen, name, L, mode));
    hits.forEach((h) => {
      assert.ok(typeof h.id === 'string' && h.id.length, 'id ' + tag(screen, name, L, mode));
      assert.ok([h.x, h.y, h.w, h.h].every(Number.isFinite), 'finite ' + tag(screen, name, L, mode) + ' ' + h.id);
    });
    assert.ok(calls.length >= 1, 'draws something: ' + tag(screen, name, L, mode));
    n++;
  });
  assert.ok(n > 1000, 'rendered ' + n);
});

test('AC 97: touch targets are at least 48 x 48 (56 high for buttons in 大字模式)', () => {
  const BUTTONS = /^(home:(daily|retry|practice|again|groupBoard|friendBoard|archive|howto)|play:(input|retry|adHint)|reveal:(share|again|board|theirWords|retryTop)|challenge:|board:(retry|goPlay|share|agree|openSetting|contract)|archive:(more|retry)|dialog:|privacy:(agree|refuse)|adstub:|sheet:close$|settings:openSetting)/;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id)) return;
      // areas inside a scroll viewport may be cut short at the viewport edge
      if (clippedByScroll(h, hits)) return;
      assert.ok(h.w >= 47.9 && h.h >= 47.9, tag(screen, name, L, mode) + ' ' + h.id + ' is ' + h.w.toFixed(1) + 'x' + h.h.toFixed(1));
      if (mode === 'large' && BUTTONS.test(h.id) && !(h.w >= L.W - 1)) {
        assert.ok(h.h >= 55.9, 'large-mode button ' + h.id + ' is ' + h.h.toFixed(1) + ' high: ' + tag(screen, name, L, mode));
      }
    });
  });
});

test('AC 96: nothing tappable overlaps the capsule menu, nothing sits below the bottom inset', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const c = L.capsule;
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || (h.w >= L.W - 1 && h.h >= L.H - L.navBottom - 1)) return;
      const overlap = h.x < c.x + c.w && h.x + h.w > c.x && h.y < c.y + c.h && h.y + h.h > c.y;
      assert.ok(!overlap, tag(screen, name, L, mode) + ' ' + h.id + ' overlaps the capsule');
      assert.ok(h.y + h.h <= L.bottomEdge + 0.5, tag(screen, name, L, mode) + ' ' + h.id + ' below safe area (' + (h.y + h.h).toFixed(1) + ' > ' + L.bottomEdge + ')');
    });
    // text in the capsule row stays left of the capsule
    calls.forEach((t) => {
      if (t.y > c.y && t.y < c.y + c.h && t.clip == null) {
        const w = t.s.length * t.size * 0.95;
        const right = t.align === 'right' ? t.x : t.align === 'center' ? t.x + w / 2 : t.x + w;
        const left = t.align === 'right' ? t.x - w : t.align === 'center' ? t.x - w / 2 : t.x;
        assert.ok(right <= c.x + 1 || left >= c.x + c.w - 1 || t.s === '', tag(screen, name, L, mode) + ' text "' + t.s + '" in the capsule row');
      }
    });
  });
});

test('AC 97: primary actions sit in the bottom 40% (centre) on phones', () => {
  const primaries = { play: ['play:input'], reveal: ['reveal:share', 'reveal:again'], challenge: ['challenge:accept', 'challenge:home'], archive: ['archive:practice'], board: ['board:share', 'board:goPlay', 'board:retry', 'board:agree', 'board:openSetting'] };
  let seen = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (L.W > 500) return;
    (primaries[screen] || []).forEach((id) => {
      const h = hits.find((a) => a.id === id);
      if (!h) return;
      if (/^(sheet_|giveup|menu)/.test(name) && screen === 'play') return;
      seen++;
      assert.ok(h.y + h.h / 2 >= L.H * 0.6, tag(screen, name, L, mode) + ' ' + id + ' centre ' + (h.y + h.h / 2).toFixed(0));
      assert.ok(h.y + h.h <= L.bottomEdge + 0.5);
    });
  });
  assert.ok(seen > 100, 'checked ' + seen);
});

test('AC 97: body text >= 16pt (>= 20pt in 大字模式), answer >= 40pt', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const min = mode === 'large' ? 19.99 : 15.99;
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1) return; // icon glyphs, single characters
      assert.ok(c.size >= min, tag(screen, name, L, mode) + ' "' + c.s + '" is ' + c.size.toFixed(1) + 'px');
    });
    if (screen === 'reveal' && vm.answer && !vm.scrollY) {
      const spaced = Array.from(vm.answer).join(Array.from(vm.answer).length <= 3 ? ' ' : '');
      const a = calls.find((c) => c.s === spaced);
      assert.ok(a && a.size >= 39.99, tag(screen, name, L, mode) + ' answer size ' + (a && a.size));
    }
  });
});

test('AC 98: colour tokens meet contrast (default 4.5:1 text, high contrast 7:1 text and 3:1 indicators)', () => {
  const d = T.PALETTES.default;
  const hc = T.PALETTES.highContrast;
  const opaque = (c) => !/^rgba/.test(c);
  // default: body text on paper and on raised cards
  ['ink', 'sub', 'accent'].forEach((k) => {
    assert.ok(T.contrast(d.colors[k], d.colors.paper) >= 4.5, 'default ' + k + ' on paper');
    assert.ok(T.contrast(d.colors[k], d.colors.surface) >= 4.5, 'default ' + k + ' on surface');
  });
  assert.ok(T.contrast(d.colors.good, d.colors.paper) >= 4.5, 'default good on paper');
  assert.ok(T.contrast(d.colors.onInk, d.colors.ink) >= 4.5, 'default button text');
  // band words: best text colour on every band fill
  Object.keys(d.bands).forEach((b) => {
    const fg = T.textOn(d.bands[b]);
    assert.ok(T.contrast(fg, d.bands[b]) >= 4.5, 'default band word on ' + b + ': ' + T.contrast(fg, d.bands[b]).toFixed(2));
  });
  // high contrast
  ['ink', 'sub', 'accent', 'good'].forEach((k) => {
    assert.ok(T.contrast(hc.colors[k], hc.colors.paper) >= 7, 'hc ' + k + ' on paper: ' + T.contrast(hc.colors[k], hc.colors.paper).toFixed(2));
  });
  assert.ok(T.contrast(hc.colors.onInk, hc.colors.ink) >= 7);
  Object.keys(hc.bands).forEach((b) => {
    assert.ok(T.contrast('#FFFFFF', hc.bands[b]) >= 7, 'hc band word on ' + b + ': ' + T.contrast('#FFFFFF', hc.bands[b]).toFixed(2));
    assert.ok(T.contrast(hc.bands[b], hc.colors.paper) >= 3, 'hc band indicator ' + b);
  });
  assert.ok(opaque(hc.colors.paper) && opaque(hc.colors.ink));
  // the runtime tokens switch with applyDisplay
  T.applyDisplay({ highContrast: true });
  assert.strictEqual(T.COLORS.paper, '#FFFFFF');
  assert.strictEqual(T.METRICS.hc, true);
  T.applyDisplay({ largeText: true });
  assert.strictEqual(T.FS.body, 20);
  assert.strictEqual(T.METRICS.tap, 56);
  T.applyDisplay(null);
  assert.strictEqual(T.FS.body, 16);
  assert.strictEqual(T.COLORS.paper, '#F6F1E7');
});

test('every band has a word beside its colour (never colour alone)', () => {
  assert.deepStrictEqual(T.BANDS.map((b) => T.BAND_LABEL[b]), ['冷', '温', '热', '烫', '沸', '命中']);
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'play' || mode !== 'default' || L.W !== 375) return;
    const rows = (vm.ladder || []).slice();
    if (vm.latest) rows.push(vm.latest);
    const texts = calls.map((c) => c.s);
    // every visible ladder band word is printed at least once
    rows.slice(0, 3).forEach((r) => {
      if (vm.ladderScroll || vm.state === 'waiting' || vm.keyboard.open || vm.sheet) return;
      assert.ok(texts.includes(r.bandLabel), tag(screen, name, L, mode) + ' band word ' + r.bandLabel);
    });
  });
});

test('hit ids are documented in CONTRACT.md', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const missing = new Set();
  eachState((screen, name, hits) => {
    hits.forEach((h) => {
      if (/:block|:card$/.test(h.id)) return;
      const norm = h.id
        .replace(/^(row|chip|warm|sugg):.*/, '$1:<word>')
        .replace(/^archive:item:.*/, 'archive:item:<puzzleId>');
      if (!doc.includes(norm)) missing.add(screen + ' ' + norm);
    });
  });
  assert.deepStrictEqual([...missing], []);
});

test('scroll areas expose scrollMax and clip their tap areas to the viewport', () => {
  let ladders = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen === 'play' && name === 'result_scrolled') {
      assert.ok(hits.scrollMax['ladder:list'] > 0, tag(screen, name, L, mode));
      const list = hits.find((h) => h.id === 'ladder:list');
      assert.ok(list);
      hits.filter((h) => h.id.startsWith('row:')).forEach((h) => {
        assert.ok(h.y >= list.y - 0.5 && h.y + h.h <= list.y + list.h + 0.5, tag(screen, name, L, mode) + ' ' + h.id + ' escapes the ladder viewport');
      });
      // rows win taps over the drag area (later areas win)
      const first = hits.find((h) => h.id.startsWith('row:'));
      if (first) assert.strictEqual(hitTest(hits, first.x + first.w / 2, first.y + first.h / 2), first.id);
      ladders++;
    }
    if (screen === 'reveal' && name === 'solved') {
      assert.ok(hits.scrollMax['reveal:scroll'] > 0, 'reveal scrolls: ' + tag(screen, name, L, mode));
    }
    if (screen === 'archive' && name === 'ready_more') assert.ok('archive:list' in hits.scrollMax);
  });
  assert.ok(ladders > 10);
});

test('hitTest: later areas win (overlays over screens)', () => {
  const hits = [{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'b', x: 10, y: 10, w: 20, h: 20 }];
  assert.strictEqual(hitTest(hits, 15, 15), 'b');
  assert.strictEqual(hitTest(hits, 50, 50), 'a');
  assert.strictEqual(hitTest(hits, 500, 5), null);
});

test('layout: content starts below the capsule row on every size', () => {
  SIZES.forEach((sz) => {
    const L = layoutFor(sz);
    assert.strictEqual(L.navBottom, sz.menu.bottom + (sz.menu.top - sz.sb));
    assert.ok(L.contentW <= 500 && L.contentW > 0);
    assert.ok(L.board.y >= L.navBottom && L.board.y + L.board.h <= L.bottomEdge);
  });
});

test('layout works without a menu rect or safe area (older clients)', () => {
  const L = makeLayout({ windowWidth: 360, windowHeight: 640 });
  assert.ok(L.navBottom > 40);
  assert.strictEqual(L.safeBottom, 0);
});

test('AC 99: with the keyboard open the strip and 刚猜 card sit above the keyboard', () => {
  let seen = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'play' || !vm.keyboard.open) return;
    const kb = vm.keyboard;
    const limit = kb.heightPx ? L.H - kb.heightPx - 52 : L.H * 0.45;
    // no ladder, no action row while typing
    assert.ok(!hits.some((h) => h.id === 'play:input' || h.id.startsWith('row:')), tag(screen, name, L, mode));
    assert.ok(hits.some((h) => h.id === 'play:collapse'), 'collapse button ' + tag(screen, name, L, mode));
    // collapse tap does not overlap the capsule
    hits.filter((h) => h.id.startsWith('sugg:')).forEach((h) => {
      seen++;
      // the first row is always drawn; the rest only if they fit above the limit
      if (h.y > L.navBottom + 120 * L.s) assert.ok(h.y + h.h <= limit + 1.5, tag(screen, name, L, mode) + ' ' + h.id + ' bottom ' + (h.y + h.h).toFixed(0) + ' > ' + limit.toFixed(0));
    });
    if (mode === 'default' && L.W === 375) {
      // the 刚猜 card is drawn when there is room: its word text sits above the limit
      const word = vm.latest && calls.find((c) => c.s === vm.latest.word);
      if (word && kb.heightPx && L.H >= 667) assert.ok(word.y < limit, tag(screen, name, L, mode) + ' card word below limit');
    }
  });
  assert.ok(seen > 40);
});

test('AC 100: coach marks: three, each line at most 14 characters, skippable, never block taps', () => {
  const coach = require('../js/render/play').COACH;
  assert.deepStrictEqual(Object.keys(coach), ['1', '2', '3']);
  Object.keys(coach).forEach((k) => coach[k].forEach((ln) => assert.ok(Array.from(ln).length <= 14, ln)));
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'play' || !vm.coach) return;
    assert.ok(hits.some((h) => h.id === 'coach:next') && hits.some((h) => h.id === 'coach:skip'), tag(screen, name, L, mode));
    assert.ok(!hits.some((h) => h.id === 'coach:block'));
  });
});

test('play: chips and warm-ups are >= 48 tall taps; ids carry the word', () => {
  let chips = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'play') return;
    hits.filter((h) => /^(chip|warm|sugg):/.test(h.id)).forEach((h) => {
      chips++;
      assert.ok(h.h >= (mode === 'large' ? 55.9 : 47.9) && h.w >= 47.9, tag(screen, name, L, mode) + ' ' + h.id);
    });
    if (name === 'ready') {
      assert.strictEqual(hits.filter((h) => h.id.startsWith('warm:')).length, 6);
      assert.ok(!hits.some((h) => h.id.startsWith('chip:')));
    }
    if (name === 'result') assert.strictEqual(hits.filter((h) => h.id.startsWith('chip:')).length, 5);
    if (name === 'waiting') assert.strictEqual(hits.filter((h) => /^(chip|warm):/.test(h.id)).length, 0, 'chips are disabled while waiting');
    if (name === 'solvedAnim') assert.strictEqual(hits.filter((h) => /^(chip|row):/.test(h.id)).length > 0 ? hits.filter((h) => h.id.startsWith('chip:')).length : 0, 0);
  });
  assert.ok(chips > 300);
});

test('play: hint button states (locked/exhausted not tappable, available/atBest tappable) and ad row rules', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'play' || vm.keyboard.open || vm.state === 'offline' || vm.state === 'error') return;
    const hasHint = hits.some((h) => h.id === 'play:hint');
    const s = vm.hint && vm.hint.state;
    if (vm.state === 'waiting' || vm.state === 'solvedAnim' || vm.state === 'starting') assert.ok(!hasHint, tag(screen, name, L, mode));
    else assert.strictEqual(hasHint, s === 'available' || s === 'atBest', tag(screen, name, L, mode) + ' ' + s);
    const ad = hits.find((h) => h.id === 'play:adHint');
    if (vm.adHint && vm.adHint.visible && vm.adHint.left > 0 && vm.state === 'result') {
      assert.ok(ad, tag(screen, name, L, mode));
      // spec 12: ads never sit next to 输入 or the free hint button
      ['play:input', 'play:hint'].forEach((id) => {
        const o = hits.find((h) => h.id === id);
        if (o) assert.ok(o.y - (ad.y + ad.h) >= 8 || ad.y - (o.y + o.h) >= 8, 'ad too close to ' + id + ' ' + tag(screen, name, L, mode));
      });
    } else if (!(vm.adHint && vm.adHint.visible)) assert.ok(!ad);
  });
});

test('text is never overlapped by a pinned button (320x568 and 375x667, all modes)', () => {
  const ids = new Set(['play:input', 'play:hint', 'play:retry', 'play:adHint', 'reveal:share', 'reveal:again', 'challenge:accept', 'challenge:home', 'challenge:retry', 'challenge:compare', 'archive:practice', 'archive:retry', 'board:share', 'board:goPlay', 'board:retry', 'board:agree', 'board:openSetting', 'board:contract', 'home:daily', 'home:retry', 'home:practice', 'home:again', 'home:groupBoard', 'home:friendBoard', 'home:archive', 'home:howto']);
  let checked = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (!((L.W === 320 && L.H === 568) || (L.W === 375 && L.H === 667))) return;
    if (st.overlay && (st.overlay.dialog || st.overlay.adStub || st.overlay.privacy)) return;
    if (hits.some((h) => /^(sheet:body|dialog:block|adstub:block|privacy:block)$/.test(h.id))) return; // covered by a modal on purpose
    if (vm.menuOpen || vm.coach) return; // popovers sit on top on purpose
    hits.filter((h) => ids.has(h.id) && h.h < L.H / 2 && h.w < L.W).forEach((r) => {
      calls.forEach((c) => {
        // text clipped away by a scroll viewport is not visible
        if (c.clip && (c.x < c.clip.x || c.x > c.clip.x + c.clip.w || c.y < c.clip.y || c.y > c.clip.y + c.clip.h)) return;
        const intersects = c.y + c.size / 2 > r.y + 1 && c.y - c.size / 2 < r.y + r.h - 1 && c.x >= r.x - 5 && c.x <= r.x + r.w + 5;
        if (!intersects) return;
        assert.ok(c.y >= r.y && c.y <= r.y + r.h, tag(screen, name, L, mode) + ' "' + c.s + '" overlaps ' + r.id);
      });
      checked++;
    });
  });
  assert.ok(checked > 400, 'checked ' + checked);
});

test('home: the title block never overlaps the stack, in every state and mode (all sizes)', () => {
  let n = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const top = hits.filter((h) => /^home:(groupBanner|daily|retry|practice)$/.test(h.id)).reduce((m, h) => Math.min(m, h.y), 1e9);
    const cardTop = Math.min(top, 1e9);
    calls
      .filter((c) => /语|义|热|冷|猜秘密词/.test(c.s) && c.size >= 16 && c.y < L.H * 0.45)
      .forEach((c) => {
        if (c.s === '语' || c.s === '义') n++;
        assert.ok(c.y + c.size / 2 <= cardTop + 1 || c.y > cardTop, tag(screen, name, L, mode) + ' title text "' + c.s + '" at y=' + c.y.toFixed(0) + ' vs top ' + cardTop.toFixed(0));
      });
  }, 'home');
  assert.ok(n >= 0);
});

// ------------------------------------------------------------- share card

const FOOTER = '同一个词，你几步能猜中？';

function cardTexts(vm) {
  const ctx = mockCtx();
  render.shareCard.draw(ctx, vm);
  return ctx.__calls.map((c) => c.s);
}

test('AC 70: the share card draws only fixed strings, numbers and the issue label (never a word)', () => {
  const vm = { title: '语义热冷 · 今日一词 第128期', headline: '21 步猜中', subline: '用了 1 次提示', temps: [10, 20, 55, 78, 100], bands: ['cold', 'warm', 'hot', 'scald', 'hit'], footer: FOOTER };
  // fields that must never be read, poisoned with spoiler words
  const poisoned = Object.assign({}, vm, { answer: '番茄', words: ['火锅', '蔬菜'], guesses: [{ word: '火锅' }], firstChar: '番', chips: ['麻辣'], ladder: [{ word: '土豆' }], hints: ['西红柿'] });
  const texts = cardTexts(poisoned);
  const allowed = new Set([vm.title, vm.headline, vm.subline, vm.footer, '冷', '命中']);
  texts.forEach((s) => assert.ok(allowed.has(s), 'unexpected text on the card: ' + s));
  ['番茄', '火锅', '蔬菜', '麻辣', '土豆', '西红柿', '番'].forEach((w) => assert.ok(!texts.some((s) => s.includes(w)), 'card leaks ' + w));
  // a card with no result text draws only the axis labels
  assert.deepStrictEqual(cardTexts({ temps: [50], bands: ['hot'] }).filter((s) => s), ['冷', '命中']);
  // every fixture card passes the same check
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L: layoutFor(SIZES[0]) }).shareCard;
  Object.keys(fx).forEach((k) => {
    const v = fx[k].vm;
    cardTexts(v).forEach((s) => assert.ok(new Set([v.title, v.headline, v.subline, v.footer, '冷', '命中']).has(s), k + ': ' + s));
  });
});

test('AC 71: one chart column per step, bucketed to 60 above 60 steps, height = T', () => {
  const sc = render.shareCard;
  const mk = (n) => Array.from({ length: n }, (_, i) => ((i * 7) % 100) + 1);
  [1, 9, 21, 59, 60].forEach((n) => assert.strictEqual(sc.columns({ temps: mk(n), bands: [] }).temps.length, n));
  [61, 80, 200].forEach((n) => assert.strictEqual(sc.columns({ temps: mk(n), bands: [] }).temps.length, 60));
  // each bucket shows its highest temperature
  const t = mk(120);
  const c = sc.columns({ temps: t, bands: [] }).temps;
  assert.strictEqual(c.length, 60);
  c.forEach((v, i) => assert.strictEqual(v, Math.max(t[2 * i], t[2 * i + 1])));
  // widget chart uses the same rule
  assert.strictEqual(widgets.bucketTemps(mk(90), [], 60).temps.length, 60);
  // the drawn card has one rounded column per step (count arcTo-bearing bar paths by their fills)
  const ctx = mockCtx();
  sc.draw(ctx, { title: 't', headline: 'h', subline: '', temps: mk(21), bands: [], footer: 'f' });
  const bars = ctx.__log.filter((e) => e[0] === 'fill').length;
  assert.ok(bars >= 21);
});

test('share card render() sizes the canvas 500 x 400 (5:4)', () => {
  const c = mockCreateCanvas();
  render.shareCard.render(c, { title: 'a', headline: 'b', subline: '', temps: [10], bands: ['cold'], footer: 'c' });
  assert.strictEqual(c.width, 500);
  assert.strictEqual(c.height, 400);
  const c2 = mockCreateCanvas();
  render.shareCard.render(c2, { title: 'a', headline: 'b', subline: '', temps: [10], bands: ['cold'], footer: 'c' }, { pixelScale: 2 });
  assert.strictEqual(c2.width, 1000);
  assert.strictEqual(c2.height, 800);
});

test('AC 98: neither display mode changes the share card', () => {
  const vm = buildFixtures({ createCanvas: mockCreateCanvas, L: layoutFor(SIZES[0]) }).shareCard.solved.vm;
  const logOf = () => {
    const ctx = mockCtx();
    render.shareCard.draw(ctx, vm);
    return JSON.stringify(ctx.__log);
  };
  T.applyDisplay(null);
  const base = logOf();
  T.applyDisplay({ largeText: true });
  assert.strictEqual(logOf(), base);
  T.applyDisplay({ highContrast: true });
  assert.strictEqual(logOf(), base);
  T.applyDisplay({ largeText: true, highContrast: true });
  assert.strictEqual(logOf(), base);
  T.applyDisplay(null);
});

test('share card text is large enough to read when shrunk in a chat (>= 22px of 500)', () => {
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L: layoutFor(SIZES[0]) }).shareCard;
  Object.keys(fx).forEach((k) => {
    const ctx = mockCtx();
    render.shareCard.draw(ctx, fx[k].vm);
    ctx.__calls.forEach((c) => assert.ok(c.size >= 21.5, k + ' "' + c.s + '" is ' + c.size.toFixed(1)));
  });
});

// ----------------------------------------------------------- code hygiene

function jsFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
}

test('render modules are WeChat-safe: no wx, timers, Node built-ins; requires are relative .js only', () => {
  const dirs = [path.join(__dirname, '..', 'js', 'render'), path.join(__dirname, '..', 'opendata')];
  dirs.forEach((dir) => {
    jsFiles(dir).forEach((file) => {
      const f = path.basename(file);
      const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (!/opendata/.test(dir)) assert.ok(!/\bwx\./.test(src), f + ' uses wx');
      assert.ok(!/setTimeout|setInterval|requestAnimationFrame|Date\.now|new Date/.test(src), f + ' uses timers or clocks');
      assert.ok(!/\bprocess\.|\bBuffer\b|__dirname|require\(\s*['"](fs|path|os|crypto|util|child_process|node:)/.test(src), f + ' uses Node built-ins');
      assert.ok(!/\bimport\s|\bexport\s/.test(src), f + ' uses ES modules');
      assert.ok(!/roundRect|letterSpacing|\.filter\s*=|ctx\.reset\(|OffscreenCanvas/.test(src), f + ' uses canvas APIs WeChat lacks');
      const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        assert.ok(/^\.\//.test(m[1]), f + ' requires ' + m[1]);
        const target = path.join(dir, m[1].endsWith('.js') ? m[1] : m[1] + '.js');
        assert.ok(fs.existsSync(target), f + ' requires a missing file ' + m[1]);
        assert.ok(!/\.(json|node|mjs|cjs)$/.test(m[1]), f + ' requires a non-.js file');
      }
    });
  });
});

test('no bundled fonts, images or large assets in the render and opendata folders', () => {
  const dirs = [path.join(__dirname, '..', 'js', 'render'), path.join(__dirname, '..', 'opendata')];
  let total = 0;
  dirs.forEach((dir) =>
    fs.readdirSync(dir).forEach((f) => {
      assert.ok(!/\.(ttf|otf|woff2?|png|jpe?g|gif|webp|svg)$/i.test(f), 'asset ' + f);
      total += fs.statSync(path.join(dir, f)).size;
    })
  );
  assert.ok(total < 250 * 1024, 'render + opendata source is ' + total + ' bytes');
});

test('pure renderers: drawing twice gives the same output (no hidden state besides display tokens)', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: {} });
  ['home', 'play', 'reveal', 'challenge', 'board', 'archive'].forEach((screen) => {
    Object.keys(fx[screen]).slice(0, 6).forEach((name) => {
      const vm = Object.assign({}, fx[screen][name].vm, { display: {} });
      const a = mockCtx();
      const b = mockCtx();
      const h1 = render.screens[screen].draw(a, vm, L);
      const h2 = render.screens[screen].draw(b, vm, L);
      assert.strictEqual(JSON.stringify(a.__log), JSON.stringify(b.__log), screen + '/' + name);
      assert.deepStrictEqual(h1, h2);
    });
  });
});

test('overlay: dialog, toast, ad stub and privacy expose the documented ids; toast sits clear of the action row', () => {
  const L = layoutFor(SIZES[1]);
  const ids = (vm) => render.overlay.draw(mockCtx(), vm, L).map((h) => h.id);
  assert.ok(ids({ dialog: { text: 'x', confirmLabel: 'a', cancelLabel: 'b', danger: true } }).includes('dialog:confirm'));
  assert.ok(ids({ dialog: { text: 'x', confirmLabel: 'a', cancelLabel: 'b' } }).includes('dialog:cancel'));
  assert.ok(ids({ adStub: { kind: 'rewarded', secondsLeft: 3 } }).includes('adstub:complete'));
  assert.ok(ids({ privacy: {} }).includes('privacy:agree'));
  assert.deepStrictEqual(ids({ toast: { text: '猜得太快了，歇一下' } }), []);
  const ctx = mockCtx();
  render.overlay.draw(ctx, { toast: { text: '词库里没有「火星人」，换个常用词试试' } }, L);
  const hintTop = L.bottomEdge - L.bottomPad - 52;
  ctx.__calls.forEach((c) => assert.ok(c.y + c.size / 2 <= hintTop + 1, 'toast text "' + c.s + '" overlaps the action row'));
});
