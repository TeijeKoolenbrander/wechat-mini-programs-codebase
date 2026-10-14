# 点将台 Phase 1: AC matrix (QA)

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
| 14 | Events: conditions, once, named | PARTIAL | core-sim "events: fire only under their conditions" | Passes against config pMin 0.672; spec 7.2 says p>=0.35 (qa-tuning todo). Owner: spec |
| 15 | simstats within bands; CI gate | PARTIAL | `npm run simstats -- --check` exit 0 "all targets met"; qa-tuning re-measures on own seeds | Passes under the founder override. Original text (random mean 4.5-5.5, greedy mean 8-9, optimal 12-0 on 95% of free seeds) not met: random 1.91, naive 5.47, greedy 7.30, optimal 1.4% (soft NOTEs by design). Owner: spec (update AC text) |
| 16 | 复盘 drawable, >= player, < 300 ms | PASS | core-sim "复盘 search equals brute force"; simstats client max 245.8 ms node; 7.07% heavy sets go to getReplay | Real Android timing: DEVICE: deferred to spike |
| 17 | Reveal 12 rows <= 10 s; skip same verdict | PASS | smoke "reveal plays itself out in about 9 s ... same verdict as skipping" | |
| 18 | No per-player adjustment | PASS | core-sim "same seed ... mode does not matter", "battle and event randomness never depend on the lineup"; no ad/run-count input in core | |
| 19 | getDaily identical, no seed/best/battle | PASS | daily "getDaily: identical rounds/issueNo ... no seed/best/battle"; modules "api mock" | Residual risk: rounds is a pure function of a 32-bit seed, so a determined client could brute-force the seed from rounds (design limit; spec 21 progressive delivery) |
| 20 | Date key from server UTC+8 | PASS | daily "date key comes from core date.js even when runtime TZ is UTC"; modules "Beijing day roll" | |
| 21 | Daily gates satisfied | PARTIAL | qa-tuning "accepted daily seeds: optimal 12-0 ..." passes; todo "daily gate window" | Gate window greedy is [0.25%, 20%] (spec 0.5-5%). Scan of 12 accepted seeds: noisy-greedy 12-0 rate 0.75%-14.3%. Deterministic greedy/sensible/naive score 0% 12-0 on them, random 0.02%. Also no `relaxed` seed is ever published (live failure throws DAILY_UNAVAILABLE), differing from spec 5.2. Owner: spec + minigame-dev |
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
| 45 | Targets >= 48, text >= 16, record >= 40, no clipping | FAIL | render "AC 45" tests pass; PNG `game/tools/preview/out/320x568/_contact_home.png` | BUG-2: at 320x568 the home daily-card sub-line is overlapped by the primary button. 430x932 is clean. Result screen at 320x568 also cuts the share row behind 再来一局 until scrolled (scrollable, minor) |
| 46 | No prompt at launch / free run | PASS | smoke "boots to home ... no authorization prompts", "complete game is playable with every authorization refused" | |
| 47 | Offline: free play works; others show 重试 | PASS | smoke "daily: offline at the end saves the lineup"; PNG home__offline | Real network loss: DEVICE: deferred to spike |
| 48 | Main package <= 4 MB, total <= 30 MB | PASS | qa-content "main package ... <= 4 MB" (under 1 MB) | No CI wiring exists; this test is the check |
| 49 | Mute persists, silences audio | PASS | smoke "mute persists and is applied" | Real audio: DEVICE: deferred to spike |
| 50 | Forbidden terms on all user-visible strings | PASS | qa-content forbidden scan (all game files except the provenance field), share titles, content texts | Content `source` fields contain 三国志 (internal provenance, never rendered, as in spec 3.5 example); exempted deliberately |
| 51 | Every 15 event fires once with props | PARTIAL | modules "analytics: whitelist, common props, batches"; all 17 client events have emit sites (grep) | No single scripted session capturing every payload |
| 52 | 4 go/kill metrics computable | PASS | qa-analytics "AC 52" (one query function per metric, scripted data) | See BUG-3 |
| 53 | genDaily within timeout, both paths | PARTIAL | daily "live loop honours the 70% budget", "every function sets TZ and a timeout"; simstats p99 x 50 = 13.2 s vs 10 s timeout | Live path almost never succeeds (0.5% acceptance, 22% in 50 tries): bank is mandatory. Worst case throws instead of storing a relaxed seed. Timeout value needs the spike |
| 54 | Bank use, re-verify, low-bank warn, no bank in repo | PARTIAL | daily "bank is the primary path", bank "prepare-bank"; qa-trust no bank file | Low-bank warning threshold is 10 in code (spec < 7; config.daily.bankLowWarn=7 is unused). Owner: backend |
| 55 | gateCheck identical in tool and function | PASS | core-sim "gateCheck is deterministic"; qa-tuning reproducibility; security drift check | |
| 56 | Tampered KV never changes rank | PASS | render.opendata AC 56a/b/c; board "rank order equals server order" | |
| 57 | 180-day retention | PASS | cleanup tests | Privacy guide text is not in the repo (release) |
| 58 | No portrait assets | PASS | core-basic "no portrait image files"; qa-content package test | |
| 59 | 临阵生变 neutral; release review recorded | PARTIAL | core-basic "texts contain no insulting wavering lines"; qa-content extended wordlist | `docs/dianjiangtai/release-checklist.md` does not exist, so the recorded review is missing. Owner: release |
| 60 | Raw openids never reach client | PASS | board "never returns raw openids"; qa-trust "AC 60 sweep" (getDaily, joinGroup, submitRun, challenge, replay, board, track); h differs per date; events hold no groupRef | odc.js posts only the server board message |
| 61 | getBoard cap, groupRef membership, x | PASS | board tests; qa-trust "non-member, made-up groupRef, member of another group" | |
| 62 | joinGroup idempotent, opaque ref, errors | PASS | group tests | |
| 63 | Authorization optional, never blocks | PASS | smoke "privacy refused", "scope refused", "marker write refused" | Real prompts: DEVICE: deferred to spike |
| 64 | disableFallbackSharePage; 1004 path | PASS | modules ads tests; smoke code search and wxad_fallback_share | |
| 65 | Interstitial 2001-2003 silent | PASS | modules "interstitial: ... 2001-2003 skipped silently" | |
| 66 | TZ=UTC / unset date key; config TZ + timeout | PASS | core-basic TZ tests; daily "every function sets TZ=Asia/Shanghai and a timeout"; qa-trust | |
| 67 | Idempotency by deterministic _id | PASS | daily "double-fire", "races the lazy getDaily path"; submit "two concurrent distinct runs" | Fake DB models duplicate _id; real transactions: DEVICE: deferred to spike |
| 68 | wx.reportEvent never used | PASS | smoke "code search" | |

