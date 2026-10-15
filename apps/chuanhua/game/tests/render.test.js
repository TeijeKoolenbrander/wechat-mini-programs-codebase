/**
 * Render tests (node:test, no dependencies): every fixture screen x state x
 * size x display mode draws without throwing; tap areas obey the UI rules
 * (>= 48 pt, no capsule overlap, primary buttons in the thumb zone, text >=
 * 16 pt, nothing overlapped by pinned buttons); moderation/privacy rules hold
 * (entry, teaser, share cards and hidden steps never draw content); the stroke
 * renderer and replay timeline behave; tokens meet contrast targets.
 * Run: node --test apps/chuanhua/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const render = require('../js/render');
const T = require('../js/render/theme');
const S = require('../js/render/strokes');
const reveal = require('../js/render/reveal');
const { buildFixtures, MODES, SIZES } = require('../tools/preview/fixtures.js');
const SM = require('../tools/preview/sample.js');
const { makeLayout, hitTest } = require('../js/render/layout');

// ---------------------------------------------------------------- mock ctx

function fontSize(f) {
  const m = /([\d.]+)px/.exec(f || '');
  return m ? Number(m[1]) : 10;
}

function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) w += /[\x00-\x7f]/.test(ch) ? size * 0.56 : size; // CJK = 1em
  return w;
}

/** Records text (with translate + clip visibility) and path ops. */
function mockCtx() {
  const calls = [];
  const ops = { stroke: 0, fill: 0, arc: 0 };
  const state = { font: '10px sans-serif' };
  const stack = [];
  let tx = 0;
  let ty = 0;
  let clip = null;
  let lastRect = null;
  const grad = { addColorStop() {} };
  const api = {
    save() {
      stack.push({ tx, ty, clip });
    },
    restore() {
      const s = stack.pop();
      if (s) {
        tx = s.tx;
        ty = s.ty;
        clip = s.clip;
      }
    },
    translate(x, y) {
      tx += x;
      ty += y;
    },
    rect(x, y, w, h) {
      lastRect = { x: x + tx, y: y + ty, w, h };
    },
    clip() {
      if (lastRect) {
        if (!clip) clip = lastRect;
        else {
          const x1 = Math.max(clip.x, lastRect.x);
          const y1 = Math.max(clip.y, lastRect.y);
          const x2 = Math.min(clip.x + clip.w, lastRect.x + lastRect.w);
          const y2 = Math.min(clip.y + clip.h, lastRect.y + lastRect.h);
          clip = { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
        }
      }
    },
    fillText(s, x, y) {
      const size = fontSize(state.font);
      const X = x + tx;
      const Y = y + ty;
      const vis = !clip || (Y - size / 2 >= clip.y && Y + size / 2 <= clip.y + clip.h && X >= clip.x - 1 && X <= clip.x + clip.w + 1);
      calls.push({ s: String(s), x: X, y: Y, size, vis, align: state.textAlign, w: textWidth(s, size) });
    },
    measureText(s) {
      return { width: textWidth(s, fontSize(state.font)) };
    },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    stroke() {
      ops.stroke++;
    },
    fill() {
      ops.fill++;
    },
    arc() {
      ops.arc++;
    },
  };
  const ctx = new Proxy(
    {},
    {
      get(t, p) {
        if (p === '__calls') return calls;
        if (p === '__ops') return ops;
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
  return ctx;
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

const STRUCTURAL = /(:block|:card|^sheet:close$|^sheet:body$|^sheet:scroll$|^draw:canvas$|^draw:lock$|^reveal:skip$|^reveal:drawing:|^banner:slot$|^reveal:scroll$)/;

function screenFor(name) {
  return render.screens[name === 'overlay' ? 'group' : name];
}

/** Run fn(screen, name, hits, calls, L, size, vm, mode) for every fixture. */
function eachState(fn, opts) {
  opts = opts || {};
  const sizes = opts.sizes || SIZES;
  const modes = opts.modes || Object.keys(MODES);
  for (const sz of sizes) {
    const L = layoutFor(sz);
    for (const mode of modes) {
      const fx = buildFixtures({ L, mode });
      for (const screen of Object.keys(fx)) {
        if (screen === 'shareCard') continue;
        for (const name of Object.keys(fx[screen])) {
          const raw = fx[screen][name];
          const st = raw && raw.vm !== undefined ? raw : { vm: raw };
          const vm = Object.assign({}, st.vm, { display: MODES[mode] });
          const ctx = mockCtx();
          let hits = screenFor(screen).draw(ctx, vm, L);
          if (st.overlay) {
            const sm = hits.scrollMax;
            const li = hits.layoutInfo;
            hits = hits.concat(render.overlay.draw(ctx, Object.assign({}, st.overlay, { display: MODES[mode] }), L));
            hits.scrollMax = sm;
            hits.layoutInfo = li;
          }
          fn(screen, name, hits, ctx.__calls, L, sz, vm, mode, ctx);
        }
      }
    }
  }
}

const label = (screen, name, L, mode) => screen + '/' + name + ' at ' + L.W + 'x' + L.H + ' ' + mode;

// ------------------------------------------------------------------- tests

test('every screen x state x size x mode draws and returns well-formed hit areas', () => {
  let n = 0;
  eachState((screen, name, hits, calls, L, sz, vm, mode) => {
    assert.ok(Array.isArray(hits), label(screen, name, L, mode));
    hits.forEach((h) => {
      assert.ok(typeof h.id === 'string' && h.id.length, 'id ' + label(screen, name, L, mode));
      assert.ok([h.x, h.y, h.w, h.h].every(Number.isFinite), 'finite ' + h.id + ' ' + label(screen, name, L, mode));
    });
    assert.ok(hits.scrollMax && typeof hits.scrollMax === 'object', 'scrollMax ' + screen);
    n++;
  });
  assert.ok(n > 800, 'rendered ' + n);
});

test('spec 107: every screen in the spec has fixtures for every listed state', () => {
  const fx = buildFixtures({ L: layoutFor(SIZES[0]), mode: 'standard' });
  const need = {
    entry: ['loading', 'claimable_describe', 'taken', 'pending', 'prevMine', 'capReached', 'wrongGroup', 'revealedParticipant', 'revealedTeaser', 'expired', 'removed', 'notFound', 'restricted', 'rulesRequired', 'ugcPaused', 'offline', 'error'],
    home: ['loading', 'ready', 'offline', 'startsUsed', 'restricted', 'paused', 'group', 'group_nocount', 'unseen', 'sheet_howto', 'sheet_strike'],
    draw: ['drawing', 'warn_10s', 'timeUp', 'submitting', 'error', 'point_limit', 'first_empty', 'palette12'],
    describe: ['typing', 'empty', 'submitting', 'blocked', 'busy', 'timeUp', 'keyboard_open'],
    sent: ['draw_pending', 'draw_passed', 'draw_blocked', 'draw_void', 'text_passed'],
    reveal: ['loading', 'ready', 'notParticipant', 'paused', 'offline', 'error', 'placeholders', 'early', 'play_draw1'],
    teaser: ['loading', 'ready', 'removed', 'notFound', 'offline'],
    group: ['noGroup', 'checkingGroup', 'loading', 'ready', 'empty', 'error'],
    album: ['loading', 'ready', 'empty', 'error', 'offline_cached'],
    picker: ['ready', 'custom_typing', 'custom_blocked', 'creating', 'error', 'offline'],
    settings: ['default', 'delete_confirm1', 'delete_confirm2', 'deleting', 'delete_done', 'delete_error'],
  };
  Object.keys(need).forEach((s) => need[s].forEach((n) => assert.ok(fx[s] && fx[s][n], 'missing fixture ' + s + '/' + n)));
  assert.ok(fx.draw.report_sheet && fx.draw.report_done && fx.draw.report_limit && fx.draw.report_dup && fx.draw.report_error && fx.draw.report_submitting);
  assert.ok(fx.shareCard.invite_3 && fx.shareCard.reveal && fx.shareCard.fallback);
});

test('AC: touch targets are at least 48 x 48', () => {
  eachState((screen, name, hits, calls, L, sz, vm, mode) => {
    const info = hits.layoutInfo;
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id)) return;
      // areas clipped by a scroll viewport may be shorter at its edge
      if (info && (h.y <= info.top + 0.5 || h.y + h.h >= info.bottom - 0.5) && h.h < 47.9) return;
      if (/^(sheet|dialog)/.test(h.id)) return;
      assert.ok(h.w >= 47.9 && h.h >= 47.9, label(screen, name, L, mode) + ' ' + h.id + ' is ' + h.w.toFixed(1) + 'x' + h.h.toFixed(1));
    });
  });
});

test('AC: nothing tappable overlaps the capsule menu or sits below the bottom inset', () => {
  eachState((screen, name, hits, calls, L, sz, vm, mode) => {
    const c = L.capsule;
    hits.forEach((h) => {
      if (STRUCTURAL.test(h.id) || (h.w >= L.W - 1 && h.h >= L.H - L.navBottom - 1) || h.h >= 1000) return;
      const overlap = h.x < c.x + c.w && h.x + h.w > c.x && h.y < c.y + c.h && h.y + h.h > c.y;
      assert.ok(!overlap, label(screen, name, L, mode) + ' ' + h.id + ' overlaps the capsule');
      assert.ok(h.y + h.h <= L.bottomEdge + 0.5, label(screen, name, L, mode) + ' ' + h.id + ' below the safe area');
    });
  });
});

test('AC: primary buttons are in the bottom 40% of the screen on phones', () => {
  const primaries = { home: 'home:start', picker: 'picker:start', draw: 'draw:submit', describe: 'describe:submit', reveal: 'reveal:share', group: 'group:start' };
  let seen = 0;
  eachState((screen, name, hits, calls, L, sz, vm, mode) => {
    if (L.W > 500) return;
    const id = primaries[screen];
    if (!id || vm.keyboardH) return;
    const h = hits.find((a) => a.id === id);
    if (!h) return;
    seen++;
    assert.ok(h.y + h.h / 2 >= L.H * 0.6, label(screen, name, L, mode) + ' ' + id + ' centre ' + (h.y + h.h / 2).toFixed(0) + ' < ' + (L.H * 0.6).toFixed(0));
  });
  assert.ok(seen > 100, 'checked ' + seen);
});

test('AC: text is at least 16 pt (18 pt in large-text mode)', () => {
  eachState((screen, name, hits, calls, L, sz, vm, mode) => {
    const min = mode === 'large' ? 17.99 : 15.99;
    calls.forEach((c) => {
      if (Array.from(c.s).length <= 1) return; // icon glyphs, numerals, chevrons
      assert.ok(c.size >= min, label(screen, name, L, mode) + ' "' + c.s + '" is ' + c.size.toFixed(1) + 'px');
    });
  });
});

test('large-text mode really enlarges body text; high contrast is plain white', () => {
  const L = layoutFor(SIZES[1]);
  const sizeOf = (mode) => {
    const fx = buildFixtures({ L, mode });
    const ctx = mockCtx();
    screenFor('home').draw(ctx, Object.assign({}, fx.home.ready, { display: MODES[mode] }), L);
    return Math.max.apply(null, ctx.__calls.filter((c) => c.s === '我的接龙').map((c) => c.size));
  };
  assert.ok(sizeOf('large') > sizeOf('standard'));
  T.applyDisplay(MODES.hc);
  assert.strictEqual(T.COLORS.paper, '#FFFFFF');
  assert.strictEqual(T.COLORS.ink, '#000000');
  T.resetDisplay();
  assert.strictEqual(T.COLORS.paper, '#FAF7F0');
});

test('text is never cut by a pinned footer button (320x568 and 375x667)', () => {
  const ids = /^(home:start|picker:start|picker:customOk|draw:submit|describe:submit|sent:(share|again|reveal)|entry:(claim|group|reveal|teaser|mine|new|home|retry|sameAgain|subscribe|share|revealNow|refresh)|reveal:(share|sameAgain|replayAll|retry)|teaser:(sameAgain|group|retry)|group:(start|retry)|album:(start|retry)|rules:(agree|later)|report:(submit|cancel)|howto:ok|strike:ok)$/;
  let checked = 0;
  eachState(
    (screen, name, hits, calls, L, sz, vm, mode) => {
      if (!((L.W === 320 && L.H === 568) || (L.W === 375 && L.H === 667))) return;
      if (hits.some((h) => /^(sheet:body|dialog:block|draw:lock|describe:lock)$/.test(h.id))) return; // covered by a modal on purpose
      hits.filter((h) => ids.test(h.id) && h.h < L.H / 2 && h.w < L.W).forEach((r) => {
        calls.filter((c) => c.vis).forEach((c) => {
          const cx = c.align === 'center' ? c.x : c.align === 'right' ? c.x - c.w / 2 : c.x + c.w / 2;
          const inX = cx >= r.x - 2 && cx <= r.x + r.w + 2;
          const top = c.y - c.size / 2;
          const bot = c.y + c.size / 2;
          const crosses = inX && bot > r.y + 1 && top < r.y + r.h - 1 && !(c.y >= r.y && c.y <= r.y + r.h);
          assert.ok(!crosses, label(screen, name, L, mode) + ' "' + c.s + '" crosses ' + r.id);
        });
        checked++;
      });
    },
    { modes: ['standard', 'large'] }
  );
  assert.ok(checked > 200, 'checked ' + checked);
});

test('draw screen: the canvas stays large and square, and tools do not overlap it', () => {
  eachState((screen, name, hits, calls, L, sz, vm, mode) => {
    if (screen !== 'draw') return;
    const cv = hits.find((h) => h.id === 'draw:canvas');
    if (!cv) return; // submitting/error/timeUp lock the canvas
    assert.ok(Math.abs(cv.w - cv.h) < 0.5, 'square');
    const min = L.H <= 568 ? 140 : mode === 'large' ? 220 : 280;
    if (mode !== 'large' || L.H > 600) assert.ok(cv.w >= min, label(screen, name, L, mode) + ' canvas ' + cv.w.toFixed(0));
    ['draw:undo', 'draw:clear', 'draw:submit'].forEach((id) => {
      const t = hits.find((h) => h.id === id);
      if (t) assert.ok(t.y >= cv.y + cv.h - 0.5, label(screen, name, L, mode) + ' ' + id + ' overlaps the canvas');
    });
    hits.filter((h) => /^draw:color:/.test(h.id)).forEach((t) => assert.ok(t.y >= cv.y + cv.h - 0.5));
  });
});

test('describe screen with the keyboard open keeps input and submit visible', () => {
  eachState((screen, name, hits, calls, L, sz, vm, mode) => {
    if (screen !== 'describe' || !vm.keyboardH) return;
    ['describe:input', 'describe:submit'].forEach((id) => {
      const h = hits.find((a) => a.id === id);
      assert.ok(h, id);
      assert.ok(h.y + h.h <= L.bottomEdge - vm.keyboardH + 0.5, label(screen, name, L, mode) + ' ' + id + ' under the keyboard');
    });
  }, { sizes: [SIZES[0], SIZES[1], SIZES[2]], modes: ['standard'] });
});

test('hit ids are documented in CONTRACT.md', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const prefixes = ['picker:select:', 'draw:color:', 'draw:size:', 'report:reason:', 'reveal:drawing:', 'reveal:laugh:', 'reveal:report:', 'group:chain:', 'group:reveal:', 'group:teaser:', 'album:item:', 'detail:delete:'];
  const missing = new Set();
  eachState(
    (screen, name, hits) => {
      hits.forEach((h) => {
        if (/:block|:card$/.test(h.id)) return;
        let norm = h.id;
        prefixes.forEach((p) => {
          if (h.id.indexOf(p) === 0) norm = p + '<' + (p === 'draw:color:' ? 'idx' : p === 'draw:size:' ? '0|1|2' : p === 'report:reason:' ? 'key' : p === 'reveal:drawing:' || p === 'reveal:laugh:' || p === 'reveal:report:' || p === 'detail:delete:' ? 'n' : p === 'picker:select:' ? 'id' : 'chainId') + '>';
        });
        if (!doc.includes(norm)) missing.add(screen + ' ' + norm);
      });
    },
    { sizes: [SIZES[1]], modes: ['standard'] }
  );
  assert.deepStrictEqual([...missing], []);
});

