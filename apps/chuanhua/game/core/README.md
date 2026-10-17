# core/ contracts (传画接龙)

Pure JS (CommonJS), no `wx`, no DOM, no clock (time is always a parameter), relative `.js` requires only (WeChat cannot require `.json`; tests/wechat-compat.test.js enforces it). The backend copies this folder into every cloud function (`cloudfunctions/scripts/sync-core.js`), so the client, the mock server and the real functions run the same rules. Spec: `docs/chuanhua/spec.md`; cloud contract: `cloudfunctions/CONTRACT.md`; render contract: `js/render/CONTRACT.md`.

| File | What it owns | Key exports |
|---|---|---|
| `config.js` | every constant (6 棒, 3 per person, claim 150 s, timers 60/45, rooms 3-10 / 30-60-45 s / grace 5 s / 20 min, strokes v2 limits, allowances 80 turns + 10/30 rooms, moderation timings and modes, strike ladder) and remote-config clamping (`app_config.room / rt / moderation / features.liveRooms`) | `CONFIG`, `getConfig()`, `applyRemote(doc)`, `ugcCreateAllowed(ugc, now)` |
| `codes.js` | error codes with player copy | `CODES`, `textFor(code)`, `SERVER_CODES` |
| `date.js`, `rng.js` | Beijing date keys (explicit UTC+8), mulberry32 (copied from 点将台) | `beijingDateKey`, `addDays`, `daysBetween`, `mulberry32`, `hash32`, `shuffle` |
| `content/prompts.v2.js` (+ `prompts.v1.js`), `prompts.js` | the prompt bank (v2: 2,042 active + retired, v1 ids kept). **SERVER-ONLY (TD-103)**: copied only into the `bank` functions and stripped from a release client | `getPrompts(v)` (`list`, `active`, `byId`, `byCat`), `promptById(id)` |
| `content/blocklist.v1.js`, `text.js` | local blocklist; input filter, contact/number/URL patterns, validation | `inputFilter`, `sanitize`, `validate(raw, 'prompt'\|'describe')`, `validCharCount`, `contactHit`, `blocklistHit` |
| `roll.js` | the roll: 3 prompts from 3 categories, no repeat within the last 300 shown, room-disjoint, up to 5 换一批 per pick, ring buffer | `rollThree`, `reroll`, `rollRoom`, `pushSeen`, `pickValid`, `rollId` |
| `room.js` | the live-room state machine: lobby, start, R = min(n-1, 4), rotation (seat (c+r) mod n), slots, deadlines + grace + in-flight guard, early end, leave / disconnect markers, 20-minute cap, views (member, entry, reveal cards, teaser), materialisation plan | `newRoom`, `join`, `leaveLobby`, `start`, `sendGate`, `markReceived`, `resolveSent`, `resolveMarker`, `reopenSlot`, `leavePlaying`, `decide`, `advance`, `finish`, `sourceFor`, `memberView`, `entryView`, `revealCards`, `teaserLines`, `materializePlan`, `rotationTable` |
| `strokes.js` | wire format v2 `{v:2, h, s}` (h 768-2048, grid 1024 x h; v1 decodes as h = 1024), validation, limits, canonical geometry, replay maths, layout helpers (`gridHeight`, `canvasFit`, `containFit`), drawing-tool recorder | `validate`, `fromAbsolute(abs, h)`, `toAbsolute`, `toPolylines`, `replayPolylines`, `createRecorder({h})`, `gridHeight`, `canvasFit`, `containFit`, `heightOf`, `COLORS`, `SIZES`, `REPLAY_MS` |
| `raster.js` | strokes -> 512 x round(512 h / 1024) RGB raster (server moderation image); pure JS | `rasterize(drawing, {size})`, `diffRatio` |
| `chain.js` | the 慢慢传 chain state machine: claim, submit checks (incl. forced-send markers), pending/verdict (async fallback), reopen, reveal, expiry sweep; live-room chains (`newLiveChain`) | `canClaim`, `applyClaim`, `releaseClaim`, `checkSubmit`, `passText`, `passMarker`, `reopenAfterForced`, `beginPending`, `resolvePending`, `reopenLatest`, `canRevealNow`, `sweepChain`, `newChain`, `newLiveChain` |
| `allowance.js` | daily allowances (3+2 starts, 80 turns, 10 rooms created, 30 joined, claims, reports), rewards, streak | `startsLeft`, `checkStart/consumeStart`, `consumeStep`, `checkRoomCreate/consumeRoomCreate/refundRoomCreate`, `checkRoomJoin/consumeRoomJoin`, `roomsLeft`, `grantReward`, `advanceStreak` |
| `strikes.js` | strike ladder, restrictions, restriction copy | `applyStrike`, `restrictionOf`, `restrict`, `restrictionText` |
| `moderation.js` | pure moderation decisions: verdicts, sync image/text parameters, mock verdicts (13 risky / 15 timeout), 750031 / quota codes, sweeper plans (async fallback), env gate, quota, breaker | `verdictOf`, `syncImageParams`, `gameTextParams`, `mockImageSync`, `isNotSupported`, `imageModeOf`, `planVerdict`, `resolveEnv`, `quotaLevel`, `breakerDecision` |
| `notice.js` | reveal-notice quiet hours | `noticeSendTime` |
| `views.js` | server response builders (entry, previous 棒, reveal, teaser, group rows, album) | `entryView`, `claimPrev`, `revealResponse`, `teaserView`, `groupRow`, `albumItem` |
| `copy.js` | pre-formatted strings for view models; the marker copy (`MARKERS`, `markerHint`) | `MARKERS`, `markerText`, `markerHint`, `emptyMarkerFor`, `entryCopy`, `revealHeader`, ... |
| `analytics.js` | event whitelist and sanitising | `sanitizeEvents` |
| `schema.js` | collections (+ `chuanhua_` prefix, indexes, the `room_signals` rule), function table (callers, timeouts, openapi, `bank`), env vars, admin ops | `COLLECTIONS`, `collectionName`, `FUNCTIONS`, `UGC_FUNCTIONS`, `BANK_FILES`, `signalId`, `denyAllRules` |

Rules of use: transitions are functions from a document to a NEW document (inputs are never mutated); every function in `chain.js`, `allowance.js` and `strikes.js` takes `now`/`dateKey` explicitly; the server passes ITS time, the client never decides anything the server re-checks.

Tests: `npm test` in `apps/chuanhua/game` (node test runner). The AC numbers are in the test names.
