# 传画接龙 spec rev. 2.1 QA report: up to 5 换一批 per pick (TD-151, TD-152)

Date 2026-10-16. Tested tree: `kept-ideas/v1` at a3dc8f3 (db04be0 + 0b214fc), branch `worktree-agent-abb5f090be2191c03` reset to it. Spec: `docs/chuanhua/spec.md` rev. 2.1 (§8.3, §4.1, §17 edges 25-26, AC 116-118, 164-168). Verdict from reading the code, reading the tests and running them. No WeChat DevTools run (not available here): device behaviour (real font, touch feel) still needs the manual pass listed at the end.

## Commands and results

| Command | Result |
|---|---|
| `cd apps/chuanhua/game && npm test` (dev mode) | 542 tests, 541 pass, 0 fail, 1 skipped (after adding my 4 tests; 538 before) |
| `cd apps/chuanhua/cloudfunctions && npm test` | 402 pass, 0 fail (includes the 10 seats x 5 rerolls concurrency test and the AC 164/165 function tests) |
| `node tests/release-mode-check.js` (new, game dir) | release mode on a temp copy with a complete final agreement: 538 tests, 525 pass, 0 fail, 13 skipped (dev-only) |
| Preview render: `cd tools/preview && npm install && ONLY=pick SIZES=375x812,320x568 MODES=default,large node render.js` | 56 PNGs, six chosen ones copied to `docs/chuanhua/qa/rev2.1/` |

The first dev `npm test` run showed 10 skipped; after `npm install` in `tools/preview` it showed 1. The other 9 skips need the preview tool's `node_modules`. Both runs have 0 failures.

## Acceptance criteria

| Check | Verdict | Evidence |
|---|---|---|
| Limit of 5, server-side (`CONFIG.roll.rerollsPerPick` = 5 in `core/config.js:130`; `MAX_REROLLS` in `core/roll.js:18`) | PASS | `cloudfunctions/rollPrompts/index.js` checks `roll.rerollLeft(cur) <= 0` and returns `REROLL_LIMIT` with `rollId` and `rerollLeft: 0` and writes nothing. In a room, `core/room.js:496 rerollBlock` does the same inside the transaction. The client only displays the count. My test fires 12 crafted rerolls: 4 succeed, 8 are `REROLL_LIMIT` |
| AC 116 (5 rerolls, new rollId, 3 categories, none repeated within the pick) | PASS | `core-roll.test.js` (116, 164-165 core), `client-ac.test.js:330` (18 distinct ids over 6 sets) |
| AC 117 (300 no-repeat window, 0-5 rerolls per pick) | PASS | property test, `core-roll.test.js:155` |
| AC 118 (room-unique, 10 seats x 5 rerolls concurrent) | PASS | `cloudfunctions/tests/rooms-concurrency.test.js:47`, `core-roll.test.js:176` |
| AC 164 (5 allowed, `rerollLeft` 4..0, 18 distinct ids) | PASS | `cloudfunctions/tests/contract-sync.test.js:522` (慢慢传), `:552` (live) |
| AC 165 (6th refused, nothing written, 6th set still pickable) | PASS | same tests; `client-ac.test.js` checks the player doc is byte-identical after the 6th call |
| Label 「换一批（剩N次）」 counts down | PASS | `js/vm.js:137 rerollLabel`; test asserts 5,4,3,2,1; render screenshots show 剩5次 and 剩1次 |
| AC 166 (after the 5th: button stays, greyed, disabled, 「换一批机会已用完」, same rect, no clipping, 4 modes) | PASS | `render.rules.test.js:237` and `:278` (6 sizes x 4 modes, rect identical, label inside the button, hit id absent at 0). Screenshots below. See note N1 on "no fill" |
| AC 167 (taps on the greyed button send nothing) | PASS | `client-ac.test.js:375`: 10 taps give 0 requests, 0 events, no toast, no state change. In `ctl-pick.js` the `reroll()` guard `p.state !== 'ready' \|\| p.rerollLeft < 1` backs up the missing hit id. My test adds 17 rapid taps during a reroll in flight: 1 request |
| Count survives kill/resume and re-entry | PASS | new `tests/qa-rev21-reroll.test.js`: spend 2, back out and re-enter, kill, relaunch: still 剩3次 with the same set; spend all, kill, relaunch: greyed, no hit id. Live: `contract-sync.test.js:588` (getRoom shows the count after reopen), `client-room.test.js:333` |
| Reroll only from the ready state | PASS | my test forces loading, error, offline, sending, timeUp, rerolling and forced: 0 requests, count unchanged. A failed reroll (no network) keeps cards and count and toasts. Server side: `rerollBlock` returns `BAD_REQUEST` outside live round 0, `ALREADY_SENT` after a send, `ROUND_OVER` after the deadline (no grace) |
| AC 168 (rerolls vs the round-0 timer; forced send may name any shown id) | PASS | `client-room.test.js:333`, `contract-sync.test.js:552`; `shownPickValid` in `core/room.js:484` |
| 换一批 and 自己出题 share a row at 6 sizes x 4 modes | PASS | `render.rules.test.js:253-256` asserts same y and 自己出题 right of 换一批 at every size and mode. The renderer stacks only if the window cannot fit both (`stackTools`, `render/pick.js`); this never fires at the 6 test sizes |
| Agreement and in-game terms say 5 次 | PASS | `docs/chuanhua/release/user-agreement.txt:32` and `js/terms-text.js:52`: 「你可以换一批（每次选题限 5 次）」; `user-agreement.md`, 软著 docs and CONTRACT notes also updated; `qa-rev2-agreement.test.js` passes |
| Preview rendering | PASS | three states at 375x812 and 320x568 large text, looked at one by one |

