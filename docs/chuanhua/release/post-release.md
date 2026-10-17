# 传画接龙: post-release setup (cloud, moderation, ads)

Author: release. Date: 2026-10-15. Source of truth: `apps/chuanhua/cloudfunctions/README.md`, `CONTRACT.md`, `database/rules.json`, `core/schema.js` (read in full for this pack). Every step is founder-only unless it says CTO; nothing was run. Secret values are never written down: only names.

## 1. Cloud environment: creation and naming
Where: WeChat DevTools (cloud icon) or the MP console -> 云开发, logged in as the **real AppID's** admin.
1. 开通云开发 for the real AppID. **[MONEY]** The plan and any pay-as-you-go billing is the founder's decision (Art. 5.3); check the current free quota and set a spending alert [VERIFY current WeChat Cloud pricing; not researched here]. A live game with `roomSweeper` every minute, `watch` and PNG storage uses more than a static game: watch the first week's usage.
2. Create one environment named **`chuanhua-prod`** (the console appends a suffix; the full **环境 ID** `chuanhua-prod-xxxx` is what the build needs). Region: the default mainland region (the privacy guide promises mainland storage).
3. Give the CTO the environment ID (not secret): `node tools/release-config.js --env <envId> --appid <REAL_APPID> --prefixed-functions` (add `--ad-rewarded` / `--ad-interstitial` once the ad units exist; `build-upload.md` section 3).
4. Naming: `npm run pack` names functions `chuanhua_<name>`; collections are always `chuanhua_<name>` (server-side prefix); the client calls `chuanhua_` + name (release mode always sets `fnPrefix = 'chuanhua_'`; `--prefixed-functions` is the explicit flag, `--shared-test-env` is a deprecated alias that prints a note; `rules-check.md` A3, closed by TD-149).

## 2. Collections, rules and indexes (console -> 数据库)
Create these **18 collections** (names exactly): `chuanhua_chains chuanhua_steps chuanhua_rooms chuanhua_room_signals chuanhua_mod_traces chuanhua_mod_log chuanhua_mod_quota chuanhua_reports chuanhua_players chuanhua_group_members chuanhua_group_stats chuanhua_reactions chuanhua_sub_grants chuanhua_daily_stats chuanhua_audit_log chuanhua_events chuanhua_rate_limits chuanhua_app_config`.

**Rules** (权限设置 -> 自定义安全规则; `database/rules.json`, one entry per collection; not applied automatically):
- **17 collections, deny-all:** `{ "read": false, "write": false }` on every collection **except** `chuanhua_room_signals`. The game never reads or writes them directly; functions run with admin rights.
- **`chuanhua_room_signals` (the `watch` rule, the only exception):**
```json
{ "read": "doc._openid == auth.openid", "write": false }
```
Why: real-time sync is a doorbell; the client `watch()`es its own content-free signal doc (`where({_openid: '{openid}', roomId})`) and the platform applies the read rule to `watch` as well. A signal holds only room id, `seq`, state, round, kind, phase, deadline, `serverNow`, two counts and the owner's `_openid`: no content, no other player's openid. If the platform refuses this rule or `watch` fails on the device pass (V17/V18, D13), set `app_config.rt.watch` to `false`: the client polls `getRoom` every 2 s and nothing else changes.
- **Cloud storage:** 存储 -> 权限设置 -> custom rule `{ "read": false, "write": false }` (`storage.rules.json`). If custom storage rules are unavailable [V9], keep the default 仅创建者及管理员可读写 (the creator is the server).

