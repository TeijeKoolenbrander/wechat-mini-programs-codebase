# core/ contracts (传画接龙)

Pure CommonJS shared by the client, the mock server and the cloud functions (backend copies this folder into each function with `scripts/sync-core.js`). Rules: no `wx`, no DOM, no Node built-ins, relative `require`s of `.js` files only (WeChat mini games can only load `.js`; `tests/wechat-compat.test.js` enforces it for everything that ships). The PNG encoder takes an *injected* `deflate` so Node's `zlib` stays on the server side.

Spec references: `docs/chuanhua/spec.md` (PO-n ids in `decisions.md`).

## Files and exports

| File | Exports |
|---|---|
| `config.js` | `CONFIG` (all constants: chain 6/4/3/48 h/150 s, timers 60/45, text 2-12 and 2-16, stroke limits, 12-colour palette, brush sizes, raster 512, allowances, moderation timings and mock triggers, strike ladder, daily, ads caps), `withRemote(appConfig)` (clamped overrides of timers and interstitial caps), `HOUR`, `DAY` |
| `rng.js`, `date.js` | copied from 点将台: `mulberry32`, `hash32`, `shuffle`, ...; `beijingDateKey(ms)` (explicit UTC+8, TZ independent), `addDays`, `daysBetween`, `dateKeyToMs`, ... |
| `strokes.js` | the stroke format (below): `emptyDrawing`, `makeStroke(c,w,points)`, `strokePoints(stroke)`, `pointCount`, `validate(drawing) -> {ok,points,strokes}\|{ok:false,code:'INVALID_STROKES',reason}`, `jsonBytes`, `encode(drawing) -> string`, `decode(string) -> drawing\|null`, `equal` |
| `raster.js` | `rasterize(drawing, {size=512}) -> {width,height,data: Uint8Array RGB}`, `hashRaster(r) -> uint32`, `coverageStats(r)` |
| `png.js` | `encodePng(raster, {deflate?}) -> Uint8Array`, `crc32`, `adler32`, `zlibStored` |
| `text.js` | `countCp`, `sanitize(str, maxCp)`, `check(str, 'prompt'\|'desc') -> {ok,text}\|{ok:false,code:'TEXT_REJECTED',reason,message}`, `matchContact`, `matchBlocklist`, `fold` |
| `content/prompts.v1.js` | `{promptsVersion, categories[12], prompts[423]: {id:'A01', text, cat:'A', retired?}}` |
| `content/blocklist.v1.js` | `{blocklistVersion, categories: {politics, sexual, abuse, drugs, gambling, violence, slurs, ads: string[]}}` (starter list, content owner reviews: Handoff H13) |
| `prompts.js` | `PROMPTS`, `CATEGORIES`, `byId`, `active`, `batch(rng, excludeIds, n=3)` (换一批) |
| `daily.js` | `dailyIds(dateKey[, launchKey])`, `daily(dateKey[, launchKey]) -> [{id,text}]` (3 per Beijing day, 141-day no-repeat cycle) |
| `chain.js` | the chain rules and state machine (below) |
| `players.js` | `freshPlayer`, `dayOf(player,dateKey)`, `startsLeft`, `adStartsLeft`, `addStrike` (ladder: 1 warn, 2 -> 24 h, 3 -> 7 d, >=4 -> 30 d + admin review), `restrictionOf`, `untilText`, `touchStreak`, `streakDays`, `streakText` |

## Stroke format (`strokes.js`, PO-10/PO-11)

```js
{ v: 1, s: [ [c, w, x0, y0, dx1, dy1, dx2, dy2, ...], ... ] }
```
`c` colour index 0-11 (0-5 base, 6-11 今日彩笔), `w` size 0-2 (8/18/36 grid units), `(x0,y0)` absolute on the 1024 x 1024 grid, then integer deltas. A stroke with no deltas is a dot.
Limits (`validate`, server-side `INVALID_STROKES`; the client enforces the same): <= 200 strokes, <= 4,000 points in total, <= 600 points per stroke, every decoded coordinate in 0-1023, colour <= 11, size <= 2, `JSON.stringify` <= 32 KB. `reason`: `shape version stroke_count point_count stroke_short stroke_odd stroke_points colour size int range bytes`.

**Wire format** is the JSON object above (`submitStep.strokes`). **Compact string** (`encode`/`decode`, local draft persistence and optional storage): 6 bits/char URL-safe alphabet, varints of 5 data bits + continuation bit, zigzag deltas; layout `version, strokeCount, then per stroke [c*3+w, pointCount, x0, y0, (dx,dy)*]`. Round-trips exactly; `decode` returns `null` for anything malformed or over the limits.

## Rasteriser (`raster.js` + `png.js`, spec 5.4)

