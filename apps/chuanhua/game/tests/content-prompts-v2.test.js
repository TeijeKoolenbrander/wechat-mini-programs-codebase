'use strict';
// Prompt bank v2 (spec rev. 2 section 4.3, F-2): size, balance, uniqueness, charset, blocklist, v1 preservation,
// near-duplicates and issue-class screening. Self-contained on purpose: it reads only the two content modules, so
// it keeps working while core/ is rewritten. Every check collects ALL offenders so one run shows the whole list.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const v2 = require('../core/content/prompts.v2');
const v1 = require('../core/content/prompts.v1');
const blocklist = require('../core/content/blocklist.v1');

const PROMPTS = v2.prompts;
const KEYS = 'ABCDEFGHIJKL'.split('');
const V1_IDS = new Set(v1.PROMPTS.map((p) => p.id));
const NEW = PROMPTS.filter((p) => !V1_IDS.has(p.id));
const active = PROMPTS.filter((p) => !p.retired);

/** Normalisation for duplicate checks: drop 的/了, and the measure words 一个/一只/一碗. */
function norm(s) {
  return s.replace(/的|了|一个|一只|一碗/g, '');
}
const len = (s) => Array.from(s).length;

/** Same matching as core/text.js#blocklistHit (NFKC, lower-case, keep letters and digits, blank out exceptions). */
function blocklistHit(s) {
  let t = s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const e of blocklist.exceptions) t = t.split(e.toLowerCase()).join('');
  for (const group of Object.keys(blocklist.zh)) for (const w of blocklist.zh[group]) if (t.includes(w.toLowerCase())) return w;
  const runs = t.match(/[a-z]+/g) || [];
  for (const group of Object.keys(blocklist.latin.token)) for (const w of blocklist.latin.token[group]) if (runs.includes(w)) return w;
  for (const group of Object.keys(blocklist.latin.contains)) for (const w of blocklist.latin.contains[group]) if (t.includes(w)) return w;
  return null;
}

function fail(label, list) {
  assert.equal(list.length, 0, `${label} (${list.length}):\n  ` + list.slice(0, 60).join('\n  '));
}

test('v2: version 2, at least 2,000 active prompts, categories A-L', () => {
  assert.equal(v2.version, 2);
  assert.ok(active.length >= 2000, `only ${active.length} active prompts`);
  assert.deepEqual(v2.categories.map((c) => c.key), KEYS);
});

test('v2: at least 120 active prompts in every category (3-category rolls always have a pool)', () => {
  const per = {};
  for (const p of active) per[p.cat] = (per[p.cat] || 0) + 1;
  for (const k of KEYS) assert.ok((per[k] || 0) >= 120, `${k} has ${per[k]}`);
  const counts = KEYS.map((k) => per[k]);
  assert.ok(Math.max(...counts) <= 2 * Math.min(...counts), 'categories badly unbalanced: ' + counts.join(','));
});

test('v2: ids are unique, and new ids are <cat><4 digits> contiguous from 1001 per category', () => {
  const ids = new Set();
  const bad = [];
  for (const p of PROMPTS) {
    if (ids.has(p.id)) bad.push('duplicate id ' + p.id);
    ids.add(p.id);
    if (!KEYS.includes(p.cat)) bad.push(p.id + ' unknown cat ' + p.cat);
    if (p.id[0] !== p.cat) bad.push(p.id + ' id/cat mismatch');
  }
  fail('id problems', bad);
  for (const k of KEYS) {
    const mine = NEW.filter((p) => p.cat === k).map((p) => p.id);
    mine.forEach((id, i) => {
      if (id !== k + String(1001 + i)) bad.push(`${k}: expected ${k}${1001 + i} got ${id}`);
    });
  }
  fail('new id scheme', bad);
  for (const p of NEW) assert.match(p.id, /^[A-L]\d{4}$/, p.id);
});

test('v2: all 423 v1 prompts are present with identical id, text and category', () => {
  const byId = new Map(PROMPTS.map((p) => [p.id, p]));
  const bad = [];
  for (const o of v1.PROMPTS) {
    const n = byId.get(o.id);
    if (!n) bad.push('missing ' + o.id);
    else if (n.text !== o.text || n.cat !== o.cat) bad.push(`${o.id} changed: ${o.text} -> ${n.text}`);
  }
  fail('v1 preservation', bad);
  assert.equal(v1.PROMPTS.length, 423);
  // v1 ids that were retired in v2 would still be present; none may be retired before release review.
  assert.equal(PROMPTS.filter((p) => V1_IDS.has(p.id)).length, 423);
});

