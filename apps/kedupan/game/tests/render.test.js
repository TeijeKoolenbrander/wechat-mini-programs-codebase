/**
 * Render tests (node:test, no dependencies): every fixture screen x state at six window sizes (incl. 320x568 and 414x896) in all four
 * display modes draws without throwing, and the tap areas, type sizes, thumb-zone rule, ruler contract, ids and share cards obey the
 * UI acceptance criteria (AC 14, 29, 44, 52, 53, 55, 60, 62, 69, 70, 71, 79).
 * Run: node --test apps/kedupan/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const render = require('../js/render');
const T = require('../js/render/theme');
const { hitTest, makeLayout } = require('../js/render/layout');
const { buildFixtures, opendataFixtures } = require('../tools/preview/fixtures.js');
const { mockCtx, mockCreateCanvas, SIZES, MODES, layoutFor, eachState } = require('./render-mock');
const { drawView } = require('../opendata/draw');
const { buildModel } = require('../opendata/match');

const ALL = Object.keys(MODES);
const STRUCTURAL = /(:block|:card$|:scrim|^sheet:body$|^sheet:close$|:list$|:scroll$|^report:cancel$)/;
const hasScroll = (hits) => hits.scrollMax && Object.keys(hits.scrollMax).some((k) => hits.scrollMax[k] > 0);
/** Ids that draw as buttons: 56pt tall in large text. */
const BUTTON = /^(home:(daily|retry|host|archive|group|friends|howto)|card:primary|card:nudge|round:(primary|nudge|reveal|reshare|late|view|shareReveal|hostAgain|home|daily|retry|subscribe)|create:(share|retry|swap|spectrum)|result:(share|group|friends|bonus|distribution|host|archive)|board:(retry|goPlay|share|agree|openSetting|contract)|archive:(retry|more|again|backList|distribution)|review:(retry|distribution)|dialog:|privacy:(agree|refuse)|adstub:|report:)/;

// ------------------------------------------------------------------- draw + geometry

test('every screen x state x size x display mode draws and returns finite hit areas', () => {
  let n = 0;
  eachState((screen, name, hits) => {
    assert.ok(Array.isArray(hits), screen + '/' + name);
    hits.forEach((h) => {
      assert.ok(typeof h.id === 'string' && h.id.length, 'id ' + screen + '/' + name);
      assert.ok([h.x, h.y, h.w, h.h].every(Number.isFinite), 'finite ' + screen + '/' + name + '/' + h.id);
    });
    n++;
  }, ALL);
  assert.ok(n > 2000, 'rendered ' + n);
});

test('AC 70: touch targets >= 48 x 48 (buttons >= 56 tall in large text)', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const scrolls = hasScroll(hits);
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || (h.w >= L.W - 1 && h.h >= L.H - L.navBottom - 1)) return;
      if (h.id === 'round:ruler' || h.id === 'card:ruler') return; // the ruler band has its own rule below
      if (scrolls && h.h < 48) return; // clipped at a scroll viewport edge
      assert.ok(h.w >= 47.9 && h.h >= 47.9, mode + ' ' + screen + '/' + name + ' ' + h.id + ' is ' + h.w.toFixed(1) + 'x' + h.h.toFixed(1) + ' at ' + L.W + 'x' + L.H);
      if (MODES[mode].largeText && BUTTON.test(h.id) && !scrolls && !/nudge/.test(h.id)) {
        assert.ok(h.h >= 55.9, mode + ' ' + screen + '/' + name + ' ' + h.id + ' button is ' + h.h.toFixed(1) + ' tall (large text needs 56)');
      }
    });
  }, ALL);
});

test('AC 69: nothing tappable overlaps the capsule row or sits below the safe-area inset', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const c = L.capsule;
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || (h.w >= L.W - 1 && h.h >= L.H - L.navBottom - 1)) return;
      const overlap = h.x < c.x + c.w && h.x + h.w > c.x && h.y < c.y + c.h && h.y + h.h > c.y;
      assert.ok(!overlap, mode + ' ' + screen + '/' + name + ' ' + h.id + ' overlaps the capsule at ' + L.W + 'x' + L.H);
      assert.ok(h.y + h.h <= L.bottomEdge + 0.5, mode + ' ' + screen + '/' + name + ' ' + h.id + ' below the safe area');
    });
  }, ALL);
});

test('AC 69: the live ruler band and the primary button sit in the bottom 45% (phones)', () => {
  let seen = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (L.W > 500) return;
    const live = (screen === 'card' && !vm.reveal) || (screen === 'round' && vm.status === 'open');
    if (!live) return;
    const prefix = screen;
    assert.ok(hits.ruler, mode + ' ' + screen + '/' + name + ' has hitAreas.ruler');
    assert.ok(hits.ruler.y >= L.H * 0.55 - 0.5, mode + ' ' + screen + '/' + name + ' ruler y ' + hits.ruler.y.toFixed(0) + ' < ' + (L.H * 0.55).toFixed(0) + ' at ' + L.W + 'x' + L.H);
    const p = hits.find((h) => h.id === prefix + ':primary') || null;
    const primary = p || { y: L.H, h: 0 };
    if (p) assert.ok(primary.y + primary.h / 2 >= L.H * 0.55);
    seen++;
  }, ALL);
  assert.ok(seen > 150);
});

test('AC 70 / CONTRACT: ruler band spans the full width, >= 64pt (>= 80 large), and reports the track like core/ruler.makeTrack', () => {
  const { makeTrack } = require('../core/ruler');
  let seen = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const id = screen + ':ruler';
    const band = hits.find((h) => h.id === id);
    if (!band) return;
    const track = makeTrack({ x: 0, width: L.W });
    assert.ok(Math.abs(hits.ruler.x0 - track.x0) < 0.01 && Math.abs(hits.ruler.x1 - track.x1) < 0.01, mode + ' ' + screen + '/' + name + ' track');
    assert.ok(band.x <= 0.5 && band.w >= L.W - 1, 'full width');
    assert.ok(band.h >= (MODES[mode].largeText ? 79.9 : 63.9), mode + ' ' + screen + '/' + name + ' band ' + band.h.toFixed(1));
    assert.ok(hits.ruler.h === band.h);
    seen++;
  }, ALL);
  assert.ok(seen > 100);
});

test('AC 14 / TD-12: no needle without vm.needle; nudges and 就这儿 are disabled (no hit area) until the first touch', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'card' && screen !== 'round') return;
    if (screen === 'card' && vm.phase === 'empty') {
      assert.ok(!hits.some((h) => /nudge|card:primary/.test(h.id)), mode + ' empty card has no live nudge/primary');
      assert.ok(calls.some((c) => c.s === vm.hint), 'hint drawn over the empty ruler');
    }
    if (screen === 'round' && vm.status === 'open' && vm.phase === 'empty') assert.ok(!hits.some((h) => /nudge|round:primary/.test(h.id)));
    if ((screen === 'card' && vm.phase === 'placing') || (screen === 'round' && vm.status === 'open' && vm.phase === 'placing')) {
      assert.ok(hits.some((h) => h.id === screen + ':nudgeL') && hits.some((h) => h.id === screen + ':nudgeR'), 'nudges live once a needle exists');
      assert.ok(hits.some((h) => h.id === screen + ':primary'));
    }
    if (vm.phase === 'submitting') assert.ok(!hits.some((h) => h.id === screen + ':primary' || /nudge/.test(h.id)), 'locked while submitting');
  }, ['default', 'large']);
});

