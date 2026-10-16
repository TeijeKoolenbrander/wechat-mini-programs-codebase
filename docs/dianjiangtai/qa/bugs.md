# 点将台 v1: QA bugs

Re-check at `kept-ideas/v1` @ 6582873: V1-1..V1-4 verified fixed (closed), V1-5 closed with release-pack corrections (see the QA report). Original build under test: `kept-ideas/v1` @ 0030bed (QA branch adds only tests and these docs). Earlier Phase 1 bugs (BUG-1 daily-optimum leak, BUG-2 home overlap, BUG-3 sessionId) were fixed and re-verified in the Phase 1 section of `ac-matrix.md`; they are not repeated here. IDs below restart for v1 with the prefix `V1-`.

| ID | Sev | Owner | Title | AC | Status |
|---|---|---|---|---|---|
| V1-1 | Med | product-ux (content text) + minigame-dev (`core/content/generals.v2.js`) | Developer change-log text ships in 10 players' detail sheets (`statNote`) | Appendix C intent, H8 content review | CLOSED (TD-10; re-verified at 6582873) |
| V1-2 | Med | minigame-dev (tuning) / CTO (target) | Naive 12-0 sits at the 0.2% hard limit: fails on 2 of 4 fresh 100k windows | 15, 74 | CLOSED (TD-12 configVersion 3; six 100k windows pass, naive 0.12-0.15%) |
| V1-3 | Med | minigame-dev (`js/ads.js`); release (build flags) | A release build without ad unit ids runs the test overlay "广告位（测试）" and grants after 3 s | 43, 41, H4 | CLOSED (TD-11) |
| V1-4 | Low | frontend-ui / CTO decision | 声音 toggle is shown but no audio asset ships (`assets/sounds/*.mp3` missing) | 49 | CLOSED (TD-13, four WAV cues) |
| V1-5 | Tracking | release | Release pack, Founder Handoff and device-pass checklist not yet written | 95 | CLOSED for presence; pack is stale against 6582873 (corrections reported to the CTO) |

## Re-check notes (6582873)

- V1-1: all ten statNotes read as short neutral history and match the generals' eras (spot-checked 赵云 ~200, 马超 211/214, 黄忠 ~209/219, 姜维 228/263, 张郃 200, 张辽 198, 司马懿 238/249, 邓艾 263/264, 吕布 189/198). 孟获 is now 南中各族所服. Hygiene test is a regression.
- V1-2: configVersion 3; naive 12-0 0.12-0.15% on six fresh 100k windows.
- V1-3: ads.js stubs only when stubCfg.enabled; main.js passes `stubAds && !cloudEnv`. Released-no-ids build is D6 no-fill.
- V1-4: audio.js creates no context while muted, never throws.
- Minor, not a bug: the 复盘 wall-clock test (AC 16/75) is load-sensitive and failed once when the machine was busy.

## V1-1: developer change-log text in `statNote` (Med, content)

`statNote` is shown to players in the draft detail sheet (`js/render/draft.js:455/487`, `js/vm.js:164`). Ten generals carry text copied from the spec's Appendix C "changes since Phase 1" column:

| General | Text the player can read |
|---|---|
| 赵云 | 增「从公孙瓒」群-QX 出场（原为简化）；约200 归刘备。 |
| 马超 | QX/CB 关中时期改归群（潼关 211）；214 归刘备。 |
| 黄忠 | 增「从刘表」群-QX；约209 归刘备；定军山 219。 |
| 姜维 | 增天水仕魏（至 228）与归晋时期北伐（至 263）。 |
| 张郃 | HJ 改为群（从韩馥讨黄巾），QX 从袁绍至 200，后归曹。 |
| 夏侯惇 | 增 HJ（「太祖初起，惇常为裨将」189） |
| 张辽 | 增群 HJ/QX（丁原、何进、董卓、吕布，至 198） |
| 司马懿 | 增魏 GJ（辽东 238）与晋 GJ（高平陵 249）。 |
| 邓艾 | 卒于264（未仕晋，PO-3）。 |
| 吕布 | 增 HJ（189 为丁原主簿）；先后从丁原、董卓，皆在群营；卒于198。 |

These contain era codes (HJ, QX, CB, GJ), a decision id (PO-3), and change-log verbs ("增", "改为", "原为简化"). The detail sheet clamps to 2 lines (4 in large text), so most of it is cut with an ellipsis, but the visible part of the longer notes can still read as internal text, and the full string is read by the content reviewer (H8).
Repro: `node --test tests/qa-content-v2.test.js` in `apps/dianjiangtai/game` (the todo test "player-visible text hygiene" lists the offenders). Or open the draft detail sheet for 赵云 in a free run.
Expected: full player-facing sentences such as "早年从公孙瓒，后归刘备（约200）；一身是胆" per Appendix C ("expanded into full sentences in the content file"). Fix in the content file (and the Appendix C note column if it is the source). Removing `{ todo }` from the test makes it a regression.

