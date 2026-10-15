/**
 * Render tests (node:test, no dependencies): every fixture screen x state at
 * several window sizes and in all four display modes (default, large text,
 * high contrast, both) draws without throwing, tap areas obey the spec's UI
 * acceptance criteria (AC 44, 45, 89), and the daily share card has no names.
 * Run: node --test apps/dianjiangtai/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const render = require('../js/render');
const { buildFixtures } = require('../tools/preview/fixtures.js');
const { makeLayout, hitTest } = require('../js/render/layout');
const { mockCtx, mockCreateCanvas, SIZES, MODES, layoutFor, eachState } = require('./render-mock');

const ALL = Object.keys(MODES);

const FOOTER_IDS = /^home:(sound|settings)$/;
const STRUCTURAL = /(:block|:card|:scrim|:body|^sheet:close$|:list$|:scroll$|^result:skip$|^result:revealSkip$)/;

/** Ids that draw as buttons (large-text mode: at least 56pt tall). */
const BUTTON = /^(home:(daily|retry|free|groupBoard|friendBoard|history|howto)|primary|undo|retryRound|respin(Ad)?:|challenge:(accept|home|retry|free|daily|compare|subscribe)|board:(retry|goPlay|share|agree|openSetting|contract)|result:(again|share|challenge|save|board|replay|retry|subscribe)|dialog:|privacy:(agree|refuse)|album:|adstub:|history:retry|issue:retry|coach:next|settings:openSetting|settings:openAlbum)/;

function inScrollState(hits) {
  return hits.scrollMax && Object.keys(hits.scrollMax).length > 0;
}

// ------------------------------------------------------------------- tests

test('every screen x state x size x display mode draws and returns hit areas', () => {
  let n = 0;
  eachState((screen, name, hits) => {
    assert.ok(Array.isArray(hits), screen + '/' + name);
    hits.forEach((h) => {
      assert.ok(typeof h.id === 'string' && h.id.length, 'id ' + screen + '/' + name);
      assert.ok([h.x, h.y, h.w, h.h].every(Number.isFinite), 'finite ' + screen + '/' + name + '/' + h.id);
    });
    n++;
  }, ALL);
  assert.ok(n > 1500, 'rendered ' + n);
});

test('AC 45 / 89: touch targets are at least 48 x 48 (buttons 56 tall in large text)', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const scrolls = inScrollState(hits);
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id)) return;
      // areas clipped by a scroll viewport may be shorter at the edge; fully visible ones must pass
      if (h.h < 48 && (/^(pool:|result:|history:item:)/.test(h.id) || scrolls)) return;
      assert.ok(h.w >= 47.9 && h.h >= 47.9, mode + ' ' + screen + '/' + name + ' ' + h.id + ' is ' + h.w.toFixed(1) + 'x' + h.h.toFixed(1) + ' at ' + L.W + 'x' + L.H);
      if (MODES[mode].largeText && BUTTON.test(h.id) && !scrolls) {
        assert.ok(h.h >= 55.9, mode + ' ' + screen + '/' + name + ' ' + h.id + ' button is ' + h.h.toFixed(1) + ' tall (large text needs 56)');
      }
    });
  }, ALL);
});

test('AC 44: nothing tappable overlaps the capsule menu, and nothing sits below the bottom inset', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const c = L.capsule;
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || (h.w >= L.W - 1 && h.h >= L.H - L.navBottom - 1)) return;
      const overlap = h.x < c.x + c.w && h.x + h.w > c.x && h.y < c.y + c.h && h.y + h.h > c.y;
      assert.ok(!overlap, mode + ' ' + screen + '/' + name + ' ' + h.id + ' overlaps the capsule at ' + L.W + 'x' + L.H);
      // Deliberate exception: the home footer row (声音 / 隐私与设置) is pinned to the very
      // bottom, its 48pt tap area may extend into the inset (text stays above the indicator bar).
      // It must still be on screen. See the 'home footer' test.
      const limit = FOOTER_IDS.test(h.id) && screen === 'home' ? L.H : L.bottomEdge;
      assert.ok(h.y + h.h <= limit + 0.5, mode + ' ' + screen + '/' + name + ' ' + h.id + ' below safe area');
    });
  }, ALL);
});

