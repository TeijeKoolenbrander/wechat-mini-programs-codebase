# 群友刻度盘 content review sheet (spectra library, contentVersion 2)

Owner: content owner (assigned by the CTO). Companion to `docs/kedupan/spec.md` section 4 and AC 8 / AC 10. The library is `apps/kedupan/game/core/content/spectra.v1.js` (contentVersion 2; the file keeps the name spectra.v1.js); the forbidden list is `apps/kedupan/game/core/content/forbidden.v1.js`; the validation is `apps/kedupan/game/tests/content-spectra.test.js`.

## Provenance and AIGC statement

- **Author of every row below:** the content-owner agent (Claude), working for the studio on 2026-10-15. **All text was drafted with AI assistance (AIGC).** Nothing was copied, translated or adapted from Wavelength or any other game's card list or from any third-party source (spec 4.4). Generic opposite pairs (冷↔热) are common language; the selection of pairs, the Chinese everyday items and the editor anchors are original to us.
- **Human review is still pending.** Spec 4.4 says no AI-generated text ships without a human rewrite and review. Until product-ux (and then QA and release) have signed, every row is `pending`. This sheet does **not** claim a human wrote or checked anything.
- **product-ux review done 2026-10-15** by the product-ux agent (Claude, AI). Every spectrum was reviewed (labels, disagreement potential, tone, category fit, anchor sanity), and all 4,291 items were read (100%, above the 20% sample in spec 4.5). Result: 280 OK, 24 FIX, 10 DROP. The exact edits are in `docs/kedupan/content-fixes.md`, for a developer to apply. **This was an AI review, not a human one.** The human review that spec 4.4 requires is still outstanding, and the QA and release columns are still `pending`.
- Replacement text proposed in the product-ux review (content-fixes.md sections A-C) is also AI-drafted (AIGC) by the product-ux agent (Claude) on 2026-10-15. It is original and not taken from any third-party source.
- The anchors are editorial estimates of the national median, not measured data. They are only the prior (PD-4) and are never shown to players.
- The 60 seed spectra of spec Appendix A are ids s001-s060 in Appendix order; their ids equal their Appendix numbers. New spectra continue from s061.

## Review process (spec 4.5)

1. Content owner writes (done, this sheet).
2. product-ux reviews every spectrum and samples at least 20% of items. Fill the "product-ux review" column with the reviewer name, date and ok / changed / removed. **Done 2026-10-15 (product-ux agent, Claude, AI).** The column uses OK / FIX / DROP. FIX gives the exact replacement; DROP gives the reason. Row numbers (A1, B1, ...) refer to `content-fixes.md`.
3. QA checks the full list against the 11 rules (column "QA rules check"). QA should check the library **after** content-fixes.md has been applied (contentVersion 2).
4. release does the final pass (Founder Handoff H9).

Rejected items are deleted from the library, not hidden; ids are never reused. Any change bumps `contentVersion`.

## Automated checks already passing (AC 8)

`node --test apps/kedupan/game/tests/content-spectra.test.js`: at least 300 spectra, each with at least 10 items; unique stable ids; labels 1-4 Chinese characters; item text 1-10 Chinese characters, unique inside its spectrum; anchors integers 5-95; category quotas; no forbidden term in any user-visible string; `easy` tag exactly when anchor <= 20 or >= 80; `split` items anchor 25-75; every spectrum has at least 2 easy and 2 split items and items on both ends of the ruler; this sheet lists every id.

These checks do not prove rules 1-10 of spec 4.5 beyond the forbidden-term list; that is the human review's job.

## Counts

Current library (contentVersion 2, after content-fixes.md and the QA second-review findings were applied). Nine categories (home, animal, nature, senses, leisure, study, tech, feel, memory) are exactly at their minimum, so there is no margin: a new spectrum (next free id s315) is needed to replace any further rejection there.

| Category | Key | Quota (min) | Spectra | Items |
|---|---|---|---|---|
| 吃喝 | food | 40 | 42 | 537 |
| 日常 | life | 40 | 41 | 515 |
| 居家物件 | home | 25 | 25 | 331 |
| 动物 | animal | 25 | 25 | 350 |
| 天气自然 | nature | 25 | 25 | 351 |
| 感官 | senses | 25 | 25 | 351 |
| 休闲爱好 | leisure | 25 | 25 | 348 |
| 出行 | travel | 20 | 21 | 275 |
| 学习工作 | study | 20 | 20 | 276 |
| 物件科技 | tech | 20 | 20 | 288 |
| 心情感受 | feel | 20 | 20 | 288 |
| 童年回忆 | memory | 15 | 15 | 232 |
| **Total** | | **300** | **304** | **4142** |

## Interpretations of the spec made by the content owner

| # | Point | Decision |
|---|---|---|
| 1 | `split` has no numeric definition in spec 4.1 | split items have anchor 25-75 (and are not easy); easy is exactly anchor <= 20 or >= 80. |
| 2 | Appendix A #3 label 快手 is an app name (rule 5) | changed to 省事. |
| 3 | Appendix A #35 labels exceed 4 characters | shortened to 一个人 / 一群人. |
| 4 | Appendix A #43 item 体检 is medical (rule 6) | replaced by 考试. |
| 5 | Same text in several spectra (e.g. 西瓜, 散步) | allowed: texts are unique inside a spectrum and ids are unique everywhere; the daily schedule works on item ids. Appendix A itself reuses 仓鼠, 金鱼, 鹦鹉. |
| 6 | Pairs may not repeat, also reversed (冷↔热 vs 热↔冷) | enforced by the test. |
| 7 | Season and festival tags | applied only to items whose text is unambiguous (e.g. 刨冰 summer, 银杏叶 autumn, 月饼 mid-autumn). Festival keys used (renamed to the core keys, TD-43): midautumn, dragonboat, spring, lantern. No religious festival is used. |
| 8 | Text may contain only Chinese characters (no digits, Latin letters or punctuation) | stricter than the spec, so labels render safely and the forbidden-term check is reliable. |
| 9 | Bare characters 酒, 烟, 赌, 胖, 丑, 毒, 病, 药, 死, 杀, 血, 枪, 佛, 寺, 庙, 鬼 are forbidden | the library avoids every word containing them (e.g. 酒店 -> 旅店, 烟火 -> 彩灯). |

