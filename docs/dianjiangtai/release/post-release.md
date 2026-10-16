# 点将台: post-release setup (cloud, data, ads)

Author: release. Date: 2026-10-15. Build: `kept-ideas/v1` @ 3df1b89333d8d05b1d008ce57bfd29b2d1f46452 (the code is identical to 6582873). Source of truth for functions, timers, collections, env vars and indexes: `apps/dianjiangtai/cloudfunctions/README.md`, `database/rules.json`, `storage/rules.json`, each `function.config.json` and `config.json` (all read in full for this pack). The seed-bank commands were **run for real on a scratch copy** (outside the repo, files deleted afterwards): `simstats.js --bank 60 --bank-only` wrote 60 accepted seeds in 347 s on 8 workers (about 253 candidates per seed) and `prepare-bank.js` wrote 60 entries, 0 skipped, all contentVersion 2 / configVersion 3 / gateVersion 1, `used:false`. Every step here is founder-only unless it says CTO; nothing was run against a real environment. Secret values are never written down: only names.

## 1. Cloud environment: creation and naming
Where: WeChat DevTools (cloud icon) or the MP console -> 云开发, logged in as the **real AppID's** admin (`wx172906d7bfd6036f`).
1. 开通云开发 for the real AppID. **[MONEY]** The plan and any pay-as-you-go billing is the founder's decision and attestation (Art. 5.3); check the current free quota and set a spending alert in the console [VERIFY current WeChat Cloud pricing; not researched here].
2. Create one environment: name **`dianjiangtai-prod`** (the console appends a random suffix; the full **环境 ID** `dianjiangtai-prod-xxxx` is what the build needs). Region: the default mainland region (the privacy guide promises mainland storage).
3. Give the CTO the environment ID (not secret). It goes into `node tools/release-config.js --env <envId> --appid wx172906d7bfd6036f` (`build-upload.md` section 2).
4. **Naming rule, functions:** every function is deployed as **`dianjiangtai_<name>`** (`dianjiangtai_getDaily`, `dianjiangtai_submitRun`, ...), always, on any environment: `npm run pack` writes the folders with that prefix and the release switch hard-wires `fnPrefix = 'dianjiangtai_'`. `--prefixed-functions` and `--shared-test-env` are accepted by the switch and are no-ops.
5. **Naming rule, collections (read this):** 点将台's collections are **not prefixed** (`runs`, `events`, `meta`, `rate_limits`, `app_config`, ...). That is fine for the release: the real AppID has **its own cloud environment**, so no other app shares it. The other four apps in the studio (`kedupan_`, `bibiyi_`, `yuyirelen_`, `chuanhua_`) all prefix their collections, so **there is no actual clash today, even on the shared test environment**. The warning is about the **shared test environment (test AppID `wxcd03c1b62d7eb0e0`)** only: if you test 点将台 there, its unprefixed names `events`, `runs`, `meta`, `app_config`, `challenges`, ... sit next to the other apps' prefixed ones, any later app that forgets its prefix would collide with them, an earlier 点将台 test run leaves data (an old `meta/launch`, used seeds) that changes issue numbers and consumes bank entries, and `database/rules.json` would have to be pasted on that environment too. If you test there, do it deliberately, and reset the 点将台 collections before the real launch (section 8). Nothing in release depends on it.

## 2. Collections, rules and indexes (console -> 数据库)
Create these **17 collections** (names exactly, no prefix):
`daily_seeds`, `daily_seed_bank`, `runs`, `daily_starts`, `daily_results`, `group_members`, `challenges`, **`challenge_answers`**, `daily_stats`, `events`, `rate_limits`, **`meta`**, `player_stats`, `daily_progress`, `sub_grants`, `anomalies`, `app_config`.
(`challenge_answers`, `meta` and `rate_limits` are the 2026-10-15 hardening additions; `player_stats`, `daily_progress`, `sub_grants`, `anomalies`, `app_config` are v1 additions. Missing any of them breaks `submitRun`, `cleanup` or `getDaily`.)

Rules: for **every** collection set the custom rule `{"read": false, "write": false}` (deny all clients; only cloud functions with admin rights read or write; the game never touches the database). Rules are not applied automatically; `apps/dianjiangtai/cloudfunctions/database/rules.json` holds one entry per collection with a `_rationale` (the `_comment` and `_rationale` keys are documentation, not rules). A test asserts deny-all for every collection the code touches (AC 28, 101).

