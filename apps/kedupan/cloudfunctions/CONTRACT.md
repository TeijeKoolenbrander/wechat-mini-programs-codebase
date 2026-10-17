# Cloud functions contract (backend <-> minigame-dev), v1

Spec: `docs/kedupan/spec.md` §3, §5, §8, §11, §13, §17. Decisions: `docs/kedupan/decisions.md` (TD-n are cited below where this contract fixes something the spec left open).
Owners: **backend** implements the functions and collections; **minigame-dev** owns `game/core` (all rules) and `game/js/mock-server.js`, which is the executable mirror of this document (`game/tests/*-flow.test.js`, `archive-groups.test.js` run every flow below against it).

**The rule that keeps client, mock and cloud identical:** every decision and every response is built by `game/core` (`service.js`, `score.js`, `group.js`, `rounds.js`, `windows.js`, `streak.js`, `adpolicy.js`, `schedule.js`, `input.js`). A cloud function only (1) authenticates, (2) validates with `core/input.js`, (3) reads documents, (4) calls the core, (5) writes inside the transaction the core result requires, (6) returns the core's response. If a function needs a rule the core does not have, add it to the core (with a test), never to the function. `common/coreapi.js` is the only file that requires `../core`. `core` is copied into each function by `scripts/sync-core.js` (`npm run sync`; `npm run check` is the drift check; `tests/core-sync.test.js` proves copies score identically, AC 7).

## 1. Conventions (every function)

- Identity: `cloud.getWXContext().OPENID` only, read in `common/store.js` `handler()`; no `openid` field in any `event` is ever trusted (AC 68). Timer functions use `handler(fn, {auth:false, serverOnly:true})`: a call that carries an OPENID returns `FORBIDDEN` (AC 23), and so does a call WITHOUT the timer trigger marker (`event.Type === 'Timer'` AND a non-empty `event.TriggerName` of at most 128 characters, both of which the platform sends on every firing; a console test run sends `{"Type":"Timer","TriggerName":"manual"}`, L3). The marker is defence in depth; the controls are the console settings in README step 5b (anonymous/web login and HTTP access disabled).
- Envelope: `{ok:true, ...}` or `{ok:false, code, message, ...extra}`; never throws to the client. `code` is one of `core/errors.js` `SERVER_CODES` (spec §11.3 plus `NO_CARD_AVAILABLE`, TD-9). The client adds `TIMEOUT`, `NETWORK`, `BAD_RESPONSE` itself (`js/api.js`).
- Validation: `core/input.js` `V.<function>(event)` returns `{ok:true, v}` or `{ok:false, code:'INVALID_INPUT'}`. Unknown fields are dropped. Positions are integers 0..100.
- Time: server clock only (`Date.now()` in `common/util.js now()`); date keys via `core/date.js` (`coreapi.dateKeyAt`). Every `function.config.json` sets `"envVariables": {"TZ": "Asia/Shanghai"}` and an explicit `timeout` (AC 22). Nothing depends on TZ.
- Raw openids, openGIds and `groupRef` never appear in a response or an event (AC 49). Board rows carry only `h = rowHash(openid, salt)` = `sha256hex(openid + '|' + salt).slice(0,12)` (`common/util.js rowHash`; the open data domain recomputes it with `opendata/sha256.js`).
- Uniqueness by deterministic `_id` + `addIfAbsent`; multi-document writes in `db.runTransaction`; counters with `db.command.inc` (histograms: update path `hist.<pos>`; the five `daily_card_stats` docs are created with 101 zeros so the dotted path exists). All collections deny-all for clients (`database/rules.json`, AC 68), and cloud storage is deny-all (`storage/rules.json`, L3).
- **Per-minute call limits (M3, TD-63).** EVERY client-callable function is wrapped by `store.handler(fn, { rate: rateOf('<name>') })`: after identity and before any work it charges one unit of `store.rateLimit(openid, 'fn_<name>', 1, limit)` (fixed 1-minute window, doc `rate_limits/fn_<name>_<openid>_<minute>`). Limits live in `core/config.js CONFIG.limits.perMinute`, shared with the mock: reads 60 (`getDaily getArchive getArchiveDay getRound`), heavy readers lower (`getGroupDay 30`, `getFriendBoard 30`: one board per call; `getBonusCard 10`: a 60-set scan per call, charged BEFORE the scan; `unlockDistribution 20`), writes 20 (`submitGuess createRound setClue revealRound subscribeRound joinGroup`; `submitCard 30`: five cards plus retries; `reportCard 10`), `track 30` calls (plus 300 events); **D-2:** `agreeRules 20`, `reportClue 10`, and `admin 60` (for an allow-listed openid only; the console carries none and is not limited). A refusal is `{ok:false, code:'RATE_LIMITED', scope:'minute'}`; the per-day limits answer `scope:'day'`. The client treats `scope:'minute'` as "try again shortly" (generic copy, no daily allowance consumed locally). Caps: `CONFIG.caps.guessesShown = 500` late guesses per reveal view (on-time guesses are never cut); `board_list` server events are written for 1 request in `CONFIG.caps.boardEventEvery = 10` and carry `every`.
- Per-day limits use `store.dayLimit(openid, bucket, limit, dateKey)` (doc `rate_limits/<bucket>_<openid>_<dateKey>`); per-minute limits use `store.rateLimit`.
- Content (TD-62): `coreapi.content()` = `core/content.js getServerContent` = the client text library `spectra.v1.js` merged with the SERVER-ONLY answer key `anchors.v1.js` (anchor + tags per item); `SERVER_CONFIG` if either is missing or they disagree. `schedule.v1.js` is server-only too. Neither file is in the client release package (`project.config.json packOptions.ignore`, release mode only; the dev state keeps them loadable for the DevTools mock, TD-68); `sync-core` copies them into the functions. The server copy of a day's text is `daily_sets.cards` / `rounds.left,right,clueText`, never the client's library (AC 11).
- Caches (per instance, 60 s): group member lists and friend lists only. The caller's own row is always fresh. Ranks are always server data.

## 2. Collections

