/**
 * Render tests (node:test, no dependencies): every fixture screen x state x
 * size x display mode draws without throwing; tap areas, type sizes, thumb
 * zone, capsule clearance, contrast, spoiler rules and banned vocabulary all
 * hold. Run: node --test apps/bibiyi/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = require('../js/render');
const T = require('../js/render/theme');
const fmt = require('../js/render/fmt');
const { buildFixtures } = require('../tools/preview/fixtures.js');
const { makeLayout, hitTest } = require('../js/render/layout');

// ---------------------------------------------------------------- mock ctx

function fontSize(f) {
  const m = /([\d.]+)px/.exec(f || '');
  return m ? Number(m[1]) : 10;
}

/** Pessimistic text width: CJK/full-width 0.95em (real ~1em), ASCII 0.55em. */
function textW(str, size) {
  let w = 0;
  Array.from(String(str)).forEach((ch) => {
    w += ch.charCodeAt(0) < 128 ? 0.55 : 0.97;
  });
  return w * size;
}

function mockCtx() {
  const calls = [];
  const state = { font: '10px sans-serif', textAlign: 'left' };
  const grad = { addColorStop() {} };
  // translate + scale tracking (rotation is ignored: only small seals use it)
  let tf = { tx: 0, ty: 0, sx: 1, sy: 1 };
  let clip = null; // {y0, y1} vertical clip from the last rect()+clip()
  let lastRect = null;
  const stack = [];
  return new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'fillText')
          return (s, x, y) => {
            const cy = tf.ty + y * tf.sy;
            if (clip && (cy + fontSize(state.font) / 2 < clip.y0 || cy - fontSize(state.font) / 2 > clip.y1)) return; // clipped away
            const size = fontSize(state.font) * Math.abs(tf.sy);
            const w = textW(s, fontSize(state.font)) * Math.abs(tf.sx);
            calls.push({ partial: !!clip && (cy - fontSize(state.font) / 2 < clip.y0 || cy + fontSize(state.font) / 2 > clip.y1), s: String(s), x: tf.tx + x * tf.sx, y: tf.ty + y * tf.sy, size, align: state.textAlign, w });
          };
        if (p === 'save') return () => stack.push({ tf: Object.assign({}, tf), clip });
        if (p === 'restore') return () => {
          const t0 = stack.pop();
          if (t0) {
            tf = t0.tf;
            clip = t0.clip;
          }
        };
        if (p === 'beginPath') return () => (lastRect = null);
        if (p === 'rect') return (x, y, w, h) => (lastRect = { y0: tf.ty + y * tf.sy, y1: tf.ty + (y + h) * tf.sy });
        if (p === 'clip') return () => {
          if (lastRect) clip = clip ? { y0: Math.max(clip.y0, lastRect.y0), y1: Math.min(clip.y1, lastRect.y1) } : lastRect;
        };
        if (p === 'translate') return (x, y) => (tf = Object.assign({}, tf, { tx: tf.tx + x * tf.sx, ty: tf.ty + y * tf.sy }));
        if (p === 'scale') return (x, y) => (tf = Object.assign({}, tf, { sx: tf.sx * x, sy: tf.sy * y }));
        if (p === 'setTransform') return () => {};
        if (p === 'measureText') return (s) => ({ width: textW(s, fontSize(state.font)) });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
        if (p === '__calls') return calls;
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
const MODES = {
  standard: { largeText: false, highContrast: false },
  largeText: { largeText: true, highContrast: false },
  highContrast: { largeText: false, highContrast: true },
};

function layoutFor(sz, display) {
  return makeLayout({
    windowWidth: sz.w,
    windowHeight: sz.h,
    pixelRatio: 2,
    statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.bottomInset },
    menuRect: Object.assign({}, sz.menu, { width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top }),
    display,
  });
}

function resolve(mod) {
  return mod.indexOf('sheet:') === 0 ? R.sheets[mod.slice(6)] : R.screens[mod];
}

const STRUCTURAL = /(:block|:card|:scrim|:body|^sheet:close$|^sheet:list$|:scroll$|^play:cards$|^board:list$)/;

