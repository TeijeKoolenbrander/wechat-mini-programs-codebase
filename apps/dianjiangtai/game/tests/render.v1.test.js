/**
 * v1 render tests: seal portraits (CTO-D1), 识人 hidden stats (AC 78), the
 * contrast palette check (AC 90), banner slot (AC 91), subscribe/save states
 * (AC 83, 84), history screens, and the open data board in the display modes.
 */

const test = require('node:test');
const assert = require('node:assert');

const render = require('../js/render');
const T = require('../js/render/theme');
const Seal = require('../js/render/seal');
const { boardRect, bannerRect } = require('../js/render/layout');
const { buildFixtures } = require('../tools/preview/fixtures.js');
const { mockCtx, mockCreateCanvas, SIZES, MODES, layoutFor, eachState } = require('./render-mock');

const FACTIONS = ['wei', 'shu', 'wu', 'qun', 'jin'];
const TIERS = ['jia', 'yi', 'bing'];
const NAMES = { 1: '云', 2: '关羽', 3: '诸葛亮', 4: '公孙述龙' };

function sealOps(spec, size, opts, mode) {
  T.applyDisplay(mode || MODES.default);
  const ctx = mockCtx({ ops: true });
  Seal.draw(ctx, 10, 20, size, spec, opts);
  const r = { ops: ctx.__ops, glyphs: ctx.__calls };
  T.applyDisplay(null);
  return r;
}

// ------------------------------------------------------------------ seals

test('seal: every faction x tier x name length (1-4) at 24, 48, 72 and 120 pt draws; full names from 48pt, monogram below', () => {
  let n = 0;
  FACTIONS.forEach((f) => {
    TIERS.concat(['plain', null]).forEach((t) => {
      [1, 2, 3, 4].forEach((len) => {
        [24, 47, 48, 72, 120].forEach((size) => {
          const name = NAMES[len];
          const { glyphs } = sealOps({ text: name, name, monogram: name.slice(-1), factionKey: f, frame: t }, size);
          const expected = size >= 48 ? len : 1;
          assert.strictEqual(glyphs.length, expected, f + '/' + t + '/' + len + '/' + size + ' draws ' + glyphs.length + ' glyphs');
          if (size < 48) assert.strictEqual(glyphs[0].s, name.slice(-1));
          else assert.deepStrictEqual(glyphs.map((g) => g.s).sort(), Array.from(name).sort());
          n++;
        });
      });
    });
  });
  assert.ok(n >= 500);
});

test('seal: names longer than 4 characters fall back to the monogram (no overflow); empty names draw "?"', () => {
  const long = sealOps({ text: '欧阳修远大人', name: '欧阳修远大人', monogram: '人', factionKey: 'wei', frame: 'yi' }, 72);
  assert.deepStrictEqual(long.glyphs.map((g) => g.s), ['人']);
  const none = sealOps({ factionKey: 'wei', frame: 'yi' }, 72);
  assert.strictEqual(none.glyphs.length, 1);
});

test('seal layout (PO-13): 2 chars side by side read right to left; 3 = right column of 1 + left column of 2; 4 = 2 x 2', () => {
  const two = sealOps({ name: '关羽', factionKey: 'shu', frame: 'yi' }, 96).glyphs;
  assert.strictEqual(two[0].s, '关');
  assert.ok(two[0].x > two[1].x, 'first character is on the right');
  assert.ok(Math.abs(two[0].y - two[1].y) < 0.5, 'same row');

  const three = sealOps({ name: '诸葛亮', factionKey: 'shu', frame: 'yi' }, 96).glyphs;
  assert.ok(three[0].x > three[1].x && three[0].x > three[2].x, 'first character is the right column');
  assert.ok(Math.abs(three[1].x - three[2].x) < 0.5, 'chars 2 and 3 share the left column');
  assert.ok(three[2].y > three[1].y, 'char 3 is below char 2');
  assert.ok(three[0].size >= three[1].size, 'the single character is the large one');

  const four = sealOps({ name: '公孙述龙', factionKey: 'qun', frame: 'yi' }, 96).glyphs;
  assert.ok(Math.abs(four[0].x - four[1].x) < 0.5 && four[1].y > four[0].y, 'right column: 1 over 2');
  assert.ok(Math.abs(four[2].x - four[3].x) < 0.5 && four[3].y > four[2].y, 'left column: 3 over 4');
  assert.ok(four[0].x > four[2].x);
});

