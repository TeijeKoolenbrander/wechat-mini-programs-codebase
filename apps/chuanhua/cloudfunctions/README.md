# 传画接龙 cloud functions

WeChat Cloud Development backend for the mini game `chuanhua`. Spec: `docs/chuanhua/spec.md` §6, §7, §13, §16, §19; decisions `docs/chuanhua/decisions.md` (PO-10, PO-13..PO-19, PO-33).

Status: code and tests complete and passing against a **test double** of the game core (`tests/fake-core`). Not deployed (no AppID or cloud environment yet). Founder items are in "What the device pass must prove" below.

## Functions

| Function | Trigger | Timeout (s) | Purpose |
|---|---|---|---|
| `getHome` | client | 5 | today's 3 prompts, allowances, restriction, streak, features, kill-switch state |
| `agreeRules` | client | 5 | records the 接龙公约 agreement |
| `joinGroup` | client | 5 | cloudID-decrypted group entry -> opaque `groupRef` (copied from 点将台) |
| `createChain` | client | 8 | chain + immediate claim on 第 1 棒; custom prompt moderated first |
| `getChain` | client | 5 | chain-entry state; **never any content** |
| `claimStep` | client | 5 | the 150 s lock (DB transaction); returns the previous 棒 to the claimant only |
| `releaseClaim` | client | 5 | give the 棒 back |
| `submitStep` | client | 10 (512 MB) | text: sync `msgSecCheck`; drawing: validate -> pending -> server PNG -> `mediaCheckAsync` |
| `onMediaCheck` | message push / HTTP access service | 5 | receives the async image verdict |
| `modSweeper` | timer `0 */5 * * * * *` | 60 | retries, re-check, void, expiry, breaker, alerts, reveal notices, mock verdicts |
| `getReveal` | client | 5 | participants only; teaser fields for other group members |
| `revealNow` | client | 5 | starter's early reveal (>= 4 棒) |
| `laugh` | client | 5 | 笑 toggle |
| `report` | client | 5 | hides the item for everyone at once |
| `getMyChains` | client | 5 | album list; detail mode returns only the caller's own 棒 |
| `getGroupChains` | client | 5 | waiting / in-progress / revealed + aggregate stats |
| `deleteMyStep` | client | 10 | author deletion (one or all) |
| `subscribeReveal` | client | 5 | one subscribe grant |
| `grantReward` | client | 5 | rewarded-video allowances under daily caps |
| `admin` | **cloud console only** | 20 | takedown/review ops, kill switches |
| `track` | client | 5 | analytics batch |
| `cleanup` | timer `0 0 4 * * * *` | 120 | 180-day retention, deletes PNGs |

Every function returns `{ok:true,...}` or `{ok:false, code, message}` and never throws to the client (fuzz test). Identity is always `cloud.getWXContext().OPENID`, read in `common/store.js` only (a test enforces this). Timer functions and `cleanup`/`modSweeper` reject any call that carries an OPENID.

Error codes: the spec's list plus `BAD_INPUT`, `WRONG_KIND`, `NOT_REVEALED`, `NOT_MEMBER`, `CHAIN_REMOVED`, `CHAIN_HIDDEN`, `REWARD_LIMIT`.

## Layout

```
cloudfunctions/
  common/            source of truth, copied into <fn>/common by `npm run sync` (committed copies)
  <fn>/index.js, package.json, function.config.json, config.json (timers + openapi permissions)
  scripts/sync-core.js
  database/rules.json     deny-all rules for every collection
  storage.rules.json      deny-all storage rule
  tests/                  node --test; helpers/ = fake db + harness + scenario helpers; fake-core/ = test double of the game core
```

```
npm run sync     # common/ -> <fn>/common, apps/chuanhua/game/core -> <fn>/core (git-ignored copies)
npm run check    # drift check; FAILS if the game core is missing (run before every deploy)
npm test         # pretest syncs common only; the harness stages its own copy with tests/fake-core
```

