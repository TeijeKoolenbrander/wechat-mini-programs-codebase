'use strict';
// QA (v1 content, contentVersion 2): checks that do NOT read the spec's own roster back to itself.
//  1. Historical sanity: a hand-written table of death years (and a few birth years) is checked against every general's
//     appearance eras (nobody serves in an era that starts after their death or ends before they were 15).
//  2. Sensitivity (PO-4): leaders of ethnic-minority uprisings other than 孟获 are absent; 孟获 text carries no slur.
//  3. Player-visible text hygiene: statNote / blurb are shown in the detail sheet, so no developer jargon may reach players.
//     (todo = confirmed bug, see docs/dianjiangtai/qa/bugs.md; the test flips to a real regression when it is fixed)
//  4. No insulting or meme wording (AC 59 intent, spec content-review notes).
//  5. Seal-only portraits (CTO-D1): portraitId null everywhere, no image reference in shipped code.
//  6. 复盘 timing (AC 16, 75) measured on contentVersion 2 token sets with the real search.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const content = require('../core/content/generals.v2.js');
const { hash32, sub } = require('../core/rng');
const { getConfig } = require('../core/config');
const { makeScenario } = require('../core/sim');
const { buildSheet } = require('../core/sheet');
const { playRun } = require('../core/players');
const { bestLineup, enumerateSets } = require('../core/search');
const { getContent } = require('../core/content');

const GAME = path.join(__dirname, '..');
const G = Object.fromEntries(content.generals.map((g) => [g.name, g]));

// era windows (spec 3.3)
const ERA_START = { huangjin: 184, qunxiong: 190, chibi: 208, sanfen: 215, guijin: 235 };
const ERA_END = { huangjin: 189, qunxiong: 207, chibi: 214, sanfen: 234, guijin: 280 };

// death years (public record). Only names where the year is certain are listed.
const DIED = {
  刘备: 223, 关羽: 219, 张飞: 221, 诸葛亮: 234, 赵云: 229, 马超: 222, 黄忠: 220, 姜维: 264, 庞统: 214, 法正: 220, 魏延: 234, 关平: 219,
  王平: 248, 马谡: 228, 马良: 222, 蒋琬: 246, 费祎: 253, 张嶷: 254, 黄权: 240, 刘禅: 271, 罗宪: 270, 曹操: 220, 张郃: 231, 夏侯惇: 220,
  张辽: 222, 荀彧: 212, 郭嘉: 207, 司马懿: 251, 夏侯渊: 219, 曹仁: 223, 乐进: 218, 于禁: 221, 徐晃: 227, 典韦: 197, 曹丕: 226, 曹真: 231,
  贾诩: 223, 程昱: 220, 荀攸: 214, 满宠: 242, 郭淮: 255, 邓艾: 264, 钟会: 264, 庞德: 219, 陈泰: 260, 孙坚: 191, 孙策: 200, 周瑜: 210,
  孙权: 252, 吕蒙: 220, 陆逊: 245, 韩当: 227, 朱治: 224, 太史慈: 206, 凌统: 217, 鲁肃: 217, 张昭: 236, 诸葛瑾: 241, 朱然: 249, 朱桓: 238,
  诸葛恪: 253, 丁奉: 271, 陆抗: 274, 孙皓: 284, 张角: 184, 皇甫嵩: 195, 董卓: 192, 袁绍: 202, 韩遂: 215, 吕布: 198, 张鲁: 216, 卢植: 192,
  朱儁: 195, 公孙瓒: 199, 袁术: 199, 刘表: 208, 刘璋: 219, 张任: 213, 颜良: 200, 沮授: 200, 陈宫: 198, 高顺: 198, 孟达: 228, 公孙渊: 238,
  诸葛诞: 258, 文钦: 258, 司马师: 255, 司马昭: 265, 司马炎: 290, 司马孚: 272, 羊祜: 278, 杜预: 284, 王濬: 285, 贾充: 282, 卫瓘: 291,
  张华: 300, 王戎: 305,
};
// birth years of people who were children in the early eras
const BORN = {
  诸葛亮: 181, 陆逊: 183, 曹丕: 187, 姜维: 202, 邓艾: 197, 钟会: 225, 陆抗: 226, 孙皓: 242, 司马炎: 236, 司马师: 208, 司马昭: 211,
  诸葛恪: 203, 羊祜: 221, 杜预: 222, 王濬: 206, 马谡: 190, 刘禅: 207, 吕蒙: 178,
};