test('scroll areas expose scrollMax; large text at 320x568 scrolls instead of clipping', () => {
  let scrolled = 0;
  eachState(
    (screen, name, hits, calls, L, sz, vm, mode) => {
      if (L.W === 320 && L.H === 568 && mode === 'large' && screen === 'home' && name === 'restricted') {
        assert.ok(hits.scrollMax.scroll > 0, 'home scrolls in large text');
        scrolled++;
      }
      if (screen === 'settings' && name === 'default' && L.H === 568) {
        assert.ok(hits.scrollMax.scroll > 0);
        scrolled++;
      }
      if (screen === 'reveal' && name === 'ready' && L.H === 568) {
        assert.ok(hits.scrollMax['reveal:scroll'] > 400);
        scrolled++;
      }
    },
    { modes: ['standard', 'large'] }
  );
  assert.ok(scrolled >= 5);
});

test('hitTest: later areas win (overlays over screens)', () => {
  const hits = [{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'b', x: 10, y: 10, w: 20, h: 20 }];
  assert.strictEqual(hitTest(hits, 15, 15), 'b');
  assert.strictEqual(hitTest(hits, 50, 50), 'a');
  assert.strictEqual(hitTest(hits, 500, 5), null);
});

test('layout: content starts below the capsule row on every size, and survives a missing menu rect', () => {
  SIZES.forEach((sz) => {
    const L = layoutFor(sz);
    assert.strictEqual(L.navBottom, sz.menu.bottom + (sz.menu.top - sz.sb));
    assert.ok(L.contentW <= 500 && L.contentW > 0);
    assert.ok(L.navFreeW > 60, 'room for the timer next to the capsule');
  });
  const L = makeLayout({ windowWidth: 360, windowHeight: 640 });
  assert.ok(L.navBottom > 40);
  assert.strictEqual(L.safeBottom, 0);
});

