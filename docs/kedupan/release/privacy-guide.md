# 群友刻度盘: 用户隐私保护指引 (privacy guide pack)

Author: release. Date: 2026-10-15; **revised 2026-10-16 for the typed clue (D-2, PD-31 to PD-40, spec §6.12, §11.6-11.8, §13; spec rev. committed 984896c).** The code audit in section 1 was first done on `c49019f2e154b742aef1561665a5e5775ddef0df` (before typed clues) and **re-done on the D-2 build `84c68819a0e55c013bdeec5c2c00596d98277acb` on 2026-10-16** (every `wx.*` call grepped again, the new collections, `setClue`, `reportClue`, `agreeRules`, `cleanup`, `track` allowlist; section 3, rows 15-21, now cite the code). One wording fix came out of it: the blocked text is also kept in `mod_log` when the check did not finish (see items 10 and 16). Status: **text ready for sign-off; entering it in the console is a founder step (HANDOFF section 2).** Nothing was entered anywhere. **The earlier text of this guide ("游戏内没有任何输入文字的地方", "没有用户发布内容") must not be entered: it is false once typed clues ship.**

Official basis (read 2026-10-15): 隐私合规开发指南 https://developers.weixin.qq.com/minigame/introduction/guide/privacy.html . Where the console form has a field the page does not describe, it is marked [VERIFY form]: the console is the authority; screenshot the form before you save.

How the console works (from that page): MP 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新 (or 设置 -> 基本设置 -> 用户隐私保护指引). The console lists the information types its code scan detects (标准 API); anything we process by non-`wx` means (our cloud functions) is added as "其他自定义信息类型". The guide must be completed before 版本审核 (bbsh.html step 2), and the official privacy popup must be on (MP 基本设置 -> 隐私授权弹窗; cannot be switched off afterwards). Error 112 at run time means an interface is used but not declared; 1025/1026 means nothing is declared or the popup is not implemented.

---

## 1. What the code actually does (audit)

Method: grepped every `wx.*` call in `apps/kedupan/game/{game.js,js,core,opendata}` (stub and mock excluded) and every cloud function, 2026-10-15.

### 1.1 `wx` APIs that touch user data