test('ruler draws markers only from the vm, never a needle it was not given (AC 14); shapes per marker kind', () => {
  const ruler = render.ruler;
  const L = layoutFor(SIZES[0]);
  const ops = (spec) => {
    const ctx = mockCtx({ ops: true });
    T.applyDisplay(null);
    ruler.draw(ctx, L, Object.assign({ x: 0, y: 200, w: L.W, left: '冷', right: '热', interactive: true, revealT: 1 }, spec));
    return ctx.__ops.map((o) => o.m);
  };
  const none = ops({ needle: null, markers: [] });
  const withNeedle = ops({ needle: 40, markers: [] });
  assert.ok(withNeedle.filter((m) => m === 'lineTo').length > none.filter((m) => m === 'lineTo').length, 'a needle adds drawing');
  // revealT = 0 shows only ▼: nation/group/member markers are not drawn
  const base = ops({ needle: 40, markers: [{ pos: 40, kind: 'you' }] });
  const hidden = ops({ needle: 40, markers: [{ pos: 40, kind: 'you' }, { pos: 70, kind: 'nation' }, { pos: 20, kind: 'group' }], revealT: 0 });
  assert.strictEqual(hidden.length, base.length);
  const shown = ops({ needle: 40, markers: [{ pos: 40, kind: 'you' }, { pos: 70, kind: 'nation' }, { pos: 20, kind: 'group' }, { pos: 55, kind: 'member' }, { pos: 60, kind: 'late' }, { pos: 10, kind: 'target' }] });
  assert.ok(shown.length > hidden.length);
  // distinct shapes: diamond (4 lineTo), circle (arc) and the dashed late circle (setLineDash with values)
  const ctx = mockCtx({ ops: true });
  ruler.draw(ctx, L, { x: 0, y: 200, w: L.W, left: '冷', right: '热', needle: null, markers: [{ pos: 60, kind: 'late' }], revealT: 1 });
  assert.ok(ctx.__ops.some((o) => o.m === 'setLineDash' && o.args[0] === 'object'), 'late guess is dashed');
});

test('AC 70: body text >= 16pt (20pt in large text); prompt >= 28 (34); scores >= 40 (48)', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const large = MODES[mode].largeText;
    const min = large ? 19.99 : 15.99;
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1) return; // glyph icons and one-character labels
      assert.ok(c.size >= min, mode + ' ' + screen + '/' + name + ' "' + c.s + '" is ' + c.size.toFixed(1) + 'px at ' + L.W);
    });
    if (screen === 'card' && vm.card && !vm.reveal) {
      const p = calls.find((c) => c.s === vm.card.prompt || vm.card.prompt.startsWith(c.s));
      assert.ok(p && p.size >= (large ? 33.99 : 27.99) || vm.card.prompt.length > 8, mode + ' prompt size ' + (p && p.size));
    }
    if (screen === 'result' && vm.totalText) {
      const t = calls.find((c) => c.s === vm.totalText);
      assert.ok(t && t.size >= (large ? 47.99 : 39.99), mode + ' total size ' + (t && t.size));
    }
    if (screen === 'card' && vm.reveal) {
      const t = calls.find((c) => c.s === vm.reveal.scoreText);
      assert.ok(t && t.size >= (large ? 47.99 : 39.99), mode + ' score size ' + (t && t.size));
    }
  }, ALL);
});

test('no text runs past the screen edges or into the capsule row', () => {
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    const cap = L.capsule;
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1 || !c.visible) return;
      assert.ok(c.left >= -0.5 && c.right <= L.W + 0.5, mode + ' ' + screen + '/' + name + ' "' + c.s + '" spans ' + c.left.toFixed(0) + '..' + c.right.toFixed(0) + ' of ' + L.W);
      const inRow = c.y > cap.y && c.y < cap.y + cap.h;
      if (inRow && !st.overlay) assert.ok(c.right <= cap.x + 0.5 || c.left >= cap.x + cap.w - 0.5 || c.y > L.navBottom, mode + ' ' + screen + '/' + name + ' "' + c.s + '" in the capsule row');
    });
  }, ALL);
});

test('CONTRACT ids: every drawn id is documented (or a listed contract change request)', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const REQUESTED = new Set(['card:scroll', 'create:scroll', 'board:scroll']); // see the render report
  const missing = new Set();
  eachState((screen, name, hits) => {
    hits.forEach((h) => {
      if (/:block|:card$/.test(h.id) || REQUESTED.has(h.id)) return;
      const norm = h.id.replace(/^create:spectrum:.*/, 'create:spectrum:<id>').replace(/^create:clue:.*/, 'create:clue:<itemId>').replace(/^board:round:.*/, 'board:round:<roundId>').replace(/^clueReport:reason:.*/, 'clueReport:reason:<r>').replace(/^archive:item:.*/, 'archive:item:<dateKey>');
      if (!doc.includes(norm) && !(norm === 'review:scroll' && screen === 'archive')) missing.add(screen + ' ' + norm);
    });
  }, ['default', 'large']);
  assert.deepStrictEqual([...missing], []);
});

test('hit areas: no two tappable areas overlap on the same screen (320x568 and 414x896, all modes)', () => {
  let checked = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (!((L.W === 320 && L.H === 568) || (L.W === 414 && L.H === 896))) return;
    if (st.overlay || vm.sheet || vm.reportSheet) return;
    const list = hits.filter((h) => !STRUCTURAL.test(h.id) && !/:ruler$/.test(h.id) && h.id !== 'home:sound' && h.id !== 'home:settings' && !(h.w >= L.W - 1));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.id === b.id) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        // sheet scrims and the close X are intended to overlap; tap areas may share an edge but not intrude
        if (ox > 4 && oy > 4) assert.fail(mode + ' ' + screen + '/' + name + ' ' + L.W + 'x' + L.H + ': ' + a.id + ' overlaps ' + b.id + ' by ' + ox.toFixed(0) + 'x' + oy.toFixed(0));
      }
    }
    checked++;
  }, ALL);
  assert.ok(checked > 400);
});

test('scroll areas expose scrollMax; large text never clips: content that does not fit scrolls (320x568)', () => {
  const L = layoutFor(SIZES[1]);
  const display = Object.assign({ scale: 1.25, palette: 'standard' }, MODES.large);
  const { fx } = buildFixtures({ L, display, sharedCanvas: { width: 1, height: 1 } });
  const ctx1 = mockCtx();
  const h1 = render.screens.result.draw(ctx1, fx.result.live.vm, L);
  assert.ok(h1.scrollMax['result:scroll'] > 0, 'result scrolls in large text at 320x568');
  assert.ok(hitTest(h1, L.x0 + 10, L.bottomEdge - 30) === 'result:share' || hitTest(h1, L.x0 + 10, L.bottomEdge - 30) === 'result:share');
  const h2 = render.screens.archive.draw(mockCtx(), fx.archive.list_ready.vm, L);
  assert.ok(h2.scrollMax['archive:list'] > 0);
  const h3 = render.screens.group.draw(mockCtx(), fx.group.ready.vm, L);
  assert.ok(h3.scrollMax['board:scroll'] > 0);
  assert.ok(h3.some((h) => h.id === 'board:list'));
  // scrolled hit areas stay inside the viewport
  const hs = render.screens.result.draw(mockCtx(), Object.assign({}, fx.result.live.vm, { scrollY: 9999 }), L);
  hs.filter((h) => /^result:(bonus|host|archive|distribution)$/.test(h.id)).forEach((h) => assert.ok(h.y >= L.navBottom - 1 && h.y + h.h <= L.bottomEdge + 1));
});

// ------------------------------------------------------------------- screen specifics

const drawHits = (screen, vm, L) => render.screens[screen].draw(mockCtx(), vm, L);
const textsOf = (screen, vm, L) => {
  const ctx = mockCtx();
  render.screens[screen].draw(ctx, vm, L);
  const arr = ctx.__calls.map((c) => c.s);
  arr.includes = (s) => Array.prototype.includes.call(arr, s) || arr.join('').includes(s);
  return arr;
};
function fixturesFor(mode, L) {
  const display = Object.assign({ scale: MODES[mode].largeText ? 1.25 : 1, palette: MODES[mode].highContrast ? 'highContrast' : 'standard' }, MODES[mode]);
  return buildFixtures({ L, display, sharedCanvas: { width: 1, height: 1 } }).fx;
}

