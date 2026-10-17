# 传画接龙: 用户隐私保护指引 (privacy guide pack)

Author: release. Date: 2026-10-15. Build checked: `kept-ideas/v1` at commit `461b427e94eea33b3be129b018fe253a376fb7a0` (CTO final review and sign-off DONE 2026-10-15), spec rev. 2. The audit was first done at 6582873; the diff to this build touches no `wx` call and no data flow (only the TD-148 error-banner layout in `render/home.js` and `render/pick.js`, and the release-switch tooling). Status: **text ready; entering it in the console is a founder step (HANDOFF section 3).** Nothing was entered anywhere. Cross-checked against `privacy-notes.md` (the three rev. 2 rows of that file are included below) and spec §15.

Official basis (read 2026-10-15): 隐私合规开发指南 https://developers.weixin.qq.com/minigame/introduction/guide/privacy.html . Standard-API items are the types in its Table 1; everything else processed through non-`wx` means "均需要在《用户隐私保护指引》中进行合规披露" and is added with 其他自定义信息类型. Errors: 104 = not agreed, 112 = type not declared, 1025/1026 = nothing declared or no popup. The page does not say the guide must be approved before version review; treat it as required (the in-game `wx.openPrivacyContract` link also needs it). Form fields not described on the page are marked [VERIFY form]: the console is the authority, screenshot before saving.

## 1. What the code actually does (audit of every `wx` call)

Method: grepped every `wx.*` in `apps/chuanhua/game/{game.js,js,core}` (the dev-only `js/mock-server.js` and `js/stub-render.js` are not shipped) and read the cloud functions' `common/`, `cleanup`, `roomSweeper`, `track` and `database/rules.json`, 2026-10-15.

### 1.1 `wx` APIs

| API | Where | Touches user data? | In Table 1 (standard item)? | Declare as |
|---|---|---|---|---|
| `wx.getEnterOptionsSync`, `getLaunchOptionsSync`, `wx.getGroupEnterInfo` (cloudID), `wx.getShareInfo` (only on an old base library without `getGroupEnterInfo`) | `js/app.js`, `js/share.js` `enterGroup` | the group chat's `opengid`, decrypted **on our server** (`joinGroup`, `cloud.getOpenData`), stored with the OpenID; the client only gets an opaque `groupRef` | **No** (not listed on the page; I could not confirm whether the platform treats it as privacy-gated: on some base libraries it answers 104, which the code handles) | custom item 2 |
| `wx.requirePrivacyAuthorize`, `getPrivacySetting`, `openPrivacyContract` | `js/privacy.js`: `requirePrivacy` only after a tap-triggered 104 on the group-entry call; `openContract` from 设置 and the 公约 sheet | permission state; opens the guide | no | not declared (they are the mechanism). **No `onNeedPrivacyAuthorization`**: WeChat's official popup is used |
| `wx.cloud.init({traceUser:false})`, `wx.cloud.callFunction` (every game action), `wx.cloud.database().watch` on `chuanhua_room_signals` (`js/realtime.js`) | `js/api.js`, `js/realtime.js` | every call carries the OpenID (platform context); `watch` reads only the caller's own content-free signal doc | no | custom items 1, 5 |
| `wx.shareAppMessage`, `showShareMenu`, `updateShareMenu({withShareTicket:true})`, `onShareAppMessage` | `js/share.js` | the player's own tap shares a card; the card image is our art (no drawing); the title may contain the prompt and final sentence (passed text) | no | items 3-4, section 3 part 4 |
| `wx.requestSubscribeMessage` | `js/subscribe.js`, only from the 揭晓时提醒我 tap, only with a template id | consent for one notice | no | custom item 10 |
| `wx.createFeedbackButton` | `js/app.js`, over the 设置 -> 反馈 row | free text and images the player chooses to send through WeChat's component (reach the MP console, not our database) | no | custom item 11 |
| `wx.createRewardedVideoAd`, `createInterstitialAd`, `createBannerAd` | `js/ads.js` | ad delivery by WeChat's ad service; we receive no personal data | no | body text 三 |
| `wx.setStorageSync` / `getStorageSync` (key `chuanhua_state_v1`) | `js/store.js` | device only: see 1.3 | no | body text 四.1 |
| `wx.getSystemInfoSync` / `getWindowInfo` / `getAppBaseInfo`, `getMenuButtonBoundingClientRect` | `js/app.js`, `js/controller.js` | screen size, capsule position, system font setting; **not uploaded** (the usage log does not carry platform) | no | not declared |
| `wx.getGameLogManager().log` (level error only, code and screen name) | `js/analytics.js` | WeChat's game log | no | custom item 12 |
| `wx.showKeyboard`, `onKeyboard*`, `showModal`, `createCanvas`, `createInnerAudioContext`, touch events, `onShow`/`onHide` | `js/keyboard.js`, `js/app.js`, `js/audio.js`, `js/main.js` | the typed sentence goes to our server only when the player sends the turn | no | custom item 4 |