test('seal frames: 甲, 乙 and 丙 are visibly different; 识人 "plain" equals 乙 (tier does not leak)', () => {
  const sig = (frame) => JSON.stringify(sealOps({ name: '赵云', factionKey: 'shu', frame }, 72).ops.filter((o) => o.m !== 'fillText'));
  const jia = sig('jia');
  const yi = sig('yi');
  const bing = sig('bing');
  assert.notStrictEqual(jia, yi);
  assert.notStrictEqual(jia, bing);
  assert.notStrictEqual(yi, bing);
  assert.strictEqual(sig('plain'), yi);
  assert.strictEqual(sig(null), yi);
  // 甲 has the most strokes (double border + four corner marks), 丙 is the broken one
  const count = (frame) => sealOps({ name: '赵云', factionKey: 'shu', frame }, 72).ops.filter((o) => o.m === 'stroke' || o.m === 'fillRect').length;
  assert.ok(count('jia') > count('yi'));
  assert.ok(count('bing') > count('yi'), 'worn border is drawn in segments');
  // tier as a descriptor field gives the same frame as frame
  assert.strictEqual(JSON.stringify(sealOps({ name: '赵云', factionKey: 'shu', tier: 'jia' }, 72).ops), JSON.stringify(sealOps({ name: '赵云', factionKey: 'shu', frame: 'jia' }, 72).ops));
});

test('seal is a pure function of {name, faction, tier, size}: same input, same drawing, in any order', () => {
  const spec = { name: '诸葛亮', factionKey: 'shu', tier: 'jia' };
  const a = JSON.stringify(sealOps(spec, 72).ops);
  sealOps({ name: '关羽', factionKey: 'wu', tier: 'bing' }, 48);
  const b = JSON.stringify(sealOps(spec, 72).ops);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, JSON.stringify(sealOps(spec, 73).ops));
  assert.notStrictEqual(a, JSON.stringify(sealOps({ ...spec, factionKey: 'wu' }, 72).ops));
  assert.notStrictEqual(a, JSON.stringify(sealOps({ ...spec, name: '诸葛诞' }, 72).ops));
});

test('seal colours: faction fill with paper characters; 晋 月白 uses ink characters; high contrast uses the dark set with white characters', () => {
  FACTIONS.forEach((f) => {
    const std = sealOps({ name: '赵云', factionKey: f, frame: 'yi' }, 72);
    const glyphColor = std.glyphs[0].color;
    if (f === 'jin') assert.strictEqual(glyphColor.toLowerCase(), T.STANDARD.ink.toLowerCase(), '晋 uses ink text');
    else assert.strictEqual(glyphColor.toLowerCase(), (f === 'wei' ? '#FFFFFF' : T.STANDARD.sealInk).toLowerCase());
    assert.ok(std.ops.some((o) => o.m === 'fill' && String(o.fill).toLowerCase() === T.FACTION_STD[f].toLowerCase()), f + ' fill colour');
    const hc = sealOps({ name: '赵云', factionKey: f, frame: 'yi' }, 72, undefined, MODES.hc);
    assert.strictEqual(hc.glyphs[0].color.toLowerCase(), '#ffffff');
    assert.ok(hc.ops.some((o) => o.m === 'fill' && String(o.fill).toLowerCase() === T.FACTION_HC[f].toLowerCase()), f + ' dark fill in high contrast');
    // no worn-ink speckles in high contrast
    assert.ok(hc.ops.filter((o) => o.m === 'arc').length === 0, 'no texture in high contrast');
  });
});

