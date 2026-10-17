# 群友刻度盘 v1: AC matrix (QA)

Build under test: `kept-ideas/v1` @ 758b568 (security re-check, section below); earlier pass @ 721e844 (content v2: 304 spectra, 4,142 items). Spec §17.
G = `apps/kedupan/game/tests/`, C = `apps/kedupan/cloudfunctions/tests/` (suite/*.js run against both the mock and the real functions as `[mock]` / `[real]`). New QA files: G `qa-score`, `qa-client`; C `qa-server`.

Commands (re-run on 721e844): `npm test` in game, twice: 326 pass / 0 fail both times. `npm test` in cloudfunctions: 133 pass / 0 fail / 0 todo (plus my new `qa-kpi.test.js`, 1 pass). `node tools/build-schedule.js --check`: "schedule ok: 365 days from 20261101". First run on 48c22e5 had 6 FAIL (AC 10, 67, 70, 74, 77, 78).

Verdict key: PASS = verified by a test I read (or wrote) that really asserts the criterion; FAIL = bug in bugs.md; DEVICE = needs a real phone (check given).

| AC | Verdict | Evidence | Notes |
|---|---|---|---|
| 1 | PASS | qa-score "AC 1" (vectors and label boundaries, re-derived from spec) | |
| 2 | PASS | qa-score "AC 2" (M=1,2,odd,even,equal,0,100); G score "histogram median equals list median" | |
| 3 | PASS | qa-score "AC 3" (anchor 60 / one vote at 0 -> 60 / 1000 at 30 vs anchor 90 -> 30) | |
| 4 | PASS | qa-score "AC 4"; G score "daily total ... band boundaries" | |
| 5 | PASS | qa-score "AC 5"; G group "leave-one-out ... {10,20,90}", "群默契度 ... null for n = 2" | |
| 6 | PASS | G rounds "AC 6" (mean, late excluded, tie -> earliest) | |
| 7 | PASS | C core-sync "AC 7 ... 1,000 random fixtures" | |
| 8 | PASS | G content-spectra AC8 tests (v2: 304 spectra, 4,142 items); my broad-term scan of v2 found 0 forbidden hits (content-check.md) | forbidden list now has 倒数日, 抓娃娃, 夹娃娃, 盲盒, 求签, 抽签 |
| 9 | PASS | G schedule "AC 9" x5; `build-schedule --check` ok on v2 ("schedule ok: 365 days from 20261101") | Seasons assume launch 20261101 (placeholder): rebuild if the founder launches on another date |
| 10 | OPEN (founder) | content-review.md product-ux / QA / result columns; QA rule check done in content-check.md (v1 and v2 delta) | Human review (spec 4.4, H9) is founder-only; QA second review complete, no blocking finding. Not counted as FAIL |
| 11 | PASS | C suite "AC 11 card text always from the server copy"; G schedule "card helpers send the library text" | |
| 12 | PASS | C suite "AC 12" [real] and [mock] | |
| 13 | PASS | C suite "AC 13"; qa-server "never carry anchors, histograms, boardSalt or final" | |
| 14 | PASS | G ruler "AC 14" x4, client-daily "AC 14", render "no needle without vm.needle" | Feel on a phone: DEVICE E8 |
| 15 | PASS | C suite AC 15 (parallel calls -> n+1); qa-server "type confusion never throws and never writes" (17 bad inputs) and "forged fields" | |
| 16 | PASS | G client-daily "AC 16" x2, present "AC 16" x3, C suite "AC 16" | |
| 17 | PASS | G client-daily "AC 17", present "AC 17" | |
| 18 | PASS | G client-daily "AC 18" x2, C suite "AC 18/19", "AC 18/38" | |
| 19 | PASS | G client-social "AC 19/42/43", group "AC 19" | |
| 20 | PASS | qa-server "grace window" (00:29:59 ok, exactly 00:30:00 = LATE_SUBMIT, never-started user LATE, incomplete day on no board); G windows "AC 20"; client-daily "AC 20" x2 | |
| 21 | PASS | G client-daily "AC 21" x2; C suite "AC 21" | |
| 22 | PASS | G windows "AC 22" (TZ=UTC / unset / LA child processes); qa-server "16:00 UTC boundary"; C functions "AC 22 every function sets TZ and a timeout" | |
| 23 | PASS | C suite "AC 23"; qa-server "timers refuse clients" (genDaily/finalizeDay/sweepRounds/cleanup -> FORBIDDEN) | |
| 24 | PASS | C suite "AC 24" | |
| 25 | PASS | C functions "AC 25 ... 50,000" and "resumes after running out of time"; qa-server "定分: refs freeze ..." | Real cloud timeout: DEVICE E6 |
| 26 | PASS | G rounds "AC 26" (10,000 draws, 8-12% deciles), C core-sync crypto draw; qa-server "non-host never sees the target" (every round endpoint) | |
| 27 | PASS | G client-rounds "AC 27/28", rounds "AC 27", render "create" | |
| 28 | PASS | C suite "AC 28"; qa-server "clue cannot be changed after the first guess ... typed text never stored" | |
| 29 | PASS | G wechat-compat "AC 29"; hygiene; client-rounds "no typed text" | |
| 30 | PASS | qa-server "non-host never sees ... others' guesses"; G client-rounds "AC 30/31" | |
| 31 | PASS | C suite "AC 31" | |
| 32 | PASS | C suite "AC 32" (8th guess, 24 h, concurrent) | |
| 33 | PASS | G client-rounds "AC 32/33", rounds "AC 33" | |
| 34 | PASS | C suite "AC 34" | |
| 35 | PASS | C suite "AC 35"; qa-server "day rate limits" (20 ok, 21st RATE_LIMITED, resets next day) | |
| 36 | PASS | G archive-groups / client-archive "AC 36"; qa-server (DAY_OPEN at 00:10, ok at 00:31) | |
| 37 | PASS | G client-archive "AC 37" | |
| 38 | PASS | G client-archive "AC 38" | |
| 39 | PASS | G client-archive "AC 39"; qa-server "getBonusCard" (3 a day, closed days only, no anchors) | Server does not check "complete daily" (TD-10, UI-only gate; unranked, harmless). Informational |
| 40 | PASS | qa-server "unlockDistribution ... only returns answered cards"; G client-archive "AC 40" | Daily cap is 20, not the 3 of spec 11.2 (decisions TD-8, accepted deviation) |
| 41 | DEVICE | G client-social "AC 41" (ticket -> getGroupEnterInfo -> joinGroup, no getShareInfo); C suite "AC 41" | Real decrypt of opengid: E1. Check: share the group card to a test group on iOS and Android, open it, the group banner appears; open from a single chat, no banner |
| 42 | PASS | G archive-groups "AC 42/47"; qa-server "group page: non-member ..." | |
| 43 | PASS | G opendata "AC 43" x2, archive-groups "AC 43" | |
| 44 | PASS | G opendata "AC 44" x2 | |
| 45 | PASS | G opendata "AC 45", group "AC 45" | |
| 46 | PASS | G group / archive-groups "AC 46", client-social "AC 46" | |
| 47 | PASS | G client-social "AC 47", rounds-flow "AC 47" | |
| 48 | PASS | G client-social "AC 48" x3, render "group and friend: every state draws" | |
| 49 | PASS | qa-server "privacy: a long scripted session ..." (4 users, 60+ responses incl. getRound host/guesser/reveal, getGroupDay, getFriendBoard, archive; no openid / openGId / key named openid; stored events hold no groupRef); G client-platform "AC 49" | |
| 50 | PASS | qa-client "AC 50/51" (state compared before/after a share); G hygiene "AC 50/51" | |
| 51 | PASS | qa-client (0 shares until a tap; withShareTicket without isUpdatableMessage); `shareAppMessage` appears only in js/share.js, called from tap flows | |
| 52 | PASS | G render "AC 52/53"; `docs/kedupan/preview/share/daily.png` viewed: prompts, ends, label blocks and total only | |
| 53 | PASS | G client-social "AC 53", render "AC 52/53" | |
| 54 | PASS | G client-social "AC 54" x3, policy "AC 54" | |
| 55 | PASS | qa-client "AC 55" (all ad units configured, full daily: 0 rewarded/interstitial/banner); G client-archive "AC 55" | |
| 56 | PASS | G client-ads "AC 56", policy "AC 56" | |
| 57 | PASS | G client-archive "AC 57" x2, policy "AC 57" | |
| 58 | PASS | G client-ads "AC 58"; qa-client "wxad_fallback_share=1 launch" | |
| 59 | PASS | G client-archive "AC 59" x5, policy "AC 59" x3 | |
| 60 | DEVICE | G client-archive "AC 60" x3 (default off, allowed screens, needs unit id); render "banner" (>= 24 pt gap) | Needs a real 流量主 banner unit: E10. Check: banner only on group page / friend board / archive list, never overlapping rows or buttons |
| 61 | PASS | G client-ads "AC 61"; build-config.js `stubAds:false` | Re-check in the release build |
| 62 | PASS | G client-rounds "AC 62", policy, C suite "AC 62" | |
| 63 | PASS | C suite / functions "AC 63" (parallel reveal paths, one message per grant); G client-rounds "AC 63" | Real notice: DEVICE E7 |
| 64 | PASS | G client-social "AC 64"; qa-client "AC 64" | |
| 65 | DEVICE | G client-social "AC 48/65" x2 (anonymous rendering, no re-prompt, re-render after enabling) | Real popup placement: E4. Check: refuse privacy, open group page / friend board / reveal: rows say 群友 A/B, no re-prompt; enable in settings, return, names appear |
| 66 | PASS | G client-social "AC 66" | |
| 67 | OPEN (release step) | C functions "AC 67" passes (cleanup 180 days, keeps aggregates) | The privacy guide text stating 180 days comes in the release pack (Art. 7); to be re-checked then. Not counted as FAIL |
| 68 | PASS | C functions "AC 68", core-sync "AC 68" | |
| 69 | PASS | G render "AC 69" x2 | |
| 70 | PASS | Re-checked on 721e844: previews 320x568_large home / card / result / settings and 414x896_hc group regenerated: card title wraps to 2 lines (no ellipsis), "超过全国 68%" no longer orphans the %, reveal lines fully visible above the ruler, 最同频 row fits; G render tests pass (326 green) | Residual nit: in the home "done" state the last line of the card is cut at the card edge but the card scrolls. Device E9 still applies |
| 71 | PASS | G render "AC 71" (7:1 / 3:1 / 4.5:1), "share cards standard look" | PC WeChat no-clipping: DEVICE E9 |
| 72 | PASS | G client-states "AC 72"; render group/friend states | |
| 73 | PASS | G client-daily "AC 73" | |
| 74 | PASS | `assets/icon.png` (144x144) and `assets/share-fallback.png` (500x400) exist; G wechat-compat "AC 74" requires only these two images; shipped size well under 4 MB | |
| 75 | PASS | G hygiene / wechat-compat "AC 75" x3 (loader under WeChat rules) | |
| 76 | PASS | G client-daily "AC 76" | |
| 77 | PASS | C qa-server: round_reveal written exactly once for host, 8th-guess, timer and racing paths (4 tests); `board_list` now written by getFriendBoard and getGroupDay (grep); G client-platform "AC 77" | |
| 78 | PASS | C `qa-kpi.test.js`: share rate, card-open-to-play, round reveal rate, archive sets per session computed from the events collection of a scripted session; group activation = daily_entries x group_members | |
| 79 | PASS | G client-platform "AC 79", rounds-flow "AC 79"; qa-server (10 a day, then RATE_LIMITED) | |
| 80 | PASS | G streak "AC 80" x6 | |
| 81 | PASS | G client-daily "AC 81", C suite | |
| 82 | PASS | C functions "AC 82", G daily-flow "AC 82" | |

Totals after re-verification on 721e844: PASS 77, FAIL 0, DEVICE 3 (AC 41, 60, 65), OPEN 2 (AC 10 human review, founder; AC 67 release pack, release step). Several PASS rows also carry a device check. QA-6 judged against the current release gate (see bugs.md).


## Security re-check (kept-ideas/v1 @ 758b568, TD-62..67 and the release-only ignore change)

Commands: `npm test` in game, dev x2: 364 tests, 360 pass, 0 fail, 3 skipped, 1 todo (the todo is QA-7, expected-failing by design). Release (`release-config.js --env env-test --shared-test-env`): same counts, 0 fail. Before my new tests were added, the original 356 (353 pass, 3 skipped) were also green in release with `--appid wx0123456789abcdef`. `--dev` restores; `git status` clean after each. `npm test` in cloudfunctions x2: 158 pass, 0 fail. `node tools/build-schedule.js --check`: "schedule ok: 365 days from 20261101". `npm run pack -- --prefix ""`: 21 functions, 4 with timers, anchors.v1.js and schedule.v1.js present in every function folder. Release package (non-ignored files, 71 files): 694,740 bytes (0.66 MiB).

New QA files: G `qa-security.test.js`, `qa-devtools-boot.test.js`; C `qa-security.test.js`.

| Area | AC touched | Verdict | Evidence |
|---|---|---|---|
| joinGroup cloudID path (M1) | 41, 49 | PASS | C qa-security: id length 8/512 boundaries, charset, non-strings; payload without `chat_type` joins (CTO ruling), 3 and 4 join, 1/2/0/'x'/null/3.5 refused, `open_single_roomid` = NOT_GROUP, opengid 128 ok / 129 refused; forged `groupData` / object cloudID / bare fields refused, only well-formed strings reach the platform; response never carries the openGId. Observation: a numeric string chat_type ("3") is accepted (lenient, harmless). Device: E11 (does a real payload carry chat_type; does a real cloudID match `[A-Za-z0-9_-]{8,512}`) |
| Rate limits + client handling (M3) | 35, 79, 15 | PASS | C qa-security: per function and per openid, next minute reopens, table equals CLIENT_FUNCTIONS; G hardening-client (createRound/getDaily/track minute refusals retryable, not "limit used up") |
| Server-only files out of the RELEASE package, loadable by the DEV mock (M2) | 11, 13, 74 | PASS | G qa-devtools-boot: the project packed from the COMMITTED config boots the mock server under WeChat loader rules and serves a daily; the release ignore list drops mock, stub, anchors, schedule, the client text library still loads, no anchor values anywhere in the package. G qa-security: client text items are `{id,text}` only. Package 0.66 MiB |
| DevTools crash (TD-67 sha256 copy) | 75 | PASS | qa-devtools-boot: main-domain load graph has nothing under `opendata/`; `js/sha256.js` present; sha256-copies and wechat-compat isolation tests pass |
| Late guess `s:null` and 直接看答案 (L4) | 6, 31, 33 | PASS server; FAIL UX edge (QA-7); FAIL spec not updated (QA-8) | C qa-security: showAnswer on an open round leaks nothing and records no view, non-boolean refused, no other endpoint carries the target; dev tests: rows `s:null`, ROUND_EXPIRED after a view. G qa-security: late rows have no score. Preview `opendata/round__*` shows 揭晓后作答 with no number |
| Track allowlist (L2) | 77, 78 | PASS | G qa-security: every event the real client emits in a full session (daily, share, round view, late guess) has all required props and survives `sanitizeProps` unchanged (no silent KPI loss); C qa-security: valid props stored, server-side names from a client dropped, 51-event batch refused; `qa-kpi.test.js` still computes the KPIs |
| Timers need the trigger marker (L3) | 23 | PASS | C qa-security: a call WITH `Type:'Timer'` but an OPENID is still FORBIDDEN; dev tests: bare, wrong type, empty TriggerName FORBIDDEN, marker ok |
| Pepper >= 32 (L5) | 41 | PASS | dev test (31 chars SERVER_CONFIG, 32 ok); the release pack text is stale, RP-3 |
| Lazy transitions transactional (L1) | 32, 34 | PASS | dev tests (a draft opened meanwhile survives; a guess landing meanwhile turns noGuesses into the timer reveal); C suite AC 32 green x2 |
| Query parsing (I3) | 75 | PASS | G qa-security: 10 hostile query strings and 7 hostile query objects never crash boot |
| Previews | 52, 70, 71 | PASS | render, opendata and vm code unchanged since 721e844 (git diff: CONTRACT.md and share.js only), so previews cannot have regressed; round sheet and opendata round list viewed: late row shows 揭晓后作答, no score |

Totals: unchanged ACs stay PASS (77), 0 FAIL on any numbered AC; new open items QA-7 (client, edge), QA-8 (spec), QA-9 (docs), RP-1..RP-8 (release pack, bugs.md). Device pass E11 already listed.

## Founder device pass (spec §14)
- E1 group card: join and decrypt on iOS and Android; a single chat gives no group context. (AC 41)
- E2/E3 friend and group rows carry openid; 500+ row hash join under 50 ms on Android; biggest board payload.
- E4 privacy popup and friend-scope prompt appear only after a tap (completed daily's 看结果, group page, friend board, reveal); refusal renders anonymously; settings recovery. (AC 65)
- E5 rewarded no-fill with `disableFallbackSharePage: true` shows no share page; interstitial 2001/2002 skipped silently (needs the first ad units).
- E6 timers fire once: genDaily 23:00, finalizeDay 00:40, sweepRounds hourly, cleanup 04:00; double fire is a no-op; finalizeDay duration at scale. Set `GROUP_REF_PEPPER`, `LAUNCH_DATE_KEY` (rebuild the schedule if the launch is not 20261101).
- E7 subscribe: accept -> exactly one notice at reveal, opens `r=<id>`; no template -> no offer.
- E8 ruler feel on the smallest and largest phones and PC WeChat: ends 0 and 100 reachable, no missed touches.
- E9 large text and high contrast at 320x568 and PC WeChat: nothing clipped (QA-5 fixed).
- E10 banner once a 流量主 unit exists: allowed screens only, 24 pt gap.
- Extra (release step): follow `apps/kedupan/game/RELEASE.md`: set `cloudEnv` (and `fnPrefix`), keep `stubAds:false`, add the two `packOptions.ignore` entries, run `npm test` (release-gate). The studio-wide release switch will be ported later.
- E11 (security audit M1) forged groupData object rejected on device: with a modified client (or a console call to joinGroup) send {groupData:{cloudID,data:{opengid:"X",chat_type:3}}} and {cloudID:{...same object}}: both return BAD_CLOUDID and kedupan_group_members gets no row; a cloudID string from a real group card still joins. Also record in the device notes whether the decrypted payload of a real group card carries `chat_type` (the server accepts it absent, or 3/4), and that a single-chat card (`open_single_roomid`) gives no group.
