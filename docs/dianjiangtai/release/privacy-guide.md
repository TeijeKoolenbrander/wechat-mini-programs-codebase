# 点将台: 用户隐私保护指引 (privacy guide pack)

Author: release. Date: 2026-10-15. Build checked: `kept-ideas/v1` at commit `3df1b89333d8d05b1d008ce57bfd29b2d1f46452` (v1, contentVersion 2, configVersion 3; the code is identical to 6582873). Status: **text ready; entering it in the console is a founder step (HANDOFF section 2).** Nothing was entered anywhere.

Official basis (read 2026-10-15): 隐私合规开发指南 https://developers.weixin.qq.com/minigame/introduction/guide/privacy.html . Where the console form has a field the page does not describe, it is marked [VERIFY form]: the console is the authority; screenshot the form before you save.

How the console works (from that page): MP 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新 (or 设置 -> 基本设置 -> 用户隐私保护指引). The console lists the information types its code scan detects (标准 API); anything we process by non-`wx` means (our cloud functions) is added as "其他自定义信息类型". The guide must be completed before 版本审核 (bbsh.html step 2), and the official privacy popup must be on (MP 基本设置 -> 隐私授权弹窗; cannot be switched off afterwards). Error **112** at run time means an interface is used but not declared; **1025/1026** means nothing is declared or the popup is not implemented; **104** means the user has not agreed.

---

## 1. What the code actually does (audit of every `wx` call)

Method: grepped every `wx.*` reference in `apps/dianjiangtai/game/{game.js,js,core,opendata}` (the dev-only `js/mock-server.js` and `js/stub-render.js` are excluded: neither ships) and every cloud function and `common/` file, 2026-10-15, at 3df1b89 (the wx calls added since 0030bed are `createInnerAudioContext` for the real sound cues, a not-declared device API, and the two ad constructors already listed). Every distinct `wx` API called in shipped code is listed in 1.1 (comments that only mention an API, for example the `wx.reportEvent` and `wx.getShareInfo` notes in `analytics.js` and `share.js`, are not calls).

### 1.1 `wx` APIs that touch user data or user-visible permissions