**Not used anywhere in shipped code (grep, this commit):** `getUserInfo`, `getUserProfile`, `createUserInfoButton`, `wx.login`, `authorize`, location, phone, camera, microphone, clipboard, Bluetooth, sensors, **album (`saveImageToPhotosAlbum`)**, `chooseImage`, `wx.request`, `downloadFile`, `uploadFile`, `connectSocket`, `getFriendCloudStorage` / `setUserCloudStorage` and every other 微信朋友关系 API, `wx.reportEvent` (named in a comment only), any payment API.

**Consequence:** no Table 1 item applies. In the console the guide therefore has **no standard-API items to declare**; everything below is "其他自定义信息类型" plus free text. (If the console auto-detects any standard item, stop and tell the CTO: the code changed.) Because we do process personal information (OpenID, group id, user drawings and text), the "no processing" shortcut of the official flow does **not** apply: the guide must be filled in.

### 1.2 What the cloud functions store (collections `chuanhua_*`, all deny-all to clients except one owner-read rule)

| Collection | Personal data / content | Purge |
|---|---|---|
| `rooms` | host and seat OpenIDs, join/leave times, `lastSeenAt`, raw group id (`openGId`), room state | `cleanup` 04:00: `createdAt` older than 180 days; closed lobbies 1 day after closing (`roomSweeper`) |
| `room_signals` | owner `_openid`, room id, state, round, deadline, counts; **no content** | `roomSweeper`: 1 day after the game ends or closes |
| `chains`, `steps` | author OpenID, **drawings (strokes)**, **text (descriptions, custom prompts)**, moderation verdicts, marker flags; group id | `cleanup`: 180 days; abandoned chains 1 day; author deletion on request |
| cloud storage `chuanhua/mod/<YYYYMM>/...png` | **server-rendered PNG of each drawing** (server/admin only, never to clients) | `cleanup`: 180 days (deleted with the steps and traces) |
| `mod_traces`, `mod_log` | blocked or checked text copies, PNG references, verdicts, trace ids, author OpenID (admin-only) | 180 days |
| `reports` | reporter OpenID, item, reason | 180 days |
| `players` | OpenID, strikes and restriction, 公约 version agreed, daily counters, streak, **`seenPrompts` (last 300 prompt ids) and `roll`**, `activeRoomId` | no activity for 180 days (`lastActiveAt`) |
| `group_members`, `group_stats` | raw group id, OpenID, `groupRef`, first/last seen; aggregate counters | no activity for 180 days |
| `reactions`, `sub_grants`, `audit_log`, `events`, `rate_limits` | OpenID + item; template id; admin operations (may name an OpenID); usage events (OpenID, session id, event props); short-lived counters | 180 days; `rate_limits` at `expireAt` |
| `mod_quota`, `daily_stats`, `app_config` | counters / config only | quota 180 days; `daily_stats` and `app_config` kept (no personal data) |

### 1.3 What stays on the device (`chuanhua_state_v1`)

The unsent-turn draft (`turn`: strokes or typed text up to 80 characters, chain/claim or room + round, colour, size, two timestamps), `installId` (random UUID, generated locally; **not sent to any server**), first-use date, last session time, tutorial flags, display and sound settings, `lifetimeReveals`, **`revealsSeen`** (ids of up to 200 chains and rooms whose reveal was opened), interstitial and no-fill counters, subscribe flags, today's 今日彩笔 day, and **`albumCache`** (the first page of 我的接龙: up to 60 rows with a one-line text of up to 80 characters, i.e. the player's own prompts and sentences). No OpenID, group id or token is stored.

