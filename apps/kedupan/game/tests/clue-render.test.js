'use strict';
// Render tests for the typed-clue step and its sheets (spec 6.5, 6.12; AC 70, 83, 86, 100): wireframe rects, nothing below the fold at
// rest, large text and high contrast at 320x568 / 375x812 / 414x896, the keyboard layout, the sheets. The generic walls (touch targets,
// capsule, text bounds, hit overlap, contract ids) run over the same fixtures in render.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const render = require('../js/render');
const T = require('../js/render/theme');
const { makeLayout, hitTest } = require('../js/render/layout');
const { buildFixtures } = require('../tools/preview/fixtures.js');
const { mockCtx, MODES } = require('./render-mock');
const sheets = require('../js/render/clueSheets');
const CU = require('../js/clue-ui');

const SIZES = {
  '375x812': { w: 375, h: 812, sb: 44, menu: { top: 48, bottom: 80, left: 281, right: 368 }, inset: 34 },
  '320x568': { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, inset: 0 },
  '414x896': { w: 414, h: 896, sb: 44, menu: { top: 50, bottom: 82, left: 320, right: 407 }, inset: 34 },
};
const layout = (s) => makeLayout({ windowWidth: s.w, windowHeight: s.h, pixelRatio: 2, statusBarHeight: s.sb, safeArea: { top: s.sb, bottom: s.h - s.inset }, menuRect: { ...s.menu, width: s.menu.right - s.menu.left, height: s.menu.bottom - s.menu.top } });
const fixtures = (mode, L) => {
  const display = Object.assign({ scale: MODES[mode].largeText ? 1.25 : 1, palette: MODES[mode].highContrast ? 'highContrast' : 'standard' }, MODES[mode]);
  return { fx: buildFixtures({ L, display, sharedCanvas: { width: 1, height: 1 } }).fx, display };
};
const draw = (screen, vm, L) => {
  const ctx = mockCtx();
  const hits = render.screens[screen].draw(ctx, vm, L);
  return { hits, calls: ctx.__calls };
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1), msg + ': ' + a + ' vs ' + b);

test('wireframe 375x812 (navBottom 84): tabs 2 x 167.5 x 48 at y 220, input 343 x 56 at 284, 发到群里 343 x 56 at 706, the link band under the hint slot', () => {
  const L = layout(SIZES['375x812']);
  assert.equal(L.navBottom, 84);
  const { fx } = fixtures('default', L);
  const { hits } = draw('create', fx.create.clue_text_empty.vm, L);
  const by = (id) => hits.find((h) => h.id === id);
  const t1 = by('create:tab:text');
  const t2 = by('create:tab:preset');
  near(t1.y, 220, 1, 'tab y');
  near(t1.w, 167.5, 0.6, 'tab w');
  near(t1.h, 48, 0.1, 'tab h');
  near(t2.x - (t1.x + t1.w), 8, 0.6, 'tab gap');
  const inp = by('create:input');
  near(inp.y, 284, 1, 'input y');
  near(inp.w, 343, 0.6, 'input w');
  near(inp.h, 56, 0.1, 'input h');
  const link = by('create:toPreset');
  assert.ok(link.y >= 400 && link.y + link.h <= 470, 'link band ' + link.y);
  assert.ok(link.h >= 47.9);
  // 发到群里 is disabled when empty (no hit); with a clue it is pinned at 706
  assert.ok(!by('create:share'));
  const typed = draw('create', fx.create.clue_text_typed.vm, L).hits.find((h) => h.id === 'create:share');
  near(typed.y, 706, 1, 'primary y');
  near(typed.w, 343, 0.6, 'primary w');
  near(typed.h, 56, 0.1, 'primary h');
  // the rule line is drawn under the input, always (AC 100), 16 pt
  const { calls } = draw('create', fx.create.clue_text_empty.vm, L);
  const rule = calls.find((c) => c.s === '最多 12 个字 · 不写数字、位置和两头的词');
  assert.ok(rule, 'rule line drawn');
  assert.ok(rule.size >= 15.99);
  assert.ok(rule.y > inp.y + inp.h);
});

