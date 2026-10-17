# 传画接龙: content review record (prompt bank v1, local blocklist v1)

| Field | Value |
|---|---|
| Date | 2026-10-15 |
| Reviewer | product-ux (AI agent) |
| Scope | `apps/chuanhua/game/core/content/prompts.v1.js` (423 prompts, AI-drafted); `apps/chuanhua/game/core/content/blocklist.v1.js` (AI-drafted) |
| Criteria | spec §4.2 content rules; constitution Art. 3 and Art. 9 (original IP, compliance); task brief: fun to draw, readable for 40+, nothing that invites bodies, violence, weapons, flags, leaders, religious symbols, maps or ethnic depictions; nothing political, religious, regional, branded, gambling-like, medical or sexual; no copyrighted characters |
| Change list | `docs/chuanhua/content-fixes.md` |
| Status | AI review complete. Changes **not yet applied**. |

> **Rev. 2 (2026-10-15, founder decision F-2):** 今日起点 is removed, and the bank grows to **≥ 2,000 prompts (bank v2)**. The v1 review below still covers the 423 seed prompts, which are carried into v2 with their ids; the "daily slots" row no longer matters. The plan and sign-off for the rest of bank v2 are in §5.

> **A human review is still required before release.** This record is an AI agent's review of AI-drafted content. A named human (the founder or a delegate, Handoff H13) must read all 423 prompts and the blocklist after the fixes are applied, then sign below. Submission waits on that sign-off.

## 1. Prompt bank

| Result | Count |
|---|---|
| Reviewed | 423 |
| OK | 404 |
| FIX (text swapped in place, same id and category) | 19 |
| DROP | 0 |
| Total after changes | 423 (≥ 400, AC 87) |
| Category counts after changes | A-H, J-L: 35 each; I: 38 (unchanged) |
| Daily slots | unchanged: `daily.js` shuffles ids, and every fix keeps its id and category, so every 今日起点 slot keeps its category mix (spec §4.1, TD-3) |

### 1.1 Issue categories (FIX count, ids)

| Issue category | Count | Ids |
|---|---|---|
| Political connotation | 1 | B15 (蛋炒饭) |
| Invites body or sexual drawing, or innuendo | 4 | A08, B23, D28, L05 |
| Weapons or military | 4 | D18, D19, E17, L04 |
| Flags or maps | 2 | H26 (maple leaf), L09 (treasure map) |
| Medical | 1 | C02 |
| Romance | 1 | F14 |
| Death or 封建迷信 | 2 | L15 (彩虹桥 = pet death), L34 (doppelgänger) |
| Regional or obscure for 40+ | 2 | F26, F27 |
| Copyright association | 3 | L05 (Ariel; also counted under body), L21 (Harry Potter), L23 (Frozen) |
| Duplication or hard to draw (secondary reason) | several | D18, F26, L23, L34 |

Some ids have more than one reason. Each id is counted once under its main reason, except L05, which is listed twice.

Nothing found:
- brands or real people;
- gambling or 麻将;
- alcohol or tobacco;
- religious symbols;
- prompts that mock a group of people;
- lifted lists from Gartic Phone, Telestrations or other games. The bank reads as original. Fairy-tale prompts use public-domain stories (Grimm, Andersen, Perrault), not film adaptations.

Readability: apart from F27 (咬春饼), the bank uses everyday words that a 40+ player knows. A watch list of low-risk prompts left as OK is in content-fixes §1.4.

## 2. Local blocklist

| Result | Count |
|---|---|
| Over-blocking terms: REPLACE with narrower terms | 6 (`妈的`, `你妈`, `棒子`, `大麻`, `外挂`, `日结`) |
| Over-blocking terms: REMOVE | 3 (`他妈`, `我日`, `麻将`; `麻将` is a CTO judgement call) |
| Over-blocking terms: KEEP, accepted and noted | 5 (`中共`, `川普`, `龟头`, `打飞机`, `打死`) |
| Gap groups: ADD | 10 groups (G1-G10), 87 terms (sexual, insult, violence/weapons/self-harm, slurs, political leaders and euphemisms, drugs, scam spam, Latin forms) |

