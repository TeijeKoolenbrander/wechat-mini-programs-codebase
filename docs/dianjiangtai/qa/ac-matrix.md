# 点将台 v1: AC matrix (QA)

Build under test: `kept-ideas/v1` @ 6582873 (re-check after the V1 fixes TD-10..15; first pass was at 0030bed). Spec: `docs/dianjiangtai/spec.md` §20 (ACs 1-106). The Phase 1 matrix (build 8171302 / fab330a) is kept at the end as a historical section.
Paths: G = `apps/dianjiangtai/game/tests/`, C = `apps/dianjiangtai/cloudfunctions/tests/`. New QA files: G `qa-content-v2`, `qa-client-v1`; C `qa-v1`. Older QA files: G `qa-content`, `qa-tuning`; C `qa-trust`, `qa-analytics`.
Verdicts: **PASS** = automated evidence meets the AC as written (platform or console parts are listed in the device pass, not hidden here). **FAIL** = the AC is not met, with a bug in `bugs.md`. **DEVICE** = the AC itself names a device measurement. **OPEN** = not testable yet. Cited tests were read and assert the AC (not only named after it); where the dev test was weak, QA added one (marked "QA added").

## Summary

| Verdict | Count | ACs |
|---|---|---|
| PASS | 103 | all others (15, 43, 74 and 95 moved from FAIL/OPEN to PASS in the re-check) |
| FAIL | 0 | none |
| DEVICE | 2 | 16, 75 |
| OPEN | 0 | none |

V1-1..V1-4 are fixed and verified; V1-5 (release pack) exists but is stale against 6582873 (corrections in the QA report). See `bugs.md`.

## Suites run

Re-check at 6582873 (QA branch adds tests and docs only):

| Command | Result |
|---|---|
| `npm test` in `game` (dev), runs 1 and 2 | 377 tests: 376 pass, 0 fail, 1 skipped (the release-only test), both runs |
| `node tools/release-config.js --env env-test --appid wx172906d7bfd6036f`, then `npm test` | run A: 377, 374 pass, 1 fail, 2 skipped; the failure was the wall-clock "AC 16 / 75 ... < 300 ms (p99) for light sets" test (52 s, machine loaded by other agents). Run B (clean): 377, 375 pass, 0 fail, 2 skipped |
| `node tools/release-config.js --dev`, then `git status` | clean; `--status` prints `dev` |
| `npm test` in `cloudfunctions`, runs 1 and 2 | 182 tests, 182 pass, 0 fail, both runs |
| `node tools/simstats.js --check --cv 2 --seeds 100000 --offset N`, N = 0, 777000, 2000000, 4000000, 9000000, 12345678 | all six: "RESULT: all targets met", exit 0. Naive 12-0 0.14 / 0.15 / 0.12 / 0.15 / 0.15 / 0.15%; sensible 12-0 0.26 / 0.28 / 0.27 / 0.31 / 0.30 / 0.29% |
| New QA file `tests/qa-v1-recheck.test.js` (2 tests) | pass; game dev count becomes 379 with it |

First pass at 0030bed (historical):

| Command | Result |
|---|---|
| `npm test` in `game` (dev), run 1 | 343 tests: 342 pass, 0 fail, 1 skipped (the RELEASE-only test) |
| same, run 2 | 343: 342 pass, 0 fail, 1 skipped |
| `node tools/release-config.js --env env-test --appid wx172906d7bfd6036f`, then `npm test` | 343: 341 pass, 0 fail, 2 skipped (dev-only tests). The release test "cloudEnv set, stub ads off, every function prefixed" ran and passed |
| `node tools/release-config.js --dev`, then `git status` | clean (diff vs HEAD empty) |
| `npm test` in `cloudfunctions`, runs 1 and 2 | 175 tests, 175 pass each time |
| After QA additions (3 new files): `game` dev 358 tests: 355 pass, 0 fail, 1 skipped, 2 todo; `game` release 358: 354 pass, 0 fail, 2 skipped, 2 todo; `cloudfunctions` run twice: 182 pass, 0 fail | green. The 2 todos are the confirmed-bug tests for V1-1 and V1-3 (they assert the correct behaviour and flip to regressions when fixed) |
| `node tools/simstats.js --check --cv 2 --seeds 100000 --offset 0` (committed report `tools/simstats-report-cv2.md`) | all targets met. Naive 0.17%, greedy 0.56%, sensible 12-0 0.33%, median 7, events 24.1%, bands in range |
| same on offsets 777000, 2000000, 4000000 (QA windows) | 777000: **naive 12-0 0.20%, check fails**; 2000000: all met; 4000000: **naive 0.20%, check fails**. See V1-2 |
| `simstats --bank 3 --bank-only` then `prepare-bank.js` | works: 3 accepted seeds in 7 s (about 47 candidates per accepted seed), 3 entries written; "fewer than 10 days" warning as designed. The 60-seed launch bank is a founder import (H5), not in the repo (correct) |
| `tools/preview` `npm install && node render.js` | 278 PNGs at 320x568 (large, hc) and 139 at 430x932 (hc); share cards and seal galleries; inspected below |

D15 targets for contentVersion 2 on the CI window and QA's own 30k seeds (`qa-tuning`, passes): sensible 12-0 0.33% (0.2-0.5), median 7, greedy 0.56% (<= 1), naive 0.17% (< 0.2, **unstable**), random 0.00% (< 0.01), bands 10-11 8.9% (6-10), 0-1 0.55% (<= 2), events 24.1% (15-30), most frequent general in optimal lineups 刘备 35.6% (<= 60), cell frequency deviation 1.12% (< 5). Optimal 12-0 on accepted seeds 100% (qa-tuning).