test('AC 44: primary buttons are in the bottom 40% (centre) and above the inset', () => {
  const primaries = { home: 'home:daily', draft: 'primary', board: 'board:retry', challenge: 'challenge:accept' };
  let seen = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (L.W > 500) return; // tablets: thumb-zone rule is for phones
    const id = primaries[screen];
    if (!id) return;
    const h = hits.find((a) => a.id === id);
    if (!h) return;
    seen++;
    assert.ok(h.y + h.h / 2 >= L.H * 0.6, mode + ' ' + screen + '/' + name + ' ' + id + ' centre ' + (h.y + h.h / 2).toFixed(0) + ' < ' + (L.H * 0.6).toFixed(0) + ' at ' + L.W + 'x' + L.H);
    assert.ok(h.y + h.h <= L.bottomEdge + 0.5);
  }, ALL);
  assert.ok(seen > 80);
});

test('AC 45 / 89: body text >= 16pt (20pt in large text), record >= 40pt (48pt in large text)', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const large = MODES[mode].largeText;
    const min = large ? 19.99 : 15.99;
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1) return; // monogram / icon glyphs
      assert.ok(c.size >= min, mode + ' ' + screen + '/' + name + ' "' + c.s + '" is ' + c.size.toFixed(1) + 'px at ' + L.W);
    });
    if (screen === 'result' && vm.status === 'done') {
      const rec = calls.find((c) => /胜.*负/.test(c.s) && c.size >= 30);
      assert.ok(rec && rec.size >= (large ? 47.99 : 39.99), mode + ' record size ' + (rec && rec.size));
    }
  }, ALL);
});

test('AC 45 / 89: no text runs past the screen edges or the capsule row', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1 || !c.visible) return;
      assert.ok(c.left >= -0.5 && c.right <= L.W + 0.5, mode + ' ' + screen + '/' + name + ' "' + c.s + '" spans ' + c.left.toFixed(0) + '..' + c.right.toFixed(0) + ' of ' + L.W);
      // nothing is drawn in the capsule's row on the right
      const cap = L.capsule;
      const inRow = c.y > cap.y && c.y < cap.y + cap.h;
      if (inRow) assert.ok(c.right <= cap.x + 0.5 || c.left >= cap.x + cap.w - 0.5 || c.y > L.navBottom, mode + ' ' + screen + '/' + name + ' "' + c.s + '" in the capsule row');
    });
  }, ALL);
});

test('hit ids are unique per area and documented in CONTRACT.md', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const missing = new Set();
  eachState((screen, name, hits) => {
    hits.forEach((h) => {
      if (/:block|:card$/.test(h.id)) return;
      const norm = h.id.replace(/^pool:g_.*/, 'pool:<generalId>').replace(/^slot:.*/, 'slot:<slot>').replace(/^history:item:.*/, 'history:item:<dateKey>').replace(/^respinAd:.*/, h.id);
      if (!doc.includes(norm)) missing.add(screen + ' ' + norm);
    });
  }, ['default', 'large']);
  assert.deepStrictEqual([...missing], []);
});

