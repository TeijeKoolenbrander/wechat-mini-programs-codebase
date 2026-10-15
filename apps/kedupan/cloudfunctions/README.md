# 群友刻度盘 cloud functions

WeChat Cloud Development backend for the mini game `kedupan`. Spec: `docs/kedupan/spec.md` §3, §5, §8, §11, §13, §15, §17; decisions in `docs/kedupan/decisions.md`. Patterns copied from `apps/dianjiangtai/cloudfunctions` (never imported).

Status: code and tests complete. **Not deployed** (no AppID or cloud environment yet). The tests run against a **test double of the game core** (`tests/fake-core/`) until `apps/kedupan/game/core/` exists; see "Core API assumptions".

## Functions

| Function | Trigger | Timeout (s) | Purpose |
|---|---|---|---|
| `getDaily` | client | 10 | today's 5 cards (no anchors), caller progress, refs only for answered cards, yesterday's 定分, streak, remote features. Creates the set lazily if `genDaily` missed. Optional `dateKey` = yesterday inside the 00:30 grace |
| `genDaily` | timer `0 0 23 * * * *` | 20 | writes tomorrow's `daily_sets` (schedule, else the auto path with an `[ALERT]` log); idempotent; `FORBIDDEN` with an OPENID |
| `submitCard` | client | 5 | the only way a position enters the national histogram; server validates and scores everything |
| `finalizeDay` | timer `0 40 0 * * * *` | 300 (E6 spike) | freezes `final[5]`, builds `finalHist`/`finalCount` with a resumable `_id` cursor; idempotent; server-only |
| `getArchive` / `getArchiveDay` | client | 10 | closed days only (`DAY_OPEN` otherwise), frozen finals, read-only review with percentile |
| `getBonusCard` | client | 10 | 加一题: an unanswered closed-day card + its final; needs today's complete daily; 3/day |
| `unlockDistribution` | client | 10 | 全国分布 histograms (21 bins); today only for cards the caller answered; 3/day |
| `joinGroup` | client | 5 | cloudID-decrypted group entry -> opaque `groupRef` (copied unchanged) |
| `getGroupDay` | client | 10 | group page: membership enforced, hashed rows, 群内默契分, 群默契度, 7-day trend, rounds |
| `getFriendBoard` | client | 10 | national-score board, hashed, `full`/`selfOnly` by `boardListCap` |
| `createRound` / `setClue` / `getRound` / `submitGuess` / `revealRound` / `subscribeRound` | client | 5/5/10/10/10/5 | host rounds (PD-8, PD-9, PD-13) |
| `sweepRounds` | timer `0 0 * * * * *` | 60 | drops stale drafts (30 min), reveals/ends 24 h rounds, sends pending subscribe messages |
| `reportCard` | client | 5 | no-text content feedback, 10/day |
| `track` | client | 5 | analytics batch (<= 50), rate limited, whitelisted client event names |
| `cleanup` | timer `0 0 4 * * * *` | 60 | 180-day retention |

Every function returns `{ok:true,...}` or `{ok:false, code, message}` and never throws to the client. Codes: spec 11.3 plus `NO_BONUS_CARD` (nothing left to play) and `DAY_OPEN` use as specified. Extra fields on errors: `CARD_DONE` carries `reveal` (the stored reveal), `CARD_ORDER` carries `expectedIdx`, `TOO_FEW_GUESSES` carries `guessCount`.

Identity is `cloud.getWXContext().OPENID`, read only in `common/store.js` (a test enforces it). Timers (`genDaily`, `finalizeDay`, `sweepRounds`, `cleanup`) reject any call that carries an OPENID with `FORBIDDEN`.

## Layout and the shared core

```
cloudfunctions/
  common/        source of truth for shared helpers -> copied to <fn>/common by sync (copies are committed)
  <fn>/          index.js, package.json, function.config.json (timeout + TZ), config.json (timers only)
  scripts/sync-core.js
  database/rules.json
  tests/         node --test; helpers/ = fake DB + harness; fake-core/ = TEST DOUBLE of game/core
```

```
npm run sync     # common/ and the core -> <fn>/common, <fn>/core  (core = apps/kedupan/game/core if present, else tests/fake-core)
npm run check    # drift check
npm test         # sync first (pretest), then everything
```

`<fn>/core/` is generated and git-ignored. **Only `common/coreapi.js` touches the core.** Before a deploy, `npm run sync` must have used the REAL core (it prints a WARNING when it falls back to the double).

### Core API assumptions (adjust only in `common/coreapi.js`)

`core/date.js beijingDateKey(ms)`; `core/score.js cardScore(d), cardLabel(d), medianOfHist(hist101), medianOfValues(values), referenceFromHist(hist101, anchor, W), dayBand(total)`; `core/config.js getConfig() -> {score:{priorVotes,agreeMin,agreeRadius}, boardListCap, groupRowCap}`; `core/content.js LATEST_CONTENT_VERSION, getSpectrum(id), getItem(id) -> {id,text,anchor,tags,spectrumId,left,right,cat}, allItems(), scheduleFor(issueNo) -> 5 item ids | null`. The group formulas (leave-one-out, 群默契度), 21-bin histograms and the auto path are composed in `coreapi.js` from those primitives.