## Notes for the reviewer

- Anchors are unmeasured. After launch, compare each item's anchor with the observed median and fix outliers.
- A few items are mild everyday annoyances (闷热夜晚, 早高峰), taken from Appendix A or in its tone. Rule 9 targets sad or negative content, so they are judged acceptable but flagged for the reviewer's eye.
- Items are foods, animals, plants, objects, activities, weather and feelings; none names a person, place, brand or work. Please spot-check the forbidden list for terms we missed.
- 民宿, 旅店 and 高铁 are generic travel words and are intentionally allowed.

## Notes from the product-ux review (2026-10-15)

- **QA second review (applied in v2, CTO rulings):** 洋娃娃 → 布娃娃 (s314i12), 拍洋画 → 拍画片 (s309i07), label 身体小 ↔ 身体大 → 个头小 ↔ 个头大 (s157); wording only, ids kept. 守岁, 黏人, 解腻 and 买得值 kept as they are (judged acceptable).
- **Main issues fixed:** paid-randomness and divination associations (抓娃娃, 抽签); a regional meme (天天洗澡); an app name (倒数日); a 白酒 tasting vocabulary pair (清冽 ↔ 醇厚); unclear labels for a 40+ player (镜头里 ↔ 眼睛里, 静喜, 尝鲜 ↔ 长久, 一次就好); duplicate or near-duplicate spectra (s139, s232, s284, s300); pure fact or trivia spectra with no opinion (s110, s151, s179, s207); non-opposite pairs (s264, s303); a duplicate item inside a spectrum (砧板 / 菜板); and implausible anchors (糖, 老日历, 风铃, 大衣, 关灯).
- **Forbidden-list suggestions** for the content owner (not applied; the list is theirs): add 倒数日, 抓娃娃, 盲盒, 求签, 抽签, 夹娃娃. Consider adding 金字塔 and other named landmarks.
- **Tone:** overall warm, neutral and simple. No politics, religion, ethnicity, people, sex, alcohol, tobacco, gambling, disaster or medical claims found beyond the items listed above. Smelly regional dishes (螺蛳粉, 臭豆腐) are kept: they are national jokes, not regional comparisons, and the labels rate a smell, not a place.
- **Category fit:** s042 正式 ↔ 随意 (clothes in 学习工作, from Appendix A), s298 空旷 ↔ 拥挤 and s299 明朗 ↔ 朦胧 (places and scenery in 心情感受) fit loosely but are acceptable. s303 was dropped partly for category fit.
- **Watch list** (fact-leaning; kept, check dispersion after launch): see content-fixes.md section F. These rows are marked "OK (watch)".

## Spectra

