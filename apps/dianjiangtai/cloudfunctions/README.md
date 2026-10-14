# 点将台 cloud functions (Phase 1)

WeChat Cloud Development backend for the mini game `dianjiangtai`. Spec: `docs/dianjiangtai/spec.md` §5, §9.2-9.4, §11, §14, §15, §16, §18, §20. Platform facts: `docs/dianjiangtai/phase0-platform.md`.

Status: code and tests complete and passing against the **real game core** (`apps/dianjiangtai/game/core`). Not deployed (no AppID or cloud environment yet).

## Functions

| Function | Trigger | Timeout (s) | Purpose |
|---|---|---|---|
| `getDaily` | client | 20 | today's `rounds` + caller status; lazily creates the seed if `genDaily` missed |
| `genDaily` | timer `0 0 23 * * * *` (UTC+8) | 60 (set from the spike) | next day's seed: **seed bank is the primary path**, live generation is a last resort that publishes nothing if it fails; idempotent |
| `startRun` | client | 5 | anchors the one daily attempt (`daily_starts`) |
| `submitRun` | client | 10 | §14.3 validation, authoritative sim, ranked result, challenge answers |
| `getReplay` | client | 10 | best lineup (复盘) for the caller's own run |
| `createChallenge` | client | 5 | one challenge per validated run |
| `getChallenge` | client | 5 | challenge entry; lineup withheld until answered |
| `joinGroup` | client | 5 | cloudID-decrypted group entry -> opaque `groupRef` |
| `getBoard` | client | 5 | hashed server-ranked rows, membership check, cap, 60 s cache |
| `track` | client | 5 | analytics batch (<= 50), rate limited |
| `cleanup` | timer `0 0 4 * * * *` | 60 | 180-day retention (D7) |

Every function returns `{ok:true,...}` or `{ok:false, code, message}` and never throws to the client. Codes: the spec's `INVALID_ACTIONS`, `ALREADY_PLAYED`, `SEED_NOT_FOUND`, `CHALLENGE_EXPIRED`, `LATE_SUBMIT`, `RATE_LIMITED`, plus these additions (spec gaps, see below): `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_STARTED`, `OWN_CHALLENGE`, `RUN_NOT_FOUND`, `NOT_MEMBER`, `NOT_GROUP`, `BAD_CLOUDID`, `SERVER_CONFIG`, `INTERNAL`.

Identity is always `cloud.getWXContext().OPENID` (read in `common/store.js` only, enforced by a test). `genDaily` and `cleanup` are timer functions: a call that carries an OPENID (i.e. from the mini game) is rejected with `FORBIDDEN`.

## Layout and the shared core

```
cloudfunctions/
  common/            shared helpers (source of truth) -> copied to <fn>/common by sync
  <fn>/index.js, package.json, function.config.json, config.json (timers only)
  scripts/sync-core.js
  database/rules.json
  tests/             node --test; helpers/ has the fake db + harness; fixtures/ has real 12-0 optimum seeds (NOT a bank)
```

A cloud function deploys as one folder, so shared code is copied in:

```
npm run sync     # common/ and apps/dianjiangtai/game/core/ -> <fn>/common, <fn>/core
npm run check    # fails if any copy is missing or differs (drift check)
npm test         # runs everything, incl. the common drift test
```

- `<fn>/common/` copies are committed (source: `common/`). `<fn>/core/` copies are **generated, git-ignored**: the core is owned and changed by the game, so committing 11 copies would create constant merge noise. `npm test` runs `sync` first (pretest), so the tests always run against the current real core; `npm run check` (drift) must pass before a deploy. The harness stages its own temp copy of functions + real core, so tests never depend on working-tree state.
- Only `common/coreapi.js` touches the core. Contract: `apps/dianjiangtai/game/core/README.md`.

## Environment variables (cloud environment config; never committed)