## Loop, content and spin (1-18)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 1 | PASS | G smoke "a full free run plays headlessly"; core-sim "a legal run replays" | |
| 2 | PASS | core-sim "pools list only undrafted generals of the faction and era"; core-rules-v2 "pool cap: never more than 8 selectable" | v1 pools incl. appearance rule |
| 3 | PASS | core-sim "replay rejects: pick outside the pool, duplicate general, duplicate slot" | |
| 4 | PASS | core-sim "undo restores the pool and the slot"; core-rules-v2 "undo restores it exactly" | |
| 5 | PASS | core-basic "role scores match", "fit chips follow the 7.5 / 5.5 thresholds"; render.v1 draft states | |
| 6 | PASS | core-basic "sheet cells are uniform ... independent of tier"; core-rules-v2 same over 21 cells; simstats deviation 1.12% | |
| 7 | PASS | qa-content "Appendix B equals generals.v1.js exactly" (parsed from the spec); core-content-v2 "v1 content is intact"; forbidden-term scans | |
| 8 | PASS | core-sim "free re-spin is once per dimension per run" | |
| 9 | PASS | core-sim "ad re-spins: free play only"; smoke "daily and challenge never offer ad re-spins" | |
| 10 | PASS | PNG draft__respin_none (320x568): disabled 换势力 button; vm text covered by integration views | Hint wording is not asserted by a test (Phase 1 note stands) |
| 11 | PASS | core-sim "same seed, same actions ... 1000 replays"; cloud suites run the real core; C core-consistency | |
| 12 | PASS | core-sim "records sum to 12 and the band matches"; qa-tuning band check | |
| 13 | PASS | core-sim "monotonicity" and core-rules-v2 / core-sim v2 "a stronger lineup never does worse" | |
| 14 | PASS | core-sim "events: fire only under their conditions, at most once"; simstats events 24.1% | threshold 0.672 is in the amended spec 7.2 |
| 15 | PASS | Re-check at 6582873 (configVersion 3): simstats `--check --cv 2 --seeds 100000` on offsets 0, 777000, 2000000, 4000000, 9000000, 12345678 all exit 0 "all targets met"; naive 12-0 0.12-0.15% (< 0.2%) on every window; greedy 0.40-0.45%; sensible 12-0 0.26-0.31%; median 7; random 0.00% | Was FAIL (V1-2: naive at 0.2% on 2 of 4 windows). Margin is now about 4 sampling sd on the worst window, so a fresh window passing is no longer luck. V1-2 closed |
| 16 | DEVICE | G core-sim "复盘 search equals brute force", "... >= the player"; simstats client-side (<= 5000 sets) 13-17% of searches: p99 73-202 ms, max 75-276 ms under 3 parallel runs on a loaded machine; qa-content-v2 timing test | Lineup validity and >= player: PASS. The < 300 ms is for the reference mid-range Android: DEVICE (item D-8). Note: the AC 16/75 wall-clock test failed once in a release-mode run while other agents loaded the machine (52 s run) and passed in the next; it is load-sensitive, not a logic bug |
| 17 | PASS | smoke "reveal plays itself out in about 9 s and gives the same verdict as skipping"; QA added shiren reveal auto-play | |
| 18 | PASS | core-sim "battle and event randomness never depend on the lineup", "mode does not matter"; 识人 does not change the sim (core-rules-v2) | |

## Daily seed and validation (19-28)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 19 | PASS | C daily "getDaily: identical issueNo/variant ... NO rounds"; C progressive "no response carries a round beyond what was released"; QA added qa-v1 "AC 86 on a 识人 Sunday" (key walk) | `myStreak.best` is the player's own streak, not a lineup |
| 20 | PASS | C daily "date key ... even when the runtime TZ is UTC"; G core-basic TZ tests | |
| 21 | PASS | G qa-tuning "accepted daily seeds ... optimal reaches 12-0 on 100%", "daily gate window is the tuned one"; C bank "re-verified 12-0"; C daily "live failure: NO seed is published" | spec 7.5.1 now states [0.25%, 20%] |
| 22 | PASS | C submit "second distinct ranked run -> ALREADY_PLAYED", "same clientRunId ..."; qa-trust "ONE ranked daily per openid even when the first one came through a challenge" | |
| 23 | PASS | C qa-trust "midnight grace boundary is exact"; submit "started 23:59 ... 00:31 -> LATE_SUBMIT" | |
| 24 | PASS | G modules "Beijing day roll" | |
| 25 | PASS | G smoke "in-progress daily survives relaunch"; client-v1 "kill and relaunch mid-run resumes the same round" | |
| 26 | PASS | C submit "rejects with INVALID_ACTIONS and persists nothing", "rejects duplicate general"; progressive "invalid partial runs are rejected" | |
| 27 | PASS | C submit "tampered clientRecord sets mismatch=true"; anomaly tests | |
| 28 | PASS | C security "security rules deny all ..."; qa-v1 "AC 101: database rules"; every handler derives identity from OPENID (security "identity: no function reads OPENID from client input") | Applying the rules in the console: D-1 |

## Sharing and challenges (29-35)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 29 | PASS | G qa-content "every shareAppMessage call is in share.js, takes no success/complete callback"; smoke "sharing: ... grants nothing"; QA added qa-client-v1 "AC 81" (streak not in ads/share/core) and manual grep: three explicit `wx.shareAppMessage` calls (result, challenge, group invite) plus the capsule `onShareAppMessage`, none reads an outcome | Album save and subscribe also grant nothing (client-v1) |
| 30 | PASS | qa-content share code search (explicit taps + capsule `onShareAppMessage`) | |
| 31 | PASS | render "daily share card shows no general names; free card shows them"; PNG shareCard daily_shiren (names replaced by faction seals, "识人" tag) vs free_jin (names shown, 晋 seals ink on 月白) | static-image fallback is a code path (share.js FALLBACK_IMAGE) |
| 32 | PASS | C challenge "challenge lineup is withheld until the recipient has answered"; spoiler "challenge compare on a playable daily seed withholds the sharer's lineup" | C5 text "对方阵容 · 完成今日军令后可见" in vm tests |
| 33 | PASS | C challenge "challenge on today's daily seed ... IS their daily and is ranked", "... friendly, not ranked" | |
| 34 | PASS | C challenge "own challenge", "expired, missing and malformed" | |
| 35 | PASS | G smoke "group card: ticket present -> getGroupEnterInfo -> joinGroup -> banner; no ticket -> no banner"; code search (no `getShareInfo`) | Platform cloudID decryption: D-2 |

## Leaderboards (36-39)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 36 | PASS | G smoke "daily run through the mock server ... marker written", "marker write refused" | Real `setUserCloudStorage`: D-4 |
| 37 | PASS | G render.opendata "rank order depends on server rows only"; smoke "boards: no group context shows the explainer" | |
| 38 | PASS | C board "lineups (x) only for a caller with a ranked result"; qa-trust friendly-run caller gets no x | |
| 39 | PASS | G render "every screen x state x size x display mode draws"; PNG _contact_board_* (320x568 large) | |

