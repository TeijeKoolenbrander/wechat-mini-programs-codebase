# 点将台 v1: AC matrix (QA)

Build under test: `dianjiangtai/v1` @ f2a7d66. Spec: `docs/dianjiangtai/spec.md` section 20 (AC 1-95), decisions D1-D16, C1-C5.
Paths: G = `apps/dianjiangtai/game/tests/`, C = `apps/dianjiangtai/cloudfunctions/tests/`. New QA files this pass: G `qa-v1`, C `qa-v1` (earlier: G `qa-content`, `qa-tuning`; C `qa-trust`, `qa-analytics`).
Verdicts: PASS / FAIL / PARTIAL / DEVICE-deferred (needs a real device or the console; node-side part passes where noted).

## Commands run (all at f2a7d66 + QA additions)

| Command | Result |
|---|---|
| `cd game && node --test tests/*.test.js` | 251 pass, 0 fail (before the new qa-v1 file; qa-v1 adds 7, all pass) |
| `cd cloudfunctions && npm test` (runs sync-core first) | 148 pass, 0 fail (qa-v1 adds 3 pass + 1 todo: AC 95) |
| `npm run simstats -- --check` (100k seeds, content 2 / config 2) | exit 0, "all targets met" (random 0.00%, naive 0.17%, greedy 0.56%, sensible 0.33%, median 7, 10-11 band 8.90%, 0-1 band 0.55%, events 24.1%) |
| `QA_SEEDS=100000 node --test --test-name-pattern="content 2" tests/qa-tuning.test.js` (own seed namespace) | 5 pass. sensible 12-0 0.378%, median 7, greedy 0.553%, naive 0.186%, random 0%, 10-11 8.77%, 0-1 0.52% |
| `tools/preview`: `SIZES=320x568,430x932 MODES=default,large,hc node render.js` | 834 PNGs; contact sheets viewed (see UI notes) |
| Main package size (qa-v1 G, packOptions.ignore applied) | 582,392 bytes (limit 4 MB); tests, tools, node_modules ignored; no image/font files in the app |

Note: the cloud-function tests need `core/` copied into each function (`npm test` does it; plain `node --test` fails the drift check with "missing directory .../core"). That is by design but easy to trip over.

## Matrix

