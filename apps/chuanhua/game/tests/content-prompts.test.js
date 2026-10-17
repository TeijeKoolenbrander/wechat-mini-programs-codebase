'use strict';
// AC 87: the prompt bank has >= 400 prompts (423), each <= 12 code points, unique, with a category; no prompt matches
// the local blocklist or contact patterns. Also the shape rules of the content modules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PROMPTS, CATEGORIES, PROMPTS_VERSION } = require('../core/content/prompts.v1');
const blocklist = require('../core/content/blocklist.v1');
const text = require('../core/text');
const { getPrompts, promptById } = require('../core/prompts');

test('AC 87: 423 prompts, >= 400 required, 11 x 35 + 38, version 1', () => {
  assert.equal(PROMPTS_VERSION, 1);
  assert.equal(PROMPTS.length, 423);
  assert.ok(PROMPTS.length >= 400);
  assert.equal(CATEGORIES.length, 12);
  const per = {};
  for (const p of PROMPTS) per[p.cat] = (per[p.cat] || 0) + 1;
  assert.equal(per.I, 38);
  for (const c of 'ABCDEFGHJKL') assert.equal(per[c], 35, c);
});

test('AC 87: every prompt has id, text and a known category; ids and texts are unique; text <= 12 code points', () => {
  const cats = new Set(CATEGORIES.map((c) => c.key));
  const ids = new Set();
  const texts = new Set();
  for (const p of PROMPTS) {
    assert.match(p.id, /^[A-L]\d\d$/, p.id);
    assert.ok(p.id.startsWith(p.cat), p.id);
    assert.ok(cats.has(p.cat), p.id);
    assert.ok(!ids.has(p.id), 'duplicate id ' + p.id);
    assert.ok(!texts.has(p.text), 'duplicate text ' + p.text);
    ids.add(p.id);
    texts.add(p.text);
    const n = Array.from(p.text).length;
    assert.ok(n >= 2 && n <= 12, `${p.id} ${p.text} has ${n} code points`);
  }
});

test('AC 87: no prompt matches the local blocklist, contact patterns or the input rules (prompts are valid custom prompts)', () => {
  for (const p of PROMPTS) {
    assert.equal(text.blocklistHit(p.text), null, `${p.id} ${p.text} hits the blocklist`);
    assert.equal(text.contactHit(p.text), null, `${p.id} ${p.text} hits a contact pattern`);
    assert.equal(text.sanitize(p.text), p.text, `${p.id} has characters the input filter would drop`);
    const v = text.validate(p.text, 'prompt');
    assert.equal(v.ok, true, `${p.id} ${p.text}: ${v.reason}`);
  }
});

test('prompt texts contain no banned themes from the content rules (spot list: gambling, alcohol, tobacco, politics, brands)', () => {
  const themes = ['麻将', '彩票', '赌', '酒', '香烟', '抽烟', '烟草', '党', '国旗', '地图', '人民币', '军', '警察', '佛', '神', '鬼', '算命', '地震', '洪水', '癌', '死亡', '死人', '杀', '血', '枪'];
  for (const p of PROMPTS) for (const t of themes) assert.ok(!p.text.includes(t), `${p.id} ${p.text} contains ${t}`);
});

test('prompts.js: lookup by id, retired prompts stay resolvable but leave the active list; unknown versions are null', () => {
  const v1 = getPrompts(1);
  assert.equal(v1.list.length, 423);
  assert.equal(promptById('I07', 1).text, '月亮吃月饼');
  const bank = getPrompts(); // the latest bank is v2 (server-only, TD-103)
  assert.equal(bank.version, 2);
  assert.ok(bank.active.length >= 2000);
  assert.equal(bank.active.length + bank.list.filter((p) => p.retired).length, bank.list.length);
  assert.equal(Object.values(bank.byCat).reduce((n, l) => n + l.length, 0), bank.active.length, 'byCat holds exactly the active prompts');
  assert.ok(Object.values(bank.byCat).every((l) => l.every((p) => !p.retired)), 'a retired prompt is never rollable');
  const retired = bank.list.find((p) => p.retired);
  if (retired) assert.equal(promptById(retired.id).id, retired.id, 'retired prompts stay resolvable');
  assert.equal(promptById('Z99'), null);
  assert.equal(getPrompts(99), null);
});

test('blocklist module: categories required by spec 5.6 exist, entries are non-empty unique strings', () => {
  for (const c of ['political', 'sexual', 'insult', 'drugs', 'gambling', 'violence', 'slur']) {
    assert.ok(blocklist.zh[c] && blocklist.zh[c].length >= 5, c);
  }
  const seen = new Set();
  for (const [cat, terms] of Object.entries(blocklist.zh)) {
    for (const t of terms) {
      assert.ok(typeof t === 'string' && t.length >= 1, cat);
      assert.equal(t, t.toLowerCase(), 'terms are lower-case: ' + t);
      assert.ok(!seen.has(t), 'duplicate term ' + t);
      seen.add(t);
    }
  }
  assert.equal(blocklist.BLOCKLIST_VERSION, 1);
});