| id | left ↔ right | category | items | author | date | notes | product-ux review | QA rules check | result |
|---|---|---|---|---|---|---|---|---|---|
| s001 | 冷 ↔ 热 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #1, polished and expanded to 10+ items. 7 easy, 2 split, 5 season/festival-tagged. | OK | pending | pending |
| s002 | 清淡 ↔ 重口 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #2, polished and expanded to 10+ items. 7 easy, 4 split. | OK | pending | pending |
| s003 | 省事 ↔ 费工 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #3, polished and expanded to 10+ items. Label 快手 changed to 省事 (快手 is an app name, rule 5). 7 easy, 2 split. | OK | pending | pending |
| s004 | 早饭 ↔ 夜宵 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #4, polished and expanded to 10+ items. 9 easy, 2 split. | OK | pending | pending |
| s005 | 家常 ↔ 讲究 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #5, polished and expanded to 10+ items. 6 easy, 3 split. | OK | pending | pending |
| s006 | 解渴 ↔ 解馋 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #6, polished and expanded to 10+ items. 6 easy, 3 split, 3 season/festival-tagged. | OK | pending | pending |
| s007 | 软 ↔ 脆 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #7, polished and expanded to 10+ items. 11 easy, 2 split. | OK | pending | pending |
| s008 | 便宜 ↔ 贵 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #8, polished and expanded to 10+ items. 2 easy, 6 split. | OK | pending | pending |
| s009 | 小事 ↔ 大事 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #9, polished and expanded to 10+ items. 8 easy, 3 split. | OK | pending | pending |
| s010 | 轻松 ↔ 累人 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #10, polished and expanded to 10+ items. 4 easy, 5 split. | OK | pending | pending |
| s011 | 无聊 ↔ 有趣 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #11, polished and expanded to 10+ items. Draft item 拆盲盒 replaced by 解谜题 (random-box mechanic reads as gambling-adjacent, rule 6). 8 easy, 4 split. | FIX, applied in v2 (B1-B2): delete s011i09 抓娃娃 (paid randomness, rule 6); add s011i14 捏橡皮泥, anchor 80, easy | pending | pending |
| s012 | 安静 ↔ 热闹 | 日常 (life) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #12, polished and expanded to 10+ items. 10 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s013 | 必需 ↔ 可有可无 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #13, polished and expanded to 10+ items. 7 easy, 5 split. | OK | pending | pending |
| s014 | 省时 ↔ 费时 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #14, polished and expanded to 10+ items. 8 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s015 | 常见 ↔ 少见 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #15, polished and expanded to 10+ items. 10 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s016 | 舒服 ↔ 难受 | 天气自然 (nature) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #16, polished and expanded to 10+ items. 9 easy, 2 split, 6 season/festival-tagged. | OK | pending | pending |
| s017 | 安静 ↔ 壮观 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #17, polished and expanded to 10+ items. 8 easy, 5 split, 3 season/festival-tagged. | OK | pending | pending |
| s018 | 温顺 ↔ 凶猛 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #18, polished and expanded to 10+ items. 10 easy, 4 split. | OK | pending | pending |
| s019 | 好养 ↔ 难养 | 动物 (animal) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #19, polished and expanded to 10+ items. 6 easy, 6 split. | OK | pending | pending |
| s020 | 可爱 ↔ 吓人 | 动物 (animal) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #20, polished and expanded to 10+ items. 10 easy, 4 split. | OK | pending | pending |
| s021 | 慢 ↔ 快 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #21, polished and expanded to 10+ items. 9 easy, 4 split. | OK | pending | pending |
| s022 | 吵 ↔ 安静 | 动物 (animal) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #22, polished and expanded to 10+ items. 9 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s023 | 实用 ↔ 好看 | 居家物件 (home) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #23, polished and expanded to 10+ items. 13 easy, 3 split. | OK | pending | pending |
| s024 | 一次性 ↔ 用很久 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #24, polished and expanded to 10+ items. 8 easy, 3 split. | OK | pending | pending |
| s025 | 好收纳 ↔ 占地方 | 居家物件 (home) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #25, polished and expanded to 10+ items. 7 easy, 6 split. | OK | pending | pending |
| s026 | 老派 ↔ 新潮 | 物件科技 (tech) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #26, polished and expanded to 10+ items. 11 easy, 4 split. | OK | pending | pending |
| s027 | 好用 ↔ 难用 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #27, polished and expanded to 10+ items. 9 easy, 4 split. | OK | pending | pending |
| s028 | 新手友好 ↔ 高手专属 | 物件科技 (tech) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #28, polished and expanded to 10+ items. 8 easy, 4 split. | OK | pending | pending |
| s029 | 好闻 ↔ 难闻 | 感官 (senses) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #29, polished and expanded to 10+ items. 9 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s030 | 好听 ↔ 刺耳 | 感官 (senses) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #30, polished and expanded to 10+ items. 8 easy, 5 split, 1 season/festival-tagged. | OK | pending | pending |
| s031 | 顺滑 ↔ 粗糙 | 感官 (senses) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #31, polished and expanded to 10+ items. 9 easy, 4 split. | OK | pending | pending |
| s032 | 软 ↔ 硬 | 感官 (senses) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #32, polished and expanded to 10+ items. 13 easy, 2 split. | OK | pending | pending |
| s033 | 好学 ↔ 难学 | 休闲爱好 (leisure) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #33, polished and expanded to 10+ items. 6 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s034 | 养生 ↔ 刺激 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #34, polished and expanded to 10+ items. 11 easy, 2 split. | OK (养生 used as a leisure style only, rule 6 exception) | pending | pending |
| s035 | 一个人 ↔ 一群人 | 休闲爱好 (leisure) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #35, polished and expanded to 10+ items. Labels shortened from 适合一个人/适合一群人 (5 chars) to 一个人/一群人 to meet the 1-4 character limit. 8 easy, 6 split. | OK | pending | pending |
| s036 | 室内 ↔ 户外 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #36, polished and expanded to 10+ items. 11 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s037 | 省心 ↔ 折腾 | 出行 (travel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #37, polished and expanded to 10+ items. 7 easy, 3 split. | OK | pending | pending |
| s038 | 慢悠悠 ↔ 赶时间 | 出行 (travel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #38, polished and expanded to 10+ items. 10 easy, 2 split. | OK | pending | pending |
| s039 | 想去 ↔ 不想去 | 出行 (travel) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #39, polished and expanded to 10+ items. 7 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s040 | 简单 ↔ 烧脑 | 学习工作 (study) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #40, polished and expanded to 10+ items. 4 easy, 7 split. | OK | pending | pending |
| s041 | 枯燥 ↔ 有趣 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #41, polished and expanded to 10+ items. 9 easy, 4 split. | OK | pending | pending |
| s042 | 正式 ↔ 随意 | 学习工作 (study) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #42, polished and expanded to 10+ items. 9 easy, 2 split. | OK (clothes in study: loose category fit, kept as Appendix A) | pending | pending |
| s043 | 紧张 ↔ 放松 | 心情感受 (feel) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #43, polished and expanded to 10+ items. Draft item 体检 replaced by 考试 (medical, rule 6). 10 easy, 3 split. | FIX, applied in v2 (B3-B4): delete s043i08 抽签 (fortune-slip association, rule 4); add s043i14 第一次下厨, anchor 35, split | pending | pending |
| s044 | 尴尬 ↔ 自在 | 心情感受 (feel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #44, polished and expanded to 10+ items. 7 easy, 4 split. | FIX, applied in v2 (C1): s044i12 text 散步时 → 散步 | pending | pending |
| s045 | 平淡 ↔ 隆重 | 心情感受 (feel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #45, polished and expanded to 10+ items. 中秋节, 春节, 年夜饭 and 元宵节 carry festival tags. 10 easy, 2 split, 4 season/festival-tagged. | OK | pending | pending |
| s046 | 小确幸 ↔ 大惊喜 | 心情感受 (feel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #46, polished and expanded to 10+ items. 8 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s047 | 常见 ↔ 稀罕 | 童年回忆 (memory) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #47, polished and expanded to 10+ items. 游戏机 kept as a generic object; no console or product names. 4 easy, 7 split. | OK | pending | pending |
| s048 | 简单 ↔ 讲究 | 童年回忆 (memory) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #48, polished and expanded to 10+ items. 8 easy, 3 split, 2 season/festival-tagged. | OK | pending | pending |
| s049 | 熟悉 ↔ 陌生 | 童年回忆 (memory) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #49, polished and expanded to 10+ items. 4 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s050 | 适合夏天 ↔ 适合冬天 | 日常 (life) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #50, polished and expanded to 10+ items. 12 easy, 2 split, 12 season/festival-tagged. | OK | pending | pending |
| s051 | 适合早上 ↔ 适合晚上 | 日常 (life) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #51, polished and expanded to 10+ items. 9 easy, 5 split. | OK | pending | pending |
| s052 | 容易坚持 ↔ 很难坚持 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #52, polished and expanded to 10+ items. 6 easy, 6 split. | OK | pending | pending |
| s053 | 甜 ↔ 不甜 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #53, polished and expanded to 10+ items. 10 easy, 3 split, 3 season/festival-tagged. | OK | pending | pending |
| s054 | 下饭 ↔ 不下饭 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #54, polished and expanded to 10+ items. Dish names with a person in them (e.g. 麻婆豆腐) deliberately not used. 12 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s055 | 小份 ↔ 大份 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #55, polished and expanded to 10+ items. 6 easy, 5 split. | OK | pending | pending |
| s056 | 容易 ↔ 很难 | 休闲爱好 (leisure) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #56, polished and expanded to 10+ items. 6 easy, 5 split. | OK | pending | pending |
| s057 | 有用 ↔ 没用 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #57, polished and expanded to 10+ items. 5 easy, 6 split. | OK | pending | pending |
| s058 | 新 ↔ 旧 | 物件科技 (tech) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #58, polished and expanded to 10+ items. 11 easy, 2 split. | OK (watch: factual) | pending | pending |
| s059 | 吵 ↔ 静 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #59, polished and expanded to 10+ items. 7 easy, 5 split, 1 season/festival-tagged. | OK | pending | pending |
| s060 | 普通 ↔ 特别 | 心情感受 (feel) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | Appendix A #60, polished and expanded to 10+ items. 8 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s061 | 咸 ↔ 甜 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s062 | 酸 ↔ 辣 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s063 | 烫嘴 ↔ 刚好入口 | 吃喝 (food) | 11 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s064 | 开胃 ↔ 管饱 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s065 | 家里做 ↔ 外面吃 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 5 split. | OK | pending | pending |
| s066 | 一个人吃 ↔ 一起吃 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK | pending | pending |
| s067 | 清爽 ↔ 油腻 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s068 | 趁热吃 ↔ 放凉也行 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split, 3 season/festival-tagged. | OK | pending | pending |
| s069 | 酥 ↔ 绵 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s070 | 香 ↔ 臭 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 5 split, 1 season/festival-tagged. | FIX, applied in v2 (B5-B6): delete s070i12 发酵豆腐 (ambiguous, duplicates 臭豆腐); add s070i14 腐乳, anchor 55, split | pending | pending |
| s071 | 方便 ↔ 麻烦 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK | pending | pending |
| s072 | 实惠 ↔ 贵 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split. | OK | pending | pending |
| s073 | 天天吃 ↔ 难得吃 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 5 split, 4 season/festival-tagged. | OK | pending | pending |
| s074 | 主食 ↔ 零食 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK | pending | pending |
| s075 | 蘸着吃 ↔ 直接吃 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 5 split. | OK | pending | pending |
| s076 | 甜点 ↔ 正餐 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split, 3 season/festival-tagged. | OK | pending | pending |
| s077 | 不加冰 ↔ 加冰 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split, 2 season/festival-tagged. | OK | pending | pending |
| s078 | 一口吞 ↔ 细细品 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split, 2 season/festival-tagged. | FIX, applied in v2 (B7-B8): delete s078i01 糖 (implausible anchor 5, vague); add s078i14 葡萄, anchor 10, easy | pending | pending |
| s079 | 煮着好 ↔ 烤着好 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split, 2 season/festival-tagged. | OK | pending | pending |
| s080 | 有汤 ↔ 没汤 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK | pending | pending |
| s081 | 饭前吃 ↔ 饭后吃 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 5 split. | OK | pending | pending |
| s082 | 小吃 ↔ 大餐 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split, 2 season/festival-tagged. | OK | pending | pending |
| s083 | 好剥 ↔ 难剥 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 7 split, 3 season/festival-tagged. | OK | pending | pending |
| s084 | 多汁 ↔ 干香 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split, 3 season/festival-tagged. | OK | pending | pending |
| s085 | 温和 ↔ 带劲 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 5 split, 3 season/festival-tagged. | OK | pending | pending |
| s086 | 配菜 ↔ 主角 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s087 | 不用火 ↔ 要开火 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s088 | 顶饱 ↔ 不顶饱 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s089 | 解腻 ↔ 添腻 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s090 | 配茶 ↔ 配咖啡 | 吃喝 (food) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split, 2 season/festival-tagged. | OK | pending | pending |
| s091 | 朴素 ↔ 精致 | 吃喝 (food) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK | pending | pending |
| s092 | 袋装 ↔ 现做 | 吃喝 (food) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s093 | 轻 ↔ 重 | 日常 (life) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK (watch: factual) | pending | pending |
| s094 | 小 ↔ 大 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK (watch: factual) | pending | pending |
| s095 | 短 ↔ 长 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 5 split. | OK | pending | pending |
| s096 | 偶尔做 ↔ 天天要做 | 日常 (life) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | FIX, applied in v2 (A1, B9-B10): left 一次就好 → 偶尔做 (unclear label); delete s096i02 洗澡 (南北 regional meme, rule 3); add s096i15 洗脸, anchor 95, easy | pending | pending |
| s097 | 家里常备 ↔ 临时买 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 5 split. | OK | pending | pending |
| s098 | 白天用 ↔ 晚上用 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split, 3 season/festival-tagged. | OK | pending | pending |
| s099 | 准时 ↔ 随意 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s100 | 整齐 ↔ 凌乱 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 6 split. | OK | pending | pending |
| s101 | 悠闲 ↔ 忙碌 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s102 | 买得值 ↔ 不太值 | 日常 (life) | 11 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 4 easy, 6 split. | OK | pending | pending |
| s103 | 送人 ↔ 自用 | 日常 (life) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 5 split, 1 season/festival-tagged. | OK | pending | pending |
| s104 | 提前准备 ↔ 临场发挥 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 5 split. | OK | pending | pending |
| s105 | 说走就走 ↔ 提前计划 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 5 split. | OK | pending | pending |
| s106 | 一个人做 ↔ 一起做 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 5 split, 1 season/festival-tagged. | OK | pending | pending |
| s107 | 顺手做 ↔ 专门做 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 2 split. | FIX, applied in v2 (C2): s107i12 text 做账本 → 记账 (做账 connotes 做假账) | pending | pending |
| s108 | 日常穿 ↔ 盛装穿 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK | pending | pending |
| s109 | 随身带 ↔ 留在家 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | FIX, applied in v2 (B11-B14): delete s109i03 沙发 and s109i04 冰箱 (no disagreement); add s109i14 充电宝, anchor 45, split, and s109i15 保温杯, anchor 50, split | pending | pending |
| s111 | 越用越旧 ↔ 越用越顺 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 5 split. | FIX, applied in v2 (B15-B16): delete s111i08 菜板 (same object as s111i05 砧板); add s111i13 钢笔, anchor 70, split | pending | pending |
| s112 | 一趟搞定 ↔ 来回折腾 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s113 | 早已习惯 ↔ 还在适应 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | OK | pending | pending |
| s114 | 坐着做 ↔ 站着做 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK | pending | pending |
| s115 | 旧的好 ↔ 新的好 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 3 split. | OK | pending | pending |
| s116 | 睡前做 ↔ 醒来做 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split. | OK | pending | pending |
| s117 | 一眼看清 ↔ 需要细看 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 3 split. | OK | pending | pending |
| s118 | 常换 ↔ 很少换 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split. | OK | pending | pending |
| s119 | 天天看 ↔ 偶尔看 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | FIX, applied in v2 (B17-B18): delete s119i05 老日历 (contradicts 日历 10); add s119i13 说明书, anchor 92, easy | pending | pending |
| s120 | 放口袋 ↔ 放包里 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 5 split. | OK | pending | pending |
| s121 | 一记就牢 ↔ 总是忘记 | 日常 (life) | 11 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 5 easy, 5 split. | FIX, applied in v2 (C4-C5): s121i05 关灯 anchor 80 → 55, tags easy → split | pending | pending |
| s122 | 爱做 ↔ 不爱做 | 日常 (life) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 4 split. | OK | pending | pending |
| s123 | 一块钱 ↔ 一百块 | 日常 (life) | 10 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 4 easy, 5 split, 1 season/festival-tagged. | OK | pending | pending |
| s124 | 天天用 ↔ 难得用 | 居家物件 (home) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | OK | pending | pending |
| s125 | 有温度 ↔ 冷冰冰 | 居家物件 (home) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split. | FIX, applied in v2 (A2-A3): labels 暖 ↔ 冷 → 有温度 ↔ 冷冰冰 (ambiguous; near-reverse of s001) | pending | pending |
| s126 | 圆 ↔ 方 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK (watch: factual) | pending | pending |
| s127 | 厨房用 ↔ 客厅用 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s128 | 舍不得扔 ↔ 随手扔 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 6 split. | OK | pending | pending |
| s129 | 小巧 ↔ 庞大 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK (watch: factual) | pending | pending |
| s130 | 省电 ↔ 费电 | 居家物件 (home) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 4 easy, 7 split. | OK | pending | pending |
| s131 | 室内常见 ↔ 室外常见 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split, 1 season/festival-tagged. | OK (watch: factual) | pending | pending |
| s132 | 耐用 ↔ 易碎 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s133 | 无声 ↔ 响亮 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 6 split. | FIX, applied in v2 (C6-C7): s133i05 风铃 anchor 85 → 60, tags easy → split | pending | pending |
| s134 | 日常摆 ↔ 节日摆 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split, 3 season/festival-tagged. | OK | pending | pending |
| s135 | 单件 ↔ 成套 | 居家物件 (home) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split. | OK | pending | pending |
| s136 | 床头 ↔ 桌面 | 居家物件 (home) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 5 split. | OK | pending | pending |
| s137 | 能折叠 ↔ 不能折叠 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 5 easy, 6 split. | OK (watch: factual) | pending | pending |
| s138 | 单人用 ↔ 多人用 | 居家物件 (home) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK | pending | pending |
| s140 | 手洗 ↔ 机洗 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 5 easy, 6 split, 2 season/festival-tagged. | FIX, applied in v2 (C8-C9): s140i04 大衣 anchor 85 → 50, tags easy → split | pending | pending |
| s141 | 好整理 ↔ 难整理 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 3 split. | OK | pending | pending |
| s142 | 亮堂 ↔ 昏暗 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK | pending | pending |
| s143 | 暖和 ↔ 凉快 | 居家物件 (home) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s144 | 装饰 ↔ 收纳 | 居家物件 (home) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | OK | pending | pending |
| s145 | 一直放着 ↔ 经常搬动 | 居家物件 (home) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK | pending | pending |
| s146 | 毛茸茸 ↔ 滑溜溜 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | OK | pending | pending |
| s147 | 白天活跃 ↔ 夜里活跃 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 1 season/festival-tagged. | OK (watch: factual) | pending | pending |
| s148 | 独来独往 ↔ 成群结队 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s149 | 圆乎乎 ↔ 细长条 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK | pending | pending |
| s150 | 水里待 ↔ 天上飞 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK (watch: factual) | pending | pending |
| s152 | 黏人 ↔ 独立 | 动物 (animal) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 7 split. | OK | pending | pending |
| s153 | 吃肉 ↔ 吃草 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split. | OK (watch: factual) | pending | pending |
| s154 | 爱水 ↔ 怕水 | 动物 (animal) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 2 split. | OK | pending | pending |
| s155 | 爱睡觉 ↔ 爱折腾 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK | pending | pending |
| s156 | 胆小 ↔ 胆大 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 5 split. | OK | pending | pending |
| s157 | 个头小 ↔ 个头大 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK (watch: factual); QA finding applied in v2: labels 身体小 ↔ 身体大 → 个头小 ↔ 个头大 | pending | pending |
| s158 | 适合养 ↔ 适合看 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK | pending | pending |
| s159 | 叫声好听 ↔ 叫声难听 | 动物 (animal) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s160 | 浅色 ↔ 深色 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split. | OK | pending | pending |
| s161 | 见得多 ↔ 见得少 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s162 | 会飞 ↔ 不会飞 | 动物 (animal) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | OK (watch: factual; 鸡/鸭/鹅 splits are a fun argument) | pending | pending |
| s163 | 吃得少 ↔ 吃得多 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s164 | 好抱 ↔ 难抱 | 动物 (animal) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s165 | 憨厚 ↔ 机灵 | 动物 (animal) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s166 | 耐寒 ↔ 怕冷 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK (watch: factual) | pending | pending |
| s167 | 凉爽 ↔ 闷热 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s168 | 湿 ↔ 干 | 天气自然 (nature) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK (watch: factual) | pending | pending |
| s169 | 亮 ↔ 暗 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split, 1 season/festival-tagged. | OK (watch: factual) | pending | pending |
| s170 | 轻柔 ↔ 猛烈 | 天气自然 (nature) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 2 split, 1 season/festival-tagged. | OK (weather only, no disaster terms) | pending | pending |
| s171 | 春意 ↔ 秋意 | 天气自然 (nature) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split, 13 season/festival-tagged. | OK | pending | pending |
| s172 | 夏夜 ↔ 冬夜 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split, 6 season/festival-tagged. | OK | pending | pending |
| s173 | 平地 ↔ 高山 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK (watch: factual) | pending | pending |
| s174 | 近水 ↔ 近山 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK (watch: factual) | pending | pending |
| s175 | 短暂 ↔ 长久 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s176 | 开阔 ↔ 幽深 | 天气自然 (nature) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | OK | pending | pending |
| s177 | 晨景 ↔ 晚景 | 天气自然 (nature) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split, 1 season/festival-tagged. | OK (watch: factual) | pending | pending |
| s178 | 凉飕飕 ↔ 暖洋洋 | 天气自然 (nature) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 4 split, 3 season/festival-tagged. | OK | pending | pending |
| s180 | 花期短 ↔ 花期长 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split, 4 season/festival-tagged. | OK (watch: botany trivia) | pending | pending |
| s181 | 素净 ↔ 绚烂 | 天气自然 (nature) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split, 4 season/festival-tagged. | OK | pending | pending |
| s182 | 近看 ↔ 远看 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 2 season/festival-tagged. | OK | pending | pending |
| s183 | 能摸到 ↔ 只能看 | 天气自然 (nature) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split. | OK | pending | pending |
| s184 | 适合出门 ↔ 适合宅家 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split, 3 season/festival-tagged. | OK | pending | pending |
| s185 | 看着凉 ↔ 看着暖 | 天气自然 (nature) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split, 2 season/festival-tagged. | OK | pending | pending |
| s186 | 粗犷 ↔ 细腻 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s187 | 一阵子 ↔ 一整天 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split, 2 season/festival-tagged. | OK | pending | pending |
| s188 | 清爽 ↔ 黏糊 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 4 season/festival-tagged. | OK | pending | pending |
| s189 | 矮 ↔ 高 | 天气自然 (nature) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s190 | 低调 ↔ 亮眼 | 感官 (senses) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split, 1 season/festival-tagged. | OK | pending | pending |
| s191 | 清脆 ↔ 沉闷 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s192 | 轻声 ↔ 大声 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK | pending | pending |
| s193 | 甜蜜 ↔ 苦涩 | 感官 (senses) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s194 | 淡雅 ↔ 浓烈 | 感官 (senses) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 5 split, 1 season/festival-tagged. | OK | pending | pending |
| s195 | 暖手 ↔ 冰手 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split, 3 season/festival-tagged. | OK | pending | pending |
| s196 | 厚实 ↔ 单薄 | 感官 (senses) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split, 2 season/festival-tagged. | OK | pending | pending |
| s197 | 清香 ↔ 浓香 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s198 | 平滑 ↔ 凹凸 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK (overlaps s031; keep apart in schedule) | pending | pending |
| s199 | 暖光 ↔ 冷光 | 感官 (senses) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK | pending | pending |
| s200 | 圆润 ↔ 尖锐 | 感官 (senses) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 6 split. | OK | pending | pending |
| s201 | 筋道 ↔ 软烂 | 感官 (senses) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | FIX, applied in v2 (B19-B20): delete s201i07 嚼劲面包 (not a real dish name); add s201i16 牛肉干, anchor 8, easy | pending | pending |
| s202 | 清爽 ↔ 浓郁 | 感官 (senses) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | FIX, applied in v2 (A4-A5): labels 清冽 ↔ 醇厚 → 清爽 ↔ 浓郁 (白酒 tasting vocabulary, rule 6; literary) | pending | pending |
| s203 | 粗粒 ↔ 细粉 | 感官 (senses) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | OK (watch: factual) | pending | pending |
| s204 | 闪亮 ↔ 哑光 | 感官 (senses) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 14 easy, 2 split. | OK (watch: factual) | pending | pending |
| s205 | 有嚼头 ↔ 入口化 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s206 | 新鲜味 ↔ 陈旧味 | 感官 (senses) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split. | OK | pending | pending |
| s208 | 饱满 ↔ 干瘪 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s209 | 稀 ↔ 稠 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s210 | 甜味 ↔ 咸味 | 感官 (senses) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 3 season/festival-tagged. | OK | pending | pending |
| s211 | 起伏 ↔ 平稳 | 感官 (senses) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | OK | pending | pending |
| s212 | 动手 ↔ 动脑 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s213 | 安静玩 ↔ 热闹玩 | 休闲爱好 (leisure) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 3 split. | OK | pending | pending |
| s214 | 易上手 ↔ 门槛高 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 6 split. | OK (overlaps s033, s056; keep apart in schedule) | pending | pending |
| s215 | 省钱 ↔ 花钱 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s216 | 片刻 ↔ 整天 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s217 | 晴天玩 ↔ 雨天玩 | 休闲爱好 (leisure) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s218 | 有输赢 ↔ 没输赢 | 休闲爱好 (leisure) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split. | OK | pending | pending |
| s219 | 小地方 ↔ 大场地 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s220 | 不出汗 ↔ 出大汗 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s221 | 有成品 ↔ 无成品 | 休闲爱好 (leisure) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | OK | pending | pending |
| s222 | 热门 ↔ 冷门 | 休闲爱好 (leisure) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 6 split, 1 season/festival-tagged. | OK | pending | pending |
| s223 | 白天玩 ↔ 晚上玩 | 休闲爱好 (leisure) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s224 | 靠练习 ↔ 靠灵感 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK | pending | pending |
| s225 | 尝个鲜 ↔ 玩一辈子 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | FIX, applied in v2 (A6-A7): labels 尝鲜 ↔ 长久 → 尝个鲜 ↔ 玩一辈子 (长久 unclear as a hobby attribute) | pending | pending |
| s226 | 轻松 ↔ 投入 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s227 | 随时停 ↔ 停不下 | 休闲爱好 (leisure) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK | pending | pending |
| s228 | 适合春天 ↔ 适合秋天 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 10 season/festival-tagged. | OK | pending | pending |
| s229 | 酷炫 ↔ 朴素 | 休闲爱好 (leisure) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | OK | pending | pending |
| s230 | 要装备 ↔ 零装备 | 休闲爱好 (leisure) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 6 split. | OK | pending | pending |
| s231 | 解压 ↔ 费神 | 休闲爱好 (leisure) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK | pending | pending |
| s233 | 近 ↔ 远 | 出行 (travel) | 11 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 3 split. | OK | pending | pending |
| s234 | 轻装 ↔ 大包小包 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK | pending | pending |
| s235 | 热门 ↔ 小众 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK | pending | pending |
| s236 | 舒适 ↔ 将就 | 出行 (travel) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 6 split. | OK | pending | pending |
| s237 | 坐着去 ↔ 走着去 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK | pending | pending |
| s238 | 提前到 ↔ 踩点到 | 出行 (travel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split. | OK | pending | pending |
| s239 | 一日游 ↔ 多日游 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK | pending | pending |
| s240 | 睡得着 ↔ 睡不着 | 出行 (travel) | 10 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 4 split. | OK (light tone about sleeping on the way; not insomnia) | pending | pending |
| s241 | 看景 ↔ 看热闹 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | FIX, applied in v2 (B21-B22): delete s241i04 地铁换乘 (not a sight); add s241i15 灯会, anchor 90, easy | pending | pending |
| s242 | 想再去 ↔ 一次够 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 5 split. | OK | pending | pending |
| s243 | 带伞 ↔ 带墨镜 | 出行 (travel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 2 split, 1 season/festival-tagged. | OK | pending | pending |
| s244 | 有计划 ↔ 随缘 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split. | OK | pending | pending |
| s245 | 一站直达 ↔ 多次换乘 | 出行 (travel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split. | OK | pending | pending |
| s246 | 出发前 ↔ 到达后 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK | pending | pending |
| s247 | 踏青 ↔ 避暑 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split, 2 season/festival-tagged. | OK | pending | pending |
| s248 | 白天更美 ↔ 夜里更美 | 出行 (travel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | OK | pending | pending |
| s249 | 拍照更美 ↔ 亲眼更美 | 出行 (travel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split, 1 season/festival-tagged. | FIX, applied in v2 (A8-A9): labels 镜头里 ↔ 眼睛里 → 拍照更美 ↔ 亲眼更美 (unclear to a 40+ player) | pending | pending |
| s250 | 出门路上 ↔ 回家路上 | 出行 (travel) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s251 | 背下来 ↔ 想明白 | 学习工作 (study) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 2 split. | OK | pending | pending |
| s252 | 例行公事 ↔ 创意发挥 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK | pending | pending |
| s253 | 一个人学 ↔ 一起学 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | OK | pending | pending |
| s254 | 手写 ↔ 打字 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 6 easy, 5 split. | OK | pending | pending |
| s255 | 飞快 ↔ 漫长 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split. | OK | pending | pending |
| s256 | 起步难 ↔ 收尾难 | 学习工作 (study) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | FIX, applied in v2 (C3): s256i08 text 画上色 → 给画上色 | pending | pending |
| s257 | 日常用 ↔ 很少用 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split. | OK | pending | pending |
| s258 | 有成就 ↔ 没感觉 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | OK | pending | pending |
| s259 | 纸质 ↔ 电子 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK | pending | pending |
| s260 | 记得牢 ↔ 容易忘 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split. | FIX, applied in v2 (B23-B24): delete s260i05 随手号码 (unclear); add s260i15 快递取件码, anchor 85, easy | pending | pending |
| s261 | 实操 ↔ 理论 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s262 | 严肃 ↔ 活泼 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s263 | 工整 ↔ 潦草 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK | pending | pending |
| s265 | 基础 ↔ 进阶 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | OK | pending | pending |
| s266 | 考前 ↔ 考后 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK | pending | pending |
| s267 | 读得快 ↔ 读得慢 | 学习工作 (study) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 5 split. | OK | pending | pending |
| s268 | 写得快 ↔ 写得慢 | 学习工作 (study) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 4 split. | OK | pending | pending |
| s269 | 手动 ↔ 自动 | 物件科技 (tech) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s270 | 有线 ↔ 无线 | 物件科技 (tech) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 7 easy, 4 split. | OK | pending | pending |
| s271 | 按键 ↔ 触屏 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK | pending | pending |
| s272 | 笨重 ↔ 轻薄 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 5 split. | OK | pending | pending |
| s273 | 一看就会 ↔ 要琢磨 | 物件科技 (tech) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 4 split. | OK | pending | pending |
| s274 | 静音 ↔ 嗡嗡响 | 物件科技 (tech) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s275 | 易过时 ↔ 不过时 | 物件科技 (tech) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 5 split. | OK | pending | pending |
| s276 | 要用电 ↔ 不用电 | 物件科技 (tech) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK (watch: factual) | pending | pending |
| s277 | 联网 ↔ 单机 | 物件科技 (tech) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 6 split. | OK | pending | pending |
| s278 | 放桌上 ↔ 揣兜里 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 5 split. | OK | pending | pending |
| s279 | 易修 ↔ 难修 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 6 split. | OK | pending | pending |
| s280 | 瞄一眼 ↔ 看半天 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s281 | 单功能 ↔ 多功能 | 物件科技 (tech) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 7 split. | OK | pending | pending |
| s282 | 随手用 ↔ 讲究用 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s283 | 家里用 ↔ 外面用 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 5 split. | OK | pending | pending |
| s285 | 年代感 ↔ 未来感 | 物件科技 (tech) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 14 easy, 2 split. | OK | pending | pending |
| s286 | 期待 ↔ 无感 | 心情感受 (feel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 9 easy, 5 split. | OK | pending | pending |
| s287 | 雀跃 ↔ 平静 | 心情感受 (feel) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | OK | pending | pending |
| s288 | 轻盈 ↔ 沉甸甸 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | FIX, applied in v2 (B25-B28): delete s288i04 一箱书 (physical weight, off-concept) and s288i12 沉默 (vague, sombre); add s288i16 毕业典礼, anchor 75, no tag, and s288i17 搬进新家, anchor 50, split | pending | pending |
| s289 | 新鲜感 ↔ 安心感 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split. | OK | pending | pending |
| s290 | 想分享 ↔ 想独享 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split. | OK | pending | pending |
| s291 | 激昂 ↔ 淡定 | 心情感受 (feel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | OK | pending | pending |
| s292 | 偷着乐 ↔ 狂喜 | 心情感受 (feel) | 12 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split. | FIX, applied in v2 (A10): left 静喜 → 偷着乐 (静喜 is not a standard word) | pending | pending |
| s293 | 放空 ↔ 投入 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 3 split. | OK | pending | pending |
| s294 | 满足 ↔ 期待 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | FIX, applied in v2 (B29-B30): delete s294i02 倒数日 (also a countdown app name, rule 5); add s294i16 数着日子, anchor 94, easy | pending | pending |
| s295 | 被暖到 ↔ 被点燃 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split. | OK | pending | pending |
| s296 | 难忘 ↔ 易忘 | 心情感受 (feel) | 18 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 15 easy, 3 split, 2 season/festival-tagged. | OK | pending | pending |
| s297 | 心满意足 ↔ 意犹未尽 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 4 split. | OK | pending | pending |
| s298 | 空旷 ↔ 拥挤 | 心情感受 (feel) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 3 split, 1 season/festival-tagged. | OK (places in 心情感受: loose fit) | pending | pending |
| s299 | 明朗 ↔ 朦胧 | 心情感受 (feel) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK (scenery in 心情感受: loose fit) | pending | pending |
| s301 | 刚开始 ↔ 快结束 | 心情感受 (feel) | 18 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 15 easy, 3 split. | OK (watch: factual) | pending | pending |
| s302 | 玩到天黑 ↔ 玩一会儿 | 童年回忆 (memory) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 8 easy, 4 split, 1 season/festival-tagged. | OK | pending | pending |
| s304 | 暑假 ↔ 寒假 | 童年回忆 (memory) | 19 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 16 easy, 3 split, 13 season/festival-tagged. | OK | pending | pending |
| s305 | 放学路上 ↔ 周末在家 | 童年回忆 (memory) | 18 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 15 easy, 3 split. | OK | pending | pending |
| s306 | 自己做 ↔ 店里买 | 童年回忆 (memory) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 5 split. | OK | pending | pending |
| s307 | 夏味 ↔ 冬味 | 童年回忆 (memory) | 17 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 15 easy, 2 split, 10 season/festival-tagged. | OK (overlaps s050, s304; keep apart in schedule) | pending | pending |
| s308 | 教室里 ↔ 操场上 | 童年回忆 (memory) | 18 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 14 easy, 4 split. | OK | pending | pending |
| s309 | 一阵风 ↔ 一直有 | 童年回忆 (memory) | 17 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 14 easy, 3 split, 1 season/festival-tagged. | OK; QA finding applied in v2: s309i07 拍洋画 → 拍画片 (wording, id kept) | pending | pending |
| s310 | 热闹夜 ↔ 安静夜 | 童年回忆 (memory) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s311 | 舍不得吃 ↔ 大口吃 | 童年回忆 (memory) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 5 split, 1 season/festival-tagged. | OK | pending | pending |
| s312 | 不见了 ↔ 还在 | 童年回忆 (memory) | 18 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 5 split, 2 season/festival-tagged. | OK | pending | pending |
| s313 | 记得清 ↔ 记不清 | 童年回忆 (memory) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split. | OK | pending | pending |
| s314 | 小玩意 ↔ 大玩具 | 童年回忆 (memory) | 16 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 5 split. | OK; QA finding applied in v2: s314i12 洋娃娃 → 布娃娃 (wording, id kept) | pending | pending |

## Dropped in v2 (applied)

These spectra were deleted from the library in contentVersion 2. Their ids are never reused. They are listed here for the record and are no longer part of the checks above.

| id | left ↔ right | category | items | author | date | notes | product-ux review | QA rules check | result |
|---|---|---|---|---|---|---|---|---|---|
| ~~s110~~ | 一年一次 ↔ 天天都做 | 日常 (life) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 3 split, 2 season/festival-tagged. | DROP, applied in v2 (D1): factual by definition (春节, 生日 are yearly); duplicates s096 | pending | pending |
| ~~s139~~ | 厨房放 ↔ 卧室放 | 居家物件 (home) | 13 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 2 split. | DROP, applied in v2 (D2): duplicates s127 厨房用 ↔ 客厅用; factual | pending | pending |
| ~~s151~~ | 有壳 ↔ 没壳 | 动物 (animal) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | DROP, applied in v2 (D3): biology fact, not opinion; splits are trivia (虾, 鱿鱼) | pending | pending |
| ~~s179~~ | 长在地上 ↔ 长在树上 | 天气自然 (nature) | 17 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 15 easy, 2 split, 4 season/festival-tagged. | DROP, applied in v2 (D4): farming-trivia fact, not opinion (15/17 easy) | pending | pending |
| ~~s207~~ | 尖 ↔ 圆 | 感官 (senses) | 17 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 15 easy, 2 split. | DROP, applied in v2 (D5): geometry fact (15/17 easy); 金字塔 is a named foreign landmark; overlaps s126, s200 | pending | pending |
| ~~s232~~ | 在家玩 ↔ 出门玩 | 休闲爱好 (leisure) | 17 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 3 split. | DROP, applied in v2 (D6): duplicates s036 室内 ↔ 户外 (same activities); 13/17 easy | pending | pending |
| ~~s264~~ | 用笔 ↔ 用脑 | 学习工作 (study) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 12 easy, 2 split. | DROP, applied in v2 (D7): not an opposite pair (writing also uses the brain; 算盘 under 用笔); overlaps s212 | pending | pending |
| ~~s284~~ | 偶尔用 ↔ 天天用 | 物件科技 (tech) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 10 easy, 4 split. | DROP, applied in v2 (D8): reversed duplicate of s124 天天用 ↔ 难得用 (direction flip confuses) | pending | pending |
| ~~s300~~ | 刺激 ↔ 安稳 | 心情感受 (feel) | 15 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 13 easy, 2 split. | DROP, applied in v2 (D9): duplicates s034 养生 ↔ 刺激 (same items: 过山车, 蹦极, 跳伞, 攀岩, 漂流, 滑雪) | pending | pending |
| ~~s303~~ | 酸甜 ↔ 清淡 | 童年回忆 (memory) | 14 | content-owner agent (Claude, AI-assisted) | 2026-10-15 | 11 easy, 3 split, 3 season/festival-tagged. | DROP, applied in v2 (D10): not an opposite pair; taste spectrum in 童年回忆; overlaps s002, s053, s061 | pending | pending |
