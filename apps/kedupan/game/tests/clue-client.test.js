'use strict';
// Client tests for the typed clue (D-2): the clue step (自己写 default, 选一个提示词), the 发言规则 sheet, the system keyboard, the local
// rules, sending and its outcomes, the guess / host / reveal clue line, 举报, share cards, analytics and the 用户协议.
// ACs 27, 29, 30, 33, 53, 64, 83-87, 91, 92 (client side), 94-98, 100. The backend is the scriptable double in clue-fake.js
// (real core/clue.js when present); tests/clue-real.test.js runs the same flows against the real mock server once it supports them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { boot } = require('./harness');
const { installClueServer, core } = require('./clue-fake');
const { makeLayout } = require('../js/render/layout');
const createRender = require('../js/render/create');
const sheets = require('../js/render/clueSheets');
const CU = require('../js/clue-ui');

const GAME = path.join(__dirname, '..');
const enter = (roundId) => ({ scene: 1007, query: { r: roundId } });
const DAY = 24 * 3600e3;

async function ready(t, opts, fakeOpts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  const fake = installClueServer(h, fakeOpts);
  return Object.assign(h, { fake });
}

/** home -> create -> first spectrum; ends on the clue step */
async function toClueStep(h) {
  if (h.screen() !== 'create') await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  assert.equal(h.view().vm.step, 'pickClue');
}

/** a clue that passes the local rules for the round on screen (the spectrum's end labels are random) */
function goodClue(h) {
  const { left, right } = h.view().vm.chosen;
  const c = ['冬天的被窝', '一杯奶茶', '外婆家的饭', '千层饼', '十字路口', '零食'].find((x) => core.checkClue(x, { leftLabel: left, rightLabel: right }).ok);
  assert.ok(c, 'a clue for ' + left + '/' + right);
  return c;
}

async function agree(h) {
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, 'rules');
  await h.tap('rules:agree');
  assert.equal(h.view().vm.sheet, null);
}

/** type a clue (first tap opens the keyboard) and let the 150 ms rule check run */
async function typeClue(h, text) {
  if (!h.kb.shown() || !h.st.create.kbOpen) await h.tap('create:input');
  await h.kb.type(text);
  h.advance(160);
  await h.settle();
}

const stripAll = (s) => String(s);
const queued = (h) => h.app.analytics.queue.concat(h.app.analytics.sent);

// ------------------------------------------------------------------------------------------------ AC 83, 84, 27

test('AC 83: the clue step opens on 自己写 with an empty input, 0/12, the rule line and 发到群里 disabled, every time', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  let vm = h.view().vm;
  assert.equal(vm.tab, 'text');
  assert.deepEqual(vm.tabs, ['text', 'preset']);
  assert.equal(vm.clueMode, 'text');
  assert.equal(vm.textTab.text, '');
  assert.equal(vm.textTab.countText, '0/12');
  assert.equal(vm.textTab.ruleLine, '最多 12 个字 · 不写数字、位置和两头的词');
  assert.equal(vm.textTab.hint, null);
  assert.equal(vm.canShare, false);
  assert.equal(vm.keyboardH, 0);
  assert.ok(!h.has('create:share'));
  assert.match(h.lastText(), /最多 12 个字 · 不写数字、位置和两头的词/);
  assert.ok(h.has('create:input') && h.has('create:tab:text') && h.has('create:tab:preset') && h.has('create:toPreset'));
  // switch to tab 2, leave and come back: tab 1 again
  await h.tap('create:tab:preset');
  assert.equal(h.view().vm.tab, 'preset');
  await h.tap('create:back');
  await toClueStep(h);
  assert.equal(h.view().vm.tab, 'text');
});

test('AC 83: createEnabled false -> no tab bar, only the presets; restricted -> opens on tab 2, tab 1 shows the restriction', async (t) => {
  let h = await ready(t, {}, { createEnabled: false });
  await toClueStep(h);
  let vm = h.view().vm;
  assert.deepEqual(vm.tabs, ['preset']);
  assert.equal(vm.tab, 'preset');
  assert.equal(vm.textTab.state, 'paused');
  assert.ok(!h.has('create:tab:text') && !h.has('create:tab:preset') && !h.has('create:input'));
  assert.equal(vm.clueOptions.length, 6);
  h.teardown();

  const until = Date.UTC(2026, 9, 17, 6, 0, 0); // 10月17日 14:00 Beijing time
  h = await ready(t, {}, { restriction: { until, permanent: false } });
  await toClueStep(h);
  vm = h.view().vm;
  assert.equal(vm.tab, 'preset');
  assert.deepEqual(vm.tabs, ['text', 'preset']);
  assert.equal(vm.textTab.state, 'restricted');
  assert.match(vm.textTab.restrictionText, /^你暂时不能自己写提示（至 10月17日 14:00）。/);
  assert.match(vm.textTab.restrictionText, /可以先选一个提示词。$/);
  assert.ok(h.app.analytics.queue.some((e) => e.name === 'clue_tab' && e.props.tab === 'preset' && e.props.via === 'auto'));
  await h.tap('create:tab:text');
  assert.equal(h.view().vm.tab, 'text');
  assert.match(h.lastText(), /你暂时不能自己写提示（至 10月17日 14:00）/);
  assert.ok(!h.has('create:input'), 'no input while restricted');
  assert.ok(h.has('create:toPreset'));
  // presets still work
  await h.tap('create:toPreset');
  await h.tap('create:clue:' + h.view().vm.clueOptions[0].itemId);
  await h.tap('create:share');
  assert.equal(h.view().vm.status, 'hostWaiting');
});

test('AC 84: the link leads to tab 2; switching keeps the typed text and the picked chip; 发到群里 sends the active tab only', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const text = goodClue(h);
  await typeClue(h, text);
  assert.equal(h.view().vm.canShare, true);
  h.ctl.K.onHit('create:block'); // tabs are hidden while typing: a tap outside the input row closes the keyboard
  assert.equal(h.st.create.kbOpen, false);
  await h.tap('create:tab:preset');
  await h.tap('create:clue:' + h.view().vm.clueOptions[1].itemId);
  const picked = h.view().vm.clueItemId;
  await h.tap('create:tab:text');
  assert.equal(h.view().vm.textTab.text, text, 'typed text kept');
  await h.tap('create:tab:preset');
  assert.equal(h.view().vm.clueItemId, picked, 'picked chip kept');
  // send from tab 2: a preset setClue, no typed clue
  const sent = [];
  const api = h.app.api;
  const real = api.setClue;
  api.setClue = (d) => (sent.push(d), real(d));
  await h.tap('create:share');
  assert.deepEqual(sent.map((d) => d.clueMode), ['preset']);
  assert.equal(sent[0].clueItemId, picked);
  assert.equal('clueText' in sent[0], false);
  assert.equal(h.srv.db.rounds[h.st.round.roundId].clueMode, 'preset');
  // the reverse: pick on tab 2, send from tab 1
  await h.tap('round:back');
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.tap('create:tab:preset');
  await h.tap('create:clue:' + h.view().vm.clueOptions[0].itemId);
  await h.tap('create:tab:text');
  const good = goodClue(h);
  await typeClue(h, good);
  sent.length = 0;
  await h.tap('create:share');
  assert.deepEqual(sent.map((d) => d.clueMode), ['text']);
  assert.equal(sent[0].clueText, good);
  assert.equal('clueItemId' in sent[0], false);
  assert.equal(h.srv.db.rounds[h.st.round.roundId].clueMode, 'text');
});

