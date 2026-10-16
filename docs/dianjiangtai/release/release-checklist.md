# 点将台: release checklist

Author: release. Date: 2026-10-15. Build `kept-ideas/v1` at commit `3df1b89333d8d05b1d008ce57bfd29b2d1f46452` (contentVersion 2, configVersion 3; the code is identical to 6582873). **QA status: QA re-check passed at 3df1b89333d8d05b1d008ce57bfd29b2d1f46452: 0 FAIL, 2 device items (AC 16, AC 75)** (`docs/dianjiangtai/qa/ac-matrix.md`). **CTO final review and sign-off: DONE (2026-10-15, `decisions.md` TD-16).** Everything that remains is founder-only (HANDOFF.md). Result key: PASS / FAIL / NEEDS-FOUNDER (only the founder can provide it). Details and sources: `rules-check.md`. No item is FAIL, and no item waits on the CTO.

## Constitution Art. 7 release pack

| # | Deliverable | File | Result |
|---|---|---|---|
| 1 | Registration fields (name + 3 fallbacks, intro I1-I4, short name, category, avatar PNG/JPG) | `registration/` (copied from `docs/dianjiangtai/registration/`, updated: AppID already registered, release check, 适龄提示, REGISTRATION-STEPS) | PASS (pack complete); confirming the console values NEEDS-FOUNDER |
| 2 | 用户隐私保护指引: items and text | `privacy-guide.md` | PASS (text, audit of every `wx` call, cross-check); entering it NEEDS-FOUNDER |
| 3 | 备案: service description and form fields | `beian.md` | PASS (pack); filing, entity fields, face check NEEDS-FOUNDER |
| 4 | 软著 materials | `softcopyright/` (description, manual with 16 screenshots, 60-page excerpt + generator) | PASS (pack); submission optional, NEEDS-FOUNDER |
| 5 | Store listing text and screenshots | `store-listing.md`, `screenshots/` (16 x 1080x1920, 3 share cards 500x400, 1 saved card 1000x800) | PASS (renders); real-device set NEEDS-FOUNDER |
| 6 | Release rules check | `rules-check.md`, `content-review.md` | PASS (no FAIL); housekeeping and founder items listed there |
| 7 | Build/upload command | `build-upload.md` | PASS (documented; the switch rehearsed on a scratch copy; never run for real) |
| 8 | Post-release setup | `post-release.md` | PASS |
| - | Founder Handoff | `HANDOFF.md` | PASS |
| - | AppIDs | `APPID.md` | PASS (real AppID recorded; accepted name and environment id still blank: NEEDS-FOUNDER) |

## Rules check summary (from `rules-check.md`)

