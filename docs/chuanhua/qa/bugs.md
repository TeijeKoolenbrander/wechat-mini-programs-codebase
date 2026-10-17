# 传画接龙 QA bugs

Two sections: **Rev. 2** (build 6ab8ebc of `kept-ideas/v1`, spec rev. 2, 2026-10-15; IDs `QA-R2-n`) first, then the **v1** section (build 10e3b18, IDs `QA-n`) with its status at rev. 2.

Owners: product-ux, frontend-ui (render), miniprogram-dev / minigame-dev (client, build), backend (cloud functions, `core/`, mock server), content, release. Severity: High = blocks submission or can expose users; Med = fix before the device pass; Low = fix when convenient. Open bugs that can be expressed as a test are committed as `todo` tests (they run and print but do not fail the suite): delete the `todo` option when the owner fixes the bug so the test becomes a real guard.

# Rev. 3 status (build 7d3cb87, final QA gate): 0 open FAIL

| ID | Status | Verified by |
|---|---|---|
| QA-R2-1 | CLOSED | `js/terms-text.js` regenerated from rev. 3; drift test green; all 26 promises match in the shipped text; the draft marker and the placeholders remain and still refuse release mode (temp-copy run) |
| QA-R2-2 | CLOSED (margin, not structure) | qa-rev2-contention a/b/c pass; load test 5 of 5 with 8 busy-loop processes; qa-rev3-risk. The per-slot document split was not done (TD-145): the `rooms` document is still the hot document; device check D14 |
| QA-R2-3 | CLOSED | qa-rev2-views, `getGroupChains` placeholders with `paused: true` |
| QA-R2-4 | CLOSED | qa-rev2-rooms "rejoin ... EVERY state" passes |
| QA-R2-5 | DECIDED (TD-147, keep) | qa-rev2-rooms asserts the documented behaviour |
| QA-R2-6 | CLOSED | qa-rev2-client share-card test passes (TD-141) |
| QA-R2-7 | CLOSED | the notes test passes (todo removed by QA) |
| QA-R2-8 | CLOSED | spec 13.2 has the `report` live form, rate limits, `IN_CLAIM` / `STEP_LIMIT` |
| QA-R2-9 | CLOSED, one Low follow-up (QA-R3-1) | render-primary tests, regenerated previews read |
| QA-R2-10 | CLOSED | ad clamp 3 a day / 180 s in `core/config.js` and `js/features.js`; `issueNo` / `nationalCount` gone |
| QA-R3-1 | OPEN, Low, owner frontend-ui | see below |

## QA-R3-1 (frontend-ui, Low): pick screen error banner is under the scroll chevron at rest (320x568, large text)
- Repro: `cd apps/chuanhua/game/tools/preview && SIZES=320x568 MODES=large ONLY=pick node render.js`, open `out/320x568/large/pick__error.png` and `pick__offline.png`: the three prompt rows, the 换一批 / 自己出题 row and the pinned 就这个 fit, but the red banner (「审核服务繁忙，请稍后再试，或先选一个现成的题目」, and in the error state its 重试 button) is mostly under the chevron and cut by the pinned button; the player has to scroll to read why the send failed. Same family, harmless: entry / prevMine headline half faded under the chevron, lobby description faded. At 375+ and in high contrast (414x896) the banner is fully visible.
- Expected: AC 107 "without clipped text"; a status message the player needs should be readable at rest. Not an AC failure (it is a scroll region with the affordance, the primary action is reachable and 就这个 itself resends).
- Fix: let the pick rows shrink one more step when a banner is shown, or show the banner above the rows.

# Rev. 2 (build 6ab8ebc; first pass, statuses above)

