# 点将台 Phase 0: platform verification (technical items)

Date checked: 2026-10-14. Method: official pages on developers.weixin.qq.com fetched and read on that date. Legal and compliance items are out of scope (founder-cleared). Anything not read from an official page is labelled **UNVERIFIED (background)**. Pages that failed to fetch or were ambiguous are called out.

**Update 2026-10-15 (security hardening, `docs/dianjiangtai/decisions.md` TD-1 and TD-4):** §2.4 now describes the server-side `cloud.getOpenData` resolve of the raw cloudID. §9 adds the timer-marker requirement and the console hardening items. The findings from 2026-10-14 are otherwise unchanged.

Base URL shorthand: `MG` = `https://developers.weixin.qq.com/minigame/dev`, `MP` = `https://developers.weixin.qq.com/miniprogram/dev`.

## 0. Evidence from `apps/cheatshaizi/mini-game/`

The mini-game build uses only: `createCanvas`, `createImage`, `createInnerAudioContext`, `onTouch*`, `onShow`, `vibrateShort/Long`, `getWindowInfo`, `getSystemInfoSync`, `getMenuButtonBoundingClientRect`. It uses **no** share, cloud, open data, ad, login or privacy APIs. So the repo gives **no evidence** that any of the social or backend APIs below work. Every verdict here rests on the docs alone and needs a real-device spike (section 12).

## 1. Summary table

| # | Item | Verdict |
|---|---|---|
| 1a | Open data domain (`getOpenDataContext`, `postMessage`, `getSharedCanvas`) | OK |
| 1b | `setUserCloudStorage` / `removeUserCloudStorage` (main domain) | OK-with-changes: privacy interface, limits below |
| 1c | `getFriendCloudStorage` | OK-with-changes: needs `scope.WxFriendInteraction` |
| 1d | `getGroupCloudStorage` | OK-with-changes: authorization needed; prefer `groupid` from `getGroupEnterInfo` over `shareTicket` |
| 2 | Server-side leaderboard write | Write API exists (OK-with-changes). It does **not** stop client overwrites, so §11.4 Path B is still required |
| 3a | `shareAppMessage` / `onShareAppMessage` | OK |
| 3b | `getShareInfo` | Deprecated since base library 2.17.3. Use `wx.getGroupEnterInfo` |
| 3c | Share success callback | Not in the docs. Do not rely on it |
| 4 | Updatable messages | OK-with-changes: fixed text templates only. Phase 2 "N friends answered" text is **not possible** |
| 5 | 擂台赛组件 | Exists (base library 3.14.2). Needs MP configuration and 4 reward gift packs. Poor fit, see below |
| 6a | Rewarded video | OK-with-changes: 1004 fallback share page behaviour (base library 3.7.7) |
| 6b | Interstitial frequency | Platform limits exist, exact numbers unpublished. Handle errors 2001-2003 |
| 7 | `wx.reportEvent` | NOT AVAILABLE for our purpose. Keep own `track` |
| 8 | Cloud functions, timers, transactions | OK-with-changes: timezone, one trigger per function, timeout figure partly unverified |
| 9 | Package size, remote assets | OK-with-changes: domain must be in the whitelist and ICP-filed |
| 10 | Privacy authorization | Applies. `setUserCloudStorage`, `removeUserCloudStorage`, the friend APIs, and `getGroupInfo` are all listed privacy interfaces |

## 2. Open data domain

**Docs:** `MG/guide/open-ability/opendata/basic.html`, `MG/guide/open-ability/open-data.html`.

- Enable with `"openDataContext": "<dir>"` in `game.json`. The open data directory cannot be a subpackage or sit inside one (`MG/guide/base-ability/subPackage/useSubPackage.html`).
- Main domain: `wx.getOpenDataContext()`, then `ctx.postMessage(obj)`. The open data domain listens with `wx.onMessage`. **The open data domain cannot send messages back to the main domain.**
- Default mode is `offscreenCanvas`. The open data domain draws to `wx.getSharedCanvas()`, and the main domain `drawImage`s `ctx.canvas` each frame. The shared canvas size is set only in the main domain, and resizing clears it (re-send a `render` message).
- `screenCanvas` mode exists from base library 3.6.6. The shared canvas is an on-screen canvas above the main canvas. The mode cannot be switched back once chosen.
- `getUserCloudStorage`, `getFriendCloudStorage` and `getGroupCloudStorage` are callable **only in the open data domain**. `setUserCloudStorage` and `removeUserCloudStorage` work in both domains.

