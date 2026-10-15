'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../core/text');
const Pr = require('../core/prompts');
const D = require('../core/daily');
const { addDays } = require('../core/date');
const { mulberry32 } = require('../core/rng');

// ---------------------------------------------------------------- prompts (AC 87, 91)

test('AC 87: 423 prompts, unique ids and texts, <= 12 code points, 12 categories, clean under every text rule', () => {
  const list = Pr.PROMPTS;
  assert.equal(list.length, 423);
  assert.equal(Pr.CATEGORIES.length, 12);
  assert.equal(new Set(list.map((p) => p.id)).size, 423);
  assert.equal(new Set(list.map((p) => p.text)).size, 423);
  const catKeys = new Set(Pr.CATEGORIES.map((c) => c.key));
  for (const p of list) {
    assert.match(p.id, /^[A-L]\d\d$/);
    assert.ok(catKeys.has(p.cat) && p.id[0] === p.cat, p.id);
    assert.ok(T.countCp(p.text) >= 2 && T.countCp(p.text) <= 12, p.id + ' ' + p.text);
    const r = T.check(p.text, 'prompt');
    assert.equal(r.ok, true, `${p.id} ${p.text}: ${r.reason}`);
    assert.equal(T.matchContact(p.text), null);
    assert.equal(T.matchBlocklist(p.text), null);
    assert.equal(p.text, p.text.trim());
  }
  const counts = {};
  list.forEach((p) => (counts[p.cat] = (counts[p.cat] || 0) + 1));
  assert.equal(counts.I, 38);
  assert.equal(counts.A, 35);
});

test('prompts avoid the spec 4.2 content rules (keyword screen over the whole bank)', () => {
  // a coarse screen for categories the content owner must keep out; the human review is Handoff H13
  const banned = ['国旗', '国徽', '地图', '人民币', '军', '警察', '佛', '菩萨', '道士', '算命', '鬼', '神仙', '总统', '明星', '品牌', '地震', '洪水', '火灾', '疾病', '死亡', '去死', '杀', '血', '酒', '烟草', '香烟', '赌', '彩票', '麻将', '谈恋爱', '亲吻', '裸'];
  for (const p of Pr.PROMPTS) for (const b of banned) assert.ok(p.text.indexOf(b) < 0, `${p.id} ${p.text} contains ${b}`);
});

test('AC 91: 换一批 gives 3 non-retired prompts not among today\'s 3', () => {
  const today = D.dailyIds('20261120');
  for (let seed = 1; seed < 50; seed++) {
    const b = Pr.batch(mulberry32(seed), today, 3);
    assert.equal(b.length, 3);
    assert.equal(new Set(b.map((x) => x.id)).size, 3);
    for (const x of b) assert.ok(today.indexOf(x.id) < 0 && Pr.byId(x.id) && !Pr.byId(x.id).retired);
  }
  assert.equal(Pr.byId('Z99'), null);
});

// ---------------------------------------------------------------- daily (AC 88)

test('AC 88: daily prompts are deterministic, 3 per day, no repeat within 141 days', () => {
  assert.deepEqual(D.dailyIds('20261120'), D.dailyIds('20261120'));
  assert.equal(D.daily('20261120').length, 3);
  const seen = new Map();
  for (let i = 0; i < 141; i++) {
    const k = addDays('20261101', i);
    for (const id of D.dailyIds(k)) {
      assert.ok(!seen.has(id), `${id} repeats (${seen.get(id)} and ${k})`);
      seen.set(id, k);
    }
  }
  assert.equal(seen.size, 423);
  // day 142 wraps to day 1
  assert.deepEqual(D.dailyIds(addDays('20261101', 141)), D.dailyIds('20261101'));
  // before launch still works (negative offsets)
  assert.equal(D.dailyIds('20261001').length, 3);
  // a different launch key shifts the walk
  assert.notDeepEqual(D.dailyIds('20261120', '20261101'), D.dailyIds('20261120', '20261102'));
});

// ---------------------------------------------------------------- text (AC 33-35)

test('AC 33: lengths 2-16 (descriptions) and 2-12 (prompts) in code points; emoji dropped on input', () => {
  assert.equal(T.check('一', 'desc').reason, 'length');
  assert.equal(T.check('一只猫', 'desc').ok, true);
  assert.equal(T.check('一二三四五六七八九十一二三四五六', 'desc').reason, 'contact'); // 16 cn numerals: digit sequence
  assert.equal(T.check('猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫', 'desc').ok, true); // 16
  assert.equal(T.check('猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫', 'desc').reason, 'length'); // 17
  assert.equal(T.check('猫猫猫猫猫猫猫猫猫猫猫猫', 'prompt').ok, true);
  assert.equal(T.check('猫猫猫猫猫猫猫猫猫猫猫猫猫', 'prompt').reason, 'length');
  assert.equal(T.check('猫', 'prompt').reason, 'length');
  assert.equal(T.sanitize('小猫😀吃★鱼', 16), '小猫吃鱼');
  assert.equal(T.sanitize('一只猫在开出租车而且特别特别特别长长长', 16).length, 16);
  assert.equal(T.countCp('😀😀'), 2);
  assert.equal(T.check('小猫😀', 'desc').reason, 'chars');
  assert.equal(T.check('  好大一只猫  ', 'desc').text, '好大一只猫');
  assert.equal(T.check('好，大！一只？猫……', 'desc').ok, true);
  assert.equal(T.sanitize('ＡＢＣ１２', 10), 'ABC12'); // full-width folded
});

test('AC 34: contact and ad patterns are rejected locally', () => {
  const rej = (s) => assert.equal(T.check(s, 'desc').reason, 'contact', s);
  rej('加我微信吧'); // 微信 / 加我
  rej('我的wx是abc');
  rej('vx聊');
  rej('QQ交流');
  rej('群号在这里');
  rej('打电话给我');
  rej('12345'); // 5 digits
  rej('猫1猫2猫3猫4猫5'); // 5 digits in total
  rej('１２３４５'); // full-width
  rej('一二三四五六'); // cn numerals >= 5
  rej('看www.baidu');
  rej('a.com');
  rej('https://x');
  rej('找@小明');
  assert.equal(T.check('猫1猫2猫3猫4', 'desc').ok, true); // 4 digits is fine
  assert.equal(T.check('一二三四', 'desc').ok, true);
  assert.equal(T.check('三只小猪', 'desc').ok, true);
  assert.equal(T.check('v x', 'desc').reason, 'contact'); // spaced evasion
});

test('AC 35: blocklisted text is rejected locally with the standard message', () => {
  const r = T.check('毒品交易', 'desc');
  assert.deepEqual([r.ok, r.code, r.reason, r.message], [false, 'TEXT_REJECTED', 'blocklist', '换个说法吧']);
  assert.equal(T.check('傻 逼', 'desc').reason, 'blocklist'); // spaced
  assert.ok(T.matchBlocklist('赌博').category === 'gambling');
  assert.equal(T.matchBlocklist('小猫吃面条'), null);
});

test('mock moderation trigger words pass the local filter (they are for the server mock)', () => {
  for (const w of ['测试违规', '测试复审', '测试繁忙']) assert.equal(T.check(w, 'desc').ok, true, w);
});