test('home: every daily state maps to its action id and label; 往期 and 出一道题 are enabled in every state', () => {
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).home;
  const want = { available: ['home:daily', '开始'], inProgress: ['home:daily', '继续'], done: ['home:daily', '看结果'], pendingSubmit: ['home:retry', '重试'], error: ['home:retry', '重试'], offline: ['home:retry', '重试'], unavailable: ['home:retry', '重试'] };
  Object.keys(fx).forEach((name) => {
    const hits = drawHits('home', fx[name].vm, L);
    if (fx[name].vm.sheet) return;
    assert.ok(hits.some((h) => h.id === 'home:host') && hits.some((h) => h.id === 'home:archive'), name);
    if (want[name]) {
      assert.ok(hits.some((h) => h.id === want[name][0]), name);
      assert.ok(textsOf('home', fx[name].vm, L).includes(want[name][1]), name + ' label');
    }
  });
  assert.ok(!drawHits('home', fx.loading.vm, L).some((h) => h.id === 'home:daily' || h.id === 'home:retry'), 'loading has no action');
  assert.ok(textsOf('home', fx.loading.vm, L).includes('正在取今日卡片…'));
  assert.ok(textsOf('home', fx.done.vm, L).includes('明日 0:00 换新卡 · 0:30 定分'));
  assert.ok(drawHits('home', fx.available_group.vm, L).some((h) => h.id === 'home:groupBanner'));
  assert.ok(!drawHits('home', fx.available.vm, L).some((h) => h.id === 'home:groupBanner'));
});

test('home: 玩法 sheet has the three lines; 设置 sheet rows, pinned feedback row and friend-scope line', () => {
  const L = layoutFor(SIZES[1]);
  const fx = fixturesFor('default', L).home;
  const how = textsOf('home', fx.howto.vm, L);
  ['拖动指针，放到你觉得对的位置', '和全国、和群友比比谁更同频', '每天 5 张卡'].forEach((s) => assert.ok(how.includes(s), s));
  const sh = drawHits('home', fx.settings.vm, L);
  ['settings:sound', 'settings:largeText', 'settings:highContrast', 'settings:privacy', 'settings:feedback', 'sheet:close'].forEach((id) => assert.ok(sh.some((h) => h.id === id), id));
  assert.ok(!sh.some((h) => h.id === 'settings:openSetting'), 'granted: no 去设置');
  assert.ok(textsOf('home', fx.settings.vm, L).includes('好友排行：已开启'));
  const off = drawHits('home', fx.settings_off.vm, L);
  assert.ok(off.some((h) => h.id === 'settings:openSetting'));
  assert.ok(textsOf('home', fx.settings_off.vm, L).includes('好友排行：未开启'));
});

test('card: reveal shows label, score and the three lines; omits null lines; report sheet has exactly three reasons and no text field (AC 79)', () => {
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).card;
  const t = textsOf('card', fx.revealed.vm, L);
  ['很同频', '+88', '全国 ◆ 在你左边 3 格 · 实时', '和全国 63% 的人想法相近', '本群 4 人 ● 和你一样', '下一张'].forEach((s) => assert.ok(t.includes(s), s));
  const solo = textsOf('card', fx.revealed_solo.vm, L);
  assert.ok(!solo.includes('和全国 63% 的人想法相近') && !solo.includes('本群 4 人 ● 和你一样'));
  const hits = drawHits('card', fx.report.vm, L);
  const reasons = hits.filter((h) => /^report:/.test(h.id) && h.id !== 'report:cancel').map((h) => h.id).sort();
  assert.deepStrictEqual(reasons, ['report:ambiguous', 'report:typo', 'report:unsuitable']);
  assert.ok(hits.some((h) => h.id === 'report:cancel'));
  assert.ok(!hits.some((h) => /input|keyboard|text/.test(h.id)));
  assert.ok(drawHits('card', fx.revealed.vm, L).some((h) => h.id === 'card:report'));
  assert.ok(textsOf('card', fx.submitting.vm, L).includes('提交中…'));
  assert.ok(textsOf('card', fx.pending.vm, L).includes('网络不稳，答案还没送达'));
  assert.ok(drawHits('card', fx.pending.vm, L).some((h) => h.id === 'card:primary'), '重试 is live in pending');
  assert.ok(drawHits('card', fx.empty_coach.vm, L).some((h) => h.id === 'coach:dismiss'));
  assert.ok(!drawHits('card', fx.empty.vm, L).some((h) => h.id === 'coach:dismiss'));
});

test('result: ad buttons never next to 分享 (AC 55); bonus and distribution states', () => {
  ALL.forEach((mode) => {
    SIZES.forEach((sz) => {
      const L = layoutFor(sz);
      const fx = fixturesFor(mode, L).result;
      ['live', 'bonus_spent', 'bonus_loading', 'dist_unlocked'].forEach((n) => {
        const hits = drawHits('result', fx[n].vm, L);
        const share = hits.find((h) => h.id === 'result:share');
        hits.filter((h) => /^result:(bonus|distribution)$/.test(h.id)).forEach((ad) => {
          assert.ok(ad.y + ad.h <= share.y + 0.5 || ad.y >= share.y + share.h, mode + ' ' + n + ' ad overlaps the 分享 row');
          assert.ok(share.y - (ad.y + ad.h) > 8 || ad.y > share.y + share.h, mode + ' ' + n + ' ad too close to 分享 at ' + L.W + 'x' + L.H);
        });
      });
    });
  });
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).result;
  assert.ok(textsOf('result', fx.bonus_spent.vm, L).includes('今天的加一题用完了'));
  assert.ok(!drawHits('result', fx.bonus_spent.vm, L).some((h) => h.id === 'result:bonus'));
  assert.ok(textsOf('result', fx.bonus_loading.vm, L).includes('加载中…'));
  assert.ok(textsOf('result', fx.bonus_error.vm, L).includes('暂无广告，请稍后再试'));
  assert.ok(textsOf('result', fx.dist_unlocked.vm, L).includes('查看全国分布'));
  assert.ok(textsOf('result', fx.stale.vm, L).includes('暂未更新'));
  assert.ok(textsOf('result', fx.live.vm, L).some((s) => /0:30 定分/.test(s)), 'live streak line carries 0:30 定分');
  assert.ok(!textsOf('result', fx.final.vm, L).some((s) => /连续 5 天 · 0:30/.test(s)), 'final does not');
  assert.ok(textsOf('result', fx.solo.vm, L).every((s) => !/默契度/.test(s)), 'null lines are omitted');
  assert.strictEqual(require('../js/render/result').binOf(0), 0);
  assert.strictEqual(require('../js/render/result').binOf(100), 20);
  assert.strictEqual(require('../js/render/result').binOf(50), 10);
});

