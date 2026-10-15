# 语义热冷 cloud functions

WeChat Cloud Development backend for the mini game `yuyirelen`. Spec: `docs/yuyirelen/spec.md` (sections 3.7-3.8, 4, 5, 11, 14, 15, 16, 18, 20) and `docs/yuyirelen/decisions.md`. Client contract: the header of `apps/yuyirelen/game/js/api.js`. Pattern source (copied, never imported): `apps/dianjiangtai/cloudfunctions/`.

Status: code and tests complete and passing against fixtures that follow the documented formats (see "Assumptions"). Not deployed (no AppID or cloud environment yet). The real vocabulary, neighbour table and answer bank come from the offline pipeline and are loaded by the founder handoff steps below.

## Functions

| Function | Trigger | Timeout (s) | Purpose |
|---|---|---|---|
| `getDaily` | client | 10 | today's header, warm-ups, caller status and streak; lazily publishes today's puzzle if the timer missed |
| `genDaily` | timer `0 0 23 * * * *` (UTC+8) | 20 | publishes tomorrow's daily from the answer bank; idempotent; `FORBIDDEN` with an OPENID |
| `startPuzzle` | client | 5 | open/resume a puzzle (`{puzzleId}` or `{next:true, pool?:'practice'}`); creates no play |
| `guess` | client | 5 | the core call: rank, temperature, band, steps, chips, solve (+ answer on solve) |
| `near` | client | 3 | 联想词 for a word (answer-independent) |
| `useHint` | client | 5 | free ladder hints (10/20/30/40) and unranked-only rewarded hints |
| `giveUp` | client | 5 | ends the play, returns the answer |
| `getReveal` | client | 5 | answer, top-100 list and day stats, only after the caller finished |
| `getHistory` | client | 5 | archive list, 30 per page; answers only for the caller's finished puzzles |
| `createChallenge` | client | 5 | spoiler-free share record (steps, hints, temperatures) |
| `getChallenge` | client | 5 | challenge entry; `ownerWords` only after the caller finished |
| `joinGroup` | client | 5 | cloudID-decrypted group entry -> opaque `groupRef` |
| `getBoard` | client | 5 | hashed server-ranked rows incl. the in-progress race; no words, no openids |
| `track` | client | 5 | analytics batch (<= 50); refuses typed-text props |
| `cleanup` | timer `0 0 4 * * * *` (UTC+8) | 60 | 180-day retention, anomaly roll-up; `FORBIDDEN` with an OPENID |

Every function returns `{ok:true,...}` or `{ok:false, code, message, msg}` (`msg` because the client reads `msg`) and never throws. Codes: the spec's list plus `INVALID_INPUT` (malformed input), `NOT_STARTED` (give up before any step) and `BAD_EVENT` (typed text in `track`). Identity is always `cloud.getWXContext().OPENID`, read in `common/store.js` only (a test enforces it).

## Trust properties (each has tests)

- The client never receives the answer or a rank list: `answerRef`, `ranks`, bank ids and the `answer_ranks` collection never appear in any response; the answer, the top-100 list, synonyms and the sharer's words are returned only to a caller whose play on that puzzle is finished (`guess` on the solving guess, `startPuzzle`, `giveUp`, `getReveal`, `getHistory`, `getChallenge`).
- Guesses are validated server-side: only vocabulary words (after the same normalisation as the client); anything else is `NOT_IN_VOCAB`, writes nothing and is never logged or stored.
- Steps and hints are counted server-side: client-sent steps/ranks are ignored; every accepted guess and every hint is one step (the step log `plays.guesses` is the source of truth).
- One ranked daily per openid: the play `_id` is `<puzzleId>_<openid>`. Ranked is decided by server time at the first step and turns false after D+1 00:30 BJT; archive and practice plays never reach boards, daily stats or streaks.
- Hints: never rank 1, never a synonym, never an already-guessed word; rewarded hints refused on a ranked play (`RANKED_NO_AD`), at most 3 per puzzle.
- No openid in any response: boards use `sha256(openid|salt)[0..12)` with a per-day salt; challenges and group refs are keyed hashes.
- The group race (`正在猜` rows) carries steps and best rank only, never a word.