test('wireframe tab 2 (375x812): 2-column chips 167.5 x 48 with an 8 pt gap, 换一批 under them', () => {
  const L = layout(SIZES['375x812']);
  const { fx } = fixtures('default', L);
  const { hits } = draw('create', fx.create.clue_preset.vm, L);
  const chips = hits.filter((h) => h.id.startsWith('create:clue:'));
  assert.equal(chips.length, 6);
  chips.forEach((c) => {
    near(c.w, 167.5, 0.6, 'chip w');
    near(c.h, 48, 0.1, 'chip h');
  });
  near(chips[0].y, 284, 1, 'first chip row');
  near(chips[2].y - chips[0].y, 56, 0.6, 'row pitch');
  const sw = hits.find((h) => h.id === 'create:clueSwap');
  assert.ok(sw.y > chips[5].y + chips[5].h);
});

test('320x568 (navBottom 64): tabs 140 wide at 168, input 288 x 56 at 224, the rule line is whole, 发到群里 pinned above the bottom', () => {
  const L = layout(SIZES['320x568']);
  const { fx } = fixtures('default', L);
  const { hits, calls } = draw('create', fx.create.clue_text_typed.vm, L);
  const by = (id) => hits.find((h) => h.id === id);
  assert.equal(L.navBottom, 64);
  near(by('create:tab:text').w, 140, 0.6, 'tab w');
  near(by('create:tab:text').y, 168, 1.5, 'tab y');
  near(by('create:input').y, 224, 1.5, 'input y');
  near(by('create:input').w, 288, 0.6, 'input w');
  const share = by('create:share');
  assert.ok(share.y + share.h <= 568 - 9.9 && share.y >= 480);
  const ruleLines = calls.filter((c) => c.s && '最多 12 个字 · 不写数字、位置和两头的词'.includes(c.s) && c.s.length >= 2);
  // (the mock canvas measures narrower than a real font, which wraps the line to two at this width) the whole line is drawn
  assert.equal(ruleLines.map((c) => c.s).join('').replace(/\s/g, ''), '最多12个字·不写数字、位置和两头的词'.replace(/\s/g, ''), JSON.stringify(ruleLines.map((c) => c.s)));
});

test('nothing below the fold at rest: normal and high contrast at 320x568, 375x812 and 414x896 fit without scrolling (tab 1 and tab 2, every state); large text keeps 发到群里 pinned and scrolls only on short screens', () => {
  const states = ['clue_text_empty', 'clue_text_typed', 'clue_text_hint', 'clue_text_endlabel', 'clue_text_sending', 'clue_text_busy', 'clue_text_blocked', 'clue_text_confirm', 'clue_text_restricted', 'clue_preset', 'clue_picked', 'clue_preset_spent', 'clue_paused'];
  for (const name of Object.keys(SIZES)) {
    const L = layout(SIZES[name]);
    for (const mode of ['default', 'hc', 'large', 'large_hc']) {
      const { fx } = fixtures(mode, L);
      for (const s of states) {
        const { hits } = draw('create', fx.create[s].vm, L);
        const max = (hits.scrollMax && hits.scrollMax['create:scroll']) || 0;
        const label = name + ' ' + mode + ' ' + s;
        const large = MODES[mode].largeText;
        if (!large) assert.equal(max, 0, label + ' scrolls by ' + max);
        else if (name !== '320x568') assert.equal(max, 0, label + ' (large text, a tall screen) scrolls by ' + max);
        const share = hits.find((h) => h.id === 'create:share');
        if (share) assert.ok(share.y + share.h <= L.bottomEdge + 0.5, label + ' 发到群里 inside the safe area');
        // every control is inside the window and above the bottom inset
        hits.forEach((h) => {
          if (/:block|:scroll|:list|sheet:|create:back/.test(h.id)) return;
          assert.ok(h.y >= L.navBottom - 1 && h.y + h.h <= L.bottomEdge + 0.5, label + ' ' + h.id + ' at ' + h.y.toFixed(0) + '+' + h.h.toFixed(0));
        });
      }
    }
  }
});