| API | Where | Touches | Privacy interface? | Declare as |
|---|---|---|---|---|
| `wx.setUserCloudStorage` (key `d_<YYYYMMDD>`, value `{"w":wins,"l":losses}`) | `js/privacy.js` `writeMarker`, after a **server-confirmed ranked daily result** | the user's own cloud-storage KV (微信朋友关系 data): date and win/loss count only | **Yes** (微信朋友关系) | item 1 |
| `wx.removeUserCloudStorage` (keys older than 7 days) | `js/privacy.js` `pruneOld` | the same KV | **Yes** (微信朋友关系) | item 1 |
| `wx.getFriendCloudStorage`, `wx.getGroupCloudStorage` (read `d_<date>`, nickname, avatar, openid of friends / group members) | `opendata/index.js` (open data domain only; one-way, cannot post back) | friends' and group members' nickname, avatar and the `d_` value; **never leaves the open data domain**, our servers never receive them | **Yes** (微信朋友关系) | item 1 |
| `wx.getOpenDataContext`, `wx.getSharedCanvas`, `wx.onMessage`, `wx.createImage` (avatar image in the open data domain) | `js/odc.js`, `opendata/index.js` | draws the board onto the shared canvas | no | covered by item 1 |
| `wx.authorize({scope:'scope.WxFriendInteraction'})`, `wx.getSetting`, `wx.openSetting` | `js/privacy.js`, `js/album.js` | permission state only; `authorize` only from the board-open tap, `openSetting` only from the 去设置 tap | no | covered by items 1 and 2 |
| `wx.requirePrivacyAuthorize`, `wx.getPrivacySetting`, `wx.openPrivacyContract` | `js/privacy.js`, `js/controller.js` | the official privacy popup and the link to the guide | no | n/a |
| `wx.saveImageToPhotosAlbum` (+ `scope.writePhotosAlbum` via `getSetting`) | `js/album.js`, only from the **保存图片** tap | writes the result card (1000 x 800) to the user's album; we never read the album | **Yes** (相册（仅写入）) | item 2 |
| `wx.getGroupEnterInfo` -> the **raw cloudID string** sent to function `joinGroup` (the server resolves it with `cloud.getOpenData`; no `wx.cloud.CloudID` wrapper, no client-shaped object) | `js/share.js` `enterGroup` | the group chat's `opengid`, decrypted **on our server**, stored with the user's OpenID | not in the official table (phase0 §11), but it is group-relationship data | custom item 4 |
| `wx.requestSubscribeMessage` | `js/subscribe.js`, only from the 提醒我 tap, only if a template id exists | the user's consent for one notice | no | custom item 7 |
| `wx.createFeedbackButton` | `js/main.js` (设置 -> 联系我们 / 反馈) | text/images the user chooses to send through WeChat's feedback component | no (phase0 §11) | custom item 10 |
| `wx.shareAppMessage`, `wx.showShareMenu`, `wx.updateShareMenu({withShareTicket:true})`, `wx.onShareAppMessage` | `js/share.js` | the user's own tap shares a card; `shareTicket` is used to get the group id | no | covered by item 4 |
| `wx.createRewardedVideoAd`, `wx.createInterstitialAd`, `wx.createBannerAd` | `js/ads.js` | ad delivery by WeChat's ad service; we receive no personal data | no | statement 11 |
| `wx.cloud.init({traceUser:false})`, `wx.cloud.callFunction` | `js/api.js` | every call carries the OpenID to our functions (from the platform context); `traceUser` is off | no | custom item 3 |
| `wx.setStorageSync` / `wx.getStorageSync` (key `djt_state_v1`) | `js/store.js` | run progress, settings (声音, 大字模式, 高对比度), local flags, marker bookkeeping, **on the device only** | no | statement 12 |
| `wx.getWindowInfo`, `wx.getAppBaseInfo`, `wx.getSystemInfoSync`, `wx.getMenuButtonBoundingClientRect` | `js/main.js`, `js/controller.js` | screen size, capsule position, system font-size setting (for the first-launch 大字模式 default); only the **platform** string (`ios`/`android`/...) leaves the device, inside `events` | no | custom item 8 (platform) |
| `wx.getEnterOptionsSync`, `wx.getLaunchOptionsSync`, `wx.onShow`, `wx.onHide` | `js/main.js` | scene value and share query/ticket; the scene value is sent in `session_start` / `group_join` | no | custom item 8 |
| `wx.getGameLogManager().log` (error level only: screen name and error code) | `js/analytics.js` | to WeChat's own game log | no | custom item 8 |
| `wx.vibrateShort`, `wx.createInnerAudioContext`, `wx.createCanvas`, `wx.onTouch*` | various | none | no | not declared |

Not used anywhere in shipped code (verified by grep and by tests `release-gate.test.js`, `qa-content.test.js`, `wechat-compat.test.js`): `wx.getUserInfo`, `wx.getUserProfile`, `wx.createUserInfoButton`, `wx.login`, `wx.request`, `wx.downloadFile`, `wx.uploadFile`, `wx.connectSocket`, location, phone, camera, microphone, clipboard (`setClipboardData` is itself a privacy interface; challenge codes are never copied), Bluetooth, `wx.reportEvent`, `wx.getShareInfo` (deprecated), any text input, any payment API. The only text in the build that can come from the user is whatever they type into WeChat's own feedback component.

### 1.2 What our cloud functions store (14 functions, 17 collections, all deny-all to clients)

Collections are **not** prefixed (the game uses its own cloud environment, `post-release.md` section 1). Identity-bearing, 180-day retention (`RETENTION_DAYS = 180`, `common/util.js`; `cleanup`, 04:00): `runs` (OpenID, mode, seed, 5 picks and actions, record, timestamps; **free-play runs are submitted too**), `daily_starts` (OpenID, date), `daily_results` (OpenID, date, record, lineup, submit time, streak), `daily_progress` (OpenID, date, actions so far), `group_members` (openGId, OpenID, groupRef, first/last seen), `challenges` (owner OpenID, run, record, lineup, 7-day expiry), `challenge_answers` (challenge id, answerer OpenID, time), `sub_grants` (challenge id, owner OpenID, template id, send status), `player_stats` (OpenID, current/best streak, last daily date, daily count, anomaly count), `anomalies` (OpenID, run id, flag kind, client/server record), `events` (OpenID, session id, event name and typed props, timestamps). `rate_limits` (OpenID, function bucket, minute, count) expire after one hour (`expireAt = now + 1 h`) and are removed by the next `cleanup`, so they live at most about one day. No personal data: `daily_seeds`, `daily_seed_bank`, `daily_stats` (aggregate histogram, kept), `meta` (launch date and roll-up claim markers: a date and a server time, kept), `app_config` (remote config).