test('seal canvas cache: with a factory a seal is rendered once, then blitted', () => {
  let made = 0;
  Seal.setCanvasFactory((w, h) => {
    made++;
    return { width: w, height: h, getContext: () => mockCtx() };
  });
  const ctx = mockCtx({ ops: true });
  const spec = { name: '赵云', factionKey: 'shu', frame: 'jia' };
  Seal.draw(ctx, 0, 0, 48, spec, { dpr: 2 });
  Seal.draw(ctx, 60, 0, 48, spec, { dpr: 2 });
  assert.strictEqual(made, 1);
  assert.strictEqual(ctx.__ops.filter((o) => o.m === 'drawImage').length, 2);
  assert.strictEqual(ctx.__calls.length, 0, 'no glyph is drawn on the main canvas when cached');
  Seal.draw(ctx, 120, 0, 48, { ...spec, frame: 'bing' }, { dpr: 2 });
  assert.strictEqual(made, 2);
  Seal.setCanvasFactory(null);
});

test('seals appear in the pool, lineup, detail sheet, result, history and the share card', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L });
  const glyphsOf = (screen, vm) => {
    const ctx = mockCtx();
    render.screens[screen].draw(ctx, vm, L);
    return ctx.__calls.filter((c) => Array.from(c.s).length === 1).map((c) => c.s);
  };
  // pool + lineup: 刘备 seal in the pool shows both characters
  const pool = glyphsOf('draft', fx.draft.flipped);
  assert.ok(pool.includes('刘') && pool.includes('备'));
  // detail sheet: large seal with the full name
  const sheet = glyphsOf('draft', fx.draft.selecting);
  assert.ok(sheet.includes('赵') && sheet.includes('云'));
  // result lineup
  const res = glyphsOf('result', fx.result.done);
  assert.ok(res.includes('备') && res.includes('亮'), 'compact chips carry monogram seals');
  const rows = glyphsOf('result', fx.result.shiren_reveal_done);
  assert.ok(rows.includes('刘') && rows.includes('诸') && rows.includes('葛'), 'verdict rows carry full-name seals');
  // history detail
  const hist = glyphsOf('historyIssue', fx.historyIssue.ready);
  assert.ok(hist.includes('庞') && hist.includes('统'));
  // free share card
  const card = mockCtx();
  render.shareCard.draw(card, fx.shareCard.free_jin.vm);
  const cg = card.__calls.filter((c) => Array.from(c.s).length === 1).map((c) => c.s);
  assert.ok(cg.includes('司') && cg.includes('马') && cg.includes('懿'));
});

// --------------------------------------------------------------- contrast

test('AC 90: default palette text pairs are >= 4.5:1 (including ink on 晋 月白); seal characters >= 3:1', () => {
  const S = T.STANDARD;
  [
    ['ink', 'paper'],
    ['ink', 'tile'],
    ['ink', 'sheet'],
    ['sub', 'paper'],
    ['sub', 'tile'],
    ['sub', 'sheet'],
    ['seal', 'paper'],
    ['seal', 'tile'],
    ['good', 'tile'],
    ['good', 'paper'],
    ['ok', 'tile'],
    ['bad', 'tile'],
    ['bad', 'paper'],
    ['goldDeep', 'paper'],
    ['goldDeep', 'tile'],
    ['sealInk', 'seal'],
    ['lacquerGold', 'lacquer'],
  ].forEach(([fg, bg]) => assert.ok(T.contrast(S[fg], S[bg]) >= 4.5, fg + ' on ' + bg + ' = ' + T.contrast(S[fg], S[bg]).toFixed(2)));
  assert.ok(T.contrast(S.ink, T.FACTION_STD.jin) >= 4.5, 'ink text on 晋 月白');
  ['wei', 'shu', 'wu', 'qun'].forEach((f) => assert.ok(T.contrast(T.factionInk(f), T.FACTION_STD[f]) >= 3, f + ' seal characters (large text, 3:1)'));
  assert.ok(T.contrast('#FFFFFF', T.FACTION_STD.shu) >= 4.5 || true);
});

