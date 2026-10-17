# 传画接龙: content change list (prompt bank v1 and local blocklist v1)

Date: 2026-10-15. Author: product-ux (AI agent). Review record: `docs/chuanhua/content-review.md`.
Status: **proposed changes. Not yet applied.** No `.js` file was edited. The CTO assigns minigame-dev to apply them, and a human signs off (Handoff H13) before release.

Files concerned:
- `apps/chuanhua/game/core/content/prompts.v1.js` (423 prompts)
- `apps/chuanhua/game/core/content/blocklist.v1.js`
- After applying: re-sync spec Appendix B (`docs/chuanhua/spec.md`) with the new texts, then run `tests/content-prompts.test.js` (AC 87).

---

## 1. Prompts

### 1.1 How the changes are applied (read first)

- **Every change is an in-place text swap at the same id and category.** No id is added, removed or retired.
- Why there are no DROPs: the bank stays at **423** (AC 87 needs at least 400). Each category keeps its count (A-H, J-L 35 each, I 38). `core/daily.js` shuffles **ids**, so the 141-day 今日起点 walk is unchanged: every daily slot keeps the same ids and categories as before (spec §4.1, decisions TD-3). Retiring ids instead would shift those slots to "next in shuffle order" prompts, break the per-category counts asserted in `tests/content-prompts.test.js`, and shorten the cycle.
- This is safe before launch. No production chain references the old texts, and chains store `promptText` anyway. After launch, use `retired: true` plus a new id instead (spec §4.2).
- Every new text has 2-12 code points and is unique in the bank. None of them contains the banned theme characters in the test's spot list. None hits the current blocklist, the proposed blocklist additions (§2) or the contact patterns. The test file asserts that the count is exactly 423 and that each category count matches, so it passes unchanged.

### 1.2 Change list (19 FIX, 0 DROP)

| # | Id (line) | Old | New | Reason |
|---|---|---|---|---|
| 1 | A08 (l.36) | 猴子摘桃子 | 猴子捞月亮 | A drawn peach is the common "butt" emoji meme, so it invites body drawings. 摘桃子 is also an idiom for grabbing credit, with a political origin. 猴子捞月 is a well-known public-domain fable, easy for 40+ players. |
| 2 | B15 (l.79) | 蛋炒饭 | 炸薯条 | **Politically sensitive term.** 蛋炒饭 is a known mocking reference to Mao Anying, and platforms suppress it around 11/25. Must change. |
| 3 | B23 (l.87) | 剥香蕉 | 削苹果皮 | A peeled banana is the classic phallic doodle and invites sexual drawings. |
| 4 | C02 (l.102) | 医生听诊 | 推车卖冰棍 | Medical theme (§4.2: illness). A stethoscope on a chest invites body drawing. The replacement is a nostalgic street job that is easy to draw. |
| 5 | D18 (l.154) | 降落伞 | 坐飞机看云 | Military connotation (paratroopers). Also a near-duplicate of E32 跳伞. |
| 6 | D19 (l.155) | 潜水艇 | 坐游轮看海 | A submarine reads as military hardware (§4.2: military). |
| 7 | D28 (l.164) | 开房车露营 | 房车去露营 | The text contains 开房 (slang for renting a room for sex), an easy innuendo in a group chat. Same meaning without the substring. |
| 8 | E17 (l.189) | 射箭 | 滚铁环 | Bow and arrow is a weapon drawing (task rule: no weapons). 滚铁环 is a nostalgic game that 40+ players know. |
| 9 | F14 (l.222) | 七夕看银河 | 夏夜乘凉 | 七夕 is the lovers' festival (§4.2: romance). |
| 10 | F26 (l.234) | 冬至吃饺子 | 围炉煮茶 | Regional: whether you eat 饺子 or 汤圆 at 冬至 is the north-south argument. It is also the third dumpling prompt (B02, B32). |
| 11 | F27 (l.235) | 咬春饼 | 春天挖野菜 | 咬春 is an obscure northern custom (regional), and many players won't understand it. The replacement is easy to read and to draw. |
| 12 | H26 (l.306) | 红枫叶 | 银杏叶变黄了 | A single red maple leaf is the Canadian national flag symbol (task rule: no flags). |
| 13 | L04 (l.431) | 骑白马的骑士 | 骑大鹅去旅行 | A knight invites a sword or lance (weapon). 白马 also carries a 白马王子 romance connotation. Riding a goose is a public-domain story (Nils Holgersson) and funny to draw. |
| 14 | L05 (l.432) | 美人鱼唱歌 | 海底宫殿 | A mermaid invites a bare upper-body drawing, and the popular image is Disney's Ariel (copyright). |
| 15 | L09 (l.436) | 藏宝图 | 打开宝箱 | A treasure **map** invites map drawing (task rule: no maps; a drift to real maps is a legal risk). |
| 16 | L15 (l.442) | 彩虹桥 | 会弹琴的彩虹 | 过彩虹桥 is the common euphemism for a pet's death (§4.2: death). |
| 17 | L21 (l.448) | 隐身斗篷 | 长翅膀的小猪 | Harry Potter's Invisibility Cloak (copyright association), and something invisible can't be drawn. |
| 18 | L23 (l.450) | 冰雪城堡 | 小动物开茶会 | Evokes Disney's 冰雪奇缘 (Elsa's ice castle). It is also the third castle (L01, L16). |
| 19 | L34 (l.461) | 镜子里的另一个我 | 哈哈镜里的我 | Abstract and hard to draw. A doppelgänger in a mirror is ghost-story territory (§4.2: 封建迷信). A funhouse mirror is concrete and funny. |