**Indexes** (索引管理, fields in this order, **none unique**):
| Collection | Indexes |
|---|---|
| `chuanhua_chains` | `openGId + state + lastActivityAt`; `state + expiresAt`; `participants`; `createdAt`; `state + createdAt`; `roomId` |
| `chuanhua_steps` | `author + createdAt`; `chainId`; `chainId + claimId`; `state + mod.submittedAt` |
| `chuanhua_rooms` | `openGId + state + lastActivityAt`; `state + deadline`; `state + lastActivityAt`; `seats.openid + state`; `createdAt` |
| `chuanhua_room_signals` | `_openid + roomId`; `roomId` |
| `chuanhua_mod_log` | `stepId`; `ts` |
| `chuanhua_reports` | `state + createdAt`; `stepId`; `createdAt` |
| `chuanhua_players` | `lastActiveAt`; `flagged` |
| `chuanhua_group_members` | `openGId + lastSeen`; `openid` |
| `chuanhua_group_stats` | `lastActivityAt` |
| `chuanhua_reactions` | `createdAt` |
| `chuanhua_sub_grants` | `used + chainId`; `grantedAt` |
| `chuanhua_audit_log` | `ts` |
| `chuanhua_events` | `ts`; `name + ts` |
| `chuanhua_rate_limits` | `expireAt` |
| `chuanhua_mod_traces`, `chuanhua_mod_quota`, `chuanhua_daily_stats`, `chuanhua_app_config` | none (`_id` only) |

## 3. Functions: deploy names, timers, config
Folder `apps/chuanhua/game/cloudfunctions-deploy/` after `cd apps/chuanhua/cloudfunctions && npm run pack`. In DevTools (project = `apps/chuanhua/game`, whose `cloudfunctionRoot` is `cloudfunctions-deploy/`), for each of the **33 folders**: right-click -> 上传并部署：云端安装依赖 (not "all files": `core/` and `common/` are already inside each folder).

| Deployed name(s) | Caller / trigger | Timeout | Memory | openapi permissions |
|---|---|---|---|---|
| `chuanhua_getHome`, `agreeRules`, `joinGroup`, `rollPrompts`, `claimStep`, `releaseClaim`, `getChain`*, `getRoom`*, `getRoomReveal`, `getReveal`, `getMyChains`, `getGroupChains`, `laugh`, `report`, `subscribeReveal`, `grantReward`, `track`, `revealNow`*, `rematch`*, `createRoom`*, `joinRoom`*, `leaveRoom`*, `startRoom`* | client | 5 s (`startRoom` 8 s) | 256 | * = `updatableMessage.createActivityId` / `setUpdatableMsg` as in README |
| `chuanhua_createChain` | client | 8 s | 256 | `security.msgSecCheck`, `wxa.game.contentSpam.mediaCheckSync`, `wxa.game.contentSpam.msgSecCheck` |
| `chuanhua_submitStep`, `chuanhua_submitRoomStep` | client | 15 s | 512 | the three above (`submitStep` also `security.mediaCheckAsync`, `updatableMessage.setUpdatableMsg`) |
| `chuanhua_roomTick` | client | 8 s | 256 | |
| `chuanhua_deleteMyStep` | client | 10 s | 256 | |
| `chuanhua_admin` | **console only** | 20 s | 256 | |
| `chuanhua_onMediaCheck` | push (async fallback only) | 5 s | 256 | `updatableMessage.setUpdatableMsg` |
| `chuanhua_roomSweeper` | **timer `0 */1 * * * * *` (every minute), trigger `chuanhua_roomSweeper_timer`** | 60 s | 512 | |
| `chuanhua_modSweeper` | **timer `0 */5 * * * * *` (every 5 min), trigger `chuanhua_modSweeper_timer`** | 60 s | 512 | `security.mediaCheckAsync`, `subscribeMessage.send`, `updatableMessage.setUpdatableMsg` |
| `chuanhua_cleanup` | **timer `0 0 4 * * * *` (daily 04:00), trigger `chuanhua_cleanup_timer`** | 120 s | 512 | |

(The full 33-row table with exact permissions per function is in `cloudfunctions/README.md` step 3 and `MANIFEST.json`.) Each `function.config.json` sets `TZ=Asia/Shanghai` and the timeout; the DevTools upload does not always apply them, so **verify in the console after upload** (云函数 -> 配置): timeout, memory, `TZ`. `config.json` (permissions and the three triggers) is uploaded with the function; right-click each of the three timer functions -> 上传触发器 and approve permissions if asked. The three timers run in Beijing time [VERIFY the cron time zone on the first run: the log shows the start time]. In 云调用权限 check that `wxa.game.contentSpam.mediaCheckSync` and `msgSecCheck` are listed for the three UGC functions.

