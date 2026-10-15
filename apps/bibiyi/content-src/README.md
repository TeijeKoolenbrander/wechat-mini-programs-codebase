# 比一比 content-src (source data, not shipped)

One JSON-lines file per measure. The game agent converts these into `content/facts/<measure>.js` per `docs/bibiyi/spec.md` section 3.2/3.10. Nothing here goes into the game package. Date of collection: 2026-10-15. Collector: market-researcher. Second verification (verifier2): 2026-10-15.

## CTO decisions 2026-10-15

1. **AnAge (CC BY 3.0): accepted**, with attribution like GeoNames. Every AnAge fact (`animal_weight`, `animal_life`) now carries an `attribution` field: "AnAge / Human Ageing Genomic Resources (HAGR), CC BY 3.0, https://genomics.senescence.info". The credit line for the 数据来源 page is in SOURCES.md section 5. Licence class `CC-BY-3.0` is to be added to the spec's licence list by the owner of the spec.
2. **animal_life = maximum recorded lifespan.** The measure's display label is "最长寿命纪录" (never "寿命" / "平均寿命"). Added `label` field on every `animal_life` fact; the measure-level label metadata is: `animal_life.label = "最长寿命纪录"`. Each fact's `note` still says 圈养 (captivity) or 野外估计 (wild estimate). Never present these as typical lifespan.
3. **river and lake dropped from v1.** The 4 river facts were moved (not deleted) to `_dropped/river.jsonl`; `river.jsonl` is now an empty placeholder (the verifier could not delete files, please `git rm` it). `lake` has no facts.
4. **Not in v1 content from the collector:** lake, year, structure_len, structure_height, distance. `distance` may be computed later by code from GeoNames.

## Status per measure (spec target in brackets)

| Measure | File | Facts | Spec total | Status |
|---|---|---|---|---|
| city_pop | city_pop.jsonl | 72 | 131 | partial: 6 provinces + 4 cities |
| prov_pop | prov_pop.jsonl | 31 | 31 | complete (one page) |
| mountain | mountain.jsonl | 11 | 50 | short; leads below |
| river | `_dropped/river.jsonl` | 4 (dropped) | 40 | DROPPED from v1 (CTO) |
| lake | none | 0 | 30 | dropped from v1 (CTO) |
| year | none | 0 | 90 | not in v1 (CTO) |
| animal_weight | animal_weight.jsonl | 40 | 50 | AnAge, CC BY 3.0 accepted |
| animal_life | animal_life.jsonl | 39 | 30 | label "最长寿命纪录"; 1 fact recommended for removal |
| space_diameter | space_diameter.jsonl | 21 | 40 | short: 10 NASA bodies + 11 derived |
| structure_len | none | 0 | 30 | not in v1 (CTO) |
| structure_height | none | 0 | 30 | not in v1 (CTO) |
| food_kcal | food_kcal.jsonl | 23 | 70 | short: API rate limit |
| distance | none | 0 | 60 | not in v1 from collector; compute from GeoNames in code |
| **Total in v1 files** | | **237** (241 incl. 4 dropped rivers) | 682 | |

Pool split (free vs daily) is **not assigned** here; the analyst or the build tool assigns `pool`. Daily needs 40 questions per day, so a measure with fewer than about 20 facts cannot carry a themed half-deck alone.

## Verification result (verifier2, 2026-10-15)