---

## 2. Items to declare in the console (in this order)

### Standard-API items (console detects them; you fill the purpose)

**Item 1. 微信朋友关系**
- 使用目的 (paste): `用于在好友榜和本群榜中显示同样在玩本游戏的好友或同群好友的昵称、头像和当日战绩。仅在微信开放数据域内展示，开发者服务器不会接收好友或群成员的昵称、头像。`
- 存留期限 (paste): `本游戏写入的战绩标记（仅含日期和当日胜负数）保存在微信用户云存储中，每日一条，只保留最近 7 天，更早的由游戏自动删除。好友、群成员的昵称和头像只在展示时读取，不保存。`
- Expected console behaviour: `wx.setUserCloudStorage`, `wx.removeUserCloudStorage` and the two read APIs are detected as 微信朋友关系. If the console also lists 昵称、头像 (the open data domain variants of getUserInfo), declare it with the same purpose text; if it shows any other item, stop and tell the CTO (it would mean the code or the scan changed).

**Item 2. 相册（仅写入）** (new in v1; without it `saveImageToPhotosAlbum` fails with 112)
- 使用目的 (paste): `用于在你点击“保存图片”时，把本局战报图片保存到你的手机相册。仅写入，不读取你相册中的任何内容。`
- 存留期限 (paste): `图片只保存在你自己的手机相册中，开发者不接收、不保存。`

### Custom items (非标准 API: processing by our own cloud functions)

Add each as "其他自定义信息类型" [VERIFY form: the page says to add "其他自定义信息类型"; field names are shown only in the console]. Use the name in bold, then the two texts.

| # | 信息类型 (name) | 使用目的 | 存留期限 |
|---|---|---|---|
| 3 | **微信用户标识 (OpenID)** | 区分不同玩家，保证每日军令每人只记一次战绩，并把战绩、连续出征、挑战和排名对应到同一个玩家。OpenID 不会展示给其他玩家。 | 自产生之日起最长保存 180 天，到期自动删除。 |
| 4 | **群聊标识 (从群聊卡片进入时获取的群 ID)** | 用于显示本群今日排行。群 ID 仅在开发者服务器端解密并保存，不会发送到其他玩家的手机；玩家端只收到无法反推的群编号。 | 自玩家最后一次从该群进入之日起最长保存 180 天，到期自动删除。 |
| 5 | **游戏记录 (每局的阵容选择与操作、战绩、提交时间、连续出征天数、每日军令进度)** | 校验并计算战绩，生成每日军令的好友榜和群榜、往期回看、复盘和连续出征天数；每日军令的令牌按轮发放，需要记录你已完成的轮次。 | 个人记录自产生之日起最长保存 180 天，到期自动删除；不含个人身份的汇总统计（每期战绩分布）长期保留。 |
| 6 | **挑战数据 (战书的发起人、战绩与阵容，应战人的应战记录)** | 实现“同签挑战”：把你的战绩发给好友，好友用同一手令牌应战后对比双方战绩和阵容，并统计应战人数与最佳战绩。 | 战书 7 天后失效；相关记录自产生之日起最长保存 180 天，到期自动删除。 |
| 7 | **订阅消息授权记录** | 仅当你在发起挑战后点击“好友应战时提醒我”并同意订阅后，在好友首次应战时向你发送一次“好友接下了你的战书”通知（内容为双方战绩和时间）。一次授权最多发送一条，不会用于其他用途。 | 自授权之日起最长保存 180 天，到期自动删除。 |
| 8 | **使用日志 (事件名称、会话编号、进入场景值、运行平台、游戏版本、错误代码)** | 统计功能使用情况（例如是否完成每日军令、是否分享），排查故障、改进体验。不包含昵称、头像、群 ID 或位置。 | 自产生之日起最长保存 180 天，到期自动删除。 |
| 9 | **安全与防作弊记录 (异常标记、请求频率计数)** | 发现战绩与服务器计算不一致等异常，并限制短时间内的大量重复请求，保证榜单公平和服务稳定。异常标记只供人工复核，不会自动改变你的成绩或名次。 | 异常标记最长保存 180 天；请求频率计数每分钟一条，约一天内自动删除。 |
| 10 | **用户主动提交的反馈 (设置里“联系我们 / 反馈”中填写的文字和图片)** | 处理你反馈的问题。该功能由微信的反馈组件提供，内容由开发者在小游戏后台查看。 | 按微信平台规则保存，开发者仅在处理反馈所需期间使用。 |