Deterministic, pure JS: `rasterize(strokes)` gives a 512 x 512 RGB raster (white background, widths x0.5, round caps and joins, per-stroke distance-based anti-aliasing quantised to 0-255, integer compositing, only `+ - * /` and `Math.sqrt`), so the output is bit-identical on any engine; the tests pin golden hashes. Backend:

```js
const { rasterize } = require('./core/raster'); const { encodePng } = require('./core/png');
const png = Buffer.from(encodePng(rasterize(strokes), { deflate: (b) => require('zlib').deflateSync(b) })); // ~10-40 KB
```
Without `deflate` the PNG uses stored blocks (~786 KB, valid, no zlib). Measured in `tests/`: rasterising 4,000 points at 512 px takes well under a second in Node (V10 in the spec must still be measured in the real cloud function).
The client renderer (frontend-ui `js/render/strokes.js`) draws the same geometry; AC 27 compares it with `rasterize` pixel by pixel.

## Chain rules (`chain.js`)

Chain document and states: see the header of `chain.js`. All mutators take `now` explicitly and return `{ok:true,...}` or `{ok:false, code}` without touching the doc on failure. Terminal states (`revealed expired removed abandoned`) never reopen.

| Function | Purpose |
|---|---|
| `kindOfStep(n)` | odd `'draw'`, even `'describe'` |
| `newChain({id, starter, promptId, promptText, custom, openGId, claimId, now, dateKey})` | state `starting`, starter holds the 第 1 棒 claim (PO-2) |
| `canClaim(chain, ctx)` / `claim(chain, ctx)` | eligibility (spec 3.4), codes in check order: `CHAIN_NOT_FOUND CHAIN_CLOSED RULES_REQUIRED RESTRICTED UGC_PAUSED` -> (resume if you hold the active claim) -> `PENDING TAKEN PREV_MINE CAP_REACHED NEED_GROUP WRONG_GROUP STEP_LIMIT CLAIM_LIMIT`. `ctx`: `openid now rulesVersion restrictedUntil permanent ugc{createEnabled,autoPausedUntil} isMember hasGroupContext stepsToday claimsOnChainToday claimId groupId` |
| `release(chain, openid, claimId, now)` | drops the claim; releasing a `starting` chain abandons it |
| `checkSubmit(chain, {openid, claimId, kind, now})` | claim ownership, step kind (`BAD_KIND`), lazy expiry: a claim past its 150 s TTL still works while nobody else claimed (`late:true`), else `CLAIM_LOST` |
| `markPending` / `passStep` / `dropPending` | drawing to review (counts toward the 3 cap) / step passed (a passing 第 6 棒 reveals with reason `complete`) / blocked or void (reopens, stops counting) |
| `canRevealNow` / `revealNow(chain, openid, now)` | starter only (`NOT_STARTER`), >= 4 passed (`TOO_EARLY`), no pending (`PENDING`) or live claim (`TAKEN`) |
| `reopenStep(chain, step, now)` | report/author delete of the latest passed 棒: reopens it, returns `cancelledClaim`, `voidedPending` |
| `sweep(chain, now)` | `{event: null\|'abandoned'\|'revealed'\|'expired'\|'wait'}`: 48 h expiry waits for a live claim/pending, then >= 4 passed reveals (`expiry`) else `expired`; a `starting` chain whose claim expired 5 min ago is abandoned |
| `entryState(chain, viewer)` | the spec 8.7 state for a viewer, content-free |
| `turnTimer(kind, startedAt, now, cfg)` -> `{secLeft, warn, over, total}`, `timeUpAction(kind, {strokes, chars})` -> `'submit'\|'release'`, `mmss` | the 60/45 s wall-clock timer and the time-up rule |

Resolved where the spec was silent: a racing `revealNow` against a live claim returns `TAKEN` and against a pending drawing `PENDING` (copy "有群友正在接，稍后再揭晓"); `abandoned` is set by `release` immediately or by `sweep` 5 minutes after the 第 1 棒 claim expired, so a slightly late starter still submits; a hidden/deleted latest 棒 reopens as `open` (never `starting`).

## Client <-> cloud function shapes (reconciled with the backend)

The client, the mock server (`js/mock-server.js`) and the cloud functions agree on these; `tests/client-contract.test.js` runs the same flows against the real functions and the mock and fails on any difference in error code or response shape. Decisions and deviations from the spec: `js/CONTRACT.md` "Reconciled decisions".

Every call resolves to `{ok:true,...}` or `{ok:false, code, message?}`. Malformed input is `BAD_INPUT`.

