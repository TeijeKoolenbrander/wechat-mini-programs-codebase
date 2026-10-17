# 群友刻度盘: release checklist

Author: release. Date: 2026-10-15; **revised 2026-10-16 for the founder's typed-clue change (D-2, PD-31 to PD-40; spec rev. 984896c).** **Final sign-off of the D-2 build: 2026-10-16, `kept-ideas/v1` at commit `84c68819a0e55c013bdeec5c2c00596d98277acb`** (backend TD-70..84, client TD-85..91, QA fixes TD-92; decision rows TD-93, TD-94). The pre-D-2 build was `c49019f2e154b742aef1561665a5e5775ddef0df` (signed off 2026-10-15, reopened by D-2, TD-69). Everything that remains is founder-only. Result key: PASS / FAIL / NEEDS-FOUNDER (only the founder can provide it). No item is FAIL. Details and sources: `rules-check.md`.

## Constitution Art. 7 release pack

| # | Deliverable | File | Result |
|---|---|---|---|
| 1 | Registration fields (name + 5 fallbacks, intro, short name, category, avatar PNG/JPG) | `registration/` (updated today: AppID location, 适龄提示, order) | PASS (pack complete); registering itself NEEDS-FOUNDER |
| 2 | 用户隐私保护指引: items and text | `privacy-guide.md` (revised: items 9-13 for the typed clue, moderation, WeChat content-security processing, reports, strikes) | PASS (text, audit, cross-check; rows 15-21 re-checked against the D-2 code 2026-10-16, one wording fix); entering it NEEDS-FOUNDER |
| 3 | 备案: service description and form fields | `beian.md` (service description rewritten for the moderated typed clue) | PASS (pack); filing, entity fields, face check NEEDS-FOUNDER |
| 4 | 软著 materials | `softcopyright/` (description, manual with screenshots, 60-page excerpt + generator; excerpt and counts regenerated 2026-10-16 from 84c6881) | PASS (pack); submission optional, NEEDS-FOUNDER |
| 5 | Store listing text and screenshots | `store-listing.md`, `screenshots/` (16 x 1080x1920, 4 share cards; 06, 07, 09, 10, 11 re-rendered for D-2; 12-16 and `share-round-typed-500x400.png` added: 发言规则 / 举报 / hidden-clue / 设置 / 《用户协议》 / typed share card, last section) | PASS (renders, with the gaps listed); real-device set NEEDS-FOUNDER |
| 6 | Release rules check | `rules-check.md` | PASS (no FAIL); ACTION items listed there |
| 7 | Build/upload command | `build-upload.md` | PASS (documented, never run) |
| 8 | Post-release setup | `post-release.md` (21 collections, 31 indexes, 24 functions, new env vars and permission, §11 moderation operations; confirmed against the code 2026-10-16) | PASS |
| 9 | **《用户协议》 (new, D-2)** | `user-agreement.md`, `user-agreement.txt` (DRAFT, placeholders, 【重要】 markers) | PASS (draft); approval, placeholders, counsel NEEDS-FOUNDER (H15) |
| - | Founder Handoff | `HANDOFF.md` | PASS |

## Rules check summary (from `rules-check.md`)

