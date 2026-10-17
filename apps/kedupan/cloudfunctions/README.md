# 群友刻度盘 cloud functions (kedupan)

WeChat Cloud Development backend for the mini game `kedupan`. Spec: `docs/kedupan/spec.md` §11. The binding description of every function (request, response, errors, collections, timers) is `CONTRACT.md` in this folder; decisions are `TD-n` rows in `docs/kedupan/decisions.md` (this wave: TD-29 .. TD-40).

Status: code and tests complete. **Nothing is deployed** (no uploads, no WeChat network calls were made). Everything below is for the founder to do.

## How it is built

Every decision comes from `apps/kedupan/game/core` (`service.js`, `score.js`, `group.js`, `rounds.js`, `windows.js`, ...). A function only authenticates (`OPENID` from the trusted context, never from the event), validates (`core/input.js`), reads documents, calls the core, writes inside the transaction the core result needs, and returns the core's response. `game/js/mock-server.js` runs the same core, and `tests/` proves mock and functions answer identically (see Tests).

```
cloudfunctions/
  common/            shared helpers, source of truth (store.js, util.js, coreapi.js, daily.js, groups.js, rounds-db.js)
  <fn>/index.js, package.json, function.config.json (timeout + TZ), config.json (timer trigger; setClue: cloud-call permissions)
  <fn>/common, <fn>/core   copies made by `npm run sync` (common is committed, core is git-ignored)
  database/rules.json, database/indexes.json, storage/rules.json (deny-all storage rule, L3)
  scripts/sync-core.js, scripts/deploy-pack.js
  tests/             node --test
```

## Functions, deploy names, timeouts

**Deploy names (TD-29).** Folders keep their plain names in the repo. All apps share the test AppID's cloud environment, so each function is deployed as `kedupan_<name>` (for example `kedupan_getDaily`). The client maps names with `fnPrefix` in `game/js/build-config.js` (`kedupan_` when `cloudEnv` is the shared test environment, empty for the mock). `npm run pack` builds the upload folder with the prefixed names (see Deploy).

| Deploy name | Trigger | Timeout (s) | What it does |
|---|---|---|---|
| `kedupan_getDaily` | client | 10 | today's 5 cards, my answers/reveals, group dots, yesterday, streak, features; creates today's set if the timer missed it |
| `kedupan_submitCard` | client | 5 | the scoring write (transaction) |
| `kedupan_getArchive` / `kedupan_getArchiveDay` | client | 10 / 10 | closed days / one closed day |
| `kedupan_getBonusCard` | client | 5 | 加一题 (3 a day) |
| `kedupan_unlockDistribution` | client | 5 | national histogram (20 a day, TD-8) |
| `kedupan_joinGroup` | client | 5 | cloudID group entry to an opaque `groupRef` |
| `kedupan_getGroupDay` / `kedupan_getFriendBoard` | client | 10 / 10 | group page / friends-in-game board |
| `kedupan_createRound` `kedupan_setClue` `kedupan_getRound` `kedupan_submitGuess` | client | 5 each | host rounds |
| `kedupan_revealRound` | client | 10 | host reveal |
| `kedupan_subscribeRound` `kedupan_reportCard` `kedupan_track` | client | 5 each | opt-in grant, card report, analytics |
| `kedupan_agreeRules` `kedupan_reportClue` | client | 5 each | D-2: 发言规则 agreement; 举报 of a typed clue (hides it at once) |
| `kedupan_admin` | **console only** | 20 | D-2: takedown, strikes, restriction, kill switches (see "Typed clues" below) |
| `kedupan_genDaily` | timer `0 0 23 * * * *` (23:00 Beijing) | 20 | creates tomorrow's set |
| `kedupan_finalizeDay` | timer `0 40 0 * * * *` (00:40) | 300 | freezes references (定分) and builds the percentile histogram; resumable |
| `kedupan_sweepRounds` | timer `0 0 * * * * *` (hourly) | 60 | stale drafts, 24 h reveals, unsent subscribe messages |
| `kedupan_cleanup` | timer `0 0 4 * * * *` (04:00) | 60 | 180-day retention |

Timers: each timer function's `config.json` holds its trigger (`genDailyTimer`, `finalizeDayTimer`, `sweepRoundsTimer`, `cleanupTimer`). A trigger belongs to the function it is uploaded with, so deploying the folder `kedupan_genDaily` registers the trigger on `kedupan_genDaily`; nothing else references the unprefixed name. A client call to a timer function returns `FORBIDDEN`. `function.config.json` sets `TZ=Asia/Shanghai` and the timeout (nothing in the code depends on TZ).