/** fn(group, name, hits, calls, L, size, entry, modeName) for every fixture. */
function eachState(fn, opts) {
  opts = opts || {};
  const modes = opts.modes || Object.keys(MODES);
  const sizes = opts.sizes || SIZES;
  for (const modeName of modes) {
    for (const sz of sizes) {
      const L = layoutFor(sz, MODES[modeName]);
      const fx = buildFixtures({ createCanvas: mockCreateCanvas, L });
      for (const group of Object.keys(fx)) {
        if (group === 'shareCard') continue;
        for (const name of Object.keys(fx[group])) {
          const st = fx[group][name];
          const ctx = mockCtx();
          let hits = [];
          if (st.under) hits = hits.concat(resolve(st.under.mod).draw(ctx, st.under.vm, L));
          const top = resolve(st.mod).draw(ctx, st.vm, L);
          hits = hits.concat(top);
          const topCalls = ctx.__calls;
          if (st.overlay) hits = hits.concat(R.overlay.draw(ctx, st.overlay, L));
          hits.scrollMax = top.scrollMax;
          fn(group, name, hits, ctx.__calls, L, sz, st, modeName, topCalls);
        }
      }
    }
  }
}

// ------------------------------------------------------------------- tests

test('every screen x state x size x mode draws and returns finite hit areas', () => {
  let n = 0;
  eachState((group, name, hits) => {
    assert.ok(Array.isArray(hits), group + '/' + name);
    hits.forEach((h) => {
      assert.ok(typeof h.id === 'string' && h.id.length, 'id ' + group + '/' + name);
      assert.ok([h.x, h.y, h.w, h.h].every(Number.isFinite), 'finite ' + group + '/' + name + '/' + h.id);
    });
    n++;
  });
  assert.ok(n > 1000, 'rendered ' + n);
});

test('touch targets are at least 48 x 48', () => {
  eachState((group, name, hits, calls, L, sz, st, mode) => {
    const regions = hits.filter((r) => /(:scroll$|^sheet:list$|^play:cards$)/.test(r.id));
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id)) return;
      // a row cut by its scroll viewport is shorter at the edge
      if (h.h < 47.9 && regions.some((r) => Math.abs(h.y - r.y) < 0.6 || Math.abs(h.y + h.h - (r.y + r.h)) < 0.6)) return;
      assert.ok(h.w >= 47.9 && h.h >= 47.9, mode + ' ' + group + '/' + name + ' ' + h.id + ' is ' + h.w.toFixed(1) + 'x' + h.h.toFixed(1) + ' at ' + L.W + 'x' + L.H);
    });
  });
});

test('nothing tappable overlaps the capsule menu or sits below the bottom inset', () => {
  eachState((group, name, hits, calls, L, sz, st, mode) => {
    const c = L.capsule;
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || (h.w >= L.W - 1 && h.h >= L.H - L.navBottom - 1)) return;
      const overlap = h.x < c.x + c.w && h.x + h.w > c.x && h.y < c.y + c.h && h.y + h.h > c.y;
      assert.ok(!overlap, mode + ' ' + group + '/' + name + ' ' + h.id + ' overlaps the capsule at ' + L.W + 'x' + L.H);
      assert.ok(h.y + h.h <= L.bottomEdge + 0.5, mode + ' ' + group + '/' + name + ' ' + h.id + ' below safe area at ' + L.W + 'x' + L.H);
    });
  });
});

test('answer buttons: >= 56pt tall (64 large), >= 40% wide each, >= 16pt apart, in the thumb zone', () => {
  let seen = 0;
  eachState((group, name, hits, calls, L, sz, st, mode) => {
    if (group !== 'play' || name !== 'awaitAnswer') return;
    const hi = hits.find((h) => h.id === 'play:hi');
    const lo = hits.find((h) => h.id === 'play:lo');
    assert.ok(hi && lo);
    assert.ok(hi.h >= (mode === 'largeText' ? 64 : 56) - 0.01, mode + ' height ' + hi.h + ' at ' + L.W);
    assert.ok(hi.w >= L.contentW * 0.4 && lo.w >= L.contentW * 0.4);
    assert.ok(lo.x - (hi.x + hi.w) >= 15.99, 'gap ' + (lo.x - (hi.x + hi.w)));
    assert.ok(hi.y + hi.h / 2 >= L.H * 0.6 && lo.y + lo.h / 2 >= L.H * 0.6);
    assert.ok(hi.y + hi.h <= L.bottomEdge + 0.5);
    seen++;
  });
  assert.ok(seen === SIZES.length * 3);
});