test('v2: length 2-12 code points (new prompts 3-12), CJK ideographs only, no spaces, digits, Latin or emoji', () => {
  const bad = [];
  for (const p of PROMPTS) {
    const n = len(p.text);
    const min = V1_IDS.has(p.id) ? 2 : 3;
    if (n < min || n > 12) bad.push(`${p.id} ${p.text} has ${n} code points`);
    if (!/^[一-鿿]+$/.test(p.text)) bad.push(`${p.id} ${p.text} has characters outside CJK ideographs`);
  }
  fail('length/charset', bad);
});

test('v2: no exact or normalised duplicate among ACTIVE prompts (的/了/一个/一只/一碗 removed)', () => {
  const exact = new Map();
  const normed = new Map();
  const bad = [];
  for (const p of active) {
    if (exact.has(p.text)) bad.push(`exact: ${p.id} = ${exact.get(p.text)} (${p.text})`);
    exact.set(p.text, p.id);
    const n = norm(p.text);
    if (normed.has(n) && normed.get(n) !== exact.get(p.text)) bad.push(`normalised: ${p.id} ${p.text} ~ ${normed.get(n)}`);
    normed.set(n, p.id);
  }
  // also catch the same characters in another order (e.g. 吃鱼猫 / 猫吃鱼 style swaps are not caught; same char multiset is)
  const sorted = new Map();
  for (const p of active) {
    const k = Array.from(norm(p.text)).sort().join('');
    if (sorted.has(k)) bad.push(`same characters: ${p.id} ${p.text} ~ ${sorted.get(k)}`);
    sorted.set(k, p.id + ' ' + p.text);
  }
  fail('duplicates', bad);
});

test('v2: no prompt hits the local blocklist (after exceptions) or looks like contact details', () => {
  const bad = [];
  for (const p of PROMPTS) {
    const hit = blocklistHit(p.text);
    if (hit) bad.push(`${p.id} ${p.text} hits "${hit}"`);
    if (/[a-z0-9@]|http|www|微信|加我|qq|vx|wx/i.test(p.text)) bad.push(`${p.id} ${p.text} looks like contact info`);
  }
  fail('blocklist', bad);
});

test('v2: exceptions list is only used for phrases that really contain a listed term (blocklist test stays meaningful)', () => {
  // a prompt that only passes because of an exception must be an everyday phrase; list every use so reviewers see it
  const used = [];
  for (const p of PROMPTS) {
    const t = p.text.normalize('NFKC');
    for (const e of blocklist.exceptions) if (t.includes(e)) used.push(`${p.id} ${p.text} (exception ${e})`);
  }
  assert.ok(used.length <= 5, 'many prompts rely on blocklist exceptions:\n' + used.join('\n'));
});

// Issue classes from content-review.md 1.1, content-fixes.md and qa/content-check.md, as substrings. They are
// deliberately broad (a false hit costs one rewording). v1 prompts are exempt: they were reviewed and signed off
// (e.g. 打太极拳, 跳伞); the lists apply to every NEW prompt.
const ISSUE_CLASSES = {
  'body / sexual angle': ['裸', '胸', '屁', '尿', '屎', '肚', '脚', '腿', '指甲', '刮胡', '吻', '亲嘴', '内衣', '内裤', '香肠', '热狗', '蜜桃', '桃子', '香蕉'],
  'bathing / sunbathing': ['澡', '浴', '温泉', '泡汤', '日光浴', '晒太阳'],
  'weapons / military / police / violence': ['枪', '剑', '刀', '箭', '弓', '炮', '军', '兵', '警', '杀', '打架', '战', '武', '拳', '摔跤', '击', '射', '血', '炸弹', '爆炸', '鞭'],
  'flags / maps / national symbols / currency': ['旗', '地图', '国庆', '国徽', '国歌', '钱', '币', '纸钞', '红包'],
  'medical / illness': ['医', '药', '病', '打针', '针灸', '针头', '注射', '护士', '口罩', '体温', '感冒', '发烧', '手术', '救护'],
  'death / superstition / religion / folk custom': ['死', '鬼', '神', '佛', '庙', '拜', '香火', '算命', '风水', '艾草', '香囊', '茱萸', '孔明灯', '木鱼', '龙宫', '清明', '祭', '墓', '棺', '圣', '许愿池', '玉兔捣药'],
  'romance / marriage': ['爱', '情', '婚', '恋', '约会', '王子', '白马', '七夕', '玫瑰'],
  'gambling / alcohol / tobacco / drugs': ['赌', '彩票', '麻将', '扑克', '斗地主', '抽奖', '酒', '香烟', '抽烟', '烟草', '毒'],
  'politics / disasters': ['党', '政', '地震', '洪水', '龙卷风', '火山', '沙尘', '海啸', '火灾', '灾'],
  'brands / copyrighted characters / real people': ['可乐', '麦当劳', '肯德基', '星巴克', '苹果手机', '华为', '小米', '微信', '抖音', '迪士尼', '米老鼠', '唐老鸭', '皮卡丘', '哆啦', '孙悟空', '哪吒', '白雪公主', '灰姑娘', '艾莎', '哈利', '超人', '蜘蛛侠', '维尼', '喜羊羊', '光头强', '熊大', '佩奇'],
  'regional / obscure': ['东北', '北方', '南方', '广东', '上海', '北京', '台湾', '香港', '新疆', '西藏', '秧歌', '旱船', '打更'],
};