## Environment variables (set in the cloud console, never committed)

| Name | Function(s) | Required | Meaning |
|---|---|---|---|
| `GROUP_REF_PEPPER` | `kedupan_joinGroup` only | **yes** | secret, 32+ random characters (for example `openssl rand -hex 24`); `groupRef = sha256(openGId + pepper)[0..16)`. Missing or shorter than 32 characters: `SERVER_CONFIG`. Changing it later orphans every group (new `groupRef`s). |
| `LAUNCH_DATE_KEY` | `kedupan_getDaily`, `kedupan_genDaily` | optional | `YYYYMMDD` of issue 1. Order: this variable, then `kedupan_meta/launch`, then the schedule's own `launchDateKey`, then the placeholder `20261101` (TD-30). |
| `SUBSCRIBE_MP_STATE` | reveal paths (`submitGuess`, `revealRound`, `getRound`, `sweepRounds`) | optional | `developer`, `trial` or `formal` for subscribe messages while testing |
| `KD_CACHE_SEC` | any | no | overrides the 60 s per-instance cache (tests use 0); leave unset |
| `ENV_KIND` | `kedupan_setClue` | **yes, set it explicitly** | `prod` on the production environment, `dev` on the shared test environment. Unset or unknown = `prod` (forces live moderation). |
| `MODERATION_MODE` | `kedupan_setClue` | optional | `live` (default) or `mock`. `mock` only with `ENV_KIND=dev` (mock words below); `prod` + `mock` makes every typed-clue call `SERVER_CONFIG` and logs `[ALERT] MODERATION_MODE=mock in production`. |
| `MOD_TEXT_DAILY_BUDGET` | `kedupan_setClue` | optional | dev + live only: WeChat text checks a day (default 80, protects the pre-publish quota) |
| `MOCK_SYNC_DELAY_MS` | `kedupan_setClue` | optional | mock mode: simulated latency, default 300 |
| `ADMIN_OPENIDS` | `kedupan_admin` | optional | openids allowed to call `admin` with an OPENID (fallback if the console test invocation turns out to carry one). Empty = console only. Not a secret, but do not commit it. |

No AppSecret, no `session_key`, no `code2Session` anywhere (a test scans for them). Payments: none in this game.

## Deploy (founder steps)