test('scroll areas expose scrollMax and clip their tap areas to the viewport', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen === 'draft' && name === 'flipped') assert.ok(hits.scrollMax['pool:list'] >= 0);
    if (screen === 'draft' && name === 'flipped_scrolled' && mode === 'default') {
      hits.filter((h) => h.id.startsWith('pool:g_')).forEach((h) => assert.ok(h.y >= L.navBottom && h.y + h.h <= L.bottomEdge));
    }
    if (screen === 'result' && name === 'done' && L.H < 700) assert.ok(hits.scrollMax['result:scroll'] > 0, 'result scrolls at ' + L.H);
    if (screen === 'history' && name === 'ready') assert.ok('history:list' in hits.scrollMax);
    if (screen === 'historyIssue' && name === 'ready') assert.ok('issue:list' in hits.scrollMax);
  }, ALL);
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
  names.forEach((n) => Array.from(n).forEach((ch) => assert.ok(!daily.__calls.some((c) => c.s === ch), 'daily card draws the glyph ' + ch)));
  assert.ok(dailyText.includes('十胜二负') && dailyText.includes('霸业将成') && dailyText.includes('第12期'));

  const free = mockCtx();
  sc.draw(free, { ...base, mode: 'free' });
  const freeText = free.__calls.map((c) => c.s).join('|');
  names.forEach((n) => assert.ok(freeText.includes(n), 'free card misses ' + n));
});

test('share card render() sizes the canvas 500 x 400 (5:4), 1000 x 800 at 2x, with the saved-card line', () => {
  const c = mockCreateCanvas();
  render.shareCard.render(c, { mode: 'free', record: { w: 6, l: 6 }, bandLabel: '三分鼎立', lineup: [], battles: [] });
  assert.strictEqual(c.width, 500);
  assert.strictEqual(c.height, 400);
  const c2 = mockCreateCanvas();
  render.shareCard.render(c2, { mode: 'free', record: { w: 6, l: 6 }, bandLabel: '三分鼎立', lineup: [], battles: [] }, { pixelScale: 2 });
  assert.strictEqual(c2.width, 1000);
  assert.strictEqual(c2.height, 800);
  const ctx = mockCtx();
  render.shareCard.draw(ctx, { mode: 'free', record: { w: 6, l: 6 }, bandLabel: '三分鼎立', lineup: [], battles: [] }, { saved: true });
  assert.ok(ctx.__calls.some((c) => c.s === '微信小游戏 · 点将台'));
  const plain = mockCtx();
  render.shareCard.draw(plain, { mode: 'free', record: { w: 6, l: 6 }, bandLabel: '三分鼎立', lineup: [], battles: [] });
  assert.ok(!plain.__calls.some((c) => c.s === '微信小游戏 · 点将台'));
});

test('share and saved cards ignore the display modes (one consistent card for the group)', () => {
  const T = render.theme;
  const vm = { mode: 'daily', issueNo: 12, variantLabel: '识人', record: { w: 10, l: 2 }, bandLabel: '霸业将成', lineup: ['wei', 'shu', 'wu', 'qun', 'jin'].map((f, i) => ({ slotLabel: '主公', name: 'x' + i, monogram: 'x', faction: f, factionLabel: T.FACTION_LABEL[f] })), battles: new Array(12).fill(true) };
  const sig = (display) => {
    T.applyDisplay(display);
    const ctx = mockCtx({ ops: true });
    render.shareCard.draw(ctx, vm);
    const after = T.getMode();
    return { log: JSON.stringify(ctx.__ops) + JSON.stringify(ctx.__calls), after };
  };
  const a = sig(MODES.default);
  const b = sig(MODES.large_hc);
  assert.strictEqual(a.log, b.log);
  assert.deepStrictEqual(b.after, { large: true, hc: true }, 'the card restores the caller mode');
  assert.ok(a.log.includes('识人'), 'the 识人 tag is on the card');
  T.applyDisplay(null);
});

// ------------------------------------------------------------- layout checks