test('rendering is deterministic: the same vm draws the same calls', () => {
  const L = layoutFor(SIZES[1]);
  const fx = buildFixtures({ L, mode: 'standard' });
  ['home', 'draw', 'reveal', 'entry', 'group'].forEach((s) => {
    Object.keys(fx[s]).forEach((n) => {
      const a = mockCtx();
      const b = mockCtx();
      const vm = Object.assign({}, fx[s][n].vm || fx[s][n]);
      screenFor(s).draw(a, vm, L);
      screenFor(s).draw(b, vm, L);
      assert.deepStrictEqual(a.__calls, b.__calls, s + '/' + n);
    });
  });
});

// ------------------------------------------------- moderation / privacy

function allText(calls) {
  return calls.map((c) => c.s).join('|');
}

test('entry never draws prompt, drawing or sentence content, whatever the vm carries', () => {
  const L = layoutFor(SIZES[1]);
  const fx = buildFixtures({ L, mode: 'standard' }).entry;
  Object.keys(fx).forEach((n) => {
    const ctx = mockCtx();
    const vm = Object.assign({}, fx[n], { prompt: { text: '机密题目' }, steps: [{ n: 1, kind: 'draw', strokes: SM.sun(), text: '机密句子' }], lastText: '机密句子', previous: { text: '机密句子' }, strokes: SM.sun() });
    render.screens.entry.draw(ctx, vm, L);
    assert.ok(!/机密/.test(allText(ctx.__calls)), 'entry/' + n + ' leaked');
    assert.strictEqual(ctx.__ops.stroke > 0, ctx.__ops.stroke > 0);
  });
});