## Storage design (guess lookups are fast)

Rank lists are stored per answer and read once per warm instance:

- `answer_bank`: one small metadata doc per answer (word, synonyms, pool, seq/practiceNo, versions, gate numbers, `used`). `genDaily`, history and practice only ever touch this, so they never pull 80 KB.
- `answer_ranks`: one doc per answer, same `_id`: `{ranks: base64 uint16 little-endian, length V}`, about 80 KB for V = 30,000 (spec 3.8's `answer_bank.ranks`, split out so metadata queries stay cheap and the secret array has its own collection).
- A guess is `vocab.index.get(word)` then `ranks[idx]`: two in-memory lookups. The rank doc, the daily puzzle doc and the vocabulary are cached per instance (LRU of 32 answers, about 4 MB). Steady state a guess costs one transaction over the player's `plays` doc and a per-minute `rate_limits` doc: no other reads (perf test asserts this at V = 30,000).
- Measured at V = 30,000 (perf test): a guess response is about 0.4 KB, `startPuzzle` with 101 guesses about 8 KB, `getReveal` about 3 KB; a metadata doc under 1 KB.
- `near.v<N>.bin` (V x 20 uint16, 1.2 MB) and `vocab.v<N>.txt` ship inside the functions that need them (copied by `npm run sync`), not in the database.
- `daily_stats` counters are updated after the play transaction commits (best effort), so one hot document can never fail a player's step. `player_stats` (own doc) is updated inside the play transaction, together with the streak.
- Fallback if the console cannot import 80 KB documents or the database caps document size: store `ranks` as cloud-storage files and read them in `common/answers.js` (`load` is the only reader).

## Collections

| Collection | `_id` | Written by | Notes |
|---|---|---|---|
| `answer_bank` | pipeline-derived 16 hex (not the word) | console import; `genDaily` marks `used` | secret: word, synonyms |
| `answer_ranks` | same as the bank entry | console import | secret: the rank array |
| `daily_puzzles` | `YYYYMMDD` | `genDaily` / lazy `getDaily` | `answerRef`, `warmups`, `boardSalt`; fixed `_id` = idempotent publish |
| `plays` | `<puzzleId>_<openid>` | `guess`, `useHint`, `giveUp` (transactions) | step log; board source |
| `player_stats` | `<openid>` | play transactions | streak, totals, anomaly flags |
| `daily_stats` | `YYYYMMDD` | after play commits | `started`, `solved`, `gaveUp`, `stepsHist[81]` |
| `challenges` | 8-char base32 keyed hash | `createChallenge` | one per owner per puzzle |
| `challenge_takers` | `<challengeId>_<openid>` | `getChallenge` | counts each finishing non-owner once (feeds the owner's `own` numbers) |
| `group_members` | `<openGId>_<openid>` | `joinGroup` | `groupRef` is the only thing clients see |
| `events` | auto / fixed for roll-ups | `track`, server events | analytics, 180 days |
| `anomalies` | `<openid>_<puzzleId>_<kind>` | server | observe-only flags |
| `app_config` | `live` | console | `ads` config; missing = ads off |
| `rate_limits` | `guess_<openid>_<minute>`, `track_...` | `guess`, `useHint`, `track` | trimmed by `cleanup` |
| `meta` | `launch` | first publish | launch date fallback |

Indexes to create: `database/indexes.json` (each entry names the query that needs it).

## Database security rules

File: `database/rules.json`. **Every collection is `{"read": false, "write": false}`.** The mini game never reads or writes the database directly; every access goes through a cloud function, which runs with admin rights and bypasses the rules. Why each is deny-all: `answer_bank` and `answer_ranks` hold the secret answers and rank lists (a client read would be a full spoiler); `daily_puzzles` holds `answerRef` and the board salt; `plays`, `player_stats`, `challenges`, `challenge_takers`, `group_members`, `events`, `anomalies`, `rate_limits` hold openids and play history (privacy, and a client write would forge ranks); `daily_stats` and `meta` are server counters; `app_config` is edited only in the console (clients get its `ads` part through `getDaily`). A test fails if the code touches a collection without a deny-all rule, or if a rule is not deny-all.

## Environment variables (cloud environment config; never committed)

| Name | Required | Where | Purpose |
|---|---|---|---|
| `GROUP_REF_PEPPER` | yes | `joinGroup`, `createChallenge` | secret, 32+ random chars: `groupRef = sha256(openGId + pepper)[0..16)` and keys the challenge-id hash. Missing -> `SERVER_CONFIG`. Rotating it changes every `groupRef` and new challenge ids (old challenges stay valid) |
| `TZ` | set to `Asia/Shanghai` | every function (`function.config.json`) | belt and braces; date keys use explicit UTC+8 arithmetic |
| `LAUNCH_DATE_KEY` | strongly recommended | `genDaily`, `getDaily` | `YYYYMMDD` of issue 1. If unset, the first date ever published is stored once in `meta/launch` (a QA test publish would then become issue 1) |
| `JOINGROUP_RETURN_OPENGID` | optional, `1` | `joinGroup` | only if the device spike forces the `groupid` route: `joinGroup` then also returns the openGId |

No AppSecret, no `session_key`, no `code2Session` anywhere (cloudID decryption needs none); a test fails if those strings appear. No model or embedding call exists in any function (a test greps for it).

## Layout and the shared core

```
cloudfunctions/
  common/      source of truth for shared code -> copied to <fn>/common (committed copies)
  data/        vocab.v<N>.txt, near.v<N>.bin, manifest.json (written by import-data) -> copied to the functions that need them (git-ignored copies)
  <fn>/        index.js, package.json, function.config.json, config.json (timers only)
  scripts/     sync-core.js, import-data.js, prepare-bank.js, verify-bank.js
  database/    rules.json, indexes.json
  tests/       node --test; helpers/ has the fake database, harness and fixtures
```

```
npm run sync     # common/, game/core/ and data/ -> <fn>/common, <fn>/core, <fn>/data
npm run check    # fails if any copy is missing or differs (the drift check; needs game/core)
npm test         # runs sync first (without requiring game/core), then every test
```

`common/coreapi.js` is the only file that touches `game/core` and the pipeline data. From the core it uses `date.beijingDateKey`, `config.LATEST_CONFIG_VERSION` and `getConfig(v).gateVersion`, `starters.warmupsFor`, `normalize.normalizeInput` and `t2s` (each with a documented fallback). `tests/core-compat.test.js` proves the server rules (temperature, bands, hint rule, streak, ranked window, warm-ups, id formats) equal the core's; it runs once `apps/yuyirelen/game/core` exists (or with `YR_CORE_DIR=<dir>`).

## Founder / ops setup (handoff H6, H7)

1. Create the cloud environment; put its env id in the client's `wx.cloud.init`. Pick the plan (money); measure usage in the device pass (spec 17.1 item 6).
2. Load the public data: `node scripts/import-data.js --vocab <vocab.v1.txt> --near <near.v1.bin> --vocab-version 1 [--gate-version N]` (validates sizes, ranges, duplicates and that the vocabulary equals `game/core/vocab.js`), then `npm run sync` and `npm run check`.
3. Deploy each function folder (cloud install dependencies). In the console set the timeout and `TZ` from each `function.config.json` (I could not confirm the console reads that file; `config.json` triggers are the verified WeChat format), set `GROUP_REF_PEPPER` (and `LAUNCH_DATE_KEY`) on the functions listed above, upload the two timer triggers.
4. Create the 14 collections; paste each rule from `database/rules.json`; create the indexes in `database/indexes.json`.
5. Load the answer bank (spoilers: never commit, delete after import):
   `node scripts/prepare-bank.js <bank.import.jsonl from the pipeline> <outDir> --vocab-version 1 --gate-version N`
   It verifies every entry (ranks permutation with the answer at rank 1, synonyms in the vocabulary, versions, gate windows, answer rules, 85% two-character daily answers) and refuses to write anything if one fails. Then in the console import every `answer_bank.*.import.jsonl` into `answer_bank` and every `answer_ranks.*.import.jsonl` into `answer_ranks` (JSON Lines, conflict mode: skip; ids are deterministic so a re-import cannot duplicate). Launch needs at least 90 daily + 300 practice entries; the low-bank warning fires below 30 unused daily entries.
6. Optionally add `app_config/live` `{ads:{rewardedUnitId, interstitialUnitId, interstitial:{...}, banner:{enabled, adUnitId}}}` after 流量主 activation.
7. Smoke test in the console: run `genDaily` once, then `getDaily` from the client. Cold-start latency of `guess` (first call loads about 80 KB + the near table) is a spec 17.1 item.

## Answer bank format (input to `prepare-bank.js`)

One JSON object per line:
`{pool:'daily'|'practice', seq | practiceNo, vocabVersion, gateVersion, wordIdx | word, synonyms:[idx|word, <=3], ranks: base64 uint16-LE (V values) | number[], difficulty, category, gate:{chipMedian, chipP90, typistMedian, solve80}, reviewedBy}`. `ranks[vocabIdx]` = rank of that word for the answer (1 = the answer). `daily` entries are consumed in `seq` order. `near.v<N>.bin` is V x 20 uint16 little-endian.

## Assumptions to confirm against the pipeline

The pipeline's `OUTPUT_FORMAT.md` was not yet on any branch when this was built, so the formats above come from spec 3.7-3.8. If the pipeline differs (byte order, field names, base64 vs array) only `scripts/prepare-bank.js`, `scripts/verify-bank.js`, `scripts/import-data.js` and the two decoders in `common/coreapi.js` / `common/answers.js` change.

Other decisions beyond the spec text (flag if you disagree):

1. `answer_ranks` split from `answer_bank` (above). `INVALID_INPUT`, `NOT_STARTED`, `BAD_EVENT` added to the error codes; errors carry `msg` as well as `message` for the client.
2. `track` refuses the whole batch (`BAD_EVENT`) when any event carries `text`/`input`/`query` anywhere, matching the client's dev mock; nothing from that batch is stored.
3. Challenge finishers: the spec's `finishers`/`bestSteps` need a signal that a recipient came through the card. The client sends no challenge id with guesses, so a non-owner who has finished the puzzle and opens `getChallenge` is counted once (`challenge_takers`).
4. `startPuzzle` shows the first-character hint as a step `{word:null, r:null, t:null, src:'hint', ch}` and marks the synonym that solved the puzzle with `syn:true` (client contract). `getChallenge.own` is `{finishers, bestSteps}` for the owner and `null` otherwise.
5. Streak display: the stored streak shows only while the last solve is today or the latest earlier published daily (spec 8.12).
6. The 40/min limiter is per player (fixed one-minute window doc), shared by `guess` and `useHint`; the 600 limit counts all steps of the puzzle but hints and give-up still work at the limit.
7. A board row's `s` is the finish time, or the last step time while playing; `b` is 0 only if a play has no ranked step (cannot happen: plays exist from the first step).

## Tests

`npm test` (Node >= 20): an in-memory fake database with duplicate-`_id` errors, throwing `doc.get`, query limits and rolled-back transactions; the SDK is mocked; `Date.now` is controlled. Covers every function, the trust properties, idempotency (retry and concurrency), the ranked window and midnight grace, streaks, hints (incl. a property test of the free-rank rule), boards, challenges, retention, security rules, secrets, drift, the ops scripts, response size and read counts at V = 30,000, and compatibility with the game core.

## Risks and unverified platform behaviour

- Duplicate `add` and missing `doc.get` error text on the real cloud database were not verifiable offline (`common/store.js` matches by pattern, as in 点将台); the first real run must confirm both.
- Transaction API (`transaction.collection().add/get/update/set`, `_.inc` on a dotted array path `stepsHist.7`) is used as documented for wx-server-sdk >= 1.7; confirm on the real database. A rate-limit doc read plus the play doc and `player_stats` make 3 reads and 2-3 writes per transaction.
- Document size/capacity for 80 KB rank docs and about 31 MB at launch (up to about 77 MB) is UNVERIFIED (spec 17 item 6); the fallback is above.
- `function.config.json` (timeout, env) is applied by hand, see setup step 3.
- `getBoard` caches rows per instance for 30 s; with several warm instances the window is approximate (cost control only; the caller's own row is always read fresh).