### 2.1 Issue categories

- **Substring over-blocking of family words.** `妈的` blocks 妈妈的, and `他妈` / `你妈` block 他妈妈 / 你妈妈. This is the most serious issue, because family groups are a core audience.
- **Over-blocking of game words.** `棒子` blocks 玉米棒子 and 挥棒子 (棒 is the game's own word). `大麻` blocks 大麻雀. `外挂` blocks 窗外挂着灯笼.
- **Gaps.**
  - The most likely crude description in a drawing game (小鸡鸡).
  - Current senior leaders' names, and the 8964 / 五月三十五 euphemisms (8964 slips past the ≥ 5-digit rule).
  - Weapons, threats and self-harm terms (minors protection).
  - Disability and LGBT slurs.
  - Common loan and surrogacy scam spam.
  - Latin sexual terms.
- Each proposed addition was checked against prompts and everyday phrases. Terms that would cause new over-blocks are listed as "not added", with reasons, in content-fixes §2.2.

## 3. AIGC note (constitution Art. 9.2)

The prompt bank and blocklist were drafted by AI and reviewed by an AI agent. The game offers players **no** generative-AI feature, and players never see machine-generated content at runtime. Whether a curated, human-approved prompt list needs an AIGC label under 《人工智能生成合成内容标识办法》 is a question for counsel (add it to Handoff H10). Our working view (INFERENCE) is that it does not, once a human has edited and approved the list. The draft 用户协议 mentions AI-assisted drafting with human review. That sentence is only true after the H13 sign-off below.

## 4. Sign-off (human, required before release)

| Role | Name | Date | Prompts reviewed (all 423) | Blocklist reviewed | Signature |
|---|---|---|---|---|---|
| Content owner (founder or delegate, H13) | | | ☐ | ☐ | |

## 5. Prompt bank v2 (F-2, decisions PO-36): plan, review record and sign-off

**Status (2026-10-15): drafted by AI (minigame-dev agent), automated checks pass, AI self-review done. Human review of every prompt (H13) has NOT happened; the bank must not ship before it.** This section is the process the content owner and the drafting agent follow. The results go here, in the same format as §1.

### 5.1 Target and format

- **≥ 2,000 non-retired prompts**, **≥ 120 per category** across the 12 categories A-L. Aim for about 170 per category, so drops still leave room.
- The 423 v1 prompts are included unchanged, keeping their ids (A01...). New ids are `<cat><4 digits>` from 1001 (A1001...).
- File: `apps/chuanhua/game/core/content/prompts.v2.js` exporting `{version: 2, prompts: [{id, text, cat, retired?}]}`. It is a `.js` module, never JSON or remote.
- Each prompt is 2-12 code points, uses CJK characters only (plus `·` if needed), and has no digits, Latin letters or emoji.

### 5.2 Content rules

These are the same as spec §4.3 and §1 of this record:
- Every prompt is drawable in 60 s by a non-artist.
- It uses everyday words a 40+ player knows.
- It is kind or absurd, never mean.
- **None of the following:**
  - politics; national symbols, flags, maps or currency;
  - military, police or weapons;
  - religion or 封建迷信;
  - real people or celebrities; brands; copyrighted characters (incl. film versions of fairy tales);
  - regions or ethnic groups as jokes;
  - disasters, illness, medicine or death; violence;
  - alcohol or tobacco; gambling (incl. 麻将, lotteries);
  - romance, bodies, bathing or innuendo;
  - anything mocking age, jobs or bodies.
- Original wording only: no lists from Gartic Phone, Telestrations or other games, and no scraped lists.

### 5.3 Pipeline

1. **AI drafting** in batches of about 200 per category, with the rules above and 20 v1 prompts of that category as tone examples. The drafting agent records its batch prompts and dates here.
2. **Automated checks:** `tests/qa-content.test.js`, extended for v2. It checks:
   - length and character set;
   - exact duplicates;
   - normalised duplicates (with 的/了/一个/一只/一碗 removed, and the same two content characters in a different order);
   - the local blocklist after exceptions, and contact patterns;
   - category counts;
   - that every v1 id and text is present.
3. **AI review** of every new prompt against §5.2. The result is a FIX/DROP list in §5.4, using the issue categories of §1.1 plus "hard to draw" and "too similar to another prompt".
4. **Human review** (Handoff H13) of **every** prompt, v1 and new, after the fixes are applied. The reviewer may drop or reword any prompt. The total must stay ≥ 2,000 and ≥ 120 per category. Record the counts in §5.4 and sign §5.5. **Submission waits on this sign-off.**
5. **After release:** prompts are only **retired** (`retired: true`), never edited or deleted, because existing chains keep their own copy of the text. Retirement takes a code release; there is no remote toggle.

### 5.4 Review record (to fill in)

| Step | Date | By | Reviewed | OK | FIX | DROP | Total after | Min per category |
|---|---|---|---|---|---|---|---|---|
| AI drafting | 2026-10-15 | AI (minigame-dev agent) | 2,462 candidates drafted | n/a | n/a | 596 dropped by the filters in 5.6 | 2,252 (423 v1 + 1,829 new) | 140 (F) |
| Automated checks | 2026-10-15 | `tests/content-prompts-v2.test.js` (12 tests, all pass) | 2,252 | 2,252 | 0 | 0 | 2,252 | 140 (F) |
| AI review | 2026-10-15 | AI (same agent, read-through of all new prompts) | 1,866 new | 1,829 | 0 | 37 (see 5.6) | 2,252 | 140 (F) |
| Independent AI review | 2026-10-15 | product-ux (AI agent, independent of the drafter), see 5.7 | 1,829 new + 48 v1 spot-check | 1,461 | 158 | 210 (as `retired: true`) | 2,042 (applied) | 132 (F) |
| Human review (H13) | **NOT DONE** | | | | | | | |

### 5.5 Sign-off (human, required before release)

| Role | Name | Date | Bank v2 reviewed (every prompt) | Blocklist reviewed | Signature |
|---|---|---|---|---|---|
| Content owner (founder or delegate, H13) | | | ☐ | ☐ | |

**AIGC note:** the v2 bank is mostly AI-drafted. The 用户协议 (§一.12) says "大部分题目在人工智能辅助下起草，并经人工逐条审核修改"; that sentence is only true after this sign-off. Whether a curated, human-approved list needs an AIGC label is a counsel question (H10).

### 5.6 Drafting record: provenance, filters and what was excluded (2026-10-15)

**Provenance and AI assistance.**
- The 1,829 new prompts (ids `A1001`...`L1xxx`) were written by an AI agent (Claude) in one session, from the agent's own wording. No list from Gartic Phone, Telestrations, any other game or any website was consulted or copied. The 423 v1 prompts are unchanged and keep their ids.
- The AI wrote 2,462 candidates (themes: animals doing things, food, jobs, travel, sport, festivals and seasons, home, weather and nature, silly combinations, school and office, hobbies, fairy-tale and imagination). A script then dropped 596 that failed the filters below (1,866 survived); the AI then read all the survivors once and dropped a further 37 (list below).
- A new prompt is therefore an AI draft that passed automated checks and one AI read-through. **It is not human-reviewed.** Per spec 4.3 step 4 and Handoff H13, **a human must review every prompt (v1 and new), and may drop or reword any of them, before release. Submission waits on the sign-off in 5.5.** The AIGC sentence in the 用户协议 is only true after that sign-off.

**Automated filters applied while drafting** (all re-checked by the test):
- Charset and length: CJK ideographs only, 3-12 code points for new prompts.
- Local blocklist `blocklist.v1.js` including exceptions: 0 hits (the test also fails if more than 5 prompts rely on blocklist exceptions).
- Exact, normalised (的/了/一个/一只/一碗 removed) and same-character-set duplicates: 0.
- Near-duplicates: containment with at most 2 extra characters, or character-bigram Dice overlap >= 0.75, against every other prompt including v1. 75 candidates were dropped for this; where two overlapped, the longer, funnier one was kept. At most 12 prompts share the same first two characters.
- Issue-class substrings (the test's `ISSUE_CLASSES`), applied to all new prompts, covering the classes flagged in the v1 review (content-fixes.md, qa/content-check.md): body and sexual angles (incl. fruit/sausage innuendo), bathing and sunbathing, weapons/military/police/violence (incl. martial arts, shooting, fencing, spears), flags/maps/national symbols/currency/red packets, medical and illness (incl. masks, injections), death/superstition/religion/folk customs (incl. incense, wish lanterns, wooden fish, 艾草, 香囊, 玉兔捣药, 拜年), romance (incl. roses, white horse, prince, 七夕), gambling/alcohol/tobacco (incl. cards, 斗地主, lotteries; 烟 only allowed inside 烟花), politics and disasters, brands and copyrighted characters, regional or obscure items and customs.
- Never written on purpose: toilet humour, mocking of age/body/jobs, cruelty to animals, named fairy-tale characters from film versions, 小熊+蜂蜜 (Pooh association).

**AI review: 37 prompts dropped (kept out of the bank), with reasons.** (卖花姑娘 below was already caught by a filter.)
- Regional or contested food: 肉夹馍, 炸酱面, 哈密瓜, 豆腐脑, 麻婆豆腐.
- Obscure or custom-based: 重阳糕, 夏至日最长, 抛绣球 (romance origin), 骆驼刺.
- Possible copyright or association: 小丑鱼躲海葵, 水管工, 天空之城, 小矮人挖矿, 小矮人开派对, 姜饼人跑步, 玩具店里的夜晚, 太空漫游, 小熊的蜂蜜树, 春晚看电视.
- Euphemism for death: 彩虹桥上野餐 (see content-fixes.md #16).
- Body, age or group angles: 俯卧撑, 仰卧起坐, 服装模特走秀, 春节饺子包出一个大胖子, 玩滑板的老奶奶, 跳广场舞, 风吹起了裙子, 雨伞下的两个人.
- Political, military or weapon associations: 戴红领巾, 锅盖当盾牌, 蹲马步, 机场安检, 海盗船摇晃.
- Other: 卖花姑娘 (film title), 电梯里的服务员, 驯兽师 (animal welfare), 蒲公英乘客, 饼干盒.

**What the human reviewer should look at first.**
- Prompts that are plain nouns (for example the F, G, H and J categories contain many "place + thing" scenes). They are drawable but less funny; the reviewer may swap them.
- Food names with regional variants (for example 粽子, 汤圆, 酸梅汤, 桂花糕).
- Prompts mentioning children, grandparents or workers, to confirm none reads as mocking.
- The v1 watch list in content-fixes.md 1.4 still applies.

**Final counts (test-verified, after the independent review of 5.7 was applied on 2026-10-15):** 2,042 active prompts and 210 retired (`retired: true`, ids kept): A 186, B 185, C 182, D 189, E 135, F 132, G 154, H 144, I 218, J 180, K 178, L 159. Before 5.7 the drafter count was 2,252 active (A 194, B 215, C 207, D 207, E 147, F 140, G 169, H 164, I 233, J 202, K 203, L 171). The human review can remove up to 42 prompts in total and up to 12 from the smallest category (F) while keeping 2,000 and 120; E has 15 of headroom. Replace rather than drop.

### 5.7 Independent AI review record (2026-10-15)

| Field | Value |
|---|---|
| Date | 2026-10-15 |
| Reviewer | product-ux (AI agent, independent of the drafter) |
| Scope | Every new prompt (ids `<cat>1001`+, 1,829), read one by one. Spot-check of 48 v1 prompts (ids ending 05/15/25/35 in every category, 11.3%). |
| Criteria | §5.2; spec §4.3; constitution Art. 3 (simple, fun, social) and Art. 9 (original IP, compliance); the v1 issue classes (§1.1, content-fixes.md, qa/content-check.md); plus "unclear for a 40+ player", "boring bare noun" and "near-duplicate". |
| Change list | `docs/chuanhua/content-fixes-v2.md` (exact id, old text, new text or DROP, reason) |
| Status | **Applied 2026-10-15 (TD-102).** All 158 FIX and 210 DROP are in `prompts.v2.js`; one replacement (L1096) was changed, see below. DROP is applied as `retired: true`, because the test requires contiguous ids. The replacement texts were checked by hand against the test's issue-class list, the duplicate heuristics and the prefix-family limit. The test must still be run after applying. |

> **A human review is still required before release.** This record is a second AI's review of AI-drafted content. It does not replace H13: a named human must read every prompt (v1 and new) after these fixes are applied, and sign §5.5. Submission waits on that sign-off.

**Counts per category (new prompts only):**

| Category | Reviewed | OK | FIX | DROP | Active after |
|---|---|---|---|---|---|
| A 动物 | 159 | 148 | 3 | 8 | 186 |
| B 美食 | 180 | 142 | 8 | 30 | 185 |
| C 职业 | 172 | 142 | 5 | 25 | 182 |
| D 出行 | 172 | 152 | 2 | 18 | 189 |
| E 运动 | 112 | 90 | 10 | 12 | 135 |
| F 节日与四季 | 105 | 65 | 32 | 8 | 132 |
| G 家里 | 134 | 107 | 12 | 15 | 154 |
| H 自然与天气 | 129 | 85 | 24 | 20 | 144 |
| I 奇思妙想 | 195 | 165 | 15 | 15 | 218 |
| J 校园与办公室 | 167 | 129 | 16 | 22 | 180 |
| K 爱好 | 168 | 129 | 14 | 25 | 178 |
| L 童话与想象 | 136 | 107 | 17 | 12 | 159 |
| **Total** | **1,829** | **1,461** | **158** | **210** | **2,042** |

After the changes the bank has 2,042 active prompts (≥ 2,000), and every category has ≥ 120 (smallest: F 132, E 135). That leaves H13 room to drop 42 more in total; beyond that, replace instead of dropping.

**Issue classes (FIX + DROP; each id is counted once, under its main reason):**

| Issue class | Count | Examples |
|---|---|---|
| Near-duplicate of another prompt (v1 or new) | 194 | B1050 烤地瓜 = B13 烤红薯; K1043 逮蝴蝶 = K1044 捉蝴蝶; I1171 = A04; F lantern and cleaning families; K "一X" filler (K1156-K1166) |
| Unclear or undrawable for a 40+ player | 82 | H idioms (秋高气爽, 春风拂面, 高山流水); sounds, smells, tastes (F1075, F1072, I1070); J abstractions (团队合作, 小组讨论); 7 indistinguishable soups and porridges in B |
| Boring bare noun or empty scenery | 21 | G bare objects (洗碗布, 床头柜, 沙发垫); H empty scenery (大石头, 林间的阳光) |
| Body, sexual innuendo, romance, bathing or swimwear | 21 | **I1127 穿雨衣的茄子** (condom joke); B1119 胡萝卜戴绿帽子 (cuckold); B1178 (spaghetti-kiss scene); B1047 菊花茶; B1076/B1077 黄瓜; B1176 小朋友舔棒棒糖; I1028 茄子; C1079 裁缝量尺寸; C1056 秘书; K1011 跳拉丁; D1089 晕车 (vomit); swimwear (C1094, C1095, C1102, E1022, E1052, D1161, F1055, K1096, H1125) |
| Brand or copyrighted look-alike | 17 | L1012 Dumbo; L1015 Laputa; L1021 Wonka; L1041 Frozen; L1059 Sulley; L1071 银河铁道999; I1049 Narnia; I1071 Mary Poppins; I1074 Up; K1052 乐高; E1062 sneaker logos; B1080 老干妈; B1022 银鹭; B1026 南方黑芝麻糊; F1066 《大红灯笼高高挂》; F1065 春晚; C1172 《摆渡人》 |
| Politics, flags, maps, territory, military | 12 | **C1162 卖花姑娘提花篮** (North Korean film title: a filter miss, because the drafter excluded it as a standalone prompt); **L1096 太阳花** (2014 Taiwan Sunflower Movement); D1057 横幅 (protest banner); E1063/E1064/J1049 parades and ceremonies with flags; E1042 and I1084 (maps and globe); L1081 舰队; H1128 小岛; H1058 芦苇荡; J1057 大锅饭 |
| Religion, folk belief, death | 10 | L1039 水晶球; F1068 放花灯; I1054 门自己开了; I1056 楼梯通向云端; I1032 南瓜灯笼; L1122 彩蛋; A1100 麋鹿拉雪橇; A1098 (玉兔捣药 look-alike); F1015 摆果盘; H1066 蘑菇圈 |
| Safety or minors | 5 | D1108 搭顺风车; D1155 overloaded motorbike; I1107 飞碟接小孩; K1074 直播唱歌; A1016 animal performance |
| Alcohol or gambling association | 4 | F1088 年终聚餐; B1128 大排档; E1037 骑马比赛 (赛马); E1102 球场边的饮料 |
| Money | 1 | B1103 馄饨像小元宝 |
| Vulgar homophone | 1 | A1088 羊驼 (草泥马) |
| **Total** | **368** | 158 FIX + 210 DROP |

**What was not found:**
- real people;
- gambling games;
- tobacco;
- mocking of age, jobs or bodies in the prompt wording;
- lifted lists from other games.

The new prompts read as original but heavily padded. About one in ten (194) is a near-copy of another prompt, often from v1. That is the main quality issue, ahead of safety.

**Watch list and optional list:**
- content-fixes-v2 §4 lists the low-risk prompts left OK, for H13 to confirm (for example the QQ-penguin drift and 蝌蚪找妈妈).
- content-fixes-v2 §5 lists about 300 weak but acceptable prompts. They are the pool to swap first if H13 wants higher quality.

**v1 spot-check (48 prompts):**
- 45 OK and consistent.
- The 19 v1 fixes and the QA advisories I33 and I34 are present in v2.
- 3 sampled prompts fail the stricter v2 rules: A15 海豚钻圈 (animal performance), G35 泡脚 (bathing and feet) and I05 企鹅在沙漠晒太阳 (晒太阳). Outside the sample, A07 大象洗澡 has the same gap.
- **Applied (TD-102):** A07 大象坐跷跷板, A15 海豚和小船赛跑, G35 擦皮鞋, I05 企鹅在沙漠里撑伞, in `prompts.v1.js`, `prompts.v2.js` and spec Appendix B (the v2 test pins v1 text).

**Application note (2026-10-15, TD-102):** every FIX and DROP in content-fixes-v2.md §3 was applied as written, except one. L1096 was to become 会打哈欠的花, but the near-duplicate test flagged it against v1 G07 打哈欠 (containment with 3 extra characters or fewer). It is now **花瓣当小船** (no hit). The four v1 swaps of content-fixes-v2.md §6 were applied with the suggested texts. Active-only duplicate checks are in `tests/content-prompts-v2.test.js`, plus a test that pins the per-category active counts above.