## Ads (40-43)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 40 | PASS | G modules "ads (real mode): reward only on isEnded === true"; smoke "closing the stub early grants nothing" | |
| 41 | PASS | modules "error 1004 and onLoad useFallbackSharePage follow the D6 rule"; smoke "no-fill grants once per run per placement" | |
| 42 | PASS | modules "interstitial: caps (4th lifetime run, every 3rd free run, >=120 s, <=5/day, free only)" | |
| 43 | PASS | G release-gate (release mode: `stubAds` must be false), qa-release; developer test "V1-3" and the QA test "AC 43 / H4" (now a normal test) pass in qa-client-v1; QA added qa-v1-recheck "release build with no ad unit ids never calls the ad API, no overlay, D6 once per run; main.js passes `enabled: stubAds && !cloudEnv`" | Was FAIL (V1-3). Verified in code: `ads.js` stubs only when `stubCfg.enabled`; empty unit id gives no-fill (toast "暂无广告，本次免费", second failure in the run grants nothing); interstitial without an id is skipped. V1-3 closed. Release pack still describes the old behaviour (see release-pack corrections) |

## UX and platform (44-50)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 44 | PASS | G render "AC 44: nothing tappable overlaps the capsule menu", "primary buttons are in the bottom 40%"; PNGs 320x568 / 430x932 | |
| 45 | PASS | render "AC 45 / 89: touch targets >= 48", "body text >= 16pt", "no text runs past the screen edges", "texts never overlap each other (all modes, 320x568 and 430x932)" | |
| 46 | PASS | G smoke "boots to home ... no authorization prompts", "complete game is playable with every authorization refused" | |
| 47 | PASS | smoke "daily: offline at the end saves the lineup as pendingSubmit"; client-v1 "history offline ... free play still works"; PNG home__offline | Real network loss: D-11 |
| 48 | PASS | qa-content "main package <= 4 MB and no portrait images": game dir (incl. tests, tools, ignored in the package) is 1.3 MB; no image, font or audio file exists under `apps/dianjiangtai` | No subpackages needed |
| 49 | PASS | G audio.test (WAV validity, determinism, wired in game, muted run plays nothing, toggle remembered); QA qa-v1-recheck: muted from the start creates no InnerAudioContext (preload and play), a throwing play() and a late onError stay silent, unknown cue ignored, no audio API is a no-op | Was vacuous (V1-4). Four synthesised cues ship in `assets/sounds/*.wav`. Real playback and loudness: DEVICE (D-13) |
| 50 | PASS | qa-content "forbidden-terms scan over ALL shipped game files"; core-content-v2 "forbidden terms over every user-visible v2 string"; QA added qa-content-v2 (no 三国志/三国杀/光荣/Koei in any statNote or blurb) | `source` fields name 三国志 and are never rendered |

## Analytics (51-52)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 51 | PASS | G modules "analytics: whitelist, common props, batches of <= 50"; C track "the sessionId the shipped client puts inside props is stored top-level", "every event the shipped client can send is in the catalogue"; hardening L2 | No single scripted capture of every payload; each event has its own assertion (see 93) |
| 52 | PASS | C qa-analytics "AC 52", qa-trust | |

## Daily seed generation (53-55)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 53 | PASS | C daily "live failure: NO seed is published", "live loop honours the 70% time budget", "every function sets TZ and a timeout" (genDaily timeout 60) | Real timeout limit: D-5 |
| 54 | PASS | C bank/daily "bank is the primary path", "low-bank warning (< 10)", qa-trust "no seed-bank file is committed"; seed-bank dir holds only README + .gitignore; QA generated and prepared a 3-seed bank | Spec text now says < 10 |
| 55 | PASS | G core-sim "gateCheck is deterministic and its rates are shares of K=400"; C core-consistency drift | |

## Trust, retention, content (56-59)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 56 | PASS | G render.opendata "AC 56a/b/c" | |
| 57 | PASS | C cleanup "180-day retention deletes old rows, keeps daily_stats", "covers the v1 collections", batches | Privacy guide text is in the release pack (V1-5) |
| 58 | PASS | G core-basic "no portrait image files in the app"; QA added qa-content-v2 "CTO-D1: seal portraits only" (no file of any media type; only `opendata/index.js` calls `createImage`, for friend avatars) | |
| 59 | PASS | core-basic "texts contain no insulting wavering lines"; core-content-v2 "wavering templates stay neutral for the 11 qualifying generals"; QA added insulting-word scan over all statNote/blurb | The release content review is H8 (V1-1 feeds it) |

## Server-authoritative boards, privacy (60-68)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 60 | PASS | C qa-trust "AC 60 sweep", board "never returns raw openids"; G modules analytics "no openid/group props" | |
| 61 | PASS | C board "group board: groupRef accepted only from a member", "over boardListCap", qa-trust "non-member ... get an error and no rows" | |
| 62 | PASS | C group "valid group data: one doc _id <openGId>_<openid>", "repeat entries are idempotent", "payload cases" | Platform: D-2 |
| 63 | PASS | G smoke "privacy refused ... never re-prompts", "scope refused: unauthorized state, openSetting on tap only, recovers", "marker write refused" | Prompt placement: D-3 |
| 64 | PASS | G modules "reward only on isEnded", "1004 ... D6 rule"; smoke "wxad_fallback_share entry grants nothing" and code search | Real 1004: D-6 |
| 65 | PASS | modules "interstitial ... 2001-2003 skipped silently" | |
| 66 | PASS | G core-basic "date key is independent of the process TZ"; C "every function sets TZ=Asia/Shanghai and an explicit timeout"; QA added qa-v1 config check (14 functions, timeout 1-60) | |
| 67 | PASS | C daily "genDaily double-fire", "races the lazy getDaily path"; submit "two concurrent distinct runs" | Fake DB; real transactions: D-5 |
| 68 | PASS | G smoke "code search: wx.getShareInfo and wx.reportEvent are never referenced"; QA grep: no `reportEvent` call in game or functions | |

## v1 content and roster (69-75)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 69 | PASS | G core-content-v2 "generals.v2.js equals Appendix C: name, courtesy, primary faction, appearances, stats, tier, role", "validateContent(v2)", "cells: 21 used cells with >= 4 generals ... 273 entries", "the 32 Phase 1 generals keep their exact Appendix B stats"; QA added independent checks (below) | Literal criteria met; text quality issue is V1-1 |
| 70 | PASS | G core-rules-v2 "a person is drafted at most once: 赵云 ..."; C submit/v2 "rejects duplicate general (same cell drafted twice)" | |
| 71 | PASS | core-rules-v2 "cohesion uses the drafted cell faction"; C cv2 "lineupFac holds the drafted-cell faction per slot" | |
| 72 | PASS | core-rules-v2 "pool = first 8 undrafted in the seeded order", "undo restores it exactly", "v1 regression: sheets, runs, pools and 复盘 for contentVersion 1 are exactly as in the Phase 1 build" | Regression is seeded runs, not 1,000 stored runs |
| 73 | PASS | core-rules-v2 "bonds: +0.04 only when every member is drafted, M never above 1.25", "every bond can be drafted in one run"; core-content-v2 "16 bonds with the spec members" | simstats reports bond rates |
| 74 | PASS | simstats on six fresh 100k windows: all targets met on each; bands inside targets (三分鼎立 34.3-34.8% against the 36% cap); most frequent general in optimal lineups 刘备 34.3-36.0% (<= 60%); gate accepts 0.43% of candidates (about 1 in 230); 32-general stat diff passes; multi-appearance, bonds and seed acceptance reported | Was FAIL (V1-2). The 60-seed launch bank must now be generated for contentVersion 2 AND configVersion 3 (PO-17 as extended by TD-12) and imported by the founder (H5) |
| 75 | DEVICE | simstats: 14% of free sets stay on the client (p99 92 ms node); heavy sets via `getReplay` (node p99 489 ms, max 1.2 s, timeout 10 s) | Reference Android p99: D-8 |

