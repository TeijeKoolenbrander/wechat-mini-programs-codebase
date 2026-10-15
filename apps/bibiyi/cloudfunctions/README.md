# 比一比 (bibiyi) cloud functions

WeChat Cloud Development backend for the mini game `bibiyi`. Spec: `docs/bibiyi/spec.md` §3.8, §4.3-4.4, §5, §8, §11, §13, §16, §17. Decisions: `docs/bibiyi/decisions.md` (PO-9 server-stepped runs, PO-15 shared ranks, PO-17 history lock, PO-23 reports, PO-33 retention, PO-34 observe-only flags).

Status: code and tests complete and passing against the **real game core** (`apps/bibiyi/game/core`, synced by `npm run sync`) and the real daily pool (`game/tools/out/daily-facts.json`, 214 facts). The adapter `common/coreapi.js` is the only file that touches the core. Not deployed (no AppID or cloud environment yet).

## Functions

| Function | Trigger | Timeout (s) | Purpose |
|---|---|---|---|
| `getDaily` | client | 10 | status only (no questions): issue, theme, my status/run/result, day streak, bests, features; lazily creates the deck if `genDaily` missed; finalizes the caller's expired open ranked runs |
| `genDaily` | timer `0 0 23 * * * *` (UTC+8) | 60 | builds **tomorrow's** deck from `daily_facts`, with the analytic difficulty gate; idempotent |
| `startRun` | client | 5 | starts/resumes a server-stepped daily-deck run (ranked, challenge-as-daily, or friendly); returns question 1 or the current open question + answered pairs |
| `answer` | client | 5 | judges one tap on the server; reveals the bottom value; returns the next question or ends the run (one transaction) |
| `submitRun` | client | 10 | **free runs only**: rebuilds the deck from `(seed, group, versions)`, replays answers, server streak is authoritative |
| `createChallenge` | client | 5 | one challenge per own finished run (daily-deck run or validated free run) |
| `getChallenge` | client | 5 | challenge entry model; never answers or facts |
| `subscribeChallenge` | client | 5 | owner's one-time subscribe grant |
| `joinGroup` | client | 5 | cloudID-decrypted group entry -> opaque `groupRef` |
| `getBoard` | client | 5 | hashed server-ranked rows `[h, n, s, k?]`, membership check, cap, 60 s cache |
| `getHistory` | client | 5 | 往期 list and issue detail; the full deck unlocks only after D+1 00:30 BJT |
| `reportFact` | client | 5 | 数据有误 reports (fixed reasons), rate limit, auto-suspend at 5 distinct reporters |
| `track` | client | 5 | analytics batch (<= 50), rate limited |
| `cleanup` | timer `0 0 4 * * * *` (UTC+8) | 60 | window finalization, 180-day retention, calibration roll-up, anomaly and report-rate checks |

Every function returns `{ok:true,...}` or `{ok:false, code, message}` and never throws to the client. Codes (spec 11.3): `INVALID_ACTIONS`, `INVALID_ORDER`, `ALREADY_PLAYED`, `NOT_STARTED`, `WINDOW_CLOSED`, `DECK_NOT_FOUND`, `DAILY_UNAVAILABLE`, `CHALLENGE_EXPIRED`, `OWN_CHALLENGE`, `RUN_NOT_FOUND`, `UNKNOWN_FACT`, `RATE_LIMITED`, `NOT_MEMBER`, `NOT_GROUP`, `BAD_CLOUDID`, `NO_TEMPLATE`, `NOT_OWNER`, `UNAUTHENTICATED`, `FORBIDDEN`, `SERVER_CONFIG`, `INTERNAL`. Extra fields ride along on some errors: `ALREADY_PLAYED` carries `{clientRunId, result}`, `WINDOW_CLOSED` carries `{result}`, `INVALID_ORDER` carries `{expectedK}`.

Identity is always `cloud.getWXContext().OPENID` (read in `common/store.js` only; a test enforces it). `genDaily` and `cleanup` are timer functions: a call that carries an OPENID is rejected with `FORBIDDEN`.

## Trust properties and where they are enforced