| Name | Required | Purpose |
|---|---|---|
| `GROUP_REF_PEPPER` | yes | secret pepper: `groupRef = sha256(openGId + pepper)[0..16)`; also keys the challenge-id hash. Without it `joinGroup` and `createChallenge` return `SERVER_CONFIG` |
| `TZ` | set to `Asia/Shanghai` | in each `function.config.json`. The code does not depend on it (date keys use core `date.js`), it is belt and braces |
| `LAUNCH_DATE_KEY` | optional | `YYYYMMDD` of issue 1. If unset, the date of the first seed ever created is stored once in `meta/launch` |
| `JOINGROUP_RETURN_OPENGID` | optional, `1` | only if the device spike forces the `groupid` route (spec §9.2 step 6): `joinGroup` then also returns the openGId |

No AppSecret, no `session_key`, no `code2Session` anywhere (cloudID decryption needs none). A test fails if any of those strings appear in the function code.

## Cloud environment setup (founder / whoever holds the console)

1. Create the cloud environment; set the env id in the client's `wx.cloud.init`.
2. For each function: upload and deploy (cloud install dependencies), then in the console set the **timeout** and **TZ** from `function.config.json` (the timeouts are explicit values, the platform default of about 3 s is too short; the `genDaily` value is a spike item, E6). `timeout`/`envVariables` in `function.config.json` are our source of truth and are also read by the code (the 70% live-loop cut-off is computed from it); I could not confirm that the WeChat console reads this file itself, so apply it by hand or via the CloudBase CLI. Only `config.json` (triggers) is a verified WeChat format.
3. Set env var `GROUP_REF_PEPPER` (random, 32+ chars) on `joinGroup`, `createChallenge`, and keep a copy in the team secret store. Rotating it changes every `groupRef` and challenge id (old challenges stay valid, they are looked up by id).
4. Upload the timer triggers (`genDaily/config.json`, `cleanup/config.json`): one trigger per function, evaluated in UTC+8.
5. Create the 11 collections (below) and paste the rules from `database/rules.json`; add the indexes.
6. Seed bank (the primary daily source, see "Seed bank flow"): generate at least 60 days, import into `daily_seed_bank`, delete the local files. **Never commit them** (spoiler).
7. Spike items that touch the backend: the real `genDaily` timeout and measured `gateCheck` time (E6), the `callFunction` response size (sets `boardListCap`, config), the cloudID decrypt (E1), `doc.get()`/duplicate-`add` error text on the real DB (see Risks).

## Collections

| Collection | `_id` | Written by | Notes |
|---|---|---|---|
| `daily_seeds` | `YYYYMMDD` | genDaily, getDaily (lazy) | `add` of the fixed id is the uniqueness mechanism; holds `seed`, `best`, `boardSalt` (never sent to clients except the salt via getBoard) |
| `daily_seed_bank` | console import | console; genDaily marks `used` | offline-generated, gate-checked seeds |
| `runs` | `<openid>_<clientRunId>` | submitRun | authoritative run record; makes resubmission idempotent |
| `daily_starts` | `<dateKey>_<openid>` | startRun | one daily attempt anchor |
| `daily_results` | `<dateKey>_<openid>` | submitRun (transaction) | the one ranked result; source of `getBoard` |
| `group_members` | `<openGId>_<openid>` | joinGroup | server-decrypted group membership |
| `challenges` | 8-char base32 | createChallenge | answer counters updated by submitRun |
| `daily_stats` | `YYYYMMDD` | submitRun (`inc`) | `hist[13]`, `total` |
| `events` | auto | track, server events | analytics, 180 days |
| `rate_limits` | `<bucket>_<openid>_<minute>` | submitRun, createChallenge, track | per-minute counters, trimmed by cleanup |
| `meta` | `launch` | genDaily/getDaily | launch date for issue numbers |

Added beyond spec §14.1: `rate_limits` (the spec asks for rate limiting without naming storage) and `meta`.

## Database security rules