## Seal portraits (76)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 76 | PASS | G render.v1 seal tests (faction x tier x name length at 24/48/72/120; frames 甲/乙/丙 distinct; 识人 plain = 乙; 晋 ink on 月白; "seals appear in the pool, lineup, detail sheet, result, history and the share card"); qa-content-v2 (no image load); PNGs seals/*.png, shareCard/free_jin | No font file ships, so the "display-font subpackage fails" case cannot occur (system font always) |

## 识人 (77-79)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 77 | PASS | G client-units "core adapter: variant is shiren exactly on Sunday Beijing dates over three years"; core-rules-v2 "识人 variant: Sundays (Beijing date) only, by config weekday, TZ independent over 3 years"; QA added qa-v1 "AC 77" (stored seed, getDaily, getBoard, getHistory, getChallenge on a real Sunday; Monday standard) | Config weekday change: core-rules-v2 |
| 78 | PASS | G client-v1 "Sunday 识人 daily: stats, tier, fit and S_r hidden until the verdict"; render.v1 "AC 78: no stat, pip, tier, fit chip, S_r or statNote is drawn" and "even if a hidden vm still carried stats ... hidden wins"; core-rules-v2 "识人 never changes the sim"; QA added reveal auto-play | |
| 79 | PASS | client-v1 "shiren challenge that counts as today ... played hidden by the recipient"; render.v1 challenge 识人 tag; PNG shareCard daily_shiren, challenge__ready_shiren | |

## Streaks and history (80-82)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 80 | PASS | C streak-history (8 tests: consecutive, skipped published day resets, unpublished day skipped, midnight, grace, LATE_SUBMIT, duplicates, `myStreak` alive all day) | Edge 27 matches |
| 81 | PASS | G client-v1 "streak and history"; render.v1 "streak line only from 2 days", "連N for k >= 2"; C streak-history "no streak-linked grants"; QA added qa-client-v1 code search (no streak in core, ads, share, album, subscribe, features) and copy scan (no pressure or reward words) | No notification is sent about streaks (subscribe fields have no streak) |
| 82 | PASS | C streak-history "getHistory: best appears exactly at D+1 00:30 BJT", "at most 30 issues", "distribution only from 30 runs"; G client-v1 history tests; render.v1 "history list/issue" five states | |

## Album and subscribe (83-85)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 83 | PASS | G client-v1 "save to album: nothing album-related before the tap", "denied: permission sheet with 去设置 ... no re-prompt", "privacy refusal (104)"; QA added rapid-tap test (3 taps, one `saveImageToPhotosAlbum`) | Privacy-guide checklist and real prompts: D-9 |
| 84 | PASS | client-v1 "subscribe hidden ...", "shown: offered only after 发起挑战", "reject and ban"; G client-units "subscribe module: template hidden/offer/granted/declined states" | |
| 85 | PASS | C features "first answer sends exactly one subscribe message; later answers send nothing; no identity", "two parallel first answers send at most one message", "a hanging send is cut off after 2 s" | Real notice: D-10 |

## Anti-cheat (86-88)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 86 | PASS | C progressive (10 tests incl. "captured payload test", "diverging prefix is rejected and flagged", "free play, friendly challenges and past-seed challenges still get the full sheet"); G client-v1 "progressive daily"; QA added qa-v1 on a 识人 Sunday | |
| 87 | PASS | G client-v1 "progressive daily offline: 令牌传递中断 with 重试 ... retry continues from the same round"; "kill and relaunch" | Airplane mode on device: D-11 |
| 88 | PASS | C features "mismatch / fast / invalid_ranked flags: one document per (run, kind) ... observe-only", "player_stats.suspect turns true at >= 5 flags", "cleanup roll-up ... [ALERT]" | |

## Accessibility (89-90)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 89 | PASS | G render "AC 45 / 89" tests (large: body 20, record 48, buttons 56); "home daily card: text clears the primary button ... all modes"; client-v1 "display modes ... persist, need no restart"; PNG 320x568 large (home, draft, board, history, result) inspected: no clipping; home scrolls with the group banner (note in bugs.md) | PC WeChat: D-12 |
| 90 | PASS | render.v1 "AC 90: default palette text pairs >= 4.5:1 (including ink on 晋 月白)", "high-contrast: every text pair >= 7:1, non-text >= 3:1"; PNG 430x932 hc inspected; "share and saved cards ignore the display modes" | |

## Ads config (91-92)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 91 | PASS | G client-v1 "remote config: banner is off by default, on only for board ready/empty"; client-units "banner (real ad mode): created once ... errors are silent"; render.v1 "AC 91: the banner slot exists only on ready/empty boards, with a >= 24pt gap" | Real banner: D-13 |
| 92 | PASS | G client-units "interstitial config from the remote document changes the caps without a code change; the never-in rules stay"; C features "app_config values are read, validated and clamped" | |

## Analytics, config, release (93-95)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 93 | PASS | G client-v1 "analytics: v1 events fire with their props" (round_fetch x5, draft_pick/run_* props), streak_shown, history_view, history_issue_view, save_image, subscribe_offer/result, display_setting, shiren_reveal (skipped); QA added shiren_reveal auto-play (once, skipped=false); C track L2 sample table (all v1 events pass through the real cleaner); server-only `subscribe_send` and `anomaly_daily` in features/cleanup tests | |
| 94 | PASS | G client-v1 "remote config unreadable"; C features "app_config missing", "app_config unreadable: getDaily still works" | |
| 95 | PASS | `docs/dianjiangtai/release/HANDOFF.md` carries H1-H9 (mapping table at the end) including H6a (section 4 steps 4, 7, 9), and the section 5 device-pass table E1-E12 plus Extra 1-5 with an empty Result column; C deploy-pack, qa-v1 config check, "rules: every new collection is deny-all" pass | Was OPEN (V1-5). Presence criteria met. The pack is stale against 6582873 (written at 0030bed): corrections listed in the QA report; they must land before the founder reads it, because several steps tell the founder to wait for fixes that are now done and to generate a configVersion 2 bank that would be unusable |