**Shared test environment (founder instruction).** The test AppID `wxcd03c1b62d7eb0e0` has one cloud environment shared by several apps. Therefore (1) **every physical collection name is prefixed with the app slug**: logical `rounds` is `kedupan_rounds` in the database, console, indexes and `database/rules.json`. The prefix lives in one place, `common/util.js` `COLLECTION_PREFIX`/`col()`, applied inside `common/store.js`; function code always passes unprefixed names to the store helpers and never writes a literal collection string to the SDK. Function names (`getDaily`, ...) are also shared across apps in one environment: deploy them with the `kedupan_` prefix too if the console requires unique names, and keep the mapping in `game/js/api.js` (`NAMES`). (2) The **environment id is a single build-config value**: `game/js/build-config.js` `cloudEnv` (empty by default, which selects the mock server; `js/main.js` passes it to `wx.cloud.init`). `project.config.json` uses `appid: wxcd03c1b62d7eb0e0`.

The table below uses logical (unprefixed) names.

All keys are written by the listed function only. `deny-all` for clients. Retention is `cleanup` (§13): 180 days unless noted.

| Collection | `_id` | Fields | Written by | Notes / indexes |
|---|---|---|---|---|
| `daily_sets` | `YYYYMMDD` | `dateKey, issueNo, contentVersion, cards[5]:{itemId,spectrumId,left,right,prompt,anchor,cat}, boardSalt (32 hex), edits[]:{ts,idx,from,to}, source:'schedule'\|'auto', createdAt, final?:number[5], finalHist?:number[101], finalCount?, finalizedAt?` | genDaily, getDaily (lazy), finalizeDay; ops (console) edits `cards`/`edits` | `anchor` never leaves the server for an open day (`core/service dailyView` omits it). Kept forever (aggregates only). Replace a card with `core/service replaceCard` semantics: same index, `edits` row, reset `daily_card_stats/<dateKey>_<idx>` to 101 zeros, `n:0` (AC 24). |
| `daily_card_stats` | `<dateKey>_<idx>` | `hist[101], n` | genDaily/getDaily (create, 5 docs), submitCard (`inc`) | Kept forever. `hist.<pos>` += 1 and `n` += 1 exactly once per first answer (AC 15). |
| `daily_entries` | `<dateKey>_<openid>` | `openid, dateKey, pos[5] (null until answered), answeredAt[5], firstAt, completeAt?, streak?, contentVersion` | submitCard (transaction) | Index `dateKey` (+ `completeAt`) for boards; `openid` for cleanup. |
| `player_stats` | `<openid>` | `curStreak, bestStreak, lastCompleteDate, totalDays, updatedAt`; **D-2 (typed clues):** `rulesVersion?, rulesAt?` (发言规则 agreed), `strikes?: [ts]` (<= 10 kept, rolling 30 d counts), `warnPending?`, `restrictedUntil?, restrictPermanent?`, `reviewFlag?`, `clueChecks?: {dateKey, n}` | submitCard (on complete, same transaction, **updates the streak fields, never replaces the document**), agreeRules, setClue (day counter, strikes), createRound / getRound (clear `warnPending`), admin (strikes, restriction) | Streak rules `core/streak.js` (TD: `onComplete(stats, dateKey, prevPublishedKey)`, `prevPublishedKey` = latest `daily_sets._id < dateKey`, read before the transaction). UGC rules `core/ugc.js`, `core/strikes.js`. A document created by a UGC write carries zeroed streak fields. Index `updatedAt`; stale documents (and their strikes and agreement) go at 180 days. |
| `group_members` | `<openGId>_<openid>` | `openGId, openid, groupRef, firstSeen, lastSeen` | joinGroup only | Indexes `groupRef`; `openid + groupRef`; `lastSeen`. |
| `group_daily` | `<groupRef>_<dateKey>` | `n, mq, divisiveIdx, computedAt` | getGroupDay (cache of closed days) | Index `computedAt`. Trend only; recomputable. |
| `rounds` | 8-char base32 | `hostOpenid, spectrumId, left, right, target, clueMode:null\|'text'\|'preset'\|'chat', clueItemId?, clueText?, salt, createdAt, status:'draft'\|'open'\|'revealed'\|'noGuesses', guessCount (ON-TIME only), groupRefs[]<=10, contentVersion, revealedAt?, revealBy?:'host'\|'count'\|'timer', mq?`; **D-2:** `clueMod?:{api:'game'\|'general'\|'mock', suggest, label, traceId, ts}` (text only), `clueHidden?, clueHiddenAt?, clueHiddenBy?:'report'\|'admin', clueUpheld?` | createRound, setClue, reportClue, admin, submitGuess, revealRound, sweepRounds, getRound (lazy) | `target` is returned only to the host or inside a reveal. `clueMode:'chat'` is legacy: never written after D-2, still readable. `clueText` of a TEXT clue is stored only after WeChat said `pass`; a hidden, deleted or paused one is never returned (admin excepted); `clueMod` and the hide fields never leave the server. Indexes `createdAt`, `status + createdAt`, `clueMode + clueMod.ts` (admin `sample`). |
| `guesses` | `<roundId>_<openid>` | `roundId, openid, pos, ts, late, groupRef?` | submitGuess | Indexes `roundId`; `groupRef + ts` (group page rounds list). |
| `sub_grants` | `<roundId>_<openid>` | `roundId, openid, tmplId, grantedAt, used, sentAt?, sendErrCode?` | subscribeRound (add), reveal paths (claim in a transaction) | Index `roundId + used`, `grantedAt`. |
| `card_reports` | auto | `openid, dateKey?, itemId, reason:'unsuitable'\|'ambiguous'\|'typo', ts` | reportCard | No text, ever. |
| `item_usage` | `itemId` | `dateKey` | genDaily/getDaily (on publish) | The auto path excludes `item_usage` plus every id in `schedule.v1.js`. |
| `anomalies` | `<openid>_<dateKey>_fast` | `kind:'fast', detail:{ms}, ts` | submitCard (best effort) | Observe-only (AC 82). |
| `events` | auto | `openid, sessionId (top level), name, props, ts, clientTs` | track, server events | Indexes `ts`, `name + ts`. |
| `rate_limits` | `<bucket>_<openid>_<minute\|dateKey>` (per-minute buckets are `fn_<name>`, `track`) | `bucket, openid, count, expireAt` | `store.rateLimit`, `store.dayLimit` | Index `expireAt`. |
| `reveal_views` | `<roundId>_<openid>` | `roundId, openid, ts` | getRound (`showAnswer`) | L4: the player was served the answer of a revealed round; submitGuess then refuses their late guess (`ROUND_EXPIRED`). Index `ts`; cleanup 180 days. |
| `mod_log` | auto | `kind:'clue', roundId, openid, api:'game'\|'general'\|'mock', result:'pass'\|'risky'\|'review'\|'busy', suggest, label?, traceId?, errCode?, latencyMs, text? (**only for non-pass results**), ts` | setClue (every WeChat check) | Admin-only evidence; never in a response, never in an event. Indexes `ts`, `roundId`, `kind + ts`. 180 days. |
| `mod_quota` | `<dateKey>` | `dateKey, ts, text (calls; the dev-live budget counter), busy` | setClue | Dev budget (`MOD_TEXT_DAILY_BUDGET`) and volume; no openid. Index `ts`. 180 days. |
| `clue_reports` | `<roundId>_<openid>` | `roundId, openid (reporter), reason:'porn'\|'politics'\|'abuse'\|'ads'\|'other', state:'open'\|'upheld'\|'dismissed', ts, resolvedAt?` | reportClue (add), admin (state) | One report per player per round. The reporter is never shown to anyone, the admin included. Indexes `ts`, `state + ts`, `roundId`. 180 days. |
| `audit_log` | auto | `op, target, before, after, by:'console'\|'console/<openid>', ts` | admin (every write op) | No clue text in `before`/`after`. Index `ts`. 180 days. |
| `app_config` | `live` | `subscribe:{tmplId, fields}`, `ads:{banner:{enabled,adUnitId}, interstitial:{...}}`, **`ugc:{createEnabled, viewEnabled}`, `moderation:{textApi:'game'\|'general'}`**, `updatedAt` | console, admin (`setUgc`, `setModeration`) | Ads/subscribe: 60 s cache; **the UGC gates: 10 s** (`groups.ugcFlags`); missing = everything optional off, UGC on. An unreadable config pauses typed clues (fail closed). `core/adpolicy.buildFeatures` turns the rest into `features`. |
| `meta` | `launch` | `dateKey` | getDaily/genDaily (first set) | `LAUNCH_DATE_KEY` env wins. Fallback `CONFIG.daily.launchDateKey`. |