test('AC 84: 想不出来？试试选一个提示词 › leads to tab 2 (clue_tab via link)', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  assert.match(h.lastText(), /想不出来？试试选一个提示词 ›/);
  await h.tap('create:toPreset');
  assert.equal(h.view().vm.tab, 'preset');
  assert.deepEqual(
    h.app.analytics.queue.filter((e) => e.name === 'clue_tab').map((e) => [e.props.tab, e.props.via]),
    [['preset', 'link']]
  );
  assert.ok(h.has('create:clueSwap'));
  await h.tap('create:clueSwap');
  assert.ok(!h.has('create:clueSwap') && !h.ids().includes('create:noClueSwap'));
  assert.match(h.lastText(), /就从这几个里选吧/);
  assert.ok(!h.ids().some((id) => /modeChat/.test(id)), '我在群里说 is gone');
});

// ------------------------------------------------------------------------------------------------ AC 85

test('AC 85: the first tap on the input shows the 发言规则 sheet (no keyboard yet); 先用提示词 stores nothing and goes to tab 2', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, 'rules');
  assert.equal(h.kb.shown(), 0, 'no keyboard before the agreement');
  const txt = h.lastText();
  sheets.RULES_BULLETS.forEach((b) => assert.ok(txt.includes(b), b));
  assert.ok(h.has('rules:agree') && h.has('rules:decline') && h.has('rules:privacy') && h.has('rules:terms'));
  assert.ok(!h.ids().some((id) => /check|tick/i.test(id)), 'no pre-ticked box');
  const calls = [];
  const real = h.app.api.agreeRules;
  h.app.api.agreeRules = (d) => (calls.push(d), real(d));
  await h.tap('rules:decline');
  assert.equal(h.view().vm.tab, 'preset');
  assert.equal(h.view().vm.sheet, null);
  assert.equal(calls.length, 0, 'nothing stored');
  assert.equal(h.fake.state.rulesVersion, null);
  assert.equal(h.app.store.state.rulesAgreedVersion, null);
  // the sheet shows again on the next tap
  await h.tap('create:tab:text');
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, 'rules');
  // 同意并写提示: agreeRules({version:1}), then the keyboard opens
  await h.tap('rules:agree');
  assert.deepEqual(calls, [{ rulesVersion: 1 }]);
  assert.equal(h.fake.state.rulesVersion, 1);
  assert.equal(h.kb.shown(), 1);
  assert.equal(h.view().vm.sheet, null);
  assert.equal(h.st.create.kbOpen, true);
  assert.deepEqual(h.app.analytics.queue.filter((e) => /^rules_/.test(e.name)).map((e) => [e.name, e.props.source]), [['rules_view', 'input'], ['rules_view', 'input'], ['rules_agree', 'input']]);
});

test('AC 85: the sheet never shows again for that version (also after a reinstall: the server value is used); 设置 -> 发言规则 is read-only', async (t) => {
  let h = await ready(t);
  await toClueStep(h);
  await agree(h);
  await h.tap('create:back');
  await toClueStep(h);
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, null, 'agreed: straight to the keyboard');
  assert.equal(h.st.create.kbOpen, true);
  h.teardown();

  // reinstall: empty storage, but the server remembers the agreement
  h = await ready(t, {}, { rulesVersion: 1 });
  assert.equal(h.app.store.state.rulesAgreedVersion, null);
  await toClueStep(h);
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, null);
  assert.equal(h.app.store.state.rulesAgreedVersion, 1, 'the cache follows the server');
  await h.tap('create:back');

  // 设置 -> 发言规则: read-only, one 知道了
  await h.tap('home:settings');
  assert.equal(h.view().vm.settings.rulesAgreedVersion, 1);
  await h.tap('settings:rules');
  assert.equal(h.view().vm.sheet, 'rules');
  const txt = h.lastText();
  sheets.RULES_BULLETS.forEach((b) => assert.ok(txt.includes(b)));
  assert.ok(h.has('rules:ok') && !h.has('rules:agree') && !h.has('rules:decline'));
  await h.tap('rules:ok');
  assert.equal(h.view().vm.sheet, 'settings');
  assert.deepEqual(h.app.analytics.queue.filter((e) => e.name === 'rules_view').map((e) => e.props.source), ['settings']);
});

test('AC 85: RULES_REQUIRED from the server (the cache said agreed) shows the sheet and repeats the send after the agreement', async (t) => {
  const h = await ready(t);
  h.app.store.state.rulesAgreedVersion = 1; // stale cache; the server has no agreement
  await toClueStep(h);
  // createRound's ugc says rulesVersion null: the server value wins and the first tap shows the sheet
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, 'rules');
  await h.tap('rules:decline');
  await h.tap('create:tab:text');
  h.st.create.ugc.rulesAgreed = true; // force the client past the sheet, as a stale client would
  await typeClue(h, goodClue(h));
  await h.tap('create:share');
  assert.equal(h.view().vm.sheet, 'rules', 'RULES_REQUIRED opens the sheet');
  assert.ok(queued(h).some((e) => e.name === 'clue_result' && e.props.result === 'rulesRequired'));
  await h.tap('rules:agree');
  assert.equal(h.screen(), 'round', 'the send repeated and the round opened');
  assert.equal(h.srv.db.rounds[h.st.round.roundId].clueMode, 'text');
});

// ------------------------------------------------------------------------------------------------ AC 86