## Security hardening (96-106)

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 96 | PASS | G hardening "M1: the client sends joinGroup {cloudID: <raw string>} and nothing else", "never builds a decrypted-looking object", "mock parity"; C group "M1: forged objects ... BAD_CLOUDID", "payload cases", "the source of joinGroup never reads event.groupData"; QA grep: no `CloudID`/`groupData` in game or function sources except the comment and mock note | |
| 97 | PASS | C hardening "M3 ..." (6 tests); QA added qa-v1 that checks `common/limits.js` against the numbers written in the spec and that every function has an entry | Client mock parity test in G hardening |
| 98 | PASS | G hardening "M3: RATE_LIMITED is treated like a bad connection ... history, analytics re-queue, queued submit"; client-v1 progressive offline | |
| 99 | PASS | C track (unknown and server-only names dropped, props cleaned, `__proto__`, 80 chars, over-1KB dropped, every v1 event kept); G hardening "L2: the client event list and the server catalogue name the same events" | |
| 100 | PASS | C hardening "L3: genDaily and cleanup run only for a timer event" (12 refusals x 2 functions, then the manual marker works) | Console test event: D-1 |
| 101 | PASS | C hardening "L3: the storage rule is deny-all"; qa-v1 database rules (every collection incl. challenge_answers, meta, rate_limits has deny-all and a rationale) and "no uploadFile/downloadFile" over game and functions | Pasting the rules and anonymous/HTTP OFF: D-1 |
| 102 | PASS | C hardening/challenge "L5: the pepper must be configured and at least 32 characters", "createChallenge needs GROUP_REF_PEPPER" | |
| 103 | PASS | C hardening "concurrency: parallel and repeated answers count once; best never lowered", "run and bookkeeping are one transaction"; cleanup removes challenge_answers (cleanup "covers the v1 collections") | |
| 104 | PASS | C hardening "roll-up is claimed once, even when the timer fires twice", "a roll-up that fails after the claim releases it" | |
| 105 | PASS | G hardening "parseQuery / parseEnter never throw" (`c=%`, `%E0%A4%A`, `__proto__`, non-string c, non-object options), "a game launched from a card with a malformed query starts normally and reports the entry as malformed" | |
| 106 | PASS | G hardening "item 8: no daily seed, sheet or best-lineup data in the client package"; C progressive "no response carries ... the seed, or the optimum", "a challenge that counts as the daily goes through startRun/getRound"; seed-bank folder holds no data | Grace-window residual (edge 35) accepted, documented |

## Focus-area findings (beyond the AC rows)

**Content (120 generals).** Checked: appendix roster equals the content file (core-content-v2); stats 1-10, tiers from totals, 18/67/35 tier split, cell sizes, 273 entries, bonds (all pass). QA added independent checks that do not read the roster back to itself: a hand table of death years for 97 generals and birth years for 18 (nobody serves in an era that starts after death or ends before age 15, 200+ appearance checks, all pass); named PO-3 cases (邓艾/钟会 魏 only, 司马懿 魏+晋, 刘备/孙坚/孙策 own camp, 关羽 no 魏, 廖化 no 吴, 赵云/张郃/马超 群, 晋 only in 归晋); sensitivity (no 轲比能, 秃发树机能, 檀石槐, 沙摩柯, 兀突骨, 华雄 etc.; 孟获 the one exception; no slurs; 张角 present); no insulting/meme wording; seal-only (portraitId null x120, no image/font/audio file, only the friends board loads images). Sample read of 120 blurbs and statNotes: accurate and neutral (孙皓 仁1 sourced to 本传, 刘禅 neutral, 贾充 sourced to 晋书). Findings: **V1-1** (change-log text in 10 statNotes, Med); 黄权 missing a 魏 归晋 appearance (Low); 孟获 "夷汉" wording (Low). Roster note: 羊祜 is typed 主公 (a viceroy) for slot reasons; not an error.

**Fairness and authority.** Server record is authoritative (AC 27), one ranked daily per openid even through a challenge (22, qa-trust), progressive delivery proven by a captured-payload test and extended by QA to a 识人 Sunday (86), anomaly flags are observe-only (88, "same run with and without flags"), daily spoiler lock holds for replay, challenge compare and history (C spoiler tests; client mock mirrors it), grace edge 26 (QA added: Sunday attempt submitted Monday 00:10 ranks for Sunday and stays 识人).

**识人, streak, history, cap, 复盘.** PASS as listed (77-82, 72). 复盘 timing: see AC 16/75.

**Founder fixes.** Home footer: `render.test` "home footer: 声音 / 隐私与设置 stay pinned to the bottom (all states, sizes, modes)" plus PNGs: pinned in loading, available, 识人, streak, group-banner, in-progress at 320x568 large and 430x932 hc. Sheet X: `sheet-close.test.js` covers all five sheets (draft detail, 玩法, 隐私与设置, breakdown, 复盘) x 3 sizes x standard/large x scrolled/not = 60 cases, X target >= 48x48, scrim tap and body swallow also tested; `widgets.sheet` is the only sheet constructor (5 call sites, all covered).

**Compliance.** No induced sharing or reward: AC 29/30/31/64 evidence plus code search (3 explicit share calls plus the capsule, no callbacks). Share cards hide daily names (PNG checked). Ads as specced: banner default off and only on ready/empty boards (91); interstitial caps (42/92); V1-3 is the exception. Privacy: no prompt at launch or in a free run (46, 63); album scope never read before the tap (83); subscribe opt-in only, never from a streak (81, 84).

**Release safety and package size.** Release switch round trip leaves the tree clean (see Suites run). Release gate fails a hand-flipped build without the ignore entries and strips mock/stub (release-gate tests). No AppSecret or token in game or function source (qa-content, qa-trust, security). Package is 1.3 MB, no assets. V1-3 is the open release hazard.

## Device-pass list (founder, §17.1 plus items found by QA)

Code-checked parts are noted; each needs the real platform.