test('type sizes: nothing under 16pt (20pt in large text); no text leaves the screen horizontally', () => {
  eachState((group, name, hits, calls, L, sz, st, mode) => {
    const min = mode === 'largeText' ? 19.99 : 15.99;
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1) return;
      assert.ok(c.size >= min, mode + ' ' + group + '/' + name + ' "' + c.s + '" is ' + c.size.toFixed(1) + 'px at ' + L.W);
      const left = c.align === 'center' ? c.x - c.w / 2 : c.align === 'right' ? c.x - c.w : c.x;
      assert.ok(left >= -1 && left + c.w <= L.W + 1, mode + ' ' + group + '/' + name + ' "' + c.s + '" spans ' + left.toFixed(0) + '..' + (left + c.w).toFixed(0) + ' of ' + L.W);
    });
  });
});

test('revealed value >= 40pt (48 in large text); result streak >= 56pt', () => {
  eachState((group, name, hits, calls, L, sz, st, mode) => {
    if (group === 'play' && (name === 'awaitAnswer' || (name === 'correct' && mode !== 'largeText'))) {
      const v = calls.find((c) => c.s === '6,300');
      assert.ok(v, 'value drawn ' + mode + ' ' + group + '/' + name + ' ' + L.W + 'x' + L.H);
      assert.ok(v.size >= (mode === 'largeText' ? 49.99 : 39.99), mode + ' value size ' + v.size);
    }
    if (group === 'result' && name === 'done_daily_miss') {
      const n = calls.find((c) => c.s === '14' && c.size > 30);
      assert.ok(n && n.size >= 55.99, mode + ' streak size ' + (n && n.size));
    }
  });
});

test('spoilers: the bottom value is not drawn before the reveal', () => {
  eachState(
    (group, name, hits, calls) => {
      if (group !== 'play') return;
      if (name === 'awaitAnswer' || name === 'sending' || name === 'loading' || name === 'awaitAnswer_coach') {
        assert.ok(!calls.some((c) => c.s === '5,464'), name + ' leaks the bottom value');
        if (name !== 'loading') assert.ok(calls.some((c) => c.s === '？'), name + ' shows the hidden mark');
      }
      if (name === 'correct' || name === 'miss') {
        assert.ok(calls.some((c) => c.s === '5,464'));
        assert.ok(calls.some((c) => c.s === '对' || c.s === '错'), 'verdict text, not colour alone');
      }
    },
    { modes: ['standard'] }
  );
});

test('play hit ids by phase: answer buttons only when awaiting; retry only on netError; report links only after reveal', () => {
  eachState(
    (group, name, hits, calls, L) => {
      if (group !== 'play' || L.W !== 375) return;
      const has = (id) => hits.some((h) => h.id === id);
      if (name.indexOf('awaitAnswer') === 0) {
        assert.ok(has('play:hi') && has('play:lo'), name);
        assert.ok(has('play:reportTop') && !has('play:reportBottom'), name + ' report only on the revealed card');
      }
      if (['sending', 'correct', 'miss', 'cleared', 'netError', 'loading', 'segmentChange', 'revealing_count'].indexOf(name) >= 0) assert.ok(!has('play:hi') && !has('play:lo'), name + ' buttons locked');
      assert.strictEqual(has('play:retry'), name === 'netError');
      if (name === 'correct' || name === 'miss') assert.ok(has('play:reportBottom') && has('play:cards'));
      if (name === 'awaitAnswer_coach') assert.ok(has('coach:skip'));
    },
    { modes: ['standard'] }
  );
});