| Property | Mechanism | Tests |
|---|---|---|
| Daily facts never reach the client ahead of time | the deck lives only in `daily_decks` (read by functions); `startRun`/`answer` return one question at a time, bottom card without value/raw/note/source; answered pairs only for `k < current`; `getHistory` deck locked until D+1 00:30 | `answer.test.js` (full scripted run, captured payloads), `history.test.js` |
| Answers are checked on the server | `answer` compares the choice with `core.correctChoice(a, b)` on server-held values; `submitRun` replays the rebuilt deck | `answer.test.js`, `free.test.js` |
| One ranked daily per openid | deterministic `run_progress` `_id = <dateKey>_<openid>` (`add`), `daily_results` `_id` likewise; second `startRun` resumes or returns `ALREADY_PLAYED` | `answer.test.js` |
| First answer per question is final | transaction on `run_progress`; repeats (same or other choice, concurrent or later) return the stored outcome | `answer.test.js` |
| Streak integrity | streak is computed only in `answer`/`replayFree`; client values are advisory (`mismatch` flag); one transaction writes run + `daily_results` + `daily_stats.hist` + `player_stats` | `answer.test.js`, `free.test.js` |
| No openids in responses | boards hash with a per-day salt; no function returns an openid/openGId (`groupRef` is a peppered hash) | `board.test.js`, `answer.test.js` |
| Challenge spoiler lock | `getChallenge` returns owner 连对, kind, issue/theme only; no answers or facts; free challenges return the (public) seed | `challenge.test.js` |
| `reportFact` limits | fixed reason keys, 20/day/openid (`RATE_LIMITED`, nothing stored), one doc per (fact, player), 5 distinct reporters in 7 days suspend | `report.test.js` |
| Nightly generation is idempotent | `add` of the fixed `_id = YYYYMMDD`; double-fired timer / lazy race creates one deck | `daily.test.js` |
| No ads/continue on daily-deck runs | `answer` has no continue path (code-search test); 再答一次 exists only in `submitRun` replay | `security.test.js` |

## Layout and the shared core

```
cloudfunctions/
  common/            shared helpers (source of truth) -> copied to <fn>/common by sync
  <fn>/index.js, package.json, function.config.json, config.json (timers / openapi permissions)
  scripts/sync-core.js, scripts/import-daily-facts.js
  database/rules.json
  tests/             node --test; helpers/ = fake db + harness
```

A cloud function deploys as one folder, so shared code is copied in:

```
npm run sync     # common/ and the core -> <fn>/common, <fn>/core
npm run check    # fails if any copy is missing or differs (drift check)
npm test         # sync first (pretest), then everything, including the drift tests
```

- `<fn>/common/` copies are committed (source: `common/`). `<fn>/core/` copies are generated and git-ignored (the core is owned by the game).
- **The core** is `apps/bibiyi/game/core`, the same code the client runs (decks, question and reveal payloads, judging, the difficulty gate), so both sides cannot disagree. `tests/` run on it and on the real daily pool; `core contract` in `security.test.js` checks the calls the adapter makes.
- `common/coreapi.js` converts between the core (decks of fact ids, an index) and the backend (deck documents of ids, `[{a,b}]` fact objects). Question, reveal and answered-pair payloads are the core's own `question.js` builders, so a server-stepped question has exactly the shape of a local one.
- **Client contract:** `tests/client-contract*.test.js` boot the real game (real controller and renderers) against these handlers; `tests/mock-parity.test.js` runs one scripted session against these functions and the game's mock-server and fails on any shape difference. Errors are `{ok:false, code, message}`; the rarity is `{pct, total}` or null; `theme` is the key and `themeLabel` the label (empty in v1: no weekday themes).

## Environment variables (cloud environment config; never committed)

| Name | Required | Purpose |
|---|---|---|
| `GROUP_REF_PEPPER` | yes | secret pepper: `groupRef = sha256(openGId + pepper)[0..16)`; also keys the challenge-id hash. Without it `joinGroup` and `createChallenge` return `SERVER_CONFIG`. Set on `joinGroup` and `createChallenge` |
| `TZ` | `Asia/Shanghai` | in each `function.config.json`. Date keys use the core's explicit UTC+8 arithmetic and the weekday helper is calendar-based, so the code does not depend on it (tests run with `TZ=UTC` and unset) |
| `LAUNCH_DATE_KEY` | optional | `YYYYMMDD` of issue 1. If unset, the date of the first deck ever created is stored once in `meta/launch` |
| `JOINGROUP_RETURN_OPENGID` | optional, `1` | only if the device spike forces the `groupid` route: `joinGroup` then also returns the openGId |

