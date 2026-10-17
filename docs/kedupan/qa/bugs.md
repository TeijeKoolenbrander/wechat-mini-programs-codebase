# 群友刻度盘 QA bugs

First pass: build 48c22e5. Re-verification: kept-ideas/v1 @ 721e844. Security re-check @ 758b568 added QA-7..QA-9 and release pack corrections RP-1..RP-8 (below). No numbered AC FAILs; QA-7 is a UX edge, QA-8 and QA-9 are docs.

| ID | Sev | Owner | Title | Status |
|---|---|---|---|---|
| QA-1 | Med | backend | Server events `round_reveal`, `board_list` (group) missing | FIXED, verified |
| QA-2 | High (gate) | content | Review sheet all `pending`; AI-drafted text, no human review | OPEN, founder-only (AC 10); QA second review done |
| QA-3 | High (gate) | release | No privacy guide / release pack | OPEN, release step (AC 67) |
| QA-4 | Med | client | `assets/share-fallback.png` and icon missing | FIXED, verified |
| QA-5 | Low | render | Truncation and clipping at 320x568 large text | FIXED, verified (one nit) |
| QA-6 | Med | client | Release build without `cloudEnv` runs on the mock; mock/stub not excluded | FIXED against the current gate, verified |
| QA-7 | Low | client (vm.js) | After 直接看答案, reopening the round shows 已揭晓 with a dead 先猜再看 | FIXED, verified |
| QA-8 | Med | product-ux / CTO (spec) | Spec not updated for L4 (late score, answerHidden, 直接看答案 consequence) | OPEN |
| QA-9 | Low | CTO (docs) | TD-62 and cloudfunctions CONTRACT.md say server-only files are ignored in BOTH modes; real behaviour is release only; no TD-68 | FIXED (TD-68) |

## QA-1: FIXED
Verified: `grep` finds `round_reveal` written in `common/rounds-db.js` for every reveal path and `board_list` in both getFriendBoard and getGroupDay. `qa-server.test.js` now has four passing round_reveal tests (host, 8th guess, timer, race: exactly once) and `qa-kpi.test.js` computes the four client/server KPIs from the events collection.

## QA-2: OPEN (founder)
`content-review.md` product-ux / QA / result cells are still `pending`; product-ux's AI review is `content-fixes.md` (applied in v2); QA's check is `content-check.md`. Spec 4.4 requires a human review before shipping (H9). AIGC: the settings sheet now carries "题库内容由 AI 辅助编写，并经人工审核"; this sentence is true only after the human review happens, so the founder must not ship before it.

## QA-3: OPEN (release step)
`docs/kedupan/release/` has only `registration/`. The privacy guide (must say 180 days), HANDOFF.md and the rules check come with the release pack; re-check AC 67 then.

## QA-4: FIXED
`game/assets/icon.png` 144x144 and `share-fallback.png` 500x400 exist; the AC 74 test requires exactly these two images.

## QA-5: FIXED (one nit)
Previews regenerated at 320x568 large and 414x896 high contrast: no ellipsis, "%" not orphaned, reveal lines visible, 最同频 row fits. Nit (low): in the large-text home "done" state the last card line is cut at the card edge (the card scrolls). Not a gate.

## QA-6: FIXED against the current gate
Verified in a scratch copy: with `cloudEnv` set and no `packOptions.ignore` entries, `tests/release-gate.test.js` "release gate: ..." FAILS; after adding the `js/mock-server.js` and `js/stub-render.js` ignore entries it PASSES, and "a cloud-mode boot never requires the mock server or the stub renderer" passes. The three dev-only tests (dev defaults, dev boot uses the mock, gate logic with dev config) fail in the release config by design: that is the "tests green in both modes" gap the studio-wide release switch (语义热冷, to be ported) will close. Residual risk: the gate runs only when someone runs `npm test` on the release branch; it does not block an upload by itself.

## Observations (not bugs)
- `unlockDistribution` cap is 20/day (spec 3; TD-8 accepted). `getBonusCard` does not check a completed daily (TD-10). No rate limit on submitCard / getDaily / getRound reads (spec lists none).


## QA-7: OPEN (Low, client)
Repro: the todo test "QA L4: 直接看答案 then reopening ..." in `game/tests/qa-security.test.js`. By hand: open a revealed round you did not play (已揭晓 / 先猜再看 / 直接看答案), tap 直接看答案 (server records `reveal_views`, you see the reveal), leave, open the same round again. `getRound` now returns the reveal, but `vm.roundStatus` shows `revealedUnplayed` because `viewAnswer` is per-round in-memory state, so 先猜再看 is offered; tapping it and confirming gets `ROUND_EXPIRED` and the screen stays on 已揭晓. Expected: a response with `reveal` and no own guess shows the reveal view. Fix idea: in `vm.roundStatus`, `base === 'revealedUnplayed' && d.reveal` -> `revealed`. Then turn the todo test into a normal test. Owner: client (minigame-dev).

