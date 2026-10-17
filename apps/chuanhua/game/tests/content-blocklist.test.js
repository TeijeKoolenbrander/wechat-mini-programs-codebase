'use strict';
// Blocklist tuning (docs/chuanhua/content-fixes.md 2, qa/content-check.md, bugs QA-4 / QA-5): the narrowed terms, the 87 added
// terms, QA's missing terms and the contact-evasion patterns block; the protected everyday phrases pass; no prompt trips.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../core/text');
const blocklist = require('../core/content/blocklist.v1');
const { PROMPTS } = require('../core/content/prompts.v1');

const wrap = (s) => '一只' + s + '的猫';
const blocked = (s) => !T.validate(wrap(s), 'describe').ok;

// content-fixes 2.2 G1-G10 (87 terms: zh and latin)
const G = {
  G1: ['小鸡鸡', '小丁丁', '大胸', '巨乳', '奶头', '裸奔', '裸露', '脱光', '包养'],
  G2: ['dick', 'cock', 'pussy', 'tits', 'boobs', 'penis', 'vagina', 'sexy', 'cum'],
  G3: ['狗日的', '婊', '人渣', '脑瘫', '残废', '低能儿', '娘炮', '人妖', '基佬', '蠢猪', '滚蛋'],
  G4: ['cnmb', 'nmb', 'sjb', 'mdzz', 'rnm', 'shit'],
  G5: ['杀了你', '杀你', '手枪', '步枪', '机枪', '冲锋枪', '狙击', '砍头', '割喉', '恐袭', '轻生', '想死'],
  G6: ['尼哥', '鬼佬', '洋鬼子', '偷井盖', '外地狗'],
  G7: ['李强', '赵乐际', '王沪宁', '蔡奇', '丁薛祥', '李希', '韩正', '周恩来', '总书记', '国家主席', '庆丰包子', '维尼熊', '8964', '五月三十五',
    '坦克人', '文革', '文化大革命', '集中营', '再教育营', '台湾独立', '香港独立', '光复香港', '时代革命', '国歌', '党旗', '党徽', '军旗'],
  G8: ['ccp', 'winnie', 'pooh'],
  G9: ['毒贩'],
  G10: ['网贷', '裸贷', '套现', '代孕'],
};
// the narrower replacements for B1-B7
const NARROWED = ['他妈的', '你妈的', '妈了个', '你妈逼', '你妈死', '死妈', '高丽棒子', '韩国棒子', '吸大麻', '抽大麻', '大麻烟', '大麻叶',
  '游戏外挂', '开外挂', '卖外挂', '日结工资', '日结兼职'];
// QA-4 (qa/bugs.md, content-check.md)
const QA4 = ['草泥马', '妈逼', '屄', '大鸡吧', '嫖', '嫖客', '妓院', '迷奸', '幼女', '恋童', '强上', '下体', '私处', '生殖器', '三陪',
  '日了狗', '傻x', 'shabi', 'caonima', '他娘的', '我草', '死爹', '共党', '反党', '习总', 'flg', '中南海', '想死', '不想活', '轻生', '自焚', '自尽',
  '纳粹', '希特勒', '法西斯', '炸学校', '炸地铁', '爆头', '毒死', '大烟', '溜冰', 'k他', '神仙水', '开心水', '押宝', '买码', '赌马', '赌注', '德州扑克',
  '小鬼子', '倭寇', '洋鬼子'];
// QA-5 contact evasions
const QA5 = ['v我', '薇我', '加薇', 'w x', 'wei xin', 'Q群', 'dd我', '私我', '戳我', 'w.x', 'W X', 'q q', 'v x', 'we chat', '加 薇', 'ｖ我'];
const SPACED = ['s b', 's.b', 'c n m', 'n m s l', 'f l g'];

test('added blocklist terms: the 87 terms of content-fixes G1-G10 all block', () => {
  assert.equal(Object.values(G).reduce((n, a) => n + a.length, 0), 87);
  for (const [g, terms] of Object.entries(G)) for (const t of terms) assert.ok(blocked(t), g + ' ' + t);
});

test('narrowed terms (B1-B7) and QA-4 terms block', () => {
  for (const t of NARROWED.concat(QA4)) assert.ok(blocked(t), t);
});

test('QA-5 / QA-4 evasions: homophone, spaced and fullwidth contact forms and spaced Latin tokens block', () => {
  for (const t of QA5) assert.ok(blocked(t), t);
  for (const t of SPACED) assert.ok(blocked(t), t);
  assert.equal(T.contactHit('wei xin').reason, 'contact');
  assert.equal(T.contactHit('w x').reason, 'contact');
});

test('CTO ruling (TD-91): 麻将 stays blocked', () => {
  assert.ok(blocked('麻将'));
  assert.ok(blocked('爷爷打麻将'));
  assert.ok(blocked('彩票'));
});

test('protected everyday phrases pass (no over-blocking)', () => {
  const ok = ['妈妈的蛋糕', '妈妈的围裙', '玉米棒子', '接力棒子', '挥棒子', '大麻雀', '大麻花', '大麻绳', '大麻袋', '窗外挂着灯笼', '门外挂着灯笼', '生日结束了', '节日结束',
    '我日记本', '我日常', '你妈妈', '他妈妈在晾衣服', '中共同参与', '其中共有三个', '家中共有', '乌龟头', '海龟头', '公鸡鸡冠', '白粉笔', '水枪', '杀鱼', '杀菌',
    '学习总结', '复习总结', '年轻生活', '不想活动', '溜冰场', '溜冰鞋', '我草莓', '我草地', '想死党', '下体育课', '加强上课', '大烟囱', '接近平地', '小狗日记',
    '废物利用', '猫翻墙', '全民运动会', 'a cocktail', 'wxyz', 'tx', 'two xylophones', '周一韩正在画画', '李强壮', '蔡奇怪的猫', '开房车', '开房门', '黑猪', '每回回'];
  for (const s of ok) {
    const v = T.validate(s, 'describe');
    if (s.length < 2) continue;
    assert.ok(v.ok || v.reason === 'length', s + ' -> ' + v.reason);
  }
});

test('no prompt trips the blocklist, the contact patterns or the exceptions; the bank has 423 prompts', () => {
  assert.equal(PROMPTS.length, 423);
  for (const p of PROMPTS) {
    assert.equal(T.blocklistHit(p.text), null, p.id + ' ' + p.text);
    assert.equal(T.contactHit(p.text), null, p.id + ' ' + p.text);
  }
});

test('blocklist shape: terms unique across categories, lower-case, every exception contains a listed term, categories >= 5', () => {
  const all = [];
  for (const terms of Object.values(blocklist.zh)) all.push(...terms);
  for (const kind of ['token', 'contains']) for (const terms of Object.values(blocklist.latin[kind])) all.push(...terms);
  assert.equal(new Set(all).size, all.length, 'duplicate term');
  for (const t of all) assert.equal(t, t.toLowerCase(), t);
  for (const e of blocklist.exceptions) {
    assert.ok(Object.values(blocklist.zh).some((terms) => terms.some((t) => e.includes(t))), 'exception without a term: ' + e);
  }
  assert.equal(new Set(blocklist.exceptions).size, blocklist.exceptions.length);
  for (const c of ['political', 'sexual', 'insult', 'drugs', 'gambling', 'violence', 'slur', 'spam']) assert.ok(blocklist.zh[c].length >= 5, c);
});