test('AC 86: showKeyboard maxLength 12; the counter tracks code points; emoji and symbols are removed as typed; confirm closes and never sends', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const shows = h.log.keyboard.filter((e) => e[0] === 'show');
  assert.equal(shows.length, 1);
  assert.equal(shows[0][1].maxLength, 12);
  assert.equal(shows[0][1].multiple, false);
  assert.equal(shows[0][1].confirmHold, false);
  await h.kb.type('冬天的被窝');
  assert.equal(h.view().vm.textTab.countText, '5/12');
  await h.kb.type('冬天😀的被窝★');
  assert.equal(h.view().vm.textTab.text, '冬天的被窝', 'emoji and symbols are removed as typed');
  assert.deepEqual(h.log.keyboard.filter((e) => e[0] === 'update').pop(), ['update', { value: '冬天的被窝' }]);
  await h.kb.type('a b');
  assert.equal(h.view().vm.textTab.text, 'ab', 'whitespace goes, letters stay so the hint can explain them');
  await h.kb.type('一二三四五六七八九十一二三四');
  assert.equal(Array.from(h.view().vm.textTab.text).length, 12);
  assert.equal(h.view().vm.textTab.countText, '12/12');
  // confirm: closes the keyboard, never calls setClue
  const calls = [];
  const real = h.app.api.setClue;
  h.app.api.setClue = (d) => (calls.push(d), real(d));
  await h.kb.type(goodClue(h));
  await h.kb.confirm();
  assert.equal(h.st.create.kbOpen, false);
  assert.ok(h.log.keyboard.some((e) => e[0] === 'hide'));
  assert.equal(calls.length, 0);
  assert.equal(h.screen(), 'create');
  // complete (closed by any means)
  await h.tap('create:input');
  assert.equal(h.st.create.kbOpen, true);
  await h.kb.complete();
  assert.equal(h.st.create.kbOpen, false);
});

test('AC 86: a tap outside the input row closes the keyboard and keeps the text', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const text = goodClue(h);
  await typeClue(h, text);
  assert.ok(h.has('create:block'));
  assert.ok(!h.has('create:tab:text') && !h.has('create:toPreset'), 'tabs and the link are hidden while typing');
  h.ctl.K.onHit('create:block'); // (the stub renderer's buttons cover the screen: route the id directly; the real renderer's order is tested in render.test.js)
  assert.equal(h.st.create.kbOpen, false);
  assert.equal(h.view().vm.textTab.text, text);
  assert.ok(h.has('create:tab:text') && h.has('create:toPreset'));
});

test('AC 86: with keyboardH known the input row and 发到群里 sit above the keyboard and the band stays visible (375x812 / 336, 320x568 / 260; default and large text)', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  await typeClue(h, goodClue(h));
  assert.equal(h.view().vm.keyboardH, undefined, 'unknown until the platform reports it');
  await h.kb.height(336);
  assert.equal(h.view().vm.keyboardH, 336);
  const vm0 = h.view().vm;
  const T = require('../js/render/theme');
  const { mockCtx } = require('./render-mock');
  const cases = [
    { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, inset: 34, kb: 336 },
    { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, inset: 0, kb: 260 },
  ];
  for (const c of cases) {
    for (const large of [false, true]) {
      const L = makeLayout({ windowWidth: c.w, windowHeight: c.h, pixelRatio: 2, statusBarHeight: c.sb, safeArea: { top: c.sb, bottom: c.h - c.inset }, menuRect: { ...c.menu, width: c.menu.right - c.menu.left, height: c.menu.bottom - c.menu.top } });
      const display = { largeText: large, highContrast: false, scale: large ? 1.25 : 1, palette: 'standard' };
      const vm = Object.assign({}, vm0, { keyboardH: c.kb, display });
      T.applyDisplay(display);
      const ctx = mockCtx();
      const hits = createRender.draw(ctx, vm, L);
      const input = hits.find((x) => x.id === 'create:input');
      const send = hits.find((x) => x.id === 'create:share');
      const kbTop = c.h - c.kb;
      const label = c.w + 'x' + c.h + (large ? ' large' : '');
      assert.ok(input && send, label + ' input and send are drawn');
      assert.ok(input.y + input.h <= kbTop - 7.9, label + ' input row above the keyboard (' + (input.y + input.h) + ' <= ' + kbTop + ')');
      assert.ok(send.y + send.h <= kbTop - 7.9 && send.y === input.y, label + ' send beside the input');
      assert.ok(send.w >= 87.9 && input.x + input.w + 8 <= send.x + 0.5, label + ' send width ' + send.w);
      if (!large) assert.ok(Math.abs(input.h - 56) < 0.5, label + ' input is 56 tall');
      const g = createRender.kbGeometry(ctx, L, vm, L.navBottom + L.u(6));
      assert.ok(g.band.y >= L.navBottom && g.band.y + g.band.h <= g.msg.y, label + ' band visible above the rule line: ' + JSON.stringify(g.band) + ' msg ' + g.msg.y);
      assert.ok(Math.abs(g.band.h - 24) < 0.5, label + ' band is 24 pt');
      assert.ok(g.msg.y + g.msg.h <= input.y, label + ' rule line above the input');
      if (c.w === 375 && !large) {
        assert.equal(Math.round(input.y), 412);
        assert.equal(Math.round(input.w), 247);
        assert.equal(Math.round(send.w), 88);
      }
      if (c.w === 320 && !large) {
        assert.equal(Math.round(input.y), 244);
        assert.equal(Math.round(input.w), 192);
      }
    }
  }
  T.applyDisplay(null);
});

test('AC 86: with keyboardH unknown the input row bottom is at most 60% of the window height', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  await typeClue(h, goodClue(h));
  const vm0 = h.view().vm;
  assert.equal('keyboardH' in vm0, false);
  const { mockCtx } = require('./render-mock');
  for (const [w, hh] of [[375, 812], [320, 568], [414, 896], [375, 667]]) {
    const L = makeLayout({ windowWidth: w, windowHeight: hh, pixelRatio: 2, statusBarHeight: 20, safeArea: { top: 20, bottom: hh }, menuRect: null });
    const hits = createRender.draw(mockCtx(), vm0, L);
    const input = hits.find((x) => x.id === 'create:input');
    assert.ok(input.y + input.h <= hh * 0.6 + 0.5, w + 'x' + hh + ' bottom ' + (input.y + input.h));
  }
  // PC WeChat: the keyboard height stays 0/unknown and the closed layout is used when the keyboard is closed
  await h.kb.complete();
  assert.equal(h.view().vm.keyboardH, 0);
});

// ------------------------------------------------------------------------------------------------ AC 87