| # | Item | Why it cannot be automated | Spec |
|---|---|---|---|
| D-1 | Console hardening: paste storage deny-all and database rules, anonymous/web login OFF, HTTP access OFF, timer test event `{"Type":"Timer","TriggerName":"manual"}` returns FORBIDDEN without the marker | console state | AC 28, 100, 101; H6a; scope 1 |
| D-2 | Group card from a second account: `getGroupEnterInfo` cloudID resolves via `cloud.getOpenData` (`opengid`, `chat_type`), single chat gives no group; warm start | platform decryption | AC 35, 62, 96; E1 |
| D-3 | Privacy popup and friend-scope prompt placement; refuse then `openSetting` recovery | WeChat UI | AC 63; E4 |
| D-4 | Friend/group rows carry `openid`, `d_` key behaviour, hash join of 500 rows < 50 ms on Android, largest `postMessage` payload | open data domain | AC 36, 56; E2, E3 |
| D-5 | `genDaily` timeout in the console, 23:00 BJT trigger fires once, duplicate no-op, real DB transactions for double submit | cloud runtime | AC 53, 67; E6 |
| D-6 | Real rewarded 1004 with `disableFallbackSharePage` once ad units exist; interstitial 2001/2002 | ad platform | AC 64, 65; E5 |
| D-7 | Subscribe: template picked, accept, answer from a second account, exactly one notice that opens the own-challenge view; remove template, offer disappears | WeChat notices | AC 84, 85; E8 (item 9) |
| D-8 | 复盘 timing on the reference mid-range Android: light sets < 300 ms p99 (node: 92-202 ms), `getReplay` p99 on mobile data, and the offline fallback on a heavy set (node up to 1.2 s; must not freeze the UI) | CPU speed | AC 16, 75 |
| D-9 | Save to album on a fresh account: privacy popup, scope prompt, refuse to 去设置 sheet, saved image 1000x800 (daily without names); 相册（仅写入） in the privacy guide | WeChat UI | AC 83; E9 (item 10) |
| D-10 | `round_fetch` p50/p95 on mobile data on both phones (E11: p95 <= 1.5 s), airplane-mode flip shows 令牌传递中断 and resumes | network | AC 87; E11 (item 11) |
| D-11 | Large text and high contrast at the smallest phone and on PC WeChat; whether a large system font is readable (first-launch default) | real screens and fonts | AC 89, 90; E12 (item 12) |
| D-12 | Banner on both boards once a unit exists (24 pt gap, never over rows), PC WeChat layout | ad platform | AC 91; E10 (item 13) |
| D-13 | Real audio (four WAV cues ship; loudness, latency, iOS silent switch) and the mute switch | audio | AC 49 |
| D-14 | Release build with and without `--ad-rewarded`/`--ad-interstitial`: confirm no "广告位（测试）" overlay in the uploaded build (V1-3 fixed; without ids the build is no-fill) | upload build | AC 43; H4 |
| D-15 | Import the contentVersion 2 / configVersion 3 seed bank (>= 60 days), then delete the local file | founder credentials | H5, AC 74 |
| D-16 | Capsule layout, safe areas and the sheet X on a notched iPhone and a small Android (X >= 48 pt tap, top-right) | real insets | AC 44, 45, founder fix 2 |

## Files QA added (tests only)

- G `tests/qa-content-v2.test.js` (8 tests), `tests/qa-client-v1.test.js` (7), `tests/qa-v1-recheck.test.js` (2: release build without ad ids, sound edge cases). The two former todos (V1-1, V1-3) now run as regressions.
- C `tests/qa-v1.test.js` (7).

---

# Historical: Phase 1 matrix (superseded by the v1 matrix above)

## Phase 1: AC matrix (QA), historical

Build under test: `dianjiangtai/phase1` @ 8171302. Spec: `docs/dianjiangtai/spec.md` section 20. Tuning verdicts use the founder override (12-0 really hard), not the old 7.5 numbers.
Paths: G = `apps/dianjiangtai/game/tests/`, C = `apps/dianjiangtai/cloudfunctions/tests/`. Short names: core-basic, core-sim, modules, smoke, render, render.opendata (G); submit, board, challenge, daily, group, security, cleanup, track, bank (C). New QA files: G `qa-content`, `qa-tuning`; C `qa-trust`, `qa-analytics`.
Todo-flagged QA tests (`{todo}`) assert the correct behaviour and report as TODO, not failure, while the bug exists.

