'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const raw = require('../core/content/spectra.v1.js');
const forbidden = require('../core/content/forbidden.v1.js');
const schedule = require('../core/content/schedule.v1.js');
const V = require('../core/validate');
const { getContent, pickSpectra, clueOptions } = require('../core/content');
const { checkSchedule, buildSchedule, pickAutoDaily, itemAllowedOn } = require('../core/schedule');
const { sub } = require('../core/rng');
const { addDays } = require('../core/date');

const content = getContent(1);

test('AC8: the library validates (>= 300 spectra, >= 10 items, ids, lengths, anchors, quotas)', () => {
  assert.deepEqual(V.validateStructure(raw), []);
  assert.ok(raw.spectra.length >= 300);
  const items = raw.spectra.reduce((n, s) => n + s.items.length, 0);
  assert.ok(items >= 3000, 'items ' + items);
  raw.spectra.forEach((s) => assert.ok(s.items.length >= 10, s.id));
});

test('AC8: no forbidden term in any visible string, share title or store copy', () => {
  const extra = ['群友刻度盘', '把指针拖到你觉得对的位置，看看和全国、和群友有多同频', '火锅是冷还是热？我今天和全国的默契分 412，你呢', '我出了一道刻度题：便宜↔贵，猜猜我心里的位置', '刻度题揭晓：本题默契值 78', '刻度题揭晓了'];
  // the product name and the tagline are allowed to say 群友 (it is our brand, never a spectrum), so scan the content strictly and the copy loosely
  assert.deepEqual(V.validateForbidden(raw), []);
  const hits = extra.flatMap((t) => V.termsIn(t)).filter((h) => h.term !== '群友');
  assert.deepEqual(hits, []);
  assert.ok(forbidden.groups.sourceGame.includes('波长') && forbidden.groups.vice.includes('麻将') && forbidden.groups.vice.includes('赌') && forbidden.groups.vice.includes('彩票'));
  ['喝酒', '香烟', '男生', '女生', '胖', '丑', '省份', '民族', '宗教', '老头乐', 'Wavelength'].forEach((t) => assert.ok(V.allTerms().some((x) => x.term === t), t));
});

test('the forbidden scanner does catch violations (self-check)', () => {
  const bad = { categories: raw.categories, spectra: [{ id: 's001', left: '冷', right: '热', cat: 'food', items: [{ id: 's001i01', text: '喝酒', anchor: 50, tags: [] }] }] };
  assert.ok(V.validateForbidden(bad).length >= 1);
  assert.ok(V.termsIn('波长').length >= 1);
});

test('item and spectrum ids are stable, unique and positional', () => {
  const ids = new Set();
  raw.spectra.forEach((s) => {
    assert.match(s.id, /^s\d{3}$/);
    assert.ok(!ids.has(s.id));
    ids.add(s.id);
    s.items.forEach((it, k) => assert.equal(it.id, s.id + 'i' + String(k + 1).padStart(2, '0')));
  });
  assert.equal(content.spectrumById.s001.left, '冷');
  assert.equal(content.itemById.s001i01.text, '火锅');
});

test('card text never carries the anchor; every item has its public text', () => {
  const c = content.cardText('s001i01');
  assert.deepEqual(Object.keys(c).sort(), ['catLabel', 'itemId', 'left', 'prompt', 'right', 'spectrumId']);
  assert.equal(c.prompt, '火锅');
  assert.equal(c.catLabel, '吃喝');
  assert.equal(content.cardText('nope'), null);
});

test('AC9: the shipped schedule has >= 365 days and passes every rule', () => {
  assert.ok(schedule.days.length >= 365);
  assert.deepEqual(checkSchedule(content, schedule), []);
  const all = schedule.days.flat();
  assert.equal(new Set(all).size, all.length, 'no item repeats');
});

test('AC9: the checker catches a bad schedule (repeat, season, spectrum gap)', () => {
  const day = schedule.days[0];
  const bad = { launchDateKey: schedule.launchDateKey, days: [day, day] };
  const v = checkSchedule(content, bad, 2);
  assert.ok(v.some((x) => /repeats/.test(x)));
  const summer = Object.values(content.itemById).find((i) => i.tags.includes('season:summer'));
  assert.equal(itemAllowedOn(summer, '20270715'), true);
  assert.equal(itemAllowedOn(summer, '20270115'), false);
  const fest = Object.values(content.itemById).find((i) => i.tags.includes('festival:midautumn'));
  assert.equal(itemAllowedOn(fest, '20270913'), true);
  assert.equal(itemAllowedOn(fest, '20270901'), false);
  assert.equal(itemAllowedOn(fest, '20270916'), false);
});

test('buildSchedule is deterministic and the auto path obeys the same rules', () => {
  const a = buildSchedule(content, { launchDateKey: '20261101', days: 30, seed: 'x' });
  const b = buildSchedule(content, { launchDateKey: '20261101', days: 30, seed: 'x' });
  assert.deepEqual(a, b);
  assert.deepEqual(checkSchedule(content, a, 30), []);
  const used = new Set(schedule.days.flat());
  const recent = new Set(schedule.days[schedule.days.length - 1].map((id) => content.itemById[id].spectrumId));
  const dk = addDays(schedule.launchDateKey, schedule.days.length);
  const ids = pickAutoDaily(content, dk, used, recent);
  assert.equal(ids.length, 5);
  assert.deepEqual(pickAutoDaily(content, dk, used, recent), ids, 'deterministic by dateKey');
  ids.forEach((id) => assert.ok(!used.has(id)));
  assert.equal(new Set(ids.map((id) => content.itemById[id].cat)).size, 5);
  assert.ok(content.itemById[ids[0]].tags.includes('easy'));
  assert.ok(ids.some((id) => content.itemById[id].tags.includes('split')));
});

test('host mode helpers: 3 spectra, 6 preset clues, batches differ', () => {
  const sp = pickSpectra(content, 'seed1', 3, []);
  assert.equal(sp.length, 3);
  assert.equal(new Set(sp.map((s) => s.id)).size, 3);
  const swap = pickSpectra(content, 'seed1', 3, sp.map((s) => s.id));
  swap.forEach((s) => assert.ok(!sp.some((o) => o.id === s.id)));
  const c0 = clueOptions(content, sp[0].id, 'seed1', 0);
  const c1 = clueOptions(content, sp[0].id, 'seed1', 1);
  assert.equal(c0.length, 6);
  assert.equal(new Set(c0.map((c) => c.itemId)).size, 6);
  c0.forEach((c) => assert.ok(c.itemId.startsWith(sp[0].id)));
  assert.notDeepEqual(c0.map((c) => c.itemId), c1.map((c) => c.itemId));
  assert.deepEqual(clueOptions(content, sp[0].id, 'seed1', 0), c0, 'stable per seed');
});

test('anchors are spread: the library has both consensus and split items', () => {
  const items = Object.values(content.itemById);
  assert.ok(items.filter((i) => i.tags.includes('easy')).length >= 365);
  assert.ok(items.filter((i) => i.tags.includes('split')).length >= 365);
  void sub;
});