test('AC 87: local rules show their hint inline 150 ms after the last keystroke and disable 发到群里 (no dialog)', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const { left, right } = h.view().vm.chosen;
  const rejects = [
    ['70', ['digit', 'digits'], '提示里不能有数字哦'],
    ['５', ['digit', 'digits'], '提示里不能有数字哦'],
    ['七十多', ['digit', 'digits'], '提示里不能有数字哦'],
    ['七成', ['digit', 'digits'], '提示里不能有数字哦'],
    ['左边一点', ['position'], '别直接说位置，换个说法吧'],
    ['中间', ['position'], '别直接说位置，换个说法吧'],
    ['coffee', ['charset', 'chars'], '只能用中文写提示'],
    ['加我微信', ['blocked'], '换个说法吧'],
  ];
  for (const [text, reasons, hint] of rejects) {
    await h.kb.type(text);
    if (text === '70') assert.equal(h.view().vm.textTab.hint, null, 'not yet: checked 150 ms after the last keystroke');
    h.advance(160);
    await h.settle();
    const tt = h.view().vm.textTab;
    assert.equal(tt.hint, hint, text);
    assert.ok(['digits', 'position', 'chars', 'blocked'].includes(tt.reason), text + ' -> ' + tt.reason);
    assert.ok(reasons.map(CU.reasonName).includes(tt.reason), text);
    assert.equal(h.view().vm.canShare, false);
    assert.ok(!h.has('create:share'));
    assert.equal(h.view().vm.sheet, null, 'inline, no dialog');
    assert.equal(h.st.dialog, null);
    assert.match(h.lastText(), new RegExp(hint.replace(/[，（）]/g, '.')));
  }
  // the end labels
  await h.kb.type(left + '的');
  h.advance(160);
  await h.settle();
  assert.equal(h.view().vm.textTab.reason, 'endLabel');
  assert.equal(h.view().vm.textTab.hint, '别用刻度两头的词（' + left + '、' + right + '）');
  // accepted
  for (const ok of ['冬天的被窝', '一杯奶茶', '一分钱', '千层饼', '十字路口', '零食'].filter((x) => core.checkClue(x, { leftLabel: left, rightLabel: right }).ok)) {
    await h.kb.type(ok);
    h.advance(160);
    await h.settle();
    assert.equal(h.view().vm.textTab.hint, null, ok);
    assert.equal(h.view().vm.canShare, true, ok);
  }
  // the hint goes when the box is emptied
  await h.kb.type('70');
  h.advance(160);
  await h.settle();
  assert.ok(h.view().vm.textTab.hint);
  await h.kb.type('');
  assert.equal(h.view().vm.textTab.hint, null);
});

test('AC 87: tapping 发到群里 runs the local check first: a failing clue shows its hint, calls nothing, costs no strike', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  await typeClue(h, '加我微信');
  const sent = [];
  const real = h.app.api.setClue;
  h.app.api.setClue = (d) => (sent.push(d), real(d));
  // 发到群里 is disabled (no hit area); the controller's handler still checks locally if it is reached
  h.ctl.K.handlers['create:share']();
  await h.settle();
  assert.equal(sent.length, 0);
  assert.equal(h.view().vm.textTab.reason, 'blocked');
  assert.equal(h.fake.state.strikes, 0);
  assert.ok(queued(h).some((e) => e.name === 'clue_result' && e.props.result === 'rejected' && e.props.reason === 'blocked'));
});

// ------------------------------------------------------------------------------------------------ AC 98, 88-90 (client)

test('AC 98: a passed clue opens the share sheet; 检查中… is inert (a double tap is one setClue); the share query is r=<roundId>', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const text = goodClue(h);
  await typeClue(h, text);
  let n = 0;
  const real = h.app.api.setClue;
  let release;
  h.app.api.setClue = (d) => {
    n++;
    return new Promise((res) => (release = () => res(real(d))));
  };
  await h.tap('create:share');
  assert.equal(h.view().vm.textTab.sending, true);
  assert.match(h.lastText(), /检查中…/);
  assert.ok(!h.has('create:share'), 'inert while checking');
  assert.ok(!h.has('create:tab:preset'), 'tabs inert while checking') ;
  h.ctl.K.handlers['create:share'](); // a double tap that reached the handler
  assert.equal(n, 1);
  release();
  await h.settle();
  assert.equal(h.log.shares.length, 1);
  const roundId = h.st.round.roundId;
  assert.equal(h.log.shares[0].query, 'r=' + roundId);
  assert.ok(!JSON.stringify(h.log.shares[0]).includes(text), 'the share carries no clue text');
  assert.equal(h.screen(), 'round');
  assert.equal(h.view().vm.status, 'hostWaiting');
  assert.equal(h.view().vm.clueText, '提示：「' + text + '」');
  assert.equal(h.view().vm.canReport, false, 'never for the host');
  const rc = queued(h).find((e) => e.name === 'round_clue');
  assert.equal(rc.props.clueMode, 'text');
  assert.equal(rc.props.chars, Array.from(text).length);
  assert.ok(Number.isInteger(rc.props.chars));
});

test('E13 fallback: with shareSecondTap the button turns into 提示已通过 · 发到群里 and the second tap shares', async (t) => {
  const h = await ready(t, { build: { shareSecondTap: true } });
  await toClueStep(h);
  await agree(h);
  await typeClue(h, goodClue(h));
  await h.tap('create:share');
  assert.equal(h.log.shares.length, 0, 'not shared yet');
  assert.equal(h.view().vm.shareConfirm, true);
  assert.match(h.lastText(), /提示已通过 · 发到群里/);
  assert.equal(h.fake.state.setClueCalls, 1);
  await h.tap('create:share');
  assert.equal(h.log.shares.length, 1);
  assert.equal(h.fake.state.setClueCalls, 1, 'the second tap does not check again');
  assert.equal(h.screen(), 'round');
});

test('server outcomes: TEXT_BLOCKED keeps the text and shows the hint (strike, then the warning sheet at the next clue step); nothing is shown to anyone', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const roundId = h.st.create.roundId;
  await typeClue(h, '测试违规');
  await h.tap('create:share');
  let vm = h.view().vm;
  assert.equal(vm.textTab.hint, '这个提示没通过审核，换个说法吧');
  assert.equal(vm.textTab.reason, 'moderation');
  assert.equal(vm.textTab.text, '测试违规');
  assert.equal(vm.step, 'pickClue');
  assert.equal(h.srv.db.rounds[roundId].status, 'draft');
  assert.equal(h.log.shares.length, 0);
  assert.equal(h.fake.state.strikes, 1);
  assert.ok(queued(h).some((e) => e.name === 'clue_result' && e.props.result === 'blocked'));
  // editing clears the hint; the next clue step shows the one-time warning
  await h.tap('create:input');
  await h.kb.type('一杯奶茶');
  assert.equal(h.view().vm.textTab.hint, null);
  await h.tap('create:back');
  await toClueStep(h);
  assert.equal(h.view().vm.sheet, 'warn');
  assert.match(h.lastText(), /你写的提示没有通过审核。请遵守发言规则，多次违规将暂时不能自己写提示。/);
  assert.ok(h.has('warn:rules') && h.has('warn:ok'));
  await h.tap('warn:rules');
  assert.equal(h.view().vm.sheet, 'rulesReadOnly');
  await h.tap('rules:ok');
  assert.equal(h.view().vm.sheet, null);
  await h.tap('create:back');
  await toClueStep(h);
  assert.equal(h.view().vm.sheet, null, 'the warning shows once');
});

