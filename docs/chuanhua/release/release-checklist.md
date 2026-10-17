# 传画接龙: release checklist

Author: release. Date: 2026-10-16 (refreshed for spec rev. 2.1; first written 2026-10-15). **CTO final review and sign-off: DONE 2026-10-15 (rev. 2) and 2026-10-16 (rev. 2.1, TD-153)** (build `a8a86d3e534015a364d5263d21be20685318bef7`; decision log row in `decisions.md`). Everything that remains is founder-only or a counsel item. Build `kept-ideas/v1` at commit `a8a86d3e534015a364d5263d21be20685318bef7` (spec rev. 2.1; QA `qa/rev2.1-report.md`: all AC pass). **QA status: QA rev. 3 gate passed: 0 FAIL, 148 PASS, 7 DEVICE (AC 32, 36, 50, 68, 99, 148, 155), 8 REMOVED-verified; QA-R3-1 fixed after the gate (TD-148)** (`docs/chuanhua/qa/ac-matrix.md`). Result key: PASS / FAIL / NEEDS-FOUNDER (only the founder or counsel can provide it). **No item is FAIL on the release side;** the open items are founder/counsel items only (the CTO tooling ACTIONs A1-A5 are closed). Details and sources: `rules-check.md`.

## Constitution Art. 7 release pack

| # | Deliverable | File | Result |
|---|---|---|---|
| 1 | Registration fields (name + 5 fallbacks, intro R1-R3 (rev. 2) and I1-I3, short name, category, avatar PNG/JPG, UGC qualification check) | `registration/` (re-checked against rev. 2: intro updated to name the live default; no 今日起点 anywhere) | PASS (pack complete); registering and the UGC console screenshot NEEDS-FOUNDER |
| 2 | 用户隐私保护指引: items and text | `privacy-guide.md` | PASS (audit, 12 custom items, text, cross-check); entering it NEEDS-FOUNDER |
| 3 | 备案: service description, fields, UGC section | `beian.md` | PASS (pack); filing, entity fields, face check, counsel U2/U3 NEEDS-FOUNDER |
| 4 | 软著 materials | `softcopyright/` (description, manual with screenshots, 60-page excerpt + generator) | PASS (pack); submission optional, NEEDS-FOUNDER |
| 5 | Store listing text and screenshots | `store-listing.md`, `screenshots/` (16 x 1080x2340, 4 share cards, render script) | PASS (renders); real-device set NEEDS-FOUNDER |
| 6 | Release rules check | `rules-check.md` | PASS (no FAIL); ACTION items listed there |
| 7 | Build/upload commands | `build-upload.md` | PASS (documented, never run) |
| 8 | Post-release setup and moderation runbook | `post-release.md` | PASS |
| - | Founder Handoff (spec H1-H15 mapped) | `HANDOFF.md` | PASS |
| - | Device-pass checklist with empty result column | `HANDOFF.md` section 6 (D1-D24) | PASS (table ready); results NEEDS-FOUNDER |
| - | AppIDs | `APPID.md` | PASS (real AppID NEEDS-FOUNDER) |

## Rules check summary (from `rules-check.md`)

| Area | Result | Note |
|---|---|---|
| WeChat UGC rules (content security, reports, takedown, minors) | PASS by design | V16 / 750031 must be proven on a device (D1) |
| Category and qualifications (游戏 > 休闲 > 益智, 情况二, no payment qualification) | NEEDS-FOUNDER | console 所需资质 screenshot |
| 版号 | PASS (not needed, IAA with no IAP) | cites nrjs.html Q5/Q8, zzsh-iaa.html, OP 3.1 |
| 软著 | PASS (not required); optional | |
| 适龄提示 | NEEDS-FOUNDER | **recommend 12+** (slts.html: free image/text exchange; 8+ arguable) |
| 防沉迷 / 实名 | PASS | platform integrates for no-payment games (zxbsm.html); counsel V13 |
| 健康游戏忠告 on the splash | NEEDS-FOUNDER (device D21) | |
| 诱导分享 | PASS | note on OP 5.1.8 (rooms up to 10, no reward) |
| Ads rules | PASS (design); device D12 | ad units after 流量主 |
| Virtual payment / iOS | PASS (none) | |
| Privacy: guide covers every privacy API | PASS | no Table 1 standard item used; 12 custom items |
| Privacy: no forced authorization, data minimal | PASS (code); device D16 | |
| Privacy guide entered, popup enabled | NEEDS-FOUNDER | HANDOFF 3 |
| Privacy: spec §15 / privacy-notes mismatches | PASS with notes | 4 wording gaps, no code mismatch |
| ICP / 备案 | NEEDS-FOUNDER | 小游戏备案 then 小程序备案; no own domain |
| UGC extra declarations (CAC 安全评估, 网络文化经营许可证) | NEEDS-FOUNDER (counsel H10) | not on any WeChat form; `beian.md` section 4 |
| Content-security APIs enabled for the real AppID (`mediaCheckSync`, game `msgSecCheck`); error 750031 path | **NEEDS-FOUNDER** | HANDOFF 5 step 8 and D1: without it live rooms switch themselves off and only 慢慢传 runs |
| Moderation owner and backup named (H9), daily report queue | **NEEDS-FOUNDER** | HANDOFF 7; do not launch publicly without one |
| Device pass (D1-D24) | **NEEDS-FOUNDER** | HANDOFF 6; **D1 (V16) and D14 (real-database contention) are the most important** |
| Prompt bank human review (H13) | **NEEDS-FOUNDER, blocks release** | 2,042 prompts, AI-drafted and AI-reviewed only |
| 用户协议 | **NEEDS-FOUNDER: DRAFT** | 8 placeholders + draft line (the build refuses release until fixed) |
| Licences: fonts, images, sound, prompts | PASS | no font ships; all art and sound generated in-house |
| AIGC labelling | NEEDS-FOUNDER (counsel H10) | players get no generative feature |
| Package size | **PASS: 831,193 bytes = 0.793 MiB of 4 MB (81 files)**; total limit 30 MB | measured on a scratch copy in release mode with a final-agreement stub |
| Secrets in repo or client | PASS | |

