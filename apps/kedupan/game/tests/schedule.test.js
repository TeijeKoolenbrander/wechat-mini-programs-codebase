'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SCH = require('../core/schedule');
const { createContent, cardOf, cardText } = require('../core/content');
const { sub } = require('../core/rng');
const { addDays } = require('../core/date');
const raw = require('./fixtures/spectra.fixture');

const content = createContent(raw);

test('AC 9: a built schedule passes every PD-29 rule (5 cats, 5 spectra, easy first, split, no repeats, 21-day gap)', () => {
  const r = SCH.buildSchedule(content, { launchKey: '20261101', days: 60 });
  assert.ok(r.ok, r.error);
  assert.deepEqual(SCH.validateSchedule(r.schedule, content, { minDays: 60 }), []);
  assert.equal(r.schedule.days.length, 60);
  const all = r.schedule.days.flat();
  assert.equal(new Set(all).size, all.length, 'no item ever repeats');
});

test('AC 9: the schedule is deterministic for (library, launch date)', () => {
  const a = SCH.buildSchedule(content, { launchKey: '20261101', days: 25 });
  const b = SCH.buildSchedule(content, { launchKey: '20261101', days: 25 });
  assert.deepEqual(a.schedule, b.schedule);
  const c = SCH.buildSchedule(content, { launchKey: '20261102', days: 25 });
  assert.notDeepEqual(a.schedule.days, c.schedule.days);
});

test('AC 9: the validator catches each rule violation', () => {
  const good = SCH.buildSchedule(content, { launchKey: '20261101', days: 30 }).schedule;
  const clone = () => JSON.parse(JSON.stringify(good));
  const has = (s, frag, opt) => SCH.validateSchedule(s, content, { minDays: 30, ...opt }).some((e) => e.indexOf(frag) >= 0);

  assert.ok(has(good, 'only 30 days', { minDays: 365 }), 'fewer than 365 days');

  let s = clone();
  s.days[3][1] = s.days[3][0];
  assert.ok(has(s, 'twice') || has(s, 'repeats'), 'same item twice in a day');

  s = clone();
  const nonEasy = content.itemIds.find((id) => !(content.itemIndex[id].item.tags || []).includes('easy') && !good.days.flat().includes(id));
  s.days[5][0] = nonEasy;
  assert.ok(has(s, 'not tagged easy'), 'card 1 not easy');

  s = clone();
  s.days[7] = s.days[6].slice(); // an entire day repeated
  assert.ok(has(s, 'repeats'), 'item repeats across days');

  s = clone();
  const sp = content.itemIndex[s.days[0][2]].spectrum.id;
  const again = content.itemIds.find((id) => id.slice(0, 4) === sp && !good.days.flat().includes(id));
  s.days[4][2] = again; // same spectrum 4 days later
  assert.ok(has(s, 'repeats within 21 days'), 'spectrum gap');

  s = clone();
  const splitSet = (id) => (content.itemIndex[id].item.tags || []).includes('split');
  const used = new Set(good.days.flat());
  s.days[9] = s.days[9].map((id) => {
    if (!splitSet(id)) return id;
    const cat = content.itemIndex[id].spectrum.cat;
    const repl = content.itemIds.find((x) => !used.has(x) && !splitSet(x) && content.itemIndex[x].spectrum.cat === cat && content.itemIndex[x].spectrum.id === content.itemIndex[id].spectrum.id);
    return repl || id;
  });
  assert.ok(!s.days[9].some(splitSet), 'test setup removed the split item');
  assert.ok(has(s, 'no split item'), 'no split item');

  s = clone();
  s.days[0][0] = 's001i01'; // carries season:winter, 20261101 is autumn
  assert.ok(has(s, 'season:winter') || has(s, 'repeats'), 'season tag out of season');

  s = clone();
  s.contentVersion = 9;
  assert.ok(has(s, 'contentVersion'));
});

test('AC 9: season-tagged items land only in their season', () => {
  // launch on 1 Dec: the winter item s001i01 is eligible, the summer item s003i02 never is
  const r = SCH.buildSchedule(content, { launchKey: '20261201', days: 40 });
  assert.ok(r.ok, r.error);
  const all = r.schedule.days.flat();
  assert.ok(!all.includes('s003i02'), 'summer item not placed in winter');
  assert.deepEqual(SCH.validateSchedule(r.schedule, content, { minDays: 40 }), []);
  assert.equal(SCH.seasonOf('20261201'), 'winter');
  assert.equal(SCH.seasonOf('20270315'), 'spring');
  assert.equal(SCH.seasonOf('20270801'), 'summer');
  assert.equal(SCH.seasonOf('20271001'), 'autumn');
});