File: `database/rules.json`. **Every collection is `{"read": false, "write": false}`.** Why each one is deny-all: the mini game never reads or writes the database directly. All access goes through cloud functions, which run with admin rights and bypass these rules. A client could otherwise read `daily_seeds` (the seed lets it precompute the optimal lineup), `daily_results`/`group_members` (openids, openGIds), `runs`/`challenges` (lineups, which are withheld until answered), `daily_seed_bank` (future spoilers) or forge results, group membership and counters. Nothing needs to be client-readable, so nothing is. A test asserts that every collection the code touches has a deny-all rule and that no rule exists for an unused collection (AC 28).

## Indexes (add in the console; uniqueness never relies on indexes)

| Collection | Index | Used by |
|---|---|---|
| `daily_results` | `dateKey` | getBoard count + list (`where dateKey`, `orderBy _id`) |
| `group_members` | `groupRef`; `openid + groupRef` | getBoard membership check and group-mode member list |
| `group_members` | `lastSeen` | cleanup |
| `runs` | `challengeId + openid` | answered-check (getChallenge, submitRun) |
| `runs` | `submittedAt` | cleanup |
| `daily_seed_bank` | `used + contentVersion + configVersion + gateVersion` | genDaily bank pick (ordered by `_id`) |
| `daily_starts` | `startedAt` | cleanup |
| `challenges` | `createdAt` | cleanup |
| `events` | `ts`; `name + ts` | cleanup; go/kill metric queries |
| `rate_limits` | `expireAt` | cleanup |

All point reads use the deterministic `_id`.

## Seed bank flow (mandatory: 12-0 daily seeds are rare)

Do this before launch and again whenever fewer than 10 days are left (the `genDaily` log warns) or after any core retune (a content/config/gate version bump makes old entries unusable):

```
node apps/dianjiangtai/game/tools/simstats.js --bank 60 --bank-file <tmp>/bank.json    # ~27 s per 5 seeds, ~6 min for 60
node apps/dianjiangtai/cloudfunctions/scripts/prepare-bank.js <tmp>/bank.json <tmp>/bank.import.jsonl
# console: database > daily_seed_bank > import <tmp>/bank.import.jsonl (JSON Lines, skip on conflict)
# then delete both files from disk
```

`prepare-bank.js` re-verifies every entry with the real core (live versions, stored best lineup scores 12-0), assigns `_id = bank_<seed>` (re-importing cannot duplicate) and sets `used:false`. Never commit either file. Each day consumes one entry; 60 entries last 60 days.

## Behaviour notes