| AC | Short text | Verdict | Evidence | Notes |
|---|---|---|---|---|
| 1 | Free run completable, 出征 after round 5 | PASS | G smoke "a full free run plays headlessly"; PNG draft readyToMarch | |
| 2 | Pool = undrafted, faction + era, cap 8 | PASS | G core-rules-v2 "pool cap", "pool = first 8 undrafted" | |
| 3 | No duplicate general / slot | PASS | G core-sim replay rejects; core-rules-v2 "person drafted at most once" | |
| 4 | 撤回 restores pool and slot | PASS | G core-sim "undo restores"; core-rules-v2 "undo restores it exactly" | |
| 5 | Sheet shows 5 stats, fit chips with S_r | PASS | G core-basic; PNG draft__flipped, placed (chip text 适任/可用/错位) | |
| 6 | Tier never changes odds | PASS | G core-rules-v2 "cells uniform ... independent of tier"; simstats max deviation 1.12% | |
| 7 | v1 content intact; v2 valid; forbidden terms | PASS | G qa-content, core-content-v2, qa-v1 (own list incl. 传说/稀有) | The dev qa-content scan omitted 传说/稀有; qa-v1 closes that |
| 8 | Free re-spin once per dimension | PASS | G core-sim "free re-spin is once per dimension" | |
| 9 | Ad re-spin only in free play, max 2 | PASS | G core-sim "ad re-spins: free play only"; smoke | |
| 10 | 此令无可换 when no alternative | PARTIAL | PNG draft__respin_none (button disabled); controller.js shows toast "此令无可换" | The text is a toast on tap, not on the disabled button itself; no test asserts the string. Owner: minigame-dev (add a test) |
| 11 | Determinism, 1000 replays, client = cloud | PASS | G core-rules-v2 "determinism over 1000 replays"; C core-consistency | |
| 12 | Record sums to 12, band table | PASS | G core-rules-v2; qa-tuning band uniqueness | |
| 13 | Monotonicity | PASS | G core-rules-v2 "stronger lineup never does worse" (v2) and core-sim (v1) | |
| 14 | Events conditions, once, named | PASS | G core-sim events; spec 7.2 now amended to pMin 0.672 | Earlier deviation resolved in the spec |
| 15 | Tuning targets (D15) + CI gate | PASS | simstats --check exit 0; QA own 100k sample (above) | Soft NOTEs (random mean 1.50, naive 6.05, greedy 7.66, optimal 1.97%) are non-gating by design. Margins thin: naive 0.17-0.19% vs < 0.2%, sensible 12-0 0.33-0.38% vs <= 0.5% |
| 16 | 复盘 drawable, >= player, < 300 ms | PASS | G core-rules-v2 "复盘 equals brute force"; simstats client max 94 ms | |
| 17 | Reveal 12 rows <= 10 s, skip identical | PASS | controller REVEAL_MS 700 x 12 = 8.4 s (+0.3 s); `result:revealSkip` routes to completeReveal; record comes from the server | No dedicated timing test (code reading + smoke) |
| 18 | Outcome independent of ads / mode / user | PASS | G core-sim "battle and event randomness never depend on the lineup"; core-rules-v2 "mode does not matter" | |
| 19 | Same issue and rounds for all users, no battle stream / best | PASS | C progressive "captured payload test"; C qa-v1 AC 86 | |
| 20 | Date key from server UTC+8 | PASS | G core-basic TZ tests; C qa-trust | |
| 21 | Daily gates; relaxed always false | PASS | G qa-tuning "accepted daily seeds ... 12-0 on 100%"; daily.js forces `relaxed:false` | The cloud harness patches the gate (accept-all) for speed, so cloud tests do not exercise real gates; the real gate is exercised in G |
| 22 | One ranked daily per openid | PASS | C submit, qa-trust "ONE ranked daily per openid" | |
| 23 | Grace window to 00:30 BJT, LATE_SUBMIT | PASS | C qa-trust "midnight grace boundary is exact" | |
| 24 | Foreground after midnight refreshes home card | PARTIAL | controller.js onShow refreshes when the dateKey changed and screen is home | No test exercises it. Owner: minigame-dev (add a smoke test) |
| 25 | In-progress daily survives relaunch | PASS | G smoke, client-v1 "kill and relaunch mid-run" | |
| 26 | submitRun INVALID_ACTIONS cases | PASS | C submit, progressive | |
| 27 | Server record authoritative, mismatch flag | PASS | C submit, features "mismatch" | |
| 28 | All collections deny-all | PASS | C security, features "rules: every new collection is deny-all", qa-v1 (own check of every rules.json entry) | Applying the rules in the console: DEVICE-deferred |
| 29 | Sharing grants nothing | PASS | G qa-content share code search; smoke | |
| 30 | Share only on tap or capsule | PASS | G qa-content | |
| 31 | Daily card hides names, free shows | PASS | G render share card tests; client-v1 album "daily card carries no general names" | |
| 32 | Challenge: c= only, lineup hidden, daily lock | PASS | C challenge, spoiler, qa-trust "regression BUG-1 chain" | |
| 33 | Challenge on today's daily counts / friendly | PASS | C challenge, progressive "counts as the daily" | |
| 34 | Expired / missing / own states | PASS | C challenge | |
| 35 | Group entry via getGroupEnterInfo + joinGroup | PASS | G smoke, qa-v1 (no getShareInfo anywhere) | CloudID decryption: DEVICE-deferred |
| 36 | KV {w,l} after privacy; old keys removed | PASS | G smoke daily/marker tests | |
| 37 | Group board ranking, explainer | PASS | C board; G render.opendata | |
| 38 | Lineups hidden until ranked result | PASS | C board, qa-trust | |
| 39 | Board states render, never block | PASS | G render; PNG _contact_board (320x568 and 430x932, default/large/hc) | |
| 40 | Reward only on isEnded === true | PASS | G modules, smoke | |
| 41 | D6 no-fill rule | PASS | G modules | |
| 42 | Interstitial caps | PASS | G modules; client-units "never-in rules stay" | |
| 43 | Stub ads logged; production stub off | PARTIAL | G modules, qa-content flag | `build-config.js` ships `stubAds: true`. Release step must flip it. Owner: release |
| 44 | Capsule not overlapped; primaries bottom 40% | PASS | G render "AC 44"; PNGs | |
| 45 | Targets >= 48, text >= 16, no clipping | PASS | G render AC 45; contact sheets at 320x568 and 430x932 viewed | Large mode at 320x568 scrolls (draft awaitFlip pushes 我的阵容 below the fold; the draft is scrollable, acceptable) |
| 46 | No prompt at launch / free run | PASS | G smoke | |
| 47 | Offline: free works, others 重试 | PASS | G smoke, client-v1 offline tests | Real network loss: DEVICE-deferred |
| 48 | Main package <= 4 MB incl. odc | PASS | G qa-v1: 582,392 bytes, dev folders ignored | Display-font subpackages: none exist in the repo (system fonts only); no CI wiring beyond the test |
| 49 | Mute persists, silences audio | PASS | G smoke | Real audio: DEVICE-deferred |
| 50 | Forbidden terms on all user-visible strings | PASS | G qa-v1 (full AC 7+50 list over roster, statNotes, appearance notes, all shipped files), qa-content | `source` fields (三国志 provenance) exempt and never rendered. Checker word lists in core/content.js, core/validate.js, js/render/widgets.js contain the words by design |
| 51 | Every event fires once, sessionId top-level | PARTIAL | G modules analytics; client-v1 "analytics: v1 events"; C qa-analytics sessionId | No single scripted session captures every payload of the spec's scenario |
| 52 | KPIs computable from events | PASS | C qa-analytics | |
| 53 | genDaily timeout, both paths, DAILY_UNAVAILABLE | PARTIAL | C daily tests (live loop budget, TZ + timeout config, worst case) | Timeout value comes from the device spike: DEVICE-deferred. Live path accepts ~0.5% (24% in 50 tries): bank is mandatory |
| 54 | Bank use, re-verify, low-bank warn < 10, no bank in repo | PASS | C daily, bank, qa-trust | |
| 55 | gateCheck identical in tool and function | PASS | G core-rules-v2 "gate ... reproducible"; qa-tuning | |
| 56 | Tampered KV never changes rank | PASS | G render.opendata AC 56a/b/c; C board "rank order equals server order" | |
| 57 | 180-day retention | PARTIAL | C cleanup, features "180-day retention covers the v1 collections" | "Privacy guide states 180 days": no such text in the repo. Owner: release |
| 58 | No portrait assets | PASS | G qa-v1 (no image or font file anywhere in apps/dianjiangtai) | |
| 59 | 临阵生变 neutral; review recorded | PARTIAL | G core-content-v2 wavering test, qa-content | `docs/dianjiangtai/release-checklist.md` still missing. Owner: release |
| 60 | No openids to client | PASS | C qa-trust "AC 60 sweep" (getDaily, joinGroup, getRound, submitRun, getHistory, challenge, replay, board, track); features "responses never contain openids"; G integration | |
| 61 | getBoard cap, groupRef membership, x | PASS | C board, qa-trust | |
| 62 | joinGroup idempotent, opaque ref | PASS | C group | |
| 63 | Authorization optional | PASS | G smoke | Real prompts: DEVICE-deferred |
| 64 | disableFallbackSharePage; 1004 path | PASS | G modules; qa-v1 code search | |
| 65 | Interstitial 2001-2003 silent | PASS | G modules | |
| 66 | TZ=UTC / unset; config TZ + timeout | PASS | G core-basic; C daily, qa-trust, features (new functions) | |
| 67 | Idempotency by deterministic _id | PASS | C daily, submit | Real transactions: DEVICE-deferred |
| 68 | wx.reportEvent never used | PASS | G qa-v1 code search | |
| 69 | contentVersion 2 validation (120 generals) | PASS | G core-content-v2 (parses Appendix C, 21 cells, 273 entries); qa-v1 independent counts | |
| 70 | Person drafted once | PASS | G core-rules-v2 "赵云 ... 已点将"; C submit/progressive (duplicate via different cells rejected) | |
| 71 | Cohesion from drafted cell faction | PASS | G core-rules-v2; C cv2 `lineupFac` | |
| 72 | Pool cap, client = server, v1 regression | PASS | G core-rules-v2 "v1 regression"; C core-consistency, cv2 | |
| 73 | 16 bonds, +0.04, M <= 1.25 | PASS | G core-rules-v2 | Rates per simstats: 11 of 16 bonds fire < 0.05% in sensible play (龙凤, 西凉, 下邳, 河北, 二士, 平吴, 河内, 父子同袍 关, 承业 at 0.00%). Reported, not a failure; consider whether bonds feel invisible. Owner: product-ux |
| 74 | Re-tuning keeps D15; bank >= 60 seeds | PARTIAL | simstats exit 0 incl. arguability (刘备 34.5% of optimal lineups, <= 60%); 32 originals diff in G core-content-v2 and qa-v1 | The prepared contentVersion 2 bank (>= 60 accepted seeds) is not in the repo by AC 54, so it cannot be verified here. Owner: backend/release (run prepare-bank, confirm count) |
| 75 | 复盘 p99 < 300 ms below heavySets; server above | PASS | simstats: client p99 80 ms; heavy (83.5% of searches) go to getReplay p99 408 ms, worst case 555 ms << 10 s | Most 复盘 are served by the cloud (getReplay first). Fine functionally; costs a cloud call per replay |
| 76 | Seal portraits everywhere, offline, font fallback | PARTIAL | G render.v1 seal tests (all factions x tiers x lengths, 晋 ink on 月白, plain frame hidden); seal gallery PNG viewed | Display-font subpackage failure fallback and no-network check: DEVICE-deferred (no font subpackage exists; system font only). Readability: see UI notes |
| 77 | variant shiren exactly on Sundays, 4 functions | PASS | G core-rules-v2 (3 years, TZ); C qa-v1 (getDaily, getBoard, getChallenge, getHistory on Sunday vs Tuesday) | |
| 78 | 识人 hides all stats before the verdict | PASS | G render.v1 AC 78 (3 tests), client-v1 Sunday flow, core-rules-v2 "识人 never changes the sim" | |
| 79 | Challenge on 识人 played hidden, label | PASS | G client-v1 "shiren challenge ..."; PNG home available_shiren | |
| 80 | Streak rules | PASS | C streak-history (all listed cases) | |
| 81 | Streak shown from 2, no grants, no pressure copy, no notifications | PASS | G client-units "streak text only from 2, no reward words"; C streak-history "no streak-linked grants"; copy grep: no urgency wording | |
| 82 | 往期 list, best only after D+1 00:30 | PASS | C streak-history (00:29:59 hidden, 00:30:00 shown); G client-v1; PNG history | |
| 83 | Save to album at point of use | PASS | G client-v1 (nothing before tap, success, denied sheet with 去设置, no re-prompt, privacy 104) | Privacy-guide entry 相册（仅写入）: release check, DEVICE-deferred |
| 84 | Subscribe hidden when unconfigured | PASS | G client-v1 (3 tests), client-units; C features | |
| 85 | One subscribe send to owner | PASS | C features (single, parallel, failure, 2 s cap) | Real send: DEVICE-deferred |
| 86 | Progressive tokens | PASS | C progressive; qa-v1 (own captured-payload test, daily-as-challenge, skip-ahead refused, no seed/optimum/battle keys); core-consistency | |
| 87 | Offline mid-daily: 令牌传递中断 + 重试 | PASS | G client-v1 "progressive daily offline" | |
| 88 | Anomaly flags observe-only | PASS | C features (one per run+kind, suspect >= 5, roll-up, ALERT) | |
| 89 | 大字模式 sizes, every screen | PASS | G render AC 89 (buttons >= 56 tall), client-v1 display modes; PNGs at 320x568 and 430x932 viewed (home, draft, result, history, board) | Board row in large mode at 430x932: band label and seal chips nearly touch (tight, not clipped). Owner: frontend-ui (cosmetic) |
| 90 | 高对比度 contrast tests | PASS | G render.v1 AC 90 (4.5:1 default, 7:1 hc, 3:1 non-text) | |
| 91 | Banner off by default, board-only | PASS | G client-units, client-v1, render.v1 AC 91 | |
| 92 | Interstitial config, clamping | PASS | G client-units, client-v1 | |
| 93 | v1 events fire with props | PASS | G client-v1 "analytics: v1 events" | |
| 94 | app_config missing: fully playable | PASS | G client-v1; C features | |
| 95 | Release pack + TZ/timeout + deny-all for new collections | FAIL | C qa-v1 AC 95 (todo): no Founder Handoff or device-pass checklist in docs/dianjiangtai; C features confirms TZ + timeout + deny-all for the new functions/collections | Missing deliverable. Owner: release (§19 H1-H9 handoff, §17.1 device checklist with empty result column) |