test('text is never overlapped by a pinned primary button (320x568 and 375x667, all modes)', () => {
  const ids = new Set(['home:daily', 'home:retry', 'primary', 'undo', 'retryRound', 'board:retry', 'board:goPlay', 'board:share', 'board:agree', 'board:openSetting', 'challenge:accept', 'challenge:retry', 'challenge:compare', 'result:retry', 'history:retry', 'issue:retry']);
  let checked = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (!((L.W === 320 && L.H === 568) || (L.W === 375 && L.H === 667))) return;
    if (hits.some((h) => /^(sheet:body|dialog:block|adstub:block|coach:block|privacy:block|album:block)$/.test(h.id))) return; // covered by a modal on purpose
    hits.filter((h) => ids.has(h.id) && h.h < L.H / 2 && h.w < L.W).forEach((r) => {
      calls.forEach((c) => {
        if (!c.visible) return;
        const intersects = c.y + c.size / 2 > r.y + 1 && c.y - c.size / 2 < r.y + r.h - 1 && c.x >= r.x - 5 && c.x <= r.x + r.w + 5;
        if (!intersects) return;
        // button labels are centred in the rect; anything else must stay outside it
        assert.ok(c.y >= r.y && c.y <= r.y + r.h, mode + ' ' + screen + '/' + name + ' "' + c.s + '" overlaps ' + r.id + ' at ' + L.W + 'x' + L.H);
      });
      checked++;
    });
  }, ALL);
  assert.ok(checked > 150);
});

test('texts never overlap each other (all modes, 320x568 and 430x932)', () => {
  let checked = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (!((L.W === 320 && L.H === 568) || (L.W === 430 && L.H === 932))) return;
    if (st.overlay) return; // modals sit on top of dimmed screens on purpose
    const list = calls.filter((c) => Array.from(c.s).length > 1 && c.alpha >= 0.99 && c.visible);
    const clipTop = L.navBottom - 2;
    const clipBottom = L.bottomEdge + 2;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const ah = a.size * 0.62;
        const bh = b.size * 0.62;
        const vy = Math.abs(a.y - b.y) < (ah + bh) / 2;
        const hx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (!vy || hx <= 2) continue;
        // texts that scrolled out of the content viewport may be drawn behind a pinned bar
        if (a.y < clipTop || b.y < clipTop || a.y > clipBottom || b.y > clipBottom) continue;
        // pinned bars (result fade, sheet scrim) can legitimately hide scrolled text
        if (screen === 'result' && (a.y > L.bottomEdge - 80 || b.y > L.bottomEdge - 80)) continue;
        if (name.includes('scrolled') || name.includes('sheet') || name.startsWith('selecting') || name.startsWith('hidden_selecting') || name.startsWith('coach') || vm.coach || vm.sheet) continue;
        assert.fail(mode + ' ' + screen + '/' + name + ' at ' + L.W + 'x' + L.H + ': "' + a.s + '" overlaps "' + b.s + '"');
      }
    }
    checked++;
  }, ALL);
  assert.ok(checked > 300);
});

test('home daily card: text clears the primary button at 320x568 and stays centred (all states, all modes)', () => {
  const L = layoutFor(SIZES[1]);
  ALL.forEach((mode) => {
    const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] }).home;
    ['loading', 'available', 'available_shiren', 'available_streak', 'available_shiren_streak', 'available_group', 'inProgress', 'done', 'done_shiren', 'pendingSubmit', 'offline', 'error'].forEach((name) => {
      const ctx = mockCtx();
      const hits = render.screens.home.draw(ctx, fx[name], L);
      const btn = hits.find((h) => h.id === 'home:daily' || h.id === 'home:retry');
      if (name === 'loading') {
        assert.ok(!btn, 'the loading button is disabled');
        assert.ok(ctx.__calls.some((c) => c.s === '正在取今日军令…' && c.align === 'center'));
        return;
      }
      assert.ok(btn, mode + ' ' + name);
      ctx.__calls
        .filter((c) => c.y < btn.y + btn.h && c.y > btn.y - 140 && c.x < btn.x + 5 && Array.from(c.s).length > 1)
        .forEach((c) => assert.ok(c.y + c.size / 2 <= btn.y - 1.5, mode + ' ' + name + ': "' + c.s + '" bottom ' + (c.y + c.size / 2).toFixed(1) + ' vs button top ' + btn.y.toFixed(1)));
      assert.ok(btn.y + btn.h / 2 >= L.H * 0.6, mode + ' ' + name + ' primary in thumb zone');
      assert.ok(btn.h >= (MODES[mode].largeText ? 55.9 : 47.9));
      // centred card text (commit 90a1530): status, sub and skeleton lines sit on the card centre
      const mx = btn.x + btn.w / 2;
      ctx.__calls
        .filter((c) => c.y < btn.y && c.y > btn.y - 130 && /军令需联网|战报待发送|第 \d \/ 5 轮|今日 10胜|全服同一手令牌|自由点将不受影响|正在取今日军令|明日 0:00|网络不通|连续出征/.test(c.s))
        .forEach((c) => {
          assert.strictEqual(c.align, 'center', mode + ' ' + name + ' "' + c.s + '" is not centre-aligned');
          assert.ok(Math.abs(c.x - mx) < 1.5, mode + ' ' + name + ' "' + c.s + '" centre ' + c.x.toFixed(1) + ' vs ' + mx.toFixed(1));
        });
    });
  });
});

