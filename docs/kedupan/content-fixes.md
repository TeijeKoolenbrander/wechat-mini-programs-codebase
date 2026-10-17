# 群友刻度盘 content fixes from the product-ux review (spectra library v1 → v2)

Reviewer: product-ux agent (Claude, AI). Date: 2026-10-15. Source: `apps/kedupan/game/core/content/spectra.v1.js` (contentVersion 1, 314 spectra, 4,291 items). Review sheet: `docs/kedupan/content-review.md` (product-ux column).

**This is an AI review, not a human review.** It does not meet spec 4.4 ("no AI-generated text ships without a human rewrite and review"). A human still has to review the library, at the latest at release (Founder Handoff H9).

product-ux did not edit `spectra.v1.js`. A developer applies this list as-is.

## How to apply

1. Apply every row in sections A-D to `spectra.v1.js`.
2. Bump `contentVersion` from 1 to 2 (spec 4.1: any change bumps it).
3. **Regenerate `schedule.v1.js`** with `tools/build-schedule.js`. The current schedule references items of dropped spectra (for example `s179i07`, `s300i05`, `s284i06`, `s110i05`), and some replaced items change tags. The old schedule is invalid once this list is applied.
4. Run `node --test apps/kedupan/game/tests/content-spectra.test.js`. I checked every row below against the AC 8 rules by hand: labels 1-4 Chinese characters, item text 1-10 Chinese characters, no forbidden term, `easy` exactly at anchor ≤ 20 or ≥ 80, `split` at 25-75, at least 2 easy and 2 split per spectrum, both ends of the ruler covered, no duplicate pair (reversed pairs included), and no duplicate text inside a spectrum. The test is still the authority.
5. Update the "Counts" table and the "items" and notes columns in `content-review.md` to the numbers in section E.

**Item-id rule.** Spec 4.5 says ids are never reused. When an item becomes a different thing, the old id is **deleted** and the new item gets the next free id in that spectrum. A pure wording fix for the same thing (for example 做账本 → 记账) keeps its id. Spectrum label rewordings keep the spectrum id, because the concept does not change.

## A. Spectrum label changes (keep id)

| # | id | field | old | new | reason |
|---|---|---|---|---|---|
| A1 | s096 | left | 一次就好 | 偶尔做 | "一次就好" reads as "once in a lifetime is enough", which doesn't fit items like 看电影 or 逛公园. 偶尔做 ↔ 天天要做 is clear at a glance. |
| A2 | s125 | left | 暖 | 有温度 | 暖 ↔ 冷 on home objects is ambiguous: 台灯 could mean light colour or touch. It also reads as a near-reverse of s001 冷 ↔ 热. 有温度 ↔ 冷冰冰 covers both touch and feel, and that ambiguity becomes the fun of the card. |
| A3 | s125 | right | 冷 | 冷冰冰 | see A2 |
| A4 | s202 | left | 清冽 | 清爽 | 清冽 / 醇厚 is the classic tasting vocabulary for 白酒 (rule 6, alcohol association), and it is literary for players. The new pair 清爽 ↔ 浓郁 does not exist yet (s067 is 清爽 ↔ 油腻, s188 is 清爽 ↔ 黏糊). |
| A5 | s202 | right | 醇厚 | 浓郁 | see A4 |
| A6 | s225 | left | 尝鲜 | 尝个鲜 | 长久 is unclear as an attribute of a hobby. The new pair says "just a try" vs "a lifelong hobby" in plain words. |
| A7 | s225 | right | 长久 | 玩一辈子 | see A6 |
| A8 | s249 | left | 镜头里 | 拍照更美 | 镜头里 ↔ 眼睛里 doesn't say what is being compared, which is unclear to a 40+ player. The new pair matches the style of s248 (白天更美 ↔ 夜里更美). |
| A9 | s249 | right | 眼睛里 | 亲眼更美 | see A8 |
| A10 | s292 | left | 静喜 | 偷着乐 | 静喜 is not a standard word. 偷着乐 ↔ 狂喜 is everyday language and a little cheeky (direction §5 tone). |

## B. Item replacements (delete the old id, add a new id)