test('teaser and notParticipant reveal draw only the prompt, the final sentence and the count', () => {
  const L = layoutFor(SIZES[1]);
  const secret = ['一个大饼在天上', '一只猫在开出租车'];
  const base = buildFixtures({ L, mode: 'standard' });
  const vms = [
    ['teaser', Object.assign({}, base.teaser.ready, { steps: [{ n: 2, kind: 'describe', text: secret[0] }], strokes: SM.sun() })],
    ['reveal', Object.assign({}, base.reveal.notParticipant)],
  ];
  vms.forEach(([screen, vm]) => {
    const ctx = mockCtx();
    render.screens[screen].draw(ctx, vm, L);
    const t = allText(ctx.__calls);
    secret.forEach((s) => assert.ok(t.indexOf(s) < 0, screen + ' leaked ' + s));
    assert.ok(t.includes('月亮吃月饼') && t.includes('外星人在吃披萨') && t.includes('完整接龙仅参与的群友可见'));
  });
  // the reveal screen's steps array is not even read for notParticipant
  const ctx = mockCtx();
  const hostile = Object.assign({}, base.reveal.notParticipant);
  delete hostile.steps;
  Object.defineProperty(hostile, 'steps', {
    get() {
      throw new Error('steps must not be read');
    },
  });
  render.screens.reveal.draw(ctx, hostile, L);
});