No AppSecret, no `session_key`, no `code2Session` anywhere (a test fails if those strings appear).

## Cloud environment setup (founder / whoever holds the console) — handoff H6

1. Create the cloud environment; set the env id in the client's `wx.cloud.init`.
2. For each function: upload and deploy (cloud install dependencies), then in the console set the **timeout** and **TZ** from `function.config.json` (explicit timeouts: the platform default of about 3 s is too short; the timeout is also read by the code for the 70% generation budget). I could not confirm that the console reads this file by itself, so apply it by hand or via the CloudBase CLI. `config.json` carries the timer triggers and the `subscribeMessage.send` openapi permission (`submitRun`, `answer`, `getDaily`, `cleanup`: all four can complete a challenge run).
3. Set `GROUP_REF_PEPPER` (random, 32+ chars; keep a copy in the team secret store) on `joinGroup` and `createChallenge`. Rotating it changes every `groupRef` and new challenge ids (old challenges stay valid, looked up by id).
4. Upload the timer triggers: `genDaily/config.json` (`0 0 23 * * * *`) and `cleanup/config.json` (`0 0 4 * * * *`), evaluated in UTC+8. One trigger per function; the first `genDaily` run builds the next day, and `getDaily` creates today's lazily the first time.
5. Create the 19 collections (below), paste the rules from `database/rules.json`, add the indexes.
6. **Load the daily facts** (next section) before the first `genDaily`/`getDaily`; without them both return `DAILY_UNAVAILABLE` (free play is unaffected).
7. Create `app_config/live` only when the matching H7/H8 items exist: `{subscribe:{tmplId, fields:{<templateKey>:{value}}}, ads:{banner:{enabled, adUnitId}, interstitial:{...}}}`. Missing = subscribe hidden, banner off, interstitial defaults; out-of-range interstitial values are clamped. Optionally create `fact_overrides/live` = `{suspended:[], errata:{}}` (the functions create it on first auto-suspend).
8. Device-pass items that touch the backend (spec §14): `genDaily` timer fires once at 23:00 BJT and a duplicate invocation is a no-op (E6); `answer` latency p50/p95 on mobile data (E7); cloudID decrypt (E1); `getBoard` payload size sets `boardListCap` (core config).

## Loading the daily facts (founder handoff step)

The daily pool is **server-only**: it is loaded into the cloud database and never ships in the game package. The content build (`apps/bibiyi/tools/build-content.js`) writes a server-only daily-facts export; this script turns it into a console-importable file.

```
node apps/bibiyi/cloudfunctions/scripts/import-daily-facts.js <daily-facts export> --version <contentVersion> [--out <file>] [--check]
```

- Export formats accepted: `.jsonl` (one fact per line), `.json` (array or `{facts:[...]}`), `.js` (module exporting an array or `{facts:[...]}`). Facts use the spec 3.2 shape.
- The script validates (required fields, `pool` must be `daily`, https URL, unique ids and labels per measure, finite positive values, integer years, label <= 10 and note <= 24 characters, known measure and status) and **writes nothing if anything is wrong**. `--check` validates only.
- Output: JSON Lines in the OS temp dir (or `--out`), one doc per fact: `{_id: "v<version>_<factId>", contentVersion, ...fact}`. The `v<version>_` prefix keeps the last two content versions side by side (decks pin their version, spec 3.9).
- Console: database > `daily_facts` > import > the file > file type **JSON Lines** (one JSON object per line) > conflict mode **upsert** (safe to re-run with a corrected file). Then **delete the file from disk. Never commit it** (it is the daily answer key; `*.import.jsonl` and `daily-facts*` are git-ignored here).
- `<contentVersion>` must equal the core's `LATEST_CONTENT_VERSION` (the functions read `daily_facts` for the live version). Expect 214 facts at contentVersion 1 (the real v1 daily pool; see docs/bibiyi/decisions.md); `genDaily` refuses to generate (`DAILY_UNAVAILABLE`, `[ALERT]`) with fewer than 30 usable facts.
- A monthly content release: import the new version's file, then redeploy the functions with the new core (the new `LATEST_CONTENT_VERSION`); the previous version's docs stay for pinned decks and can be deleted a month later.