All 241 facts re-checked against the source page; 241 ok, 0 corrected, 0 unverifiable (values). Per measure: prov_pop 31 ok, city_pop 72 ok, mountain 11 ok, space_diameter 21 ok, food_kcal 23 ok, animal_weight 40 ok, animal_life 39 ok, river 4 ok (dropped).
- Tool limit: the fetch tool still returns a model-extracted answer, not raw bytes. Mitigation: each page was asked for the verbatim table or sentence, and the numbers were compared digit by digit. For the 23 foods, the DEMO_KEY API was rate-limited (HTTP 429, retry-after about 16 h), so values were re-read from the keyless USDA portal JSON `https://fdc.nal.usda.gov/portal-data/external/<fdcId>` (same fdcId, description matched, Energy kcal matched, `lastUpdated 4/1/2019`). `source_url` fields still hold the original API URLs, which need a key.
- `space_diameter`: values all match. For 11 of the NASA facts that came from satellite/Pluto sheets, `as_of_year` was set to the page's own "Last Updated" year instead of the retrieval year 2026 (Jovian 2023, Saturnian 2025, Uranian 2023, Neptunian 2024, Pluto sheet/Charon 2024). Recorded in `verifier2`.
- `verified_by` text of the first researcher was shortened (boilerplate "QA must re-open URL" removed); content otherwise unchanged. Fields added: `label` (animal_life), `attribution` (AnAge facts).
- Recommended removal: `f_animal_life_xiangui` (加拉帕戈斯象龟 177 years): AnAge itself calls it "anecdotal evidence ... one record of 177 years" (single reference, a hobbyist web page). Value matches the page, but it fails a fair "data dispute" test. Tagged `recommend-remove`.
- Note: 非洲野驴 (`Equus_asinus`): AnAge's common name for that entry is "African wild ass"; the binomial is the one usually used for the domestic donkey. Subject follows the page; consider dropping if the editor wants zero ambiguity.
- Note: 小熊猫 page lists both "Adult weight" 4,325 g (used) and "Body mass" 5,740 g.
- Note: AnAge page for 绿头鸭 life has no "(captivity)" qualifier ("29.1 years" / oldest recorded age).

## Record format

Every line: `id, measure, subject, value, unit, as_of_year, source_name, publisher, source_url, licence, retrieved_at, verified_by, verifier2, note, tags`. Extra optional fields: `derived` (space), `approx`, `source_quality` (AnAge), `label` (animal_life display label), `attribution` (AnAge licence credit).
- `verifier2` values: `ok:<date>`, `corrected:<old>-><new>:<date>`, `unverifiable:<reason>`. An `ok` may carry a `;` comment.
- `value` is a number in the unit stated in `unit` (people for population, metres, km, kg, years, kcal per 100 g). The spec's data model stores base units (people, m, km, kg, years, kcal), which matches. `core/format.js` handles 万 scaling.
- `subject` is the Chinese label. Population labels carry 市/省/自治区 as in the official table; the spec's 10-character limit is respected.
- `note` is at most 24 characters, per spec 3.2.
- `tags`: `border-feature` (珠穆朗玛峰, spec 3.5 rule 6, extra review). Other tags are **advisory only, not exclusion tags**: `relay-source`, `name-clash-yichun`, `border-city-review` (黑河, 丹东 are border cities, nothing in the text is territorial), `secondary-gov-source`, `stale-gt-12m`, `anecdotal-per-source`, `recommend-remove`, `dropped`. Strip or remap them before `validateContent` if it rejects unknown tags.
- `as_of_year` is the data year (census 2020; NASA page date; mountains = announcement year; USDA 2019 SR Legacy publish date; AnAge = 2026 retrieval year because no page date was captured).

## Remaining open items

1. **animal_life** semantics: AnAge gives the *maximum recorded* longevity (mostly captivity, a few wild estimates). Display label "最长寿命纪录" (decided). Several records are single individuals. Expect "data dispute" reports. 蓝鲸/虎鲸 are wild estimates.
2. **animal_weight** is a species typical adult weight from AnAge; some entries are single-source averages (小鼠 20.5 g is stored as 0.0205 kg).
3. **space_diameter** values for Sun and moons are 2 x NASA radius. 木卫三 (5262.4) vs 土卫六 (5150) vs 水星 (4879) vs 木卫四 (4820.6) are within 5-10% of each other, so the pair generator will rarely pair them (min gap x1.05).
4. **city_pop**: the 七普 figures are "preliminary aggregated" data (stated in each bulletin). Provincial 自治州/地区 rows are excluded. Cities from 广东, 山东, 河南, 四川, 浙江, 湖南, 安徽, 河北, 广西, 江西, 云南, 山西, 陕西, 甘肃, 贵州 and the rest are still missing (see below).