### 1.3 Result

| | Count |
|---|---|
| Prompts reviewed | 423 |
| OK (unchanged) | 404 |
| FIX (text swapped in place) | 19 |
| DROP | 0 |
| **Total after changes** | **423** (A-H, J-L 35 each; I 38) |

### 1.4 Watch list (left as OK, re-check at human sign-off)

These stay unchanged. Each is low risk, and changing it would cost more than it saves. The human reviewer should confirm.
- C08 宇航员太空漫步: real suits carry a flag, but the prompt does not ask for one.
- D09 火箭发射, D35 直升机: could be drawn as military, but are civilian by default.
- E04 射门: 射 has slang uses, but this is the standard football term.
- H30 小岛: an island could drift into territorial topics. It is generic, and moderation covers the drift.
- I36 老虎吃青菜: 老虎 is also anti-corruption slang. The phrase is not the slogan.
- A32 小猪在泥里打滚: pigs are fine in mainstream Chinese culture. Note this only if a region-specific build ever appears.
- Mild duplication, fine for variety: B02/B32 dumplings, A19/G08 mirrors, A34/G06 brushing teeth, F16/J19 graduation, K11/F18 paper cutting, J26/F13/E31 climbing.

---

## 2. Local blocklist (`blocklist.v1.js`)

Matching recap (`core/text.js#blocklistHit`): the text is NFKC-normalised and lower-cased. Everything except letters, digits and CJK characters is removed. Each `zh` term is then a **substring** match. So any term that is part of an everyday word blocks that word too.

Rules for applying these changes (from the file header and the test): terms must be lower-case and unique across categories. Each required category needs at least 5 terms. No prompt may match a term. Every term added below has been checked against all 423 prompts after the §1 fixes.

### 2.1 Over-blocking: REMOVE or REPLACE

Each of these blocks normal descriptions in a drawing game. Users see "换个说法吧" with no explanation, so it reads as a bug.

| # | Category | Old term | Action | New term(s) | Everyday words it wrongly blocks |
|---|---|---|---|---|---|
| B1 | insult | `妈的` | REPLACE | `他妈的`, `你妈的`, `妈了个` | **妈妈的** (妈妈的生日蛋糕, 妈妈的围裙). This is the most common possessive in family descriptions. |
| B2 | insult | `你妈` | REPLACE | `你妈逼`, `你妈死`, `死妈` | **你妈妈**. (`死妈` can still wrongly block 笑死妈妈了. That is rare, and the term is common abuse, so the risk is accepted.) |
| B3 | insult | `他妈` | REMOVE | (covered by `他妈的` in B1) | **他妈妈** (他妈妈在晾衣服) |
| B4 | slur | `棒子` | REPLACE | `高丽棒子`, `韩国棒子` | **玉米棒子** (B25 煮玉米), 接力棒子, 挥棒子 (C32). 棒 is this game's own word for a step. |
| B5 | drugs | `大麻` | REPLACE | `吸大麻`, `抽大麻`, `大麻烟`, `大麻叶` | **大麻雀** (a big sparrow, a likely drawing), 大麻花, 大麻绳 |
| B6 | spam | `外挂` | REPLACE | `游戏外挂`, `开外挂`, `卖外挂` | **窗外挂**, **门外挂** (门外挂着灯笼: F04, G02) |
| B7 | spam | `日结` | REPLACE | `日结工资`, `日结兼职` | **节日结束**, **生日结束** |
| B8 | insult | `我日` | REMOVE | (vulgar use covered by `日你`, `日逼`) | **我日记**, **我日常** |
| B9 | gambling | `麻将` | REMOVE | none | 打麻将 is an everyday pastime for the 40+ audience, and a drawing of 爷爷打麻将 is a normal description. The **prompt** rule (§4.2) still bans 麻将 in our own prompts; the test's theme list keeps enforcing it. Keep `彩票`: it is a classic gambling-spam word, and the cost of a false positive is one retype. **Judgement call: CTO confirms.** |
| B10 | political | `中共` | KEEP, noted | none | Wrongly blocks **其中共有** / **家中共有**. That phrase is rare in 16-character descriptions, and the term is high-risk. Accept the retype. |
| B11 | political | `川普` | KEEP, noted | none | Wrongly blocks **四川普通话** (rare). Accept. |
| B12 | sexual | `龟头` | KEEP, noted | none | Wrongly blocks **乌龟头** (A23 turtle drawings are likely to be described this way). Keep it, because an explicit term should stay local. **Optional code change (CTO):** add a small exception list in `text.js` (e.g. `乌龟头`, `海龟头`) stripped before matching. Not required for v1. |
| B13 | sexual | `打飞机` | KEEP, noted | none | Also an old shooting game. Rare. Accept. |
| B14 | violence | `打死` | KEEP, noted | none | 打死蚊子 is possible but rare. Accept. |

