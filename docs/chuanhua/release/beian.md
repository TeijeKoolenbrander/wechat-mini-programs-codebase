# 传画接龙: 备案 (filing) pack

Author: release. Date: 2026-10-15. **Filing is a legal attestation: only the founder (and the company's legal representative / the designated 负责人) submits it (constitution Art. 5.4).** Nothing was filed.

Sources read 2026-10-15 (all official unless noted): 小游戏备案 https://developers.weixin.qq.com/minigame/introduction/guide/nrjs.html ; 小程序备案 https://developers.weixin.qq.com/minigame/introduction/guide/xcxba.html ; 操作指引 https://developers.weixin.qq.com/minigame/product/record/guidelines.html ; 材料示例 https://developers.weixin.qq.com/minigame/product/record/record_material.html ; IAA 指引 https://developers.weixin.qq.com/minigame/introduction/guide/iaa.html ; 资质审核-IAA https://developers.weixin.qq.com/minigame/introduction/guide/zzsh-iaa.html ; 国家网信办 安全评估规定 https://www.cac.gov.cn/2018-11/15/c_1123716072.htm . [VERIFY console] marks a field the pages show only as screenshots. The procedure is the same as `docs/bibiyi/release/beian.md`; the game-specific values and the **UGC section (section 4)** differ.

## 0. What the filing is, in the right order (IAA, no payment = "情况二")

Per the IAA flow (iaa.html): 注册 -> 名称/头像/类目 -> **微信认证 + 适龄提示 + 资质审核** -> 版本审核 -> **小游戏备案 and 小程序备案** -> 发布. Two filings, in this order, both in the MP console (设置 -> 小程序备案 -> 去完善), both after 认证:

1. **小游戏备案** (a 前置审批 step for IAA games: "是IAA游戏备案前置审批中的一个环节"). nrjs.html Q2 lists "适龄提示未设置或者未通过" as a rejection reason: **do 适龄提示 first**. Platform review 1-2 working days, then the 主管部门 review **10-20 working days**. While under review or approved the game **name and the company must not change**; any rejection restarts the clock.
2. **小程序备案** (MIIT / 通管局). Choose **情况二** (IAA). About **10-30 working days** (xcxba.html): 填写 -> 平台初审 (1-2 wd) -> **工信部短信核验: an SMS from 12381 to the 负责人 or 小程序管理员 phone, verify within 24 hours at beian.miit.gov.cn (one resend if the code is invalid), or the filing is rejected automatically** -> 通管局 review (1-20 wd) -> 备案号 issued; it then appears on the game's profile page after release.

Version review (about 1 day) can run in parallel with 小程序备案 (iaa.html), but **release needs the 备案号**. Allow roughly **4-10 weeks** in total. Unlike the daily-content sister games, 传画接龙 has no launch-date dependency: nothing in the code or the cloud config needs the date.

## 1. 小游戏备案 (pre-approval): fields and values

| Field | Value | Source / note |
|---|---|---|
| 备案路径 | 账号设置 -> 小程序备案 -> 去完善 -> 小游戏备案 -> 前往提交 | nrjs.html |
| 游戏类型 / 情况 | **情况二: IAA, 当前及未来均不需要开通虚拟支付** ("小游戏当前及未来均不需要开通虚拟支付") | nrjs.html Q8, zzsh-iaa.html |
| 游戏名称 | the name **accepted at registration** (target 传画接龙; fallbacks in `registration/REGISTRATION-STEPS.md` step 4). Must equal the in-game title and the later 小程序备案 name | nrjs.html: name must stay identical during review |
| 游戏场景 / 玩法 / 功能 | paste section 3 (service description) | "确保清晰、完整、真实介绍你所备案的小游戏内容，包括但不限于场景、玩法、功能等信息" |
| 截图 | upload section 5 files: **same size and same version** ("截图需保持尺寸、版本一致"); the first gameplay screenshot should also show 健康游戏忠告 + 适龄提示 + 游戏名称 (real phone, section 5) | nrjs.html; first-screenshot rule from community guidance [VERIFY console] |
| 版号 / 出版物号 | **none (not applicable: no in-app purchase)** | nrjs.html Q5 (a game that already holds a 版号 skips 小游戏备案) and Q8 (情况二 avoids the 版号 materials of 情况一); `rules-check.md` section 4 |
| 软著 | **not required**: only if the name contains English or "软件", or brands / public figures are involved (none) | zzsh-iaa.html. Optional anyway (HANDOFF 8) |
| 运营授权 / 情况说明 | not applicable (we operate our own game) | record_material.html |
| 适龄提示 | must be set and approved before submitting (recommendation: 12+, `rules-check.md` 2.1) | nrjs.html Q2 |

## 2. 小程序备案 (MIIT filing): every form field

Values: **KNOWN** = we fill it; **FOUNDER** = founder's own data (placeholder).

### 2.1 主体信息 (主办单位)
| Field | Value |
|---|---|
| 主体类型 | 企业 (the Beijing company; same as registration) |
| 主办单位名称 | `【FOUNDER: 营业执照上的企业全称，逐字一致】` |
| 主办单位证件类型 | 营业执照 (统一社会信用代码) |
| 证件号码 | `【FOUNDER: 统一社会信用代码】` |
| 证件住所 / 通信地址 (省、市、区、详细地址) | `【FOUNDER: 实际通讯地址, Beijing】` (must be real) |
| 证件扫描件 | `【FOUNDER: 营业执照原件彩色扫描件或照片, 边角齐全, 有效期须大于 1 个月 (the guideline page) 或 3 个月 (older pages): follow the console prompt】` |
| 主办单位负责人 (法定代表人 or authorised) | `【FOUNDER: 姓名、证件类型 (居民身份证)、证件号、手机号、邮箱】` (the phone must be the person's own; two people cannot share a number) |
| 负责人证件 | `【FOUNDER: 身份证正反面彩色照片】` |
| 授权书 | only if the 小程序负责人 is not the legal representative; the Beijing 管局 template [VERIFY console]; **公章** only (not 合同章/财务章/电子章) |

### 2.2 小程序 (小游戏) 信息
| Field | Value |
|---|---|
| 小程序名称 | the accepted name (target 传画接龙) |
| AppID | shown by the console; the **real** AppID (`APPID.md`), never the shared test AppID `wxcd03c1b62d7eb0e0` |
| 小程序服务内容类型 | **游戏** (the console's 服务内容选择指引 maps 游戏 > 休闲 to this) [VERIFY console]. **Do not pick 社交, 论坛 or 内容类** even though players exchange drawings and sentences: see section 4 |
| 服务内容介绍 | paste section 3 (short version first; the long version if the field allows) |
| 前置审批 | 游戏 / 出版: **the 小游戏备案 approval from step 1** (the console links it); no 版号, no other licence |
| 域名 / 服务器 | **none to declare**: the game only calls WeChat cloud functions and cloud database `watch` (`wx.cloud.*`); no `wx.request`, `downloadFile`, `uploadFile`, `connectSocket`, no web-view. Re-check: `grep -rn "wx.request\|wx.downloadFile\|wx.uploadFile\|connectSocket" apps/chuanhua/game/js apps/chuanhua/game/core apps/chuanhua/game/game.js` (run on this commit: no match in shipped code) |
| 小程序负责人 (管理员) | `【FOUNDER: 姓名, 证件, 手机号 (receives the 12381 SMS; reachable for 24 h), 邮箱】` |
| 应急联系人 | `【FOUNDER: 姓名与手机号, a different person and number from 负责人】` |
| 人脸核身 | the 负责人 does a live face check inside WeChat: plain white or light background, no hat, mask or headphones, eyes open, natural expression, nobody else in frame |
| 互联网信息服务承诺书 / 真实性核验单 | read and confirm inside the platform (a legal attestation by the company) |

### 2.3 Steps with the clock
1. Submit -> 平台初审 1-2 working days; keep the 负责人 phone on.
2. **12381 SMS: within 24 hours** at beian.miit.gov.cn; one resend. Missing it = automatic rejection, resubmit.
3. 通管局 review 1-20 working days; the console / SMS tells you the 备案号.
4. A later name or company change forces a 备案 update. Lock the name before step 1.

## 3. Service description (服务内容介绍), ready to paste

Written to match what v1 really ships (spec rev. 2): live rooms are the default, 慢慢传 is secondary; there is **no 今日起点, no ranking, no public square, no chat**.

**Short version (about 150 characters, for a field with a limit):**
```
《传画接龙》是一款休闲聚会小游戏：同一个微信群的3至10位群友同时在线，每人选一个题目，轮流画画、猜一句，传完后一起揭晓。所有图片和文字先经内容安全审核再展示，设有举报和违规限制。无聊天、无陌生人匹配、无充值购买，收入来自广告。
```

**Long version (about 650 characters):**
```
《传画接龙》是一款面向大众的休闲聚会小游戏，通过微信小游戏运行，没有任何充值、虚拟道具或游戏内购买，收入仅来自微信流量主广告。
玩法：（1）开一局（默认）：同一个微信群的3至10位群友通过群里的卡片进入，同时在线。每人从系统随机给出的3个题目里选一个（也可自己出题），画出来；下一轮每人拿到另一位玩家传来的内容，上一棒是画就用一句话猜，是一句话就把它画出来，最多4轮；每一棒有限时（选题30秒、画画60秒、猜一句45秒），时间到自动交出。结束后所有接龙同时揭晓，先看最后一棒，再一步步往回看原题变成了什么。（2）慢慢传：不用同时在线，一条接龙由起点和6棒组成，群友在48小时内一棒一棒接。
内容安全：玩家画的每一幅画和输入的每一句话，在展示给其他玩家之前，都先由服务器调用微信小游戏内容安全接口（图片内容安全识别、文本内容安全识别）同步审核，审核不通过或未得到结果的内容不会展示；游戏内每个他人内容都可一键举报，举报后立即对所有人隐藏；多次违规的玩家被限制参与；设有管理员下架、整局移除和一键暂停内容展示的功能，并由专人每日巡查举报和抽查内容。每一局、每条接龙只属于一个微信群，只有该群成员能加入；揭晓内容只对参与者可见，分享卡片不含任何玩家的画。游戏不显示昵称和头像，没有聊天、私信、陌生人匹配和公开广场。
隐私：仅使用微信提供的玩家标识（OpenID）、群聊标识和玩家创作的内容，存放于微信云开发（中国大陆），保存期限不超过180天，详见《用户隐私保护指引》和《用户协议》。
```

(Consistency requirements: matches the registered name, the category 游戏 > 休闲, the privacy guide, the 用户协议 and the screenshots. It states no AI authorship claim beyond the agreement: players get no AI feature; the preset prompt bank was AI-drafted and human-reviewed, which is true only after H13.)

## 4. UGC: does the filing need extra declarations, materials or licences?

**Short answer:** none of the official WeChat filing pages lists any UGC-specific field, declaration or licence; but two points sit outside those pages and need a founder/counsel decision. I did not find a way to close them from public sources. Evidence:

| # | Question | What the sources say | Status |
|---|---|---|---|
| U1 | Do the 小游戏备案 / 小程序备案 forms ask about user-generated content? | nrjs.html, xcxba.html, guidelines.html, record_material.html (all re-read 2026-10-15): **no mention** of UGC, 互动交流, 论坛, 社交, 内容安全 declarations or extra approvals. The guideline page lists the 前置审批 categories (publishing for games; 网络文化经营许可证 for culture; news; audiovisual; ...) and says for culture "经营性 activities need approval while 非经营性 activities need filing" | PASS for the WeChat forms. The 服务内容选择指引 page (linked from record_material.html) was not retrievable here: **NEEDS-FOUNDER** (screenshot the console's service-content options and the 所需材料 list, send to the CTO) |
| U2 | **网络文化经营许可证** for a game | The guideline table lists 文化 -> 网络文化经营许可证 as a 前置审批 for culture services; for 游戏 the platform routes everything through 小游戏备案 (publishing). Whether an ad-supported 休闲 game with no payment counts as "经营性网络游戏" needing that licence is not answered on any WeChat page | NEEDS-FOUNDER (counsel, H10): same question as for the sister games; the console will say if it wants it |
| U3 | **安全评估** (CAC 《具有舆论属性或社会动员能力的互联网信息服务安全评估规定》, 2018-11-15) | Art. 2 covers services that open "论坛、博客、微博客、聊天室、通讯群组、公众账号、短视频、网络直播、信息分享、小程序等信息服务或者附设相应功能" and "具有发动社会公众从事特定活动能力的其他…服务"; Art. 3: assess at launch or when adding such functions; Art. 7: submit the report to the city-level cyberspace and public-security authorities, **before launch** for a new service. The rule names neither games nor UGC; whether a group-bound drawing game with no public surface counts is a legal judgement. The design points the Art. 5 checklist asks for are all present: reviewers/admin (H9), content logs (180 days), handling of illegal content (checks, reports, takedown), complaint channel, kill switches | **NEEDS-FOUNDER (counsel, H10): decide whether to self-assess and file.** Not an MP-console step. Conservative recommendation: ask counsel before launch; the facts they need are in `rules-check.md` section 1 |
| U4 | Extra materials if the 小程序备案 reviewer asks | Prepare: the 内容安全方案 (spec §6-§7 summary, `rules-check.md` 1.1-1.6), the 用户协议 and 接龙公约 text, the report-flow screenshots (`screenshots/10-report__idle.png`, `11-rules__open.png`), the named ops owner (H9), the 微信 content-security API enablement screenshot (H5, after V16) | ready |
| U5 | Category: do not pick 社交/社区/内容 | See `registration/copy.md` §4; a wrong third-level category can also get the version rejected | Founder console check with screenshot (HANDOFF 0, step 5) |

## 5. Screenshots for the filing

Official requirement (nrjs.html): screenshots of the scenes, gameplay and functions; **size and version consistent**. No pixel size is published. Prepared set: `docs/chuanhua/release/screenshots/01..16-*.png`, all 1080 x 2340 PNG, same build, same renderer, no capsule overlay (`screenshots/README.md`).

Honest limit: these are **renders from the game's own view-model fixtures** (real renderer code, a system-font stand-in; the doodles are fixture strokes, the sentences are fixture text). For the filing, **replace them with real-device screenshots** taken during the device pass (HANDOFF 6), all on the same phone, in this order:
1. The **launch splash** with 健康游戏忠告 + the 适龄提示 icon + the game name (appears only after 适龄提示 is approved and the build runs as 体验版). First screenshot.
2. Home (开一局 + 慢慢传 link). 3. Pick screen (3 rolled prompts). 4. Lobby (numbered seats). 5. A draw turn (full-screen canvas, timer). 6. A describe turn. 7. Reveal overview. 8. Step-through. 9. The 举报 sheet. 10. The 接龙公约 sheet. 11. 玩法 sheet. 12. 设置 (删除我的全部接龙内容).

## 6. Founder checklist (copied to HANDOFF section 4)
1. Prerequisites: 认证 done; name locked; **适龄提示 submitted and approved**.
2. 小游戏备案: paste section 1 values and the section 3 text, upload screenshots, submit; wait 10-20 working days.
3. 小程序备案: choose 情况二; fill section 2; face check; confirm the promise letter; submit.
4. Answer the 12381 SMS within 24 hours.
5. Section 4: send the CTO the console's 服务内容 / 所需材料 screenshots; ask counsel U2 and U3 (H10).
6. Tell the CTO the 备案号 when issued (release needs it).