test('large text at 320x568: the body scrolls under create:scroll, 发到群里 stays pinned and nothing is half visible at scroll 0', () => {
  const L = layout(SIZES['320x568']);
  const { fx } = fixtures('large', L);
  const { hits, calls } = draw('create', fx.create.clue_text_typed.vm, L);
  assert.ok(hits.scrollMax['create:scroll'] > 0);
  assert.ok(hits.find((h) => h.id === 'create:share'));
  calls.forEach((c) => {
    if (Array.from(c.s).length <= 1) return;
    assert.ok(!(c.frac > 0.02 && c.frac < 0.98), '"' + c.s + '" ' + c.frac);
  });
  const sc = draw('create', Object.assign({}, fx.create.clue_text_typed.vm, { scrollY: 9999 }), L);
  assert.ok(sc.hits.find((h) => h.id === 'create:toPreset'), 'the link is reachable by scrolling');
});

test('keyboard open: tabs, link and chips are gone; create:block is the first hit so the input row, 发到群里 and 返回 still win; the target band stays', () => {
  for (const name of Object.keys(SIZES)) {
    const L = layout(SIZES[name]);
    for (const mode of ['default', 'large', 'hc']) {
      const { fx } = fixtures(mode, L);
      for (const s of ['clue_kb_empty', 'clue_kb_typed', 'clue_kb_hint', 'clue_kb_long', 'clue_kb_unknown']) {
        const { hits } = draw('create', fx.create[s].vm, L);
        assert.equal(hits[0].id, 'create:block', name + ' ' + s);
        const ids = hits.map((h) => h.id);
        ['create:tab:text', 'create:tab:preset', 'create:toPreset'].forEach((id) => assert.ok(!ids.includes(id), name + ' ' + s + ' hides ' + id));
        assert.ok(!ids.some((id) => id.startsWith('create:clue:')));
        const input = hits.find((h) => h.id === 'create:input');
        assert.equal(hitTest(hits, input.x + 5, input.y + 5), 'create:input');
        assert.equal(hitTest(hits, L.W / 2, L.navBottom + 10), 'create:block');
        assert.equal(hitTest(hits, L.back.x + 10, L.back.y + 10), 'create:back');
      }
    }
  }
});