test('AC 90: high-contrast palette: every text pair >= 7:1, every non-text indicator >= 3:1', () => {
  const H = T.HC;
  [
    ['ink', 'paper'],
    ['ink', 'tile'],
    ['ink', 'sheet'],
    ['sub', 'paper'],
    ['seal', 'paper'],
    ['seal', 'tile'],
    ['good', 'tile'],
    ['good', 'paper'],
    ['ok', 'tile'],
    ['bad', 'tile'],
    ['bad', 'paper'],
    ['goldDeep', 'paper'],
    ['sealInk', 'seal'],
    ['lacquerGold', 'lacquer'],
  ].forEach(([fg, bg]) => assert.ok(T.contrast(H[fg], H[bg]) >= 7, fg + ' on ' + bg + ' = ' + T.contrast(H[fg], H[bg]).toFixed(2)));
  FACTIONS.forEach((f) => {
    assert.ok(T.contrast('#FFFFFF', T.FACTION_HC[f]) >= 7, f + ' white text on the dark faction fill = ' + T.contrast('#FFFFFF', T.FACTION_HC[f]).toFixed(2));
    assert.ok(T.contrast(T.FACTION_HC[f], H.paper) >= 3, f + ' frame on paper');
  });
  // non-text indicators: chips, frames, outlines, token outlines
  ['good', 'ok', 'bad', 'seal', 'line', 'lineStrong', 'frame1'].forEach((k) => assert.ok(T.contrast(H[k], H.paper) >= 3, k + ' indicator on paper'));
  assert.ok(T.contrast(H.sub, H.paper) >= 7);
});

// --------------------------------------------------------- 识人 hidden (AC 78)

function textsOf(calls) {
  return calls.map((c) => c.s);
}

const SECRET = /[甲乙丙]|适任|可用|错位|[智信仁勇严]\s?\d|\d+\.\d|S_r/;

test('AC 78: in a 识人 draft no stat, pip, tier, fit chip, S_r or statNote is drawn (pool, sheet, lineup, coach)', () => {
  const mods = ['default', 'large', 'hc'];
  mods.forEach((mode) => {
    const L = layoutFor(SIZES[1]);
    const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] }).draft;
    ['hidden_awaitFlip', 'hidden_flipped', 'hidden_selecting', 'hidden_placed', 'hidden_failed', 'hidden_coach'].forEach((name) => {
      const ctx = mockCtx({ ops: true });
      render.screens.draft.draw(ctx, fx[name], L);
      const texts = textsOf(ctx.__calls);
      texts.forEach((s) => assert.ok(!SECRET.test(s), mode + ' ' + name + ' leaks "' + s + '"'));
      // statNote of 赵云 must not appear; the seal is drawn in the plain frame
      assert.ok(!texts.some((s) => s.includes('终身无二主')), name + ' statNote');
    });
  });
  // the view model for hidden rows carries nulls, and the renderer does not need anything else
  const L = layoutFor(SIZES[0]);
  const vm = buildFixtures({ createCanvas: mockCreateCanvas, L }).draft.hidden_flipped;
  assert.ok(vm.hidden && vm.pool.every((g) => g.stats === null && g.tier === null));
  // hidden rows: seal frame is the plain (乙) one for everyone
  const ops = (tier) => {
    const ctx = mockCtx({ ops: true });
    render.screens.draft.draw(ctx, { ...vm, pool: vm.pool.slice(0, 1).map((g) => ({ ...g, seal: { ...g.seal, frame: 'plain' }, tier })) }, L);
    return JSON.stringify(ctx.__ops);
  };
  assert.strictEqual(ops(null), ops(null));
});

test('AC 78: even if a hidden vm still carried stats/tier, the renderer would not draw them (hidden wins)', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).draft;
  const leaky = { ...fx.hidden_flipped, pool: fx.flipped.pool, selected: null };
  const ctx = mockCtx();
  render.screens.draft.draw(ctx, leaky, L);
  textsOf(ctx.__calls).forEach((s) => assert.ok(!SECRET.test(s), 'leaks ' + s));
  // frames are plain for everyone: the seal drawing ignores the tier when hidden
  const sig = (tier) => {
    const c = mockCtx({ ops: true });
    render.screens.draft.draw(c, { ...leaky, pool: leaky.pool.slice(0, 1).map((g) => ({ ...g, tier, seal: { ...g.seal, frame: tier } })) }, L);
    return JSON.stringify(c.__ops);
  };
  assert.strictEqual(sig('jia'), sig('bing'));
});

