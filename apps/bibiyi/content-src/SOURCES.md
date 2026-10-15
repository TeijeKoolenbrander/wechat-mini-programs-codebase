# 比一比 content-src: sources actually used

All sources were fetched on **2026-10-15** (retrieved_at). Licence classes follow `docs/bibiyi/spec.md` section 3.4, with the exceptions flagged below.

Verification status: first collection used a fetch tool that returns a model-summarised extraction. A second verifier (verifier2, 2026-10-15) re-opened every source URL (or an official keyless mirror for USDA, see section 4), requested the verbatim table row or sentence, and compared digit by digit. Result: 241 ok, 0 corrected, 0 unverifiable. The fetch tool is still not a raw-bytes reader, so a human spot check of a few facts before release is cheap insurance.

## 1. 国家统计局 and provincial/municipal 统计局 (CN-GOV-STAT)

Terms: attribution required (国家统计局网站 + URL), accuracy required, single figures only (spec 3.4). Census figures are the 2020 七普 "preliminary aggregated" data (the bulletins say so). Reference time 2020-11-01 00:00.

| Used for | Source | URL fetched |
|---|---|---|
| prov_pop (31) | 第七次全国人口普查公报（第三号）——地区人口情况，表3-1，国家统计局，2021-05-11 | https://www.stats.gov.cn/sj/tjgb/rkpcgb/qgrkpcgb/202302/t20230206_1902003.html |
| city_pop 湖北 (12) | 湖北省第七次全国人口普查公报（第二号），湖北省统计局，2021-05-26 | http://tjj.hubei.gov.cn/tjsj/tjgb/pcgb/wnpc/qrp/202105/t20210525_3559343.shtml |
| city_pop 江苏 (13) | 江苏省第七次全国人口普查公报（第二号），江苏省统计局，2021-05-18 | https://tj.jiangsu.gov.cn/art/2021/5/18/art_87589_10690480.html |
| city_pop 黑龙江 (12) | 2020年黑龙江省第七次全国人口普查主要数据公报，2021-05-27 | https://www.hlj.gov.cn/hlj/c108419/202105/c00_31186898.shtml |
| city_pop 辽宁 (14) | 辽宁省第七次全国人口普查公报（第二号），2021-05-30 | http://tjj.ln.gov.cn/tjj/tjsj/tjgb/rkpcgb/2023110818030081821/index.shtml |
| city_pop 吉林 (8) | 吉林省第七次全国人口普查公报（第二号），2021-05-24 | https://tjj.jl.gov.cn/tjsj/tjgb/pcjqtgb/202105/t20210524_8079030.html |
| city_pop 福建 (9) | 福建省第七次全国人口普查公报（第二号），2021-05-20 | https://tjj.fujian.gov.cn/xxgk/tjgb/202105/t20210520_5598804.htm |
| city_pop 广州 | 广州市第七次全国人口普查公报（第一号），2021-05-18 | https://www.gz.gov.cn/zwgk/sjfb/tjgb/content/post_7286268.html |
| city_pop 郑州 | 郑州市第七次全国人口普查公报（第一号），2021-05-15 | http://tjj.zhengzhou.gov.cn/tjgb/5012681.jhtml |
| city_pop 东莞 | 东莞市第七次全国人口普查公报（第一号），2021-05-22 | https://tjj.dg.gov.cn/tjzl/tjgb/content/post_3524384.html |
| city_pop 西安 | 西安市七普主要数据（西安发布，西安高新区管委会网站转载），2021-06-01 | https://xdz.xa.gov.cn/zwgk/tjxx/60c9b3fef8fd1c0bdc329668.html (relay; prefer tjj.xa.gov.cn original) |

Name notes: 福州市 includes 平潭综合实验区 (the table lists 平潭 as a 其中 item). 伊春/朝阳/泰州/吉林 names occur in more than one province or equal a province name; ids carry a suffix where needed. 自治州, 地区 and 省直辖县级市 rows (e.g. 恩施, 大兴安岭, 延边, 仙桃) were excluded from city_pop under spec 3.5 rule 3.