**Environment variables** (console -> 云函数 -> function -> 配置 -> 环境变量). Names only; values are set by the founder and never shared:

| Name | Function(s) | Required | Note |
|---|---|---|---|
| `ENV_KIND` = `prod` | every UGC function: `createChain getChain claimStep releaseClaim submitStep onMediaCheck modSweeper getReveal revealNow laugh report getMyChains getGroupChains deleteMyStep rollPrompts createRoom joinRoom leaveRoom startRoom getRoom submitRoomStep roomTick getRoomReveal rematch roomSweeper` | **yes (set explicitly)** | unset or anything else is treated as `prod`; set it anyway |
| `MODERATION_MODE` = `live` | the same | **yes (set explicitly)** | `mock` with `prod` (or an unknown value) makes every UGC function answer `SERVER_CONFIG` and log `[ALERT]` |
| `GROUP_REF_PEPPER` | `joinGroup`, `getHome`, `getChain`, `claimStep`, `createChain`, `report`, `getGroupChains`, `createRoom`, `joinRoom`, `startRoom`, `getRoom`, `rematch` (the 12 functions that resolve a `groupRef`; the **same value** on all 12; setting it on all 33 is harmless) | **yes** | secret; **≥ 32** random characters (shorter = `SERVER_CONFIG` + `[ALERT]` on every group-bound call), e.g. generate locally with `openssl rand -hex 32` and paste straight into the console; back it up in the company password manager. Rotating it changes every `groupRef` (members must re-enter via a group card) |
| `ADMIN_OPENIDS` | `chuanhua_admin` | optional | comma-separated openids; fallback if console invocation turns out to carry an OPENID (V14). Section 7 |
| `PUSH_TOKEN`, `PUSH_AES_KEY` | `chuanhua_onMediaCheck` | only for the async-fallback HTTP route | token also typed into the MP console; `PUSH_AES_KEY` = the 43-character EncodingAESKey, only in 安全 mode |
| `TZ` = `Asia/Shanghai` | all | set by the staged config | belt and braces |
| `MOD_TEXT_DAILY_BUDGET`, `MOD_IMAGE_DAILY_BUDGET`, `MOCK_SYNC_DELAY_MS`, `MOCK_MEDIA_DELAY_SEC` | UGC functions | **dev only: must be absent in production** | the budgets cap checks in dev + live (defaults 80 / 200) |

No AppSecret, payment key or `session_key` exists anywhere (a test greps for them); do not add one. **There is no `LAUNCH_DATE_KEY`** (no daily prompt).

## 4. Seeding: `chuanhua_app_config`
Record `_id: "live"` (a missing record means defaults; create it so the kill switches and moderation mode can be edited and audited):
```json
{ "_id": "live",
  "ugc": { "createEnabled": true, "viewEnabled": true },
  "features": { "updatableCard": false, "liveRooms": true },
  "moderation": { "imageMode": "sync", "textApi": "game" },
  "room": { "minPlayers": 3, "maxPlayers": 10, "maxRounds": 4, "promptSec": 30, "drawSec": 60, "describeSec": 45, "graceSec": 5, "lobbyIdleMin": 30, "gameMaxMin": 20 },
  "rt": { "watch": true, "pollSec": 2, "safetyPollSec": 10 },
  "timers": { "drawSec": 60, "describeSec": 45 },
  "ads": { "banner": { "enabled": false, "adUnitId": "" },
           "interstitial": { "enabled": true, "minLifetimeReveals": 3, "minGapSec": 180, "maxPerDay": 3 } } }
```
- **`ugc`**: the two **kill switches**, effective within 10 s (section 8). **`moderation.imageMode`**: `sync` normally; `async` switches live rooms off. **`moderation.textApi`**: `game` normally, `general` is the V19 fallback.
- **`features.updatableCard`** stays `false` until D7 proves updatable room cards (V7/V21); the card then falls back to the static card.
- **`rt.watch`**: set `false` if the `room_signals` rule or `watch` fails (polling 2 s).
- **Subscribe**: leave `subscribe` out until the template exists (section 9). **Ads**: banner stays off until the unit exists and D12 passed; the interstitial values are clamped (≥ 180 s, ≤ 3 a day) by the client and the core; going outside the AC needs a code change.
- The `room` caps may be tightened live (e.g. `maxPlayers` 5); the agreement says "以游戏内显示为准". Config is cached for a short time per function instance.