## V1-2: naive 12-0 at the hard limit (Med, tuning)

AC 15 / AC 74 hard target: naive 12-0 < 0.2% over 100k seeds. `npm run simstats` (offset 0) reports 0.17% and passes. QA ran `node tools/simstats.js --check --cv 2 --seeds 100000 --offset N` on other windows:

| offset | naive 12-0 (reported) | result |
|---|---|---|
| 0 (CI gate) | 0.17% | all targets met |
| 777000 | 0.20% | `not met: naive 12-0 0.20% < 0.2%`, exit 1 |
| 2000000 | 0.17% | all targets met |
| 4000000 | 0.20% | `not met`, exit 1 |

The true rate is about 0.185% (sampling sd about 0.013% at 100k), so the target is met in expectation but a fresh 100k sample fails about half the time; the CI gate passes only because its window is fixed. Everything else on those windows was inside target (greedy 0.56-0.62%, sensible 12-0 0.33-0.40%, median 7, random 0.00%).
Suggested fix (owner decides): re-centre the curve so naive lands near 0.12-0.15%, or state the target with a tolerance in AC 15 and gate on a confidence bound. The QA 30k-seed test (`qa-tuning`) already allows 2 standard errors only for the sensible floor and passes naive at 30k, so it would not catch this.
Repro: `node tools/simstats.js --check --cv 2 --seeds 100000 --offset 777000 --optseeds 200 --gateseeds 400 --timeseeds 50`.

## V1-3: stub ads reach real players when no ad unit id is built in (Med, release safety)

`js/ads.js:33`: `const stub = !!stubCfg.enabled || !units.rewarded;`. `node tools/release-config.js --env env-test --appid wx172906d7bfd6036f` (no `--ad-rewarded`) writes `stubAds=false` and `adUnits.rewarded=''`, so the shipped build still runs the stub: the 视频再换 and 复盘 buttons show an overlay labelled "广告位（测试）" and grant the reward after 3 s. Spec §19 H4 says that before 流量主 is active, "rewarded/interstitial behave as no-fill (D6), banner off". The release gate only prints a NOTE and `RELEASE.md` says to pass the ids; nothing blocks an upload without them. AC 43's "production config has stub off" is true for the flag but not for behaviour.
Repro: `node --test tests/qa-client-v1.test.js` (todo "AC 43 / H4"). Fix: stub only when `stubCfg.enabled`; with an empty unit id take the real path, which fails to load and follows D6 (grant once per run, "暂无广告，本次免费"). Whatever is chosen, the Founder Handoff must say that the ad unit ids are required for the build that goes to players.

## V1-4: sound toggle with no sound (Low, UX)

`js/audio.js` plays `assets/sounds/{flip,drum,bell}.mp3` but the game has no `assets/` folder and ships no audio. Home and settings show "声音 开" and a mute switch that does nothing; `InnerAudioContext` is created and `onError` is not handled (a log line at most). AC 49 holds vacuously. Either ship the cues or hide the control. Not a gate.

## V1-5: release pack not yet present (Tracking)

`docs/dianjiangtai/release/` contains only `APPID.md`. AC 95 requires `HANDOFF.md` with H1-H9 (including H6a) and the §17.1 device-pass checklist (items 1-13, E1-E12) with an empty result column. The function-config and deny-all parts of AC 95 pass (see matrix). Re-check when release delivers.

## Non-bug notes for the CTO

- **复盘 heavy path.** simstats cv2: 86% of free-play token sets exceed `heavySets` (5000) and go to `getReplay` first (server p99 489 ms, max 1.2 s in node). The remaining 14-16% run on the phone (node p99 92-202 ms depending on load). If the call fails or the player is offline the client falls back to the same local search on a heavy set (node 0.5-1.2 s, several seconds on a mid-range phone, with no spinner budget stated). AC 16 / 75 are device measurements (see device list).
- **Roster nit.** 黄权 (d. 240) lists 魏 only for 三分; he served 魏 until 240, so a 魏 归晋 appearance would follow PO-3. Low, optional.
- **Wording nit.** 孟获 `statNote` "南中夷汉所服": 夷 is a period term; "南中各族所服" is safer for review. Low.
- **Home at 320x568 large text with the group banner** pushes 往期 / 玩法 behind the pinned daily card; the list scrolls (`home:scroll`) but nothing hints at it. Low, UX.
- **Known residual (TD-8, edge 35):** grace-window early look at a friendly challenge sheet. Documented, not tested as a failure.