## 2. 自然资源部 / 国家林草局 and relays (CN-GOV-GEO)

| Used for | Source | URL fetched |
|---|---|---|
| 珠穆朗玛峰 8848.86 m (2020) | 人民日报 article relayed by 中国气象局网站, 2020-12-09 | https://www.cma.gov.cn/2011xwzx/2011xmtjj/202012/t20201209_568109.html |
| 9 peaks (贡嘎山 etc.), 2023-10-23 notice | 自然资源部 国家林业和草原局关于启用贡嘎山等9座山峰高程数据的公告, via 国家林草局网站 2023-11-01 | https://www.forestry.gov.cn/c/www/lcdt/529413.jhtml |
| 玉龙雪山 5590.2 m (2025) | 云南省自然资源厅 report on the 自然资源部/国家林草局 notice, 2025-06-23 | https://dnr.yn.gov.cn/html/2025/shengtingdongtai_0623/4049856.html |

## 3. NASA (US-PD)

Planetary Fact Sheet (updated 18 March 2025), Sun Fact Sheet (updated 9 May 2024), and the satellite and Pluto sheets, with page dates read by verifier2: Jovian 6 Dec 2023, Saturnian 22 Jul 2025, Uranian 11 Mar 2023, Neptunian 11 Mar 2024, Pluto 11 Jan 2024. `as_of_year` now equals each page's own "Last Updated" year. Values for the Sun and moons are **2 x the NASA radius** (NASA lists radius there); the `derived` field states the arithmetic. Pluto's own diameter (2376 km) is on the main Planetary Fact Sheet; the Pluto sheet lists only radii.
- https://nssdc.gsfc.nasa.gov/planetary/factsheet/
- https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html
- https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html
- https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html
- https://nssdc.gsfc.nasa.gov/planetary/factsheet/uraniansatfact.html
- https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptuniansatfact.html
- https://nssdc.gsfc.nasa.gov/planetary/factsheet/plutofact.html

## 4. USDA FoodData Central, SR Legacy (CC0)

Fetched through the FDC REST API using the public `DEMO_KEY` (not a secret) with `dataType=SR Legacy`; value = nutrient 208 Energy, KCAL per 100 g. The exact API URL for each fact is in `source_url`. `as_of_year` = 2019 (SR Legacy, `lastUpdated 4/1/2019`). The CC0 status is as stated in the spec ([VERIFY] in the spec still applies; not independently re-checked). `DEMO_KEY` hit its rate limit (HTTP 429) partway through, so only 23 foods were collected. Verifier2 re-read each value from the keyless portal JSON `https://fdc.nal.usda.gov/portal-data/external/<fdcId>` (same record: description and Energy kcal matched for all 23).

## 5. AnAge, Human Ageing Genomic Resources (CC-BY-3.0, accepted by CTO 2026-10-15)

Source of adult weight (g, converted to kg) and maximum longevity (years) per species: https://genomics.senescence.info/species/entry.php?species=<Latin_name> (one page per fact in `source_url`). Terms at https://genomics.senescence.info/legal.html (re-read by verifier2): "This work is licensed under a Creative Commons Attribution 3.0 Unported License."; "HAGR is free for all purposes, including commercial, educational, and research purposes, provided you mention the use of HAGR in subsequent presentations, publications, etc."; bulk access needs prior contact (about 60 single-entry pages were read, which is not bulk). Species were kept only where AnAge data quality is "High" or "Acceptable"; "Questionable" entries (domestic cat, domestic cattle, saltwater crocodile) and entries with a missing or ambiguous field (emperor penguin, chicken/red junglefowl, horse longevity, Galapagos tortoise weight) were left out of the affected measure.

**Required credit line (put on the 数据来源 / data-sources page, same treatment as GeoNames):**
> 动物数据来自 AnAge / Human Ageing Genomic Resources (HAGR)，CC BY 3.0。AnAge / Human Ageing Genomic Resources (HAGR), licensed under CC BY 3.0, https://genomics.senescence.info
Optional scientific citation HAGR asks for: de Magalhaes JP et al. (2024) Human Ageing Genomic Resources: updates on key databases in ageing research. Nucleic Acids Research 52(D1):D900-D908. Each AnAge fact carries the same credit in its `attribution` field.