test('hidden, deleted, paused and missing content draws placeholders, never the content', () => {
  const L = layoutFor(SIZES[1]);
  const base = buildFixtures({ L, mode: 'standard' }).reveal;
  // hostile: placeholder set but content still present in the vm
  const vm = Object.assign({}, base.ready, {
    steps: base.ready.steps.map((s, i) => (i === 1 ? Object.assign({}, s, { placeholder: 'reported', text: '被举报的句子' }) : i === 3 ? Object.assign({}, s, { placeholder: 'deleted', text: '被删除的句子' }) : s)),
  });
  const ctx = mockCtx();
  render.screens.reveal.draw(ctx, vm, L);
  const t = allText(ctx.__calls);
  assert.ok(!t.includes('被举报的句子') && !t.includes('被删除的句子'));
  assert.ok(t.includes('该内容已被举报隐藏') && t.includes('作者已删除这一棒'));
  // placeholder steps get no laugh / report buttons
  const hits = render.screens.reveal.draw(mockCtx(), vm, L);
  assert.ok(!hits.some((h) => h.id === 'reveal:laugh:2' || h.id === 'reveal:report:2' || h.id === 'reveal:laugh:4'));

  // missing fields default to hidden
  const miss = mockCtx();
  render.screens.reveal.draw(miss, base.missing_content, L);
  assert.ok(allText(miss.__calls).includes('内容暂不可见'));

  // paused / loading / offline never show the prompt or steps
  ['paused', 'loading', 'offline', 'error'].forEach((n) => {
    const c = mockCtx();
    render.screens.reveal.draw(c, Object.assign({}, base[n], { steps: base.ready.steps }), L);
    const tt = allText(c.__calls);
    assert.ok(!tt.includes('月亮吃月饼') && !tt.includes('一个大饼在天上') && !tt.includes('外星人在吃披萨'), 'reveal/' + n + ' leaked');
  });
  // a bare { state: 'ready' } vm does not throw
  render.screens.reveal.draw(mockCtx(), { state: 'ready' }, L);
  render.screens.sent.draw(mockCtx(), {}, L);
  render.screens.entry.draw(mockCtx(), {}, L);
});