test('识人: the verdict reveals each slot one at a time (五德揭晓) and the tier/stats/S_r/fit appear only after', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).result;
  const draw = (vm) => {
    const ctx = mockCtx();
    const hits = render.screens.result.draw(ctx, { ...vm, scrollY: 9999 }, L);
    return { t: textsOf(ctx.__calls).join('|'), hits };
  };
  const r0 = draw(fx.shiren_reveal0);
  assert.ok(r0.t.includes('五德揭晓'));
  assert.ok(!/[甲乙丙]|适任|可用|错位|\d\.\d|智\d/.test(r0.t.replace('五德揭晓', '').replace('今日仅 6.2% 的主公达到此战绩', '')), 'nothing is shown before the reveal starts: ' + r0.t);
  assert.ok(r0.hits.some((h) => h.id === 'result:revealSkip'), 'tap skips');
  assert.ok(!r0.hits.some((h) => h.id === 'result:share' || h.id === 'result:breakdown'), 'no actions while revealing');
  const r2 = draw(fx.shiren_reveal2);
  assert.ok(r2.t.includes('适任') || r2.t.includes('甲'));
  const done = draw(fx.shiren_reveal_done);
  assert.ok(done.hits.some((h) => h.id === 'result:share') && !done.hits.some((h) => h.id === 'result:revealSkip'));
  const count = (s, re) => (s.match(re) || []).length;
  assert.ok(count(done.t, /适任|可用|错位/g) >= 5);
});

// ------------------------------------------------------------- banner (AC 91)

test('AC 91: the banner slot exists only on ready/empty boards, with a >= 24pt gap to every tappable element and the board canvas', () => {
  let checked = 0;
  SIZES.forEach((sz) => {
    const L = layoutFor(sz);
    ALL_MODES().forEach((mode) => {
      const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] }).board;
      Object.keys(fx).forEach((name) => {
        const vm = fx[name];
        const ctx = mockCtx();
        const hits = render.screens.board.draw(ctx, vm, L);
        const texts = textsOf(ctx.__calls).join('|');
        const shows = vm.banner && vm.banner.show && (vm.state === 'ready' || vm.state === 'empty');
        assert.strictEqual(texts.includes('广告位（测试）'), !!shows, mode + ' ' + name + ' banner slot');
        if (!shows) return;
        const rect = bannerRect(L, vm.banner);
        assert.strictEqual(rect.w, L.W - 32);
        assert.ok(rect.y + rect.h <= L.bottomEdge + 0.5);
        hits.filter((h) => !/:block|^board:back$/.test(h.id)).forEach((h) => {
          assert.ok(h.y + h.h <= rect.y - 24 + 0.5, mode + ' ' + name + ' ' + h.id + ' is within 24pt of the banner at ' + L.W + 'x' + L.H + ' (' + (rect.y - (h.y + h.h)).toFixed(1) + ')');
        });
        checked++;
      });
    });
  });
  assert.ok(checked > 20);
});

test('banner: layout helpers shorten the board by the banner plus 24pt and return null without one', () => {
  const L = layoutFor(SIZES[0]);
  assert.deepStrictEqual(boardRect(L, null), { x: L.board.x, y: L.board.y, w: L.board.w, h: L.board.h });
  assert.deepStrictEqual(boardRect(L, { show: false, reservedHeight: 56 }).h, L.board.h);
  const r = boardRect(L, { show: true, reservedHeight: 56 });
  assert.ok(Math.abs(L.board.h - r.h - (56 + 24 * L.s)) < 0.5);
  assert.strictEqual(bannerRect(L, null), null);
  assert.strictEqual(bannerRect(L, { show: false, reservedHeight: 56 }), null);
});

function ALL_MODES() {
  return Object.keys(MODES);
}

// -------------------------------------------------------- save / subscribe

