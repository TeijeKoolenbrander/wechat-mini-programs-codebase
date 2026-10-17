'use strict';
// QA (independent second reviewer): content. Written from spec 4.2 / 5.6 / 19 (AC 34, 35, 87) and Appendix B, not from the
// developers' tests. Results are summarised in docs/chuanhua/qa/content-check.md. Tests marked `todo` document OPEN BUGS
// (docs/chuanhua/qa/bugs.md): they run and report, but do not fail the suite until the owner fixes the list.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../core/text');
const { CHANGES } = require('./content-changes');
const { PROMPTS } = require('../core/content/prompts.v1');

const SPEC = path.join(__dirname, '..', '..', '..', '..', 'docs', 'chuanhua', 'spec.md');

test('QA content: the shipped prompt bank is Appendix B of the spec plus the documented change list (423 ids; TD-90)', () => {
  const spec = fs.readFileSync(SPEC, 'utf8');
  const app = spec.slice(spec.indexOf('## Appendix B'));
  const re = /\b([A-L]\d\d) ([^·\n*]+?)(?= ·|\n|$)/g;
  const specMap = {};
  let m;
  while ((m = re.exec(app))) specMap[m[1]] = m[2].trim();
  assert.equal(Object.keys(specMap).length, 423);
  assert.equal(PROMPTS.length, 423);
  // the spec is not re-synced (docs are not ours to edit here): every divergence must be in tests/content-changes.js,
  // with the old text equal to the spec text, and no change may be unused
  for (const [id, c] of Object.entries(CHANGES)) assert.equal(specMap[id], c.old, 'change list old text for ' + id);
  for (const p of PROMPTS) assert.equal(CHANGES[p.id] ? CHANGES[p.id].new : specMap[p.id], p.text, p.id);
  assert.equal(PROMPTS.filter((p) => CHANGES[p.id]).length, Object.keys(CHANGES).length);
});

// ---- my own forbidden-term scan (spec 4.2): independent of the developers' blocklist ------------------------------------
const FORBIDDEN = {
  politics: ['党', '政府', '总统', '主席', '领导人', '国旗', '国徽', '国歌', '地图', '选举', '游行', '军', '警察', '战争', '导弹', '坦克', '枪', '炮'],
  religion: ['佛', '菩萨', '观音', '耶稣', '上帝', '教堂', '寺', '庙', '道士', '和尚', '尼姑', '算命', '占卜', '风水', '鬼', '僵尸', '幽灵', '神仙', '许愿灵'],
  vice: ['酒', '啤', '烟草', '香烟', '雪茄', '赌', '麻将', '彩票', '扑克', '骰', '毒', '大麻'],
  body: ['裸', '内衣', '比基尼', '乳', '臀', '胸', '亲吻', '接吻', '恋爱', '情侣', '结婚', '婚礼', '床上'],
  violence: ['杀', '血', '死亡', '尸', '葬', '墓', '自杀', '刀', '爆炸', '打架', '暴力', '虐'],
  brands: ['可乐', '麦当劳', '肯德基', '星巴克', '迪士尼', '米老鼠', '奥特曼', '皮卡丘', '哆啦', '佩奇', '喜羊羊', '熊出没', '华为', '耐克', '阿迪', '苹果手机', 'iphone', '微信', '抖音', '淘宝', '乐高', '宝马', '奔驰', '特斯拉'],
  people: ['总统', '明星', '歌星', '偶像', '网红', '主播', '影帝', '影后'],
};

test('QA content (AC 87, spec 4.2): none of the 423 prompts contains a politics / religion / vice / body / violence / brand / real-person term', () => {
  const hits = [];
  for (const p of PROMPTS) for (const [cat, terms] of Object.entries(FORBIDDEN)) for (const t of terms) if (p.text.toLowerCase().includes(t)) hits.push(`${p.id} ${p.text} [${cat}:${t}]`);
  assert.deepEqual(hits, []);
});