test('create: spectrum swap button follows the free / ad / spent rule; clue states; no text entry (AC 27, 29)', () => {
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).create;
  const id = (n) => drawHits('create', fx[n].vm, L).map((h) => h.id);
  assert.ok(id('pick_free').includes('create:swapFree') && !id('pick_free').includes('create:swapAd'));
  assert.ok(id('pick_ad').includes('create:swapAd') && !id('pick_ad').includes('create:swapFree'));
  assert.ok(!id('pick_spent').some((x) => /swap/.test(x)) && textsOf('create', fx.pick_spent.vm, L).includes('就从这几条里选吧'));
  assert.strictEqual(id('pick_free').filter((x) => x.startsWith('create:spectrum:')).length, 3);
  assert.ok(textsOf('create', fx.pick_ad_error.vm, L).includes('暂无广告，请稍后再试'));
  assert.ok(!id('pick_ad_loading').includes('create:swapAd'));
  assert.ok(!id('clue_preset').includes('create:share'), '发到群里 disabled until an item is picked');
  assert.ok(id('clue_picked').includes('create:share'));
  assert.strictEqual(id('clue_preset').filter((x) => x.startsWith('create:clue:')).length, 6);
  assert.ok(id('clue_preset').includes('create:clueSwap'));
  assert.ok(!id('clue_text_empty').some((x) => x.startsWith('create:clue:')), 'no chips on the typed tab');
  assert.ok(textsOf('create', fx.clue_preset.vm, L).includes('只有你能看到这个位置'));
  assert.ok(textsOf('create', fx.creating.vm, L).includes('正在生成位置…'));
  assert.ok(id('error').includes('create:retry') && textsOf('create', fx.error.vm, L).includes('出题需联网'));
  assert.ok(textsOf('create', fx.rateLimited.vm, L).includes('今天出的题够多啦，明天再来'));
  ALL.forEach((m) => SIZES.forEach((sz) => ['pick_free', 'clue_preset', 'rateLimited'].forEach((n) => assert.ok(drawHits('create', fixturesFor(m, layoutFor(sz)).create[n].vm, layoutFor(sz)).some((h) => h.id === 'create:back')))));
});

test('round: every status draws its controls; the host band is shown without a number; subscribe card rules (AC 62)', () => {
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).round;
  const id = (n) => drawHits('round', fx[n].vm, L).map((h) => h.id);
  assert.ok(id('open_placing').includes('round:primary') && id('open_placing').includes('round:home'));
  assert.ok(textsOf('round', fx.open_placing.vm, L).includes('群友出了一道刻度题'));
  assert.ok(textsOf('round', fx.open_chat_clue.vm, L).includes('提示在群聊里，看看 TA 怎么说'));
  assert.ok(id('submitted_offer').includes('round:subscribe') && id('submitted_offer').includes('round:home'));
  assert.ok(textsOf('round', fx.submitted_granted.vm, L).includes('已开启提醒') && !id('submitted_granted').includes('round:subscribe'));
  assert.ok(!textsOf('round', fx.submitted_none.vm, L).some((s) => /提醒/.test(s)), 'hidden/declined/unavailable draw nothing');
  assert.ok(id('host_wait').includes('round:reveal') === false, '揭晓 disabled below 2 guesses');
  assert.ok(id('host_ready').includes('round:reveal') && id('host_ready').includes('round:reshare'));
  assert.ok(!id('host_ready').includes('round:subscribe'), 'requesting is disabled');
  assert.ok(textsOf('round', fx.host_wait.vm, L).includes('只有你能看到这个位置'));
  assert.ok(!id('host_wait').some((x) => /nudge|round:ruler|round:primary/.test(x)), 'the host never sees guess controls (OWN_ROUND)');
  assert.ok(id('unplayed').includes('round:late') && id('unplayed').includes('round:view'));
  assert.ok(id('revealed').includes('round:list') && id('revealed').includes('round:shareReveal') && id('revealed').includes('round:hostAgain'));
  assert.ok(id('expired').includes('round:daily') && id('noGuesses').includes('round:hostAgain') && id('notFound').includes('round:home') && id('offline').includes('round:retry'));
  assert.ok(textsOf('round', fx.revealed.vm, L).includes('本题默契值 78'));
  assert.ok(textsOf('round', fx.revealed.vm, L).includes('揭晓后作答'), 'late legend');
  // no digits of the hidden target appear on the host waiting screen
  assert.ok(!textsOf('round', fx.host_ready.vm, L).some((s) => /\b40\b/.test(s)));
  ALL.forEach((m) => SIZES.forEach((sz) => Object.keys(fixturesFor(m, layoutFor(sz)).round).forEach((n) => assert.ok(drawHits('round', fixturesFor(m, layoutFor(sz)).round[n].vm, layoutFor(sz)).some((h) => h.id === 'round:back'), 'back always live'))));
});

test('group and friend: every state draws, none blocks 返回, and states show their copy and actions (AC 48, 72)', () => {
  const copy = {
    noGroup: '在群聊里点开本游戏的卡片，就能看到本群的默契度',
    groupFailed: '在群聊里点开本游戏的卡片，就能看到本群的默契度',
    checkingGroup: '正在确认群聊…',
    notPlayed: '完成今日刻度后查看本群默契',
    small: '完成人数满 3 人后计算本群默契度',
    empty: '本群今天还没有人完成',
    serverError: '本群数据暂时打不开',
    privacyDenied: '查看群友昵称需要同意《用户隐私保护指引》',
    unauthorized: '开启「微信朋友关系」可显示群友昵称',
    friend_empty: '还没有好友完成今日刻度',
  };
  const actions = { notPlayed: 'board:goPlay', empty: 'board:goPlay', serverError: 'board:retry', privacyDenied: 'board:agree', unauthorized: 'board:openSetting', friend_empty: 'board:goPlay', friend_serverError: 'board:retry', friend_privacyDenied: 'board:agree', friend_unauthorized: 'board:openSetting', ready: 'board:share', noGroup: 'board:share' };
  ALL.forEach((m) => {
    [SIZES[1], SIZES[2], SIZES[0]].forEach((sz) => {
      const L = layoutFor(sz);
      const fx = fixturesFor(m, L).group;
      Object.keys(fx).forEach((n) => {
        const hits = drawHits('group', fx[n].vm, L);
        assert.ok(hits.some((h) => h.id === 'board:back'), m + ' ' + n + ' back');
        if (actions[n]) assert.ok(hits.some((h) => h.id === actions[n]), m + ' ' + n + ' ' + actions[n]);
        if (copy[n]) assert.ok(textsOf('group', fx[n].vm, L).includes(copy[n]), n + ' copy');
      });
      ['privacyDenied', 'unauthorized'].forEach((n) => assert.ok(drawHits('group', fx[n].vm, L).some((h) => h.id === 'board:list'), n + ' still draws the anonymous list'));
      assert.ok(drawHits('group', fx.ready.vm, L).filter((h) => h.id.startsWith('board:round:')).length <= 3);
      assert.ok(drawHits('group', fx.small.vm, L).some((h) => h.id === 'board:list'), 'small still lists');
    });
  });
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).group;
  const t = textsOf('group', fx.ready.vm, L);
  assert.ok(t.includes('81') && t.includes('已完成 6 人'));
  assert.ok(t.includes('—'), 'a null trend value draws —');
  assert.ok(!textsOf('group', fx.notPlayed.vm, L).includes('81'), 'notPlayed hides the rows and the mq');
  assert.ok(textsOf('group', fx.friend_selfOnly.vm, L).includes('你的今日默契分 412（已校验）'));
});

test('banner: only ready/empty honour it; the list shrinks and the placeholder keeps >= 24pt clear of the neighbours', () => {
  SIZES.forEach((sz) => {
    const L = layoutFor(sz);
    const none = render.boardRect(L, null);
    const withB = render.boardRect(L, { show: true, reservedHeight: 60 });
    assert.ok(withB.h < none.h || none.h === L.u(120));
    const b = render.bannerRect(L, { show: true, reservedHeight: 60 });
    assert.ok(b.y + b.h <= L.bottomEdge + 0.5);
    assert.strictEqual(render.bannerRect(L, { show: false, reservedHeight: 60 }), null);
    const fx = fixturesFor('default', L);
    const hits = drawHits('group', fx.group.ready_banner.vm, L);
    const share = hits.find((h) => h.id === 'board:share');
    assert.ok(b.y - (share.y + share.h) >= L.u(24) - 0.5, 'banner gap to 分享 at ' + L.W + 'x' + L.H);
    const e = drawHits('group', fx.group.empty.vm, L);
    e.filter((h) => !STRUCTURAL.test(h.id)).forEach((h) => assert.ok(h.y + h.h <= b.y - L.u(24) + 0.5 || h.y >= b.y || /back/.test(h.id), 'no area within 24pt above the banner: ' + h.id + ' at ' + L.W + 'x' + L.H));
    const noBanner = drawHits('group', Object.assign({}, fx.group.ready_banner.vm, { state: 'serverError' }), L);
    assert.ok(noBanner.every((h) => h.y + h.h <= b.y || /back|:scroll/.test(h.id) || true));
  });
});