| ID | Sev | Owner | AC / spec | Title |
|---|---|---|---|---|
| QA-R2-1 | High (gate) | minigame-dev, release | spec 8.2, 8.14, 15, H6; Art. 8.2 | `js/terms-text.js`, the 《用户协议》 the player reads, is still the v1 agreement; `npm test` in `game` is red on the committed tree |
| QA-R2-2 | Med | backend | AC 141 (also 128-131, 153), the flaky tests | Bounded retry budgets: 9-10 simultaneous writers exhaust `store.txn` (8 attempts) and answer INTERNAL; a failed resolve strands the slot and silently replaces a passed drawing with a marker; `startRoom` answers INTERNAL when 4 joins overtake it |
| QA-R2-3 | Med | backend | AC 54, spec 6.8, 8.11 | `getGroupChains` ignores `viewEnabled`: the emergency stop still lists the prompt and last sentence of every revealed 慢慢传 chain |
| QA-R2-4 | Low-Med | backend | spec 3A.6, CONTRACT `joinRoom`, TD-103 | `joinRoom` by a seated member during a game answers INTERNAL (prompt bank missing in that function) |
| QA-R2-5 | Low | product-ux (decide), backend | spec 7.1, edge 13, TD-140 | In a live room the later workers of a chain whose custom prompt was reported are still handed the drawing made from it |
| QA-R2-6 | Low-Med | minigame-dev | AC 95, 59, spec 6.5, 9.4 | 分享揭晓卡 puts a sentence that was just reported (hidden) into the share title (stale overview card) |
| QA-R2-7 | Low | release | agreement rev. 3 notes | The agreement notes still list TD-134 as an open build dependency and the change note says §五.1 depends on it; TD-140 closed it |
| QA-R2-8 | Low | product-ux | spec 13.2 | Spec drift: the `report` row lacks `{roomId, reportRef, reason}`; rate-limit numbers (TD-114), the `getReveal` shape (TD-115) and `IN_CLAIM` / `STEP_LIMIT` rows are stale |
| QA-R2-9 | Low-Med | frontend-ui | AC 107, 108 | At 320x568 in large-text mode several screens are cut at rest: the host's 开始 is below the fold, the home tile row sits under 开一局, 换一批 is half covered and 自己出题 off-screen on the pick screen, the first overview card label is under the buttons |
| QA-R2-10 | Low | backend / minigame-dev | AC 88, 121, 104 | Dead 今日起点 leftovers (`issueNo`, a `nationalCount` JSDoc); the ad remote clamp allows 4 a day / 120 s apart, the AC says 3 and 180 s |

No FAIL was found in the live-round reporting (TD-140), rotation, forced send, markers, the 20-minute cap, rematch, the one-room rule, the caps (10 / 30 / 80), the prompt bank rules, the canvas geometry, contain-fit, the joinGroup / pepper / rate-limit / track / rules hardening, or the ad and share compliance except as listed. `ac-matrix.md` has the per-criterion verdicts.

---

## QA-R2-1 (minigame-dev, release): the 《用户协议》 shown in game is the v1 text
- Repro: (a) `cd apps/chuanhua/game && npm test`: one failure, "terms-text.js is exactly what tools/build-terms.js generates from the source agreement (no drift)" (every run, two runs). (b) Open 设置 > 《用户协议》 (or the 公约 sheet link): the text says "一条接龙由一个起点题目和 6 棒组成", "每天最多传 40 棒" and has no live rooms, no markers, no room limits. (c) `game/tests/qa-rev2-agreement.test.js` (todo): 12 of the 26 numeric promises of the rev. 3 text are wrong or missing in `js/terms-text.js`: 3-10 players, 4 rounds, 30 s prompt, 20-minute cap, 30-minute lobby, 10 rooms / 30 joins, **80 棒 (the shipped text says 40)**, the 5 s check, "保存 180 天", 2.5 minutes, one 换一批, 3 prompts.
- Expected: `js/terms-text.js` is generated from `docs/chuanhua/release/user-agreement.txt` (rev. 3) by `node tools/build-terms.js`; the drift test is green. The rev. 3 `.txt` itself is correct: all 26 numbers equal the build constants (qa-rev2-agreement, passing test).
- Actual: the generated module was never regenerated after the `.txt` was rewritten (commit 169e7d1 changed the docs only). The game would show a draft that contradicts the rules, and Art. 8.2 ("all automated tests pass") is not met.
- Fix: run `node tools/build-terms.js` (keeps the draft marker; `tools/release-config.js` still refuses a release until the founder removes it) and commit `js/terms-text.js`; the `todo` test in qa-rev2-agreement.test.js then passes: delete its `todo` option.

