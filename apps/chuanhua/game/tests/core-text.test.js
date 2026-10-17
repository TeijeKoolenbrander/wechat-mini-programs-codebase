'use strict';
// AC 33 (lengths, emoji dropped), 34 (contact/number/url patterns), 35 (blocklist), spec 5.6.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const text = require('../core/text');

test('AC 33: descriptions accept 2-16 code points, custom prompts 2-12', () => {
  assert.equal(text.validate('猫', 'describe').reason, 'length');
  assert.equal(text.validate('猫猫', 'describe').ok, true);
  assert.equal(text.validate('一二三四五六七八九十一二三四五六'.replace(/[一二三四五六七八九十]/g, '猫'), 'describe').ok, true); // 16
  assert.equal(text.validate('猫'.repeat(17), 'describe').reason, 'length');
  assert.equal(text.validate('猫'.repeat(12), 'prompt').ok, true);
  assert.equal(text.validate('猫'.repeat(13), 'prompt').reason, 'length');
  assert.equal(text.validate('猫', 'prompt').reason, 'length');
  // lengths count code points after trimming
  assert.equal(text.validate('  猫猫  ', 'describe').text, '猫猫');
  assert.equal(text.validate('', 'describe').reason, 'length');
  assert.equal(text.validate(123, 'describe').ok, false);
  assert.equal(text.validate('猫猫', 'nope').ok, false);
});

test('AC 33: emoji and disallowed symbols are dropped on input, allowed punctuation and ASCII stay', () => {
  assert.equal(text.sanitize('一只猫😀在开车🚗'), '一只猫在开车');
  assert.equal(text.sanitize('猫★在#开$车<>'), '猫在开车');
  assert.equal(text.sanitize('好吃！真的？是的，对。、…—·~'), '好吃！真的？是的，对。、…—·~');
  assert.equal(text.sanitize('hello, world! ok-ok?'), 'hello, world! ok-ok?');
  assert.equal(text.sanitize('ＡＢＣ１２３'), 'ABC123'); // fullwidth alnum folded
  assert.equal(text.sanitize('猫    狗\t鱼'), '猫 狗 鱼'); // whitespace collapsed
  assert.equal(text.sanitize('👨‍👩‍👧'), ''); // ZWJ family emoji
  assert.equal(text.sanitize('猫​猫'), '猫猫'); // zero width dropped
  // input filter clips to the kind's maximum and reports that something was dropped
  const f = text.inputFilter('猫'.repeat(20) + '😀', 'describe');
  assert.equal(Array.from(f.text).length, 16);
  assert.equal(f.dropped, true);
  assert.equal(text.inputFilter('猫猫', 'describe').dropped, false);
  // astral emoji counts as one dropped code point, not two
  assert.equal(text.validCharCount('猫😀'), 1);
  assert.equal(text.validCharCount(' 猫猫 '), 2);
});

test('AC 33: the server never edits text: a string with emoji is rejected (chars), a sanitized one passes', () => {
  assert.equal(text.validate('一只猫😀', 'describe').reason, 'chars');
  assert.equal(text.validate(text.sanitize('一只猫😀'), 'describe').ok, true);
});

test('AC 34: 5 or more digits are rejected in every form (ASCII, fullwidth, mixed, Chinese numerals)', () => {
  for (const s of ['我的号码12345', '１２３４５', '1 2 3 4 5', '1-3-8-0-0', '一二三四五', '壹贰叁肆伍', '13八二三四', '幺三八零零幺', '零〇一二三四']) {
    assert.equal(text.validate(s, 'describe').reason, 'digits', s);
  }
  // fewer than 5 digits are fine
  assert.equal(text.validate('2024年的猫', 'describe').ok, true);
  assert.equal(text.validate('三只小猪', 'describe').ok, true);
  assert.equal(text.validate('一二三四', 'describe').ok, true);
});

test('AC 34: URLs and domains are rejected', () => {
  for (const s of ['看 http://a.b', 'www.abc.com', 'abc.com', 'a1.cn', '点com', 'baidu。com', 'x.top']) {
    assert.equal(text.validate(s, 'describe').reason, 'url', s);
  }
  assert.equal(text.validate('hello.world', 'describe').ok, true); // not a known TLD
});

test('AC 34: contact words, @-handles', () => {
  for (const s of ['加我', '加微信', '微信号', 'vx', 'wx', 'WX号', 'QQ群', '扣扣', '群号', '电话', '联系我', 'v信', '加v', '私聊', 'wechat']) {
    assert.equal(text.validate(s.length < 2 ? s + s : s, 'describe').ok, false, s);
    assert.equal(text.contactHit(s) !== null, true, s);
  }
  assert.equal(text.validate('找我@abc', 'describe').reason, 'handle');
  assert.equal(text.validate('＠abc', 'describe').reason, 'handle');
  // ordinary text containing similar letters is fine
  assert.equal(text.validate('海豚钻圈', 'describe').ok, true);
  assert.equal(text.validate('super man', 'describe').ok, true);
  assert.equal(text.validate('vxy is a word'.replace('vxy', 'wxyz'), 'describe').ok, true); // wxyz is not the token wx
});

test('AC 35: blocklist hits are rejected locally, including split / spaced / mixed-case evasion', () => {
  for (const s of ['傻逼', '傻 逼', '傻.逼', '傻　逼', '你是个傻逼啊', '去死吧', '习近平', '习 近 平', '毛泽东', '赌博', '吸毒', '做爱', 'FUCK you', 'f.u.c.k', 'sb', 'S B'.replace(' ', ''), '麻将']) {
    const r = text.validate(s, 'describe');
    assert.equal(r.ok, false, s);
    assert.ok(['blocklist', 'contact', 'digits'].includes(r.reason), s + ' ' + r.reason);
  }
  assert.equal(text.validate('傻逼', 'describe').reason, 'blocklist');
  assert.equal(text.validate('傻逼', 'describe').category, 'insult');
  assert.equal(text.validate('习近平', 'prompt').category, 'political');
  assert.equal(text.validate('赌场', 'prompt').category, 'gambling');
  // whole-token Latin entries do not fire inside longer words
  assert.equal(text.blocklistHit('sbo'), null);
  assert.equal(text.blocklistHit('the cnn news'), null);
  // clean text passes
  assert.equal(text.blocklistHit('一只猫在开出租车'), null);
});

test('AC 35: local rejection never needs an API: validate is pure and synchronous (no strike path exists here)', () => {
  const r = text.validate('傻逼', 'describe');
  assert.equal(r.ok, false);
  assert.equal(typeof r.then, 'undefined');
});

test('long hostile input is cut off before the regexes run', () => {
  const t0 = Date.now();
  assert.equal(text.validate('a'.repeat(100000), 'describe').reason, 'length');
  assert.ok(Date.now() - t0 < 100);
});