**Cloud Storage and access hardening, H6a (console, one time; `cloudfunctions/README.md` "Console hardening").** (a) Cloud Storage -> Permissions -> Custom rules: paste the contents of `apps/dianjiangtai/cloudfunctions/storage/rules.json`, exactly `{"read": false, "write": false}`. The game uses no storage; without the rule a default may leave files readable or writable. (b) Cloud Development -> Settings -> Login authorization: keep **anonymous login and every web (Web SDK / H5) login method DISABLED**. (c) Keep **HTTP access (HTTP 访问服务) DISABLED** for every function; never add an HTTP trigger. (b) and (c) are the only ways to call a function without a WeChat OPENID, and the timer functions rely on "no OPENID plus the timer marker". (d) Re-check (a)-(c) after any console change. Without this: **launch blocker** (spec H6a).

Indexes (console -> collection -> 索引管理; source: `cloudfunctions/README.md` "Indexes"; uniqueness never relies on indexes):
| Collection | Indexes (field, ascending unless noted) | Used by |
|---|---|---|
| `daily_results` | `dateKey` | `getBoard` |
| `group_members` | `groupRef`; `openid` + `groupRef`; `lastSeen` | `getBoard` membership and member list; `cleanup` |
| `runs` | `challengeId` + `openid`; `submittedAt` | answered-check; `cleanup` and roll-up |
| `daily_seed_bank` | `used` + `contentVersion` + `configVersion` + `gateVersion` | `genDaily` bank pick (ordered by `_id`) |
| `daily_starts` | `startedAt` | `cleanup` |
| `challenges` | `createdAt` | `cleanup` |
| `events` | `ts`; `name` + `ts` | `cleanup`; KPI queries |
| `rate_limits` | `expireAt` | `cleanup` |
| `daily_progress` | `updatedAt` | `cleanup` |
| `sub_grants` | `grantedAt` | `cleanup` |
| **`challenge_answers`** | `createdAt` | `cleanup` |
| `anomalies` | `ts`; `kind` + `ts` | `cleanup` and the daily roll-up |
| `player_stats` | `updatedAt` | `cleanup` |
| `daily_seeds`, `daily_stats`, **`meta`**, `app_config` | none (`_id` only; point and range reads by `_id`) | |

## 3. Functions: deploy names, config, environment variables
Folder `apps/dianjiangtai/game/cloudfunctions-deploy/` after `npm run pack` (**14 folders** plus `MANIFEST.json`). In DevTools, for each folder: right-click -> 上传并部署：云端安装依赖 (not "all files": `core/` and `common/` are already inside). For the two timer folders also choose **上传触发器**.

| Function (deploy name) | Trigger | Timeout |
|---|---|---|
| `dianjiangtai_getDaily` | client | 20 s |
| `dianjiangtai_submitRun`, `dianjiangtai_getReplay` | client | 10 s |
| `dianjiangtai_startRun`, `_getRound`, `_getHistory`, `_getBoard`, `_getChallenge`, `_createChallenge`, `_subscribeChallenge`, `_joinGroup`, `_track` | client | 5 s |
| `dianjiangtai_genDaily` | timer `0 0 23 * * * *` (23:00 Beijing), trigger name `genDailyTimer` | 60 s |
| `dianjiangtai_cleanup` | timer `0 0 4 * * * *` (04:00 Beijing), trigger name `cleanupTimer` | 60 s |

Each `function.config.json` sets `TZ=Asia/Shanghai`, the timeout and 256 MB. **The README could not confirm that the WeChat console reads this file itself**: after upload, open each function's 配置 and set the **timeout** and the **TZ** environment variable by hand to the values above (the platform default of about 3 s is far too short for `getDaily`, `submitRun` and the timers). A trigger belongs to the function it is uploaded with; one trigger per function; a timer function called by a client returns `FORBIDDEN` (expected). `dianjiangtai_submitRun` requests the `subscribeMessage.send` cloud-call permission in its `config.json`: approve it in the console (云调用权限) or the answer notice cannot be sent (nothing else breaks).