| Area | Result | Note |
|---|---|---|
| Category and qualifications (游戏 > 休闲 > 益智, 情况二, no payment qualification) | NEEDS-FOUNDER | console 所需资质 screenshot. UGC re-checked 2026-10-16: no UGC qualification found on any official page read (`rules-check.md` 1.7i) |
| Privacy: guide covers every privacy API | PASS | 微信朋友关系 + custom items |
| Privacy: no forced authorization, minimal data | PASS (harness); device E4 | |
| Privacy guide entered, popup enabled | NEEDS-FOUNDER | HANDOFF 2 |
| ICP / 备案 | NEEDS-FOUNDER | 小游戏备案 then 小程序备案 (no own domain to ICP-file) |
| 版号 | PASS (not needed, IAA with no IAP) | cites nrjs.html, zzsh-iaa.html |
| 软著 | PASS (not required); optional | |
| 适龄提示 | NEEDS-FOUNDER | **recommend 12+** (was 8+; typed clue = free text shown to non-friends, PD-39; `rules-check.md` 1.14) |
| 防沉迷 / 实名 | PASS | platform integrates for no-payment games (zxbsm.html) |
| 健康游戏忠告 on launch screen | NEEDS-FOUNDER (device check) | |
| Content (no prohibited content) | NEEDS-FOUNDER | human review of AI-drafted spectra, blocks release |
| 诱导分享 | PASS | |
| Ads rules | PASS (design); device E5/E10 | ad units after 流量主 |
| Virtual payment / iOS | PASS (none) | |
| UGC (the typed clue) | PASS by design; NEEDS-FOUNDER for H14 (live moderation check), H15 (wording sign-off), H16 (report-queue owner); device E12, E13 | moderation before display (fail closed), 举报 with instant hide, strike ladder, console takedown, kill switches, 180-day retention, never on cards: `rules-check.md` 1.7a-1.7i |
| Package size | PASS | main package 832,349 bytes (83 files) = 0.79 MiB of 4 MB, 19.8% (release mode, 84c6881); total limit 30 MB. No subpackage |
| Secrets in repo or client | PASS | |
| Cloud console hardening: Cloud Storage deny-all rule (`storage/rules.json`), anonymous/web login DISABLED, HTTP access service DISABLED, no HTTP trigger | NEEDS-FOUNDER | HANDOFF 4 step 7; `post-release.md` §2; re-check after every console change |
| Database: 21 collections (17 + `mod_log`, `mod_quota`, `clue_reports`, `audit_log`), all deny-all, indexes created | NEEDS-FOUNDER | HANDOFF 4 step 4 |
| Cloud: `MODERATION_MODE=live`, `ENV_KIND=prod`, optional `ADMIN_OPENIDS`, openapi permission for `wxa.game.contentSpam.msgSecCheck` on `setClue`, `app_config.ugc` / `moderation` | NEEDS-FOUNDER | HANDOFF 4 steps 5b-6 and 4b |
| `GROUP_REF_PEPPER` set, at least 32 characters | NEEDS-FOUNDER | HANDOFF 4 step 5 |
| Release build excludes the answer key and schedule (`packOptions.ignore` has `core/content/anchors.v1.js` and `core/content/schedule.v1.js` after the switch) | PASS (gate in release-mode `npm test`); CTO verifies before upload | `build-upload.md` §2 |

## Art. 8 quality bar (D-2 build 84c6881, 2026-10-16)
1. Every spec feature built: PASS (QA matrix and `docs/kedupan/qa/typed-clue-report.md`: every AC pass). 2. Automated tests: PASS (CTO run @ 84c6881, 2026-10-16): game (dev state) 442 tests, **439 pass, 0 fail, 3 skipped**; game in release mode (`NODE_ENV=test node tools/release-config.js --env env-qa-test --shared-test-env --allow-draft-terms`, `npm test`, then `--dev`) 439 pass, 0 fail, 3 skipped, `--dev` restores with no diff; cloud functions **223 pass, 0 fail**; `npm run sync` 24 functions, `npm run check` no drift. 3. QA verified every AC (typed clue: AC 83-101 all pass; B1-B4 fixed in TD-92); device-only AC 41, 60, 65, E12, E13, the keyboard/IME, back-key, 发言规则 scroll, second-device report and console takedown items (NEEDS-FOUNDER, HANDOFF section 5) and AC 10 (human content review, NEEDS-FOUNDER); AC 67 closed by `privacy-guide.md`. 4. CTO review and sign-off of the D-2 build: DONE 2026-10-16 (`decisions.md` TD-94; release decisions TD-93). The release is gated on the founder approving the 《用户协议》 and 发言规则 text (H15). 5. Release pack and Handoff: PASS.