## Environment variables (cloud environment config; never committed)

| Name | Required | Purpose |
|---|---|---|
| `GROUP_REF_PEPPER` | yes, on `joinGroup` | secret pepper: `groupRef = sha256(openGId + pepper)[0..16)`. Without it `joinGroup` returns `SERVER_CONFIG`. Random, 32+ chars, never pasted in chat or committed |
| `TZ` | `Asia/Shanghai` | in each `function.config.json` (belt and braces; date keys use core `date.js`) |
| `LAUNCH_DATE_KEY` | recommended | `YYYYMMDD` of issue 1 (set it on `getDaily`, `genDaily`, `submitCard`, `getFriendBoard`...: every function that can create a day). Unset: the first day ever created is stored once in `meta/launch` |
| `JOINGROUP_RETURN_OPENGID` | optional, `1` | only if the device spike (E1/E2) forces the `groupid` route; `joinGroup` then also returns the openGId |

No AppSecret, no `session_key`, no `code2Session` anywhere (cloudID decryption needs none); a test fails if those strings appear. Subscribe-message template ID and ad switches are **data**, not secrets: they live in `app_config/live` (below).

### `app_config/live` document (console, founder H7/H8)

```
{ "_id": "live",
  "subscribe": { "tmplId": "<template id>", "fields": { "topic": "thing1", "result": "thing2", "time": "time3" }, "state": "formal" },
  "ads": { "banner": { "enabled": false, "unitId": "" }, "interstitial": { ... } } }
```
`fields` maps our three values (spectrum, 本题默契值, time) to the template's field keys. Absent -> `NO_TEMPLATE` and no offer in the client. The message opens `index?r=<roundId>` (E7 spike: confirm the launch path/query for a mini game).

## Cloud environment setup (founder / whoever holds the console)

1. Create the cloud environment; put its id in the client's `wx.cloud.init`.
2. `npm run sync` (real core must exist), then upload and deploy every function folder (cloud install dependencies). In the console set each function's **timeout** and `TZ` from its `function.config.json` (apply by hand or via the CloudBase CLI; only `config.json` trigger files are a verified WeChat format).
3. Set `GROUP_REF_PEPPER` on `joinGroup` and `LAUNCH_DATE_KEY` on the day-creating functions.
4. Upload the 4 timer triggers (`genDaily`, `finalizeDay`, `sweepRounds`, `cleanup` `config.json`).
5. Create the 16 collections below, paste `database/rules.json`, add the indexes.
6. Optionally create `app_config/live` (template and ads).
7. Spike items touching the backend (spec 14): E1 cloudID decrypt, E6 timers and `finalizeDay` time with 50k entries, E3 payload size (sets `boardListCap`), E7 subscribe send, duplicate-`add` and missing-`doc.get` error text (see Risks).

## Collections

| Collection | `_id` | Written by |
|---|---|---|
| `daily_sets` | `YYYYMMDD` | genDaily / getDaily (lazy); `final*` by finalizeDay or a lazy read after 00:30 |
| `daily_card_stats` | `<dateKey>_<idx>` | created with the set; `hist.<pos>` and `n` incremented by submitCard (in the entry transaction) |
| `daily_entries` | `<dateKey>_<openid>` | submitCard (transaction with the stats inc and the streak) |
| `player_stats` | `<openid>` | submitCard (streak, PD-17) |
| `group_members` | `<openGId>_<openid>` | joinGroup only |
| `group_daily` | `<groupRef>_<dateKey>` | getGroupDay (cache of closed days) |
| `rounds` | 8-char base32 random | createRound, setClue, submitGuess, flipReveal |
| `guesses` | `<roundId>_<openid>` | submitGuess (transaction with the round counter) |
| `sub_grants` | `<roundId>_<openid>` | subscribeRound; claimed (`used`) in a transaction before sending |
| `card_reports` | auto | reportCard |
| `item_usage` | `itemId` | ensureDaily (auto-path memory, no personal data) |
| `anomalies` | `<openid>_<dateKey>_fast` | submitCard (observe-only) |
| `events` | auto | track + server events (`daily_gen`, `finalize_day`, `round_reveal`, `subscribe_send`, `board_list`) |
| `rate_limits` | `<bucket>_<openid>_<minute>` or `_d<dateKey>` | store.rateLimit / rateLimitDay |
| `app_config` | `live` | console only |
| `meta` | `launch` | ensureDaily (first day) |

## Database security rules