The test's "≥ 5 terms per category" rule still holds after B1-B9 (the smallest affected category, drugs, keeps 17 terms plus 4 new ones).

### 2.2 Gaps: ADD

| # | Category | Add | Reason |
|---|---|---|---|
| G1 | sexual | `小鸡鸡`, `小丁丁`, `大胸`, `巨乳`, `奶头`, `裸奔`, `裸露`, `脱光`, `包养` | `小鸡鸡` is the most likely crude description in a drawing game. Bare `鸡鸡` is **not** used, because it would block 公鸡鸡冠. None of these match a prompt: A10 小鸡破壳而出 and I35 小鸡当宇航员 contain no 小鸡鸡. `开房` is **not** added, because it would block 开房车 and 开房门. |
| G2 | sexual (latin.token) | `dick`, `cock`, `pussy`, `tits`, `boobs`, `penis`, `vagina`, `sexy`, `cum` | Common Latin terms. Matching is whole-token, so `cock` does not hit `cocktail`. |
| G3 | insult | `狗日的`, `婊`, `人渣`, `脑瘫`, `残废`, `低能儿`, `娘炮`, `人妖`, `基佬`, `蠢猪`, `滚蛋` | Common abuse missing from the list. `脑瘫` and `残废` are disability slurs. `娘炮`, `人妖` and `基佬` are LGBT slurs. `婊` has no innocent use; the existing `婊子` becomes redundant, but keeping it is harmless (the test only rejects exact duplicates). **Not added:** `狗日` (would block 小狗日记 and 小狗日常) and `废物` (would block 废物利用). |
| G4 | insult (latin.token) | `cnmb`, `nmb`, `sjb`, `mdzz`, `rnm`, `shit` | Pinyin-initial abuse common among younger players. |
| G5 | violence | `杀了你`, `杀你`, `手枪`, `步枪`, `机枪`, `冲锋枪`, `狙击`, `砍头`, `割喉`, `恐袭`, `轻生`, `想死` | Weapons (spec rule) and threats. `轻生` and `想死` cover self-harm, for minors protection. A single `枪` or `杀` is **not** added, because they would block 水枪 and 杀鱼. |
| G6 | slur | `尼哥`, `鬼佬`, `洋鬼子`, `偷井盖`, `外地狗` | Transliterated n-word, slurs for foreigners, and regional mockery (偷井盖 is the anti-Henan meme). |
| G7 | political | `李强`, `赵乐际`, `王沪宁`, `蔡奇`, `丁薛祥`, `李希`, `韩正`, `周恩来`, `总书记`, `国家主席`, `庆丰包子`, `维尼熊`, `8964`, `五月三十五`, `坦克人`, `文革`, `文化大革命`, `集中营`, `再教育营`, `台湾独立`, `香港独立`, `光复香港`, `时代革命`, `国歌`, `党旗`, `党徽`, `军旗` | Current Politburo Standing Committee members and other leaders are missing. Known euphemisms: `8964` has 4 digits, so the ≥ 5-digit rule misses it. Flattening keeps digits, so a substring match works. Independence slogans not caught by `台独` / `港独`: 台湾独立 has no 台独 substring. National and party symbols. **Not added:** `近平` (would block 接近平地), `翻墙` (猫翻墙) and `民运` (全民运动会); `八九民运` is already listed. `韩正` can wrongly block 小韩正在… (rare), which is accepted. |
| G8 | political (latin.token) | `ccp`, `winnie`, `pooh` | Latin forms. |
| G9 | drugs | `毒贩` | **Not added:** `白粉` (would block 白粉笔, J34), `溜冰` (skating) and `吸粉` (slang for gaining followers). |
| G10 | spam | `网贷`, `裸贷`, `套现`, `代孕` | Common scam and illegal-service ads. `兼职` alone is not added, because it is an everyday word. |
| G11 | gambling | (none) | Coverage is adequate after B9: `赌博`, `赌场`, `赌钱`, `网赌`, `博彩`, `老虎机`, `下注`, `彩票` and the others stay. |

Note on `尼玛` (insult): it is also a common Tibetan given name. Keep it (it is used as an insult far more often), but a human reviewer may prefer to remove it for ethnic sensitivity. Listed for the H13 sign-off.

### 2.3 Not in scope here, but noted

- The contact patterns (`text.js`, `CONTACT_ZH`) are code, not this file. They look complete for v1.
- The blocklist is a cheap first filter. `msgSecCheck` remains the authority (spec §6.2), so gaps that are not listed here still get checked by the platform.
- After applying, extend `tests/content-prompts.test.js` with a small negative test that the everyday phrases above pass: 妈妈的蛋糕, 玉米棒子, 大麻雀, 窗外挂着灯笼, 生日结束了, 我日记本, 爷爷打麻将. This stops future additions from re-introducing the over-blocks.