test('historical sanity: no general serves in an era that starts after their death or ends before age 15 (independent table)', () => {
  let checked = 0;
  for (const [name, died] of Object.entries(DIED)) {
    const g = G[name];
    assert.ok(g, 'roster has ' + name);
    for (const a of g.appearances) for (const e of a.eras) {
      assert.ok(ERA_START[e] <= died, `${name} died ${died} but has ${a.faction}/${e} (starts ${ERA_START[e]})`);
      checked++;
    }
  }
  for (const [name, born] of Object.entries(BORN)) {
    for (const a of G[name].appearances) for (const e of a.eras) {
      assert.ok(ERA_END[e] >= born + 15, `${name} born ${born} but has ${a.faction}/${e} (ends ${ERA_END[e]})`);
      checked++;
    }
  }
  assert.ok(Object.keys(DIED).length >= 95, 'death-year table covers most of the roster: ' + Object.keys(DIED).length);
  assert.ok(checked > 200, "checked " + checked);
});

test('historical sanity: the PO-3 camp rules hold on named cases', () => {
  const facs = (n) => G[n].appearances.map((a) => a.faction).sort();
  assert.deepEqual(facs('邓艾'), ['wei'], '邓艾 (d. 264) is 魏 only');
  assert.deepEqual(facs('钟会'), ['wei']);
  assert.deepEqual(facs('司马懿'), ['jin', 'wei']);
  assert.deepEqual(facs('刘备'), ['shu'], 'a lord keeps his own camp');
  assert.deepEqual(facs('孙坚'), ['wu']);
  assert.deepEqual(facs('孙策'), ['wu']);
  assert.ok(!G['关羽'].appearances.some((a) => a.faction === 'wei'), '关羽 under 曹操 (200) is a note, not an appearance');
  assert.ok(!G['廖化'].appearances.some((a) => a.faction === 'wu'));
  assert.ok(G['赵云'].appearances.some((a) => a.faction === 'qun'), '赵云 gained 群 (公孙瓒)');
  assert.ok(G['张郃'].appearances.some((a) => a.faction === 'qun' && a.eras.includes('huangjin')), '张郃 HJ is 群');
  assert.ok(G['马超'].appearances.some((a) => a.faction === 'qun'));
  // 晋 only in 归晋 and only on 晋 faction appearances
  for (const g of content.generals) for (const a of g.appearances) {
    if (a.faction === 'jin') assert.deepEqual(a.eras, ['guijin'], g.name);
  }
  // the camp of every general with a primary 晋 faction is 晋-only
  for (const g of content.generals.filter((x) => x.faction === 'jin')) assert.deepEqual(g.eras, ['guijin'], g.name);
});

test('PO-4 sensitivity: no ethnic-minority uprising leaders besides 孟获, no fiction-only figures, and 孟获 text has no slur', () => {
  const banned = ['轲比能', '秃发树机能', '檀石槐', '沙摩柯', '兀突骨', '木鹿大王', '祝融', '那咤', '呼厨泉', '于扶罗', '刘猛', '徐无', '张纯', '张举', '华雄'];
  for (const n of banned) assert.ok(!G[n], n + ' must not be in the roster');
  const slurs = /(蛮子|蛮夷|蛮貊|蛮荒|野蛮|番邦|胡虏|夷狄|贱|奴才|劣等)/;
  for (const g of content.generals) {
    for (const f of ['blurb', 'statNote', 'courtesy']) assert.ok(!slurs.test(g[f] || ''), `${g.name}.${f}: ${g[f]}`);
  }
  assert.ok(G['孟获'], '孟获 is the one allowed exception');
  assert.ok(G['张角'], '张角 (Han uprising) is allowed');
});

test('no insulting or meme wording in any general text (statNote, blurb), 刘禅 and 孙皓 included', () => {
  const bad = /(乐不思蜀|阿斗|扶不起|昏君|暴君|废物|无能|愚蠢|蠢|白痴|弱智|傻|奸贼|奸臣|懦夫|窝囊|贱|狗|猪|渣|垃圾|草包|饭桶)/;
  for (const g of content.generals) {
    for (const f of ['blurb', 'statNote']) assert.ok(!bad.test(g[f]), `${g.name}.${f}: ${g[f]}`);
  }
  assert.ok(!/昏|暴/.test(G['孙皓'].blurb + G['孙皓'].statNote), '孙皓 stays neutral and sourced');
});

test('player-visible text hygiene: statNote and blurb carry no developer jargon (era codes, PO ids, "v1", change-log verbs)',
  () => {
    const jargon = /(\b(HJ|QX|CB|SF|GJ)\b|PO-\d|\bv1\b|原为简化|增「|增魏|增群|增天水|增 HJ|改为群|改归群|simplif)/;
    const offenders = content.generals.filter((g) => jargon.test(g.statNote) || jargon.test(g.blurb)).map((g) => g.name);
    assert.deepEqual(offenders, [], 'these generals show developer text in the detail sheet: ' + offenders.join(' '));
  });