**Environment variables** (console -> 云函数 -> function -> 配置 -> 环境变量). Names only; values are set by the founder and never shared:
| Name | Function(s) | Required | Note |
|---|---|---|---|
| `GROUP_REF_PEPPER` | `dianjiangtai_joinGroup` **and** `dianjiangtai_createChallenge` (the same value on both) | **yes** | secret; **at least 32 random characters**, e.g. `openssl rand -hex 24` (48 characters), pasted straight into the console. Missing or shorter than 32: `joinGroup` and `createChallenge` return `SERVER_CONFIG` (group boards and challenges fail). It keys the `groupRef` and the challenge ids: back it up in the company password manager; rotating it changes every `groupRef` and every new challenge id (old challenges stay valid, they are looked up by id) |
| `TZ` | every function | yes | `Asia/Shanghai` (belt and braces; the code computes Beijing dates itself) |
| `LAUNCH_DATE_KEY` | `dianjiangtai_getDaily` **and** `dianjiangtai_genDaily` (same value) | recommended | `YYYYMMDD` of issue 1 = the real launch date (第 1 期). Unset: the date of the **first seed ever created** is stored once in `meta/launch`, so a test run on the real environment before launch would pin issue 1 to the test day (section 8) |
| `SUBSCRIBE_TEMPLATE_ID` | `getDaily`, `subscribeChallenge`, `submitRun` | optional | fallback only; prefer `app_config.subscribe.tmplId` (section 5), which needs no redeploy |
| `SUBSCRIBE_MP_STATE` | `dianjiangtai_submitRun` | only while testing the subscribe message on a trial build | `developer`, `trial` or `formal`; leave **unset** (formal) in production |
| `JOINGROUP_RETURN_OPENGID` | `dianjiangtai_joinGroup` | only if device item E1 forces the `groupid` route | `1`; leave unset otherwise |

No AppSecret, `session_key` or `code2Session` exists anywhere (a test fails if they appear); do not add one.

## 4. Seed bank and `app_config` (the daily needs the bank)

**Why.** Daily 12-0-optimal seeds are rare (about 0.5% of candidates pass the strict gates). `genDaily` takes the next unused entry from `daily_seed_bank` whose `contentVersion`, `configVersion` and `gateVersion` match the live core (2, 3, 1 in this build: **V1-2 is settled, configVersion 3 is final**); with an empty or mismatched bank it falls back to a live search that succeeds on only about 1 day in 5 and otherwise publishes **no daily at all** (`DAILY_UNAVAILABLE`). All contentVersion 1 entries are unusable (PO-17), and so is **any bank generated before this build (configVersion 2)**: delete it and generate a fresh one with the commands below. **A launch without the imported bank has no reliable daily: it is effectively a launch blocker (spec H5).**

**Generate (≥ 60 days; do 90 if you can wait 9 minutes: every test run on the real environment also consumes entries).** On any PC with Node >= 20 and this repo checked out on the release branch (it needs no cloud access). Write **outside the repository**: the files list future daily seeds (spoilers) and a `bank*.json` anywhere under `apps/dianjiangtai/` fails the `qa-trust` test (AC 54).
```
# 0. a scratch folder outside the repository (Git Bash / macOS / Linux; on Windows cmd or PowerShell use any folder under %TEMP% instead)
export BANKDIR="$(mktemp -d)"

# 1. generate: 60 accepted seeds, strict gate, no statistics sections (about 6 minutes on 8 cores, longer on fewer; run from the repo root)
node apps/dianjiangtai/game/tools/simstats.js --bank 60 --bank-only --bank-file "$BANKDIR/bank-cv2-60d.json"

# 2. re-verify every entry against the live core and convert to JSON Lines (offline)
node apps/dianjiangtai/cloudfunctions/scripts/prepare-bank.js "$BANKDIR/bank-cv2-60d.json" "$BANKDIR/bank.import.jsonl"
#    expect: "wrote 60 entries to ... (0 skipped)". A skipped entry is listed with its reason (version mismatch, not 12-0).
```
(The command in `seed-bank/README.md` with `--seeds 1000 --optseeds 100 ...` also works but prints a statistics report that reads "RESULT: 4 target(s) not met": that is sampling noise at 1,000 seeds and does not affect the bank; `--bank-only` avoids it.) Two runs give different (both valid) banks; entries are `_id = bank_<seed>`, so the same file can never duplicate.

