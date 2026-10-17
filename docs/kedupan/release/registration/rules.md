# 群友刻度盘: registration rules check

Date: 2026-10-15. Author: release. Scope: read-only research against the current rules; nothing registered or submitted.
Result legend: **PASS** = the draft satisfies the rule; **NEEDS-FOUNDER** = only the console or the founder can decide; **[VERIFY]** = not confirmed from a live official page today.

**Access note (honest).** On 2026-10-15 I could not open developers.weixin.qq.com directly from this environment (fetch errors: "socket closed" / "unable to verify domain"; a direct connection timed out). The rule values below are therefore taken from `docs/dianjiangtai/registration/rules.md`, which read those official pages in full on the same date, plus search-result excerpts of the same sites seen today (S5, S6). Anything the official pages do not publish is marked [VERIFY]. The admin console form is the final authority: screenshot each form as you fill it.

Sources (all accessed 2026-10-15):
- S1 小游戏接入指南, register / name / category: https://developers.weixin.qq.com/minigame/introduction/guide/register.html , https://developers.weixin.qq.com/minigame/introduction/guide/name.html , https://developers.weixin.qq.com/minigame/introduction/guide/type.html
- S2 IAA qualification review: https://developers.weixin.qq.com/minigame/introduction/guide/zzsh-iaa.html ; 微信认证: https://developers.weixin.qq.com/minigame/introduction/guide/wxrz.html
- S3 运营规范 (小游戏 and 小程序): https://developers.weixin.qq.com/minigame/product/ , https://developers.weixin.qq.com/miniprogram/product/
- S4 Name / avatar / intro FAQ (old, 2019-era): https://kf.qq.com/faq/170109umMvm6170109MZNnYV.html , https://kf.qq.com/faq/170109nQRFJb170109fi6JJR.html
- S5 评测标准 (the 休闲 grouping): https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-mesure.html
- S6 Community: avatar size 144x144 https://developers.weixin.qq.com/community/develop/article/doc/000acc2b3f0178b15cf90fe3b5a413 ; "小游戏可申请的类目及所需特殊资质" https://developers.weixin.qq.com/community/develop/doc/00086aef100a903c280ae3b3c56009
- S7 The 点将台 research, which read these pages in full on 2026-10-15: docs/dianjiangtai/registration/rules.md

---

## 1. Rules (apply to all four mini games)

### 1.1 Name (名称)

| Aspect | Rule | Source | Status |
|---|---|---|---|
| Length | 4-30 characters, **a Chinese character counts as 2** (so 2-15 Chinese characters) | S4 name FAQ (old), matches a 2025-12 community reply | Mostly VERIFIED |
| Characters | Chinese, digits, English letters, spaces and some special symbols; the full symbol list is not published. The middle dot "·" is **not confirmed** | S4 | [VERIFY] for symbols |
| Uniqueness | Cannot duplicate a name held by a **different 主体** (including 公众号); same-主体 accounts may share a name. Cannot be tested offline | S1 name.html, S4 | VERIFIED rule; availability only in the console |
| Banned content | No politics, sex, violence, terror; no commercial terms, popular app or account names, superlatives such as 国家级 / 最高级, ad-law words such as 免费; no 微信 / 腾讯 / Tencent / QQ or look-alikes; no unauthorised third-party trademarks; no money or prize inducement | S3 (运营规范 2.2-2.4, 5.14.1, 9.3, 小游戏 2.1.5) | VERIFIED |
| Relevance | Name, icon and intro must relate to the real content (小游戏 2.1.4) | S3 | VERIFIED |
| Generic-only | A name made only of generic words with no distinctiveness is not allowed (2.5, 5.14.7); no keyword stacking | S3 | VERIFIED |
| Protected words | A hit asks for extra materials (licence, 版号, trademark authorisation); review 1-3 working days (name.html; old FAQ says up to 7). Words such as 中国 / 全国 / 国家 are typically restricted | S1 name.html | VERIFIED mechanism; which words hit: [VERIFY] |
| Taken name | Complaint path takes about 7 working days plus a 7-day hold; just use the next fallback | S1 name.html | VERIFIED |
| Changes | 2 per calendar year (domestic); 认证 resets to 2; before first publication 2 as well | S4, community | VERIFIED |
| Lock before 备案 | A name change during or after 备案 forces a filing update; not possible during filing review | S3 5.35, nrjs.html | VERIFIED |
| Short name 简称 | optional, 4-10 characters (Chinese = 2), in order from the full name, need not be unique | S4 | [VERIFY] 2026 |

### 1.2 Introduction (介绍)

| Aspect | Rule | Source | Status |
|---|---|---|---|
| Official length | **4-120 characters** (old FAQ, characters not double-weight) | S4 | [VERIFY] 2026 |
| Studio limit | **≤ 60 characters**, including punctuation (点将台 commit 6f5576e). Stricter than the official figure, so it also satisfies it | studio decision | PASS (all 12 drafts) |
| Content | must match the real service and the name / icon; no commercial terms or discount claims; no money or prize inducement; no keyword stuffing; no implied Tencent affiliation | S3 (3.1, 2.1, 2.3, 2.10.4, 5.14.1, 5.14.7) | VERIFIED |
| Change count | old FAQ 5 per month; newer pages state none | S4 | [VERIFY] |

### 1.3 Avatar (头像)

