# 点将台: WeChat 小游戏 account registration rules (founder checklist)

Date: 2026-10-15. Author: release. Scope: research only (no uploads, nothing submitted).
Entity: founder's Beijing (mainland China) company, 主体 type 企业. Monetisation: IAA only (no IAP). Context: spec §0 (D9, D11, D14), §16; direction §8.

Legend: **VERIFIED** = read on an official page today (URL given). **UNVERIFIED** = only third-party, old (kf.qq.com pages dated 2019), or community text; confirm on the live form before relying on it. Official pages do not publish many numbers; the admin console form is the final authority, so screenshot each form as you go.

Main official sources (小游戏接入指南, left sidebar in this order):
- Guide index: https://developers.weixin.qq.com/minigame/introduction/guide/
- IAA release flow: https://developers.weixin.qq.com/minigame/introduction/guide/iaa.html
- Rules (运营规范, 小游戏 section 三): https://developers.weixin.qq.com/minigame/product/ and https://developers.weixin.qq.com/miniprogram/product/

## Order of work (official IAA flow, iaa.html)

1. 注册账号 -> 2. 名称/简称/头像 + 类目设置 -> 3. 微信认证 + 适龄提示 + 资质审核 (parallel) -> 4. 版本审核 and 备案 (小游戏备案 + 小程序备案, can be submitted in parallel) -> 5. 发布.
Development may run in parallel; nothing needs to wait for these reviews. Enterprise 主体 must have WeChat 认证 before it can submit 小程序备案 (guide index). Release needs both the version review and the 小程序备案 done ("需在小程序备案也完成后，方可发布", bbsh.html).
Official duration estimate for the whole IAA route: **13-37 working days** (guide index). Start the slow items (备案, 10-30 working days) as early as the prerequisites allow.

---

## Step 1. Register the account

URL: https://developers.weixin.qq.com/minigame/introduction/guide/register.html ; flow: https://kf.qq.com/faq/170109iQBJ3Q170109JbQfiu.html ; https://developers.weixin.qq.com/miniprogram/introduction/

