# 群友刻度盘: post-release setup (cloud, data, ads)

Author: release. Date: 2026-10-15; **revised 2026-10-16 for the typed clue (D-2): 21 collections, 24 functions, new env vars and permission, `app_config.ugc/moderation`, new section 11 (moderation operations).** **Confirmed against the D-2 code at final sign-off 2026-10-16** (24 function folders, 21 collections, the indexes in `database/indexes.json`, the env vars read by `common/env.js`, `setClue/config.json`, the op list of `admin/index.js`). Build: `kept-ideas/v1` at commit `84c68819a0e55c013bdeec5c2c00596d98277acb`. Source of truth for functions, timers, collections and env vars: `apps/kedupan/cloudfunctions/README.md`, `CONTRACT.md`, `database/rules.json`, `database/indexes.json` (read in full for this pack). Every step here is founder-only unless it says CTO; nothing was run. Secret values are never written down: only names.

## 1. Cloud environment: creation and naming
Where: WeChat DevTools (cloud icon) or the MP console -> 云开发, logged in as the **real AppID's** admin.
1. 开通云开发 for the real AppID. **[MONEY]** The plan and any pay-as-you-go billing is the founder's decision and attestation (Art. 5.3); check the current free quota and set a spending alert in the console [VERIFY current WeChat Cloud pricing; not researched here].
2. Create one environment: name **`kedupan-prod`** (the console appends a random suffix; the full **环境 ID** `kedupan-prod-xxxx` is what the build needs). Region: the default mainland region (the privacy guide promises mainland storage).
3. Give the CTO the environment ID (not secret). It goes into `node tools/release-config.js --env <envId>` (`build-upload.md` §2).
4. Naming rule: the environment is dedicated to this one game, so functions are deployed with **plain names** (`npm run pack -- --prefix ""`: `getDaily`, `submitCard`, ...). On the **shared test environment** (test AppID only) the names are `kedupan_<name>` (TD-29). Collections are always `kedupan_<name>` (server-side prefix, `common/util.js col()`). The client's `fnPrefix` must match the pack prefix.

## 2. Collections, rules and indexes (console -> 数据库)
Create these **21 collections** (names exactly; the four in bold at the end, `kedupan_mod_log`, `kedupan_mod_quota`, `kedupan_clue_reports`, `kedupan_audit_log`, are new with D-2; the pre-D-2 build had 17):
`kedupan_daily_sets`, `kedupan_daily_card_stats`, `kedupan_daily_entries`, `kedupan_player_stats`, `kedupan_group_members`, `kedupan_group_daily`, `kedupan_rounds`, `kedupan_guesses`, `kedupan_sub_grants`, `kedupan_card_reports`, `kedupan_item_usage`, `kedupan_anomalies`, `kedupan_events`, `kedupan_rate_limits`, `kedupan_reveal_views`, `kedupan_app_config`, `kedupan_meta`, **`kedupan_mod_log`, `kedupan_mod_quota`, `kedupan_clue_reports`, `kedupan_audit_log`**.