### 2.1 `wx.setUserCloudStorage`
URL: `MG/api/open-api/data/wx.setUserCloudStorage.html`. Base library 1.9.92. Promise style supported.
Limits (official text): at most **128 key-value pairs** per openid per game. Each item's key+value is at most **1024 bytes**. Each key is at most **128 bytes**. Spec §11.1 fits: a 5-general `d_<date>` value is far below 1 KB.
Deprecated: no.

### 2.2 `wx.getFriendCloudStorage`
URL: `MG/api/open-api/data/wx.getFriendCloudStorage.html`. Base library 1.9.92. Callback style only.
- **Requires user authorization `scope.WxFriendInteraction`.** Open data domain only.
- A friend added in the last 2 hours may be missing.
- Each row is `UserGameData`: `avatarUrl`, `nickname`, **`openid`**, `KVDataList` (`MG/api/open-api/data/UserGameData.html`). This answers §17 #21 part 3: **rows do carry the openid**, so the §11.4 signature can bind to openid.

### 2.3 `wx.getGroupCloudStorage` (group storage still works)
URL: `MG/api/open-api/data/wx.getGroupCloudStorage.html`. Base library 1.9.92. Needs `scope.WxFriendInteraction`. Open data domain only.
- Only callable when the game was opened from a group share card.
- Parameters: `keyList` (required), plus **either** `shareTicket` **or** `groupid` (an opengid). The docs say "建议使用 groupid" (groupid recommended). `groupid` needs base library 3.8.8.
- Get `groupid` from main-domain `wx.getGroupEnterInfo` (below).
- Same `UserGameData` rows, so openid is available.

### 2.4 `wx.getGroupEnterInfo` (replaces `getShareInfo`)
URL: `MG/api/open-api/group/wx.getGroupEnterInfo.html`. Base library 2.10.4. Group message cards need 2.17.3. Single-chat support needs 3.7.8.
- Returns `encryptedData`, `iv` and `cloudID` (the cloud-development cloudID route).
- The decrypted payload is `{opengid, open_single_roomid, group_openid, chat_type}`. Decrypt in a cloud function with the cloudID route (`MG/guide/open-ability/signature`, "方式二").
- **How we resolve it (updated 2026-10-15, security hardening M1, decisions TD-1).** The client sends the **raw `cloudID` string** to `joinGroup` as `{cloudID}`. It does **not** wrap it in `wx.cloud.CloudID(...)`, and the server never reads a client-supplied `groupData` or any other decrypted-looking object. The server checks the string shape (`/^[A-Za-z0-9_-]{8,512}$/`, else `BAD_CLOUDID`) and resolves it itself with **`cloud.getOpenData({list: [cloudID]})`** (wx-server-sdk, `MG/wxcloud/reference-sdk-api/open/Cloud.getOpenData.html`). The SDK reference documents the result as `list: [{cloudID, data}]`. We accept exactly one list item whose `data` is a plain object and whose `errCode` is falsy. Why: the old `wx.cloud.CloudID` substitution let the client shape the object, so a modified client could send a forged `{cloudID, data}` and join any group whose openGId it knew.
- **Group check.** `opengid` must be a 1-128 character string. `chat_type` is treated as **optional**, because the documented payload may omit it: absent (or null) is accepted, and if present it must be **3 (group) or 4 (WeCom group)**. Values 1 and 2 (single chat, WeCom single chat) are rejected. A single-chat payload (only `open_single_roomid`, no `opengid`) returns `NOT_GROUP`. The `chat_type` values follow the `getEnterOptionsSync().chatType` list in §4.
- No AppSecret, `session_key` or extra openapi permission is needed for `getOpenData`. **[SPIKE]** device pass E1 still has to confirm the end-to-end resolve on iOS and Android, and the real payload fields.
- Errors: 40097 (wrong scene), 65206 (user no longer in the group).
- `wx.getGroupInfo(openGId)` (group name) is open-data-domain only and needs the same scope.

**Spec impact:** §9.2 says "pass the ticket to the open data domain". Still valid, but §11.3 should say: use `getGroupEnterInfo`, **not** `getShareInfo`, for the server fallback.

### 2.5 Friend-data authorization
`scope.WxFriendInteraction` covers the friend and group read APIs (`MG/guide/base-ability/authorize.html`). The generic rule: the first call shows a system prompt, and on refusal later calls go to `fail`. Whether the prompt fires from inside the open data domain on first call, or must be requested in the main domain with `wx.authorize({scope:'scope.WxFriendInteraction'})`, is **UNVERIFIED**. Test on a device. Spec 8.6/8.7 already has the "not authorized" state, which stays.

### 2.6 Leaderboard center
`KVData.html` documents an optional format for the 小游戏中心 board: a `wxgame` object `{score:int32, update_time}` at the top level. It is optional. We do not need it for Phase 1.