test('server outcomes: MODERATION_BUSY, a timeout and offline show the busy box; 重试 resends, 改用提示词 goes to tab 2; the text is kept', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const roundId = h.st.create.roundId;
  const text = goodClue(h);
  await typeClue(h, text);
  for (const mode of ['busy', 'timeout']) {
    h.fake.state[mode] = true;
    await h.tap('create:share');
    const vm = h.view().vm;
    assert.equal(vm.textTab.busyBox, true, mode);
    assert.equal(vm.textTab.text, text);
    assert.equal(vm.step, 'pickClue');
    assert.match(h.lastText(), /提示暂时没法检查，还没有发出去/);
    assert.ok(h.has('create:busyRetry') && h.has('create:busyPreset'));
    assert.equal(h.srv.db.rounds[roundId].status, 'draft', 'fail closed: nothing is shown');
    h.fake.state[mode] = false;
  }
  // offline (the client's own NETWORK code)
  h.srv.offline = true;
  const realSet = h.app.api.setClue;
  h.app.api.setClue = () => Promise.resolve({ ok: false, code: 'NETWORK' });
  await h.tap('create:busyRetry');
  assert.equal(h.view().vm.textTab.busyBox, true);
  h.app.api.setClue = realSet;
  h.srv.offline = false;
  assert.ok(queued(h).filter((e) => e.name === 'clue_result' && e.props.result === 'busy').length >= 3);
  // 改用提示词
  await h.tap('create:busyPreset');
  assert.equal(h.view().vm.tab, 'preset');
  assert.equal(h.view().vm.textTab.text, text, 'text kept in memory');
  assert.ok(queued(h).some((e) => e.name === 'clue_tab' && e.props.via === 'auto'));
  // 重试 after the service is back: passes
  await h.tap('create:tab:text');
  await h.tap('create:share');
  assert.equal(h.screen(), 'round');
});

test('server outcomes: TEXT_REJECTED shows the hint for the returned reason (the server uses the round labels)', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  await typeClue(h, goodClue(h));
  const { left, right } = h.view().vm.chosen;
  h.app.api.setClue = () => Promise.resolve({ ok: false, code: 'TEXT_REJECTED', reason: 'endLabel' });
  await h.tap('create:share');
  const tt = h.view().vm.textTab;
  assert.equal(tt.hint, '别用刻度两头的词（' + left + '、' + right + '）');
  assert.equal(tt.reason, 'endLabel');
  assert.ok(queued(h).some((e) => e.name === 'clue_result' && e.props.result === 'rejected' && e.props.reason === 'endLabel'));
});

test('server outcomes: RESTRICTED switches to tab 2 with the restriction on tab 1; UGC_PAUSED removes the tab bar with a toast; the day limit sends the host to presets', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  await typeClue(h, goodClue(h));
  h.fake.state.restriction = { until: Date.UTC(2026, 10, 6, 6, 0, 0), permanent: false };
  await h.tap('create:share');
  let vm = h.view().vm;
  assert.equal(vm.tab, 'preset');
  assert.equal(vm.textTab.state, 'restricted');
  assert.match(vm.textTab.restrictionText, /至 11月6日 14:00/);
  assert.ok(queued(h).some((e) => e.name === 'clue_result' && e.props.result === 'restricted'));
  await h.tap('create:back');
  h.fake.state.restriction = null;
  await toClueStep(h);
  await h.tap('create:input');
  await h.kb.type(goodClue(h));
  h.fake.state.createEnabled = false;
  await h.tap('create:share');
  vm = h.view().vm;
  assert.deepEqual(vm.tabs, ['preset']);
  assert.equal(vm.tab, 'preset');
  assert.match(h.lastText(), /自己写提示暂时关闭，先选一个提示词吧/);
  await h.tap('create:back');
  h.fake.state.createEnabled = true;
  await toClueStep(h);
  await h.tap('create:input');
  await h.kb.type(goodClue(h));
  h.app.api.setClue = () => Promise.resolve({ ok: false, code: 'RATE_LIMITED', scope: 'day' });
  await h.tap('create:share');
  assert.equal(h.view().vm.tab, 'preset');
  assert.match(h.lastText(), /今天检查提示的次数用完了，先选一个提示词吧/);
  assert.ok(queued(h).some((e) => e.name === 'clue_result' && e.props.result === 'limit'));
});

test('a draft that expired (ROUND_NOT_FOUND) sends the host back to the spectra', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  await typeClue(h, goodClue(h));
  h.app.api.setClue = () => Promise.resolve({ ok: false, code: 'ROUND_NOT_FOUND' });
  await h.tap('create:share');
  assert.equal(h.view().vm.step, 'pickSpectrum');
  assert.equal(h.view().vm.textTab.text, '', 'the draft is dropped');
});

test('the draft is memory only: leaving the screen wipes it, backgrounding closes the keyboard and keeps it, nothing reaches storage', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  await agree(h);
  const text = goodClue(h);
  await typeClue(h, text);
  assert.equal(h.st.create.kbOpen, true);
  await h.hide();
  assert.equal(h.st.create.kbOpen, false);
  assert.ok(h.log.keyboard.some((e) => e[0] === 'hide'));
  await h.show();
  assert.equal(h.view().vm.textTab.text, text, 'the text is still in the box');
  assert.equal(h.st.create.kbOpen, false);
  assert.ok(!JSON.stringify(h.storage).includes(text), 'never written to storage');
  await h.tap('create:back');
  assert.equal(h.st.create.text, '', 'wiped on leave');
});

// ------------------------------------------------------------------------------------------------ the clue line (AC 30, 33, 91, 97)