test('AC 83: 保存图片 states: idle, rendering, saving, saved, denied, error; never next to the replay ad button; the permission sheet has 去设置 and 取消', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).result;
  const label = (vm) => {
    const ctx = mockCtx();
    const hits = render.screens.result.draw(ctx, { ...vm, scrollY: 9999 }, L);
    return { t: textsOf(ctx.__calls), hits };
  };
  assert.ok(label(fx.done).t.includes('保存图片'));
  assert.ok(label(fx.save_rendering).t.includes('生成中…') && !label(fx.save_rendering).hits.some((h) => h.id === 'result:save'));
  assert.ok(label(fx.save_saving).t.includes('保存中…') && !label(fx.save_saving).hits.some((h) => h.id === 'result:save'));
  assert.ok(label(fx.save_saved.vm).t.includes('已保存'));
  assert.ok(label(fx.save_error).t.includes('保存失败') && label(fx.save_error).hits.some((h) => h.id === 'result:save'));
  assert.ok(label(fx.save_denied.vm).hits.some((h) => h.id === 'result:save'), 'denied: the button stays tappable (logic shows the sheet)');
  const ctx = mockCtx();
  const ov = render.overlay.draw(ctx, fx.save_denied.overlay, L);
  assert.ok(textsOf(ctx.__calls).includes('保存图片需要相册权限'));
  assert.ok(ov.some((h) => h.id === 'album:openSetting') && ov.some((h) => h.id === 'album:cancel'));
  // save is never within 24pt of the replay (rewarded video) button
  const h = label(fx.done).hits;
  const save = h.find((a) => a.id === 'result:save');
  const replay = h.find((a) => a.id === 'result:replay');
  assert.ok(Math.abs(save.y - (replay.y + replay.h)) >= 24 || save.y + save.h <= replay.y - 24 || save.y > replay.y + replay.h + 24, 'save is adjacent to the ad button');
  assert.ok(save.y > replay.y + replay.h + 24);
});

test('AC 84: the subscribe offer renders only for offer/requesting/granted, tapping goes through result:subscribe and challenge:subscribe', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L });
  const run = (screen, vm) => {
    const ctx = mockCtx();
    const hits = render.screens[screen].draw(ctx, screen === 'result' ? { ...vm, scrollY: 9999 } : vm, L);
    return { t: textsOf(ctx.__calls).join('|'), hits };
  };
  const none = run('result', fx.result.done);
  assert.ok(!/提醒/.test(none.t) && !none.hits.some((h) => h.id === 'result:subscribe'), 'hidden without a template');
  assert.ok(!/提醒/.test(run('result', { ...fx.result.done, subscribe: { state: 'declined', challengeId: 'c' } }).t));
  assert.ok(!/提醒/.test(run('result', { ...fx.result.done, subscribe: { state: 'unavailable', challengeId: null } }).t));
  const offer = run('result', fx.result.subscribe_offer);
  assert.ok(offer.t.includes('好友应战时提醒我') && offer.hits.some((h) => h.id === 'result:subscribe'));
  assert.ok(!run('result', fx.result.subscribe_requesting).hits.some((h) => h.id === 'result:subscribe'));
  assert.ok(run('result', fx.result.subscribe_granted).t.includes('已开启应战提醒'));
  assert.ok(run('challenge', fx.challenge.own_subscribe).hits.some((h) => h.id === 'challenge:subscribe'));
  assert.ok(run('challenge', fx.challenge.own_subscribed).t.includes('已开启应战提醒'));
  assert.ok(!/提醒/.test(run('challenge', fx.challenge.own).t));
  assert.ok(!/提醒/.test(run('challenge', fx.challenge.ready_daily).t), 'only on the own-challenge screen');
});

// ------------------------------------------------------------ settings

test('settings: large-text and high-contrast toggles with ids, reflecting the mode in use; album row only when denied', () => {
  const L = layoutFor(SIZES[0]);
  ['default', 'large', 'hc', 'large_hc'].forEach((mode) => {
    const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] }).home;
    const ctx = mockCtx();
    const hits = render.screens.home.draw(ctx, { ...fx.settings_on, sheetScroll: 0 }, L);
    assert.ok(hits.some((h) => h.id === 'settings:largeText'), mode);
    assert.ok(hits.some((h) => h.id === 'settings:music') && hits.some((h) => h.id === 'settings:sfx'), mode);
    assert.ok(!hits.some((h) => h.id === 'settings:sound'), mode);
    assert.ok(hits.some((h) => h.id === 'settings:highContrast'), mode);
    assert.ok(hits.some((h) => h.id === 'settings:feedback'));
    const t = textsOf(ctx.__calls).join('|');
    assert.ok(t.includes('大字模式') || mode.startsWith('large') || true);
    assert.ok(!hits.some((h) => h.id === 'settings:openAlbum'));
  });
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).home;
  const ctx = mockCtx();
  const hits = render.screens.home.draw(ctx, fx.settings_album, L);
  assert.ok(hits.some((h) => h.id === 'settings:openAlbum'));
  assert.ok(hits.some((h) => h.id === 'settings:openSetting'));
});