test('the 发言规则 sheet: bullets, 《用户协议》 and 《用户隐私保护指引》 links, 先用提示词 / 同意并写提示 (no checkbox); the read-only variant has one 知道了; the warning sheet and the report sheet', () => {
  for (const name of Object.keys(SIZES)) {
    const L = layout(SIZES[name]);
    for (const mode of ['default', 'large', 'hc']) {
      const { fx } = fixtures(mode, L);
      const r = draw('create', fx.create.clue_rules.vm, L);
      // a short screen scrolls the sheet's text: the links are one scroll away, the buttons are pinned
      const ids = r.hits.map((h) => h.id).concat(draw('create', Object.assign({}, fx.create.clue_rules.vm, { sheetScroll: 9999 }), L).hits.map((h) => h.id));
      ['rules:agree', 'rules:decline', 'rules:privacy', 'rules:terms'].forEach((id) => assert.ok(ids.includes(id), name + ' ' + mode + ' ' + id));
      const txt = r.calls.map((c) => c.s).join('');
      if (!MODES[mode].largeText || name !== '320x568') sheets.RULES_BULLETS.forEach((b) => assert.ok(txt.includes(b.slice(0, 8)), b));
      assert.ok(!ids.some((id) => /check|tick/i.test(id)));
      const ro = draw('create', fx.create.clue_rules_readonly.vm, L).hits.map((h) => h.id);
      assert.ok(ro.includes('rules:ok') && !ro.includes('rules:agree'));
      const w = draw('create', fx.create.clue_warn.vm, L).hits.map((h) => h.id);
      assert.ok(w.includes('warn:rules') && w.includes('warn:ok'));
      const rep = draw('round', fx.round.report_sheet.vm, L);
      // a short screen scrolls the reasons (cut at a row): all five are reachable
      const rids = rep.hits.map((h) => h.id).concat(draw('round', Object.assign({}, fx.round.report_sheet.vm, { sheetScroll: 9999 }), L).hits.map((h) => h.id));
      assert.equal(new Set(rids.filter((id) => id.startsWith('clueReport:reason:'))).size, 5, name + ' ' + mode);
      assert.ok(rids.includes('clueReport:submit') && rids.includes('clueReport:cancel'));
      assert.ok(!rids.some((id) => /input|field/.test(id)), 'no text field');
      const sending = draw('round', fx.round.report_sending.vm, L).hits.map((h) => h.id);
      assert.ok(!sending.includes('clueReport:submit') && !sending.some((id) => id.startsWith('clueReport:reason:')));
    }
  }
  // the sheet wording is the spec's (release check, AC 100)
  assert.deepEqual(sheets.RULES_BULLETS, [
    '你写的提示会先经过内容安全审核，通过后才给群友看',
    '不写数字、位置，也不写刻度两头的词',
    '不写色情低俗、政治、辱骂、广告和联系方式',
    '违规提示会被隐藏，多次违规将暂时不能自己写提示',
    '看到不合适的提示，请点「举报」',
  ]);
  assert.equal(sheets.WARN_TEXT, '你写的提示没有通过审核。请遵守发言规则，多次违规将暂时不能自己写提示。');
  assert.deepEqual(Object.values(sheets.REPORT_LABELS), ['色情低俗', '政治敏感', '辱骂攻击', '广告引流', '其他不适']);
});

test('round screen: 举报 sits at the right of a shown typed clue only; placeholders, presets and the legacy line draw without it; the clue line is drawn in guess, host and reveal views', () => {
  const L = layout(SIZES['375x812']);
  const { fx } = fixtures('default', L);
  const has = (s) => draw('round', fx.round[s].vm, L).hits.some((h) => h.id === 'round:report');
  assert.ok(has('clue_typed') && has('clue_reveal_typed'));
  ['clue_hidden', 'clue_hidden_host', 'clue_paused', 'clue_host_typed', 'open_empty', 'open_chat_clue'].forEach((s) => assert.ok(!has(s), s));
  const texts = (s) => draw('round', fx.round[s].vm, L).calls.map((c) => c.s).join('|');
  assert.ok(texts('clue_typed').includes('提示：「冬天的被窝」'));
  assert.ok(texts('clue_reveal_typed').includes('提示：「冬天的被窝」'));
  assert.ok(texts('clue_host_typed').includes('提示：「冬天的被窝」'));
  assert.ok(texts('clue_hidden').includes('提示已被举报隐藏') && texts('clue_hidden').includes('凭感觉猜一猜，或回群里问问出题人'));
  assert.ok(texts('clue_hidden_host').includes('你的提示被举报隐藏了，群友仍可继续猜'));
  assert.ok(texts('clue_paused').includes('提示暂不显示'));
  assert.ok(texts('open_chat_clue').includes('提示在群聊里，看看 TA 怎么说'));
  const r = draw('round', fx.round.clue_typed.vm, L).hits.find((h) => h.id === 'round:report');
  assert.ok(r.w >= 47.9 && r.h >= 47.9);
  // the live ruler still sits in the bottom 45% with the longer clue block above it
  const ruler = draw('round', fx.round.clue_typed.vm, L).hits.ruler;
  assert.ok(ruler.y >= L.H * 0.55 - 0.5);
});