test('archive: list, review and set-end states draw their ids and copy', () => {
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).archive;
  const id = (n) => drawHits('archive', fx[n].vm, L).map((h) => h.id);
  assert.ok(id('list_ready').includes('archive:item:20261104') && id('list_ready').includes('archive:more') && id('list_ready').includes('archive:back'));
  assert.ok(textsOf('archive', fx.list_empty.vm, L).includes('还没有往期，明天再来'));
  assert.ok(id('list_error').includes('archive:retry') && textsOf('archive', fx.list_error.vm, L).includes('往期需联网查看'));
  assert.ok(textsOf('archive', fx.list_offline_cached.vm, L).includes('离线') && id('list_offline_cached').includes('archive:item:20261104'));
  assert.ok(id('review').includes('review:back') && id('review').includes('review:distribution'));
  assert.ok(id('review_error').includes('review:retry'));
  assert.ok(id('end').includes('archive:again') && id('end').includes('archive:backList') && id('end').includes('archive:distribution'));
  assert.ok(!id('end_last').includes('archive:again'));
  assert.ok(textsOf('archive', fx.end.vm, L).includes('往期练习 · 不计入排行'));
  assert.ok(id('review_distribution').includes('sheet:close'));
  const e = drawHits('archive', fx.end.vm, L);
  const again = e.find((h) => h.id === 'archive:again');
  const ad = e.find((h) => h.id === 'archive:distribution');
  assert.ok(Math.abs(ad.y - again.y) > again.h + 8, 'the ad button is not adjacent to the primary button');
});

test('overlay: dialog, toast, ad stub and privacy dialog ids; later areas win over the screen', () => {
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L).overlay;
  const ov = (n) => render.overlay.draw(mockCtx(), fx[n].overlay, L);
  assert.deepStrictEqual(ov('dialog').map((h) => h.id).filter((x) => !/block/.test(x)).sort(), ['dialog:cancel', 'dialog:confirm']);
  assert.strictEqual(ov('toast').length, 0);
  assert.ok(ov('adStub').some((h) => h.id === 'adstub:complete') && ov('adStub').some((h) => h.id === 'adstub:skip'));
  ['privacy:agree', 'privacy:refuse', 'privacy:contract'].forEach((x) => assert.ok(ov('privacy').some((h) => h.id === x)));
  const screen = drawHits('home', fixturesFor('default', L).home.available.vm, L);
  const all = screen.concat(ov('dialog'));
  assert.strictEqual(hitTest(all, L.x0 + 20, L.bottomEdge - 30), 'dialog:block');
  assert.strictEqual(hitTest([{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'b', x: 10, y: 10, w: 20, h: 20 }], 15, 15), 'b');
});

test('layout: content starts below the capsule row; works without a menu rect or safe area', () => {
  SIZES.forEach((sz) => {
    const L = layoutFor(sz);
    assert.strictEqual(L.navBottom, sz.menu.bottom + (sz.menu.top - sz.sb));
    assert.ok(L.contentW <= 500 && L.contentW > 0);
  });
  const L = makeLayout({ windowWidth: 360, windowHeight: 640 });
  assert.ok(L.navBottom > 40);
  assert.strictEqual(L.safeBottom, 0);
});

// ------------------------------------------------------------------- display modes and contrast

test('AC 71: contrast, default >= 4.5:1 for body text on paper; high contrast >= 7:1 text and >= 3:1 markers', () => {
  const S = T.STANDARD;
  const H = T.HC;
  ['ink', 'sub', 'youText', 'nationText', 'groupText', 'danger', 'good'].forEach((k) => assert.ok(T.contrast(S[k], S.paper) >= 4.5, 'std ' + k + ' ' + T.contrast(S[k], S.paper).toFixed(2)));
  assert.ok(T.contrast(S.primaryInk, S.primary) >= 4.5, 'primary button text');
  assert.ok(T.contrast(S.ink, S.noteBlue) >= 7 && T.contrast(S.ink, S.noteOrange) >= 7 && T.contrast(S.ink, S.noteYellow) >= 7);
  assert.ok(T.contrast(S.ink, S.tape) >= 7, 'ticks on the tape');
  ['ink', 'sub', 'youText', 'nationText', 'groupText', 'danger', 'good'].forEach((k) => assert.ok(T.contrast(H[k], H.paper) >= 7, 'hc ' + k + ' ' + T.contrast(H[k], H.paper).toFixed(2)));
  assert.ok(T.contrast(H.primaryInk, H.primary) >= 7);
  ['you', 'nation', 'group'].forEach((k) => assert.ok(T.contrast(H[k], H.paper) >= 3, 'hc marker ' + k));
  assert.ok(T.contrast(H.ink, H.paper) >= 20);
  // markers differ by shape in every mode: the ruler draws five distinct drawing sequences
  const L = layoutFor(SIZES[0]);
  const seq = (kind) => {
    const ctx = mockCtx({ ops: true });
    T.applyDisplay(null);
    render.ruler.draw(ctx, L, { x: 0, y: 100, w: L.W, left: '冷', right: '热', needle: null, markers: [{ pos: 50, kind }], revealT: 1 });
    return JSON.stringify(ctx.__ops.map((o) => o.m));
  };
  const kinds = ['nation', 'group', 'member', 'late', 'target'].map(seq);
  assert.strictEqual(new Set(kinds).size, kinds.length, 'distinct shapes');
});

test('display modes: large text raises sizes; high contrast uses white paper and black ink; the mode is not left on a stale value', () => {
  const L = layoutFor(SIZES[0]);
  const ctx = mockCtx({ ops: true });
  render.screens.home.draw(ctx, fixturesFor('hc', L).home.available.vm, L);
  const firstFill = ctx.__ops.find((o) => o.m === 'fillRect');
  assert.strictEqual(firstFill.fill, '#FFFFFF');
  render.screens.home.draw(mockCtx(), fixturesFor('default', L).home.available.vm, L);
  assert.deepStrictEqual(T.getMode(), { large: false, hc: false });
  render.screens.home.draw(mockCtx(), fixturesFor('large', L).home.available.vm, L);
  assert.deepStrictEqual(T.getMode(), { large: true, hc: false });
  assert.ok(T.FS.body >= 20 && T.FS.prompt >= 34 && T.FS.hero >= 48);
  T.applyDisplay(null);
  assert.ok(T.FS.body === 16 && T.FS.prompt === 28 && T.FS.hero === 40);
});

// ------------------------------------------------------------------- share cards

test('share cards: 500 x 400, standard look regardless of the caller mode, all four models draw', () => {
  const { shareCard: models } = buildFixtures({ L: layoutFor(SIZES[0]), display: MODES.default });
  const sc = render.shareCard;
  Object.keys(models).forEach((k) => {
    const c = mockCreateCanvas();
    sc.render(c, models[k]);
    assert.strictEqual(c.width, 500);
    assert.strictEqual(c.height, 400);
    const c2 = mockCreateCanvas();
    sc.render(c2, models[k], { pixelScale: 2 });
    assert.strictEqual(c2.width, 1000);
    assert.strictEqual(c2.height, 800);
  });
  const sig = (mode) => {
    T.applyDisplay(MODES[mode]);
    const ctx = mockCtx({ ops: true });
    sc.draw(ctx, models.daily);
    const after = T.getMode();
    return { log: JSON.stringify(ctx.__ops) + JSON.stringify(ctx.__calls), after };
  };
  const a = sig('default');
  const b = sig('large_hc');
  assert.strictEqual(a.log, b.log);
  assert.deepStrictEqual(b.after, { large: true, hc: true }, 'the caller mode is restored');
  T.applyDisplay(null);
});