File: `database/rules.json`. **Every collection is `{"read": false, "write": false}`.** The mini game never reads or writes the database directly; all access goes through cloud functions, which run with admin rights and bypass these rules. Why each is deny-all: `daily_sets` (anchors and the final references: peeking before answering), `daily_card_stats` (histograms give the crowd median early), `daily_entries` (everyone's positions and openids), `player_stats`, `group_members` (openid <-> openGId), `group_daily`, `rounds` (the hidden `target`, host openid, salt), `guesses` (guesses before the reveal), `sub_grants` (openids), `card_reports`, `item_usage`, `anomalies`, `events`, `rate_limits` (forgeable counters), `app_config` (template and ad config are only exposed through `getDaily.features`), `meta`. A test asserts every collection the code touches has a deny-all rule and no rule exists for an unused collection.

## Indexes (add in the console; uniqueness never relies on indexes)

| Collection | Index | Used by |
|---|---|---|
| `daily_entries` | `dateKey + complete + _id` | getFriendBoard count/list, finalizeDay cursor pages |
| `daily_entries` | `firstAt` | cleanup |
| `group_members` | `groupRef`; `openid + groupRef`; `lastSeen` | member list, membership checks, cleanup |
| `rounds` | `status + createdAt`; `groupRefs + createdAt`; `createdAt` | sweepRounds, group page rounds list, cleanup |
| `guesses` | `roundId + late`; `ts` | reveal payload, cleanup |
| `sub_grants` | `roundId + used`; `used`; `grantedAt` | notify, sweep, cleanup |
| `daily_sets` | (`_id` order) | archive paging, previous-published lookup |
| `player_stats` | `updatedAt` | cleanup |
| `group_daily` | `computedAt` | cleanup |
| `events` | `ts`; `name + ts` | cleanup; KPI queries |
| `anomalies`, `card_reports` | `ts` | cleanup |
| `rate_limits` | `expireAt` | cleanup |

All point reads use the deterministic `_id`.

## Behaviour notes

- **No peeking.** `getDaily` returns refs only for answered cards; boards, positions, `mq` and the divisive card are withheld until the caller has completed that day; `unlockDistribution` for an open day only returns answered cards; `getRound` returns the target to the host only until the reveal; drafts are invisible to everyone but the host.
- **Scores are server-computed** from stored positions at the current references (live) or the frozen `final[5]` (from D+1 00:30 BJT). The client sends only positions.
- **Reveal races.** The 8th on-time guess flips the round to `revealed` in the same transaction as the guess; the host tap and the 24 h rule use a status-checked transaction; the 9th guess is stored `late`. Subscribe grants are claimed in a transaction before sending, so at most one message per grant.
- **Retention (spec 13).** `cleanup` (04:00 BJT) deletes `daily_entries` (by `firstAt`), `player_stats`, `group_members` (`lastSeen`), `group_daily`, `rounds`, `guesses`, `sub_grants`, `card_reports`, `anomalies`, `events` older than 180 days and expired `rate_limits`; keeps `daily_sets`, `daily_card_stats`, `item_usage`.
- **定分 percentile** uses `finalHist` bins of 5 points (101 bins): "超过全国 x%" = floor(share of complete dailies in strictly lower bins).
- `getArchiveDay` never returns histograms; the client calls `unlockDistribution` after the rewarded ad (the server cannot verify the ad; it only enforces the no-peek rule and 3/day).

## Tests

`npm test` (Node >= 20): in-memory fake DB with duplicate-`_id` errors, throwing `doc.get`, query limits, serialised transactions with rollback, array-contains equality; the SDK is mocked (including `subscribeMessage.send`); `Date.now` is controlled. Covers validation rejections, no score tampering, CARD_ORDER/CARD_DONE and parallel-submit idempotency, Beijing midnight and the 00:30 grace edges, TZ=UTC date keys, streak rules, the fast flag, group fixtures (leave-one-out 55, 群默契度), membership, hashing and no-openid responses, round state machine and reveal races, subscribe claims, finalizeDay (idempotent, lazy, resumable), archive/bonus/unlock, rules/secrets/identity/drift, track and cleanup.

## Risks and unverified platform behaviour

- **Duplicate `add` and missing `doc.get` error text** on the real cloud DB were not verifiable offline; `common/store.js` matches by pattern (`isDup`, `isNotFound`). The first real run must confirm both.
- **Transactions**: `submitCard` retries up to 3 times on conflict/abort errors; the real SDK's conflict error text is unverified. `_.inc` on a dotted array path (`hist.7`) and `_.remove()` are used as documented for wx-server-sdk >= 1.7; confirm on the real DB.
- `groupRefs` equality on an array field (`where({groupRefs: ref})`) relies on array-contains semantics; confirm.
- `function.config.json` (timeout, env) is applied by hand, see setup step 2. `finalizeDay` timeout is a spike value (E6).
- `getGroupDay`/`getFriendBoard` function-memory caches are per instance; ranks are always server data.
- Closed-day trend computation for a group with many members does up to 6 member scans on the first view of a week (then cached in `group_daily`).