test('large text at 320x568 scrolls the play cards instead of clipping them', () => {
  const L = layoutFor(SIZES[1], MODES.largeText);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).play;
  const hits = R.screens.play.draw(mockCtx(), fx.awaitAnswer.vm, L);
  assert.ok(hits.scrollMax['play:cards'] > 0);
  const std = R.screens.play.draw(mockCtx(), fx.awaitAnswer.vm, layoutFor(SIZES[1], MODES.standard));
  assert.strictEqual(std.scrollMax['play:cards'], 0, 'standard mode fits at 320x568');
});

test('primary actions are in the bottom 40% and above the inset', () => {
  const primaries = { home: ['home:daily', 'home:retry'], result: ['result:again', 'result:retry'], challenge: ['challenge:accept', 'challenge:retry', 'challenge:daily', 'challenge:free'], board: ['board:retry', 'board:agree', 'board:openSetting', 'board:share'] };
  let seen = 0;
  eachState(
    (group, name, hits, calls, L, sz, st, mode) => {
      if (L.W > 500 || mode === 'largeText') return;
      (primaries[group] || []).forEach((id) => {
        const h = hits.find((a) => a.id === id);
        if (!h || (group === 'home' && name !== 'available' && name !== 'offline')) return;
        seen++;
        assert.ok(h.y + h.h / 2 >= L.H * 0.6 - 0.5 || group === 'home', group + '/' + name + ' ' + id + ' centre ' + (h.y + h.h / 2).toFixed(0) + ' at ' + L.W + 'x' + L.H);
        assert.ok(h.y + h.h <= L.bottomEdge + 0.5);
      });
    },
    { modes: ['standard', 'highContrast'] }
  );
  assert.ok(seen > 40);
});

test('text is never overlapped by a pinned button (320x568 and 375x667, all modes)', () => {
  const ids = new Set(['play:hi', 'play:lo', 'result:again', 'result:share', 'result:retry', 'challenge:accept', 'challenge:retry', 'challenge:home', 'board:retry', 'board:goPlay', 'board:share', 'board:agree', 'board:openSetting', 'home:daily', 'home:retry', 'history:retry', 'issue:retry']);
  let checked = 0;
  eachState((group, name, hits, calls, L, sz, st, mode, topCalls) => {
    if (!((L.W === 320 && L.H === 568) || (L.W === 375 && L.H === 667))) return;
    if (hits.some((h) => /^(sheet:body|dialog:block|adstub:block|privacy:block)$/.test(h.id))) return;
    hits.filter((h) => ids.has(h.id) && h.h < L.H / 2 && h.w < L.W).forEach((r) => {
      (st.under ? topCalls : calls).forEach((c) => {
        if (c.partial) return; // cut by a scroll viewport edge
        const half = c.size / 2;
        const left = c.align === 'center' ? c.x - c.w / 2 : c.align === 'right' ? c.x - c.w : c.x;
        const horiz = left < r.x + r.w && left + c.w > r.x;
        const vert = c.y + half > r.y + 1 && c.y - half < r.y + r.h - 1;
        if (!horiz || !vert) return;
        assert.ok(c.y >= r.y && c.y <= r.y + r.h, mode + ' ' + group + '/' + name + ' "' + c.s + '" overlaps ' + r.id + ' at ' + L.W + 'x' + L.H);
      });
      checked++;
    });
  });
  assert.ok(checked > 60, 'checked ' + checked);
});