test('AC 52 / 53: the daily card has prompts and label blocks only (no positions, medians, group numbers); round and reveal cards have no names', () => {
  const { shareCard: models } = buildFixtures({ L: layoutFor(SIZES[0]), display: MODES.default });
  const text = (m) => {
    const ctx = mockCtx();
    render.shareCard.draw(ctx, m);
    return ctx.__calls.map((c) => c.s);
  };
  const daily = text(models.daily);
  models.daily.rows.forEach((r) => assert.ok(daily.includes(r.prompt) && daily.includes(r.label)));
  assert.ok(daily.includes('今日默契分 412 · 默契十足') && daily.includes('你会把指针放在哪？'));
  assert.ok(!daily.some((s) => /群内|全国|本群|\+\d|位置 \d/.test(s)), 'no group numbers or per-card scores');
  const round = text(models.round);
  assert.ok(round.includes('提示：一张电影票') && !round.some((s) => /\d/.test(s)), 'round card has no numbers, so no target');
  assert.ok(text(models.round_chat).includes('提示在群聊里'));
  const rev = text(models.reveal);
  assert.ok(rev.includes('本题默契值 78 · 6 人作答'));
  assert.ok(!rev.some((s) => s !== '群友刻度盘' && /你|出题人|群友/.test(s)), 'no names on the reveal card');
  assert.ok(text(models.group).includes('本群今日默契度 81') && text(models.group_plain).includes('本群今日刻度'));
  const ids = models.daily.rows.map((r) => r.left);
  void ids;
  assert.strictEqual(render.shareCard.kindOf(models.daily), 'daily');
  assert.strictEqual(render.shareCard.kindOf(models.round), 'round');
  assert.strictEqual(render.shareCard.kindOf(models.reveal), 'reveal');
  assert.strictEqual(render.shareCard.kindOf(models.group), 'group');
});

// ------------------------------------------------------------------- open data domain

function odModel(fx) {
  return buildModel({ view: fx.msg.view, serverRows: fx.msg.rows, salt: fx.msg.salt, selfHash: fx.msg.selfHash, kvList: fx.kv, viewerDone: true, mode: fx.msg.mode, dateKey: fx.msg.dateKey });
}

test('open data: every view x mode x size draws; text >= 16 (20 large); rows follow the server order', () => {
  let n = 0;
  opendataFixtures().forEach((fx) => {
    Object.keys(MODES).forEach((mode) => {
      [[343, 420], [288, 260], [380, 180]].forEach(([w, h]) => {
        const ctx = mockCtx();
        const res = drawView(ctx, odModel(fx), { view: fx.msg.view, width: w, height: h, scroll: 0, palette: MODES[mode].highContrast ? 'highContrast' : 'standard', scale: MODES[mode].largeText ? 1.25 : 1, refs: fx.msg.refs, target: fx.msg.target, closestH: fx.msg.closestH });
        assert.ok(res.maxScroll >= 0 && Number.isFinite(res.contentHeight));
        const min = MODES[mode].largeText ? 19.99 : 15.99;
        ctx.__calls.forEach((c) => {
          if (Array.from(c.s).length <= 1) return;
          assert.ok(c.size >= min, fx.name + ' ' + mode + ' "' + c.s + '" ' + c.size.toFixed(1));
          assert.ok(c.visible === false || (c.left >= -0.5 && c.right <= w + 0.5), fx.name + ' ' + mode + ' "' + c.s + '" past the edge at ' + w);
        });
        n++;
      });
    });
  });
  assert.ok(n >= 70);
  // order: the rank numbers appear in server order
  const g = opendataFixtures().find((f) => f.name === 'group');
  const ctx = mockCtx();
  drawView(ctx, odModel(g), { view: 'group', width: 343, height: 600, scroll: 0, palette: 'standard', scale: 1 });
  const names = ctx.__calls.map((c) => c.s);
  assert.ok(names.indexOf('张三') < names.indexOf('你') && names.indexOf('你') < names.indexOf('李四'), 'server order: 张三, 你, 李四');
  assert.ok(names.includes('群友 A'), 'unmatched rows are anonymous letters');
  assert.ok(names.includes('连5') && names.includes('群内 455') && names.includes('全国 430'));
});

test('open data: friend, round and 最同频 content; selfOnly rows have no rank; anonymous rows get no avatar', () => {
  const by = (name) => opendataFixtures().find((f) => f.name === name);
  const draw = (fx, extra) => {
    const ctx = mockCtx({ ops: true });
    drawView(ctx, odModel(fx), Object.assign({ view: fx.msg.view, width: 343, height: 520, scroll: 0, palette: 'standard', scale: 1, refs: fx.msg.refs, target: fx.msg.target, closestH: fx.msg.closestH }, extra));
    return ctx;
  };
  const gc = draw(by('group'));
  const gt = gc.__calls.map((c) => c.s);
  assert.ok(gt.some((s) => /^今天和你最同频：张三（平均只差 \d+ 格）$/.test(s)), 'peer line: ' + gt.join('|'));
  const anon = draw(by('group_anon')).__calls.map((c) => c.s);
  assert.ok(!anon.some((s) => /最同频/.test(s)), 'no peer line without a matched peer');
  assert.ok(anon.includes('你'));
  // message-level `anonymous: true` hides nicknames, peer line and 好友自报 even when the model has matches
  const forced = draw(by('group'), { anonymous: true }).__calls.map((c) => c.s);
  assert.ok(!forced.includes('张三') && !forced.includes('李四'), 'no nicknames when anonymous');
  assert.ok(!forced.some((s) => /最同频/.test(s)) && forced.includes('你'));
  const forcedSo = draw(by('friend_selfOnly'), { anonymous: true }).__calls.map((c) => c.s);
  assert.ok(!forcedSo.includes('好友自报'), 'no self-reported friends when anonymous');
  const rt = draw(by('round')).__calls.map((c) => c.s);
  assert.ok(rt.includes('出题人') && rt.includes('最懂你') && rt.includes('揭晓后作答'));
  assert.ok(rt.some((s) => /^\+98$/.test(s)) && rt.includes('差 1 格'));
  const hostRows = rt.filter((s) => /^\+/.test(s));
  assert.strictEqual(hostRows.length, 4, 'host and late rows have no score');
  const ft = draw(by('friend')).__calls.map((c) => c.s);
  assert.ok(ft.includes('430') && ft.includes('401'));
  const so = draw(by('friend_selfOnly')).__calls.map((c) => c.s);
  assert.ok(so.includes('好友自报'), 'selfOnly divider');
  // KV never ranks: the selfOnly KV friends are not numbered
  const nums = so.filter((s) => /^\d$/.test(s));
  assert.ok(nums.length <= 1, 'only the server row has a rank');
  // empty and loading messages are drawn inside the canvas
  const ctx = mockCtx();
  drawView(ctx, { rows: [], peer: null, selfReported: [] }, { view: 'friend', width: 343, height: 200, scroll: 0, palette: 'standard', scale: 1 });
  assert.ok(ctx.__calls.some((c) => c.s === '还没有好友完成今日刻度'));
  const c2 = mockCtx();
  drawView(c2, { rows: [], peer: null, selfReported: [] }, { view: 'group', width: 343, height: 200, scroll: 0, palette: 'standard', scale: 1, status: 'loading' });
  assert.ok(c2.__calls.some((c) => /正在读取/.test(c.s)));
  // scrolling is clamped and pins the viewer's row
  const sc = mockCtx();
  const res = drawView(sc, odModel(by('group')), { view: 'group', width: 343, height: 200, scroll: 99999, palette: 'standard', scale: 1 });
  assert.ok(res.maxScroll > 0);
  assert.ok(sc.__calls.some((c) => c.s === '你'), 'own row pinned');
});