Core dependency is deliberately narrow (`common/coreapi.js`): only `core/content/prompts.v1.js` (array or `{PROMPTS}` of `{id,text,cat,retired?}`), `core/content/blocklist.v1.js` (array or `{BLOCKLIST}`) and optionally `core/daily.js#dailyPromptIds(dateKey, ids, launchKey)`. Everything security-relevant (stroke limits, text rules, rasteriser, date keys) lives in `common/` so the server never trusts a client-owned module. **Re-check when the game core lands:** that the exported shapes match, that `daily.js` and the fallback walk agree (AC 88), and that the client renderer matches `common/raster.js` pixel for pixel (AC 27, golden test is minigame-dev's).

## Environment variables (cloud environment config; never committed)

| Name | Required | Purpose |
|---|---|---|
| `GROUP_REF_PEPPER` | yes (`joinGroup`) | `groupRef = sha256(openGId + pepper)[0..16)`. Without it `joinGroup` returns `SERVER_CONFIG`. Random 32+ chars; keep a copy in the team secret store |
| `ENV_KIND` | yes | `prod` or `dev`. **Unset counts as `prod`**, so a forgotten variable can never enable mock moderation |
| `MODERATION_MODE` | prod: `live` (or unset) | `live` or `mock`. `mock` is only honoured with `ENV_KIND=dev`; `mock` + `prod` makes every UGC function return `SERVER_CONFIG` and log `[ALERT]` |
| `MOD_TEXT_DAILY_BUDGET` | dev only, default 80 | dev `live` mode: max `msgSecCheck` calls per Beijing day (pre-publish quota is about 100); beyond it text fails closed with `MODERATION_BUSY` |
| `MOCK_MEDIA_DELAY_SEC` | dev only, default 60 | delay before `modSweeper` resolves a mock drawing verdict |
| `ADMIN_OPENIDS` | optional | comma list; fallback if the console invocation of `admin` turns out to carry an OPENID (V14). Empty means console only |
| `MEDIA_CHECK_ROUTE` | optional | `push` (default: verdict arrives at `onMediaCheck`) or `sync` (legacy `imgSecCheck`, last-resort fallback, see below) |
| `PUSH_TOKEN` | only for the HTTP fallback | message-push token; HTTP route refuses everything (500) without it |
| `PUSH_AES_KEY` | only if secure mode is used | EncodingAESKey of the message push (43 chars) |
| `PUSH_ALLOW_OPENID` | optional, `1` | only if the device pass shows platform pushes carry an OPENID; otherwise any call with an OPENID is `FORBIDDEN` |
| `LAUNCH_DATE_KEY` | optional | `YYYYMMDD` of day 1 for the 今日起点 walk; if unset the first `getHome` stores today in `meta/launch` |
| `TZ` | set to `Asia/Shanghai` | in each `function.config.json`; belt and braces, the code uses explicit UTC+8 date keys |

No AppSecret, no `session_key`, no payment key anywhere (cloud calls need none). A test fails if any appears in the code. Remote config is the document `app_config/live` (console-edited): `ugc: {createEnabled, viewEnabled}`, `subscribe: {tmplId, fields}`, `ads`, `features: {updatableCard}`, `timers`. Missing or unreadable means defaults (UGC enabled, optional features off).

## Moderation flow

**Text** (custom prompt in `createChain`, description in `submitStep`): server-side text rules and local blocklist (`TEXT_REJECTED`, no API call, no strike) -> `msgSecCheck` v2 (`scene 3`, author openid, 3 s timeout). `pass` is stored and visible; `review` -> `TEXT_BLOCKED`, no strike; `risky` -> `TEXT_BLOCKED` + one strike; any error, timeout, quota error or malformed answer -> `MODERATION_BUSY` and nothing stored. Blocked text goes to `mod_log` (admin evidence, 180 days) only.

**Drawing** (`submitStep`): strokes validated (limits of spec 5.3) -> step stored `pending` (the chain is `pending`, unclaimable, visible only to the author) -> server rasterises a 512x512 PNG (`common/raster.js`) -> uploaded to `chuanhua/mod/<YYYYMM>/<chainId>/<n>_<attempt>.png` -> temp URL (7,200 s) -> `mediaCheckAsync` v2 (`media_type 2`, `scene 3`, author openid) -> `trace_id` stored on the step and in `mod_traces`.

**Verdict, primary route:** cloud-development message push of event `wxa_media_check` to `onMediaCheck` -> `resolveVerdict` (idempotent per trace id, in one transaction over trace + step + chain + author): `pass` opens the next 棒 (or reveals), `review` blocks without a strike, `risky` blocks with a strike; the 棒 reopens. Unknown traces are ignored (clients never see trace ids). A verdict for a step that is no longer pending is logged and ignored, except a late `risky` still adds a strike.

**Fallbacks, selected by configuration (no code change):**
1. *HTTP access service* (spec V1 fallback (a)): point the MP message push at the environment's HTTP access URL for `onMediaCheck`. The same function detects the HTTP event shape, verifies the token signature (`PUSH_TOKEN`; `PUSH_AES_KEY` for secure mode, AES-256-CBC decrypt included), answers the `echostr` handshake and applies the verdict. Needs only env vars.
2. *Re-check:* regardless of route, `modSweeper` re-checks a drawing that has no verdict after 35 min (one new PNG URL and trace), and voids it after another 35 min (no strike, allowance restored, 棒 reopens). `mediaCheckAsync` call errors are retried at +5 and +10 min, then void. Everything stays unseen meanwhile (fail closed).
3. *`MEDIA_CHECK_ROUTE=sync`:* legacy synchronous `security.imgSecCheck` (pass or errCode 87014 treated as `risky`; no `review` level). Last resort if no push route can be made to work; its availability for mini games is unverified.
4. If none works the game cannot launch (drawings never pass): escalate (spec V1, E1).

Kill switches and breaker: `app_config.ugc.createEnabled=false` stops creating/claiming/submitting within 10 s (per-instance cache); `viewEnabled=false` makes every content view a placeholder. At >= 50% moderation failures over >= 20 calls in 5 minutes `modSweeper` sets `autoPausedUntil` (15 min) and logs `[ALERT]`. Image quota: `[ALERT]` at 70% of 200,000/day, `UGC_BUSY` for new chains at 95%, drawings fail closed at 100%.

## What the device pass / console must prove (founder handoff)

| Item | What to check | If it fails |
|---|---|---|
| **V1** | in the cloud console add a message push for event `wxa_media_check` -> `onMediaCheck` (mini game env); draw in dev `live` mode and watch the verdict arrive; record latency | use the HTTP access service route (set `PUSH_TOKEN`, optionally `PUSH_AES_KEY`; values never pasted in chat); then `MEDIA_CHECK_ROUTE=sync`; else escalate |
| V1b | whether a platform push carries an OPENID in the context (if yes set `PUSH_ALLOW_OPENID=1`; trace ids stay the secret) | |
| V2/V3 | real latency, scene 3, error codes (61010, quota), the 100/day pre-publish limit with `MOD_TEXT_DAILY_BUDGET` | scene 2; mock in dev |
| V9 | custom storage rule `storage.rules.json`, and that `mediaCheckAsync` can still fetch the temp URL (V11) | default "creator and admins only" rule; longer `maxAge` |
| V10 | `submitStep` time with a 4,000-point drawing (unit test proxy: well under 1 s locally) | raise memory/timeout; 384x384 PNG |
| V14 | console test invocation of `admin` carries no OPENID | `ADMIN_OPENIDS` |
| DB errors | duplicate-`add` and missing-`doc.get` error text, transaction conflict behaviour (the claim lock relies on a conflicting transaction failing or retrying; `store.txn` retries once, then the caller sees `TAKEN`) | adjust `isDup`/`isNotFound`/`isConflict` in `common/store.js` |
| V8 | `subscribeMessage.send` from `modSweeper` with `page: ?r=<chainId>` for a mini game | feature hidden |
| V7 | `createActivityId` / `setUpdatableMsg` (`target_state` 0 per pass, 1 when closed) | `features.updatableCard=false` |
| `deleteFile` | status/`errMsg` format for a missing file (cleanup treats `STORAGE_FILE_NONEXIST`-like text as already gone) | adjust the pattern in `cleanup` |

## Collections and indexes

Collections: `chains`, `steps`, `mod_traces`, `mod_log`, `mod_quota`, `reports`, `players`, `group_members`, `group_stats`, `reactions`, `sub_grants`, `daily_stats`, `audit_log`, `events`, `rate_limits`, `app_config`, `meta` (shapes: spec 13.1; additions: `chains.involved[]` (everyone with an attempt, for the album), `chains.attempts/submits` (idempotency), `chains.pending`, `chains.hidden`, `chains.noticeDue/noticeSent`, `players.restrictedAt/seen/flagged`, `steps.hasFile`, `mod_log.hasFile`, `rate_limits` also holds the per-minute moderation call counters `modcalls_<minute>` for the breaker).

Create them in the console, paste `database/rules.json` (every collection is `{"read": false, "write": false}`) and apply `storage.rules.json`.

**Database security rules, why each is deny-all:** the mini game never reads or writes the database directly; all access goes through cloud functions (admin rights, rules bypassed). Clients could otherwise read other players' drawings and texts (`steps`, `chains`), moderation evidence and blocked text (`mod_log`), reports and reporter identities (`reports`), group membership and openGIds (`group_members`), strikes and restrictions (`players`), the kill-switch config (`app_config`), or forge claims, verdicts, counters and group membership. Nothing needs to be client-readable, so nothing is. A test asserts every collection the code touches has a deny-all rule and that no rule exists for an unused one.

**Storage:** `{"read": false, "write": false}` for the whole bucket. The moderation PNG is written only by the server, read only by the content-security service via a server-made temp URL, and by `admin` (10-minute URLs). Participants never read files: they get validated stroke data from `claimStep` (after winning the lock, previous 棒 passed and not hidden) and `getReveal` (participants of a revealed chain). Those two functions are the "participants only" access check.

| Collection | Index | Used by |
|---|---|---|
| `chains` | `involved` | getMyChains |
| `chains` | `participants` | album/participant queries |
| `chains` | `openGId + state + lastActivityAt` | getGroupChains |
| `chains` | `openGId + state + revealedAt` | getGroupChains (recent reveals) |
| `chains` | `state + expiresAt` | modSweeper expiry |
| `chains` | `state + noticeSent + noticeDue`; `activityDirty` | modSweeper notices / card retries |
| `chains` | `createdAt`; `state + lastActivityAt` | cleanup |
| `steps` | `state + createdAt` | modSweeper pending scan; admin sample |
| `steps` | `author + createdAt`; `author + state`; `chainId + author` | getMyChains, deleteMyStep, admin |
| `steps` | `createdAt + hasFile` | cleanup |
| `reports` | `state + createdAt`; `stepId` | admin, alerts |
| `reactions` | `chainId + openid` | getReveal |
| `group_members` | `groupRef + openid`; `lastSeen` | membership, cleanup |
| `sub_grants` | `chainId + used`; `grantedAt` | notices, cleanup |
| `mod_log` | `ts + hasFile`; `mod_traces.submittedAt`; `audit_log.ts`; `events.ts`; `rate_limits.expireAt`; `players.lastActiveAt`; `group_stats.lastActivityAt` | cleanup |

All point reads use deterministic `_id`s; uniqueness never relies on indexes.

## Setup (founder / whoever holds the console)

1. Create the cloud environment; set its id in the client's `wx.cloud.init`.
2. Per function: upload and deploy with cloud dependency install; set **timeout, memory and TZ** from `function.config.json` by hand (the console may not read that file; only `config.json` is a verified WeChat format); upload `config.json` (timer triggers and openapi permissions).
3. Env vars per the table above. Production: `ENV_KIND=prod`, `MODERATION_MODE=live`, `GROUP_REF_PEPPER`; never `mock`.
4. Create collections, paste DB rules, indexes, storage rule; create `app_config/live`.
5. Configure message push for `wxa_media_check` (primary) or the HTTP access service (fallback).
6. Run `admin` from the console routine of spec 7.2 (listReports daily for 4 weeks, `sample` of 20).

## Behaviour notes and spec gaps decided

- `report` ids are `<reporterOpenid>_<stepId>` (spec 13.1), so `admin.listReports` shows an id that embeds the reporter's openid; admin console only, never returned to clients.
- Restriction imposed **mid-turn** lets the current claim finish (spec edge 19); one that predates the claim blocks the submit (`players.restrictedAt`).
- `claimStep` with `viewEnabled=false` takes **no lock** and returns `{placeholder:'paused'}`.
- A `starting` chain is `abandoned` as soon as its claim expires unused (sweeper) or the starter releases; cleanup removes it after 1 day.
- Hiding a step reopens it only if it is the latest passed 棒 of an `open` chain; `restoreStep`/`dismissReport(restore)` only restore a step still referenced by the chain (otherwise it would re-enter an open chain).
- Blocked attempts and voids do not count toward the 3-棒 cap; a hidden or deleted 棒 does (conservative).
- Sweeper ordering: pending drawings are scanned 200 at a time; at very high volume raise the page size or split the timer.

## Tests

`npm test` (Node >= 20): in-memory fake DB with duplicate-`_id` errors, throwing `doc.get`, query limits, array-contains, serialised transactions with rollback; the SDK is a scriptable double (`msgSecCheck`, `mediaCheckAsync`, `imgSecCheck`, storage, updatable messages, subscribe messages); the clock is controlled. Covers chain rules and caps, 50 concurrent claim races, lazy claim expiry, idempotent submit, text and image moderation (parameters asserted), push idempotency and HTTP signature/AES, timeouts/retries/void, fail-closed, dev budget, prod-mock guard, kill switches, breaker, quotas, reports, strikes and escalation, admin, deletion, retention, participants-only reveal, no openids or file references in any response, rules/permissions/secrets/drift static checks, fuzzed inputs.