### Screenshots (`docs/chuanhua/qa/rev2.1/`)

| State | 375x812 default | 320x568 large text |
|---|---|---|
| 5 left | `pick_375x812_default_ready.png` | `pick_320x568_large_ready.png` |
| 1 left | `pick_375x812_default_x_rerollOne.png` | `pick_320x568_large_x_rerollOne.png` |
| used up | `pick_375x812_default_x_rerolled.png` | `pick_320x568_large_x_rerolled.png` |

Seen: the button sits in the same place and size in all three states, in a row with 自己出题 beside it. The 5-left and 1-left labels are whole and readable. The used-up state shows 「换一批机会已用完」 in grey text on a grey fill with a dashed grey outline. At 320x568 large text the labels fit with about 8 pt to spare inside the button (tight but whole); 就这个 is fully visible. The red 0:08 timer on the used-up fixture is only fixture data.

## Release-mode finding

Question: do the dev's 6 release-mode failures also occur at the pre-change commit 461b427 under the same method?

Method: `git archive` each commit (plus the root `.gitignore`) to a temp dir, replace `docs/chuanhua/release/user-agreement.txt` with a one-line-heading stub with no draft and no placeholders, `build-terms.js`, `release-config.js --env testenv --appid wx0123456789abcdef ...`, then `npm test`.

| Tree | Agreement | Failures |
|---|---|---|
| 461b427 | minimal stub | 7 (the dev counted 6) |
| a3dc8f3 | minimal stub | 7, the same 7 tests |
| 461b427 | real text, draft line removed, placeholders filled | 0 (519 pass) |
| a3dc8f3 | real text, draft line removed, placeholders filled | 0 (525 pass) |

The 7 tests that fail with the minimal stub, identically at both commits: AC 92-94 string scan; agreement rev. 3 numbers; agreement rev. 3 behaviour clauses; agreement rev. 3 version line; terms scroll; "the 《用户协议》 the player reads in game is the rev. 3 text"; "the real text covers the agreement: 15 headings...". All of them read agreement content that a stub does not have. **Verdict: stub artefact, not a regression from TD-151/152.** The dev's count of 6 vs my 7 comes from how their stub differed (the terms drift and `build-terms --release` checks pass or fail depending on the stub text); the cause is the same.

Two further release-mode failures I hit on my first attempt were also method artefacts: the temp copy lacked the root `.gitignore`, which `qa-client` (QA-1) and `qa-release` ("local DevTools artifacts") read.

Correct procedure (now scripted): `cd apps/chuanhua/game && node tests/release-mode-check.js` (add `--keep` to keep the temp copy). It copies `.gitignore`, `apps/chuanhua`, `docs/chuanhua` to a temp dir, finalises the agreement (drops the 【草稿】 line, fills every 【…】 placeholder with example operator data), runs `build-terms.js --release`, `release-config.js --env ...`, and `npm test`. It never touches the working tree and is not picked up by `npm test` (no `.test.js` suffix). Result at a3dc8f3: 0 failures. To compare with an older commit, check it out in a worktree and run the script there. The header comment in the script explains all of this. A `build-terms --release` run against the committed DRAFT is supposed to fail; that is the gate working, not a bug.

## Bugs and notes (no product code was changed)

No blocking bugs. Notes for the CTO:

- **N1 (low, spec vs build):** §8.3 says the greyed button has "no fill"; `render/pick.js` draws it with `T.COLORS.disabledFill` (grey) and a dashed outline. `render.rules.test.js:278` asserts the disabled fill, so the test encodes the build, not the §8.3 wording. AC 166 only says "greyed (disabled) style", which the build meets. Suggest aligning the §8.3 sentence with the build (the founder asked for "grayscale", which this is).
- **N2 (low, copy):** `core/README.md:12` still says 「换一批 once」 (copied into every cloud function's `core/README.md` by `sync-core`). Doc only; fix in the source README and re-run `npm run sync` in cloudfunctions.
- **N3 (low, behaviour):** `js/ctl-pick.js` `reroll()` shows a toast with the `REROLL_LIMIT` text 「换一批机会已用完」 when the server refuses a 6th request while the client still shows a count. CONTRACT.md says `REROLL_LIMIT` has "no player copy, the client shows the greyed state". Harmless (it only happens when the client is out of sync) and the button does grey. With a stale `rollId` the client instead reloads the current roll (my test covers it).
- **N4 (observation, not a regression):** in 慢慢传, `rollPrompts` hands out the current unused roll for 10 minutes (`FRESH_MS`, `rollPrompts/index.js`, refreshed by each reroll). After 10 minutes of inactivity a plain call rolls anew, which is a new pick with 5 fresh rerolls. This is the same behaviour as before rev. 2.1 and matches the spec's definition of a pick, but with 5 rerolls a patient player can see more prompts per hour.

## Files added

- `apps/chuanhua/game/tests/qa-rev21-reroll.test.js`: 4 tests (kill/resume and re-entry, rapid taps and crafted calls, non-ready states, no network).
- `apps/chuanhua/game/tests/release-mode-check.js`: release-mode procedure on a temp copy.
- `docs/chuanhua/qa/rev2.1/*.png`: six preview renders.

## Still needs a manual pass (DevTools / device)

Real-device font width of the two labels at the system's largest text size; touch feel of the greyed button; kill and relaunch from the WeChat task switcher mid-pick with the real cloud backend (the tests use the in-memory mock and the function harness).