test('home: streak line only from 2 days, 识人 badge only on the 识人 daily, 往期 button present', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).home;
  const text = (vm) => {
    const ctx = mockCtx();
    const hits = render.screens.home.draw(ctx, vm, L);
    return { t: ctx.__calls.map((c) => c.s).join('|'), hits };
  };
  assert.ok(text(fx.available_streak).t.includes('连续出征 5 天'));
  assert.ok(!text(fx.available).t.includes('连续出征'));
  const one = { ...fx.available, daily: { ...fx.available.daily, streak: { current: 1, text: null } } };
  assert.ok(!text(one).t.includes('连续出征'));
  assert.ok(text(fx.available_shiren).t.includes('识人'));
  assert.ok(!text(fx.available).t.includes('识人'));
  assert.ok(text(fx.available).hits.some((h) => h.id === 'home:history'));
  assert.ok(!text(fx.available_nohistory).hits.some((h) => h.id === 'home:history'));
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

test('home footer: 声音 / 隐私与设置 stay pinned to the bottom of the page (all states, sizes, modes)', () => {
  const MAX_TAP_GAP = 0.5; // tap area is flush with the screen bottom
  let seen = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'home' || vm.sheet) return; // sheets cover the footer
    const where = mode + ' home/' + name + ' at ' + L.W + 'x' + L.H;
    ['home:sound', 'home:settings'].forEach((id) => {
      const h = hits.find((a) => a.id === id);
      assert.ok(h, where + ' ' + id + ' missing');
      const gap = L.H - (h.y + h.h);
      assert.ok(gap >= -0.5 && gap <= MAX_TAP_GAP, where + ' ' + id + ' tap area bottom is ' + gap.toFixed(1) + 'pt from the screen bottom');
      assert.ok(h.h >= 47.9 && h.w >= 47.9, where + ' ' + id + ' tap size');
    });
    // text: baseline 8-14pt (scaled by L.s) above the physical bottom (clear of the home indicator), never below it
    const label = calls.find((c) => /^声音/.test(c.s));
    const priv = calls.find((c) => c.s === '隐私与设置');
    [label, priv].forEach((c) => {
      assert.ok(c, where + ' footer text drawn');
      const baseline = c.y + c.size * 0.35;
      const gap = L.H - baseline;
      assert.ok(gap >= 7.5 && gap <= L.u(14) + 1, where + ' footer text baseline ' + gap.toFixed(1) + 'pt above the bottom');
    });
    // nothing else tappable sits lower than the footer row, and nothing overlaps it
    const foot = hits.filter((a) => FOOTER_IDS.test(a.id));
    hits.forEach((a) => {
      if (FOOTER_IDS.test(a.id) || STRUCTURAL.test(a.id)) return;
      assert.ok(a.y + a.h <= L.footer.top + 0.5, where + ' ' + a.id + ' overlaps the footer row');
    });
    assert.strictEqual(foot.length, 2);
    seen++;
  }, ALL);
  assert.ok(seen > 200, 'checked ' + seen);
});