**Import (founder, console).** Cloud console -> 数据库 -> `daily_seed_bank` -> 导入 -> `$BANKDIR/bank.import.jsonl`; file type **JSON Lines** (one JSON object per line); conflict mode **Insert / skip, NOT overwrite (upsert)** [VERIFY the console's wording]: an overwrite on a later re-import would reset `used:true` entries to unused and replay old seeds.
```
# 3. check in the console: daily_seed_bank has 60 documents, all used:false, contentVersion 2, configVersion 3, gateVersion 1.
# 4. delete BOTH local files (they are spoilers; never commit them):
rm "$BANKDIR/bank-cv2-60d.json" "$BANKDIR/bank.import.jsonl"
```
**Top-up** (monthly, when `genDaily` logs the low-bank warning (fewer than 10 matching entries), after any content/config/gate version bump, and after device-pass testing on the real environment): generate another file from a different candidate stream so it does not overlap, e.g. `node apps/dianjiangtai/game/tools/simstats.js --bank 60 --bank-only --bank-offset 100000 --bank-file "$BANKDIR/bank2.json"`, then steps 2-4 again. Each day consumes one entry. Check the count of `used:false` entries before launch and every month.

**`app_config`** (the only record you create by hand; a missing record means subscribe hidden, banner off, interstitial on defaults). Console -> `app_config` -> add a record with **`_id`: `live`**:
```json
{
  "_id": "live",
  "subscribe": { "tmplId": "<template id, section 6>", "fields": { "title": "thing1", "theirRecord": "thing2", "myRecord": "thing3", "time": "time4" } },
  "ads": {
    "banner": { "enabled": false, "adUnitId": "" },
    "interstitial": { "enabled": true }
  }
}
```
- `subscribe`: leave the whole key out until the template exists (the 提醒我 offer stays hidden). `fields` values must be the keyword keys of the template you chose (`thingN`, `timeN`; they are matched by `^[a-z]+\d{1,3}$`); the defaults above apply when omitted. The template id must be 10-80 characters of `[A-Za-z0-9_-]`.
- `ads.banner`: keep `enabled: false` (the default) until the banner unit exists and device item E10 passed; then `"enabled": true, "adUnitId": "<banner unit id>"`. A banner shows only on the group and friend boards in their ready/empty states.
- `ads.interstitial`: defaults in code are `everyNRuns: 3`, `minLifetimeRuns: 4`, `minGapSec: 120`, `maxPerDay: 5`, `enabled: true`; values are clamped (`everyNRuns` 2-1000, `minLifetimeRuns` 2-1000, `minGapSec` 60-86400, `maxPerDay` 0-8). To tune, add for example `"interstitial": { "enabled": true, "everyNRuns": 4, "minGapSec": 180, "maxPerDay": 3 }`. The "never in daily, challenge, draft or reveal" rules are not configurable. Config reads are cached 60 s per function instance.
- `meta/launch` (`{ "dateKey": "YYYYMMDD" }`) is written automatically by the first seed; set `LAUNCH_DATE_KEY` instead of seeding it by hand.
- **Day 1 is not empty:** the evening before launch, Cloud Functions -> `dianjiangtai_genDaily` -> 云端测试, test event `{"Type":"Timer","TriggerName":"manual"}` (optionally `"dateKey":"YYYYMMDD"` for a given day). Without that `Type`/`TriggerName` marker (an empty event, or a call from the game) the answer is `FORBIDDEN`; `dianjiangtai_cleanup` behaves the same. Alternatively open the game once on the evening before launch: the lazy path in `getDaily` takes the next bank entry too.

## 5. Timers: first checks (device item E6)
After the first night: `genDaily` ran at 23:00 once (event `daily_gen` with `source: bank`, `bankLeft`), `cleanup` at 04:00 (and the `anomaly_daily` roll-up event for the previous day). Double fire is a no-op by design (fixed `_id`s, a claim marker `meta/rollup_<date>`). If `genDaily` failed, the first `getDaily` creates the seed from the bank. Logs to watch: a low-bank warning (fewer than 10 left), `[ALERT]` lines (no seed published: `DAILY_UNAVAILABLE`; mismatch rate above 0.5% of runs: client/server version skew). Confirm in the console that each function's timeout and TZ stuck.

## 6. Subscribe template (HANDOFF section 8)
MP -> 订阅消息 -> 公共模板库 -> choose a **one-time (一次性)** template for games with three **text/thing** keywords and one **time** keyword (our content: title "好友接下了你的战书", the answerer's record, your record, the time). No template with exactly that title is guaranteed; pick the closest neutral one [VERIFY availability in the console]. Copy the **模板 ID** into `app_config.live.subscribe.tmplId` and set `fields` to the template's real keyword keys. The notice opens the game with `page: index?c=<challengeId>` (verified on the device pass, item E7). Without a template everything else works and the offer never shows.

## 7. Ad units after 流量主
1. Eligibility [AD page, rule re-read 2026-10-15; phase0 §7.1]: any one of: cumulative UV > 500 with no fake traffic or serious violations; game circle active + 5 official posts; a same-company mini program already in 流量主 and earning continuously for one quarter. 认证 is needed.
2. MP -> 流量主 -> 开通 (agreement signing and bank/settlement details are the founder's legal and financial acts).
3. 流量主 -> 广告管理 -> create three ad units: a **激励视频** (rewarded), a **插屏** (interstitial), a **Banner**.
4. Rewarded and interstitial ids go into the client: build with `--ad-rewarded adunit-... --ad-interstitial adunit-...` (`build-upload.md` section 2; a minor version, e.g. 1.0.1; ad unit ids are not secrets). The banner id goes into `app_config.live.ads.banner` with `enabled: true` when wanted (no rebuild).
5. Device items E5 (rewarded no-fill shows no share page; interstitial 2001/2002 skipped silently) and E10 (banner only on the boards, at least 24 pt gap). Do not click your own live ads (流量主 violation risk): view, do not click.
6. **Until then (TD-11):** the release build has no ad unit ids and runs no-fill: a rewarded placement grants once per run with "暂无广告，本次免费" (a second failure in the run grants nothing), the interstitial never shows, the banner is off, and the "广告位（测试）" overlay never appears (`stubAds` is `true` in the committed dev state and forced to `false` by the release switch). Real ads need `--ad-rewarded` and `--ad-interstitial` in the build. Nothing core depends on ads.

## 8. Operating notes
- **Replace a bad daily:** console -> `daily_seeds/<YYYYMMDD>` is the day's document; a bank entry used for it is marked `used:true, usedFor`. To pull a bad day before it is played, delete that day's `daily_seeds` document and its `daily_starts`/`daily_results` for the date and let `genDaily`/`getDaily` take the next bank entry; after players have started, do not change it (results are pinned to the seed). This is a founder decision (Art. 5.6 data deletion).
- **Reports:** there is no player report flow; feedback arrives in the MP console (联系我们 / 反馈).
- **Reset after a test run on the real environment** (so the real launch date and a full bank take effect): delete all documents of `meta`, `daily_seeds`, `daily_starts`, `daily_results`, `daily_progress`, `daily_stats`, `player_stats`, `runs`, `challenges`, `challenge_answers`, `sub_grants`, `anomalies`, `events`, `rate_limits`, `group_members`; and set every `daily_seed_bank` document with `usedFor` back to `used:false` (or delete the used ones and import a fresh bank). **Irreversible data deletion: founder decision (Art. 5.6).** Keep `app_config`.
- **Retention:** `cleanup` deletes identity-bearing records at 180 days (`runs`, `daily_starts`, `daily_results`, `challenges`, `challenge_answers`, `daily_progress`, `sub_grants`, `anomalies`, `player_stats`, `events`, `group_members` by `lastSeen`, expired `rate_limits`); it keeps `daily_stats`, `daily_seeds`, `meta`, `app_config`.
- **Console re-check after any change** (H6a): storage deny-all, anonymous/web login off, HTTP access off, database rules deny-all.

## 9. KPIs to watch (spec §1, §15; direction §10)
Healthy / watch (spec §15; post-launch KPIs, not gates): share rate (completed runs with a share tap) >= 10% / < 4%; card-open-to-play >= 25%; completed runs per session >= 3 / < 2; D1 >= 35% (launch target 40%); D7 >= 15%. Secondary: daily participation, 识人-day vs standard-day participation, streak distribution, challenge answer rate, subscribe accept rate, save-image rate, ad completion rate, reveal skip rate, the win distribution against the spec §7.5 targets. Queries run on the `events` collection with the definitions in spec §15 (QA provides one per metric in `cloudfunctions/tests`). First-week checks: the 2 timers fired once each, bank count falling by one a day, `anomaly_daily` mismatch rate near 0, no `[ALERT]` lines, `board_list` rows well under the 3,000-row cap (`boardListCap`).