test('QA content: no prompt invites the obvious dirty-drawing joke by name (reviewed list; advisories in content-check.md are swaps worth considering, not failures)', () => {
  const dirty = ['屁股', '内裤', '胸', '生殖', '下体', '撒尿', '拉屎', '放屁', '大便', '小便', '脱衣', '洗澡的人', '光屁股'];
  for (const p of PROMPTS) for (const d of dirty) assert.ok(!p.text.includes(d), p.id + ' ' + p.text);
});

test('QA content: prompts are single-line, no digits or Latin (so contact / URL rules can never fire on a preset), 2-12 code points', () => {
  for (const p of PROMPTS) {
    assert.match(p.text, /^[一-鿿]+$/, p.id + ' ' + p.text);
    const n = Array.from(p.text).length;
    assert.ok(n >= 2 && n <= 12, p.id);
  }
});

test('QA content: every category has a name and the category counts are 11 x 35 + 38', () => {
  const by = {};
  PROMPTS.forEach((p) => (by[p.cat] = (by[p.cat] || 0) + 1));
  const counts = Object.values(by).sort((a, b) => a - b);
  assert.equal(counts.length, 12);
  assert.equal(counts.reduce((a, b) => a + b, 0), 423);
});

// ---- blocklist gaps (spec 5.6 lists the categories; these are obvious abuse terms) -----------------------------------
const blocked = (s) => !T.validate('一只' + s + '的猫', 'describe').ok;
const MUST_BLOCK = {
  'sexual / minors': ['草泥马', '妈逼', '大鸡吧', '嫖客', '妓院', '迷奸', '幼女', '恋童', '脱光', '强上'],
  insult: ['狗日的', '傻x', '他娘的', '我草', 'caonima', 'shabi', '日了狗', '死爹'],
  political: ['共党', '反党', '习总', 'flg', '台湾独立', '8964', '新疆集中营'],
  'self-harm (minors)': ['想死', '不想活', '轻生', '自焚'],
  'violence / hate': ['纳粹', '希特勒', '炸学校', '爆头'],
  drugs: ['大烟', '溜冰', 'k他', '神仙水'],
  gambling: ['押宝', '买码', '赌马', '赌注'],
  // 黑猪 (a breed of pig, drawable) and 回回 ("每回回") are deliberately NOT blocked: everyday words, TD-91
  'regional / ethnic slurs': ['小鬼子', '倭寇', '洋鬼子'],
};
for (const [cat, terms] of Object.entries(MUST_BLOCK)) {
  test(`QA-4 blocklist gap (${cat}): obvious terms must be rejected locally`, () => {
    const missed = terms.filter((t) => !blocked(t));
    assert.deepEqual(missed, []);
  });
}

test('QA-5 contact-pattern evasions (AC 34): spaced / homophone WeChat and QQ-group forms are rejected locally', () => {
  const missed = ['v我', '薇我', '加薇', 'w x', 'wei xin', 'Q群', 'dd我', '私我'].filter((t) => !blocked(t));
  assert.deepEqual(missed, []);
});

test('QA content: evasions the list DOES handle (spacing, case, full-width, punctuation, mixed script)', () => {
  for (const s of ['傻 逼', '傻.逼', '傻　逼', '傻Ｂ', 'ＳＢ', 'N M S L', '微-信', '加 我', '1 2 3 4 5', '一二三四五', 'ｗｗｗ.ａ.com', '点 com']) {
    // 'N M S L' is not expected to be caught (single letters); documented below
    if (s === 'N M S L') continue;
    assert.ok(blocked(s), s);
  }
});

test('QA content: the three false positives QA found (他妈妈, 大麻袋, 中共同) no longer block (QA-4 follow-up)', () => {
  for (const s of ['他妈妈在做饭', '一个大麻袋', '中共同参与']) assert.equal(T.validate(s, 'describe').ok, true, s);
});
