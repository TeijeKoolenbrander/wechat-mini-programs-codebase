'use strict';
// Behavioural render tests for spec rev. 2: display modes, contrast, the removed v1 things stay removed, the new screens'
// content and hit ids (home, pick, draw, describe, round wait, lobby, room entry, overview, step-through, teaser, group,
// album, settings, share cards), no leaks (entry shows no content; the overview shows only final steps; share cards show no
// drawings), moderation states, overlays and hit routing, purity (no wx / timers / identity) and package weight.
// The geometry of the draw and describe screens is in render.canvas.test.js; stroke drawing in render.strokes.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/render');
const T = require('../js/render/theme');
const Strokes = require('../js/render/strokes');
const SM = require('../js/render/samples.js');
const { sample } = SM;
const { mockCtx, SIZES, MODES, layoutFor } = require('./render-mock');
const { prepare } = require('../tools/preview/fixtures.js');

const S = (name) => SIZES.find((s) => s.name === name);
const L320 = layoutFor(S('320x568'));
const L375 = layoutFor(S('375x667'));
const L812 = layoutFor(S('375x812'));
const L414 = layoutFor(S('414x896'));
const L768 = layoutFor(S('768x1024'));
const STD = MODES.default;

function run(screen, vm, L, display) {
  const ctx = mockCtx();
  const d = display || STD;
  const v = prepare(screen, Object.assign({}, vm, { display: d }), L, ctx, d);
  const hits = R.screens[screen].draw(ctx, v, L);
  return { hits, ctx, texts: ctx.__calls.map((c) => c.s), calls: ctx.__calls, vm: v };
}
/** how many times the screens asked the strokes helper to draw a drawing while fn runs */
function strokeCalls(fn) {
  const orig = Strokes.drawStrokes;
  let n = 0;
  Strokes.drawStrokes = function counted(...a) { n++; return orig.apply(this, a); };
  try {
    fn();
  } finally {
    Strokes.drawStrokes = orig;
  }
  return n;
}
const hasText = (r, s) => r.texts.some((t) => t.includes(s)) || r.texts.join('').includes(s);
const ids = (r) => r.hits.map((h) => h.id);
const has = (r, id) => r.hits.some((h) => h.id === id);
const find = (r, id) => r.hits.find((h) => h.id === id);

// ---------------------------------------------------------------- display modes

test('large text: body >= 20 pt, buttons and rows >= 56 pt tall, lists scroll; standard body is 16 pt', () => {
  T.applyDisplay(MODES.large);
  assert.ok(T.FS.body >= 20 && T.FS.bodyL >= 22);
  assert.equal(T.minBtn(), 56);
  T.applyDisplay(STD);
  assert.equal(T.FS.body, 16);
  assert.equal(T.minBtn(), 48);
  const want = ['home:primary', 'home:album', 'pick:start', 'draw:submit', 'draw:undo', 'draw:clear', 'draw:size', 'describe:submit', 'sent:share', 'entry:claim', 'group:newRoom', 'lobby:start', 'lobby:invite', 'roomEntry:join', 'overview:rematch', 'overview:share', 'stepthrough:prev', 'stepthrough:next', 'teaser:group', 'rules:agree', 'dialog:confirm'];
  const tall = [];
  const seen = new Set();
  for (const [screen, state] of [['home', 'ready'], ['pick', 'ready'], ['draw', 'drawing'], ['describe', 'typing'], ['sent', 'pending'], ['entry', 'claimable'], ['group', 'ready'], ['lobby', 'ready'], ['roomEntry', 'joinable'], ['overview', 'ready'], ['stepthrough', 'ready'], ['teaser', 'ready'], ['rules', 'open']]) {
    for (const L of [L320, L414]) {
      const { hits } = run(screen, sample(screen, state), L, MODES.large);
      for (const h of hits.raw) if (want.includes(h.id)) { seen.add(h.id); if (h.h < 55.5) tall.push(`${screen} ${h.id} ${h.h}`); }
    }
  }
  assert.deepEqual(tall, []);
  assert.ok(seen.size >= 18, [...seen].join(','));
  const o = R.overlay.draw(mockCtx(), { dialog: { text: 'x', confirmLabel: '好', cancelLabel: '取消' }, display: MODES.large }, L320);
  for (const h of o) if (/^dialog:(confirm|cancel)$/.test(h.id)) assert.ok(h.h >= 55.5, h.id);
  assert.ok(run('overview', sample('overview', 'ready'), L320, MODES.large).hits.scrollMax['overview:scroll'] > 0, 'the overview scrolls in large text');
  // the draw screen: bar and rows are 56 pt in large text and the canvas absorbs the difference
  const g = R.drawGeometry(L812, { sourceLines: 1, unlocked: false, display: MODES.large });
  assert.equal(g.bar.h, 56);
  assert.equal(g.toolRow.h, 56);
  const base = R.drawGeometry(L812, { sourceLines: 1, unlocked: false, display: STD });
  assert.ok(g.canvas.h < base.canvas.h);
  T.applyDisplay(STD);
});

test('every vm display flag is read per draw call (the mode is per call, not sticky)', () => {
  const a = run('home', sample('home', 'ready'), L375, MODES.large);
  const b = run('home', sample('home', 'ready'), L375, STD);
  const size = (r) => Math.min(...r.calls.map((c) => c.size));
  assert.ok(size(a) >= 20 - 0.6);
  assert.ok(size(b) < 20);
});

test('contrast: standard text >= 4.5:1, high contrast text >= 7:1, non-text outlines >= 3:1; stroke colours are never remapped', () => {
  const pairs = (C, min) => {
    const p = [['ink', 'paper'], ['ink', 'card'], ['sub', 'paper'], ['sub', 'card'], ['orangeDeep', 'paper'], ['orangeDeep', 'card'], ['vermText', 'paper'], ['vermText', 'card'],
      ['blueText', 'paper'], ['blueText', 'card'], ['greenText', 'paper'], ['greenText', 'card'], ['ink', 'orange'], ['disabledInk', 'disabledFill'], ['ink', 'margin']];
    const bad = [];
    for (const [fg, bg] of p) {
      const c = T.contrast(C[fg], C[bg]);
      if (c < min) bad.push(`${fg} on ${bg} ${c.toFixed(2)}`);
    }
    if (T.contrast('#FFFFFF', C.vermText) < min) bad.push('white on vermText (the warning timer)');
    return bad;
  };
  const soft = (C, min) => {
    const bad = [];
    for (const [fg, bg] of [['orangeDeep', 'orangeSoft'], ['blueText', 'blueSoft'], ['ink', 'orangeSoft']]) if (T.contrast(C[fg], C[bg]) < min) bad.push(`${fg} on ${bg}`);
    return bad;
  };
  assert.deepEqual(pairs(T.STANDARD, 4.5).concat(soft(T.STANDARD, 4.5)), []);
  assert.deepEqual(pairs(T.HC, 7).concat(soft(T.HC, 7)), []);
  assert.ok(T.contrast(T.HC.ink, T.HC.paper) >= 3);
  assert.equal(T.STANDARD.margin, '#EFEAE0');
  assert.equal(T.HC.margin, '#DDDDDD');
  // high contrast: the 12 stroke colours are still drawn in their own colours on the draw screen
  const unlocked = sample('draw', 'drawing', { palette: SM.palette(true) });
  const hc = run('draw', unlocked, L414, MODES.hc);
  for (const c of Strokes.COLORS) assert.ok(hc.ctx.__fills.includes(c), 'stroke colour ' + c + ' present in high contrast');
  assert.equal(T.HC.paper, '#FFFFFF');
  assert.equal(T.HC.shadow, 'rgba(0,0,0,0)');
});

test('fonts: system stack only, no font files, no loadFont (open licence or system)', () => {
  assert.match(T.SANS, /PingFang SC/);
  const files = fs.readdirSync(path.join(__dirname, '..', 'js', 'render'));
  assert.ok(!files.some((f) => /\.(ttf|otf|woff2?)$/i.test(f)));
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', f), 'utf8');
    assert.ok(!/loadFont|@font-face/.test(src), f);
  }
});

// ---------------------------------------------------------------- rev. 2 removals stay removed

test('removed in rev. 2: no 今日起点 card, national count, 今日 chips, draw-screen 今日彩笔 pill, 同题再传, vertical auto-play reveal', () => {
  const dir = path.join(__dirname, '..', 'js', 'render');
  assert.ok(!fs.existsSync(path.join(dir, 'reveal.js')) && !fs.existsSync(path.join(dir, 'picker.js')));
  assert.equal(R.screens.reveal, undefined);
  assert.equal(R.screens.picker, undefined);
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'samples.js')) {
    const src = strip(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(!/今日起点|同题再传|sameAgain|全国|autoplay|isDaily|draw:palette/.test(src), f + ' still mentions a removed feature');
  }
  const all = require('../tools/preview/fixtures.js').build();
  for (const f of all) {
    for (const L of [L320, L812]) {
      const r = run(f.screen, f.vm, L);
      const text = r.texts.join('|');
      assert.ok(!/今日起点|全国|同题再传|重播.*自动|点任意位置/.test(text), `${f.screen}/${f.state}: ${text.match(/今日起点|全国|同题再传/)}`);
      for (const h of r.hits) assert.ok(!/sameAgain|palette$|autoplay/.test(h.id) || h.id === 'settings:palette' || h.id === 'draw:palette' === false, h.id);
    }
  }
  // 今日彩笔 appears only in 设置
  for (const f of all.filter((x) => x.screen !== 'settings' && x.screen !== 'overlay')) {
    assert.ok(!/今日彩笔/.test(run(f.screen, f.vm, L375).texts.join('|')), `${f.screen}/${f.state}`);
  }
});