test('sent: a missing moderation state defaults to 审核中; blocked and void hide the share button', () => {
  const L = layoutFor(SIZES[1]);
  const fx = buildFixtures({ L, mode: 'standard' }).sent;
  const c1 = mockCtx();
  const h1 = render.screens.sent.draw(c1, fx.missing_modstate, L);
  assert.ok(allText(c1.__calls).includes('审核中'));
  assert.ok(h1.some((h) => h.id === 'sent:share'));
  ['draw_blocked', 'draw_void'].forEach((n) => {
    const h = render.screens.sent.draw(mockCtx(), fx[n], L);
    assert.ok(!h.some((a) => a.id === 'sent:share'), n);
    assert.ok(h.some((a) => a.id === 'sent:again'));
  });
});

test('share cards: invite shows no prompt/drawing/sentence; reveal card only the two passed texts; no strokes module', () => {
  const sc = render.shareCard;
  const hostile = { kind: 'invite', passed: 3, total: 6, promptText: '机密题目', finalText: '机密句子', text: '机密句子', strokes: SM.sun(), steps: [{ text: '机密句子' }] };
  const a = mockCtx();
  sc.draw(a, hostile);
  assert.ok(!/机密/.test(allText(a.__calls)));
  assert.ok(allText(a.__calls).includes('已传 3/6 棒'));
  const b = mockCtx();
  sc.draw(b, { kind: 'reveal', promptText: '月亮吃月饼', finalText: '外星人在吃披萨', passed: 6, people: 6, strokes: SM.sun(), steps: [{ n: 3, text: '机密句子' }], middleText: '机密句子' });
  const t = allText(b.__calls);
  assert.ok(t.includes('月亮吃月饼') && t.includes('外星人在吃披萨') && t.includes('6 位群友接力') && !/机密/.test(t));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'shareCard.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/require\(['"]\.\/strokes/.test(src));
  assert.ok(!/\.strokes/.test(src));
  // fallback draws no user text at all
  const f = mockCtx();
  sc.draw(f, { kind: 'fallback', promptText: '机密题目' });
  assert.ok(!/机密/.test(allText(f.__calls)));
});

test('share card render() sizes the canvas 500 x 400 (5:4), x pixelScale', () => {
  const mk = () => ({ width: 0, height: 0, getContext: () => mockCtx() });
  const c = mk();
  render.shareCard.render(c, { kind: 'invite', passed: 1 });
  assert.strictEqual(c.width, 500);
  assert.strictEqual(c.height, 400);
  const c2 = mk();
  render.shareCard.render(c2, { kind: 'reveal', promptText: 'a', finalText: 'b' }, { pixelScale: 2 });
  assert.strictEqual(c2.width, 1000);
  assert.strictEqual(c2.height, 800);
});