## ACTION items for the CTO (items 1-4 closed at sign-off 2026-10-15; items 5-7 closed at the D-2 sign-off 2026-10-16; item 8 stays a spec housekeeping note)
1. (Resolved: the tests pass with `--appid` per QA @ 758b568; the documented order is kept for safety.) QA items at sign-off: QA-7 fixed (0 todo in the game tests), QA-9 docs recorded as TD-68, QA-8 (spec not updated for TD-65) still a documentation follow-up. TD-68 (TD-62 and `CONTRACT.md` say "both modes" but the answer key and schedule are excluded only in release mode).
2. Regenerate the schedule when the real launch date is known (`post-release.md` §9).
3. Amend spec §13 (typed feedback through WeChat's component; `rate_limits`).
4. QA AC 67 (privacy text states 180 days): satisfied by `privacy-guide.md`; update the matrix.
5. (D-2) DONE 2026-10-16: package re-measured (832,349 bytes) and both `npm test` runs repeated; recorded in `rules-check.md` §3 and §6, `build-upload.md` and HANDOFF.
6. (D-2) DONE 2026-10-16: the three new functions exist as `agreeRules`, `reportClue` and `admin` (24 function folders, 4 timers, `admin` console-only), 21 collections (all deny-all in `rules.json`), 31 indexes; HANDOFF §4 and `post-release.md` updated and the markers removed (mismatches found: `post-release.md` §2 lacked 6 indexes and listed `mod_quota` as unindexed; the env var table named `ENV_KIND` for "any function"). Rows 15-21 of `privacy-guide.md` §3 re-checked against the code (one wording fix: `mod_log` also keeps the text when a check did not finish).
7. (D-2) DONE 2026-10-16: `softcopyright/source-excerpt.txt` regenerated (104 files, 15,456 non-blank wrapped lines, 310 full pages, 60 printed) and the line counts of `softcopyright/software-description.md` §3 updated (17,259 program lines).
8. (D-2) Spec housekeeping noted while writing the pack: DONE 2026-10-16: the `rate_limits` row was added to the spec §13 inventory (privacy guide items 2 and 7).

## Screenshots (D-2): re-rendered by the client dev; checked by the CTO 2026-10-16 [complete]
The client dev re-rendered `screenshots/` on 84c6881 (renderer `apps/kedupan/game/tools/preview`, same size 1080 x 1920 for 01-11; share cards 500 x 400). The CTO viewed 06, 07, 09, 10, 11 and `share-round-500x400.png` and compared the rest with the commit that touched them.
| File | Status 2026-10-16 | Needed |
|---|---|---|
| `07-create__clue_picked.png` | **OK**: two tabs, tab 选一个提示词 active, six chips with 一把雨伞 picked, 发到群里 enabled, target band visible | none |
| `09-create__clue_text_typed.png` (new) | **OK**: tab 自己写, typed 「冬天的被窝」 with counter 5/12, rule line 「最多 12 个字 · 不写数字、位置和两头的词」, link 「想不出来？试试选一个提示词」, 发到群里 | none |
| `10-create__clue_kb_typed.png` (new) | **OK**: keyboard-open compact layout, input and 发到群里 side by side | none |
| `11-round__clue_typed.png` (new) | **OK**: guess screen with 「提示：「冬天的被窝」」 and the 举报 link, no clipping | none |
| `06-round__revealed.png` | **partly**: re-rendered (the file changed) but the fixture is a preset clue (「提示：一张电影票」); no typed clue and no 举报 on the reveal page. The 出题人 row of the member list is empty in the fixture | acceptable for the listing; for 备案 the typed clue is covered by 11, so no re-render is required |
| `share-round-500x400.png` | preset card (「提示：一张电影票」), kept as the preset-era card | none |
| `share-round-typed-500x400.png` (new) | **DONE 2026-10-16**: reads 「提示在题目里，点开看看」, no clue text on the card | none |
| `08-home__howto.png`, `01`-`05`, `share-daily`, `share-reveal` | unchanged by D-2 (the 玩法 lines do not mention how clues are given) | none; the real-device set replaces all of them for the 备案 anyway |
| `12-create__clue_rules_end.png` (new) | **DONE 2026-10-16**: 发言规则 sheet scrolled to the end, five rules, 《用户协议》 / 《用户隐私保护指引》 links, 同意并写提示 enabled | none |
| `13-round__report_sheet.png` (new) | **DONE 2026-10-16**: 「举报这个提示」 with the five reasons, 提交举报 | none |
| `14-round__clue_hidden.png` (new) | **DONE 2026-10-16**: 「提示已被举报隐藏」 and 「凭感觉猜一猜，或回群里问问出题人」 | none |
| `15-home__settings_scrolled.png` (new) | **DONE 2026-10-16**: 设置 scrolled to the end, 发言规则 and 《用户协议》 rows | none |
| `16-terms__top.png` (new) | **DONE 2026-10-16**: 《用户协议》 reader, top of the page (draft text, 【】 placeholders until H15) | none |
`screenshots/README.md` is updated (no longer says the set is stale; lists what is missing). The `softcopyright/user-manual.md` pictures now use 09, 07, 11 and 06.