## Decisions and corrections

| Item | Verdict | Evidence |
|---|---|---|
| D1 (superseded by D16) / D3 roster | PASS | 120 generals, 32 originals unchanged (qa-v1 own diff) |
| D2 五德 stats | PASS | integers 1-10, qa-v1 |
| D4 daily cards hide names | PASS | AC 31 |
| D5 stub ads | PASS (flag must flip, AC 43) | |
| D6 ad no-fill | PASS | AC 41 |
| D7 180 days | PARTIAL | code yes; privacy-guide text missing (AC 57) |
| D8 临阵生变 | PARTIAL | review record missing (AC 59) |
| D9-D14 operational / compliance | not code-testable | forbidden terms and share rules verified (AC 29, 30, 50) |
| D15 12-0 really hard | PASS | simstats + own sample |
| D16 merged phases | PASS | v1 features verified above |
| C1 / C3 leaderboard trust | PASS | AC 56, 60, 61 |
| C2 daily generation | PARTIAL | AC 53 timeout from spike |
| C4 Phase 0 findings | PASS | getGroupEnterInfo, disableFallbackSharePage, privacy flow (AC 35, 63, 64) |
| C5 daily spoiler lock | PASS | AC 32 plus C spoiler, cv2 "daily spoiler lock holds on the live content version", qa-trust BUG-1 chain regression; getHistory best only after 00:30 |