| AC | Short text | Verdict | Evidence | Notes |
|---|---|---|---|---|
| 1 | Free run completable, 出征 after round 5 | PASS | smoke "a full free run plays headlessly"; core-sim "a legal run replays" | |
| 2 | Pool = undrafted, faction + era | PASS | core-sim "pools list only undrafted generals" | |
| 3 | No duplicate general / slot | PASS | core-sim "replay rejects: ... duplicate general, duplicate slot" | |
| 4 | 撤回 restores pool and slot | PASS | core-sim "undo restores the pool and the slot" | |
| 5 | Sheet shows 5 stats, chips with S_r | PASS | core-basic "role scores match", "fit chips"; PNG draft__selecting (320x568) | |
| 6 | Tier never changes odds | PASS | core-basic "sheet cells are uniform ... (AC 6)"; sheet.js reads no tier; simstats max deviation 1.12% | |
| 7 | Content valid, equals Appendix B | PASS | qa-content "Appendix B (parsed from spec.md) equals generals.v1.json exactly" (32 generals, every stat/era/tier/role/bond, 77 entries) | |
| 8 | Free re-spin once per dimension | PASS | core-sim "free re-spin is once per dimension per run" | |
| 9 | Ad re-spin free only, max 2 | PASS | core-sim "ad re-spins: free play only"; smoke "daily and challenge never offer ad re-spins" | |
| 10 | 此令无可换 when no alternative | PARTIAL | PNG draft__respin_none shows disabled button | Hint text "此令无可换" not asserted in any test |
| 11 | Determinism, 1000 replays, client = cloud | PASS | core-sim "same seed, same actions ... 1000 replays"; cloud tests run the real core | |
| 12 | Record sums to 12, bands correct | PASS | core-sim "records sum to 12 and the band matches"; qa-tuning band-uniqueness check | |
| 13 | Monotonicity (events off) | PASS | core-sim "monotonicity", "a stronger lineup never does worse" | |
| 14 | Events: conditions, once, named | accepted by CTO (pMin 0.672, spec being amended) | core-sim "events: fire only under their conditions" | Passes against config pMin 0.672; spec 7.2 says p>=0.35 (qa-tuning todo). Owner: spec |
| 15 | simstats within bands; CI gate | PARTIAL | `npm run simstats -- --check` exit 0 "all targets met"; qa-tuning re-measures on own seeds | Passes under the founder override. Original text (random mean 4.5-5.5, greedy mean 8-9, optimal 12-0 on 95% of free seeds) not met: random 1.91, naive 5.47, greedy 7.30, optimal 1.4% (soft NOTEs by design). Owner: spec (update AC text) |
| 16 | 复盘 drawable, >= player, < 300 ms | PASS | core-sim "复盘 search equals brute force"; simstats client max 245.8 ms node; 7.07% heavy sets go to getReplay | Real Android timing: DEVICE: deferred to spike |
| 17 | Reveal 12 rows <= 10 s; skip same verdict | PASS | smoke "reveal plays itself out in about 9 s ... same verdict as skipping" | |
| 18 | No per-player adjustment | PASS | core-sim "same seed ... mode does not matter", "battle and event randomness never depend on the lineup"; no ad/run-count input in core | |
| 19 | getDaily identical, no seed/best/battle | PASS | daily "getDaily: identical rounds/issueNo ... no seed/best/battle"; modules "api mock" | Residual risk: rounds is a pure function of a 32-bit seed, so a determined client could brute-force the seed from rounds (design limit; spec 21 progressive delivery) |
| 20 | Date key from server UTC+8 | PASS | daily "date key comes from core date.js even when runtime TZ is UTC"; modules "Beijing day roll" | |
| 21 | Daily gates satisfied | accepted by CTO (gate window, spec being amended) | qa-tuning "accepted daily seeds: optimal 12-0 ..." passes; todo "daily gate window" | Gate window greedy is [0.25%, 20%] (spec 0.5-5%). Scan of 12 accepted seeds: noisy-greedy 12-0 rate 0.75%-14.3%. Deterministic greedy/sensible/naive score 0% 12-0 on them, random 0.02%. Also no `relaxed` seed is ever published (live failure throws DAILY_UNAVAILABLE), differing from spec 5.2. Owner: spec + minigame-dev |
| 22 | One ranked daily per openid | PASS | submit "second distinct ranked run -> ALREADY_PLAYED", "same clientRunId returns the stored result"; qa-trust "ONE ranked daily ... through a challenge" | |
| 23 | Grace window 23:59 -> 00:10 ok, 00:31 late | PASS | submit "started 23:59 ... 00:31 -> LATE_SUBMIT"; qa-trust exact boundary (00:29:59.999 ranked, 00:30:00.000 LATE) | |
| 24 | Foreground after midnight refreshes card | PASS | modules "Beijing day roll: dateKey follows the server offset" | |
| 25 | In-progress daily survives relaunch | PASS | smoke "in-progress run survives relaunch at the same round" | |
| 26 | submitRun INVALID_ACTIONS cases | PASS | submit "rejects with INVALID_ACTIONS and persists nothing"; challenge "answers are validated like any run" | |
| 27 | Server record authoritative; mismatch flag | PASS | submit "tampered clientRecord sets mismatch=true" | |
| 28 | All collections deny client access | PASS | security "security rules deny all ..."; qa-trust deny-all check | Applying the rules in the console: DEVICE: deferred to spike |
| 29 | Sharing grants nothing | PASS | qa-content "every shareAppMessage call is in share.js, no callback"; smoke "sharing: ... grants nothing"; ads.js has no share path | |
| 30 | Share only on explicit tap / capsule | PASS | qa-content share code search (3 tap handlers + capsule menu) | |
| 31 | Daily card hides names, free shows | PASS | render "daily share card shows no general names; free card shows them"; PNGs shareCard/daily_12_0.png vs free_10_2.png; qa-content titles | Static-image fallback on render failure: code path in share.js, not exercised by a test |
| 32 | Challenge query only c=; lineup hidden until answered | PASS | challenge "challenge lineup is withheld until the recipient has answered"; modules "share: titles, queries" | |
| 33 | Daily-seed challenge counts as daily / friendly | PASS | challenge tests "today's daily seed ...", "already played", "past date", "without startRun" | See BUG-1: the friendly path leaks the daily optimum |
| 34 | Expired / missing / own states | PASS | challenge "own challenge", "expired, missing and malformed" | |
| 35 | Group entry: getGroupEnterInfo + joinGroup; no getShareInfo | PASS | smoke "group card: ticket present ...", "code search" | joinGroup trusts `event.groupData.data`; platform CloudID decryption: DEVICE: deferred to spike (a hand-made plain object is accepted server-side; low impact, needs the victim's openGId) |
| 36 | KV {w,l} after privacy; free never; old keys removed | PASS | smoke "daily run through the mock server ... marker written", "marker write refused"; privacy.js writes `JSON.stringify({w,l})`, removes keys older than 7 days | |
| 37 | Group board ranking, explainer without group | PASS | smoke "boards: no group context shows the explainer"; render.opendata "rank order depends on server rows only" | |
| 38 | Lineups hidden until ranked result | PASS | board "lineups (x) only for a caller with a ranked result"; qa-trust friendly-run caller gets no x | |
| 39 | Board states render and don't block | PASS | render "every screen x state x size draws"; PNG _contact_board (all states, 320x568) | |
| 40 | Reward only on isEnded === true | PASS | modules "reward only on isEnded === true"; smoke "closing the stub early grants nothing" | |
| 41 | D6 no-fill rule | PASS | modules "error 1004 and onLoad useFallbackSharePage follow the D6 rule"; smoke "no-fill grants once per run per placement" | |
| 42 | Interstitial caps | PASS | modules "interstitial: caps ..." | |
| 43 | Stub ads logged stub=true; production stub off | PARTIAL | modules "stub ads"; qa-content flag test | `build-config.js` ships `stubAds: true` (correct for the prototype, D5). The release step must flip it. Owner: release |
| 44 | Capsule not overlapped; primaries bottom 40% | PASS | render "AC 44" (2 tests); PNGs at 320x568 and 430x932 | |
| 45 | Targets >= 48, text >= 16, record >= 40, no clipping | PASS | render "AC 45" tests; re-inspected (fab330a) 320x568 and 375x667 `_contact_home.png`, 320x568 `_contact_challenge.png`, `_contact_result.png` | BUG-2 fixed: home sub-line no longer overlaps the button. 玩法 sheet token now shows "时" inside its tile, no overflow. Result screen at 320x568 still shows the share row partly behind 再来一局 until scrolled (scrollable, minor) |
| 46 | No prompt at launch / free run | PASS | smoke "boots to home ... no authorization prompts", "complete game is playable with every authorization refused" | |
| 47 | Offline: free play works; others show 重试 | PASS | smoke "daily: offline at the end saves the lineup"; PNG home__offline | Real network loss: DEVICE: deferred to spike |
| 48 | Main package <= 4 MB, total <= 30 MB | PASS | qa-content "main package ... <= 4 MB" (under 1 MB) | No CI wiring exists; this test is the check |
| 49 | Mute persists, silences audio | PASS | smoke "mute persists and is applied" | Real audio: DEVICE: deferred to spike |
| 50 | Forbidden terms on all user-visible strings | PASS | qa-content forbidden scan (all game files except the provenance field), share titles, content texts | Content `source` fields contain 三国志 (internal provenance, never rendered, as in spec 3.5 example); exempted deliberately |
| 51 | Every 15 event fires once with props | PARTIAL | modules "analytics: whitelist, common props, batches"; all 17 client events have emit sites (grep) | No single scripted session capturing every payload |
| 52 | 4 go/kill metrics computable | PASS | qa-analytics "AC 52" (one query function per metric, scripted data) | See BUG-3 |
| 53 | genDaily within timeout, both paths | PARTIAL | daily "live loop honours the 70% budget", "every function sets TZ and a timeout"; simstats p99 x 50 = 13.2 s vs 10 s timeout | Live path almost never succeeds (0.5% acceptance, 22% in 50 tries): bank is mandatory. Worst case throws instead of storing a relaxed seed. Timeout value needs the spike |
| 54 | Bank use, re-verify, low-bank warn, no bank in repo | accepted by CTO (warn at 10) | daily "bank is the primary path", bank "prepare-bank"; qa-trust no bank file | Low-bank warning threshold is 10 in code (spec < 7; config.daily.bankLowWarn=7 is unused). Owner: backend |
| 55 | gateCheck identical in tool and function | PASS | core-sim "gateCheck is deterministic"; qa-tuning reproducibility; security drift check | |
| 56 | Tampered KV never changes rank | PASS | render.opendata AC 56a/b/c; board "rank order equals server order" | |
| 57 | 180-day retention | PASS | cleanup tests | Privacy guide text is not in the repo (release) |
| 58 | No portrait assets | PASS | core-basic "no portrait image files"; qa-content package test | |
| 59 | 临阵生变 neutral; release review recorded | accepted by CTO (release writes the checklist before submission) | core-basic "texts contain no insulting wavering lines"; qa-content extended wordlist | `docs/dianjiangtai/release-checklist.md` does not exist, so the recorded review is missing. Owner: release |
| 60 | Raw openids never reach client | PASS | board "never returns raw openids"; qa-trust "AC 60 sweep" (getDaily, joinGroup, submitRun, challenge, replay, board, track); h differs per date; events hold no groupRef | odc.js posts only the server board message |
| 61 | getBoard cap, groupRef membership, x | PASS | board tests; qa-trust "non-member, made-up groupRef, member of another group" | |
| 62 | joinGroup idempotent, opaque ref, errors | PASS | group tests | |
| 63 | Authorization optional, never blocks | PASS | smoke "privacy refused", "scope refused", "marker write refused" | Real prompts: DEVICE: deferred to spike |
| 64 | disableFallbackSharePage; 1004 path | PASS | modules ads tests; smoke code search and wxad_fallback_share | |
| 65 | Interstitial 2001-2003 silent | PASS | modules "interstitial: ... 2001-2003 skipped silently" | |
| 66 | TZ=UTC / unset date key; config TZ + timeout | PASS | core-basic TZ tests; daily "every function sets TZ=Asia/Shanghai and a timeout"; qa-trust | |
| 67 | Idempotency by deterministic _id | PASS | daily "double-fire", "races the lazy getDaily path"; submit "two concurrent distinct runs" | Fake DB models duplicate _id; real transactions: DEVICE: deferred to spike |
| 68 | wx.reportEvent never used | PASS | smoke "code search" | |

### Re-verification at fab330a

Counts: PASS 59, FAIL 0, PARTIAL 5 (ACs 10, 15, 43, 51, 53), accepted by CTO 4 (ACs 14, 21, 54, 59), DEVICE-only parts noted in rows. (The first pass miscounted PASS as 51; correct first-pass figures were 58 PASS, 1 FAIL, 9 PARTIAL.)
- BUG-1 FIXED: getReplay returns REPLAY_LOCKED, challenge lineup sealed (getChallenge and submitRun). Regression: C `qa-trust` "regression BUG-1 chain" and the formerly-todo test, both pass. Client: locked 复盘 shows text and plays no ad (smoke "locked 复盘 ... no ad"; controller returns before ads.rewarded). No PNG of the locked replay state exists in the preview set; covered by the smoke test only.
- BUG-3 FIXED: `qa-analytics` sessionId test passes.
- BUG-2 FIXED (see AC 45).
- Tuning re-sample on QA's own 30k seeds: sensible 12-0 0.317% (target 0.2-0.5), greedy 0.5% (<=1), naive 0.093% (<0.2), random 0.007% (<0.01, thin margin), median 7, 10-11 band 8.77% (6-10), 0-1 band 1.07% (<=2). All pass.
- Known flaky backend test "live is the last resort..." (daily.test.js): did not fail in this run; recorded, not blocking.

### Bugs (first pass, now fixed unless noted)

- BUG-1 (security, owner backend): daily optimum leak. A user who has not played today's daily answers a challenge on today's daily seed WITHOUT calling startRun. submitRun stores a friendly run on the daily seed, then `getReplay` returns `bestLineup(run.seed, ...)`, the stored 12-0 optimum, before the user's own daily. The user then starts the daily and plays it for a ranked 12-0. The submitRun response also exposes per-battle p and luck, so unlimited probe lineups are possible. Test: C `qa-trust` "daily best lineup is never obtainable before ..." (todo; remove the flag to see it fail). Fix: refuse getReplay and friendly challenge runs on today's/grace-window daily seed until a ranked daily result exists, or always count such runs as the daily.
- BUG-2 (UI, owner frontend-ui): home daily-card sub-line overlaps the primary button at 320x568 (AC 45).
- BUG-3 (backend + minigame-dev): the client sends `sessionId` inside props and `ts` as clientTs; `track` reads `e.sessionId`, so `events.sessionId` is always null (queries must use props.sessionId). Test: C `qa-analytics` todo.
- DEV-1 (spec/minigame-dev): daily gate greedy window 0.25-20% vs spec 0.5-5%; no relaxed fallback.
- DEV-2 (spec): event threshold pMin 0.672 vs spec 0.35; low-bank warn 10 vs 7.
- NOTE tuning margins: sensible 12-0 is 0.25% in the report and 0.197% on QA's own 30k seeds (within sampling noise of the 0.2% floor); 0-1 band 1.86-1.91% vs cap 2%; 10-11 band 6.8-7.0% vs floor 6%. Everything sits at a band edge; consider centring.