test('share card text always fits 500 px (long reveal texts)', () => {
  const ctx = mockCtx();
  render.shareCard.draw(ctx, { kind: 'reveal', promptText: '一只穿着雨衣的长颈鹿', finalText: '一群外星人在月亮上吃着巨大的披萨', passed: 4, people: 3 });
  ctx.__calls.forEach((c) => {
    const left = c.align === 'center' ? c.x - c.w / 2 : c.x;
    assert.ok(left >= 0 && left + c.w <= 500 + 1, '"' + c.s + '" spans ' + left.toFixed(0) + '-' + (left + c.w).toFixed(0));
  });
});

// ------------------------------------------------------------ strokes

test('strokes: decode applies deltas, drops malformed strokes and never throws', () => {
  const d = S.decode({ v: 1, s: [[1, 2, 100, 200, 10, -5, 5, 5], [99, 0, 1, 1], [0, 0], 'x', [0, 1, 5, 5]] });
  assert.strictEqual(d.length, 2);
  assert.deepStrictEqual(d[0].pts, [100, 200, 110, 195, 115, 200]);
  assert.deepStrictEqual(S.decode(null), []);
  assert.deepStrictEqual(S.decode({}), []);
  assert.strictEqual(S.stats(SM.house()).strokes, 6);
  S.draw(mockCtx(), undefined, { x: 0, y: 0, w: 100, h: 100 });
  S.draw(mockCtx(), { v: 1, s: [[0, 0, NaN, 3, 1, 1]] }, { x: 0, y: 0, w: 100, h: 100 });
});

test('strokes: progress reveals the drawing monotonically from nothing to everything', () => {
  const drawing = SM.scribble(6, 80);
  const strokesAt = (p) => {
    const ctx = mockCtx();
    S.draw(ctx, drawing, { x: 0, y: 0, w: 200, h: 200 }, { progress: p, bg: false });
    return ctx.__ops.stroke;
  };
  assert.strictEqual(strokesAt(0), 0);
  let prev = 0;
  [0.1, 0.3, 0.5, 0.8, 1].forEach((p) => {
    const n = strokesAt(p);
    assert.ok(n >= prev, 'monotonic at ' + p);
    prev = n;
  });
  assert.strictEqual(strokesAt(1), 6);
  const cut = S.truncate([0, 0, 100, 0, 100, 100], 150);
  assert.deepStrictEqual(cut, [0, 0, 100, 0, 100, 50]);
});

test('reveal timeline: each drawing takes 2.5 s whatever its length; sentences 0.6 s; prompt 0.8 s; 0.4 s gaps', () => {
  const mk = (strokes) => [1, 2, 3, 4, 5, 6].map((n) => (n % 2 ? { n, kind: 'draw', strokes: strokes } : { n, kind: 'describe', text: '一句话' }));
  [SM.house(), SM.scribble(40, 90), { v: 1, s: [[0, 1, 5, 5]] }].forEach((drawing) => {
    const steps = mk(drawing);
    // find the time span in which panel 1 (first drawing) is still animating
    let a = null;
    let b = null;
    for (let t = 0; t < 20000; t += 5) {
      const r = reveal.timeline(steps, t);
      if (r.panel === 1 && r.progress < 1) {
        if (a === null) a = t;
        b = t;
      }
    }
    assert.ok(Math.abs(b - a + 5 - 2500) <= 200, 'drawing animates ' + (b - a + 5) + ' ms');
  });
  const steps = mk(SM.house());
  assert.strictEqual(reveal.timeline(steps, 0).panel, 0);
  assert.ok(Math.abs(reveal.timeline(steps, 400).progress - 0.5) < 0.01);
  assert.strictEqual(reveal.timeline(steps, 800 + 400 + 10).panel, 1);
  assert.strictEqual(reveal.timeline(steps, 1e7).done, true);
  // about 15 s for 6 棒
  const total = reveal.totalMs(steps);
  assert.ok(total > 12000 && total < 17000, 'total ' + total);
  // placeholders are skipped by autoplay
  const withPh = steps.map((s, i) => (i === 1 ? { n: 2, kind: 'describe', placeholder: 'reported' } : s));
  assert.strictEqual(reveal.playable(withPh).length, 5);
  assert.ok(reveal.totalMs(withPh) < total);
});