## 3. Server-side leaderboard write (key question)

**Answer: YES, a server write API exists. It does NOT close the cheat gap, because the client can still overwrite the same keys. So §11.4 Path B (signed values) remains required. Path A is not achievable as written.**

### 3.1 The write API
Name: `storage.setUserStorage`. HTTPS `POST https://api.weixin.qq.com/wxa/set_user_storage?access_token=&openid=&signature=&sig_method=`. Cloud call: `cloud.openapi.storage.setUserStorage({openid, kvList})`.
URL: `MG/api-backend/data/api_storage.setuserstorage.html`. Applies to the 小游戏 account type. Third-party platforms cannot call it. Delete counterpart: `storage.removeUserStorage` (`.../api_storage.removeuserstorage.html`).
- The page says it reports key-value data "到用户的 CloudStorage", the same store the client writes.
- Same limits as the client API: 128 pairs, 1 KB per pair, key at most 128 bytes. Errors 87016-87019.
- **Ambiguity in the doc:** the request table says `key` "目前可以为 '1' - '50'" and `value` type is `number`. This looks copied from the interactive-data page. The same page's own example uses `key: 'a'`, and the signature guide uses string values (`"value":"100"`). **Whether a string JSON value under key `d_YYYYMMDD` is accepted is UNVERIFIED. Test it first.** If only numeric values on keys '1'-'50' work, the board value must be encoded as a number (for example `w*1e4 + l*1e2`), with the lineup resolved from the sheet.
- There is **no server-side read** of user cloud storage in the backend API list (`MG/api-backend/`). Only set and remove exist, plus `setUserInteractiveData`. So a nightly mismatch comparison (§11.4 check 3) is **impossible**. It stays harness/QA only.

### 3.2 Signature and session_key
`MG/guide/open-ability/signature` ("用户登录态签名"): `signature = hmac_sha256(session_key, rawData)`, where `rawData` is the request body. `sig_method=hmac_sha256`.
- For the **HTTPS** call, `signature` and `sig_method` are required query params.
- For the **cloud call**, the page says "openid 需作为参数传入" and its example shows only `openid` and `kvList`. No signature is shown. **Whether WeChat enforces a signature on the cloud-call path is UNVERIFIED.** Test it. If a signature is needed, use the HTTPS route from the cloud function.

### 3.3 Can a cloud function get session_key? YES
`auth.code2Session` (`MG/api-backend/login/api_code2session.html`): `GET https://api.weixin.qq.com/sns/jscode2session?appid&secret&js_code&grant_type=authorization_code`. Returns `session_key`, `openid`. **It does not support cloud call**, so call it by plain HTTPS from the cloud function, with the AppSecret in the function's environment variables.
Note: `api.weixin.qq.com` cannot be a client domain (`MG/guide/base-ability/network.html`), so this must be server side. That is already the plan.

How to do it:
1. Client: `wx.login()` gives `code`, then `wx.cloud.callFunction('login', {code})`.
2. Cloud function `login`: `code2Session` gives `session_key`. Store `{openid, session_key, ts}` in a locked-down collection (no client access), never return it.
3. `submitRun` (ranked success): read the stored `session_key`, build the body `{kv_list:[...]}` as a string, compute `hmac_sha256(session_key, body)`, call `set_user_storage` (HTTPS) or `cloud.openapi.storage.setUserStorage`.
4. Keep the session fresh. `wx.login` may rotate the session_key (docs: refresh has a minimum period). Call `wx.checkSession` on launch and re-run the login flow on failure. A stale key means a signature failure, so `submitRun` must degrade to "return `sig` and let the client write" (Path B).
5. `code2Session` is rate-limited (error 45011). Call it once per cold start, not per request.

### 3.4 Can the client overwrite a server-written key? YES (nothing prevents it)
The docs list ordinary hosted data as "覆盖写 / 任意时机" with sources "开放数据域/主域/后台" (`MG/guide/open-ability/interactive-data.html`). The client can write any key, including `d_<date>`. There is no per-key write protection. A tampered client can overwrite the server's value. This is why Path A fails.
Server write still helps: it removes the need for the client to call `setUserCloudStorage` in the honest path, which also avoids the privacy prompt on that call (section 11). But integrity still depends on the signature check in the open data domain (Path B).

### 3.5 Interactive data is not a way out
`storage.setUserInteractiveData` / `wx.getUserInteractiveStorage` (`MG/guide/open-ability/interactive-data.html`): at most 50 keys, one int32 per key, **a user can read only their own** data. Useless for a friend board.