| Aspect | Rule | Source | Status |
|---|---|---|---|
| Format | bmp, jpeg, jpg, gif (old page); the live uploader may also take PNG. **We ship both PNG and JPG** | S4 | [VERIFY] 2026 |
| File size | not larger than 2 MB. Ours: JPG 144 px about 5-6 KB, 512 px about 30 KB, 1024 px about 70-80 KB; PNG up to 290 KB | S4 | PASS |
| Dimensions | Not published on any official page I could read. A community post gives **144 x 144** as the standard avatar size (S6). We ship 144, 300, 512 and a 1024 master, all square | S6 | [VERIFY]; 512 square is a safe upload |
| Content | no politics or pornography; no third-party marks, celebrity, brand or game likeness (2.4, 5.29.5, 5.14.6); must relate to the name and intro (2.1); an opaque coloured background is recommended (13.4) | S3 | PASS (original code-drawn art, opaque) |
| Changes | old FAQ 5 per year; newer pages state no limit | S4 | [VERIFY] |
| Legibility | checked on `avatar/preview.png` at 40 px and 100 px, square and circle crop, on light and dark: see `avatar/README.md` | own check | PASS |

### 1.4 Service category (服务类目)

| Aspect | Rule | Source | Status |
|---|---|---|---|
| Level 1 | 游戏 only for a 小游戏 account; fixed at registration; a wrong choice means a new account | S1 type.html | VERIFIED |
| Level 2 | chosen when applying, editable until the first release (except 文化互动), locked after. Mismatch with the real game means the version is **rejected** in review. Official examples: 角色, 休闲, 动作 | S1 type.html | VERIFIED |
| Level 3 | editable any time in 资质管理, needs a new review and a new released version. The option list is shown only in the console | S1 type.html | [VERIFY] labels |
| 休闲 content | the 评测标准 page groups 消除, 答题, 模拟经营, 塔防, 捕鱼, 益智 under 休闲 | S5 | VERIFIED today (search excerpt) |
| IAA qualification | 情况二 (no payment now or later): no payment qualification; **no 版号**; 软著 only if the name contains English or 软件, or brands / public figures are involved | S2 | VERIFIED (via S7) |
| Closed to individuals | 文化互动, 角色, 牌类; we are an 企业, and we do not choose them | S1 | n/a |
| UGC / extra qualification | **re-checked 2026-10-16 (D-2: the game now has a typed clue).** Not found on type.html, zzsh-iaa.html, xcxba.html, nrjs.html or slts.html: none mentions UGC, 社区/社交 categories or extra licences for 游戏 > 休闲. 运营规范 2.7.1, 5.18, 10.x make moderation, complaint response and patrols a duty, not a qualification. See copy.md §4 for the founder's console check | S1-S3, S6 | NEEDS-FOUNDER (console 所需资质 screenshot; the UGC duties are covered in `../rules-check.md` 1.7) |

---

## 2. Applied to 群友刻度盘

### 2.1 Names (offline checks)

Term list scanned (names and intros): 免费 最 第一 官方 唯一 顶级 极 微信 腾讯 Tencent QQ 中国 全国 国家 大小 赌 押 抽卡 金币 奖 红包 Semantle Contexto Wavelength 波长 Gartic Telestrations 传声筒 你画我猜 点将 三国 博彩 竞猜 运气.

| Candidate | Count (CJK = 2) | Chinese chars | Banned-term scan | Result |
|---|---|---|---|---|
| N1 群友刻度盘 | 10 | 5 CJK | none | PASS (offline) |
| N2 群友刻度尺 | 10 | 5 CJK | none | PASS (offline) |
| N3 刻度默契 | 8 | 4 CJK | none | PASS (offline) |
| N4 同频刻度 | 8 | 4 CJK | none | PASS (offline) |
| N5 默契刻度尺 | 10 | 5 CJK | none | PASS (offline) |
| N6 今日刻度盘 | 10 | 5 CJK | none | PASS (offline) |

All candidates are inside 4-30. No candidate contains a banned or restricted term. Availability cannot be checked offline for any of them (NEEDS-FOUNDER, console name check). Order of trying is in copy.md §1.

### 2.2 Introductions

| Draft | Characters (with punctuation) | Banned-term scan | ≤ 60 |
|---|---|---|---|
| I1 | 57 | none | PASS |
| I2 | 48 | none | PASS |
| I3 (rewritten 2026-10-16: 「无需输入文字」 removed, 「也能自己写提示出题」 added) | 48 | none (scan list unchanged: no 免费, 最, 第一, 官方 ...) | PASS (≤ 60) |

### 2.3 Avatar

Original, code-drawn (resvg), opaque, square, no third-party IP, no AI art: PASS. Text on the avatar: None. Pure code-drawn vector shapes, no font licence involved. Details in `avatar/README.md`.

### 2.4 Category

游戏 > 休闲 > 益智 (first choice). A casual opinion-placement game with a reveal, no progression; its only user text is a 12-character moderated clue (D-2). 休闲 is the only sensible level 2. The third level is a loose fit whichever is chosen (it is not a puzzle or a quiz), so pick the closest the console offers and keep 益智 / 答题 as the two candidates [VERIFY]. Result: PASS for the choice of level 2; third-level label and any extra qualification: NEEDS-FOUNDER (console).

---

## 3. [VERIFY] list

Common to all four:
1. Name availability (console only).
2. The middle dot "·" as a permitted symbol.
3. Avatar pixel requirement (not published; 144 x 144 per community) and accepted formats in 2026.
4. Official 介绍 limit (4-120 on the old page) versus our 60.
5. Third-level category labels (console only).
6. Whether 中国 / 全国 / 国家 in a name hits protected words.
7. 认证 document list, annual renewal and the face scan at registration (REGISTRATION-STEPS.md).
8. Per-主体 account cap and per-email limits (page did not render in the earlier research).

This app:
- [VERIFY] Third-level category (益智 / 答题) availability; both are loose fits.
- [VERIFY] That 群友 in the name does not read as a social / community product to the category reviewer (the game has no chat, DMs or public feed; its only user text is a 12-character moderated clue).
- [VERIFY] The in-app search result for 刻度 / 同频 / 默契 (spec H11); name availability.