- `getHome` -> `{dateKey, serverNow, daily:{prompts:[{id,text,count?}], counts:{[promptId]:n (>= 30 only)}}, me:{rulesVersion, rulesCurrent, restriction:{until,permanent}|null, warnPending, startsLeft, adStartsLeft, paletteToday, streak, unseenReveals, lifetimeReveals}, features:{subscribe:{tmplId}|null, updatableCard, banner:{enabled,adUnitId}, interstitial:{enabled,minLifetimeReveals,minGapSec,maxPerDay}}, ugc:{createEnabled,viewEnabled}, timers?}`; `warnPending` stays true until `ackWarning`/`agreeRules`.
- `ackWarning` -> `{}` (idempotent; clears `warnPending` only). `agreeRules({version})` -> `{}`; `joinGroup({groupData:{cloudID,data:{opengid,chat_type}}})` -> `{groupRef}`.
- `createChain({promptId|customText, groupRef?})` -> `{chainId, bound, claim:{claimId, step:1, kind:'draw', expiresAt, sourceText}}`
- `getChain({chainId, groupRef?, wantActivity?})` -> `{state, code?, until?, passed, length, nextStep, nextKind, isParticipant, isStarter, canRevealNow, canSameAgain, expiresAt, timeLeftMs, takenEtaSec?, subscribed?, rulesRequired?, serverNow, activityId?}`; never any prompt, text or strokes (AC 10). `state` is `core/chain.js#entryState`: claimable taken pending prevMine capReached wrongGroup revealedParticipant revealedTeaser expired removed notFound restricted rulesRequired ugcPaused; limits are `capReached` with `code`. While the latest 棒 is under review `nextStep` is that 棒. `canSameAgain`: revealed chains; expired chains only for the starter.
- `claimStep({chainId, groupRef?})` -> `{claimId, step, kind, expiresAt, serverNow, resumed, timerSec, canReport, prev:{kind:'text',text}|{kind:'draw',strokes}|{kind:'paused'}}`; with viewing off `{claimId:null, placeholder:'paused', prev:{kind:'paused'}}`, no lock. `releaseClaim` -> `{released}` (idempotent).
- `submitStep` -> `{state:'passed'|'pending', step, chainState, revealed}`; errors `TEXT_REJECTED TEXT_BLOCKED MODERATION_BUSY CLAIM_LOST INVALID_STROKES BAD_KIND STEP_LIMIT RESTRICTED UGC_PAUSED UGC_BUSY RULES_REQUIRED`
- `getReveal({chainId})` -> `{state:'ready'|'paused', chainId, promptId|null (preset prompts only), promptText, custom, passed, early, participantCount, durationMs, canSameAgain, steps:[{n, kind, text?, strokes?, mine, placeholder:null|'reported'|'deleted'|'paused', laughs, myLaugh, canReport}], nationalCount}`; members of the chain's group who did not take part get `{ok:false, code:'NOT_PARTICIPANT', teaser:{promptId|null, promptText, finalText, passed, canSameAgain, paused}}`; everyone else `NOT_MEMBER`; `CHAIN_REMOVED`, `CHAIN_HIDDEN`, `NOT_REVEALED`, `CHAIN_NOT_FOUND`.
- `getMyChains({cursor?})` -> `{items:[{chainId, status, passed, length, mySteps:[n], blockedStep|null, at, unseen, promptText|null, promptId|null}], cursor:number|null, streak}`; `getMyChains({chainId})` -> `{items:[{...same, mine:[{n, kind, modState:'pending'|'passed'|'blocked'|'void'|'hidden'|'deleted', strokes?, text?, canDelete}]}]}` (own 棒 only; `CHAIN_NOT_FOUND` if not involved). The prompt fields are set only for a revealed chain the caller took part in and an expired chain the caller started.
- `getGroupChains({groupRef})` -> `{stats:{revealed, drawings, started}, waiting:[{chainId, nextStep, nextKind, passed, length}], inProgress:[{..., why}], revealed:[{chainId, participant, passed, promptText, finalText}], ugc:{createEnabled,viewEnabled}}`; `NOT_MEMBER` for a groupRef the caller is not in.
- `report({chainId, step 0-6, reason}) ` -> `{hidden:true, reopened, releasedOwnClaim}`; errors `DUP_REPORT REPORT_LIMIT OWN_STEP NOT_PARTICIPANT CHAIN_CLOSED`.
- `laugh` -> `{laughs, mine}`; `revealNow` -> `{}` (`TOO_EARLY PENDING TAKEN NOT_STARTER`); `deleteMyStep({chainId, step}|{all:true})` -> `{count, more?}` (`FORBIDDEN` for someone else's step); `grantReward({kind:'start'|'palette', noFill})` -> `{startsLeft, adStartsLeft, paletteToday}` (`REWARD_LIMIT`); `subscribeReveal` -> `{}` (`NO_TEMPLATE`); `track({sessionId, events})` -> `{accepted}`.