## QA-R2-2 (backend): bounded retries under contention; the flaky tests are real races
Verdict on the flaky tests: **not a test-harness timing artefact**. Both failing tests expose real, bounded-retry limits in product code; machine load only changes the interleaving (the fake database yields to the event loop on every operation, and the PNG raster and JSON cloning are CPU-bound between the transactions). Owner: backend. Evidence: 3 of 6 isolated runs of `rooms-concurrency.test.js` failed on a loaded machine (28-33 s) and 3 passed (8-19 s); with 8 busy-loop processes as artificial load QA's script failed 2 of 10 send storms and 4 of 12 start-vs-join races, all INTERNAL; idle: 0 of 25. Deterministic repros (all three are `todo` tests in `cloudfunctions/tests/qa-rev2-contention.test.js`):
- **(a) 9-10 seats write one room document.** `common/store.js#txn` allows 8 attempts with jitter `random * 15 * (i + 1)` ms. The `rooms` document is the only hot document and optimistic first-committer-wins lets one writer commit per wave, so the k-th of k simultaneous writers needs k attempts. The spec's own design has every seat send at the same second (forced send at 0 s, "n checks run in parallel (n <= 10)"), and each `submitRoomStep` has two transactions (phase A and C) on that document. With `Math.random = () => 0` (no jitter, an adversarial but legal schedule) 9 simultaneous pick sends make 2 seats answer INTERNAL (`-503000 transaction write conflict`). Repro: `node --test tests/qa-rev2-contention.test.js` (test "QA-R2-2a"), or the original: `node --test tests/rooms-concurrency.test.js` on a busy machine, test "all seats send at the same instant".
- **(b) A failed resolve strands the slot and loses a passed drawing.** If phase C exhausts its attempts (or the function dies), the slot stays `received`. The client's 1 s retries then get `ALREADY_SENT` (`sendGate`: a `received` slot younger than 8 s refuses a resend), the round cannot end until the slot is 8 s old, and then `fillSlotsOf` turns it into 「（这一棒没传过来）」: a drawing that PASSED moderation is discarded, and the player is told it was sent. Test "QA-R2-2b" injects the conflict into the resolving transaction.
- **(c) `startRoom` gives up after 4 re-rolls.** It reads the lobby, rolls, then commits only if `room.version` is unchanged; every join in between bumps the version and forces another loop; after 4 loops it answers INTERNAL. The host's 开始 fails with "出了点小问题，请重试" while friends are still arriving (the normal moment to press it). Repro: `node --test tests/rooms-concurrency.test.js`, test "start racing joins" (fails on a loaded machine), or "QA-R2-2c" (deterministic: 5 joins land between the roll and the commit).
- Proposed fixes: (1) `store.txn`: at least 16 attempts with exponential backoff and full jitter (random 0..min(200 ms, 10 ms * 2^i)), and map an exhausted conflict to a retryable code (e.g. `BUSY`, copy "人太多啦，请再点一次") instead of INTERNAL; (2) take the pressure off the hot document: resolve a slot with a small per-slot document (or counters) and keep the `rooms` write for the last slot only; (3) phase C failure: in a `catch`, best-effort reset the slot from `received` to `blocked` (so the 1 s retry can resend), and let `sendGate` accept a second send from the same seat when the first attempt's `at` is older than ~2 s; (4) `startRoom`: roll only for seats added since the last attempt (or roll inside the transaction from the already-read player docs) and loop until the lobby is stable, not 4 times; (5) test side: once fixed, delete the three `todo` options; the two original tests then stop flaking. Do not loosen the original tests.

## QA-R2-3 (backend): `getGroupChains` ignores the emergency stop
- Repro: `node --test cloudfunctions/tests/qa-rev2-views.test.js` (todo test "viewEnabled=false ... 本群接龙 list"). Play a 慢慢传 chain with a custom prompt to its reveal, set `app_config.ugc.viewEnabled = false`, call `getGroupChains` as any group member: `revealed[0].promptText` and `finalText` are returned in clear. Every other view (assignment, claim, reveal, both teasers) correctly answers `paused` / placeholders.
- Expected: spec 6.8 "viewEnabled: false: every content view returns placeholders"; AC 54. The list holds user text (a custom prompt and the last sentence), passed but exactly what the kill switch exists to withdraw.
- Fix: `getGroupChains` reads `cfg.ugc.viewEnabled` and returns `promptText: null, finalText: null, paused: true`; keep `mock-server.js` in step (the contract suite compares both).