| # | id | field | old | new | reason |
|---|---|---|---|---|---|
| B1 | s011i09 | item: delete | `{ text: '抓娃娃', anchor: 88, tags: ['easy'] }` | (deleted) | A claw machine is paid randomness for a prize. It is gambling-adjacent, the same reasoning that already removed 拆盲盒 from this spectrum (rule 6, constitution Art. 3.3). |
| B2 | s011i14 | item: add | (none) | `{ id: 's011i14', text: '捏橡皮泥', anchor: 80, tags: ['easy'] }` | replaces B1 |
| B3 | s043i08 | item: delete | `{ text: '抽签', anchor: 28, tags: ['split'] }` | (deleted) | 抽签 is strongly associated with temple fortune slips (求签). That is divination, adjacent to the forbidden 算命 / 占卜 (rule 4). |
| B4 | s043i14 | item: add | (none) | `{ id: 's043i14', text: '第一次下厨', anchor: 35, tags: ['split'] }` | replaces B3, keeps the split count |
| B5 | s070i12 | item: delete | `{ text: '发酵豆腐', anchor: 82, tags: ['easy'] }` | (deleted) | Ambiguous: is it 腐乳 or 臭豆腐? It is a near-duplicate of s070i02 臭豆腐 in the same spectrum. |
| B6 | s070i14 | item: add | (none) | `{ id: 's070i14', text: '腐乳', anchor: 55, tags: ['split'] }` | replaces B5. A good split card (香 or 臭?). |
| B7 | s078i01 | item: delete | `{ text: '糖', anchor: 5, tags: ['easy'] }` | (deleted) | The anchor is implausible: candy is sucked slowly, not swallowed in one go. A single character is also vague. |
| B8 | s078i14 | item: add | (none) | `{ id: 's078i14', text: '葡萄', anchor: 10, tags: ['easy'] }` | replaces B7 |
| B9 | s096i02 | item: delete | `{ text: '洗澡', anchor: 90, tags: ['easy'] }` | (deleted) | "天天洗澡吗" is a well-known 南北 comparison meme. On a national card it invites regional comparison (rule 3). |
| B10 | s096i15 | item: add | (none) | `{ id: 's096i15', text: '洗脸', anchor: 95, tags: ['easy'] }` | replaces B9 |
| B11 | s109i03 | item: delete | `{ text: '沙发', anchor: 95, tags: ['easy'] }` | (deleted) | No disagreement: nobody carries a sofa. The spectrum had 11 easy items and 2 split. |
| B12 | s109i04 | item: delete | `{ text: '冰箱', anchor: 94, tags: ['easy'] }` | (deleted) | same as B11 |
| B13 | s109i14 | item: add | (none) | `{ id: 's109i14', text: '充电宝', anchor: 45, tags: ['split'] }` | replaces B11; it really divides people |
| B14 | s109i15 | item: add | (none) | `{ id: 's109i15', text: '保温杯', anchor: 50, tags: ['split'] }` | replaces B12 |
| B15 | s111i08 | item: delete | `{ text: '菜板', anchor: 66, tags: ['split'] }` | (deleted) | The same object as s111i05 砧板 in the same spectrum (duplicate card). |
| B16 | s111i13 | item: add | (none) | `{ id: 's111i13', text: '钢笔', anchor: 70, tags: ['split'] }` | replaces B15 |
| B17 | s119i05 | item: delete | `{ text: '老日历', anchor: 90, tags: ['easy'] }` | (deleted) | Contradicts s119i06 日历 (10) in the same spectrum. Owners of a tear-off calendar look at it every day, so the anchor is implausible. |
| B18 | s119i13 | item: add | (none) | `{ id: 's119i13', text: '说明书', anchor: 92, tags: ['easy'] }` | replaces B17 |
| B19 | s201i07 | item: delete | `{ text: '嚼劲面包', anchor: 8, tags: ['easy'] }` | (deleted) | Not a real dish name. The wording is awkward for players. |
| B20 | s201i16 | item: add | (none) | `{ id: 's201i16', text: '牛肉干', anchor: 8, tags: ['easy'] }` | replaces B19 |
| B21 | s241i04 | item: delete | `{ text: '地铁换乘', anchor: 95, tags: ['easy'] }` | (deleted) | Not a sight or a spectacle, so it doesn't fit 看景 ↔ 看热闹. |
| B22 | s241i15 | item: add | (none) | `{ id: 's241i15', text: '灯会', anchor: 90, tags: ['easy'] }` | replaces B21 (no festival tag: 灯会 is not tied to one date) |
| B23 | s260i05 | item: delete | `{ text: '随手号码', anchor: 82, tags: ['easy'] }` | (deleted) | Unclear phrase |
| B24 | s260i15 | item: add | (none) | `{ id: 's260i15', text: '快递取件码', anchor: 85, tags: ['easy'] }` | replaces B23; instantly relatable |
| B25 | s288i04 | item: delete | `{ text: '一箱书', anchor: 95, tags: ['easy'] }` | (deleted) | A physical weight in a 心情感受 spectrum: off-concept and confusing |
| B26 | s288i16 | item: add | (none) | `{ id: 's288i16', text: '毕业典礼', anchor: 75, tags: [] }` | replaces B25 (an emotional "沉甸甸") |
| B27 | s288i12 | item: delete | `{ text: '沉默', anchor: 70, tags: ['split'] }` | (deleted) | Vague, with a sombre tone (rule 9) |
| B28 | s288i17 | item: add | (none) | `{ id: 's288i17', text: '搬进新家', anchor: 50, tags: ['split'] }` | replaces B27, keeps the split count |
| B29 | s294i02 | item: delete | `{ text: '倒数日', anchor: 94, tags: ['easy'] }` | (deleted) | 倒数日 is also the name of a well-known countdown app (rule 5, brand) |
| B30 | s294i16 | item: add | (none) | `{ id: 's294i16', text: '数着日子', anchor: 94, tags: ['easy'] }` | replaces B29 |