## 2. Items to declare in the console (in this order)

All are custom items (其他自定义信息类型) [VERIFY form]. Name in bold, then the two texts.

| # | 信息类型 (name) | 使用目的 | 存留期限 |
|---|---|---|---|
| 1 | **微信用户标识 (OpenID)** | 区分不同玩家，对应你的座位、接龙、每天的次数、违规和限制记录、举报和订阅授权。OpenID 不会展示给其他玩家。 | 你连续 180 天没有使用本游戏后删除；与某条内容相关的记录随该内容在 180 天后删除。 |
| 2 | **群聊标识（从群聊卡片进入时获取的群 ID）** | 把一局或一条接龙限定在同一个微信群内，生成本群的接龙列表和统计。群 ID 只在服务器端解密和保存；你的手机只会收到无法反推出群身份的群编号。 | 自你最后一次从该群进入之日起最长 180 天，到期自动删除。 |
| 3 | **你画的画（笔迹数据，以及服务器据此生成的图片）** | 展示给下一位接棒的玩家和同一局或同一条接龙的参与者；在展示前送微信内容安全服务检测；处理举报。图片只供检测和管理人员审核，不会发送给玩家。 | 180 天，期满后自动删除；你可以在“我的接龙”中随时删除自己的某一棒或全部内容（停止展示），审核留存的图片和副本保存至 180 天。 |
| 4 | **你输入的文字（自己出的题目、猜的一句话）** | 同上；已通过审核的文字还可能出现在揭晓页、文字预告，以及你自己选择发送的分享卡片标题中。 | 180 天，期满后自动删除；删除规则同上。 |
| 5 | **一局的参与记录（座位编号、是否房主、加入和离开时间、最近一次操作时间）** | 安排每一轮轮到谁、跳过已离开的玩家、让你断线后回到这一局。其他玩家只能看到座位编号和人数，看不到你的身份。为了让各位玩家画面同步，每位玩家另有一条只含进度（轮次、截止时间、人数）的同步记录，只有本人可读取。 | 这一局的记录 180 天；同步记录在这一局结束或关闭 1 天后删除；没有开始就关闭的一局，关闭 1 天后删除。 |
| 6 | **抽题记录（最近给你展示过的预设题目编号，最多 300 个，以及当前这一次抽到的 3 个题）** | 不重复给你同样的题目，并核对你选的题目确实是给你抽到的。 | 你连续 180 天没有使用本游戏后删除。 |
| 7 | **内容审核与违规记录（审核结论、标签、违规次数、限制期限）** | 内容安全：没通过审核的内容不会展示给任何玩家；多次违规的玩家将被限制参与。 | 180 天，期满后自动删除（违规和限制记录随玩家记录，连续 180 天未使用后删除）。 |
| 8 | **举报记录（举报人标识、被举报的内容、所选理由）** | 处理举报；被举报内容立即对所有人隐藏。举报人不会被透露给任何人。 | 180 天，期满后自动删除。 |
| 9 | **游戏记录（每天开局和接棒次数、连续天数、已同意的公约版本、“笑”的记录）** | 执行每天次数上限、显示连续天数、记录你已同意《接龙公约》、显示“笑”的数量。 | 180 天（与玩家记录一起，连续 180 天未使用后删除）。 |
| 10 | **订阅消息授权记录** | 仅当你点击“揭晓时提醒我”并在微信弹窗中同意，在慢慢传接龙揭晓时发送一次通知；夜间 22:00 至次日 08:00 不发送。 | 自授权之日起最长 180 天。 |
| 11 | **用户主动提交的反馈（设置里“反馈”中填写的文字和图片）** | 由微信反馈组件提供，内容由开发者在小游戏后台查看，仅用于处理你的反馈。 | 按微信平台规则保存，开发者仅在处理反馈所需期间使用。 |
| 12 | **使用日志（事件名称、会话编号、进入场景值、是否从卡片进入、游戏版本、错误代码）** | 统计功能使用情况、排查故障、改进体验。日志不含你画的画、输入的文字、昵称、头像、群 ID 或位置。 | 自产生之日起最长 180 天。 |