`database/rules.json`: every collection `{"read": false, "write": false}` (backend writes this file).

## 3. Functions

Legend: **In** = event after `V.*` cleaning. **Out** = the `ok:true` body. Codes listed are the ones the function can return besides `UNAUTHENTICATED`, `RATE_LIMITED` (where stated) and `INTERNAL`. "Core" names the module that builds the answer. Timeouts in parentheses go into `function.config.json`.

### getDaily (10 s)
- **In** `{groupRef?: 16 hex, dateKey?: 'YYYYMMDD'}`. `dateKey` defaults to today (server); it may be today or yesterday while yesterday is not yet closed (< D+1 00:30; TD-7), else `INVALID_INPUT` (closed days go through `getArchiveDay`).
- **Reads** `daily_sets` (creates today's lazily via `schedule.cardsForDate` or the auto path `schedule.pickDay` with `rng = sub(dateKey,'auto')`, then 5 `daily_card_stats`, `item_usage`, `meta`; a racing creator loses on the fixed `_id` and re-reads, AC 23), `daily_card_stats`, the caller's `daily_entries`, `player_stats`, previous published `daily_sets` (+ the caller's entry there), `app_config`; with a valid `groupRef` (caller has a `group_members` row with it, else silently ignored) the members' entries for the day.
- **Out** (`core/service dailyView`):
```
{ ok, dateKey, issueNo, serverNow, closesAt, contentVersion, frozen: boolean,
  cards: CardText[5],                         // {itemId, spectrumId, left, right, prompt, catLabel}; server text, no anchor
  mine: { pos: (int|null)[5], answered: 0..5, complete: boolean, total: int|null /* sum over answered cards */,
          cardScores: (int|null)[5], reveals: (Reveal|null)[5] },
  refs: (number|null)[5],                     // live R_c, null for cards not answered (AC 13)
  groupRefs: (GroupBlock|null)[5] | null,     // null without a valid groupRef; per answered card {median|null, n, dots[]}
  divisiveIdx: 0..4 | null,                   // only when complete
  yesterday: {dateKey, issueNo, total, pct:int|null, final:true} | null,   // closed + finalised + caller completed
  myStreak: {current, best},                  // core/streak display(); yesterday's streak all of today
  features: {subscribe:{tmplId}|null, banner:{enabled, adUnitId|null}, interstitial:{enabled, everyNSets, minLifetimeSets, minGapSec, maxPerDay}} }
Reveal = {idx, pos, ref, d, score, label, agreePct:int|null, n, small:boolean, group:GroupBlock|null, frozen}
```
- **Never** returns `anchor`, histograms, or refs of unanswered cards.
- **Errors** `DAILY_UNAVAILABLE` (before launch, or no set could be created), `INVALID_INPUT`.

### genDaily (timer `0 0 23 * * * *`, 20 s)
Creates tomorrow's `daily_sets` + 5 stats docs + `item_usage`; idempotent by `_id` (second fire: `{ok:true, created:false}`); client call -> `FORBIDDEN`. Logs `daily_gen`; `[ALERT] schedule exhausted` when the auto path is used. **Out** `{ok, dateKey, created, source?}`.

### submitCard (5 s)
- **In** `{dateKey, idx 0..4, pos 0..100 int, groupRef?}`.
- **Order** (`core/service applySubmit`, AC 15, 20): input -> (future date -> `INVALID_INPUT`) -> no set -> `DAILY_UNAVAILABLE` (today) / `LATE_SUBMIT` (past) -> `entry.pos[idx] !== null` -> **`CARD_DONE`** -> window `W.submitWindow` (today ok; yesterday only inside D+1 00:30 grace AND `firstAt` on D; else `LATE_SUBMIT`) -> `idx` is not the first unanswered -> `CARD_ORDER`.
- **Transaction** (entry get -> `applySubmit` -> entry add/update; `daily_card_stats.<dateKey>_<idx>` `inc hist.<pos>` + `n`; on complete also `player_stats` via `streak.onComplete` and `entry.streak`). Anomaly `fast` (complete < 6 s after `firstAt`) is written after the commit, best effort, and never changes anything (AC 82).
- **Out** `{ok, dateKey, ...Reveal, complete}` and, when `complete`: `total, band, cardScores[5], refs[5], divisiveIdx, streak:{current,best}`. The reveal's `ref`/`n`/`agreePct` use the histogram INCLUDING this answer. `group` = `GroupBlock` `{median|null, n, dots[]}` over the OTHER members' positions for that card (partial members count), only for a `groupRef` the caller belongs to; else `null`.
- **`CARD_DONE`** returns `{ok:false, code:'CARD_DONE', message, reveal: Reveal}`; the client treats it as success with the stored reveal. The histogram is incremented once even for parallel identical calls.
- **Errors** `INVALID_INPUT, CARD_ORDER, CARD_DONE, LATE_SUBMIT, DAILY_UNAVAILABLE`.

### finalizeDay (timer `0 40 0 * * * *`, start 300 s, device pass E6)
For D = yesterday: freeze `final[5]` (`service.lazyFinal`), page through complete `daily_entries` (1,000 per query, resumable cursor) -> `service.finalAggregate` -> `finalHist[101]`, `finalCount`, `finalizedAt`; idempotent (skips when `finalizedAt`). Refs are frozen first (cheap) so 定分 is right even if the aggregate resumes later (edge 23). The **lazy path**: any function that needs `final` of a closed day (getArchive, getArchiveDay, getDaily.yesterday, getBonusCard) computes and stores `final[5]` itself when missing; the percentile waits for the timer (AC 25). Logs `finalize_day`.

### getArchive (10 s)
- **In** `{before?: dateKey, limit?: 1..30 (default 30)}`. **Out** `{ok, items:[{dateKey, issueNo, mine?:{total, final:true}}], hasMore, bestStreak}`; closed days only (`now >= D+1 00:30`), newest first, strictly older than `before`; `mine` only for a complete caller entry (`total` scored at the frozen `final`) (AC 36). Core: `service.archivePage`, `archiveItem`.

### getArchiveDay (10 s)
- **In** `{dateKey}`. **Out** `{ok, dateKey, issueNo, cards: CardText[5], finals: number[5], mine: null | {pos:(int|null)[5], answered, complete, total:int|null, cardScores:(int|null)[5], pct:int|null}}`. `mine` is present for any entry (complete = read-only review; partial = the client treats the day as unplayed, TD-11). No histograms (TD-11).
- **Errors** `DAY_OPEN` for today, a day inside its grace window, a day with no set (AC 36).

### getBonusCard (5 s)
- **In** `{exclude?: itemId[] <= 60}` (the device's local archive plays, TD-10). **Out** `{ok, card: CardText, final: number, dateKey, issueNo}`: a random unanswered item (`pos[idx]` null or no entry, not in `exclude`) from a CLOSED day with a frozen `final`. The per-minute limit (10, `handler` `rate`) is charged before the scan of up to 60 closed days; the per-day limit (3 per Beijing day per openid, `dayLimit('bonus')`) is consumed only when a card is served.
- **Errors** `NO_CARD_AVAILABLE` (nothing to serve, e.g. launch week), `RATE_LIMITED` (copy "今天的加一题用完了"). The server does not check "complete daily"; that gate is UI-only (TD-10).

### unlockDistribution (5 s)
- **In** `{dateKey}` (today or any published past day). **Out** `{ok, dateKey, hist: (int[21]|null)[5]}`: centred 21-bin national histograms (`score.distribution21`, bin = floor((pos+2)/5)). For an open day only cards the caller answered are non-null (AC 40); a closed day returns all five. Stores nothing but the rate counter (`dayLimit('dist', 20)`, TD-8). The unlock itself is client state.
- **Errors** `INVALID_INPUT` (future or unpublished day), `RATE_LIMITED`.

### joinGroup (5 s)
**M1 (TD-64).** `{cloudID: string}`: the RAW cloudID from `wx.getGroupEnterInfo` (<= 2048 chars, no whitespace). The client no longer sends `wx.cloud.CloudID(...)` and `event.groupData` / any decrypted-looking object is never read: a plain object `{cloudID, data:{opengid, chat_type}}` built by a modified client is `BAD_CLOUDID`. The server resolves the string with `cloud.getOpenData({ list: [cloudID] })` (wx-server-sdk; https://developers.weixin.qq.com/minigame/dev/wxcloud/reference-sdk-api/open/Cloud.getOpenData.html), takes the list item, requires `errCode`/`errcode` to be falsy and `item.cloudID` (when present) to equal the request, requires `item.data` to be a plain object (the SDK reference's shape; studio standard) and requires `opengid` to be a non-empty string <= 128 chars and `chat_type` to be ABSENT or 3 or 4 (CTO ruling: the real payload may carry no `chat_type`; a single-chat payload with `open_single_roomid` and no `opengid` is `NOT_GROUP`). Errors: unresolvable, errored or unparseable item `BAD_CLOUDID`; a `chat_type` other than 3/4 or no valid `opengid` `NOT_GROUP`; `GROUP_REF_PEPPER` missing or shorter than 32 characters `SERVER_CONFIG`. Upserts `group_members/<openGId>_<openid>` (add; on duplicate update `lastSeen` + `groupRef`). **Out** `{ok, groupRef}` with `groupRef = groupRefOf(openGId, pepper)` (16 hex). Idempotent; errors leave no document (AC 41). `wx.getShareInfo` is never used. The mock decodes its own synthetic cloudIDs (`mock-server.js encodeMockCloudID`) with the same outcomes.

### getGroupDay (10 s)
- **In** `{groupRef, dateKey}`; `dateKey` must be today or yesterday (calendar, else `INVALID_INPUT`). Caller needs a `group_members` row with that `groupRef` else `NOT_MEMBER` (AC 42).
- **Reads** members of the group -> their `daily_entries` for the day (complete only for rows; chunked `_id in [...]`), `group_daily` for closed trend days, `guesses` by `groupRef` (rounds list), live/frozen refs.
- **Out** (`service.groupDayView`, `group.buildGroupDay`):
```
{ ok, dateKey, issueNo, salt (= daily_sets.boardSalt), selfHash, viewerDone, n,
  mq: int|null,                 // 群默契度, n >= 3
  divisiveIdx: 0..4|null,       // widest MAD among members, n >= 3 (TD-6)
  rows: [[h, gs|null, ns, t, pos|null, k|null], ...],   // always 6 entries; gs = 群内默契分 (n >= 2), ns = national live score at the same refs,
                                // t = seconds from 00:00 BJT of dateKey to completion (may exceed 86400, TD-5),
                                // pos = "a,b,c,d,e" ONLY when viewerDone, k = streak when >= 2
  trend: [{dateKey, mq:int|null, n}] x7 (oldest first, last = today; mq null when n < 3),
  rounds: [{roundId, left, right, clue:string|null, status, mq:int|null, guesses}] <= 10 (rounds with a guess carrying this groupRef, newest first; mq only when revealed) }
```
Sorted by `gs` desc (null last), `t` asc, `h`. Over `group.rowCap` (500): top 500 plus the caller. `closestPeer` (最同频) is NOT computed here (PD-20); the open data domain does it from `pos`. Writes `group_daily` for closed days.

### getFriendBoard (10 s)
- **In** `{dateKey}` (today/yesterday). **Out** `{ok, dateKey, issueNo, salt, selfHash, viewerDone, mode:'full'|'selfOnly', refs: number[5]|null /* only when viewerDone */, rows:[[h, ns, t, pos|null, k|null], ...], total}`. `full` = every complete daily of the day ranked by `ns` desc then `t` asc; above `CONFIG.board.listCap` (3,000) -> `selfOnly` with only the caller's row (AC 46). Logs `board_list`.

### createRound (5 s)
- **In** `{spectrumId}` must exist in the server content (`INVALID_INPUT`). `dayLimit('createRound', 20)` after validation -> `RATE_LIMITED` (copy "今天出的题够多啦，明天再来", AC 35).
- Creates `rounds/<roundId>` `status:'draft'`, `target = rounds.drawTarget(util.randomFloat())` (5..95, AC 26), `salt = util.newSalt()`. **Out** `{ok, roundId, target, left, right, ugc}` (host only; no other function ever returns `target` before the reveal). **D-2 `ugc`** drives the clue step (spec 6.5):
```
ugc = { createEnabled: boolean,            // app_config.ugc.createEnabled; false -> show only the preset tab
        rulesVersion: int|null,            // the 发言规则 version this player agreed to
        rulesRequiredVersion: 1,           // CONFIG.ugc.rulesVersion
        rulesAgreed: boolean,              // rulesVersion >= rulesRequiredVersion
        restriction: {until:ms, permanent:boolean} | null,   // typed clues only
        warnPending: boolean }             // the one-time strike warning sheet; READ ONCE: this call clears it
```

### setClue (5 s) -- D-2
- **In** `{roundId, clueMode:'preset', clueItemId}` or `{roundId, clueMode:'text', clueText}`. `clueMode:'chat'` (我在群里说 is removed), a missing/non-string `clueText`, or any other mode is `INVALID_INPUT`. A preset ignores `clueText`; a typed clue ignores `clueItemId`; `clueText` is cut at 200 characters before the rules run (so anything over 12 is `length`).
- **Out** `{ok, status:'open', clueMode:'preset'|'text', clueText}`. `clueText` is the stored text: the curated preset text, or the NORMALISED typed clue (`core/clue.js normalizeClue`: full-width forms folded except Chinese punctuation, all whitespace and emoji removed).
- **Common order:** round not found (or a draft past 30 min) `ROUND_NOT_FOUND` -> not the host `NOT_HOST` -> `revealed` / `noGuesses` / at least one guess `ROUND_EXPIRED` (a draft, or an `open` round with no guess, may be re-clued) -> a hidden clue (`clueHidden`) `INVALID_INPUT` (the host cannot replace a hidden clue).
- **preset:** `clueItemId` must belong to the round's spectrum (`INVALID_INPUT`). Presets are never affected by the kill switches, the 发言规则, a restriction or moderation.
- **text** (`core/ugc.js textGate`, then the WeChat check), in this order:
  1. `ENV_KIND=prod` with `MODERATION_MODE=mock` (or an unknown mode): `SERVER_CONFIG` plus an `[ALERT]` log, for EVERY text call (checked first).
  2. the same normalised text as the stored typed clue on an `open` round: `{ok}` **without a second check** (a retry after a client timeout is free).
  3. `app_config.ugc.createEnabled === false`: `UGC_PAUSED`.
  4. no 发言规则 agreement at `rulesVersion` 1: `RULES_REQUIRED`.
  5. restricted: `RESTRICTED` + `until` (ms) + `permanent`.
  6. `core/clue.js checkClue` with the round's STORED labels: `TEXT_REJECTED` + `reason` (`empty|length|digit|position|endLabel|charset|blocked`). No WeChat call, no strike, not counted.
  7. 50 WeChat checks per player and Beijing day (`player_stats.clueChecks`): `RATE_LIMITED` with `scope:'day'`.
  8. the WeChat check (2 s): game `msgSecCheck` (`wxa.game.contentSpam.msgSecCheck`, `{openid: host, version: 2, scene: 3, content: normalised clue}`), or the general `security.msgSecCheck` when `app_config.moderation.textApi === 'general'`. `pass` -> stored (`clueMode:'text'`, `clueText`, `clueMod`, `status:'open'`) in a transaction that re-reads the round (a guess landing meanwhile wins: `ROUND_EXPIRED`). `risky` -> `TEXT_BLOCKED` + one strike. `review` on the general API -> `TEXT_BLOCKED`, no strike. **Anything else** (timeout, error, non-zero errcode, missing `result`, unknown `suggest`, `review` from the game API, 750032/750033, a missing permission, the dev budget used up) -> `MODERATION_BUSY`, no strike.
  A non-pass never touches the round document (a draft stays a draft; an open round keeps its earlier clue). Every check writes one `mod_log` row (the text only when it did not pass) and a `clue_check` server event (no text, no trace id).
- **Errors** `INVALID_INPUT, NOT_HOST, ROUND_NOT_FOUND, ROUND_EXPIRED, TEXT_REJECTED(+reason), TEXT_BLOCKED, MODERATION_BUSY, RULES_REQUIRED, RESTRICTED(+until,permanent), UGC_PAUSED, SERVER_CONFIG, RATE_LIMITED(+scope)`.

### agreeRules (5 s) -- D-2
- **In** `{rulesVersion: 1}` (the spec's spelling `{version: 1}` is accepted too); any other value is `INVALID_INPUT`. **Out** `{ok, rulesVersion, changed}`. Writes `player_stats.rulesVersion / rulesAt`; idempotent (the first agreement time is kept). Not a WeChat privacy-interface authorization.

### reportClue (5 s) -- D-2
- **In** `{roundId, reason: 'porn'|'politics'|'abuse'|'ads'|'other'}` (chuanhua's `'ad'` is read as `'ads'`); no free text. **Out** `{ok, hidden:true}`. Hides the clue **for everyone at once**, host included (`clueHidden`, `clueHiddenAt`, `clueHiddenBy:'report'`), in the transaction that stores `clue_reports/<roundId>_<openid>`. The reporter is never named in any response or round field.
- **Order:** `INVALID_INPUT` (bad id/reason) -> `ROUND_NOT_FOUND` (also a draft for a non-host) -> `OWN_ROUND` (the host) -> `INVALID_INPUT` (not a shown typed clue: a preset, a legacy chat round, a clue hidden by admin or deleted, a paused clue) -> `DUP_REPORT` (same player twice) -> `REPORT_LIMIT` (the 11th of a Beijing day, `scope:'day'`) -> stored. A clue already hidden by ANOTHER player's report is still reportable: `{ok, hidden:true}` and the row is stored.

### admin (20 s, console only) -- D-2
Not client-callable (not in `js/functions.js`, not in the client's `api.NAMES`). Run from the cloud console test invocation, which carries no OPENID. A call with an OPENID is `FORBIDDEN` unless the openid is in env `ADMIN_OPENIDS` (60 calls a minute for those); the HTTP access service must stay disabled for it. **In** `{op, ...}`; unknown op -> `INVALID_INPUT`. Every WRITE op appends one `audit_log` row (`by: 'console'` or `'console/<openid>'`).

| op | In | Out / effect |
|---|---|---|
| `listReports` | `{state?:'open'\|'upheld'\|'dismissed', limit?<=50}` | `{items:[{roundId, state, reason, ts, ageMs, clue:{mode,text,hidden,hiddenBy,hiddenAt,mod}}]}` oldest first, with the text; no reporter, no host |
| `getRound` | `{roundId}` | `{round:{..., hostOpenid, clue, reports:[{reason,state,ts,resolvedAt}], host:{strikes30d, restriction, reviewFlag}, modLog:[{api,result,label,latencyMs,errCode,text,ts}]}}`; the only place a host openid appears; reporters never |
| `sample` | `{n?<=50}` | `{items:[{roundId,left,right,text,ts}], pool}` random shown typed clues passed in the last 24 h |
| `upholdReport` | `{roundId}` | all reports of the round `upheld`, clue stays hidden, **one strike** to the host (once per round: a repeat is `{already:true}`); `INVALID_INPUT` without reports |
| `dismissReport` | `{roundId, restore?:boolean}` | reports `dismissed`; `restore:true` shows the clue again (a deleted clue cannot come back) |
| `hideClue` / `restoreClue` | `{roundId}` | admin hide / show (`INVALID_INPUT` on a round without a typed clue) |
| `deleteClue` | `{roundId}` | the text leaves the round for good (deletion request); `mod_log` evidence stays |
| `restrict` | `{openid, days: 1..3650 \| permanent:true}` | typed-clue restriction; the player must already have `player_stats` (never created by typo) |
| `liftRestriction` | `{openid}` | |
| `setUgc` | `{createEnabled?, viewEnabled?}` | the kill switches; writes the `ugc_pause` server event; effective within 10 s |
| `setModeration` | `{textApi:'game'\|'general'}` | the fallback API switch; effective within 10 s |

### getRound (5 s)
- **In** `{roundId, groupRef?, showAnswer?: boolean}` (`groupRef` accepted, currently unused: reserved). **L4:** on a revealed round the `reveal` is served by default only to the host, to a player who has a guess, and to everyone once guessing is closed (> 7 days). Anyone else who could still place a late guess gets `answerHidden: true` and no `reveal`/`target` until they send `showAnswer: true`, which records `reveal_views/<roundId>_<openid>` and returns the reveal (and stays served on later reads). Applies `rounds.lazyTransition` first (24 h: reveal `by:'timer'` if >= 1 guess else `noGuesses`; draft > 30 min: discard) then `service.roundView`.
- **Out** `{ok, roundId, status, isHost, left, right, clue, me, clueMode, clueText, clueState, guessCount, createdAt, autoRevealAt, closesAt, myGuess:{pos,late}|null, canReveal}` plus: host while not revealed -> `target`; revealed -> `reveal`. **D-2 clue fields (the client codes against `clue` and `me`):**
```
clue = { mode: 'text'|'preset'|'chat'|null,   // null = a draft with no clue yet; 'chat' = a legacy round (read-only)
         text: string|null,                    // null unless it may be shown: a hidden (reported/admin/deleted) or paused TEXT clue, a legacy chat round, a draft
         hidden: boolean,                      // true for hidden AND paused
         state: 'shown'|'hidden'|'paused' }    // hidden = reported / admin-hidden / deleted; paused = app_config.ugc.viewEnabled false (the emergency stop)
me   = { canReport: boolean,                   // typed + shown + not the host + not reported by this viewer yet (never on a preset, legacy, placeholder, draft)
         rulesAgreed: boolean,
         restriction: {level, until, permanent} | null,   // this viewer's typed-clue restriction; level = max(1, strikes in 30 d); permanent -> until 253402300799000
         strikeNotice: boolean }               // the one-time warning sheet; true ONCE, and only on the HOST's own view (reading it clears it)
```
`clueMode` / `clueText` / `clueState` are the same values as `clue.mode / .text / .state`, kept for older clients. The legacy `'chat'` round reads `clue = {mode:'chat', text:null, hidden:false, state:'shown'}`, takes guesses and reveals as before and is never reportable. The same text rules apply in every state including the reveal. **Never** returned: a host or reporter openid, `clueMod`, trace ids, `clue_reports`/`mod_log` fields (AC 49). `getGroupDay.rounds[].clue` carries only a PRESET text (`null` for a typed clue, PD-37). The reveal payload:
```
reveal = { target, mq:int|null, salt, selfHash, closestH:string|null /* 最懂你 */, rows:[[h, g|null, s|null, late 0|1, isHost 0|1], ...], revealBy, revealedAt }
```
Rows: on-time guesses by closeness then time, then late guesses by time (**a late row has `s: null`: a late guess never shows a score**, L4; at most 500 late rows), then the host row `[h, null, null, 0, 1]` (出题人, no score). A non-host never receives `target` before the reveal (AC 26, 30). Drafts: `ROUND_NOT_FOUND` for non-hosts.
- **Errors** `ROUND_NOT_FOUND`.

### submitGuess (5 s)
- **In** `{roundId, pos, groupRef?}`. Order (`rounds.guessCheck`): not found/draft -> `ROUND_NOT_FOUND`; host -> `OWN_ROUND`; already guessed -> `ALREADY_GUESSED`; > 7 days or `noGuesses` -> `ROUND_EXPIRED`; revealed -> stored `late:true`, unless the caller was already served the answer (`reveal_views`) -> `ROUND_EXPIRED` (L4).
- **Transaction** guess add (`_id <roundId>_<openid>`), `guessCount` inc (on-time only), `groupRefs` append of a `groupRef` the caller belongs to (<= 10), and at the 8th on-time guess the reveal (`applyReveal`, `revealBy:'count'`) — exactly one reveal under concurrency (AC 32).
- **Out** `{ok, late, guessCount, revealed:boolean, reveal?}` (`reveal` = the shape above whenever the round is revealed after this call, including late guesses).

### revealRound (10 s)
- **In** `{roundId}`. `rounds.hostRevealCheck`: not found/draft -> `ROUND_NOT_FOUND`; not host -> `NOT_HOST`; `< 2` on-time guesses or `noGuesses` -> `TOO_FEW_GUESSES`; already revealed -> idempotent success. **Out** `{ok, reveal}`. Side effects: `mq` (`scoreRound`), `status:'revealed'`, `revealedAt`, `revealBy:'host'`, then subscribe sends.

### sweepRounds (timer `0 0 * * * * *`, hourly, 60 s)
Applies `lazyTransition` to rounds in `draft`/`open` (discards stale drafts, reveals `by:'timer'`, marks `noGuesses`) and sends pending subscribe messages not sent in-request. Idempotent. **D-2 alert-only watchdogs** (state is never changed): `[ALERT] clue report open > 48 h` for any `clue_reports` row still `open` after 48 h, and `[ALERT] moderation busy` when >= 50% of >= 20 typed-clue checks of the last hour were `busy` (from `mod_log`). **Out** `{ok, changed, sent, alerts:{staleReports, busy}}`.

### subscribeRound (5 s)
- **In** `{roundId}`. `NO_TEMPLATE` when `features.subscribe` is null; `ROUND_NOT_FOUND` for missing/draft; `FORBIDDEN` unless the caller is the host or has guessed; a round that is not `open` -> `{ok:true, granted:false}` (nothing left to notify, TD-13); else idempotent `add` of `sub_grants/<roundId>_<openid>` -> `{ok:true, granted:true}`.
- **Sending** at any reveal path: claim every `used:false` grant of the round in a transaction (one grant -> at most one message), `subscribeMessage.send` (best effort, <= 2 s in-request, the rest by `sweepRounds`). Message fields: spectrum "左↔右", "本题默契值 N", time; page `?r=<roundId>`; no names, no openids (AC 63). Server event `subscribe_send` (`where` = host if the grantee is the round host, else guess).
- **Server events (spec 12)**: `round_reveal {roundId, by, guesses, mq}` once per reveal (rounds-db.revealRound, winner of the status flip only: host, count, timer lazy, sweep); `board_list` from getFriendBoard (view friend) and getGroupDay (view group, mode full|locked); `daily_gen`, `finalize_day` (failed:true when a run ends partial). Stored as `events` with openid `server`, never an openid or groupRef in props.

### reportCard (5 s)
- **In** `{itemId, reason:'unsuitable'|'ambiguous'|'typo', dateKey?}`; `itemId` must exist in the content; `dayLimit('report', 10)`. **Out** `{ok}`. Stores a `card_reports` row (no text). Grants nothing (AC 79).

### track (5 s) -- copied from 点将台
- **In** `{sessionId?, events:[{name, props, clientTs, sessionId?}]}` (1..50). Names must be in `core/events.js CLIENT_EVENT_NAMES` (unknown names are dropped, the batch never fails); props are an ALLOWLIST (L2): only the keys of `core/events.js EVENTS[name]` plus `COMMON`, each checked for type or enum (`events.js sanitizeProps`, `PROP_TYPES`); unknown keys, nested values and mistyped values are dropped and the event is still stored; `sessionId` stored top level. Per-minute limit 300 events. **Out** `{ok, accepted}`.
- **D-2: a typed clue never appears in an event** (AC 95). Every prop of every event is an enum, a short ASCII token, a boolean or an integer (`chars` is an integer 1..12; `label` is one of the known score labels or a platform integer; `reason` one fixed token). The server-only events `clue_check`, `strike`, `restrict`, `ugc_pause` (and `round_reveal`, `subscribe_send`, ...) are NOT in `CLIENT_EVENT_NAMES`, so a client batch cannot write them. The trace id lives in `mod_log`/`clueMod` only; the blocked text in `mod_log.text` only. New client events: `clue_tab`, `clue_result`, `rules_view`, `rules_agree`, `clue_report`; `round_clue` gains `chars?`, `tabSwitches?` and `clueMode` is `text|preset`.

### cleanup (timer `0 0 4 * * * *`, 60 s)
Deletes past 180 days: `daily_entries` (by `dateKey`), `player_stats` (`updatedAt`), `group_members` (`lastSeen`), `group_daily`, `rounds`, `guesses`, `sub_grants`, `card_reports`, `anomalies`, `events`, `rate_limits` (`expireAt`), `reveal_views`, and **D-2:** `clue_reports`, `mod_log`, `mod_quota`, `audit_log` (field `ts`). A round takes its typed `clueText` with it; strikes and the 发言规则 record go with a stale `player_stats` (`updatedAt`). Keeps `daily_sets`, `daily_card_stats`, `item_usage`, `app_config`, `meta`. Idempotent (AC 67, 101).

### 3b. `core/clue.js`: the typed-clue rules the client codes against (D-2)

One module, shared by the client (button state, inline hint) and the functions (the authority); `tests/core-sync.test.js` proves the copies are identical. Pure JS, relative requires only.

```
CLUE_MAX = 12
RULE_LINE = '最多 12 个字 · 不写数字、位置和两头的词'
CLUE_RULES_VERSION = 1                       // = CONFIG.ugc.rulesVersion
normalizeClue(text) -> string                // NFKC full-width fold (Chinese punctuation ，、。！？…·～ kept), all whitespace removed, emoji and zero-width characters stripped
checkClue(text, {leftLabel, rightLabel}) -> {ok:true, text} | {ok:false, reason, hint}
   reason: 'empty'|'length'|'digit'|'position'|'endLabel'|'charset'|'blocked'    // first failing rule, in this order: length, digit, position, endLabel, charset, blocked
   hint:   spec 6.12 copy ('' for 'empty': the button is just disabled)
clueLength(text) -> int                      // code points after normalising: the counter "n/12"
hintFor(reason, labels) -> string            // also accepts the spec table's own names 'digits' / 'chars'
REASON_ALIASES                               // {digit:'digits', charset:'chars', digits:'digit', chars:'charset'}
```
Notes for the client: (0) Rules 2-3 also run on a punctuation-stripped copy of the clue (B1: `七，十`, `七·十`, `中·间` are rejected). (1) the spec table names two reasons `digits` and `chars`; this build's names are `digit` and `charset` (the server returns these in `TEXT_REJECTED.reason`; analytics accept both spellings). (2) A percent sign is `position` even next to digits (`50%`, AC 87); `70` is `digit`. (3) Emoji are stripped, never an error; `checkClue` returns the stripped/folded `text`, which is exactly what the server stores and the guesser sees. (4) The allowed set after folding is CJK ideographs plus `，、。！？…·～~!?`; an ASCII `,` or `.` is `charset`. (5) `RESTRICTED` copy: `core/strikes.js restrictionText({until, permanent})`; the warning sheet text is `strikes.WARNING_TEXT`. (6) `js/functions.js` (the client's own function list) must add `agreeRules` and `reportClue`; the mock server and the tests already treat them as client functions.

## 4. Environment

| Name | Where | Purpose |
|---|---|---|
| `GROUP_REF_PEPPER` | joinGroup (secret, 32+ random chars, never committed) | `groupRef = sha256(openGId + pepper)[0..16)`; missing or shorter than 32 characters -> `SERVER_CONFIG` (L5) |
| `TZ` | every `function.config.json` | `Asia/Shanghai` (belt and braces; code does not depend on it) |
| `LAUNCH_DATE_KEY` | getDaily, genDaily | `YYYYMMDD` of issue 1; else `meta/launch`, else `CONFIG.daily.launchDateKey` (`20261101`, placeholder) |
| `ENV_KIND` | setClue | `prod` \| `dev`. Unset or anything else = `prod`, which forces live moderation. **Set `prod` on the production environment** |
| `MODERATION_MODE` | setClue | `live` (default) \| `mock`. `mock` is for dev only: with `ENV_KIND` not `dev` every typed-clue call is `SERVER_CONFIG` + `[ALERT]` (mock words: 测试违规 risky, 测试复审 review, 测试繁忙 error, else pass) |
| `MOD_TEXT_DAILY_BUDGET` | setClue | dev + live only: WeChat calls per day (default 80; protects the pre-publish quota); beyond it `MODERATION_BUSY` |
| `MOCK_SYNC_DELAY_MS` | setClue | mock mode only: simulated latency (default 300) |
| `ADMIN_OPENIDS` | admin | comma/space separated openids allowed to call `admin` with an OPENID (the console carries none). Empty = console only |

No AppSecret, no `session_key`, no `code2Session` anywhere (tests scan for them).

## 5. Tests the backend wave must add (all against the real core copy; the mock-server tests are the model)

AC 7 (drift: `tests/core-sync.test.js` exists), 12, 13, 15 (two parallel identical `submitCard` calls -> `n` +1), 20, 22 (a function-level run at `TZ=UTC` and `TZ` unset), 23 (double `genDaily`, racing lazy `getDaily`, `FORBIDDEN`), 24, 25 (50k synthetic entries within the timeout or resumes), 26, 28, 30-35, 36, 39, 40, 41, 42, 43, 46, 47, 49, 62, 63 (two parallel reveal paths -> one message per grant), 67, 68 (rules test: all collections deny-all), 79, 80, 82. Fake DB must reproduce duplicate-`_id` errors, throwing `doc.get`, and rolled-back transactions (see 点将台 `tests/helpers/fake-db.js`).
