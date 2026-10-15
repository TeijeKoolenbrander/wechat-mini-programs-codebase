'use strict';
// Forbidden vocabulary (spec 3.6, PO-1, AC 9, 10, 7, 50-51, 92): nothing user-visible, no gambling imagery, no timers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FORBIDDEN_TERMS, findForbidden } = require('../core/forbidden');
const { boot, startUp, closeHowto, rights, miss } = require('./helpers');

const GAME = path.join(__dirname, '..');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'tests', 'tools'].includes(e.name) && dir === GAME) continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

/** every file that ships plus the shipped-looking docs (README, HOOKS), except the term list itself */
const FILES = walk(GAME, []).filter((f) => !/core[\\/]forbidden\.js$/.test(f) && /\.(js|json|md)$/.test(f));

test('the term list matches the spec (AC 9)', () => {
  const need = ['猜大小', '比大小', '大小', '押', '下注', '赌', '翻倍', '加倍', '筹码', '金币', '倍率', '赔率', '庄家', '梭哈', '骰', '彩票', '中奖', '奖池', '抽奖', '开奖', '运气', '手气', '复活币', '更高更低', 'higher lower', 'higher or lower'];
  for (const n of need) assert.ok(FORBIDDEN_TERMS.some((t) => t.toLowerCase() === n.toLowerCase()), n);
  assert.equal(findForbidden('猜' + '大小'), '猜大小');
  assert.equal(findForbidden('HIGHER LOWER'), 'Higher Lower');
  assert.equal(findForbidden('更高 / 更低'), null);
  assert.equal(findForbidden('更长'), null);
});

test('no shipped file, comment or content row contains a forbidden term (AC 9)', () => {
  const hits = [];
  for (const f of FILES) {
    const text = fs.readFileSync(f, 'utf8');
    const hit = findForbidden(text);
    if (hit) {
      const at = text.toLowerCase().indexOf(hit.toLowerCase());
      hits.push(path.relative(GAME, f) + ' has "' + hit + '" near: ' + text.slice(Math.max(0, at - 20), at + 20).replace(/\n/g, ' '));
    }
  }
  assert.deepEqual(hits, []);
});

test('the placeholder content and the generated server export are free of forbidden terms', () => {
  for (const f of [path.join(GAME, 'tools', 'out', 'daily-facts.json'), ...fs.readdirSync(path.join(GAME, 'tools', 'fixtures', 'content-src')).map((n) => path.join(GAME, 'tools', 'fixtures', 'content-src', n))]) {
    assert.equal(findForbidden(fs.readFileSync(f, 'utf8')), null, f);
  }
});

test('every string the game draws over a tour of all screens is free of forbidden terms (AC 9)', async (t) => {
  const g = await startUp(t, { privacy: { state: 'agreed', scope: true } });
  const seen = [];
  const take = () => seen.push(g.frame());
  take();
  await closeHowto(g);
  take();
  for (const sheet of ['home:howto', 'home:settings']) {
    g.tapId(sheet);
    take();
    if (sheet === 'home:settings') {
      g.tapId('settings:sources');
      take();
      g.tapId('sheet:close');
    }
    g.tapId('sheet:close');
  }
  g.tapId('home:category');
  take();
  g.tapId('sheet:close');
  g.tapId('home:free');
  take();
  await rights(g, 2);
  take();
  g.tapId('source:top');
  take();
  g.tapId('source:report');
  take();
  g.tapId('report:cancel');
  await miss(g);
  take();
  g.tapId('continue:video');
  g.wait(3100);
  take();
  g.tapId('adstub:skip');
  await g.settle();
  take();
  g.tapId('result:questions');
  take();
  g.tapId('sheet:close');
  g.tapId('result:back');
  g.tapId('home:history');
  await g.settle();
  take();
  g.tapId('history:back');
  g.tapId('home:groupBoard');
  take();
  g.tapId('board:back');
  const all = seen.join('\n');
  assert.ok(all.length > 800);
  assert.equal(findForbidden(all), null);
  // share titles
  for (const s of g.log.shares) assert.equal(findForbidden(s.title), null);
});

test('no timers or countdowns anywhere in the game, no gambling imagery, no banned API calls (AC 7, 10, 50, 51, 92)', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const code = FILES.filter((f) => f.endsWith('.js') && !/core[\\/]content[\\/]facts\.free\.js$/.test(f)).map((f) => ({ f: path.relative(GAME, f), src: strip(fs.readFileSync(f, 'utf8')) }));
  const bad = [];
  for (const { f, src } of code) {
    if (/倒计时|countdown|限时|time\s*limit/i.test(src)) bad.push(f + ' has countdown wording');
    if (/\bwx\.reportEvent\b|\.reportEvent\(/.test(src)) bad.push(f + ' calls reportEvent');
    if (/getShareInfo\s*\(/.test(src)) bad.push(f + ' calls getShareInfo');
    if (/骰|\b(dice|casino|slot[-_ ]?machine|roulette|poker|poker[-_ ]?chips?)\b/i.test(src)) bad.push(f + ' has casino imagery wording');
    if (/\.json['"]\s*\)/.test(src)) bad.push(f + ' requires json');
  }
  assert.deepEqual(bad, []);
  const files = walk(GAME, []).filter((f) => !f.includes(path.sep + 'tools' + path.sep) && !f.includes(path.sep + 'tests' + path.sep));
  const images = files.filter((f) => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f));
  assert.deepEqual(images.map((f) => path.relative(GAME, f)), [], 'no image files in the package yet (icons are drawn in code)');
});

test('a share never grants anything: share calls are only in tap handlers and never read a result (AC 50, 51)', () => {
  const ctl = fs.readFileSync(path.join(GAME, 'js', 'controller.js'), 'utf8');
  const share = fs.readFileSync(path.join(GAME, 'js', 'share.js'), 'utf8');
  // shareAppMessage is never given a callback
  assert.ok(!/shareAppMessage\([^)]*(success|complete|fail)/.test(share));
  // the controller never branches on share success to unlock anything
  assert.ok(!/share\.(shareResult|shareChallenge|shareGroupInvite)\([^;]*\)\s*\.then\([^)]*(grant|life|useLife)/.test(ctl));
  // the rewarded placement exists exactly once and is guarded against daily-deck runs
  const calls = ctl.split('ads.rewarded(').length - 1;
  assert.equal(calls, 1);
  const at = ctl.indexOf('ads.rewarded(');
  assert.ok(/r\.server/.test(ctl.slice(at - 600, at)), 'the rewarded call is guarded by !r.server');
  // answer / server code has no continue path (AC 43)
  const mock = fs.readFileSync(path.join(GAME, 'js', 'mock-server.js'), 'utf8');
  const answerFn = mock.slice(mock.indexOf('    answer(d, who) {'), mock.indexOf('    submitRun(d, who) {'));
  assert.ok(!/life|continue|rewarded/i.test(answerFn));
  const adsSrc = fs.readFileSync(path.join(GAME, 'js', 'ads.js'), 'utf8');
  assert.ok(!/shareAppMessage|shareResult|shareChallenge|shareGroupInvite/.test(adsSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), 'no share-for-reward path in ads.js');
});

test('every shipped string table has no bare 大 or 小 button label (AC 9)', () => {
  const { MEASURES } = require('../core/measures');
  for (const m of MEASURES) for (const v of [m.hi, m.lo]) assert.ok(!/^[大小]$/.test(v), v);
  void boot;
});