test('banned vocabulary never appears in any drawn string (spec 3.6)', () => {
  const banned = ['猜大小', '比大小', '大小', '押', '下注', '赌', '赌注', '翻倍', '加倍', '筹码', '金币', '倍率', '赔率', '庄家', '梭哈', '骰', '骰子', '彩票', '中奖', '奖池', '抽奖', '开奖', '运气', '手气', '复活币', 'Higher Lower', 'Higher or Lower'];
  eachState(
    (group, name, hits, calls) => {
      calls.forEach((c) => banned.forEach((b) => assert.ok(c.s.indexOf(b) < 0, group + '/' + name + ' draws banned "' + b + '" in "' + c.s + '"')));
    },
    { modes: ['standard'], sizes: [SIZES[0]] }
  );
  const src = fs.readdirSync(path.join(__dirname, '..', 'js', 'render')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', 'render', f), 'utf8')).join('\n');
  banned.forEach((b) => assert.ok(src.indexOf(b) < 0, 'source contains banned "' + b + '"'));
});

test('hit ids are documented in CONTRACT.md', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const missing = new Set();
  eachState(
    (group, name, hits) => {
      hits.forEach((h) => {
        if (/:block$|:card$/.test(h.id)) return;
        const norm = h.id
          .replace(/^history:item:.*/, 'history:item:<dateKey>')
          .replace(/^picker:.*/, 'picker:<key>')
          .replace(/^report:reason:.*/, 'report:reason:<key>')
          .replace(/^(questions|issue):\d+:(top|bottom):(report|source)$/, '$1:<k>:$2:$3');
        if (!doc.includes(norm)) missing.add(group + ' ' + norm);
      });
    },
    { modes: ['standard'], sizes: [SIZES[0]] }
  );
  assert.deepStrictEqual([...missing], []);
});

test('scroll regions expose scrollMax and clip tap areas to the viewport', () => {
  eachState(
    (group, name, hits, calls, L) => {
      if (group === 'issue' && name === 'ready') {
        assert.ok(hits.scrollMax['issue:scroll'] > 0);
        hits.filter((h) => /^issue:\d+:/.test(h.id)).forEach((h) => assert.ok(h.y >= L.navBottom && h.y + h.h <= L.bottomEdge + 0.5));
      }
      if (group === 'sheets' && name === 'questions') assert.ok(hits.scrollMax['sheet:list'] > 0);
      if (group === 'result' && name === 'done_daily_miss' && L.H < 700) assert.ok(hits.scrollMax['result:scroll'] >= 0);
    },
    { modes: ['standard'] }
  );
});

test('palettes: contrast (default body >= 4.5:1, high contrast text >= 7:1, non-text >= 3:1)', () => {
  const S = T.STANDARD;
  const H = T.HIGH_CONTRAST;
  const body = (P, min, label) =>
    [
      ['ink', P.paper],
      ['sub', P.paper],
      ['sub', P.card],
      ['seal', P.paper],
      ['seal', P.card],
      ['good', P.card],
      ['bad', P.card],
      ['sealInk', P.seal],
    ].forEach((pair) => assert.ok(T.contrast(P[pair[0]] === undefined ? pair[0] : P[pair[0]], pair[1]) >= min, label + ' ' + pair[0] + ' on ' + pair[1] + ' = ' + T.contrast(P[pair[0]], pair[1]).toFixed(2)));
  body(S, 4.5, 'standard');
  body(H, 7, 'high contrast');
  assert.ok(T.contrast('#FFFFFF', S.good) >= 4.5 && T.contrast('#FFFFFF', S.bad) >= 4.5, 'white on the answer fills');
  assert.ok(T.contrast('#FFFFFF', H.good) >= 7 && T.contrast('#FFFFFF', H.bad) >= 7);
  assert.ok(T.contrast(S.paper, S.ink) >= 7, 'paper text on the ink buttons');
  T.applyDisplay({ highContrast: false });
  Object.keys(T.ACCENTS).forEach((k) => {
    assert.ok(T.contrast('#FFFFFF', T.accentFill(T.ACCENTS[k])) >= 3, 'accent fill ' + k);
    assert.ok(T.contrast(S.card, T.accentText(T.ACCENTS[k])) >= 4.5, 'accent text ' + k);
  });
  T.applyDisplay({ highContrast: true });
  Object.keys(T.ACCENTS).forEach((k) => {
    assert.ok(T.contrast('#FFFFFF', T.accentFill(T.ACCENTS[k])) >= 7, 'hc accent fill ' + k);
    assert.ok(T.contrast(H.card, T.accentText(T.ACCENTS[k])) >= 7, 'hc accent text ' + k);
  });
  T.applyDisplay({});
});