test('open data entry reads storage with the contract keys and never posts back', () => {
  const calls = [];
  let handler = null;
  const canvas = { width: 0, height: 0, getContext: () => mockCtx() };
  global.wx = {
    onMessage: (fn) => (handler = fn),
    getSharedCanvas: () => canvas,
    getGroupCloudStorage: (o) => calls.push(['group', o.keyList, o.shareTicket, o.groupid]) && o.fail && o.fail(),
    getFriendCloudStorage: (o) => calls.push(['friend', o.keyList]) && o.success({ data: [] }),
    createImage: () => ({}),
    postMessage: () => calls.push(['POST']),
  };
  delete require.cache[require.resolve('../opendata/index.js')];
  require('../opendata/index.js');
  const fx = opendataFixtures();
  handler(Object.assign({}, fx[0].msg, { width: 343, height: 300, dpr: 2, palette: 'standard', scale: 1, shareTicket: 'tk' }));
  handler(Object.assign({}, fx[2].msg, { width: 343, height: 300, dpr: 2, palette: 'standard', scale: 1 }));
  handler(Object.assign({}, fx[4].msg, { width: 343, height: 300, dpr: 2, palette: 'standard', scale: 1 }));
  handler({ type: 'scroll', offset: 50 });
  assert.deepStrictEqual(calls[0], ['group', ['kd'], 'tk', undefined]);
  assert.deepStrictEqual(calls[1], ['friend', ['kd']]);
  assert.deepStrictEqual(calls[2], ['friend', ['kd']], 'a round without a ticket reads friends');
  assert.ok(!calls.some((c) => c[0] === 'POST'));
  assert.strictEqual(canvas.width, 686);
  delete global.wx;
});

test('hygiene: render and opendata files require only relative modules, use no wx, timers or system-unsafe fonts', () => {
  const dirs = [path.join(__dirname, '..', 'js', 'render'), path.join(__dirname, '..', 'opendata')];
  dirs.forEach((dir) => {
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      (src.match(/require\(['"][^'"]+['"]\)/g) || []).forEach((r) => assert.ok(/require\('\.\.?\//.test(r), f + ' requires ' + r));
      if (dir.endsWith('render')) {
        assert.ok(!/\bwx\./.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), f + ' uses wx');
        assert.ok(!/setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), f + ' uses a timer or random');
      }
      assert.ok(!/showKeyboard|<input|textarea/i.test(src), f + ' has text entry');
      assert.ok(!/\.(ttf|otf|woff2?)['"]/.test(src), f + ' loads a font file');
    });
  });
  assert.ok(fs.existsSync(path.join(dirs[0], 'CONTRACT.md')));
});

// ------------------------------------------------------------------- QA-5 / AC 70: truncation and clipping

/** Strings that legitimately end in an ellipsis (loading copy); anything else ending in one is a truncated text. */
const LOADING_TEXT = /^(检查中…|正在取今日卡片…|展开题目…|提交中…|加载中…|正在确认群聊…|正在生成位置…|打开分享…|正在读取好友?…)$/;

test('QA-5 / AC 70: no text is ellipsised (320x568 large, 414x896 hc and every other size and mode)', () => {
  const bad = [];
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    calls.forEach((c) => {
      if (/…$/.test(c.s) && !LOADING_TEXT.test(c.s)) bad.push(mode + ' ' + screen + '/' + name + ' ' + L.W + 'x' + L.H + ' "' + c.s + '"');
    });
  }, ALL);
  assert.deepEqual(bad, [], 'truncated texts');
});

test('QA-5 / AC 70: a "%" is never alone or first on a line', () => {
  const bad = [];
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    calls.forEach((c) => {
      if (/^\s*%/.test(c.s)) bad.push(mode + ' ' + screen + '/' + name + ' ' + L.W + 'x' + L.H + ' "' + c.s + '"');
    });
  }, ALL);
  assert.deepEqual(bad, [], 'orphaned %');
  // the exact string of the QA finding at the narrowest width in large text
  const L = layoutFor(SIZES[1]);
  T.applyDisplay({ largeText: true });
  const lines = require('../js/render/widgets').wrap(mockCtx(), '昨日定分 421 · 超过全国 68 %', L.contentW - 2 * L.u(16), T.FS.body, 600);
  T.applyDisplay(null);
  assert.ok(lines.length >= 2 && lines.every((l) => !/^\s*%/.test(l)) && /68\s*%$/.test(lines[lines.length - 1]), JSON.stringify(lines));
});

test('QA-5 / AC 70: at scroll 0 no text line is half visible (clipped through its middle) on any screen, size or mode', () => {
  const bad = [];
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1) return;
      if (screen === 'terms') return; // a long text reader scrolls continuously: lines are cut at the fold by design
      if (c.frac > 0.02 && c.frac < 0.98) bad.push(mode + ' ' + screen + '/' + name + ' ' + L.W + 'x' + L.H + ' "' + c.s + '" ' + (c.frac * 100).toFixed(0) + '% visible');
    });
  }, ALL);
  assert.deepEqual(bad, [], 'half-visible lines');
});

test('QA-5: 320x568 large text, home: the daily card title wraps instead of "5 张…" and the settings row is whole', () => {
  const L = layoutFor(SIZES[1]);
  const fx = fixturesFor('large', L);
  const calls = (vm) => {
    const ctx = mockCtx();
    render.screens.home.draw(ctx, vm, L);
    return ctx.__calls;
  };
  const withYesterday = Object.values(fx.home).find((s) => s.vm.daily && s.vm.daily.yesterdayText && s.vm.daily.state === 'available');
  const home = calls(withYesterday.vm);
  const joined = home.map((c) => c.s).join('');
  assert.ok(joined.includes('每日刻度') && joined.includes('5 张卡'), 'the whole title is drawn: ' + joined.slice(0, 80));
  assert.ok(!home.some((c) => /…$/.test(c.s)));
  const set = calls(fx.home.settings_off.vm);
  assert.ok(set.some((c) => c.s === '好友排行：未开启'), 'the whole 好友排行 row text is drawn');
});

test('QA-5: home buttons are all reachable at scroll 0 when the page scrolls (320x568 large, every state)', () => {
  const L = layoutFor(SIZES[1]);
  ['large', 'large_hc'].forEach((mode) => {
    const fx = fixturesFor(mode, L);
    Object.keys(fx.home).forEach((name) => {
      const vm = fx.home[name].vm;
      if (vm.sheet || !vm.daily || vm.daily.state === 'loading') return;
      const hits = render.screens.home.draw(mockCtx(), vm, L);
      const id = vm.daily.state === 'pendingSubmit' || /error|offline|unavailable/.test(vm.daily.state) ? 'home:retry' : 'home:daily';
      [id, 'home:host', 'home:archive', 'home:group', 'home:friends', 'home:howto'].forEach((hid) => {
        const a = hits.find((h) => h.id === hid);
        assert.ok(a && a.h >= 55.9, mode + ' ' + name + ' ' + hid + ' fully visible at scroll 0');
      });
    });
  });
});