(Item numbers here match section 1.1. Statements 11 and 12 below are statements, not data types.)

### Statements to include in the guide body (paste into the "其他说明" / 隐私政策 text area [VERIFY form])

---
**以下为完整指引正文，可整段粘贴：**

```
《点将台》用户隐私保护指引

更新日期：【上线日期，粘贴时填写】

开发者：【企业全称，粘贴时填写】（以下简称“我们”）
联系方式：【客服邮箱或电话，粘贴时填写】

我们非常重视你的个人信息保护。本指引说明《点将台》小游戏在你使用过程中会处理哪些信息、为什么处理、保存多久，以及你如何行使权利。我们遵循合法、正当、必要和诚信的原则，只处理实现功能所必需的最少信息。

一、我们不会要求你做的事
玩游戏不需要登录、注册，也不需要你提供昵称、头像、手机号、位置、通讯录、摄像头、麦克风或剪切板内容。游戏内没有任何输入文字的地方。即使你拒绝下面提到的任何授权，也可以继续玩每日军令、自由点将、挑战好友和分享战报；被拒绝的只是对应的功能（好友榜与群榜、保存图片、应战提醒）。

二、我们处理的信息、目的和保存期限
1. 微信朋友关系（需要你同意）
   - 内容：每次你完成一次每日军令后，游戏会把当天的日期和胜负数写入微信用户云存储（一条名为“d_日期”的记录，只保留最近 7 天）；在你打开好友榜或本群榜时，由微信开放数据域读取同样在玩本游戏的好友或同群好友的昵称、头像和该记录。
   - 目的：显示好友榜、本群榜中的昵称、头像和战绩。
   - 说明：昵称和头像只在微信开放数据域内显示，我们的服务器不会接收、保存好友或群成员的昵称和头像。榜单上的名次由我们的服务器根据已校验的战绩计算，不以你手机上写入的记录为准。你拒绝授权时，好友榜和群榜不可用，不影响其他玩法。
   - 保存期限：写入的记录只保留最近 7 天；读取的昵称头像不保存。
2. 相册（仅写入，需要你同意）
   - 内容：只有当你点击“保存图片”时，游戏才会请求把战报图片保存到你的相册。我们不会读取你相册中的任何内容。
   - 目的：让你把战报图片保存到手机。
   - 保存期限：图片只保存在你的手机相册中，我们不接收、不保存。
3. 微信用户标识（OpenID）
   - 目的：区分玩家，保证每日军令每人只记一次战绩，并把战绩、连续出征天数和挑战对应到你自己。OpenID 不会展示给其他玩家；榜单中，其他玩家的手机上只会收到当天有效、无法反推出 OpenID 的代号。
   - 保存期限：自产生之日起最长 180 天，到期自动删除。
4. 群聊标识
   - 内容：当你从微信群聊里的游戏卡片进入游戏时，微信会提供该群的标识。我们在服务器端解密并保存它，与你的 OpenID 关联。
   - 目的：显示本群今日排行。其他玩家的手机上只会收到无法反推出群身份的群编号。
   - 保存期限：自你最后一次从该群进入之日起最长 180 天，到期自动删除。
5. 游戏记录
   - 内容：每局的阵容（选了哪五员将、放在哪个位置）、你在每一轮的选择和换令操作、战绩、提交时间、连续出征天数；每日军令按轮发放令牌，因此还会记录你已完成的轮数。自由点将的战绩也会提交到服务器用于校验。
   - 目的：由服务器校验并计算战绩，生成好友榜和群榜（榜上可见战绩和阵容，阵容在你完成当日军令后才可见）、往期回看、复盘、连续出征天数。
   - 保存期限：与个人相关的记录最长 180 天，到期自动删除；不含个人身份的汇总数据（例如某一期的战绩分布）长期保留。
6. 挑战数据
   - 内容：你发起战书时，我们保存战书编号、你的战绩和阵容；好友应战后，保存应战记录、应战人数和最佳战绩。战书里不含你的昵称或头像。
   - 目的：实现“同签挑战”，让好友用同一手令牌应战并对比结果。
   - 保存期限：战书 7 天后失效；记录最长保存 180 天，到期自动删除。
7. 订阅消息
   - 内容：只有当你在发起挑战后点击“好友应战时提醒我”并在微信弹窗中同意后，我们才会记录这次授权。
   - 目的：在好友首次应战时向你发送一次“好友接下了你的战书”通知，内容为双方战绩和时间，不含好友的姓名。一次授权最多一条，不会用于其他目的。
   - 保存期限：最长 180 天，到期自动删除。
8. 使用日志
   - 内容：事件名称（例如完成每日军令、点击分享）、会话编号、进入场景值、运行平台（如 iOS 或安卓）、游戏版本和错误代码。
   - 目的：了解功能使用情况、排查故障、改进游戏。日志不包含昵称、头像、群标识或位置。
   - 保存期限：最长 180 天，到期自动删除。
9. 安全与防作弊记录
   - 内容：当战绩与服务器计算不一致、提交过快等情况出现时，我们记录一条异常标记（与你的 OpenID 和该局编号关联）；为防止短时间内的大量重复请求，我们按分钟记录每个账号的请求次数。
   - 目的：保证榜单公平和服务稳定。异常标记只供人工复核，不会自动改变你的成绩、名次或连续天数。
   - 保存期限：异常标记最长 180 天；请求次数每分钟一条，约一天内自动删除。
10. 反馈信息
   - “联系我们 / 反馈”由微信的反馈组件提供，你填写的文字和图片由我们在小游戏后台查看，仅用于处理你的反馈。请不要在反馈中填写不必要的个人信息。
   - 保存期限：按微信平台规则保存，我们仅在处理反馈所需期间使用。
11. 广告
   - 游戏中的激励视频、插屏和横幅广告由微信广告服务提供。我们不会因此获得你的个人信息。广告相关的信息处理由微信按其规则进行。
12. 保存在你手机上的信息
   - 游戏进度、声音和显示设置（大字模式、高对比度）、应战提醒的本地状态等只保存在你的手机本地，卸载游戏或清除缓存后即删除，不会上传。

三、信息的存放与共享
所有服务器端数据存放在中国大陆的微信云开发环境中。我们不会向任何第三方出售、出租或共享你的个人信息，也不会把信息传输到境外，法律法规另有规定的除外。

四、你的权利
你可以随时在游戏“设置”中查看本指引，并在微信的“设置 - 隐私 - 小程序”中管理授权。你可以通过上述联系方式要求我们查阅、更正或删除与你有关的数据；我们会在核实身份后及时处理。180 天的自动删除不影响你随时提出删除要求。

五、未成年人
本游戏为三国历史人物题材的休闲游戏，没有聊天、没有用户发布内容、没有付费。如果你是未成年人，请在监护人指导下使用。

六、指引的更新
指引更新后，我们会在游戏内展示并以微信规定的方式提示你。

七、联系我们
【客服邮箱或电话，粘贴时填写】
```
---