test('display modes: large text scales type and button heights; high contrast swaps the palette in place', () => {
  const std = layoutFor(SIZES[0], MODES.standard);
  const big = layoutFor(SIZES[0], MODES.largeText);
  assert.ok(big.btnH >= 64 && std.btnH >= 52 && big.btnH > std.btnH);
  T.applyDisplay(big.display);
  assert.ok(T.FS.body >= 20 && T.FS.value >= 50 && T.FS.bodyL >= 22);
  T.applyDisplay(layoutFor(SIZES[0], MODES.highContrast).display);
  assert.strictEqual(T.COLORS.paper, '#FFFFFF');
  assert.strictEqual(T.COLORS.ink, '#000000');
  T.applyDisplay(std.display);
  assert.strictEqual(T.COLORS.paper, T.STANDARD.paper);
  assert.strictEqual(T.FS.body, 16);
});

test('hitTest: later areas win (overlays over screens)', () => {
  const hits = [{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'b', x: 10, y: 10, w: 20, h: 20 }];
  assert.strictEqual(hitTest(hits, 15, 15), 'b');
  assert.strictEqual(hitTest(hits, 50, 50), 'a');
  assert.strictEqual(hitTest(hits, 500, 5), null);
});

test('layout: content starts below the capsule row on every size; works without menu rect', () => {
  SIZES.forEach((sz) => {
    const L = layoutFor(sz, MODES.standard);
    assert.strictEqual(L.navBottom, sz.menu.bottom + (sz.menu.top - sz.sb));
    assert.ok(L.contentW <= 500 && L.contentW > 0);
    assert.ok(L.board.y >= L.navBottom && L.board.y + L.board.h <= L.bottomEdge);
  });
  const L = makeLayout({ windowWidth: 360, windowHeight: 640 });
  assert.ok(L.navBottom > 40);
  assert.strictEqual(L.safeBottom, 0);
});

test('fmt: number formatting, 万/亿, years and the count-up', () => {
  assert.strictEqual(fmt.formatNumber(6300), '6,300');
  assert.strictEqual(fmt.formatNumber(2093.78, 1), '2,093.8');
  assert.strictEqual(fmt.formatNumber(-1234.5, 1), '-1,234.5');
  assert.strictEqual(fmt.formatCompact(20937757), '2,093.8 万');
  assert.strictEqual(fmt.formatCompact(1411778724), '14.12 亿');
  assert.strictEqual(fmt.formatCompact(5464), '5,464');
  assert.strictEqual(fmt.formatYear(-221), '公元前 221 年');
  assert.strictEqual(fmt.formatYear(1056, true), '约 1056 年');
  assert.strictEqual(fmt.countUp('6,300', 1), '6,300');
  assert.strictEqual(fmt.countUp('6,300', 0), '0');
  assert.strictEqual(fmt.countUp('2,093.8', 0), '0.0');
  assert.ok(/^\d,\d{3}$|^\d{1,3}$/.test(fmt.countUp('6,300', 0.5)));
  assert.strictEqual(fmt.countUp('约 100', 1), '约 100');
  assert.ok(fmt.countUp('约 100', 0.4).indexOf('约 ') === 0);
  assert.strictEqual(fmt.countUp('？', 0.3), '？');
  let prev = -1;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const v = Number(fmt.countUp('8,848.86', p).replace(/,/g, ''));
    assert.ok(v >= prev);
    prev = v;
  }
});

test('long names: a 15-character label wraps to two lines or shrinks, never above 3 lines', () => {
  const F = require('../js/render/factcard');
  const ctx = mockCtx();
  T.applyDisplay({});
  const one = F.labelLines(ctx, '长江', 200, 22);
  assert.strictEqual(one.lines.length, 1);
  const lng = F.labelLines(ctx, '内蒙古自治区鄂尔多斯市伊金霍洛旗', 200, 22);
  assert.ok(lng.lines.length <= 2 && lng.size >= 16);
  const huge = F.labelLines(ctx, '中'.repeat(60), 200, 22);
  assert.strictEqual(huge.lines.length, 2);
  assert.ok(huge.lines[1].endsWith('…'));
});