## 5. Console hardening (`cloudfunctions/README.md` "Security configuration")
1. **Cloud storage: deny all** (section 2).
2. **Anonymous / web login stays disabled:** 云开发 -> 设置 -> 登录授权: 匿名登录 and every web (Web SDK / H5) login OFF; add no publishable key or web domain. Every call must carry a WeChat OPENID.
3. **HTTP access service off for every function**, except `chuanhua_onMediaCheck` **only if** the async-fallback HTTP route is used (it needs a valid `PUSH_TOKEN` signature; without `PUSH_TOKEN` it is closed). Never expose `admin`, `modSweeper`, `roomSweeper` or `cleanup`.
4. **Timers need the timer marker.** `modSweeper`, `roomSweeper` and `cleanup` run only for `{"Type":"Timer"}`; a call with an OPENID is `FORBIDDEN`. Console test event for a manual run: `{"Type":"Timer"}`; each must answer `{"ok":true,...}`; `SERVER_CONFIG` means `ENV_KIND`/`MODERATION_MODE` are wrong.
5. **Database rules:** re-open every collection's permission page after setup and confirm: 17 deny-all, `room_signals` owner-read.
6. `joinGroup` uses `cloud.getOpenData` (`wx-server-sdk` pinned in the function's `package.json`); the client sends the raw cloudID string. Confirm on D6.
7. The prompt bank is server-only: only the `bank: true` functions carry it (`rollPrompts`, the room functions, `getReveal`, `admin`, ...). Do not copy it into the client.

## 6. Content security: enable, the 750031 path, the push route
1. **Cloud-call permissions** need no AppSecret: declared in each `config.json`, applied by the upload (section 3). Interface: `wxa.game.contentSpam.mediaCheckSync` (mini-game accounts only; 2,000/min, 200,000/day per AppID; 5 s timeout, `media_type 2`, `version 2`, `scene 3`) and the game `msgSecCheck` ([MC] page). **Enable the game content-security APIs for this AppID** and prove them at device item **D1 (V16)** before anything else.
2. **Error 750031** ("该游戏不支持，需联系小游戏侧配置"): if it appears (function log of `chuanhua_submitRoomStep` / `submitStep`, or an `[ALERT]` line), the code by itself does three things: the drawing is **not** delivered (fail closed), `app_config.moderation.imageMode` is set to **`async`**, an `[ALERT]` is logged. In `async`: `getHome` reports `features.liveRooms: false`, `createRoom` answers `LIVE_OFF`, `roomSweeper` finishes rooms in play (remaining slots become markers) and **only 慢慢传 runs**, on the old asynchronous pipeline (push below). **Founder action:** request activation from WeChat (小游戏 team / 管理后台 客服: "为 AppID <id> 开通小游戏图片内容安全识别接口 media_check_sync"), then in the console run `chuanhua_admin` with `{ "op": "setModeration", "imageMode": "sync" }` and re-test. If the cloud call does not exist at all (SDK has no `openapi.wxa.game.contentSpam`), the HTTPS route needs the AppSecret **in the cloud environment config only** plus a code change: escalate to the CTO and stay in `async`. `750032`/`750033` (minute/day limit) are plain `MODERATION_BUSY` and do not switch the mode. At 70% of 200,000/day the log shows `[ALERT]`: ask WeChat for a raise (H11); at 95% `createRoom` and `createChain` answer `UGC_BUSY`.
3. **Message push for `wxa_media_check` (async fallback only; needed only if `imageMode` is ever `async`).** 云开发控制台 -> 设置 -> 其他设置 -> 消息推送 -> 推送模式 **云函数** -> 添加配置: 消息类型 `event`, 事件类型 `wxa_media_check`, 环境 = the environment, 云函数 **`chuanhua_onMediaCheck`**. If the console does not offer that event: 云开发 -> HTTP 访问服务 -> add a path bound to `chuanhua_onMediaCheck` only; MP 后台 -> 开发管理 -> 开发设置 -> 消息推送: URL = that path's full URL, Token = a random string (also set as `PUSH_TOKEN`), 数据格式 JSON, mode 明文 or 安全 (for 安全 also `PUSH_AES_KEY`).
4. Watch the function logs for `[ALERT]`: `mediaCheckSync` 750031, image quota 70%, circuit breaker tripped, open report older than 48 h, mock moderation in production, moderation PNG upload failed, HTTP push rejected, `GROUP_REF_PEPPER` too short.

## 7. Admin openids and invoking `admin`
`chuanhua_admin` is for the **console** (云函数 -> `chuanhua_admin` -> 云端测试, an empty OPENID). Any call that carries an OPENID is `FORBIDDEN` unless the OPENID is in `ADMIN_OPENIDS`. If device item D10 shows the console invocation carries an OPENID (V14), set `ADMIN_OPENIDS` on `chuanhua_admin` to the comma-separated openids of the ops owner(s). **How to get an openid without logging it anywhere public:** the ops owner plays one game with their own WeChat; the owner (or the CTO on request) finds their openid in `chuanhua_players` (the document `_id`) via the console; paste it into the env var only. Never put openids in the repo or chat.

## 8. Moderation ops runbook (the ops owner, HANDOFF 7)
**Daily for the first 4 weeks, then at least every 2 days:** from the console run
```
{ "op": "listReports", "state": "open", "limit": 50 }
{ "op": "sample", "n": 20 }                         // optional "kind" and "mode": "live" | "chain"
```
Reported content is already hidden for everyone, so a slow queue only delays restores and strikes. For each open report:
| Situation | Run |
|---|---|
| Report is right | `{ "op": "upholdReport", "reportId": "<id>" }` (stays hidden, **one strike** to the author) |
| Report is wrong | `{ "op": "dismissReport", "reportId": "<id>", "restore": true }` (unhides unless it blocks an open chain) |
| Need detail (text, a 10-minute PNG link, moderation result, the author's openid and strikes) | `{ "op": "getStep", "stepId": "<id>" }` |
| A sampled item is bad | `{ "op": "hideStep", "stepId": "<id>" }`, then `restrict` the author if serious |
| A whole chain or game is bad | `{ "op": "removeChain", "chainId": "<id>" }` or `{ "op": "removeRoom", "roomId": "<id>" }` (a room in play is ended; everyone sees "已被移除") |
| Restrict or release a player | `{ "op": "restrict", "openid": "<openid>", "days": 7 }` (or `"permanent": true`; ≥ 4 strikes in 30 days are flagged for review) / `{ "op": "liftRestriction", "openid": "<openid>" }` |

**Kill switches (effective within 10 s):**
```
{ "op": "setUgc", "createEnabled": false }   // no new rooms, chains, joins, claims or sends; rooms in play are finished within a minute (markers for the rest) and revealed
{ "op": "setUgc", "viewEnabled": false }     // EMERGENCY STOP: every content view (assignments, claims, reveals, group list texts) shows a placeholder 内容维护中
{ "op": "setUgc", "createEnabled": true, "viewEnabled": true }   // back to normal (createEnabled: true also ends an automatic circuit-breaker pause)
```
**Moderation mode:** `{ "op": "setModeration", "imageMode": "async" }` switches live rooms off and runs 慢慢传 on the async pipeline (use if drawings fail checks en masse or latency exceeds 5 s); `{ "op": "setModeration", "imageMode": "sync" }` restores it; `"textApi": "general"` selects the general text API (V19 fallback). The circuit breaker (≥ 50% failures of ≥ 20 calls over 5 minutes) pauses creation for 15 minutes by itself (`autoPausedUntil`). Every op writes `chuanhua_audit_log`. **If something unlawful or seriously harmful slipped through:** `setUgc viewEnabled:false` first, `hideStep` / `removeChain`, keep the evidence (the PNG and `mod_log` copy are retained admin-only for 180 days), report to the authorities as the law requires (counsel H10), then restore.

## 9. Subscribe template (HANDOFF 10)
MP -> 订阅消息 -> 公共模板库 -> choose a **one-time (一次性)** template with about three keywords for "接龙揭晓了". The field map comes from `app_config.live.subscribe.fields` (roles `title`, `prompt`, `time`; default keys `thing1`, `thing2`, `time3`). Put the **模板 ID** in:
```json
"subscribe": { "tmplId": "<template id>", "fields": { "title": "thing1", "prompt": "thing2", "time": "time3" } }
```
(or in `js/build-config.js` `subscribeTmplId`; the remote value wins). The notice is for 慢慢传 only, carries no names, and is held between 22:00 and 08:00 BJT; the `modSweeper` needs the `subscribeMessage.send` permission. Device item D9 tests it.

## 10. Ad units after 流量主
1. Eligibility (any one of: cumulative UV > 500 with no fake traffic; game circle + 5 posts; a same-company mini program earning for a quarter) [re-check in the console].
2. MP -> 流量主 -> 开通 (agreement signing and settlement are the founder's legal and financial acts).
3. 流量主 -> 广告管理 -> create **激励视频**, **插屏**, **Banner**.
4. Rewarded and interstitial ids go into `js/build-config.js` `adUnits` on the release branch (one more build and upload, e.g. 1.0.1); the banner id and `enabled: true` go into `chuanhua_app_config.live.ads.banner` (live edit).
5. Device item D12. **Do not click your own live ads.** Until then every reward behaves as no-fill (one grant per placement per day) and the interstitial and banner never show.

## 11. First-night checks and smoke test
- After the first hour: `chuanhua_roomSweeper_timer` fired every minute and `chuanhua_modSweeper_timer` every 5 minutes (function logs), no `[ALERT]`; the next morning `chuanhua_cleanup` ran once at 04:00.
- Smoke test (`cloudfunctions/README.md`, device pass D2): create a room from a group card with 3 accounts, play to the reveal; `chuanhua_events` has `mod_verdict` rows with `latencyMs` and `api: game`; `chuanhua_room_signals` holds one doc per seat that disappears a day after the game; one report hides at once; `listReports` shows it.
- If `INTERNAL` or `BUSY_RETRY` appears under load (TD-145 retries), note the count and tell the CTO (QA D14).

## 12. KPIs to watch (spec §1; INFERENCE, no gate)
Rooms started ÷ created ≥ 50%; started games reaching the reveal ≥ 90%; rematch within 10 min ≥ 30%; room-card open to join ≥ 40%; 慢慢传 completion ≥ 60%; reveal-card share ≥ 15%; D1 ≥ 35%, D7 ≥ 12%. **Moderation health:** image-check p95 ≤ 3 s, block rate, marker rate (「（这一棒没传过来）」), report rate, open-report age (alert at 48 h), image quota (alert 70%). Each is one query over `chuanhua_events` (`wx.reportEvent` is never used).

## 13. Reset after a test run
If the real or the shared test environment was used for testing before launch, delete the documents of the `chuanhua_` collections the tests created (all 18) and the files under `chuanhua/mod/` in storage, so launch is clean. **Irreversible data deletion: founder decision (Art. 5.6).** The shared test environment is used by other games: touch only collections starting with `chuanhua_`. Keep `chuanhua_app_config` (re-seed section 4).