Rules: for **every** collection set the custom rule `{"read": false, "write": false}` (deny all clients; only cloud functions with admin rights read or write; the game never touches the database). Rules are not applied automatically; `database/rules.json` holds one entry per collection with the `_why`. `kedupan_reveal_views` (records that a player was served a round's answer, which closes late guessing for them) is deny-all like the rest. AC 68 and the rules test assert deny-all.

**Cloud Storage and access hardening (console, one time; `cloudfunctions/README.md` step 5b).** (a) Cloud Storage -> Permissions -> Custom rules: paste the contents of `apps/kedupan/cloudfunctions/storage/rules.json`, exactly `{"read": false, "write": false}`. The game never uses storage; without the rule a default may leave files readable or writable. (b) Cloud Development -> Settings: keep **anonymous / web (Web SDK) login DISABLED** and **HTTP access (HTTP 访问服务) DISABLED** for every function. These are the only ways to call a function without a WeChat OPENID, and the timer functions rely on "no OPENID plus the timer marker". (c) Never add an HTTP trigger to any function. Re-check (a) and (b) after any console change.

Indexes (console -> collection -> 索引管理; `database/indexes.json` is the source, collections unprefixed there, prefix them with `kedupan_`). **Total: 31 indexes on 16 collections** (D-2 adds 9: `rounds.clueMode_clueMod.ts`, `mod_log` x3, `mod_quota.ts`, `clue_reports` x3, `audit_log.ts`; `guesses.roundId_late` was already in the file but missing from this table before 2026-10-16). Index names must match `indexes.json`; the file's `reasons` object says which function needs each one.
| Collection | Indexes (name: keys) |
|---|---|
| `daily_entries` | `dateKey_completeAt`: dateKey asc, completeAt asc; `openid`: openid asc |
| `player_stats` | `updatedAt` |
| `group_members` | `groupRef`; `openid_groupRef`: openid asc, groupRef asc; `lastSeen` |
| `group_daily` | `computedAt` |
| `rounds` | `createdAt`; `status_createdAt`: status asc, createdAt asc; **`clueMode_clueMod.ts`: clueMode asc, clueMod.ts asc (new, D-2: `admin sample`, passed typed clues of the last 24 h)** |
| `guesses` | `roundId`; **`roundId_late`: roundId asc, late asc (reveal views: on-time guesses in full, late capped)**; `groupRef_ts`: groupRef asc, ts desc; `ts` |
| `sub_grants` | `roundId_used`: roundId asc, used asc; `used_grantedAt`: used asc, grantedAt asc; `grantedAt` |
| `card_reports`, `anomalies` | `ts` |
| `events` | `ts`; `name_ts`: name asc, ts asc |
| `rate_limits` | `expireAt` |
| `reveal_views` | `ts` (ascending; used by `cleanup`, 180 days) |
| `mod_log` | `ts` (cleanup); `roundId` (admin `getRound`); `kind_ts`: kind asc, ts asc (`sweepRounds` busy-rate alert: typed-clue checks of the last hour) |
| `clue_reports` | `ts` (cleanup); `state_ts`: state asc, ts asc (`listReports`, `sweepRounds` 48 h alert); `roundId` (admin `getRound`, `upholdReport`, `dismissReport`) |
| `audit_log` | `ts` (cleanup) |
| `mod_quota` | `ts` (cleanup; the `_id` is the date key) |
| `daily_sets`, `daily_card_stats`, `item_usage`, `app_config`, `meta` | none (`_id` only) |

## 3. Functions: deploy names, config, environment variables
Folder `apps/kedupan/game/cloudfunctions-deploy/` after `npm run pack -- --prefix ""`. In DevTools, for each folder: right-click -> 上传并部署：云端安装依赖 (not "all files": `core/` and `common/` are already inside). For the four timer folders also choose **上传触发器**.

| Function | Trigger | Timeout |
|---|---|---|
| `getDaily` | client | 10 s |
| `submitCard` | client | 5 s |
| `getArchive`, `getArchiveDay` | client | 10 s |
| `getBonusCard`, `unlockDistribution`, `joinGroup`, `createRound`, `setClue` (the WeChat text check inside it has a 2 s timeout), `getRound`, `submitGuess`, `subscribeRound`, `reportCard`, `track` | client | 5 s |
| **`agreeRules`, `reportClue`** (new, D-2; names confirmed against the code) | client | 5 s |
| **`admin`** (new, D-2) | **console only** (a call with an OPENID returns `FORBIDDEN` unless the openid is in `ADMIN_OPENIDS`); never from the game | 20 s |
| `getGroupDay`, `getFriendBoard` | client | 10 s |
| `revealRound` | client | 10 s |
| `genDaily` | timer `0 0 23 * * * *` (23:00 Beijing), trigger name `genDailyTimer` | 20 s |
| `finalizeDay` | timer `0 40 0 * * * *` (00:40), `finalizeDayTimer` | 300 s |
| `sweepRounds` | timer `0 0 * * * * *` (hourly), `sweepRoundsTimer` | 60 s |
| `cleanup` | timer `0 0 4 * * * *` (04:00), `cleanupTimer` | 60 s |

**openapi permission (new, D-2).** `setClue` calls WeChat's game text check from the cloud function: its `config.json` must list the cloud-call permissions `wxa.game.contentSpam.msgSecCheck` (and `security.msgSecCheck` for the fallback API). Upload `setClue` with its `config.json` (上传并部署：云端安装依赖 includes it) and confirm in the console (云函数 -> setClue -> 配置 / 权限) that the permission is shown; a missing permission makes every typed clue answer `MODERATION_BUSY`, which fails closed but looks like an outage (device item E12).

Each `function.config.json` already sets `TZ=Asia/Shanghai` and the timeout (verify in the console after upload: 配置). A trigger belongs to the function it is uploaded with; a timer function called by a client returns `FORBIDDEN` (expected).

**Environment variables** (console -> 云函数 -> function -> 配置 -> 环境变量). Names only; values are set by the founder and never shared:
| Name | Function(s) | Required | Note |
|---|---|---|---|
| `GROUP_REF_PEPPER` | `joinGroup` **only** | **yes** | secret; **at least 32 random characters**, e.g. generate locally with `openssl rand -hex 24` (48 characters) and paste straight into the console; a value shorter than 32 characters gives `SERVER_CONFIG` and `joinGroup` refuses every call. Changing it later orphans every group, so back it up in the company password manager. |
| `LAUNCH_DATE_KEY` | `getDaily` **and** `genDaily` (same value on both) | optional but recommended | `YYYYMMDD` of issue 1 = the real launch date; must equal the schedule's launch date (§9). Key order: env, then `kedupan_meta/launch`, then the schedule's date, then 20261101 (TD-30). |
| `SUBSCRIBE_MP_STATE` | `submitGuess`, `revealRound`, `getRound`, `sweepRounds` | only while testing the subscribe message | `developer`, `trial` or `formal`; leave **unset** (formal) in production |
| `KD_CACHE_SEC` | any | no | leave unset |
| **`MODERATION_MODE`** | `setClue` | **yes in production: `live`** | `live` calls WeChat; `mock` (dev only) answers from test words. With `ENV_KIND=prod` a mock makes every typed-clue call return `SERVER_CONFIG` and logs `[ALERT]` (`common/env.js ugcGuard`); unset `MODERATION_MODE` means `live`, unset `ENV_KIND` means `prod` |
| **`ENV_KIND`** | `setClue` (read only in `common/env.js`; `admin` does not read it) | **yes in production: `prod`** | `prod` forces live moderation; `dev` allows mock and the daily budget |
| **`ADMIN_OPENIDS`** | `admin` | optional | comma-separated openids allowed to call `admin` from a client; leave empty if you operate from the console test invocation (which carries no OPENID); never paste openids in chat |
| `MOD_TEXT_DAILY_BUDGET`, `MOCK_SYNC_DELAY_MS` | `setClue` | dev only | leave unset in production |

No AppSecret, `session_key` or `code2Session` exists anywhere; do not add one.

## 4. Seed data and `app_config`
Everything is created by the functions except `app_config`:
- Console -> `kedupan_app_config` -> add a record with **`_id`: `live`** (a missing record means ads and subscribe are off):
```json
{ "subscribe": { "tmplId": "<template id, section 5>", "fields": { "spectrum": "thing1", "mq": "number2", "time": "time3" } },
  "ads": { "banner": { "enabled": false, "adUnitId": "" }, "interstitial": { "enabled": true } },
  "ugc": { "createEnabled": true, "viewEnabled": true },
  "moderation": { "textApi": "game" },
  "updatedAt": 0 }
```
  - `ugc` (new, D-2): the two **kill switches**, editable in the console without a release. `createEnabled: false` = no new typed clues (the game shows the preset tab only); `viewEnabled: false` = every typed clue is shown as 「提示暂不显示」 (the emergency stop). Presets and guessing are unaffected by both. `moderation.textApi`: `game` normally; `general` selects WeChat's general text check as the fallback if the game interface fails device item E12. A missing record means defaults, but create it so the switches can be edited and audited.
  - `subscribe.tmplId`: from §5. Until it exists leave `"subscribe"` out entirely (the 提醒我 offer stays hidden).
  - `ads.banner`: keep `enabled: false` until the banner unit exists and E10 passed; then `enabled: true`, `adUnitId: "<banner unit id>"`.
  - `ads.interstitial`: caps default in code (`everyNSets: 2`, `minLifetimeSets: 3`, `minGapSec: 120`, `maxPerDay: 6`, `enabled: true`) and are clamped (`everyNSets >= 2`, `minLifetimeSets >= 2`, `minGapSec >= 60`, `maxPerDay <= 8`). To tune, add `"interstitial": { "enabled": true, "everyNSets": 3, "minGapSec": 180, "maxPerDay": 4 }`. Config reads are cached 60 s per function instance.
- `kedupan_meta` `_id: "launch"`, `{ "dateKey": "YYYYMMDD" }`: written automatically by the first set that is created; seed only to pin the date without the env variable.
- **Seeding of the first days:** nothing to import. The schedule (365 days) ships inside the functions (`core/content/schedule.v1.js`); `genDaily` copies tomorrow's five cards into `kedupan_daily_sets` at 23:00; the first `getDaily` of the day creates the set if the timer missed it. **Before launch day, to avoid an empty first day:** after deploying, call the game once (first launch) or run `genDaily` from the console "云端测试" on the evening before launch with the test event `{"Type":"Timer","TriggerName":"manual"}`. Timer functions (`genDaily`, `finalizeDay`, `sweepRounds`, `cleanup`) refuse any event without the platform's timer marker: an empty event, or a call from the game, returns `FORBIDDEN` (README step 5c). Alternatively simply open the game once on the evening before launch.

## 5. Subscribe template (HANDOFF section 8)
MP -> 订阅消息 -> 公共模板库 -> choose a **one-time (一次性)** template for games with: a **text/thing** keyword (spectrum, e.g. 便宜↔贵), a **number** keyword (本题默契值), a **time** keyword. Copy the **模板 ID** into `app_config.subscribe.tmplId`, and set `fields` to the template's actual keyword keys (defaults `thing1`, `number2`, `time3`). Title in our copy: "刻度题揭晓了"; no template with exactly that title is guaranteed, pick the closest neutral one [VERIFY availability in the console]. Device item E7 tests it: accept, exactly one notice at the reveal, opens `r=<id>`.

## 6. Ad units after 流量主
1. Eligibility [AD page, read 2026-10-15]: any one of: cumulative UV > 500 with no fake traffic or serious violations; game circle active + 5 official posts; a same-company mini program already in 流量主 and earning continuously for one quarter.
2. MP -> 流量主 -> 开通 (agreement signing and bank/settlement details are the founder's legal and financial acts).
3. 流量主 -> 广告管理 -> create three ad units: a **激励视频** (rewarded), a **插屏** (interstitial), a **Banner** (小游戏 banner).
4. Put the rewarded and interstitial IDs in the client: `js/build-config.js` `adUnits: { rewarded: '...', interstitial: '...' }` (CTO edits in the release build, `build-upload.md` §2; ad unit IDs are not secrets). Put the banner ID in `kedupan_app_config.live.ads.banner` with `enabled: true` when wanted.
5. A new build and upload is required for step 4's client part (a minor version, e.g. 1.0.1).
6. Device items E5 (rewarded no-fill shows no share page; interstitial 2001/2002 skipped silently) and E10 (banner only on group page, friend board, archive list; at least 24 pt gap).
Until then: rewarded placements behave as no-fill (one free grant per placement per day), interstitial never shows, banner is off; nothing core depends on ads.

## 7. Timers: first checks (device item E6)
After the first night: `genDaily` ran at 23:00 once (event `daily_gen`), `finalizeDay` at 00:40 (event `finalize_day`; a log "not finished" means it resumes), `sweepRounds` hourly, `cleanup` 04:00. Double fire is a no-op by design. If `genDaily` failed, the first `getDaily` creates the set. A log `[ALERT] schedule exhausted` means 365 days have passed and the auto path is building days (regenerate a new schedule, §9).

## 8. Operating notes
- Replace a bad card: console -> `kedupan_daily_sets/<YYYYMMDD>`: edit `cards[i]` (same index), append `{ts, idx, from, to}` to `edits`, reset `kedupan_daily_card_stats/<YYYYMMDD>_<i>` to `hist` = 101 zeros and `n` = 0. Also remove the item in the next content release.
- Card reports: review `kedupan_card_reports` (item id and reason; no text) weekly. **Clue reports and moderation: section 11 (daily for the first 4 weeks).**
- Reset after a test run (so the real launch date takes effect): delete all documents of `kedupan_meta`, `kedupan_daily_sets`, `kedupan_daily_card_stats`, `kedupan_daily_entries`, `kedupan_player_stats`, `kedupan_item_usage`, `kedupan_group_daily`. Rounds and group members can stay. After typed-clue tests on the real environment also delete the test rows of `kedupan_mod_log`, `kedupan_mod_quota`, `kedupan_clue_reports` and `kedupan_audit_log`, and the test rounds that hold test clues (and any old test round with `clueMode: chat`, which still displays). **Irreversible data deletion: founder decision (Art. 5.6).**
- Content review feedback after launch: compare each item's anchor with the observed median (histograms) and fix outliers in a content release.

## 9. Regenerating the schedule when the launch date is not 20261101
The shipped `core/content/schedule.v1.js` is generated for launch **20261101**, 365 days, and its season and festival placement is relative to that date. If the launch date differs, the **CTO** (a code-file change on the release branch) runs:
```
cd apps/kedupan/game
node tools/build-schedule.js --launch YYYYMMDD     # writes core/content/schedule.v1.js
node tools/build-schedule.js --check               # expect: schedule ok: 365 days from YYYYMMDD
npm test
cd ../cloudfunctions && npm test && npm run pack -- --prefix ""
```
then redeploy **all** functions (the schedule is copied into each), and set `LAUNCH_DATE_KEY=YYYYMMDD` on `getDaily` and `genDaily` (or leave it unset, in which case the schedule's own date is used). If any daily set was already created for the old date (test runs), do the "Reset after a test run" in §8 first. Festival dates for 2027 and 2028 in `core/schedule.js` should be re-checked against the State Council notices when published (TD-43). The seasons assume the Beijing calendar.

## 10. KPIs to watch (spec §1, §12; direction §10)
Healthy / watch: share rate (completed dailies with a share tap) >= 8% / < 3%; card-open-to-play >= 30% / < 15%; host rounds revealed with >= 2 guesses >= 40% / < 20%; archive sets per session >= 2 / < 1.2; D1 >= 35% / < 25%; D7 >= 15% / < 8%; groups with >= 3 completers on a day >= 25% / < 10% of active groups. Queries: `qa-kpi.test.js` in `cloudfunctions/tests/` holds one query per KPI on the `events` collection; group activation = `daily_entries` x `group_members`.

## 11. Moderation operations for the typed clue (D-2) [COMPLIANCE: UGC]
Source: spec §11.6-11.8, §12 and Handoff H14-H16. The admin op names below match `admin/index.js` (`listReports`, `getRound`, `sample`, `upholdReport`, `dismissReport`, `hideClue`, `restoreClue`, `deleteClue`, `restrict`, `liftRestriction`, `setUgc`, `setModeration`; checked 2026-10-16). A report **hides the clue at once** for everyone, so a slow queue never keeps bad text visible; the routine only decides restores and strikes and finds what nobody reported.

**Routine (H16): every day for the first 4 weeks after launch, then at least every 2 days.** The founder or a named delegate, in the cloud console (云函数 -> `admin` -> 云端测试, a call with no OPENID):
```
{ "op": "listReports", "state": "open", "limit": 50 }     // oldest first, with the clue text
{ "op": "sample", "n": 20 }                                  // random passed typed clues of the last 24 h
```
For each open report: look at the clue.
| Decision | Call |
|---|---|
| Report is right | `{ "op": "upholdReport", "roundId": "<id>" }` (stays hidden, **one strike** to the host) |
| Report is wrong | `{ "op": "dismissReport", "roundId": "<id>", "restore": true }` (shown again; `false` keeps it hidden) |
| Need detail (clue text, WeChat verdict, reports, the host's strikes and openid) | `{ "op": "getRound", "roundId": "<id>" }` |
| A sampled clue is bad | `{ "op": "hideClue", "roundId": "<id>" }`, then `restrict` the host if serious |
| Wrongly hidden | `{ "op": "restoreClue", "roundId": "<id>" }` |
| Deletion request (via 设置 -> 联系我们/反馈) | `{ "op": "deleteClue", "roundId": "<id>" }` (text removed from the round; the `mod_log` evidence stays to day 180) |
| Restrict / release a player | `{ "op": "restrict", "openid": "<openid>", "days": 7 }` (or `"permanent": true`; 4 or more strikes in 30 days are flagged `reviewFlag`) / `{ "op": "liftRestriction", "openid": "<openid>" }` |
Strike ladder (rolling 30 days; one strike per `risky` verdict and per upheld report): 1 = one-time warning, 2 = 24 h, 3 = 7 days, 4 or more = 30 days plus the review flag. The restriction covers typed clues only. Every op writes `audit_log`.

**Emergency stops (no release needed):** `{ "op": "setUgc", "createEnabled": false }` (no new typed clues), `{ "op": "setUgc", "viewEnabled": false }` (all typed clues hidden as 「提示暂不显示」), `{ "op": "setModeration", "textApi": "general" }` (fallback interface). There is **no automatic circuit breaker**: every failure already fails closed and the host can always use presets (PD-33).

**Alerts to watch in the function logs** (`sweepRounds` hourly): `[ALERT] clue report open > 48 h`; `[ALERT] moderation busy` (at least 50% of at least 20 text checks in the last hour were `busy`); `[ALERT]` for mock moderation in production; permission errors on `wxa.game.contentSpam.msgSecCheck`.

**Moderation KPIs (watch, not gates; definitions from spec §12; the "watch" values are release's INFERENCE, no gate):**
| KPI | Definition | Watch if |
|---|---|---|
| Typed share | `round_clue(text)` / `round_clue` | near 0 for a week (the tab design is not working) or near 100% with a high tab-2 link rate (people are stuck) |
| Local rejection rate by reason | `clue_result(rejected)` by `reason` | one reason above about 30% of attempts: the hint copy or the rule is too strict |
| Block rate | `clue_check(risky)` / `clue_check` | above about 3%; sudden rise = a probing user or a campaign |
| Busy rate and latency | `clue_check(none)` share; `latencyMs` p50/p95 by `api` | busy above about 5%, p95 above 1.5 s (E12 target is under 2 s) |
| Report rate | `clue_report(ok)` / rounds with a typed clue | above about 2%; any report older than 48 h is an ops miss |
| Tab-2 fallback | `clue_tab(via: link)` / clue steps | high and rising: the empty box intimidates people |
| Strikes and restrictions | `strike`, `restrict` events | any `permanent` or review flag needs a decision the same week |
No event carries clue text; the text itself exists only in `rounds.clueText` and in `mod_log` for non-pass results.