Placeholders the founder must fill: 更新日期 (launch date), 企业全称, 联系方式 (a monitored email or phone). Nothing else.

---

## 3. Cross-check against spec §16 and the code

| # | Item | Spec §16 / §11 / §14 | Code | Verdict |
|---|---|---|---|---|
| 1 | Display marker | `d_<date> = {w,l}`, written after a ranked daily, 7-day pruning | `privacy.js` `writeMarker` (key `d_<dateKey>`, value `{w,l}`), `pruneOld` (`MARKER_KEEP_DAYS`), held as `markerPending` on refusal (104), only after server-confirmed ranked results | Match |
| 2 | Friend/group names | "not received by us; open data domain only" | `opendata/index.js` reads and draws; no `postMessage` back; tests AC 56/60 | Match |
| 3 | Retention | 180 days for identity data | `RETENTION_DAYS = 180`; `cleanup` TARGETS: `runs`, `daily_starts`, `daily_results`, `challenges`, `events`, `daily_progress`, `sub_grants`, `challenge_answers`, `anomalies`, `player_stats`; `group_members` by `lastSeen` | Match. The guide says "自产生之日起最长 180 天" (never longer; `group_members` and `player_stats` count from last use/update, which is the same or shorter) |
| 4 | OpenID | listed | stored in every identity collection of 1.2 | Match |
| 5 | Group id | `group_members`, raw cloudID resolved server-side | `joinGroup` stores `openGId`; clients get `groupRef` only | Match |
| 6 | Subscribe | opt-in, one grant, one message | `subscribe.js`, `subscribeChallenge`, claim in `submitRun` | Match |
| 7 | Album write | declare 相册（仅写入） | `album.js` only from the tap | Match; declared as item 2 |
| 8 | `challenge_answers`, `meta`, `rate_limits` (security hardening) | in §14.1 and §16 since the 2026-10-15 revision | all three exist in code and `database/rules.json` | Match. `meta` holds no personal data (date + server time) so it is not a guide item |
| 9 | **`rate_limits` retention** | §16: "minutes: trimmed by `cleanup` once expired" | `expireAt = now + 1 h` (`common/store.js`), removed by the **daily** 04:00 `cleanup` | **MISMATCH (wording).** "Minutes" is really "at most about one day". The guide says "约一天内自动删除". Spec §16 should say "up to one day". Not a code change |
| 10 | **Device fields** | §16 row "Device: platform, WeChat version, screen size ... `events` props (platform only)" | `analytics.js`/`main.js`: only `platform` is sent. WeChat version and screen size are read for layout and never leave the device | **MISMATCH (spec wording, harmless).** The code collects less than the spec lists. The guide declares the platform only |
| 11 | **Typed feedback text** | §16 "Not collected: ... " does not mention the feedback component | `wx.createFeedbackButton` (settings 联系我们 / 反馈) lets the user send free text and images to the **MP console** through WeChat's component | **MISMATCH (wording).** No text input exists in the game and none is stored in our database, but text a user sends through the WeChat feedback component reaches the founder's console. Declared as item 10. Spec §16 should add "except feedback the user voluntarily submits through WeChat's feedback component" |
| 12 | **GameLogManager mirror** | §15 "optional extra" | `analytics.js` logs `{level:'error', key: where, value: code}` to WeChat's game log | Informational: no personal data, platform-side. Covered by item 8 |
| 13 | Free-play runs | §5.3 "submitted best-effort" | `runs` holds free runs too | Match; the guide item 5 says so |
| 14 | Streak shown to friends | §8.9, §11.4 (`k` on board rows) | `getBoard` rows carry streak `k` from the server | Match; item 1 and item 5 text mention the shared board data |
| 15 | Ads | "Ad data: per WeChat" | three ad APIs | Match (statement 11). Re-check after 流量主 is on: WeChat may add its own disclosure requirement for ad components [VERIFY console] |
| 16 | Local storage | "device only" | `djt_state_v1` | Match (statement 12) |
| 17 | WeChat cloud platform logs | not mentioned | `traceUser:false`, but invocation logs held by WeChat Cloud contain the OpenID | Informational: platform-side; the guide's "存放在微信云开发" statement covers it |
| 18 | Popup trigger | official popup; first privacy-interface call follows a user action (a ranked result or a board tap) | first `setUserCloudStorage` after a ranked daily, or `requestPrivacy('board_open')` on a board tap, or the 保存图片 tap | Match; real placement is device item E4 |
| 19 | Old registration notes | `registration/rules.md` §5.1 (Phase 1) said "do NOT declare 相册" | superseded by v1 | Documented in `registration/rules.md` (release update) |

**Mismatch summary:** no code-versus-guide mismatch. Four spec-wording gaps (rows 9, 10, 11 and the `rules.md` 5.1 staleness in row 19), all documented here and in the guide text; none needs a code change. The guide declares everything the code does and no more.

## 4. Founder steps (copied into HANDOFF section 2)
1. MP -> 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新.
2. Declare 微信朋友关系 (item 1) and 相册（仅写入） (item 2); add the custom items 3-10 with the texts above; paste the full body; fill the three placeholders; save and submit for review.
3. MP -> 基本设置 -> 隐私授权弹窗 -> enable the official popup (irreversible; intended).
4. Screenshot the saved guide and send it to the CTO. Then check device items E4 (privacy flow) and the album item (E9) on the device pass.