## QA-R2-4 (backend): `joinRoom` for a seated member answers INTERNAL during a game
- Repro: `node --test cloudfunctions/tests/qa-rev2-rooms.test.js` (todo test "rejoin: joinRoom by a seated member ... EVERY state"): lobby ok, round 0 FAIL, round 1 FAIL, later rounds and reveal ok. Cause: `unhandled Cannot find module '../core/prompts'` in `joinRoom/common/roomio.js`: `memberResponse` resolves rolled-prompt texts (round 0 roll, round 1 source) and `joinRoom` is not a `bank: true` function (TD-103).
- Expected: CONTRACT `joinRoom`: "A seated member just gets the room back (rejoin, any state)". Spec 3A.6 rejoin.
- Impact today: low, the client rejoins through `getRoom` (a member's card tap and 回到这一局 never call `joinRoom`); a stale 加入这一局 tap after joining on another device would hit it.
- Fix: flag `joinRoom` (and `rematch`, `createRoom`, which also return room views) as bank functions in `core/schema.js`, or have `memberResponse` degrade to ids when the bank is absent; add the five-state test to the contract suite.

## QA-R2-5 (product-ux to decide, then backend): a reported custom-prompt chain keeps feeding later workers
- Repro: qa-rev2-rooms (todo "the whole chain of a reported custom prompt is hidden for everyone"). n = 4, every seat sends a custom prompt, seat B reports chain 0's prompt in round 1 with its `reportRef`; the chain becomes hidden, B plays freely, the reveal shows `reported` placeholders (those parts pass). In round 2 seat C, who works on chain 0, is handed B's drawing (the drawing made from the reported prompt) as a normal source with `canReport: true`.
- Spec 7.1 says the whole chain is hidden "for everyone" and edge 13 only names the current worker. Either answer is defensible; QA recommends hiding it (the reported prompt was judged unsuitable, and the drawing derived from it is passed content of a hidden chain). Needs a product decision, then `getRoom` `sourceFor` checks `chain.hidden`.

## QA-R2-6 (minigame-dev): the room share card carries the sentence just reported
- Repro: `node --test game/tests/qa-rev2-client.test.js` (todo "after the final sentence is reported ... must not carry it"). Finish a 5-player game (final steps are sentences), open chain 1 from the overview (the final sentence is another seat's), 举报 > 其他不适 > 提交, 往回 to the overview, tap 分享揭晓卡: the share title is "我们这一局，「…」传成了「<the reported sentence>」". `ctl-reveal.js#shareRoom` picks `card.finalText` from `ov.cards`, which were loaded before the report; `afterReport` reloads only the step-through.
- Expected: AC 59 "a report hides the item for every viewer immediately", AC 95 "reveal cards contain only passed prompt and final texts", spec 6.5. A share card leaves our control (chat history), so a reported sentence must not be put into one.
- Fix: after a report mark the overview card `placeholder: 'reported'` (or refetch `getRoomReveal`) and let `shareRoom` skip it; the same for the capsule-menu share on the overview.

## QA-R2-7 (release): agreement notes are stale
- `docs/chuanhua/release/user-agreement.md`: "Build dependencies (CTO) 1. TD-134 (live-round reporting) must ship before approval" and the change-note row for §五.1 ("live round depends on TD-134") are outdated; TD-140 shipped it (decisions.md) and qa-rev2-agreement.test.js (todo) asserts the notes are current. Also decide whether the version line 「第 1 版」 should match `rulesVersion` 2 (the notes already offer it). Delete the paragraph and the row.

## QA-R2-8 (product-ux): spec rev. 2 is behind the build in §13.2
- Spec §13.2 `report` row: `{chainId, step, reason}` only. Add `{roomId, reportRef, reason}` (live round, TD-140), `NOT_MEMBER` / `ROUND_OVER` and the opaque `reportRef` on `getRoom assignment.source`.
- Rate limits: spec says `submitRoomStep` 20 and `getRoomReveal` 30 per minute; the build uses 30 and 60 (TD-114, pinned by `hardening.test.js`).
- `getReveal`: the spec's `steps[0]` = 起点; the build keeps `prompt` and `steps` 1..n (TD-115).
- New codes `IN_CLAIM` (TD-109) and `STEP_LIMIT` at `createRoom` / `joinRoom` / `rematch` are not in the §13.2 error list.

## QA-R2-9 (frontend-ui): small phone, large text
- Repro: `node --test game/tests/qa-rev2-render.test.js` (two todo tests; at rest the lobby hit areas are only `lobby:back, lobby:scroll, lobby:invite`, there is no `lobby:start`, and `pick:custom` is missing). Visual: `cd apps/chuanhua/game/tools/preview && npm install && SIZES=320x568 MODES=large node render.js`, open `out/320x568/large/_contact_home_1.png`, `_contact_pick_1.png`, `_contact_lobby_1.png`, `_contact_overview_1.png`. (a) home `ready` (group line + streak): the 玩法 / 设置 tile row is half hidden behind 开一局; (b) pick `ready`: 换一批 is half covered by 就这个 and 自己出题 is not on screen (the 30 s prompt round); (c) lobby `ready` as host: 开始 is below the fold (only 邀请群友 shows); (d) overview `ready`: the "第 1 条" label of the first card is under 再来一局. All sit in scroll regions, so nothing is lost, but the cut is visible at rest and the lobby's primary action is not reachable without scrolling.
- Expected: AC 107 "without clipped text", AC 108 primary buttons in the bottom 40%, spec 8 "primary actions sit above the safe area". At 375+ wide and in high contrast the previews are clean (checked 375x667, 414x896 hc, 430x932).
- Fix: shrink the large-text seat grid on the lobby (one row of 5 + one row of 5 is two rows already), or pin 邀请群友 / 开始 in the bottom bar and scroll only the body; give scroll bodies a bottom padding equal to the pinned buttons so the last row is fully visible; at this size drop 自己出题 next to 换一批 on one row.

## QA-R2-10 (backend / minigame-dev): leftovers and a cap that exceeds the AC
- `game/core/date.js#issueNo(dateKey, launchKey)` (today's-prompt issue number) is dead code copied into every function folder; `core/views.js` JSDoc still mentions `nationalCount`. AC 88/121 ("`core/daily.js` and `meta.launch` are gone") hold, these are leftovers.
- `core/config.js` `ads.interstitial` clamps the remote config to `clampMaxPerDay: 4` and `clampMinGapSec: 120`; AC 104 and spec 11 say at most 3 a day and at least 180 s apart. The defaults match; a production remote config outside the AC would break it silently. Device pass D12 checks the production values; consider clamping to 3 / 180.

---

## Observations that are not bugs (decisions to confirm)
- **Real cloudID format (V6).** `common/input.js#CLOUD_ID_RE = /^[A-Za-z0-9_-]{8,512}$/` is strict. If real `wx.getGroupEnterInfo` cloudIDs contain other characters (for example `=`, `.`, `+`) or exceed 512 characters, every `joinGroup` answers `BAD_CLOUDID` and no group binding works. Confirm on the device pass (D6) before anything else in the group flows.
- **`reportRef` is an unkeyed 64-bit hash** (two FNV-1a / murmur32 values over room id, live chain id, round, seat). It is only ever compared with the value recomputed for the caller's own seat, so it grants nothing and cannot select another chain; it cannot be forged into a report on someone else's source (qa-rev2-rooms).
- **The bank is scrapeable by play, not by package.** `rollPrompts` returns the current roll for 10 minutes, but `createChain` + `releaseClaim` (5 per minute) cycles rolls: about 30 prompts a minute per account. Acceptable for a studio-owned bank; keep in mind if the bank becomes a differentiator.
- **`track` TOKEN-typed props** (`targetState`, `trigger`, `chainState`, error codes) accept any identifier-like string up to 30 characters, so a modified client can store an identity-looking value there (its own data only). Fine as is; the allowlist already drops text, strokes and unknown keys.
- **Lobby 30-minute idle** counts from the last room change (join / leave), not from polling: a lobby of 3 people who just wait for a 4th for 30 minutes closes, as the agreement says ("没有动静").
- **Mock-mode text triggers** (`测试违规` etc.) exist only in dev; production treats them as ordinary text (tested).
- **Spec ambiguity resolved by the build (TD-132):** unchanged work that was blocked before time-up goes out as an empty marker (「（没来得及画）」) instead of being resent (which would only add a strike). The agreement §四.2 says exactly this.

---

# v1 (build 10e3b18): status at rev. 2
All eleven v1 bugs were re-checked against the rev. 2 tree: QA-1 (cloudfunctionRoot, `npm run pack`, ignore entries), QA-2 (release switch and gate), QA-3 (the pill is gone), QA-4 / QA-5 (the content tests that were `todo` now pass), QA-6 (`DUP_REPORT`, teaser key), QA-9 (tick sound wired; the share-fallback art is still generated placeholder art, Low), QA-10 (README now says an unknown `ENV_KIND` is prod) and QA-11 (privacy-notes rows) are **closed**. **Open gates:** QA-7 (the agreement is written and rev. 3 is a DRAFT; it needs the founder, and see QA-R2-1) and QA-8 (the H13 human review of the AI-drafted bank is not done; `content-review.md` section 5.5). The original entries follow unchanged.


Owners: render, client, backend, core, content, release. Severity: High = blocks submission or can expose users; Med = fix before the device pass; Low = fix when convenient. Open bugs that can be expressed as a test are committed as `todo` tests (they run and print, but do not fail the suite until fixed): `game/tests/qa-client.test.js`, `game/tests/qa-content.test.js`, `cloudfunctions/tests/qa-reports.test.js`. When an owner fixes a bug, delete the `todo` option from its test so it becomes a real guard.

| ID | Sev | Owner | AC | Title |
|---|---|---|---|---|
| QA-1 | Med | release / backend | (studio standard) | `cloudfunctionRoot` setup missing: no in-project `cloudfunctions-deploy/`, not gitignored, not in `packOptions.ignore`, no `npm run pack` |
| QA-2 | High | client / release | 51 (spirit), Art. 8.4 | Release build still ships and executes the mock server and stub renderer; `stubAds`/`envKind` are not tied to `cloudEnv`; no release gate |
| QA-3 | Med | render | 106 (spirit), spec 11 | The 今日彩笔 rewarded-video pill is drawn on top of the drawable canvas |
| QA-4 | Med | content | 35, spec 5.6 | Local blocklist misses obvious abuse terms (incl. sexual-minors and self-harm) |
| QA-5 | Low | content | 34 | Contact filter misses spaced / homophone WeChat and QQ-group forms |
| QA-6 | Med | backend / core | 59, TD-29 | `DUP_REPORT` is unreachable for step reports; one member can hide up to 3 sentences of a chain by repeating the teaser report |
| QA-7 | High (gate) | release | spec 8.2, 8.13, 15, H6 | 《用户协议》 is a 3-line stand-in dialog; no 用户协议 text and no 用户隐私保护指引 text exist yet |
| QA-8 | High (gate) | content / release | spec 4.2, H13, Art. 9.2 | No human content review record for the AI-drafted 423 prompts and the blocklist; AIGC position not documented |
| QA-9 | Low | client / render | spec 8.4 | Placeholders: no 10 s tick sound (`SOUND_SRC.tick` empty), share-fallback art is generated placeholder |
| QA-10 | Low | backend (docs) | 51 | `cloudfunctions/README.md` says a typo in `ENV_KIND` returns `SERVER_CONFIG`; the code treats it as `prod` (the safer behaviour) |
| QA-11 | Low | release (docs) | 15 | Privacy inventory (spec 15) omits the unsent-turn draft kept in device storage (TD-43) |

No FAIL was found in the moderation pipeline, the chain rules, the reports / takedown / strike / retention paths, or the privacy and share compliance checks (see `ac-matrix.md`).

---

## QA-1 (release / backend): `cloudfunctionRoot` does not match the studio standard
- Repro: `apps/chuanhua/game/project.config.json` has no `cloudfunctionRoot`. Compare `apps/kedupan/game/project.config.json` (`"cloudfunctionRoot": "cloudfunctions-deploy/"`, plus the `cloudfunctions-deploy` folder entry in `packOptions.ignore`). `.gitignore` has no `apps/chuanhua/game/cloudfunctions-deploy/` line. `apps/chuanhua/cloudfunctions/package.json` has no `pack` script and `scripts/` has no `deploy-pack.js` (kedupan has both). Test: `game/tests/qa-client.test.js` "QA-1 release: cloudfunctionRoot ..." (todo).
- Expected: in-project, gitignored, `packOptions.ignore`d `cloudfunctions-deploy/` filled by `npm run pack` with `chuanhua_<fn>` folders and a MANIFEST (TD-19 naming), so DevTools can deploy from the game project.
- Actual: the founder would have to point DevTools at the repo's plain-named function folders, which deploy under the wrong names (no `chuanhua_` prefix) in the shared test environment and would pull `tests/` along.

## QA-2 (client / release): release build ships and runs mock and stub code, and nothing gates a bad release config
- Repro (all in `game/tests/qa-client.test.js`, todo): (a) `js/api.js` line 19 `require('./mock-server')` at the top level and `js/renderers.js` line 11 `require('./stub-render')`; neither file is in `packOptions.ignore`, so the uploaded package contains `js/mock-server.js` (39 KB) and `js/stub-render.js` (24 KB) and both execute at boot even when `cloudEnv` is set. (b) `build-config.js`: `cloudEnv`, `envKind` and `stubAds` are three independent hand edits. Set only `cloudEnv` (the one the README names) and the build is `envKind: 'dev'`, `stubAds: true`: the "广告位（测试）" overlay appears and grants rewards. Test "QA-2 release: a build that only sets cloudEnv ...".
- Expected: a release build never loads mock/stub code (lazy require inside the mock branch, or exclude from the package via a release `packOptions`), `stubAds` is forced off whenever `cloudEnv` is set, and one release-gate test fails the release when `cloudEnv != ''` and (`envKind != 'prod'` or `stubAds`). A sister app shipped this class of bug.
- Mitigations already present (verified): with `cloudEnv` set the API is in cloud mode and `api.mock === null`; `envKind: 'prod'` without a cloud env fails every call with `SERVER_CONFIG` (tests "QA release: ..." pass). The server side is safe regardless (prod forces live moderation, AC 51), so this is a client-hygiene and compliance risk (test ads in production), not a moderation hole.

## QA-3 (render): the 今日彩笔 ad pill covers the drawing area
- Repro: `cd apps/chuanhua/game/tools/preview && npm install && SIZES=375x667 MODES=default node render.js`, open `out/375x667/default/draw__x_coachAd.png` (or any draw state before the first stroke): the pill "▶ 今日彩笔" sits in the bottom-right corner INSIDE the square canvas (`render/draw.js` lines 162-170: `py = cv.y + cv.h - ph - 8`). Test: `qa-client.test.js` "QA-3 ads ..." (todo) asserts `draw:palette` and `draw:canvas` rects do not overlap; they do.
- Expected: spec 8.4 puts the button with the colour row, outside the canvas. A player starting the first stroke in that corner opens a rewarded video: an accidental ad click, which WeChat's ad rules treat as misleading (误导点击), and it eats the 60 s timer.
- Not an AC failure: AC 106 only requires distance from 画好了 / 传出去 / 接这一棒 / 举报, which holds (test "QA ads (AC 106)" passes).

## QA-4 (content): blocklist gaps
- Repro: `node --test apps/chuanhua/game/tests/qa-content.test.js`; eight `todo` tests list the misses. A description such as `一只草泥马的猫` passes the local filter and goes to `msgSecCheck`. Misses (non-exhaustive): sexual / minors: 草泥马 妈逼 大鸡吧 嫖客 妓院 迷奸 幼女 恋童 脱光 强上; insult: 狗日的 傻x 他娘的 我草 caonima shabi 日了狗 死爹; political: 共党 反党 习总 flg 台湾独立 8964 新疆集中营; self-harm: 想死 不想活 轻生 自焚; violence / hate: 纳粹 希特勒 炸学校 爆头; drugs: 大烟 溜冰 k他 神仙水; gambling: 押宝 买码 赌马 赌注; slurs: 小鬼子 倭寇 黑猪 洋鬼子 回回.
- Expected: AC 35 / spec 5.6 categories are all covered by obvious terms; the list is "deliberately conservative: false negatives cost the entity". Local hits are free (no quota, no strike); `msgSecCheck` is the only other line, and 100 calls a day before publishing.
- Impact is bounded (everything is pre-moderated and fails closed), so Med, not High. Self-harm and sexual-minors terms are the ones to add first. Content owner must extend the list and re-run the tests; adding a term needs a test that no prompt matches it (AC 87 runs automatically). See `content-check.md` for false positives to avoid (他妈妈, 大麻袋).

## QA-5 (content): contact-filter evasions
- Repro: `qa-content.test.js` "QA-5 contact-pattern evasions" (todo): `v我`, `薇我`, `加薇`, `w x`, `wei xin`, `Q群`, `dd我`, `私我` are accepted locally. Minors protection relies on blocking contact exchange (spec 7.6).
- Expected: rejected locally with 换个说法吧. Add homophone forms and handle the spaced Latin tokens (the token check splits on spaces, so `w x` never forms `wx`).

## QA-6 (backend / core): report keys
- Repro: `cloudfunctions/tests/qa-reports.test.js` (two todo tests). (a) AC 59 says a second report by the same player returns `DUP_REPORT`. For a step report, the first report hides the step, so the second finds it no longer `passed` and answers `BAD_REQUEST` (existing contract tests assert `BAD_REQUEST`). The client's "你已举报过这条内容" state can never be reached. (b) TD-29: a teaser report of a preset chain is keyed by the target sentence, so repeating it hides the previous visible sentence. One non-participant group member (`openid-C` in the test) called `report {step: 0}` three times and all three sentences of a revealed chain (棒 2, 4, 6) were hidden for every participant, with no review. Limit 10 reports a day, so three chains a day per griefer.
- Expected: spec 7.1 "one report per player per item" and TD-29's own recommendation (key `<openid>_<chainId>_teaser`): one hide per player per chain. Admin can `dismissReport` with `restore`, so this is recoverable, hence Med. The mock server and the real functions must change together (the contract suite runs both).

## QA-7 (release): 用户协议 and privacy guide are not written
- Repro: `controller.js` `showTerms()` opens a dialog: "你创作的画和文字，会在同一条接龙的参与者之间展示。违规内容会被隐藏，多次违规将被限制参与。完整协议见《用户隐私保护指引》。" (TD-52). `docs/chuanhua/release/` contains only `registration/`: no 用户隐私保护指引 text, no 备案 description, no 软著 pack, no release rules check, no HANDOFF.md. Test: `qa-client.test.js` "QA-7 privacy ..." (todo).
- Expected: spec 15: "The 用户协议 (content rules, licence to display a player's content within the chain, reporting, restrictions) is written by release and linked from the 公约 and 设置"; Art. 7.2 and 8.5. The privacy guide must state 180-day retention, group id use, the moderation processor (WeChat content security), subscribe grants, and the QA-11 device draft. A stand-in is acceptable only until release delivers the text; it blocks submission. The 公约 sheet says the player agrees to 《用户协议》, which today is not an agreement.

## QA-8 (content / release): no human content review record, AIGC position undocumented
- Repro: no `docs/chuanhua/content-review.md` (compare `docs/kedupan/content-review.md`); `docs/chuanhua/decisions.md` PO-30 records the rules but no sign-off; spec H13 requires founder / content-owner sign-off of the 423 prompts and the blocklist. The prompts and blocklist were drafted by AI. QA's second review is `content-check.md`; it is not a human sign-off.
- AIGC (Art. 9.2): the spec contains no labelling requirement and the game has no runtime generative-AI feature (grep: none), so no on-screen label is specified. The prompt bank is static text; players' content is user-generated. Counsel should confirm (H10) whether AI-assisted drafting of the bundled bank needs any disclosure or filing, and the registration introduction must not claim AI features. Action: the owner records the human review (who, date, swaps) and the counsel answer.

## QA-9 (client / render): placeholder assets
- `js/audio.js`: `SOUND_SRC.tick` is empty, so the 10 s tick (spec 8.4) is a silent no-op (TD-53). `assets/share-fallback.png` is generated placeholder art (6.5 KB, `tools/make-share-fallback.js`, TD-54): used for the capsule-menu share and whenever card rendering fails. Replace with illustrated art (500 x 400) and a compressed `assets/tick.mp3`. Test: "QA assets: placeholders still in the build".

## QA-10 (backend, docs): README mismatch
- `cloudfunctions/README.md` line "a typo in `ENV_KIND` = `SERVER_CONFIG` + `[ALERT]`"; `core/moderation.js#resolveEnv` maps any unknown `ENV_KIND` to `prod` (and only mock-in-prod or an unknown `MODERATION_MODE` is `SERVER_CONFIG`). Behaviour is the safer one and is tested (`qa-server.test.js` "a typo in ENV_KIND ..."); fix the README.

## QA-11 (release, docs): device draft missing from the privacy inventory
- TD-43 stores the unsent turn (strokes or typed text, colour, size, claim id) in device storage until submit or expiry. Spec 15 lists only display and sound settings as device storage. Add it to the privacy guide (local only, never sent except as the submission itself).

---

## Observations that are not bugs (decisions to confirm)
- **TD-82 / AC 96:** `js/share.js` calls the deprecated `wx.getShareInfo(shareTicket)` as a fallback only when `wx.getGroupEnterInfo` does not exist AND the entry carries a ticket. AC 96 says it is never called; TD-80/82 document the deviation. Harmless on current base libraries; remove if the minimum base library is raised to 2.10.4+.
- **TD-80:** `getChain` returns `promptId` for an expired preset chain (`canSameAgain`), which the client maps to the prompt text through the bundled bank. Preset prompts only, chain no longer playable, so no content of the game leaks; AC 10 literally lists prompt text.
- **`msgSecCheck` reply without `errCode`:** a reply `{result:{suggest:'pass'}}` with no `errCode` is accepted as pass; every other malformed reply (throw, 61010, quota, empty, unknown suggest) is `MODERATION_BUSY` (tested). The real SDK always sends `errCode`, so fine.
- **Mock-mode text triggers** (`测试违规` etc.) exist only in dev; production treats them as ordinary text (tested).