## Summary counts

AC 1-95: PASS 85, FAIL 1 (AC 95), PARTIAL 9 (AC 10, 24, 43, 51, 53, 57, 59, 74, 76), DEVICE-deferred rows 0 (device-only parts are noted inside PASS/PARTIAL rows: console rules, CloudID, real network, audio, prompts, transactions, subscribe send, fonts).

## UI notes (preview sheets viewed: 320x568 and 430x932, default / large / hc)

- Seal readability: good at 24-48 pt and above. Tier frames (甲 double, 乙 single, 丙 dashed corners) are distinguishable; 晋 ink-on-月白 is legible. Below 48 pt the monogram is used and is legible.
- Seal character order: names are drawn in traditional right-to-left order (关羽 shows 羽关, 司马懿 shows 马懿 under 司). In the draft pool and board the seal tile sits directly next to the plain-text name (seal 羽关 beside text 关羽), so the same name is visibly shown in both orders. Recommend: switch the seal to modern left-to-right (2 chars: 关羽; 3 chars: left column 诸葛, right column 亮 is not natural either, so use 2 rows: top 诸葛, bottom 亮 or just 诸 + 葛亮 reading left to right), or use the monogram at all sizes in lists where the name is printed beside it. Owner: frontend-ui, product-ux to decide.
- No clipping found; scrollable screens (draft, result at 320x568 in large mode) push lower content below the fold, which is expected.

## Bugs and recommendations

- FAIL AC 95 (release): release pack not delivered.
- PARTIAL items above: owners listed per row. None are security or fairness issues.
- Earlier first-pass bugs (daily optimum leak, sessionId, home overlap) remain fixed; regressions in C qa-trust and qa-analytics pass.
- No Trust or Fairness defects found in this pass: progressive delivery, spoiler lock, one ranked daily, tampered KV, openid sweep and deny-all rules all pass, with independent tests added.
