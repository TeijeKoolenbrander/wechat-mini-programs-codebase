# Cloud functions contract (backend <-> minigame-dev), spec rev. 2: 传画接龙 (live rooms)

Owners: **backend** implements `cloudfunctions/<fn>/`, `game/core/*` and `game/js/mock-server.js` (the executable reference of this contract: same inputs, same outputs, same codes; it runs the same core code and is checked against the functions by `tests/contract.test.js` and `tests/contract-sync.test.js`). The client logic engineer consumes this file. Spec: `docs/chuanhua/spec.md` rev. 2 section 3A, 4, 5.8, 6, 7, 13. Where this file and the spec differ, `docs/chuanhua/decisions.md` records a decision (TD-n). `game/tests/contract-docs.test.js` fails if a function, collection, admin op, env var or error code in `game/core/schema.js` / `codes.js` is missing here.

## 0. Environment and naming (shared test environment)

- **Test AppID `wxcd03c1b62d7eb0e0`** is the default `appid` of every project.config.json while the app is under test. Its cloud environment is **shared across apps**.
- **One env id, one place:** `game/js/build-config.js` `cloudEnv` (empty by default = mock server, no backend needed). Cloud functions use `cloud.DYNAMIC_CURRENT_ENV`.
- **Every collection is prefixed with the app slug**: the logical name `chains` is the physical collection **`chuanhua_chains`**. Functions are deployed as `chuanhua_<name>` (`fnPrefix` in build-config.js; one name table in `game/js/api.js`). Storage paths start with `chuanhua/`.
- Environment variables (never committed; console only): `GROUP_REF_PEPPER` (>= 32 characters), `ENV_KIND` (`prod` | `dev`; unset or a typo = `prod`), `MODERATION_MODE` (`live` | `mock`; unset = `live`), `MOD_TEXT_DAILY_BUDGET` (dev live, default 80), `MOD_IMAGE_DAILY_BUDGET` (dev live, default 200), `MOCK_SYNC_DELAY_MS` (dev mock, default 800), `MOCK_MEDIA_DELAY_SEC` (dev mock async fallback, default 60), `ADMIN_OPENIDS` (optional fallback), `PUSH_TOKEN` / `PUSH_AES_KEY` (only for the async-fallback HTTP push, V1), `TZ=Asia/Shanghai`. No AppSecret anywhere (the HTTPS fallback for V16 would need one: founder sets it in the cloud environment config, never in the repo).

## 1. Conventions

- Every function returns `{ok:true, ...}` or `{ok:false, code, message, ...extra}` and **never throws to the client** (AC 112, fuzz test). Identity is only `cloud.getWXContext().OPENID` (`common/store.js` `handler`). Client-supplied identity fields are ignored. Timer/push functions (`modSweeper`, `roomSweeper`, `cleanup`, `onMediaCheck`) reject any call that carries an OPENID with `FORBIDDEN`; the timers also require the platform event marker `{Type:'Timer'}`; `admin` accepts only a console invocation (no OPENID) or an OPENID in `ADMIN_OPENIDS`.
- Dates: server time, explicit UTC+8 (`core/date.js`), never the device clock. Responses that matter for timers include `serverNow` (ms); clients compute `offset = serverNow - Date.now()` on every response and show `deadline - (Date.now() + offset)`.
- Writes to one chain or one room are **transactions on that document** (`db.runTransaction`, guarded by `version` for rooms); uniqueness by deterministic `_id`. Pure transitions come from `core/chain.js`, `core/room.js`, `core/roll.js`, `core/allowance.js`, `core/strikes.js`; the function only loads, calls, stores.
- Responses never contain an openid, openGId, nickname, avatar, file id or PNG (AC 29, 73). Authorship is `mine: boolean`; groups are the opaque `groupRef`; seats are numbers only. The `room_signals` documents contain the owner's `_openid` and nothing else personal.
- The kill-switch config (`app_config/live`) is read with a 10 s cache by every UGC function and 60 s by `getHome`. Unreadable config = defaults via `core/config.js#applyRemote`. `moderation.imageMode: 'async'` forces `features.liveRooms` false.
- **Fail closed (AC 51):** every UGC function first runs `core/moderation.js#resolveEnv({envKind: ENV_KIND, mode: MODERATION_MODE})`; `ok:false` -> `{ok:false, code:'SERVER_CONFIG'}` and `console.error('[ALERT] ...')`.
- **Prompt bank:** server-only (TD-103). `rollPrompts` and the room functions return only the 3 rolled texts; the bank is not in the client package.
- Strokes: v2 `{v:2, h, s}` (`h` 768-2048, grid 1024 x h) or legacy `{v:1, s}` (h = 1024); both accepted on submit, both stored as sent.

## 2. Collections (physical name = `chuanhua_` + logical name), indexes, rules

All collections deny every client read and write (security rule `{"read": false, "write": false}`, **except `room_signals`**: `{"read": "doc._openid == auth.openid", "write": false}` (spec 13.4; a player reads only their own doorbell)). Cloud functions run with admin rights and bypass the rules. `database/rules.json` is generated from `game/core/schema.js` by `scripts/gen-rules.js`; `tests/security.test.js` checks it. Cloud storage: `storage.rules.json` `{read:false, write:false}`; PNGs live under `chuanhua/mod/<YYYYMM>/<chainId>/<n>_<attempt>.png`, written only by `submitStep` / `submitRoomStep`, read only by the moderation service (600 s temp URL) and `admin` (10-minute temp URLs).