Item numbers match section 1. Items 3 and 4 also cover the copies sent to WeChat's content-security service (body text 四.2).

## 3. Full guide body text (paste as one block)

```
《传画接龙》用户隐私保护指引

更新日期：【上线日期，粘贴时填写】

开发者：【企业全称，粘贴时填写】（以下简称“我们”）
联系方式：【客服邮箱或电话，粘贴时填写】

我们重视你的个人信息保护。本指引说明《传画接龙》小游戏在你使用过程中会处理哪些信息、为什么处理、保存多久，以及你如何行使权利。我们遵循合法、正当、必要和诚信的原则，只处理实现功能所必需的信息。

一、我们不会要求你做的事
玩游戏不需要登录、注册，也不需要你提供昵称、头像、手机号、位置、通讯录、相册、摄像头、麦克风、剪切板内容或年龄。游戏里不显示任何人的昵称和头像，也没有聊天、私信、陌生人匹配和公开广场。

二、我们处理的信息、目的和保存期限
1. 微信用户标识（OpenID）
   - 目的：区分玩家，对应你的座位、接龙、每天的次数、违规和限制记录、举报和订阅授权。OpenID 不会展示给其他玩家。
   - 保存期限：你连续 180 天没有使用本游戏后删除；与某条内容相关的记录随该内容在 180 天后删除。
2. 群聊标识
   - 内容：当你从微信群聊里的游戏卡片进入时，微信会提供该群的标识。我们在服务器端解密并保存，与你的 OpenID 关联。
   - 目的：把一局或一条接龙限定在同一个群内，生成本群接龙列表和统计。你的手机只会收到无法反推出群身份的群编号。
   - 保存期限：自你最后一次从该群进入之日起最长 180 天。
3. 你画的画
   - 内容：你绘制的笔迹数据，以及服务器据此生成的图片。
   - 目的：展示给下一位接棒的玩家和同一局或同一条接龙的参与者；展示前送微信内容安全服务检测；处理举报。生成的图片只用于检测和管理人员审核，不会发送给玩家。没有通过审核的内容不会展示给任何其他玩家。
   - 保存期限：180 天，期满后自动删除。你可以在“我的接龙”中删除自己的某一棒或全部内容，删除后不再展示；审核留存的图片和副本保存至 180 天。
4. 你输入的文字
   - 内容：你自己出的题目、你猜的一句话（最多 16 个字）。
   - 目的和保存期限：同第 3 项。已通过审核的文字还可能出现在揭晓页、文字预告，以及你自己选择发送的分享卡片标题中。分享卡片的图片由我们绘制，不含任何玩家的画。
5. 一局的参与记录
   - 内容：你在一局中的座位编号、是否为房主、加入和离开的时间，以及最近一次操作的时间。
   - 目的：安排每一轮轮到谁、跳过已离开的玩家、让你断线后回到这一局。其他玩家只能看到座位编号和人数，看不到你的身份。为了让各位玩家的画面同步，我们为每位玩家保存一条只记录这一局进度（轮次、截止时间、人数）的同步记录，只有本人可以读取。
   - 保存期限：这一局的记录 180 天；同步记录在这一局结束或关闭 1 天后删除；没有开始就关闭的一局，关闭 1 天后删除。
6. 抽题记录
   - 内容：最近给你展示过的预设题目编号（最多 300 个），以及你当前这一次抽到的题目。
   - 目的：不重复给你同样的题目，并核对你选的题目确实是给你抽到的。
   - 保存期限：你连续 180 天没有使用本游戏后删除。
7. 内容审核与违规记录
   - 内容：审核结论、标签、违规次数、限制期限。
   - 目的：内容安全。多次违规的玩家将被限制参与，详见《用户协议》。
   - 保存期限：180 天，期满后自动删除。
8. 举报记录
   - 内容：举报人标识、被举报的内容、所选理由（固定选项，没有文字输入）。
   - 目的：处理举报。被举报内容立即对所有人隐藏。我们不会向任何人透露举报人。
   - 保存期限：180 天。
9. 游戏记录
   - 内容：每天开局和接棒次数、连续天数、你已同意的公约版本、“笑”的记录。
   - 目的：执行每天次数上限、显示连续天数、记录你已同意《接龙公约》、显示“笑”的数量。
   - 保存期限：你连续 180 天没有使用本游戏后删除。
10. 订阅消息
   - 只有当你点击“揭晓时提醒我”并在微信弹窗中同意，我们才会记录这次授权，并在慢慢传接龙揭晓时发送一次通知。夜间 22:00 至次日 08:00 不发送。保存最长 180 天。
11. 反馈
   - “设置”中的“反馈”由微信的反馈组件提供，你填写的文字和图片由我们在小游戏后台查看，仅用于处理你的反馈。请不要在反馈中填写不必要的个人信息。保存按微信平台规则执行。
12. 使用日志
   - 内容：事件名称（例如开始一局、完成一棒）、会话编号、进入场景值、是否从卡片进入、游戏版本、错误代码。日志不含你画的画、输入的文字、昵称、头像、群标识或位置。
   - 目的：了解功能使用情况、排查故障、改进游戏。保存最长 180 天。

三、广告
游戏中的激励视频、插屏和横幅广告由微信广告服务提供。我们不会因此获得你的个人信息。广告相关的信息处理由微信按其规则进行。我们不会在选题、画、猜、等待开局和一局进行中展示广告。

四、其他说明
1. 保存在你手机上的信息：未发送的画或文字草稿、已看过的揭晓编号（最多 200 个）、我的接龙列表缓存、声音和显示设置、新手提示状态等，只保存在你手机上本游戏的本地存储中，不会上传，你清除本游戏的数据或删除本游戏时一并删除。
2. 内容安全检测：你的画和文字在展示给其他玩家之前，我们会把它们的副本发送给微信的内容安全服务检测，仅用于判断内容是否合规。
3. 存放与共享：所有服务器端数据存放在中国大陆的微信云开发环境中。我们不会向任何第三方出售、出租或共享你的个人信息，也不会把信息传输到境外，法律法规另有规定的除外。涉嫌违法犯罪的内容，我们会依法保存记录并向有关主管部门报告。
4. 分享：分享卡片由你自己点击发送，不会因分享获得任何奖励。

五、你的权利
你可以随时在游戏“设置”中查看本指引，并在微信“设置 - 隐私 - 小程序”中管理授权。你可以在“我的接龙”中删除自己的内容，也可以通过上述联系方式要求我们查阅、更正或删除与你有关的数据，我们会在核实身份后及时处理。180 天的自动删除不影响你随时提出要求。

六、未成年人
我们不收集你的年龄。未满 18 周岁的用户，请在监护人的同意和指导下使用本游戏；未满 14 周岁的用户，必须由监护人阅读并同意本指引和《用户协议》。本游戏没有聊天、陌生人匹配和公开广场，所有内容先审后传，被举报的内容立即隐藏。监护人可以通过上述联系方式联系我们。

七、指引的更新
指引更新后，我们会在游戏内展示并以微信规定的方式提示你。

八、联系我们
【客服邮箱或电话，粘贴时填写】
```

