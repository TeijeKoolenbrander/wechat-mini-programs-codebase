'use strict';
// The 《用户协议》 reader (terms screen). (The v1 QA-3 checks of the 今日彩笔 draw-screen pill are gone with the pill, rev. 2:
// render.canvas.test.js asserts that no ad of any kind is on the draw screen and that no ad area touches the canvas.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/render');
const T = require('../js/render/theme');
const Terms = require('../js/render/terms');
const { sample } = require('../js/render/samples.js');
const { mockCtx, SIZES, MODES, layoutFor } = require('./render-mock');

const S = (name) => SIZES.find((s) => s.name === name);
const L375 = layoutFor(S('375x667'));
const STD = MODES.default;

function run(screen, vm, L, display) {
  const ctx = mockCtx();
  const hits = R.screens[screen].draw(ctx, Object.assign({}, vm, { display: display || STD }), L);
  return { hits, ctx, calls: ctx.__calls, texts: ctx.__calls.map((c) => c.s) };
}
const hasText = (r, s) => r.texts.some((t) => t.includes(s));

// ---------------------------------------------------------------- terms (用户协议)

const TERMS = sample('terms', 'ready');

/** run the terms screen and also record the font and colour of every fillText */
function runTerms(vm, L, display) {
  const ctx = mockCtx();
  const fonts = [];
  const px = new Proxy(ctx, {
    get(t, p) {
      if (p === 'fillText') return (s, x, y) => { fonts.push({ s: String(s), font: ctx.font }); return ctx.fillText(s, x, y); };
      const v = t[p];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  const hits = R.screens.terms.draw(px, Object.assign({}, vm, { display: display || STD }), L);
  return { hits, calls: ctx.__calls, fonts, fills: ctx.__fills };
}
const visibleTexts = (r) => r.calls.filter((c) => c.visible).map((c) => c.s);

test('terms: hit ids, title, back button, one scroll region inside the screen, in every size and mode', () => {
  for (const sz of SIZES) {
    const L = layoutFor(sz);
    for (const [mode, display] of Object.entries(MODES)) {
      const r = runTerms(TERMS, L, display);
      assert.deepEqual(r.hits.map((h) => h.id).filter((i) => /^terms:/.test(i)).sort(), ['terms:back', 'terms:scroll']);
      const sc = r.hits.find((h) => h.id === 'terms:scroll');
      assert.ok(sc.y >= L.navBottom && sc.y + sc.h <= L.bottomEdge && sc.x >= 0 && sc.x + sc.w <= L.W, `${sz.name} ${mode}`);
      assert.ok(r.hits.scrollMax['terms:scroll'] > 0, `${sz.name} ${mode}: the slice scrolls`);
      assert.ok(r.calls.some((c) => c.s === '用户协议'));
      const back = r.hits.find((h) => h.id === 'terms:back');
      assert.ok(back.h >= 47.5 && back.w >= 47.5);
    }
  }
});

test('terms: no truncation, every paragraph is wrapped in full and every line is visible at some scroll position', () => {
  for (const [sz, mode] of [['320x568', 'default'], ['320x568', 'large'], ['375x667', 'hc'], ['430x932', 'default'], ['768x1024', 'large_hc']]) {
    const L = layoutFor(S(sz));
    const display = MODES[mode];
    T.applyDisplay(display);
    const lay = Terms.layoutParas(mockCtx(), L, TERMS.paragraphs.slice());
    T.applyDisplay(STD);
    lay.items.forEach((it, i) => assert.equal(it.lines.join('').replace(/\s/g, ''), TERMS.paragraphs[i].text.replace(/\s/g, ''),`${sz} ${mode} paragraph ${i}`));
    const max = runTerms(TERMS, L, display).hits.scrollMax['terms:scroll'];
    const shown = new Set();
    for (let y = 0; y <= max + 60; y += 40) for (const t of visibleTexts(runTerms({ ...TERMS, scrollY: y }, L, display))) shown.add(t);
    for (const it of lay.items) for (const ln of it.lines) assert.ok(shown.has(ln), `${sz} ${mode}: line never visible: ${ln}`);
  }
});

test('terms: scrolling reaches the end of a full-length agreement (5,000+ characters) and over-scroll is clamped', () => {
  const para = '本协议是你与运营主体之间关于使用本游戏的约定。我们会尽力保护你的个人信息，并按照法律法规的要求处理违规内容和举报。';
  const paragraphs = [];
  for (let i = 0; i < 48; i++) {
    paragraphs.push({ text: ['一、服务说明', '二、你的身份和个人信息', '三、内容规范', '四、内容审核'][i % 4], heading: true });
    paragraphs.push({ text: i + 1 + '. ' + para + (i % 3 === 0 ? '\n· 第一条；\n· 第二条。' : ''), important: i % 5 === 0 });
    paragraphs.push({ text: '第' + i + '段：' + para });
  }
  paragraphs.push({ text: '以上是协议的最后一句话。' });
  assert.ok(paragraphs.reduce((a, p) => a + p.text.length, 0) > 5000);
  for (const [sz, mode] of [['320x568', 'large'], ['375x667', 'default'], ['768x1024', 'hc']]) {
    const L = layoutFor(S(sz));
    const display = MODES[mode];
    const vm = { title: '用户协议', paragraphs, scrollY: 0 };
    const first = runTerms(vm, L, display);
    const max = first.hits.scrollMax['terms:scroll'];
    assert.ok(max > L.H * 5, `${sz} ${mode}: long text scrolls (${max})`);
    assert.ok(first.calls.some((c) => c.s === '一、服务说明' && c.visible), 'the start is visible at 0');
    assert.ok(!first.calls.some((c) => c.s.includes('最后一句话') && c.visible), 'the end is not visible at 0');
    const end = runTerms({ ...vm, scrollY: max }, L, display);
    const last = end.calls.find((c) => c.s.includes('最后一句话') && c.visible);
    assert.ok(last, `${sz} ${mode}: the last line is visible at the end of the scroll`);
    assert.ok(last.y < L.bottomEdge - 1, 'above the bottom edge');
    const beyond = runTerms({ ...vm, scrollY: max + 5000 }, L, display);
    assert.ok(beyond.calls.some((c) => c.s.includes('最后一句话') && c.visible), 'over-scroll is clamped to the end');
    assert.deepEqual(beyond.hits.scrollMax, end.hits.scrollMax);
    for (const y of [0, 400, max]) {
      for (const c of runTerms({ ...vm, scrollY: y }, L, display).calls) if (c.visible) assert.ok(c.left >= -1 && c.right <= L.W + 1, `${sz} ${mode}: text inside the width`);
    }
  }
});

test('terms: 【重要】 clauses are visibly emphasised (bold + highlighted note + bar), headings are bold and larger, ordinary text is neither', () => {
  const weight = (f) => Number(/\b(\d{3})\b/.exec(f)[1]);
  const size = (f) => Number(/([\d.]+)px/.exec(f)[1]);
  const r = runTerms(TERMS, L375, STD);
  const imp = TERMS.paragraphs.find((p) => p.important && !p.text.includes('\n') && p.text.length < 60);
  const plain = TERMS.paragraphs.find((p) => !p.important && !p.heading && p.text.length > 20 && p.text.length < 40 && !p.text.includes('\n'));
  const impLine = r.fonts.find((f) => imp.text.startsWith(f.s));
  assert.ok(impLine && weight(impLine.font) >= 700, 'important text is bold: ' + (impLine && impLine.font));
  const plainLine = r.fonts.find((f) => plain.text.startsWith(f.s));
  assert.ok(plainLine && weight(plainLine.font) <= 600, 'plain text is not bold: ' + (plainLine && plainLine.font));
  const head = r.fonts.find((f) => f.s === TERMS.paragraphs.find((p) => p.heading).text);
  assert.ok(head && weight(head.font) >= 800 && size(head.font) > size(plainLine.font), 'headings are bold and larger');
  assert.ok(r.fills.includes('#FFF1C9'), 'the highlight band is painted');
  const noImp = runTerms({ ...TERMS, paragraphs: TERMS.paragraphs.map((p) => ({ text: p.text, heading: p.heading })) }, L375, STD);
  assert.ok(!noImp.fills.includes('#FFF1C9'), 'no band without important clauses');
  const hc = runTerms(TERMS, L375, MODES.hc);
  assert.ok(!hc.fills.includes('#FFF1C9'), 'high contrast uses a white note');
  assert.ok(hc.fills.some((f) => /^#(000000|1E1B18)$/i.test(f)), 'a pure-ink bar in high contrast');
  const big = runTerms(TERMS, L375, MODES.large);
  assert.ok(Math.min(...big.calls.filter((c) => c.s.length > 6).map((c) => c.size)) >= 19.5, 'large text: body 20 pt');
});

test('terms: the sample carries real draft text (a heading, 【重要】 clauses, bullets) as plain JSON', () => {
  assert.ok(TERMS.paragraphs.some((p) => p.important) && !TERMS.paragraphs.some((p) => /^(\d+\.\s*)?【重要】/.test(p.text)), 'the leading marker is stripped, important carries it');
  assert.ok(TERMS.paragraphs.some((p) => p.heading && /^[一二三四五六七八九十]+、/.test(p.text)));
  assert.ok(TERMS.paragraphs.some((p) => p.text.includes('\n')));
  assert.ok(TERMS.paragraphs.reduce((a, p) => a + p.text.length, 0) > 1500);
  assert.deepEqual(JSON.parse(JSON.stringify(TERMS)), TERMS);
});
