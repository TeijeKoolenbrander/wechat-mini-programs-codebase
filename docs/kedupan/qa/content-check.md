# 群友刻度盘 content check (QA second reviewer, spectra v1)

Reviewer: QA agent (Claude, AI). Date 2026-10-15. Scope: all 314 spectra, 4,291 items of `spectra.v1.js` read in full, against spec §4.5 rules 1-11. This is an AI check; it does not replace the human review required by spec 4.4 / H9.

## Method
1. Read every spectrum (left, right, all items).
2. Machine scan: `forbidden.v1.js` over every user-visible string (0 hits) plus a broader list of about 150 terms (people, money, religion, regions, medical, violence, gambling, festivals, foreign words); every hit read in context.
3. Anchor spot-check on 11 spectra (directions correct).
4. Overlap with product-ux's `content-fixes.md` (8ad0e62) noted below.

## Result
No item breaks rules 1-8 or 10-11 outright. Nothing offensive, political, regional (no place named), sexual, alcohol, tobacco, medical or branded was found beyond the points below. Rule 11: 0 forbidden-term hits.

## Findings
| # | Where | Rule | Severity | Finding | In product-ux list? |
|---|---|---|---|---|---|
| 1 | s011 抓娃娃 | 6 gambling-like | Fix | Claw machine = paid chance for a prize; inconsistent with 拆盲盒 being removed from the same spectrum | Yes (B1) |
| 2 | s043 抽签 | 4 divination | Fix | Associated with temple fortune slips (求签) | Yes (B3) |
| 3 | s294 倒数日 | 5 brand | Fix | Name of a countdown app. I did not flag this one; product-ux caught it | Yes (B29) |
| 4 | s207 金字塔 | 3 foreign landmark | Fix | A named foreign landmark; I did not flag it (the spectrum is dropped) | Yes (D5) |
| 5 | s096 洗澡 | 3 regional meme | Fix | I did not flag it; product-ux's reasoning is sound | Yes (B9) |
| 6 | s314 洋娃娃, s309 拍洋画 | 3 (洋 = foreign) | Low | Common words, but 洋 reads as foreign; s306 already has 布娃娃 | No: suggest 布娃娃 / 拍画片 |
| 7 | s310 守岁 | 4 customs | Low | New Year folk custom; not religious, but a custom card; acceptable, reviewer's call | No |
| 8 | s157 身体小 ↔ 身体大 | 1 body types | Low | Items are all animals, but the label "身体" reads as body size of people; suggest 个头小 ↔ 个头大 | No |
| 9 | s152 黏人 ↔ 独立 | 1 personality | Low | Personality words are about animals only; keep, or rename 爱贴着人 ↔ 爱独处 | No |
| 10 | s089 解腻 ↔ 添腻 | 6 health claim | Low | 山楂 / 浓茶 "解腻" is a dietary claim in tone; rename 清口 ↔ 腻口 or drop | No |
| 11 | s102 买得值 ↔ 不太值, s103 | 10 advice | Low | Reads as shopping advice; items are generic so acceptable | No |
| 12 | s009, s027, s016, s038 | 9 tone | Info | Mild annoyances (忘带钥匙, 打结的耳机线, 沙尘天气, 赶最后一班车); several come from Appendix A; not sad, acceptable | No |
| 13 | s065, s068, s090, s091 汉堡, 披萨, 寿司, 提拉米苏 | 3 / 5 | Info | Generic dish names, no country or brand named | No |
| 14 | s002, s029, s065, s071 (螺蛳粉, 大盘鸡, 煎饼果子, 小笼包, 糖葫芦) | 3 | Info | Regionally coded dishes but no region named and no comparison; fine | No |
| 15 | s270 蓝牙音箱 | 5 | Info | "蓝牙" is a technology mark used generically; fine |  No |

product-ux also dropped 10 spectra for quality and duplication (s110, s139, s151, s179, s207, s232, s264, s284, s300, s303) and replaced weak items; I agree with the compliance-relevant rows (B1, B3, B9, B29, D5) and have no objection to the rest.

## Quota and process notes
- After the v2 fixes the library is at exactly the minimum in 9 of 12 categories (home, animal, nature, senses, leisure, study, tech, feel, memory). Any further spectrum removal (for example if a human reviewer rejects one) requires writing a new spectrum. If findings 6-10 are applied, apply them as item or label edits, not drops.
- Forbidden list: add 倒数日, 抓娃娃, 夹娃娃, 盲盒, 求签, 抽签 (already planned) and consider 洋娃娃 only if the team wants.
- Provenance: all text is AI-drafted (review sheet header). Spec 4.4 requires a human review before shipping; the sheet's product-ux, QA and result columns are all `pending`. The spec itself requires no on-screen AIGC label (§4.4 treats the text as editorial drafts); constitution Art. 9.2 mentions AIGC labelling, so the CTO should record the decision. A neutral line such as "题库由 AI 辅助创作，经人工审核" in 设置 would settle it cheaply.
- QA result column proposal for content-review.md: all spectra "QA ok" except s011, s043, s294, s207, s096 (items to be removed as in content-fixes.md) and the low items 6-10 above ("QA advisory").
- A re-check on v2 (304 spectra) is pending the developer's change.

---

# v2 delta (kept-ideas/v1 @ 721e844, contentVersion 2, 304 spectra, 4,142 items)

Method: script diff of v1 vs v2 (ids, labels, texts, anchors, tags), every added or changed item read, forbidden scan, schedule check.

**Applied correctly (verified against the diff):** all 10 drops (s110 s139 s151 s179 s207 s232 s264 s284 s300 s303); label changes A1-A10 plus my ruling s157 -> 个头小↔个头大; item swaps B1-B30 (抓娃娃, 抽签, 倒数日, 洗澡, 发酵豆腐, 糖, 沙发, 冰箱, 菜板, 老日历, 嚼劲面包, 地铁换乘, 随手号码, 一箱书, 沉默 removed, with the new ids as listed); wording and anchor fixes C1-C9; my rulings 洋娃娃 -> 布娃娃 (s314i12) and 拍洋画 -> 拍画片 (s309i07). No new spectra, no id reused.

**New or changed items read:** 捏橡皮泥, 第一次下厨, 腐乳, 葡萄, 洗脸, 充电宝, 保温杯, 钢笔, 说明书, 牛肉干, 灯会, 快递取件码, 毕业典礼, 搬进新家, 数着日子, 记账, 给画上色, 散步; labels 偶尔做, 有温度↔冷冰冰, 清爽↔浓郁, 尝个鲜↔玩一辈子, 拍照更美↔亲眼更美, 偷着乐↔狂喜. None breaks a rule 1-11. Notes: 灯会 is a folk event but not religious (no festival tag, fine); 冷冰冰 applies to home objects only; 数着日子 is anticipatory, not sad.

**Scans:** forbidden.v1.js hits on all user-visible strings: 0. The list now contains 倒数日, 抓娃娃, 夹娃娃, 盲盒, 求签, 抽签; none is present in the library. 金字塔 went with s207. 洗澡 remains once, in s014 省时↔费时 (a time-cost item, not the 天天洗澡 comparison), acceptable. build-schedule --check: ok, 365 days, no dropped item referenced.

**Remaining low advisories (unchanged, reviewer's call):** 守岁 (s310), 黏人 (s152), 解腻 (s089), 买得值 (s102).

**Verdict v2: no violation; QA second review complete.** The human review (spec 4.4, H9) remains founder-only. The AIGC note now in 设置 (题库内容由 AI 辅助编写，并经人工审核) claims a human review that has not yet happened: do not ship before it does, or reword.