Placeholders the founder must fill: 更新日期 (launch date), 企业全称, 联系方式 (a monitored email or phone). The contact must equal the 联系邮箱 in the 用户协议 (HANDOFF 1). Nothing else. Retention is **180 days**.

## 4. Cross-check against spec §15, `privacy-notes.md` and the code

| # | Item | Spec §15 / notes | Code | Verdict |
|---|---|---|---|---|
| 1 | Room presence | `rooms.seats` (joined/left, `lastSeenAt`, host); signals content-free, owner-read; 1 day | `roomSweeper` `signalKeepMs` 1 day; `rooms` purged by `createdAt` > 180 days | Match (item 5) |
| 2 | Roll history | `players.seenPrompts` (300), `players.roll`; 180 days after last activity | `players` purged by `lastActiveAt` | Match (item 6) |
| 3 | Retention 180 days | all personal data | `cleanup` targets: rooms, mod_log, reports, reactions, sub_grants, audit_log, events, rate_limits, players, group_members, group_stats, mod_quota, chains+steps+PNGs, mod_traces | Match. Wording: "180 天后" for event-like rows, "连续 180 天未使用" for player rows (the guide says both) |
| 4 | Device draft, `revealsSeen` | rows exist (privacy-notes) | `store.js` | Match (body text 四.1) |
| 5 | **`albumCache` (own prompts/sentences, up to 60 rows, 80 chars) in local storage** | privacy-notes mention "a cached list of the player's own chains" but **spec §15 has no row** | `store.js` `albumOf` | **MISMATCH (spec wording, Low).** Local only. Covered by 四.1; add a row to spec §15 |
| 6 | **`installId`** | privacy-notes: "random UUID, used for analytics session grouping" | generated in `controller.js` `start`, stored, **never read or sent anywhere else** (grep) | **MISMATCH (privacy-notes wording, Low):** it is not used for analytics. Harmless; use it or drop it; the guide only says "新手提示状态等" |
| 7 | **Feedback text** | spec §15 does not list it | `wx.createFeedbackButton` | **MISMATCH (spec wording, Low).** Declared as item 11; add "except feedback the player voluntarily submits through WeChat's component" to spec §15 "Not collected" |
| 8 | Usage log fields | spec §14: events carry no text, strokes, openids, group ids | `core/analytics.js` allowlist: `scene`, `fromCard`, `hasShareTicket`, chain ids, `mode`, counts, durations, error codes; `COMMON_PROPS` isNewUser, appVersion, promptsVersion; **no platform** | Match. Item 12 lists the real fields |
| 9 | `step_submit` props | not in §15 | `canvasH`, `strokes` count, `points`, `undoCount`, `durationMs` (counts, no content) | Covered by item 12; spec §15 could name "drawing statistics (counts only)" |
| 10 | Share title carries passed text | spec §15 mentions the share card a participant chooses to send | `share.js` `descriptorFor`; TD-141 re-fetches before sharing | Match (item 4) |
| 11 | WeChat content-security service receives copies | spec §15 "declared" | `submitRoomStep`, `submitStep`, `createChain` | Match (body text 四.2) |
| 12 | `reports` | reporter OpenID | `report` | Match (item 8) |
| 13 | `mod_log`/PNG evidence after author deletion | spec 7.4: evidence kept to 180 days [VERIFY with counsel, H10] | `deleteMyStep`, `cleanup` | Match; stated in item 3; counsel question remains |
| 14 | Privacy interfaces | "No privacy interface is called" | none of Table 1 (section 1.1) | Match. `wx.getGroupEnterInfo` is the one API near the line (not listed on the official page); verify at device item D16 that the first group entry shows no unexpected 104 (the code handles it with one official popup, then retries) |
| 15 | Forced authorization | none | `requirePrivacy` only from a tap-triggered 104; refusal returns "privacyDenied" and play continues | Match (AC 79); device D16 |
| 16 | Platform logs | not in §15 | cloud function logs hold OpenIDs; `traceUser` is off | Informational; the "微信云开发" statement covers it |

**Mismatch summary:** no code-versus-guide mismatch. **Four wording gaps in spec §15 / privacy-notes** (albumCache not in §15; installId described as analytics; feedback component text; step_submit statistics), all Low, none needs a code change; the guide text above already covers them. `privacy-notes.md` stays as the engineering record; the paste text is section 3 here.

## 5. Founder steps (copied into HANDOFF section 3)
1. MP -> 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新 (the form asks whether we process personal information: answer yes).
2. **No standard-API item should be detected.** Add custom items 1-12 with the texts in section 2; paste the full body from section 3; fill the three placeholders; save and submit. If the console detects any standard item (微信朋友关系, 相册, 昵称头像, location ...), stop and tell the CTO.
3. MP -> 设置 -> 基本设置 -> **隐私授权弹窗** -> enable the official popup (cannot be switched off afterwards; intended).
4. Screenshot the saved guide and send it to the CTO. Then device item D16.
