# 比一比: spec, v1 complete release

Status: **v1 complete-release scope (2026-10-15).** The founder approved building this game (F-1, relayed by the CTO). Under constitution Art. 4 there are no phases, no MVP cut-off and no interim approvals: everything in §1-§17 is v1. §18 is the post-launch backlog. Author: product-ux.
Type: WeChat 小游戏 (mini game). Slug: `bibiyi`. Companions: `docs/bibiyi/direction.md` (vision, pillars, tone, art, content strategy, risks) and **`docs/bibiyi/decisions.md`** (every product decision: date, decision, reason, alternatives; IDs PO-n).
Reference build: 点将台 (`docs/dianjiangtai/spec.md` = [DJT], `apps/dianjiangtai/`). Platform facts: `docs/dianjiangtai/phase0-platform.md` = [P0]. Research: `research/2026-10-15-new-ideas/kept-ideas.md` = [KEPT], `kept-ideas-alt.md` = [ALT].

Labels:
- **[COMPLIANCE]**: compliance-sensitive.
- **[VERIFY]**: not yet checked against an official source or on a real device. Each has a default and a fallback.
- **[SPIKE]**: platform behaviour proven only in the fake-`wx` harness; must pass in the founder's device pass (§14) before submission.
- **INFERENCE**: our own judgement.
- **(reuse)**: copied from 点将台 with only the changes stated. Code is **copied** into `apps/bibiyi/`, never imported across apps (PO-31).

---

## 0. Decisions summary

Full rationale and alternatives: `docs/bibiyi/decisions.md`. The calls that shape the whole spec:

| ID | Decision | Where |
|---|---|---|
| F-1 | Founder approved building 比一比 (2026-10-15) | whole doc |
| PO-1 | Name 比一比; never 猜大小/比大小; banned gambling vocabulary | §3.6, AC 9-10 |
| PO-2 | Top card shows its value, bottom card hidden; two measure-specific buttons; the bottom card becomes the next top card | §2, §6.3 |
| PO-3 | Score = **连对** (correct answers before the first miss). Daily deck 40 questions, free deck 60 | §2, §5 |
| PO-4 | No timers. Lookups are possible and accepted (no prizes) | §5.2, direction §11 |
| PO-5 | Two fact pools: **free** (bundled in the game) and **daily** (server only) | §3.9 |
| PO-6, PO-7, PO-8 | Deck structure, pair rules, difficulty bands and an analytic difficulty gate; daily decks generated live, no seed bank | §4 |
| PO-9 | Every run on a daily deck is **server-stepped**: one question at a time via `answer` | §5.2, §11 |
| PO-10 | Free play runs on the client, offline, and is submitted best-effort | §5.3 |
| PO-11 | Rewarded **再答一次** once per free run (both sides of a free challenge); never on a daily deck | §5.5, §9 |
| PO-14 | A challenge on today's deck counts as the recipient's daily if unplayed; otherwise friendly | §5.4 |
| PO-15 | Server-authoritative boards (C3 reuse) ranked by 连对; ties share a rank | §8 |
| PO-19..PO-24 | 682 launch facts, licence classes, exclusions, two-person verification, report flow, rotation | §3 |

---

## 1. Goal, target user, scope

**Goal (v1).** Launch one complete, polished higher/lower streak game on sourced Chinese facts, whose shared daily deck spreads through WeChat groups. No pre-launch gate: the research thresholds are **post-launch KPIs** (§12): runs per session ≥ 3, card-open-to-play ≥ 25%, D1 ≥ 35% (launch target 40%), D7 ≥ 15%, share rate ≥ 8%, data-dispute reports < 1% of reveals.

**Release path:** v1 complete build → QA → release pack (`docs/bibiyi/release/`) → Founder Handoff (§16) → founder device pass (§14) → submission.

**Target user.** WeChat players aged 24-40 and 40+, many of them non-gamers. Portrait, one thumb, large text, no timers (direction §2).

**Article 3 check.**

| Principle | How v1 meets it |
|---|---|
| Simple | One sentence: "看上面的数字，猜下面那张更多还是更少，错一次就结束". Two buttons. The first question teaches itself; a 3-line 玩法 sheet opens once and is dismissible. Learnable in < 30 s (AC 1) |
| Addictive | 30-90 s runs, instant 再来一局, a daily deck at 00:00 BJT, day streaks, a personal best, the near-miss reveal. No dark patterns: no timers, no pressure copy, no streak rewards, no paid randomness (AC 70-72) |
| Social | Same deck for everyone; server-ranked group and friend boards; challenge cards on the same deck; spoiler-free share cards. Nothing is rewarded for sharing (AC 50-58) |

**Package budget** (reuse, [P0] §10): main package ≤ 4 MB including the open data domain; total ≤ 30 MB. v1 ships code, the free fact pool (about 440 facts, about 150 KB as JS), code-drawn icons (no image files except the static fallback share image and the avatar), a few short sounds; the display font goes in a subpackage.

**Feature scope (all v1)**

| Feature | Notes |
|---|---|
| 今日一比 (daily deck, one ranked attempt, 40 questions, weekday theme) | server-stepped (§5.2) |
| 随便比比 (free play, unlimited, category filter, 60 questions) | offline, client-side (§5.3) |
| Rewarded 再答一次 (once per free run) | §5.5 |
| Result screen with the missed pair, source, "数据有误？" | §6.5 |
| Report-an-error flow (fixed reasons, no free text) | §3.8, §6.6 |
| Share card (daily: no fact names; free: the missed pair) | §6.7, §7 |
| Save card to album | §6.17 (reuse) |
| Challenge a friend's streak (same deck) + opt-in "好友接受了你的挑战" notice | §5.4, §6.8, §6.18 |
| Group and friend boards, server-ranked (C3) with day streaks | §8 (reuse) |
| Day streak (连续 N 天) and personal bests | §6.16 |
| History: last 30 issues, own result, distribution, the full deck once the day is over | §6.11 |
| 数据来源 page (attribution), 玩法, 设置, privacy status | §6.12 |
| Large-text and high-contrast modes | §6.19 (reuse) |
| Interstitial (config caps), banner on boards (config, default off) | §9 (reuse) |
| Anti-cheat: server-stepped daily, anomaly flags (observe-only) | §11.5 |
| Analytics via `track` | §12 (reuse) |

**Reuse summary** (detail in Appendix A). From 点将台 we copy: the canvas scene loop, layout and capsule logic, touch routing, `core/` vs `js/` split with drift test, `core/rng.js`, `core/date.js`, the fake-`wx` harness, the open data domain (`opendata/`: hashed board join, SHA-256, drawing), share, ads, privacy, store, analytics and VM patterns, and the cloud function skeleton (`common/store.js`, `input.js`, `util.js`, `rules.js`, sync/drift scripts, deny-all DB rules) with `getDaily`, `genDaily`, `startRun`, `submitRun`, `createChallenge`, `getChallenge`, `subscribeChallenge`, `joinGroup`, `getBoard`, `getHistory`, `track`, `cleanup`. New: the fact content and its build tool, `core/deck.js`, `core/judge.js`, the `answer` and `reportFact` functions, the card UI, the report sheet, the 数据来源 page.

---

## 2. Core loop, step by step

A run takes about 30-90 s.