## QA-8: OPEN (Med, spec)
TD-65 says "spec 3.5 'late guesses show their score' is superseded" but `spec.md` still says so: §3.5 line 134 (late guesses show their score); step 9 line 80 (先猜再看; nothing on 直接看答案 forfeiting the late guess); §6 table line 434; lines 474 and 651 (rows `[h,g,s,late,isHost]`, `s` a number for late rows); `getRound` and `submitGuess` API rows; AC 31 and 33. `answerHidden`, `showAnswer` and `reveal_views` appear nowhere in the spec. Needed: spec update (late rows `s:null`; getRound withholds the answer until a guess or 直接看答案; ROUND_EXPIRED after being served; reveal_views with 180-day cleanup; matching ACs). UI copy: 直接看答案 gives no hint that it closes the late guess (no confirmation); the spec must decide whether that is acceptable or add a one-line hint. Behaviour itself matches TD-65. Owner: product-ux / CTO.

## QA-9: OPEN (Low, docs)
`decisions.md` TD-62 ("in BOTH modes") and `cloudfunctions/CONTRACT.md` line 18 ("both modes") contradict `game/RELEASE.md`, `tools/release-config.js` (SERVER_ONLY_FILES ignored unless `--dev`) and the committed `project.config.json`; commit eca705b changed this without a TD entry, and the alternative TD-62 lists as "rejected by the CTO" is now implemented. Add TD-68 and fix both texts. Residual risk (by design): the committed dev state packs the answer key and the 365-day schedule, so an upload from the dev state ships them; the gate runs only on `npm test` in release mode. Mitigation is procedural (RP-8).

## Release pack corrections (owner: release)
- RP-1 (must): 17 collections, not 16. `kedupan_reveal_views` (deny-all rule, index `ts`, cleaned at 180 days; `database/rules.json` and `indexes.json` already have it). Fix `post-release.md` §2 (list, count, index table) and HANDOFF §4 step 4.
- RP-2 (must): storage and access hardening (cloudfunctions README step 5b) is in neither `post-release.md` nor HANDOFF: paste `storage/rules.json` `{"read": false, "write": false}` into Cloud Storage permissions; keep anonymous/web login and HTTP access disabled. Add as a founder step in HANDOFF §4 and `release-checklist.md`.
- RP-3 (must): `post-release.md` §3 says a pepper shorter than 16 characters gives `SERVER_CONFIG`; code and README now require 32.
- RP-4 (must): `post-release.md` §4 says console tests of timer functions are "expected to carry no OPENID [VERIFY]"; a console test now needs the event `{"Type":"Timer","TriggerName":"manual"}` (README 5c) or it returns `FORBIDDEN`. Fix the pre-launch `genDaily` instruction.
- RP-5 (should): `build-upload.md` §2 expects "331 pass, 0 fail, 2 skipped"; release-mode `npm test` is now 360 pass, 0 fail, 3 skipped, 1 todo (todo = QA-7, will change when fixed). It also passes with `--appid`, so the "two tests assert the test AppID, test first" explanation is stale (harmless). Package size 815,560 bytes (`build-upload.md`, `rules-check.md` §3, HANDOFF "0.78 MiB") is now 694,740 (0.66 MiB).
- RP-6 (should): `privacy-guide.md` audit row for `wx.getGroupEnterInfo` says `-> wx.cloud.CloudID`; the client now sends the raw cloudID string and the server resolves it with `cloud.getOpenData`. Item 5 (出题与猜测数据) should also name the record that a player viewed a round's answer (`reveal_views`: OpenID, round, time; 180 days). The `wx` table otherwise matches the code (checked against a grep of every `wx.*` in game.js, js, core, opendata; `wx.reportEvent` and `wx.getShareInfo` occur only in comments).
- RP-7 (should): HANDOFF and the pack headers quote build a1f46d6, 77 PASS and the old counts; update to the final commit and add E11 (real cloudID payload) to the device pass table.
- RP-8 (should): `build-upload.md` step 2 should state why the switch comes first (the dev state packs the answer key and schedule) and check after it that `project.config.json` `packOptions.ignore` has `core/content/anchors.v1.js` and `core/content/schedule.v1.js`. Verified correct: `--env`, `--shared-test-env`, `--appid` spelling and order (script run), and `npm run pack -- --prefix ""` (21 functions, 4 timers, anchors and schedule inside each).
- HANDOFF coverage: it lists registration, 认证, 适龄提示, content review, privacy guide, 备案, cloud env + pepper + LAUNCH_DATE_KEY, app_config, device pass, upload and publish, ads and subscribe. Missing founder-only steps are RP-1, RP-2 and the console timer test (RP-4).