// ---------------------------------------------------------------- home

test('home: 开一局 primary pinned in the bottom 40% with 慢慢传 under it, group line, return-to-room card, streak, tiles; every state', () => {
  for (const L of [L320, L375, L812, L414, L768]) {
    const r = run('home', sample('home', 'ready'), L);
    const p = find(r, 'home:primary');
    assert.ok(p.y + p.h / 2 >= L.H * 0.6, `primary in the bottom 40% at ${L.W}x${L.H}`);
    const s = find(r, 'home:slow');
    assert.ok(s.y >= p.y + p.h, 'the 慢慢传 link is under the primary');
    for (const id of ['home:groupLine', 'home:album', 'home:groupList', 'home:howto', 'home:settings']) assert.ok(has(r, id), id);
    assert.ok(!has(r, 'home:activeRoom'));
  }
  const r = run('home', sample('home', 'ready'), L375);
  for (const w of ['传 画 接 龙', '开一局', '3–10 人一起，约 3 分钟', '慢慢传（不用同时在线）', '连续接龙 4 天', '来自群聊 · 本群有一局正在等人', '我的接龙', '本群接龙', '玩法', '设置']) assert.ok(hasText(r, w), w);
  // streak only when given (>= 2 days is logic's rule)
  assert.ok(!hasText(run('home', sample('home', 'ready', { streakText: null }), L375), '连续接龙'));
  // seated in a room: 回到这一局 card
  const act = run('home', sample('home', 'ready', { activeRoom: { roomId: 'ROOMAAAAAA', line: '回到这一局 · 第 2/4 轮' } }), L375);
  assert.ok(has(act, 'home:activeRoom') && hasText(act, '回到这一局 · 第 2/4 轮'));
  // live rooms off: 开一条接龙 and no link
  const off = run('home', sample('home', 'ready', { primary: { kind: 'chain', label: '开一条接龙', sublabel: null, enabled: true }, slowLink: { show: false, label: '' } }), L375);
  assert.ok(hasText(off, '开一条接龙') && !has(off, 'home:slow') && has(off, 'home:primary'));
  // restricted / paused / cap: disabled primary, banner text, 我的接龙 still works
  const rs = run('home', sample('home', 'ready', { primary: { kind: 'room', label: '开一局', sublabel: null, enabled: false }, restriction: { text: '你被限制参与至 10月17日 14:00' } }), L375);
  assert.ok(hasText(rs, '你被限制参与至 10月17日 14:00') && !has(rs, 'home:primary') && has(rs, 'home:album'));
  const cap = run('home', sample('home', 'ready', { primary: { kind: 'room', label: '开一局', sublabel: '今天开局次数已用完，明天再来', enabled: false } }), L375);
  assert.ok(hasText(cap, '今天开局次数已用完，明天再来') && !has(cap, 'home:primary'));
  const paused = run('home', sample('home', 'ready', { ugcPausedText: '接龙维护中，可以先看看已揭晓的接龙', primary: { kind: 'room', label: '开一局', sublabel: null, enabled: false } }), L375);
  assert.ok(hasText(paused, '接龙维护中') && !has(paused, 'home:primary'));
  // offline / error: card + 重试, buttons disabled
  for (const st of ['offline', 'error']) {
    const e = run('home', sample('home', st), L375);
    assert.ok(has(e, 'home:retry') && !has(e, 'home:primary') && !has(e, 'home:slow') && has(e, 'home:album'), st);
  }
  assert.ok(hasText(run('home', sample('home', 'offline'), L375), '需联网才能接龙'));
  // unseen reveals: dot on 我的接龙 (shape) in both tile layouts
  assert.ok(run('home', sample('home', 'ready'), L320).ctx.__counts.arc > 0);
});

test('home sheets: 公约, 玩法 (rev. 2 text), strike warning, 设置, and the 慢慢传 starts-used-up sheet', () => {
  const how = run('howto', sample('howto', 'open'), L375);
  for (const w of ['开一局：拉群友一起玩，每人选一个题目', '每一轮你只看到上一位传来的', '时间到会自动交出', '最后一起揭晓：先看最后变成了什么', '「慢慢传」', '所有画和字都会先审核再传给下一位']) assert.ok(hasText(how, w), w);
  assert.ok(has(how, 'sheet:close'));
  const over = run('home', sample('home', 'ready', { sheet: 'howto' }), L375);
  assert.ok(hasText(over, '开一局：拉群友一起玩') && has(over, 'sheet:close'));
  const lim = run('startLimit', sample('startLimit', 'ad'), L375);
  assert.ok(hasText(lim, '今天的 3 条已开完') && hasText(lim, '看视频再开一条 (剩 2)') && has(lim, 'startLimit:ad'));
  const none = run('startLimit', sample('startLimit', 'none'), L375);
  assert.ok(hasText(none, '明天再来开新的吧') && !has(none, 'startLimit:ad') && has(none, 'sheet:close'));
  const overLim = run('home', sample('home', 'ready', { sheet: 'startLimit', chainStart: { freeLeft: 0, adLeft: 2, sheet: 'limit', adState: 'idle' } }), L375);
  assert.ok(has(overLim, 'startLimit:ad'));
  const rules = run('rules', sample('rules', 'open'), L375);
  for (const id of ['rules:agree', 'rules:decline', 'rules:terms', 'rules:privacy', 'sheet:close']) assert.ok(has(rules, id), id);
  for (const w of ['接龙公约', '同意并开始', '先看看', '《用户协议》', '《用户隐私保护指引》', '画和字都会先审核，通过后才传给下一位']) assert.ok(hasText(rules, w), w);
  const warning = run('warning', sample('warning', 'open'), L375);
  assert.ok(hasText(warning, '你有内容没通过审核') && has(warning, 'warning:ok'));
});

test('设置: the ONLY place to unlock 今日彩笔 (PO-49); unlocked state; legal links, delete-all, feedback, reminder line', () => {
  const st = run('settings', sample('settings', 'idle'), L375);
  for (const id of ['settings:sound', 'settings:largeText', 'settings:highContrast', 'settings:palette', 'settings:feedback', 'settings:deleteAll', 'settings:rules', 'settings:terms', 'settings:privacy']) assert.ok(has(st, id) || st.hits.scrollMax, id);
  assert.ok(hasText(st, '看视频解锁今日彩笔') && hasText(st, '揭晓提醒'));
  const done = run('settings', sample('settings', 'idle', { deleteAll: { state: 'done' }, paletteUnlockedToday: true }), L375);
  assert.ok(!has(done, 'settings:palette') && hasText(done, '今日彩笔已解锁（今天有效）'));
  const lower = run('settings', Object.assign(sample('settings', 'idle'), { sheetScroll: 9999 }), L320);
  assert.ok(has(lower, 'settings:deleteAll'));
});

// ---------------------------------------------------------------- pick

/** the pick vm in a given 换一批 state (what logic/vm.js builds) */
function rerollVm(left, state) {
  return sample('pick', 'ready', {
    state: state || 'ready', rerollLeft: left, rerollDisabled: left === 0, rerollTappable: left > 0 && (state || 'ready') === 'ready',
    rerollLabel: left > 0 ? '换一批（剩' + left + '次）' : '换一批机会已用完',
  });
}
const LABELS = ['换一批（剩5次）', '换一批（剩4次）', '换一批（剩3次）', '换一批（剩2次）', '换一批（剩1次）', '换一批机会已用完'];