test('clue-ui: the input filter, the restriction copy, both server shapes and the share line', () => {
  assert.deepEqual(CU.inputFilter('冬天😀的 被窝★'), { text: '冬天的被窝', changed: true });
  assert.equal(CU.inputFilter('abc70%').text, 'abc70%');
  assert.equal(CU.inputFilter('一二三四五六七八九十一二三').text, '一二三四五六七八九十一二');
  assert.equal(CU.inputFilter('～~！？').text, '～~！？');
  assert.equal(CU.reasonName('digit'), 'digits');
  assert.equal(CU.reasonName('charset'), 'chars');
  assert.equal(CU.restrictionText({ until: Date.UTC(2026, 9, 17, 6, 0, 0) }), '你暂时不能自己写提示（至 10月17日 14:00）。原因：多次写的提示未通过审核。如有疑问，请在「设置 · 联系我们」反馈。可以先选一个提示词。');
  const flat = CU.roundClue({ clueMode: 'text', clueText: '冬天的被窝', clueState: 'shown', canReport: true });
  const nested = CU.roundClue({ clue: { mode: 'text', text: '冬天的被窝', hidden: false }, me: { canReport: true } });
  assert.deepEqual(flat, nested);
  assert.equal(CU.roundClue({ clue: { mode: 'text', text: null, hidden: true }, me: { canReport: true } }).canReport, false);
  assert.equal(CU.roundClue({ clueMode: 'text', clueText: null, clueState: 'shown' }).state, 'hidden', 'a typed clue with no text is never drawn as empty');
  assert.equal(CU.shareClueLine('text', 'secret'), '提示在题目里，点开看看');
  assert.equal(CU.shareClueLine('preset', '一张电影票'), '提示：一张电影票');
  assert.equal(CU.shareClueLine('chat', null), null);
  const u1 = CU.ugcOf({ ugc: { createEnabled: true, rulesVersion: 1, rulesRequiredVersion: 1, restriction: null, warnPending: true } }, false);
  const u2 = CU.ugcOf({ me: { rulesAgreed: true, restriction: null, strikeNotice: true } }, false);
  assert.deepEqual(u1, u2);
  assert.equal(CU.ugcOf({ ugc: { rulesVersion: null } }, true).rulesAgreed, false, 'the server value wins over the cache');
  assert.equal(CU.ugcOf({}, true).rulesAgreed, true);
  void T;
});

// ---------------------------------------------------------------- QA typed-clue fixes (B3, B4)

const { SIZES: ALL_SIZES, layoutFor: layoutAll } = require('./render-mock');
const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