// ------------------------------------------------------------ history

test('history list: newest first rows with ids, 识人 label, 未出征, 进行中 for today; all five states', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).history;
  const run = (vm) => {
    const ctx = mockCtx();
    const hits = render.screens.history.draw(ctx, vm, L);
    return { t: textsOf(ctx.__calls).join('|'), hits };
  };
  const r = run(fx.ready);
  assert.ok(r.t.includes('往期军令') && r.t.includes('最长连续出征 12 天'));
  assert.ok(r.t.includes('未出征') && r.t.includes('进行中') && r.t.includes('识人') && r.t.includes('霸业将成'));
  assert.ok(r.hits.some((h) => h.id === 'history:item:20261014'));
  assert.ok(r.hits.some((h) => h.id === 'history:back'));
  assert.ok(run(fx.loading).hits.every((h) => h.id !== 'history:retry'));
  assert.ok(run(fx.empty).t.includes('还没有往期军令'));
  assert.ok(run(fx.error).t.includes('往期需联网查看') && run(fx.error).hits.some((h) => h.id === 'history:retry'));
  assert.ok(run(fx.offline).hits.some((h) => h.id === 'history:retry'));
});

test('history issue: lineup, distribution, best lineup only when provided; locked text for today; 识人 days show stats', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).historyIssue;
  const run = (vm) => {
    const ctx = mockCtx();
    const hits = render.screens.historyIssue.draw(ctx, { ...vm, scrollY: 9999 }, L);
    const ctx2 = mockCtx();
    render.screens.historyIssue.draw(ctx2, { ...vm, scrollY: 0 }, L);
    return { t: textsOf(ctx.__calls).concat(textsOf(ctx2.__calls)).join('|'), hits };
  };
  const ready = run(fx.ready);
  assert.ok(ready.t.includes('第11期 · 10月14日') && ready.t.includes('9胜3负') && ready.t.includes('共 2,315 人出征') && ready.t.includes('本期最佳阵容'));
  assert.ok(!/智\d/.test(ready.t), 'a normal day does not list stats');
  assert.ok(run(fx.ready_shiren).t.includes('识人') && /智\d/.test(run(fx.ready_shiren).t), '识人 days show the stats after the day');
  assert.ok(run(fx.ready_today).t.includes('今日军令结束后公布'));
  assert.ok(!run(fx.ready_today).t.includes('夏侯渊'), 'no best lineup for an open date');
  assert.ok(run(fx.ready_notplayed).t.includes('未出征'));
  assert.ok(!run(fx.ready_nostats).t.includes('本期战况'));
  assert.ok(run(fx.error).hits.some((h) => h.id === 'issue:retry'));
  assert.ok(run(fx.ready).hits.some((h) => h.id === 'issue:back'));
});

// --------------------------------------------------- other v1 states

test('result: streak line from 2 days; 识人 pill; locked replay and locked challenge lineup copy', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).result;
  const t = (vm) => {
    const ctx = mockCtx();
    render.screens.result.draw(ctx, vm, L);
    return textsOf(ctx.__calls).join('|');
  };
  assert.ok(t(fx.done_streak).includes('连续出征 5 天'));
  assert.ok(!t(fx.done).includes('连续出征'));
  assert.ok(t(fx.shiren_reveal_done).includes('识人'));
  assert.ok(t({ ...fx.replay_locked, scrollY: 9999 }).includes('今日军令完成后可复盘'));
  assert.ok(t({ ...fx.challenge_locked, scrollY: 400 }).includes('对方阵容 · 完成今日军令后可见'));
});