### 3.6 Recommended Path B changes
- Signature binds `openid|dateKey|w|l|lineup` (the openid is available in each row).
- The open data domain bundles the public key and verifies each row.
- Optionally also have `submitRun` server-write the same `d_` value. Then the honest path never needs the client write. Only do this if the spike confirms string values.

## 4. Share

URLs: `MG/api/share/wx.shareAppMessage.html`, `.../wx.onShareAppMessage.html`, `.../wx.updateShareMenu.html`, `.../wx.getShareInfo.html`, guide `MG/guide/open-ability/share/share.html`.

- `wx.shareAppMessage({title, imageUrl, query, imageUrlId, toCurrentGroup, path})`. **No `success`/`fail`/`complete` parameters are documented.** Do not rely on any success signal. Spec §9 already complies.
- `query` must be `key1=val1&key2=val2`. It is read from `wx.getLaunchOptionsSync()` or `wx.onShow` (and `wx.getEnterOptionsSync()`, base library 2.13.2: `scene`, `query`, `shareTicket`, `referrerInfo`, `chatType`).
- Capsule menu: share is **off by default**. Call `wx.showShareMenu({menus:['shareAppMessage','shareTimeline']})`, then `wx.onShareAppMessage`. Spec §9 mentions `showShareMenu`, which is correct and mandatory.
- `onShareAppMessage` accepts a `promise` field (base library 2.12.0) with a 3 s timeout. Useful if the share image is generated asynchronously.
- **Share image:** ratio **5:4**. The guide example renders `canvas.toTempFilePathSync({destWidth:500, destHeight:400})`. Spec §8.4 (500x400) matches. If `imageUrl` and `imageUrlId` are both absent, a screenshot of the game is used. An optional pre-reviewed image route exists: MP "游戏能力地图 > 运营素材管理 > 分享图片", then pass `imageUrlId` with `imageUrl` together.
- `withShareTicket`: `wx.updateShareMenu({withShareTicket:true})` (base library 1.2.0). Effects: the recipient picker allows only **one** target, and the card cannot be long-press forwarded. **Known iOS bug:** `withShareTicket:true` together with `isUpdatableMessage:false` makes the ticket fail. Never pass `isUpdatableMessage:false` in the same call.
- **shareTicket / group id:** `getShareInfo` is **deprecated** ("从基础库 2.17.3 开始，本接口停止维护，请使用 wx.getGroupEnterInfo 代替"). Use `getGroupEnterInfo`.
- **Scene values** (`MG`-linked list `https://developers.weixin.qq.com/minigame/dev/reference/scene-list.html`): 1007 = card in a single chat, 1008 = card in a group chat, 1044 = card with a shareTicket. `getEnterOptionsSync().chatType`: 1 single, 2 WeCom single, 3 group, 4 WeCom group. This list is shared with mini programs. Whether a mini game reports 1044 vs 1008 for a ticketed card was not separately documented. **Keep "ticket present" as the group signal** (fallback #5 in §17 already says so), and treat scene/chatType as telemetry only.
- Share to timeline (`onShareTimeline`) exists but is out of scope.

## 5. Updatable messages (动态消息)

URLs: `MG/api-backend/updatable-message/api_createactivityid.html`, `.../api_setupdatablemsg.html`, `wx.updateShareMenu` (`isUpdatableMessage`, `activityId`, `templateInfo`, base library 2.4.0).
- `createActivityId` exists for mini games (cloud call `updatableMessage.createActivityId`). The activity id expires after 24 h by default.
- **The message text is a fixed template** with two states only: 0 = "成员正在加入，当前 {member_count}/{room_limit} 人", 1 = "已开始". Text and colour are not customisable. Only `member_count`, `room_limit`, `path` and `version_type` are parameters.
- **Verdict:** a card saying "已有 3 位好友应战，最高 11-1" is **NOT possible**. At best "当前 3/N 人" joined-count semantics. Spec §21 item "Updatable challenge cards" should be reworded to that, or dropped.
- Private messages (`isPrivateMessage`) cannot be created from a cloud function per the createActivityId page.

## 6. 擂台赛 (social challenge) component

URL: `MG/guide/open-ability/tournament.html`. Capability overview: `https://developers.weixin.qq.com/minigame/introduction/commercialization/social-contact/capacity.html`.
- **Exists.** Base library **3.14.2**, WeChat 8.0.68+ (Android and iOS only).
- **Access:** no separate application page was found. Setup is in MP: (1) 游戏玩法ID设置, (2) **4 reward gift packs** (擂主守擂 保底/稀有, 挑战者 保底/稀有), (3) 擂台赛 config in 能力地图. Eligibility conditions are **not stated** on these pages. (The 社交组件 plugin, a different thing, requires credit score >= 100 and is not open to 棋牌/捕鱼.) Confirm eligibility in the MP console.
- API: `wx.getRankManager()` with `update({scoreKey, score})`, `createChallenge`, `onChallengeStart`, `middleUpdate`, `abort`. The prompt `wx.login` must happen before the contest starts.
- **Fit problems for 点将台:**
  - It takes a **single numeric score**, reported by the client. It has no server-side verification path in these docs.
  - It is a rewards product: gift packs are mandatory. That conflicts with our "no-prizes" IAA prototype and needs reward items.
  - The sharer's card and flow are platform-owned, not our 同签挑战 token-sheet design.
- **Verdict:** keep it in Phase 2. Our own `createChallenge` cloud function stays the Phase 1 mechanism.

## 7. Ads

### 7.1 Rewarded video
URLs: `MG/api/ad/wx.createRewardedVideoAd.html`, `.../RewardedVideoAd.onClose.html`, `.../RewardedVideoAd.onError.html`, guide `MG/guide/open-ability/ad/rewarded-video-ad.html`.
- Base library 2.0.4. The instance is a **global singleton** (unless `multiton:true`, base library 2.8.0).
- `onClose({isEnded})`: grant only on `isEnded === true` (base library >= 2.1.0). Spec §12 matches.
- Error codes (`onError`, `errCode`): 1000 backend call failed, 1001 bad params, 1002 invalid unit, 1003 internal, **1004 no suitable ad (no-fill)**, 1005 under review, 1006 rejected, 1007 banned, 1008 unit closed.
- `show()` returns a Promise (rejects on failure). After a failed load, call `load()` then `show()`.
- Daily per-user view count is platform-limited ("每个用户每天可观看激励式视频广告的次数有限"), number not published.
- **New behaviour (base library 3.7.7+):** on error **1004** the component **by default shows a fallback share page** that rewards the user for sharing. In that case `onError` is **not** called, and `onLoad` fires with `{useFallbackSharePage:true}`. Opt out per instance with `disableFallbackSharePage:true`. Opened-from-fallback shares carry the query `wxad_fallback_share=1`.
- **Spec conflicts:** (a) §12 / D6 treats no-fill as an `onError` event. On 3.7.7+ it will instead look like a successful load with a share page. (b) The fallback gives a reward **for sharing**, which contradicts §9 "no share ever grants anything". **Recommendation: set `disableFallbackSharePage:true`** and keep the D6 free-grant rule. This is an in-code decision for minigame-dev. Please confirm.
- Whether platform rules (流量主) allow a free grant on no-fill: **not stated in the docs read.** Treat as unverified. The fallback "稍后再试" stays in the spec.
- Eligibility to open 流量主 (`MG/guide/open-ability/ad/ad.html`): any one of (1) cumulative UV > 500 with no fake traffic and no serious violations, (2) game circle activated with 5 official posts, (3) same-company mini program already earning for one quarter. Ad unit ids need this. The Phase 1 stub (D5) stands.

### 7.2 Interstitial
URLs: `MG/api/ad/wx.createInterstitialAd.html` (base library 2.6.0), `.../InterstitialAd.show.html`, `MG/guide/open-ability/ad/interstitialAd-ad.html`.
- Each `createInterstitialAd` call returns a **new instance**.
- Platform frequency limits exist but **exact seconds and counts are not published**. `show()` rejects with: **2001** (too soon after launch), **2002** (too soon after the last interstitial or rewarded video), **2003** (another ad is playing), 2004 (render failed), 2005 (instance misuse). Daily per-user view count is limited (number unpublished).
- **Implication:** our own caps (>= 120 s, <= 5/day, from the 4th run) are fine as a lower layer, but code must treat 2001-2003 as normal "skip silently" cases and must not count them as shown.

## 8. Analytics

- `wx.reportEvent(eventId, data)` (`MG/api/data-analysis/wx.reportEvent.html`, base library 2.14.4): the `eventId` is "在 mp 实验系统中设置的事件英文名" (an event defined in the MP **experiment** system). It is tied to A/B experiments, not a general funnel store. **Verdict: not a replacement for `track`.**
- Related official options: `wx.getGameLogManager` (base library 3.7.4, `MG/api/data-analysis/wx.getGameLogManager.html`): `log({level,key,value})`, at most **999 entries per session** and **16 KB per entry**, viewable under MP "基础数据 > 游戏日志分析". `wx.getMiniReportManager` (base library 3.8.12): structured level/prop/ad events configured in MP, for revenue diagnostics.
- **Recommendation:** keep our own `track` cloud function (full control, cohorts by `isNewUser`, our schema) and optionally mirror error-level lines to `GameLogManager` for free MP-side visibility. Spec §15's "plus `wx.reportEvent` if available" should become "plus `GameLogManager` (optional)". Do not use `reportEvent`.

## 9. Cloud Development

- **Timeout.** The WeChat-domain docs I could reach do **not** state it. The 云开发 quota page on developers.weixin.qq.com (`MP/wxcloud/basis/concepts/quota.html`) is stale (mentions 2019) and lists only 256 MB memory, 20 concurrency, 50 functions, and 100 KB request payload (`basis/capabilities.html`). The CloudBase configuration page (`https://docs.cloudbase.net/en/cloud-function/function-configuration/config`, same platform, not a WeChat page) states: default **3 s**, configurable **1 to 900 s** for ordinary functions, memory 64 to 3072 MB (default 256). **Treat 900 s max as UNVERIFIED for the WeChat console** until you open the function config in the real environment.
  - **Action:** the first thing the spike must do is set `genDaily` timeout and measure `gateCheck` time per seed. The default 3 s will certainly be too short.
- **Timer triggers** (`MP/wxcloud/guide/functions/triggers.html`): `config.json` in the function folder. **Only one trigger per function.** 7-field cron (sec min hour day month weekday year). **Trigger timezone is UTC+8**, so `0 0 23 * * * *` = 23:00 BJT. WeChat may deliver the same trigger more than once, so make `genDaily` idempotent (already in spec). A community report (cnb.cool CloudBase issue #895, secondary source) claims some timers misfired or vanished around March 2026. Keep the lazy-generate fallback in `getDaily`.
  - **Timer marker (2026-10-15, TD-4).** `genDaily` and `cleanup` run only when the event is `{Type: "Timer", TriggerName: <non-empty string, at most 128 characters>}` **and** the context has no OPENID. Otherwise they return `FORBIDDEN`. The real triggers supply both fields. To run one by hand in the console (cloud function > cloud test), use the test event `{"Type":"Timer","TriggerName":"manual"}`. For `genDaily` you can add `"dateKey":"YYYYMMDD"`. "No OPENID" alone is not enough, because a function exposed over HTTP also has no OPENID.
- **Console hardening (2026-10-15, TD-4; steps in `apps/dianjiangtai/cloudfunctions/README.md` "Console hardening").** These are console settings that only the founder can change. Cloud storage gets the deny-all rule `{"read": false, "write": false}` (`storage/rules.json`), because the game uses no cloud storage. **Anonymous login and all web (Web SDK / H5) login methods stay OFF**: they are the only ways to reach the backend without a WeChat OPENID. **HTTP access stays OFF** for every function, with no HTTP route and no HTTP trigger.
- **Timezone trap:** function code runs in **UTC+0**, not UTC+8 (`MP/wxcloud/guide/functions/notice.html`). Set env var `TZ=Asia/Shanghai`, or compute Beijing dates explicitly. This directly affects the Beijing `dateKey` (§5.2). Add a test.
- **Atomic increments:** `db.command.inc` is atomic (`MP/wxcloud/guide/database/update.html`). Use it for `daily_stats.hist[i]`.
- **Transactions:** cloud-function-side only (wx-server-sdk >= 1.7.0), `db.runTransaction` / `startTransaction`, snapshot isolation (no write-skew protection), **single-record operations only** (no `where` batch) (`.../database/transaction.html`).
- **Unique indexes:** I could not find official WeChat text confirming console unique indexes or the duplicate-key error code. **UNVERIFIED (background):** I recall the console index manager has a "唯一" option. Verify in the console. Also: single-collection index limit is 20 (quota page, possibly stale). **Fallback if unavailable:** use deterministic `_id`s (`<openid>_<clientRunId>`, `<openid>_<dateKey>`) and `add` with a fixed `_id`: a second add fails on duplicate `_id`, which gives uniqueness without an index. Recommend using this now regardless.
- `OPENID` comes from `cloud.getWXContext()`, trusted (`.../guide/functions/userinfo.html`).
- Collection and quota caps from the (stale) quota page: 100 collections, 16 MB per DB response, DB QPS 30 and 20 concurrent connections on the base tier. Confirm against the actual environment tier.

## 10. Package and remote assets

URLs: `MG/guide/base-ability/code-package.html`, `MG/guide/base-ability/subPackage/useSubPackage.html`, `MG/guide/base-ability/network.html`.
- Total package at most **30 MB**, main package at most **4 MB**, a single normal subpackage unlimited, a single independent subpackage at most 4 MB. Allowed file extensions are whitelisted (png, jpg, mp3, m4a, ogg, wasm, etc.).
- `wx.loadSubpackage` (with progress) and `wx.preDownloadSubpackage` (base library 3.4.9). The open data directory cannot be in a subpackage, so it counts against the 4 MB main package.
- **Network domains:** HTTPS only, no IP addresses, no ports unless listed, **domain must be ICP-filed**, parent domains not supported (`MG/guide/base-ability/network.html`). Default request timeout 60 s. At most 10 concurrent `request/downloadFile/uploadFile`.
- **Remote image loading:** whether `wx.createImage` with a remote `src` requires the domain in the `downloadFile` whitelist is **not stated in the official docs I could reach** (community threads disagree, secondary). **Treat as required**: put the CDN domain in both `downloadFile` and `request` lists. Verify on a real phone with "不校验合法域名" off.
- **Cloud storage fallback:** WeChat Cloud storage (`cloud://` fileIDs through `wx.cloud.downloadFile` / `getTempFileURL`) needs no custom domain and no ICP of our own. If CDN filing is slow, host portraits there. This is a good Phase 2 default. *(2026-10-15: v1 sets cloud storage to deny-all, see §9. A post-launch portrait update hosted on cloud storage must replace that rule with a read-only rule scoped to the portrait path, and must never allow writes.)*

## 11. Privacy authorization

URL: `MG/guide/open-ability/privacy.html`.
- APIs: `wx.onNeedPrivacyAuthorization(cb)`, `wx.requirePrivacyAuthorize`, `wx.openPrivacyContract`, `wx.getPrivacySetting`. Alternative: an official popup component enabled in MP "基础设置 > 隐私授权弹窗" (cannot be turned off once enabled, default gap 10 s after refusal, configurable via `game.json officialPrivacyAuthorizationShowingGap`).
- **Privacy interfaces ("微信朋友关系") that apply to us** (official table 2.1.1): `wx.getFriendCloudStorage`, `wx.getGroupCloudStorage`, `wx.getGroupInfo`, `wx.getUserCloudStorageKeys`, **`wx.setUserCloudStorage`**, **`wx.removeUserCloudStorage`**, `wx.getUserInteractiveStorage`, plus the open-data-domain variants of `getUserInfo`/`getUserCloudStorage`/`setUserCloudStorage`/`removeUserCloudStorage`.
- Also: `wx.saveImageToPhotosAlbum` (相册写入) if we offer "save share card". `wx.setClipboardData` / `getClipboardData` count as privacy interfaces too, so **avoid clipboard-based challenge codes**.
- Not privacy interfaces in the table: `shareAppMessage`, `getEnterOptionsSync`, `getGroupEnterInfo`, `wx.login`, `createRewardedVideoAd`, `createFeedbackButton`.
- Errors if misconfigured: 104 (user has not agreed), 112 (scope not declared in the 隐私保护指引), 1025/1026 (nothing declared / popup not implemented). So the 隐私保护指引 must **declare 微信朋友关系** before the first board write, or `setUserCloudStorage` will fail with 112.
- **Spec impact (§11.1, §16):** the first ranked result's `setUserCloudStorage` is the moment the privacy popup (and, on the next board open, the friend scope prompt) fires. This is a user-action moment, which satisfies "never at launch". Refusal must not block play. `fail` must be handled and the result must still display.
- Spec §16 line "Declare if WeChat treats friend-relationship access as a privacy interface": **answer: yes, declare 微信朋友关系**.

## 12. Other items

- **Feedback button:** `wx.createFeedbackButton` exists (base library 2.1.2, `MG/api/open-api/feedback/wx.createFeedbackButton.html`). It is a native overlay button (text or image), so draw it above the canvas at the right coordinates. Verdict OK. Resolves §17 #17.
- **Login:** `wx.login` then cloud function. No `getUserInfo`. (`wx.authorize({scope:'scope.userInfo'})` shows no popup in mini games, and we do not need it.)
- **Real-device spike checklist** (cheatshaizi has no evidence for any of these):
  1. `setUserStorage` via cloud call (does it need a signature?) and via HTTPS; string JSON value accepted under key `d_YYYYMMDD`?
  2. Client `setUserCloudStorage` overwriting that key: confirm that it succeeds.
  3. Open data domain: friend rows with openid; group rows from `groupid` vs `shareTicket`; time of first friend-scope prompt.
  4. `genDaily` timeout setting and measured time.
  5. Timer trigger 23:00 BJT fires once; unique `_id` duplicate behaviour.
  6. Remote `createImage` from the CDN with the domain check on.
  7. Rewarded video no-fill on base library >= 3.7.7 with `disableFallbackSharePage:true`.

## 13. Spec changes forced by these findings

1. **§11.4:** record the outcome. Server write exists (Phase 0 check 1: yes), `session_key` obtainable via HTTPS `code2Session` in a cloud function (check 2: yes), but the client can overwrite (check 3: yes, nothing prevents it) and there is **no server-side read**. **Path B is mandatory; Path A is not achievable.** Rows include `openid`, so the signature can bind openid.
2. **§11.3 / §9.2 / §17 #3:** `getShareInfo` is deprecated; use `wx.getGroupEnterInfo` (base library 2.17.3+, `groupid` for `getGroupCloudStorage` from 3.8.8). *(2026-10-15, TD-1: the client sends the raw cloudID string and `joinGroup` resolves it with `cloud.getOpenData`. There is no `wx.cloud.CloudID` wrapper and no client-supplied `groupData`; see §2.4.)*
3. **§11.1 / §16:** `set/removeUserCloudStorage` and all friend/group reads are privacy interfaces needing the 隐私保护指引 declaration, a privacy popup, and (for reads) `scope.WxFriendInteraction`. Add the unauthorized and refused states.
4. **§12:** rewarded-video error 1004 on base library 3.7.7+ shows a platform share page that grants the reward for sharing. Set `disableFallbackSharePage:true` (conflicts with "no share grants anything" otherwise). Interstitial: handle 2001-2003.
5. **§14.2 / §5.2:** cloud function time defaults to UTC+0 (set `TZ=Asia/Shanghai`). Timer triggers are UTC+8, one per function, can double-fire. Set the `genDaily` timeout explicitly. Use fixed `_id`s for uniqueness.
6. **§15:** replace "plus `wx.reportEvent`" with optional `GameLogManager`.
7. **§21:** updatable challenge cards cannot show custom text. 擂台赛 needs reward gift packs and a client-reported single score. Both stay Phase 2 and need rewording.
8. **§9.2 scene values:** 1007 single chat, 1008 group chat, 1044 ticketed card (shared with mini programs). Keep ticket presence as the signal.
9. **§12 / §17 #8:** 流量主 opens at UV > 500 (or the other two routes). Phase 1 stays on the ad stub.

## 14. Sources (all official unless stated)

- `MG/api/open-api/data/wx.setUserCloudStorage.html`, `.../wx.getFriendCloudStorage.html`, `.../wx.getGroupCloudStorage.html`, `.../wx.removeUserCloudStorage.html`, `.../wx.getUserCloudStorage.html`, `.../wx.getUserInteractiveStorage.html`, `.../wx.getGroupInfo.html`, `.../UserGameData.html`, `.../FriendInfo.html`, `.../KVData.html`
- `MG/api/open-api/group/wx.getGroupEnterInfo.html`
- `MG/api-backend/data/api_storage.setuserstorage.html`, `.../api_storage.removeuserstorage.html`, `.../api_storage.setuserinteractivedata.html`, `MG/api-backend/login/api_code2session.html`
- `MG/guide/open-ability/signature`, `.../opendata/basic.html`, `.../open-data.html`, `.../interactive-data.html`, `.../tournament.html`, `.../privacy.html`, `.../ad/ad.html`, `.../ad/rewarded-video-ad.html`, `.../ad/interstitialAd-ad.html`, `.../share/share.html`
- `MG/api/share/wx.shareAppMessage.html`, `.../wx.onShareAppMessage.html`, `.../wx.updateShareMenu.html`, `.../wx.getShareInfo.html`
- `MG/api/base/app/life-cycle/wx.getEnterOptionsSync.html`, `https://developers.weixin.qq.com/minigame/dev/reference/scene-list.html`
- `MG/api-backend/updatable-message/api_createactivityid.html`, `.../api_setupdatablemsg.html`
- `MG/api/ad/wx.createRewardedVideoAd.html`, `.../RewardedVideoAd.onClose.html`, `.../RewardedVideoAd.onError.html`, `.../wx.createInterstitialAd.html`, `.../InterstitialAd.show.html`, `.../InterstitialAd.onError.html`
- `MG/api/data-analysis/wx.reportEvent.html`, `.../wx.getGameLogManager.html`, `.../GameLogManager.log.html`, `.../MiniReportManager.report.html`
- `MG/guide/base-ability/code-package.html`, `.../subPackage/useSubPackage.html`, `.../network.html`, `.../authorize.html`
- `MP/wxcloud/guide/functions/triggers.html`, `.../functions/notice.html`, `.../functions/mechanism.html`, `.../database/transaction.html`, `.../database/update.html`, `.../basis/capabilities.html`, `.../basis/concepts/quota.html` (stale)
- Non-WeChat-domain or secondary: `https://docs.cloudbase.net/en/cloud-function/function-configuration/config` (timeout figures), community threads on remote images and timer misfires (not authoritative).