test('B3: 发言规则 sheet, 6 sizes x 4 modes: the links sit inside the viewport next to the buttons, outside the scroll area; the scroll area has no dead gap', () => {
  const bad = [];
  for (const mode of Object.keys(MODES)) {
    for (const sz of ALL_SIZES) {
      const L = layoutAll(sz);
      const { fx } = fixtures(mode, L);
      for (const state of ['clue_rules', 'clue_rules_end', 'clue_rules_readonly']) {
        const tag = mode + ' ' + L.W + 'x' + L.H + ' ' + state;
        const { hits, calls } = draw('create', fx.create[state].vm, L);
        const by = (id) => hits.find((h) => h.id === id);
        const terms = by('rules:terms');
        const privacy = by('rules:privacy');
        const btns = ['rules:agree', 'rules:decline', 'rules:ok'].map(by).filter(Boolean);
        const list = by('sheet:list');
        if (!terms || !privacy) {
          bad.push(tag + ' links missing');
          continue;
        }
        for (const r of [terms, privacy]) {
          if (r.x < 0 || r.y < 0 || r.x + r.w > L.W + 0.5 || r.y + r.h > L.H + 0.5) bad.push(tag + ' link outside the viewport ' + JSON.stringify(r));
          if (r.h < 44) bad.push(tag + ' link tap area < 44');
          btns.forEach((b) => overlaps(r, b) && bad.push(tag + ' link overlaps ' + b.id));
          if (list && overlaps(r, list)) bad.push(tag + ' link inside the scroll area');
        }
        if (overlaps(terms, privacy)) bad.push(tag + ' links overlap');
        // dead gap: the scroll area ends less than one text line above the links
        const lh = Math.round(T.FS.bodyL * 1.5);
        if (list && terms.y - (list.y + list.h) > lh + 12) bad.push(tag + ' dead gap ' + (terms.y - (list.y + list.h)));
        calls.filter((c) => /^《/.test(c.s)).forEach((c) => c.frac < 0.98 && bad.push(tag + ' link text clipped'));
        const maxScroll = (hits.scrollMax && hits.scrollMax['sheet:list']) || 0;
        if (state === 'clue_rules') assert.equal(!!by('rules:agree'), maxScroll === 0, tag + ': 同意并写提示 only after the end (or when it fits)');
        if (state === 'clue_rules_end') assert.ok(by('rules:agree'), tag + ': enabled at the end');
        if (state === 'clue_rules_readonly') assert.ok(by('rules:ok'), tag);
        assert.ok(by('rules:decline') || state === 'clue_rules_readonly', tag + ': 先用提示词 always available');
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('B4: 举报 never touches the clue text and has a 48 pt tap area (6 sizes x 4 modes)', () => {
  const bad = [];
  for (const mode of Object.keys(MODES)) {
    for (const sz of ALL_SIZES) {
      const L = layoutAll(sz);
      const { fx } = fixtures(mode, L);
      for (const state of ['clue_typed', 'clue_typed_long']) {
        const tag = mode + ' ' + L.W + 'x' + L.H + ' ' + state;
        const { hits, calls } = draw('round', fx.round[state].vm, L);
        const rep = hits.find((h) => h.id === 'round:report');
        const lk = calls.find((c) => c.s === '举报');
        if (!rep || !lk) {
          bad.push(tag + ' no 举报');
          continue;
        }
        if (rep.w < 44 || rep.h < 44) bad.push(tag + ' tap area ' + rep.w + 'x' + rep.h);
        calls.forEach((c) => {
          if (c === lk || Math.abs(c.y - lk.y) > Math.max(c.size, lk.size) * 0.7) return;
          if (!(c.right <= lk.left - 8 || c.left >= lk.right + 8)) bad.push(tag + ' text "' + c.s + '" touches 举报');
        });
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('B4: keyboard open, the input shows ONE line (placeholder or typed text), inside the box, 6 sizes x 4 modes', () => {
  const bad = [];
  for (const mode of Object.keys(MODES)) {
    for (const sz of ALL_SIZES) {
      const L = layoutAll(sz);
      const { fx } = fixtures(mode, L);
      for (const state of ['clue_kb_empty', 'clue_kb_typed', 'clue_kb_long', 'clue_kb_hint']) {
        const tag = mode + ' ' + L.W + 'x' + L.H + ' ' + state;
        const { hits, calls } = draw('create', fx.create[state].vm, L);
        const box = hits.find((h) => h.id === 'create:input');
        if (!box) {
          bad.push(tag + ' no input');
          continue;
        }
        const inside = calls.filter((c) => c.y > box.y && c.y < box.y + box.h && c.left >= box.x - 1 && c.left <= box.x + box.w);
        const rows = new Set(inside.map((c) => Math.round(c.y)));
        if (rows.size !== 1) bad.push(tag + ' input rows ' + rows.size);
        inside.forEach((c) => (c.left < box.x || c.right > box.x + box.w) && bad.push(tag + ' "' + c.s + '" leaves the box'));
      }
    }
  }
  assert.deepEqual(bad, []);
});