## Leads for a person on a mainland connection (not fetchable from here)

Provincial 七普 公报（第二号）地区人口 pages found by search (official hosts). Fetching them from the tool timed out, was refused, or returned 403:
- 广东 http://stats.gd.gov.cn/tjgb/content/post_3283428.html (PDF attachment http://stats.gd.gov.cn/attachment/0/421/421309/3283428.pdf)
- 山东 http://tjj.shandong.gov.cn/art/2021/5/21/art_6293_10287511.html
- 河南 https://tjj.henan.gov.cn/2021/05-14/2144517.html
- 四川 https://tjj.sc.gov.cn/scstjj/c112127/2021/5/26/6658c4fac95e4a2790c5391cd0566e2f.shtml
- 浙江 https://tjj.zj.gov.cn/art/2021/5/13/art_1229129205_4632764.html
- 湖南 https://tjj.hunan.gov.cn/hntj/wzzl/hnsdqcqgrkpc/qrptzgg/202105/t20210519_19050124.html
- 安徽 http://tjj.ah.gov.cn/public/6981/145787821.html
- 河北 https://tjj.hebei.gov.cn/res/hetj/upload/file/20210519/%E5%85%AC%E6%8A%A5%E4%BA%8C_101236.pdf
- 广西 http://tjj.gxzf.gov.cn/zxfb/t8851194.shtml
- 江西 https://tjj.jiangxi.gov.cn/jxstjj/col/col38773/content/content_1869739703217086464.html
- 云南 https://stats.yn.gov.cn/Pages_23_2659.aspx
- 山西 https://tjj.shanxi.gov.cn/tjsj/tjgb/rkpcgb/202105/t20210526_729370.shtml
- 陕西 https://tjj.shaanxi.gov.cn/tjsj/ndsj/tjgb/qs_444/202105/t20210528_2177393.html
- 甘肃 http://tjj.gansu.gov.cn/tjj/c109457/202105/151fee9c96df4cf2b46bd008c99592b2.shtml
- 贵州 https://www.guizhou.gov.cn/home/tzgg/202109/t20210913_70093116.html
Together these would add roughly 130 more prefecture-level cities (the spec's 131 is reachable). Search snippets also showed values for them, but those are unverified and were **not** written.

Mountains: the 国家测绘局 and 建设部 notices of 2007-04-27 (第一批19座: 泰山, 华山, 衡山, 黄山, 峨眉山, 庐山, 嵩山 etc.) and 2008-09-28 (第二批31座, 第5号公告) would add about 50 peaks. Known mirrors: https://jst.sc.gov.cn/scjst/tonggao/2009/1/19/d80b2f6b24164ecf99c98682005eddde.shtml and http://big5.www.gov.cn/gate/big5/www.gov.cn/zwgk/2007-04/27/content_598640.htm (both failed to load here). Their data is more than 12 months old (stale flag) but is the official value (note 泰山 1532.7 m vs the older 1545 m in tourism material).

Other measures (not in v1): 国家文物局 / 故宫博物院 pages for `year`, `structure_len`, `structure_height` were reachable only for a few items (e.g. https://www.dpm.org.cn/explore/building/236465.html gives 太和殿 建成 1420 and 高 26.92 m / 通高 35.05 m, but the "current building is the 1695 rebuild" and two height conventions make it ambiguous), so no facts were written. `distance` needs GeoNames coordinates and a great-circle calculation.

## Not done on purpose

No value was taken from memory or from search-result summaries; every fact was read from a page fetched in this session. Where two figures conflicted (rivers, lakes), the fact was dropped. Excluded under spec 3.5: province area, any territory data, people, countries, disasters, dams, brands.