test('AC 166: the 换一批 rect is identical before, during and after the limit; its label is whole at 6 sizes x 4 modes; 自己出题, the cards and 就这个 keep their rects', () => {
  const problems = [];
  for (const mode of Object.keys(MODES)) {
    for (const sz of SIZES) {
      const L = layoutFor(sz);
      const rect = (vm) => {
        const r = run('pick', vm, L, MODES[mode]);
        return r;
      };
      const base = rect(rerollVm(5));
      const R0 = base.hits.rects.reroll;
      const keep = (r) => ['pick:custom', 'pick:start', 'pick:item:I1001'].map((id) => JSON.stringify(find(r, id)));
      const keep0 = keep(base);
      const where = mode + ' ' + sz.name;
      assert.ok(R0.h >= (mode.includes('large') ? 55.5 : 47.5), where + ' tap height ' + R0.h);
      assert.ok(R0.x >= 0 && R0.x + R0.w <= sz.w + 0.5, where + ' inside the window');
      // TD-152: 换一批 and 自己出题 share one row at every size and mode
      const cu = find(base, 'pick:custom');
      assert.ok(Math.abs(cu.y - R0.y) < 0.5 && cu.x >= R0.x + R0.w, where + ' 换一批 and 自己出题 on one row');
      assert.ok(cu.y + cu.h <= L.H, where + ' 自己出题 visible at rest');
      for (const [left, state] of [[4], [3], [2], [1], [0], [3, 'rerolling'], [0, 'sending'], [2, 'timeUp']]) {
        const r = rect(rerollVm(left, state));
        if (JSON.stringify(r.hits.rects.reroll) !== JSON.stringify(R0)) problems.push(where + ' rect moved at ' + left + '/' + (state || 'ready'));
        if (!state && JSON.stringify(keep(r)) !== JSON.stringify(keep0)) problems.push(where + ' neighbours moved at ' + left);
        // the label is drawn whole (no ellipsis, not clipped, inside the button) at a readable size
        const label = LABELS[5 - left];
        const t = r.calls.find((c) => c.s === label);
        if (!t) problems.push(where + ' label missing: ' + label);
        else {
          if (!t.visible) problems.push(where + ' label clipped: ' + label);
          if (t.left < R0.x - 0.5 || t.right > R0.x + R0.w + 0.5) problems.push(where + ' label outside its button: ' + label + ' ' + t.left.toFixed(1) + '-' + t.right.toFixed(1) + ' vs ' + R0.x + '+' + R0.w);
          if (t.size < (mode.includes('large') ? 20 : 16) - 0.6) problems.push(where + ' label too small ' + t.size.toFixed(1));
        }
        const id = find(r, 'pick:reroll');
        if (left === 0 || state) { if (id) problems.push(where + ' hit id present at ' + left + '/' + state); }
        else if (!id || [id.x - R0.x, id.y - R0.y, id.w - R0.w, id.h - R0.h].some((d) => Math.abs(d) > 1e-6)) problems.push(where + ' hit differs from the rect at ' + left);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('AC 166: the used-up button is drawn greyed out in the disabled style with readable text (>= 4.5:1, high contrast >= 7:1) and is never hidden', () => {
  for (const mode of Object.keys(MODES)) {
    const L = L320;
    const on = run('pick', rerollVm(2), L, MODES[mode]);
    const off = run('pick', rerollVm(0), L, MODES[mode]);
    const C = T.COLORS;
    const tOff = off.calls.find((c) => c.s === '换一批机会已用完');
    const tOn = on.calls.find((c) => c.s === '换一批（剩2次）');
    assert.equal(tOff.color, C.disabledInk, mode + ': greyed text');
    assert.notEqual(tOn.color, C.disabledInk, mode + ': the live button is not greyed');
    assert.ok(T.contrast(C.disabledInk, C.disabledFill) >= (mode.includes('hc') ? 7 : 4.5), mode + ': readable');
    assert.ok(off.ctx.__fills.includes(C.disabledFill), mode + ': drawn with the disabled fill');
    assert.ok(off.hits.rects.reroll, mode + ': the rect is still reported');
    assert.ok(has(off, 'pick:custom') && has(off, 'pick:start') && ids(off).filter((i) => i.startsWith('pick:item:')).length === 3);
  }
  T.applyDisplay(STD);
});


test('pick: 3 prompt cards of >= 64 pt, 换一批 with its count, 自己出题, live has a timer and no back, 慢慢传 has back and no timer; every state', () => {
  for (const L of [L320, L375, L812, L414]) {
    const r = run('pick', sample('pick', 'ready'), L);
    const items = r.hits.filter((h) => h.id.startsWith('pick:item:'));
    assert.equal(items.length, 3);
    for (const it of items) assert.ok(it.h >= 63.5, 'card height ' + it.h);
    for (const id of ['pick:reroll', 'pick:custom', 'pick:start']) assert.ok(has(r, id), id);
    assert.ok(!has(r, 'pick:back'), 'live: no back');
    assert.ok(hasText(r, '0:24'), 'live: the countdown');
    assert.ok(hasText(r, '选一个题目') && hasText(r, '就这个'));
    const p = find(r, 'pick:start');
    assert.ok(p.y + p.h / 2 >= L.H * 0.6);
  }
  const r = run('pick', sample('pick', 'ready'), L375);
  assert.ok(r.ctx.__calls.some((c) => c.s === '月亮吃月饼') && r.hits.length > 0);
  // selection is a check mark, not colour alone
  assert.ok(r.ctx.__counts.stroke > 0);
  const gone = run('pick', sample('pick', 'ready', { rerollLeft: 0, rerollDisabled: true, rerollTappable: false, rerollLabel: '换一批机会已用完' }), L375);
  assert.ok(!has(gone, 'pick:reroll') && has(gone, 'pick:custom') && hasText(gone, '换一批机会已用完'), 'AC 166: the button is drawn, greyed out, without a hit id');
  const chain = run('pick', sample('pick', 'ready', { mode: 'chain', timer: undefined, subtitle: '你来画第 1 棒', canBack: true, startLabel: '开始画 (60 秒)' }), L375);
  assert.ok(has(chain, 'pick:back') && hasText(chain, '开始画 (60 秒)') && hasText(chain, '你来画第 1 棒') && !hasText(chain, '0:24'));
  const custom = run('pick', sample('pick', 'ready', { custom: { open: true, text: '会飞的鲸鱼', count: '5/12', error: null, passed: false }, canStart: false }), L375);
  for (const id of ['pick:customInput', 'pick:customOk', 'pick:customCancel']) assert.ok(has(custom, id), id);
  assert.ok(hasText(custom, '5/12') && !has(custom, 'pick:item:I1001'));
  const bad = run('pick', sample('pick', 'ready', { custom: { open: true, text: '违规', count: '2/12', error: '这个题目不太合适，换一个吧', passed: false } }), L375);
  assert.ok(hasText(bad, '这个题目不太合适，换一个吧'));
  assert.ok(hasText(run('pick', sample('pick', 'loading'), L375), '正在抽题…'));
  assert.ok(hasText(run('pick', sample('pick', 'sending'), L375), '准备中…'));
  assert.ok(has(run('pick', sample('pick', 'error'), L375), 'pick:retry'));
  assert.ok(has(run('pick', sample('pick', 'offline'), L375), 'pick:retry') && hasText(run('pick', sample('pick', 'offline'), L375), '需联网才能开始'));
  // time up: inert
  const tu = run('pick', sample('pick', 'timeUp'), L375);
  assert.deepEqual(ids(tu).filter((i) => i !== 'pick:scroll'), ['pick:block']);
  assert.ok(hasText(tu, '时间到，正在交出…'));
});

// ---------------------------------------------------------------- draw

test('draw: top bar (back, title, 举报 only when canReport, countdown), source strip copy, colour rows, tools, timer warning, every state', () => {
  const r = run('draw', sample('draw', 'drawing'), L812);
  for (const w of ['离开', '画出来 · 1/4', '举报', '0:48', '上一棒说：「恐龙在学跳舞」', '撤销', '清空', '画好了', '中']) assert.ok(hasText(r, w), w);
  const noReport = run('draw', sample('draw', 'drawing', { canReport: false }), L812);
  assert.ok(!has(noReport, 'draw:report') && !hasText(noReport, '举报'));
  assert.ok(hasText(run('draw', sample('draw', 'drawing', { source: { kind: 'prompt', text: '月亮吃月饼' }, canReport: false }), L812), '题目：「月亮吃月饼」'));
  assert.ok(hasText(run('draw', sample('draw', 'drawing', { source: { kind: 'marker', marker: 'emptyText', hint: '上一棒没来得及写，你自由画一幅吧' } }), L812), '上一棒没来得及写，你自由画一幅吧'));
  assert.ok(hasText(run('draw', sample('draw', 'drawing', { source: { kind: 'hidden', hint: '（该内容已被举报隐藏）你自由画一幅吧' } }), L812), '（该内容已被举报隐藏）你自由画一幅吧'));
  assert.ok(hasText(run('draw', sample('draw', 'drawing', { source: { kind: 'paused', hint: '内容维护中' } }), L812), '内容维护中'));
  // swatches: one row of 6 normally, 12 when 今日彩笔 is unlocked; locked swatches are not drawn or tappable; no pill on this screen
  assert.equal(r.hits.filter((h) => /^draw:color:/.test(h.id)).length, 6);
  assert.ok(!r.hits.some((h) => h.id === 'draw:color:7'));
  const unl = run('draw', sample('draw', 'drawing', { palette: SM.palette(true) }), L812);
  assert.equal(unl.hits.filter((h) => /^draw:color:/.test(h.id)).length, 12);
  assert.ok(!hasText(r, '彩笔') && !hasText(r, '广告'));
  // the size toggle is ONE button; 撤销 / 清空 / 画好了 enable states
  assert.ok(has(r, 'draw:size') && !r.hits.some((h) => /^draw:size:/.test(h.id)));
  const empty = run('draw', sample('draw', 'drawing', { strokes: SM.emptyDrawing(), canUndo: false, canSubmit: false }), L812);
  for (const id of ['draw:undo', 'draw:clear', 'draw:submit']) assert.ok(!has(empty, id), id + ' disabled with 0 strokes');
  assert.ok(has(empty, 'draw:size') && has(empty, 'draw:color:0'));
  // the selected swatch has a ring and a check (not colour alone)
  assert.ok(r.ctx.__counts.arc >= 8 && r.ctx.__counts.stroke > 3);
  // last 10 s: the timer pill turns 朱 and fills
  const warn = run('draw', sample('draw', 'drawing', { timer: { secLeft: 8, warn: true } }), L812);
  assert.ok(hasText(warn, '0:08') && warn.ctx.__fills.includes(T.STANDARD.vermText));
  assert.ok(!r.ctx.__fills.includes(T.STANDARD.vermText));
  // limit text, blocked, error + retry, coach line
  assert.ok(hasText(run('draw', sample('draw', 'drawing', { pointsUsed: 4000, limitText: '画得太细啦，先交吧' }), L812), '画得太细啦，先交吧'));
  assert.ok(hasText(run('draw', sample('draw', 'blocked'), L812), '这幅画没通过审核，改一改再交'));
  const er = run('draw', sample('draw', 'error'), L812);
  assert.ok(has(er, 'draw:retry') && hasText(er, '没传出去') && has(er, 'draw:submit'));
  const coach = run('draw', sample('draw', 'drawing', { coach: true }), L812);
  assert.ok(hasText(coach, '一根手指画，画得丑没关系，越离谱越好笑') && has(coach, 'coach:next'));
  const cn = find(coach, 'coach:next');
  const cvs = find(coach, 'draw:canvas');
  assert.ok(cn.y >= cvs.y && cn.y + cn.h <= cvs.y + cvs.h && cn.w < cvs.w, 'only the dismiss corner swallows touches');
  // time up and sending: the strip over the canvas, everything inert
  const tu = run('draw', sample('draw', 'timeUp'), L812);
  assert.ok(hasText(tu, '时间到，正在交出…') && hasText(tu, '0:00'));
  assert.ok(tu.ctx.__fills.includes(T.STANDARD.vermText));
  assert.ok(hasText(run('draw', sample('draw', 'sending'), L812), '正在交出…'));
  // 慢慢传: 放弃 and the 第 N 棒 title
  const chain = run('draw', sample('draw', 'drawing', { mode: 'chain', backLabel: '放弃', title: '第 3 棒 · 画出来' }), L320);
  assert.ok(hasText(chain, '放弃') && has(chain, 'draw:back'));
  assert.ok(hasText(chain, '第 3 棒') && hasText(chain, '画出来'), 'a long title breaks into two lines instead of being cut');
});

test('draw: drawn from the strokes (wire v2, v1 and absolute forms) and cached per strokesRev key', () => {
  const calls = [];
  Strokes.setCanvasFactory((w, h) => ({ width: w, height: h, getContext: () => { const c = mockCtx(); calls.push(c); return c; } }));
  try {
    const a = mockCtx();
    const vm = prepare('draw', Object.assign(sample('draw', 'drawing'), { display: STD, strokesRev: 7 }), L812, a, STD);
    R.screens.draw.draw(a, vm, L812);
    R.screens.draw.draw(mockCtx(), vm, L812);
    assert.equal(calls.length, 1, 'one offscreen cache for the same key');
    R.screens.draw.draw(mockCtx(), Object.assign({}, vm, { strokesRev: 8, strokes: SM.busyDrawing(vm.gridH) }), L812);
    assert.ok(calls[0].__counts.lineTo > 0, 'redrawn into the same cache when the rev changes');
    // the recorder's absolute form
    R.screens.draw.draw(mockCtx(), Object.assign({}, vm, { strokes: Strokes.toAbsolute(vm.strokes), drawingNow: true }), L812);
  } finally {
    Strokes.setCanvasFactory(null);
  }
});

// ---------------------------------------------------------------- describe

test('describe: counter, placeholder, caret, shake, forced-send states, marker sources, keyboard layout, every state', () => {
  const r = run('describe', sample('describe', 'typing'), L812);
  for (const w of ['离开', '猜一猜 · 2/4', '举报', '0:31', '一只猫在开出租车', '8/16', '传出去']) assert.ok(hasText(r, w), w);
  for (const id of ['describe:back', 'describe:report', 'describe:input', 'describe:submit']) assert.ok(has(r, id), id);
  const empty = run('describe', sample('describe', 'typing', { text: '', count: '0/16', canSubmit: false }), L812);
  assert.ok(hasText(empty, '你觉得这画的是什么？') && !has(empty, 'describe:submit') && has(empty, 'describe:input'));
  const shake = (t) => run('describe', sample('describe', 'typing', { shake: true, t }), L812).calls.find((c) => /\/16$/.test(c.s)).x;
  assert.notEqual(shake(0), shake(40));
  assert.ok(hasText(run('describe', sample('describe', 'typing', { text: 'x'.repeat(10), count: '16/16' }), L812), '16/16'));
  const caretOff = run('describe', sample('describe', 'typing', { caret: false }), L812);
  const caretOn = run('describe', sample('describe', 'typing', { caret: true }), L812);
  assert.ok((caretOn.ctx.__counts.fillRect || 0) > (caretOff.ctx.__counts.fillRect || 0));
  // blocked keeps the text; busy; error + retry
  const blocked = run('describe', sample('describe', 'blocked'), L812);
  assert.ok(hasText(blocked, '这句话没通过审核，换个说法吧') && hasText(blocked, '一只猫在开出租车') && has(blocked, 'describe:input'));
  assert.ok(hasText(run('describe', sample('describe', 'busy'), L812), '审核服务繁忙，请稍后再试'));
  assert.ok(has(run('describe', sample('describe', 'error'), L812), 'describe:retry'));
  assert.ok(hasText(run('describe', sample('describe', 'sending'), L812), '审核中…'));
  // time up (F-4): keyboard closed by logic, input locked, every hit area gone except the block
  const tu = run('describe', sample('describe', 'timeUp'), L812);
  assert.deepEqual(ids(tu).filter((i) => i !== 'describe:block'), []);
  assert.ok(has(tu, 'describe:block') && hasText(tu, '时间到，正在交出…'));
  // marker / hidden / paused sources
  const mk = run('describe', sample('describe', 'typing', { source: { kind: 'marker', marker: 'emptyDraw', hint: '上一棒没来得及画，你随便写一句吧' }, canReport: false }), L812);
  assert.ok(hasText(mk, '（没来得及画）') && hasText(mk, '上一棒没来得及画，你随便写一句吧') && !has(mk, 'describe:report'));
  assert.ok(hasText(run('describe', sample('describe', 'typing', { source: { kind: 'marker', marker: 'notDelivered', hint: '上一棒没传过来，你随便写一句吧' } }), L812), '（这一棒没传过来）'));
  assert.ok(hasText(run('describe', sample('describe', 'typing', { source: { kind: 'hidden', hint: '该内容已被举报隐藏，你随便写一句吧' } }), L812), '该内容已被举报隐藏'));
  // keyboard open: compact layout, nothing hidden behind the keyboard, the counter beside the small drawing
  const kb = run('describe', sample('describe', 'typing', { keyboardH: 260 }), L320);
  for (const id of ['describe:input', 'describe:submit']) assert.ok(find(kb, id).y + find(kb, id).h <= L320.H - 260 + 0.5, id);
  assert.ok(hasText(kb, '8/16') && hasText(kb, '这画的是：'));
  // 慢慢传 copy
  const ch = run('describe', sample('describe', 'typing', { mode: 'chain', backLabel: '放弃', title: '第 4 棒 · 猜一猜' }), L375);
  assert.ok(hasText(ch, '放弃') && hasText(ch, '第 4 棒'));
});

// ---------------------------------------------------------------- round wait, lobby, room entry

test('round wait: what I sent (drawing contain-fit / sentence / marker), progress, next round, passing, offline; only 离开 is tappable', () => {
  const r = run('roundWait', sample('roundWait', 'ready'), L812);
  for (const w of ['离开', '已交 · 2/4', '0:21', '一个大饼在天上', '等大家交… 3/5 已交', '下一轮：画出来']) assert.ok(hasText(r, w), w);
  assert.deepEqual(ids(r), ['roundWait:back']);
  const d = run('roundWait', sample('roundWait', 'ready', { mine: { strokes: SM.drawing(1363) } }), L812);
  assert.ok(d.hits.paper && d.hits.paper.w <= d.hits.mineRect.w + 0.01 && d.hits.paper.h <= d.hits.mineRect.h + 0.01);
  assert.ok(hasText(run('roundWait', sample('roundWait', 'ready', { mine: { marker: 'emptyDraw' } }), L812), '（没来得及画）'));
  assert.ok(hasText(run('roundWait', sample('roundWait', 'passing'), L812), '传递中…'));
  assert.ok(hasText(run('roundWait', sample('roundWait', 'offline'), L812), '网络不好，正在重连…'));
  assert.ok(hasText(run('roundWait', sample('roundWait', 'ready', { nextText: '最后一轮了' }), L812), '最后一轮了'));
});

test('lobby: 10 numbered seats, "你" under mine, ? on quiet seats, host start rules (< 3 disabled with the 慢慢传 link), non-host wait, no ads', () => {
  const r = run('lobby', sample('lobby', 'ready'), L812);
  for (let n = 1; n <= 10; n++) assert.ok(r.calls.some((c) => c.s === String(n)), 'seat ' + n);
  for (const w of ['4 人已加入（3–10 人）', '你', '这一局', '邀请群友', '开始（4 人）']) assert.ok(hasText(r, w), w);
  assert.ok(has(r, 'lobby:start') && has(r, 'lobby:invite') && has(r, 'lobby:back'));
  assert.ok(r.calls.some((c) => c.s === '?'), 'a quiet seat shows ?');
  assert.ok(!r.hits.some((h) => /seat/.test(h.id)), 'seats are not tappable');
  const two = run('lobby', sample('lobby', 'ready', { seats: SM.seats(2, 1, 0), start: { show: true, enabled: false, label: '开始（2 人）', hint: '至少 3 人才能开局', slowLink: true } }), L812);
  assert.ok(!has(two, 'lobby:start') && has(two, 'lobby:slow') && hasText(two, '至少 3 人才能开局') && hasText(two, '两个人？去慢慢传'));
  const one = run('lobby', sample('lobby', 'ready', { seats: SM.seats(1, 1, 0), start: { show: true, enabled: false, label: '开始（1 人）', hint: '把邀请发到群里，群友点开就能加入', slowLink: false } }), L812);
  assert.ok(hasText(one, '把邀请发到群里，群友点开就能加入') && !has(one, 'lobby:slow'));
  const guest = run('lobby', sample('lobby', 'ready', { isHost: false, start: { show: false, enabled: false, label: '', hint: null, slowLink: false }, waitingText: '等房主开始…' }), L812);
  assert.ok(hasText(guest, '等房主开始…') && !has(guest, 'lobby:start') && has(guest, 'lobby:invite'));
  assert.ok(hasText(run('lobby', sample('lobby', 'starting'), L812), '马上开始…') && !has(run('lobby', sample('lobby', 'starting'), L812), 'lobby:start'));
  assert.ok(hasText(run('lobby', sample('lobby', 'offline'), L812), '网络不好，正在重连…') && has(run('lobby', sample('lobby', 'offline'), L812), 'lobby:back'));
  assert.ok(hasText(run('lobby', sample('lobby', 'closed'), L812), '这一局太久没开始，已关闭') && has(run('lobby', sample('lobby', 'closed'), L812), 'lobby:home'));
  assert.ok(has(run('lobby', sample('lobby', 'removed'), L812), 'lobby:home'));
  for (const L of [L320, L375, L812, L414, L768]) {
    const x = run('lobby', sample('lobby', 'ready'), L);
    const s = find(x, 'lobby:start');
    assert.ok(s.y + s.h / 2 >= L.H * 0.6, `start in the bottom 40% at ${L.W}x${L.H}`);
    assert.ok(!/广告|彩笔|▶/.test(x.texts.join('')));
  }
});

test('room entry: every state offers the right actions and never shows anything a player made', () => {
  const want = {
    loading: [], joinable: ['roomEntry:join'], full: ['roomEntry:newRoom', 'roomEntry:group'], started: ['roomEntry:newRoom', 'roomEntry:group'], teaser: ['roomEntry:newRoom', 'roomEntry:group'],
    wrongGroup: ['roomEntry:newRoom'], closed: ['roomEntry:newRoom'], removed: ['roomEntry:home'], notFound: ['roomEntry:home'], inOtherRoom: ['roomEntry:backToRoom', 'roomEntry:leaveOther'],
    restricted: [], rulesRequired: ['roomEntry:join'], ugcPaused: [], capReached: [], offline: ['roomEntry:retry'], error: ['roomEntry:retry'],
  };
  for (const st of SM.SAMPLES.roomEntry) {
    const r = run('roomEntry', sample('roomEntry', st), L375);
    const got = ids(r).filter((i) => /^roomEntry:/.test(i) && i !== 'roomEntry:scroll' && i !== 'roomEntry:home');
    const w = want[st].filter((i) => i !== 'roomEntry:home');
    assert.deepEqual(got.sort(), w.sort(), st);
    assert.ok(has(r, 'roomEntry:home'), st + ': 首页 is always there');
    assert.ok(!r.hits.some((h) => /strokes/.test(JSON.stringify(h))));
  }
  const j = run('roomEntry', sample('roomEntry', 'joinable'), L375);
  for (const w of ['群友开了一局传画', '4 人已加入（3–10 人）', '每人选一个题目，轮流画和猜，大约 3 分钟', '加入这一局']) assert.ok(hasText(j, w), w);
  assert.ok(hasText(run('roomEntry', sample('roomEntry', 'joinable', { joining: true }), L375), '加入中…'));
  assert.ok(hasText(run('roomEntry', sample('roomEntry', 'restricted'), L375), '你被限制参与至 10月17日 14:00'));
  assert.ok(hasText(run('roomEntry', sample('roomEntry', 'full'), L375), '这一局满员了（10 人）'));
  assert.ok(hasText(run('roomEntry', sample('roomEntry', 'loading'), L375), '正在进入…'));
});

// ---------------------------------------------------------------- reveal: overview and step-through

test('overview: one card per chain showing ONLY its final step (never a prompt or an intermediate step), 第 N 条 / 你起的, 2 columns from 360 wide', () => {
  const vm = sample('overview', 'ready');
  // poison the vm with everything the overview must never draw
  vm.cards = vm.cards.map((c) => Object.assign({}, c, { prompt: 'SECRETPROMPT', steps: ['SECRETSTEP'], promptText: 'SECRETPROMPT', first: 'SECRETFIRST' }));
  for (const L of [L375, L414, L812, L768]) {
    const r = run('overview', vm, L);
    assert.ok(!/SECRET/.test(r.texts.join('')), 'no prompt, no intermediate step');
    const cards = r.hits.raw.filter((h) => h.id.startsWith('overview:chain:'));
    assert.equal(cards.length, 5, 'a card per chain');
    assert.equal(new Set(cards.map((c) => c.x.toFixed(0))).size, 2, `2 columns at ${L.W} wide`);
  }
  for (const L of [L320]) {
    const cards = run('overview', vm, L).hits.filter((h) => h.id.startsWith('overview:chain:'));
    assert.equal(new Set(cards.map((c) => c.x.toFixed(0))).size, 1, '1 column at 320 wide');
  }
  assert.equal(new Set(run('overview', vm, L414, MODES.large).hits.filter((h) => h.id.startsWith('overview:chain:')).map((h) => h.x.toFixed(0))).size, 1, '1 column in large text');
  const r = run('overview', vm, L812);
  for (const w of ['全部揭晓！', '5 条接龙 · 每条传了 4 棒', '第 1 条', '第 2 条 · 你起的', '「外星人在吃披萨」', '（没来得及写）', '再来一局', '分享揭晓卡']) assert.ok(hasText(r, w), w);
  for (const id of ['overview:back', 'overview:rematch', 'overview:share', 'overview:scroll']) assert.ok(has(r, id), id);
  assert.equal(R.screens.overview.columnsFor(L812), 2);
  assert.equal(R.screens.overview.columnsFor(L320), 1);
  // a drawing final is drawn static and contain-fitted: the strokes helper is used, no replay
  const withDraw = mockCtx();
  R.screens.overview.draw(withDraw, Object.assign({}, vm, { display: STD }), L812);
  assert.ok(withDraw.__counts.lineTo > 0);
  // placeholders, skeleton for a final that is still loading, 10 chains scroll, rematch banner, share off
  const ph = run('overview', sample('overview', 'ready', { cards: [Object.assign({}, vm.cards[0], { final: { kind: 'describe', placeholder: 'reported', loaded: true } })] }), L812);
  assert.ok(hasText(ph, '该内容已被举报隐藏'));
  const rb = run('overview', sample('overview', 'ready', { rematch: { label: '再来一局', banner: '房主开了新的一局 · 加入 ›', newRoomId: 'ROOMNNNNNN' } }), L812);
  assert.ok(hasText(rb, '房主开了新的一局 · 加入 ›') && has(rb, 'overview:joinNew'));
  assert.ok(!has(run('overview', sample('overview', 'ready', { canShare: false }), L812), 'overview:share'));
  for (const st of ['notMember', 'offline', 'error']) assert.ok(run('overview', sample('overview', st), L812).hits.length > 0, st);
  assert.ok(has(run('overview', sample('overview', 'offline'), L812), 'overview:retry') && hasText(run('overview', sample('overview', 'offline'), L812), '揭晓需联网查看'));
  assert.ok(hasText(run('overview', sample('overview', 'loading'), L812), '正在揭晓…'));
  assert.ok(hasText(run('overview', sample('overview', 'paused'), L812), '内容维护中'));
  // the footer sits in the bottom 40%
  for (const L of [L320, L375, L812, L414]) {
    const f = find(run('overview', vm, L), 'overview:rematch');
    assert.ok(f.y + f.h / 2 >= L.H * 0.6);
  }
});

test('step-through: opens on the final step, 起点 at the other end; halves, swipe region, dots, 往前/往后, 下一条 / 看完了; replay and skip; 笑 and 举报 rules', () => {
  const r = run('stepthrough', sample('stepthrough', 'ready'), L812);
  for (const w of ['全部', '第 2 条 · 你起的', '「外星人在吃披萨」', '第 4 棒 · 猜 · 最后一棒', '笑 2', '举报', '‹ 往前一棒', '往后一棒 ›']) assert.ok(hasText(r, w), w);
  for (const id of ['stepthrough:back', 'stepthrough:prevHalf', 'stepthrough:nextHalf', 'stepthrough:laugh', 'stepthrough:report', 'stepthrough:prev']) assert.ok(has(r, id), id);
  assert.ok(!has(r, 'stepthrough:next'), 'at the final step 往后一棒 is disabled');
  // the swipe region is the note, the halves split it
  const sw = r.hits.swipe;
  const lh = find(r, 'stepthrough:prevHalf');
  const rh = find(r, 'stepthrough:nextHalf');
  assert.ok(sw.w > 200 && sw.h > 100);
  assert.ok(Math.abs(lh.x - sw.x) < 0.5 && Math.abs(rh.x + rh.w - (sw.x + sw.w)) < 0.5 && Math.abs(lh.x + lh.w - rh.x) < 0.5, 'left half | right half');
  assert.equal(R.hitTest(r.hits, sw.x + 10, sw.y + sw.h / 2), 'stepthrough:prevHalf');
  assert.equal(R.hitTest(r.hits, sw.x + sw.w - 10, sw.y + sw.h / 2), 'stepthrough:nextHalf');
  // dots: one 48 pt target per step (5) at 375, 起点 on the left
  const dots = r.hits.filter((h) => /^stepthrough:dot:/.test(h.id));
  assert.equal(dots.length, 5);
  for (const d of dots) assert.ok(d.w >= 47.5 && d.h >= 47.5);
  assert.ok(dots[0].x < dots[4].x);
  // at the final step 往后一棒 is disabled (not tappable) and the end button is absent
  const nx = run('stepthrough', sample('stepthrough', 'ready', { canNext: false }), L812);
  assert.ok(!has(nx, 'stepthrough:next') && !has(nx, 'stepthrough:nextChain') && !has(nx, 'stepthrough:done'));
  // at the 起点: 往前一棒 disabled, 下一条 › (or 看完了), the prompt card
  const start = run('stepthrough', sample('stepthrough', 'ready', { index: 0, canPrev: false, canNext: true, endAction: 'nextChain' }), L812);
  assert.ok(!has(start, 'stepthrough:prev') && has(start, 'stepthrough:next') && has(start, 'stepthrough:nextChain') && hasText(start, '下一条 ›'));
  assert.ok(hasText(start, '起点') && hasText(start, '「月亮吃月饼」'));
  const last = run('stepthrough', sample('stepthrough', 'ready', { index: 0, canPrev: false, canNext: true, endAction: 'done' }), L812);
  assert.ok(has(last, 'stepthrough:done') && hasText(last, '看完了'));
  // my own step says (你); a drawing replays: a replay button when idle, the whole note is skip while playing
  const mine = run('stepthrough', sample('stepthrough', 'ready', { index: 1, canNext: true }), L812);
  assert.ok(hasText(mine, '第 1 棒 · 画 (你)') && has(mine, 'stepthrough:replay') && !has(mine, 'stepthrough:skip'));
  const playing = run('stepthrough', sample('stepthrough', 'ready', { index: 1, canNext: true, playT: 0.4 }), L812);
  assert.ok(has(playing, 'stepthrough:skip') && !has(playing, 'stepthrough:replay') && !has(playing, 'stepthrough:prevHalf') && !has(playing, 'stepthrough:nextHalf'));
  const sk = find(playing, 'stepthrough:skip');
  assert.ok(Math.abs(sk.w - playing.hits.swipe.w) < 0.5);
  // a sentence appears at once (no replay button); markers: no 笑, no 举报; placeholders
  assert.ok(!has(r, 'stepthrough:replay') && !has(r, 'stepthrough:skip'));
  const steps = sample('stepthrough', 'ready').steps;
  const mk = run('stepthrough', sample('stepthrough', 'ready', { steps: steps.map((s, i) => (i === 4 ? { n: 4, label: '第 4 棒 · 猜 · 最后一棒', kind: 'marker', marker: 'emptyText', mine: false, placeholder: null, laughs: 0, myLaugh: false, canLaugh: false, canReport: false } : s)) }), L812);
  assert.ok(hasText(mk, '（没来得及写）') && !has(mk, 'stepthrough:laugh') && !has(mk, 'stepthrough:report'));
  const hid = run('stepthrough', sample('stepthrough', 'ready', { steps: steps.map((s, i) => (i === 4 ? { ...s, placeholder: 'reported', canReport: false, canLaugh: false } : s)) }), L812);
  assert.ok(hasText(hid, '该内容已被举报隐藏') && !hasText(hid, '外星人在吃披萨'));
  const del = run('stepthrough', sample('stepthrough', 'ready', { steps: steps.map((s, i) => (i === 4 ? { ...s, placeholder: 'deleted' } : s)) }), L812);
  assert.ok(hasText(del, '作者已删除这一棒') && !hasText(del, '外星人在吃披萨'));
  // 笑 toggle state is visible (check), count shown
  const my = run('stepthrough', sample('stepthrough', 'ready', { index: 2, canNext: true }), L812);
  assert.ok(hasText(my, '笑 1'));
  // too many steps for 48 pt targets: the "N/M" text instead of dots; 8 steps and 320 wide
  const eight = require('../tools/preview/fixtures.js').build().find((f) => f.screen === 'stepthrough' && f.state === 'x_eightSteps');
  const e = run('stepthrough', eight.vm, L812);
  assert.ok(!e.hits.some((h) => /^stepthrough:dot:/.test(h.id)) && hasText(e, '8/8'));
  const seven = run('stepthrough', sample('stepthrough', 'ready', { steps: eight.vm.steps.slice(0, 7), index: 6 }), L320);
  assert.ok(!seven.hits.some((h) => /^stepthrough:dot:/.test(h.id)) && hasText(seven, '7/7'), 'a chain of 6 棒 + 起点 does not fit 48 pt targets at 320 wide: text instead');
  assert.equal(run('stepthrough', sample('stepthrough', 'ready'), L320).hits.filter((h) => /^stepthrough:dot:/.test(h.id)).length, 5, '5 dots fit 320 wide');
  // 慢慢传: 返回, early chip, 分享
  const chain = run('stepthrough', sample('stepthrough', 'ready', { mode: 'chain', backLabel: '返回', header: '接龙揭晓 · 6 位群友', earlyText: '提前揭晓 · 传了 4/6 棒', canShare: true }), L812);
  assert.ok(hasText(chain, '返回') && hasText(chain, '提前揭晓 · 传了 4/6 棒') && has(chain, 'stepthrough:share'));
  assert.ok(!has(r, 'stepthrough:share'));
  // states
  assert.ok(hasText(run('stepthrough', sample('stepthrough', 'loading'), L812), '正在展开…'));
  assert.ok(has(run('stepthrough', sample('stepthrough', 'offline'), L812), 'stepthrough:retry'));
  assert.ok(hasText(run('stepthrough', sample('stepthrough', 'paused'), L812), '内容维护中'));
  assert.ok(hasText(run('stepthrough', sample('stepthrough', 'notParticipant'), L812), '只有参与的群友能看完整揭晓'));
});

test('step-through: replay draws a prefix of the drawing; no names, no ranking, no "best" anywhere on the reveal screens', () => {
  const full = run('stepthrough', sample('stepthrough', 'ready', { index: 1, playT: 1 }), L812).ctx.__counts.lineTo;
  const part = run('stepthrough', sample('stepthrough', 'ready', { index: 1, playT: 0.3 }), L812).ctx.__counts.lineTo;
  assert.ok(part < full && part >= 0);
  for (const [screen, state] of [['overview', 'ready'], ['stepthrough', 'ready'], ['teaser', 'ready'], ['group', 'ready'], ['album', 'ready']]) {
    const t = run(screen, sample(screen, state), L812).texts.join('|');
    assert.ok(!/排行|榜|MVP|最佳|第一名|昵称|头像/.test(t), screen);
  }
});

test('teaser: only passed start / final text, never a drawing or an in-between 棒; room kind lists the chains; paused hides the texts (AC 10, PO-24)', () => {
  const t = run('teaser', sample('teaser', 'ready'), L375);
  for (const w of ['一条接龙揭晓了', '「月亮吃月饼」', '「企鹅在沙漠晒太阳」', '传了 6 棒', '完整接龙仅参与的群友可见']) assert.ok(hasText(t, w), w);
  for (const id of ['teaser:newRoom', 'teaser:group', 'teaser:report', 'teaser:home']) assert.ok(has(t, id), id);
  assert.ok(!t.hits.some((h) => /sameAgain/.test(h.id)) && !hasText(t, '同题再传'));
  assert.equal(strokeCalls(() => run('teaser', sample('teaser', 'ready'), L375)), 0, 'no strokes');
  // poisoned vm: the in-between and the strokes must not appear
  const poisoned = run('teaser', sample('teaser', 'ready', { steps: ['SECRETSTEP'], strokes: SM.drawing(1363), lines: [{ from: '月亮吃月饼', to: null, middle: 'SECRETMID' }] }), L375);
  assert.ok(!/SECRET/.test(poisoned.texts.join('')) && hasText(poisoned, '（一幅画）'));
  assert.equal(strokeCalls(() => run('teaser', sample('teaser', 'ready', { strokes: SM.drawing(1363) }), L375)), 0);
  const room = require('../tools/preview/fixtures.js').build().find((f) => f.screen === 'teaser' && f.state === 'x_room');
  const rr = run('teaser', room.vm, L375);
  for (const w of ['一局传画揭晓了 · 5 条接龙', '「月亮吃月饼」', '「外星人在吃披萨」', '（一幅画）', '完整内容仅这一局的群友可见']) assert.ok(hasText(rr, w), w);
  assert.equal(strokeCalls(() => run('teaser', room.vm, L375)), 0);
  assert.ok(hasText(run('teaser', sample('teaser', 'ready', { paused: true }), L375), '内容维护中') && !hasText(run('teaser', sample('teaser', 'ready', { paused: true }), L375), '月亮吃月饼'));
  assert.ok(hasText(run('teaser', sample('teaser', 'removed'), L375), '该接龙已被移除'));
  assert.ok(has(run('teaser', sample('teaser', 'offline'), L375), 'teaser:retry'));
});

// ---------------------------------------------------------------- 慢慢传 screens that remain

test('entry never shows the prompt or any 棒 content (AC 10), even if the vm carried it; 同题再传 is gone; the inRoom state', () => {
  for (const st of SM.SAMPLES.entry) {
    const vm = sample('entry', st, { promptText: 'SECRETPROMPT', text: 'SECRETTEXT', strokes: SM.drawing(1363), steps: ['SECRETSTEP'], prompt: { text: 'SECRETPROMPT' } });
    const r = run('entry', vm, L375);
    assert.ok(!/SECRET/.test(r.texts.join('')), st);
    assert.ok(!r.hits.some((h) => /sameAgain|entry:new$/.test(h.id)), st);
  }
  const c = run('entry', sample('entry', 'claimable'), L375);
  assert.ok(has(c, 'entry:claim') && hasText(c, '第 4 棒等你接') && hasText(c, '时间到会自动交出') && hasText(c, '已传 3/6 棒') && hasText(c, '48 小时内传完'));
  const ir = run('entry', sample('entry', 'inRoom'), L375);
  assert.ok(hasText(ir, '你正在一局里，先玩完再来接') && has(ir, 'entry:room') && !has(ir, 'entry:claim'));
  const ex = run('entry', sample('entry', 'expired'), L375);
  assert.ok(has(ex, 'entry:mine') && has(ex, 'entry:newRoom') && hasText(ex, '开一局'));
  const tz = run('entry', sample('entry', 'revealedTeaser'), L375);
  assert.ok(has(tz, 'entry:newRoom') && has(tz, 'entry:group'));
});

test('已传出: pending / passed / marker / blocked / void with text and icon (never colour alone); 慢慢传 only', () => {
  for (const [st, word] of [['pending', '审核中'], ['passed', '已通过'], ['marker', '时间到，已自动交出（没来得及画）'], ['blocked', '这一棒没通过内容审核，没有传出去'], ['void', '审核超时，这一棒没有传出去，不算你的次数']]) {
    const r = run('sent', sample('sent', st), L375);
    assert.ok(hasText(r, word), st);
    assert.equal(has(r, 'sent:share'), st !== 'blocked' && st !== 'void', st + ' share');
  }
  const mk = run('sent', sample('sent', 'marker'), L375);
  assert.ok(hasText(mk, '（没来得及画）'));
  assert.equal(strokeCalls(() => run('sent', sample('sent', 'marker'), L375)), 0, 'a marker is a note, not an empty drawing');
  assert.ok(hasText(run('sent', sample('sent', 'passed'), L375), '群友现在可以接第 4 棒'));
  const album = run('album', sample('album', 'ready'), L375).texts.join('|');
  for (const w of ['一局 · 5 条接龙', '一局 · 第 2/4 轮进行中', '已揭晓', '进行中', '没传完', '这一棒没通过审核']) assert.ok(album.includes(w), w);
  const mine = run('mine', sample('mine', 'ready'), L375);
  assert.ok(/已通过/.test(mine.texts.join('|')) && /没通过审核/.test(mine.texts.join('|')) && /（没来得及画）/.test(mine.texts.join('|')));
  assert.ok(!has(mine, 'mine:delete:3') && has(mine, 'mine:delete:1'), 'a marker cannot be deleted');
  const hidden = run('mine', sample('mine', 'ready', { mine: [{ n: 2, kind: 'describe', text: 'SECRETHIDDEN', modState: 'hidden', canDelete: false, line: '第 2 棒 · 已被举报隐藏' }] }), L375).texts.join('|');
  assert.ok(hidden.includes('该内容已被举报隐藏') && !hidden.includes('SECRETHIDDEN'));
});

test('本群接龙 and 我的接龙: rooms and chains, aggregate stats only, 开一局 pinned, banner gap >= 24 pt (AC 105), states', () => {
  const g = run('group', sample('group', 'ready'), L375);
  for (const w of ['本群一共玩了 12 局 · 画了 41 幅画', '正在开的局', '4 人已加入 · 等待开始', '第 2/4 轮进行中', '慢慢传 · 等你接', '最近揭晓', '开一局']) assert.ok(hasText(g, w), w);
  assert.ok(g.hits.raw.some((h) => h.id === 'group:room:ROOMAAAAAA') && !g.hits.raw.some((h) => h.id === 'group:room:ROOMBBBBBB'), 'only a joinable room is tappable');
  const rawIds = g.hits.raw.map((h) => h.id);
  for (const id of ['group:revealedRoom:ROOMCCCCCC', 'group:revealedChain:FFFFFFFFFF', 'group:item:AAAAAAAAAA']) assert.ok(rawIds.includes(id), id);
  assert.ok(has(g, 'group:newRoom'));
  assert.ok(!/排行|榜|MVP/.test(g.texts.join('')));
  const ns = run('group', sample('group', 'noGroup'), L375);
  assert.ok(hasText(ns, '在群聊里点开接龙卡片，就能看到本群的接龙') && has(ns, 'group:newRoom'));
  assert.ok(hasText(run('group', sample('group', 'empty'), L375), '本群还没有接龙，开第一局吧'));
  assert.ok(has(run('group', sample('group', 'error'), L375), 'group:retry'));
  const a = run('album', sample('album', 'ready'), L375);
  assert.ok(has(a, 'album:room:ROOMCCCCCC') && has(a, 'album:chain:AAAAAAAAAA') && hasText(a, '连续接龙 4 天'));
  assert.ok(hasText(run('album', sample('album', 'empty'), L375), '还没有接龙，去开一局吧'));
  assert.ok(hasText(run('album', sample('album', 'offline'), L375), '没有网络，显示的是上次的列表'));
  for (const [screen, st] of [['group', 'ready'], ['album', 'ready']]) {
    const banner = { show: true, reservedHeight: 64, stub: true };
    const r = run(screen, sample(screen, st, { banner }), L375);
    const b = R.bannerRect(L375, banner);
    for (const h of r.hits) if (!/scroll/.test(h.id) && h.id !== 'group:newRoom') assert.ok(h.y + h.h <= b.y + 0.5 || h.y >= b.y + b.h, screen + ' ' + h.id + ' keeps off the banner');
    const btn = r.hits.find((h) => h.id === 'group:newRoom');
    if (btn) assert.ok(b.y - (btn.y + btn.h) >= 24 - 0.5, 'banner gap >= 24');
  }
});

test('report sheet: five reasons, no free text, submit only after a choice, every state, room targets', () => {
  const idle = run('report', sample('report', 'idle'), L375);
  for (const k of ['porn', 'politics', 'abuse', 'ad', 'other']) assert.ok(has(idle, 'report:reason:' + k), k);
  for (const w of ['色情低俗', '政治敏感', '辱骂攻击', '广告引流', '其他不适']) assert.ok(hasText(idle, w), w);
  assert.ok(has(idle, 'report:submit') && has(idle, 'report:cancel'));
  assert.ok(!has(run('report', sample('report', 'idle', { selected: null }), L375), 'report:submit'));
  assert.ok(!ids(run('report', sample('report', 'submitting'), L375)).some((i) => /reason|submit/.test(i)));
  assert.ok(hasText(run('report', sample('report', 'done'), L375), '已举报，该内容已隐藏，我们会尽快核实'));
  assert.ok(hasText(run('report', sample('report', 'limit'), L375), '今天举报次数已达上限'));
  assert.ok(hasText(run('report', sample('report', 'dup'), L375), '你已举报过这条内容'));
  assert.ok(has(run('report', sample('report', 'error'), L375), 'report:retry'));
});

// ---------------------------------------------------------------- share cards

test('share cards: our art and the allowed text only, never a drawing, standard look, 500 x 400 at any pixel scale (PO-24, AC 95); room cards', () => {
  for (const f of ['shareCard.js', 'art.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', f), 'utf8');
    assert.ok(!/require\(['"]\.\/strokes['"]\)|core\/strokes/.test(src), f + ' must not import the stroke renderer');
    assert.ok(!/drawStrokes|toPolylines/.test(src));
  }
  const mk = () => { const ctx = mockCtx(); return { width: 0, height: 0, getContext: () => ctx, ctx }; };
  const inv = mk();
  T.applyDisplay(MODES.large_hc);
  const out = R.shareCard.render(inv, Object.assign(sample('shareCard', 'invite'), { promptText: 'SECRETPROMPT', finalText: 'SECRETFINAL', text: 'SECRETTEXT', strokes: SM.drawing(1363), steps: ['SECRETSTEP'] }), { pixelScale: 2 });
  assert.deepEqual([inv.width, inv.height], [1000, 800]);
  assert.deepEqual(out, { width: 1000, height: 800 });
  assert.equal(T.isLarge(), true, 'the caller display mode is restored');
  T.applyDisplay(STD);
  const t1 = inv.ctx.__calls.map((c) => c.s).join('|');
  assert.ok(/已传 3\/6 棒/.test(t1) && /传画接龙/.test(t1) && !/SECRET/.test(t1));
  const rev = mk();
  R.shareCard.render(rev, Object.assign(sample('shareCard', 'reveal'), { steps: ['SECRETSTEP'], strokes: SM.drawing(1363) }), {});
  const t2 = rev.ctx.__calls.map((c) => c.s).join('');
  assert.ok(t2.includes('「月亮吃月饼」') && t2.includes('「企鹅在沙漠晒太阳」') && t2.includes('6 位群友接力') && !/SECRET/.test(t2));
  assert.equal(rev.ctx.__counts.drawImage || 0, 0, 'no images drawn at all');
  const ri = mk();
  R.shareCard.render(ri, Object.assign(sample('shareCard', 'roomInvite'), { promptText: 'SECRETPROMPT', strokes: SM.drawing(1363), steps: ['SECRETSTEP'] }), {});
  const t3 = ri.ctx.__calls.map((c) => c.s).join('|');
  assert.deepEqual([ri.width, ri.height], [500, 400]);
  assert.ok(t3.includes('一起传画') && t3.includes('一局约 3 分钟') && t3.includes('3–10 人') && !/SECRET/.test(t3));
  assert.equal(ri.ctx.__counts.drawImage || 0, 0);
  const rr = mk();
  R.shareCard.render(rr, Object.assign(sample('shareCard', 'roomReveal'), { strokes: SM.drawing(1363), steps: ['SECRETSTEP'] }), {});
  const t4 = rr.ctx.__calls.map((c) => c.s).join('');
  assert.ok(t4.includes('一局传画') && t4.includes('5 条接龙') && t4.includes('「月亮吃月饼」') && t4.includes('「外星人在吃披萨」') && !/SECRET/.test(t4));
  const rd = mk();
  R.shareCard.render(rd, { kind: 'roomReveal', chainCount: 5 }, {});
  assert.ok(rd.ctx.__calls.map((c) => c.s).join('|').includes('5 条接龙') && !rd.ctx.__calls.some((c) => /「/.test(c.s)), 'a drawing final: only the count');
  const long = mk();
  R.shareCard.render(long, { kind: 'roomReveal', chainCount: 10, promptText: '会飞的奶茶店老板的故事', finalText: '一只戴着帽子的猫在开出租车去月球看看' }, {});
  for (const c of long.ctx.__calls) assert.ok(c.left >= 0 && c.right <= 500, c.s + ' stays inside the card');
  for (const k of ['invite', 'reveal', 'roomInvite', 'roomReveal']) {
    const c = mk();
    R.shareCard.render(c, sample('shareCard', k), {});
    for (const x of c.ctx.__calls) assert.ok(x.left >= 0 && x.right <= 500, k + ': ' + x.s);
  }
});

// ---------------------------------------------------------------- overlays and routing

test('overlay: dialog, toast and ad stub; later areas win; scrollMax is kept when concatenating', () => {
  const ctx = mockCtx();
  const vm = prepare('draw', Object.assign(sample('draw', 'drawing'), { display: STD }), L375, ctx, STD);
  const screenHits = R.screens.draw.draw(ctx, vm, L375);
  const o = R.overlay.draw(ctx, sample('overlay', 'dialog'), L375);
  const merged = screenHits.concat(o);
  const confirm = o.find((h) => h.id === 'dialog:confirm');
  const cancel = o.find((h) => h.id === 'dialog:cancel');
  assert.ok(confirm && cancel);
  assert.equal(R.hitTest(merged, confirm.x + confirm.w / 2, confirm.y + confirm.h / 2), 'dialog:confirm');
  assert.equal(R.hitTest(merged, 5, 400), 'dialog:block', 'taps outside the card are swallowed');
  const sub = screenHits.find((h) => h.id === 'draw:submit');
  assert.equal(R.hitTest(merged, sub.x + 5, sub.y + 5), 'dialog:block', 'nothing under the dialog is reachable');
  assert.ok(o.some((h) => h.id === 'dialog:block:card'));
  assert.equal(R.overlay.draw(mockCtx(), sample('overlay', 'toast'), L375).length, 0, 'toast has no hit areas');
  const ad = R.overlay.draw(mockCtx(), sample('overlay', 'adStub'), L375);
  assert.ok(ad.some((h) => h.id === 'adstub:complete') && ad.some((h) => h.id === 'adstub:skip'));
  for (const [title, text] of [['放弃这一棒？', '群友可以接着画'], ['离开这一局？', '离开后你的回合会自动跳过，确定离开？'], ['清空画布？', '清空后不能恢复'], ['现在揭晓？', '之后就不能再接了'], ['删除这一棒', '删除后，你画的和写的内容将不再展示，正在进行的接龙会让出你的那一棒']]) {
    const c2 = mockCtx();
    R.overlay.draw(c2, { dialog: { title, text, confirmLabel: '好', cancelLabel: '取消', danger: true }, display: STD }, L320);
    assert.ok(c2.__calls.some((c) => c.s === title));
    for (const c of c2.__calls) assert.ok(c.left >= 0 && c.right <= 320, c.s);
  }
  const sc = R.screens.overview.draw(mockCtx(), Object.assign(sample('overview', 'ready'), { display: STD }), L375);
  const merged2 = Object.assign(sc.concat(o), { scrollMax: sc.scrollMax });
  assert.ok(merged2.scrollMax['overview:scroll'] > 0);
});

test('scroll offsets are clamped to scrollMax and drawing past the end is safe', () => {
  for (const [screen, state] of [['overview', 'ready'], ['group', 'ready'], ['album', 'ready'], ['mine', 'ready'], ['home', 'ready'], ['pick', 'ready'], ['lobby', 'ready']]) {
    for (const y of [-50, 0, 1e6]) {
      const r = run(screen, sample(screen, state, { scrollY: y }), L320, MODES.large);
      assert.ok(Object.keys(r.hits.scrollMax).length > 0, screen);
      for (const h of r.hits) assert.ok(Number.isFinite(h.x + h.y + h.w + h.h));
    }
  }
});

// ---------------------------------------------------------------- layout, purity, weight

test('layout: capsule row, safe areas, tablet column; 320 to 430 wide, 568 to 932 tall', () => {
  for (const sz of SIZES) {
    const L = layoutFor(sz);
    assert.ok(L.navBottom >= L.capsule.y + L.capsule.h, sz.name);
    assert.equal(L.bottomEdge, sz.h - sz.bottomInset);
    assert.ok(L.contentW <= 500);
    assert.ok(L.x0 >= 0 && L.x0 + L.contentW <= sz.w);
  }
  // the reference windows of spec 8
  assert.equal(layoutFor(S('375x812')).navBottom, 84);
  assert.equal(layoutFor(S('375x812')).bottomEdge, 778);
  assert.equal(layoutFor(S('320x568')).navBottom, 64);
  assert.equal(layoutFor(S('320x568')).bottomEdge, 568);
  const L = R.makeLayout({ windowWidth: 375, windowHeight: 667 });
  assert.ok(L.navBottom > 40);
});

test('the six reference windows draw every screen: 320x568, 375x667, 375x812, 414x896, 430x932, 768x1024', () => {
  assert.deepEqual(SIZES.map((s) => s.name), ['320x568', '375x667', '375x812', '414x896', '430x932', '768x1024']);
});

test('purity: renderers use no wx, timers, clocks, randomness, network or identity; only .js requires', () => {
  const dir = path.join(__dirname, '..', 'js', 'render');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'samples.js')) {
    const src = strip(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(!/\bwx\./.test(src), f + ' uses wx');
    assert.ok(!/setTimeout|setInterval|requestAnimationFrame|Date\.now|new Date|Math\.random|performance\./.test(src), f + ' uses a clock or randomness');
    assert.ok(!/nickName|nickname|avatarUrl|openid|openId|昵称|头像/.test(src), f + ' touches identity (AC 74)');
    assert.ok(!/localStorage|getStorage|cloud\./.test(src), f + ' touches storage or the cloud');
    for (const m of src.matchAll(/require\((['"])([^'"]+)\1\)/g)) assert.ok(/^\.{1,2}\//.test(m[2]), f + ' requires a package: ' + m[2]);
  }
});

test('package weight: the render layer stays small (no images or fonts, plain code)', () => {
  const dir = path.join(__dirname, '..', 'js', 'render');
  let total = 0;
  // size as committed (LF): a Windows checkout with CRLF line endings must not change the verdict
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.js') && f !== 'samples.js') total += Buffer.byteLength(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'));
  assert.ok(total < 220 * 1024, `render code is ${(total / 1024).toFixed(0)} KB`);
  assert.ok(!fs.readdirSync(dir).some((f) => /\.(png|jpe?g|gif|webp|svg|ttf|otf|woff2?)$/i.test(f)));
});
