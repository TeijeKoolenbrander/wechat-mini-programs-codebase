'use strict';
/**
 * Content validation for 群友刻度盘 (spec section 4 and section 17 AC 8).
 * Run alone, no other project files needed:
 *   node --test apps/kedupan/game/tests/content-spectra.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// the FULL library: client text merged with the server-only answer key (core/content/anchors.v1.js)
const lib = require('../core/content').serverLibrary();
const forbidden = require('../core/content/forbidden.v1.js');

// Spec 4.3 minimum spectra per category.
const QUOTAS = {
  food: 40, life: 40, home: 25, animal: 25, nature: 25, senses: 25,
  leisure: 25, travel: 20, study: 20, tech: 20, feel: 20, memory: 15,
};
const CATEGORY_LABELS = {
  food: '吃喝', life: '日常', home: '居家物件', animal: '动物', nature: '天气自然',
  senses: '感官', leisure: '休闲爱好', travel: '出行', study: '学习工作',
  tech: '物件科技', feel: '心情感受', memory: '童年回忆',
};
// Terms named in AC 8; the forbidden list must contain every one of them.
const AC8_TERMS = ['波长', 'Wavelength', '麻将', '赌', '彩票', '喝酒', '香烟', '男生', '女生',
  '胖', '丑', '省份', '民族', '宗教', '老头乐'];

const CJK = /^[一-鿿]+$/;
const SPECTRUM_ID = /^s\d{3}$/;
const len = (s) => Array.from(s).length;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const FESTIVALS = ['midautumn', 'dragonboat', 'spring', 'lantern'];

function validTag(t) {
  if (t === 'easy' || t === 'split') return true;
  if (t.startsWith('season:')) return SEASONS.includes(t.slice(7));
  if (t.startsWith('festival:')) return FESTIVALS.includes(t.slice(9));
  return false;
}
function isEasy(anchor) { return anchor <= 20 || anchor >= 80; }

const spectra = lib.spectra;

test('module shape', () => {
  assert.ok(Number.isInteger(lib.contentVersion) && lib.contentVersion >= 1);
  assert.ok(Array.isArray(lib.categories) && Array.isArray(spectra));
  assert.equal(lib.categories.length, 12);
  lib.categories.forEach((c) => {
    assert.equal(CATEGORY_LABELS[c.key], c.label, `category ${c.key}`);
  });
  assert.deepEqual(lib.categories.map((c) => c.key).sort(), Object.keys(QUOTAS).sort());
});

test('AC8: at least 300 spectra, each with at least 10 items', () => {
  assert.ok(spectra.length >= 300, `only ${spectra.length} spectra`);
  spectra.forEach((s) => {
    assert.ok(Array.isArray(s.items) && s.items.length >= 10, `${s.id} has ${s.items && s.items.length} items`);
  });
  const total = spectra.reduce((n, s) => n + s.items.length, 0);
  assert.ok(total >= 3000, `only ${total} items`);
});

test('AC8: unique stable ids with the specified format', () => {
  const sIds = new Set();
  const iIds = new Set();
  spectra.forEach((s) => {
    assert.match(s.id, SPECTRUM_ID, `spectrum id ${s.id}`);
    assert.ok(!sIds.has(s.id), `duplicate spectrum id ${s.id}`);
    sIds.add(s.id);
    let prev = 0;
    s.items.forEach((it, idx) => {
      // Ids are never reused (spec 4.5): deleted items leave gaps, new items take the next free number.
      assert.match(it.id, new RegExp('^' + s.id + 'i\\d{2}$'), `item id in ${s.id} at position ${idx + 1}`);
      const n = Number(it.id.slice(-2));
      assert.ok(n > prev, `item ids in ${s.id} must ascend: ${it.id}`);
      prev = n;
      assert.ok(!iIds.has(it.id), `duplicate item id ${it.id}`);
      iIds.add(it.id);
    });
  });
});

test('AC8: left/right are 1-4 Chinese characters, no punctuation, a real pair', () => {
  const pairs = new Set();
  spectra.forEach((s) => {
    [s.left, s.right].forEach((x) => {
      assert.equal(typeof x, 'string', `${s.id} label type`);
      assert.ok(len(x) >= 1 && len(x) <= 4, `${s.id} label "${x}" length ${len(x)}`);
      assert.match(x, CJK, `${s.id} label "${x}" must be Chinese characters only`);
    });
    assert.notEqual(s.left, s.right, `${s.id} left equals right`);
    const k = s.left + '|' + s.right;
    const r = s.right + '|' + s.left;
    assert.ok(!pairs.has(k) && !pairs.has(r), `${s.id} duplicate or reversed pair ${k}`);
    pairs.add(k);
  });
});

test('AC8: item text is 1-10 Chinese characters, unique inside its spectrum', () => {
  spectra.forEach((s) => {
    const seen = new Set();
    s.items.forEach((it) => {
      assert.equal(typeof it.text, 'string', `${it.id} text type`);
      assert.ok(len(it.text) >= 1 && len(it.text) <= 10, `${it.id} "${it.text}" length ${len(it.text)}`);
      assert.match(it.text, CJK, `${it.id} "${it.text}" must be Chinese characters only`);
      assert.ok(!seen.has(it.text), `${s.id} repeats "${it.text}"`);
      assert.ok(it.text !== s.left && it.text !== s.right, `${it.id} text equals a pole label`);
      seen.add(it.text);
    });
  });
});

test('AC8: anchors are integers 5-95', () => {
  spectra.forEach((s) => s.items.forEach((it) => {
    assert.ok(Number.isInteger(it.anchor), `${it.id} anchor ${it.anchor}`);
    assert.ok(it.anchor >= 5 && it.anchor <= 95, `${it.id} anchor ${it.anchor} out of 5-95`);
  }));
});

test('tags are valid and consistent with anchors (spec 4.1)', () => {
  spectra.forEach((s) => s.items.forEach((it) => {
    assert.ok(Array.isArray(it.tags), `${it.id} tags`);
    it.tags.forEach((t) => assert.ok(validTag(t), `${it.id} unknown tag ${t}`));
    assert.equal(new Set(it.tags).size, it.tags.length, `${it.id} duplicate tags`);
    const easy = it.tags.includes('easy');
    const split = it.tags.includes('split');
    assert.equal(easy, isEasy(it.anchor), `${it.id} easy tag must match anchor ${it.anchor} (<=20 or >=80)`);
    assert.ok(!(easy && split), `${it.id} cannot be both easy and split`);
    if (split) assert.ok(it.anchor >= 25 && it.anchor <= 75, `${it.id} split anchor ${it.anchor} not 25-75`);
    assert.ok(it.tags.filter((t) => t.startsWith('season:')).length <= 1, `${it.id} several seasons`);
  }));
});

test('every spectrum can serve the daily rules (PD-29) and is a real spectrum', () => {
  spectra.forEach((s) => {
    const easy = s.items.filter((i) => i.tags.includes('easy')).length;
    const split = s.items.filter((i) => i.tags.includes('split')).length;
    const low = s.items.filter((i) => i.anchor <= 35).length;
    const high = s.items.filter((i) => i.anchor >= 65).length;
    assert.ok(easy >= 2, `${s.id} ${s.left}|${s.right}: only ${easy} easy items`);
    assert.ok(split >= 2, `${s.id} ${s.left}|${s.right}: only ${split} split items`);
    assert.ok(low >= 2 && high >= 2, `${s.id} ${s.left}|${s.right}: items do not cover both ends (low ${low}, high ${high})`);
  });
});

test('library supports a 365-day schedule (spec 4.2)', () => {
  const items = spectra.flatMap((s) => s.items);
  const easy = items.filter((i) => i.tags.includes('easy')).length;
  const split = items.filter((i) => i.tags.includes('split')).length;
  assert.ok(items.length >= 365 * 5, 'not enough items for 365 unique days');
  assert.ok(easy >= 365, `only ${easy} easy items for 365 card-1 slots`);
  assert.ok(split >= 365, `only ${split} split items for 365 days`);
  // Each day uses 5 different categories: no category may be needed more than once a day,
  // so every category must hold at least 365 items to be usable on every day it is picked.
  Object.keys(QUOTAS).forEach((k) => {
    const n = spectra.filter((s) => s.cat === k).reduce((a, s) => a + s.items.length, 0);
    assert.ok(n >= 150, `category ${k} has only ${n} items`);
  });
});

test('AC8: category quotas of spec 4.3 are met', () => {
  const counts = {};
  Object.keys(QUOTAS).forEach((k) => { counts[k] = 0; });
  spectra.forEach((s) => {
    assert.ok(Object.prototype.hasOwnProperty.call(QUOTAS, s.cat), `${s.id} unknown category ${s.cat}`);
    counts[s.cat] += 1;
  });
  Object.keys(QUOTAS).forEach((k) => {
    assert.ok(counts[k] >= QUOTAS[k], `category ${k}: ${counts[k]} < ${QUOTAS[k]}`);
  });
});

test('forbidden list contains every AC8 term and works', () => {
  const have = new Set(forbidden.terms);
  AC8_TERMS.forEach((t) => assert.ok(have.has(t.toLowerCase()), `forbidden list lacks "${t}"`));
  assert.ok(forbidden.groups.brands.length >= 50, 'brand list too short');
  assert.deepEqual(forbidden.find('今晚喝酒吗'), ['酒', '喝酒']);
  assert.deepEqual(forbidden.find('WAVELENGTH'), ['wavelength']);
  assert.equal(forbidden.isClean('火锅'), true);
  forbidden.terms.forEach((t) => assert.ok(t.length >= 1 && t === t.toLowerCase(), `bad term "${t}"`));
});

test('AC8: no forbidden term appears in any user-visible string', () => {
  const bad = [];
  const check = (where, str) => {
    const hit = forbidden.find(str);
    if (hit.length) bad.push(`${where} "${str}" contains ${hit.join(',')}`);
  };
  lib.categories.forEach((c) => { check('category ' + c.key, c.label); });
  spectra.forEach((s) => {
    check(s.id + ' left', s.left);
    check(s.id + ' right', s.right);
    s.items.forEach((it) => check(it.id, it.text));
  });
  assert.deepEqual(bad, []);
});

test('review sheet (if present) lists every spectrum id once, with AIGC provenance', () => {
  const file = path.join(__dirname, '..', '..', '..', '..', 'docs', 'kedupan', 'content-review.md');
  if (!fs.existsSync(file)) return; // the sheet lives outside apps/kedupan; skip when run in isolation
  const md = fs.readFileSync(file, 'utf8');
  const rows = md.split('\n').filter((l) => /^\|\s*s\d{3}\s*\|/.test(l));
  const ids = rows.map((l) => l.split('|')[1].trim());
  assert.equal(new Set(ids).size, ids.length, 'duplicate rows in review sheet');
  assert.deepEqual(ids.slice().sort(), spectra.map((s) => s.id).sort(), 'review sheet rows differ from library ids');
  assert.match(md, /AIGC|AI-assisted|AI 辅助|AI辅助/);
});