// ------------------------------------------------------------- share card

test('daily and challenge cards carry no fact label or value; free cards show labels but no values (AC 52)', () => {
  const sc = R.shareCard;
  const draw = (vm, opts) => {
    const c = mockCtx();
    sc.draw(c, vm, opts);
    return c.__calls.map((x) => x.s).join('|');
  };
  const marks = [true, true, true, false];
  const daily = draw({ mode: 'daily', issueNo: 12, themeLabel: '山河', streak: 3, marks, rarityText: '超过今日 82% 的玩家' });
  ['长江', '黄河', '6,300', '5,464', '公里'].forEach((s) => assert.ok(daily.indexOf(s) < 0, 'daily leaks ' + s));
  assert.ok(daily.indexOf('连对') >= 0 && daily.indexOf('3') >= 0 && daily.indexOf('第12期') >= 0 && daily.indexOf('超过今日 82% 的玩家') >= 0);
  const chal = draw({ mode: 'challenge', issueNo: 12, streak: 16, marks, ownerStreak: 14 });
  assert.ok(chal.indexOf('超过 14') >= 0);
  const free = draw({ mode: 'free', streak: 8, marks, hook: { topLabel: '黄河', bottomLabel: '长江', subLabel: '全长' } });
  assert.ok(free.indexOf('黄河 vs 长江 · 全长 · 我选错了') >= 0);
  ['6,300', '5,464', '公里'].forEach((s) => assert.ok(free.indexOf(s) < 0, 'free leaks ' + s));
  const saved = draw({ mode: 'daily', streak: 1, marks: [true] }, { saved: true });
  assert.ok(saved.indexOf('微信小游戏 · 比一比') >= 0);
  assert.ok(draw({ mode: 'daily', streak: 1, marks: [true] }).indexOf('微信小游戏') < 0, 'plain card has no footer');
});

test('share card ignores the display mode (spec 6.19) and survives 60 marks', () => {
  T.applyDisplay({ highContrast: true, largeText: true });
  const a = mockCtx();
  R.shareCard.draw(a, { mode: 'daily', streak: 14, marks: new Array(60).fill(true) });
  T.applyDisplay({});
  const b = mockCtx();
  R.shareCard.draw(b, { mode: 'daily', streak: 14, marks: new Array(60).fill(true) });
  assert.deepStrictEqual(a.__calls, b.__calls);
});

test('share card render() sizes the canvas 500 x 400 (5:4), 1000 x 800 when saved', () => {
  const c = mockCreateCanvas();
  R.shareCard.render(c, { mode: 'free', streak: 6, marks: [], hook: null });
  assert.strictEqual(c.width, 500);
  assert.strictEqual(c.height, 400);
  const c2 = mockCreateCanvas();
  R.shareCard.render(c2, { mode: 'daily', streak: 6, marks: [] }, { pixelScale: 2, saved: true });
  assert.strictEqual(c2.width, 1000);
  assert.strictEqual(c2.height, 800);
});

test('every share card fixture draws', () => {
  const fx = buildFixtures({ createCanvas: mockCreateCanvas }).shareCard;
  Object.keys(fx).forEach((n) => R.shareCard.draw(mockCtx(), fx[n].vm, fx[n].opts));
});

// ---------------------------------------------------------- WeChat safety

test('render modules are WeChat-safe: no wx, timers, Node built-ins or non-relative requires', () => {
  const dirs = [path.join(__dirname, '..', 'js', 'render')];
  dirs.forEach((dir) =>
    fs.readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .forEach((f) => {
        const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        assert.ok(!/\bwx\./.test(src), f + ' uses wx');
        assert.ok(!/setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random/.test(src), f + ' uses timers or randomness');
        assert.ok(!/roundRect|letterSpacing|\.filter\s*=|fontVariant|\?\./.test(src), f + ' uses an unsupported canvas or syntax feature');
        const reqs = src.match(/require\(['"][^'"]+['"]\)/g) || [];
        reqs.forEach((r) => assert.ok(/require\(['"]\.\//.test(r), f + ' requires ' + r));
      })
  );
});