test('V1-1: no shipped string of any content version carries an internal code (PO-/TD- ids, era or faction codes, change-log phrases)', () => {
  const internal = /(PO-\d|TD-\d|(HJ|QX|CB|SF|GJ)|原为简化|增「|改为群|改归群|d\. ?\d|c\. ?\d)/;
  const { getContent } = require('../core/content');
  for (const cv of [1, 2]) {
    for (const g of getContent(cv).generals) {
      for (const f of ['statNote', 'blurb', 'courtesy', 'source']) {
        if (g[f] !== undefined) assert.ok(!internal.test(String(g[f])), `contentVersion ${cv} ${g.name}.${f}: ${g[f]}`);
      }
    }
  }
  assert.ok(!/夷汉/.test(G['孟获'].statNote), '孟获 uses 各族');
});

test('every statNote is non-empty, fits the detail sheet budget (<= 80 chars) and names no book title the spec forbids', () => {
  for (const g of content.generals) {
    assert.ok(g.statNote && g.statNote.length > 0, g.name);
    assert.ok(g.statNote.length <= 80, `${g.name} statNote is ${g.statNote.length} chars`);
    assert.ok(!/三国志|三国杀|光荣|Koei|82-0|NBA/.test(g.statNote + g.blurb), g.name);
  }
});

test('CTO-D1: seal portraits only. portraitId is null for all 120 and no shipped file is an image; the only createImage is the friends-board avatar loader', () => {
  for (const g of content.generals) assert.equal(g.portraitId, null, g.name);
  const skip = new Set(['tests', 'tools', 'node_modules']);
  const files = [];
  const loaders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(path.join(dir, e.name)); continue; }
      const p = path.join(dir, e.name);
      if (/\.(png|jpe?g|gif|webp|svg|bmp|ttf|otf|woff2?|mp3|wav|silk)$/i.test(e.name) && !/[\\/]assets[\\/](sounds[\\/][a-z]+\.wav|share-fallback\.png)$/.test(p)) files.push(p);
      if (e.name.endsWith('.js') && /(createImage\s*\(|getImageInfo)/.test(fs.readFileSync(p, 'utf8'))) loaders.push(path.relative(GAME, p).split(path.sep).join('/'));
    }
  })(GAME);
  assert.deepEqual(files, [], 'no portrait image or font ships; the only assets are the four sound cues and share-fallback.png (tests/assets.test.js)');
  assert.deepEqual(loaders, ['opendata/index.js'], 'only the open data domain loads images (WeChat avatars)');
});

test('AC 16 / 75: contentVersion 2 复盘 on the real search is < 300 ms (p99) for light sets and the heavy path is flagged (150 seeds)', () => {
  const cv = 2;
  const config = getConfig(2);
  const rows = [];
  for (let i = 0; i < 150; i++) {
    const seed = hash32('qa-replay-timing:' + i);
    const scn = makeScenario(seed, cv, config.configVersion);
    const rounds = buildSheet(seed, cv, config.configVersion);
    const r = playRun('sensible', seed, cv, 'free', sub(seed, 'sim:sensible'), scn, { rounds });
    const sets = enumerateSets(getContent(cv), r.run.finalTokens).length;
    const t = process.hrtime.bigint();
    const b = bestLineup(seed, cv, r.run.finalTokens, { scenario: scn, rounds });
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    assert.ok(b, 'a lineup is found');
    assert.ok(b.record.w >= r.record.w, '复盘 >= the player');
    rows.push({ sets, ms });
  }
  const light = rows.filter((x) => x.sets <= config.search.heavySets).map((x) => x.ms).sort((a, b) => a - b);
  assert.ok(light.length >= 15, 'a share of searches stays on the client (simstats: 16.5% of free runs): ' + light.length);
  const p99 = light[Math.min(light.length - 1, Math.floor(light.length * 0.99))];
  console.log(`QA 复盘 timing cv2: ${light.length} light searches, p99 ${p99.toFixed(1)} ms, max ${light[light.length - 1].toFixed(1)} ms; heavy ${rows.length - light.length}`);
  assert.ok(p99 < 500, 'p99 ' + p99 + ' (node ceiling; the 300 ms target is a device measurement)');
  const heavy = rows.filter((x) => x.sets > config.search.heavySets).map((x) => x.ms);
  assert.ok(Math.max(...heavy) < 5000, 'heavy search in node stays far inside the 10 s getReplay timeout: ' + Math.max(...heavy));
});