test('v2: no NEW prompt falls into an issue class flagged by the v1 review', () => {
  const bad = [];
  for (const p of NEW) {
    for (const cls of Object.keys(ISSUE_CLASSES)) {
      for (const w of ISSUE_CLASSES[cls]) if (p.text.includes(w)) bad.push(`${p.id} ${p.text}: ${cls} (${w})`);
    }
    if (p.text.includes('烟') && !p.text.includes('烟花')) bad.push(`${p.id} ${p.text}: tobacco/smoke (烟)`);
  }
  fail('issue classes', bad);
});

/** Near-duplicate heuristic for pairs involving at least one new prompt (v1 x v1 pairs are signed off). */
function bigrams(s) {
  const a = Array.from(s);
  const m = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a[i] + a[i + 1];
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}
function dice(a, b) {
  let inter = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v;
  for (const v of b.values()) nb += v;
  for (const [g, v] of a) if (b.has(g)) inter += Math.min(v, b.get(g));
  return na + nb === 0 ? 0 : (2 * inter) / (na + nb);
}

test('v2: no near-duplicates among ACTIVE prompts (containment with <= 2 extra characters, or bigram overlap >= 0.75)', () => {
  const items = active.map((p) => {
    const n = norm(p.text);
    return { p, n, g: bigrams(n), isNew: !V1_IDS.has(p.id) };
  });
  const bad = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a.isNew && !b.isNew) continue;
      const [s, l] = a.n.length <= b.n.length ? [a, b] : [b, a];
      const sl = Array.from(s.n).length;
      const ll = Array.from(l.n).length;
      let why = null;
      if (sl >= 3 && ll - sl <= 2 && l.n.includes(s.n)) why = 'contains';
      else if (Math.min(sl, ll) >= 4 && dice(a.g, b.g) >= 0.75) why = 'overlap ' + dice(a.g, b.g).toFixed(2);
      if (why) bad.push(`${a.p.id} ${a.p.text} ~ ${b.p.id} ${b.p.text} (${why})`);
    }
  }
  fail('near-duplicates', bad);
});

test('v2: no more than 12 prompts share the same first two characters (stops modifier families)', () => {
  const by = {};
  for (const p of PROMPTS) {
    const k = Array.from(p.text).slice(0, 2).join('');
    (by[k] = by[k] || []).push(p.id);
  }
  const bad = Object.keys(by).filter((k) => by[k].length > 12).map((k) => `${k}: ${by[k].length}`);
  fail('prefix families', bad);
});

test('v2: no per-prompt object has unexpected keys', () => {
  const bad = [];
  for (const p of PROMPTS) {
    for (const k of Object.keys(p)) if (!['id', 'text', 'cat', 'retired'].includes(k)) bad.push(`${p.id} has key ${k}`);
    if ('retired' in p && p.retired !== true) bad.push(`${p.id} retired must be true`);
  }
  fail('shape', bad);
});

test('v2: active counts match the independent review (content-fixes-v2.md section 2): 2,042 active, 210 retired, none of them v1', () => {
  const expected = { A: 186, B: 185, C: 182, D: 189, E: 135, F: 132, G: 154, H: 144, I: 218, J: 180, K: 178, L: 159 };
  const per = {};
  for (const p of active) per[p.cat] = (per[p.cat] || 0) + 1;
  assert.deepEqual(per, expected);
  assert.equal(active.length, 2042);
  assert.equal(PROMPTS.length - active.length, 210);
  assert.equal(PROMPTS.filter((p) => p.retired && V1_IDS.has(p.id)).length, 0);
});