/** a typed-clue round hosted by `openid` (through the double's setClue) */
function typedRound(h, openid, text) {
  const sp = h.srv.callAs(openid, 'createRound', { spectrumId: 's001' });
  h.fake.state.rulesVersion = 1;
  const r = h.fake.callAs(openid, 'setClue', { roundId: sp.roundId, clueMode: 'text', clueText: text || '冬天的被窝' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return sp.roundId;
}

for (const shape of ['flat', 'nested']) {
  test('AC 30/91 (' + shape + ' shape): a guesser sees 提示：「…」 with 举报; the report sheet has five reasons and no text field; a report hides the clue at once', async (t) => {
    const h = await ready(t, {}, { shape });
    const id = typedRound(h, 'bob');
    await h.show(enter(id));
    let vm = h.view().vm;
    assert.equal(vm.status, 'open');
    assert.equal(vm.clueMode, 'text');
    assert.equal(vm.clueState, 'shown');
    assert.equal(vm.clueText, '提示：「冬天的被窝」');
    assert.equal(vm.canReport, true);
    assert.equal(vm.clueSubText, null);
    assert.ok(h.has('round:report'));
    await h.tap('round:report');
    vm = h.view().vm;
    assert.deepEqual(vm.reportSheet.reasons, ['porn', 'politics', 'abuse', 'ads', 'other']);
    const reasonIds = h.ids().filter((x) => x.startsWith('clueReport:reason:'));
    assert.equal(reasonIds.length, 5);
    assert.ok(!h.ids().some((x) => /input|text/i.test(x)), 'no text field');
    assert.ok(!h.has('clueReport:submit'), '提交举报 waits for a reason');
    await h.tap('clueReport:reason:abuse');
    assert.equal(h.view().vm.reportSheet.selected, 'abuse');
    const calls = [];
    const real = h.app.api.reportClue;
    h.app.api.reportClue = (d) => (calls.push(d), real(d));
    await h.tap('clueReport:submit');
    assert.deepEqual(calls, [{ roundId: id, reason: 'abuse' }]);
    vm = h.view().vm;
    assert.equal(vm.reportSheet, null);
    assert.equal(vm.clueText, '提示已被举报隐藏');
    assert.equal(vm.clueState, 'hidden');
    assert.equal(vm.clueSubText, '凭感觉猜一猜，或回群里问问出题人');
    assert.equal(vm.canReport, false);
    assert.match(h.lastText(), /已举报，提示已隐藏，我们会尽快核实/);
    assert.deepEqual(queued(h).filter((e) => e.name === 'clue_report').map((e) => [e.props.reason, e.props.result, e.props.roundId]), [['abuse', 'ok', id]]);
    // guessing is unaffected
    await h.place(40);
    await h.tap('round:primary');
    assert.equal(h.view().vm.status, 'submitted');
    // the next read (any user) is hidden
    await h.show(enter(id));
    assert.equal(h.view().vm.clueText, '提示已被举报隐藏');
  });
}

test('AC 91: DUP_REPORT shows the placeholder and 「你已经举报过了」; REPORT_LIMIT keeps the line and says so; an error keeps the clue and the sheet', async (t) => {
  const h = await ready(t);
  const id = typedRound(h, 'bob');
  await h.show(enter(id));
  await h.tap('round:report');
  await h.tap('clueReport:reason:porn');
  h.app.api.reportClue = () => Promise.resolve({ ok: false, code: 'DUP_REPORT' });
  await h.tap('clueReport:submit');
  assert.equal(h.view().vm.clueText, '提示已被举报隐藏');
  assert.match(h.lastText(), /你已经举报过了/);

  const id2 = typedRound(h, 'cat');
  await h.show(enter(id2));
  await h.tap('round:report');
  await h.tap('clueReport:reason:ads');
  h.app.api.reportClue = () => Promise.resolve({ ok: false, code: 'REPORT_LIMIT' });
  await h.tap('clueReport:submit');
  assert.equal(h.view().vm.reportSheet, null);
  assert.equal(h.view().vm.clueText, '提示：「冬天的被窝」', 'the line is unchanged');
  assert.match(h.lastText(), /今天举报次数已用完/);

  await h.tap('round:report');
  await h.tap('clueReport:reason:other');
  h.app.api.reportClue = () => Promise.resolve({ ok: false, code: 'NETWORK' });
  await h.tap('clueReport:submit');
  assert.ok(h.view().vm.reportSheet, 'the sheet stays for another try');
  assert.equal(h.view().vm.clueText, '提示：「冬天的被窝」');
  assert.deepEqual(queued(h).filter((e) => e.name === 'clue_report').map((e) => e.props.result), ['dup', 'limit', 'error']);
  await h.tap('clueReport:cancel');
  assert.equal(h.view().vm.reportSheet, null);
});

test('AC 91: no 举报 on a preset, a legacy chat line, a placeholder, or for the host; the host sees the hidden variant', async (t) => {
  const h = await ready(t);
  // preset
  const sp = content1(h);
  const p = h.srv.callAs('bob', 'createRound', { spectrumId: sp.id });
  h.srv.callAs('bob', 'setClue', { roundId: p.roundId, clueMode: 'preset', clueItemId: sp.items[0].id });
  await h.show(enter(p.roundId));
  assert.equal(h.view().vm.clueMode, 'preset');
  assert.match(h.view().vm.clueText, /^提示：/);
  assert.equal(h.view().vm.canReport, false);
  assert.ok(!h.has('round:report'));
  // legacy chat
  const c = h.srv.callAs('bob', 'createRound', { spectrumId: sp.id });
  h.legacyChat('bob', c.roundId);
  await h.show(enter(c.roundId));
  assert.equal(h.view().vm.clueMode, 'chat');
  assert.equal(h.view().vm.clueText, '提示在群聊里，看看 TA 怎么说');
  assert.equal(h.view().vm.canReport, false);
  assert.ok(!h.has('round:report'));
  // the host of a hidden typed clue
  await h.tap('round:back');
  await toClueStep(h);
  await agree(h);
  await typeClue(h, goodClue(h));
  await h.tap('create:share');
  const id = h.st.round.roundId;
  h.srv.db.rounds[id].clueHidden = true;
  await h.show(enter(id));
  const vm = h.view().vm;
  assert.equal(vm.isHost, true);
  assert.equal(vm.clueText, '你的提示被举报隐藏了，群友仍可继续猜');
  assert.equal(vm.clueSubText, null);
  assert.equal(vm.canReport, false);
  assert.ok(!h.has('round:report'));
});

test('AC 94: viewEnabled false serves every typed clue as 提示暂不显示 while presets show normally', async (t) => {
  const h = await ready(t, {}, { viewEnabled: false });
  const id = typedRound(h, 'bob');
  await h.show(enter(id));
  assert.equal(h.view().vm.clueState, 'paused');
  assert.equal(h.view().vm.clueText, '提示暂不显示');
  assert.equal(h.view().vm.clueSubText, '凭感觉猜一猜，或回群里问问出题人');
  assert.equal(h.view().vm.canReport, false);
  const sp = content1(h);
  const p = h.srv.callAs('bob', 'createRound', { spectrumId: sp.id });
  h.srv.callAs('bob', 'setClue', { roundId: p.roundId, clueMode: 'preset', clueItemId: sp.items[0].id });
  await h.show(enter(p.roundId));
  assert.match(h.view().vm.clueText, /^提示：/);
});

test('AC 97: a legacy chat round shows 提示在群聊里，看看 TA 怎么说 on the guess, host and reveal views, accepts guesses, reveals and scores as before; its card says 提示在群聊里', async (t) => {
  const h = await ready(t);
  const models = [];
  h.app.share.cardRenderer = async (m) => (models.push(m), 'tmp://c.png');
  const sp = content1(h);
  const c = h.srv.callAs(h.srv.ME, 'createRound', { spectrumId: sp.id });
  h.legacyChat(h.srv.ME, c.roundId);
  await h.show(enter(c.roundId));
  assert.equal(h.view().vm.status, 'hostWaiting');
  assert.equal(h.view().vm.clueText, '提示在群聊里，看看 TA 怎么说');
  assert.ok(!h.has('round:report'));
  await h.tap('round:reshare');
  assert.equal(models.pop().clueLine, '提示在群聊里');
  h.srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: 30 });
  h.srv.callAs('b', 'submitGuess', { roundId: c.roundId, pos: 60 });
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  await h.tap('round:reveal');
  assert.equal(h.view().vm.status, 'revealed');
  assert.equal(h.view().vm.clueText, '提示在群聊里，看看 TA 怎么说');
  assert.ok(!h.has('round:report'));
  // a guesser
  const g = h.srv.callAs('bob', 'createRound', { spectrumId: sp.id });
  h.legacyChat('bob', g.roundId);
  await h.show(enter(g.roundId));
  assert.equal(h.view().vm.clueText, '提示在群聊里，看看 TA 怎么说');
  await h.place(40);
  await h.tap('round:primary');
  assert.equal(h.view().vm.status, 'submitted');
});

