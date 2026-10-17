'use strict';
/** QA-7: the full 用户协议 screen, the generated text module and the release refusal (tools/build-terms.js). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world } = require('./harness');
const { G } = require('./flows');
const bt = require('../tools/build-terms');
const TERMS = require('../js/terms-text');

const GAME = path.join(__dirname, '..');

test('terms-text.js is exactly what tools/build-terms.js generates from the source agreement (no drift)', () => {
  const nl = (s) => s.replace(/\r\n/g, '\n'); // a Windows checkout may convert line endings
  assert.equal(nl(fs.readFileSync(bt.TARGET, 'utf8')), nl(bt.build(fs.readFileSync(bt.SOURCE, 'utf8')).js));
});

test('build-terms: shape, 【重要】 -> important, headings, the draft line and the title stay out of paragraphs (draft keeps the refusal), numbers stay', () => {
  const { terms } = bt.build('【草稿：x】\n\nT 协议\n\n一、服务\n\n【重要】请注意\n2. 【重要】争议\n普通 【重要】 在句中\n· 条目\n');
  assert.equal(terms.title, 'T 协议');
  assert.equal(terms.draft, '【草稿：x】');
  assert.deepEqual(terms.paragraphs, [
    { text: '一、服务', heading: true },
    { text: '请注意', important: true },
    { text: '2. 争议', important: true },
    { text: '普通 【重要】 在句中' },
    { text: '· 条目' },
  ]);
});

test('build-terms --release logic: the draft marker and every 【…】 placeholder are refused; 【重要】 mid-sentence is fine', () => {
  assert.ok(bt.releaseProblems(bt.parse('【草稿：x】\nT\n正文')).some((p) => /draft/.test(p)));
  assert.ok(bt.releaseProblems(bt.parse('T\n邮箱：【联系邮箱】')).some((p) => /placeholder/.test(p)));
  assert.deepEqual(bt.releaseProblems(bt.parse('T\n一、a\n请看标有【重要】的条款\n【重要】x')), []);
  assert.ok(bt.releaseProblems({ title: '', paragraphs: [] }).length);
});

test('build-terms --release exits non-zero on the current draft and writes nothing', () => {
  const before = fs.readFileSync(bt.TARGET, 'utf8');
  const r = require('node:child_process').spawnSync(process.execPath, [path.join(GAME, 'tools', 'build-terms.js'), '--release'], { encoding: 'utf8' });
  const final = bt.releaseProblems(TERMS).length === 0;
  assert.equal(r.status, final ? 0 : 1);
  if (!final) assert.match(r.stderr, /not final/);
  assert.equal(fs.readFileSync(bt.TARGET, 'utf8'), before, 'nothing written');
});

test('the real text covers the agreement: 15 headings, important clauses flagged, the draft notice and title are not paragraphs', () => {
  assert.equal(TERMS.title, '传画接龙用户服务协议');
  assert.equal(TERMS.paragraphs.filter((p) => p.heading).length, 15);
  assert.ok(TERMS.paragraphs.filter((p) => p.important).length >= 15);
  assert.ok(TERMS.paragraphs.every((p) => typeof p.text === 'string' && p.text.length));
  assert.ok(!TERMS.paragraphs.some((p) => p.important && /^【重要】/.test(p.text)), 'the marker is stripped');
  assert.ok(!TERMS.paragraphs.some((p) => /^【草稿/.test(p.text) || p.text === TERMS.title), 'no draft notice or title line in paragraphs');
});

test('settings -> 《用户协议》 opens the terms screen with the full text and back returns to the settings sheet', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  if (a.has('sheet:close')) await a.tap('sheet:close');
  await a.tap('home:settings');
  await a.tap('settings:terms');
  assert.equal(a.screen(), 'terms');
  const vm = a.vm();
  assert.equal(vm.title, TERMS.title);
  assert.deepEqual(vm.paragraphs, TERMS.paragraphs);
  assert.equal(vm.scrollY, 0);
  assert.ok(a.ids().includes('terms:back') && a.ids().includes('terms:scroll'));
  assert.ok(!a.ids().includes('settings:terms'), 'the sheet underneath is not tappable');
  await a.tap('terms:back');
  assert.equal(a.screen(), 'home');
  assert.equal(a.vm().sheet, 'settings');
});

test('terms scroll: dragging on terms:scroll moves scrollY within [0, scrollMax]; reopening starts at the top', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  if (a.has('sheet:close')) await a.tap('sheet:close');
  await a.tap('home:settings');
  await a.tap('settings:terms');
  a.frame();
  const max = a.app.hits.scrollMax['terms:scroll'];
  assert.ok(max > 0, 'the agreement is longer than the screen');
  a.ctl.onDrag('terms:scroll', -120);
  assert.equal(a.vm().scrollY, Math.min(120, max));
  a.ctl.onDrag('terms:scroll', -1e6);
  assert.equal(a.vm().scrollY, max);
  a.ctl.onDrag('terms:scroll', 1e6);
  assert.equal(a.vm().scrollY, 0);
  a.ctl.onDrag('terms:scroll', -50);
  await a.tap('terms:back');
  await a.tap('settings:terms');
  assert.equal(a.vm().scrollY, 0);
});

test('the 公约 sheet -> 《用户协议》 -> back keeps the 公约 open with its pending action; agreeing still continues; rules are not auto-agreed', async () => {
  const w = world();
  const a = await w.player('A', { ...G }); // rules not agreed yet
  if (a.has('sheet:close')) await a.tap('sheet:close');
  await a.tap('home:slow');
  assert.equal(a.vm().sheet, 'rules');
  assert.equal(a.vm().rules.pendingAction, 'start');
  await a.tap('rules:terms');
  assert.equal(a.screen(), 'terms');
  await a.tap('terms:back');
  assert.equal(a.screen(), 'home');
  assert.equal(a.vm().sheet, 'rules');
  assert.equal(a.vm().rules.pendingAction, 'start');
  assert.equal(a.ctl.state.me.rulesVersion, 0);
  await a.tap('rules:agree');
  assert.equal(a.screen(), 'pick');
});

test('rulesVersion: a player who agreed to an older version is asked again; the version sent is the config one', async () => {
  const { CONFIG } = require('../core/config');
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  a.ctl.state.me.rulesRequiredVersion = CONFIG.rulesVersion + 1; // a bumped rulesVersion (server says the current one is newer)
  if (a.has('sheet:close')) await a.tap('sheet:close');
  await a.tap('home:slow');
  assert.equal(a.vm().sheet, 'rules', 'a material change of the agreement re-confirms (RELEASE.md: bump rulesVersion)');
});

test('RELEASE.md documents the rulesVersion bump and the terms build step', () => {
  const md = fs.readFileSync(path.join(GAME, 'RELEASE.md'), 'utf8');
  assert.match(md, /rulesVersion/);
  assert.match(md, /build-terms\.js --release/);
});