| Logical | Key fields | Indexes (console, in order) |
|---|---|---|
| `rooms` | `_id: roomId`, host, creator, openGId?, groupRef?, `state` lobby/playing/reveal/closed/removed, seats[{openid, joinedAt, status active/left, lastSeenAt}], n, R, round, kind, roundStartAt, deadline, timers{promptSec, drawSec, describeSec, graceSec}, `slots{<round>:[{state none/received/sent/blocked/marker, at, attempt, stepId?, marker?, auto?, promptId?, custom?, text?}]}`, chainIds[], rolls[{rollId, ids[3], rerolls: 0..5, shownIds[<= 18]}], usedPrompts[], version, rematchRoomId?, activityId?, materialized, revealViewed[], createdAt, startedAt?, endedAt?, endedBy?, lastActivityAt, dateKey | `openGId + state + lastActivityAt`; `state + deadline`; `state + lastActivityAt`; `seats.openid + state`; `createdAt` |
| `room_signals` | `_id: <roomId>_<seat>`, `_openid`, roomId, seq, state, round, kind, phase, deadline, serverNow, sent, active, rematchRoomId? | `_openid + roomId`; `roomId` |
| `chains` | `_id: chainId`, starter, openGId?, groupRef?, promptId?, promptText, custom, length (6, or R for live), state, passed, nextStep, claim?, pending?, stepIds[], authors[], attempts[], participants[], perPersonCount, revealViewed[], createdAt, lastActivityAt, expiresAt, revealedAt?, revealReason?, activityId?, hidden?, dateKey; **live chains:** `mode:'live'`, roomId, seat (origin) | `openGId + state + lastActivityAt`; `state + expiresAt`; `participants`; `createdAt`; `state + createdAt`; `roomId` |
| `steps` | `_id: <chainId>_<n>_<attempt>` (marker steps `<chainId>_<n>_m`), chainId, roomId?, n, attempt, kind, author, claimId?, text?, strokes?, fileID?, `marker?` (emptyDraw/emptyText/notDelivered), auto, state, mod{kind, api, suggest, ...}, hiddenReason?, laughs, result?, createdAt | `author + createdAt`; `chainId`; `chainId + claimId`; `state + mod.submittedAt` |
| `mod_traces` | `_id: trace_id` (async) or `sync_<stepId>_<rand>` (every sync check, so cleanup can delete the PNG), stepId, fileID, submittedAt, ... | none |
| `mod_log` | `_id: <stepId>_<k>`, stepId, author, kind, textCopy?, fileID?, suggest, label, source, ts | `stepId`; `ts` |
| `mod_quota` | `_id: dateKey`, text, image, errors, textGame, imageSync, calls{m<minute>:{n,f}} | none |
| `reports` | `_id: <reporterOpenid>_<chainId>_<stepId|teaser>`, reporter, stepId, chainId, roomId?, reason, state, createdAt | `state + createdAt`; `stepId`; `createdAt` |
| `players` | `_id: openid`, rulesVersion, strikes[], restrictedUntil, restrictedAt, permanent, flagged, warnPending, day{dateKey, starts, adStarts, steps, reports, palette, claims{}, noFill{}, roomsCreated, roomsJoined, joined[]}, curStreak, bestStreak, lastStepDate, lifetimeReveals, seenPrompts[<=300], roll?, activeRoomId?, claimRef?, lastActiveAt | `lastActiveAt`; `flagged` |
| `group_members` | `_id: <openGId>_<openid>`, openGId, openid, groupRef, firstSeen, lastSeen | `openGId + lastSeen`; `openid` |
| `group_stats` | `_id: openGId`, started, revealed, drawings, rooms, lastActivityAt | `lastActivityAt` |
| `reactions` | `_id: <stepId>_<openid>` | `createdAt` |
| `sub_grants` | `_id: <chainId>_<openid>` | `used + chainId`; `grantedAt` |
| `daily_stats` | `_id: dateKey`, started, revealed, rooms, roomsFinished, markers, byPrompt{} (aggregates only, no UI) | none |
| `audit_log` | op, target, before, after, by, ts | `ts` |
| `events` | openid, sessionId, name, props, ts, clientTs | `ts`; `name + ts` |
| `rate_limits` | `<bucket>_<openid>_<minute>`, expireAt | `expireAt` |
| `app_config` | `_id:'live'`: ugc{createEnabled, viewEnabled, autoPausedUntil?}, features{updatableCard, liveRooms}, moderation{imageMode 'sync'/'async', textApi 'game'/'general'}, room{...}, rt{watch, pollSec, safetyPollSec}, subscribe, ads, timers | none |

## 3. Realtime signal shape (client: `watch()` plus polling, spec 3A.7)

`chuanhua_room_signals/<roomId>_<seat>`, written only by functions, after every room change:

```
{ _openid, roomId, seq /* = room.version, monotonic */, state /* lobby|playing|reveal|closed|removed */, round /* null in the lobby */, kind /* prompt|draw|describe|null */,
  phase /* 'turn'|'passing'|null, computed when written: the client recomputes from deadline */, deadline, serverNow, sent /* resolved slots this round */, active /* active seats */, rematchRoomId? }
```
No content and no other openid. Client: `db.collection('chuanhua_room_signals').where({_openid: '{openid}', roomId}).watch({onChange, onError})`; on a `seq` higher than the last seen, call `getRoom`. After 2 `onError`s, or when `watch` is missing, poll `getRoom` every `rt.pollSec` (2 s); also a safety poll every `rt.safetyPollSec` (10 s) while `watch` runs. At `deadline + graceSec + 1 s` call `roomTick`, then every 2 s until the round changes. The mock server simulates all of this: `srv.realtime.watch / paused / flush / failNext / unsupported / deliveries` (header of `game/js/mock-server.js`).

## 4. Moderation pipeline [COMPLIANCE]

Reused core: `core/moderation.js` (all decisions), `core/text.js` (local rules), `core/strokes.js` + `core/raster.js` + `common/raster.js`/`png.js` (the image), `core/chain.js`, `core/room.js`, `core/strikes.js`. The SDK calls are thin wrappers (`common/wxapi.js` is the ONLY file that touches `cloud.openapi`); every branch below is a pure function the mock server already runs.

**Text (custom prompt in `createChain` / round 0, description in `submitStep` / `submitRoomStep`)**, synchronous:
1. `text.validate(raw, kind)`; `ok:false` -> `TEXT_REJECTED` (+`reason`). No API call, no strike, no `mod_log`.
2. Dev `live` budget (`MOD_TEXT_DAILY_BUDGET`); over budget -> `MODERATION_BUSY`.
3. `app_config.moderation.textApi`: `game` (default) = `cloud.openapi.wxa.game.contentSpam.msgSecCheck({openid, version: 2, scene: 3, content})`, 2 s timeout; `general` = `cloud.openapi.security.msgSecCheck({content, version: 2, scene: 3, openid})`, 3 s timeout. `mock` mode (dev only): `moderation.mockText`.
4. `moderation.verdictOf(suggest)`: `pass` -> delivered; `risky` -> `TEXT_BLOCKED` + one strike; `review` (general API only) -> `TEXT_BLOCKED`, no strike (on the game API `review` is an unknown verdict = `MODERATION_BUSY`); API error / timeout / quota / unknown `suggest` -> `MODERATION_BUSY`, nothing stored, counted as a failure for the breaker. A blocked text goes to `mod_log` and is never returned to anyone.

**Drawings, default `imageMode: 'sync'`** (both modes, `submitStep` and `submitRoomStep`):
1. `strokes.validate` -> `INVALID_STROKES` (+`reason`). 2. Quota level: `failClosed` -> `MODERATION_BUSY`; `alert` -> `[ALERT]`. 3. `common/raster.js#strokesToPng` (512 x round(512 h / 1024), deterministic) and upload to `moderation.modPngPath(...)`. 4. `getTempFileURL(maxAge 600)`. 5. **`cloud.openapi.wxa.game.contentSpam.mediaCheckSync({openid, version: 2, scene: 3, media_url, media_type: 2})`** (both snake_case and camelCase spellings are sent [V3]), **5 s timeout**. API: https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamesecurity.mediacheck.html. 6. `pass` -> delivered; `risky` -> `IMAGE_BLOCKED` + one strike; error / timeout / 750032 / 750033 / upload failure / unknown suggest -> `MODERATION_BUSY`. **Error 750031** ("game not supported") additionally sets `app_config.moderation.imageMode = 'async'` (audit entry `autoAsync`, `[ALERT]`): live rooms go off (`LIVE_OFF`, `roomSweeper` finishes games in play) and 慢慢传 uses the async pipeline. Nothing unchecked is ever stored as visible; a `mod_traces` record keeps the PNG deletable; every verdict is a `mod_log` entry and a `mod_verdict` event with `latencyMs`.
7. **Forced send** (`auto: true`, F-4): nothing to send -> a marker step, no check; a failed check -> live: marker `notDelivered` (「（这一棒没传过来）」), 慢慢传: the claim is released and the 棒 reopens (`reopened:true` in the error). Before time-up a failed check returns the error, the author keeps the work (live: the slot is `blocked` and may be resent until the deadline).

**Drawings, `imageMode: 'async'` (dormant fallback, spec 6.10, v1 AC 42-50)**: `mediaCheckAsync` -> `pending` -> push `wxa_media_check` to **`onMediaCheck`** (idempotent by `trace_id`; `planVerdict`) -> `passed` / `blocked`; failed calls retried by `modSweeper` at +5 / +10 min, one re-check after 35 min, then `void` (no strike, allowance refunded). The chain cannot be claimed while `pending` (`PENDING`). `onMediaCheck` returns the string `success`; a call with an OPENID is `FORBIDDEN`. V1 (the push route) matters only in this mode.

**Kill switches and guards:** `ugc.createEnabled=false` or an active circuit-breaker pause (`autoPausedUntil > now`) -> `UGC_PAUSED` from `createChain`, `claimStep`, `submitStep`, `createRoom`, `joinRoom`, `startRoom`, `submitRoomStep`; `roomSweeper` finishes rooms in play when `createEnabled` is false (not for a breaker pause) or `imageMode` is `async`. `ugc.viewEnabled=false` -> every assignment, claim source and reveal is a placeholder (`paused`). Quota 95% -> `createChain` / `createRoom` `UGC_BUSY`; 100% -> drawing sends `MODERATION_BUSY`. Circuit breaker: >= 50% failures over >= 20 calls in 5 minutes pauses creation 15 minutes (`modSweeper`, `[ALERT]`). **Strike ladder:** `core/strikes.js`; `risky` verdicts and upheld reports only.