1. `cd apps/kedupan/cloudfunctions && npm run sync` then `npm run pack`. This copies `common/` and `game/core/` (including `content/spectra.v1.js`, the SERVER-ONLY answer key `content/anchors.v1.js` and, once generated, the SERVER-ONLY `content/schedule.v1.js`; the last two are in the game's `packOptions.ignore`, so they reach the cloud functions only, TD-62) into every function and writes the upload folder `apps/kedupan/game/cloudfunctions-deploy/` (inside the game project, gitignored, in `packOptions.ignore`) with the prefixed folder names and a `MANIFEST.json`. The sync prints a NOTE while `schedule.v1.js` is missing.
2. Generate the schedule if it is not there yet: `cd apps/kedupan/game && node tools/build-schedule.js` (writes `core/content/schedule.v1.js`; the launch date inside it is the placeholder `20261101` unless you pass the real one). Then `npm run sync && npm run pack` again. Without a schedule `getDaily` uses the auto path (works, but logs `[ALERT] schedule exhausted`).
3. In WeChat DevTools open the game project, with the cloud environment selected (the shared test environment). The project's `cloudfunctionRoot` is `cloudfunctions-deploy/` (already set in `game/project.config.json`; TD-59: a root outside the project folder is unverified in DevTools, so the pack output lives inside it). For each folder: right-click, "Upload and deploy: cloud install dependencies" (not "all files": core and common are already inside). For the four timer folders also choose "Upload triggers".
4. Console, Cloud Development, Cloud Functions: open `kedupan_joinGroup`, Configuration, Environment variables, add `GROUP_REF_PEPPER`. Optionally `LAUNCH_DATE_KEY` on `kedupan_getDaily` and `kedupan_genDaily` (they must match).
5. Console, Database: create the 21 collections listed in `database/rules.json` (all prefixed `kedupan_`), then paste each rule (`{"read": false, "write": false}`; the `_why` entries explain each one) and create the indexes in `database/indexes.json` (collection, name, keys). Rules and indexes are not applied automatically.
5b. **Cloud storage and access settings (L3, console, one time).** (a) Cloud Storage, Permissions, Custom rules: paste the contents of `storage/rules.json` (`{"read": false, "write": false}`). The game never uses storage; without the rule a default may leave files readable or writable. (b) Cloud Development, Settings: keep **anonymous / web (Web SDK) login DISABLED** and **HTTP access (HTTP 访问服务) DISABLED** for every function. Both must stay off: they are the only ways to call a function without a WeChat OPENID, and the timer functions rely on "no OPENID" plus the timer marker. (c) Do not add an HTTP trigger to any function.
5c. **Running a timer by hand** (console, Cloud Functions, Test): timer functions refuse any event without the platform's timer marker. Use the test event `{"Type":"Timer","TriggerName":"manual"}`. A call without it, or from a mini game, returns `FORBIDDEN`.
5d. **Rate limits (M3).** Every client function is limited per openid per minute (reads about 60, writes about 20; the table is `CONFIG.limits.perMinute` in `game/core/config.js`, CONTRACT section 1). Refusals return `RATE_LIMITED` with `scope: "minute"`; counters live in `kedupan_rate_limits` (`fn_<name>_<openid>_<minute>`, expire after 1 h, removed by `cleanup`). `board_list` events are sampled 1 in 10 (`every` is stored).
6. Seed the config (below), then set `cloudEnv` and `fnPrefix` in `game/js/build-config.js` (game engineer) and test with the mini game.

### Seeding (all in the console, all optional)

- `kedupan_app_config`, document `_id: "live"` (drives `features`; missing means ads and subscribe are off):
  ```
  { "subscribe": { "tmplId": "<template id from the MP console>", "fields": { "spectrum": "thing1", "mq": "number2", "time": "time3" } },
    "ads": { "banner": { "enabled": false, "adUnitId": "" }, "interstitial": { "enabled": true } },
    "updatedAt": 0 }
  ```
  `fields` maps our three values to the template's keywords; the template needs a text, a number and a time keyword.
- `kedupan_meta`, document `_id: "launch"`, `{ "dateKey": "YYYYMMDD" }`: normally written by the first set that is created, so seeding is only needed to pin the launch date without the env variable.
- Nothing else: `daily_sets` and the statistics documents are created by `genDaily` / the first `getDaily`.

### Reset after a test run (so the real launch date takes effect)

Delete, in the console: all documents of `kedupan_meta`, `kedupan_daily_sets`, `kedupan_daily_card_stats`, `kedupan_daily_entries`, `kedupan_player_stats`, `kedupan_item_usage`, `kedupan_group_daily`. Rounds and group members can stay. Then fix the launch date as above.

### Daily operation

- `kedupan_genDaily` runs at 23:00 for tomorrow. If it ever fails, the first `getDaily` of the day creates the set. Logs: `daily_gen` events; `[ALERT] schedule exhausted` means the schedule ran out (365 days) and the auto path is building days.
- `kedupan_finalizeDay` runs at 00:40; logs `[finalizeDay] ... not finished` mean it ran out of time and the next run resumes.
- Replacing a bad card: edit `kedupan_daily_sets/<YYYYMMDD>.cards[i]` (same index), append `{ts, idx, from, to}` to `edits`, and reset `kedupan_daily_card_stats/<YYYYMMDD>_<i>` to `hist` = 101 zeros and `n` = 0 (AC 24).

## Typed clues (D-2): moderation, reports, admin

The host types a clue (default tab) or picks a preset; 我在群里说 is gone (`clueMode:'chat'` is `INVALID_INPUT`; old rounds stay readable). Contract: `CONTRACT.md` (setClue, agreeRules, reportClue, admin, getRound `clue`/`me`, section 3b `core/clue.js`).

- **Fail closed.** Nobody but the author sees a typed clue until WeChat's text check returned `pass`. Anything else (error, timeout 2 s, unknown answer, quota, missing permission) is `MODERATION_BUSY`; `risky` is `TEXT_BLOCKED` plus a strike.
- **Cloud-call permissions** (uploaded with `kedupan_setClue` through its `config.json`): `wxa.game.contentSpam.msgSecCheck` (the 小游戏 text check; whether it works from our AppID is device pass E12) and `security.msgSecCheck` (fallback). After the upload check in 云开发, 云函数 `kedupan_setClue`, 云调用权限 that both are listed. If the game interface is refused, the founder can switch to the fallback without a release: run `kedupan_admin` with `{"op":"setModeration","textApi":"general"}`.
- **Set `ENV_KIND`** on `kedupan_setClue` (`prod` for production, `dev` for the shared test environment). Mock moderation (`MODERATION_MODE=mock`, words 测试违规 risky / 测试复审 review / 测试繁忙 error) exists only with `ENV_KIND=dev`.
- **Kill switches** (take effect within 10 s, no release): `kedupan_admin` `{"op":"setUgc","createEnabled":false}` stops new typed clues (presets stay); `{"op":"setUgc","viewEnabled":false}` serves every typed clue as paused (the emergency stop).
- **`kedupan_admin` is console-only.** Run it from 云开发 -> 云函数 -> `kedupan_admin` -> 测试 with a JSON event; the console test carries no OPENID. Keep HTTP access OFF for it. A call that does carry an OPENID is `FORBIDDEN` unless listed in `ADMIN_OPENIDS`. Ops: `listReports`, `getRound`, `sample`, `upholdReport`, `dismissReport`, `hideClue`, `restoreClue`, `deleteClue`, `restrict`, `liftRestriction`, `setUgc`, `setModeration` (arguments in CONTRACT.md); each write appends an `audit_log` row.
- **Daily routine (Handoff H16):** `listReports {"state":"open"}` and `sample {"n":20}` every day for the first 4 weeks, then at least every 2 days. A report hides the clue at once, so a slow queue only delays restores and strikes. `kedupan_sweepRounds` logs `[ALERT] clue report open > 48 h` and `[ALERT] moderation busy` (>= 50% of >= 20 checks of the last hour); alert only, nothing is paused automatically.
- **Strikes** (rolling 30 days): a `risky` verdict or an upheld report. 1 = one-time warning, 2 = 24 h, 3 = 7 days, 4+ = 30 days and `reviewFlag` in `player_stats`. A restriction covers typed clues only. Admin can make it permanent (`restrict {openid, permanent:true}`).
- **Deletion request:** `deleteClue {roundId}` removes the text from the round; the `mod_log` evidence stays until the 180-day retention.
- **Volume limits:** 50 text checks per player per Beijing day (`RATE_LIMITED`, `scope:"day"`); the game interface allows 10,000/min and 10 M/day per AppID. Quota errors 750032/750033 are plain `MODERATION_BUSY` and log an `[ALERT]`.

## Collections (`kedupan_` prefix, one place: `common/util.js col()`)

`daily_sets daily_card_stats daily_entries player_stats group_members group_daily rounds guesses sub_grants card_reports item_usage anomalies events rate_limits reveal_views app_config meta` and, from D-2, `mod_log mod_quota clue_reports audit_log` (moderation evidence, quota counters, reports, admin audit trail; admin-only, deny-all). Function code passes unprefixed names to `common/store.js`; no function names the SDK collection itself (a test scans for it). All collections are deny-all for clients (`database/rules.json`): the game never reads the database, only cloud functions do, with admin rights. Why each one needs it is in the `_why` block of that file.

## Tests

```
npm test            # sync, then node --test tests/*.test.js   (about 40 s)
npm run check       # drift check of common/ and core/ copies
```

- `tests/contract-mock.test.js` and `tests/contract-real.test.js` run the SAME suite (`tests/suite/*.js`, 42 cases) against `game/js/mock-server.js` and against the real functions on the fake database. `tests/equivalence.test.js` runs one 87-call scripted scenario on both and compares every response after masking what is random by design (salts, row hashes, round ids, targets).
- `tests/suite/clues.js` (typed clues, AC 83-101) runs in the same two suites with the mock words standing in for WeChat. `tests/clues-real.test.js`: the real functions against a fake `wx-server-sdk` whose `msgSecCheck` the test controls: call parameters, every fail-closed outcome (risky, review, errors, non-zero errcode, missing/unknown `suggest`, quota, 2 s timeout), the `ENV_KIND`/`MODERATION_MODE` guard, the dev budget, the admin function, sweep alerts, retention and the analytics firewall. `game/tests/clue.test.js`: the pure rules (`core/clue.js` fixtures, strikes ladder, moderation decisions, event allowlist).
- `tests/functions.test.js`: what only the real functions have: identity, transactions and rollback, timers, 50,000-entry finalize and its resume, subscribe sends, `track` sanitising, cleanup, env, caches, rules, indexes, configs, sync and pack.
- `tests/helpers/fake-db.js` reproduces duplicate-`_id` errors, throwing `doc.get`, serialised transactions with atomic commit and rollback, `inc`, dotted updates and query limits; `tests/helpers/real-backend.js` stages the functions through the real sync into a temp folder and runs them against a fake `wx-server-sdk`.