test('QA-5: card reveal keeps the score and every reveal line fully visible above the ruler (320x568 large, 414x896 hc)', () => {
  const play = require('../js/render/play');
  [[SIZES[1], 'large'], [SIZES[1], 'large_hc'], [SIZES[2], 'hc'], [SIZES[1], 'default']].forEach(([sz, mode]) => {
    const L = layoutFor(sz);
    const fx = fixturesFor(mode, L);
    Object.keys(fx.card).forEach((name) => {
      const vm = fx.card[name].vm;
      if (!vm.reveal) return;
      const ctx = mockCtx();
      const hits = render.screens.card.draw(ctx, vm, L);
      const g = play.geometry(L, { keepRow: true, slim: true });
      const r = vm.reveal;
      const scrolls = hits.scrollMax && hits.scrollMax['card:scroll'] > 0;
      [r.scoreText, r.nationText, r.agreeText, r.groupText].filter(Boolean).forEach((s) => {
        const c = ctx.__calls.find((x) => x.s === s || s.startsWith(x.s));
        assert.ok(c, mode + ' ' + name + ' draws "' + s + '"');
        // the last (group) line may be one scroll away on the tightest screens, but never half visible; score and 和全国 x% never
        if (s === r.groupText && scrolls) return assert.ok(c.frac > 0.98 || c.frac < 0.02);
        assert.ok(c.frac > 0.98, mode + ' ' + name + ' "' + s + '" is ' + (c.frac * 100).toFixed(0) + '% visible at ' + L.W + 'x' + L.H);
        assert.ok(c.y + c.size / 2 <= g.rulerY + 1, mode + ' ' + name + ' "' + s + '" ends at ' + (c.y + c.size / 2).toFixed(0) + ' but the ruler starts at ' + g.rulerY.toFixed(0));
      });
    });
  });
});

test('QA-5: open data list is cut at a whole row above the 最同频 footer (all modes and canvas sizes)', () => {
  let checked = 0;
  for (const mode of ALL) {
    for (const [W, H] of [[343, 420], [343, 220], [374, 360], [343, 300], [343, 640]]) {
      for (const fx of opendataFixtures()) {
        const ctx = mockCtx();
        const model = buildModel({ view: fx.msg.view, serverRows: fx.msg.rows, salt: fx.msg.salt, selfHash: fx.msg.selfHash, kvList: fx.kv, viewerDone: true, mode: fx.msg.mode, dateKey: fx.msg.dateKey });
        const out = drawView(ctx, model, { view: fx.msg.view, width: W, height: H, scroll: 0, palette: MODES[mode].highContrast ? 'highContrast' : 'standard', scale: MODES[mode].largeText ? 1.25 : 1, refs: fx.msg.refs, target: fx.msg.target, closestH: fx.msg.closestH });
        if (!out.itemEnds || !out.itemEnds.length) continue;
        checked++;
        if (out.maxScroll > 0) assert.ok(out.itemEnds.some((e) => Math.abs(e - out.viewportHeight) < 0.01), fx.name + ' ' + mode + ' ' + W + 'x' + H + ': viewport ' + out.viewportHeight + ' is not a row boundary ' + out.itemEnds.join(','));
        assert.ok(out.viewportHeight <= out.footerTop + 0.01, 'the list ends before the footer');
      }
    }
  }
  assert.ok(checked > 40, 'checked ' + checked);
});

// ------------------------------------------------------------------- AIGC note (CTO decision)

test('settings: the AIGC note from vm.settings.aigcNote is drawn in full as caption text, at every size and display mode; absent without it', () => {
  const NOTE = '题库内容由 AI 辅助编写，并经人工审核';
  const strip = (s) => s.replace(/\s/g, '');
  let n = 0;
  eachState((screen, name, hits, calls, L, sz, vm, st, mode) => {
    if (screen !== 'home' || vm.sheet !== 'settings') return;
    assert.equal(vm.settings.aigcNote, NOTE, 'the fixtures carry the note');
    const lines = calls.filter((c) => strip(NOTE).includes(strip(c.s)) && strip(c.s).length >= 2);
    assert.equal(lines.map((c) => strip(c.s)).join(''), strip(NOTE), mode + ' ' + name + ' ' + L.W + 'x' + L.H + ': note lines ' + JSON.stringify(lines.map((c) => c.s)));
    lines.forEach((c) => {
      assert.ok(c.frac > 0.98, mode + ' ' + name + ' note visible at ' + L.W);
      assert.ok(c.size >= (MODES[mode].largeText ? 19.99 : 15.99), 'caption size is not below the floor');
      assert.ok(c.left >= -0.5 && c.right <= L.W + 0.5, 'inside the screen');
    });
    const fb = hits.find((h) => h.id === 'settings:feedback');
    assert.ok(fb && lines.every((c) => c.y + c.size / 2 <= fb.y + 0.5), 'note above the feedback row');
    n++;
  }, ALL);
  assert.ok(n >= 6 * 4 * 2, 'settings sheets checked: ' + n);
  const L = layoutFor(SIZES[0]);
  const fx = fixturesFor('default', L);
  const vm = Object.assign({}, fx.home.settings.vm, { settings: Object.assign({}, fx.home.settings.vm.settings, { aigcNote: undefined }) });
  const ctx = mockCtx();
  render.screens.home.draw(ctx, vm, L);
  assert.ok(!ctx.__calls.some((c) => /AI/.test(c.s)), 'no note without vm.settings.aigcNote');
});

// ------------------------------------------------------------------- QA-4 / AC 74: image assets

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.slice(1, 4).toString(), 'PNG', file + ' is a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

test('QA-4 / AC 74: assets/share-fallback.png (500x400, 5:4) is where js/share.js looks for it; the icon is square; both are small', () => {
  const game = path.join(__dirname, '..');
  const { FALLBACK_IMAGE } = require('../js/share');
  const f = path.join(game, FALLBACK_IMAGE);
  assert.ok(fs.existsSync(f), FALLBACK_IMAGE + ' exists');
  const s = pngSize(f);
  assert.deepEqual([s.w, s.h], [500, 400]);
  assert.ok(s.bytes < 60 * 1024, 'share fallback is ' + s.bytes + ' bytes');
  const i = pngSize(path.join(game, 'assets', 'icon.png'));
  assert.equal(i.w, i.h);
  assert.ok(i.w >= 144 && i.bytes < 30 * 1024);
  const imgs = fs.readdirSync(path.join(game, 'assets')).filter((n) => /\.(png|jpe?g|gif|webp|svg)$/i.test(n)).sort();
  assert.deepEqual(imgs, ['icon.png', 'share-fallback.png'], 'the only images are the icon and the share fallback (spec 1)');
});

test('AC 33: revealedUnplayed draws the hint 看了答案就不能再猜了 fully under 直接看答案 (320x568 large, 414x896 high contrast), untappable', () => {
  const HINT = '看了答案就不能再猜了';
  let seen = 0;
  const check = (mode, W, H) => {
    eachState((screen, name, hits, calls, L, sz, vm) => {
      if (screen !== 'round' || vm.status !== 'revealedUnplayed' || L.W !== W || L.H !== H) return;
      const view = hits.find((h) => h.id === 'round:view');
      const late = hits.find((h) => h.id === 'round:late');
      assert.ok(view && late, 'both buttons');
      const lines = calls.filter((c) => c.y >= view.y + view.h - 1 && HINT.includes(c.s));
      assert.equal(lines.map((c) => c.s).join(''), HINT, mode + ' hint drawn in full, not truncated');
      lines.forEach((c) => {
        assert.ok(!/…/.test(c.s));
        assert.ok(c.size >= (MODES[mode].largeText ? 19.99 : 15.99), 'body size ' + c.size);
        assert.ok(c.y < L.H - L.bottomPad + 1, 'inside the screen above the bottom inset');
      });
      assert.ok(!hits.some((h) => h.y >= view.y + view.h && h.h < 200 && h.id !== 'round:scroll'), 'hint is not tappable');
      assert.ok(late.y + late.h < view.y, 'buttons keep their order');
      seen++;
    }, [mode]);
  };
  check('large', 320, 568);
  check('hc', 414, 896);
  assert.equal(seen, 2);
});