## 5. Functions

Rate limits (per openid, fixed one-minute window, answer `RATE_LIMITED`): reads 60/min (`getHome getChain getReveal getMyChains getGroupChains getRoom getRoomReveal`); turns `submitRoomStep` 30, `submitStep` 30, `roomTick` 40; writes 20/min (`claimStep releaseClaim joinGroup laugh agreeRules subscribeReveal track rollPrompts`); tighter: `createChain` 5, `createRoom` 5, `startRoom` 5, `rematch` 5, `joinRoom` 10, `leaveRoom` 10, `deleteMyStep` 10, `report` 10, `revealNow` 10, `grantReward` 10; `admin` 60 for an allow-listed openid. Timer, push and console-only functions have no client limiter.

Common error codes everywhere: `UNAUTHENTICATED`, `RATE_LIMITED`, `SERVER_CONFIG`, `INTERNAL`, `BUSY_RETRY` (retryable: the database was too busy, nothing was written, the client tries again; any function that runs a transaction, `submitRoomStep` and `startRoom` included), `BAD_REQUEST`. Policy codes of the create/join/start/claim/submit family: `RULES_REQUIRED`, `RESTRICTED` (+`until`), `UGC_PAUSED`. Player-facing copy: `game/core/codes.js`.

**Source** (what a player is handed): `{kind:'prompt', text, custom, canReport}` | `{kind:'text', text, canReport}` | `{kind:'draw', strokes, canReport}` (a live-room Source with `canReport:true` adds `reportRef`) | `{kind:'marker', marker, text, hint, canReport:false}` | `{kind:'hidden', hint}` | `{kind:'paused', hint}`; 慢慢传 `prev` adds `'gone'`. `marker` is `emptyDraw` | `emptyText` | `notDelivered`; `text` is the marker copy (「（没来得及画）」...), `hint` the free-play line.

### getHome  (client, 5 s)
In `{groupRef?}`. Out `{ok, dateKey, serverNow, me:{rulesVersion, rulesRequiredVersion, restriction:{until,permanent}|null, warnPending, startsLeft, adStartsLeft, roomsLeft, joinsLeft, turnsLeft, paletteToday, streak, unseenReveals, activeRoom:{roomId, state, round, rounds}|null}, features:{liveRooms, subscribe, updatableCard, banner, interstitial, rt:{watch, pollSec, safetyPollSec}}, room:{minPlayers, maxPlayers, maxRounds, promptSec, drawSec, describeSec, graceSec}, timers, ugc:{createEnabled, viewEnabled, pausedSource}, group?:{openRoom:{roomId, joined}|null, waitingChains}|null}`. **No `daily`, `launchKey`, counts or `meta.launch`** (F-2, AC 121). `group` only with a valid `groupRef`. `warnPending` is read-once.

### agreeRules  (client, 5 s)
In `{version}` (= `CONFIG.rulesVersion`, now 2). Out `{ok}`. `BAD_REQUEST` otherwise.

### joinGroup  (client, 5 s)
In `{cloudID: string}`: the RAW cloudID of `wx.getGroupEnterInfo`. Out `{ok, groupRef}`. The function resolves it with `cloud.getOpenData({list:[cloudID]})` and requires a plain `data` object, a falsy `errCode`, a non-empty `data.opengid` (<= 128 chars) and a `chat_type` that is **absent or 3 / 4** (studio ruling); `open_single_roomid` without `opengid` is refused. `event.groupData` is never read. Errors: `BAD_CLOUDID`, `NOT_GROUP`, `RATE_LIMITED`, `SERVER_CONFIG`.