| Area | Result | Note |
|---|---|---|
| Category and qualifications (游戏 > 休闲 > third level as offered, 情况二, no payment qualification) | NEEDS-FOUNDER | console 所需资质 screenshot |
| Privacy: guide covers every privacy API | PASS | 微信朋友关系 + 相册（仅写入） + custom items 3-10 |
| Privacy: no forced authorization, minimal data | PASS (code); device E4 | |
| Privacy guide entered, popup enabled | NEEDS-FOUNDER | HANDOFF 2 |
| ICP / 备案 | NEEDS-FOUNDER | 小游戏备案 then 小程序备案 (no own domain to ICP-file) |
| 版号 | PASS (not needed, IAA with no IAP) | cites nrjs.html, zzsh-iaa.html |
| 软著 | PASS (not required); optional | |
| 适龄提示 | NEEDS-FOUNDER | **recommend 12+** (the official criteria describe history-based games in the 12+ band) |
| 防沉迷 / 实名 | PASS | platform integrates for no-payment games (zxbsm.html) |
| 健康游戏忠告 on launch screen | NEEDS-FOUNDER (device check) | |
| Content: historical figures and IP | PASS | public domain; seals drawn in code; no AI art, no likeness, no map |
| Content: text quality | PASS | the ten `statNote`s are rewritten (TD-10, QA V1-1 closed); 孟获 now reads 南中各族所服; no `contentVersion` bump |
| Content: sign-off (H8, AC 59) | NEEDS-FOUNDER | `content-review.md` regenerated from the final text at 3df1b89; the 临阵生变 list is neutral |
| Ethnic portrayal (PO-4) | PASS (advisory closed) | one minority-region figure (孟获) kept, others excluded |
| 诱导分享 | PASS | |
| Ads rules | PASS (design); device E5/E10 | ad units after 流量主 |
| Ads: release build without ad unit ids | PASS (TD-11) | no-fill: "暂无广告，本次免费" once per run, never "广告位（测试）"; `stubAds` is `true` in the committed dev state and forced to `false` by the release switch; real ads need `--ad-rewarded` and `--ad-interstitial`; device item Extra 7 (QA D-14) |
| Virtual payment / iOS | PASS (none) | |
| UGC | PASS (none) | |
| Package size | PASS | main package **609,642 bytes (62 files) = 0.581 MiB, 14.5%** of 4 MB (release mode, measured on a scratch copy at 3df1b89 with `--env dianjiangtai-prod --appid wx172906d7bfd6036f`; 609,688 with two ad unit ids); no subpackage; total limit 30 MB |
| Secrets in repo or client | PASS | one untracked stray `apps/dianjiangtai/project.config.json` carries the real AppID (public): do not commit |
| Build completeness | PASS | four WAV cues (flip, pick, win, loss) and `share-fallback.png` ship (TD-13, TD-14); the 声音 toggle works; device item Extra 6 (QA D-13) |
| Cloud console hardening: Cloud Storage deny-all rule (`storage/rules.json`), anonymous/web login DISABLED, HTTP access service DISABLED, no HTTP trigger | NEEDS-FOUNDER | HANDOFF 4 step 7; `post-release.md` section 2; re-check after every console change |
| Database: 17 collections, all deny-all (incl. `challenge_answers`, `meta`, `rate_limits`), indexes created | NEEDS-FOUNDER | HANDOFF 4 step 4 |
| `GROUP_REF_PEPPER` set, at least 32 characters, on `joinGroup` and `createChallenge` | NEEDS-FOUNDER | HANDOFF 4 step 5 |
| Seed bank imported (>= 60 days, contentVersion 2, configVersion 3; a bank generated before this build is unusable) | NEEDS-FOUNDER | HANDOFF 4 step 8; commands rehearsed at 3df1b89 (60 seeds, 0 skipped); V1-2 is settled |
| Release build excludes the dev mock and stub (`packOptions.ignore` has `js/mock-server.js` and `js/stub-render.js` after the switch) | PASS (gate in release-mode `npm test`); CTO verifies before upload | `build-upload.md` section 2 |
| Known residual: grace-window early look at a daily (friendly challenge, 00:00-00:30) | PASS (accepted, observe-only) | `rules-check.md` 1.20 |

## Art. 8 quality bar
1. Every spec feature built: QA re-check passed at 3df1b89333d8d05b1d008ce57bfd29b2d1f46452 (0 FAIL, 2 device items: AC 16, AC 75; `qa/ac-matrix.md`). 2. Automated tests at 3df1b89, 2026-10-15: game 379 tests (dev state in the real tree 378 pass, 0 fail, 1 skipped; release state on a scratch copy, with and without ad flags, 377 pass, 0 fail, 2 skipped), cloud functions 182 tests, 182 pass, 0 fail. 3. QA verified every AC (device-only items are in HANDOFF section 5: E1-E12 and Extra 1-8). 4. CTO final review and sign-off: **DONE (2026-10-15, TD-16)**. 5. Release pack and Handoff: PASS (this folder; the AC 95 device-pass checklist with an empty result column is HANDOFF section 5, and the H1-H9 + H6a mapping is at its end).

## Housekeeping (nothing here blocks the first upload)
1. **Stray untracked `apps/dianjiangtai/project.config.json`:** do not commit; delete or ignore.
2. Spec wording (documentation): §16 `rate_limits` retention ("up to one day"), the device row (platform only), the feedback-component text.

## Items for the founder (one line each; detail in HANDOFF)
0 confirm name / category / 认证 and set 适龄提示 (12+) · 1 content sign-off (final text) · 2 privacy guide + popup · 3 备案 (two filings) · 4 cloud environment, deploy, H6a hardening, seed bank (configVersion 3) · 5 device pass E1-E12 and Extra 1-8 · 6 软著 (optional) · 7 written approval, then upload; you submit and publish · 8 流量主, subscribe template, KPIs.