- **Daily seed (§5.2).** `genDaily` runs at 23:00 BJT for the next date. **Bank first**: the next unused `daily_seed_bank` entry (by `_id`) whose content/config/gate versions match; cheap re-check that the stored best lineup still scores 12-0 on the rebuilt sheet; entry marked used in the same transaction as the `daily_seeds` add. **Live is a last resort** (bank empty or version-mismatched): up to 50 candidates or 70% of the configured timeout through the strict gate (about 0.4% of seeds pass, so this succeeds on only ~18% of days). If nothing passes it logs `[ALERT]`, writes a `daily_gen` event with `failed:true`, and returns `DAILY_UNAVAILABLE`: **no seed without a 12-0 optimum is ever published**. Fewer than 10 bank entries left logs a low-bank warning. A double-fired trigger or a racing lazy `getDaily` creates one document and consumes at most one bank entry (tests run both races).
- **submitRun (§14.3).** Order: input whitelist, idempotency lookup by `clientRunId`, rate limit, per-mode seed resolution, replay, authoritative sim, mismatch flag/log, transaction (`runs` + `daily_results` + `daily_stats.inc`). Daily window: today, or yesterday until D+1 00:30 BJT (`LATE_SUBMIT` after); needs a `daily_starts` row (`NOT_STARTED`); a second distinct run returns `ALREADY_PLAYED` with the first result; the same `clientRunId` returns the stored result even under concurrency.
- **Challenges.** Challenge on a daily seed is the recipient's daily attempt only if they started it (`startRun` with `mode: 'challenge'`) inside the submit window and have no result yet; otherwise a friendly. Answers are validated like any run; the answer count only grows on a caller's first answer.
- **getBoard (§11.4-11.5).** Rows `[h, w, s, x?]`, `h = sha256(openid|boardSalt)[0..12)`, `s` = seconds after 00:00 BJT, `x` = `lineupIdx.join(',')` only if the caller has a ranked result. Date must be today or yesterday. Over `boardListCap` (core config, default 3000): group board -> `mode: group` (members' results), friend board -> `selfOnly`. The 60 s cache holds the date's rows in function memory; the caller's own row is always read fresh.
- **Retention (D7).** `cleanup` (04:00 BJT) deletes `runs`, `daily_starts`, `daily_results`, `challenges`, `events` older than 180 days (by their timestamp) and `group_members` with `lastSeen` older than 180 days; keeps `daily_stats`. Idempotent.

## Tests

`npm test` (Node >= 20; 75 tests): in-memory fake DB with duplicate-`_id` errors, throwing `doc.get`, the 100/1000 row query limits and rolled-back transactions; the SDK is mocked; Date.now is controlled. Functions run against the real core. Only the daily gate is patched (`h.patchGates`) because the real one accepts ~0.4% of seeds; bank tests use real 12-0 optimum seeds from `tests/fixtures/optimal-seeds.json` (a guard test fails if a core retune makes them stale; regenerate by scanning seeds with `search.bestLineup(..., {stopAt12:true})`). Covers validation rejections, idempotency (incl. concurrent), ALREADY_PLAYED, midnight grace, challenge lineup withholding and counting rules, getBoard, joinGroup, track, cleanup, genDaily double-fire/bank/live-failure, TZ=UTC date keys, security rules, drift, prepare-bank.

## Spec gaps decided (flag if you disagree)

1. **Core integration** (all in `common/coreapi.js`): versions come from `content.LATEST_CONTENT_VERSION`, `config.LATEST_CONFIG_VERSION`, `getConfig(v).gateVersion`; `getContent/getConfig` return null for an unknown version (-> `INVALID_ACTIONS` / `CHALLENGE_EXPIRED`); `replay` failures carry `reason` (+`index`), final tokens come from `finalTokens`; `bestLineup` may return null (`getReplay` then returns `best:null`); `acceptDailySeed` returns `{accepted, gates, best, rounds}`.
2. The empty-pool re-flip is solved by the core: `rounds[n].fallback` carries the fallback tokens, and `getDaily` returns `rounds` unchanged. The daily client never gets the seed.
3. Extra error codes (listed above) and a `rate_limits` collection.
4. `submitRun` takes an optional `contentVersion` (free mode) so a client on the previous content version validates against it (edge 16); daily and challenge runs use the version pinned on the seed/challenge.
5. A daily start must exist (`startRun`) before a ranked `submitRun`; there is no auto-start.
6. A challenge on a daily seed whose daily was never started is a friendly. `startRun` with `mode: 'challenge'` is what makes it count (it returns `countsAsDaily`).
7. Own challenge: `OWN_CHALLENGE` on submit (spec shows a read-only owner state).

## Risks and unverified platform behaviour

- **Duplicate `add` and missing `doc.get` error text** on the real cloud DB were not verifiable offline. `common/store.js` detects them by pattern (`duplicate|already exist|-502001|E11000|unique`, `not exist|not found|-502002`). The first real run must confirm both; if the real text differs, adjust `isDup`/`isNotFound`.
- **Transaction API**: `transaction.collection().add({data})` and `doc().update` with `_.inc` on a dotted array path (`hist.7`) are used as documented for wx-server-sdk >= 1.7; confirm on the real DB.
- `function.config.json` (timeout, env) is applied by hand, see setup step 2.
- `daily_seeds.rounds` is public; `best` and `seed` never leave the server.
- `getBoard` function-memory cache is per instance, so with several warm instances the 60 s window is approximate (cost control only; ranks are always server data).