test('AC 33: the reveal view shows the clue line by the same rules (typed with 举报 for a guesser, hidden placeholder, host variant)', async (t) => {
  const h = await ready(t);
  const id = typedRound(h, 'bob');
  h.srv.callAs('a', 'submitGuess', { roundId: id, pos: 30 });
  h.srv.callAs('b', 'submitGuess', { roundId: id, pos: 60 });
  h.srv.callAs('bob', 'revealRound', { roundId: id });
  await h.show(enter(id));
  await h.tap('round:late');
  await h.place(50);
  await h.tap('round:primary');
  const vm = h.view().vm;
  assert.equal(vm.status, 'revealed');
  assert.equal(vm.clueText, '提示：「冬天的被窝」');
  assert.equal(vm.canReport, true);
  assert.ok(h.has('round:report'));
  assert.match(h.lastText(), /提示：「冬天的被窝」/);
  h.srv.db.rounds[id].clueHidden = true;
  await h.tap('round:retry').catch(() => {});
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  assert.equal(h.view().vm.clueText, '提示已被举报隐藏');
  assert.ok(!h.has('round:report'));
});

// ------------------------------------------------------------------------------------------------ AC 95, 96

test('AC 95: no clue text, fragment or trace id in any analytics event (client queue and what was sent); chars is an integer; unknown props are dropped', async (t) => {
  const h = await ready(t);
  const secret = '独一无二的蜜桃乌龙';
  await toClueStep(h);
  await agree(h);
  const local = core.checkClue(secret, { leftLabel: h.view().vm.chosen.left, rightLabel: h.view().vm.chosen.right });
  assert.equal(local.ok, true, 'fixture clue passes the local rules');
  await typeClue(h, secret);
  await h.kb.type('70'); // a local rejection event
  h.advance(160);
  await h.kb.type(secret);
  await h.tap('create:share');
  await h.tap('round:report').catch(() => {});
  const id = typedRound(h, 'bob', '另一条很特别的提示');
  await h.show(enter(id));
  await h.tap('round:report');
  await h.tap('clueReport:reason:porn');
  await h.tap('clueReport:submit');
  await h.flush();
  const all = JSON.stringify(queued(h)) + JSON.stringify(h.srv.db.events || []);
  for (const s of [secret, '另一条很特别的提示']) {
    assert.ok(!all.includes(s), 'no clue text');
    for (let i = 0; i + 2 <= s.length; i++) assert.ok(!all.includes(s.slice(i, i + 2)), 'no 2-character fragment of ' + s + ': ' + s.slice(i, i + 2));
  }
  assert.ok(!/trace/i.test(all));
  const names = new Set(queued(h).map((e) => e.name));
  ['clue_result', 'rules_view', 'rules_agree', 'round_clue', 'clue_report'].forEach((n) => assert.ok(names.has(n), n));
  // the guard drops anything off the allowlist
  const a = h.app.analytics;
  a.track('clue_result', { result: 'pass', clueText: secret, hint: '提示', reason: '很长很长的提示文字' });
  const ev = a.queue[a.queue.length - 1];
  assert.deepEqual(Object.keys(ev.props).filter((k) => !['isNewUser', 'contentVersion', 'appVersion'].includes(k)), ['result']);
  a.track('round_clue', { roundId: 'ABCD2345', clueMode: 'text', presetSwaps: 0, chars: 3.5, tabSwitches: 0, clueText: secret });
  const ev2 = a.queue[a.queue.length - 1];
  assert.equal('chars' in ev2.props, false, 'a non-integer chars is dropped');
  assert.equal('clueText' in ev2.props, false);
});

test('AC 96: a typed round card says 提示在题目里，点开看看; no share image, title, open data message or reveal card holds the clue; a preset round card keeps its text', async (t) => {
  const h = await ready(t);
  const models = [];
  h.app.share.cardRenderer = async (m) => (models.push(m), 'tmp://c.png');
  await toClueStep(h);
  await agree(h);
  const secret = '独一无二的蜜桃乌龙';
  await typeClue(h, secret);
  await h.tap('create:share');
  const id = h.st.round.roundId;
  assert.equal(models[0].kind, 'round');
  assert.equal(models[0].clueLine, '提示在题目里，点开看看');
  assert.ok(!JSON.stringify(models[0]).includes(secret));
  assert.ok(!JSON.stringify(h.log.shares).includes(secret));
  assert.ok(!JSON.stringify(h.log.shares[0]).includes('提示：'));
  assert.equal(h.log.shares[0].title.includes('提示'), false);
  // 再发到群里 from the host view
  await h.tap('round:reshare');
  assert.equal(models[1].clueLine, '提示在题目里，点开看看');
  // reveal card and open data message
  h.srv.callAs('a', 'submitGuess', { roundId: id, pos: 30 });
  h.srv.callAs('b', 'submitGuess', { roundId: id, pos: 60 });
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  await h.tap('round:reveal');
  await h.tap('round:shareReveal');
  const reveal = models[models.length - 1];
  assert.equal(reveal.kind, 'reveal');
  assert.ok(!JSON.stringify(reveal).includes(secret));
  assert.ok(!JSON.stringify(h.log.shares).includes(secret));
  assert.ok(h.log.posted.length > 0);
  assert.ok(!JSON.stringify(h.log.posted).includes(secret), 'open data messages never hold the clue');
  assert.ok(!JSON.stringify(models).includes(secret));
  // a preset round card still shows the preset text
  await h.tap('round:back');
  await h.tap('home:host');
  await toClueStep(h);
  await h.tap('create:tab:preset');
  const opt = h.view().vm.clueOptions[0];
  await h.tap('create:clue:' + opt.itemId);
  await h.tap('create:share');
  const rm = models[models.length - 1];
  assert.equal(rm.kind, 'round');
  assert.equal(rm.clueLine, '提示：' + opt.text);
});

