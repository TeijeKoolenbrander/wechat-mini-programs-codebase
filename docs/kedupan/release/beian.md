# 群友刻度盘: 备案 (filing) pack

Author: release. Date: 2026-10-15; **service description (section 3) and screenshot list (section 4) rewritten 2026-10-16 for the typed clue (D-2): the game now has user-typed short text, moderated.** **Filing is a legal attestation: only the founder (and the company's legal representative / the designated 负责人) submits it (constitution Art. 5.4).** Nothing was filed.

Sources read 2026-10-15 (all official): 小游戏备案 https://developers.weixin.qq.com/minigame/introduction/guide/nrjs.html ; 小程序备案 https://developers.weixin.qq.com/minigame/introduction/guide/xcxba.html ; 操作指引 https://developers.weixin.qq.com/minigame/product/record/guidelines.html ; 材料示例 https://developers.weixin.qq.com/minigame/product/record/record_material.html ; IAA 指引 https://developers.weixin.qq.com/minigame/introduction/guide/iaa.html ; 资质审核-IAA https://developers.weixin.qq.com/minigame/introduction/guide/zzsh-iaa.html . [VERIFY console] marks a field the pages show only as screenshots.

## 0. What the filing is, in the right order (IAA, no payment = "情况二")

Two filings, in this order, both inside the MP console (设置 -> 小程序备案 -> 去完善), both after 认证:

1. **小游戏备案** (a 前置审批 for IAA games; replaces the 版号 for a game with no in-app purchase). Platform review 1-2 working days, then the 主管部门 review **10-20 working days**. While it is under review or approved the game **name and the company must not change**.
2. **小程序备案** (the MIIT/通管局 filing). Choose **情况二** (IAA). Whole process about **10-30 working days**: 填写 -> 平台初审 (1-2 wd) -> **工信部短信核验: an SMS from 12381 to the 负责人 or 小程序管理员 phone, to be completed within 24 hours at beian.miit.gov.cn, or the filing is rejected automatically** -> 通管局 review (1-20 wd) -> 备案号 issued. The 备案号 then appears on the game's "更多资料" page automatically after release.

Version review (about 1 day) can run in parallel with 小程序备案, but **release needs the 备案号**.

**Timeline consequence (important):** the two filings are sequential, so allow roughly 4-10 weeks from the day you submit. A launch on 2026-11-01 (the date baked into the daily schedule) is unlikely if you start after 2026-10-15. When you know the real launch date, the CTO regenerates the schedule (post-release.md section 9). Tell the CTO the date early.

## 1. 小游戏备案 (pre-approval): fields and values

| Field | Value | Source / note |
|---|---|---|
| 备案路径 | 账号设置 -> 小程序备案 -> 去完善 -> 小游戏备案 -> 前往提交 | nrjs.html |
| 游戏类型 / 情况 | **情况二: IAA, 当前及未来均不需要开通虚拟支付** | nrjs.html, zzsh-iaa.html |
| 游戏名称 | the name that was **accepted at registration** (target 群友刻度盘). Must equal the in-game title and the later 小程序备案 name | nrjs.html: name must stay identical during review |
| 游戏场景 / 玩法 / 功能 introduction | paste section 3 (service description) | "清晰、完整、真实" |
| 截图 | upload the files in section 4: **same size and same version** (all of them from the typed-clue build); the first gameplay screenshot should also show 健康游戏忠告 + 适龄提示 + 游戏名称 (see section 4) | nrjs.html; first-screenshot rule from the community post 000aaa768989c83430717f6596bc01 (search excerpt; page did not render) [VERIFY console] |
| 版号 / 出版物号 | **none (not applicable: no IAP)** | nrjs.html: games with a 版号 skip this step; IAA games do it instead |
| 软著 | **not required for this game**: required only if the name contains English or 软件, or brands / public figures are involved (none) | zzsh-iaa.html. Optional anyway (HANDOFF section 6) |
| 运营授权 / 情况说明 | not applicable (we operate our own game) | record_material.html: only for authorised operation |

## 2. 小程序备案 (MIIT filing): every form field

Pages describe the form mostly as screenshots; field names below follow guidelines.html and the console. Values: **KNOWN** = we fill it; **FOUNDER** = founder's own data (placeholder).

### 2.1 主体信息 (主办单位)
| Field | Value |
|---|---|
| 主体类型 | 企业 (the Beijing company; same as registration) |
| 主办单位名称 | `【FOUNDER: 营业执照上的企业全称，逐字一致】` |
| 主办单位证件类型 | 营业执照 (统一社会信用代码) |
| 证件号码 | `【FOUNDER: 统一社会信用代码】` |
| 证件住所 / 通信地址 (省、市、区、详细地址) | `【FOUNDER: 实际通讯地址, Beijing】` (the 通管局 is Beijing's; the address must be real) |
| 证件扫描件 | `【FOUNDER: 营业执照原件彩色扫描件或照片, JPG/PNG, 边角齐全, 有效期须大于 3 个月】` (formats: JPG/JPEG/PNG; sizes per the console prompt, the pages disagree: "不超过200K不低于100K" vs 2M) |
| 主办单位负责人 (法定代表人 or authorised) | `【FOUNDER: 姓名、证件类型 (居民身份证)、证件号、手机号、邮箱】` |
| 负责人证件 | `【FOUNDER: 身份证正反面彩色照片】` |
| 授权书 | only if the 小程序负责人 is not the legal representative; the Beijing 管局 template [VERIFY console]; **公章** only (not 合同章/财务章/电子章); date within 1 month of submission |

### 2.2 小程序 (小游戏) 信息
| Field | Value |
|---|---|
| 小程序名称 | the accepted name (target 群友刻度盘) |
| AppID | shown by the console; the **real** AppID (see `APPID.md`), never the shared test AppID |
| 小程序服务内容类型 | **游戏** (the console's 服务内容选择指引 maps the category 游戏 > 休闲 to this) [VERIFY console] |
| 服务内容介绍 | paste section 3 (short version first; the long version if the field allows) |
| 前置审批 | 游戏 / 出版: **the 小游戏备案 approval from step 1** (the console links it automatically); no 版号, no other licence |
| 域名 / 服务器 | **none to declare**: the game only calls WeChat cloud functions (`wx.cloud.callFunction`), no `wx.request` to our own domains, no web-view [VERIFY: grep below]. No ICP domain is needed |
| 小程序负责人 (管理员) | `【FOUNDER: 姓名, 证件, 手机号 (will receive the 12381 SMS; must be reachable for 24 h), 邮箱】` |
| 应急联系人 | `【FOUNDER: 姓名与手机号, a different person and a different number from 负责人】` ("不同人不能使用同一号码") |
| 人脸核身 | the 负责人 does a live face check inside WeChat: plain light background, no hat, mask or headphones, eyes open, no one else in frame |
| 互联网信息服务承诺书 / 真实性核验单 | read and confirm inside the platform (a legal attestation by the company) |

Check that the game really calls no own domain: `grep -rn "wx.request\|wx.downloadFile\|wx.uploadFile\|connectSocket" apps/kedupan/game/js apps/kedupan/game/core apps/kedupan/game/opendata` (run on this commit: no match; only `wx.cloud.callFunction`).

### 2.3 Steps with the clock
1. Submit -> 平台初审 1-2 working days; keep the 负责人 phone on (the platform may call).
2. **12381 SMS: within 24 hours** open beian.miit.gov.cn (phone or PC) and verify; resend is possible once if the code is invalid. Missing the 24 hours = automatic rejection, resubmit.
3. 通管局 review 1-20 working days; the console / SMS tells you the 备案号.
4. If the game name or company must change later: it forces a 备案 update. Lock the name before step 1.

## 3. Service description (服务内容介绍), ready to paste

**Truth rule for this section:** the text must say what the product does. After D-2 the game has **one** user-typed text: the host's clue (up to 12 Chinese characters), moderated before anyone sees it. The earlier wording (「无聊天、无用户发布内容」, 「游戏内没有任何输入文字的位置」) is no longer true and must not be filed. The filing authority reads this text and the screenshots together, so the screenshots must show the typed-clue step (section 4).

**Short version (about 170 characters, for a field with a limit):**
```
《群友刻度盘》是一款休闲小游戏：每天提供五张日常事物的刻度卡，玩家把指针拖到“冷与热”“便宜与贵”等两端之间的位置，揭晓后对比全国玩家和同群好友的位置，计算默契分。出题时可自己写不超过12个汉字的短提示，先经微信内容安全审核才展示，可举报。无聊天私信、无充值购买，收入来自广告。
```

**Long version (about 450 characters):**
```
《群友刻度盘》是一款面向大众的日常观点对比休闲小游戏，通过微信小游戏运行，没有任何充值、虚拟道具或游戏内购买，收入仅来自微信流量主广告。
玩法：每天固定五张卡片，每张卡片给出一个日常事物（如“火锅”）和一条两端含义相反的刻度（如“冷”与“热”）。玩家拖动指针选择自己认为合适的位置并确认，随后看到全国玩家的参考位置、自己的位置、得分和评语；五张完成后得到当日默契分，并可分享当日成绩。
功能：往期刻度（回看并练习往期题目）；本群页（从微信群聊卡片进入后，查看本群当日默契度和排名）；好友榜；“出题”（玩家设定隐藏位置，并给出一条提示：可以自己写一条不超过12个汉字的短提示，也可以从游戏提供的六个提示词中选一个；由群友猜测位置，揭晓时对比）；大字和高对比度显示；可选的“刻度题揭晓了”订阅消息。
内容与安全：全部题目和预设提示词由开发者原创编写并经审核，涉及日常食物、物品、动物、天气、感受等，不涉及人物、地域、政治、宗教、品牌、赌博等。游戏中唯一由用户输入的内容是出题人自己写的短提示（最多12个汉字，只能写中文，不能含数字、位置词和联系方式）。该提示在展示给任何其他玩家之前，先由服务器做规则检查，再提交微信“小游戏文本内容安全识别”接口审核；审核未通过、出错或超时的，一律不展示（先审后发，无法确认即不展示）。任何玩家可对提示一键举报，被举报的提示立即对所有人隐藏；设有违规次数累计与限制写提示的机制（第1次提醒，之后依次限制24小时、7天、30天），管理人员可在后台查看、隐藏、删除提示并随时关闭该功能，并定期抽查。提示不会出现在分享卡片中，出题人对其他玩家匿名。游戏没有聊天、私信、公开广场和陌生人匹配。
数据：仅使用微信提供的玩家标识（OpenID）、答题数据和上述短提示及其审核、举报、违规记录，存放于微信云开发（中国大陆），保存期限不超过180天，详见《用户隐私保护指引》和《用户协议》。
```

(Consistency requirements: the text above matches the registered name, the category 游戏 > 休闲, the 适龄提示 (12+), the privacy guide (items 9-13), the 《用户协议》 (12 characters, strike ladder 1 / 24 h / 7 d / 30 d, 180 days) and the screenshots. The two numbers a reviewer can check against the game are 12 characters and 180 days; the strike steps and the kill switches are stated so that the filing does not understate the moderation, but if the founder prefers a shorter text, keep at least: the typed clue exists, it is limited to 12 Chinese characters, it is reviewed before it is shown, it can be reported and hidden, and records are kept up to 180 days. It states AI-assisted drafting nowhere; if the founder wants it, add "题库由 AI 辅助编写并经人工审核" **only after** the human review in HANDOFF section 1.)

**[VERIFY console] Form questions the pages do not describe.** Re-read 2026-10-16: [XCXBA] and [NRJS] do not mention user-published content, 交互 or 论坛, and set no content-safety rule for the filing itself beyond "清晰、完整、真实". The console form may still ask whether the service includes user-published or interactive content, or offer a 前置审批 type for it. If it does: answer **yes, limited to a 12-character moderated clue** (the section 3 text), do not tick 论坛/BBS-type services (there is no public feed, comment area or chat), and if the form then demands a licence, stop and send a screenshot to the CTO (the same rule as the 所需资质 list, `rules-check.md` 1.7i). Changing the description after filing is an update of the 备案, so settle the wording first (HANDOFF H15).

## 4. Screenshots for the filing

Official requirement (nrjs.html): screenshots of the scenes, gameplay and functions; **size and version consistent**. No pixel size is published. Prepared set: `docs/kedupan/release/screenshots/01..16-*.png`, all 1080 x 1920 PNG (9:16), same build and same renderer, no debug overlay.

Honest limit: these are **renders from the game's own view-model fixtures** (the repo's preview tool: real renderer code, system font stand-in, fixture data such as the issue number and fixture nicknames). They are a reasonable stand-in for the store listing, but for the 备案 the reviewers want the real game. **For the filing, replace them with real-device screenshots** taken during the device pass (HANDOFF section 5), all on the same phone, in this order:
1. The **launch splash** with 健康游戏忠告 + the 适龄提示 icon + the game name (only appears after 适龄提示 is approved and the build is uploaded as 体验版). This is the first screenshot.
2. Home. 3. A card with the needle placed. 4. A card reveal. 5. Day result. 6. 本群 page (from a group card). 7. **出题, clue step, tab 自己写 (D-2: the typed-clue input with the rule line 「最多 12 个字 · 不写数字、位置和两头的词」)** and 8. **出题, tab 选一个提示词**. 9. **发言规则 sheet** (first tap on the input). 10. **举报 sheet** (「举报这个提示」 with the five reasons) on a round with a typed clue. 11. 玩法 sheet. Items 7 to 10 show the filing authority the moderation the text describes. The renders `09-create__clue_text_typed.png`, `07-create__clue_picked.png`, `11-round__clue_typed.png` and `06-round__revealed.png` were re-rendered for the typed clue on 2026-10-16 (items 7, 8 and part of 10); the 发言规则 sheet (`12-create__clue_rules_end.png`, item 9) and the 举报 sheet (`13-round__report_sheet.png`, item 10) were rendered at 1080 x 1920 on 2026-10-16, together with `14-round__clue_hidden.png` (「提示已被举报隐藏」), `15-home__settings_scrolled.png` (设置 with 发言规则 and 《用户协议》) and `16-terms__top.png` (the 《用户协议》 reader). They are the renders to use if real-device shots are not available; the real-device set still replaces them when possible.

## 5. Founder checklist (copied to HANDOFF section 3)
1. Prerequisite: 认证 done; name locked; 适龄提示 submitted as **12+**; the section 3 service description approved by you (HANDOFF 2b) and the screenshots taken from the typed-clue build.
2. 小游戏备案: paste section 1 values and section 3 text, upload screenshots, submit; wait 10-20 working days.
3. 小程序备案: choose 情况二; fill section 2; face check; confirm the promise letter; submit.
4. Answer the 12381 SMS within 24 hours.
5. Tell the CTO the 备案号 when issued (release needs it) and the real launch date.