`animal_life` is the **maximum recorded** longevity (mostly captivity; 蓝鲸 and 虎鲸 are wild estimates), displayed as "最长寿命纪录" (`label` field), never as typical lifespan.

## 6. Local-government river pages: DROPPED from v1 (CTO 2026-10-15)

The four river facts are in `_dropped/river.jsonl` (all four values re-confirmed on http://slj.xianning.gov.cn/slwh/201604/t20160413_1056925.shtml, 2016, not 水利部). Not part of v1 content. The two source pages disagree on other rivers, so only the four agreeing ones were ever collected. The lake measure is also dropped (no consistent official source).

## Sources tried and rejected / unreachable

- Wikipedia, Baidu Baike, third-party news mirrors (thepaper, chinanews, etc.): not used as a value source (spec 3.4).
- Many provincial government hosts refused or reset connections from the fetch tool (ECONNREFUSED/ECONNRESET/403): 广东, 山东 (certificate mismatch), 河南, 四川, 浙江, 湖南, 安徽, 河北, 广西, 江西, 云南, 山西, 陕西, 甘肃, 贵州 provincial bulletins. See README for the list of URLs a human can try from a mainland-China connection.
- The stats.gov.cn yearbook tables (fu03*.pdf) are PDF and could not be text-extracted here.
- Lake areas: the pages found conflict with each other (e.g. 太湖 2445 vs 2338 on the same page), so no lake facts were written.

## 7. GeoNames (CC BY 4.0): city coordinates for the computed `distance` measure

Added 2026-10-15 by `apps/bibiyi/game/tools/make-distances.js`. Source: GeoNames `cities15000.zip` (https://download.geonames.org/export/dump/cities15000.zip, fetched 2026-10-15), licence CC BY 4.0, https://www.geonames.org. Only the coordinates of 39 mainland cities that already have a population fact (`city_pop` / `prov_pop`) are used; they are listed with their GeoNames ids in `distance-cities.json`.

`distance.jsonl` holds 150 neutral city pairs ("北京—上海", unit 公里). Each value is **computed**, not read: haversine (R = 6371.0088 km) between the two GeoNames points, rounded to 10 km, cross-checked against Vincenty's inverse formula on WGS-84 (the tool fails above 0.6 % difference; the worst pair differs by 0.34 %). Facts carry `method: computed`, licence `CC-BY-4.0`, publisher GeoNames and the credit line "GeoNames (CC BY 4.0), https://www.geonames.org，直线距离为本游戏计算". The source line on a card reads "来源：GeoNames，本游戏计算 · 2026"; the 数据来源 page lists GeoNames.
Re-run: `node tools/make-distances.js` (downloads GeoNames; exit code 2 and nothing written if it cannot).

## 8. Edits made at integration (CTO decisions 2026-10-15, see docs/bibiyi/decisions.md)

- `_dropped/animal_life.jsonl`: 加拉帕戈斯象龟 (177 years, anecdotal per AnAge) removed from v1; `river.jsonl` removed (rivers are in `_dropped/river.jsonl`).
- `animal_weight`: 非洲野驴 relabelled 驴 (id `f_animal_weight_lv`); the AnAge entry Equus_asinus is the domestic donkey. Value unchanged.
- `pools.json`: which facts are in the free pool (bundled) and which in the daily pool (server only), assigned deterministically by `tools/build-content.js` and never moved afterwards.
- Source URLs: `http://` hosts upgraded to `https://` (tjj.hubei.gov.cn and tjj.ln.gov.cn answer 200 over https; tjj.zhengzhou.gov.cn answered 403 to our client both ways, so its fact keeps the page the verifier read, scheme only changed). USDA API URLs (they carry the public DEMO_KEY) are shown as the public food page `https://fdc.nal.usda.gov/fdc-app.html#/food-details/<fdcId>/nutrients`.