// ------------------------------------------------------------------------------------------------ AC 64, 29, 100 and the 用户协议

test('AC 64: a host round with a preset clue needs no 发言规则 agreement and no sheet; the sheet comes only from a tap on the input', async (t) => {
  const h = await ready(t);
  assert.equal(h.view().vm.sheet, null);
  await toClueStep(h);
  assert.equal(h.view().vm.sheet, null, 'the clue step itself shows nothing');
  await h.tap('create:tab:preset');
  await h.tap('create:clue:' + h.view().vm.clueOptions[0].itemId);
  await h.tap('create:share');
  assert.equal(h.view().vm.status, 'hostWaiting');
  assert.equal(h.fake.state.rulesVersion, null);
  assert.ok(!queued(h).some((e) => e.name === 'rules_view'));
});

test('AC 29: wx.showKeyboard is called only from js/keyboard.js, with the create flow passing maxLength 12', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (['tests', 'tools', 'node_modules'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  const files = walk(GAME).filter((f) => f.endsWith('.js'));
  const hits = files.filter((f) => /showKeyboard/.test(fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
  assert.deepEqual(hits.map((f) => path.relative(GAME, f).split(path.sep).join('/')), ['js/keyboard.js']);
  assert.equal(CU.CLUE_MAX, 12);
  assert.match(fs.readFileSync(path.join(GAME, 'js', 'flows', 'rounds.js'), 'utf8'), /maxLength: CU\.CLUE_MAX/);
});

test('AC 100: the rule line is visible on tab 1 in every state except restriction and pause', async (t) => {
  const h = await ready(t);
  await toClueStep(h);
  const line = '最多 12 个字 · 不写数字、位置和两头的词';
  assert.match(h.lastText(), new RegExp(line));
  await agree(h);
  await typeClue(h, '70');
  assert.match(h.lastText(), new RegExp(line.slice(0, 8)) , 'keyboard open: the hint replaces the line in its place');
  await h.kb.type('');
  assert.match(h.lastText(), new RegExp(line));
  await h.kb.complete();
  assert.equal(h.view().vm.textTab.ruleLine, line);
  assert.equal(h.view().vm.textTab.ruleLine, core.RULE_LINE);
});

test('用户协议: 设置 -> 《用户协议》 opens a scrollable text screen and 返回 returns to the settings sheet; the 发言规则 sheet links to it without losing the draft', async (t) => {
  const h = await ready(t);
  await h.tap('home:settings');
  assert.ok(h.has('settings:terms'));
  await h.tap('settings:terms');
  assert.equal(h.screen(), 'terms');
  const vm = h.view().vm;
  assert.equal(vm.title, '群友刻度盘用户协议');
  assert.ok(vm.paragraphs.length > 50);
  assert.ok(h.has('terms:back') && h.has('terms:scroll'));
  const max = h.app.hits.scrollMax['terms:scroll'];
  void max;
  h.ctl.onDrag('terms:scroll', -200);
  assert.ok(h.st.scrollY >= 0);
  await h.tap('terms:back');
  assert.equal(h.screen(), 'home');
  assert.equal(h.view().vm.sheet, 'settings');
  await h.tap('sheet:close');
  // from the rules sheet on the create screen
  await toClueStep(h);
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, 'rules');
  await h.tap('rules:terms');
  assert.equal(h.screen(), 'terms');
  await h.tap('terms:back');
  assert.equal(h.screen(), 'create');
  assert.equal(h.view().vm.sheet, 'rules', 'the sheet is still there');
  assert.equal(h.view().vm.step, 'pickClue');
});

test('用户协议: the generated text matches its source, is marked DRAFT in dev, and a release build refuses a draft', () => {
  const bt = require('../tools/build-terms');
  const nl = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(nl(fs.readFileSync(bt.TARGET, 'utf8')), nl(bt.build(fs.readFileSync(bt.SOURCE, 'utf8')).js), 'js/terms-text.js is up to date');
  const TERMS = require('../js/terms-text');
  assert.match(TERMS.draft, /^【草稿/);
  assert.equal(TERMS.title, '群友刻度盘用户协议');
  assert.ok(TERMS.paragraphs.filter((p) => p.heading).length >= 10);
  assert.ok(TERMS.paragraphs.filter((p) => p.important).length >= 5);
  assert.ok(bt.releaseProblems(TERMS).length > 0, 'a draft is not releasable');
  assert.ok(bt.releaseProblems(bt.parse('T\n一、a\n请看标有【重要】的条款\n【重要】x')).length === 0);
  // the build-terms CLI and the release switch refuse the draft
  const r = spawnSync(process.execPath, [path.join(GAME, 'tools', 'build-terms.js'), '--release'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not final/);
  const rc = require('../tools/release-config');
  assert.ok(rc.termsProblems(GAME).length > 0);
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'kd-terms-'));
  try {
    fs.cpSync(GAME, tmp, { recursive: true, filter: (s) => !/node_modules/.test(s) });
    const before = fs.readFileSync(path.join(tmp, 'js', 'build-config.js'), 'utf8');
    const sw = spawnSync(process.execPath, [path.join(tmp, 'tools', 'release-config.js'), '--env', 'env-x'], { encoding: 'utf8' });
    assert.equal(sw.status, 1);
    assert.match(sw.stderr, /user agreement is not final/);
    assert.equal(fs.readFileSync(path.join(tmp, 'js', 'build-config.js'), 'utf8'), before, 'nothing was switched');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function content1(h) {
  const { getServerContent } = require('../core/content');
  return getServerContent().spectra[0];
}
void stripAll;
void DAY;