## Bugs

- BUG-1 (security, owner backend): daily optimum leak. A user who has not played today's daily answers a challenge on today's daily seed WITHOUT calling startRun. submitRun stores a friendly run on the daily seed, then `getReplay` returns `bestLineup(run.seed, ...)`, the stored 12-0 optimum, before the user's own daily. The user then starts the daily and plays it for a ranked 12-0. The submitRun response also exposes per-battle p and luck, so unlimited probe lineups are possible. Test: C `qa-trust` "daily best lineup is never obtainable before ..." (todo; remove the flag to see it fail). Fix: refuse getReplay and friendly challenge runs on today's/grace-window daily seed until a ranked daily result exists, or always count such runs as the daily.
- BUG-2 (UI, owner frontend-ui): home daily-card sub-line overlaps the primary button at 320x568 (AC 45).
- BUG-3 (backend + minigame-dev): the client sends `sessionId` inside props and `ts` as clientTs; `track` reads `e.sessionId`, so `events.sessionId` is always null (queries must use props.sessionId). Test: C `qa-analytics` todo.
- DEV-1 (spec/minigame-dev): daily gate greedy window 0.25-20% vs spec 0.5-5%; no relaxed fallback.
- DEV-2 (spec): event threshold pMin 0.672 vs spec 0.35; low-bank warn 10 vs 7.
- NOTE tuning margins: sensible 12-0 is 0.25% in the report and 0.197% on QA's own 30k seeds (within sampling noise of the 0.2% floor); 0-1 band 1.86-1.91% vs cap 2%; 10-11 band 6.8-7.0% vs floor 6%. Everything sits at a band edge; consider centring.