## Collections

| Collection | `_id` | Written by | Notes |
|---|---|---|---|
| `daily_decks` | `YYYYMMDD` | genDaily, getDaily/startRun (lazy) | `add` of the fixed id is the uniqueness mechanism; `questions[40]:{a,b}` (fact ids), `gates`, `boardSalt`, `issueNo`, `theme`, pinned versions. Never returned to clients except one question at a time and, after the window, via `getHistory` |
| `daily_facts` | `v<N>_<factId>` | console import | the server-only daily pool |
| `run_progress` | ranked `<dateKey>_<openid>`; friendly `<openid>_<clientRunId>` | startRun, answer, finalize | server-stepped runs; the deterministic ranked id enforces one attempt |
| `runs` | `<openid>_<clientRunId>` | submitRun | validated free runs (idempotent) |
| `daily_results` | `<dateKey>_<openid>` | answer / finalizeRun (transaction) | the one ranked result; source of `getBoard`; has `endedAt` for retention |
| `daily_stats` | `YYYYMMDD` | transaction (`inc`) | `hist[41]`, `total` |
| `player_stats` | `<openid>` | finalize, submitRun, anomalies | day streaks, bests, flags, `suspect` |
| `group_members` | `<openGId>_<openid>` | joinGroup | server-decrypted membership |
| `challenges` | 8-char base32 | createChallenge | counters updated when answers finish |
| `sub_grants` | `<challengeId>` | subscribeChallenge | one grant per challenge; claimed in a transaction before sending |
| `fact_reports` | `<factId>_<openid>` | reportFact | one per (fact, player) |
| `fact_overrides` | `live` | reportFact (auto-suspend), ops | `suspended[]`, `errata{dateKey:[{k,factId,text}]}` |
| `fact_reveals` | `<factId>` | cleanup roll-up | cumulative reveal count (denominator of the report rate); no personal data |
| `answer_stats` | `<measure>_<bucket>` | cleanup roll-up | `{n, correct}` for calibration; no personal data |
| `anomalies` | `<openid>_<runId>_<kind>` | answer, submitRun | observe-only |
| `app_config` | `live` | console | remote config |
| `events` | auto | track, server events | analytics |
| `rate_limits` | `<bucket>_<openid>_<minute or date>` | several | counters, trimmed by cleanup |
| `meta` | `launch`, `rollup_<date>` | daily, cleanup | launch date; roll-up claim markers |

Added beyond spec 11.1: `daily_facts` (the daily pool lives in the DB), `fact_reveals` (report-rate denominator), `daily_results.endedAt`.

## Database security rules