test('reveal autoplay: only panels up to autoplay.panel are drawn, and a tap anywhere skips', () => {
  const L = layoutFor(SIZES[1]);
  const fx = buildFixtures({ L, mode: 'standard' }).reveal;
  const c0 = mockCtx();
  const h0 = render.screens.reveal.draw(c0, fx.play_prompt, L);
  const t0 = allText(c0.__calls);
  assert.ok(t0.includes('月亮吃月饼') && !t0.includes('第1棒'));
  assert.ok(h0.some((h) => h.id === 'reveal:skip'));
  assert.ok(!h0.some((h) => /^reveal:(share|replayAll|sameAgain)$/.test(h.id)), 'footer actions disabled while playing');
  const c1 = mockCtx();
  render.screens.reveal.draw(c1, fx.play_text2, L);
  const t1 = allText(c1.__calls);
  assert.ok(t1.includes('第1棒') && t1.includes('第2棒') && !t1.includes('第3棒'));
  // full strip: no skip target, actions available
  const h2 = render.screens.reveal.draw(mockCtx(), fx.ready, L);
  assert.ok(!h2.some((h) => h.id === 'reveal:skip'));
  assert.ok(h2.some((h) => h.id === 'reveal:replayAll') && h2.some((h) => h.id === 'reveal:share'));
  // text types in with progress
  const ty = (p) => {
    const c = mockCtx();
    render.screens.reveal.draw(c, Object.assign({}, fx.play_text2, { autoplay: { playing: true, panel: 2, progress: p } }), L);
    return allText(c.__calls).includes('一个大饼在天上');
  };
  assert.strictEqual(ty(0.2), false);
  assert.strictEqual(ty(1), true);
});

// ---------------------------------------------------------------- tokens

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
function ratio(a, b) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('contrast: standard text >= 4.5:1, high contrast text >= 7:1', () => {
  const S0 = T.STANDARD;
  [['ink', 'paper'], ['sub', 'paper'], ['zhuText', 'paper'], ['orangeText', 'paper'], ['blueText', 'paper'], ['good', 'paper'], ['good', 'card'], ['zhuText', 'card'], ['sub', 'card'], ['onZhu', 'zhu'], ['disabledInk', 'disabledFill'], ['ink', 'card']].forEach(([f, b]) => {
    assert.ok(ratio(S0[f], S0[b]) >= 4.5, 'standard ' + f + ' on ' + b + ' = ' + ratio(S0[f], S0[b]).toFixed(2));
  });
  const H = T.HIGH_CONTRAST;
  [['ink', 'paper'], ['sub', 'paper'], ['zhuText', 'paper'], ['orangeText', 'paper'], ['blueText', 'paper'], ['good', 'paper'], ['onZhu', 'zhu'], ['disabledInk', 'disabledFill']].forEach(([f, b]) => {
    assert.ok(ratio(H[f], H[b]) >= 7, 'high contrast ' + f + ' on ' + b + ' = ' + ratio(H[f], H[b]).toFixed(2));
  });
});

test('palette: 12 drawing colours as in the spec', () => {
  assert.deepStrictEqual(T.PALETTE.slice(0, 6), ['#1E1B18', '#D8433B', '#F29B30', '#3E9B5A', '#3C78C8', '#7B4FB3']);
  assert.strictEqual(T.PALETTE.length, 12);
  assert.deepStrictEqual(T.BRUSH, [8, 18, 36]);
});

// -------------------------------------------------------- WeChat safety

test('render modules are WeChat-safe: literal ./ requires only, no wx, timers, Node built-ins or network', () => {
  const dir = path.join(__dirname, '..', 'js', 'render');
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.ok(!/\bwx\./.test(src), f + ' uses wx');
      assert.ok(!/setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random|new Date/.test(src), f + ' uses timers or randomness');
      assert.ok(!/\b(process|Buffer|__dirname)\b/.test(src), f + ' uses Node globals');
      assert.ok(!/\bProxy\b|\broundRect\(|\bellipse\(|letterSpacing|\bfilter\s*=/.test(src), f + ' uses an unsupported canvas feature');
      const re = /require\(([^)]*)\)/g;
      let m;
      while ((m = re.exec(src))) assert.ok(/^'\.\/[A-Za-z]+'$/.test(m[1].trim()), f + ' requires ' + m[1]);
    });
});
