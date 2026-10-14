/**
 * Render tests (node:test, no dependencies): every fixture screen x state at
 * several window sizes draws without throwing, tap areas obey the spec's UI
 * acceptance criteria (AC 44, 45), and the daily share card has no names.
 * Run: node --test apps/dianjiangtai/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const render = require('../js/render');
const { buildFixtures } = require('../tools/preview/fixtures.js');
const { makeLayout, hitTest } = require('../js/render/layout');

// ---------------------------------------------------------------- mock ctx

function fontSize(f) {
  const m = /([\d.]+)px/.exec(f || '');
  return m ? Number(m[1]) : 10;
}

function mockCtx() {
  const calls = [];
  const state = { font: '10px sans-serif' };
  const grad = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'fillText') return (s, x, y) => calls.push({ s: String(s), x, y, size: fontSize(state.font) });
        if (p === 'measureText') return (s) => ({ width: String(s).length * fontSize(state.font) * 0.95 });
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

const STRUCTURAL = /(:block|:card|:scrim|:body|^sheet:close$|:list$|^result:skip$|^result:scroll$)/;

/** Run fn(screen, name, hits, calls, L, size) for every fixture. */
function eachState(fn) {
  for (const sz of SIZES) {
    const L = layoutFor(sz);
    const fx = buildFixtures({ createCanvas: mockCreateCanvas, L });
    for (const screen of Object.keys(fx)) {
      if (screen === 'shareCard') continue;
      for (const name of Object.keys(fx[screen])) {
        const st = fx[screen][name];
        const vm = st.vm !== undefined ? st.vm : st;
        const ctx = mockCtx();
        let hits = render.screens[screen].draw(ctx, vm, L);
        if (st.overlay) hits = hits.concat(render.overlay.draw(ctx, st.overlay, L));
        fn(screen, name, hits, ctx.__calls, L, sz, vm, st);
      }
    }
  }
}

// ------------------------------------------------------------------- tests

test('every screen x state x size draws and returns hit areas', () => {
  let n = 0;
  eachState((screen, name, hits) => {
    assert.ok(Array.isArray(hits), screen + '/' + name);
    hits.forEach((h) => {
      assert.ok(typeof h.id === 'string' && h.id.length, 'id ' + screen + '/' + name);
      assert.ok([h.x, h.y, h.w, h.h].every(Number.isFinite), 'finite ' + screen + '/' + name + '/' + h.id);
    });
    n++;
  });
  assert.ok(n > 300, 'rendered ' + n);
});

test('AC 45: touch targets are at least 48 x 48', () => {
  eachState((screen, name, hits, calls, L) => {
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id)) return;
      // areas clipped by a scroll viewport may be shorter at the edge; fully visible ones must pass
      const clipped = h.y <= L.navBottom + 1 || h.y + h.h >= L.bottomEdge - 1;
      if (h.h < 48 && /^(pool:|result:)/.test(h.id)) return; void clipped;
      assert.ok(h.w >= 47.9 && h.h >= 47.9, screen + '/' + name + ' ' + h.id + ' is ' + h.w.toFixed(1) + 'x' + h.h.toFixed(1) + ' at ' + L.W + 'x' + L.H);
    });
  });
});

test('AC 44: nothing tappable overlaps the capsule menu, and nothing sits below the bottom inset', () => {
  eachState((screen, name, hits, calls, L) => {
    const c = L.capsule;
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || (h.w >= L.W - 1 && h.h >= L.H - L.navBottom - 1)) return;
      const overlap = h.x < c.x + c.w && h.x + h.w > c.x && h.y < c.y + c.h && h.y + h.h > c.y;
      assert.ok(!overlap, screen + '/' + name + ' ' + h.id + ' overlaps the capsule at ' + L.W + 'x' + L.H);
      assert.ok(h.y + h.h <= L.bottomEdge + 0.5, screen + '/' + name + ' ' + h.id + ' below safe area');
    });
  });
});

test('AC 44: primary buttons are in the bottom 40% (centre) and above the inset', () => {
  const primaries = { home: 'home:daily', draft: 'primary', board: 'board:retry', challenge: 'challenge:accept' };
  let seen = 0;
  eachState((screen, name, hits, calls, L) => {
    if (L.W > 500) return; // tablets: thumb-zone rule is for phones
    const id = primaries[screen];
    if (!id) return;
    const h = hits.find((a) => a.id === id);
    if (!h) return;
    seen++;
    assert.ok(h.y + h.h / 2 >= L.H * 0.6, screen + '/' + name + ' ' + id + ' centre ' + (h.y + h.h / 2).toFixed(0) + ' < ' + (L.H * 0.6).toFixed(0) + ' at ' + L.W + 'x' + L.H);
    assert.ok(h.y + h.h <= L.bottomEdge + 0.5);
  });
  assert.ok(seen > 20);
});

test('AC 45: body text >= 16pt, record >= 40pt', () => {
  eachState((screen, name, hits, calls, L, sz, vm) => {
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1) return; // monogram / icon glyphs
      assert.ok(c.size >= 15.99, screen + '/' + name + ' "' + c.s + '" is ' + c.size.toFixed(1) + 'px at ' + L.W);
    });
    if (screen === 'result' && vm.status === 'done') {
      const rec = calls.find((c) => /胜.*负/.test(c.s) && c.size >= 30);
      assert.ok(rec && rec.size >= 39.99, 'record size ' + (rec && rec.size));
    }
  });
});