| API | Where | Touches | Privacy interface? | Declare as |
|---|---|---|---|---|
| `wx.setUserCloudStorage` (key `kd`, value `{d: dateKey, s: total}`) | `js/privacy.js` `writeMarker` (after the user taps 看结果, once a day) | the user's own cloud-storage KV (微信朋友关系 data) | **Yes** (微信朋友关系) | item 1 |
| `wx.getFriendCloudStorage`, `wx.getGroupCloudStorage` (read `kd`, nickname, avatar, openid of friends / group members) | `opendata/index.js` (open data domain only) | friends' and group members' nickname, avatar and the `kd` value; **never leaves the open data domain** | **Yes** (微信朋友关系) | item 1 |
| `wx.authorize({scope:'scope.WxFriendInteraction'})`, `wx.openSetting`, `wx.getSetting` | `js/privacy.js` | permission state only | no | covered by item 1 |
| `wx.getGroupEnterInfo` -> raw cloudID string sent to function `joinGroup` (the server resolves it with `cloud.getOpenData`; no `wx.cloud.CloudID` wrapper) | `js/share.js` | the group chat's `opengid`, decrypted **on our server**, stored with the user's OpenID | not in the official table (phase0 §11), but it is group-relationship data | custom item 3 |
| `wx.requestSubscribeMessage` | `js/subscribe.js` (only from the 提醒我 tap, only if a template ID exists) | the user's consent for one notice | no | custom item 6 |
| `wx.createFeedbackButton` | `js/main.js` (设置 -> 联系我们 / 反馈) | text/images the user chooses to send through WeChat's feedback component | no (phase0 §11) | custom item 8 |
| `wx.shareAppMessage`, `wx.showShareMenu`, `wx.updateShareMenu({withShareTicket:true})`, `wx.onShareAppMessage` | `js/share.js` | the user's own tap shares a card; `shareTicket` is used to get the group id | no | covered by item 3 |
| `wx.createRewardedVideoAd`, `createInterstitialAd`, `createBannerAd` | `js/ads.js` | ad delivery by WeChat's ad service; we receive no personal data | no | item 9 (statement only) |
| `wx.cloud.init({traceUser:false})`, `wx.cloud.callFunction` | `js/api.js` | every call carries the OpenID to our functions (from the platform context) | no | custom item 2 |
| `wx.setStorageSync` / `getStorageSync` (key `kd_state_v1`) | `js/store.js` | progress, settings, archive results, local flags, **on the device only** | no | item 10 (statement only) |
| `wx.getWindowInfo` / `getSystemInfoSync`, `getMenuButtonBoundingClientRect` | `js/main.js` | screen size and capsule position for layout; not sent anywhere | no | not declared |
| `wx.getEnterOptionsSync`, `getLaunchOptionsSync` | `js/main.js` | scene value and share query/ticket; scene value is sent in `session_start` | no | custom item 7 |
| `wx.getGameLogManager().log` (error level only) | `js/analytics.js` | error code and screen name, to WeChat's game log | no | custom item 7 |
| `wx.showKeyboard` (`maxLength: 12`), `wx.onKeyboardInput`, `wx.onKeyboardConfirm`, `wx.onKeyboardComplete`, `wx.onKeyboardHeightChange`, `wx.hideKeyboard`, `wx.updateKeyboard`; fallback `wx.showModal({editable:true})` when the keyboard API is missing | `js/keyboard.js` only (the one place `wx.showKeyboard` is called) | the text the host types as a clue; a canvas input, not a privacy interface; the draft stays in memory (`st.create.text`, wiped when the screen is left, TD-86) until sent to `setClue` | no (spec §13: no new 隐私接口 declaration; [VERIFY form] that the MP form's free-text sections carry it) | custom items 9-13 |
| `wx.openPrivacyContract` | `js/controller.js` (设置), `js/flows/boards.js`, `js/flows/rounds.js` (发言规则 sheet link) | opens this guide | no | not declared |
| `wx.vibrateShort`, `createInnerAudioContext`, `createCanvas`, touch events | various | none | no | not declared |

Not used anywhere (verified by grep on the D-2 build, 2026-10-16, stub and mock excluded, and by the tests of AC 29/68): `getUserInfo`, `getUserProfile`, `createUserInfoButton`, `wx.login`, location, phone, album, camera, microphone, clipboard, Bluetooth, sensors, `wx.reportEvent`, `wx.getShareInfo`, any payment API. **Text input exists only for the host's typed clue (keyboard calls above, and the feedback component); nowhere else** (grep: `wx.showKeyboard` only in `js/keyboard.js`). (The 2026-10-15 audit said "any text input" was absent: true before D-2, no longer.)

### 1.2 What our cloud functions store (collections, all `kedupan_` prefixed, deny-all to clients)

`daily_entries` (OpenID, date, 5 positions, timestamps), `player_stats` (OpenID, streaks), `group_members` (openGId, OpenID, groupRef), `group_daily` (groupRef, group score), `rounds` + `guesses` (host OpenID, hidden target, clue choice, **the typed clue text (`rounds.clueText`, stored only after it passed) and its check record `clueMod`**, guess positions), `reveal_views` (OpenID, round, time: that a player was shown a round's answer), `sub_grants` (round, OpenID, template id), `card_reports` (OpenID, item id, reason), `events` (event name, sessionId, props, timestamps), `anomalies` (OpenID, flag), `rate_limits` (OpenID counters, short-lived), **and, new with D-2 [SPEC §11.1]: `mod_log` (every WeChat text check: verdict, label, trace id, API, latency, error code, **and the host's OpenID**; the text itself only when the result was not `pass`, that is blocked, or the check did not finish), `mod_quota` (daily counts, no OpenID), `clue_reports` (reporter OpenID, round, reason, state), `audit_log` (admin operations), and on `player_stats` the strikes, restriction and 发言规则 agreement (version and time)**, aggregates without identity (`daily_sets`, `daily_card_stats`, `item_usage`, `app_config`, `meta`). Retention: `cleanup` (04:00) deletes every identity-bearing collection past **180 days** (`core/config.js retentionDays: 180`; `cleanup/index.js`), `rate_limits` at their own expiry; aggregates are kept. [SPEC §11.2] `cleanup` also covers `clue_reports`, `mod_log`, `mod_quota`, `audit_log` and the typed clue with its round (180 days).

---

## 2. Items to declare in the console (in this order)

### Standard-API item (console detects it; you fill the purpose)

**Item 1. 微信朋友关系**
- 使用目的 (paste): `用于在好友榜、本群页和刻度题揭晓页中，显示同样在玩本游戏的好友或同群好友的昵称、头像和当日成绩，以及计算“今天和你最同频的人”。仅在微信开放数据域内展示，开发者服务器不会接收好友或群成员的昵称、头像。`
- 存留期限 (paste): `本游戏写入的成绩标记（仅含日期和当日分数）保存在微信用户云存储中，每日覆盖更新，只保留最近一次。好友、群成员的昵称和头像只在展示时读取，不保存。`
- Expected console behaviour: `wx.setUserCloudStorage` and the two read APIs are detected as 微信朋友关系. If the console also lists 昵称、头像 (the open data domain variants of getUserInfo), declare it with the same purpose text; if it shows any other item, stop and tell the CTO (it would mean code or the scan changed).

### Custom items (非标准 API: processing by our own cloud functions)

Add each as "其他自定义信息类型" [VERIFY form: the page says to add "其他自定义信息类型"; field names are shown only in the console]. Use the name in bold, then the two texts.

| # | 信息类型 (name) | 使用目的 | 存留期限 |
|---|---|---|---|
| 2 | **微信用户标识 (OpenID)** | 区分不同玩家，保证每张卡只记录一次答案，并把答案、排名和出题记录对应到同一个玩家。OpenID 不会展示给其他玩家。 | 自产生之日起最长保存 180 天，到期自动删除。 |
| 3 | **群聊标识 (从群聊卡片进入时获取的群 ID)** | 用于统计本群的每日默契度和排名。群 ID 仅在开发者服务器端解密并保存，不会发送到其他玩家的手机；玩家端只收到无法反推的群编号。 | 自玩家最后一次从该群进入之日起最长保存 180 天，到期自动删除。 |
| 4 | **游戏内答题数据 (每日答案位置、答题时间、成绩、连续天数)** | 计算每日默契分、全国对比、本群和好友排名、连续天数，并在往期回看中展示。 | 个人答题记录自产生之日起最长保存 180 天，到期自动删除；不含个人身份的汇总统计（每张卡的分布）长期保留。 |
| 5 | **出题与猜测数据 (出题人、隐藏位置、所选提示词、猜测位置、玩家查看某题答案的记录)** | 实现“出题”玩法：让群友猜位置、揭晓并计算本题默契值；记录玩家是否已查看某题答案（OpenID、题目编号、时间），用于判断此后的猜测是否属于揭晓后作答。 | 自产生之日起最长保存 180 天，到期自动删除。 |
| 6 | **订阅消息授权记录** | 仅当玩家点击“揭晓时提醒我”并同意订阅后，在该题揭晓时发送一次“刻度题揭晓了”通知。一次授权最多发送一条，不会用于其他用途。 | 自授权之日起最长保存 180 天，到期自动删除。 |
| 7 | **使用日志 (事件名称、会话编号、进入场景值、游戏版本、错误代码)** | 统计功能使用情况（如是否完成每日题、是否分享、提示的字数和审核结果类别），排查故障、改进体验。不包含你写的提示内容、昵称、头像、群 ID 或位置。 | 自产生之日起最长保存 180 天，到期自动删除。 |
| 8 | **用户主动提交的反馈 (“这张卡有问题”的三选一原因；设置里的“联系我们/反馈”中填写的文字和图片)** | 处理题目问题和用户反馈。“这张卡有问题”只记录题目编号和所选原因；“联系我们/反馈”由微信反馈组件提供，内容由开发者在小游戏后台查看。 | 题目反馈自提交之日起最长保存 180 天；通过微信反馈组件提交的内容按微信平台规则保存，开发者仅在处理反馈所需期间使用。 |
| 9 | **你自己写的提示（出题时输入的 1 到 12 个汉字）** | 展示给打开这道题的人（群友，或转发后打开题目卡片的其他人）；展示前送微信内容安全服务检测；处理举报。提示不会出现在分享卡片、分享标题、订阅消息或好友榜上。 | 随这道题保存，自产生之日起最长 180 天，到期自动删除；被举报隐藏的提示不再展示给任何人，作为管理员证据保留到同一期限；你可以通过“设置 - 联系我们/反馈”要求我们删除。输入过程中的草稿只在手机内存里，不保存、不上传。 |
| 10 | **内容审核记录（审核结论、标签、检测编号、审核接口、耗时、错误代码；仅在未通过审核或检测未完成时保留相关文字）和管理操作记录** | 内容安全：判断提示是否合规，处理违规和举报，留存必要证据；记录管理人员对提示的隐藏、恢复、删除和限制操作。仅供管理人员查看，不展示给任何玩家。 | 自产生之日起最长 180 天，到期自动删除。 |
| 11 | **向微信内容安全服务提供提示文字** | 你写的提示在展示给其他玩家之前，我们会把文字副本和你的 OpenID 发送给微信的内容安全服务（小游戏文本内容安全识别），仅用于判断是否合规。 | 微信按其规则处理；我们只保存审核结论（见第 10 项）。 |
| 12 | **举报记录（举报人标识、被举报的题目、所选理由）** | 处理举报。被举报的提示立即对所有人隐藏。举报理由是固定选项（色情低俗、政治敏感、辱骂攻击、广告引流、其他不适），没有文字输入；举报人不会被透露给任何人，包括出题人。 | 自产生之日起最长 180 天，到期自动删除。 |
| 13 | **违规与限制记录、发言规则同意记录（违规时间、限制期限、同意的规则版本和时间）** | 内容安全：对多次违规的玩家暂时限制自己写提示（只限制写提示，不影响每日刻度、往期、猜题和选提示词出题）；保留你同意发言规则的记录。 | 随玩家记录保存，自最后一次更新起最长 180 天，到期自动删除。 |

(Items 2-8 match section 1.1; items 9-13 are new with D-2 and match section 3, rows 15-21. In the body text below, items 14 (ads) and 15 (on-device data) are statements, not data types; they were numbered 9 and 10 before D-2.)

### Statements to include in the guide body (paste into the "其他说明" / 隐私政策 text area [VERIFY form])

---
**以下为完整指引正文，可整段粘贴：**

```
《群友刻度盘》用户隐私保护指引

更新日期：【上线日期，粘贴时填写】

开发者：【企业全称，粘贴时填写】（以下简称“我们”）
联系方式：【客服邮箱或电话，粘贴时填写】

我们非常重视你的个人信息保护。本指引说明《群友刻度盘》小游戏在你使用过程中会处理哪些信息、为什么处理、保存多久，以及你如何行使权利。我们遵循合法、正当、必要和诚信的原则，只处理实现功能所必需的最少信息。

一、我们不会要求你做的事
玩游戏不需要登录、注册，也不需要你提供昵称、头像、手机号、位置、通讯录、相册、摄像头、麦克风或剪切板内容。游戏里唯一需要你输入文字的地方，是出题时你自己写的提示（最多 12 个汉字），而且可以不写：出题时也可以直接选一个现成的提示词。即使你拒绝下面提到的任何授权，也可以继续玩每日刻度、往期刻度和出题。

二、我们处理的信息、目的和保存期限
1. 微信朋友关系（需要你同意）
   - 内容：游戏会把你当天的日期和成绩写入微信用户云存储（一个名为 kd 的记录，每天覆盖一次）；在你打开好友榜、本群页或刻度题揭晓页时，由微信开放数据域读取同样在玩本游戏的好友或同群好友的昵称、头像和该记录。
   - 目的：显示好友榜、本群排名、揭晓页中的昵称和头像，并计算“今天和你最同频的人”。
   - 说明：昵称和头像只在微信开放数据域内显示，我们的服务器不会接收、保存好友或群成员的昵称和头像。你拒绝授权时，榜单会以“群友 A、群友 B”等匿名方式显示，不影响游戏。
   - 保存期限：写入的记录每日覆盖，只保留最近一次；读取的昵称头像不保存。
2. 微信用户标识（OpenID）
   - 目的：区分玩家，保证每张卡只记录一次答案，并把你的答案、排名和出题记录对应到你自己。OpenID 不会展示给其他玩家。
   - 保存期限：自产生之日起最长 180 天，到期自动删除。
3. 群聊标识
   - 内容：当你从微信群聊里的游戏卡片进入游戏时，微信会提供该群的标识。我们在服务器端解密并保存它，与你的 OpenID 关联。
   - 目的：统计本群每日默契度、排名和近 7 天走势。其他玩家的手机上只会收到无法反推出群身份的群编号。
   - 保存期限：自你最后一次从该群进入之日起最长 180 天，到期自动删除。
4. 游戏答题数据
   - 内容：你每天每张卡放置的位置（0 到 100 的数字）、答题时间、得分和连续天数。
   - 目的：计算每日默契分、与全国和本群的对比、好友和群内排名、往期回看。
   - 保存期限：与个人相关的记录最长 180 天，到期自动删除；不含个人身份的汇总数据（例如某张卡的位置分布）会长期保留，用于计算“全国”参考位置。
5. 出题与猜测数据
   - 内容：出题人、隐藏位置、所选提示词（如果你选择自己写提示，则是下面第 9 项的提示文字），以及猜测者放置的位置；玩家查看某题答案的记录（OpenID、题目编号、查看时间）。
   - 目的：实现“出题”玩法，揭晓时显示所有猜测并计算本题默契值；判断查看答案之后的猜测属于揭晓后作答。
   - 保存期限：最长 180 天，到期自动删除。
6. 订阅消息
   - 内容：只有当你点击“揭晓时提醒我”并在微信弹窗中同意后，我们才会记录这次授权。
   - 目的：在该题揭晓时向你发送一次“刻度题揭晓了”通知。一次授权最多一条，不会用于其他目的。
   - 保存期限：最长 180 天，到期自动删除。
7. 使用日志
   - 内容：事件名称（例如完成每日题、点击分享）、会话编号、进入场景值、游戏版本和错误代码；出题时只记录提示的字数和审核结果类别，不记录提示的内容。
   - 目的：了解功能使用情况、排查故障、改进游戏。日志不包含昵称、头像、群标识或位置。
   - 保存期限：最长 180 天，到期自动删除。
8. 反馈信息
   - “这张卡有问题”：只记录题目编号和你选择的原因（不合适、有歧义、有错字）。
   - “联系我们 / 反馈”：由微信的反馈组件提供，你填写的文字和图片由我们在小游戏后台查看，仅用于处理你的反馈。请不要在反馈中填写不必要的个人信息。
   - 保存期限：题目反馈最长 180 天；通过微信反馈组件提交的内容，按微信平台规则保存，我们仅在处理反馈所需期间使用。
9. 你自己写的提示
   - 内容：出题时你自己输入的提示（1 到 12 个汉字，只能写中文，不能含数字、联系方式和违规内容）。输入过程中的草稿只留在手机内存里，不保存、不上传。
   - 目的：在你把题目发到群里之后，把提示展示给打开这道题的人（通常是群友；题目卡片被转发时，也可能是群外的人）。提示不会出现在分享卡片、分享标题、订阅消息或好友榜上。你不会被要求使用昵称或头像，出题人对猜题的人是匿名的。
   - 保存期限：随这道题保存，最长 180 天，到期自动删除。被举报隐藏的提示不再展示给任何人，作为管理员证据保存到同一期限。你可以通过“设置 - 联系我们/反馈”要求我们删除你写的某条提示。
10. 内容审核与管理记录
   - 内容：每次内容检测的结论、标签、检测编号、所用接口、耗时和错误代码；只有在未通过审核（或检测没有完成）时才会保留相关文字，用于处理违规和作为证据；管理人员对提示的隐藏、恢复、删除和限制操作记录。
   - 目的：内容安全。没有通过审核的提示不会展示给任何其他玩家。这些记录只有管理人员能看到。
   - 保存期限：最长 180 天，到期自动删除。
11. 微信内容安全检测
   - 你写的提示在展示给其他玩家之前，我们会把提示文字的副本和你的 OpenID 发送给微信的内容安全服务（小游戏文本内容安全识别），仅用于判断是否合规。检测没有给出明确的“通过”结果时（例如服务繁忙或超时），提示不会展示给任何人，你可以重试或改选现成的提示词。
12. 举报记录
   - 内容：举报人标识、被举报的题目、所选理由。理由是固定选项（色情低俗、政治敏感、辱骂攻击、广告引流、其他不适），没有文字输入。
   - 目的：处理举报。被举报的提示立即对所有人隐藏，题目和猜测照常进行。我们不会向任何人透露举报人，包括出题人。
   - 保存期限：最长 180 天，到期自动删除。
13. 违规与限制记录、发言规则同意记录
   - 内容：你的提示未通过审核或举报成立的记录（按最近 30 天计次）、限制期限，以及你同意《发言规则》的版本和时间。
   - 目的：内容安全。第 1 次违规会提醒你；第 2 次起会暂时限制你自己写提示（24 小时、7 天、30 天；情节严重的可以更久），限制期间你仍然可以玩每日刻度、往期刻度、猜题，也可以选现成的提示词出题。保留你同意发言规则的记录，用于说明你已看到规则。详见《发言规则》和《用户协议》。
   - 保存期限：自最后一次更新起最长 180 天，到期自动删除。
14. 广告
   - 游戏中的激励视频、插屏和横幅广告由微信广告服务提供。我们不会因此获得你的个人信息。广告相关的信息处理由微信按其规则进行。
15. 保存在你手机上的信息
   - 游戏进度、声音和显示设置、往期练习成绩、写提示时尚未发出的草稿（只在内存里，离开页面即丢）等只保存在你的手机本地，卸载游戏或清除缓存后即删除，不会上传。

三、信息的存放与共享
所有服务器端数据存放在中国大陆的微信云开发环境中。我们不会向任何第三方出售、出租或共享你的个人信息，也不会把信息传输到境外，法律法规另有规定的除外。

四、你的权利
你可以随时在游戏“设置”中查看本指引，并在微信的“设置 - 隐私 - 小程序”中管理授权。你可以通过上述联系方式或“设置 - 联系我们/反馈”要求我们查阅、更正或删除与你有关的数据，包括你写过的某条提示；我们会在核实身份后及时处理（被删除的提示会从题目中移除，内容安全记录按第 10 项的期限保留）。180 天的自动删除不影响你随时提出删除要求。你可以随时在“设置 - 发言规则”中查看发言规则。

五、未成年人
本游戏内容为日常事物的观点对比，没有聊天、没有私信、没有付费。游戏里唯一的用户发布内容是出题人写的短提示（最多 12 个汉字，只能写中文，不能含数字和联系方式）：它先经过内容安全审核、通过后才会展示，可以被举报并立即隐藏，多次违规会被限制写提示，也不会出现在分享卡片上。我们不收集你的年龄。如果你是未成年人，请在监护人指导下使用；监护人发现问题可以通过上述联系方式联系我们，我们会核实并处理，例如隐藏相关提示。

六、指引的更新
指引更新后，我们会在游戏内展示并以微信规定的方式提示你。

七、联系我们
【客服邮箱或电话，粘贴时填写】
```
---

Placeholders the founder must fill: 更新日期 (launch date), 企业全称, 联系方式 (a monitored email or phone; it must equal the 联系邮箱 in the 《用户协议》, `user-agreement.md`). Nothing else. The body text above uses 《发言规则》 and 《用户协议》 by name; both are signed off in HANDOFF step H15 before this guide is entered, so that the three texts agree (12 characters, the strike ladder, 180 days).

---

## 3. Cross-check against spec §13 and the code

| # | Item | Spec §13 / §6 | Code | Verdict |
|---|---|---|---|---|
| 1 | KV marker | `kd = {d, s}`, one key, overwritten daily | `privacy.js` `writeMarker`: key `kd`, value `{d, s}`; once a day after 看结果; held as `markerPending` on refusal (104) | Match (spec §8.2 says "first complete daily / first round guess"; code writes from the 看结果 tap, TD-48; both are user-tap triggers) |
| 2 | Friend/group names | "not received by us; open data domain only" | `opendata/index.js` reads them and draws; no `postMessage` back; AC 49 test | Match |
| 3 | Retention | 180 days for all identity data | `retentionDays: 180`; `cleanup` covers 12 collections (incl. `reveal_views`) | Match. Wording refined: deletion is 180 days after each record's own date/last update (spec: "after last activity"); the guide says "自产生之日起最长 180 天" (accurate and never longer) |
| 4 | OpenID | listed | stored in the identity-bearing collections of §1.2 (incl. `reveal_views`) | Match |
| 5 | Group id | listed (`group_members`) | `joinGroup` stores raw openGId; clients get `groupRef` only | Match |
| 6 | Subscribe | opt-in grant | `subscribe.js`, `subscribeRound` | Match |
| 7 | **User-typed text** | §13 (rev. 984896c): "The only free text we receive is the typed clue ... and feedback the player chooses to send through WeChat's feedback component" | Pre-D-2 code: only `wx.createFeedbackButton` (settings 联系我们/反馈), whose text reaches the **MP console**. Typed clue: [SPEC] keyboard calls, `setClue` | **Resolved by D-2.** The 2026-10-15 mismatch (spec said no typed text) is gone: spec §13 now lists the typed clue and the feedback component; the guide discloses both (items 8 and 9). The earlier guide text "没有任何输入文字的地方" is replaced |
| 8 | **`rate_limits` counters** | not in the §13 inventory | OpenID-keyed per-minute/per-day counters, deleted at their own `expireAt` | **Gap in the spec inventory** (short-lived). Covered in the guide by item 2 (OpenID) and 7; add a row to §13 |
| 9 | **Session / scene in events** | "Analytics events, anomaly flags" | `session_start` carries `scene`; common props `isNewUser`, `contentVersion`, `appVersion`; `sessionId` top level | Match; the guide names scene, session id, version (item 7). No device model, IP or location is collected by our code |
| 10 | `anomalies` | observe-only flag with OpenID | `fast` flag when card 5 completes < 6 s after card 1 | Match; covered under item 7 (usage log) |
| 11 | Ads | "Ad data: per WeChat" | three ad APIs | Match (statement item 9). Re-check after 流量主 is on: WeChat may add its own disclosure requirement for ad components [VERIFY console] |
| 12 | Local storage | "device only" | `kd_state_v1` | Match |
| 13 | **WeChat cloud platform logs** | not mentioned | `traceUser:false`, but cloud function invocation logs held by WeChat Cloud contain OpenID | Informational: platform-side; no action; the guide's "存放在微信云开发" statement covers it |
| 14 | Popup trigger | official popup, first privacy interface call follows a user action | first `setUserCloudStorage` after the 看结果 tap, or 同意并查看 / `requirePrivacyAuthorize` | Match; real placement is device item E4 (AC 65) |

**Rows 15-21 (new with D-2; checked against the D-2 code on 2026-10-16 at 84c6881):**

| # | Item | Spec §13 / §11 | Code | Verdict |
|---|---|---|---|---|
| 15 | Typed clue text | `rounds.clueText`, only after `pass`; 180 days with the round; never on cards, titles, subscribe messages or the open data domain (PD-37); draft in memory only | `setClue/index.js` stores `clueText` and `clueMod` only after `checkText` returned `pass`, in a transaction that re-reads the round; `js/share.js` builds the round card from `shareClueLine` (typed round: the fixed line 「提示在题目里，点开看看」, never the text); `getGroupDay` serves only a curated preset clue (`U.publicClueText`), never a typed one; `subscribeRound` and `opendata/` carry no clue; the draft lives in `st.create.text` and is wiped on leaving the screen (TD-86) | **Match.** Guide item 9 |
| 16 | Moderation records | `mod_log` (text only for non-pass), `rounds.clueMod`, `mod_quota` (no OpenID); 180 days | `common/modio.js logMod` writes `mod_log` {roundId, **openid**, api, result, latencyMs, label, traceId, errCode, kind, ts}; **`text` is added whenever `result !== 'pass'`, which includes `busy` (check did not finish), not only blocked text**; `mod_quota` {dateKey, ts, text, busy} has no OpenID; `rounds.clueMod` = {api, suggest, label, traceId, ts}, never returned to clients | **Mismatch fixed in the guide:** item 10 and body item 10 said the text is kept only when it did not pass the review; they now say 未通过审核或检测未完成. The `mod_log` row also carries the OpenID (item 2 covers it). Retention: `cleanup` deletes `mod_log` and `mod_quota` at 180 days |
| 17 | Text sent to WeChat | game `msgSecCheck` v2, scene 3, author's OpenID, normalised clue; no nickname | `core/moderation.js gameTextParams` = `{openid, version: 2, scene: 3, content}` via `wxapi.gameMsgSecCheck` (`cloud.openapi.security`/`wxa.game.contentSpam.msgSecCheck`); the general fallback sends `{content, version: 2, scene, openid}` | **Match.** Nothing else is sent (no nickname, group id or round id); guide item 11. `setClue/config.json` declares the two permissions |
| 18 | Reports | `clue_reports` (reporter OpenID, round, reason, state); never shown to anyone; 180 days | `reportClue/index.js` adds `clue_reports` {_id, roundId, openid, reason, state:'open', ts}; reasons are a fixed list; `admin` `reportView` returns reason, state, ts and never the reporter | **Match.** Guide item 12; `cleanup` deletes `clue_reports` at 180 days |
| 19 | Strikes, restriction, 发言规则 record | `player_stats` fields; 180 days after the last update | `agreeRules/index.js` -> `core.U.agreeRules` stores `rulesVersion` and `rulesAt` on `player_stats` (idempotent, first time kept); strikes, restriction and `clueChecks` (daily counter) live on `player_stats` (`players.strike`, `restrict`); `cleanup` deletes `player_stats` by `updatedAt` at 180 days | **Match.** Guide item 13 (the daily check counter `clueChecks` is a number, covered by item 7 and 13) |
| 20 | Admin audit log | `audit_log`; 180 days | `admin/index.js audit()` writes {op, target, before, after, by, ts}; `cleanup` deletes `audit_log` at 180 days; `target` can be an OpenID (`restrict`, `liftRestriction`) | **Match.** Guide item 10 |
| 21 | Analytics carry no clue text | PD-38: `clue_*` events carry reason codes, counts, latency only; `track` allowlist | `core/events.js` allowlist: `round_clue` {roundId, clueMode, presetSwaps, chars?, tabSwitches?}, `clue_tab`, `clue_result` {result, reason?}, `clue_check` {api, suggest, label?, latencyMs, errCode?} (server side), `rules_view`, `rules_agree`, `clue_report` {roundId, reason, result}, `strike`, `restrict`, `ugc_pause`; `chars` is an integer; the client guard `clue-ui.js CLUE_EVENT_PROPS` and QA's test scan every stored event for clue text | **Match.** No clue text, trace id or blocked text in any event; guide item 7 |

Still open (founder, not code): spec §13 [VERIFY release] whether the MP privacy form's free-text sections carry the typed clue (no 隐私接口 is used); the founder checks the form when entering the guide (HANDOFF step 2).

**Mismatch summary:** one code-versus-guide mismatch on the D-2 build, fixed in the text on 2026-10-16: `mod_log` also keeps the clue text when the check did not finish (busy/timeout), not only when it was blocked (rows 16, items 10 and body 10). No other mismatch on rows 15-21. The earlier spec gap about typed text is closed by the D-2 spec revision. One spec §13 gap remains: `rate_limits` (OpenID counters, short-lived) is not in the inventory; it is covered by guide items 2 and 7 (add a row to §13; spec owner: product-ux / CTO). Rows 15-21 were re-checked against the D-2 code on 2026-10-16.

## 4. Founder steps (copied into HANDOFF section 2)
1. MP -> 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新.
2. Declare 微信朋友关系 (item 1) and the custom items 2-13 with the texts above (items 9-13 are new with the typed clue); paste the full body; fill the three placeholders; save and submit for review.
3. MP -> 基本设置 -> 隐私授权弹窗 -> enable the official popup (irreversible; intended).
4. Screenshot the saved guide and send it to the CTO. Check item 1 of the device pass (E4) afterwards.