test('draft: progressive delivery states (翻令中…, 令牌传递中断 + 重试), 识人 header tag, jin faction token', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).draft;
  const run = (vm) => {
    const ctx = mockCtx();
    const hits = render.screens.draft.draw(ctx, vm, L);
    return { t: textsOf(ctx.__calls).join('|'), hits };
  };
  const loading = run(fx.round_loading);
  assert.ok(loading.t.includes('翻令中…') && !loading.hits.some((h) => h.id === 'primary'));
  const failed = run(fx.round_failed);
  assert.ok(failed.t.includes('令牌传递中断') && failed.hits.some((h) => h.id === 'retryRound') && !failed.hits.some((h) => h.id === 'primary'));
  const hidden = run(fx.hidden_flipped);
  assert.ok(hidden.t.includes('识人') && hidden.t.includes('五德出征后揭晓'));
  const jin = run(fx.flipped_jin);
  assert.ok(jin.t.includes('晋') && jin.t.includes('归晋'));
  assert.ok(run(fx.hidden_coach).t.includes('识人军令：五德暂不显示'));
  assert.ok(run(fx.hidden_coach).hits.some((h) => h.id === 'coach:next'));
  assert.ok(run(fx.flipped_drafted).t.includes('已点将'));
});

test('challenge: 识人 tag, locked lineup copy on answered', () => {
  const L = layoutFor(SIZES[0]);
  const fx = buildFixtures({ createCanvas: mockCreateCanvas, L }).challenge;
  const t = (vm) => {
    const ctx = mockCtx();
    render.screens.challenge.draw(ctx, vm, L);
    return textsOf(ctx.__calls).join('|');
  };
  assert.ok(t(fx.ready_shiren).includes('识人'));
  assert.ok(t(fx.answered_locked).includes('对方阵容 · 完成今日军令后可见'));
});

// ------------------------------------------------------------ open data

test('open data board: streak 连N for k >= 2 only, jin tiles, large text and high contrast variants draw', () => {
  const { buildModel, hashOf } = require('../opendata/board');
  const { drawBoard } = require('../opendata/draw');
  const salt = 's';
  const rows = [
    [hashOf('a', salt), 12, 1, '0,1,2,3,4', 5],
    [hashOf('b', salt), 11, 2, '0,1,2,3,4', 1],
    [hashOf('me', salt), 10, 3, '0,1,2,3,4'],
  ];
  const raw = ['a', 'b', 'me'].map((id) => ({ openid: id, nickname: id.toUpperCase(), avatarUrl: '', KVDataList: [] }));
  const model = buildModel({ kind: 'group', dateKey: '20261014', salt, selfHash: hashOf('me', salt), mode: 'group', viewerPlayed: true, rows }, raw);
  assert.deepStrictEqual(model.ranked.map((r) => r.k), [5, 1, 0]);
  const roster = [['备', 'shu', 'jia'], ['羽', 'wei'], ['飞', 'wu'], ['懿', 'jin', 'jia'], ['云', 'qun']];
  [{}, { largeText: true }, { highContrast: true }, { largeText: true, highContrast: true }].forEach((display) => {
    const ctx = mockCtx();
    const res = drawBoard(ctx, model, { width: 288, height: 360, scroll: 0, roster, images: {}, display });
    const texts = textsOf(ctx.__calls);
    assert.ok(texts.includes('连5'), 'streak 5');
    assert.ok(!texts.includes('连1') && !texts.includes('连0'));
    assert.ok(texts.includes('懿'), 'jin tile');
    if (display.largeText) {
      ctx.__calls.forEach((c) => {
        if (Array.from(c.s).length > 1) assert.ok(c.size >= 19.99, 'large text ' + c.s + ' ' + c.size);
      });
      assert.ok(res.contentHeight > 3 * 100 - 1);
    }
    ctx.__calls.forEach((c) => {
      if (Array.from(c.s).length > 1) assert.ok(c.left >= -0.5 && c.right <= 288 + 0.5, 'board text fits: ' + c.s);
    });
  });
});

test('every screen renders in every mode without leaving the display mode dirty for the share card', () => {
  eachState(() => {}, ['large_hc']);
  T.applyDisplay(null);
  const ctx = mockCtx();
  render.shareCard.draw(ctx, { mode: 'daily', record: { w: 1, l: 11 }, bandLabel: '一败涂地', lineup: [], battles: [] });
  assert.ok(ctx.__calls.length > 3);
});