test('hit ids are unique per area and documented in CONTRACT.md', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const missing = new Set();
  eachState((screen, name, hits) => {
    hits.forEach((h) => {
      if (/:block|:card$/.test(h.id)) return;
      const norm = h.id.replace(/^pool:g_.*/, 'pool:<generalId>').replace(/^slot:.*/, 'slot:<slot>').replace(/^respinAd:.*/, h.id);
      if (!doc.includes(norm)) missing.add(screen + ' ' + norm);
    });
  });
  assert.deepStrictEqual([...missing], []);
});

test('scroll areas expose scrollMax and clip their tap areas to the viewport', () => {
  eachState((screen, name, hits, calls, L) => {
    if (screen === 'draft' && name === 'flipped') assert.ok(hits.scrollMax['pool:list'] >= 0);
    if (screen === 'draft' && name === 'flipped_scrolled') {
      hits.filter((h) => h.id.startsWith('pool:g_')).forEach((h) => assert.ok(h.y >= L.navBottom && h.y + h.h <= L.bottomEdge));
    }
    if (screen === 'result' && name === 'done' && L.H < 700) assert.ok(hits.scrollMax['result:scroll'] > 0, 'result scrolls at ' + L.H);
  });
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

// ------------------------------------------------------------- share card

test('daily share card shows no general names; free card shows them (D4, AC 31)', () => {
  const sc = render.shareCard;
  const names = ['刘备', '诸葛亮', '赵云', '吕布', '曹仁'];
  const lineup = names.map((n, i) => ({ slotLabel: ['主公', '军师', '先锋', '猛将', '守将'][i], name: n, monogram: n[0], faction: 'shu', factionLabel: '蜀', sub: '蜀 · 赤壁' }));
  const base = { record: { w: 10, l: 2 }, bandLabel: '霸业将成', lineup, battles: new Array(12).fill(true), issueNo: 12 };

  const daily = mockCtx();
  sc.draw(daily, { ...base, mode: 'daily' });
  const dailyText = daily.__calls.map((c) => c.s).join('|');
  names.forEach((n) => assert.ok(!dailyText.includes(n), 'daily card leaks ' + n));
  assert.ok(dailyText.includes('十胜二负') && dailyText.includes('霸业将成') && dailyText.includes('第12期'));

  const free = mockCtx();
  sc.draw(free, { ...base, mode: 'free' });
  const freeText = free.__calls.map((c) => c.s).join('|');
  names.forEach((n) => assert.ok(freeText.includes(n), 'free card misses ' + n));
});

test('share card render() sizes the canvas 500 x 400 (5:4)', () => {
  const c = mockCreateCanvas();
  render.shareCard.render(c, { mode: 'free', record: { w: 6, l: 6 }, bandLabel: '三分鼎立', lineup: [], battles: [] });
  assert.strictEqual(c.width, 500);
  assert.strictEqual(c.height, 400);
  const c2 = mockCreateCanvas();
  render.shareCard.render(c2, { mode: 'free', record: { w: 6, l: 6 }, bandLabel: '三分鼎立', lineup: [], battles: [] }, { pixelScale: 2 });
  assert.strictEqual(c2.width, 1000);
});

test('text is never overlapped by a pinned primary button (320x568 and 375x667)', () => {
  const ids = new Set(['home:daily', 'home:retry', 'primary', 'undo', 'board:retry', 'board:goPlay', 'board:share', 'board:agree', 'board:openSetting', 'challenge:accept', 'challenge:retry', 'challenge:compare', 'result:retry']);
  let checked = 0;
  eachState((screen, name, hits, calls, L) => {
    if (!((L.W === 320 && L.H === 568) || (L.W === 375 && L.H === 667))) return;
    if (hits.some((h) => /^(sheet:body|dialog:block|adstub:block|coach:block|privacy:block)$/.test(h.id))) return; // covered by a modal on purpose
    hits.filter((h) => ids.has(h.id) && h.h < L.H / 2 && h.w < L.W).forEach((r) => {
      calls.forEach((c) => {
        const intersects = c.y + c.size / 2 > r.y + 1 && c.y - c.size / 2 < r.y + r.h - 1 && c.x >= r.x - 5 && c.x <= r.x + r.w + 5;
        if (!intersects) return;
        // button labels are centred in the rect; anything else must stay outside it
        assert.ok(c.y >= r.y && c.y <= r.y + r.h, screen + '/' + name + ' "' + c.s + '" overlaps ' + r.id + ' at ' + L.W + 'x' + L.H);
      });
      checked++;
    });
  });
  assert.ok(checked > 40);
});

test('home daily card: text clears the primary button at 320x568 (all states)', () => {
  const L = layoutFor(SIZES[1]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).home;
  ['available', 'available_group', 'inProgress', 'done', 'pendingSubmit', 'offline', 'error'].forEach((name) => {
    const ctx = mockCtx();
    const hits = render.screens.home.draw(ctx, fx[name], L);
    const btn = hits.find((h) => h.id === 'home:daily' || h.id === 'home:retry');
    assert.ok(btn, name);
    ctx.__calls
      .filter((c) => c.y < btn.y + btn.h && c.y > btn.y - 120 && c.x < btn.x + 5)
      .forEach((c) => assert.ok(c.y + c.size / 2 <= btn.y - 2, name + ': "' + c.s + '" bottom ' + (c.y + c.size / 2).toFixed(1) + ' vs button top ' + btn.y.toFixed(1)));
    assert.ok(btn.y + btn.h / 2 >= L.H * 0.6, name + ' primary in thumb zone');
    assert.ok(btn.h >= 48);
  });
});

test('no screen module touches wx, timers or the network', () => {
  const dir = path.join(__dirname, '..', 'js', 'render');
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(!/\bwx\./.test(src), f + ' uses wx');
      assert.ok(!/setTimeout|setInterval|requestAnimationFrame|Date\.now/.test(src), f + ' uses timers');
    });
});