## C. Wording and anchor fixes (keep id)

| # | id | field | old | new | reason |
|---|---|---|---|---|---|
| C1 | s044i12 | text | 散步时 | 散步 | 时 is a dangling suffix that no other item uses |
| C2 | s107i12 | text | 做账本 | 记账 | 做账 carries the connotation of 做假账 (cooking the books). 记账 is the everyday word. |
| C3 | s256i08 | text | 画上色 | 给画上色 | ungrammatical as written |
| C4 | s121i05 | anchor | 80 | 55 | "总是忘记关灯" at 80 is implausible as the national median. It is a real split. |
| C5 | s121i05 | tags | `['easy']` | `['split']` | follows C4 |
| C6 | s133i05 | anchor | 85 | 60 | A wind chime tinkles; it isn't 响亮 at 85. A split card. |
| C7 | s133i05 | tags | `['easy']` | `['split']` | follows C6 |
| C8 | s140i04 | anchor | 85 | 50 | Most 大衣 are dry-cleaned or hand-washed. 85 (机洗) is implausible; split. |
| C9 | s140i04 | tags | `['easy']` | `['split']` | follows C8 |
| C10 | (file header comment, line 13) | comment | `'split' (expected to divide people, anchor 30-70)` | `'split' (expected to divide people, anchor 25-75)` | Matches TD-55, the review sheet #1 and the test. Comment only. |

## D. Spectrum drops (delete the whole spectrum; ids are never reused)