| # | Field / step | Rule | Status |
|---|---|---|---|
| 1.1 | Entry | mp.weixin.qq.com, click 立即注册 / 前往注册, choose account type **小程序** (a 小游戏 is a 类目 of 小程序, there is no separate account type) | VERIFIED |
| 1.2 | Email | One email per account. Must never have been registered on 公众平台, 开放平台 or 企业号 and must not be bound to a personal WeChat ("未注册过公众平台、开放平台、企业号、未绑定个人号的邮箱"). Use a dedicated company mailbox (e.g. a shared alias), not a personal one; it receives activation and notices | VERIFIED |
| 1.3 | Password | Set on the same page (rules not published; follow the form) | UNVERIFIED |
| 1.4 | Activation | A 6-digit code is emailed; enter it on the registration page (kf flow). The older miniprogram intro says "click the link in the activation email". Either way, finish within the session | VERIFIED (mechanism varies by page) |
| 1.5 | **Category choice at registration** | The form asks **小游戏** or **其他**. Choose **小游戏**. Official warning: "小游戏类目一旦设置成功，将不得修改为其他一级类目，请谨慎选择" (the first-level category can never change; a wrong choice means registering a new account). Mini game accounts get only the 游戏 first-level category (type.html) | VERIFIED |
| 1.6 | 主体 type | Choose **企业** (companies, branches, related brands). Not 企业（个体工商户） unless the entity is a sole proprietorship. 个人 cannot do the 文化互动/角色/牌类 subcategories, and the founder's company is the decided entity (D9) | VERIFIED |
| 1.7 | Subject info | Enter the company name, **统一社会信用代码**, upload the business licence photo. Business licence upload rule (for 备案 but a good standard): original, colour, in validity, corners and edges visible, no copies or re-photographed electronic versions, 100-200 KB, at least 1500x1100 px (record_material.html) | Licence entry: VERIFIED in outline; exact registration-form upload spec UNVERIFIED |
| 1.8 | Verification route (enterprise picks one) | (A) **对公打款**: transfer the amount shown after submission from the company's corporate bank account to Tencent's account; **must be completed within 10 days or registration fails**. (B) **微信认证**: pay the **300 yuan** fee; some features stay unavailable until certification passes. Because the 小游戏备案 path needs 微信认证 anyway (see step 3), the plan should be route B, or A then B | VERIFIED |
| 1.9 | Administrator (管理员) | Name, ID number, mobile; the admin is verified by a WeChat real-name check (扫码 with the admin's WeChat). **Face scan** is not described on the registration pages; treat the face check as expected but UNVERIFIED for registration. A face scan IS required for the 备案 responsible person (xcxba / guidelines.html: "负责人需完成人脸核身"). The admin's WeChat must be real-name (bank card or ID) | Admin scan: VERIFIED. Face scan at registration: UNVERIFIED |
| 1.10 | Legal representative (法人) | Registration pages do not mention legal-representative verification (VERIFIED absent). WeChat 认证 uses a signed, sealed 公函 where the legal representative/responsible person signs and the company 公章 is applied (third-party 2016-2019 sources, UNVERIFIED for 2026). For 备案 the 主体负责人 need not be the 法人 but if different an authorization letter may be required; **Beijing does not require the 小程序负责人 authorization letter** (record_material.html lists 北京 among the places that don't). 主体负责人 authorization (法人 authorises another person): date within 1 month of submission, 公章 (not 合同章/项目章), handwritten 正楷 signature | 备案: VERIFIED; 认证: UNVERIFIED |
| 1.11 | Confirm | The page forces "确认主体信息不可变更": subject info is **locked** after this. Check company name spelling exactly as the licence | VERIFIED |
| 1.12 | Registration/binding caps | Per-email/per-subject limits are documented at https://developers.weixin.qq.com/community/minigame/doc/00004263b00290c615a3ae75e66008 (page did not render; values unknown) | UNVERIFIED |

### 复用资质 / quick register (only if the company already has a verified account)
Source: https://developers.weixin.qq.com/community/business/doc/000200772f81508894e94ec965180d (WeChat community, official reply, about a year old).
- If the company has a **certified 公众号 (enterprise, media, government or other organisation; 个体工商户 included)**, there is a quick path: 公众号 backend -> 小程序管理 -> 添加 -> 快速注册并认证. It skips re-submitting 主体 materials, the 对公打款 and the **300 yuan** fee. Limit: **5 mini programs per 公众号 per month (1 for 个体工商户)**. The 认证 validity matches the 公众号's; the **annual renewal is filed separately** in the mini program backend.
- The email still must not be bound to any personal WeChat/公众号/小程序/开放平台.
- Caveat: 2023-2024 community threads say this was tightened or inconsistent ("小程序不能复用公众号认证资质"). **UNVERIFIED for 2026**. Also the 小游戏 first-level category is chosen differently here (check that the quick-register flow lets you pick 小游戏; if it only creates a plain 小程序, you cannot change it to 小游戏 later, per the immutability rule). Founder should say whether the company has a verified 公众号 / 服务号; if not, ignore this section.
- Note the 企业 may already own a verified 开放平台 account; this is a separate route and not covered by these docs.

---

## Step 2. 基本信息 (name, short name, avatar, introduction)

Console: 首页 -> 小程序信息 "前往设置" (name.html), later 设置 -> 基本设置 -> 基本信息. Setting takes effect immediately after save, except protected-word names.
Order: this needs the account to be certified (certified users must finish 认证 first; 对公打款 users can set it after payment verification, miniprogram intro 2.2). The IAA flow lists it as step 2 and says 微信认证 can run in parallel with name/icon/category setup (guide index).

### 2.1 Name (名称)
| Aspect | Rule | Source / status |
|---|---|---|
| Length | **4-30 characters, one Chinese character counts as 2**. So a pure-Chinese name is **2-15 Chinese characters**; "点将台" = 6 chars (passes); "点将台：三国点将" = 7 Chinese + a full-width colon (colon counts per symbol rules) is about 16-18 chars | https://kf.qq.com/faq/170109umMvm6170109MZNnYV.html (old FAQ but matches 2025-12 community reply). Mostly VERIFIED, UNVERIFIED on how the colon counts |
| Allowed characters | Chinese, digits, English letters, spaces and some special symbols (full list not published) | same, VERIFIED; symbols UNVERIFIED |
| Uniqueness | Cannot duplicate a name of an account under a **different 主体** (including 公众号). Same-主体 accounts may share a name (or add "+"). After a rename the old name is protected 2 days for the same 主体 | kf FAQ, VERIFIED |
| Banned words / content | No politics/sex/violence/terror (2.2); no commercial terms, trending phrases, popular app/account names, "国家级/最高级" and ad-law banned words, e.g. "免费" (2.3); no "微信/腾讯/Tencent/Weixin/QQ" or look-alikes (5.14.1, 9.3); no unauthorised third-party trademarks (2.4); no money or prize inducement in name/intro (小游戏 2.1.5) | https://developers.weixin.qq.com/minigame/product/ and /miniprogram/product/ , VERIFIED |
| Relevance | Name, icon and intro must relate; game names must match the content (the example given: you cannot call a match-3 game "三国群英") (小游戏 2.1.4). 点将台 + 三国 content is consistent | VERIFIED |
| Generic words | A name consisting only of generic/category words with no distinctiveness is not allowed (2.5, 5.14.7). "点将台" is a historical term (the platform where a commander assigns generals) and is distinctive enough as a coined game title, but it is also a common phrase and may be a **protected word or already registered** by another 主体 or a trademark owner | Rule VERIFIED; whether 点将台 is taken or protected: UNVERIFIED until you try it |
| Protected words / restricted fields | If the name hits a protected word the system asks for extra materials (business licence, **版号 and related authorisation**, trademark authorisation, etc.). Review: **1-3 working days** (name.html; the old kf FAQ says up to 7 working days). So IAA-only could be blocked if 点将台 hits a game-name protection that wants 版号; the fallback is a qualifier | name.html, VERIFIED |
| Name already taken | Note the other account's ID, file an infringement complaint with materials. About **7 working days**, then a **7 calendar day** protection window before the name is released. If it fails, supplement materials or use another name | name.html, VERIFIED. Your trademark clearance (D11) is the evidence to bring |
| Qualifiers | "点将台：三国点将" or "点将台三国" style is allowed in principle (a qualifier is not prohibited and helps with distinctiveness, uniqueness and relevance), but do not stuff keywords (2.5/5.14.7: "堆砌热门搜索词" is banned) and the colon style is not an official requirement. If the plain "点将台" is taken or protected, prefer ONE short qualifier such as "点将台三国" or "三国点将台", not a keyword string. | Practice is INFERENCE; rules VERIFIED |
| Changes per year | **2 per calendar year (domestic accounts)**; after they are used, WeChat 认证 can unlock more; a successful 认证 resets the count to 2. Before first publishing the small-program FAQ also allows 2 changes. A 2025-12 community reply says non-personal 主体 get 2 free per year, then rename via 认证 (+2) | kf FAQ + community, VERIFIED on 2/yr |
| Linked obligations | If the name changes after 备案, **the filing information must be updated promptly**, and during filing review the name cannot be changed; failure risks warning, feature restriction or forced cancellation of the filing (5.35, nrjs.html). So lock the name BEFORE submitting 备案 | VERIFIED |
| Short name (简称) | optional; 4-10 characters (Chinese = 2), taken in order from the full name, need not be unique; 2 changes before publishing, then 2 per year; deleting uses one | kf FAQ |

### 2.2 Avatar (头像 / logo)
| Aspect | Rule | Status |
|---|---|---|
| Format | bmp, jpeg, jpg, gif | https://kf.qq.com/faq/170109nQRFJb170109fi6JJR.html, UNVERIFIED for 2026 (page ~2019; the live uploader may also take PNG) |
| File size | not larger than **2 MB** | same |
| Dimensions / aspect | **Not published** on any official page I could reach. Use a square (1:1) image, at least 144x144, ideally 512x512 PNG/JPG with a coloured background | UNVERIFIED (INFERENCE: square) |
| Content | no politics/pornography; no third-party marks, no celebrity/brand/game likeness (2.4, 5.29.5, 5.14.6); must relate to the name and intro (2.1); an opaque coloured background is recommended (13.4). Do NOT imitate Koei/三国杀 icons. Our design: cinnabar "点将" seal (direction §8) | VERIFIED |
| Changes | old page: **5 per calendar year**. Newer pages state no limit. UNVERIFIED; plan on 5/year | UNVERIFIED |

### 2.3 Introduction (介绍 / 简介)
| Aspect | Rule | Status |
|---|---|---|
| Length | **4-120 characters** (here characters, not double-weight; the old page says "介绍字数为4-120个字") | kf FAQ page, UNVERIFIED for 2026 |
| Changes | old page: **5 per month**. Newer pages state no limit | UNVERIFIED |
| Content | must match the actual services (3.1) and the name/logo (2.1); no commercial terms/discount claims (2.3, 2.10.4); no money or real-prize inducement (小游戏 2.1.5); no keyword stuffing (5.14.7); must not imply Tencent affiliation (5.14.1); no state-law-prohibited content | VERIFIED |
| Suggested text (<=120 chars, INFERENCE) | "五轮翻令，点五员三国大将，看你的阵容能否十二战全胜。每日同一手令，与好友、群友比一比。" (47 chars; no rewards or "免费"; no mention of any other game) | draft |

### 2.4 Service category (服务类目): which to pick
Page: https://developers.weixin.qq.com/minigame/introduction/guide/type.html ; Console: 首页 "去补充" (mini program category) -> 添加类目 (admin QR scan) -> choose a second-level and third-level category. Takes effect immediately on save.
- **Level 1**: 游戏 (fixed at registration, cannot change).
- **Level 2**: chosen during application, editable before release (except 文化互动), locked after release. Official examples: 角色, 休闲, 动作. The full current list is only shown in the console. UNVERIFIED which of 休闲 / 策略 / 益智 appear as options.
- **Level 3**: editable any time in qualification management (needs re-review and a new released version).
- If the level-2 category does not match the actual game, **the version will be rejected in review**.
- 文化互动, 角色 and 牌类 are closed to individuals (we are an enterprise, so that is not a blocker).

| Candidate | Fit for 点将台 | Requirement for IAA |
|---|---|---|
| **休闲** (casual) | Best fit: 60-second rounds, no deep progression, one-thumb play, casual audience (direction §2) | IAA qualification route "情况二": no payment qualification. 软著 required only if the name contains English or the word "软件", or the game involves brands/public figures (zzsh-iaa.html) |
| 策略 | Plausible (draft/line-up), but players and reviewers expect SLG depth; risk of mismatch rejection and of attracting 三国 SLG comparisons | likely the same IAA route; UNVERIFIED |
| 益智 | Weak fit (it is not a puzzle) | likely the same |
| 角色 / 文化互动 | No (not an RPG; 文化互动 is permanent and cannot take payment) | no |

**Recommendation: 游戏 > 休闲** (then a 3rd-level casual-style option that matches "draft/grade"; choose the closest offered in the console). Keep the option to switch level 2 before release if the reviewer disagrees, but note level 3 changes need re-review.

**Documents for IAA-only** (zzsh-iaa.html, 资质审核 IAA, normal review 1-3 days):
- Scenario: pick **情况二** ("no virtual payment now or in future"), choose the matching third-level category and **do not apply for a payment qualification**.
- Upload the materials the form lists, each in its matching module (misplaced = rejected). Must meet NPPA (国家新闻出版署) requirements.
- **软著**: required only for the cases above (English or "软件" in the name, brands or public figures). 点将台 has none of these (but if a 三国 historical-figure name is judged "public figure" the reviewer may ask; the spec uses historical figures, so keep a 软著 ready: D14 notes it as a release item).
- **版号**: **not required for IAA with no virtual payment**. The 网络游戏出版物号核发单 is listed as required only for IAP (zzsh-iap.html). Caveat: a name-protection hit can still ask for it (see 2.1).
- **自审自查报告**: not mentioned on any current official page I found (an old 2019 36kr article called it mandatory). UNVERIFIED; the form will tell you.
- **中宣部实名认证** system: only for games with virtual payment (zxbsm.html). Not needed for us.
- Common rejection reasons in this review: inconsistent names or signing entities, unclear or wrong seal (must be the company 公章, not 合同章/项目章/财务章/电子章), signatures not matching, missing dates.

---

## Step 3. 微信认证 (WeChat verification)

Pages: https://developers.weixin.qq.com/minigame/introduction/guide/wxrz.html ; settings entry: 小程序后台 -> 设置 -> 微信认证详情. Materials list: official FAQ "小程序微信认证所需资料" on kf.qq.com (link from wxrz.html, not fetched).
- **Fee: 300 yuan** per verification (official registration pages). Third-party sources: valid for **one year**, annual renewal, paid to a third-party reviewer, non-refundable even if it fails. Fee = VERIFIED, annual renewal/non-refund = UNVERIFIED.
- **Timeline: 1-3 working days** (wxrz.html, VERIFIED). Third parties report half a day to a few days.
- **Documents (enterprise, UNVERIFIED for 2026)**: business licence; 公函 (letter) signed by the legal representative/responsible person and stamped with the 公章; the admin's identity info; phone; plus a phone call from the verifier. An invoice is an optional extra.
- **Order**: 认证 can start right after registration and can run in parallel with name/icon/category. **It must be passed before 小程序备案 can be submitted** for an enterprise (guide index). So: 注册 -> 认证 (parallel with name/avatar/intro/category) -> 备案. Also name changes are cheaper after 认证 (count resets to 2).
- 认证 is also a prerequisite for 流量主 in practice (UV > 500, phase0-platform.md §7.1) and unlocks more tester slots (see step 5).

---

## Step 4. 备案 (filing): 小游戏备案 first, then 小程序备案

Pages: https://developers.weixin.qq.com/minigame/introduction/guide/nrjs.html (小游戏备案), https://developers.weixin.qq.com/minigame/introduction/guide/xcxba.html (小程序备案 entry), https://developers.weixin.qq.com/miniprogram/product/record/guidelines.html (operation guide), https://developers.weixin.qq.com/miniprogram/product/record/receord_category.html (service content), https://developers.weixin.qq.com/miniprogram/product/record/record_material.html (materials).

Two steps, in this order (iaa.html): 小游戏备案 (the game-content filing, with the publishing authority, about 10-20 working days of review) then the 小程序备案 (the MIIT/ICP filing, 5 stages). The two entries are under 设置 -> 基本设置 -> 小程序备案 -> 去完善, and for the game filing "前往提交" next to 小游戏备案. The IAA scenario is **情况二** (10-30 working days overall; IAP is 情况一, 5-12 working days).

### 4.1 小游戏备案 (nrjs.html)
- Prerequisite: qualified entity, 认证 done. Game name and 主体 **must stay the same** as in the qualification review; no changes allowed while the filing is under review or after it is approved.
- Fields: describe the game truthfully and completely, including **场景、玩法、功能** (scene, gameplay, features); upload screenshots that match in size and version (detailed requirements in an official "微信小游戏备案攻略" which I could not fetch).
- Statuses: 平台审核中, 平台驳回, 主管部门审核中, 主管部门已驳回, 主管部门已通过, 信息更新.
- Timeline: **platform review 1-2 working days; authority review 10-20 working days**; any revision or rejection restarts the clock on resubmission. Withdraw ("撤回") to edit while in platform review. Resubmit not possible while the authority is reviewing or after approval.
- **What to put as the service content description (INFERENCE from the rule "scene, gameplay, features, accurate and complete")**: write plain facts, matching the build you will submit (one version). Draft:
  > 《点将台》是一款原创三国题材的休闲小游戏。玩家每局翻五轮令牌，从候选三国武将中选出五员大将组成阵容，系统按规则模拟十二场战役并给出评级和战报复盘。每日提供全员相同的「每日军令」，玩家可在好友榜、群排行榜中比较成绩，也可以主动把成绩分享给好友或群聊。游戏免费，不含内购、虚拟货币、抽卡或随机付费，不提供现金或实物奖励；收益来自玩家自愿观看的激励视频广告。不含聊天、用户上传内容、地图。数据存于微信云开发。
  Keep: scene = casual short sessions; gameplay = draft five generals, simulated 12 battles; features = daily seed, friend/group boards, voluntary share, rewarded video. Do not use: "抽卡", "赌", "奖金", "免费送", sports league names, other games' names. Screenshots must show the real UI in the same resolution/version, with no mock-ups.
- Prior-approval category: for 游戏 the guide cites 前置审批 = publishing (版号). In the IAA route (情况二) it is accepted without a 版号 (the qualification review tells the system you are 情况二); if the filing form asks for an approval number, that conflicts, so stop and ask the founder to check the 情况二 flag. UNVERIFIED.

### 4.2 小程序备案 (xcxba.html + guidelines.html)
Five stages: 信息填写 -> 平台初审 (1-2 working days) -> **工信部短信核验** -> 通信管理局审核 (1-20 working days; Beijing 管局) -> 备案成功.
- **MIIT SMS must be answered within 24 hours or the filing is auto-rejected** and must be resubmitted. The SMS goes to both the 主体负责人 and the 小程序管理员/负责人 phones; keep both reachable.
- Fields: 主体信息 (company name, licence, 统一社会信用代码, address), 主体负责人 (name, ID type/number, a personal phone, an emergency contact phone: **each person needs their own number**), 小程序信息 (name, service content, game approval number if prior-approval applies), 小程序负责人, and **face verification** of the responsible person (white or light background, no hat/mask/headphones). The platform handles the on-site photo and the internet information service commitment letter.
- **Service content (服务内容)**: choose per the guide: 休闲娱乐 > 游戏 > **网络游戏类**.
- Materials: 营业执照 per 1.7; 授权书 only if the 主体负责人 is not the 法人 (Beijing: 小程序负责人 authorisation letter not required, 主体负责人 authorisation still applies if not the 法人).
- Prefer the **法定代表人 as 主体负责人 and 小程序负责人** to avoid authorisation letters. UNVERIFIED whether the form forces this.
- After release the filing number appears automatically on the mini program's "更多资料" page. Name/负责人/contact changes later require a filing update (5.35).
- Cannot publish before this completes (bbsh.html).

---

## Step 5. Settings to configure after registration

### 5.1 用户隐私保护指引
Path: MP 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新 (the guide has two path descriptions: "设置-基本设置-用户隐私保护指引" also appears; use whichever the menu shows). Page: https://developers.weixin.qq.com/minigame/introduction/guide/privacy.html . No deadline is stated, but it is required at version review (bbsh.html step 2). A declared type must match actual use or the API fails with **112** ("api scope is not declared").
Items to declare, from spec §16 (INFERENCE on exact menu wording; choose the closest standard type):

| # | Item | Why | Interface |
|---|---|---|---|
| 1 | **微信朋友关系** (friend relationship) | friend and group boards | setUserCloudStorage, removeUserCloudStorage, getFriendCloudStorage, getGroupCloudStorage; purpose: "用于在好友榜、群榜中展示你和好友的今日战绩". Also `scope.WxFriendInteraction` |
| 2 | **OpenID / 用户标识** (custom info type "增加其他自定义信息类型" if the menu lacks it) | one daily attempt, runs, challenges, ranks; retention 180 days | cloud function context |
| 3 | **Group info (openGId, group membership)** custom item | group board via getGroupEnterInfo | decrypted in joinGroup |
| 4 | **Game records / gameplay data** custom item | scoring, boards, replay; 180 days | |
| 5 | **Device info (platform, WeChat version, screen size)** | layout, debug, analytics | getWindowInfo/getDeviceInfo (the menu may list this as 设备信息) |
| 6 | **Analytics events** (custom item) | go/kill metrics, bugs | own track |
| 7 | Ad data | platform-handled; mention only if the form asks (广告) | WeChat ad SDK |
| 8 | Phase 2: **相册（仅写入）** | save card to album | do NOT declare in Phase 1 |

Not collected, and do not tick: nickname/avatar to our servers, phone, location, album (Phase 1), contacts, mic, camera, clipboard, ID, payment.
Also: if you can truthfully say "we process no personal info" the console offers "确认承诺未处理用户任何信息"; that is false for us (OpenID, 微信朋友关系), so do not use it. After the review passes the platform generates the 小程序隐私保护指引 document and opens `wx.openPrivacyContract`. Fill the developer contact email/phone on the form. Data location: mainland WeChat Cloud only.

### 5.2 Server domain whitelist (开发管理 -> 开发设置 -> 服务器域名)
- Cloud Development calls (`wx.cloud.*`) need **no** domain.
- Phase 2 portrait CDN: an **ICP-filed, HTTPS** domain added to `request` and `downloadFile` (D9 step 5). Not needed for Phase 1 (alternative: cloud storage `cloud://`). No action now. Exact limits (domains per list) UNVERIFIED.

### 5.3 Testers (体验成员) and members
Path: 用户身份 -> 成员管理 -> 添加成员 (miniprogram intro 2.4). Limits for **non-individual** accounts: **30 project members + 30 experience members** (uncertified, unpublished); **60 + 60** (certified but not yet published, or uncertified but published); **90 + 90** (certified and published). Individual: 15 + 15. Each tester must have a WeChat account bound to their WeChat ID. VERIFIED. To reach 15-20 groups in the prototype the founder uses the 体验版 (experience version) QR: only the 体验成员 can open it, so group testing beyond 30-60 people requires publishing or a different route. Flag for the founder. (INFERENCE)

### 5.4 代码上传密钥 and IP whitelist
Path: 管理 -> 开发管理 -> 开发设置 -> 小程序代码上传 (https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html). Generate the key (the private key file is downloaded once; if lost it must be reset). IP whitelist is optional but recommended: when on, only listed IPs can call. Put the file path in env var `MP_UPLOAD_KEY_PATH`; never commit or chat it. Our CI uploads need the runner's IP whitelisted (static IP or leave the whitelist off with a conscious risk decision by the founder). Also copy the **AppID** from 开发设置 (miniprogram intro 2.4).

### 5.5 Enable 云开发 (WeChat Cloud Development)
Done in WeChat DevTools (云开发 button, create the environment) after the AppID is bound; requires the account to be a developer. Free base quota and the environment count depend on the plan (UNVERIFIED; the guide URL I tried was not available). Set cloud-function `TZ=Asia/Shanghai` and timeouts (spec §17 C4).

### 5.6 适龄提示 (age appropriateness) - required
Path: 设置 -> 基础设置 -> 基本信息 -> 适龄提示 (https://developers.weixin.qq.com/minigame/introduction/guide/slts.html). Required by the version review (bbsh.html). Options 8+, 12+, 16+; the platform reviews it, then shows a marker on the launch page next to the health-gaming notice.
- Likely fit: **12+** ("clear story and character relationships, some adaptation of historical events that won't be confused with reality", 2D hand-drawn look, no stranger chat). 8+ requires "simple friendly settings" and no real-event adaptation, so it is a poorer fit. 16+ is for realistic 3D. Recommendation: **12+** (INFERENCE; the console shows the criteria table). Our "12 battles" simulation has no gore.

### 5.7 Store listing at submission: 游戏简介 / 截图
- Version review (bbsh.html): choose the engine; complete the privacy guide; set the age prompt; write the version update notes; upload **宣传图 (optional, "非必填")**; developer info: **Apple developer account is mandatory (an email address is accepted)**; submit. Normal review: **1 natural day**. After review passes, 小程序备案 must also be complete before publish.
- No dedicated 游戏简介 or 截图 field was found in version review; the account intro (2.3) and the 备案 screenshots (4.1) are the listings that count. UNVERIFIED; check on the form.
- Expedited review: not for the first version; 2 per quarter after launch and needs 5,000 registered users.
- Reminder (release agent): **submitting for review and publishing are done by the founder** in the console.

---

## Blockers and risks (summary)

1. **Name availability of "点将台"** cannot be checked from here; the name page may demand extra materials (a 版号 is listed among the possible protected-word materials). Fallback: one short qualifier ("点将台三国").
2. **备案 timing**: 10-30 working days (IAA); can start only after 认证 (1-3 working days). Full route 13-37 working days. Do not change name, entity or screenshots mid-filing.
3. **Beijing company**: need the 法定代表人 or an authorised 主体负责人 for face verification and for SMS reachability within 24 h.
4. **Tester cap** for the 15-20 group distribution; **流量主** needs UV > 500 (stub ads for Phase 1, D5).
5. UNVERIFIED items: avatar pixel size, avatar/intro change counts, 认证 document list, face scan at registration, 复用资质 in 2026, 自审自查报告, level-2 category list.