1. **Choose a mode** on home: 今日一比 (daily, one ranked attempt) or 随便比比 (free, unlimited). Or arrive from a challenge card (§5.4).
2. **Question k.** Two cards, stacked: the **top card** shows a thing, its measure and its value with unit and source ("长江 · 全长 · 6,300 公里 · 来源：…"). The **bottom card** shows another thing of the same measure with its value hidden ("黄河 · 全长 · ？公里").
3. **Answer.** Under the cards: "黄河 比 长江 ……" and two buttons with the measure's verbs, for example **[更长]** **[更短]**. One tap.
4. **Reveal.** The bottom card turns over and its value counts up (about 1 s, tap to skip). ✓ 对 or ✗ 错 is shown in text and colour.
5. **Correct:** 连对 +1. The bottom card slides up and becomes the top card; a new bottom card appears. When the deck switches to a new measure (a new *segment*), both cards are new and a one-line banner says "下一组：比海拔".
6. **Miss:** the run ends. (Free play only: a one-time offer **再答一次** by rewarded video, §5.5.) The result shows 连对 N, the missed pair with both values and sources, and "数据有误？".
7. **Deck end:** answering all questions correctly ends the run as **全部答对** (daily 40, free 60).
8. **Next actions** (all optional): 再来一局 (free play) · 分享 · 发起挑战 · 保存图片 · 看群榜/好友榜 · 本局题目 (the list of this run's pairs with values and report links; for a daily deck only the questions already answered).

There are **no timers** anywhere (PO-4). Interstitials appear only on 再来一局 in free play under the §9 caps.

---

## 3. Content model

### 3.1 Categories and measures

A **measure** is one comparable dimension with one unit. Pairs are only ever made within one measure. A **category** groups measures for themes, icons and the free-play filter.

| Category (key) | Label | Measure (key) | Card sub-label | Unit shown | Verbs (hi / lo) | Kind | Min gap | Precision |
|---|---|---|---|---|---|---|---|---|
| `city` | 城市 | `city_pop` | 常住人口（2020） | 万人 (1 decimal) | 更多 / 更少 | ratio | ×1.10 | official census |
| `city` | 城市 | `prov_pop` | 常住人口（2020） | 万人 | 更多 / 更少 | ratio | ×1.10 | official census |
| `geo` | 山河 | `mountain` | 海拔 | 米 | 更高 / 更低 | ratio | ×1.05 | official survey |
| `geo` | 山河 | `river` | 全长 | 公里 | 更长 / 更短 | ratio | ×1.10 | official, method-dependent |
| `geo` | 山河 | `lake` | 面积 | 平方公里 | 更大 / 更小 | ratio | ×1.25 | seasonal |
| `era` | 古今 | `year` | 始建 / 建成 / 成书 / 问世（per fact） | 年 (公元前 / 公元, "约" if approx) | 更晚 / 更早 | year | ≥ 30 years and ≥ 2 × the larger uncertainty | historical |
| `animal` | 动物 | `animal_weight` | 成年体重（约） | 千克 | 更重 / 更轻 | ratio | ×1.50 | approximate |
| `animal` | 动物 | `animal_life` | 寿命（约） | 年 | 更长 / 更短 | ratio | ×1.50 | approximate |
| `space` | 天文 | `space_diameter` | 直径 | 公里 | 更大 / 更小 | ratio | ×1.05 | scientific |
| `build` | 工程 | `structure_len` | 全长 | 米 | 更长 / 更短 | ratio | ×1.10 | official |
| `build` | 工程 | `structure_height` | 高度 | 米 | 更高 / 更低 | ratio | ×1.10 | official |
| `food` | 吃喝 | `food_kcal` | 每100克热量（约） | 千卡 | 更高 / 更低 | ratio | ×1.30 | approximate |
| `dist` | 距离 | `distance` | 两地直线距离 | 公里 | 更远 / 更近 | ratio | ×1.05 | computed by us |

- **hi** always means "the bottom value is numerically greater than the top value". For years, a greater year is later, so hi = 更晚. BCE years are stored as negative integers.
- **Ratio kind:** gap `g = |ln(b/a)|`; a pair is legal only if `max/min ≥ minGap`. **Year kind:** gap = |Δ years|.
- **Never** a bare 大/小 button, and never the word 大小 (PO-1).
- Province area and all other territory, border or area-of-region data are **excluded** (§3.5, PO-21). Population uses a single year (the 2020 census) everywhere (PO-29).

### 3.2 Fact data model

Content files are **`.js` modules** (mini games can only `require` `.js`), source of truth in `apps/bibiyi/content/facts/<measure>.js` (§3.10).

```js
{
  id: 'f_city_pop_chengdu',          // stable; never encodes the value
  measure: 'city_pop',
  pool: 'free',                      // 'free' (bundled) | 'daily' (server only), §3.9
  label: '成都市',                    // ≤ 10 chars, official name (§3.6)
  sub: null,                         // optional per-fact sub-label override, e.g. '成书' for year facts; ≤ 4 chars
  value: 20937757,                   // raw number in the measure's base unit (people, m, km, kg, years, kcal...)
  approx: false,                     // true → shown with '约'
  uncertainty: 0,                    // year kind only: ± years
  year: 2020,                        // data year (shown in the source line); for 'year' facts the edition/publication year of the source
  source: '四川省第七次全国人口普查公报（第二号）',
  publisher: '四川省统计局',
  url: 'https://…',                  // https, the exact page or document the value was read from
  licence: 'CN-GOV-STAT',            // §3.4
  retrievedAt: '2026-10-20',
  verifiedBy: ['author:product-ux', 'verifier:qa'],   // two distinct roles, §3.7
  note: '常住人口口径',                // optional ≤ 24 chars, shown after the reveal; no opinion
  tags: [],                          // review tags, e.g. 'border-feature' (§3.5)
  status: 'active',                  // 'active' | 'suspended' | 'retired'
  since: 1                           // contentVersion that introduced it
}
```

**Measure definition** (`content/measures.js`):

```js
{ key:'river', category:'geo', subLabel:'全长', unit:'公里', base:'km', scale:1, decimals:0,
  hi:'更长', lo:'更短', kind:'ratio', minGap:1.10, icon:'river', knowledgeScale:0.30 }
```

`knowledgeScale` feeds the player model (§4.4). Display formatting (thousands separators, 万 scaling, decimals, 约, 公元前) is done by `core/format.js`, never by the renderer.

### 3.3 Launch counts

**682 facts** at contentVersion 1 (PO-19): 440 free, 242 daily.

| Measure | Total | Free | Daily |
|---|---|---|---|
| `city_pop` (地级及以上城市) | 131 | 87 | 44 |
| `prov_pop` (31 个省、自治区、直辖市) | 31 | 21 | 10 |
| `mountain` | 50 | 34 | 16 |
| `river` | 40 | 26 | 14 |
| `lake` | 30 | 20 | 10 |
| `year` | 90 | 50 | 40 |
| `animal_weight` | 50 | 32 | 18 |
| `animal_life` | 30 | 18 | 12 |
| `space_diameter` | 40 | 26 | 14 |
| `structure_len` | 30 | 20 | 10 |
| `structure_height` | 30 | 20 | 10 |
| `food_kcal` | 70 | 46 | 24 |
| `distance` | 60 | 40 | 20 |
| **Total** | **682** | **440** | **242** |

Daily pool by theme group (§4.3): 城市 54, 山河 40, 古今 40, 动物 30, 天文与工程 34, 吃喝与距离 44. Each theme group has ≥ 30 daily facts (validator check).

With ratio measures, 682 facts give tens of thousands of legal pairs; the pair rules (§4.1) and bands (§4.2) decide which are used.

### 3.4 Sources and licence classes [COMPLIANCE]

Every fact carries exactly one licence class. The content validator rejects anything else.

| Class | Sources (examples) | Conditions we follow | Status |
|---|---|---|---|
| `CN-GOV-STAT` | 国家统计局 第七次全国人口普查公报; provincial and municipal 七普公报 (统计局) | Terms (fetched by [ALT], https://www.stats.gov.cn/wzgl/202302/t20230217_1912857.html): data may be downloaded and used lawfully and **accurately**; credit the source prominently (国家统计局网站 + URL); do not distort. We: show the publisher and year on every reveal, list publisher + URL on the 数据来源 page and in the fact's source sheet, never round in a way that changes a comparison, take single figures only (never whole tables) | **[VERIFY]** commercial use is not addressed. Default: proceed with attribution and accuracy (PO-20). Fallback: one content version swaps every `CN-GOV-STAT` fact out (the class makes it a filter). Optional counsel check in the Handoff (H9) |
| `CN-GOV-GEO` | 自然资源部 published 重要地理信息数据 (e.g. 珠穆朗玛峰 8848.86 m, 2020); 水利部 bulletins (rivers, lakes) | Officially **published** values only. Under the surveying rules, important geographic data must use the officially published figures **[VERIFY]**; where no official figure is published for a feature, the fact is not used | default: official figures only |
| `CN-GOV-OTHER` | 国家文物局 and site-management announcements (始建年代, heights of 古塔); official project figures for public bridges | Single facts, cited; official wording for names | default |
| `US-PD` | NASA (e.g. NSSDCA Planetary Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | US federal works are public domain; we credit NASA anyway | low risk |
| `CC0` | USDA FoodData Central (https://fdc.nal.usda.gov/), generic foods only | CC0 per FDC **[VERIFY]**; credit "USDA FoodData Central" | low risk |
| `CC-BY-4.0` | GeoNames (https://www.geonames.org/) coordinates of city government seats | Attribution "GeoNames (CC BY 4.0)" on the 数据来源 page and in the source line of every distance fact; the distance is **computed by us** (great-circle, rounded to 10 km) and labelled "直线距离（本游戏计算）" | low risk |
| `FACT-CITED` | A single number from a published reference work (e.g. animal weights and lifespans) | Facts are not protected by copyright, compilations can be (INFERENCE, [KEPT] §4). So: one number per fact, our own wording, **≤ 25 facts per source work**, no copying of tables, text or images; cite the work | [VERIFY] counsel (H9, optional) |

**Banned sources** (validator rejects by licence class and URL host list): scraped or platform data (百度指数, 微信指数, 抖音/微博热榜, e-commerce prices or sales, app ranks); Wikipedia and Baidu Baike as a source (allowed only as a lead to a primary source); anything NC (non-commercial) or SA (share-alike); paywalled or login-only data; **values produced by an AI model or recalled from memory** (every value must be read from the cited URL at `retrievedAt`); maps of any kind.

### 3.5 Exclusions and sensitivity rules [COMPLIANCE]

A fact (and therefore any pair) is excluded if it touches any of the following. These are review checklist items (§3.7) and, where mechanical, validator checks (forbidden terms and tags).

1. **Politics:** political figures, parties, policies, political events, modern political history (after 1840), elections, national achievements framed as rivalry.
2. **People:** no living or historical persons as items (no celebrities, athletes, rulers, generals, writers). Things, places and years only.
3. **Ethnicity and religion:** no comparisons of ethnic groups or religions; no 自治州/自治县/盟 as city items (city items are 地级市, 副省级市 and 直辖市 only); no religious texts and no active places of worship as items. Pagodas and grottoes are allowed only as architectural heritage, with neutral wording.
4. **Regional quality rankings:** no GDP, income, prices, house prices, wages, crime, education, health or any "better/worse" statistic about places. Population is allowed (a size, not a quality).
5. **Disasters, casualties, war, military:** none (no earthquakes, floods, epidemics, death tolls, battles, weapons, military facilities).
6. **Territory and borders:** no area of countries, provinces or regions; no border lengths; no features in disputed areas; no Taiwan, Hong Kong or Macau items (province facts follow the census scope "31 个省、自治区、直辖市", stated in the source line); for features on borders (珠穆朗玛峰, 乔戈里峰) only the official Chinese name and the value, never a country attribution (tag `border-feature`, extra review).
7. **No countries** as items at all (PO-28).
8. **No maps,** map images or location pins (a published map needs a 审图号). Distances are text only.
9. **Brands and companies:** no brands, products, companies, commercial buildings or chain restaurants. Foods are generic (米饭, 鸡蛋, 苹果).
10. **Money:** no prices, salaries, revenues, stocks, crypto.
11. **Dams and politically symbolic megaprojects:** excluded (structures are heritage buildings and public bridges).
12. **Health claims:** food facts are calories per 100 g only, no diet advice, no "健康/不健康".

### 3.6 Wording rules and vocabulary [COMPLIANCE]

- **Labels:** the official standard name (民政部 行政区划 names for cities and provinces; official names for features, e.g. 珠穆朗玛峰); ≤ 10 characters; no adjectives, nicknames or jokes.
- **Notes:** ≤ 24 characters, factual (口径, 测量年份), never an opinion about a place.
- **Copy** (comments, toasts, share titles) is about the player's run, never about places or things ("差一点！" yes; "XX 真小" no).
- **Forbidden terms** (validator + AC 9 code/copy search over every user-visible string, share title, content file and store text): 猜大小, 比大小, 大小 (as a standalone word), 押, 下注, 赌, 赌注, 翻倍, 加倍, 筹码, 金币, 倍率, 赔率, 庄家, 梭哈, 骰, 骰子, 彩票, 中奖, 奖池, 抽奖, 开奖, 运气, 手气, 复活币, Higher Lower, Higher or Lower, 更高更低 (as a title), plus any brand names list maintained by release.
- **Vocabulary we do use:** 连对 (streak), 今日一比 (daily), 随便比比 (free play), 再答一次 (rewarded continue), 发起挑战 / 接受挑战, 全部答对, 第 N 期.

### 3.7 Fact review rules (pre-launch and every content release)

1. **Author** (product-ux, as content owner): reads the value at the cited URL, fills every field, applies the exclusion checklist (§3.5) and wording rules (§3.6). No value may come from memory or an AI model.
2. **Verifier** (qa, independently): opens the URL, confirms value, unit, year and name; confirms the licence class; re-checks the exclusion checklist. A disagreement that the two cannot settle from the source drops the fact.
3. **Precision check:** if two credible official figures differ by more than the measure's min gap, the fact is dropped or marked `approx` with a larger effective gap (validator: approx facts use 1.5× the measure's min gap).
4. **Pair spot-check:** the content build prints 200 random legal pairs per measure; the author reads them for accidental sensitivity (e.g. two cities in a way that reads as a rivalry statement). Problems become tags that the pair generator honours (`noPairWith: [...]`).
5. **Release check:** the release agent re-runs the validator and the forbidden-terms search, and records the review in the release checklist before any upload.
6. **Every year:** facts whose source has a newer edition are re-verified (populations stay on the 2020 census until the next census, PO-29).

The validator (`core/content.js validateContent`, run in CI and in the build tool) rejects: missing fields; unknown measure or licence; non-https URL; a banned host; `verifiedBy` without two distinct roles; label > 10 chars or note > 24 chars; any forbidden term; ratio-kind values ≤ 0 or non-finite; year values not integers; > 25 `FACT-CITED` facts per `source`; duplicate ids or duplicate labels within a measure; any measure or theme group below its §3.3 count; any fact with an exclusion tag.

### 3.8 Report an error ("数据有误？")

- **Where:** on every reveal (a small text link under the source line, after the answer, never before), on the result screen's missed pair, in 本局题目, and in the history deck view.
- **Sheet:** title "这条数据有问题？", the fact's label, value, source and year, and **fixed reasons** (multi-select chips): 数值不对 / 单位不对 / 名称不对 / 来源对不上 / 措辞不妥 / 其他. [提交] [取消]. **No free text** (no UGC, so no moderation; the 设置 page's 联系我们 feedback button covers longer reports, PO-23).
- **Server:** `reportFact({factId, reasons[], where, dateKey?, runId?})` writes `fact_reports` with `_id = <factId>_<openid>` (one report per person per fact; a repeat updates reasons). Rate limit 20 per openid per day. Toast "已收到，谢谢！我们会核对" either way.
- **Auto-suspend:** when a fact has reports from **≥ 5 distinct players within 7 days**, `reportFact` adds it to `fact_overrides.suspended` (with `auto: true`). Suspended facts are skipped by future daily decks immediately. Free-pool facts can't change without a release; they are fixed or removed in the next content version.
- **Review (ops, weekly; content owner):** each reported fact is re-checked against its source. Outcomes: `confirmed` (fix or remove in the next content version; keep suspended until then), `rejected` (un-suspend), `source-updated` (new value in the next version). The outcome is stored on the reports (status) for the KPI.
- **No mid-day changes:** a published daily deck is never edited, so everyone keeps playing the same deck. If a daily fact is confirmed wrong, the history issue detail shows a 勘误 line for it ("勘误：该数据已更正为 …") from `fact_overrides.errata`. Ranked results are not changed (PO-23).
- **KPI:** report rate = reports ÷ reveals; healthy < 1%; any single fact above 0.3% of its reveals is flagged in the `cleanup` roll-up.

### 3.9 Pools, rotation and versions

- **Free pool** (`pool: 'free'`): bundled in the game package with values (free play works offline; its answers are not secret).
- **Daily pool** (`pool: 'daily'`): exists **only** in the cloud functions. It never appears in the game package (CI check, AC 22), so the package is not an answer key for the daily. Daily facts become visible to players only as they are answered or once the day's history opens.
- **Repeat window:** a daily fact appears in at most one published deck within any 3 consecutive days (`config.daily.repeatWindowDays = 3`).
- **Monthly content release** (contentVersion + 1): adds ≥ 30 new daily facts; daily facts that have appeared in ≥ 8 published decks **graduate** to the free pool; confirmed report fixes and removals ship. Free-pool changes need a client release; daily-pool changes need only a cloud function redeploy.
- **Pinned versions:** each daily deck, free run and challenge pins its `contentVersion`. The server keeps the last 2 versions; a free run or challenge on an older retired version gets `CHALLENGE_EXPIRED` / is validated against the version it pinned while available.
- **Graduation is one-way:** a free fact never moves back to the daily pool.

### 3.10 Content files and pipeline

```
apps/bibiyi/content/
  measures.js               measures and categories (§3.1)
  facts/<measure>.js        source of truth, all fields (§3.2), both pools
  review/                   pair spot-check outputs (generated, git-ignored)
apps/bibiyi/tools/build-content.js
  → apps/bibiyi/game/core/content/facts.free.v<N>.js        free pool only, display fields + value + source line + url
  → apps/bibiyi/cloudfunctions/common/content/facts.all.v<N>.js   both pools (server judges daily answers and validates free runs)
```

The build tool runs the validator, writes both outputs and a manifest (counts per measure, pool and licence), and fails if any daily fact id or label would reach the game output. CI re-runs it and diffs (drift check, same pattern as 点将台 `sync-core`).

---

## 4. Pairs and decks

### 4.1 Pair rules (both modes)

A question is a pair (top `a`, bottom `b`). It is legal only if:
1. `a` and `b` share a measure and are different facts (and different labels).
2. The gap meets the measure's min gap (§3.1); approx facts use 1.5× (§3.7.3). Year kind: |Δ| ≥ max(30, 2 × max(uncertainty)).
3. Neither fact is `suspended` or `retired`, neither appears in the other's `noPairWith`.
4. The **displayed** (rounded) values differ in the same direction as the raw values (no visual tie after rounding).
5. Within a deck, a fact appears at most once (free decks: at most once per 10 questions, §4.5).

### 4.2 Deck structure and difficulty bands

- A deck is an ordered list of questions `[{a, b}]`. Within a **segment** (same measure), question k+1's top card is question k's bottom card. A segment has 4-8 questions (daily) or 5-10 (free). Consecutive segments use different measures; the first question of a segment shows a fresh top card.
- **Difficulty bands by question position** (gap `g = |ln(b/a)|`, or |Δ years| for year kind). A question's gap must fall in its band, clamped to the measure's min gap:

| Position k | Ratio band (max/min) | Year band (Δ years) |
|---|---|---|
| 1-5 | ≥ 2.0 | ≥ 400 |
| 6-12 | 1.5 - 4.0 | 150 - 800 |
| 13-20 | 1.25 - 2.5 | 80 - 400 |
| 21-30 | min gap - 1.8 | 40 - 200 |
| 31-40 (and free 41-60) | min gap - 1.4 | 30 - 120 |

If a measure's min gap exceeds a band's upper bound (animals: 1.5), the band's upper bound becomes min gap × 1.2 for that measure. Bands live in `core/config.js` (`bands`, versioned by `configVersion`).

### 4.3 Daily deck: themes

- **40 questions**, Beijing weekday theme from the date key (`core/date.js`, never the device clock):

| Day | Theme (issue tag) | Questions 1-20 from | Questions 21-40 |
|---|---|---|---|
| 周一 | 城市 | `city` | mixed (all categories) |
| 周二 | 山河 | `geo` | mixed |
| 周三 | 古今 | `era` | mixed |
| 周四 | 动物 | `animal` | mixed |
| 周五 | 天文与工程 | `space`, `build` | mixed |
| 周六 | 吃喝与距离 | `food`, `dist` | mixed |
| 周日 | 大杂烩 | mixed | mixed |

- Mixed segments rotate measures so no measure takes more than 2 segments in a deck.
- Daily facts only (daily pool), excluding facts used in the previous 2 published decks (repeat window) and suspended facts.

### 4.4 Player model and the daily difficulty gate

No simulation needed: the gate is computed analytically (PO-8).

- **Typical player model** (`core/config.js` `model`): for question k with gap g, `p_k = pMin + (pMax − pMin) × (1 − exp(−g' / s_m))`, where `g' = g` for ratio kind and `g' = Δyears / 100` for year kind, `s_m` = the measure's `knowledgeScale`, starting values `pMin 0.50`, `pMax 0.96`, scales: city_pop 0.35, prov_pop 0.35, mountain 0.20, river 0.30, lake 0.45, year 1.5, animal_weight 0.60, animal_life 0.60, space_diameter 0.50, structure_len 0.40, structure_height 0.40, food_kcal 0.50, distance 0.25 (INFERENCE; recalibrated, below).
- **Streak distribution:** `P(streak ≥ n) = Π_{k=1..n} p_k`. Median streak `M` = the largest n with `P(streak ≥ n) ≥ 0.5`.
- **Daily gates** (`config.gates`, `gateVersion`): `M ∈ [6, 12]`; `P(streak ≥ 20) ∈ [2%, 15%]`; `P(streak = 40) ≤ 0.5%`. A deck failing any gate is discarded.
- **Generation:** `genDaily` builds candidates from `sub(seed, "deck:" + attempt)` until one passes (≤ 500 candidates; expected well under 1 s). If none passes, it relaxes nothing: it returns `DAILY_UNAVAILABLE` and alerts (same principle as 点将台 C5: no "relaxed" daily is ever published). The CI tool `tools/deckstats.js` measures the pass rate over 10,000 dates for the launch content (target ≥ 20% of candidates, AC 30).
- **Recalibration (monthly, with the content release):** the `cleanup` roll-up aggregates answer correctness by measure and gap bucket (`answer_stats`, §11.1); `tools/deckstats.js --calibrate` fits `knowledgeScale` per measure and proposes a new `configVersion`. **Surprise boost:** pairs whose observed correctness is far below the model (people's intuition is wrong) are good content; the generator may prefer them in positions 6-30 (`config.surpriseWeight`, default 0 at launch, switched on once ≥ 200 answers per pair bucket exist).

### 4.5 Free deck

- Built on the client by `core/deck.js buildFreeDeck(seed, contentVersion, configVersion, group)` from the **free pool** only. `group` is the category filter (`all` or one category key, §6.14). Deterministic: the same inputs give the same deck on the client and in cloud functions.
- 60 questions, the §4.2 bands (41-60 use the last band). A fact may repeat only after 10 other questions. No gate (free decks are not compared on boards).
- A small category with too few legal pairs for a band takes the nearest legal gap and logs nothing to the player.

---

## 5. Modes

### 5.1 Determinism and identity (reuse)

- All randomness comes from `core/rng.js` (mulberry32, `hash32`, `sub(seed, name)`), copied from 点将台.
- Date keys are Beijing dates from server time (`core/date.js`, explicit UTC+8 arithmetic; every function also sets `TZ=Asia/Shanghai`).
- Identity is always the cloud function context `OPENID`; never from client input.

### 5.2 今日一比 (daily deck)

- **Seed and deck:** `genDaily` (timer 23:00 BJT, `0 0 23 * * * *`) builds and stores the next day's deck in `daily_decks` (`_id = YYYYMMDD`, created with `add` of that `_id`, so a double-fired trigger or the lazy `getDaily` path creates exactly one). No seed bank: generation is cheap and rules-based (PO-8). Issue number 第 N 期 = days since launch.
- **One ranked attempt** per openid per date. The attempt starts at the first question (`startRun`).
- **Server-stepped (PO-9):** the client never holds a future question or an unrevealed value.
  1. `getDaily` returns status only: issue, theme, my status, my result, day streak, features. **No questions.**
  2. Tapping 开始 calls `startRun({mode:'daily', clientRunId, dateKey})`, which creates `run_progress` (`_id = <dateKey>_<openid>`) and returns question 1: the top card **with** its value and source, the bottom card **without** value. On resume it returns the current open question and the run so far.
  3. Each tap calls `answer({clientRunId, k, choice: 'hi'|'lo'})`. The server judges against its own values, stores the answer, and returns the revealed bottom value with its source, `correct`, the streak, and either the next question or the end of the run. **The first answer to a question is final:** repeating the call with the same `k` returns the stored outcome (idempotent); a different `choice` for an answered `k` returns the stored outcome too; a `k` other than the current one returns `INVALID_ORDER` (plus an `order` anomaly).
  4. **Run end:** on a miss or after question 40, the server finalizes in one transaction: `daily_results` (`add` with `_id = <dateKey>_<openid>`), `daily_stats.hist[n]` `inc`, `player_stats` (day streak). It returns the result (streak, rarity, day streak).
- **Latency:** the card turn (about 0.4 s) covers the round trip. Without a response after 5 s: "网络不太好" + [重试] on the card; the tap is not lost (retry re-sends the same `k` and `choice`).
- **Abandon:** closing the app mid-run keeps the attempt open; it resumes at the same question. An attempt that is still open when the submit window closes (D+1 00:30 BJT) is **finalized at its current streak** by the next `getDaily`/`cleanup` touch (end reason `window`). This is the same as stopping, so it is not an exploit (a miss also ends at the current streak, PO-18).
- **Midnight grace:** answers for date D are accepted until D+1 00:30 BJT if the run started on D. After that `answer` returns `WINDOW_CLOSED` with the finalized result; the client shows "今日一比已结束，按当前连对记入".
- **No rewarded continue** on any daily-deck run (PO-11). No ads during a run.
- **Spoilers:** share cards, boards and challenge entries never show daily fact names or values. The full deck with values appears in history only after the window closes (§6.11).
- **Honesty note (INFERENCE):** with no timer, a player can look up answers. We accept it: boards carry no prizes, it costs far more time than the game is worth, and the `slow`/`fast` anomaly flags (§11.5) let us observe it.

### 5.3 随便比比 (free play)

- Seed = random uint32 on the client; deck from `buildFreeDeck` (§4.5) with the chosen category; judged on the client by `core/judge.js`; **works offline**.
- Unlimited runs. One rewarded 再答一次 per run (§5.5). Never on boards.
- Each finished free run is submitted best-effort to `submitRun` (analytics, calibration data, and the base for a challenge). The server rebuilds the deck from `(seed, contentVersion, configVersion, group)` and replays the answers; the **server streak** is authoritative for any challenge.

### 5.4 Challenges

- **Create:** 发起挑战 on any result → `createChallenge({runId})` (daily run: the `run_progress` id; free run: the submitted run). The server validates the run and returns an 8-character id (deterministic per run, so repeats return the same id). The card query carries `c=<id>` only.
- **Recipient** opens the card → challenge entry (§6.8) → `getChallenge(c)` returns the owner's 连对, the deck kind, the issue and theme (daily) or category (free), and the counting rule. **Never** the owner's answers or any fact.
- **Daily-deck challenge (today's deck):** if the recipient has not started today's daily, accepting **is** their ranked daily attempt (stated on the entry screen) and runs server-stepped (§5.2). If they already played today, it is a **friendly** on the same deck, still server-stepped (`run_progress` `_id = <openid>_<clientRunId>`), never ranked.
- **Daily-deck challenge on a past date:** friendly, server-stepped. (Once a day's window has closed, its deck is public in history anyway.)
- **Free-seed challenge:** friendly, played on the client from the challenge's seed, category and contentVersion (all returned by `getChallenge`), validated by `submitRun`. **Both sides get the same one-life rule** (§5.5): the owner's score includes any 再答一次 they used, and the recipient may use one too. The entry screen says "规则相同：每局可看视频再答一次".
- **During the run:** when the recipient's streak passes the owner's, a quiet inline line "已超过 TA 的 14 ✓" appears once (no sound, no pop-up).
- **Comparison** on the result: "你 16 · TA 14 · 同一套题". Nothing else from the owner's run is shown.
- **Expiry:** 7 days. Own challenge: read-only owner view with answer count and best answer.
- **Opt-in notice** "好友接受了你的挑战" (reuse of 点将台 §8.13, §6.18 here).

### 5.5 再答一次 (rewarded continue)

- **Only in free runs** (including free-seed challenge runs), **once per run**, offered right after the first miss: sheet "再答一次？看完一段视频，接着往下答" [▶ 视频 · 再答一次] [看结果]. Never auto-plays; the sheet is dismissible.
- **Effect:** the miss is forgiven; the missed question does not count; the run continues with the next question (the missed bottom card becomes the top card, as after a correct answer). The result shows "连对 18（含再答一次）".
- Granted only when the video closes with `isEnded === true`; closing early grants nothing ("完整观看才能继续") and the run ends.
- **No-fill / load error:** grant once per run with "暂无广告，本次免费" (reuse of the 点将台 rule; the only placement it can apply to is this one, which affects nothing ranked).
- **Never** on any daily-deck run (ranked or friendly): ads must not change anything comparable on boards (PO-11).

---

## 6. Screens and flows

### 6.1 Layout rules (reuse)

- Content starts below the capsule: `navBottom = capsule.bottom + (capsule.top − statusBarHeight)`. Nothing drawn or tappable in the capsule row on the right. In-game back is "‹ 返回" at top-left.
- Primary actions in the bottom 40% (thumb zone), above the safe-area inset. The two answer buttons are each ≥ 56 pt tall and ≥ 40% of the width, with ≥ 16 pt between them.
- Touch targets ≥ 48 × 48 pt; body text ≥ 16 pt; revealed value ≥ 40 pt; streak number on the result ≥ 56 pt.
- Every network-backed area has loading / empty / error states; errors offer 重试; free play is always available.
- Design width 375; works from 320 to 430 width and 568 to 932 height.

### 6.2 Home

```
┌───────────────────────────────────┐
│ 9:41                    [ ··· ◎ ] │ ← capsule row: nothing on the right
│                                   │
│              〔比〕                 │ ← seal mark
│             比 一 比                │
│      看上面的数，猜下面更多还是更少     │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ 今日一比 · 第 12 期 · 山河     │  │
│  │ 全国同一套题，每天一次          │  │
│  │ 连续 5 天                     │  │ ← day streak, only when ≥ 2
│  │      [    开  始    ]        │  │ ← primary
│  └─────────────────────────────┘  │
│                                   │
│   [  随便比比 · 不限次  ]  [全部 ▾] │ ← secondary + category chip (§6.14)
│                                   │
│ [ 群榜 ] [ 好友榜 ] [ 往期 ] [ 玩法 ] │
│   声音 开/关                设置    │
└───────────────────────────────────┘
```

| State | Daily card shows |
|---|---|
| Loading | skeleton, "正在取今日题目…"; 随便比比 enabled |
| Available | 开始 |
| In progress | "已连对 7 · 第 8 题" + 继续 |
| Done | "今日连对 14 · 超过 82% 的玩家" (rarity only at ≥ 30 results) + 查看结果; subline "明日 0:00 换新题" |
| Finalized by window | as Done, with "（未答完，按当时连对记入）" once |
| Error / offline / `DAILY_UNAVAILABLE` | "今日一比需联网" + 重试; 随便比比 still enabled |

- **First launch:** no login, no consent screen, no permission prompt. The 玩法 sheet (§6.13) opens once.
- **From a group card:** banner "来自群聊 · 查看本群今日排行" after a successful `joinGroup` (reuse).
- **Best scores line** (small, under the daily card when available): "随便比比最佳 23". Local + server `player_stats.bestFree`.

### 6.3 Play (question screen)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 今日一比 · 第12期 · 山河    连对 7    │ ← header: mode, issue, theme; streak right
│ ┌───────────────────────────────┐ │
│ │ (river icon) 长江               │ │ ← top card (known)
│ │ 全长                           │ │
│ │        6,300 公里              │ │
│ │ 来源：水利部 · 2013  数据有误？   │ │ ← report link only after its own reveal
│ └───────────────────────────────┘ │
│               〔比〕                │
│ ┌───────────────────────────────┐ │
│ │ (river icon) 黄河               │ │ ← bottom card (unknown)
│ │ 全长                           │ │
│ │          ？ 公里                │ │
│ └───────────────────────────────┘ │
│       黄河 比 长江 ……               │
│  [    更长 ▲    ]  [    更短 ▼    ] │ ← thumb zone
└───────────────────────────────────┘
```

Flow inside a question:
1. **Awaiting answer:** both buttons enabled. Year measure: the bottom card's sub-label shows the fact's kind (始建/建成/成书/问世) and the buttons read [更晚] [更早].
2. **Answer sent:** both buttons lock (the chosen one shows pressed); the bottom card starts turning. Daily: waiting for `answer`. Free: judged locally.
3. **Reveal:** value counts up (≤ 0.6 s, tap skips); ✓ 对 (teal) or ✗ 错 (vermilion) with text; the source line and "数据有误？" appear under the revealed value.
4. **Correct:** after 0.6 s (tap to continue sooner) the bottom card slides up; new bottom card. Header 连对 +1.
5. **Segment change:** a one-line banner "下一组：比海拔" (0.8 s) and two fresh cards.
6. **Miss:** card shake (no flashing), soft sound, light vibration if sound is on; both values stay visible for 1.2 s; then (free run, life unused) the 再答一次 sheet, else the result.

| State | Behaviour |
|---|---|
| Daily: first question loading | card skeletons, "正在出题…" |
| Daily: waiting for `answer` | card mid-turn with a subtle shimmer; buttons locked |
| Daily: no response > 5 s / offline | "网络不太好" + [重试] on the card; the tap is kept and re-sent; 返回 works |
| Daily: `WINDOW_CLOSED` | toast "今日一比已结束，按当前连对记入" → result |
| Resume (daily or free) | same question, same cards, same streak |
| Free: category with few facts | nothing visible (generator handles it) |
| Challenge run passes owner's score | inline line "已超过 TA 的 14 ✓" under the header, once |
| 返回 mid-run | daily: "进度会保留，可稍后继续" (no forfeit); free: "结束本局？" [结束] [继续答] |
| App backgrounded | state saved after every answer; resume restores it |
| Rapid double tap | first tap wins; buttons locked until the next question (300 ms debounce) |
| 全部答对 (40 / 60) | a calm stamp "全部答对" → result |

First run ever: one coach bubble on the buttons, "下面这张比上面多还是少？点一下" (skippable, once).

### 6.4 再答一次 sheet (free runs only)

```
┌───────────────────────────────────┐
│  差一点！ 黄河 5,464 公里 · 长江 6,300 │
│  再答一次？看完一段视频，接着往下答      │
│  [ ▶ 视频 · 再答一次 ]                │
│  [ 看结果 ]                          │ ← ≥ 24 pt from the ad button
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Ad loading | button shows "视频加载中…"; 看结果 stays enabled |
| Completed (`isEnded`) | run continues with the next question; "（含再答一次）" flag set |
| Closed early | toast "完整观看才能继续" → result |
| No fill / error, first time this run | grant, toast "暂无广告，本次免费" |
| Life already used | sheet not shown |
| Daily-deck run | sheet never shown |

### 6.5 Result

```
┌───────────────────────────────────┐
│ ‹ 首页                   [ ··· ◎ ] │
│ 今日一比 · 第 12 期 · 山河            │
│             连对                    │
│              14                    │ ← ≥ 56 pt
│   超过今日 82% 的玩家 · 连续 5 天      │ ← rarity at ≥ 30 results; day streak ≥ 2
│ ┌ 倒在第 15 题 ─────────────────┐   │
│ │ 黄河 5,464 公里 ✗ 你选：更长     │   │
│ │ 长江 6,300 公里                │   │
│ │ 来源：… · 2013   数据有误？      │   │
│ └──────────────────────────────┘   │
│ [ 分享 ]  [ 发起挑战 ]  [ 保存图片 ]   │
│ [ 本局题目 ]  [ 看群榜/好友榜 ]        │
│        [   再来一局（随便比比）  ]     │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Daily: finalizing | "正在记分…" ≤ 5 s, then offline state |
| Daily: offline at the final answer | the last `answer` is retried on 重试, `onShow` and launch; result shows when the server answers |
| 全部答对 | "全部答对 40 题" stamp instead of the miss block |
| Free run with 再答一次 used | "连对 18（含再答一次）" |
| Challenge run | comparison block "你 16 · TA 14 · 同一套题"; friendly runs labelled "友谊赛，不计入榜单" |
| Comment line | one of a fixed list keyed by streak band (e.g. 0-2 "热身一下，再来！", 3-7 "不错的开局", 8-14 "有点东西", 15-24 "活地图本图", 25+ "这都知道？！"), about the player, never about places |
| 本局题目 | sheet listing every answered pair: labels, both values, ✓/✗, source, "数据有误？" per fact. Daily: answered questions only |
| First ranked result: privacy popup may appear for the board marker (reuse [DJT] §8.3) | refusal: small line "未同意隐私指引，好友暂看不到你的成绩" |
| Save image / subscribe offer | §6.17, §6.18 |

再来一局 always starts a **free** run (same category as the last free run). The interstitial rule (§9) applies to it.

### 6.6 Report sheet

```
┌───────────────────────────────────┐
│ 这条数据有问题？                     │
│ 黄河 · 全长 · 5,464 公里             │
│ 来源：… · 2013                      │
│ [数值不对] [单位不对] [名称不对]        │
│ [来源对不上] [措辞不妥] [其他]          │
│ [ 提交 ]                 [ 取消 ]    │
└───────────────────────────────────┘
```

States: idle (提交 disabled until ≥ 1 chip), sending, sent (toast "已收到，谢谢！我们会核对"), already reported (chips pre-selected, button reads 更新), offline (toast "网络不太好，稍后再试"; nothing queued), rate-limited (same thanks toast; nothing stored). Never blocks play.

### 6.7 Share card (canvas, 5:4, 500 × 400; reuse)

Daily card (**no fact names or values**: everyone still has to play the same deck):
```
┌──────────────────────────────┐
│ 比一比 · 今日一比 第12期 · 山河   │
│           连对 14              │
│  ✓✓✓✓✓✓✓✓✓✓✓✓✓✓✗              │ ← one mark per answered question
│  超过今日 82% 的玩家             │ ← only at ≥ 30 results
│    同一套题，你能比我多吗？        │
└──────────────────────────────┘
```
Free card: the same frame with the missed pair as the hook ("黄河 vs 长江 · 全长 · 我选错了"), no values (curiosity, and not a spoiler since free decks are unique).

Share titles: daily "今日一比我连对 14 个，你能比我多吗？"; free "黄河和长江谁更长？我栽在这题了"; challenge "同一套题，我连对 14，你来试试？". No fake system text, no exaggeration, no "@所有人". [COMPLIANCE]
Render failure: static fallback image from the main package + text title.

### 6.8 Challenge entry

```
┌───────────────────────────────────┐
│                          [ ··· ◎ ] │
│              〔比〕                 │
│        好友向你发起了挑战             │
│      同一套题，TA 连对 14 个          │
│  (today's deck, unplayed:)          │
│   本局将作为你的今日一比，计入群榜      │
│         [   接受挑战   ]            │
│         [  先去首页看看  ]           │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Loading | "展开挑战…" skeleton |
| Expired (> 7 days) / not found | "这个挑战已经过期了" + 今日一比 / 随便比比 |
| Own challenge | "这是你发起的挑战" + answer count + best answer; subscribe offer if available (§6.18) |
| Counts as today's daily | the line above; 接受挑战 starts the server-stepped attempt |
| Daily already played today | "你已完成今日一比，本局为友谊赛，不计入榜单" |
| Past daily deck | "往期题目 · 友谊赛" |
| Free seed | "随便比比 · 分类：山河 · 规则相同：每局可看视频再答一次" |
| Already answered | straight to the comparison view |
| Retired content version | "这个挑战的题库已更新，无法再玩" + 随便比比 |
| Offline | "挑战需联网展开" + 重试 + 随便比比 |

The owner's nickname is never shown (we collect none).

### 6.9 Group board (群榜) (reuse of [DJT] §8.6, §11)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 本群 · 今日一比 第12期 · 山河         │
│ ┌───────────────────────────────┐ │
│ │ 1 (头像) 张三   连对 21  连续5天  │ │ ← open data domain; server values
│ │ 2 (头像) 李四   连对 14          │ │
│ │ 2 (头像) 你     连对 14          │ │ ← ties share a rank
│ │ ─ 未验证 ─                      │ │
│ │ - (头像) 王五   连对 40 未验证    │ │
│ └───────────────────────────────┘ │
│ 已参加 7 人 · 成绩经服务器校验         │
│  [ 分享到本群 ] (voluntary)          │
│ ┌ banner (config, default off) ┐    │ ← ready/empty only, ≥ 24 pt gap
└───────────────────────────────────┘
```

States (all reuse): no group context (explainer "在群聊里点开本游戏的分享卡片，就能看到本群排行" + optional share, no reward), checking group, group check failed, loading, ready, empty ("本群今天还没有人参加" + 去答题), you haven't played (your row "未参加"), server unavailable ("群榜暂时打不开" + 重试; never falls back to self-reported ranks), privacy not agreed, friend scope not authorized (each with the player's own server result as a plain line and the [查看指引]/[同意并查看]/[去设置开启] actions from [DJT] §8.6). Rows show no answers or facts, so there is no spoiler lock to apply.

### 6.10 Friend board (好友榜)

As §6.9, titled "好友 · 今日一比", with the same states plus the `selfOnly` over-cap state ("今日参加人数较多，好友成绩暂未校验"; friends' rows "好友自报" without rank numbers) (reuse [DJT] §8.7, §11.5).

### 6.11 History (往期) and issue detail

List: the last **30** published issues, newest first ("第11期 10月14日 · 山河 · 连对 9 ›", "未参加 ›", today "进行中" or "今日连对 14"). Header "最长连续 12 天 · 今日一比最佳 23". States: loading, ready, empty ("还没有往期" on launch day), error/offline ("往期需联网查看" + 重试).

Issue detail:
```
┌───────────────────────────────────┐
│ ‹ 往期                   [ ··· ◎ ] │
│ 第11期 · 10月14日 · 山河              │
│ 你的成绩  连对 9（倒在第 10 题）       │
│ 本期 2,315 人参加                    │
│ 0-4 ▍ 5-9 ▊ 10-14 ▌ 15-19 ▎ 20+ ▏   │ ← from daily_stats, only at ≥ 30
│ ── 本期题目 ──                        │ ← only after D+1 00:30 BJT
│ 1 长江 6,300 → 黄河 5,464  更短 ✓     │
│ 2 …                                │ ← each row: values, source, 数据有误？
│ 勘误：第 17 题 … 已更正为 …           │ ← only if errata exist
└───────────────────────────────────┘
```
- For today and for any date whose window is still open: "今日一比结束后公布题目".
- No replay of past dailies from history in v1 (a past-deck challenge is the only way, §5.4). No share button here.

### 6.12 设置, 数据来源, privacy (reuse + new)

- **设置:** sound on/off (vibration follows sound), 显示: 大字模式 / 高对比度 (§6.19), 数据来源, 用户隐私保护指引 (`wx.openPrivacyContract`), privacy/friend-data status line (passive, [DJT] §8.1), 联系我们/反馈 (`wx.createFeedbackButton`).
- **数据来源 page:** one line per publisher with the attribution text and URL as plain text (no clipboard, no web view): "人口数据来源：国家统计局网站及各省（区、市）统计局，第七次全国人口普查公报（https://www.stats.gov.cn）", "地理数据：自然资源部、水利部公布数据", "天文数据：NASA", "食物热量：USDA FoodData Central (CC0)", "城市坐标：GeoNames (CC BY 4.0)，距离为本游戏计算的直线距离", "文物年代与高度：国家文物局及各文物保护单位公布资料", "其他：各条目注明的出版物". Plus "每条数据均标注来源与年份；如发现错误，请在答题后点「数据有误？」". States: static (bundled), so no loading state.
- **Fact source sheet** (tap a source line): label, value, measure, year, publisher, source title, URL (plain text), retrieved date, and "数据有误？".

### 6.13 玩法 sheet

Three lines plus a small drawing of the two cards: "1. 上面的卡片告诉你数字。 2. 猜下面那张比它更多还是更少。 3. 连对越多越厉害，错一次就结束。今日一比全国同一套题，每天一次。" Auto-opens once on first launch; reachable via 玩法.

### 6.14 Category picker (free play)

Chip "全部 ▾" next to 随便比比 opens a sheet: 全部 · 城市 · 山河 · 古今 · 动物 · 天文 · 工程 · 吃喝 · 距离. Saved locally; used by 再来一局. One tap selects and closes.

### 6.15 Navigation map

```
            ┌──────── card (group/single) ────────┐
            ▼                                      ▼
 launch → Home ──开始──→ Play (daily) ──end──→ Result ─┬─分享→ native share sheet
            │                                ▲        ├─发起挑战→ share sheet → (提醒我 → subscribe prompt)
            ├─随便比比──→ Play (free) ──miss──┤        ├─保存图片→ (album permission) → album
            │                  └→ 再答一次 sheet ┘        ├─本局题目 → list → 数据有误？→ report sheet
            ├─群榜 / 好友榜 (+banner?)                    ├─群榜/好友榜
            ├─往期 → History list → Issue detail          └─再来一局 → (interstitial?) → Play (free)
            ├─玩法 / 设置 (数据来源, privacy, 显示)
            └─全部 ▾ → category picker
 challenge card → Challenge entry ──接受挑战──→ Play (challenge) → Result (+comparison)
 subscribe notice → launch with c=<id> → Challenge entry (own)
```

### 6.16 Day streak and bests (reuse of [DJT] §8.9)

- **连续 N 天:** consecutive **published** daily dates with a ranked result, ending today or yesterday. Unpublished dates (`DAILY_UNAVAILABLE`) are skipped. Grace-window results count for D. Server-computed (`player_stats`).
- Shown on home, the daily result (N ≥ 2), board rows ("连续N天"), history header.
- **Bests:** 今日一比最佳 (best ranked daily streak ever) and 随便比比最佳 (best server-validated free streak, including 再答一次). Display only.
- **No rewards of any kind, no streak freeze or repair, no reminders or notifications about streaks**, no "别断了" copy. [COMPLIANCE]

### 6.17 Save card to album (reuse of [DJT] §8.12) [COMPLIANCE]

保存图片 on the result only, on tap. Renders the §6.7 card at 1000 × 800 with "微信小游戏 · 比一比" at the bottom, then `wx.saveImageToPhotosAlbum` (privacy interface 相册（仅写入）). Success toast "已保存到相册"; refusal → sheet "保存图片需要相册权限" [去设置] [取消], no automatic re-ask. Grants nothing.

### 6.18 Subscribe message "好友接受了你的挑战" (reuse of [DJT] §8.13) [COMPLIANCE] [SPIKE]

Only when `app_config.subscribe.tmplId` exists. Offered only on the result after 发起挑战 created a challenge, and on the own-challenge screen, on the user's tap: "好友接受挑战时提醒我" [提醒我] → `wx.requestSubscribeMessage`. One grant per challenge; one message on the first answer by someone else, with the answerer's 连对, the owner's 连对 and the time; no names. Opens the game at `c=<id>`. Refusal hides the offer for that challenge; `ban`/20004 hides it on this device. No reward.

### 6.19 Display modes (reuse of [DJT] §8.10)

大字模式: body ≥ 20 pt, secondary ≥ 18 pt, revealed value ≥ 48 pt, buttons ≥ 64 pt tall, cards grow and the source line wraps; content scrolls at 320 × 568. 高对比度: white background, pure ink text, darker category set with white text, ✓/✗ with 2 pt outlines; text ≥ 7:1, non-text ≥ 3:1. Default mode body text ≥ 4.5:1. Neither changes share or saved cards. Saved on device; applied without restart.

---

## 7. Share flows [COMPLIANCE: 诱导分享] (reuse of [DJT] §9)

- Every share starts with an explicit tap (`wx.shareAppMessage`) or the capsule menu (`wx.showShareMenu({menus:['shareAppMessage']})` + `wx.onShareAppMessage`, registered at startup).
- **No share ever grants anything:** no 再答一次, no attempts, no ranks, no content. The UI never depends on whether a share succeeded.
- `withShareTicket` enabled via `wx.updateShareMenu({withShareTicket:true})`; never `isUpdatableMessage:false` in the same call ([P0] §4).
- Result share query: `s=r&m=<daily|free>&d=<date>`. Challenge query: `c=<id>` only.
- **Group detection:** `wx.getEnterOptionsSync()` → shareTicket → `wx.getGroupEnterInfo` → `joinGroup` with `wx.cloud.CloudID` → opaque `groupRef` (reuse of [DJT] §9.2, including the `groupid` fallback). `wx.getShareInfo` is never called.
- **Entry routing** (reuse of [DJT] §9.4): `c=<id>` → challenge entry; `s=r` with ticket → `joinGroup` then home with the group banner; malformed → home; `wxad_fallback_share=1` → home, grants nothing. A warm start never interrupts a run: it waits until home and shows a toast "你有一个新挑战".
- If `createChallenge` fails: fall back to a plain result share with "挑战未能生成，已改为分享成绩".

---

## 8. Leaderboards (reuse of [DJT] §11, C3)

Ranks on every board come **only from our server**. WeChat user cloud storage is a display marker, never trusted.

- **KV marker:** after a ranked daily result, the main domain writes `d_<YYYYMMDD> = {"n":14}` (privacy interface 微信朋友关系; first write may show the official privacy popup; refusal → `markerPending`, retried only after a later agreement). Keys older than 7 days are removed. Free results are never written.
- **`getBoard({kind, dateKey, groupRef?})`** returns `{dateKey, issueNo, theme, contentVersion, salt, selfHash, mode, rows:[[h, n, s, k?], …]}`:
  - `h = hex(sha256(openid + "|" + salt)).slice(0,12)`, `salt` = the per-day `daily_decks.boardSalt`.
  - `n` = server 连对; `s` = run end time in seconds after 00:00 BJT; `k` = day streak when ≥ 2.
  - No answers and no facts in any row (nothing to spoil).
- **Open data domain** (copied `opendata/` with SHA-256): fetches `getGroupCloudStorage`/`getFriendCloudStorage` with `keyList:["d_<date>"]`, hashes each row's openid, matches server rows. **Ranking:** by `n` descending; **equal `n` share the same rank number** (PO-15); within a tie, earlier `s` is listed first. Unmatched rows: "未验证", no rank number, below all ranked rows. Nicknames and avatars never leave the open data domain.
- **Caps and modes:** `boardListCap` (default 3,000 rows) → above it the group board uses `mode: group` (`group_members` rows) and the friend board `selfOnly` (reuse [DJT] §11.5). 60 s function-memory cache per date.
- **Group context:** `joinGroup` upserts `group_members` (`_id = <openGId>_<openid>`) and returns `groupRef = hex(sha256(openGId + GROUP_REF_PEPPER)).slice(0,16)`; `getBoard` accepts a `groupRef` only from a member.
- **Authorization flow** (reuse [DJT] §11.6): official privacy popup on the first privacy-interface call (after a ranked result or a board tap, never at launch or during a run); `scope.WxFriendInteraction` requested only from the board-open tap; refusal leaves the whole game playable; [去设置开启] via `wx.openSetting` on tap only; no re-prompting.
- **Fallbacks** if the device pass fails C3 prerequisites (row openids, cloudID decrypt, hash speed, payload size): [DJT] §11.8 Fallback 1 (Ed25519-signed values over `openid|dateKey|n`), then Fallback 2 (B-lite "好友自报"), with the CTO's sign-off.

---

## 9. Ads (IAA only) [COMPLIANCE]

| Placement | Format | Where | Trigger | Caps |
|---|---|---|---|---|
| 再答一次 | rewarded video | free runs (incl. free-seed challenges) | tap in the §6.4 sheet after the first miss | 1 per run |
| Between runs | interstitial | free only | on 再来一局 **from a free-run result**, after the 3rd, 6th, 9th… completed free run **of the session** | not before the 4th lifetime completed run; ≥ 120 s apart; ≤ 5 per day; never in the daily, any challenge flow, a card-entry first run, a run, or a reveal |
| Board footer | banner | group and friend boards, `ready`/`empty` only | board shown | `app_config`, **default off** |

- Interstitial caps live in `app_config.ads.interstitial` with defaults in `core/config.js` (`everyNRuns 3`, `minLifetimeRuns 4`, `minGapSec 120`, `maxPerDay 5`, `enabled true`), clamped (`everyNRuns ≥ 2`, `minLifetimeRuns ≥ 2`, `minGapSec ≥ 60`, `maxPerDay ≤ 8`). Reuse of [DJT] §12.
- Rewarded: `wx.createRewardedVideoAd({adUnitId, disableFallbackSharePage: true})` (no platform share-for-reward page, [P0] §7.1); an `onLoad` with `useFallbackSharePage: true` is treated as no-fill. Reward only on `isEnded === true`. Errors 1000-1008 follow the §5.5 no-fill rule.
- Interstitial rejections 2001-2003 are skipped silently, not counted, logged as `ad_error`. An interstitial never delays 再来一局.
- Banner: `adIntervals: 30`, width = screen − 32 pt, ≥ 24 pt from any tappable element, hidden under sheets, destroyed when leaving the board.
- Ad buttons always show ▶ and 视频; nothing auto-plays; no ad button adjacent to a primary button.
- **Never:** ads during a question or reveal; ads on any daily-deck run; ad-gated information (no "看视频解锁解析"; notes and sources are always free, PO-12); rewards for sharing.
- **Stub mode** (QA only; production `adMode` real): until 流量主 units exist, rewarded and interstitial behave as no-fill (rewarded → the §5.5 grant), banner off. Reuse.

---

## 10. Client view models

All strings are pre-formatted by logic (`js/vm.js`), never by the renderer. `?` = optional.

```ts
// Shared
type Display = { largeText:boolean, highContrast:boolean, scale:1|1.25, palette:'standard'|'highContrast' }
type Features = { subscribe:{tmplId:string}|null,
                  banner:{enabled:boolean, adUnitId:string|null},
                  interstitial:{enabled:boolean, everyNRuns:number, minLifetimeRuns:number, minGapSec:number, maxPerDay:number} }
type CardFace = { factId:string, label:string, subLabel:string /* '全长' or per-fact sub */, icon:string /* category icon key */,
                  accent:string, valueText:string|null /* '6,300' ; null when hidden */, unitText:string /* '公里' */,
                  approx:boolean, sourceText:string|null /* '来源：水利部 · 2013' ; null when hidden */,
                  canReport:boolean /* true only after this card's value is revealed */ }

// Home
{ daily:{ state:'loading'|'available'|'inProgress'|'done'|'error'|'offline',
          issueNo:number, dateKey:string, themeLabel:string /* '山河' */,
          progressText?:string /* '已连对 7 · 第 8 题' */, streak?:number,
          rarityText?:string|null, finalizedByWindow?:boolean,
          dayStreak:{ current:number, text:string|null /* '连续 5 天' when ≥ 2 */ } },
  free:{ categoryKey:string, categoryLabel:string, bestText:string|null /* '随便比比最佳 23' */ },
  hasGroupContext:boolean, muted:boolean, showHowToOnce:boolean,
  settings:{ friendBoardEnabled:boolean } }

// Play
{ mode:'daily'|'free'|'challenge', ranked:boolean, friendly:boolean,
  headerText:string /* '今日一比 · 第12期 · 山河' */, streak:number, k:number, deckLength:40|60,
  phase:'loading'|'awaitAnswer'|'sending'|'revealing'|'correct'|'miss'|'segmentChange'|'cleared'|'netError',
  top:CardFace, bottom:CardFace,
  promptText:string /* '黄河 比 长江 ……' */,
  buttons:{ hi:{label:string /* '更长' */, enabled:boolean}, lo:{label:string, enabled:boolean} },
  chosen:'hi'|'lo'|null, correct:boolean|null,
  segmentBanner:string|null /* '下一组：比海拔' */,
  challenge?:{ ownerStreak:number, passedText:string|null /* '已超过 TA 的 14 ✓' */ },
  lifeUsed:boolean, coachMark:boolean }

// 再答一次 sheet
{ visible:boolean, missText:string /* '差一点！黄河 5,464 公里 · 长江 6,300 公里' */,
  adState:'idle'|'loading'|'playing'|'error', canOffer:boolean }

// Result
{ mode, ranked:boolean, friendly:boolean, status:'finalizing'|'pendingNetwork'|'done'|'error',
  headerText:string, streak:number, streakText:string /* '14' or '18（含再答一次）' */,
  cleared:boolean, commentText:string, rarityText:string|null,
  dayStreakText:string|null,
  miss:{ k:number, top:CardFace, bottom:CardFace, chosenLabel:string /* '你选：更长' */ }|null,
  questions:[{ k:number, top:CardFace, bottom:CardFace, correct:boolean }],   // 本局题目 (answered only)
  challenge?:{ ownerStreak:number, compareText:string /* '你 16 · TA 14 · 同一套题' */ },
  saveImage:{ state:'idle'|'rendering'|'saving'|'saved'|'denied'|'error' },
  subscribe:{ state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable', challengeId:string|null },
  privacyNote:string|null, interstitialDue:boolean }

// Report sheet
{ factId:string, title:string, card:CardFace,
  reasons:[{key:'value'|'unit'|'name'|'source'|'wording'|'other', label:string, selected:boolean}],
  state:'idle'|'sending'|'sent'|'offline', alreadyReported:boolean }

// Challenge entry
{ status:'loading'|'ready'|'expired'|'own'|'answered'|'retired'|'offline'|'error',
  ownerStreak:number, kind:'daily'|'free', issueText?:string, categoryLabel?:string,
  countsAsDaily:boolean, isFriendly:boolean, rulesText:string|null,
  answerCount?:number, bestAnswer?:number,
  subscribe?:{ state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable' } }

// Group context (memory only; reuse)
{ status:'none'|'checking'|'ok'|'failed', groupRef:string|null, shareTicket:string|null, groupid:string|null, errCode?:number }

// Privacy status (reuse)
{ privacy:'unknown'|'agreed'|'denied', friendScope:'unknown'|'granted'|'denied', markerPending:boolean }

// Boards (main domain)
{ kind:'group'|'friend', dateKey, issueNo, themeLabel,
  state:'noGroup'|'checkingGroup'|'loading'|'ready'|'empty'|'serverError'|'privacyDenied'|'unauthorized',
  mode:'full'|'group'|'selfOnly'|null, self:{ streak:number|null },
  actions:{ canOpenSetting:boolean, canRetryPrivacy:boolean, canShareToGroup:boolean },
  banner:{ show:boolean, reservedHeight:number } }
// postMessage to the open data domain
{ type:'render', kind, dateKey, issueNo, shareTicket?, groupid?, salt, selfHash, mode,
  rows:Array<[h:string, n:number, s:number, k?:number]>, showUnverified:boolean, width, height }

// History list
{ state:'loading'|'ready'|'empty'|'error'|'offline', headerText:string|null,
  items:[{ dateKey, issueNo, dateText, themeLabel, mineText:string /* '连对 9' | '未参加' */, isToday:boolean, statusText:string|null }] }

// Issue detail
{ state:'loading'|'ready'|'error'|'offline', dateKey, issueNo, themeLabel,
  mine:{ streak:number, missK:number|null }|null,
  stats:{ totalText:string, buckets:[{label:string, shareText:string}] }|null,   // null below 30
  deck:[{ k, top:CardFace, bottom:CardFace, answerLabel:string /* correct direction, e.g. '更短' */,
          mine:'correct'|'miss'|'unanswered'|null }]|null,                         // null while locked
  deckLockedText:'今日一比结束后公布题目'|null,
  errata:[{ k:number, text:string }] }

// Settings / sources
{ muted, largeText, highContrast, privacy, friendScope, album:'unknown'|'granted'|'denied' }
{ sources:[{ publisher:string, attribution:string, url:string|null }] }
// Category picker
{ selected:string, options:[{ key:string, label:string, factCount:number }] }
```

---

## 11. Backend (WeChat Cloud Development; reuse of [DJT] §14)

Identity always from `cloud.getWXContext().OPENID`. No user-info calls, no AppSecret, no `session_key`. All collections deny direct client reads and writes; access only via cloud functions. Every function sets `TZ=Asia/Shanghai` and an explicit timeout; date keys via `core/date.js`. Uniqueness by deterministic `_id` + `add`, never console unique indexes; multi-document writes in `db.runTransaction`; counters with `inc`. Every function returns `{ok:true,…}` or `{ok:false, code, message}`.

Layout (copied pattern): `apps/bibiyi/cloudfunctions/{common/, <fn>/, scripts/sync-core.js, database/rules.json, tests/}`; `npm run sync` copies `common/` and `apps/bibiyi/game/core/` into each function; `npm run check` is the drift check.

### 11.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| `daily_decks` | `_id: YYYYMMDD`, `issueNo`, `theme`, `seed`, `contentVersion`, `configVersion`, `gateVersion`, `questions[40]: {a, b}` (fact ids), `gates: {median, p20, p40, pass}`, `attempts`, `genMs`, `boardSalt`, `createdAt` | created by `genDaily` / lazy `getDaily` with `add` of the fixed `_id`. Never returned to clients except one question at a time and, after the window, via `getHistory` |
| `run_progress` | `_id`: ranked `<dateKey>_<openid>`, friendly `<openid>_<clientRunId>`; `openid`, `clientRunId`, `kind: daily/challengeDaily/dailyFriendly`, `dateKey`, `challengeId?`, `ranked`, `k` (current question), `streak`, `status: open/ended`, `endReason?: miss/cleared/window`, `answers: [{k, c, ok, ms, at}]`, `startedAt`, `lastAt`, `endedAt?`, `contentVersion` | server-stepped daily-deck runs (§5.2). The deterministic ranked `_id` enforces one attempt |
| `runs` | `_id: <openid>_<clientRunId>`, `seed`, `group`, `contentVersion`, `configVersion`, `answers: [{k, c, ms}]`, `lifeAtK?`, `serverStreak`, `clientStreak?`, `mismatch`, `challengeId?`, `submittedAt` | free runs (validated replays) |
| `daily_results` | `_id: <dateKey>_<openid>`, `dateKey`, `openid`, `n`, `endS` (seconds after 00:00 BJT), `dayStreak`, `endReason`, `contentVersion` | the one ranked result; written in the finalize transaction; source of `getBoard`. Index `dateKey` |
| `daily_stats` | `_id: YYYYMMDD`, `hist[41]`, `total` | `inc` in the finalize transaction |
| `player_stats` | `_id: <openid>`, `curDays`, `bestDays`, `lastDailyDate`, `totalDailies`, `bestDaily`, `bestFree`, `flags7d`, `suspect`, `updatedAt` | day streaks and bests (reuse) |
| `group_members` | `_id: <openGId>_<openid>`, `groupRef`, `firstSeen`, `lastSeen` | reuse |
| `challenges` | `_id: <8-char id>`, `ownerOpenid`, `kind: daily/free`, `dateKey?`, `seed?`, `group?`, `contentVersion`, `configVersion`, `ownerStreak`, `ownerLifeUsed`, `createdAt`, `expiresAt (+7d)`, `answerCount`, `bestAnswer` | id derived from the run id (keyed hash, `GROUP_REF_PEPPER`), so repeats return the same id |
| `sub_grants` | `_id: <challengeId>`, `ownerOpenid`, `tmplId`, `grantedAt`, `used`, `sentAt?`, `sendErrCode?` | reuse |
| `fact_reports` | `_id: <factId>_<openid>`, `factId`, `reasons[]`, `where`, `dateKey?`, `contentVersion`, `ts`, `status: new/confirmed/rejected/source-updated` | §3.8. Index `factId + ts` |
| `fact_overrides` | `_id: 'live'`, `suspended: [{factId, auto, since}]`, `errata: {<dateKey>: [{k, factId, text}]}`, `updatedAt` | ops-edited in the console plus auto-suspend writes; read by `genDaily` and `getHistory` |
| `answer_stats` | `_id: <measure>_<bucket>`, `n`, `correct`, `updatedAt` | nightly roll-up for calibration (§4.4) |
| `anomalies` | `_id: <openid>_<runId>_<kind>`, `kind: fast/slow/order/mismatch`, `detail`, `dateKey`, `ts` | observe-only (§11.5) |
| `app_config` | `_id: 'live'`, `subscribe {tmplId, fields}`, `ads {banner, interstitial}` | reuse |
| `events` | `openid`, `sessionId` (top-level), `name`, `props`, `ts`, `clientTs` | reuse |
| `rate_limits`, `meta` | as in 点将台 | reuse |

### 11.2 Cloud functions

| Function | In | Out | Notes |
|---|---|---|---|
| `getDaily` | `{}` | `{dateKey, issueNo, theme, serverNow, myStatus: none/open/done, myRun?: {k, streak}, myResult?: {n, endReason, rarity}, myDays: {current, best}, bests, features}` | lazy deck creation if the timer missed; finalizes the caller's expired open run (window). **No questions.** Timeout 10 s |
| `genDaily` (timer `0 0 23 * * * *`) | | | builds tomorrow's deck from the daily pool minus the repeat window and `fact_overrides.suspended`; gate loop ≤ 500 candidates; idempotent fixed `_id`; on failure `DAILY_UNAVAILABLE`, `[ALERT]`, `daily_gen {failed:true}`. Timeout 60 s |
| `startRun` | `{mode: daily/challenge, clientRunId, dateKey?, challengeId?}` | `{ok, resumed, kind, ranked, k, streak, question, answered: [...]}` | creates `run_progress` (`add` of the deterministic `_id`); ranked if today's deck and no ranked run exists (incl. a challenge on today's deck). Resume returns the open question and the answered pairs. Free-seed challenges don't call it. Timeout 5 s |
| **`answer`** (new) | `{clientRunId, k, choice: 'hi'/'lo', ms}` | `{ok, k, correct, reveal: {value, valueText, unitText, approx, sourceText, note?}, streak, ended, next?: question, result?: {n, endReason, rarity, dayStreak, bestDaily}}` | §5.2. Idempotent per `k`; `INVALID_ORDER` for a wrong `k`; `WINDOW_CLOSED` after D+1 00:30 (finalizes); finalize transaction on the end. Writes `fast`/`slow`/`order` flags. Timeout 5 s |
| `submitRun` | `{clientRunId, seed, group, contentVersion, configVersion, answers[], lifeAtK?, clientStreak?, challengeId?}` | `{ok, streak, mismatch, challengeCompare?}` | free runs only: rebuild deck, replay, at most one life, server streak authoritative; updates `bestFree`; challenge answers update `answerCount`/`bestAnswer` and send the subscribe grant (best-effort ≤ 2 s). Idempotent per `clientRunId`. Timeout 10 s |
| `createChallenge` | `{runId}` | `{challengeId}` | own, ended/validated run only; deterministic id. Timeout 5 s |
| `getChallenge` | `{challengeId}` | entry model + (free) `seed`, `group`, `contentVersion`, `configVersion` | never answers or facts. Daily kind: `countsAsDaily` computed for the caller. Timeout 5 s |
| `subscribeChallenge` | `{challengeId}` | `{ok, granted}` | reuse (owner only; `NO_TEMPLATE`, `NOT_OWNER`) |
| `joinGroup` | `{groupData: CloudID}` | `{ok, groupRef}` | reuse [SPIKE] |
| `getBoard` | `{kind, dateKey, groupRef?}` | §8 payload | reuse; rows `[h, n, s, k?]` |
| `getHistory` | `{dateKey?}` | list: `{items, bestDays, bestDaily}`; detail: `{issue, mine, stats?, deck?, errata}` | `deck` only when now > D+1 00:30 BJT; `stats` only at ≥ 30. Timeout 5 s |
| **`reportFact`** (new) | `{factId, reasons[], where, dateKey?, runId?}` | `{ok}` | §3.8; validates `factId` exists in a live content version and reasons are from the fixed list; 20/day/openid; auto-suspend at ≥ 5 distinct reporters in 7 days. Timeout 5 s |
| `track` | `{events[]}` ≤ 50 | `{ok}` | reuse |
| `cleanup` (timer `0 0 4 * * * *`) | | | 180-day retention (all collections with personal data; `daily_stats` and `answer_stats` kept); finalizes leftover open ranked runs from closed windows; `answer_stats` roll-up; anomaly roll-up; per-fact report-rate check (> 0.3% of reveals → `[ALERT]` + `fact_report_daily` event). Idempotent |

**Question payload** (from `startRun`/`answer`): `{k, segmentStart, measure, subLabel, verbs:{hi, lo}, top:{factId, label, sub?, valueText, unitText, approx, sourceText}, bottom:{factId, label, sub?, unitText}}`. The bottom card's value, raw number, note and source are **never** present before it is answered (AC 18).

### 11.3 Server-side validation

- **`answer`:** caller owns the `run_progress`; status `open`; `k` equals the stored current `k`; `choice ∈ {hi, lo}`; inside the window. Correct iff (`b.value > a.value`) equals (`choice == 'hi'`).
- **`submitRun`:** known content/config version (last 2); deck rebuilt from inputs; answers in order with `k` 1..m; at most one `lifeAtK` and only at a miss; the run ends at the first miss without a life, the second miss, or k = 60; any extra answer → `INVALID_ACTIONS`. Server streak = correct answers (life does not add one).
- **Challenge counting:** a daily-kind challenge is ranked only via `startRun` when the caller has no ranked run for today's date and the challenge's date is today.

Error codes: `INVALID_ACTIONS`, `INVALID_ORDER`, `ALREADY_PLAYED`, `NOT_STARTED`, `WINDOW_CLOSED`, `DECK_NOT_FOUND`, `DAILY_UNAVAILABLE`, `CHALLENGE_EXPIRED`, `OWN_CHALLENGE`, `RUN_NOT_FOUND`, `UNKNOWN_FACT`, `RATE_LIMITED`, `NOT_MEMBER`, `NOT_GROUP`, `BAD_CLOUDID`, `NO_TEMPLATE`, `NOT_OWNER`, `UNAUTHENTICATED`, `FORBIDDEN`, `SERVER_CONFIG`, `INTERNAL`.

### 11.4 Environment variables (never committed)

`GROUP_REF_PEPPER` (required: `groupRef` and challenge ids), `TZ=Asia/Shanghai` (every function), `LAUNCH_DATE_KEY` (optional), `JOINGROUP_RETURN_OPENGID` (optional, spike fallback). Reuse of the 点将台 README.

### 11.5 Anomaly flags (observe-only; reuse of [DJT] §14.5)

| Kind | Written by | When |
|---|---|---|
| `fast` | `answer` | a ranked run with ≥ 10 answers whose median `ms` < 700 (config) |
| `slow` | `answer` | a ranked run with ≥ 5 answers ≥ 60 s each (possible lookups; config) |
| `order` | `answer` | `INVALID_ORDER` on a ranked run |
| `mismatch` | `submitRun` | `clientStreak` ≠ server streak |

A flag never changes any result, rank, streak or UI. ≥ 5 flags in 7 days sets `player_stats.suspect` for manual review only. The `cleanup` roll-up writes `anomaly_daily` and alerts when `mismatch` > 0.5% of free submits.

---

## 12. Analytics events (reuse of [DJT] §15)

Through `track` only (`wx.reportEvent` is never used). Each event has a top-level `sessionId` and `clientTs`; common props `isNewUser`, `contentVersion`, `appVersion`.

| Event | Props | Fires when |
|---|---|---|
| `session_start` | `scene`, `fromCard: none/result/challenge`, `hasShareTicket`, `challengeId?` | cold start or a new session |
| `card_open` | `cardKind`, `hasShareTicket`, `challengeId?`, `isNewUser` | entry with share query (once per entry) |
| `run_start` | `runId`, `mode: daily/free/challenge`, `ranked`, `source: home/replay/card/challenge`, `group?`, `theme?` | first question shown |
| `q_fetch` | `runId`, `k`, `result: ok/timeout/offline/error`, `ms` | each daily-deck `startRun`/`answer` call |
| `run_complete` | `runId`, `mode`, `ranked`, `streak`, `endReason: miss/cleared/window`, `lifeUsed`, `durationMs`, `answers` (count) | result shown |
| `run_abandon` | `runId`, `mode`, `k` | free run ended via 返回, or session ended mid-run |
| `continue_offer` / `continue_result` | `runId`; `result: completed/closedEarly/noFillGrant/declined/error` | §6.4 sheet shown / resolved |
| `fact_report` | `factId`, `reasons`, `where: reveal/result/list/history`, `result: ok/offline/rateLimited` | report submitted |
| `source_view` | `where: sheet/page` | fact source sheet or 数据来源 page opened |
| `category_select` | `group` | picker selection |
| `share_tap` | `runId?`, `kind: result/challenge/group_invite/menu`, `mode`, `streak?` | share API called |
| `challenge_created` / `challenge_answered` | `challengeId`, `kind`, `ownerStreak`, `myStreak?`, `countsAsDaily?` | |
| `board_view` | `kind`, `state`, `mode?` | board shown |
| `group_join` | `result`, `errCode?`, `scene`, `chatType?` | each `joinGroup` |
| `privacy_result`, `friend_scope_result`, `board_write` | as [DJT] §15 (`board_write.n`) | |
| `history_view`, `history_issue_view` | `items`, `state`; `dateKey`, `deckShown` | |
| `day_streak_shown` | `current`, `where` | once per session per place |
| `save_image` | `mode`, `result` | |
| `subscribe_offer` / `subscribe_result` / `subscribe_send` (server) | as [DJT] | |
| `display_setting` | `largeText`, `highContrast`, `source` | |
| `ad_request` / `ad_show` / `ad_reward` / `ad_close_early` / `ad_error`, `interstitial_show` | `placement: continue/interstitial/banner`, `stub`, `errCode?` | ad lifecycle |
| `daily_gen` (server) | `dateKey`, `attempts`, `genMs`, `median`, `p20`, `p40`, `failed?` | each generation |
| `board_list`, `anomaly_daily`, `fact_report_daily` (server) | counts | |
| `error` | `where`, `code` | handled error state shown |

**KPIs (post-launch, no gate):** share rate = runs with ≥ 1 result/challenge `share_tap` ÷ `run_complete` (healthy ≥ 8-10%, watch < 4%); card-open-to-play (≥ 25%); runs per session (≥ 3, watch < 2); D1 (≥ 35%, target 40%), D7 (≥ 15%); **report rate** = `fact_report` ÷ total reveals (server: answered questions) (< 1%); daily participation; challenge answer rate; continue acceptance and completion rates; median daily streak vs the §4.4 model.

---

## 13. Privacy data inventory (用户隐私保护指引) [COMPLIANCE]

| Data | Purpose | Source | Stored | Retention |
|---|---|---|---|---|
| OpenID | one daily attempt, runs, challenges, server-ranked boards, reports | cloud context | `run_progress`, `runs`, `daily_results`, `player_stats`, `group_members`, `challenges`, `fact_reports`, `events`, `anomalies` | 180 days, deleted by `cleanup` (PO-33) |
| Game records (answers, timings, streaks, timestamps) | scoring, validation, boards, history, difficulty calibration | gameplay | as above; aggregates in `daily_stats`, `answer_stats` | 180 days; aggregates kept (no personal data) |
| Result marker `{n}` in WeChat user cloud storage | appear on friend and group boards | `setUserCloudStorage` (**微信朋友关系**) | WeChat | 7 days |
| Friends' and group members' nickname/avatar/openid/marker | render boards (openid hashed inside the open data domain) | open data domain reads (**微信朋友关系** + `scope.WxFriendInteraction`) | **not received by us** | n/a |
| Group id and membership | group boards | `getGroupEnterInfo` → `joinGroup` (cloudID) | `group_members` (client sees `groupRef` only) | 180 days after last seen |
| Fact reports (fact id, chosen reasons, where, date) | correct data errors | the user's report tap | `fact_reports` | 180 days |
| Subscribe grant | send the one notice the user asked for | opt-in tap | `sub_grants` | 180 days |
| Album write | save the result card on tap | `saveImageToPhotosAlbum` (**相册（仅写入）**) | device only | n/a |
| Display, sound, category settings | preferences | user | device only | until changed |
| Device platform | layout, debugging | `getDeviceInfo` | `events` props | 180 days |
| Ad data | ad delivery | WeChat ad SDK | not by us | per WeChat |

**Not collected:** nickname or avatar to our servers, phone, location, contacts, album contents, camera, microphone, clipboard, free text of any kind, payment data.
**Declarations (founder setup, H5):** 微信朋友关系 ("用于在好友榜、群榜中展示你和好友的今日成绩") and 相册（仅写入） ("用于在你点击「保存图片」时把成绩图片保存到相册"); official privacy popup enabled. Without them those calls fail with 112 and only boards / saving degrade.
Data stays in mainland WeChat Cloud. Real-name and anti-addiction for an IAA mini game: platform-handled; release re-checks for this AppID and the founder confirms (H13).

---

## 14. Platform verdicts and the founder's device pass

All platform APIs used here are the ones verified for 点将台 in [P0] (verdicts in [DJT] §17), plus nothing new except the `answer` round-trip latency. New AppID, new cloud environment: every [SPIKE] item must be re-proven on this AppID.

Device pass (founder, with minigame-dev and backend on call; QA records), MP 体验版 on ≥ 1 iOS and ≥ 1 Android phone, three mutual-friend accounts in a test group:
1. Share → group entry → `getGroupEnterInfo` → `joinGroup` cloudID decrypt (E1).
2. Privacy popup and `scope.WxFriendInteraction` flows; refusal paths; `openSetting` recovery (E4).
3. Friend/group rows carry `openid`; hash join of 500 rows < 50 ms; `getBoard` payload of ≥ 1,000 rows passes (E2, E3).
4. Rewarded video with `disableFallbackSharePage: true`; interstitial 2001/2002 (E5).
5. `genDaily` timer fires once at 23:00 BJT; duplicate invocation is a no-op; date keys at 15:59:59/16:00:00 UTC (E6).
6. **Daily `answer` latency on mobile data:** p50 and p95 over a full 40-question run on both phones; airplane mode before a tap → "网络不太好" + 重试 and a clean resume (E7: p95 ≤ 1.5 s; else backend tunes warm instances/payload; up to 3 s p95 is acceptable with the card holding mid-turn; beyond that the CTO decides).
7. Subscribe message end to end with a template ID (E8); save to album (E9); banner when units exist (E10); large-text/high-contrast at the smallest screen and on PC WeChat (E11).
8. Results recorded in a dated device-pass note under `docs/bibiyi/` (E12).
Every exit criterion except E7 uses the fallback already stated for the matching item in [DJT] §17.1 (group entry, row openids, hash/payload, privacy flows, rewarded/interstitial, timer, subscribe, album, banner, display modes); E7's fallback is stated in item 6. A failure is a dev fix plus re-check, not a product decision.

---

## 15. Edge cases

1. **Offline at launch:** free play works (bundled pool). Daily card, boards, history and challenges show offline states.
2. **Offline mid-daily:** the tapped answer is kept; "网络不太好" + 重试; resume at the same question with the same choice.
3. **Double tap / retry after a timeout:** same `k` returns the stored outcome; never two answers for one question.
4. **Tampered `k` or choice change after reveal:** `INVALID_ORDER` / stored outcome; `order` flag.
5. **Second daily attempt** (reinstall, other device): `getDaily` says `open` (resume) or `done`; `startRun` resumes the same `run_progress`.
6. **Two devices answering the same daily concurrently:** the first `answer` for a `k` wins (transaction on `run_progress`); the other device gets the stored outcome and re-syncs.
7. **Midnight:** a run started on D continues until D+1 00:30; then `WINDOW_CLOSED` and finalization at the current streak. On `onShow` the client compares the cached date with `serverNow` and refreshes home.
8. **Run never resumed:** finalized at the current streak by `getDaily` (caller) or `cleanup` (anyone), end reason `window`.
9. **`DAILY_UNAVAILABLE`:** daily card error state; free play unaffected; day streaks skip the date.
10. **Free run with a retired content version** (old client): submitted runs validate against the pinned version while it is among the last 2; otherwise stored as unvalidated, never used for challenges ("这局无法发起挑战，请更新后再试").
11. **Challenge edge cases:** expired, not found, own, already answered, today's deck already played (friendly), past deck (friendly), retired version, opened mid-run (deferred toast).
12. **Owner of a free challenge used 再答一次:** recipient may also use one (same rules, §5.4).
13. **Recipient of a daily-deck challenge leaves mid-run:** same as any daily run (resume; window finalization).
14. **Ad edge cases:** closed early (run ends), no fill (one grant), app backgrounded during the ad (evaluated on close), interstitial cap hit (skip silently).
15. **A fact is suspended while it is in today's deck:** today's deck is unchanged; future decks skip it; errata may be added for history.
16. **A fact is suspended that is in the client's free pool:** still playable in free decks until the next content version (suspension only affects daily generation).
17. **Equal values after a correction:** impossible in a published deck (pair rule 4 at generation time); corrected values appear only in new versions.
18. **Report while offline:** toast, nothing queued; the player can report later from history or 本局题目.
19. **Reports flood from one user:** rate limit 20/day; one document per (fact, user), so one person can't trigger auto-suspend alone.
20. **Deck exhausted (40/60 correct):** "全部答对"; boards show 40 at the top, tied entries share the rank.
21. **Board ties:** shared rank numbers; order within a tie by earlier end time.
22. **Unverified board row** (KV with no server match): "未验证", no rank (reuse).
23. **Privacy refused at the first ranked result:** result unaffected; marker pending (reuse).
24. **Friend scope refused, then enabled:** board re-renders on return (reuse).
25. **Over `boardListCap`:** `group`/`selfOnly` modes (reuse).
26. **Timer double-fire / lazy race on `genDaily`:** one `daily_decks` document.
27. **Category with few free facts:** generator falls back to the nearest legal gap; never repeats a fact within 10 questions; never shows a near-tie.
28. **Small screens and large system fonts:** cards shrink to 2 lines of label, value stays ≥ 40 pt (≥ 48 pt in 大字), content scrolls; no truncated numbers or units.
29. **Display font subpackage fails:** system font.
30. **Remote config unreadable:** subscribe hidden, banner off, interstitial defaults.
31. **Year facts with BCE values:** formatted "公元前221年"; comparisons use signed integers.
32. **Very large numbers** (populations, diameters): formatted with 万/亿 and separators by `core/format.js`; both cards of a pair always use the same unit scale.

---

## 16. Founder Handoff (founder-only actions; release compiles them into `docs/bibiyi/release/HANDOFF.md`)

None of these blocks the build: each dependent feature degrades gracefully until done.

| # | Founder item | Needed for | If not done yet |
|---|---|---|---|
| H1 | **Register a new mini game AppID** under the founder's Beijing company. Name **比一比**; fallbacks in order: 比一比·中国常识, 常识比一比, 比一比挑战 (never 猜大小/比大小). Game category per the MP options (休闲/益智 or 问答 class, [VERIFY] in the console). Release prepares the introduction and avatar | everything on WeChat | no build can be uploaded |
| H2 | **WeChat 认证** for the new AppID (fee) | submission, 流量主 | submission waits |
| H3 | **小游戏备案** for the new AppID, using release's service description and form fields | release | release waits |
| H4 | **软著** submission from release's materials | release pack (Art. 7) | release waits per founder policy |
| H5 | Privacy guide: declare **微信朋友关系** and **相册（仅写入）**; enable the official privacy popup | boards, save image | those calls fail with 112; boards and saving show their error states |
| H6 | **Create the cloud environment** for this AppID (any paid plan is a money decision), deploy the functions, set env vars (`GROUP_REF_PEPPER`, `TZ` on every function, optional `LAUNCH_DATE_KEY`), the timeouts, the two timers, the `subscribeMessage.send` openapi permission on `submitRun`, collections + `database/rules.json` + indexes, and the `app_config`/`fact_overrides` documents | daily, boards, challenges | daily/boards/challenges show offline states; free play works |
| H7 | **Subscribe template ID** (one-time template matching "好友接受了你的挑战": a status field, two number fields, a time field) into `app_config.subscribe` | §6.18 | feature hidden |
| H8 | **流量主** activation, then ad unit IDs (rewarded, interstitial, banner) into config; switch the banner on when wanted | §9 | rewarded = free grant once per run, no interstitial, no banner |
| H9 | **Optional counsel check** (money): commercial use of 国家统计局 data under its terms, the `FACT-CITED` class, and the 重要地理信息数据 rule for geographic values. Default without it: proceed with attribution and accuracy (PO-20) | content risk | none (default applies) |
| H10 | **In-app search** (WeChat and Douyin 小游戏): 比一比, 哪个更多, 谁更大, 谁更多, 高低 挑战, 连对, 猜哪个大, higher lower; plus name availability. Informational: the founder may stop the project if an established clone exists (Art. 2), otherwise no action | positioning | none |
| H11 | **Device pass** (§14) on iOS and Android | submission | submission waits |
| H12 | Approve the upload and release | submission | n/a |
| H13 | Confirm that the compliance clearance given for 点将台 (D14: IAA-only, no 版号 needed, 防沉迷/real-name, 诱导分享, ads, privacy) also applies to this AppID, after release's rules check | submission | submission waits |

No CDN, ICP domain or remote image hosting is needed (no remote images).

---

## 17. Acceptance criteria (v1)

QA tests these against this spec; tests may use the fake-`wx` harness, a fake DB and seeded configs. "Daily deck run" means any run on a `daily_decks` deck (ranked or friendly).

**Core loop and simplicity**
1. A first-time player reaches the first question from home with one tap (开始 or 随便比比) and no login, consent or permission prompt; the 玩法 sheet opens once and is dismissible; the first-run coach bubble appears once.
2. Each question shows a top card with label, sub-label, value, unit and source line, and a bottom card with label, sub-label and unit but **no** value or source; the prompt reads "<bottom> 比 <top> ……" and the two buttons carry the measure's hi/lo verbs from §3.1.
3. A correct answer increments 连对 by 1 and, within a segment, the bottom card becomes the next top card with its value shown; at a segment change both cards are new and the banner "下一组：比<sub-label>" shows.
4. A wrong answer ends the run (subject to AC 41 in free runs) and the result shows 连对 = the number of correct answers before the miss, the missed pair with both values and sources, and "数据有误？".
5. Answering all 40 (daily) or 60 (free) questions correctly ends the run with "全部答对" and 连对 40/60.
6. The reveal (card turn + count-up) completes in ≤ 1.2 s and a tap skips the count-up; the outcome is identical whether skipped or not.
7. No timer, countdown or time-limited element exists anywhere in the game (code search for countdown UI plus manual review).
8. 返回 mid-daily keeps the attempt (no forfeit) and 继续 resumes at the same question with the same cards and streak; 返回 in free play asks to confirm and logs `run_abandon`.

**Vocabulary and framing** [COMPLIANCE]
9. The forbidden-terms search (§3.6 list) over all user-visible strings, comment lists, share titles, content files and store text returns no hit; no button label is a bare 大 or 小.
10. No dice, playing-card, chip, coin, slot-reel or roulette imagery and no casino-style sound exists in the build (asset and code review).

**Content**
11. The launch content validates: exactly 682 facts with the per-measure and per-pool counts of §3.3 (440 free, 242 daily), each theme group ≥ 30 daily facts, every §3.2 field present, unique ids, unique labels per measure.
12. Every fact has a licence from §3.4, an https URL not on the banned-host list, a `retrievedAt` date and two distinct `verifiedBy` roles; no source has more than 25 `FACT-CITED` facts.
13. No fact carries an exclusion tag (§3.5); no city item is a 自治州/自治县/盟; no item is a person, country, brand, price or region area; province facts carry the census-scope note.
14. Labels are ≤ 10 characters and notes ≤ 24; ratio values are finite and > 0; year values are integers (negative for BCE).
15. `tools/build-content.js` produces the free bundle and the server bundle, and fails if any daily-pool fact id or label would appear in the game output; CI re-runs it and fails on drift.
16. Every revealed value shows its unit, "约" when `approx`, and a source line "来源：<publisher> · <year>"; tapping the source line opens the source sheet with the URL as plain text.
17. The 数据来源 page lists every publisher with the attribution text of §6.12, including "国家统计局网站" with its URL and "GeoNames (CC BY 4.0)".

**Server-stepped daily (anti-lookahead)**
18. For a daily-deck run, no response from `getDaily`, `startRun`, `answer`, `getChallenge`, `getBoard` or `getHistory` (before the window closes) contains a question beyond the current one, or any value, raw number, note or source of an unanswered bottom card (captured-payload test over a full scripted run).
19. Two users on the same Beijing date receive the same `issueNo`, theme and, question by question, identical cards (ids, labels, top values) regardless of their answers.
20. `answer` is idempotent per `k`: repeating a call (same or different `choice`) returns the stored outcome; a `k` other than the current one returns `INVALID_ORDER` and writes an `order` anomaly for ranked runs.
21. A run ends on the server at the first miss or after question 40, and `daily_results`, `daily_stats` and `player_stats` are written in one transaction; concurrent finalization attempts produce one `daily_results` document and one `hist` increment.
22. The game package contains no daily-pool fact (CI check over `apps/bibiyi/game/` for every daily id and label) and no deck data.
23. One ranked result per openid per date: a second `startRun` for today's ranked deck resumes the existing run or returns `ALREADY_PLAYED` with the stored result.
24. A run started on D accepts answers until D+1 00:30 BJT; at 00:31 `answer` returns `WINDOW_CLOSED` and the run is finalized at its current streak (server test at 00:29 and 00:31).
25. An open ranked run whose window has closed is finalized at its current streak by `getDaily` or `cleanup` with `endReason: window`, and the home card shows the finalized note once.
26. With the network off when answering, the card shows "网络不太好" + 重试 within 5 s; after reconnecting, 重试 sends the same `k` and choice and the run continues; killing and relaunching restores the same question.
27. No rewarded continue, interstitial or banner appears during or at the end of any daily-deck run (harness over ranked, challenge-as-daily and friendly daily runs).

**Decks and difficulty**
28. Every question in every generated deck (daily and 10,000 free decks per category) satisfies the §4.1 pair rules: same measure, min gap (1.5× for approx; year rule), no suspended/retired fact, no `noPairWith`, displayed values differ in the raw direction, no fact twice in a daily deck and not within 10 questions in a free deck.
29. Every question's gap falls in its position band (§4.2), clamped to the measure's min gap.
30. `tools/deckstats.js` over 10,000 dates with the launch content reports a candidate pass rate ≥ 20%, and every accepted deck satisfies the gates: model median streak in [6, 12], P(≥ 20) in [2%, 15%], P(40) ≤ 0.5% (CI-gating).
31. Daily decks follow the weekday theme: questions 1-20 from the theme's categories (Sunday mixed), no measure in more than 2 segments, segments 4-8 questions.
32. No daily fact appears in two published decks within 3 consecutive days; suspended facts never appear in decks generated after their suspension.
33. `genDaily` is idempotent: two concurrent invocations (timer double-fire, lazy `getDaily` race) produce one `daily_decks` document; with gates made impossible it returns `DAILY_UNAVAILABLE`, writes no deck, logs `[ALERT]` and a `daily_gen {failed:true}` event, and clients show the daily error state with free play available.
34. Date keys and weekday themes are correct at 15:59:59 and 16:00:00 UTC with the function process at `TZ=UTC` and with `TZ` unset; every function config sets `TZ=Asia/Shanghai` and an explicit timeout.
35. `buildFreeDeck(seed, contentVersion, configVersion, group)` yields identical decks on the client and in `submitRun` over 1,000 seeds per category.

**Free play**
36. Free play works from a cold start in airplane mode for a full run, including the result screen (submission queued best-effort).
37. The category picker filters free decks to the chosen category's facts (all 1,000 test decks per category contain only that category's measures); the choice persists and 再来一局 uses it.
38. `submitRun` rebuilds the free deck and recomputes the streak; a tampered `clientStreak` sets `mismatch` and has no effect on any challenge or best.
39. `submitRun` rejects with `INVALID_ACTIONS`: answers after the run should have ended, more than one life, a life not at a miss, non-sequential `k`, an unknown content/config version.
40. 再来一局 starts a free run in the last-used category.

**再答一次**
41. In a free run (incl. a free-seed challenge run), after the first miss the 再答一次 sheet appears once; a completed video (`isEnded`) continues the run with the next question, the missed question does not count, and the result shows "（含再答一次）"; a second miss ends the run with no offer.
42. Closing the video early ends the run with "完整观看才能继续"; on no-fill or load error the continue is granted once per run with "暂无广告，本次免费".
43. The 再答一次 sheet never appears in any daily-deck run, and `answer` has no continue path (code search plus server test).
44. Every rewarded instance is created with `disableFallbackSharePage: true`; `onLoad` with `useFallbackSharePage: true` is treated as no-fill; a launch with `wxad_fallback_share=1` grants nothing.

**Report an error**
45. "数据有误？" appears only after a card's value is revealed (never on a hidden bottom card), on the result's missed pair, in 本局题目 and in an unlocked history deck.
46. The report sheet offers exactly the six fixed reasons, no text input; 提交 is disabled until a reason is selected; submit shows "已收到，谢谢！我们会核对".
47. `reportFact` stores one document per (fact, openid) (a repeat updates reasons), rejects unknown fact ids with `UNKNOWN_FACT`, and rate-limits at 20 per openid per day (further calls return the thanks toast and store nothing).
48. Reports from 5 distinct openids on one fact within 7 days add it to `fact_overrides.suspended` with `auto: true`; 4 do not; a single openid reporting repeatedly never suspends.
49. A published daily deck is never modified by a suspension or correction; history shows errata lines from `fact_overrides.errata` for that date.

**Sharing and challenges** [COMPLIANCE]
50. No reward, continue, attempt, rank or content is granted or unlocked by any share, anywhere (code search plus manual test of every share entry point).
51. Every share starts from a user tap or the capsule menu; nothing calls `shareAppMessage` automatically; `wx.getShareInfo` is never called.
52. The daily share card and saved image contain no fact label or value; the free card shows the missed pair's labels and measure without values; both render the streak, and fall back to the static image when rendering fails.
53. A challenge card's query is `c=<id>` only; `getChallenge` never returns the owner's answers or any fact value; the entry shows the owner's 连对 and the counting rule.
54. A challenge on today's deck opened by a user without a ranked run today states "本局将作为你的今日一比" and its result appears on the boards; if the user already played today it is labelled 友谊赛 and is never ranked; a past-date deck challenge is friendly and server-stepped.
55. A free-seed challenge replays the owner's deck exactly (same seed, category, versions), allows one 再答一次 for the recipient, and the comparison reads "你 N · TA M · 同一套题".
56. During a challenge run the line "已超过 TA 的 M ✓" appears once when the streak first exceeds the owner's, with no sound or pop-up.
57. Expired, not-found, own, already-answered, retired-version and offline challenge states render as in §6.8 and none blocks free play.
58. Opening a result card from a group (`shareTicket` present) calls `getGroupEnterInfo` and `joinGroup`; on success home shows the group banner; without a ticket or on failure nothing else changes.

**Leaderboards** (C3 reuse)
59. After a ranked result the KV key `d_<date>` holds exactly `{n}`, written only after privacy agreement; free results are never written; keys older than 7 days are removed.
60. A tampered KV value never changes a displayed rank: a user with no ranked run whose KV says 40 shows "未验证" with no rank below ranked rows; a user whose server result is 8 but KV says 30 shows 8 at the rank 8 earns; rank numbers equal the order from `daily_results` alone in `full`, `group` and `selfOnly` modes.
61. Ranking is by server 连对 descending; equal 连对 share one rank number; within a tie earlier end time is listed first.
62. Raw openids and openGIds never reach the client: no captured `callFunction` response or `postMessage` payload contains a test openid or a field named `openid`/`openGId`; the same user's `h` differs between two dates.
63. `getBoard` returns at most `boardListCap` rows, switches to `group`/`selfOnly` above it, and accepts a `groupRef` only from a member.
64. `joinGroup` creates or updates exactly one `group_members` document per (group, user) and returns a `groupRef` that is not the openGId; single-chat data, 40097, 65206 or a malformed cloudID return `{ok:false, code}` and write nothing.
65. Board states (no group, checking, loading, ready, empty, not played, server error, privacy not agreed, not authorized, selfOnly) render as in §6.9-6.10; none blocks returning home or playing.
66. No privacy popup or scope prompt appears at launch or during any run; the first follows a ranked result or a board tap; with privacy or friend scope refused, free play, the daily, results, sharing, challenges, reports and history all work and only the boards show their explainer states.

**Day streaks, bests and history**
67. Day-streak server tests: consecutive published days +1; a missed published day resets to 1 on the next play; a date with no `daily_decks` document is skipped; a grace-window result counts for D; duplicates don't double-count; `getDaily.myDays.current` shows yesterday's streak all through today until today's result exists.
68. 今日一比最佳 and 随便比比最佳 equal the maxima of server-validated results (free bests include 再答一次; unvalidated free runs never count).
69. 往期 lists the last ≤ 30 published issues with the player's 连对 or "未参加" and the theme; the issue detail shows the distribution only at ≥ 30 results and the full deck with values and the player's answers **only when now > D+1 00:30 BJT** (server test at 00:29 and 00:31); loading/empty/error/offline states render.
70. No reward, continue, cosmetic or unlock is tied to any streak or best, no streak freeze exists, and no notification of any kind is sent about streaks or the daily (code search; copy review finds no pressure copy such as 别断了/快来).

**Ads**
71. Interstitials appear only on 再来一局 from a free-run result, never before the 4th lifetime completed run, at most once per `everyNRuns` completed free runs in a session, ≥ `minGapSec` apart, ≤ `maxPerDay`, and never in a daily or challenge flow, a run, a reveal or a card-entry first run; rejections 2001-2003 are skipped silently and not counted.
72. Changing `app_config.ads.interstitial` changes behaviour on next launch without a code change; out-of-range values are clamped; missing config uses the `core/config.js` defaults.
73. With `app_config.ads.banner.enabled` false (default) `createBannerAd` is never called; when true, a banner appears only on the boards in `ready`/`empty`, ≥ 24 pt from any tappable element, hidden under sheets, destroyed on leaving.
74. Ad buttons show ▶ and 视频, nothing auto-plays, and no ad button is adjacent to a primary button; with `adMode=stub` every placement shows the test overlay and logs `stub=true`; production config has stub off.

**UX and platform**
75. On 375 × 812 with the test capsule rect, nothing tappable overlaps the capsule row; the answer buttons and primary buttons are in the bottom 40% above the safe area.
76. Touch targets ≥ 48 × 48 pt; answer buttons ≥ 56 pt tall with ≥ 16 pt between them; body text ≥ 16 pt; revealed value ≥ 40 pt; layout holds at 320 × 568 and 430 × 932 with no clipped labels, values or units.
77. Correct/miss feedback always includes the text 对/错 (never colour alone); category accents never carry meaning alone.
78. 大字模式 and 高对比度 meet the §6.19 sizes and contrast ratios (automated palette contrast test; default mode body ≥ 4.5:1), persist across launches, apply without restart, and don't change share or saved cards.
79. The mute setting persists and silences all audio and the miss vibration.
80. Main package ≤ 4 MB including `opendata/`, total ≤ 30 MB (CI); no image files are loaded for card content (harness: icons are drawn in code, no network image requests).
81. Rapid taps: the first answer tap wins and both buttons lock until the next question; a second finger is ignored.
82. Number formatting: thousands separators, 万 scaling to 1 decimal for populations, "约" for approx, "公元前N年" for negative years; both cards of a question always use the same unit and scale (unit tests over every fact).

**Save image and subscribe** (reuse)
83. 保存图片 appears only on the result; nothing album-related is called before the tap; success saves the §6.7 card at 1000 × 800; refusal shows the [去设置] sheet without automatic re-prompting; saving grants nothing.
84. Without `app_config.subscribe.tmplId` the offer never renders and `requestSubscribeMessage` is never called; with it, the offer appears only after a challenge was created on the result or on the own-challenge screen, `accept` stores one grant per challenge, and the first answer by another user sends exactly one message with no names or openids (two parallel answers send one).

**Server, data and security**
85. All collections deny direct client reads and writes (rule tests); every function derives identity from the context OPENID; no AppSecret, `session_key` or `code2Session` appears in function code (test).
86. Every function returns `{ok:false, code}` instead of throwing; each error code in §11.3 is produced by at least one server test.
87. `cleanup` deletes personal-data documents older than 180 days (`run_progress`, `runs`, `daily_results`, `challenges`, `fact_reports`, `sub_grants`, `anomalies`, `events`, `player_stats` by `updatedAt`, `group_members` by `lastSeen`), keeps `daily_stats` and `answer_stats`, finalizes leftover open runs from closed windows, and is idempotent.
88. Anomaly flags (`fast`, `slow`, `order`, `mismatch`) are written once per (run, kind) under their §11.5 conditions and never change any response, result, rank or UI (same run with and without flags gives identical responses); `suspect` turns true at ≥ 5 flags in 7 days.
89. The `cleanup` roll-up writes `answer_stats` per measure and gap bucket from the previous day's answers, and raises `[ALERT]` plus a `fact_report_daily` event for any fact whose reports exceed 0.3% of its reveals.
90. With `app_config` missing or `getDaily` failing, the game is fully playable: subscribe hidden, banner off, interstitial defaults, no error shown.

**Analytics**
91. Every §12 event fires exactly once per trigger with its listed props, a non-null top-level `sessionId` (also when sent only in `props`) and `clientTs` (scripted harness session: card open → challenge-as-daily run → share → 3 free runs incl. one 再答一次 → interstitial → report → board → history).
92. The KPIs of §12 (share rate, card-open-to-play, runs per session, D1, D7, report rate) can each be computed with one query over `events` (and the server answer count for reveals) on the harness data; `wx.reportEvent` is never called.

**Release**
93. The release pack contains the Founder Handoff H1-H13 and the device-pass checklist (§14 items 1-8 with exit criteria) with an empty result column; the content review (§3.7 step 5) and the forbidden-terms check are recorded in the release checklist before any upload.

---

## 18. Post-launch backlog (out of v1; none promised)

- **Surprise-weighted pairing** switched on once answer data is sufficient (§4.4; config only, no release).
- **Replay past dailies** as friendlies from history.
- **New categories** after content review: 城市海拔, 年均气温 (licence check needed on 中国气象局 data), 植物, 人体.
- **Weekly special deck** (e.g. "家乡周": decks from one province) if group data shows it helps.
- **Updatable challenge cards** (fixed platform template only, [P0] §5): low value.
- **Automatic anomaly sanctions**, only if observe-only data shows a real problem.
- **Screen-reader labels** if the platform ever exposes an accessibility tree for canvas games.

---

## Appendix A: Reuse map (copy, never import across apps)

| 点将台 asset | Reuse in `apps/bibiyi/` | Change |
|---|---|---|
| `game/game.js`, `game.json` (portrait, `openDataContext: "opendata"`) | copy | new entry scenes |
| `js/main.js` scene loop, `js/render/layout.js` (capsule `navBottom`), touch routing, `js/render/widgets.js`, `theme.js` (incl. display modes), `overlay.js`, `howto.js`, `settings.js`, `board.js`, `challenge.js`, `shareCard.js`, `fmt.js` | copy + adapt | new `play.js` (cards, buttons, reveal), `result.js`, `report.js`, `sources.js`, `history.js`, category icons drawn in code |
| `js/ads.js`, `share.js`, `privacy.js`, `analytics.js`, `store.js`, `audio.js`, `api.js`, `vm.js`, `controller.js`, `mock-server.js`, `build-config.js` | copy + adapt | continue placement replaces re-spin/复盘; `answer`/`reportFact` in api and mock server |
| `opendata/` (`index.js`, `board.js`, `draw.js`, `sha256.js`) | copy | rows `[h, n, s, k?]`, shared ranks |
| `core/rng.js`, `core/date.js` | copy as is | + weekday helper if missing |
| `core/config.js` pattern | new content | bands, model, gates, ads, `boardListCap`, daily window |
| `core/content.js` pattern (`validateContent`) | new | facts and measures (§3) |
| — | new | `core/deck.js` (pair rules, bands, free and daily builders), `core/judge.js`, `core/format.js`, `core/gates.js` (analytic) |
| `tests/harness.js`, `wechat-loader.js`, smoke/render/compat tests | copy + extend | fakes for `answer`, `reportFact` |
| `tools/simstats.js` pattern | new | `tools/deckstats.js`, `tools/build-content.js` |
| `cloudfunctions/common/` (`store.js`, `input.js`, `util.js`, `rules.js`), `scripts/sync-core.js`, `database/rules.json`, tests helpers (fake DB, harness) | copy | `coreapi.js` and `daily.js` rewritten for decks |
| Functions `getDaily`, `genDaily`, `startRun`, `submitRun`, `createChallenge`, `getChallenge`, `subscribeChallenge`, `joinGroup`, `getBoard`, `getHistory`, `track`, `cleanup` | copy + adapt | deck instead of seed bank; server-stepped runs; free-run replay |
| — | new | `answer`, `reportFact` |
| Not reused | — | seed bank and `prepare-bank.js` (no bank needed), the draft/sim/search/gates core, seal portraits, 识人, cheatshaizi dice logic |

Rough share: about 85% of the platform code (scene loop, UI kit, share, ads, privacy, boards, challenges, group context, analytics, cloud skeleton) is copied; new work is the content pipeline, the deck engine, the card UI and two functions ([KEPT] §5).