File: `database/rules.json`. **Every collection is `{"read": false, "write": false}`.** Why each is deny-all: the mini game never reads or writes the database directly; all access goes through cloud functions, which run with admin rights and bypass these rules. A client could otherwise read `daily_decks`/`daily_facts` (the full deck with values: a complete answer key), `run_progress`/`runs` (other players' answers and timings), `daily_results`/`group_members`/`player_stats`/`sub_grants`/`fact_reports`/`anomalies`/`events` (openids, openGIds), `challenges`, `fact_overrides`, `app_config`, or forge results, group membership, counters, reports and rate limits. Nothing needs to be client-readable, so nothing is. A test asserts that every collection the code touches has a deny-all rule and that no rule exists for an unused collection (AC 85).

## Indexes (add in the console; uniqueness never relies on indexes)

| Collection | Index | Used by |
|---|---|---|
| `daily_facts` | `contentVersion` | genDaily pool load |
| `run_progress` | `openid + status + ranked` | getDaily/finalizeExpiredFor |
| `run_progress` | `status + ranked + dateKey` | cleanup leftovers |
| `run_progress` | `dateKey` | cleanup roll-up |
| `run_progress` | `openid + clientRunId` | createChallenge |
| `run_progress` | `openid + challengeId` | startRun/getChallenge answered check |
| `run_progress` | `startedAt` | cleanup retention |
| `runs` | `openid + challengeId`; `submittedAt` | answered check; cleanup, anomaly roll-up |
| `daily_results` | `dateKey`; `endedAt` | getBoard count + list; cleanup |
| `group_members` | `groupRef`; `openid + groupRef`; `lastSeen` | getBoard; cleanup |
| `challenges` | `createdAt` | cleanup |
| `fact_reports` | `factId + ts`; `ts` | reportFact 7-day count; cleanup |
| `anomalies` | `openid + ts`; `ts` | suspect count; roll-up, cleanup |
| `sub_grants` | `grantedAt` | cleanup |
| `player_stats` | `updatedAt` | cleanup |
| `events` | `ts`; `name + ts` | cleanup; KPI queries |
| `rate_limits` | `expireAt` | cleanup |

All point reads use the deterministic `_id`. `getHistory` lists `daily_decks` by `_id` (primary key order).

## Behaviour notes

- **Server-stepped run.** `startRun` creates `run_progress` (ranked: `<dateKey>_<openid>`) and returns question 1 (`{k, segmentStart, measure, subLabel, verbs, top{factId,label,valueText,unitText,approx,sourceText}, bottom{factId,label,unitText}}`). `answer` returns `{k, correct, choice, reveal{factId,value,valueText,unitText,approx,sourceText,note?}, streak, ended, next?|result?}`. On resume `startRun` returns the stored `clientRunId` (use it for `answer`), the open question and the answered pairs.
- **Ranked vs friendly.** Ranked: today's deck and the caller has no ranked run yet (home 开始, or a challenge on today's deck: kind `challengeDaily`). Friendly (kind `dailyFriendly`, `_id = <openid>_<clientRunId>`): a challenge on a past deck, or on today's deck after the caller's ranked run exists. Friendly runs never write `daily_results`, `daily_stats` or day streaks.
- **Window.** A ranked run accepts answers until D+1 00:30 BJT (inclusive). After that `answer` returns `WINDOW_CLOSED` with the result finalized at the current streak (`endReason: window`, `endS` = the last answer's time). `getDaily` (caller) and `cleanup` (everyone) finalize leftovers. While the grace window is open `getDaily` returns `graceRun {dateKey,k,streak}` and `startRun({mode:'daily', dateKey: yesterday})` resumes it (never creates).
- **Day streak** (`player_stats`): consecutive published days +1; a missed published day resets to 1; a date with no `daily_decks` document is skipped; a grace-window result counts for its date; the same date twice never double counts; finalizing an older date after a newer one never lowers the streak. `getDaily.myDays.current` keeps yesterday's streak visible all through today.
- **Rarity** (`{pct, total}` = share of players with a lower 连对, shown only at >= 30 results that day). `getDaily.myResult` and `answer.result` carry it for ranked runs.
- **Daily generation.** Candidate `attempt` 0..499 from the deck builder (`core.buildDailyDeck`) over daily facts that are active, not in `fact_overrides.suspended`, and not in the published decks within the repeat window (both directions); the first candidate that passes `core.evaluateDeck` is stored with `add`. No candidate within 500 tries or 70% of the timeout, or fewer than 30 usable facts: `[ALERT]` log, `daily_gen {failed:true}` event, `DAILY_UNAVAILABLE`, nothing written.
- **Free runs** (`submitRun`): the life (`lifeAtK`) must be the first miss; the miss does not count; a second miss, or an answer after the end, is `INVALID_ACTIONS`. An unfinished run (no miss, fewer than 60 answers) is accepted as a run that stopped. Challenge answers: first answer per player counts, `answerCount`/`bestAnswer` update, the owner's subscribe grant is claimed once.
- **Anomalies** (`fast`, `slow`, `order`, `mismatch`): one doc per (run, kind), ignored by every response; >= 5 in 7 days sets `player_stats.suspect`.
- **Retention (PO-33).** `cleanup` (04:00 BJT) removes `run_progress`, `runs`, `daily_results`, `challenges`, `fact_reports`, `sub_grants`, `anomalies`, `events`, `player_stats` (by `updatedAt`) older than 180 days and `group_members` with `lastSeen` older than 180 days, plus expired `rate_limits`. Kept: `daily_decks`, `daily_facts`, `daily_stats`, `answer_stats`, `fact_reveals`, `fact_overrides`, `app_config`, `meta`. Idempotent.
- **Roll-up.** `answer_stats` and `fact_reveals` for yesterday's deck, claimed first with `meta/rollup_<date>` (`add`): a re-run does nothing. A crash between the claim and the last write loses (part of) that day's calibration data; it never double counts.

## Tests

`npm test` (Node >= 20): in-memory fake DB with duplicate-`_id` errors, throwing `doc.get`, the 100/1000 row query limits, and rolled-back serialized transactions; the SDK is mocked (including `openapi.subscribeMessage.send`); `Date.now` is controlled. Functions run against the real game core and the real daily pool. Covers: generation, idempotency under double fire and lazy races, impossible gates (`DAILY_UNAVAILABLE`), the issue date at 15:59:59/16:00:00 UTC with `TZ=UTC`/unset, repeat window, suspension; full scripted runs with payload capture (no lookahead), idempotent/concurrent answers, `INVALID_ORDER`, window at 00:29/00:31, finalization atomicity, day streaks; challenges (spoiler lock, ranked/friendly/past/own/expired, counting, subscribe once, send failure); free-run replay and rejections; reports and auto-suspend; board hashing, ties, groups, cap modes; history lock at 00:29/00:31; cleanup retention, finalization, roll-ups and alerts; track; security (rules, identity, secrets, error-code coverage, drift, core contract, import script).

## Spec gaps decided (flag if you disagree)

1. **Daily facts live in the cloud DB (`daily_facts`)**, loaded by `scripts/import-daily-facts.js`, instead of spec 3.10's bundled `common/content/facts.all.v<N>.js`. The free pool for `submitRun`/`reportFact` comes from the core's bundled content.
2. `answer` without a started run is `NOT_STARTED`; `createChallenge` on an unknown/unfinished run is `RUN_NOT_FOUND`.
3. `reportFact` over the daily limit returns `{ok:false, code:'RATE_LIMITED'}` and stores nothing (AC 47: the client shows the thanks toast either way; the code lets it log `rateLimited`).
4. `startRun` also returns `clientRunId` (the stored one on resume), `themeLabel`, `deckLength`, `challenge.ownerStreak` for the in-run "已超过 TA" line; `getDaily` adds `graceRun`, `finalized` and `themeLabel`.
5. `daily_results` gets `endedAt` (retention) and `endS`; `fact_reveals` and `meta/rollup_<date>` are new; `getChallenge` free kind returns `seed`, `group`, versions and `ownerLifeUsed`.
6. A report on a **free-pool** fact is stored and counts toward suspension, but suspension only affects daily generation (free facts change with a client release).
7. Daily fact ids are not secret (they never encode values); `reportFact` therefore does not require the reporter to have seen the fact. The response never says whether a fact was suspended.
8. Unfinished free runs are accepted (see Behaviour notes); interstitial caps clamp as in spec 9.

## Risks and unverified platform behaviour

- **Fake core, not the real one.** Adapter and tests are written against the contract above; the first run with the real core may need small adapter changes. The fake's balance (pass rate ~78% of candidates) is meaningless for the real gate; AC 28-35 are core/tool tests, not covered here beyond the adapter.
- **Duplicate `add` and missing `doc.get` error text** on the real cloud DB were not verifiable offline. `common/store.js` detects them by pattern (`duplicate|already exist|-502001|E11000|unique`, `not exist|not found|-502002`). The first real run must confirm both; adjust `isDup`/`isNotFound` if the text differs.
- **Transactions:** `transaction.collection().doc().get/update/set` and `add`, and `_.inc` on a dotted array path (`hist.7`), are used as documented for wx-server-sdk >= 2.x; confirm on the real DB. `answer` and finalization use one transaction each; transaction throw-and-rethrow of `AppError` is assumed to pass through unchanged.
- **`answer` latency (E7).** Hot path: 2 point reads for the run lookup, cached deck and fact reads (10 min TTL per instance, so the first answer on a cold instance pays 3 extra reads), one transaction. Ending an answer adds `ensureStats` + `prevPublished` reads. Keep the function warm (min instances) if p95 > 1.5 s.
- `cloud.openapi.subscribeMessage.send` payload shape (`page`, `data` keys) depends on the founder's template (H7); `app_config.subscribe.fields` maps the template's keys.
- The 60 s `getBoard` cache is per instance; ranks are always server data.
- Roll-up reads every run document of the day into memory (fine for tens of thousands; paginate by hour if a day exceeds ~100k runs).