| # | id | pair | category | items removed | reason |
|---|---|---|---|---|---|
| D1 | s110 | 一年一次 ↔ 天天都做 | life | 13 | Factual by definition (春节, 生日 and 中秋赏月 are yearly), so there is nothing to disagree on. It duplicates s096 (A1) and the other frequency spectra. |
| D2 | s139 | 厨房放 ↔ 卧室放 | home | 13 | Duplicates s127 厨房用 ↔ 客厅用; factual (11 of 13 items easy). |
| D3 | s151 | 有壳 ↔ 没壳 | animal | 14 | A biology fact, not an opinion; the only "splits" are trivia (虾, 鱿鱼). |
| D4 | s179 | 长在地上 ↔ 长在树上 | nature | 17 | A farming-trivia fact, not an opinion (15 of 17 easy). |
| D5 | s207 | 尖 ↔ 圆 | senses | 17 | A geometry fact (15 of 17 easy). Item 金字塔 is a specific foreign landmark (rule 3 adjacent). Overlaps s126 圆 ↔ 方 and s200 圆润 ↔ 尖锐. |
| D6 | s232 | 在家玩 ↔ 出门玩 | leisure | 17 | Duplicates s036 室内 ↔ 户外 (same activities); 13 of 17 easy. |
| D7 | s264 | 用笔 ↔ 用脑 | study | 15 | Not an opposite pair (writing also uses the brain). Item 算盘 under 用笔 shows the confusion. Overlaps s212 动手 ↔ 动脑. |
| D8 | s284 | 偶尔用 ↔ 天天用 | tech | 14 | A reversed duplicate of s124 天天用 ↔ 难得用 (the same idea with the direction flipped confuses repeat players; the test only catches exact reversed labels). |
| D9 | s300 | 刺激 ↔ 安稳 | feel | 15 | Duplicates s034 养生 ↔ 刺激: the same items (过山车, 蹦极, 跳伞, 攀岩, 漂流, 滑雪). |
| D10 | s303 | 酸甜 ↔ 清淡 | memory | 14 | Not an opposite pair. It is a taste spectrum filed under 童年回忆 and overlaps s002, s053 and s061. |

## E. Library after the fixes (AC 8 check)

| Category | Key | Min | Spectra before | Spectra after | Items after |
|---|---|---|---|---|---|
| 吃喝 | food | 40 | 42 | 42 | 537 |
| 日常 | life | 40 | 42 | 41 | 515 |
| 居家物件 | home | 25 | 26 | 25 | 331 |
| 动物 | animal | 25 | 26 | 25 | 350 |
| 天气自然 | nature | 25 | 26 | 25 | 351 |
| 感官 | senses | 25 | 26 | 25 | 351 |
| 休闲爱好 | leisure | 25 | 26 | 25 | 348 |
| 出行 | travel | 20 | 21 | 21 | 275 |
| 学习工作 | study | 20 | 21 | 20 | 276 |
| 物件科技 | tech | 20 | 21 | 20 | 288 |
| 心情感受 | feel | 20 | 21 | 20 | 288 |
| 童年回忆 | memory | 15 | 16 | 15 | 232 |
| **Total** | | **300** | **314** | **304** | **4,142** |

- Every quota holds and every spectrum keeps at least 10 items. Item replacements are one-for-one, so only the drops change the item count.
- **No margin left** in home, animal, nature, senses, leisure, study, tech, feel and memory: they are exactly at the minimum. If QA or release rejects another spectrum in one of these categories, a new spectrum has to be written (next free id s315) and reviewed in its place.
- Changed spectra keep at least 2 easy items, at least 2 split items, and items at both ends: s070 (8 easy, 5 split), s109 (9, 4), s121 (5, 5), s133 (7, 6), s140 (5, 6), s288 (10, 4). The others keep their counts.

## F. Watch list (kept as OK, check after launch)

These are fact-leaning spectra with few splits. They work as easy cards (card 1 must be easy), but they create little argument. After launch, compare the observed spread per card. If the median is tight (low dispersion) on most cards, retire the spectrum and replace it with an opinion-based one.

s058 新 ↔ 旧, s093 轻 ↔ 重, s094 小 ↔ 大, s126 圆 ↔ 方, s129 小巧 ↔ 庞大, s131 室内常见 ↔ 室外常见, s137 能折叠 ↔ 不能折叠, s147 白天活跃 ↔ 夜里活跃, s150 水里待 ↔ 天上飞, s153 吃肉 ↔ 吃草, s157 身体小 ↔ 身体大, s162 会飞 ↔ 不会飞, s166 耐寒 ↔ 怕冷, s168 湿 ↔ 干, s169 亮 ↔ 暗, s173 平地 ↔ 高山, s174 近水 ↔ 近山, s177 晨景 ↔ 晚景, s180 花期短 ↔ 花期长, s203 粗粒 ↔ 细粉, s204 闪亮 ↔ 哑光, s276 要用电 ↔ 不用电, s301 刚开始 ↔ 快结束.

Overlaps to keep apart in the schedule (the 21-day rule is per spectrum id only): s033 / s056 / s214 (好学, 容易, 易上手), s121 / s260 (记得牢), s105 / s244 (计划), s012 / s022 / s059 (安静, 吵).