## Recorded checks

| Check | Date | Result | Where |
|---|---|---|---|
| Release switch on a scratch copy with a final-agreement stub (`build-terms --release` then `release-config --env chuanhua-prod --appid wx0123456789abcdef --prefixed-functions`) | 2026-10-15 | PASS: release mode set; refused with the real draft agreement (exit 1, 9 problems) | `rules-check.md` section 8, 10 |
| Game tests, **release mode**, scratch copy (test AppID still set) | 2026-10-16 | PASS: 542 tests, 529 pass, 0 fail, 13 skipped (dev-only), 0 todo; build a8a86d3. (A first run on an incomplete scratch copy showed 1 failure that was an artefact of a missing sister-app config file, not of the build; fixed in the copy and re-run) | scratch, not committed |
| Game tests, dev mode (real tree) and cloud function tests | 2026-10-16 | PASS: `npm test` in `apps/chuanhua/game`: 542 tests, 532 pass, 0 fail, 10 skipped, 0 todo; in `apps/chuanhua/cloudfunctions`: 402 tests, 402 pass, 0 fail, 0 skipped, 0 todo; build a8a86d3 (read-only run in the real tree; `git status` unchanged) | `qa/ac-matrix.md` for QA's own runs |
| Package size | 2026-10-16 | PASS: 831,193 bytes, 81 files (re-measured at the final build); 0 prompt-bank hits in the shipped files (1,680 prompts of 4+ characters) | `rules-check.md` section 8 |
| Secrets scan | 2026-10-15 | PASS | `rules-check.md` section 12 |
| Share cards contain no user drawing | 2026-10-15 | PASS: `render/shareCard.js` draws only our art and passed text; four cards rendered | `screenshots/share-*.png` |
| Registration re-check vs rev. 2 | 2026-10-15 | PASS after fix: no 今日起点; intro R1-R3 added; 客服 question updated | `registration/copy.md` section 8 |
| Source excerpt regenerated | 2026-10-15 | 124 files, 20,732 wrapped lines, 415 pages, 60 printed (regenerated at the final build; the 60 printed pages are byte-identical to the earlier run) | `softcopyright/source-excerpt.txt` |
| Working tree after the checks | 2026-10-15 | clean: all builds and installs were done in a scratch folder; the repo got only files under `docs/chuanhua/release/` | |

## Art. 8 quality bar
1. Every spec feature built: PASS per QA matrix (QA rev. 3 gate passed: 0 FAIL, 148 PASS, 7 DEVICE (AC 32, 36, 50, 68, 99, 148, 155), 8 REMOVED-verified; QA-R3-1 fixed after the gate (TD-148)). 2. Automated tests: PASS (dev, cloud and release mode above). 3. QA verified every AC: PASS, `qa/ac-matrix.md`; the 7 DEVICE items need a phone or the real console and are NEEDS-FOUNDER (HANDOFF 6; D1 / V16 and D14 / real-database contention matter most). 4. CTO final review and sign-off: **DONE 2026-10-15**. 5. Release pack and Handoff: PASS.

## ACTION items
**For the CTO (code and tooling; release did not touch code):**
1. **A1** CLOSED (TD-149): `tools/release-config.js --appid <wx...>` writes the real AppID in release mode; `--dev` restores the test AppID; the AppID tests are mode-aware.
2. **A2** CLOSED (TD-149): `--ad-rewarded` / `--ad-interstitial` write `adUnits`.
3. **A3** CLOSED (TD-149): `--prefixed-functions` is the clear flag, `--shared-test-env` is a deprecated alias; release always sets `fnPrefix = 'chuanhua_'`.
4. **A4** CLOSED: `RELEASE.md` points at `apps/chuanhua/game/project.config.json`.
5. **A5** CLOSED: QA rev. 3 gate re-verified the fixes (QA-R2-1 to -10, `qa/bugs.md`; QA-R2-7 closed); QA-R3-1 fixed after the gate (TD-148).
6. After the founder's content decisions (HANDOFF 2): swap or drop prompts, run the content tests, regenerate, redeploy; update the agreement §一.12 only with the signed sign-off.
7. Spec §15 amendments: albumCache row, feedback text, `installId` wording (`privacy-guide.md` section 4).

**For the founder / counsel:** everything marked NEEDS-FOUNDER above and in `HANDOFF.md`.
