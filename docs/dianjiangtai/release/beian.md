# 点将台: 备案 (filing) pack

Author: release. Date: 2026-10-15. Build `kept-ideas/v1` @ 3df1b89333d8d05b1d008ce57bfd29b2d1f46452 (the code is identical to 6582873). **Filing is a legal attestation: only the founder (and the company's legal representative / the designated 负责人) submits it (constitution Art. 5.4).** Nothing was filed.

Sources read 2026-10-15 (all official): 小游戏备案 https://developers.weixin.qq.com/minigame/introduction/guide/nrjs.html ; 小程序备案 https://developers.weixin.qq.com/minigame/introduction/guide/xcxba.html ; 操作指引 https://developers.weixin.qq.com/minigame/product/record/guidelines.html ; 材料示例 https://developers.weixin.qq.com/minigame/product/record/record_material.html ; IAA 指引 https://developers.weixin.qq.com/minigame/introduction/guide/iaa.html ; 资质审核-IAA https://developers.weixin.qq.com/minigame/introduction/guide/zzsh-iaa.html ; 适龄提示 https://developers.weixin.qq.com/minigame/introduction/guide/slts.html . [VERIFY console] marks a field the pages show only as screenshots. The long form of the rules is `registration/rules.md` Step 4.

## 0. What the filing is, in the right order (IAA, no payment = "情况二")

Two filings, in this order, both inside the MP console (设置 -> 小程序备案 -> 去完善), both after 认证 and after the 适龄提示 is set:

1. **小游戏备案** (a 前置审批 for IAA games; it replaces the 版号, which a game with no in-app purchase does not need). Platform review 1-2 working days, then the 主管部门 review **10-20 working days**. nrjs.html Q2 lists "适龄提示未设置或者未通过" and unapproved qualification material among the things that delay it, so **set the 适龄提示 first** (HANDOFF section 0). The game **name and the company must not change** while it is under review or approved, and they must be identical at every stage.
2. **小程序备案** (the MIIT/通管局 filing). Choose **情况二** (IAA). Whole process about **10-30 working days**: 填写 -> 平台初审 (1-2 wd) -> **工信部短信核验: an SMS from 12381 to the 负责人 or 小程序管理员 phone, to be completed within 24 hours at beian.miit.gov.cn, or the filing is rejected automatically** -> 通管局 review (1-20 wd, Beijing) -> 备案号 issued. The 备案号 then appears on the game's "更多资料" page automatically after release.

Version review (about 1 day) can run in parallel with 小程序备案, but **release needs the 备案号**.

**Timeline consequence:** the two filings are sequential, so allow roughly 4-10 weeks from the day you submit. Unlike the schedule-based sister games, 点将台 has **no date baked into the build**: the daily seeds come from the seed bank in order, and the launch date is the environment variable `LAUNCH_DATE_KEY` (`post-release.md` section 3), so nothing needs regenerating when the date moves. Do tell the CTO the date once you know it.

## 1. 小游戏备案 (pre-approval): fields and values

| Field | Value | Source / note |
|---|---|---|
| 备案路径 | 账号设置 -> 小程序备案 -> 去完善 -> 小游戏备案 -> 前往提交 | nrjs.html |
| 游戏类型 / 情况 | **情况二: IAA, 当前及未来均不需要开通虚拟支付** | nrjs.html, zzsh-iaa.html |
| 游戏名称 | the name that was **accepted at registration** (see `APPID.md` `ACCEPTED_NAME`; targets `点将台·三国` / `三国点将台` / `点将台·每日军令` / `点将台`). Must equal the later 小程序备案 name and stay the same through review | nrjs.html: name and 主体 must stay identical |
| 游戏场景 / 玩法 / 功能 introduction | paste section 3 (service description) | "清晰、完整、真实" |
| 截图 | upload the files in section 4: **same size and same version** | nrjs.html: "截图需保持尺寸、版本一致" (no count or pixel size is published) |
| 版号 / 出版物号 | **none (not applicable: no IAP)** | nrjs.html: games with a 版号 skip this step; IAA games do it instead |
| 软著 | **not required for this game**: required only if the name contains English or 软件, or brands / public figures are involved (zzsh-iaa.html: "涉及相关品牌、公众人物合作等"). 点将台 uses **historical figures of the 三国 period** (public domain, no brand, no cooperation, no likeness); a reviewer *could* read "公众人物" broadly, so the optional 软著 materials are ready in `softcopyright/` (HANDOFF section 6) | zzsh-iaa.html |
| 运营授权 / 情况说明 | not applicable (we operate our own game) | record_material.html: only for authorised operation |
| 商标 | the founder has cleared the name 点将台 (D11); keep the trademark evidence at hand in case the name triggers a protected-word review | spec D11 |

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
| 证件扫描件 | `【FOUNDER: 营业执照原件彩色扫描件或照片, JPG/PNG, 边角齐全, 有效期须大于 3 个月】` (sizes per the console prompt; the pages disagree: "不超过200K不低于100K" vs 2M) |
| 主办单位负责人 (法定代表人 or authorised) | `【FOUNDER: 姓名、证件类型 (居民身份证)、证件号、手机号、邮箱】` |
| 负责人证件 | `【FOUNDER: 身份证正反面彩色照片】` |
| 授权书 | only if the 小程序负责人 is not the legal representative; the Beijing 管局 does not require the 小程序负责人 letter, a 主体负责人 authorisation still applies if that person is not the 法人 [VERIFY console]; **公章** only (not 合同章/财务章/电子章); date within 1 month of submission. Easiest: the 法定代表人 is both 负责人 |

### 2.2 小程序 (小游戏) 信息
| Field | Value |
|---|---|
| 小程序名称 | the accepted name (`APPID.md`) |
| AppID | shown by the console: it must read **`wx172906d7bfd6036f`**, never the shared test AppID |
| 小程序服务内容类型 | **休闲娱乐 > 游戏 > 网络游戏类** (rules.md Step 4.2 from record guidelines; the console's 服务内容选择指引 maps category 游戏 > 休闲 to this) [VERIFY console] |
| 服务内容介绍 | paste section 3 (short version first; the long version if the field allows) |
| 前置审批 | 游戏 / 出版: **the 小游戏备案 approval from step 1** (the console links it automatically); no 版号, no other licence |
| 域名 / 服务器 | **none to declare**: the game only calls WeChat cloud functions (`wx.cloud.callFunction`); no `wx.request`, `downloadFile`, `uploadFile`, `connectSocket` or web-view anywhere in the shipped code (grep on 3df1b89, below); no remote images either (seal portraits are drawn in code, CTO-D1). No ICP-filed domain is needed |
| 小程序负责人 (管理员) | `【FOUNDER: 姓名, 证件, 手机号 (will receive the 12381 SMS; must be reachable for 24 h), 邮箱】` |
| 应急联系人 | `【FOUNDER: 姓名与手机号, a different person and a different number from 负责人】` ("不同人不能使用同一号码") |
| 人脸核身 | the 负责人 does a live face check inside WeChat: plain light background, no hat, mask or headphones, eyes open, no one else in frame |
| 互联网信息服务承诺书 / 真实性核验单 | read and confirm inside the platform (a legal attestation by the company) |

Check that the game really calls no own domain: `grep -rn "wx.request\|wx.downloadFile\|wx.uploadFile\|connectSocket" apps/dianjiangtai/game/js apps/dianjiangtai/game/core apps/dianjiangtai/game/opendata apps/dianjiangtai/game/game.js` (run on this commit, dev-only mock and stub excluded: the only hits are the three `wx.requestSubscribeMessage` lines, which are not network requests to a domain).

### 2.3 Steps with the clock
1. Submit -> 平台初审 1-2 working days; keep the 负责人 phone on (the platform may call).
2. **12381 SMS: within 24 hours** open beian.miit.gov.cn (phone or PC) and verify; resend is possible once if the code is invalid. Missing the 24 hours = automatic rejection, resubmit.
3. 通管局 review 1-20 working days; the console / SMS tells you the 备案号.
4. If the game name or company must change later: it forces a 备案 update. Lock the name before step 1.

## 3. Service description (服务内容介绍), ready to paste

**Short version (102 characters, for a field with a limit):**
```
《点将台》是一款三国题材的休闲策略小游戏：玩家每轮翻出势力与时代，从对应的历史武将中点选并安排到五个职位，程序模拟十二场战斗评定战绩，可与好友、群友比较。无聊天、无用户发布内容、无充值购买，收入来自广告。
```

**Long version (about 620 characters):**
```
《点将台》是一款面向大众的三国历史人物题材休闲策略小游戏，通过微信小游戏运行，没有任何充值、虚拟货币、虚拟道具或游戏内购买，没有抽奖或随机付费，不提供现金或实物奖励，收入仅来自微信流量主广告（激励视频、插屏、横幅，均由玩家自愿观看或在固定位置展示）。
玩法：每局五轮。每轮翻出一个势力（魏、蜀、吴、群、晋）和一个时代（黄巾、群雄、赤壁、三分、归晋），玩家从该势力在该时代的武将中选一员，放入主公、军师、先锋、猛将、守将之一。五轮点满后出征，程序按武将的智、信、仁、勇、严五项品评模拟十二场战斗，给出胜负场次、评级、逐场战报和评语。每日军令全体玩家令牌相同、每人一次；自由点将不限局数。
功能：往期军令（回看近三十期）；每周日的“识人”军令（出征前不显示武将品评）；连续出征天数；好友榜和群排行（从微信群聊卡片进入后查看，昵称头像仅在微信开放数据域内显示）；同签挑战（把同一手令牌的战绩发给好友应战）；保存战报图片到相册（点击后才请求权限）；可选的“好友接下了你的战书”订阅消息；大字模式和高对比度显示。
内容与安全：武将与史实均取材于公有领域的历史记载，武将形象为代码绘制的印章图案，不使用真人肖像或他人作品；游戏内没有任何输入文字的位置，没有聊天和用户发布内容，没有陌生人社交，不含地图。
数据：仅使用微信提供的玩家标识（OpenID）和游戏战绩数据，存放于微信云开发（中国大陆），保存期限不超过180天，详见《用户隐私保护指引》。
```

(Consistency requirements: the text matches the registered name, the category 游戏 > 休闲, the privacy guide (微信朋友关系, 相册（仅写入）, subscribe message, 180 days), and the screenshots. It does not claim ownership of the historical material: the figures are public domain, while the stat set 智信仁勇严 (from 《孙子兵法》), the seal art and the code are ours. **The ad wording matches the build:** until 流量主 ad units exist the release build runs no-fill ("暂无广告，本次免费") and never shows a test overlay (TD-11, `rules-check.md` item 1.6), so the screenshots and the text agree and the ad sentence can be filed as written.)

## 4. Screenshots for the filing

Official requirement (nrjs.html): screenshots of the scenes, gameplay and functions; **size and version consistent**. No pixel size, count or 健康游戏忠告 rule is published on that page (the first-screenshot rule for 健康游戏忠告 + 适龄提示 + game name is community knowledge: kedupan `beian.md` cites it [VERIFY console]). Prepared set: `docs/dianjiangtai/release/screenshots/01..16-*.png`, all **1080 x 1920 PNG (9:16)**, same build and same renderer, no debug overlay, no capsule outline.

Honest limit: these are **renders from the game's own view-model fixtures** (the repo's preview tool: the real renderer code, Noto Serif SC as the device-font stand-in, fixture data such as issue 12, nicknames 张三/李四 and fixed battle-log lines). They are a reasonable stand-in for the store listing, but for the 备案 the reviewers want the real game. **For the filing, replace them with real-device screenshots** taken during the device pass (HANDOFF section 5), all on the same phone, in this order:
1. The **launch splash** with 健康游戏忠告 + the 适龄提示 icon + the game name (only appears after 适龄提示 is approved and the build is uploaded as 体验版). This is the first screenshot.
2. Home (`01`). 3. A flipped round with the pool (`02`). 4. The general detail sheet with stats and role fit (`03`). 5. A full lineup before 出征 (`04`). 6. Day result (`05`). 7. 本群 board from a group card (`09`). 8. 战书 entry (`10`). 9. 往期 (`11`). 10. 玩法 sheet (`13`) and 设置 (`14`).

Do not use the reveal-animation render (`result__revealing_*`) for the filing: its fixture battle lines do not match the win/loss marks (a fixture shortcut, not a game bug).

## 5. Founder checklist (copied to HANDOFF section 3)
1. Prerequisite: 认证 done; name accepted and locked; 适龄提示 submitted.
2. 小游戏备案: paste section 1 values and section 3 text, upload the screenshots, submit; wait 10-20 working days (plus 1-2 platform).
3. 小程序备案: choose 情况二; fill section 2; face check; confirm the promise letter; submit.
4. Answer the 12381 SMS within 24 hours.
5. Tell the CTO the 备案号 when issued (release needs it) and the real launch date.