### rollPrompts  (client, 5 s)
In `{reroll?: boolean, rollId?}` (慢慢传) or `{roomId, reroll:true, rollId?}` (a live seat in round 0). Out `{ok, rollId, prompts:[{id, text}], rerollLeft: 0..5}`: **3 prompts from 3 different categories**, none among the player's last 300 shown ids (`players.seenPrompts`), never retired; in a room none shared with any other seat. 慢慢传: a plain call returns the CURRENT unused roll (10 minutes), else rolls anew; `reroll:true` (换一批) gives 3 new prompts, none shown earlier in this pick, with a NEW `rollId` and `rerollLeft` one lower. **Up to 5 per pick** (`MAX_REROLLS` in `core/roll.js`, `CONFIG.roll.rerollsPerPick`), so a player sees at most 6 sets (18 prompts); the count (`rerolls`) and every shown id (`shownIds`, <= 18) live on the server with the roll (`players.roll`, `rooms.rolls[seat]`). A `rollId` that is not the current roll is `BAD_REQUEST` (the client reloads with a plain call). **The 6th reroll is `REROLL_LIMIT`**, returned as `{ok:false, code:'REROLL_LIMIT', rollId: <current>, rerollLeft: 0}`, and writes nothing (same roll, same prompts, no ids added to `seenPrompts`). Every set keeps the bank rules: 3 categories, none among the player's last 300 shown ids (each reroll's prompts count into `seenPrompts`), never retired. Live: the first roll arrives with `getRoom` (`rerollLeft` 5); here only the reroll, in a transaction on the room doc, so a set is also unique in the room (no prompt is shown to two seats, over all rerolls); accepted only in round 0 and only until the round-0 deadline, with NO grace (`ALREADY_SENT` / `ROUND_OVER` / `BAD_REQUEST` / `REROLL_LIMIT` per `core/room.js#rerollBlock`); a reroll never moves the deadline. A forced send (`auto: true`) at round 0 may name any id in the seat's `shownIds`, also from a set a reroll just replaced; any other id falls back to the first prompt of the current set; a normal pick must name an id of the current set. Errors: `BAD_REQUEST`, `REROLL_LIMIT`, `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `ALREADY_SENT`, `ROUND_OVER`.

### createChain  (client, 8 s)
In `{rollId, promptId}` or `{customText}`, plus `groupRef?`. Out `{ok, chainId, serverNow, claim:{claimId, step:1, kind:'draw', expiresAt, sourceText, timerSec}}`. `promptId` must be in the caller's CURRENT roll `rollId` (else `BAD_REQUEST`); the roll is spent. Custom text: `text.validate` then the text check. Checks: rules, restriction, UGC pause, quota (`UGC_BUSY`), start allowance (`START_LIMIT`, consumed at 棒 1), not seated in a playing room (`IN_ROOM`). Errors: `RULES_REQUIRED`, `RESTRICTED`, `UGC_PAUSED`, `UGC_BUSY`, `START_LIMIT`, `IN_ROOM`, `TEXT_REJECTED`, `TEXT_BLOCKED`, `MODERATION_BUSY`, `BAD_REQUEST`.

### getChain  (client, 5 s)
In `{chainId, groupRef?, wantActivity?}`. Out `{ok, chainId, serverNow, state, passed, length, nextStep, nextKind, timeLeftMs, takenEtaSec, isParticipant, isStarter, canRevealNow, restrictedUntil?, removedReason?, pendingStep?, activityId?}` = `core/views.js#entryView` (**never any content**; key set `ENTRY_KEYS`). No `promptId`, no `canSameAgain` (同题再传 is removed). `state`: claimable taken pending prevMine capReached wrongGroup **inRoom** revealedParticipant revealedTeaser expired removed notFound restricted rulesRequired ugcPaused dailyLimit. Errors: `CHAIN_NOT_FOUND`.

### claimStep  (client, 5 s)
In `{chainId, groupRef?}`. Out `{ok, serverNow, claimId, step, kind, expiresAt, timerSec, prev}`; `prev` is a Source (marker sources carry the free-play `hint`). Transaction on the chain: `chain.canClaim` then `applyClaim`. Errors: `CHAIN_NOT_FOUND`, `RULES_REQUIRED`, `RESTRICTED`, `UGC_PAUSED`, `CHAIN_CLOSED` (live chains too), `NEED_GROUP`, `WRONG_GROUP`, `IN_ROOM`, `PENDING`, `TAKEN` (+`etaSec`), `PREV_MINE`, `CAP_REACHED`, `STEP_LIMIT`, `CLAIM_LIMIT`.

### releaseClaim  (client, 5 s)
In `{chainId, claimId}`. Out `{ok}` (idempotent). Releasing the starter's 棒 1 abandons the chain.

### submitStep  (client, 15 s)
In `{chainId, claimId, text?, strokes?, auto: boolean, empty: boolean, clientMs, undoCount}`; `empty:true` only with `auto:true`. Out `{ok, serverNow, state:'passed'|'marker'|'pending', step, chainState, revealed, marker?}`. **Idempotent per `claimId`.** Forced send semantics: see section 4 (steps 6-7); `state:'marker'` for an empty forced send (counts as a passed 棒, a started chain, a 3-棒-cap slot; not for the daily turn cap or the streak); a failed forced send answers the error with `reopened:true`. `pending` only when `imageMode` is `async`. Errors: `CHAIN_NOT_FOUND`, `RULES_REQUIRED`, `RESTRICTED`, `UGC_PAUSED`, `CHAIN_CLOSED`, `CLAIM_LOST`, `BAD_REQUEST`, `STEP_LIMIT`, `START_LIMIT`, `INVALID_STROKES` (+`reason`), `TEXT_REJECTED`, `TEXT_BLOCKED`, `IMAGE_BLOCKED`, `MODERATION_BUSY`.

### createRoom  (client, 5 s)
In `{groupRef?}`. Out = the **room view** (see `getRoom`, member form) of the new lobby: caller = host = seat 0. Idempotent for a player already in a lobby (returns that lobby). Checks: live rooms on (`LIVE_OFF`), 公约, restriction, kill switch, quota (`UGC_BUSY`), the turn cap (`STEP_LIMIT`) and 10 rooms a day (`ROOM_LIMIT`), one room at a time (`IN_OTHER_ROOM` +`otherRoomId`), no open claim (`IN_CLAIM`). A `groupRef` with a fresh membership binds the room at once. Errors: those.

### joinRoom  (client, 5 s)
In `{roomId, groupRef?}`. Out the room view. A seated member just gets the room back (rejoin, any state). Otherwise, in this order: group gate (bound room: fresh membership of its group, else `WRONG_GROUP` / `NEED_GROUP`; unbound room: bound to the joiner's group from a valid `groupRef`, else `NEED_GROUP`), the lobby (`ROOM_STARTED`, `ROOM_FULL`, `ROOM_CLOSED`), policy, one room at a time (`IN_OTHER_ROOM`), `IN_CLAIM`, the turn cap (`STEP_LIMIT`) and 30 joins a day (`JOIN_LIMIT`, first join of a room only). Errors: `ROOM_NOT_FOUND` + those.

### leaveRoom  (client, 5 s)
In `{roomId}`. Out `{ok}`. Lobby: the seat is removed, seats renumber in join order, the earliest-joined member becomes host if the host left, the last member closes the room (the creator's room count is refunded). Playing: the seat becomes `left`; its slots in the current and every later round are filled at once (empty marker; round 0: the first rolled prompt), which may end the round early; if nobody is active the game finishes into the reveal. Reveal/closed: no-op. Errors: `ROOM_NOT_FOUND`, `NOT_IN_ROOM`.

### startRoom  (client, 8 s)
In `{roomId}`. Out the room view. Host only (`NOT_HOST`), >= 3 active seats (`NOT_ENOUGH_PLAYERS`). Fixes seats, `n`, `R = min(n-1, maxRounds)`, snapshots the timers, creates the n live chains, rolls the round-0 prompts (pairwise disjoint over the room), round-0 deadline = start + 1 s + `promptSec`. Errors: `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `NOT_HOST`, `NOT_ENOUGH_PLAYERS`, `ROOM_STARTED`, `ROOM_CLOSED`, `LIVE_OFF`, `UGC_PAUSED`.

### getRoom  (client, 5 s)
In `{roomId, groupRef?, wantActivity?}`.
**Member** (seated at the start, also if `left`): `{ok, roomId, member:true, state, round, rounds, kind, phase, roundStartAt, deadline, roundSec, graceSec, serverNow, version, n, joined, minPlayers, maxPlayers, me:{seat, isHost, status:'active'|'left', slot:'none'|'received'|'sent'|'blocked'|'marker'|null}, seats:[{n, filled, me, quiet, left}], sentCount, activeCount, assignment?, mine?, endedBy?, rematchRoomId?, features:{liveRooms}, activityId?}`. `state`: lobby playing reveal closed removed; `round`/`kind`/`deadline` are null in the lobby; `phase` is `'turn'` while the timer runs and `'passing'` before `roundStartAt` (1 s head start) and from the deadline on. In the lobby `seats` has 10 entries (`filled` = joined, `quiet` = silent > 60 s); in a game it has `n`. **`assignment`** (only while `playing`, after `roundStartAt`, while the caller's slot is unresolved): round 0 `{chainNo, roll:{rollId, prompts:[{id,text}], rerollLeft}}`; rounds >= 1 `{chainNo, source}` (a Source: only the previous output of THIS chain; a source with `canReport:true` also carries `reportRef`, see `report`). **`mine`** (slot resolved): `{kind:'prompt', text, custom}` | `{kind:'draw', strokes}` | `{kind:'describe', text}` | `{kind:'marker', marker, text}`. Never other chains' content, never other seats' work or openids (AC 140).
**Non-member**: entry fields `{ok, roomId, member:false, state, joined, minPlayers, maxPlayers, entryState, serverNow, otherRoomId?, restrictedUntil?}` with `entryState` one of joinable full started teaser wrongGroup closed removed inOtherRoom restricted rulesRequired ugcPaused capReached (a `wrongGroup` entry has `state` and `joined` null: nothing leaks).
Errors: `ROOM_NOT_FOUND`.

### submitRoomStep  (client, 15 s)
In `{roomId, round, rollId?, promptId?, customText?, text?, strokes?, auto: boolean, empty: boolean, clientMs}`. Round 0: exactly one of (`rollId` + `promptId`) or `customText`; a forced send may carry the selected `promptId` (+`rollId`) and/or an unsent `customText`: a custom text that fails (rejected / blocked / busy) falls back to the selected rolled prompt, else the first (AC 120). Draw rounds (odd): `strokes`; describe rounds (even): `text`; `empty:true` only with `auto:true` (also implied by 0 strokes / fewer than 2 valid characters at a forced send). Out `{ok, state:'sent'|'marker', round, slot:{state}, serverNow, advanced, marker?, failed?:'blocked'|'busy'}`. Acceptance: the function must start at or before `deadline + graceSec` (else `ROUND_OVER`); the slot is `received` while the check runs, then `sent`; the last resolved slot advances the round in the same transaction. A resolved slot answers `ALREADY_SENT` (+`slot`); a double tap or retry is harmless. Not auto + failed check: error with `slot:{state:'blocked'}` and the work may be fixed and resent until the deadline. Auto + failed check: `state:'marker'`, `marker:'notDelivered'`. The daily turn cap is not applied (a game in progress is finished); markers count for neither the cap nor the streak. Errors: `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `BAD_REQUEST`, `UGC_PAUSED`, `ROUND_OVER`, `ALREADY_SENT`, `ROOM_CLOSED`, `INVALID_STROKES`, `TEXT_REJECTED`, `TEXT_BLOCKED`, `IMAGE_BLOCKED`, `MODERATION_BUSY`.

### roomTick  (client, 8 s)
In `{roomId}`. Out the room view. Advances the room if it is due (all active seats resolved, or `deadline + grace` passed with no slot `received` for less than 8 s) and returns it; idempotent and race-safe (exactly one advance however many callers). Members only (`NOT_IN_ROOM`).

### getRoomReveal  (client, 5 s)
In `{roomId}`. Out for members `{ok, roomId, n, rounds, cards:[{chainNo, chainId, mineStarted, finalKind:'draw'|'describe'|'marker', finalText?, finalMarker?, placeholder?:'reported'|'deleted'|'paused'}], rematchRoomId?, serverNow}`: ONLY the final step of each chain (a final drawing is fetched with `getReveal({chainId})`). Non-members: `{ok:false, code:'NOT_MEMBER', teaser:{roomId, n, rounds, paused, lines:[{from, to|null}]}}` (`to:null` = 「起点」→（一幅画）). Not over yet: `BAD_REQUEST` +`state`; closed/removed: `ROOM_CLOSED` +`state`. Errors: `ROOM_NOT_FOUND`.

### rematch  (client, 5 s)
In `{roomId}` (a revealed room, member). Out the room view of the ONE new room (+`created`): the first caller creates it (same group; counts as a create) and records `rematchRoomId` on the old room in the same transaction; every later caller joins it (counts as a join). The old room's signals are bumped (`rematchRoomId`). Errors: `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `BAD_REQUEST`, `LIVE_OFF`, `IN_OTHER_ROOM`, `ROOM_LIMIT`, `JOIN_LIMIT`, `ROOM_FULL`, `STEP_LIMIT`.

### onMediaCheck  (server, 5 s)
Push event `wxa_media_check` (async fallback only); never callable by a client (`FORBIDDEN`). Returns `success`.

### modSweeper  (server, 60 s, timer `0 */5 * * * * *`)
Async-fallback verdicts and timeouts, 慢慢传 expiry and reveal, reveal notices (quiet hours 22:00-08:00 BJT), card retries, circuit breaker, quota and report-age `[ALERT]`s. Client call or a call without `{Type:'Timer'}` -> `FORBIDDEN`. Live chains are skipped.

### roomSweeper  (server, 60 s, timer `0 */1 * * * * *`)
Advances rounds overdue by more than 10 s past `deadline + grace`; finishes games 20 minutes after the start (`gameMaxMin`) and, at once, when `createEnabled` is false or `imageMode` is `async` (every remaining slot becomes a marker, the room reveals); closes lobbies idle for `lobbyIdleMin` (30 min) and all lobbies when the switches are off; materialises reveals; deletes signals 1 day after the end and closed lobbies after 1 day; rewrites stale signals. Same trigger rules as `modSweeper`.

### getReveal  (client, 5 s)
In `{chainId}`. Out for participants (慢慢传: starter + authors of passed 棒; live: every member seated at the start): `{ok, serverNow, chainId, mode:'chain'|'live', state:'revealed', reason, early, length, passed, participantCount, durationMs, prompt:{text, custom, mine, canReport}, steps:[{n, kind, strokes?|text?, marker?, mine, placeholder, laughs, myLaugh, canReport, canLaugh}], roomId?, chainNo?, chainCount?, mineStarted?}`. The 起点 is `prompt`; `steps` are 棒 1..length in order (a marker step has `marker` and its copy in `text`, no report, no 笑). Non-participants: `{ok:false, code:'NOT_PARTICIPANT', teaser:{chainId, promptText, finalText, passed, paused}}`. Errors: `CHAIN_NOT_FOUND`, `CHAIN_CLOSED`, `NOT_PARTICIPANT`.

### revealNow  (client, 5 s)
In `{chainId}`. 慢慢传 only. Errors: `CHAIN_CLOSED`, `NOT_STARTER`, `TOO_EARLY` (+`busy`).

### laugh  (client, 5 s)
In `{chainId, step}`. Out `{ok, laughs, mine}` (toggle; participants of a revealed chain; not on markers: `BAD_REQUEST`). Errors: `CHAIN_NOT_FOUND`, `CHAIN_CLOSED`, `NOT_PARTICIPANT`, `BAD_REQUEST`.

### report  (client, 5 s)
In `{chainId, step, reason}`, or for a live source `{roomId, reportRef, reason}`; `step` 0 = the 起点 / teaser texts. Out `{ok, hidden:true, reopened, claimReleased}`. Hides at once. 慢慢传 as before. **Live round** (TD-140): the member's `getRoom` `assignment.source.reportRef` (present only when `canReport`) is an opaque token, a hash of room id, chain id, round and seat (`q` + base36, no chain id, step or author in it; the client never sees a live chain id before the reveal). `report {roomId, reportRef, reason}` recomputes the ref for the CALLER'S OWN seat; the chain and step come from that seat, never from the client. Refusals: not seated -> `NOT_MEMBER` (a non-member also gets no source in `getRoom`, so the teaser has no 举报, only the platform-complaint hint), room not playing -> `ROUND_OVER`, bad shape / another seat's ref / a ref of an earlier round -> `BAD_REQUEST`, unknown room -> `ROOM_NOT_FOUND`. Same rules as a chain report: hidden for everyone at once (`steps.state=hidden, hiddenReason=report`, or the whole chain for a custom prompt), one per reporter per item (`DUP_REPORT`), counts toward the 10-per-day limit (`REPORT_LIMIT`) and the 10-per-minute rate limit, strikes come from `admin upholdReport` as for any report. A live chain never reopens (`reopened:false`): the room keeps running, the reporter's source becomes the `hidden` Source (free play), a step already drawn from stays in the chain and the reveal shows the `reported` placeholder. The older form: the seat that works on the chain right now may report the source it was handed with `{chainId, step}` (`step` = the previous round's step, or 0 for a custom prompt = hides the whole chain); the reporter keeps the turn and timer, their source becomes a `hidden` Source. A marker or a rolled prompt cannot be reported (`BAD_REQUEST`). One report per player per item (`DUP_REPORT`). Errors: `CHAIN_NOT_FOUND`, `BAD_REQUEST`, `REPORT_LIMIT`, `OWN_STEP`, `DUP_REPORT`, `NOT_PARTICIPANT`, `NOT_MEMBER`, `CHAIN_CLOSED`.

### getMyChains  (client, 5 s)
In `{cursor?}` -> `{ok, items, cursor, streak, unseenReveals}` where an item is a chain item (`kind:'chain'`, `core/views#albumItem`) or a room item (`kind:'room', roomId, status:'lobby'|'playing'|'revealed'|'removed'|'closed', n, rounds, round, lastActivityAt, revealedAt, unseen, left`); live chains appear only as their room. In `{chainId}` -> `{ok, item, mine:[...]}` (own 棒 only; markers have `marker`, `canDelete:false`).

### getGroupChains  (client, 5 s)
In `{groupRef}`. Out `{ok, serverNow, stats:{started, revealed, drawings, rooms}, rooms:[{kind:'room', roomId, state:'lobby'|'playing', joined?, round?, rounds?, joinable, member}], waiting, inProgress, revealed:[{kind:'chain', chainId, participant, promptText, finalText, revealedAt} | {kind:'room', roomId, n, member, revealedAt}]}`. Aggregates only, no per-person data. With `ugc.viewEnabled: false` a revealed chain row has `promptText: null, finalText: null, paused: true` (AC 54). Errors: `NOT_MEMBER`.

### deleteMyStep  (client, 10 s)
In `{chainId, step}` or `{all:true}`. Out `{ok, count}`. Not for markers and not for a step of a room still playing (`BAD_REQUEST` for the single form).

### subscribeReveal  (client, 5 s)
In `{chainId}`. 慢慢传 only. Errors: `NO_TEMPLATE`, `CHAIN_NOT_FOUND`, `NOT_PARTICIPANT`.

### grantReward  (client, 5 s)
In `{kind:'start'|'palette', noFill}`. Out `{ok, startsLeft?, adStartsLeft?, paletteToday?}`. Errors: `BAD_REQUEST`, `REWARD_LIMIT`.

### admin  (console only, 20 s)
In `{op, ...}`; ops `listReports getStep sample upholdReport dismissReport hideStep restoreStep removeChain removeRoom restrict liftRestriction setUgc setModeration`. `removeRoom {roomId}`: every chain of the room becomes `removed`, a room in play is ended. `setModeration {imageMode?: 'sync'|'async', textApi?: 'game'|'general'}`: `async` finishes rooms in play and closes lobbies at once. `sample {n, kind?, mode?: 'live'|'chain'}`. Every op writes `audit_log`. A client OPENID not in `ADMIN_OPENIDS` -> `FORBIDDEN`. The only function that returns an openid, a strike count or a temp PNG URL.

### track  (client, 5 s)
In `{events:[{name, props, sessionId, clientTs}]}`. Out `{ok}`. `core/analytics.js#sanitizeEvents` allowlists the spec 14 events and props.

### cleanup  (server, 120 s, timer `0 0 4 * * * *`)
Deletes after 180 days: rooms, chains, steps, storage PNGs, mod_traces, mod_log, reports, reactions, sub_grants, audit_log, events, rate_limits; inactive players / group_members / group_stats; abandoned chains after 1 day. `daily_stats` kept. Idempotent.

## 6. Error code reference

Authoritative list with player copy: `game/core/codes.js`. Server codes: UNAUTHENTICATED FORBIDDEN RATE_LIMITED NOT_MEMBER NOT_GROUP BAD_CLOUDID SERVER_CONFIG INTERNAL BUSY_RETRY RULES_REQUIRED RESTRICTED UGC_PAUSED UGC_BUSY START_LIMIT STEP_LIMIT CLAIM_LIMIT REPORT_LIMIT REWARD_LIMIT ROOM_NOT_FOUND ROOM_STARTED ROOM_FULL ROOM_CLOSED NOT_IN_ROOM NOT_HOST NOT_ENOUGH_PLAYERS IN_OTHER_ROOM IN_ROOM IN_CLAIM ROUND_OVER ALREADY_SENT REROLL_LIMIT ROOM_LIMIT JOIN_LIMIT LIVE_OFF CHAIN_NOT_FOUND CHAIN_CLOSED TAKEN PENDING PREV_MINE CAP_REACHED NEED_GROUP WRONG_GROUP CLAIM_LOST INVALID_STROKES TEXT_REJECTED TEXT_BLOCKED IMAGE_BLOCKED MODERATION_BUSY BAD_REQUEST NOT_PARTICIPANT NOT_STARTER TOO_EARLY DUP_REPORT OWN_STEP NO_TEMPLATE. Client-only codes (never from the server): TIMEOUT NETWORK BAD_RESPONSE.