test('AC 9: festival-tagged items fall within 3 days before the festival and are used when possible', () => {
  // 中秋 2026 = 25 Sep; the fixture's festival item s002i02 must appear on 22..25 Sep
  const r = SCH.buildSchedule(content, { launchKey: '20260915', days: 20 });
  assert.ok(r.ok, r.error);
  const where = r.schedule.days.findIndex((d) => d.includes('s002i02'));
  assert.ok(where >= 0, 'the festival item is scheduled');
  const dateKey = addDays('20260915', where);
  assert.ok(dateKey >= '20260922' && dateKey <= '20260925', 'placed on ' + dateKey);
  assert.deepEqual(SCH.validateSchedule(r.schedule, content, { minDays: 20 }), []);
  assert.ok(SCH.inFestivalWindow('20260925', 'midautumn'));
  assert.ok(SCH.inFestivalWindow('20260922', 'midautumn'));
  assert.ok(!SCH.inFestivalWindow('20260921', 'midautumn'));
  assert.ok(!SCH.inFestivalWindow('20260926', 'midautumn'));
  // never outside the window
  const bad = JSON.parse(JSON.stringify(r.schedule));
  const other = bad.days.findIndex((d, i) => i !== where);
  bad.days[other][3] = 's002i02';
  assert.ok(SCH.validateSchedule(bad, content, { minDays: 20 }).length > 0);
});

test('unknown festival keys are rejected rather than silently allowed', () => {
  assert.equal(SCH.tagsAllowOn(['festival:nonsense'], '20261101').ok, false);
});

test('AC 12: the same Beijing date maps to the same 5 cards (schedule lookup)', () => {
  const r = SCH.buildSchedule(content, { launchKey: '20261101', days: 10 });
  const a = SCH.cardsForDate(r.schedule, content, '20261104');
  const b = SCH.cardsForDate(r.schedule, content, '20261104');
  assert.deepEqual(a, b);
  assert.equal(a.length, 5);
  assert.deepEqual(a.map((c) => c.itemId), r.schedule.days[3]);
  assert.equal(SCH.cardsForDate(r.schedule, content, '20261031'), null, 'before launch');
  assert.equal(SCH.cardsForDate(r.schedule, content, '20261111'), null, 'past the end');
  assert.equal(SCH.cardsForDate(null, content, '20261104'), null);
});

test('auto path (schedule exhausted): deterministic, rules hold, never reuses used items or recent spectra (spec 4.2)', () => {
  const used = new Set(SCH.buildSchedule(content, { launchKey: '20261101', days: 10 }).schedule.days.flat());
  const blocked = new Set(['s001', 's002']);
  const pick = () => SCH.pickDay(content, { dateKey: '20261120', usedItems: used, blockedSpectra: blocked, rng: sub('20261120', 'auto') });
  const a = pick();
  assert.deepEqual(a, pick(), 'same seed, same day');
  assert.equal(a.length, 5);
  a.forEach((id) => {
    assert.ok(!used.has(id));
    assert.ok(!blocked.has(content.itemIndex[id].spectrum.id));
  });
  assert.equal(new Set(a.map((id) => content.itemIndex[id].spectrum.cat)).size, 5);
  assert.equal(new Set(a.map((id) => content.itemIndex[id].spectrum.id)).size, 5);
  assert.ok(content.itemIndex[a[0]].item.tags.includes('easy'));
  assert.ok(a.some((id) => content.itemIndex[id].item.tags.includes('split')));
  const other = SCH.pickDay(content, { dateKey: '20261121', usedItems: used, blockedSpectra: blocked, rng: sub('20261121', 'auto') });
  assert.notDeepEqual(a, other);
});

test('pickDay returns null when the rules cannot be met', () => {
  const none = new Set(content.itemIds);
  assert.equal(SCH.pickDay(content, { dateKey: '20261120', usedItems: none, blockedSpectra: new Set(), seedName: 'x' }), null);
});

test('capacity report counts easy / split / tagged items', () => {
  const c = SCH.capacityReport(content);
  assert.equal(c.items, 1200);
  assert.equal(c.spectra, 120);
  assert.ok(c.easy >= 365 && c.split >= 100);
  assert.equal(c.seasonal, 2);
  assert.equal(c.festival, 1);
});

test('AC 11: card helpers send the library text; client cards carry no anchor', () => {
  const card = cardOf(content, 's005i03');
  assert.equal(card.itemId, 's005i03');
  assert.equal(card.spectrumId, 's005');
  assert.equal(typeof card.anchor, 'number');
  const t = cardText(content, card);
  assert.deepEqual(Object.keys(t).sort(), ['catLabel', 'itemId', 'left', 'prompt', 'right', 'spectrumId']);
  assert.equal(t.catLabel, content.catLabel[card.cat]);
  assert.deepEqual(cardText(content, 's005i03'), t);
  assert.equal(cardOf(content, 'nope'), null);
});
